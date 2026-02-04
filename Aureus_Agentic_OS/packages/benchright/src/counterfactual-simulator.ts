import { ExecutionTrace } from './types';
import { TelemetryEventType } from '@aureus/observability';

/**
 * Counterfactual simulation result
 */
export interface CounterfactualSimulation {
  traceId: string;
  actualOutcome: SimulationOutcome;
  doNothingOutcome: SimulationOutcome;
  interventionValue: number; // 0-1: Value added by taking action
  wastedActions: string[]; // List of actions that didn't add value
  necessaryActions: string[]; // List of actions that added value
}

/**
 * Simulation outcome
 */
export interface SimulationOutcome {
  status: 'success' | 'failure' | 'unknown';
  completedTasks: number;
  failedTasks: number;
  crvViolations: number;
  policyViolations: number;
  rollbacks: number;
  totalCost: number;
  details: string[];
}

/**
 * Cost calculation constants
 */
const API_CALL_COST = 100; // Cost per API call
const RETRY_COST = 500; // Cost per retry attempt
const ROLLBACK_COST = 1000; // Cost per rollback operation

/**
 * CounterfactualSimulator runs "do-nothing" simulations to compare
 * against actual execution outcomes
 */
export class CounterfactualSimulator {
  /**
   * Simulate "do-nothing" scenario for a trace
   */
  simulate(trace: ExecutionTrace): CounterfactualSimulation {
    // Analyze actual outcome
    const actualOutcome = this.analyzeActualOutcome(trace);

    // Simulate do-nothing scenario
    const doNothingOutcome = this.simulateDoNothing(trace);

    // Calculate intervention value
    const interventionValue = this.calculateInterventionValue(actualOutcome, doNothingOutcome);

    // Identify wasted and necessary actions (pass intervention value to avoid recalculation)
    const { wastedActions, necessaryActions } = this.classifyActions(trace, actualOutcome, doNothingOutcome, interventionValue);

    return {
      traceId: trace.id,
      actualOutcome,
      doNothingOutcome,
      interventionValue,
      wastedActions,
      necessaryActions,
    };
  }

  /**
   * Analyze the actual outcome of a trace
   */
  private analyzeActualOutcome(trace: ExecutionTrace): SimulationOutcome {
    const details: string[] = [];

    // Count completed and failed tasks
    const stepEndEvents = trace.events.filter((e) => e.type === TelemetryEventType.STEP_END);
    const completedTasks = stepEndEvents.filter((e) => e.data.success).length;
    const failedTasks = stepEndEvents.filter((e) => !e.data.success).length;

    // Count CRV violations
    const crvViolations = trace.events.filter(
      (e) => e.type === TelemetryEventType.CRV_RESULT && !e.data.passed
    ).length;

    // Count policy violations
    const policyViolations = trace.events.filter(
      (e) => e.type === TelemetryEventType.POLICY_CHECK && !e.data.allowed
    ).length;

    // Count rollbacks
    const rollbacks = trace.events.filter((e) => e.type === TelemetryEventType.ROLLBACK).length;

    // Calculate total cost
    const totalCost = this.calculateCost(trace);

    // Determine status
    let status: SimulationOutcome['status'] = 'unknown';
    if (trace.status === 'completed') {
      status = 'success';
      details.push('Workflow completed successfully');
    } else if (trace.status === 'failed') {
      status = 'failure';
      details.push('Workflow failed');
    }

    if (crvViolations > 0) {
      details.push(`${crvViolations} CRV violations detected`);
    }
    if (policyViolations > 0) {
      details.push(`${policyViolations} policy violations detected`);
    }
    if (rollbacks > 0) {
      details.push(`${rollbacks} rollbacks performed`);
    }

    return {
      status,
      completedTasks,
      failedTasks,
      crvViolations,
      policyViolations,
      rollbacks,
      totalCost,
      details,
    };
  }

  /**
   * Simulate what would have happened if no actions were taken
   */
  private simulateDoNothing(trace: ExecutionTrace): SimulationOutcome {
    const details: string[] = [];

    // In a "do nothing" scenario:
    // - No tasks would be completed
    // - No failures would occur (because nothing was attempted)
    // - No CRV or policy checks would be triggered
    // - No rollbacks would be needed
    // - Cost would be minimal (just observation)

    const completedTasks = 0;
    const failedTasks = 0;
    const crvViolations = 0;
    const policyViolations = 0;
    const rollbacks = 0;
    const totalCost = 0;

    // Determine if doing nothing would have been acceptable
    // If there were no CRV failures, policy checks, or rollbacks in the actual run,
    // doing nothing might have been acceptable
    const actualCrvViolations = trace.events.filter(
      (e) => e.type === TelemetryEventType.CRV_RESULT && !e.data.passed
    ).length;
    const actualPolicyViolations = trace.events.filter(
      (e) => e.type === TelemetryEventType.POLICY_CHECK && !e.data.allowed
    ).length;
    const actualRollbacks = trace.events.filter((e) => e.type === TelemetryEventType.ROLLBACK).length;

    let status: SimulationOutcome['status'] = 'unknown';

    if (actualCrvViolations === 0 && actualPolicyViolations === 0 && actualRollbacks === 0) {
      // If the actual run had no violations, doing nothing might have been OK
      status = 'success';
      details.push('No action was strictly necessary - system was stable');
    } else {
      // If there were violations, action was necessary
      status = 'failure';
      details.push('Action was necessary to maintain system integrity');
    }

    // Check if there were any steps that were required
    const stepEndEvents = trace.events.filter((e) => e.type === TelemetryEventType.STEP_END);
    if (stepEndEvents.length > 0 && trace.status === 'completed') {
      details.push('Tasks were completed that would not have been done otherwise');
    }

    return {
      status,
      completedTasks,
      failedTasks,
      crvViolations,
      policyViolations,
      rollbacks,
      totalCost,
      details,
    };
  }

