import { TelemetryCollector, MetricsAggregator, TelemetryEvent, TelemetryEventType } from '@aureus/observability';
import { WorkflowState } from '@aureus/kernel';

/**
 * Task types for evaluation
 */
export enum TaskType {
  EXTRACTION = 'extraction',
  VALIDATION = 'validation',
  TRANSFORMATION = 'transformation',
  INTEGRATION = 'integration',
  DECISION = 'decision',
  ORCHESTRATION = 'orchestration',
}

/**
 * Success criteria definition for a task type
 */
export interface SuccessCriteria {
  taskType: TaskType | string;
  
  // Required success rate (0-1)
  minSuccessRate: number;
  
  // Maximum acceptable latency (milliseconds)
  maxLatencyMs?: number;
  
  // Maximum acceptable error rate (0-1)
  maxErrorRate?: number;
  
  // Maximum acceptable retry rate (0-1)
  maxRetryRate?: number;
  
  // Maximum acceptable human escalation rate (0-1)
  maxHumanEscalationRate?: number;
  
  // Custom validation function
  customValidator?: (results: TaskEvaluationResult) => boolean;
}

/**
 * Default success criteria per task type
 */
export const DEFAULT_SUCCESS_CRITERIA: Record<TaskType, SuccessCriteria> = {
  [TaskType.EXTRACTION]: {
    taskType: TaskType.EXTRACTION,
    minSuccessRate: 0.95,
    maxLatencyMs: 5000,
    maxErrorRate: 0.05,
    maxRetryRate: 0.2,
  },
  [TaskType.VALIDATION]: {
    taskType: TaskType.VALIDATION,
    minSuccessRate: 0.99,
    maxLatencyMs: 2000,
    maxErrorRate: 0.01,
    maxRetryRate: 0.1,
  },
  [TaskType.TRANSFORMATION]: {
    taskType: TaskType.TRANSFORMATION,
    minSuccessRate: 0.95,
    maxLatencyMs: 3000,
    maxErrorRate: 0.05,
    maxRetryRate: 0.15,
  },
  [TaskType.INTEGRATION]: {
    taskType: TaskType.INTEGRATION,
    minSuccessRate: 0.90,
    maxLatencyMs: 10000,
    maxErrorRate: 0.1,
    maxRetryRate: 0.3,
  },
  [TaskType.DECISION]: {
    taskType: TaskType.DECISION,
    minSuccessRate: 0.98,
    maxLatencyMs: 5000,
    maxErrorRate: 0.02,
    maxRetryRate: 0.1,
    maxHumanEscalationRate: 0.2,
  },
  [TaskType.ORCHESTRATION]: {
    taskType: TaskType.ORCHESTRATION,
    minSuccessRate: 0.95,
    maxLatencyMs: 30000,
    maxErrorRate: 0.05,
    maxRetryRate: 0.2,
  },
};

/**
 * Evaluation result for a task type
 */
export interface TaskEvaluationResult {
  taskType: string;
  totalTasks: number;
  successfulTasks: number;
  failedTasks: number;
  successRate: number;
  errorRate: number;
  retryRate: number;
  averageLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  humanEscalations: number;
  humanEscalationRate: number;
  crvValidationFailures: number;
  policyDenials: number;
  rollbacks: number;
}

/**
 * Overall evaluation result
 */
export interface EvaluationResult {
  timestamp: Date;
  totalWorkflows: number;
  successfulWorkflows: number;
  failedWorkflows: number;
  overallSuccessRate: number;
  taskResults: Record<string, TaskEvaluationResult>;
  criteriaResults: CriteriaEvaluationResult[];
  passed: boolean;
  summary: string;
}

/**
 * Criteria evaluation result
 */
export interface CriteriaEvaluationResult {
  taskType: string;
  criteria: SuccessCriteria;
  result: TaskEvaluationResult;
  passed: boolean;
  failures: string[];
}

/**
 * Evaluation report
 */
