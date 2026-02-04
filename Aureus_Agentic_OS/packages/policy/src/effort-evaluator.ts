/**
 * EffortEvaluator module for computing cost/risk/value scores for tool requests
 * Integrates world-model soft constraints and observability metrics
 */

import { Action, Principal } from './types';
import { WorldState } from '@aureus/world-model';
import { ConstraintEngine, SoftConstraint } from '@aureus/world-model';
import { MetricsAggregator, TelemetryCollector } from '@aureus/observability';

/**
 * Effort evaluation result
 */
export interface EffortEvaluation {
  /**
   * Overall decision score (0-1)
   * Higher score = better option (lower cost/risk, higher value)
   */
  decisionScore: number;

  /**
   * Cost score (0-1) - normalized cost estimate
   * Higher score = lower cost (better outcome)
   */
  costScore: number;

  /**
   * Risk score (0-1) - normalized risk estimate
   * Higher score = lower risk (better outcome)
   */
  riskScore: number;

  /**
   * Value score (0-1) - normalized value estimate
   * Higher score = more valuable (better outcome)
   */
  valueScore: number;

  /**
   * Time score (0-1) - normalized time estimate
   * Higher score = faster execution (better outcome)
   */
  timeScore: number;

  /**
   * Detailed breakdown of scores
   */
  breakdown: {
    worldModelScore?: number;
    observabilityScore?: number;
    baseRiskScore?: number;
  };

  /**
   * Recommendation based on the evaluation
   */
  recommendation: 'approve' | 'review' | 'reject';

  /**
   * Reason for the recommendation
   */
  reason: string;

  /**
   * Additional metadata
   */
  metadata?: Record<string, unknown>;
}

/**
 * Configuration for effort evaluator
 */
export interface EffortEvaluatorConfig {
  /**
   * Weight for cost factor (default: 0.25)
   */
  costWeight?: number;

  /**
   * Weight for risk factor (default: 0.35)
   */
  riskWeight?: number;

  /**
   * Weight for value factor (default: 0.25)
   */
  valueWeight?: number;

  /**
   * Weight for time factor (default: 0.15)
   */
  timeWeight?: number;

  /**
   * Threshold for approval (default: 0.6)
   */
  approvalThreshold?: number;

  /**
   * Threshold for rejection (default: 0.3)
   */
  rejectionThreshold?: number;
}

/**
 * Context for effort evaluation
 */
export interface EffortEvaluationContext {
  /**
   * Principal requesting the action
   */
  principal: Principal;

  /**
   * Action being evaluated
   */
  action: Action;

  /**
   * Tool name being requested
   */
  toolName: string;

  /**
   * Tool parameters
   */
  params: Record<string, unknown>;

  /**
   * Current world state (optional)
   */
  worldState?: WorldState;

  /**
   * Workflow ID for metrics lookup
   */
  workflowId?: string;

  /**
   * Task ID for metrics lookup
   */
  taskId?: string;
}

/**
 * EffortEvaluator computes cost/risk/value scores for tool requests
 * Uses world-model soft constraints and observability metrics
 */
export class EffortEvaluator {
  private config: Required<EffortEvaluatorConfig>;
  private constraintEngine?: ConstraintEngine;
  private metricsAggregator?: MetricsAggregator;

  constructor(
    config?: EffortEvaluatorConfig,
    constraintEngine?: ConstraintEngine,
    metricsAggregator?: MetricsAggregator
  ) {
    this.config = {
      costWeight: config?.costWeight ?? 0.25,
      riskWeight: config?.riskWeight ?? 0.35,
      valueWeight: config?.valueWeight ?? 0.25,
      timeWeight: config?.timeWeight ?? 0.15,
      approvalThreshold: config?.approvalThreshold ?? 0.6,
      rejectionThreshold: config?.rejectionThreshold ?? 0.3,
    };
    this.constraintEngine = constraintEngine;
    this.metricsAggregator = metricsAggregator;
  }

