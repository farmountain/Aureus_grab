import {
  Hypothesis,
  HypothesisStatus,
  HypothesisMetrics,
  HypothesisAction,
  Goal,
  HypothesisManagerConfig,
  HypothesisEvent,
  HypothesisEventType,
  MergeResult,
  CreateHypothesisOptions,
  EvaluateHypothesisOptions,
  ScoringCriteria,
} from './types';
import { CRVGate, Commit, GateResult } from '@aureus/crv';
import { TelemetryCollector, TelemetryEventType } from '@aureus/observability';
import { StateStore as WorldModelStateStore } from '@aureus/world-model';
import { EffortEvaluator } from './effort-evaluator';

/**
 * HypothesisManager manages the lifecycle of hypothesis branches
 * for goal-driven agent reasoning with CRV validation integration
 */
export class HypothesisManager {
  private hypotheses: Map<string, Hypothesis>;
  private goals: Map<string, Goal>;
  private config: HypothesisManagerConfig;
  private telemetry?: TelemetryCollector;
  private crvGates: Map<string, CRVGate>;
  private eventLog: HypothesisEvent[];
  private worldStateStore?: WorldModelStateStore;
  private effortEvaluator: EffortEvaluator;

  constructor(
    config: HypothesisManagerConfig,
    telemetry?: TelemetryCollector,
    worldStateStore?: WorldModelStateStore
  ) {
    this.hypotheses = new Map();
    this.goals = new Map();
    this.config = config;
    this.telemetry = telemetry;
    this.crvGates = new Map();
    this.eventLog = [];
    this.worldStateStore = worldStateStore;
    this.effortEvaluator = new EffortEvaluator(config.scoringCriteria);
  }

  /**
   * Register a goal for hypothesis generation
   */
  registerGoal(goal: Goal): void {
    this.goals.set(goal.id, goal);
  }

  /**
   * Get a registered goal
   */
  getGoal(goalId: string): Goal | undefined {
    return this.goals.get(goalId);
  }

  /**
   * Register a CRV gate for validation
   */
  registerCRVGate(name: string, gate: CRVGate): void {
    this.crvGates.set(name, gate);
  }

  /**
   * Create a new hypothesis branch for a goal
   */
  async createHypothesis(
    goalId: string,
    description: string,
    proposedActions: HypothesisAction[],
    options?: CreateHypothesisOptions
  ): Promise<Hypothesis> {
    const goal = this.goals.get(goalId);
    if (!goal) {
      throw new Error(`Goal ${goalId} not found`);
    }

    // Check concurrent hypothesis limit
    const activeHypotheses = Array.from(this.hypotheses.values()).filter(
      h => h.goalId === goalId && 
           (h.status === HypothesisStatus.PENDING || h.status === HypothesisStatus.IN_PROGRESS)
    );

    if (activeHypotheses.length >= this.config.maxConcurrentHypotheses) {
      throw new Error(
        `Maximum concurrent hypotheses (${this.config.maxConcurrentHypotheses}) reached for goal ${goalId}`
      );
    }

    // Capture initial state snapshot
    let initialState: unknown = undefined;
    if (this.worldStateStore) {
      initialState = await this.worldStateStore.snapshot();
    }

    const hypothesis: Hypothesis = {
      id: this.generateId(),
      parentId: options?.parentId,
      goalId,
      description,
      status: HypothesisStatus.PENDING,
      proposedActions,
      metrics: options?.initialMetrics ? this.computeMetrics(options.initialMetrics) : this.initializeMetrics(),
      initialState,
      createdAt: new Date(),
      updatedAt: new Date(),
      intentId: options?.intentId,
      intentVersion: options?.intentVersion,
      metadata: options?.metadata,
    };

    this.hypotheses.set(hypothesis.id, hypothesis);

    // Emit event
    this.emitEvent({
      type: HypothesisEventType.HYPOTHESIS_CREATED,
      hypothesisId: hypothesis.id,
      goalId,
      timestamp: new Date(),
      data: {
        description,
        actionCount: proposedActions.length,
        parentId: options?.parentId,
        intentId: options?.intentId,
        intentVersion: options?.intentVersion,
      },
    });

    return hypothesis;
  }

