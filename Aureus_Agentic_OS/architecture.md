# Architecture

This document describes the architecture of Aureus Agentic OS.

## Overview

AUREUS (Agentic Unified Reliability & Execution Under Steering) Agentic OS is a production-grade operating system for AI agents that guarantees reliable execution through durable orchestration, verified reasoning (CRV), causal world models, and auditable memory with rollback.

## Components

### Packages

- **kernel**: Orchestration runtime (DAG/FSM, retries, idempotency, enhanced error handling)
- **hypothesis**: Hypothesis branching and evaluation for goal-driven reasoning with CRV validation
- **perception**: Input normalization, validation, and entity extraction pipeline with CRV enforcement
- **tools**: Tool adapters + safety wrappers
- **memory-hipcortex**: Temporal index, snapshots, audit log
- **world-model**: State store + do-graph + constraints
- **crv**: Circuit reasoning validation operators & gates
- **policy**: Goal-guard FSM + permission model + risk tiers
- **observability**: Telemetry, metrics, traces
- **evaluation-harness**: Success criteria evaluation and metrics reporting
- **sdk**: Developer SDK (TypeScript/Python optional)

### Applications

- **console**: Operator console (UI)
- **demo-scenarios**: Reproducible scenarios + fixtures

## Design Principles

- Controlled autonomy
- Safe execution in real systems
- Transparency and auditability
- Enterprise scale
- Security by design
- Operational excellence

## Security Architecture

For detailed security architecture, threat model, and security controls, see [Security Model & Threat Analysis](./docs/security_model.md).

Key security features:
- Multi-layered security controls (defense in depth)
- JWT-based authentication
- Role-based access control (RBAC)
- Policy-based authorization with risk tiers
- Encryption at rest and in transit
- Comprehensive audit logging
- Input validation and sanitization
- Threat modeling and mitigation strategies

## Implementation Details

### Kernel Orchestration

The kernel package implements a DAG-based workflow orchestrator with the following features:

- **Task Specification**: Uses `TaskSpec` interface to define tasks with type, inputs, retry configuration, timeouts, risk tiers, and compensation hooks
- **State Persistence**: All workflow and task states are persisted via `StateStore` interface
- **Event Log**: Append-only event log for all workflow transitions stored in `./var/run/<task_id>/events.log`
- **Idempotency**: Tasks can specify idempotency keys to prevent duplicate execution
- **Retry Logic**: Configurable retry attempts with exponential backoff and jitter
- **Timeout Support**: Tasks can specify timeout in milliseconds with timeout-specific error handling
- **Compensation Hooks**: Tasks can define compensation actions for failures and timeouts
- **Dependency Resolution**: Topological sort ensures tasks execute in correct order (DAG)
- **Multi-Agent Coordination**: Resource locking, deadlock/livelock detection, and mitigation strategies

Example workflow structure:
```typescript
const workflow: WorkflowSpec = {
  id: 'workflow-1',
  name: 'Example Workflow',
  tasks: [
    {
      id: 'task1',
      type: 'action',
      retry: { maxAttempts: 3, backoffMs: 1000, jitter: true },
      timeoutMs: 5000,
      riskTier: 'MEDIUM',
      compensation: { onFailure: 'cleanup-task1' }
    },
    { id: 'task2', type: 'action', idempotencyKey: 'key-1' },
  ],
  dependencies: new Map([['task2', ['task1']]]),
};
```

**CLI Command**: The kernel provides a CLI command `aureus run task.yaml` that:
- Loads a workflow specification from a YAML file
- Executes the workflow with full durability and retry guarantees
- Writes all events to `./var/run/<workflow_id>/events.log`

**Kernel Invariants**:
1. **DAG Execution Order**: Tasks always execute in topologically sorted order based on dependencies
2. **Event Durability**: All workflow transitions are persisted to append-only event log before proceeding
3. **Timeout Enforcement**: Tasks exceeding their timeout are terminated and marked as timed out
4. **Retry with Jitter**: Retry backoff includes random jitter (0.5x-1.5x) to prevent thundering herd
5. **Compensation Execution**: Compensation tasks execute on failure/timeout but don't block workflow failure

#### Multi-Agent Coordination

The kernel includes support for coordinating multiple agents that access shared resources, with built-in deadlock and livelock detection:

**Resource Coordination**:
- **Coordination Policies**: EXCLUSIVE (one agent at a time), SHARED (multiple readers, exclusive writer), ORDERED (priority-based), PRIORITY (higher priority agents get preference)
- **Lock Management**: Acquire/release locks with configurable timeouts and automatic expiration
- **Dependency Tracking**: Real-time wait-for graph maintenance for all agents and resources

**Deadlock Detection**:
- **Cycle Detection**: Uses depth-first search (DFS) on the wait-for dependency graph to detect circular dependencies
- **Runtime Detection**: Continuously monitors agent dependencies and identifies deadlock conditions
- **Timeout-Based**: Locks that exceed their timeout are automatically released to prevent permanent deadlock
- **Affected Resource Tracking**: Identifies all resources involved in a deadlock cycle

**Livelock Detection**:
- **State Pattern Analysis**: Tracks agent state transitions over a configurable window (default: last 10 states)
- **Repeated Pattern Detection**: Identifies cyclic behavior (e.g., A→B→A→B or A→B→C→A→B→C patterns)
- **Progress Monitoring**: Detects agents that are actively changing state but making no meaningful progress
- **Configurable Thresholds**: Tunable pattern repetition count (default: 3) and progress timeout (default: 60s)

**Mitigation Strategies**:
- **ABORT**: Terminates one or more agents to break deadlock/livelock
  - For deadlock: Selects victim agent holding most resources
  - For livelock: Aborts all affected agents
  - Releases locks and clears state history