  /**
   * Evaluate the effort required for a tool request
   */
  async evaluate(context: EffortEvaluationContext): Promise<EffortEvaluation> {
    // Compute individual scores
    const costScore = this.computeCostScore(context);
    const riskScore = this.computeRiskScore(context);
    const valueScore = this.computeValueScore(context);
    const timeScore = this.computeTimeScore(context);

    // Compute world model score from soft constraints
    const worldModelScore = this.computeWorldModelScore(context);

    // Compute observability score from metrics
    const observabilityScore = this.computeObservabilityScore(context);

    // Base risk score from action risk tier
    const baseRiskScore = this.computeBaseRiskScore(context);

    // Combine scores with weights
    const decisionScore =
      costScore * this.config.costWeight +
      riskScore * this.config.riskWeight +
      valueScore * this.config.valueWeight +
      timeScore * this.config.timeWeight;

    // Determine recommendation
    let recommendation: 'approve' | 'review' | 'reject';
    let reason: string;

    if (decisionScore >= this.config.approvalThreshold) {
      recommendation = 'approve';
      reason = `High decision score (${decisionScore.toFixed(2)}) indicates favorable cost/risk/value profile`;
    } else if (decisionScore >= this.config.rejectionThreshold) {
      recommendation = 'review';
      reason = `Moderate decision score (${decisionScore.toFixed(2)}) suggests human review recommended`;
    } else {
      recommendation = 'reject';
      reason = `Low decision score (${decisionScore.toFixed(2)}) indicates unfavorable cost/risk/value profile`;
    }

    return {
      decisionScore,
      costScore,
      riskScore,
      valueScore,
      timeScore,
      breakdown: {
        worldModelScore,
        observabilityScore,
        baseRiskScore,
      },
      recommendation,
      reason,
      metadata: {
        config: this.config,
        toolName: context.toolName,
        actionId: context.action.id,
      },
    };
  }

  /**
   * Compute cost score from world model constraints and observability
   */
  private computeCostScore(context: EffortEvaluationContext): number {
    let score = 0.5; // Default neutral score

    // Get cost constraint score from world model if available
    if (this.constraintEngine && context.worldState) {
      const costConstraints = this.constraintEngine
        .getConstraintsByCategory('cost')
        .filter((c): c is SoftConstraint => c.severity === 'soft');

      if (costConstraints.length > 0) {
        let totalWeight = 0;
        let weightedScore = 0;

        for (const constraint of costConstraints) {
          const constraintScore = constraint.score(
            context.worldState,
            context.action.name,
            context.params
          );
          const weight = constraint.weight ?? 1.0;
          totalWeight += weight;
          weightedScore += constraintScore * weight;
        }

        if (totalWeight > 0) {
          score = weightedScore / totalWeight;
        }
      }
    }

    // Factor in observability cost metrics if available
    if (this.metricsAggregator) {
      const costPerSuccess = this.metricsAggregator.calculateCostPerSuccess();
      if (costPerSuccess > 0) {
        // Normalize cost per success (baseline is 10000ms for typical operations)
        // Lower cost = higher score
        const normalizedCost = Math.max(0, Math.min(1, 1 - costPerSuccess / 10000));
        score = (score + normalizedCost) / 2; // Average with constraint score
      }
    }

    return score;
  }

  /**
   * Compute risk score from world model constraints and action risk tier
   */
  private computeRiskScore(context: EffortEvaluationContext): number {
    let score = 0.5; // Default neutral score

    // Get risk constraint score from world model if available
    if (this.constraintEngine && context.worldState) {
      const riskConstraints = this.constraintEngine
        .getConstraintsByCategory('risk')
        .filter((c): c is SoftConstraint => c.severity === 'soft');

      if (riskConstraints.length > 0) {
        let totalWeight = 0;
        let weightedScore = 0;

        for (const constraint of riskConstraints) {
          const constraintScore = constraint.score(
            context.worldState,
            context.action.name,
            context.params
          );
          const weight = constraint.weight ?? 1.0;
          totalWeight += weight;
          weightedScore += constraintScore * weight;
        }

        if (totalWeight > 0) {
          score = weightedScore / totalWeight;
        }
      }
    }

    // Factor in base risk from action risk tier
    const baseRiskScore = this.computeBaseRiskScore(context);
    score = (score + baseRiskScore) / 2; // Average with constraint score

    // Factor in observability metrics (e.g., failure rates)
    if (this.metricsAggregator) {
      const humanEscalationRate = this.metricsAggregator.calculateHumanEscalationRate();
      if (humanEscalationRate >= 0) {
        // Lower escalation rate = lower risk
        const escalationScore = 1 - humanEscalationRate;
        score = (score + escalationScore) / 2;
      }
    }

    return score;
  }

