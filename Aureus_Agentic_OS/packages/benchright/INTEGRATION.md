# Benchright Integration Guide

This document describes how the `@aureus/benchright` package integrates with the Aureus Agentic OS ecosystem.

## Overview

Benchright is a benchmark evaluation package that ingests execution traces from the observability system and evaluates them across five key dimensions:

1. **Output Quality**: Completeness, correctness, and consistency
2. **Reasoning Coherence**: Logical flow and goal alignment
3. **Cost/Value**: Resource efficiency
4. **Hypothesis Switching**: Strategy change effectiveness
5. **Counterfactual Analysis**: Intervention value

## Integration Points

### 1. Observability Package (`@aureus/observability`)

**Dependency**: Direct dependency on `@aureus/observability`

**Integration**:
- Ingests `TelemetryEvent` objects collected during workflow execution
- Processes `Span` objects for distributed tracing
- Uses `TelemetryEventType` for event classification

**Key Classes Used**:
- `TelemetryCollector`: Source of execution traces
- `TelemetryEvent`: Individual events in the trace
- `Span`: Distributed tracing spans

**Usage Pattern**:
```typescript
import { TelemetryCollector } from '@aureus/observability';
import { TraceCollector, BenchmarkEvaluator } from '@aureus/benchright';

const telemetry = new TelemetryCollector();
// ... execute workflows with telemetry ...

const traceCollector = new TraceCollector();
traceCollector.ingestFromTelemetry(telemetry);
```

### 2. Kernel Package (`@aureus/kernel`)

**Dependency**: Listed as dependency but used primarily for type compatibility

**Integration**:
- Compatible with `WorkflowOrchestrator` telemetry output
- Evaluates traces from orchestrated workflows
- Supports all kernel event types (STEP_START, STEP_END, etc.)

**Usage Pattern**:
```typescript
import { WorkflowOrchestrator } from '@aureus/kernel';
import { TelemetryCollector } from '@aureus/observability';
import { TraceCollector, BenchmarkEvaluator } from '@aureus/benchright';

const telemetry = new TelemetryCollector();
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
  telemetry  // Pass telemetry to orchestrator
);

// Execute workflows...
await orchestrator.executeWorkflow(spec);

// Evaluate
const traceCollector = new TraceCollector();
traceCollector.ingestFromTelemetry(telemetry);
const evaluator = new BenchmarkEvaluator();
const report = evaluator.evaluateTraces(traceCollector.getCompletedTraces());
```

### 3. Evaluation Harness Package (`@aureus/evaluation-harness`)

**Relationship**: Complementary package with different focus

**Differences**:
- **Evaluation Harness**: Success criteria per task type, system-wide metrics
- **Benchright**: Detailed trace analysis, multi-dimensional scoring, counterfactual analysis

**Combined Usage**:
```typescript
import { EvaluationHarness } from '@aureus/evaluation-harness';
import { BenchmarkEvaluator } from '@aureus/benchright';

// Evaluation Harness: Did we meet success criteria?
const harness = new EvaluationHarness(telemetry);
const harnessResult = harness.evaluate();

// Benchright: How well did we perform across multiple dimensions?
const traceCollector = new TraceCollector();
traceCollector.ingestFromTelemetry(telemetry);
const evaluator = new BenchmarkEvaluator();
const benchmarkReport = evaluator.evaluateTraces(traceCollector.getCompletedTraces());
```

### 4. CRV Package (`@aureus/crv`)

**Integration**: Indirect via observability events

**How Benchright Uses CRV Data**:
- Monitors `CRV_RESULT` events for validation pass/fail
- Evaluates correctness based on CRV validation success rate
- Detects blocked commits for hypothesis switching analysis

**Event Types Used**:
- `TelemetryEventType.CRV_RESULT`: Validation gate results

### 5. Policy Package (`@aureus/policy`)

**Integration**: Indirect via observability events

**How Benchright Uses Policy Data**:
- Monitors `POLICY_CHECK` events for governance decisions
- Evaluates goal alignment based on policy approval rate
- Tracks human escalations for reasoning coherence metrics