  /**
   * Evaluate a hypothesis, optionally executing actions and validating with CRV
   */
  async evaluateHypothesis(
    hypothesisId: string,
    options: EvaluateHypothesisOptions = { executeActions: false, validateWithCRV: true }
  ): Promise<Hypothesis> {
    const hypothesis = this.hypotheses.get(hypothesisId);
    if (!hypothesis) {
      throw new Error(`Hypothesis ${hypothesisId} not found`);
    }

    const goal = this.goals.get(hypothesis.goalId);
    if (!goal) {
      throw new Error(`Goal ${hypothesis.goalId} not found`);
    }

    hypothesis.status = HypothesisStatus.IN_PROGRESS;
    hypothesis.updatedAt = new Date();

    try {
      // Evaluate constraints
      if (goal.constraints) {
        for (const constraint of goal.constraints) {
          const satisfied = await constraint.validator(hypothesis);
          if (!satisfied) {
            hypothesis.status = HypothesisStatus.REJECTED;
            this.emitEvent({
              type: HypothesisEventType.HYPOTHESIS_REJECTED,
              hypothesisId: hypothesis.id,
              goalId: hypothesis.goalId,
              timestamp: new Date(),
              data: { reason: `Constraint violated: ${constraint.description}` },
            });
            return hypothesis;
          }
        }
      }

      // Execute actions if requested
      if (options.executeActions) {
        await this.executeHypothesisActions(hypothesis);
      }

      // Validate with CRV if enabled
      if (options.validateWithCRV) {
        const crvResult = await this.validateWithCRV(hypothesis, options.crvGateName);
        hypothesis.metrics.crvResults = {
          passed: crvResult.passed,
          validationCount: crvResult.validationResults.length,
          failedValidations: crvResult.validationResults
            .filter(v => !v.valid)
            .map(v => v.reason || 'Unknown failure'),
        };

        if (!crvResult.passed) {
          hypothesis.status = HypothesisStatus.REJECTED;
          this.emitEvent({
            type: HypothesisEventType.HYPOTHESIS_REJECTED,
            hypothesisId: hypothesis.id,
            goalId: hypothesis.goalId,
            timestamp: new Date(),
            data: { reason: 'CRV validation failed', crvResult },
          });
          return hypothesis;
        }

        hypothesis.status = HypothesisStatus.VALIDATED;
        this.emitEvent({
          type: HypothesisEventType.HYPOTHESIS_VALIDATED,
          hypothesisId: hypothesis.id,
          goalId: hypothesis.goalId,
          timestamp: new Date(),
          data: { crvResult },
        });
      }

      // Score the hypothesis
      await this.scoreHypothesis(hypothesisId);

      // Auto-prune if enabled and score is too low
      if (this.config.autoPrune && hypothesis.metrics.compositeScore < this.config.minAcceptableScore) {
        await this.discardHypothesis(hypothesisId, 'Score below threshold');
      }

      this.emitEvent({
        type: HypothesisEventType.HYPOTHESIS_EVALUATED,
        hypothesisId: hypothesis.id,
        goalId: hypothesis.goalId,
        timestamp: new Date(),
        data: {
          status: hypothesis.status,
          score: hypothesis.metrics.compositeScore,
        },
      });

      return hypothesis;
    } catch (error) {
      hypothesis.status = HypothesisStatus.REJECTED;
      hypothesis.updatedAt = new Date();
      
      this.emitEvent({
        type: HypothesisEventType.HYPOTHESIS_REJECTED,
        hypothesisId: hypothesis.id,
        goalId: hypothesis.goalId,
        timestamp: new Date(),
        data: { 
          reason: `Evaluation error: ${error instanceof Error ? error.message : String(error)}` 
        },
      });

      throw error;
    }
  }

  /**
   * Score a hypothesis based on configured criteria
   */
  async scoreHypothesis(hypothesisId: string): Promise<number> {
    const hypothesis = this.hypotheses.get(hypothesisId);
    if (!hypothesis) {
      throw new Error(`Hypothesis ${hypothesisId} not found`);
    }

    // Use EffortEvaluator to compute score
    const evaluationResult = this.effortEvaluator.evaluate(hypothesis);
    const compositeScore = evaluationResult.compositeScore;

    hypothesis.metrics.compositeScore = compositeScore;
    hypothesis.updatedAt = new Date();

    this.emitEvent({
      type: HypothesisEventType.HYPOTHESIS_SCORED,
      hypothesisId: hypothesis.id,
      goalId: hypothesis.goalId,
      timestamp: new Date(),
      data: {
        compositeScore,
        metrics: hypothesis.metrics,
        evaluationResult,
      },
    });

    return compositeScore;
  }

