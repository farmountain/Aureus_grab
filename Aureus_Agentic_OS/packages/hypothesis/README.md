# @aureus/hypothesis

Hypothesis branching and evaluation for goal-driven agent reasoning with CRV validation integration.

## Overview

The hypothesis module enables AI agents to:
- Spawn multiple hypothesis branches for exploring different approaches to a goal
- Track and evaluate hypotheses in parallel
- Score hypotheses based on multiple criteria (confidence, cost, risk, goal alignment)
- Validate hypotheses using CRV (Circuit Reasoning Validation) gates before committing
- Merge successful hypotheses or discard failed ones
- Emit comprehensive telemetry and audit events

## Key Features

- **Parallel Hypothesis Exploration**: Spawn multiple hypothesis branches to explore different solution paths
- **CRV Integration**: Validate each hypothesis branch with CRV gates before committing actions
- **Scoring System**: Multi-criteria scoring (confidence, cost, risk, goal alignment) with configurable weights
- **Automatic Pruning**: Optionally discard low-scoring hypotheses automatically
- **State Snapshots**: Capture initial and result states for each hypothesis
- **Event Audit Trail**: Complete audit log of all hypothesis lifecycle events
- **Telemetry Integration**: Seamless integration with observability package

## Installation

```bash
npm install @aureus/hypothesis
```

## Usage

### Basic Example

```typescript
import { HypothesisManager, Goal } from '@aureus/hypothesis';
import { TelemetryCollector } from '@aureus/observability';
import { CRVGate, Validators } from '@aureus/crv';

// Create hypothesis manager
const manager = new HypothesisManager(
  {
    maxConcurrentHypotheses: 5,
    scoringCriteria: {
      confidenceWeight: 0.3,
      costWeight: 0.2,
      riskWeight: 0.3,
      goalAlignmentWeight: 0.2,
    },
    minAcceptableScore: 0.6,
    autoPrune: true,
    enableTelemetry: true,
  },
  new TelemetryCollector()
);

// Register a goal
const goal: Goal = {
  id: 'goal-1',
  description: 'Optimize database query performance',
  successCriteria: [
    {
      id: 'sc-1',
      description: 'Query response time < 100ms',
      validator: (state: any) => state.responseTime < 100,
      weight: 1.0,
    },
  ],
};
manager.registerGoal(goal);

// Register CRV gate for validation
const crvGate = new CRVGate({
  name: 'Performance Validation',
  validators: [
    Validators.notNull(),
    Validators.schema({ responseTime: 'number' }),
  ],
  blockOnFailure: true,
});
manager.registerCRVGate('performance', crvGate);

// Create hypotheses
const hypothesis1 = await manager.createHypothesis(
  'goal-1',
  'Add index on user_id column',
  [
    {
      id: 'action-1',
      type: 'sql',
      parameters: {
        query: 'CREATE INDEX idx_user_id ON users(user_id)',
      },
      crvGateName: 'performance',
    },
  ]
);

const hypothesis2 = await manager.createHypothesis(
  'goal-1',
  'Use materialized view',
  [
    {
      id: 'action-2',
      type: 'sql',
      parameters: {
        query: 'CREATE MATERIALIZED VIEW user_summary AS ...',
      },
      crvGateName: 'performance',
    },
  ]
);

// Evaluate hypotheses
await manager.evaluateHypothesis(hypothesis1.id, {
  executeActions: true,
  validateWithCRV: true,
});

await manager.evaluateHypothesis(hypothesis2.id, {
  executeActions: true,
  validateWithCRV: true,
});

// Get top hypotheses by score
const topHypotheses = manager.getTopHypotheses('goal-1', 3);
console.log('Top hypotheses:', topHypotheses);

// Merge the best hypothesis
if (topHypotheses.length > 0) {
  const mergeResult = await manager.mergeHypothesis(topHypotheses[0].id);
  console.log('Merge result:', mergeResult);
}

// Get audit trail
const events = manager.getEventLog();
console.log('Hypothesis events:', events);
```

### Integration with Orchestrator

The hypothesis module can be integrated with the kernel orchestrator to execute hypothesis actions as workflows:

```typescript
import { WorkflowOrchestrator } from '@aureus/kernel';
import { HypothesisManager } from '@aureus/hypothesis';

// Create orchestrator and hypothesis manager
const orchestrator = new WorkflowOrchestrator(/* ... */);
const manager = new HypothesisManager(/* ... */);

// Create a hypothesis with workflow-compatible actions
const hypothesis = await manager.createHypothesis(
  'goal-1',
  'Multi-step optimization',
  [
    {
      id: 'step-1',
      type: 'action',
      parameters: {
        workflowId: 'optimize-step-1',
      },
    },
    {
      id: 'step-2',
      type: 'action',
      parameters: {
        workflowId: 'optimize-step-2',
      },
    },
  ]
);

// Evaluate with orchestrator integration
await manager.evaluateHypothesis(hypothesis.id, {
  executeActions: true,
  validateWithCRV: true,
});
```