**Event Types Used**:
- `TelemetryEventType.POLICY_CHECK`: Policy evaluation results

### 6. Hypothesis Package (`@aureus/hypothesis`)

**Integration**: Indirect via rollback and retry detection

**How Benchright Analyzes Hypothesis Switching**:
- Detects hypothesis switches via rollback events
- Analyzes switch effectiveness based on final outcomes
- Calculates productive vs. unproductive switch ratios

**Heuristics Used**:
- Rollback events indicate hypothesis changes
- CRV failures with blocking indicate strategy pivots
- Retry patterns suggest hypothesis exploration

### 7. Memory HipCortex Package (`@aureus/memory-hipcortex`)

**Integration**: Indirect via snapshot and rollback events

**How Benchright Uses Memory Data**:
- Monitors `SNAPSHOT_COMMIT` events for state checkpoints
- Tracks `ROLLBACK` events for consistency analysis
- Uses rollback frequency for cost/value calculations

**Event Types Used**:
- `TelemetryEventType.SNAPSHOT_COMMIT`: State snapshots
- `TelemetryEventType.ROLLBACK`: State rollbacks

## Data Flow

```
┌─────────────────┐
│  Workflow       │
│  Execution      │
└────────┬────────┘
         │
         ├─> TelemetryCollector (observability)
         │   ├─> STEP_START events
         │   ├─> STEP_END events
         │   ├─> TOOL_CALL events
         │   ├─> CRV_RESULT events
         │   ├─> POLICY_CHECK events
         │   ├─> SNAPSHOT_COMMIT events
         │   └─> ROLLBACK events
         │
         ├─> TraceCollector (benchright)
         │   └─> ExecutionTrace objects
         │
         ├─> BenchmarkEvaluator (benchright)
         │   ├─> OutputQualityEvaluator
         │   ├─> ReasoningCoherenceEvaluator
         │   ├─> CostValueEvaluator
         │   ├─> HypothesisSwitchingEvaluator
         │   └─> CounterfactualEvaluator
         │
         └─> BenchmarkReport
             ├─> JSON export
             └─> Markdown export
```

## Event Type Mapping

| Event Type | Used By | Purpose in Benchright |
|------------|---------|----------------------|
| STEP_START | TraceCollector | Detect workflow start, count attempts |
| STEP_END | All Evaluators | Success/failure detection, duration tracking |
| TOOL_CALL | CostValueEvaluator | API call counting, cost analysis |
| CRV_RESULT | OutputQualityEvaluator | Correctness validation |
| POLICY_CHECK | ReasoningCoherenceEvaluator | Goal alignment assessment |
| SNAPSHOT_COMMIT | OutputQualityEvaluator | Consistency tracking |
| ROLLBACK | Multiple | Hypothesis switching, cost/value, consistency |

## Metric Calculation Details

### Output Quality Score
- **Inputs**: STEP_END (success/failure), CRV_RESULT (passed/blocked), ROLLBACK count
- **Components**: Completeness (40%), Correctness (40%), Consistency (20%)
- **Range**: 0-100

### Reasoning Coherence Score
- **Inputs**: STEP_START/END correlation, retry patterns, POLICY_CHECK results
- **Components**: Logical Flow (25%), Completeness (25%), Step Validity (25%), Goal Alignment (25%)
- **Range**: 0-100

### Cost/Value Score
- **Inputs**: Duration, TOOL_CALL count, retries, ROLLBACK count, successful tasks
- **Components**: Efficiency (50%), Waste Reduction (50%)
- **Range**: 0-100

### Hypothesis Switching Score
- **Inputs**: ROLLBACK events, CRV_RESULT (blocked), final outcome
- **Components**: Switch Efficiency (100%)
- **Range**: 0-100

### Counterfactual Score
- **Inputs**: All event types, outcome comparison
- **Components**: Intervention Value (50%), Action Efficiency (50%)
- **Range**: 0-100

