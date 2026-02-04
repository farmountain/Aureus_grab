# Solution

This document describes the technical solution implemented in Aureus Agentic OS.

## Problem Statement

Modern AI agents need to operate in production environments with guarantees around reliability, safety, and auditability. Traditional approaches lack the necessary infrastructure for controlled autonomy at enterprise scale.

## Solution Components

**Important**: The development defaults (in-memory state, in-memory memory/audit, mock LLMs, sandbox disabled) do **not** provide production durability, audit persistence, real LLM execution, or sandboxed tool execution. Those guarantees require the production configuration outlined in the Production Profile below.

### Durable Orchestration

The kernel provides DAG/FSM-based orchestration with built-in retries, timeouts, and idempotency guarantees.

**Implementation**: The `WorkflowOrchestrator` class manages workflow execution with:
- State persistence via `StateStore` interface
- Append-only event log via `EventLog` interface (filesystem-based by default)
- Topological sorting for DAG execution
- Retry logic with exponential backoff and jitter
- Timeout enforcement for long-running tasks
- Compensation hooks for failure recovery
- Idempotency keys to prevent duplicate executions

**Key Features**:
- Workflows automatically persist state after each task
- All workflow transitions logged to `./var/run/<workflow_id>/events.log`
- On failure, workflows can resume from last checkpoint
- Tasks with idempotency keys skip re-execution
- Configurable retry attempts with backoff multipliers and random jitter
- Task timeouts prevent unbounded execution
- Compensation tasks execute on failure/timeout for cleanup
- Risk tiers enable policy-based governance (LOW, MEDIUM, HIGH, CRITICAL)

**Persistence Options**:
- **In-Memory Store**: `InMemoryStateStore` for development and testing
- **PostgreSQL Store**: `PostgresStateStore` for production with ACID guarantees

**Production Note**: Durability guarantees only apply when using a persistent `StateStore` (Postgres) and when workflow events are written to persistent storage.

**Persistence Guarantees**:
- **Atomicity**: Each workflow state update is atomic - either all changes are committed or none
- **Consistency**: Database constraints ensure workflow state integrity
- **Isolation**: Multi-tenant isolation via tenant_id with row-level security
- **Durability**: All committed state survives process crashes and restarts
- **Recoverability**: Workflows can resume from last persisted checkpoint after failure
- **Audit Trail**: Complete history of all state transitions for compliance and debugging

**CLI Usage**:
```bash
# In-memory mode (default)
aureus run task.yaml

# PostgreSQL mode (set environment variables)
export DATABASE_URL="postgresql://user:pass@localhost:5432/aureus"
export STATE_STORE_TYPE="postgres"
aureus run task.yaml
```

Loads a workflow from YAML and executes it with full durability guarantees. Example YAML format:
```yaml
id: my-workflow
name: Example Workflow
tasks:
  - id: task1
    name: Initialize
    type: action
    retry:
      maxAttempts: 3
      backoffMs: 1000
      jitter: true
    timeoutMs: 5000
    riskTier: MEDIUM
    compensation:
      onFailure: cleanup-task1
dependencies:
  task2:
    - task1
```

### Circuit Reasoning Validation (CRV)

Circuit reasoning validation ensures that agent decisions meet safety and correctness criteria.

**Implementation**: The CRV package provides:
- `Validators` class with built-in validation operators
- `CRVGate` for configurable validation pipelines
- `GateChain` for composing multiple validation gates
- Blocking semantics to prevent invalid commits

**Built-in Validators**:
- `notNull()`: Ensures data is not null/undefined
- `schema()`: Validates data matches expected schema
- `monotonic()`: Checks for non-decreasing versions
- `maxSize()`: Enforces size limits
- `custom()`: Arbitrary predicates

**Blocking Behavior**: When `blockOnFailure: true`, invalid commits are rejected and logged.

### Causal World Models

State management with do-graph representation and constraint enforcement enables agents to reason about their environment.

**Implementation**: The `WorldModel` class provides:
- Entity-relationship state representation
- Constraint validation (invariants, pre/post-conditions)
- Do-graph for action planning
- Effect application with precondition checking

**Constraints**: Define predicates that must hold on world state
**Do-Nodes**: Define actions with preconditions and effects
**Validation**: Check constraints before and after state changes

### Auditable Memory

HipCortex provides temporal indexing, snapshots, and audit logs with rollback capabilities.

**Implementation**: The `HipCortex` class manages:
- Snapshot creation with verification status
- Temporal indexing for efficient queries
- Complete audit log with state diffs
- Rollback to verified snapshots

**Key Features**:
- Snapshots marked as "verified" after passing CRV
- Audit log records actor, action, before/after state, and diff
- Query by time range or actor
- Rollback to last verified snapshot for safety

**Persistence Options**:
- **In-Memory**: Default implementation for development
- **PostgreSQL Memory Store**: `PostgresMemoryStore` for persistent memory entries with provenance
- **PostgreSQL Audit Log**: `PostgresAuditLog` for tamper-evident audit trails with cryptographic hashing