- **REPLAN**: Triggers replanning for affected agents
  - For deadlock: Selects agent with fewest resources held
  - For livelock: Clears state history to allow fresh planning
  - Preserves system state and other agents
- **ESCALATE**: Notifies human operator for manual intervention
  - Provides context (type, details, affected agents, resources)
  - Suggests possible actions
  - Waits for human decision

**Event Logging**: All coordination events (lock acquired/released, deadlock/livelock detected, mitigation actions) are logged to the event log for audit and debugging.

Example usage:
```typescript
const coordinator = new MultiAgentCoordinator(30000, true);
const detector = new LivelockDetector(10, 3, 60000);
const mitigator = new CoordinationMitigator(coordinator, detector);

// Register policy
coordinator.registerPolicy({
  type: CoordinationPolicyType.EXCLUSIVE,
  resourceId: 'database',
  lockTimeout: 60000
});

// Acquire lock
const acquired = await coordinator.acquireLock('database', 'agent-1', 'wf-1', 'write');

// Detect and mitigate
const deadlock = coordinator.detectDeadlock();
if (deadlock.detected) {
  await mitigator.mitigateDeadlock(deadlock, MitigationStrategy.REPLAN);
}
```

See [Multi-Agent Coordination Guide](./packages/kernel/docs/multi-agent-coordination.md) for complete documentation.

### Policy Framework

The policy package implements a finite state machine for governance:

- **Risk Tiers**: LOW, MEDIUM, HIGH, CRITICAL
- **Permission Model**: Action-resource-based permissions
- **FSM States**: IDLE, EVALUATING, APPROVED, REJECTED, PENDING_HUMAN
- **Audit Trail**: All policy decisions are logged with full context

High and Critical risk actions require human approval, enforcing the governance invariant.

### Circuit Reasoning Validation (CRV)

The CRV package provides validation gates that can block commits:

- **Built-in Validators**: notNull, schema, monotonic, maxSize, custom
- **Gate Configuration**: Define validators, blocking behavior, and confidence thresholds
- **Gate Chains**: Compose multiple gates for complex validation pipelines
- **Blocking Semantics**: When a gate blocks, the commit is rejected and logged

Example gate:
```typescript
const gate = new CRVGate({
  name: 'Schema Validation',
  validators: [
    Validators.notNull(),
    Validators.schema({ id: 'string', value: 'number' }),
  ],
  blockOnFailure: true,
});
```

### Memory HipCortex

The memory-hipcortex package provides temporal state management with provenance tracking:

#### Core Components

**Original Features**:
- **Snapshots**: Point-in-time state captures with verification status
- **Temporal Index**: Efficient time-range queries
- **Audit Log**: Complete history of actions with state diffs
- **Rollback**: Restore to any snapshot, with preference for verified snapshots
- **Auditability**: All operations logged with actor, action, and timestamp

**New Provenance Features**:
- **TemporalIndexer**: Index memory entries by time, task_id, step_id, and tags
- **Enhanced AuditLog**: Append-only events with SHA-256 hashes and source event references
- **Memory API**: High-level API with provenance-tracked writes and flexible queries
- **Memory Entry Types**: episodic_note, artifact, snapshot
- **Mandatory Provenance**: All writes require task_id, step_id, and optional source_event_id

#### Memory with Provenance

All memory writes include provenance information:

```typescript
const provenance: Provenance = {
  task_id: 'workflow-123',
  step_id: 'step-5',
  source_event_id: 'event-456', // optional
  timestamp: new Date(),
};

// Write memory entry
memoryAPI.write(
  { message: 'User action detected' },
  provenance,
  { type: 'episodic_note', tags: ['user-action'] }
);
```

**Memory API Operations**:
- `write(content, provenance, options)`: Write entry with mandatory provenance
- `read(query)`: Query by task_id, step_id, tags, type, or time range
- `list_timeline(task_id)`: Get chronologically ordered entries for a task
- `getEpisodicNotes(task_id)`: Get all episodic notes for a task
- `getArtifacts(task_id)`: Get all artifacts for a task
- `getSnapshots(task_id)`: Get all snapshots for a task

**Audit Log Features**:
- Cryptographic hashes (SHA-256) for integrity verification
- Source event references for full traceability
- Query by task_id, step_id, actor, action, time range, or source event

**Integration with Kernel**:

The kernel orchestrator automatically tracks task lifecycle events when MemoryAPI is configured:

1. **Automatic Episodic Notes**:
   - Task start: Logged with task_id, step_id, attempt number
   - Task completion: Logged with duration and result
   - Tagged with `task_lifecycle`, `started`, `completed`
   - Include task metadata (type, risk tier)

2. **Manual Memory Writes**:
   ```typescript
   // Write episodic note
   orchestrator.writeEpisodicNote(workflowId, stepId, content, options);
   
   // Write artifact
   orchestrator.writeArtifact(workflowId, stepId, content, options);
   
   // Write snapshot
   orchestrator.writeSnapshot(workflowId, stepId, content, options);
   ```

3. **Timeline Retrieval**:
   ```typescript
   const timeline = orchestrator.getMemoryTimeline(workflowId);
   ```

**Memory Provenance Rules** (see `docs/memory-provenance-rules.md`):
1. Mandatory provenance with task_id and step_id
2. Immutability of entries
3. Cryptographic integrity with SHA-256
4. Source traceability via source_event_id
5. Chronological ordering in timelines
6. Type safety (episodic_note, artifact, snapshot)
7. Tag support for flexible categorization
8. Automatic audit trail for all writes

Verified snapshots (those that passed CRV validation) are tracked separately for safe rollback.

### World Model

The world-model package implements causal reasoning and versioned state management:

- **Entity-Relationship Model**: Entities with properties and relationships
- **Constraints**: Invariants, preconditions, and postconditions
- **Do-Graph**: Actions with preconditions and effects
- **Validation**: Check constraints before and after actions

