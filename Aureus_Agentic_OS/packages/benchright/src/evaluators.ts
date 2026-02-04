import { ExecutionTrace } from './types';
import {
  OutputQualityMetrics,
  ReasoningCoherenceMetrics,
  CostValueMetrics,
  HypothesisSwitchingMetrics,
  CounterfactualMetrics,
} from './types';
import { TelemetryEventType } from '@aureus/observability';

/**
 * Evaluates output quality of an execution trace
 */
export class OutputQualityEvaluator {
  evaluate(trace: ExecutionTrace): OutputQualityMetrics {
    const details: string[] = [];
    let completeness = 1.0;
    let correctness = 1.0;
    let consistency = 1.0;

    // Evaluate completeness: Did all tasks complete?
    const stepEndEvents = trace.events.filter((e) => e.type === TelemetryEventType.STEP_END);
    const successfulTasks = stepEndEvents.filter((e) => e.data.success).length;
    const totalTasks = stepEndEvents.length;

    if (totalTasks > 0) {
      completeness = successfulTasks / totalTasks;
      if (completeness < 1.0) {
        details.push(
          `Only ${successfulTasks}/${totalTasks} tasks completed successfully (${(completeness * 100).toFixed(1)}%)`
        );
      }
    } else {
      completeness = 0;
      details.push('No tasks completed');
    }

    // Evaluate correctness: Were CRV validations passed?
    const crvEvents = trace.events.filter((e) => e.type === TelemetryEventType.CRV_RESULT);
    const crvPassed = crvEvents.filter((e) => e.data.passed).length;
    const totalCrv = crvEvents.length;

    if (totalCrv > 0) {
      correctness = crvPassed / totalCrv;
      if (correctness < 1.0) {
        details.push(
          `${totalCrv - crvPassed}/${totalCrv} CRV validations failed (${((1 - correctness) * 100).toFixed(1)}% failure rate)`
        );
      }
    }

    // Evaluate consistency: Were there rollbacks or policy denials?
    const rollbacks = trace.events.filter((e) => e.type === TelemetryEventType.ROLLBACK).length;
    const policyDenials = trace.events.filter(
      (e) => e.type === TelemetryEventType.POLICY_CHECK && !e.data.allowed
    ).length;

    const inconsistencies = rollbacks + policyDenials;
    if (inconsistencies > 0) {
      consistency = Math.max(0, 1 - inconsistencies * 0.1);
      details.push(`${rollbacks} rollbacks and ${policyDenials} policy denials detected`);
    }

    // Calculate overall score (0-100)
    const score = (completeness * 0.4 + correctness * 0.4 + consistency * 0.2) * 100;

    return {
      completeness,
      correctness,
      consistency,
      score,
      details,
    };
  }
}

/**
 * Evaluates reasoning coherence of an execution trace
 */
export class ReasoningCoherenceEvaluator {
  evaluate(trace: ExecutionTrace): ReasoningCoherenceMetrics {
    const details: string[] = [];
    let logicalFlow = 1.0;
    let completeness = 1.0;
    let stepValidity = 1.0;
    let goalAlignment = 1.0;

    // Evaluate logical flow: Are steps in a sensible order?
    const stepStartEvents = trace.events.filter((e) => e.type === TelemetryEventType.STEP_START);
    const stepEndEvents = trace.events.filter((e) => e.type === TelemetryEventType.STEP_END);

    // Check for orphaned starts (started but never ended)
    const orphanedStarts = stepStartEvents.length - stepEndEvents.length;
    if (orphanedStarts > 0) {
      logicalFlow = Math.max(0, 1 - orphanedStarts * 0.15);
      details.push(`${orphanedStarts} tasks started but never completed`);
    }

    // Evaluate completeness: Are all necessary steps present?
    if (stepEndEvents.length === 0) {
      completeness = 0;
      details.push('No completed steps found');
    } else if (trace.status === 'failed') {
      completeness = 0.5;
      details.push('Workflow failed before completion');
    }

    // Evaluate step validity: Did steps succeed without excessive retries?
    const metadata = trace.metadata as Record<string, unknown>;
    const retries = (metadata?.retries as number) || 0;
    const totalSteps = stepStartEvents.length;

    if (totalSteps > 0) {
      const retryRate = retries / totalSteps;
      stepValidity = Math.max(0, 1 - retryRate);
      if (retryRate > 0.2) {
        details.push(`High retry rate: ${(retryRate * 100).toFixed(1)}% of steps required retries`);
      }
    }

    // Evaluate goal alignment: Were policy checks satisfied?
    const policyEvents = trace.events.filter((e) => e.type === TelemetryEventType.POLICY_CHECK);
    const policyAllowed = policyEvents.filter((e) => e.data.allowed).length;
    const totalPolicies = policyEvents.length;

    if (totalPolicies > 0) {
      goalAlignment = policyAllowed / totalPolicies;
      if (goalAlignment < 1.0) {
        details.push(
          `${totalPolicies - policyAllowed}/${totalPolicies} policy checks were denied`
        );
      }
    }

    // Calculate overall score (0-100)
    const score =
      (logicalFlow * 0.25 + completeness * 0.25 + stepValidity * 0.25 + goalAlignment * 0.25) * 100;

    return {
      logicalFlow,
      completeness,
      stepValidity,
      goalAlignment,
      score,
      details,
    };
  }
}

