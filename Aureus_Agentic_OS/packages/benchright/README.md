# Benchright

Benchmark evaluation package for Aureus Agentic OS that ingests execution traces and evaluates output quality, reasoning coherence, cost/value ratio, hypothesis switching effectiveness, and "do nothing" counterfactuals.

## Features

- **Execution Trace Ingestion**: Seamlessly ingest traces from observability telemetry
- **Multi-Dimensional Evaluation**:
  - **Output Quality**: Completeness, correctness, and consistency
  - **Reasoning Coherence**: Logical flow, step validity, and goal alignment
  - **Cost/Value Analysis**: Efficiency and wasted effort metrics
  - **Hypothesis Switching**: Effectiveness of strategy changes
  - **Counterfactual Analysis**: Value of interventions vs. doing nothing
- **Scored Reports**: Generate comprehensive reports with grades (A-F) and recommendations
- **Flexible Configuration**: Customize weights, thresholds, and enabled features
- **Multiple Export Formats**: JSON and Markdown reports
- **Integration Ready**: Works seamlessly with observability and audit logs

## Installation

```bash
npm install @aureus/benchright
```

## Quick Start

### Basic Usage

```typescript
import { TraceCollector, BenchmarkEvaluator } from '@aureus/benchright';
import { TelemetryCollector } from '@aureus/observability';

// Collect telemetry during workflow execution
const telemetry = new TelemetryCollector();

// ... execute workflows with telemetry ...

// Ingest traces
const traceCollector = new TraceCollector();
traceCollector.ingestFromTelemetry(telemetry);

// Evaluate traces
const evaluator = new BenchmarkEvaluator();
const traces = traceCollector.getCompletedTraces();
const report = evaluator.evaluateTraces(traces);

// View results
console.log(`Overall Average Score: ${report.aggregateMetrics.overallAverageScore.toFixed(1)}/100`);
console.log(`Pass Rate: ${(report.aggregateMetrics.passRate * 100).toFixed(1)}%`);

// Export report
const markdown = evaluator.exportReportMarkdown(report);
console.log(markdown);
```

### Custom Configuration

```typescript
import { BenchmarkEvaluator } from '@aureus/benchright';

const evaluator = new BenchmarkEvaluator({
  // Custom weights for each dimension (must sum to 1.0)
  weights: {
    outputQuality: 0.35,
    reasoningCoherence: 0.30,
    costValue: 0.20,
    hypothesisSwitching: 0.10,
    counterfactual: 0.05,
  },
  
  // Custom thresholds (0-100)
  thresholds: {
    minOutputQuality: 80,
    minReasoningCoherence: 75,
    minCostValue: 70,
    minHypothesisSwitching: 65,
    minCounterfactual: 60,
    minOverallScore: 75,
  },
  
  // Enable/disable specific evaluations
  enableCounterfactual: true,
  enableHypothesisSwitching: true,
});
```

## Evaluation Dimensions

### 1. Output Quality (0-100)

Measures the quality of workflow outputs:

- **Completeness** (0-1): Percentage of tasks that completed successfully
- **Correctness** (0-1): Percentage of CRV validations that passed
- **Consistency** (0-1): Absence of rollbacks and policy denials

**Default Weight**: 30%

**Default Threshold**: 70/100

### 2. Reasoning Coherence (0-100)

Evaluates the logical consistency of execution:

- **Logical Flow** (0-1): Steps executed in sensible order
- **Completeness** (0-1): All necessary steps present
- **Step Validity** (0-1): Steps succeeded without excessive retries
- **Goal Alignment** (0-1): Policy checks satisfied

**Default Weight**: 25%

**Default Threshold**: 70/100

### 3. Cost/Value (0-100)

Analyzes resource efficiency:

- **Total Cost**: Time + API calls + retries + rollbacks
- **Total Value**: Successful task completions
- **Efficiency**: Value per unit cost
- **Wasted Effort** (0-1): Percentage of unproductive work

**Default Weight**: 20%

**Default Threshold**: 60/100

### 4. Hypothesis Switching (0-100)

Evaluates effectiveness of strategy changes:

- **Total Switches**: Number of hypothesis changes detected
- **Productive Switches**: Switches that led to progress
- **Unproductive Switches**: Switches that didn't help
- **Switch Efficiency** (0-1): Ratio of productive switches