#### StateStore Contract

The StateStore provides CRUD operations for structured facts/resources with versioning:

**Core Operations**:
- `create(key, value, metadata?)`: Create a new state entry (version 1)
- `read(key)`: Read the current version of a state entry
- `readVersion(key, version)`: Read a specific version of a state entry
- `update(key, value, expectedVersion, metadata?)`: Update with version check, throws `ConflictError` on mismatch
- `delete(key, expectedVersion)`: Delete with version check
- `keys()`: Get all keys in the store

**Versioning**:
- Each state entry maintains a complete version history
- Versions increment automatically on each update (1, 2, 3, ...)
- Version checks prevent concurrent modification conflicts
- Metadata can be attached to each version for audit trails

**State Snapshots**:
- `snapshot()`: Capture point-in-time state snapshot with unique ID
- Snapshots contain all current state entries and their versions
- Used for before/after comparison and rollback

**State Diffs**:
- `diff(beforeSnapshot, afterSnapshot)`: Compute differences between two snapshots
- Returns array of `StateDiff` objects with:
  - `key`: The state key that changed
  - `before`: Previous state entry (null if created)
  - `after`: New state entry (null if deleted)
  - `operation`: 'create', 'update', or 'delete'
  - `timestamp`: When the change occurred

**Conflict Detection**:
- `ConflictError`: Thrown when update/delete version doesn't match current version
- Contains: `key`, `expectedVersion`, `actualVersion`
- `recordConflict(taskId, conflict)`: Record conflicts for a task
- `getConflicts(taskId)`: Retrieve all conflicts for a task
- `clearConflicts(taskId)`: Clear conflicts after resolution

**Integration with Kernel**:

The kernel orchestrator integrates with StateStore to track state changes:

1. **Before Task Execution**: 
   - Takes a state snapshot via `snapshot()`
   - Logs `STATE_SNAPSHOT` event with snapshot ID

2. **After Task Execution**:
   - Takes another state snapshot
   - Computes diff via `diff(before, after)`
   - Logs `STATE_UPDATED` event with state differences
   - Records any conflicts detected during execution

3. **Event Log Structure**:
```typescript
// STATE_SNAPSHOT event
{
  type: 'STATE_SNAPSHOT',
  workflowId: 'workflow-1',
  taskId: 'task-1',
  metadata: { snapshotId: 'snapshot-1' }
}

// STATE_UPDATED event
{
  type: 'STATE_UPDATED',
  workflowId: 'workflow-1',
  taskId: 'task-1',
  metadata: {
    snapshotId: 'snapshot-2',
    stateDiff: [
      {
        key: 'user:1',
        before: { version: 1, value: { name: 'Alice' } },
        after: { version: 2, value: { name: 'Alice Smith' } },
        operation: 'update'
      }
    ],
    stateConflicts: [] // Array of conflicts if any
  }
}
```

**Conflict Resolution Strategy**:

When concurrent modifications are detected:

1. **Detection**: `ConflictError` thrown on version mismatch
2. **Recording**: Conflict recorded with task ID, key, and version info
3. **Handling**: Task fails and compensation logic executes
4. **Resolution**: Application layer decides retry strategy (reload latest version, merge, or abort)

**Usage Example**:
```typescript
const worldStateStore = new InMemoryStateStore();

// Create initial state
await worldStateStore.create('user:1', { name: 'Alice', age: 30 });

// Update with version check
await worldStateStore.update('user:1', { name: 'Alice', age: 31 }, 1);

// Attempt concurrent update fails
try {
  await worldStateStore.update('user:1', { name: 'Bob' }, 1); // Wrong version
} catch (error) {
  if (error instanceof ConflictError) {
    console.log(`Conflict: expected ${error.expectedVersion}, got ${error.actualVersion}`);
  }
}

// Take snapshots and compute diff
const before = await worldStateStore.snapshot();
await worldStateStore.update('user:1', { name: 'Alice Smith', age: 31 }, 2);
const after = await worldStateStore.snapshot();
const diffs = worldStateStore.diff(before, after);
console.log(diffs); // Shows update operation
```

#### Latent State Representation

The world-model package includes a latent state representation system for learning compressed representations of world state and predicting future states based on causal relationships.

**Core Concepts**:

1. **State Embeddings**: Dense vector representations of state snapshots that capture semantic relationships and enable efficient similarity comparisons
2. **State Predictions**: Forecasted future state changes based on actions and the causal model
3. **Predictive Update Hooks**: Callbacks invoked when state changes are predicted or observed, enabling online learning and model refinement

**Key Interfaces**:

```typescript
// State embedding - compressed vector representation
interface StateEmbedding {
  id: string;
  snapshotId: string;
  vector: number[];  // Dense embedding vector
  timestamp: Date;
  metadata?: {
    model?: string;
    dimensions?: number;
  };
}

// State prediction - forecasted future state
interface StatePrediction {
  id: string;
  sourceSnapshotId: string;
  predictedDiffs: StateDiff[];
  predictedActions: string[];  // Action IDs that led to prediction
  confidence: number;  // 0-1 confidence score
  horizonMs: number;  // Prediction horizon in milliseconds
  timestamp: Date;
}

// Predictive update hook - callback for state changes
interface PredictiveUpdateHook {
  id: string;
  onBeforeUpdate?: (snapshot: StateSnapshot, predictedDiffs: StateDiff[]) => Promise<void>;
  onAfterUpdate?: (before: StateSnapshot, after: StateSnapshot, diffs: StateDiff[]) => Promise<void>;
  onPrediction?: (prediction: StatePrediction) => Promise<void>;
}
```

**Models**:

- **EmbeddingModel**: Computes state embeddings and measures similarity between states
- **PredictionModel**: Forecasts future state changes and learns from observed outcomes