/**
 * Evaluates cost/value ratio of an execution trace
 */
export class CostValueEvaluator {
  evaluate(trace: ExecutionTrace): CostValueMetrics {
    const details: string[] = [];
    const metadata = trace.metadata as Record<string, unknown>;

    // Calculate costs
    const timeCost = trace.duration || 0;
    const apiCalls = trace.events.filter((e) => e.type === TelemetryEventType.TOOL_CALL).length;
    const retries = (metadata?.retries as number) || 0;
    const rollbacks = (metadata?.rollbacks as number) || 0;

    const totalCost = timeCost + apiCalls * 100 + retries * 500 + rollbacks * 1000;

    // Calculate value: successful outcomes
    const stepEndEvents = trace.events.filter((e) => e.type === TelemetryEventType.STEP_END);
    const successfulTasks = stepEndEvents.filter((e) => e.data.success).length;
    const totalValue = successfulTasks * 1000;

    // Calculate efficiency
    const efficiency = totalCost > 0 ? totalValue / totalCost : 0;

    // Calculate wasted effort
    const wastedEffort =
      stepEndEvents.length > 0
        ? (retries + rollbacks) / (stepEndEvents.length + retries + rollbacks)
        : 0;

    if (retries > 0) {
      details.push(`${retries} retries consumed additional resources`);
    }
    if (rollbacks > 0) {
      details.push(`${rollbacks} rollbacks wasted effort`);
    }
    if (apiCalls > successfulTasks * 3) {
      details.push(`High API call count (${apiCalls}) relative to successful tasks (${successfulTasks})`);
    }

    // Calculate score (0-100) based on efficiency and waste
    const efficiencyScore = Math.min(100, efficiency * 10);
    const wasteScore = (1 - wastedEffort) * 100;
    const score = efficiencyScore * 0.5 + wasteScore * 0.5;

    return {
      totalCost,
      totalValue,
      efficiency,
      wastedEffort,
      score,
      breakdown: {
        timeCost,
        apiCalls,
        retries,
        rollbacks,
      },
      details,
    };
  }
}

/**
 * Evaluates hypothesis switching effectiveness
 */