export interface EvaluationReport {
  metadata: {
    generatedAt: Date;
    version: string;
    timeRange: { start: Date; end: Date };
  };
  evaluation: EvaluationResult;
  recommendations: string[];
  details: {
    workflows: WorkflowSummary[];
    criticalFailures: FailureSummary[];
  };
}

/**
 * Workflow summary for reporting
 */
export interface WorkflowSummary {
  workflowId: string;
  status: string;
  duration: number;
  tasksCompleted: number;
  tasksFailed: number;
  humanInterventions: number;
  rollbacks: number;
}

/**
 * Failure summary for reporting
 */
export interface FailureSummary {
  workflowId: string;
  taskId: string;
  taskType: string;
  errorMessage: string;
  timestamp: Date;
  recoveryAction: string;
}

/**
 * Evaluation harness for assessing system performance against success criteria
 */
export class EvaluationHarness {
  private collector: TelemetryCollector;
  private aggregator: MetricsAggregator;
  private successCriteria: Map<string, SuccessCriteria>;

  constructor(collector: TelemetryCollector, customCriteria?: SuccessCriteria[]) {
    this.collector = collector;
    this.aggregator = new MetricsAggregator(collector);
    this.successCriteria = new Map();

    // Load default criteria
    for (const criteria of Object.values(DEFAULT_SUCCESS_CRITERIA)) {
      this.successCriteria.set(criteria.taskType, criteria);
    }

    // Override with custom criteria
    if (customCriteria) {
      for (const criteria of customCriteria) {
        this.successCriteria.set(criteria.taskType, criteria);
      }
    }
  }

  /**
   * Add or update success criteria for a task type
   */
  addSuccessCriteria(criteria: SuccessCriteria): void {
    this.successCriteria.set(criteria.taskType, criteria);
  }

  /**
   * Evaluate all tasks against success criteria
   */
  evaluate(): EvaluationResult {
    const events = this.collector.getEvents();
    const timestamp = new Date();

    // Collect task results by type
    const taskResults = this.collectTaskResults(events);

    // Evaluate against criteria
    const criteriaResults: CriteriaEvaluationResult[] = [];
    let allPassed = true;

    for (const [taskType, result] of Object.entries(taskResults)) {
      const criteria = this.successCriteria.get(taskType);
      if (criteria) {
        const criteriaResult = this.evaluateCriteria(criteria, result);
        criteriaResults.push(criteriaResult);
        if (!criteriaResult.passed) {
          allPassed = false;
        }
      }
    }

    // Calculate workflow-level metrics
    const workflowMetrics = this.calculateWorkflowMetrics(events);

    return {
      timestamp,
      totalWorkflows: workflowMetrics.total,
      successfulWorkflows: workflowMetrics.successful,
      failedWorkflows: workflowMetrics.failed,
      overallSuccessRate: workflowMetrics.successRate,
      taskResults,
      criteriaResults,
      passed: allPassed,
      summary: this.generateSummary(allPassed, criteriaResults),
    };
  }

  /**
   * Generate evaluation report
   */
  generateReport(timeRangeMs?: number): EvaluationReport {
    const now = new Date();
    const startTime = timeRangeMs ? new Date(now.getTime() - timeRangeMs) : new Date(0);
    const events = timeRangeMs
      ? this.collector.getEventsInTimeRange(startTime, now)
      : this.collector.getEvents();

    const evaluation = this.evaluate();
    const recommendations = this.generateRecommendations(evaluation);
    const workflows = this.summarizeWorkflows(events);
    const criticalFailures = this.collectCriticalFailures(events);

    return {
      metadata: {
        generatedAt: now,
        version: '0.1.0',
        timeRange: { start: startTime, end: now },
      },
      evaluation,
      recommendations,
      details: {
        workflows,
        criticalFailures,
      },
    };
  }

  /**
   * Export report as JSON string
   */
  exportReportJSON(report: EvaluationReport): string {
    return JSON.stringify(report, null, 2);
  }