**Production Note**: Audit persistence requires `PostgresMemoryStore` + `PostgresAuditLog` backed by a real database connection; in-memory defaults are non-durable.

**Persistence Guarantees**:
- **Append-Only Audit Log**: All entries are immutable once written
- **Cryptographic Integrity**: SHA-256 hashes verify entry integrity
- **Provenance Tracking**: Full lineage of task_id, step_id, and source events
- **Temporal Indexing**: Efficient time-based queries across memory entries
- **Point-in-Time Recovery**: Snapshots enable rollback to any verified state
- **Compliance Ready**: Complete audit trail for regulatory requirements

**Usage**:
```typescript
// In-memory (default)
const memory = new HipCortex();

// PostgreSQL-backed
const memoryStore = new PostgresMemoryStore();
const auditLog = new PostgresAuditLog();
await memoryStore.initialize(schemaSQL);
await auditLog.initialize(schemaSQL);

// Store entries with provenance
await memoryStore.storeEntry({
  id: 'entry-1',
  content: { data: 'value' },
  type: 'episodic_note',
  provenance: {
    task_id: 'task-1',
    step_id: 'step-1',
    timestamp: new Date(),
  },
  tags: ['important'],
});

// Query with filters
const entries = await memoryStore.queryEntries({
  task_id: 'task-1',
  timeRange: { start: startDate, end: endDate },
});

// Audit log with integrity verification
const entry = await auditLog.append(
  'agent-1',
  'update_state',
  previousState,
  newState,
  { metadata: { reason: 'user_request' } }
);

// Verify integrity
const isValid = await auditLog.verifyEntry(entry.id);
```

### Policy Framework

Goal-guard FSM with permission models and risk tiers ensures agents operate within defined boundaries.

**Implementation**: The `GoalGuardFSM` class implements:
- Five-state FSM (IDLE, EVALUATING, APPROVED, REJECTED, PENDING_HUMAN)
- Four risk tiers (LOW, MEDIUM, HIGH, CRITICAL)
- Permission checking (action-resource pairs)
- Complete audit trail of decisions

**Risk-Based Gating**:
- LOW: Auto-approved
- MEDIUM: Auto-approved with monitoring
- HIGH: Requires human approval
- CRITICAL: Always requires human approval

### Observability

Comprehensive telemetry, metrics, and traces enable monitoring and debugging of agent behavior.

**Implementation**: The `TelemetryCollector` provides:
- Metric recording with tags
- Distributed tracing with spans
- Structured logging with levels
- Query APIs for debugging

**Features**:
- Trace hierarchies for distributed operations
- Metric time-series with filtering
- Log aggregation by level
- Span logs for detailed trace context

### Reflexion (Self-Healing)

Reflexion enables agents to learn from failures and automatically propose corrective actions.

**Implementation**: The `ReflexionEngine` provides:
- Structured postmortem generation with failure taxonomy
- Proposed fix generation (alternate tools, CRV threshold adjustments, workflow reordering)
- Sandbox execution with comprehensive validation
- Chaos testing for fix resilience

**Key Features**:
- **Failure Analysis**: Classifies failures into taxonomy (TOOL_ERROR, LOW_CONFIDENCE, CONFLICT, NON_DETERMINISM, etc.)
- **Fix Generation**: Automatically proposes fixes based on failure type:
  - Alternate tool selection for tool failures
  - CRV threshold modification for confidence issues (within policy bounds)
  - Workflow step reordering for non-deterministic behavior (only if safe)
- **Sandbox Validation**: All fixes validated before promotion:
  - Goal-Guard FSM approval required
  - CRV validation must pass
  - Chaos tests must pass (idempotency, rollback safety, boundary conditions)
- **Fix Promotion**: Fixes promoted only if all validation gates pass
- **Telemetry**: Complete observability of reflexion operations

**Example Usage**:
```typescript
const reflexion = new ReflexionEngine(goalGuard, crvGate);

try {
  await orchestrator.executeWorkflow(workflow);
} catch (error) {
  const result = await reflexion.handleFailure(
    workflowId,
    taskId,
    error,
    { toolName: 'data-fetcher', allowedTools: ['data-fetcher', 'data-fetcher-v2'] }
  );
  
  if (result.fixPromoted) {
    await reflexion.applyFix(result.postmortem.proposedFix, workflowContext);
  }
}
```

## Integration

The SDK provides a unified interface for developers to build agent applications on top of the platform.

**Example Usage**:
```typescript
// Setup components
const stateStore = new InMemoryStateStore();
const executor = { execute: async (task) => ({ result: 'success' }) };
const orchestrator = new WorkflowOrchestrator(stateStore, executor);

// Define workflow
const workflow: WorkflowSpec = {
  id: 'my-workflow',
  name: 'My Workflow',
  tasks: [
    { id: 'task1', type: 'action', retry: { maxAttempts: 3, backoffMs: 1000 } },
  ],
  dependencies: new Map(),
};

// Execute with all invariants enforced
const result = await orchestrator.executeWorkflow(workflow);
```

