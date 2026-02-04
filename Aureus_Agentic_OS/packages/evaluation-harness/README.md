# Evaluation Harness

Evaluation framework for Aureus Agentic OS with success criteria per task type and comprehensive metrics collection.

## Features

- **Task-Type Success Criteria**: Define success thresholds per task type (extraction, validation, transformation, etc.)
- **Comprehensive Metrics**: Success rate, latency (P50/P95/P99), error rate, retry rate, human escalation rate
- **Automated Evaluation**: Evaluate system performance against defined criteria
- **Detailed Reports**: Generate JSON and Markdown reports with recommendations
- **Integration**: Seamless integration with existing observability infrastructure

## Installation

```bash
npm install @aureus/evaluation-harness
```

## Quick Start

### Basic Usage

```typescript
import { EvaluationHarness, TaskType } from '@aureus/evaluation-harness';
import { TelemetryCollector } from '@aureus/observability';

// Create telemetry collector and run workflows
const telemetry = new TelemetryCollector();

// ... execute workflows with telemetry ...

// Create evaluation harness
const harness = new EvaluationHarness(telemetry);

// Run evaluation
const result = harness.evaluate();

console.log(`Evaluation passed: ${result.passed}`);
console.log(`Overall success rate: ${(result.overallSuccessRate * 100).toFixed(2)}%`);
```

### Custom Success Criteria

```typescript
import { EvaluationHarness, SuccessCriteria } from '@aureus/evaluation-harness';

// Define custom criteria
const customCriteria: SuccessCriteria[] = [
  {
    taskType: 'extraction',
    minSuccessRate: 0.98,  // 98% minimum success rate
    maxLatencyMs: 3000,     // 3 second max latency
    maxErrorRate: 0.02,     // 2% max error rate
    maxRetryRate: 0.15,     // 15% max retry rate
  },
  {
    taskType: 'decision',
    minSuccessRate: 0.99,
    maxLatencyMs: 5000,
    maxHumanEscalationRate: 0.1,  // 10% max human escalation
  },
];

// Create harness with custom criteria
const harness = new EvaluationHarness(telemetry, customCriteria);

// Evaluate
const result = harness.evaluate();
```

### Generate Reports

```typescript
// Generate comprehensive report
const report = harness.generateReport();

// Export as JSON
const jsonReport = harness.exportReportJSON(report);
console.log(jsonReport);

// Export as Markdown
const mdReport = harness.exportReportMarkdown(report);
console.log(mdReport);
```

## Task Types

The evaluation harness supports the following task types with default success criteria:

### Extraction Tasks
- **Description**: Data extraction and retrieval operations
- **Default Criteria**:
  - Min Success Rate: 95%
  - Max Latency: 5000ms
  - Max Error Rate: 5%
  - Max Retry Rate: 20%

### Validation Tasks
- **Description**: Data validation and verification operations
- **Default Criteria**:
  - Min Success Rate: 99%
  - Max Latency: 2000ms
  - Max Error Rate: 1%
  - Max Retry Rate: 10%

### Transformation Tasks
- **Description**: Data transformation and processing operations
- **Default Criteria**:
  - Min Success Rate: 95%
  - Max Latency: 3000ms
  - Max Error Rate: 5%
  - Max Retry Rate: 15%

### Integration Tasks
- **Description**: External system integration operations
- **Default Criteria**:
  - Min Success Rate: 90%
  - Max Latency: 10000ms
  - Max Error Rate: 10%
  - Max Retry Rate: 30%

### Decision Tasks
- **Description**: Decision-making and routing operations
- **Default Criteria**:
  - Min Success Rate: 98%
  - Max Latency: 5000ms
  - Max Error Rate: 2%
  - Max Retry Rate: 10%
  - Max Human Escalation Rate: 20%

### Orchestration Tasks
- **Description**: Workflow coordination operations
- **Default Criteria**:
  - Min Success Rate: 95%
  - Max Latency: 30000ms
  - Max Error Rate: 5%
  - Max Retry Rate: 20%

## Success Criteria

### Success Criteria Interface

```typescript
interface SuccessCriteria {
  taskType: TaskType | string;
  minSuccessRate: number;           // Required: 0-1 (e.g., 0.95 = 95%)
  maxLatencyMs?: number;             // Optional: Maximum acceptable latency in ms
  maxErrorRate?: number;             // Optional: 0-1 (e.g., 0.05 = 5%)
  maxRetryRate?: number;             // Optional: 0-1 (e.g., 0.2 = 20%)
  maxHumanEscalationRate?: number;   // Optional: 0-1 (e.g., 0.1 = 10%)
  customValidator?: (results: TaskEvaluationResult) => boolean;
}
```

### Custom Validators

You can define custom validation logic:

```typescript
const criteria: SuccessCriteria = {
  taskType: 'custom-task',
  minSuccessRate: 0.95,
  customValidator: (result) => {
    // Custom validation logic
    // For example: require no rollbacks for this task type
    return result.rollbacks === 0;
  },
};

harness.addSuccessCriteria(criteria);
```