  /**
   * Merge a validated hypothesis into the main branch
   */
  async mergeHypothesis(hypothesisId: string): Promise<MergeResult> {
    const hypothesis = this.hypotheses.get(hypothesisId);
    if (!hypothesis) {
      return {
        success: false,
        hypothesisId,
        reason: 'Hypothesis not found',
      };
    }

    if (hypothesis.status !== HypothesisStatus.VALIDATED) {
      return {
        success: false,
        hypothesisId,
        reason: `Cannot merge hypothesis with status ${hypothesis.status}. Must be VALIDATED.`,
      };
    }

    try {
      // Capture final state
      let finalState: unknown = undefined;
      if (this.worldStateStore) {
        finalState = await this.worldStateStore.snapshot();
      }

      hypothesis.status = HypothesisStatus.MERGED;
      hypothesis.updatedAt = new Date();
      hypothesis.resultState = finalState;

      this.emitEvent({
        type: HypothesisEventType.HYPOTHESIS_MERGED,
        hypothesisId: hypothesis.id,
        goalId: hypothesis.goalId,
        timestamp: new Date(),
        data: {
          score: hypothesis.metrics.compositeScore,
        },
      });

      return {
        success: true,
        hypothesisId,
        finalState,
      };
    } catch (error) {
      return {
        success: false,
        hypothesisId,
        reason: `Merge failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Discard a hypothesis branch
   */
  async discardHypothesis(hypothesisId: string, reason?: string): Promise<void> {
    const hypothesis = this.hypotheses.get(hypothesisId);
    if (!hypothesis) {
      throw new Error(`Hypothesis ${hypothesisId} not found`);
    }

    hypothesis.status = HypothesisStatus.DISCARDED;
    hypothesis.updatedAt = new Date();

    this.emitEvent({
      type: HypothesisEventType.HYPOTHESIS_DISCARDED,
      hypothesisId: hypothesis.id,
      goalId: hypothesis.goalId,
      timestamp: new Date(),
      data: { reason: reason || 'Explicitly discarded' },
    });
  }

  /**
   * Get all hypotheses for a goal
   */
  getHypothesesByGoal(goalId: string): Hypothesis[] {
    return Array.from(this.hypotheses.values()).filter(h => h.goalId === goalId);
  }

  /**
   * Get top-ranked hypotheses by score
   */
  getTopHypotheses(goalId: string, limit: number = 5): Hypothesis[] {
    const hypotheses = this.getHypothesesByGoal(goalId);
    return hypotheses
      .filter(h => h.status === HypothesisStatus.VALIDATED)
      .sort((a, b) => b.metrics.compositeScore - a.metrics.compositeScore)
      .slice(0, limit);
  }

  /**
   * Get a specific hypothesis
   */
  getHypothesis(hypothesisId: string): Hypothesis | undefined {
    return this.hypotheses.get(hypothesisId);
  }

  /**
   * Get all events in chronological order
   */
  getEventLog(): HypothesisEvent[] {
    return [...this.eventLog];
  }

  /**
   * Get events for a specific hypothesis
   */
  getEventsForHypothesis(hypothesisId: string): HypothesisEvent[] {
    return this.eventLog.filter(e => e.hypothesisId === hypothesisId);
  }

  /**
   * Validate hypothesis with CRV gate
   */
  private async validateWithCRV(hypothesis: Hypothesis, gateName?: string): Promise<GateResult> {
    const gate = gateName ? this.crvGates.get(gateName) : this.crvGates.values().next().value;
    
    if (!gate) {
      // No CRV gate available, return passing result
      return {
        passed: true,
        gateName: 'none',
        validationResults: [],
        blockedCommit: false,
        timestamp: new Date(),
        crv_status: 'passed',
      };
    }

    // Create a commit from hypothesis result state
    const commit: Commit = {
      id: hypothesis.id,
      data: hypothesis.resultState || hypothesis.proposedActions,
      previousState: hypothesis.initialState,
      metadata: {
        hypothesisId: hypothesis.id,
        goalId: hypothesis.goalId,
        description: hypothesis.description,
      },
    };

    return await gate.validate(commit);
  }

  /**
   * Execute hypothesis actions (stub for future implementation)
   * 
   * TODO: Implement full integration with WorkflowOrchestrator
   * This method should:
   * 1. Convert hypothesis actions to workflow tasks
   * 2. Execute via WorkflowOrchestrator
   * 3. Capture execution results and state changes
   * 4. Update hypothesis resultState with execution outcomes
   * 
   * For now, this is a placeholder that captures the result state snapshot.
   * Hypothesis actions can still be validated via CRV without execution.
   */
  private async executeHypothesisActions(hypothesis: Hypothesis): Promise<void> {
    // Placeholder implementation - capture current state as result state
    // In a full implementation, this would:
    // - Create a WorkflowSpec from hypothesis.proposedActions
    // - Execute via WorkflowOrchestrator
    // - Capture execution results and metrics
    
    if (this.worldStateStore) {
      hypothesis.resultState = await this.worldStateStore.snapshot();
    }
  }

  /**
   * Emit a hypothesis event
   */
  private emitEvent(event: HypothesisEvent): void {
    this.eventLog.push(event);

    if (this.config.enableTelemetry && this.telemetry) {
      this.telemetry.recordEvent({
        type: TelemetryEventType.CUSTOM,
        workflowId: event.hypothesisId,
        taskId: event.goalId,
        timestamp: event.timestamp,
        data: {
          hypothesisEventType: event.type,
          ...event.data,
        },
      });
    }
  }

  /**
   * Initialize default metrics
   */
  private initializeMetrics(): HypothesisMetrics {
    return {
      confidence: 0.5,
      cost: 0.5,
      risk: 0.5,
      goalAlignment: 0.5,
      compositeScore: 0.5,
    };
  }

  /**
   * Compute metrics from partial metrics
   */
  private computeMetrics(partial: Partial<HypothesisMetrics>): HypothesisMetrics {
    const defaults = this.initializeMetrics();
    return {
      confidence: partial.confidence ?? defaults.confidence,
      cost: partial.cost ?? defaults.cost,
      risk: partial.risk ?? defaults.risk,
      goalAlignment: partial.goalAlignment ?? defaults.goalAlignment,
      compositeScore: partial.compositeScore ?? defaults.compositeScore,
      crvResults: partial.crvResults,
    };
  }

  /**
   * Generate a unique ID
   */
  private generateId(): string {
    return `hyp-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }
}