export class HypothesisSwitchingEvaluator {
  evaluate(trace: ExecutionTrace): HypothesisSwitchingMetrics {
    const details: string[] = [];

    // Detect hypothesis switches by looking for significant strategy changes
    // This is a simplified heuristic - could be enhanced with hypothesis-specific events
    const rollbacks = trace.events.filter((e) => e.type === TelemetryEventType.ROLLBACK);
    const crvFailures = trace.events.filter(
      (e) => e.type === TelemetryEventType.CRV_RESULT && !e.data.passed
    );

    const totalSwitches = rollbacks.length + crvFailures.filter((e) => e.data.blocked).length;

    // Determine productive vs unproductive switches
    // Productive: led to eventual success
    // Unproductive: didn't help
    const stepEndEvents = trace.events.filter((e) => e.type === TelemetryEventType.STEP_END);
    const finalSuccess = trace.status === 'completed';

    let productiveSwitches = 0;
    let unproductiveSwitches = 0;

    if (totalSwitches > 0) {
      if (finalSuccess) {
        // If workflow succeeded, most switches were productive
        productiveSwitches = Math.ceil(totalSwitches * 0.7);
        unproductiveSwitches = totalSwitches - productiveSwitches;
      } else {
        // If workflow failed, most switches were unproductive
        unproductiveSwitches = Math.ceil(totalSwitches * 0.7);
        productiveSwitches = totalSwitches - unproductiveSwitches;
      }
    }

    const switchEfficiency = totalSwitches > 0 ? productiveSwitches / totalSwitches : 1.0;

    // Calculate average time before switch
    let averageTimeBeforeSwitch = 0;
    if (rollbacks.length > 0) {
      const times: number[] = [];
      let lastTime = trace.startTime.getTime();
      for (const rollback of rollbacks) {
        times.push(rollback.timestamp.getTime() - lastTime);
        lastTime = rollback.timestamp.getTime();
      }
      averageTimeBeforeSwitch =
        times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : 0;
    }

    if (totalSwitches > 3) {
      details.push(`${totalSwitches} hypothesis switches detected`);
    }
    if (switchEfficiency < 0.5) {
      details.push(
        `Low switching efficiency: only ${productiveSwitches}/${totalSwitches} switches were productive`
      );
    }

    // Calculate score (0-100)
    const score = switchEfficiency * 100;

    return {
      totalSwitches,
      productiveSwitches,
      unproductiveSwitches,
      switchEfficiency,
      averageTimeBeforeSwitch,
      score,
      details,
    };
  }
}

/**
 * Evaluates counterfactual analysis - what if we did nothing?
 */
export class CounterfactualEvaluator {
  evaluate(trace: ExecutionTrace): CounterfactualMetrics {
    const details: string[] = [];

    // Determine actual outcome
    const actualOutcome = trace.status === 'completed' ? 'success' : 'failure';

    // Estimate "do nothing" outcome
    // If there were no CRV failures or policy checks, doing nothing might have been OK
    const crvFailures = trace.events.filter(
      (e) => e.type === TelemetryEventType.CRV_RESULT && !e.data.passed
    ).length;
    const policyChecks = trace.events.filter(
      (e) => e.type === TelemetryEventType.POLICY_CHECK
    ).length;
    const rollbacks = trace.events.filter((e) => e.type === TelemetryEventType.ROLLBACK).length;

    const doNothingOutcome =
      crvFailures === 0 && policyChecks === 0 && rollbacks === 0
        ? 'likely success'
        : 'likely failure';

    // Calculate intervention value
    const interventionValue =
      actualOutcome === 'success' && doNothingOutcome === 'likely failure' ? 1.0 : 0.5;

    // Determine necessary vs unnecessary actions
    const totalActions = trace.events.filter(
      (e) =>
        e.type === TelemetryEventType.STEP_START ||
        e.type === TelemetryEventType.TOOL_CALL
    ).length;
    const successfulSteps = trace.events.filter(
      (e) => e.type === TelemetryEventType.STEP_END && e.data.success
    ).length;

    const necessaryActions = successfulSteps;
    const unnecessaryActions = Math.max(0, totalActions - successfulSteps);

    const efficiency = totalActions > 0 ? necessaryActions / totalActions : 0;

    if (unnecessaryActions > necessaryActions) {
      details.push(
        `More unnecessary actions (${unnecessaryActions}) than necessary (${necessaryActions})`
      );
    }
    if (interventionValue < 0.7) {
      details.push('Low intervention value - the actions may not have been necessary');
    }

    // Calculate score (0-100)
    const score = (interventionValue * 0.5 + efficiency * 0.5) * 100;

    return {
      actualOutcome,
      doNothingOutcome,
      interventionValue,
      unnecessaryActions,
      necessaryActions,
      efficiency,
      score,
      details,
    };
  }
}
