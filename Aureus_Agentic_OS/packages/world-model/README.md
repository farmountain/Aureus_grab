# World Model

State store + do-graph + constraints for causal reasoning and versioned state management.

## Features

### StateStore

Provides CRUD operations for structured facts/resources with versioning and conflict detection:

- **Versioning**: Each state entry maintains a complete version history (1, 2, 3, ...)
- **Optimistic Locking**: Version checks prevent concurrent modification conflicts
- **Snapshots**: Point-in-time state captures for before/after comparison
- **Diff Computation**: Calculate differences between state versions
- **Conflict Detection**: Automatic detection and recording of version conflicts

### Do-Graph

The Do-Graph tracks causal relationships between actions and their effects, enabling powerful causality queries:

- **Action Nodes**: Represent tool calls or steps in a workflow
- **Effect Nodes**: Represent state changes (diffs) resulting from actions
- **Causal Edges**: Track "causes" relationships (Action → Effect) and "enables" relationships (Effect → Action)
- **Append-Only Log**: All graph operations are logged with event ID references for auditability
- **Query APIs**:
  - `why(effect_id)`: Returns the complete causal chain that led to an effect
  - `whatIf(action_id)`: Estimates the impact if an action were removed

### Constraint System

A comprehensive constraint validation system supporting:

- **Hard Constraints**: Absolute rules that must never be violated (policy, permissions, data zones)
- **Soft Constraints**: Optimization preferences (cost, time, risk)
- **Multi-Objective Optimization**: Weighted scoring across multiple preferences
- **Constraint Categories**: Policy, data_zone, security, cost, time, risk, custom
- **Validation Engine**: Check constraints before executing actions

### Domain Constraint Packs

The domain constraints layer adds versioned, auditable constraint packs for regulated workflows:

- **Constraint Packs**: Versioned bundles of schemas + constraints + audit hooks
- **LLM-Assisted Evolution**: Prompt → draft → CRV validation → policy approval → deployment
- **Governance Workflow**: Approval records, deployment logs, and audit hooks
- **Example Packs**: MAS sandbox guardrails and Basel III audit tracing

See [DOMAIN_CONSTRAINTS.md](./DOMAIN_CONSTRAINTS.md) for implementation details, governance guidance, and sample workflows.

### Planning Hooks

Query APIs for action planning with constraint checking:

- **Available Actions Query**: Get all actions that satisfy constraints in current state
- **Action Scoring**: Rank actions by preference satisfaction
- **Recommended Actions**: Get the best action for current state
- **Blockage Explanation**: Understand why actions are not available
- **Filtering & Sorting**: By category, tags, score, cost, time, or risk

See [CONSTRAINTS_AND_PLANNING.md](./CONSTRAINTS_AND_PLANNING.md) for detailed documentation on the constraint system, planning engine, and how they enable Do-Attention.

### Usage

#### Constraints and Planning

```typescript
import { 
  ConstraintEngine, 
  PlanningEngine, 
  HardConstraint, 
  SoftConstraint 
} from '@aureus/world-model';

// Create constraint engine
const constraintEngine = new ConstraintEngine();

// Add hard constraint (must be satisfied)
const policyConstraint: HardConstraint = {
  id: 'admin-only',
  description: 'Only admins can delete',
  category: 'policy',
  severity: 'hard',
  predicate: (state, action) => {
    if (action !== 'delete-resource') return true;
    const users = Array.from(state.entities.values());
    return users.some(u => u.properties.role === 'admin');
  },
};

constraintEngine.addHardConstraint(policyConstraint);

// Add soft constraint (preference)
const costConstraint: SoftConstraint = {
  id: 'cost-optimization',
  description: 'Prefer lower cost actions',
  category: 'cost',
  severity: 'soft',
  score: (state, action, params) => {
    const cost = params?.cost as number || 0;
    return Math.max(0, 1 - cost / 1000);
  },
  weight: 2.0,
};

constraintEngine.addSoftConstraint(costConstraint);

// Create planning engine
const planner = new PlanningEngine(constraintEngine);

// Register actions
planner.registerAction({
  id: 'read-data',
  name: 'Read Data',
  description: 'Read from database',
  cost: 1,
  timeEstimate: 2,
  riskLevel: 0.1,
});

planner.registerAction({
  id: 'delete-resource',
  name: 'Delete Resource',
  description: 'Delete a resource',
  cost: 5,
  timeEstimate: 3,
  riskLevel: 0.8,
  preconditions: [
    (state) => {
      const users = Array.from(state.entities.values());
      return users.some(u => u.properties.role === 'admin');
    },
  ],
});

// Query available actions
const result = planner.getAvailableActions(currentState, {
  sortBy: 'score',
  minScore: 0.5,
});

console.log('Allowed actions:', result.allowed);
console.log('Recommended:', result.recommended?.action.name);

// Check specific action
const actionInfo = planner.isActionAvailable('delete-resource', currentState);
if (!actionInfo?.allowed) {
  const reasons = planner.explainActionBlockage('delete-resource', currentState);
  console.log('Blocked because:', reasons);
}
```