**Default Weight**: 15%

**Default Threshold**: 60/100

**Can be disabled**: Set `enableHypothesisSwitching: false`

### 5. Counterfactual Analysis (0-100)

Assesses value of taking action vs. doing nothing:

- **Actual Outcome**: What happened
- **Do Nothing Outcome**: What would have happened without intervention
- **Intervention Value** (0-1): Value added by taking action
- **Necessary vs. Unnecessary Actions**: Action efficiency

**Default Weight**: 10%

**Default Threshold**: 50/100

**Can be disabled**: Set `enableCounterfactual: false`

## API Reference

### TraceCollector

Ingests and manages execution traces.

```typescript
class TraceCollector {
  // Ingest traces from telemetry collector
  ingestFromTelemetry(telemetry: TelemetryCollector): void;
  
  // Manually ingest a trace
  ingestTrace(trace: ExecutionTrace): void;
  
  // Get all traces
  getTraces(): ExecutionTrace[];
  
  // Get trace by ID
  getTrace(id: string): ExecutionTrace | undefined;
  
  // Get traces in time range
  getTracesInTimeRange(startTime: Date, endTime: Date): ExecutionTrace[];
  
  // Get completed traces only
  getCompletedTraces(): ExecutionTrace[];
  
  // Clear all traces
  clear(): void;
}
```

### BenchmarkEvaluator

Evaluates traces and generates reports.

```typescript
class BenchmarkEvaluator {
  constructor(config?: BenchmarkConfig);
  
  // Evaluate a single trace
  evaluateTrace(trace: ExecutionTrace): BenchmarkScore;
  
  // Evaluate multiple traces
  evaluateTraces(traces: ExecutionTrace[]): BenchmarkReport;
  
  // Export report as JSON
  exportReportJSON(report: BenchmarkReport): string;
  
  // Export report as Markdown
  exportReportMarkdown(report: BenchmarkReport): string;
}
```

### Types

```typescript
interface ExecutionTrace {
  id: string;
  workflowId: string;
  taskId?: string;
  startTime: Date;
  endTime?: Date;
  duration?: number;
  events: TelemetryEvent[];
  spans: Span[];
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  metadata?: Record<string, unknown>;
}

interface BenchmarkScore {
  traceId: string;
  timestamp: Date;
  outputQuality: OutputQualityMetrics;
  reasoningCoherence: ReasoningCoherenceMetrics;
  costValue: CostValueMetrics;
  hypothesisSwitching: HypothesisSwitchingMetrics;
  counterfactual: CounterfactualMetrics;
  overallScore: number; // 0-100
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  passed: boolean;
  recommendations: string[];
}

interface BenchmarkReport {
  metadata: {
    generatedAt: Date;
    version: string;
    timeRange: { start: Date; end: Date };
    totalTraces: number;
  };
  scores: BenchmarkScore[];
  aggregateMetrics: {
    averageOutputQuality: number;
    averageReasoningCoherence: number;
    averageCostValue: number;
    averageHypothesisSwitching: number;
    averageCounterfactual: number;
    overallAverageScore: number;
    passRate: number;
  };
  insights: string[];
  recommendations: string[];
}
```

## Integration Examples

### With Workflow Orchestrator

```typescript
import { WorkflowOrchestrator } from '@aureus/kernel';
import { TelemetryCollector } from '@aureus/observability';
import { TraceCollector, BenchmarkEvaluator } from '@aureus/benchright';

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
  telemetry  // Pass telemetry
);

// Execute workflows
await orchestrator.executeWorkflow(spec1);
await orchestrator.executeWorkflow(spec2);
await orchestrator.executeWorkflow(spec3);

// Evaluate
const traceCollector = new TraceCollector();
traceCollector.ingestFromTelemetry(telemetry);

const evaluator = new BenchmarkEvaluator();
const report = evaluator.evaluateTraces(traceCollector.getCompletedTraces());

// Save report
import * as fs from 'fs';
fs.writeFileSync('benchmark-report.md', evaluator.exportReportMarkdown(report));
fs.writeFileSync('benchmark-report.json', evaluator.exportReportJSON(report));
```

### Continuous Integration