## API Reference

### HypothesisManager

Main class for managing hypothesis branches.

#### Constructor

```typescript
constructor(
  config: HypothesisManagerConfig,
  telemetry?: TelemetryCollector,
  worldStateStore?: WorldModelStateStore
)
```

#### Methods

- `registerGoal(goal: Goal): void` - Register a goal for hypothesis generation
- `getGoal(goalId: string): Goal | undefined` - Get a registered goal
- `registerCRVGate(name: string, gate: CRVGate): void` - Register a CRV gate for validation
- `createHypothesis(goalId, description, proposedActions, options?): Promise<Hypothesis>` - Create a new hypothesis branch
- `evaluateHypothesis(hypothesisId, options?): Promise<Hypothesis>` - Evaluate a hypothesis
- `scoreHypothesis(hypothesisId): Promise<number>` - Score a hypothesis
- `mergeHypothesis(hypothesisId): Promise<MergeResult>` - Merge a validated hypothesis
- `discardHypothesis(hypothesisId, reason?): Promise<void>` - Discard a hypothesis
- `getHypothesesByGoal(goalId): Hypothesis[]` - Get all hypotheses for a goal
- `getTopHypotheses(goalId, limit?): Hypothesis[]` - Get top-ranked hypotheses by score
- `getHypothesis(hypothesisId): Hypothesis | undefined` - Get a specific hypothesis
- `getEventLog(): HypothesisEvent[]` - Get all events
- `getEventsForHypothesis(hypothesisId): HypothesisEvent[]` - Get events for a specific hypothesis

## Types

### Hypothesis

Represents a hypothesis branch:

```typescript
interface Hypothesis {
  id: string;
  parentId?: string;
  goalId: string;
  description: string;
  status: HypothesisStatus;
  proposedActions: HypothesisAction[];
  metrics: HypothesisMetrics;
  initialState?: unknown;
  resultState?: unknown;
  createdAt: Date;
  updatedAt: Date;
  workflowId?: string;
  metadata?: Record<string, unknown>;
}
```

### HypothesisStatus

Possible states of a hypothesis:

- `PENDING` - Created but not yet evaluated
- `IN_PROGRESS` - Currently being evaluated
- `VALIDATED` - Passed CRV validation
- `REJECTED` - Failed CRV validation or scoring
- `MERGED` - Successfully merged into main branch
- `DISCARDED` - Explicitly discarded

### HypothesisMetrics

Evaluation metrics for a hypothesis:

```typescript
interface HypothesisMetrics {
  confidence: number;        // 0-1
  cost: number;              // 0-1, lower is better
  risk: number;              // 0-1, lower is better
  goalAlignment: number;     // 0-1, higher is better
  compositeScore: number;    // Weighted combination
  crvResults?: {
    passed: boolean;
    validationCount: number;
    failedValidations: string[];
  };
}
```

## Events

The hypothesis manager emits the following event types:

- `HYPOTHESIS_CREATED` - When a new hypothesis is created
- `HYPOTHESIS_EVALUATED` - When a hypothesis evaluation completes
- `HYPOTHESIS_VALIDATED` - When a hypothesis passes CRV validation
- `HYPOTHESIS_REJECTED` - When a hypothesis is rejected
- `HYPOTHESIS_MERGED` - When a hypothesis is merged
- `HYPOTHESIS_DISCARDED` - When a hypothesis is discarded
- `HYPOTHESIS_SCORED` - When a hypothesis is scored

All events are logged to the internal event log and optionally emitted to the telemetry collector.

## Best Practices

1. **Set Appropriate Scoring Weights**: Configure scoring criteria weights based on your use case priorities
2. **Use Auto-Pruning Wisely**: Enable auto-pruning to automatically discard low-scoring hypotheses, but set thresholds carefully
3. **Leverage CRV Validation**: Always enable CRV validation to ensure hypotheses meet safety and correctness criteria
4. **Monitor Event Logs**: Use the event log for debugging and understanding hypothesis evaluation patterns
5. **Limit Concurrent Hypotheses**: Set reasonable limits to avoid resource exhaustion
6. **Define Clear Success Criteria**: Well-defined success criteria lead to better hypothesis evaluation

## Integration with Other Packages

- **@aureus/kernel**: Execute hypothesis actions as workflows via WorkflowOrchestrator
- **@aureus/crv**: Validate hypotheses using CRV gates before committing
- **@aureus/observability**: Emit telemetry events for monitoring and debugging
- **@aureus/world-model**: Capture state snapshots before/after hypothesis execution

## License

MIT
