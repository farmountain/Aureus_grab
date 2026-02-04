import { describe, it, expect, beforeEach } from 'vitest';
import { WorkflowOrchestrator } from '../src/orchestrator';
import { InMemoryStateStore } from '../src/state-store';
import { TaskSpec, WorkflowSpec, TaskState, StateStore, TaskExecutor, WorkflowState } from '../src/types';
import { CRVGate, Validators } from '@aureus/crv';
import { TelemetryCollector } from '@aureus/observability';
import { InMemoryStateStore as InMemoryWorldStateStore } from '@aureus/world-model';
import {
  HypothesisManager,
  Goal,
  HypothesisStatus,
} from '@aureus/hypothesis';

// Mock task executor
class MockTaskExecutor implements TaskExecutor {
  async execute(task: TaskSpec, state: TaskState): Promise<unknown> {
    // Simulate different task outcomes based on task ID
    if (task.id.includes('success')) {
      return { result: 'success', value: 42 };
    }
    if (task.id.includes('fail')) {
      throw new Error('Task failed');
    }
    return { result: 'ok' };
  }
}

describe('Hypothesis Integration with Orchestrator', () => {
  let stateStore: StateStore;
  let executor: TaskExecutor;
  let orchestrator: WorkflowOrchestrator;
  let telemetry: TelemetryCollector;
  let worldStateStore: InMemoryWorldStateStore;
  let hypothesisManager: HypothesisManager;
  let crvGate: CRVGate;

  beforeEach(() => {
    stateStore = new InMemoryStateStore();
    executor = new MockTaskExecutor();
    telemetry = new TelemetryCollector();
    worldStateStore = new InMemoryWorldStateStore();
    
    // Create CRV gate for validation
    crvGate = new CRVGate({
      name: 'Test Validation Gate',
      validators: [
        Validators.notNull(),
        Validators.schema({ result: 'string' }),
      ],
      blockOnFailure: true,
    });

    // Create hypothesis manager
    hypothesisManager = new HypothesisManager(
      {
        maxConcurrentHypotheses: 5,
        scoringCriteria: {
          confidenceWeight: 0.3,
          costWeight: 0.2,
          riskWeight: 0.3,
          goalAlignmentWeight: 0.2,
        },
        minAcceptableScore: 0.5,
        autoPrune: false,
        enableTelemetry: true,
      },
      telemetry,
      worldStateStore
    );

    // Register CRV gate with hypothesis manager
    hypothesisManager.registerCRVGate('test-gate', crvGate);

    // Create orchestrator with hypothesis manager
    orchestrator = new WorkflowOrchestrator(
      stateStore,
      executor,
      undefined,
      undefined,
      worldStateStore,
      undefined,
      crvGate,
      undefined,
      undefined,
      telemetry,
      undefined,
      hypothesisManager
    );
  });

  it('should integrate hypothesis manager with orchestrator', () => {
    const manager = orchestrator.getHypothesisManager();
    expect(manager).toBeDefined();
    expect(manager).toBe(hypothesisManager);
  });

  it('should allow setting hypothesis manager', () => {
    const newManager = new HypothesisManager(
      {
        maxConcurrentHypotheses: 3,
        scoringCriteria: {
          confidenceWeight: 0.25,
          costWeight: 0.25,
          riskWeight: 0.25,
          goalAlignmentWeight: 0.25,
        },
        minAcceptableScore: 0.6,
        autoPrune: true,
        enableTelemetry: false,
      }
    );

    orchestrator.setHypothesisManager(newManager);
    expect(orchestrator.getHypothesisManager()).toBe(newManager);
  });

  it('should create and evaluate hypothesis with CRV validation', async () => {
    // Register a goal
    const goal: Goal = {
      id: 'goal-1',
      description: 'Execute successful workflow',
      successCriteria: [
        {
          id: 'sc-1',
          description: 'Task completes successfully',
          validator: (state: any) => state?.result === 'success',
          weight: 1.0,
        },
      ],
    };
    hypothesisManager.registerGoal(goal);

    // Create world state with expected data for CRV validation
    await worldStateStore.create('test-result', { result: 'success', value: 42 });

    // Create a hypothesis
    const hypothesis = await hypothesisManager.createHypothesis(
      'goal-1',
      'Run workflow with success task',
      [
        {
          id: 'action-1',
          type: 'workflow',
          parameters: {
            taskId: 'task-success',
          },
          expectedOutcome: { result: 'success', value: 42 },
          crvGateName: 'test-gate',
        },
      ],
      {
        initialMetrics: {
          confidence: 0.8,
          cost: 0.3,
          risk: 0.2,
          goalAlignment: 0.9,
        },
      }
    );

    expect(hypothesis.id).toBeDefined();
    expect(hypothesis.status).toBe(HypothesisStatus.PENDING);

    // Set result state to match validation schema
    hypothesis.resultState = { result: 'success', value: 42 };

    // Evaluate hypothesis with CRV validation
    const evaluated = await hypothesisManager.evaluateHypothesis(hypothesis.id, {
      executeActions: false,
      validateWithCRV: true,
      crvGateName: 'test-gate',
    });

    expect(evaluated.status).toBe(HypothesisStatus.VALIDATED);
    expect(evaluated.metrics.crvResults).toBeDefined();
    expect(evaluated.metrics.crvResults?.passed).toBe(true);
  });

  it('should track multiple hypotheses for a goal', async () => {
    const goal: Goal = {
      id: 'goal-2',
      description: 'Optimize task execution',
      successCriteria: [],
    };
    hypothesisManager.registerGoal(goal);

    // Create multiple hypotheses
    const hyp1 = await hypothesisManager.createHypothesis(
      'goal-2',
      'Approach 1: Sequential execution',
      [],
      {
        initialMetrics: {
          confidence: 0.7,
          cost: 0.4,
          risk: 0.3,
          goalAlignment: 0.8,
        },
      }
    );

    const hyp2 = await hypothesisManager.createHypothesis(
      'goal-2',
      'Approach 2: Parallel execution',
      [],
      {
        initialMetrics: {
          confidence: 0.6,
          cost: 0.5,
          risk: 0.5,
          goalAlignment: 0.7,
        },
      }
    );

    const hyp3 = await hypothesisManager.createHypothesis(
      'goal-2',
      'Approach 3: Batch execution',
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

    // Get all hypotheses for the goal
    const hypotheses = hypothesisManager.getHypothesesByGoal('goal-2');
    expect(hypotheses).toHaveLength(3);

    // Evaluate all hypotheses
    await hypothesisManager.evaluateHypothesis(hyp1.id, {
      executeActions: false,
      validateWithCRV: false,
    });
    await hypothesisManager.evaluateHypothesis(hyp2.id, {
      executeActions: false,
      validateWithCRV: false,
    });
    await hypothesisManager.evaluateHypothesis(hyp3.id, {
      executeActions: false,
      validateWithCRV: false,
    });

    // Get top hypotheses
    const topHyps = hypotheses.map(h => hypothesisManager.getHypothesis(h.id)!);
    topHyps.sort((a, b) => b.metrics.compositeScore - a.metrics.compositeScore);

    // Hypothesis 3 should have the highest score
    expect(topHyps[0].description).toContain('Batch execution');
  });

  it('should emit telemetry events for hypothesis operations', async () => {
    const goal: Goal = {
      id: 'goal-3',
      description: 'Test telemetry',
      successCriteria: [],
    };
    hypothesisManager.registerGoal(goal);

    const initialEventCount = telemetry.getEvents().length;

    // Create and evaluate hypothesis
    const hypothesis = await hypothesisManager.createHypothesis(
      'goal-3',
      'Test hypothesis',
      []
    );

    await hypothesisManager.evaluateHypothesis(hypothesis.id, {
      executeActions: false,
      validateWithCRV: false,
    });

    await hypothesisManager.scoreHypothesis(hypothesis.id);

    // Should have emitted telemetry events
    const finalEventCount = telemetry.getEvents().length;
    expect(finalEventCount).toBeGreaterThan(initialEventCount);
  });

  it('should get hypothesis event log for audit trail', async () => {
    const goal: Goal = {
      id: 'goal-4',
      description: 'Test audit trail',
      successCriteria: [],
    };
    hypothesisManager.registerGoal(goal);

    const hypothesis = await hypothesisManager.createHypothesis(
      'goal-4',
      'Test hypothesis',
      []
    );

    await hypothesisManager.evaluateHypothesis(hypothesis.id, {
      executeActions: false,
      validateWithCRV: false,
    });

    await hypothesisManager.scoreHypothesis(hypothesis.id);

    // Get event log
    const events = hypothesisManager.getEventLog();
    expect(events.length).toBeGreaterThan(0);

    // Get events for specific hypothesis
    const hypEvents = hypothesisManager.getEventsForHypothesis(hypothesis.id);
    expect(hypEvents.length).toBeGreaterThan(0);
    expect(hypEvents.every(e => e.hypothesisId === hypothesis.id)).toBe(true);
  });

  it('should merge validated hypothesis', async () => {
    const goal: Goal = {
      id: 'goal-5',
      description: 'Test merge',
      successCriteria: [],
    };
    hypothesisManager.registerGoal(goal);

    const hypothesis = await hypothesisManager.createHypothesis(
      'goal-5',
      'Test hypothesis for merge',
      []
    );

    // Evaluate and manually set to validated
    await hypothesisManager.evaluateHypothesis(hypothesis.id, {
      executeActions: false,
      validateWithCRV: false,
    });

    const hyp = hypothesisManager.getHypothesis(hypothesis.id);
    if (hyp) {
      hyp.status = HypothesisStatus.VALIDATED;
    }

    // Merge hypothesis
    const mergeResult = await hypothesisManager.mergeHypothesis(hypothesis.id);

    expect(mergeResult.success).toBe(true);
    expect(mergeResult.hypothesisId).toBe(hypothesis.id);

    const merged = hypothesisManager.getHypothesis(hypothesis.id);
    expect(merged?.status).toBe(HypothesisStatus.MERGED);
  });
});