  /**
   * Export report as markdown
   */
  exportReportMarkdown(report: EvaluationReport): string {
    const lines: string[] = [];

    lines.push('# Aureus Agentic OS - Evaluation Report');
    lines.push('');
    lines.push(`**Generated**: ${report.metadata.generatedAt.toISOString()}`);
    lines.push(`**Version**: ${report.metadata.version}`);
    lines.push(`**Time Range**: ${report.metadata.timeRange.start.toISOString()} - ${report.metadata.timeRange.end.toISOString()}`);
    lines.push('');

    // Overall status
    lines.push('## Overall Status');
    lines.push('');
    const status = report.evaluation.passed ? '✅ PASSED' : '❌ FAILED';
    lines.push(`**Status**: ${status}`);
    lines.push(`**Summary**: ${report.evaluation.summary}`);
    lines.push('');

    // Workflow metrics
    lines.push('## Workflow Metrics');
    lines.push('');
    lines.push(`- **Total Workflows**: ${report.evaluation.totalWorkflows}`);
    lines.push(`- **Successful**: ${report.evaluation.successfulWorkflows}`);
    lines.push(`- **Failed**: ${report.evaluation.failedWorkflows}`);
    lines.push(`- **Success Rate**: ${(report.evaluation.overallSuccessRate * 100).toFixed(2)}%`);
    lines.push('');

    // Task-level results
    lines.push('## Task-Level Results');
    lines.push('');
    lines.push('| Task Type | Total | Success Rate | Avg Latency | P95 Latency | Errors | Retries |');
    lines.push('|-----------|-------|--------------|-------------|-------------|--------|---------|');

    for (const [taskType, result] of Object.entries(report.evaluation.taskResults)) {
      lines.push(
        `| ${taskType} | ${result.totalTasks} | ${(result.successRate * 100).toFixed(1)}% | ${result.averageLatencyMs.toFixed(0)}ms | ${result.p95LatencyMs.toFixed(0)}ms | ${(result.errorRate * 100).toFixed(1)}% | ${(result.retryRate * 100).toFixed(1)}% |`
      );
    }
    lines.push('');

    // Criteria evaluation
    lines.push('## Success Criteria Evaluation');
    lines.push('');

    for (const criteriaResult of report.evaluation.criteriaResults) {
      const status = criteriaResult.passed ? '✅' : '❌';
      lines.push(`### ${status} ${criteriaResult.taskType}`);
      lines.push('');

      if (criteriaResult.passed) {
        lines.push('All criteria met.');
      } else {
        lines.push('**Failures:**');
        for (const failure of criteriaResult.failures) {
          lines.push(`- ${failure}`);
        }
      }
      lines.push('');
    }

    // Recommendations
    if (report.recommendations.length > 0) {
      lines.push('## Recommendations');
      lines.push('');
      for (const recommendation of report.recommendations) {
        lines.push(`- ${recommendation}`);
      }
      lines.push('');
    }

    // Critical failures
    if (report.details.criticalFailures.length > 0) {
      lines.push('## Critical Failures');
      lines.push('');
      lines.push('| Workflow | Task | Type | Error | Recovery |');
      lines.push('|----------|------|------|-------|----------|');

      for (const failure of report.details.criticalFailures) {
        lines.push(
          `| ${failure.workflowId} | ${failure.taskId} | ${failure.taskType} | ${failure.errorMessage} | ${failure.recoveryAction} |`
        );
      }
      lines.push('');
    }

    // Workflow details
    lines.push('## Workflow Details');
    lines.push('');
    lines.push('| Workflow ID | Status | Duration | Tasks | Failed | Interventions | Rollbacks |');
    lines.push('|-------------|--------|----------|-------|--------|---------------|-----------|');

    for (const workflow of report.details.workflows) {
      lines.push(
        `| ${workflow.workflowId} | ${workflow.status} | ${workflow.duration}ms | ${workflow.tasksCompleted} | ${workflow.tasksFailed} | ${workflow.humanInterventions} | ${workflow.rollbacks} |`
      );
    }
    lines.push('');

    return lines.join('\n');
  }