See [CONSTRAINTS_AND_PLANNING.md](./CONSTRAINTS_AND_PLANNING.md) for comprehensive examples and documentation.

#### StateStore

```typescript
import { InMemoryStateStore, ConflictError } from '@aureus/world-model';

const stateStore = new InMemoryStateStore();

// Create initial state
await stateStore.create('user:1', { name: 'Alice', age: 30 });

// Update with version check
await stateStore.update('user:1', { name: 'Alice', age: 31 }, 1);

// Concurrent update detection
try {
  await stateStore.update('user:1', { name: 'Bob' }, 1); // Wrong version!
} catch (error) {
  if (error instanceof ConflictError) {
    console.log(`Conflict: expected v${error.expectedVersion}, got v${error.actualVersion}`);
  }
}

// Take snapshots and compute diff
const before = await stateStore.snapshot();
await stateStore.update('user:1', { name: 'Alice Smith', age: 31 }, 2);
const after = await stateStore.snapshot();
const diffs = stateStore.diff(before, after);
console.log(diffs); // Shows update operation with before/after values
```

#### Do-Graph

```typescript
import { DoGraph } from '@aureus/world-model';

const graph = new DoGraph();

// Add an action node
const validateAction = graph.addAction({
  id: 'action-1',
  name: 'validate-email',
  toolCall: 'email.validate',
  inputs: { email: 'alice@example.com' },
  timestamp: new Date(),
}, 'event-1');

// Add an effect node
const validEffect = graph.addEffect({
  id: 'effect-1',
  description: 'Email validated successfully',
  stateDiff: {
    key: 'validation:email',
    before: null,
    after: { valid: true },
  },
  timestamp: new Date(),
}, 'event-2');

// Link action to effect (causation)
graph.linkActionToEffect('action-1', 'effect-1', 'event-3');

// Add subsequent action
const createUserAction = graph.addAction({
  id: 'action-2',
  name: 'create-user',
  toolCall: 'database.create',
  inputs: { email: 'alice@example.com', name: 'Alice' },
  timestamp: new Date(),
}, 'event-4');

// Link effect to action (enablement)
graph.linkEffectToAction('effect-1', 'action-2', 'event-5');

// Query: Why did this effect occur?
const whyResult = graph.why('effect-2');
console.log(whyResult.actions); // Shows all actions that led to effect-2
console.log(whyResult.path); // Shows the full causal path

// Query: What if we remove this action?
const whatIfResult = graph.whatIf('action-1');
console.log(whatIfResult.directEffects); // Effects directly caused by action-1
console.log(whatIfResult.impactedActions); // Actions that depend on those effects
console.log(whatIfResult.indirectEffects); // Downstream effects that would be impacted
```

### CLI Tool

The package includes a minimal CLI for querying causality:

```bash
# Query why an effect occurred
aureus why <effect_id> [--graph-file=path/to/graph.json]

# Example
aureus why effect-3 --graph-file=./my-graph.json
```

The CLI loads a serialized graph from JSON and displays the complete causal chain:

```
=== Causal Chain Analysis ===

Effect: effect-3
Description: Welcome email sent
State Diff: email:welcome:1
  Before: null
  After:  {"sent":true}

Caused by 3 action(s):

1. validate-email (action-1)
   Tool: email.validate
   Inputs: {"email":"alice@example.com"}

2. create-user (action-2)
   Tool: database.create
   Inputs: {"email":"alice@example.com","name":"Alice"}

3. send-welcome-email (action-3)
   Tool: email.send
   Inputs: {"to":"alice@example.com","template":"welcome"}

Full causal path:
  [Action] validate-email (action-1)
  → [Effect] Email validated successfully (effect-1)
  → [Action] create-user (action-2)
  → [Effect] User created in database (effect-2)
  → [Action] send-welcome-email (action-3)
  → [Effect] Welcome email sent (effect-3)
```

#### Graph JSON Format

The CLI expects a JSON file with the following structure:

```json
{
  "nodes": [
    {
      "id": "action-1",
      "type": "action",
      "name": "action-name",
      "toolCall": "tool.method",
      "inputs": {},
      "timestamp": "2024-01-01T00:00:00.000Z"
    },
    {
      "id": "effect-1",
      "type": "effect",
      "description": "Effect description",
      "stateDiff": {
        "key": "state:key",
        "before": null,
        "after": {}
      },
      "timestamp": "2024-01-01T00:00:01.000Z"
    }
  ],
  "edges": [
    {
      "id": "edge-1",
      "from": "action-1",
      "to": "effect-1",
      "type": "causes",
      "timestamp": "2024-01-01T00:00:01.000Z"
    }
  ],
  "log": []
}
```

See `do-graph-example.json` for a complete example.

### Integration with Kernel

The StateStore integrates with the kernel orchestrator to track state changes:

```typescript
import { WorkflowOrchestrator, InMemoryStateStore, InMemoryWorldStateStore } from '@aureus/kernel';

const worldStateStore = new InMemoryWorldStateStore();
const orchestrator = new WorkflowOrchestrator(
  stateStore,
  executor,
  eventLog,
  compensationExecutor,
  worldStateStore // Optional: enable state tracking
);
```