**LatentStateStore**:

The `LatentStateStore` manages embeddings, predictions, and hooks:

```typescript
import { 
  LatentStateStore, 
  SimpleEmbeddingModel, 
  CausalPredictionModel 
} from '@aureus/world-model';

// Create latent state store
const latentStore = new LatentStateStore();

// Configure models
latentStore.setEmbeddingModel(new SimpleEmbeddingModel());
latentStore.setPredictionModel(new CausalPredictionModel());

// Integrate with state store for automatic hook calls
stateStore.setLatentStateStore(latentStore);

// Register hooks for monitoring
latentStore.registerHook({
  id: 'prediction-logger',
  onPrediction: async (prediction) => {
    console.log(`Predicted ${prediction.predictedDiffs.length} changes with confidence ${prediction.confidence}`);
  },
  onAfterUpdate: async (before, after, diffs) => {
    console.log(`Observed ${diffs.length} state changes`);
  },
});

// Compute embeddings
await stateStore.create('user:1', { name: 'Alice', age: 30 });
const snapshot = await stateStore.snapshot();
const embedding = await latentStore.computeEmbedding(snapshot);

// Find similar states
const similar = latentStore.findSimilarStates(snapshot.id, topK: 5);
console.log(`Found ${similar.length} similar states`);

// Generate predictions
const prediction = await latentStore.predict(snapshot, doGraph, horizonMs: 1000);
console.log(`Confidence: ${prediction.confidence}`);
```

**Integration with DoGraph**:

The prediction model uses the DoGraph to analyze causal patterns:

1. **Pattern Recognition**: Identifies recurring action-effect sequences in the causal graph
2. **Confidence Learning**: Adjusts confidence scores based on prediction accuracy
3. **Causal Path Tracking**: Records which causal paths led to each prediction

**Predictive Update Flow**:

When integrated with StateStore:

1. **Before Update**: `onBeforeUpdate` hooks are called with predicted diffs
2. **State Update**: StateStore applies the update with version checking
3. **After Update**: 
   - New state embedding is computed automatically
   - Prediction model learns from observed outcome
   - `onAfterUpdate` hooks are called with actual diffs

**Use Cases**:

- **Anomaly Detection**: Identify states that differ significantly from expected patterns
- **Proactive Planning**: Predict likely future states to inform action selection
- **Performance Optimization**: Learn which actions lead to desired outcomes
- **Debugging**: Understand causal relationships between actions and effects
- **State Similarity Search**: Find historical states similar to current state

**Simple Models Provided**:

- `SimpleEmbeddingModel`: Hash-based embedding with cosine similarity
- `CausalPredictionModel`: Graph-based prediction using DoGraph patterns

These can be replaced with custom ML models (neural networks, transformers, etc.) by implementing the `EmbeddingModel` and `PredictionModel` interfaces.



The tools package provides safe execution wrappers:

- **Tool Specification**: Plugin contract with parameters and execution function
- **Safety Wrappers**: Timeout protection and parameter validation
- **Tool Registry**: Centralized registration and retrieval

### Hypothesis Branching

The hypothesis package enables goal-driven reasoning through parallel exploration of solution approaches:

**Core Features**:
- **Hypothesis Spawning**: Create multiple hypothesis branches for a goal, each representing a different approach
- **Parallel Evaluation**: Evaluate hypotheses concurrently with configurable limits
- **Multi-Criteria Scoring**: Score hypotheses based on confidence, cost, risk, and goal alignment
- **CRV Integration**: Validate each hypothesis branch with CRV gates before committing
- **State Snapshots**: Capture initial and result states for each hypothesis
- **Merge/Discard**: Merge validated hypotheses or discard rejected ones
- **Audit Trail**: Complete event log of all hypothesis lifecycle events

**Hypothesis Manager**:
```typescript
const hypothesisManager = new HypothesisManager({
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
});

// Register a goal
hypothesisManager.registerGoal({
  id: 'goal-1',
  description: 'Optimize query performance',
  successCriteria: [{
    id: 'sc-1',
    description: 'Response time < 100ms',
    validator: (state) => state.responseTime < 100,
    weight: 1.0,
  }],
});

// Register CRV gate for validation
hypothesisManager.registerCRVGate('perf-gate', crvGate);

// Create multiple hypothesis branches
const hyp1 = await hypothesisManager.createHypothesis(
  'goal-1',
  'Add database index',
  [{ id: 'action-1', type: 'sql', parameters: {...} }]
);

const hyp2 = await hypothesisManager.createHypothesis(
  'goal-1',
  'Use caching layer',
  [{ id: 'action-2', type: 'cache', parameters: {...} }]
);

// Evaluate with CRV validation
await hypothesisManager.evaluateHypothesis(hyp1.id, {
  executeActions: true,
  validateWithCRV: true,
  crvGateName: 'perf-gate',
});

await hypothesisManager.evaluateHypothesis(hyp2.id, {
  executeActions: true,
  validateWithCRV: true,
  crvGateName: 'perf-gate',
});

// Get top-scored hypotheses and merge the best one
const topHypotheses = hypothesisManager.getTopHypotheses('goal-1', 1);
if (topHypotheses.length > 0) {
  await hypothesisManager.mergeHypothesis(topHypotheses[0].id);
}
```

**Hypothesis States**:
- `PENDING`: Created but not yet evaluated
- `IN_PROGRESS`: Currently being evaluated
- `VALIDATED`: Passed CRV validation
- `REJECTED`: Failed CRV validation or scoring
- `MERGED`: Successfully merged into main branch
- `DISCARDED`: Explicitly discarded

**Integration with Orchestrator**:

The hypothesis manager integrates seamlessly with the kernel orchestrator:

