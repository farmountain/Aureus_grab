/**
 * Context aggregator for building hypothesis contexts
 */

import { SymbolicEntity, HypothesisContext, ContextAggregator } from './types';

/**
 * Default context aggregator implementation
 */
export class DefaultContextAggregator implements ContextAggregator {
  /**
   * Aggregate entities into a hypothesis context
   */
  async aggregate(entities: SymbolicEntity[], goalId?: string): Promise<HypothesisContext> {
    // Extract relationships from entities
    const relationships: Array<{
      source: string;
      target: string;
      type: string;
      properties?: Record<string, unknown>;
    }> = [];

    for (const entity of entities) {
      if (entity.relationships) {
        for (const rel of entity.relationships) {
          relationships.push({
            source: entity.id,
            target: rel.targetId,
            type: rel.type,
            properties: rel.properties,
          });
        }
      }
    }

    // Calculate relevance score
    const relevanceScore = this.calculateRelevance(entities, goalId);

    // Build default constraints
    const constraints = this.buildDefaultConstraints();

    return {
      id: `context-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      goalId,
      entities,
      relationships,
      constraints,
      relevanceScore,
      timestamp: new Date(),
      metadata: {
        entityCount: entities.length,
        relationshipCount: relationships.length,
        entityTypes: [...new Set(entities.map(e => e.type))],
      },
    };
  }

  /**
   * Enrich context with additional information
   */
  async enrich(context: HypothesisContext): Promise<HypothesisContext> {
    // Calculate average confidence across entities
    const avgConfidence = context.entities.reduce((sum, e) => sum + e.confidence, 0) / 
                         context.entities.length;

    // Identify temporal patterns
    const temporalPattern = this.analyzeTemporalPattern(context.entities);

    // Identify dominant entity types
    const entityTypeCounts = context.entities.reduce((acc, e) => {
      acc[e.type] = (acc[e.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const dominantType = Object.entries(entityTypeCounts)
      .sort((a, b) => b[1] - a[1])[0];

    return {
      ...context,
      relevanceScore: Math.min(1.0, context.relevanceScore * avgConfidence),
      metadata: {
        ...context.metadata,
        avgConfidence,
        temporalPattern,
        dominantEntityType: dominantType ? dominantType[0] : 'unknown',
        dominantTypeCount: dominantType ? dominantType[1] : 0,
        enriched: true,
        enrichmentTimestamp: new Date().toISOString(),
      },
    };
  }

  /**
   * Calculate relevance score for entities
   */
  private calculateRelevance(entities: SymbolicEntity[], goalId?: string): number {
    if (entities.length === 0) return 0;

    // Base relevance on entity count and average confidence
    const avgConfidence = entities.reduce((sum, e) => sum + e.confidence, 0) / entities.length;
    const countScore = Math.min(1.0, entities.length / 10); // Normalize to max 10 entities
    
    // Bonus for having a goal
    const goalBonus = goalId ? 0.1 : 0;

    // Bonus for entities with relationships
    const relatedEntities = entities.filter(e => e.relationships && e.relationships.length > 0);
    const relationshipBonus = relatedEntities.length / entities.length * 0.1;

    return Math.min(1.0, avgConfidence * 0.6 + countScore * 0.2 + goalBonus + relationshipBonus);
  }

  /**
   * Analyze temporal patterns in entities
   */
  private analyzeTemporalPattern(entities: SymbolicEntity[]): string {
    if (entities.length < 2) return 'insufficient-data';

    const timestamps = entities.map(e => e.timestamp.getTime()).sort((a, b) => a - b);
    const intervals = [];

    for (let i = 1; i < timestamps.length; i++) {
      intervals.push(timestamps[i] - timestamps[i - 1]);
    }

    const avgInterval = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;

    // Classify temporal pattern
    if (avgInterval < 1000) {
      return 'burst'; // Less than 1 second between events
    } else if (avgInterval < 60000) {
      return 'rapid'; // Less than 1 minute between events
    } else if (avgInterval < 3600000) {
      return 'steady'; // Less than 1 hour between events
    } else {
      return 'sparse'; // More than 1 hour between events
    }
  }

  /**
   * Build default constraints for context
   */
  private buildDefaultConstraints(): Array<{
    type: string;
    description: string;
    predicate: (context: HypothesisContext) => boolean;
  }> {
    return [
      {
        type: 'minimum-entities',
        description: 'Context must have at least one entity',
        predicate: (context) => context.entities.length >= 1,
      },
      {
        type: 'minimum-confidence',
        description: 'Average entity confidence must be at least 0.3',
        predicate: (context) => {
          if (context.entities.length === 0) return false;
          const avgConfidence = context.entities.reduce((sum, e) => sum + e.confidence, 0) / 
                               context.entities.length;
          return avgConfidence >= 0.3;
        },
      },
      {
        type: 'temporal-validity',
        description: 'Entities must be from last 24 hours',
        predicate: (context) => {
          const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
          return context.entities.every(e => e.timestamp.getTime() >= oneDayAgo);
        },
      },
    ];
  }
}

/**
 * Goal-aware context aggregator
 */
export class GoalAwareContextAggregator extends DefaultContextAggregator {
  private goalConstraints: Map<string, Array<{
    type: string;
    description: string;
    predicate: (context: HypothesisContext) => boolean;
  }>> = new Map();

  /**
   * Register constraints for a specific goal
   */
  registerGoalConstraints(
    goalId: string,
    constraints: Array<{
      type: string;
      description: string;
      predicate: (context: HypothesisContext) => boolean;
    }>
  ): void {
    this.goalConstraints.set(goalId, constraints);
  }

  /**
   * Aggregate entities with goal-specific constraints
   */
  async aggregate(entities: SymbolicEntity[], goalId?: string): Promise<HypothesisContext> {
    const baseContext = await super.aggregate(entities, goalId);

    // Add goal-specific constraints if available
    if (goalId) {
      const goalConstraints = this.goalConstraints.get(goalId);
      if (goalConstraints) {
        baseContext.constraints.push(...goalConstraints);
      }

      // Increase relevance score for goal-aligned entities
      baseContext.relevanceScore = Math.min(1.0, baseContext.relevanceScore * 1.1);
    }

    return baseContext;
  }

  /**
   * Enrich context with goal-specific information
   */
  async enrich(context: HypothesisContext): Promise<HypothesisContext> {
    const enriched = await super.enrich(context);

    // Check if all constraints are satisfied
    const constraintsSatisfied = enriched.constraints.every(c => c.predicate(enriched));

    return {
      ...enriched,
      metadata: {
        ...enriched.metadata,
        constraintsSatisfied,
        constraintCount: enriched.constraints.length,
        goalAligned: !!enriched.goalId,
      },
    };
  }
}
