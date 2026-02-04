import { describe, it, expect, beforeEach } from 'vitest';
import { EffortEvaluator } from '../src/effort-evaluator';
import { Hypothesis, HypothesisStatus, ScoringCriteria } from '../src/types';

describe('EffortEvaluator', () => {
  let evaluator: EffortEvaluator;
  let defaultCriteria: ScoringCriteria;
  let mockHypothesis: Hypothesis;

  beforeEach(() => {
    defaultCriteria = {
      confidenceWeight: 0.25,
      costWeight: 0.25,
      riskWeight: 0.25,
      goalAlignmentWeight: 0.25,
    };

    evaluator = new EffortEvaluator(defaultCriteria);

    mockHypothesis = {
      id: 'hyp-test',
      goalId: 'goal-1',
      description: 'Test hypothesis',
      status: HypothesisStatus.PENDING,
      proposedActions: [],
      metrics: {
        confidence: 0.8,
        cost: 0.3,
        risk: 0.2,
        goalAlignment: 0.9,
        compositeScore: 0.0,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  });

  describe('Construction and Validation', () => {
    it('should create evaluator with valid criteria', () => {
      expect(evaluator).toBeDefined();
      expect(evaluator.getCriteria()).toEqual(defaultCriteria);
    });

    it('should throw error for negative weights', () => {
      expect(() => {
        new EffortEvaluator({
          confidenceWeight: -0.1,
          costWeight: 0.25,
          riskWeight: 0.25,
          goalAlignmentWeight: 0.25,
        });
      }).toThrow('weights must be non-negative');
    });

    it('should throw error when all weights are zero without custom scorer', () => {
      expect(() => {
        new EffortEvaluator({
          confidenceWeight: 0,
          costWeight: 0,
          riskWeight: 0,
          goalAlignmentWeight: 0,
        });
      }).toThrow('at least one non-zero weight or a custom scorer');
    });

    it('should allow zero weights with custom scorer', () => {
      expect(() => {
        new EffortEvaluator({
          confidenceWeight: 0,
          costWeight: 0,
          riskWeight: 0,
          goalAlignmentWeight: 0,
          customScorer: () => 0.5,
        });
      }).not.toThrow();
    });
  });

  describe('Basic Scoring', () => {
    it('should compute composite score from metrics', () => {
      const result = evaluator.evaluate(mockHypothesis);

      expect(result.compositeScore).toBeGreaterThan(0);
      expect(result.compositeScore).toBeLessThanOrEqual(1);
      expect(result.usedCustomScorer).toBe(false);
    });

    it('should give higher scores for better metrics', () => {
      const goodHypothesis = { ...mockHypothesis };
      goodHypothesis.metrics = {
        confidence: 0.9,
        cost: 0.1,  // Low cost
        risk: 0.1,  // Low risk
        goalAlignment: 0.95,
        compositeScore: 0.0,
      };

      const badHypothesis = { ...mockHypothesis };
      badHypothesis.metrics = {
        confidence: 0.3,
        cost: 0.9,  // High cost
        risk: 0.8,  // High risk
        goalAlignment: 0.4,
        compositeScore: 0.0,
      };

      const goodResult = evaluator.evaluate(goodHypothesis);
      const badResult = evaluator.evaluate(badHypothesis);

      expect(goodResult.compositeScore).toBeGreaterThan(badResult.compositeScore);
    });

    it('should normalize score to 0-1 range', () => {
      // Test with extreme values
      const extremeHypothesis = { ...mockHypothesis };
      extremeHypothesis.metrics = {
        confidence: 1.0,
        cost: 0.0,
        risk: 0.0,
        goalAlignment: 1.0,
        compositeScore: 0.0,
      };

      const result = evaluator.evaluate(extremeHypothesis);

      expect(result.compositeScore).toBeGreaterThanOrEqual(0);
      expect(result.compositeScore).toBeLessThanOrEqual(1);
    });

    it('should invert cost and risk (lower is better)', () => {
      const lowCostRisk = { ...mockHypothesis };
      lowCostRisk.metrics = {
        confidence: 0.5,
        cost: 0.1,  // Low cost (good)
        risk: 0.1,  // Low risk (good)
        goalAlignment: 0.5,
        compositeScore: 0.0,
      };

      const highCostRisk = { ...mockHypothesis };
      highCostRisk.metrics = {
        confidence: 0.5,
        cost: 0.9,  // High cost (bad)
        risk: 0.9,  // High risk (bad)
        goalAlignment: 0.5,
        compositeScore: 0.0,
      };

      const lowResult = evaluator.evaluate(lowCostRisk);
      const highResult = evaluator.evaluate(highCostRisk);

      // Lower cost/risk should give higher score
      expect(lowResult.compositeScore).toBeGreaterThan(highResult.compositeScore);
    });
  });

  describe('Weighted Scoring', () => {
    it('should apply different weights correctly', () => {
      // Heavy weight on confidence
      const confidenceEvaluator = new EffortEvaluator({
        confidenceWeight: 0.7,
        costWeight: 0.1,
        riskWeight: 0.1,
        goalAlignmentWeight: 0.1,
      });

      const highConfidence = { ...mockHypothesis };
      highConfidence.metrics = {
        confidence: 0.9,
        cost: 0.5,
        risk: 0.5,
        goalAlignment: 0.5,
        compositeScore: 0.0,
      };

      const lowConfidence = { ...mockHypothesis };
      lowConfidence.metrics = {
        confidence: 0.3,
        cost: 0.5,
        risk: 0.5,
        goalAlignment: 0.5,
        compositeScore: 0.0,
      };

      const highResult = confidenceEvaluator.evaluate(highConfidence);
      const lowResult = confidenceEvaluator.evaluate(lowConfidence);

      // With heavy confidence weight, high confidence should score much better
      expect(highResult.compositeScore - lowResult.compositeScore).toBeGreaterThan(0.3);
    });

    it('should handle unequal weights correctly', () => {
      const unequalEvaluator = new EffortEvaluator({
        confidenceWeight: 0.5,
        costWeight: 0.3,
        riskWeight: 0.15,
        goalAlignmentWeight: 0.05,
      });

      const result = unequalEvaluator.evaluate(mockHypothesis);

      expect(result.compositeScore).toBeGreaterThan(0);
      expect(result.compositeScore).toBeLessThanOrEqual(1);
    });

    it('should handle single non-zero weight', () => {
      const singleWeightEvaluator = new EffortEvaluator({
        confidenceWeight: 1.0,
        costWeight: 0,
        riskWeight: 0,
        goalAlignmentWeight: 0,
      });

      const hypothesis = { ...mockHypothesis };
      hypothesis.metrics.confidence = 0.7;

      const result = singleWeightEvaluator.evaluate(hypothesis);

      // With only confidence weight, score should equal confidence
      expect(result.compositeScore).toBeCloseTo(hypothesis.metrics.confidence, 2);
    });
  });

  describe('Component Scores', () => {
    it('should return individual component scores', () => {
      const result = evaluator.evaluate(mockHypothesis);

      expect(result.components).toBeDefined();
      expect(result.components.confidence).toBeDefined();
      expect(result.components.cost).toBeDefined();
      expect(result.components.risk).toBeDefined();
      expect(result.components.goalAlignment).toBeDefined();
    });

    it('should calculate component scores correctly', () => {
      const result = evaluator.evaluate(mockHypothesis);

      // Component score = metric * weight
      expect(result.components.confidence).toBeCloseTo(
        mockHypothesis.metrics.confidence * defaultCriteria.confidenceWeight,
        5
      );
      
      // Cost and risk are inverted
      expect(result.components.cost).toBeCloseTo(
        (1 - mockHypothesis.metrics.cost) * defaultCriteria.costWeight,
        5
      );
      
      expect(result.components.risk).toBeCloseTo(
        (1 - mockHypothesis.metrics.risk) * defaultCriteria.riskWeight,
        5
      );
      
      expect(result.components.goalAlignment).toBeCloseTo(
        mockHypothesis.metrics.goalAlignment * defaultCriteria.goalAlignmentWeight,
        5
      );
    });
  });

  describe('Custom Scorer Integration', () => {
    const CUSTOM_SCORE = 0.8;
    const MAX_SCORE = 1.0;
    
    it('should use custom scorer when provided', () => {
      const customCriteria: ScoringCriteria = {
        ...defaultCriteria,
        customScorer: () => CUSTOM_SCORE,
      };

      const customEvaluator = new EffortEvaluator(customCriteria);
      const result = customEvaluator.evaluate(mockHypothesis);

      expect(result.usedCustomScorer).toBe(true);
      expect(result.components.custom).toBe(CUSTOM_SCORE);
    });

    it('should average base score with custom score', () => {
      const baseScore = 0.5;
      const customScore = MAX_SCORE;
      
      const customCriteria: ScoringCriteria = {
        confidenceWeight: 1.0,
        costWeight: 0,
        riskWeight: 0,
        goalAlignmentWeight: 0,
        customScorer: () => customScore,
      };

      const customEvaluator = new EffortEvaluator(customCriteria);
      
      const hypothesis = { ...mockHypothesis };
      hypothesis.metrics.confidence = baseScore;

      const result = customEvaluator.evaluate(hypothesis);

      // Average of base score and custom score
      const expectedScore = (baseScore + customScore) / 2;
      expect(result.compositeScore).toBeCloseTo(expectedScore, 2);
    });

    it('should pass hypothesis to custom scorer', () => {
      let passedHypothesis: Hypothesis | null = null;

      const customCriteria: ScoringCriteria = {
        ...defaultCriteria,
        customScorer: (hyp: Hypothesis) => {
          passedHypothesis = hyp;
          return 0.5;
        },
      };

      const customEvaluator = new EffortEvaluator(customCriteria);
      customEvaluator.evaluate(mockHypothesis);

      expect(passedHypothesis).toBe(mockHypothesis);
    });

    it('should allow custom scorer to influence final score', () => {
      const highCustomScorer: ScoringCriteria = {
        ...defaultCriteria,
        customScorer: () => 1.0,
      };

      const lowCustomScorer: ScoringCriteria = {
        ...defaultCriteria,
        customScorer: () => 0.0,
      };

      const highEvaluator = new EffortEvaluator(highCustomScorer);
      const lowEvaluator = new EffortEvaluator(lowCustomScorer);

      const highResult = highEvaluator.evaluate(mockHypothesis);
      const lowResult = lowEvaluator.evaluate(mockHypothesis);

      expect(highResult.compositeScore).toBeGreaterThan(lowResult.compositeScore);
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero metrics', () => {
      const zeroHypothesis = { ...mockHypothesis };
      zeroHypothesis.metrics = {
        confidence: 0,
        cost: 0,
        risk: 0,
        goalAlignment: 0,
        compositeScore: 0,
      };

      const result = evaluator.evaluate(zeroHypothesis);

      expect(result.compositeScore).toBeGreaterThanOrEqual(0);
      expect(result.compositeScore).toBeLessThanOrEqual(1);
    });

    it('should handle maximum metrics', () => {
      const maxHypothesis = { ...mockHypothesis };
      maxHypothesis.metrics = {
        confidence: 1.0,
        cost: 0.0,
        risk: 0.0,
        goalAlignment: 1.0,
        compositeScore: 0,
      };

      const result = evaluator.evaluate(maxHypothesis);

      expect(result.compositeScore).toBe(1.0);
    });

    it('should clamp scores outside 0-1 range', () => {
      // Even if calculations somehow go outside 0-1, clamp them
      const hypothesis = { ...mockHypothesis };
      hypothesis.metrics = {
        confidence: 1.0,
        cost: 0.0,
        risk: 0.0,
        goalAlignment: 1.0,
        compositeScore: 0,
      };

      const result = evaluator.evaluate(hypothesis);

      expect(result.compositeScore).toBeGreaterThanOrEqual(0);
      expect(result.compositeScore).toBeLessThanOrEqual(1);
    });

    it('should handle very small weights', () => {
      const smallWeightEvaluator = new EffortEvaluator({
        confidenceWeight: 0.001,
        costWeight: 0.001,
        riskWeight: 0.001,
        goalAlignmentWeight: 0.001,
      });

      const result = smallWeightEvaluator.evaluate(mockHypothesis);

      expect(result.compositeScore).toBeGreaterThanOrEqual(0);
      expect(result.compositeScore).toBeLessThanOrEqual(1);
    });

    it('should handle very large weights', () => {
      const largeWeightEvaluator = new EffortEvaluator({
        confidenceWeight: 100,
        costWeight: 100,
        riskWeight: 100,
        goalAlignmentWeight: 100,
      });

      const result = largeWeightEvaluator.evaluate(mockHypothesis);

      // Should still normalize to 0-1
      expect(result.compositeScore).toBeGreaterThanOrEqual(0);
      expect(result.compositeScore).toBeLessThanOrEqual(1);
    });
  });

  describe('Criteria Updates', () => {
    it('should update criteria', () => {
      const newCriteria: ScoringCriteria = {
        confidenceWeight: 0.5,
        costWeight: 0.3,
        riskWeight: 0.15,
        goalAlignmentWeight: 0.05,
      };

      evaluator.updateCriteria(newCriteria);

      expect(evaluator.getCriteria()).toEqual(newCriteria);
    });

    it('should validate new criteria on update', () => {
      expect(() => {
        evaluator.updateCriteria({
          confidenceWeight: -1,
          costWeight: 0.5,
          riskWeight: 0.25,
          goalAlignmentWeight: 0.25,
        });
      }).toThrow('weights must be non-negative');
    });

    it('should use new criteria for evaluations', () => {
      const result1 = evaluator.evaluate(mockHypothesis);

      // Update to weight confidence heavily
      evaluator.updateCriteria({
        confidenceWeight: 0.9,
        costWeight: 0.05,
        riskWeight: 0.03,
        goalAlignmentWeight: 0.02,
      });

      const result2 = evaluator.evaluate(mockHypothesis);

      // Scores should differ due to different weights
      expect(result1.compositeScore).not.toEqual(result2.compositeScore);
    });

    it('should return a copy of criteria to prevent external modification', () => {
      const criteria = evaluator.getCriteria();
      criteria.confidenceWeight = 999;

      // Internal criteria should not change
      expect(evaluator.getCriteria().confidenceWeight).not.toBe(999);
    });
  });

  describe('Real-world Scenarios', () => {
    it('should score high-confidence low-risk hypothesis highly', () => {
      const safeHypothesis = { ...mockHypothesis };
      safeHypothesis.metrics = {
        confidence: 0.95,
        cost: 0.3,
        risk: 0.1,
        goalAlignment: 0.9,
        compositeScore: 0,
      };

      const result = evaluator.evaluate(safeHypothesis);

      expect(result.compositeScore).toBeGreaterThan(0.7);
    });

    it('should score low-confidence high-risk hypothesis poorly', () => {
      const riskyHypothesis = { ...mockHypothesis };
      riskyHypothesis.metrics = {
        confidence: 0.3,
        cost: 0.8,
        risk: 0.9,
        goalAlignment: 0.4,
        compositeScore: 0,
      };

      const result = evaluator.evaluate(riskyHypothesis);

      expect(result.compositeScore).toBeLessThan(0.4);
    });

    it('should balance trade-offs appropriately', () => {
      // High cost but very high goal alignment
      const tradeoffHypothesis = { ...mockHypothesis };
      tradeoffHypothesis.metrics = {
        confidence: 0.8,
        cost: 0.9,  // High cost
        risk: 0.3,
        goalAlignment: 0.95,  // Very high alignment
        compositeScore: 0,
      };

      const result = evaluator.evaluate(tradeoffHypothesis);

      // Should still get a reasonable score due to high alignment and confidence
      expect(result.compositeScore).toBeGreaterThan(0.5);
      expect(result.compositeScore).toBeLessThan(0.9);
    });

    it('should allow prioritizing different aspects based on context', () => {
      // Safety-critical scenario: prioritize low risk
      const safetyCriticalEvaluator = new EffortEvaluator({
        confidenceWeight: 0.2,
        costWeight: 0.1,
        riskWeight: 0.6,  // Heavily weight risk
        goalAlignmentWeight: 0.1,
      });

      // Cost-sensitive scenario: prioritize low cost
      const costSensitiveEvaluator = new EffortEvaluator({
        confidenceWeight: 0.2,
        costWeight: 0.6,  // Heavily weight cost
        riskWeight: 0.1,
        goalAlignmentWeight: 0.1,
      });

      const lowRiskHighCost = { ...mockHypothesis };
      lowRiskHighCost.metrics = {
        confidence: 0.7,
        cost: 0.9,
        risk: 0.1,
        goalAlignment: 0.7,
        compositeScore: 0,
      };

      const highRiskLowCost = { ...mockHypothesis };
      highRiskLowCost.metrics = {
        confidence: 0.7,
        cost: 0.1,
        risk: 0.9,
        goalAlignment: 0.7,
        compositeScore: 0,
      };

      const safetyResult1 = safetyCriticalEvaluator.evaluate(lowRiskHighCost);
      const safetyResult2 = safetyCriticalEvaluator.evaluate(highRiskLowCost);

      const costResult1 = costSensitiveEvaluator.evaluate(lowRiskHighCost);
      const costResult2 = costSensitiveEvaluator.evaluate(highRiskLowCost);

      // In safety-critical context, low risk should score better
      expect(safetyResult1.compositeScore).toBeGreaterThan(safetyResult2.compositeScore);

      // In cost-sensitive context, low cost should score better
      expect(costResult2.compositeScore).toBeGreaterThan(costResult1.compositeScore);
    });
  });
});