1. **Initialization**: Pass hypothesis manager to WorkflowOrchestrator constructor
2. **Access**: Use `orchestrator.getHypothesisManager()` to access the manager
3. **CRV Validation**: Each hypothesis branch validated with CRV gates before committing
4. **State Management**: Hypothesis manager shares world state store with orchestrator
5. **Telemetry**: All hypothesis events emitted to telemetry collector

```typescript
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
  telemetry,
  faultInjector,
  hypothesisManager  // Hypothesis manager integration
);
```

**Use Cases**:
- Multi-strategy optimization (e.g., exploring different query optimization approaches)
- A/B testing of agent behaviors
- Risk mitigation through parallel planning
- Automated fallback strategy generation
- Exploration vs. exploitation in reinforcement learning scenarios

See [packages/hypothesis/README.md](./packages/hypothesis/README.md) for detailed API documentation.

### Perception Pipeline

The perception package provides a modular pipeline for processing raw inputs before they reach the world model:

**Architecture**:
```
Raw Input → Perception Adapter → Data Contract → Entity Extraction → Symbolic Store → Context Aggregation
                                       ↓                 ↓                                      ↓
                                    CRV Gate         CRV Gate                              CRV Gate
```

**Core Components**:

1. **Perception Adapter**: Normalizes raw inputs from different sources
   - TextAdapter: Text-based inputs (console, CLI, strings)
   - JsonAdapter: JSON data from APIs, webhooks
   - EventAdapter: Event streams, message queues
   - SensorAdapter: IoT sensors, robotics telemetry
   - CustomAdapter: User-defined adapters
   - AdapterRegistry: Manages and selects appropriate adapters

2. **Data Contract**: Validates normalized input and extracts intent
   - Schema validation with type checking
   - Intent extraction (query, command, observation, event, data)
   - Confidence scoring
   - CRV validator integration
   - SchemaRegistry: Manages data schemas with versioning

3. **Symbolic Store**: Stores extracted entities in structured format
   - InMemorySymbolicStore: Fast in-memory storage
   - StateStoreSymbolicStore: Persistent storage backed by world-model StateStore
   - Query capabilities: by type, source, relationships
   - Entity relationships tracking

4. **Hypothesis Context**: Aggregates entities for reasoning
   - Entity aggregation and relationship extraction
   - Relevance scoring and confidence calculation
   - Temporal pattern analysis (burst, rapid, steady, sparse)
   - Constraint validation
   - Context enrichment with metadata
   - GoalAwareContextAggregator: Goal-specific constraints and scoring

**Pipeline Features**:
- Pluggable input sources through adapter pattern
- CRV validation at each pipeline stage
- Schema-based validation with custom schemas
- Intent extraction with confidence scoring
- Entity extraction and storage
- Context aggregation for hypothesis reasoning
- Error handling with detailed error reporting
- Pipeline builder for easy configuration

**Integration Points**:
- **World Model**: Symbolic store can use StateStore backend for persistence
- **CRV**: Each pipeline stage validated with CRV gates
- **Hypothesis**: Context aggregation feeds hypothesis manager
- **Observability**: All pipeline events can be traced

**Example Usage**:
```typescript
const pipeline = new PerceptionPipelineBuilder('main-pipeline')
  .withAdapters(new TextAdapter(), new JsonAdapter(), new EventAdapter())
  .withContractValidator(new DefaultDataContractValidator())
  .withSymbolicStore(new InMemorySymbolicStore())
  .withContextAggregator(new DefaultContextAggregator())
  .withCRVValidation(crvGate, 'perception-gate')
  .build();

const result = await pipeline.process(rawInput);
// result.normalizedInput, .contract, .entities, .context
```

See [packages/perception/README.md](./packages/perception/README.md) for detailed API documentation.

### Observability

The observability package enables monitoring:

- **Metrics**: Time-series data with tags
- **Distributed Tracing**: Span-based tracing with parent-child relationships
- **Logging**: Structured logs with context
- **Telemetry Collection**: Unified interface for all observability data

## Data Flow

Standard workflow execution follows this sequence:

1. **Workflow Execution**: Orchestrator loads/creates workflow state
2. **State Snapshot**: World-model StateStore captures state before task execution
3. **Policy Check**: Goal-Guard evaluates action risk and permissions
4. **Task Execution**: Executor runs task with state mutations tracked
5. **State Diff Computation**: StateStore computes before/after differences
6. **Conflict Detection**: StateStore validates version consistency, records conflicts
7. **CRV Validation**: Gates validate commits before application
8. **Snapshot Creation**: HipCortex captures verified states
9. **Audit Logging**: All decisions, state changes, and conflicts logged to event log
10. **Rollback**: On failure, restore to last verified snapshot

**With Hypothesis Branching**:

For goal-driven reasoning with multiple solution approaches:

1. **Goal Registration**: Register goal with success criteria
2. **Hypothesis Creation**: Spawn multiple hypothesis branches (different approaches)
3. **State Capture**: Capture initial state snapshot for each hypothesis
4. **Parallel Evaluation**: Evaluate hypotheses concurrently (up to configured limit)
5. **Constraint Validation**: Check goal constraints for each hypothesis
6. **CRV Validation**: Validate hypothesis result state with CRV gates
7. **Scoring**: Compute multi-criteria score (confidence, cost, risk, goal alignment)
8. **Auto-Pruning**: Optionally discard low-scoring hypotheses
9. **Selection**: Choose top-scored validated hypotheses
10. **Merge**: Commit the best hypothesis to main branch
11. **Audit Trail**: All hypothesis events logged with timestamps and metadata

**With Perception Pipeline**:

For processing raw inputs into structured entities and contexts:

