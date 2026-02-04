/**
 * Tests for context aggregator
 */

import { describe, it, expect } from 'vitest';
import { DefaultContextAggregator, GoalAwareContextAggregator } from '../src/context-aggregator';
import { SymbolicEntity } from '../src/types';

describe('Context Aggregator', () => {
  describe('DefaultContextAggregator', () => {
    it('should aggregate entities into context', async () => {
      const aggregator = new DefaultContextAggregator();
      const entities: SymbolicEntity[] = [
        {
          id: 'entity-1',
          type: 'observation',
          properties: { value: 42 },
          source: 'input-1',
          confidence: 0.9,
          timestamp: new Date(),
        },
        {
          id: 'entity-2',
          type: 'observation',
          properties: { value: 50 },
          source: 'input-2',
          confidence: 0.8,
          timestamp: new Date(),
        },
      ];

      const context = await aggregator.aggregate(entities);

      expect(context.entities).toHaveLength(2);
      expect(context.relevanceScore).toBeGreaterThan(0);
      expect(context.constraints.length).toBeGreaterThan(0);
    });

    it('should extract relationships from entities', async () => {
      const aggregator = new DefaultContextAggregator();
      const entities: SymbolicEntity[] = [
        {
          id: 'entity-1',
          type: 'order',
          properties: {},
          source: 'input-1',
          confidence: 0.9,
          timestamp: new Date(),
          relationships: [
            { type: 'has-item', targetId: 'entity-2' },
          ],
        },
        {
          id: 'entity-2',
          type: 'item',
          properties: {},
          source: 'input-2',
          confidence: 0.9,
          timestamp: new Date(),
        },
      ];

      const context = await aggregator.aggregate(entities);

      expect(context.relationships).toHaveLength(1);
      expect(context.relationships[0].source).toBe('entity-1');
      expect(context.relationships[0].target).toBe('entity-2');
      expect(context.relationships[0].type).toBe('has-item');
    });

    it('should include goal ID in context', async () => {
      const aggregator = new DefaultContextAggregator();
      const entities: SymbolicEntity[] = [
        {
          id: 'entity-1',
          type: 'observation',
          properties: {},
          source: 'input-1',
          confidence: 0.9,
          timestamp: new Date(),
        },
      ];

      const context = await aggregator.aggregate(entities, 'goal-1');

      expect(context.goalId).toBe('goal-1');
      expect(context.relevanceScore).toBeGreaterThan(0);
    });

    it('should enrich context with metadata', async () => {
      const aggregator = new DefaultContextAggregator();
      const entities: SymbolicEntity[] = [
        {
          id: 'entity-1',
          type: 'observation',
          properties: {},
          source: 'input-1',
          confidence: 0.9,
          timestamp: new Date(),
        },
        {
          id: 'entity-2',
          type: 'observation',
          properties: {},
          source: 'input-2',
          confidence: 0.7,
          timestamp: new Date(),
        },
      ];

      const context = await aggregator.aggregate(entities);
      const enriched = await aggregator.enrich(context);

      expect(enriched.metadata?.avgConfidence).toBe(0.8);
      expect(enriched.metadata?.enriched).toBe(true);
      expect(enriched.metadata).toHaveProperty('temporalPattern');
    });

    it('should identify temporal patterns', async () => {
      const aggregator = new DefaultContextAggregator();
      const now = Date.now();
      
      // Create entities with burst pattern (< 1 second apart)
      const entities: SymbolicEntity[] = [
        {
          id: 'entity-1',
          type: 'observation',
          properties: {},
          source: 'input-1',
          confidence: 0.9,
          timestamp: new Date(now),
        },
        {
          id: 'entity-2',
          type: 'observation',
          properties: {},
          source: 'input-2',
          confidence: 0.9,
          timestamp: new Date(now + 500),
        },
      ];

      const context = await aggregator.aggregate(entities);
      const enriched = await aggregator.enrich(context);

      expect(enriched.metadata?.temporalPattern).toBe('burst');
    });

    it('should validate default constraints', async () => {
      const aggregator = new DefaultContextAggregator();
      const entities: SymbolicEntity[] = [
        {
          id: 'entity-1',
          type: 'observation',
          properties: {},
          source: 'input-1',
          confidence: 0.9,
          timestamp: new Date(),
        },
      ];

      const context = await aggregator.aggregate(entities);

      // Check minimum entities constraint
      const minEntitiesConstraint = context.constraints.find(c => c.type === 'minimum-entities');
      expect(minEntitiesConstraint?.predicate(context)).toBe(true);

      // Check minimum confidence constraint
      const minConfidenceConstraint = context.constraints.find(c => c.type === 'minimum-confidence');
      expect(minConfidenceConstraint?.predicate(context)).toBe(true);

      // Check temporal validity constraint
      const temporalConstraint = context.constraints.find(c => c.type === 'temporal-validity');
      expect(temporalConstraint?.predicate(context)).toBe(true);
    });

    it('should handle empty entities', async () => {
      const aggregator = new DefaultContextAggregator();
      const context = await aggregator.aggregate([]);

      expect(context.entities).toHaveLength(0);
      expect(context.relevanceScore).toBe(0);
    });
  });

  describe('GoalAwareContextAggregator', () => {
    it('should register and apply goal-specific constraints', async () => {
      const aggregator = new GoalAwareContextAggregator();
      
      aggregator.registerGoalConstraints('goal-1', [
        {
          type: 'custom-constraint',
          description: 'Must have at least 2 entities',
          predicate: (context) => context.entities.length >= 2,
        },
      ]);

      const entities: SymbolicEntity[] = [
        {
          id: 'entity-1',
          type: 'observation',
          properties: {},
          source: 'input-1',
          confidence: 0.9,
          timestamp: new Date(),
        },
        {
          id: 'entity-2',
          type: 'observation',
          properties: {},
          source: 'input-2',
          confidence: 0.9,
          timestamp: new Date(),
        },
      ];

      const context = await aggregator.aggregate(entities, 'goal-1');

      const customConstraint = context.constraints.find(c => c.type === 'custom-constraint');
      expect(customConstraint).toBeDefined();
      expect(customConstraint?.predicate(context)).toBe(true);
    });

    it('should boost relevance for goal-aligned contexts', async () => {
      const aggregator = new GoalAwareContextAggregator();
      const entities: SymbolicEntity[] = [
        {
          id: 'entity-1',
          type: 'observation',
          properties: {},
          source: 'input-1',
          confidence: 0.8,
          timestamp: new Date(),
        },
      ];

      const withoutGoal = await aggregator.aggregate(entities);
      const withGoal = await aggregator.aggregate(entities, 'goal-1');

      expect(withGoal.relevanceScore).toBeGreaterThan(withoutGoal.relevanceScore);
    });

    it('should enrich context with constraint satisfaction status', async () => {
      const aggregator = new GoalAwareContextAggregator();
      const entities: SymbolicEntity[] = [
        {
          id: 'entity-1',
          type: 'observation',
          properties: {},
          source: 'input-1',
          confidence: 0.9,
          timestamp: new Date(),
        },
      ];

      const context = await aggregator.aggregate(entities, 'goal-1');
      const enriched = await aggregator.enrich(context);

      expect(enriched.metadata?.constraintsSatisfied).toBeDefined();
      expect(enriched.metadata?.goalAligned).toBe(true);
      expect(enriched.metadata?.constraintCount).toBeGreaterThan(0);
    });
  });
});