## Configuration Best Practices

### Default Configuration
Suitable for most use cases, balanced weights across all dimensions.

### Cost-Focused Configuration
```typescript
const evaluator = new BenchmarkEvaluator({
  weights: {
    outputQuality: 0.2,
    reasoningCoherence: 0.2,
    costValue: 0.4,
    hypothesisSwitching: 0.1,
    counterfactual: 0.1,
  },
});
```

### Quality-Focused Configuration
```typescript
const evaluator = new BenchmarkEvaluator({
  weights: {
    outputQuality: 0.5,
    reasoningCoherence: 0.3,
    costValue: 0.1,
    hypothesisSwitching: 0.05,
    counterfactual: 0.05,
  },
});
```

### Production Monitoring Configuration
```typescript
const evaluator = new BenchmarkEvaluator({
  thresholds: {
    minOutputQuality: 85,
    minReasoningCoherence: 80,
    minCostValue: 75,
    minHypothesisSwitching: 70,
    minCounterfactual: 65,
    minOverallScore: 80,
  },
  enableCounterfactual: true,
  enableHypothesisSwitching: true,
});
```

## Use Cases

### 1. CI/CD Pipeline
Fail builds if benchmark scores drop below thresholds.

### 2. A/B Testing
Compare benchmark scores between different implementations.

### 3. Performance Regression Detection
Track scores over time to detect degradations.

### 4. Production Monitoring
Continuous evaluation of production system health.

### 5. Post-Mortem Analysis
Detailed analysis of failed workflows.

### 6. Optimization Guidance
Use recommendations to identify improvement opportunities.

## Future Enhancements

Potential future integration points:

1. **World Model Integration**: Analyze causal reasoning quality
2. **Advanced Hypothesis Analysis**: Direct integration with hypothesis package
3. **Memory Provenance**: Leverage audit logs for deeper analysis
4. **Real-time Alerts**: Integration with monitoring systems
5. **ML-Based Scoring**: Train models on historical scores
6. **Comparative Analysis**: Compare across teams, projects, or time periods

## Conclusion

The `@aureus/benchright` package provides a comprehensive, multi-dimensional evaluation framework that integrates seamlessly with the Aureus Agentic OS ecosystem. It leverages existing observability infrastructure while providing unique insights into execution quality, reasoning effectiveness, and resource efficiency.

## Counterfactual Simulation

BenchRight includes a **CounterfactualSimulator** that performs actual "do-nothing" simulations to determine the value of interventions.

### How It Works

The simulator analyzes what would have happened if no actions were taken:

```typescript
import { CounterfactualSimulator } from '@aureus/benchright';

const simulator = new CounterfactualSimulator();
const simulation = simulator.simulate(trace);

console.log('Actual Outcome:', simulation.actualOutcome.status);
console.log('Do-Nothing Outcome:', simulation.doNothingOutcome.status);
console.log('Intervention Value:', (simulation.interventionValue * 100).toFixed(0) + '%');
console.log('Necessary Actions:', simulation.necessaryActions);
console.log('Wasted Actions:', simulation.wastedActions);
```

### Simulation Logic

1. **Actual Outcome Analysis**
   - Counts completed/failed tasks
   - Tracks CRV and policy violations
   - Calculates total cost

2. **Do-Nothing Simulation**
   - Assumes zero tasks completed
   - No violations triggered (nothing attempted)
   - Minimal observation cost only
   - Determines if inaction would have been acceptable

3. **Intervention Value Calculation**
   - 1.0 (100%): Action was highly valuable (prevented failure)
   - 0.5 (50%): Both outcomes similar
   - 0.0 (0%): Action was harmful or unnecessary

4. **Action Classification**
   - **Necessary**: Actions that contributed to success
   - **Wasted**: Failed tasks, excessive retries, rollbacks

### Example Scenarios

**High Value Intervention:**
```
Actual: success (3 tasks), CRV caught violation
Do-Nothing: failure (0 tasks)
Intervention Value: 100%
```