1. **Raw Input Reception**: Receive input from any source (text, JSON, events, sensors)
2. **Adapter Selection**: AdapterRegistry finds appropriate adapter for source
3. **Normalization**: Adapter converts raw input to normalized format
4. **CRV Validation**: Optional CRV gate validates normalized input
5. **Schema Validation**: Data contract validator checks schema compliance
6. **Intent Extraction**: Extract intent type and confidence from input
7. **Contract Creation**: Create validated data contract
8. **Entity Extraction**: Extract symbolic entities from validated contract
9. **Entity Storage**: Store entities in symbolic store (in-memory or StateStore-backed)
10. **Context Aggregation**: Aggregate entities into hypothesis context
11. **Context Enrichment**: Add metadata, confidence, temporal patterns
12. **Constraint Validation**: Validate context against default and goal-specific constraints
13. **CRV Validation**: Final CRV gate validates complete context
14. **Integration**: Context feeds into hypothesis manager or world model

### Agent Studio

The Agent Studio is a comprehensive platform for designing, validating, and deploying AI agents using a visual wizard interface and AI-assisted generation.

#### Architecture Components

**Agent Blueprint Schema** (`packages/kernel/src/agent-spec-schema.ts`):
- Defines structured agent specifications using Zod validation
- Includes goal, configuration, tools, policies, workflows, and constraints
- Supports risk profiling (LOW, MEDIUM, HIGH, CRITICAL)
- Validates agent configurations before deployment

**Agent Builder Service** (`apps/console/src/agent-builder.ts`):
- AI-assisted generation of agent blueprints from natural language goals
- Mock LLM integration (production-ready for OpenAI/Anthropic integration)
- Validation engine for policy compliance and configuration consistency
- Event logging for audit trails

**API Endpoints** (`apps/console/src/api-server.ts`):
- `POST /api/agents/generate` - AI-assisted agent blueprint generation
- `POST /api/agents/validate` - Schema + policy validation
- `POST /api/agents/simulate` - Dry-run execution in sandbox
- `POST /api/agents/deploy` - Register → Stage → Promote pipeline

**Web UI** (`apps/console/src/ui/agent-studio.html`):
- 5-step wizard: Goal → Tools → Policies → Review → Deploy
- Interactive tool and policy selection
- Real-time validation feedback
- Deployment status tracking

#### Agent Blueprint Structure

```typescript
interface AgentBlueprint {
  id: string;
  name: string;
  version: string;
  goal: string;
  riskProfile: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  
  config: {
    prompt: string;
    systemPrompt?: string;
    temperature: number;
    maxTokens?: number;
    model?: string;
  };
  
  tools: AgentToolConfig[];
  policies: AgentPolicyConfig[];
  workflows: AgentWorkflowRef[];
  
  constraints?: string[];
  maxExecutionTime?: number;
  maxRetries?: number;
  successCriteria?: string[];
}
```

#### Integration with Core Systems

**Kernel Integration**:
- Agent blueprints reference workflow specifications
- Agents execute workflows through the kernel orchestrator
- Event logging for all agent actions

**Policy Integration**:
- Agent risk profiles map to policy risk tiers
- Tool permissions validated through Goal-Guard FSM
- Policy rules enforced during agent execution

**CRV Integration**:
- Agent outputs validated through CRV gates
- Blueprint validation uses CRV validators
- Simulation results verified before deployment

**Memory Integration**:
- Agent actions logged to HipCortex for audit
- Snapshots created before risky operations
- Rollback support for failed agent executions

#### Deployment Pipeline

**Stage 1: Register**
- Validate agent blueprint schema
- Check policy compliance
- Store blueprint in registry

**Stage 2: Stage**
- Deploy to staging environment
- Run simulation tests
- Collect approval (if required)

**Stage 3: Promote**
- Promote to production (manual or automatic)
- Enable agent for execution
- Monitor initial performance

#### Risk-Based Configuration

Agents are configured based on their risk profile:

**CRITICAL Risk**:
- Temperature: 0.3 (very deterministic)
- Max execution time: 5 minutes
- Fail-fast policies enabled
- Human approval required for all high-risk actions

**HIGH Risk**:
- Temperature: 0.5
- Max execution time: 10 minutes
- Approval required for destructive operations

**MEDIUM Risk**:
- Temperature: 0.7 (default)
- Max execution time: 30 minutes
- Standard policies applied

**LOW Risk**:
- Temperature: 0.9 (more creative)
- Max execution time: 1 hour
- Relaxed policies for read-only operations

#### Example Usage

**Generate Agent via API**:
```typescript
const response = await fetch('/api/agents/generate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    goal: "Monitor system logs and alert on critical errors",
    riskProfile: "MEDIUM",
    preferredTools: ["http-client", "email-sender"],
    constraints: ["Read-only access", "Max 10 requests/minute"],
    policyRequirements: ["Rate limiting", "Timeout enforcement"]
  })
});

const { blueprint } = await response.json();
```

**Validate Agent**:
```typescript
const validation = await fetch('/api/agents/validate', {
  method: 'POST',
  body: JSON.stringify({ blueprint })
});

const { valid, issues } = await validation.json();
```

**Deploy Agent**:
```typescript
const deployment = await fetch('/api/agents/deploy', {
  method: 'POST',
  body: JSON.stringify({
    blueprint,
    environment: "staging",
    approvalRequired: true
  })
});

const { deploymentId, status } = await deployment.json();
```

### Snapshot and Rollback System

The snapshot/rollback system provides point-in-time state recovery with integrity guarantees and policy-controlled execution.

#### Snapshot Format

**Content-Addressed Snapshots with Merkle Tree Hashing:**

Snapshots use a Merkle-tree-like structure combining:
1. **World State**: Complete state entries from world-model StateStore
2. **Memory Pointers**: References to memory-hipcortex entries with content hashes
3. **Merkle Root**: SHA-256 hash tree root for integrity verification

