import { describe, it, expect, beforeEach } from 'vitest';
import { 
  HypothesisManager,
  Goal,
  Hypothesis,
  HypothesisStatus,
  HypothesisEventType,
} from '../src';
import { CRVGate, Validators } from '@aureus/crv';
import { TelemetryCollector } from '@aureus/observability';

describe('HypothesisManager', () => {
  let manager: HypothesisManager;
  let telemetry: TelemetryCollector;

  beforeEach(() => {
    telemetry = new TelemetryCollector();
    manager = new HypothesisManager(
      {
        maxConcurrentHypotheses: 3,
        scoringCriteria: {
          confidenceWeight: 0.3,
          costWeight: 0.2,
          riskWeight: 0.3,
          goalAlignmentWeight: 0.2,
        },
        minAcceptableScore: 0.6,
        autoPrune: false,
        enableTelemetry: true,
      },
      telemetry
    );
  });

  describe('Goal Management', () => {
    it('should register and retrieve goals', () => {
      const goal: Goal = {
        id: 'goal-1',
        description: 'Test goal',
        successCriteria: [
          {
            id: 'sc-1',
            description: 'Test criterion',
            validator: () => true,
            weight: 1.0,
          },
        ],
      };

      manager.registerGoal(goal);
      const retrieved = manager.getGoal('goal-1');

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe('goal-1');
      expect(retrieved?.description).toBe('Test goal');
    });
  });

  describe('Hypothesis Creation', () => {
    beforeEach(() => {
      manager.registerGoal({
        id: 'goal-1',
        description: 'Test goal',
        successCriteria: [],
      });
    });

    it('should create a new hypothesis', async () => {
      const hypothesis = await manager.createHypothesis(
        'goal-1',
        'Test hypothesis',
        [
          {
            id: 'action-1',
            type: 'test',
            parameters: { value: 42 },
          },
        ]
      );

      expect(hypothesis.id).toBeDefined();
      expect(hypothesis.goalId).toBe('goal-1');
      expect(hypothesis.description).toBe('Test hypothesis');
      expect(hypothesis.status).toBe(HypothesisStatus.PENDING);
      expect(hypothesis.proposedActions).toHaveLength(1);
      expect(hypothesis.metrics.compositeScore).toBe(0.5);
    });

    it('should emit HYPOTHESIS_CREATED event', async () => {
      await manager.createHypothesis('goal-1', 'Test hypothesis', []);

      const events = manager.getEventLog();
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe(HypothesisEventType.HYPOTHESIS_CREATED);
    });

    it('should throw error for non-existent goal', async () => {
      await expect(
        manager.createHypothesis('non-existent-goal', 'Test', [])
      ).rejects.toThrow('Goal non-existent-goal not found');
    });

    it('should enforce concurrent hypothesis limit', async () => {
      // Create 3 hypotheses (max limit)
      await manager.createHypothesis('goal-1', 'Hyp 1', []);
      await manager.createHypothesis('goal-1', 'Hyp 2', []);
      await manager.createHypothesis('goal-1', 'Hyp 3', []);

      // 4th should fail
      await expect(
        manager.createHypothesis('goal-1', 'Hyp 4', [])
      ).rejects.toThrow('Maximum concurrent hypotheses');
    });

    it('should allow creating hypothesis with parent', async () => {
      const parent = await manager.createHypothesis('goal-1', 'Parent', []);
      const child = await manager.createHypothesis(
        'goal-1',
        'Child',
        [],
        { parentId: parent.id }
      );

      expect(child.parentId).toBe(parent.id);
    });
  });

  describe('Hypothesis Evaluation', () => {
    let hypothesis: Hypothesis;

    beforeEach(async () => {
      manager.registerGoal({
        id: 'goal-1',
        description: 'Test goal',
        successCriteria: [
          {
            id: 'sc-1',
            description: 'Test criterion',
            validator: () => true,
            weight: 1.0,
          },
        ],
      });

      hypothesis = await manager.createHypothesis('goal-1', 'Test hypothesis', [
        {
          id: 'action-1',
          type: 'test',
          parameters: { value: 42 },
        },
      ]);
    });

    it('should evaluate hypothesis without CRV', async () => {
      const evaluated = await manager.evaluateHypothesis(hypothesis.id, {
        executeActions: false,
        validateWithCRV: false,
      });

      expect(evaluated.status).toBe(HypothesisStatus.IN_PROGRESS);
    });

    it('should validate hypothesis with CRV gate', async () => {
      const gate = new CRVGate({
        name: 'Test Gate',
        validators: [Validators.notNull()],
        blockOnFailure: true,
      });
      manager.registerCRVGate('test-gate', gate);

      const evaluated = await manager.evaluateHypothesis(hypothesis.id, {
        executeActions: false,
        validateWithCRV: true,
        crvGateName: 'test-gate',
      });

      expect(evaluated.status).toBe(HypothesisStatus.VALIDATED);
      expect(evaluated.metrics.crvResults).toBeDefined();
      expect(evaluated.metrics.crvResults?.passed).toBe(true);
    });

    it('should reject hypothesis on constraint violation', async () => {
      manager.registerGoal({
        id: 'goal-2',
        description: 'Constrained goal',
        successCriteria: [],
        constraints: [
          {
            id: 'constraint-1',
            description: 'Always fails',
            validator: () => false,
          },
        ],
      });

      const constrainedHyp = await manager.createHypothesis('goal-2', 'Test', []);
      const evaluated = await manager.evaluateHypothesis(constrainedHyp.id, {
        executeActions: false,
        validateWithCRV: false,
      });

      expect(evaluated.status).toBe(HypothesisStatus.REJECTED);
    });

    it('should emit HYPOTHESIS_EVALUATED event', async () => {
      await manager.evaluateHypothesis(hypothesis.id, {
        executeActions: false,
        validateWithCRV: false,
      });

      const events = manager.getEventLog();
      const evaluatedEvents = events.filter(
        e => e.type === HypothesisEventType.HYPOTHESIS_EVALUATED
      );
      expect(evaluatedEvents).toHaveLength(1);
    });
  });

  describe('Hypothesis Scoring', () => {
    let hypothesis: Hypothesis;

    beforeEach(async () => {
      manager.registerGoal({
        id: 'goal-1',
        description: 'Test goal',
        successCriteria: [],
      });

      hypothesis = await manager.createHypothesis(
        'goal-1',
        'Test hypothesis',
        [],
        {
          initialMetrics: {
            confidence: 0.8,
            cost: 0.3,
            risk: 0.2,
            goalAlignment: 0.9,
          },
        }
      );
    });

    it('should compute composite score', async () => {
      const score = await manager.scoreHypothesis(hypothesis.id);

      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(1);
      
      const updated = manager.getHypothesis(hypothesis.id);
      expect(updated?.metrics.compositeScore).toBe(score);
    });

    it('should emit HYPOTHESIS_SCORED event', async () => {
      await manager.scoreHypothesis(hypothesis.id);

      const events = manager.getEventLog();
      const scoredEvents = events.filter(
        e => e.type === HypothesisEventType.HYPOTHESIS_SCORED
      );
      expect(scoredEvents).toHaveLength(1);
    });

    it('should use custom scorer if provided', async () => {
      const customManager = new HypothesisManager(
        {
          maxConcurrentHypotheses: 5,
          scoringCriteria: {
            confidenceWeight: 0.25,
            costWeight: 0.25,
            riskWeight: 0.25,
            goalAlignmentWeight: 0.25,
            customScorer: () => 1.0, // Always return max score
          },
          minAcceptableScore: 0.6,
          autoPrune: false,
          enableTelemetry: false,
        }
      );

      customManager.registerGoal({
        id: 'goal-1',
        description: 'Test goal',
        successCriteria: [],
      });

      const hyp = await customManager.createHypothesis('goal-1', 'Test', []);
      const score = await customManager.scoreHypothesis(hyp.id);

      // With custom scorer returning 1.0 and averaging with base score,
      // result should be > 0.5
      expect(score).toBeGreaterThan(0.5);
    });
  });

  describe('Hypothesis Merging', () => {
    let hypothesis: Hypothesis;

    beforeEach(async () => {
      manager.registerGoal({
        id: 'goal-1',
        description: 'Test goal',
        successCriteria: [],
      });

      hypothesis = await manager.createHypothesis('goal-1', 'Test hypothesis', []);
    });

    it('should merge validated hypothesis', async () => {
      // Evaluate and validate
      await manager.evaluateHypothesis(hypothesis.id, {
        executeActions: false,
        validateWithCRV: false,
      });

      // Manually set to validated (since no CRV)
      const hyp = manager.getHypothesis(hypothesis.id);
      if (hyp) {
        hyp.status = HypothesisStatus.VALIDATED;
      }

      const result = await manager.mergeHypothesis(hypothesis.id);

      expect(result.success).toBe(true);
      expect(result.hypothesisId).toBe(hypothesis.id);

      const merged = manager.getHypothesis(hypothesis.id);
      expect(merged?.status).toBe(HypothesisStatus.MERGED);
    });

    it('should fail to merge non-validated hypothesis', async () => {
      const result = await manager.mergeHypothesis(hypothesis.id);

      expect(result.success).toBe(false);
      expect(result.reason).toContain('Must be VALIDATED');
    });

    it('should emit HYPOTHESIS_MERGED event', async () => {
      const hyp = manager.getHypothesis(hypothesis.id);
      if (hyp) {
        hyp.status = HypothesisStatus.VALIDATED;
      }

      await manager.mergeHypothesis(hypothesis.id);

      const events = manager.getEventLog();
      const mergedEvents = events.filter(
        e => e.type === HypothesisEventType.HYPOTHESIS_MERGED
      );
      expect(mergedEvents).toHaveLength(1);
    });
  });

  describe('Hypothesis Discarding', () => {
    let hypothesis: Hypothesis;

    beforeEach(async () => {
      manager.registerGoal({
        id: 'goal-1',
        description: 'Test goal',
        successCriteria: [],
      });

      hypothesis = await manager.createHypothesis('goal-1', 'Test hypothesis', []);
    });

    it('should discard hypothesis', async () => {
      await manager.discardHypothesis(hypothesis.id, 'Test reason');

      const discarded = manager.getHypothesis(hypothesis.id);
      expect(discarded?.status).toBe(HypothesisStatus.DISCARDED);
    });

    it('should emit HYPOTHESIS_DISCARDED event', async () => {
      await manager.discardHypothesis(hypothesis.id);

      const events = manager.getEventLog();
      const discardedEvents = events.filter(
        e => e.type === HypothesisEventType.HYPOTHESIS_DISCARDED
      );
      expect(discardedEvents).toHaveLength(1);
      expect(discardedEvents[0].data.reason).toBeDefined();
    });
  });

  describe('Auto-Pruning', () => {
    beforeEach(() => {
      manager = new HypothesisManager(
        {
          maxConcurrentHypotheses: 5,
          scoringCriteria: {
            confidenceWeight: 0.25,
            costWeight: 0.25,
            riskWeight: 0.25,
            goalAlignmentWeight: 0.25,
          },
          minAcceptableScore: 0.7, // High threshold
          autoPrune: true, // Enable auto-pruning
          enableTelemetry: false,
        }
      );

      manager.registerGoal({
        id: 'goal-1',
        description: 'Test goal',
        successCriteria: [],
      });
    });

    it('should auto-prune low-scoring hypotheses', async () => {
      // Create hypothesis with low metrics
      const hypothesis = await manager.createHypothesis(
        'goal-1',
        'Low-scoring hypothesis',
        [],
        {
          initialMetrics: {
            confidence: 0.2,
            cost: 0.8,
            risk: 0.9,
            goalAlignment: 0.3,
          },
        }
      );

      // Evaluate (will score and auto-prune)
      await manager.evaluateHypothesis(hypothesis.id, {
        executeActions: false,
        validateWithCRV: false,
      });

      const pruned = manager.getHypothesis(hypothesis.id);
      expect(pruned?.status).toBe(HypothesisStatus.DISCARDED);
    });
  });

  describe('Query Methods', () => {
    beforeEach(async () => {
      manager.registerGoal({
        id: 'goal-1',
        description: 'Goal 1',
        successCriteria: [],
      });
      manager.registerGoal({
        id: 'goal-2',
        description: 'Goal 2',
        successCriteria: [],
      });

      // Create hypotheses for goal-1
      await manager.createHypothesis('goal-1', 'Hyp 1', []);
      await manager.createHypothesis('goal-1', 'Hyp 2', []);
      // Create hypothesis for goal-2
      await manager.createHypothesis('goal-2', 'Hyp 3', []);
    });

    it('should get hypotheses by goal', () => {
      const goal1Hyps = manager.getHypothesesByGoal('goal-1');
      const goal2Hyps = manager.getHypothesesByGoal('goal-2');

      expect(goal1Hyps).toHaveLength(2);
      expect(goal2Hyps).toHaveLength(1);
    });

    it('should get top hypotheses by score', async () => {
      const hypotheses = manager.getHypothesesByGoal('goal-1');
      
      // Set different scores
      for (let i = 0; i < hypotheses.length; i++) {
        const hyp = hypotheses[i];
        hyp.metrics.compositeScore = 0.5 + (i * 0.2);
        hyp.status = HypothesisStatus.VALIDATED;
      }

      const topHyps = manager.getTopHypotheses('goal-1', 1);
      
      expect(topHyps).toHaveLength(1);
      expect(topHyps[0].metrics.compositeScore).toBeGreaterThanOrEqual(0.5);
    });

    it('should get events for specific hypothesis', async () => {
      const hypotheses = manager.getHypothesesByGoal('goal-1');
      const hypId = hypotheses[0].id;

      await manager.discardHypothesis(hypId);

      const events = manager.getEventsForHypothesis(hypId);
      
      expect(events.length).toBeGreaterThan(0);
      expect(events.every(e => e.hypothesisId === hypId)).toBe(true);
    });
  });

  describe('Telemetry Integration', () => {
    it('should emit telemetry events when enabled', async () => {
      manager.registerGoal({
        id: 'goal-1',
        description: 'Test goal',
        successCriteria: [],
      });

      await manager.createHypothesis('goal-1', 'Test', []);

      const telemetryEvents = telemetry.getEvents();
      expect(telemetryEvents.length).toBeGreaterThan(0);
    });

    it('should not emit telemetry when disabled', async () => {
      const noTelemetryManager = new HypothesisManager(
        {
          maxConcurrentHypotheses: 5,
          scoringCriteria: {
            confidenceWeight: 0.25,
            costWeight: 0.25,
            riskWeight: 0.25,
            goalAlignmentWeight: 0.25,
          },
          minAcceptableScore: 0.6,
          autoPrune: false,
          enableTelemetry: false, // Disabled
        },
        telemetry
      );

      noTelemetryManager.registerGoal({
        id: 'goal-1',
        description: 'Test goal',
        successCriteria: [],
      });

      const initialEventCount = telemetry.getEvents().length;
      await noTelemetryManager.createHypothesis('goal-1', 'Test', []);
      
      // Should not add new telemetry events
      expect(telemetry.getEvents().length).toBe(initialEventCount);
    });
  });
});