When enabled, the orchestrator will:
1. Take state snapshots before task execution
2. Compute state diffs after task execution
3. Log state changes to the event log
4. Record any conflicts detected

### Entity-Relationship Model

The world model also provides entity-relationship modeling with constraints:

```typescript
import { WorldModel, Entity, Constraint } from '@aureus/world-model';

const worldModel = new WorldModel({
  id: 'world-1',
  entities: new Map(),
  relationships: [],
  constraints: [],
  timestamp: new Date(),
});

// Add entities
worldModel.addEntity({
  id: 'user:1',
  type: 'User',
  properties: { name: 'Alice', role: 'admin' },
});

// Add constraints
worldModel.addConstraint({
  id: 'admin-required',
  type: 'invariant',
  predicate: (state) => {
    const users = Array.from(state.entities.values());
    return users.some(u => u.properties.role === 'admin');
  },
  description: 'At least one admin user must exist',
});

// Validate constraints
if (worldModel.validateConstraints()) {
  console.log('All constraints satisfied');
}
```

### Latent State Representation

The package includes a latent state representation system for learning compressed state representations and predicting future states based on causal patterns.

#### State Embeddings

State embeddings provide dense vector representations of state snapshots:

```typescript
import { 
  LatentStateStore, 
  SimpleEmbeddingModel 
} from '@aureus/world-model';

const latentStore = new LatentStateStore();
latentStore.setEmbeddingModel(new SimpleEmbeddingModel());

// Compute embedding for a state snapshot
await stateStore.create('user:1', { name: 'Alice', age: 30 });
const snapshot = await stateStore.snapshot();
const embedding = await latentStore.computeEmbedding(snapshot);

console.log(embedding.vector.length); // 128-dimensional vector

// Find similar states
const similar = latentStore.findSimilarStates(snapshot.id, 5, 0.7);
for (const result of similar) {
  console.log(`Snapshot ${result.snapshotId}: ${result.similarity} similarity`);
}
```

#### State Predictions

Predict future state changes based on causal graph patterns:

```typescript
import { CausalPredictionModel } from '@aureus/world-model';

latentStore.setPredictionModel(new CausalPredictionModel());

// Generate prediction
const prediction = await latentStore.predict(snapshot, doGraph, 1000);
console.log(`Confidence: ${prediction.confidence}`);
console.log(`Predicted ${prediction.predictedDiffs.length} changes`);

// Model learns from observed outcomes
await stateStore.update('user:1', { name: 'Alice', age: 31 }, 1);
const afterSnapshot = await stateStore.snapshot();
const actualDiffs = stateStore.diff(snapshot, afterSnapshot);
// Learning happens automatically via hooks
```

#### Predictive Update Hooks

Register hooks to monitor predictions and state changes:

```typescript
latentStore.registerHook({
  id: 'prediction-monitor',
  onPrediction: async (prediction) => {
    console.log(`New prediction: ${prediction.confidence} confidence`);
  },
  onAfterUpdate: async (before, after, diffs) => {
    console.log(`State changed: ${diffs.length} diffs`);
    // Embeddings are computed automatically here
  },
});
```

#### Integration with StateStore

Enable automatic predictive hooks by connecting stores:

```typescript
const stateStore = new InMemoryStateStore();
const latentStore = new LatentStateStore();

// Configure models
latentStore.setEmbeddingModel(new SimpleEmbeddingModel());
latentStore.setPredictionModel(new CausalPredictionModel());

// Connect stores for automatic hook invocation
stateStore.setLatentStateStore(latentStore);

// Now all updates trigger hooks automatically
await stateStore.create('user:1', { name: 'Alice', age: 30 });
await stateStore.update('user:1', { name: 'Alice', age: 31 }, 1);
// Hooks are called automatically
```

#### Custom Models

Implement custom embedding or prediction models:

```typescript
import { EmbeddingModel, PredictionModel } from '@aureus/world-model';

class CustomEmbeddingModel implements EmbeddingModel {
  metadata = { name: 'custom-model', dimensions: 256 };
  
  async embed(snapshot: StateSnapshot): Promise<StateEmbedding> {
    // Use neural network, transformer, or other ML model
    const vector = await myMLModel.encode(snapshot);
    return {
      id: `embedding-${snapshot.id}`,
      snapshotId: snapshot.id,
      vector,
      timestamp: new Date(),
    };
  }
  
  similarity(e1: StateEmbedding, e2: StateEmbedding): number {
    // Compute cosine similarity or other metric
    return computeSimilarity(e1.vector, e2.vector);
  }
}

latentStore.setEmbeddingModel(new CustomEmbeddingModel());
```



See [architecture.md](../../architecture.md) for complete API documentation and integration patterns.

## Testing

Run tests with:

```bash
npm test
```

Test coverage includes:
- CRUD operations with versioning
- Snapshot and diff computation
- Conflict detection scenarios
- Entity-relationship model
- Constraint validation
- Latent state embeddings
- State predictions and learning
- Predictive update hooks