```typescript
interface CombinedSnapshot {
  id: string;                       // Unique snapshot identifier
  timestamp: Date;                  // Creation timestamp
  taskId: string;                   // Associated task
  stepId: string;                   // Associated step
  contentHash: string;              // SHA-256 content-addressed hash
  worldStateSnapshot: StateSnapshot; // World state at this point
  memoryPointers: MemoryPointer[];  // References to memory entries
  merkleRoot: string;               // Merkle root of all content hashes
  verified?: boolean;               // Whether CRV validated this snapshot
  metadata?: Record<string, unknown>; // Additional metadata
}
```

**Memory Pointers** avoid storing full memory content in snapshots:
```typescript
interface MemoryPointer {
  entryId: string;        // Memory entry ID
  type: string;           // Entry type (episodic_note, artifact, snapshot)
  contentHash: string;    // SHA-256 hash of content for verification
  timestamp: Date;        // Creation timestamp
}
```

**Merkle Tree Construction:**
1. Compute SHA-256 hash of serialized world state
2. Compute SHA-256 hash of each memory entry content
3. Build Merkle tree from all hashes (bottom-up pairing)
4. Store Merkle root as `contentHash` for integrity verification

#### Snapshot Creation

Snapshots are created automatically:
- **After each task execution** in workflow orchestrator
- **On CRV validation pass** (marked as `verified: true`)
- **Before risky operations** for safe rollback points

Each snapshot is:
- **Content-addressed**: Merkle root provides tamper-evident integrity
- **Indexed by task/step**: Efficient lookup for rollback
- **Versioned**: Links to specific world state versions

#### Rollback Operations

**CLI Command:**
```bash
aureus rollback --task <workflow_id> --to <snapshot_id> [--user <name>]
```

**Rollback Process:**
1. **Retrieve snapshot** by ID and verify task ownership
2. **Verify integrity** using Merkle root (recompute and compare)
3. **Determine risk tier** (LOW, MEDIUM, HIGH, CRITICAL)
4. **Policy approval check** (if risk >= HIGH)
5. **Restore world state** by recreating/updating StateStore entries
6. **Restore memory pointers** by writing rollback marker
7. **Log rollback events** for audit trail

**Risk-Based Policy Control:**

| Risk Tier | Requires Approval | Determined By |
|-----------|------------------|---------------|
| LOW       | No               | Verified snapshots with minimal state |
| MEDIUM    | No               | Moderate state changes (< 10 memory pointers) |
| HIGH      | Yes              | Unverified snapshots or explicit metadata |
| CRITICAL  | Yes              | Explicit metadata or system-critical operations |

**Policy Approval Flow:**
- Rollbacks with `risk_tier >= HIGH` require policy evaluation via GoalGuardFSM
- Principal must have `action: 'rollback', resource: 'workflow'` permission
- HIGH/CRITICAL risk requires `type: 'human'` principal
- Denied rollbacks are logged but state remains unchanged

#### Rollback Guarantees

**Atomicity**: Rollback is all-or-nothing
- If any step fails, entire rollback is aborted
- State remains at pre-rollback condition on failure
- Rollback events logged even on failure

**Consistency**: Restored state matches snapshot exactly
- World state entries recreated with correct versions
- Deleted entries removed, created entries restored
- Memory pointers recorded for audit trail

**Integrity**: Snapshots are tamper-evident
- Merkle root verification before rollback
- Rollback fails if integrity check fails
- Content hashes prevent silent corruption

**Auditability**: All rollback operations logged
- `ROLLBACK_INITIATED` event with snapshot ID and reason
- `ROLLBACK_POLICY_DECISION` event with approval status
- `ROLLBACK_COMPLETED` or `ROLLBACK_FAILED` event with details

**Blast Radius Control**: Multiple layers limit impact

1. **Snapshot Scope**: Only restores specific task's state
   - Task-level isolation prevents cross-workflow contamination
   - Snapshot only affects entities touched by that task

2. **World State Boundaries**: Only keys in snapshot are modified
   - Other world state entries remain untouched
   - Prevents accidental deletion of unrelated data

3. **Memory Isolation**: Memory timeline preserved
   - Rollback creates new memory entry (rollback marker)
   - Original memory entries remain for audit
   - No memory deletion, only pointer restoration

4. **Policy Guards**: HIGH/CRITICAL risk requires approval
   - Prevents unauthorized rollbacks
   - Human-in-the-loop for critical operations
   - Permission model ensures least privilege

5. **Verification Preference**: System prefers verified snapshots
   - `rollbackToLastVerified()` chooses safest point
   - Verified = passed CRV validation gates
   - Reduces risk of restoring to invalid state

6. **Event Log Immutability**: All rollback attempts logged
   - Audit trail enables forensics
   - Cannot hide or undo rollback history
   - Supports compliance and debugging

**Example Blast Radius:**

If workflow A modifies entities `{user:1, order:5, payment:8}`:
- Rollback only affects those 3 entities
- Other entities `{user:2, order:6}` remain unchanged
- Other concurrent workflows are unaffected
- Memory timeline shows rollback as new event, not deletion

## Guarantees

The system enforces six non-negotiable invariants:

1. **Durability**: Workflows persist state and resume after failures
2. **Idempotency**: Retry logic prevents duplicate side effects
3. **Verification**: CRV gates block invalid commits
4. **Governance**: High-risk actions gated by Goal-Guard FSM
5. **Auditability**: Complete audit trail of actions and state changes
6. **Rollback**: Safe restoration to verified snapshots with integrity guarantees

These invariants are verified by integration tests that exercise all components together.

## Failure Modes & Mitigations

This section identifies potential failure scenarios (technical and product) and their architectural mitigations.

### Technical Failure Modes

#### 1. State Store Corruption or Loss

**Risk**: Database corruption, hardware failure, or network partition could lead to loss of workflow state, breaking the durability guarantee.