  /**
   * Collect task results from events
   */
  private collectTaskResults(events: TelemetryEvent[]): Record<string, TaskEvaluationResult> {
    const tasksByType = new Map<string, TelemetryEvent[]>();

    // Group events by task type
    for (const event of events) {
      if (event.taskType) {
        if (!tasksByType.has(event.taskType)) {
          tasksByType.set(event.taskType, []);
        }
        tasksByType.get(event.taskType)!.push(event);
      }
    }

    const results: Record<string, TaskEvaluationResult> = {};

    for (const [taskType, taskEvents] of tasksByType) {
      results[taskType] = this.analyzeTaskEvents(taskType, taskEvents, events);
    }

    return results;
  }

  /**
   * Analyze events for a specific task type
   */
  private analyzeTaskEvents(taskType: string, taskEvents: TelemetryEvent[], allEvents: TelemetryEvent[]): TaskEvaluationResult {
    const stepEndEvents = taskEvents.filter(e => e.type === TelemetryEventType.STEP_END);
    const stepStartEvents = taskEvents.filter(e => e.type === TelemetryEventType.STEP_START);

    const totalTasks = stepEndEvents.length;
    const successfulTasks = stepEndEvents.filter(e => e.data.success).length;
    const failedTasks = totalTasks - successfulTasks;

    // Calculate latencies
    const latencies: number[] = [];
    for (const endEvent of stepEndEvents) {
      if (endEvent.data.duration && typeof endEvent.data.duration === 'number') {
        latencies.push(endEvent.data.duration);
      }
    }

    latencies.sort((a, b) => a - b);
    const averageLatencyMs = latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;
    const p50LatencyMs = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.5)] : 0;
    const p95LatencyMs = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.95)] : 0;
    const p99LatencyMs = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.99)] : 0;

    // Count retries (start events > end events indicates retries)
    const retries = Math.max(0, stepStartEvents.length - stepEndEvents.length);
    const retryRate = totalTasks > 0 ? retries / totalTasks : 0;

    // Count human escalations from policy events
    const policyEvents = allEvents.filter(
      e => e.type === TelemetryEventType.POLICY_CHECK && e.taskType === taskType
    );
    const humanEscalations = policyEvents.filter(e => e.data.requiresHumanApproval).length;
    const humanEscalationRate = policyEvents.length > 0 ? humanEscalations / policyEvents.length : 0;

    // Count CRV failures
    const crvEvents = allEvents.filter(
      e => e.type === TelemetryEventType.CRV_RESULT && e.taskType === taskType
    );
    const crvValidationFailures = crvEvents.filter(e => !e.data.passed).length;

    // Count policy denials
    const policyDenials = policyEvents.filter(e => !e.data.allowed).length;

    // Count rollbacks
    const rollbacks = allEvents.filter(
      e => e.type === TelemetryEventType.ROLLBACK && e.taskType === taskType
    ).length;

    return {
      taskType,
      totalTasks,
      successfulTasks,
      failedTasks,
      successRate: totalTasks > 0 ? successfulTasks / totalTasks : 0,
      errorRate: totalTasks > 0 ? failedTasks / totalTasks : 0,
      retryRate,
      averageLatencyMs,
      p50LatencyMs,
      p95LatencyMs,
      p99LatencyMs,
      humanEscalations,
      humanEscalationRate,
      crvValidationFailures,
      policyDenials,
      rollbacks,
    };
  }

  /**
   * Evaluate criteria against results
   */
  private evaluateCriteria(criteria: SuccessCriteria, result: TaskEvaluationResult): CriteriaEvaluationResult {
    const failures: string[] = [];

    // Check success rate
    if (result.successRate < criteria.minSuccessRate) {
      failures.push(
        `Success rate ${(result.successRate * 100).toFixed(1)}% below minimum ${(criteria.minSuccessRate * 100).toFixed(1)}%`
      );
    }

    // Check latency
    if (criteria.maxLatencyMs !== undefined && result.averageLatencyMs > criteria.maxLatencyMs) {
      failures.push(
        `Average latency ${result.averageLatencyMs.toFixed(0)}ms exceeds maximum ${criteria.maxLatencyMs}ms`
      );
    }

    // Check error rate
    if (criteria.maxErrorRate !== undefined && result.errorRate > criteria.maxErrorRate) {
      failures.push(
        `Error rate ${(result.errorRate * 100).toFixed(1)}% exceeds maximum ${(criteria.maxErrorRate * 100).toFixed(1)}%`
      );
    }

    // Check retry rate
    if (criteria.maxRetryRate !== undefined && result.retryRate > criteria.maxRetryRate) {
      failures.push(
        `Retry rate ${(result.retryRate * 100).toFixed(1)}% exceeds maximum ${(criteria.maxRetryRate * 100).toFixed(1)}%`
      );
    }

    // Check human escalation rate
    if (criteria.maxHumanEscalationRate !== undefined && result.humanEscalationRate > criteria.maxHumanEscalationRate) {
      failures.push(
        `Human escalation rate ${(result.humanEscalationRate * 100).toFixed(1)}% exceeds maximum ${(criteria.maxHumanEscalationRate * 100).toFixed(1)}%`
      );
    }

    // Custom validator
    if (criteria.customValidator && !criteria.customValidator(result)) {
      failures.push('Custom validation failed');
    }

    return {
      taskType: criteria.taskType,
      criteria,
      result,
      passed: failures.length === 0,
      failures,
    };
  }

  /**
   * Calculate workflow-level metrics
   */
  private calculateWorkflowMetrics(events: TelemetryEvent[]): { total: number; successful: number; failed: number; successRate: number } {
    const workflowIds = new Set<string>();
    const workflowSuccess = new Map<string, boolean>();

    for (const event of events) {
      if (event.workflowId) {
        workflowIds.add(event.workflowId);

        if (event.type === TelemetryEventType.STEP_END) {
          const currentSuccess = workflowSuccess.get(event.workflowId) ?? true;
          workflowSuccess.set(event.workflowId, currentSuccess && (event.data.success as boolean));
        }
      }
    }

    const total = workflowIds.size;
    const successful = Array.from(workflowSuccess.values()).filter(s => s).length;
    const failed = total - successful;

    return {
      total,
      successful,
      failed,
      successRate: total > 0 ? successful / total : 0,
    };
  }

  /**
   * Generate summary text
   */
  private generateSummary(passed: boolean, criteriaResults: CriteriaEvaluationResult[]): string {
    if (passed) {
      return 'All success criteria met. System is performing within acceptable parameters.';
    }

    const failedCriteria = criteriaResults.filter(r => !r.passed);
    return `${failedCriteria.length} task type(s) failed to meet success criteria. Review required.`;
  }

  /**
   * Generate recommendations based on evaluation
   */
  private generateRecommendations(evaluation: EvaluationResult): string[] {
    const recommendations: string[] = [];

    for (const criteriaResult of evaluation.criteriaResults) {
      if (!criteriaResult.passed) {
        const result = criteriaResult.result;

        // Low success rate
        if (result.successRate < criteriaResult.criteria.minSuccessRate) {
          recommendations.push(
            `Improve ${result.taskType} task reliability. Current success rate ${(result.successRate * 100).toFixed(1)}% is below target.`
          );
        }

        // High latency
        if (criteriaResult.criteria.maxLatencyMs && result.averageLatencyMs > criteriaResult.criteria.maxLatencyMs) {
          recommendations.push(
            `Optimize ${result.taskType} task performance. Average latency of ${result.averageLatencyMs.toFixed(0)}ms exceeds target.`
          );
        }

        // High retry rate
        if (result.retryRate > 0.2) {
          recommendations.push(
            `Investigate ${result.taskType} task failures causing high retry rate (${(result.retryRate * 100).toFixed(1)}%).`
          );
        }

        // High human escalation
        if (result.humanEscalationRate > 0.3) {
          recommendations.push(
            `Review ${result.taskType} task automation. High human escalation rate (${(result.humanEscalationRate * 100).toFixed(1)}%) suggests need for improved autonomy.`
          );
        }

        // CRV failures
        if (result.crvValidationFailures > 0) {
          recommendations.push(
            `Review CRV validation logic for ${result.taskType}. ${result.crvValidationFailures} validation failure(s) detected.`
          );
        }
      }
    }

    // Overall recommendations
    if (evaluation.overallSuccessRate < 0.95) {
      recommendations.push('Overall workflow success rate is below 95%. Conduct comprehensive system review.');
    }

    return recommendations;
  }

  /**
   * Summarize workflows
   */
  private summarizeWorkflows(events: TelemetryEvent[]): WorkflowSummary[] {
    const workflowMap = new Map<string, WorkflowSummary>();

    for (const event of events) {
      if (!event.workflowId) continue;

      if (!workflowMap.has(event.workflowId)) {
        workflowMap.set(event.workflowId, {
          workflowId: event.workflowId,
          status: 'running',
          duration: 0,
          tasksCompleted: 0,
          tasksFailed: 0,
          humanInterventions: 0,
          rollbacks: 0,
        });
      }

      const summary = workflowMap.get(event.workflowId)!;

      if (event.type === TelemetryEventType.STEP_END) {
        if (event.data.success) {
          summary.tasksCompleted++;
          summary.status = 'completed';
        } else {
          summary.tasksFailed++;
          summary.status = 'failed';
        }

        if (event.data.duration && typeof event.data.duration === 'number') {
          summary.duration += event.data.duration;
        }
      }

      if (event.type === TelemetryEventType.POLICY_CHECK && event.data.requiresHumanApproval) {
        summary.humanInterventions++;
      }

      if (event.type === TelemetryEventType.ROLLBACK) {
        summary.rollbacks++;
      }
    }

    return Array.from(workflowMap.values());
  }

  /**
   * Collect critical failures
   */
  private collectCriticalFailures(events: TelemetryEvent[]): FailureSummary[] {
    const failures: FailureSummary[] = [];

    const stepEndEvents = events.filter(
      e => e.type === TelemetryEventType.STEP_END && !e.data.success
    );

    for (const event of stepEndEvents) {
      if (event.workflowId && event.taskId && event.taskType) {
        failures.push({
          workflowId: event.workflowId,
          taskId: event.taskId,
          taskType: event.taskType,
          errorMessage: (event.data.error as string) || 'Unknown error',
          timestamp: event.timestamp,
          recoveryAction: this.determineRecoveryAction(event),
        });
      }
    }

    return failures.slice(0, 10); // Return top 10 critical failures
  }

  /**
   * Determine recovery action based on event
   */
  private determineRecoveryAction(event: TelemetryEvent): string {
    const rollbackEvents = this.collector.getEvents().filter(
      (e: TelemetryEvent) =>
        e.type === TelemetryEventType.ROLLBACK &&
        e.workflowId === event.workflowId &&
        e.taskId === event.taskId
    );

    if (rollbackEvents.length > 0) {
      return 'Rollback executed';
    }

    // Check for retries
    const stepStartEvents = this.collector.getEvents().filter(
      (e: TelemetryEvent) =>
        e.type === TelemetryEventType.STEP_START &&
        e.workflowId === event.workflowId &&
        e.taskId === event.taskId &&
        e.timestamp > event.timestamp
    );

    if (stepStartEvents.length > 0) {
      return 'Retry attempted';
    }

    return 'No recovery';
  }
}

// Export simulation sandbox
export * from './simulation-sandbox';
