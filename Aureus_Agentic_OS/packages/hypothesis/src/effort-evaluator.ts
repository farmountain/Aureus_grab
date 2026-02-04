/**
 * EffortEvaluator - Scores hypotheses based on cost, risk, confidence, and goal alignment
 * 
 * This class encapsulates the logic for evaluating and scoring hypotheses
 * using configurable weights and custom scoring functions.
 */

import { Hypothesis, ScoringCriteria } from './types';

/**
 * Result of evaluating a hypothesis
 */
export interface EvaluationResult {
  /** Composite score (0-1) */
  compositeScore: number;
  /** Individual component scores */
  components: {
    confidence: number;
    cost: number;
    risk: number;
    goalAlignment: number;
    custom?: number;
  };
  /** Whether the evaluation used a custom scorer */
  usedCustomScorer: boolean;
}

/**
 * EffortEvaluator evaluates and scores hypotheses based on multiple criteria
 */
export class EffortEvaluator {
  private criteria: ScoringCriteria;

  constructor(criteria: ScoringCriteria) {
    this.criteria = criteria;
    this.validateCriteria();
  }

  /**
   * Evaluate and score a hypothesis
   * 
   * @param hypothesis - The hypothesis to evaluate
   * @returns Evaluation result with composite score and component scores
   */
  evaluate(hypothesis: Hypothesis): EvaluationResult {
    const metrics = hypothesis.metrics;
    const criteria = this.criteria;

    // Calculate weighted component scores
    const confidenceScore = metrics.confidence * criteria.confidenceWeight;
    const costScore = (1 - metrics.cost) * criteria.costWeight; // Lower cost is better
    const riskScore = (1 - metrics.risk) * criteria.riskWeight; // Lower risk is better
    const goalAlignmentScore = metrics.goalAlignment * criteria.goalAlignmentWeight;

    // Sum weighted scores
    let compositeScore = confidenceScore + costScore + riskScore + goalAlignmentScore;

    // Normalize base score to 0-1 range
    const totalWeight = this.getTotalWeight();
    if (totalWeight > 0) {
      compositeScore = compositeScore / totalWeight;
    }

    // Apply custom scorer if provided
    let customScore: number | undefined;
    let usedCustomScorer = false;

    if (criteria.customScorer) {
      customScore = criteria.customScorer(hypothesis);
      // Average the normalized base score with custom score.
      // Simple averaging gives equal weight to both the metrics-based score
      // and the custom scorer, allowing domain-specific logic to balance
      // with the standard evaluation criteria.
      compositeScore = (compositeScore + customScore) / 2;
      usedCustomScorer = true;
    }

    // Clamp to 0-1 range
    compositeScore = Math.max(0, Math.min(1, compositeScore));

    return {
      compositeScore,
      components: {
        confidence: confidenceScore,
        cost: costScore,
        risk: riskScore,
        goalAlignment: goalAlignmentScore,
        custom: customScore,
      },
      usedCustomScorer,
    };
  }

  /**
   * Update the scoring criteria
   * 
   * @param criteria - New scoring criteria
   */
  updateCriteria(criteria: ScoringCriteria): void {
    this.criteria = criteria;
    this.validateCriteria();
  }

  /**
   * Get the current scoring criteria
   */
  getCriteria(): ScoringCriteria {
    return { ...this.criteria };
  }

  /**
   * Calculate the total weight from scoring criteria
   */
  private getTotalWeight(): number {
    const { confidenceWeight, costWeight, riskWeight, goalAlignmentWeight } = this.criteria;
    return confidenceWeight + costWeight + riskWeight + goalAlignmentWeight;
  }

  /**
   * Validate that scoring criteria weights are valid
   */
  private validateCriteria(): void {
    const { confidenceWeight, costWeight, riskWeight, goalAlignmentWeight } = this.criteria;

    if (confidenceWeight < 0 || costWeight < 0 || riskWeight < 0 || goalAlignmentWeight < 0) {
      throw new Error('Scoring criteria weights must be non-negative');
    }

    const totalWeight = this.getTotalWeight();
    if (totalWeight === 0 && !this.criteria.customScorer) {
      throw new Error('Scoring criteria must have at least one non-zero weight or a custom scorer');
    }
  }
}