  /**
   * Compute base risk score from action risk tier
   */
  private computeBaseRiskScore(context: EffortEvaluationContext): number {
    switch (context.action.riskTier) {
      case 'low':
        return 0.9; // Low risk = high score
      case 'medium':
        return 0.6;
      case 'high':
        return 0.3;
      case 'critical':
        return 0.1; // Critical risk = low score
      default:
        return 0.5;
    }
  }

  /**
   * Compute value score (currently simplified, could be enhanced)
   */
  private computeValueScore(context: EffortEvaluationContext): number {
    // Default value score based on action properties
    let score = 0.5;

    // Read-only operations typically have lower value but are safer
    if (context.action.intent === 'read') {
      score = 0.6;
    } else if (context.action.intent === 'write') {
      score = 0.7; // Write operations have higher value
    } else if (context.action.intent === 'delete') {
      score = 0.5; // Delete is neutral
    } else if (context.action.intent === 'execute') {
      score = 0.8; // Execute operations have high value
    }

    return score;
  }

  /**
   * Compute time score from world model constraints
   */
  private computeTimeScore(context: EffortEvaluationContext): number {
    let score = 0.5; // Default neutral score

    // Get time constraint score from world model if available
    if (this.constraintEngine && context.worldState) {
      const timeConstraints = this.constraintEngine
        .getConstraintsByCategory('time')
        .filter((c): c is SoftConstraint => c.severity === 'soft');

      if (timeConstraints.length > 0) {
        let totalWeight = 0;
        let weightedScore = 0;

        for (const constraint of timeConstraints) {
          const constraintScore = constraint.score(
            context.worldState,
            context.action.name,
            context.params
          );
          const weight = constraint.weight ?? 1.0;
          totalWeight += weight;
          weightedScore += constraintScore * weight;
        }

        if (totalWeight > 0) {
          score = weightedScore / totalWeight;
        }
      }
    }

    // Factor in observability time metrics if available
    if (this.metricsAggregator) {
      const mttr = this.metricsAggregator.calculateMTTR();
      if (mttr > 0) {
        // Normalize MTTR (baseline is 50000ms for typical recovery times)
        // Lower MTTR = higher score (faster recovery)
        const normalizedTime = Math.max(0, Math.min(1, 1 - mttr / 50000));
        score = (score + normalizedTime) / 2;
      }
    }

    return score;
  }

  /**
   * Compute world model score from all soft constraints
   */
  private computeWorldModelScore(context: EffortEvaluationContext): number | undefined {
    if (!this.constraintEngine || !context.worldState) {
      return undefined;
    }

    // Get overall score from constraint engine
    return this.constraintEngine.getActionScore(
      context.worldState,
      context.action.name,
      context.params
    );
  }

  /**
   * Compute observability score from metrics
   */
  private computeObservabilityScore(context: EffortEvaluationContext): number | undefined {
    if (!this.metricsAggregator) {
      return undefined;
    }

    // Compute a composite score from various metrics
    const costPerSuccess = this.metricsAggregator.calculateCostPerSuccess();
    const mttr = this.metricsAggregator.calculateMTTR();
    const humanEscalationRate = this.metricsAggregator.calculateHumanEscalationRate();

    // Normalize and combine metrics
    const costScore = costPerSuccess > 0 ? Math.max(0, Math.min(1, 1 - costPerSuccess / 10000)) : 0.5;
    const timeScore = mttr > 0 ? Math.max(0, Math.min(1, 1 - mttr / 50000)) : 0.5;
    const escalationScore = 1 - humanEscalationRate;

    return (costScore + timeScore + escalationScore) / 3;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<EffortEvaluatorConfig>): void {
    this.config = {
      ...this.config,
      ...config,
    };
  }

  /**
   * Get current configuration
   */
  getConfig(): Required<EffortEvaluatorConfig> {
    return { ...this.config };
  }

  /**
   * Set constraint engine
   */
  setConstraintEngine(engine: ConstraintEngine): void {
    this.constraintEngine = engine;
  }

  /**
   * Set metrics aggregator
   */
  setMetricsAggregator(aggregator: MetricsAggregator): void {
    this.metricsAggregator = aggregator;
  }
}