**Low Value Intervention:**
```
Actual: success (2 tasks), no violations
Do-Nothing: success (0 tasks, but system was stable)
Intervention Value: 40%
```

## Monitoring Dashboard Integration

BenchRight is integrated into the Aureus Console monitoring dashboard at `/monitoring`.

### Available Data

**Via API Endpoints:**

1. `/api/benchright/summary` - High-level metrics
   - Overall score, pass rate
   - Average reasoning coherence
   - Average cost/value
   - Average counterfactual score

2. `/api/benchright/report` - Full evaluation report
   - Individual trace scores
   - Detailed metrics per dimension
   - Counterfactual simulations
   - Insights and recommendations

3. `/api/benchright/workflow/:workflowId` - Per-workflow evaluation
   - Detailed score breakdown
   - All metric dimensions

4. `/api/benchright/counterfactual/:workflowId` - Counterfactual analysis
   - Actual vs do-nothing comparison
   - Action classification
   - Intervention value

### UI Display

The monitoring dashboard shows:

1. **Quality Metrics Panel**
   - Overall score with grade (A-F)
   - Pass rate percentage
   - Reasoning coherence score
   - Cost/value efficiency
   - Counterfactual action value

2. **Per-Trace Scores**
   - Visual grade badges (color-coded)
   - Breakdown by dimension
   - Counterfactual comparison table
   - Necessary vs wasted actions count

3. **Counterfactual Analysis**
   - Side-by-side outcome comparison
   - Visual intervention value indicator
   - Action efficiency metrics

### Usage Example

```javascript
// Fetch BenchRight summary
const response = await fetch('/api/benchright/summary?timeRange=3600000', {
  headers: { 'Authorization': `Bearer ${token}` }
});
const summary = await response.json();

console.log('Overall Score:', summary.overallAverageScore);
console.log('Reasoning:', summary.averageReasoningCoherence);
console.log('Cost/Value:', summary.averageCostValue);
```

## Complete Integration Example

Here's a complete example integrating BenchRight with workflow execution and monitoring:

```typescript
import { WorkflowOrchestrator } from '@aureus/kernel';
import { TelemetryCollector } from '@aureus/observability';
import { TraceCollector, BenchmarkEvaluator, CounterfactualSimulator } from '@aureus/benchright';

// Setup
const telemetry = new TelemetryCollector();
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
  telemetry
);

// Execute workflows
await orchestrator.executeWorkflow(spec1);
await orchestrator.executeWorkflow(spec2);

// Evaluate quality
const traceCollector = new TraceCollector();
traceCollector.ingestFromTelemetry(telemetry);

const evaluator = new BenchmarkEvaluator({
  enableCounterfactual: true,
  thresholds: { minOverallScore: 75 }
});

const report = evaluator.evaluateTraces(traceCollector.getCompletedTraces());

// Run counterfactual analysis
const simulator = new CounterfactualSimulator();
for (const trace of traceCollector.getCompletedTraces()) {
  const simulation = simulator.simulate(trace);
  console.log(`Trace ${trace.id}:`);
  console.log(`  Intervention Value: ${(simulation.interventionValue * 100).toFixed(0)}%`);
  console.log(`  Wasted: ${simulation.wastedActions.length}, Necessary: ${simulation.necessaryActions.length}`);
}

// Check quality gates
if (report.aggregateMetrics.passRate < 0.8) {
  throw new Error('Quality standards not met');
}

// Export for monitoring
await saveToMonitoring(report);
```

## Key Benefits

1. **User Story 1: Reasoning Coherence**
   - Reviewers can see reasoning coherence scores
   - Identifies logical flow issues
   - Highlights goal misalignment

2. **User Story 2: Cost/Value Tradeoffs**
   - Users see cost vs value breakdown
   - Identifies wasted effort
   - Optimizes resource usage

3. **User Story 3: Counterfactual Comparison**
   - Operators see "do-nothing" comparisons
   - Validates intervention necessity
   - Classifies necessary vs wasted actions