  /**
   * Calculate intervention value (0-1)
   * 1.0 = action was highly valuable
   * 0.0 = action was not valuable
   */
  private calculateInterventionValue(
    actualOutcome: SimulationOutcome,
    doNothingOutcome: SimulationOutcome
  ): number {
    // If actual outcome was successful and do-nothing would have failed, intervention was valuable
    if (actualOutcome.status === 'success' && doNothingOutcome.status === 'failure') {
      return 1.0;
    }

    // If actual outcome failed and do-nothing would have succeeded, intervention was harmful
    if (actualOutcome.status === 'failure' && doNothingOutcome.status === 'success') {
      return 0.0;
    }

    // If both succeeded, intervention value depends on tasks completed vs cost
    if (actualOutcome.status === 'success' && doNothingOutcome.status === 'success') {
      // Some value if tasks were completed, but reduced by violations and rollbacks
      const taskValue = actualOutcome.completedTasks > 0 ? 0.5 : 0.0;
      const violationPenalty = (actualOutcome.crvViolations + actualOutcome.policyViolations + actualOutcome.rollbacks) * 0.1;
      return Math.max(0, Math.min(1, taskValue - violationPenalty));
    }

    // Both failed - moderate value (didn't make things worse)
    return 0.5;
  }

  /**
   * Classify actions as wasted or necessary
   */
  private classifyActions(
    trace: ExecutionTrace,
    actualOutcome: SimulationOutcome,
    doNothingOutcome: SimulationOutcome,
    interventionValue: number
  ): { wastedActions: string[]; necessaryActions: string[] } {
    const wastedActions: string[] = [];
    const necessaryActions: string[] = [];

    // Analyze each step
    const stepEvents = trace.events.filter(
      (e) => e.type === TelemetryEventType.STEP_START || e.type === TelemetryEventType.STEP_END
    );

    // Group by task
    const taskMap = new Map<string, { start?: any; end?: any }>();
    for (const event of stepEvents) {
      const taskId = event.taskId || 'unknown';
      if (!taskMap.has(taskId)) {
        taskMap.set(taskId, {});
      }
      const task = taskMap.get(taskId)!;
      if (event.type === TelemetryEventType.STEP_START) {
        task.start = event;
      } else {
        task.end = event;
      }
    }

    // Classify each task
    for (const [taskId, task] of taskMap) {
      const taskName = task.start?.taskType || taskId;

      if (task.end && task.end.data.success) {
        // Task succeeded - was it necessary?
        if (actualOutcome.status === 'success' && doNothingOutcome.status === 'failure') {
          necessaryActions.push(taskName);
        } else {
          // Task succeeded but overall intervention had low value
          if (interventionValue > 0.6) {
            necessaryActions.push(taskName);
          } else {
            wastedActions.push(taskName);
          }
        }
      } else if (task.end && !task.end.data.success) {
        // Task failed - was a waste
        wastedActions.push(taskName);
      } else if (task.start && !task.end) {
        // Task started but never ended - was a waste
        wastedActions.push(taskName);
      }
    }

    // Add rollbacks as wasted actions
    const rollbacks = trace.events.filter((e) => e.type === TelemetryEventType.ROLLBACK);
    for (const rollback of rollbacks) {
      wastedActions.push(`rollback-${rollback.data.snapshotId}`);
    }

    return { wastedActions, necessaryActions };
  }

  /**
   * Calculate total cost of trace execution
   */
  private calculateCost(trace: ExecutionTrace): number {
    const timeCost = trace.duration || 0;
    const apiCalls = trace.events.filter((e) => e.type === TelemetryEventType.TOOL_CALL).length;
    const metadata = trace.metadata as Record<string, unknown>;
    const retries = (metadata?.retries as number) || 0;
    const rollbacks = (metadata?.rollbacks as number) || 0;

    return timeCost + apiCalls * API_CALL_COST + retries * RETRY_COST + rollbacks * ROLLBACK_COST;
  }
}
