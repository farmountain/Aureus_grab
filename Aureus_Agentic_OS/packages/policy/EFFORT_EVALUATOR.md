# EffortEvaluator

The EffortEvaluator module provides cost/risk/value analysis for tool requests in the Aureus Agentic OS. It computes weighted scores based on world-model soft constraints and observability metrics to produce a decision score that determines whether a tool request should be approved, reviewed, or rejected.

## Overview

The EffortEvaluator is integrated into the tool authorization flow as the first step, before policy validation and CRV checks. This allows the system to make early decisions about tool requests based on their cost/risk/value profile, potentially rejecting unfavorable requests before they consume more resources.

## Architecture

```
Tool Authorization Flow:
0. EffortEvaluator (cost/risk/value analysis) ← NEW
1. Policy validation (Goal-Guard FSM)
2. CRV validation gates
3. Tool execution with idempotency and schema validation
```

## Scoring Model

The EffortEvaluator computes four weighted scores:

### Cost Score (25% weight)
- Based on world-model cost soft constraints
- Incorporates observability cost-per-success metrics
- Higher score = lower cost (better)

### Risk Score (35% weight)
- Based on action risk tier (LOW/MEDIUM/HIGH/CRITICAL)
- Incorporates world-model risk soft constraints
- Factors in human escalation rate from observability
- Higher score = lower risk (better)

### Value Score (25% weight)
- Based on action intent (read/write/execute/delete)
- Read operations: 0.6
- Write operations: 0.7
- Execute operations: 0.8
- Delete operations: 0.5
- Higher score = more valuable (better)

### Time Score (15% weight)
- Based on world-model time soft constraints
- Incorporates Mean Time To Recovery (MTTR) metrics
- Higher score = faster execution (better)

## Decision Thresholds

The weighted scores are combined into a decision score (0-1):

- **Approve** (≥ 0.6): Favorable cost/risk/value profile, execute immediately
- **Review** (0.3-0.6): Moderate profile, continue to policy validation
- **Reject** (< 0.3): Unfavorable profile, block execution

## Usage

### Basic Usage

```typescript
import { EffortEvaluator } from '@aureus/policy';

const evaluator = new EffortEvaluator();

const evaluation = await evaluator.evaluate({
  principal,
  action,
  toolName: 'readDatabase',
  params: { table: 'users' },
});

console.log('Decision:', evaluation.recommendation);
console.log('Score:', evaluation.decisionScore);
```

### With World Model Constraints

```typescript
import { EffortEvaluator } from '@aureus/policy';
import { ConstraintEngine, SoftConstraint } from '@aureus/world-model';

const constraintEngine = new ConstraintEngine();

// Add cost constraint
const costConstraint: SoftConstraint = {
  id: 'cost-1',
  description: 'Minimize database query cost',
  category: 'cost',
  severity: 'soft',
  weight: 1.0,
  score: (state, action, params) => {
    // Return 0-1 score (higher = lower cost)
    return action === 'Read Data' ? 0.9 : 0.5;
  },
};
constraintEngine.addSoftConstraint(costConstraint);

const evaluator = new EffortEvaluator();
evaluator.setConstraintEngine(constraintEngine);

const evaluation = await evaluator.evaluate({
  principal,
  action,
  toolName: 'readDatabase',
  params: { table: 'users' },
  worldState,
});
```

### With Observability Metrics

```typescript
import { EffortEvaluator } from '@aureus/policy';
import { TelemetryCollector, MetricsAggregator } from '@aureus/observability';

const telemetry = new TelemetryCollector();
const metricsAggregator = new MetricsAggregator(telemetry);

const evaluator = new EffortEvaluator();
evaluator.setMetricsAggregator(metricsAggregator);

const evaluation = await evaluator.evaluate({
  principal,
  action,
  toolName: 'readDatabase',
  params: { table: 'users' },
  workflowId: 'workflow-1',
  taskId: 'task-1',
});
```

### Custom Configuration

```typescript
import { EffortEvaluator, EffortEvaluatorConfig } from '@aureus/policy';

const config: EffortEvaluatorConfig = {
  costWeight: 0.3,      // 30% weight
  riskWeight: 0.4,      // 40% weight
  valueWeight: 0.2,     // 20% weight
  timeWeight: 0.1,      // 10% weight
  approvalThreshold: 0.7,  // Higher threshold
  rejectionThreshold: 0.4, // Higher rejection bar
};

const evaluator = new EffortEvaluator(config);
```

## Integration with IntegratedToolWrapper

The EffortEvaluator is automatically integrated when provided in the context:

```typescript
import { IntegratedToolWrapper } from '@aureus/tools';
import { EffortEvaluator } from '@aureus/policy';

const wrapper = new IntegratedToolWrapper(tool);

const result = await wrapper.execute(params, {
  taskId: 'task-1',
  stepId: 'step-1',
  workflowId: 'workflow-1',
  principal,
  action,
  policyGuard,
  effortEvaluator, // ← Add evaluator to context
  worldState,
});

// Check result
if (!result.success && result.metadata?.phase === 'effort-evaluation') {
  console.log('Blocked by effort evaluation:', result.error);
  console.log('Evaluation:', result.metadata.effortEvaluation);
}
```

## Evaluation Result

The evaluation returns a comprehensive result object:

```typescript
interface EffortEvaluation {
  decisionScore: number;      // Overall score (0-1)
  costScore: number;          // Individual cost score
  riskScore: number;          // Individual risk score
  valueScore: number;         // Individual value score
  timeScore: number;          // Individual time score
  breakdown: {
    worldModelScore?: number;      // Score from world model
    observabilityScore?: number;   // Score from metrics
    baseRiskScore?: number;        // Base risk from action tier
  };
  recommendation: 'approve' | 'review' | 'reject';
  reason: string;
  metadata?: Record<string, unknown>;
}
```

## Configuration Options

### Weights

Customize the importance of each factor:

```typescript
{
  costWeight: 0.25,    // Cost importance (default: 25%)
  riskWeight: 0.35,    // Risk importance (default: 35%)
  valueWeight: 0.25,   // Value importance (default: 25%)
  timeWeight: 0.15,    // Time importance (default: 15%)
}
```

### Thresholds

Customize approval/rejection thresholds:

```typescript
{
  approvalThreshold: 0.6,   // Approve if score ≥ 0.6
  rejectionThreshold: 0.3,  // Reject if score < 0.3
}
```

## Best Practices

1. **Define meaningful constraints**: Add world-model soft constraints that reflect your actual cost, risk, and time requirements.

2. **Collect telemetry**: Feed the system with observability data to improve decision quality over time.

3. **Adjust weights**: Tune the weights based on your priorities (e.g., higher risk weight for safety-critical systems).

4. **Monitor decisions**: Track approval/rejection rates and adjust thresholds as needed.

5. **Use with policy guard**: EffortEvaluator complements but doesn't replace policy validation. HIGH/CRITICAL risk actions still require human approval even if effort evaluation approves them.

## Testing

The module includes comprehensive tests:

```bash
npm test --workspace=@aureus/policy
```

Tests cover:
- Basic evaluation without constraints
- World model integration
- Observability metrics integration
- Custom configuration
- All risk tiers
- Combined scenarios

## Related Documentation

- [Policy Guide](../../docs/policy-guide.md)
- [World Model Constraints](../world-model/CONSTRAINTS_AND_PLANNING.md)
- [Observability](../observability/README.md)
- [Integrated Tool Wrapper](../tools/README.md)