## Non-negotiable Invariants

All six invariants are implemented and verified by tests:

1. **Durability**: `WorkflowOrchestrator` persists state via `StateStore`
2. **Idempotency**: Tasks with `idempotencyKey` skip re-execution
3. **Verification**: `CRVGate` blocks invalid commits when `blockOnFailure: true`
4. **Governance**: `GoalGuardFSM` gates HIGH/CRITICAL actions
5. **Auditability**: `HipCortex` logs all actions with state diffs
6. **Rollback**: `HipCortex.rollbackToLastVerified()` restores safe state

## Testing

The solution includes comprehensive tests:
- **Unit tests**: Each package has focused unit tests
- **Integration tests**: Full workflow tests exercising all invariants
- **Invariant verification**: Explicit tests for each of the 6 invariants
- **Reflexion tests**: 38 tests covering failure analysis, sandbox execution, and fix promotion
- **Evaluation harness**: Automated evaluation against success criteria

All tests pass, demonstrating that the implementation meets requirements.

## Evaluation & Metrics

The evaluation harness provides automated assessment of system performance against defined success criteria.

**Features**:
- **Task-Type Success Criteria**: Define thresholds per task type (extraction, validation, transformation, etc.)
- **Comprehensive Metrics**: Success rate, latency percentiles, error rate, retry rate, human escalation rate
- **Automated Evaluation**: Continuous evaluation against criteria
- **Detailed Reports**: JSON and Markdown reports with recommendations

**Example**:
```typescript
import { EvaluationHarness, TaskType } from '@aureus/evaluation-harness';

// Create harness with custom criteria
const harness = new EvaluationHarness(telemetry, [
  {
    taskType: TaskType.EXTRACTION,
    minSuccessRate: 0.95,
    maxLatencyMs: 5000,
    maxErrorRate: 0.05,
  }
]);

// Evaluate
const result = harness.evaluate();
console.log(`Evaluation passed: ${result.passed}`);

// Generate report
const report = harness.generateReport();
console.log(harness.exportReportMarkdown(report));
```

For detailed documentation, see [Evaluation Harness README](./packages/evaluation-harness/README.md).

## Enhanced Error Handling

The system provides detailed error messages with actionable remediation guidance.

**Error Classes**:
- `WorkflowExecutionError`: Workflow and task execution failures
- `TaskTimeoutError`: Task timeout with optimization suggestions
- `StateStoreError`: State persistence issues
- `IdempotencyViolationError`: Idempotency key conflicts
- `RollbackError`: Rollback operation failures
- `SnapshotNotFoundError`: Missing snapshot errors
- `CRVValidationError`: Validation gate failures
- `PolicyViolationError`: Policy denial with approval requirements
- `PermissionDeniedError`: Authorization failures
- `AuthenticationError`: Authentication issues
- `ConfigurationError`: Configuration problems
- `ConflictError`: State conflict detection
- `MemoryError`: Memory operation failures
- `ResourceExhaustedError`: Resource limit violations
- `ToolExecutionError`: Tool adapter failures
- `ValidationError`: Generic validation errors

**Example**:
```typescript
try {
  await orchestrator.executeWorkflow(spec);
} catch (error) {
  if (error instanceof WorkflowExecutionError) {
    console.error(error.getDetailedMessage());
    // Includes: error code, message, remediation steps, and context
  }
}
```

All errors include:
- Unique error code for categorization
- Clear error message
- Actionable remediation guidance
- Contextual information
- Timestamp and stack trace

## Production Readiness

For production deployment, refer to:
- [Production Readiness Checklist](./docs/production_readiness.md)
- [Security Model & Threat Analysis](./docs/security_model.md)
- [Monitoring and Alerting Guide](./docs/monitoring-and-alerting.md)

## Production Profile

Production-grade durability, audit persistence, real LLM execution, and sandboxed tool execution require explicit configuration.

**CLI example (durable state + persistent event logs):**

```bash
aureus run workflow.yaml \
  --state-store-type postgres \
  --event-log-dir /var/log/aureus/events
```

**Environment example (durable state, persistent memory/audit, real LLM, sandbox):**

```bash
export NODE_ENV=production
export STATE_STORE_TYPE=postgres
export DATABASE_URL="postgresql://aureus:your-password@db.example.com:5432/aureus"
export EVENT_LOG_DIR="/var/log/aureus/events"

# Real LLM provider
export LLM_PROVIDER="openai"
export LLM_MODEL="gpt-4"
export OPENAI_API_KEY="sk-..."

# Sandbox execution
export ENABLE_SANDBOX="true"
```

**Memory & audit persistence**: wire `HipCortex` to `PostgresMemoryStore` and `PostgresAuditLog` (see [`docs/persistence.md`](./docs/persistence.md)) so memory/audit durability matches workflow state durability.