**Mitigations**:
- **Architecture**: Implement `StateStore` interface with pluggable backends (PostgreSQL, Redis, etc.) supporting transactions and write-ahead logging
- **Implementation**: Add state checksums and version vectors to detect corruption
- **Operations**: Regular automated backups with point-in-time recovery capability
- **Monitoring**: Alert on state store write failures or checksum mismatches via observability package
- **Recovery**: Fallback to HipCortex snapshots for state reconstruction when primary store fails

#### 2. CRV Gate Bypass or False Positives

**Risk**: Bugs in validation logic could allow invalid commits (bypass) or block valid ones (false positive), compromising system safety or availability.

**Mitigations**:
- **Architecture**: Implement gate versioning and A/B testing framework for validator changes
- **Implementation**: Add comprehensive validator test suites with property-based testing
- **Design**: Implement validator composition with majority voting for critical gates
- **Monitoring**: Track gate block rates and manual override patterns to detect anomalies
- **Recovery**: Provide emergency override mechanism with mandatory audit log entry and multi-party approval

#### 3. Circular Dependencies in DAG

**Risk**: Workflow specification errors could introduce circular dependencies, causing deadlock or infinite loops in task execution.

**Mitigations**:
- **Architecture**: Kernel performs topological sort during workflow validation before execution
- **Implementation**: Reject workflow specifications that fail cycle detection with clear error messages
- **Design**: Add static analysis tools in SDK to detect cycles at workflow definition time
- **Monitoring**: Set execution time limits per workflow with automatic timeout and rollback
- **Recovery**: Workflow validation errors logged to observability package for debugging

#### 4. Memory Leak in Long-Running Workflows

**Risk**: Unbounded growth of in-memory structures (audit logs, snapshots, traces) could exhaust memory in long-running agent workflows.

**Mitigations**:
- **Architecture**: Implement configurable retention policies in HipCortex with automatic archival
- **Implementation**: Add periodic garbage collection for old snapshots and audit entries
- **Design**: Stream audit logs to external storage (S3, blob storage) beyond retention window
- **Monitoring**: Track memory usage per workflow with alerts on growth rate anomalies
- **Operations**: Set memory limits per workflow with graceful degradation when approaching limits

#### 5. Cascading Failures Across Dependent Workflows

**Risk**: Failure in one workflow could trigger failures in dependent workflows, causing widespread system outages.

**Mitigations**:
- **Architecture**: Implement circuit breaker pattern in kernel orchestrator for inter-workflow calls
- **Implementation**: Add workflow-level timeouts, bulkheads, and rate limiting
- **Design**: Support graceful degradation modes where non-critical workflows can fail independently
- **Monitoring**: Track workflow failure correlation via distributed tracing in observability package
- **Recovery**: Automatic backoff and retry with exponential delays for failed workflow dependencies

### Product Failure Modes

#### 6. Inadequate User Adoption Due to Complexity

**Risk**: Steep learning curve and complex APIs could prevent developers from adopting the platform, limiting market penetration.

**Mitigations**:
- **Product**: Develop progressive disclosure SDK with simple defaults and advanced options
- **Implementation**: Provide workflow templates and starter kits for common agent patterns
- **Documentation**: Create comprehensive tutorials, video walkthroughs, and interactive playground
- **Design**: Build visual workflow designer in operator console for no-code/low-code workflow creation
- **Community**: Establish developer community with active support channels and best practice sharing

#### 7. Poor Performance at Enterprise Scale

**Risk**: Latency or throughput limitations could make the system unsuitable for high-volume enterprise deployments, losing enterprise customers.

**Mitigations**:
- **Architecture**: Design for horizontal scalability with stateless orchestrator instances
- **Implementation**: Add distributed locking and leader election for multi-instance deployments
- **Operations**: Implement auto-scaling based on workflow queue depth and execution metrics
- **Optimization**: Add caching layers for frequently accessed state and policy evaluations
- **Monitoring**: Establish SLAs with P50/P95/P99 latency tracking per component via observability

#### 8. Security Vulnerabilities in Tool Execution

**Risk**: Malicious or compromised tools could execute unauthorized actions, exfiltrate data, or compromise systems, causing security breaches and reputational damage.

**Mitigations**:
- **Architecture**: Enforce principle of least privilege through policy permission model
- **Implementation**: Run tools in sandboxed environments (containers, VMs) with resource limits
- **Design**: Implement tool capability declarations with runtime verification
- **Security**: Add input sanitization and output validation in tool safety wrappers
- **Governance**: Require code review and security audit for all HIGH/CRITICAL risk tools

#### 9. Lack of Differentiation from Competitors

**Risk**: Similar orchestration frameworks (Temporal, Cadence, Airflow with AI plugins) could offer comparable features, making Aureus non-competitive.

**Mitigations**:
- **Product**: Double down on unique differentiators: CRV gates, Goal-Guard FSM, causal world models
- **Market**: Position as "AI-agent-first" OS vs. general workflow engines adapted for AI
- **Innovation**: Continuous investment in agent-specific features (planning, reasoning, multi-agent coordination)
- **Ecosystem**: Build integration marketplace for pre-certified tools and workflow templates
- **Brand**: Publish research papers, case studies, and benchmarks demonstrating superior safety/reliability

#### 10. Regulatory Compliance Failures

**Risk**: Failure to meet industry regulations (GDPR, SOC 2, HIPAA) could block enterprise adoption in regulated industries.

**Mitigations**:
- **Architecture**: Design audit log format for compliance requirements (immutable, tamper-proof, comprehensive)
- **Implementation**: Add data retention and deletion capabilities aligned with GDPR "right to be forgotten"
- **Security**: Implement encryption at rest and in transit for all sensitive state and logs
- **Governance**: Provide compliance reporting templates and audit trails exportable in standard formats
- **Operations**: Obtain SOC 2 Type II certification and maintain compliance documentation repository