## Evaluation Results

### Task Evaluation Result

For each task type, the following metrics are collected:

```typescript
interface TaskEvaluationResult {
  taskType: string;
  totalTasks: number;
  successfulTasks: number;
  failedTasks: number;
  successRate: number;              // 0-1
  errorRate: number;                // 0-1
  retryRate: number;                // 0-1
  averageLatencyMs: number;
  p50LatencyMs: number;             // Median latency
  p95LatencyMs: number;             // 95th percentile latency
  p99LatencyMs: number;             // 99th percentile latency
  humanEscalations: number;
  humanEscalationRate: number;      // 0-1
  crvValidationFailures: number;
  policyDenials: number;
  rollbacks: number;
}
```

### Overall Evaluation Result

```typescript
interface EvaluationResult {
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
```

## Report Format

### JSON Report

The JSON report includes:
- Metadata (timestamp, version, time range)
- Evaluation results
- Recommendations
- Workflow details
- Critical failures

### Markdown Report

The Markdown report includes:
- Overall status (PASSED/FAILED)
- Workflow metrics table
- Task-level results table
- Success criteria evaluation
- Recommendations list
- Critical failures table
- Workflow details table

Example:

```markdown
# Aureus Agentic OS - Evaluation Report

**Generated**: 2026-01-01T00:00:00.000Z
**Version**: 0.1.0
**Time Range**: 2026-01-01T00:00:00.000Z - 2026-01-01T01:00:00.000Z

## Overall Status

**Status**: ✅ PASSED
**Summary**: All success criteria met. System is performing within acceptable parameters.

## Workflow Metrics

- **Total Workflows**: 10
- **Successful**: 9
- **Failed**: 1
- **Success Rate**: 90.00%

## Task-Level Results

| Task Type | Total | Success Rate | Avg Latency | P95 Latency | Errors | Retries |
|-----------|-------|--------------|-------------|-------------|--------|---------|
| extraction | 25 | 96.0% | 2500ms | 4000ms | 4.0% | 12.0% |
| validation | 30 | 100.0% | 800ms | 1200ms | 0.0% | 0.0% |
```

## Integration with Orchestrator

```typescript
import { WorkflowOrchestrator } from '@aureus/kernel';
import { TelemetryCollector } from '@aureus/observability';
import { EvaluationHarness } from '@aureus/evaluation-harness';

// Create telemetry collector
const telemetry = new TelemetryCollector();

// Create orchestrator with telemetry
const orchestrator = new WorkflowOrchestrator(
  stateStore,
  executor,
  eventLog,
  compensationExecutor,
  worldStateStore,
  memoryAPI,
  crvGate,
  policyGuard,
  principal,
  telemetry  // Pass telemetry collector
);

// Execute workflows
await orchestrator.executeWorkflow(spec1);
await orchestrator.executeWorkflow(spec2);

// Evaluate
const harness = new EvaluationHarness(telemetry);
const result = harness.evaluate();

// Generate report
const report = harness.generateReport();
console.log(harness.exportReportMarkdown(report));
```

## Use Cases

### Continuous Integration

Use the evaluation harness in CI/CD pipelines to ensure quality:

```typescript
const harness = new EvaluationHarness(telemetry);
const result = harness.evaluate();

if (!result.passed) {
  console.error('Evaluation failed!');
  console.error(result.summary);
  process.exit(1);
}
```

### Performance Testing

Track performance over time:

```typescript
// Run load test
await runLoadTest();

// Evaluate with time range (last hour)
const report = harness.generateReport(60 * 60 * 1000);

// Save report
fs.writeFileSync('evaluation-report.md', harness.exportReportMarkdown(report));
```

### Production Monitoring

Monitor production system health:

```typescript
// Periodic evaluation (e.g., every hour)
setInterval(() => {
  const result = harness.evaluate();
  
  if (!result.passed) {
    // Alert on-call team
    alertTeam(result);
  }
  
  // Log metrics
  logMetrics(result);
}, 60 * 60 * 1000);
```

## API Reference

### EvaluationHarness

**Constructor**
- `constructor(collector: TelemetryCollector, customCriteria?: SuccessCriteria[])`

**Methods**
- `addSuccessCriteria(criteria: SuccessCriteria): void` - Add or update success criteria
- `evaluate(): EvaluationResult` - Evaluate all tasks against criteria
- `generateReport(timeRangeMs?: number): EvaluationReport` - Generate comprehensive report
- `exportReportJSON(report: EvaluationReport): string` - Export report as JSON
- `exportReportMarkdown(report: EvaluationReport): string` - Export report as Markdown

## Best Practices

1. **Define Realistic Criteria**: Set success criteria based on actual system capabilities and business requirements
2. **Monitor Trends**: Track evaluation results over time to identify degradation
3. **Adjust Criteria**: Update criteria as system improves or requirements change
4. **Act on Recommendations**: Review and implement recommendations from evaluation reports
5. **Integrate Early**: Use evaluation harness during development, not just in production

## License

MIT