```typescript
import { TraceCollector, BenchmarkEvaluator } from '@aureus/benchright';

// Run tests and collect telemetry
const telemetry = await runTestSuite();

// Evaluate
const traceCollector = new TraceCollector();
traceCollector.ingestFromTelemetry(telemetry);

const evaluator = new BenchmarkEvaluator({
  thresholds: {
    minOutputQuality: 85,
    minReasoningCoherence: 80,
    minCostValue: 75,
    minHypothesisSwitching: 70,
    minCounterfactual: 65,
    minOverallScore: 80,
  },
});

const report = evaluator.evaluateTraces(traceCollector.getCompletedTraces());

// Fail CI if benchmarks don't pass
if (report.aggregateMetrics.passRate < 0.9) {
  console.error('Benchmark pass rate below 90%!');
  console.error(evaluator.exportReportMarkdown(report));
  process.exit(1);
}

console.log('✅ All benchmarks passed!');
```

### Production Monitoring

```typescript
import { TraceCollector, BenchmarkEvaluator } from '@aureus/benchright';

// Periodic evaluation
setInterval(async () => {
  // Get recent telemetry
  const telemetry = await getTelemetryFromLast24Hours();
  
  // Evaluate
  const traceCollector = new TraceCollector();
  traceCollector.ingestFromTelemetry(telemetry);
  
  const evaluator = new BenchmarkEvaluator();
  const report = evaluator.evaluateTraces(traceCollector.getCompletedTraces());
  
  // Alert if metrics degrade
  if (report.aggregateMetrics.overallAverageScore < 70) {
    await alertOpsTeam('Benchmark scores degraded', report);
  }
  
  // Log metrics to monitoring system
  await logMetrics({
    outputQuality: report.aggregateMetrics.averageOutputQuality,
    reasoningCoherence: report.aggregateMetrics.averageReasoningCoherence,
    costValue: report.aggregateMetrics.averageCostValue,
    overallScore: report.aggregateMetrics.overallAverageScore,
    passRate: report.aggregateMetrics.passRate,
  });
}, 24 * 60 * 60 * 1000); // Every 24 hours
```

## Report Format

### Markdown Report Example

```markdown
# Benchright Evaluation Report

**Generated**: 2026-01-01T00:00:00.000Z
**Version**: 0.1.0
**Time Range**: 2026-01-01T00:00:00.000Z - 2026-01-01T01:00:00.000Z
**Total Traces**: 10

## Overall Performance

- **Average Output Quality**: 85.3/100
- **Average Reasoning Coherence**: 82.1/100
- **Average Cost/Value**: 78.5/100
- **Average Hypothesis Switching**: 75.0/100
- **Average Counterfactual**: 80.2/100
- **Overall Average Score**: 81.4/100
- **Pass Rate**: 80.0%

## Trace Scores

| Trace ID | Overall | Grade | Output Quality | Reasoning | Cost/Value | Hypothesis | Counterfactual | Status |
|----------|---------|-------|----------------|-----------|------------|------------|----------------|--------|
| trace-1... | 85.5 | B | 88.0 | 85.0 | 82.0 | 78.0 | 84.0 | ✅ Pass |
| trace-2... | 72.3 | C | 75.0 | 70.0 | 68.0 | 72.0 | 76.0 | ✅ Pass |

## Insights

- Grade distribution: A=2, B=4, C=3, D=1, F=0
- Cost/value ratio is suboptimal - consider optimizing resource usage

## Recommendations

- Review hypothesis switching strategy to minimize unproductive switches
- Implement retry backoff strategies and reduce unnecessary API calls
```

## Best Practices

1. **Regular Evaluation**: Run benchmarks regularly to catch regressions early
2. **Appropriate Thresholds**: Set thresholds based on your system's capabilities and requirements
3. **Custom Weights**: Adjust weights to reflect your priorities (e.g., prioritize cost/value in resource-constrained environments)
4. **Trend Analysis**: Track metrics over time to identify improvements or degradations
5. **Act on Recommendations**: Review and implement the recommendations from reports
6. **CI Integration**: Use benchright in CI/CD pipelines to maintain quality standards
7. **Production Monitoring**: Monitor production benchmarks to detect issues early

## Testing

Run tests:

```bash
npm test
```

Run tests in watch mode:

```bash
npm run test:watch
```

## License

MIT
