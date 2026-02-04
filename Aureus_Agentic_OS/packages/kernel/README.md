# Kernel

Orchestration runtime (DAG/FSM, retries, idempotency, timeouts, compensation, model-checking, multi-agent coordination)

## Features

- **DAG-based Execution**: Tasks execute in topologically sorted order based on dependencies
- **Model-Checking & Safety Policies**: Validate workflows against safety invariants before execution
- **Durable State**: All workflow and task states persisted via `StateStore` interface
- **Event Logging**: Append-only event log for all workflow transitions (`./var/run/<workflow-id>/events.log`)
- **Retry Logic**: Configurable retry attempts with exponential backoff and jitter
- **Timeout Support**: Task-level timeouts with specific error handling
- **Compensation Hooks**: Define cleanup tasks for failures and timeouts
- **Idempotency**: Prevent duplicate execution with idempotency keys
- **Risk Tiers**: Support for LOW, MEDIUM, HIGH, CRITICAL risk levels
- **Fault Injection**: Built-in chaos engineering support for resilience testing
  - Tool failure simulation
  - Latency spike injection
  - Partial outage scenarios
  - Per-workflow and per-task configuration
  - Audit logging for postmortem analysis
- **Multi-Agent Coordination**: Resource locking with deadlock/livelock detection and mitigation
  - Multiple coordination policies (EXCLUSIVE, SHARED, ORDERED, PRIORITY)
  - Runtime deadlock detection via dependency graph cycle detection
  - Livelock detection through state pattern analysis
  - Automated mitigation strategies (ABORT, REPLAN, ESCALATE)
  - Comprehensive coordination event logging

## Installation

```bash
npm install @aureus/kernel
```

## CLI Usage

```bash
# Run a workflow from a YAML file
aureus run task.yaml
```

See `examples/` directory for sample workflow specifications.

## Programmatic Usage

```typescript
import { 
  WorkflowOrchestrator, 
  InMemoryStateStore, 
  FileSystemEventLog,
  TaskExecutor,
  FaultInjector,
  FaultType
} from '@aureus/kernel';

// Define task executor
const executor: TaskExecutor = {
  execute: async (task, state) => {
    // Execute task logic
    return { result: 'success' };
  }
};

// Setup orchestrator
const stateStore = new InMemoryStateStore();
const eventLog = new FileSystemEventLog('./var/run');

// Optional: Configure fault injection for chaos engineering
const faultInjector = new FaultInjector({
  enabled: true,
  rules: [{
    type: FaultType.LATENCY_SPIKE,
    probability: 0.1,
    config: { delayMs: 1000 }
  }]
}, eventLog);

const orchestrator = new WorkflowOrchestrator(
  stateStore, 
  executor, 
  eventLog,
  undefined, // compensationExecutor
  undefined, // worldStateStore
  undefined, // memoryAPI
  undefined, // crvGate
  undefined, // policyGuard
  undefined, // principal
  undefined, // telemetry
  faultInjector // optional fault injector
);

// Execute workflow
const result = await orchestrator.executeWorkflow(spec);
```

See [examples/fault-injection.md](./examples/fault-injection.md) for detailed fault injection usage.

## YAML Specification

```yaml
id: my-workflow
name: My Workflow

# Optional: Define safety policy for model-checking
safetyPolicy:
  name: my-policy
  rules:
    - type: no_action_after_critical_without_approval
      enabled: true
      severity: error
    - type: require_permissions_for_high_risk
      enabled: true
      severity: error
      minimumRiskTier: HIGH
    - type: require_compensation_for_critical
      enabled: true
      severity: warning
    - type: no_cycles
      enabled: true
      severity: error

tasks:
  - id: task1
    name: Initialize
    type: action
    retry:
      maxAttempts: 3
      backoffMs: 1000
      backoffMultiplier: 2
      jitter: true
    timeoutMs: 5000
    riskTier: MEDIUM
    requiredPermissions:
      - action: write
        resource: data
    compensation:
      onFailure: cleanup-task1
      onTimeout: cleanup-task1

dependencies:
  task2:
    - task1
```

## Model-Checking and Safety Policies

The kernel includes a model-checking system that validates workflows against safety policies **before execution**. This ensures that workflows meet safety invariants at "compile time" rather than discovering issues at runtime.

### Safety Rules

The following safety rules are available:

1. **`no_action_after_critical_without_approval`**: Ensures no action follows a CRITICAL risk task unless it's an approved compensation task. This is the key invariant for protecting against dangerous workflow compositions.

2. **`require_permissions_for_high_risk`**: Ensures HIGH and CRITICAL risk tasks have `requiredPermissions` defined.

3. **`require_compensation_for_critical`**: Ensures CRITICAL risk tasks have compensation defined (either `compensation` hook or `compensationAction`).

4. **`no_cycles`**: Ensures the workflow is a valid DAG with no cycles.

5. **`custom`**: Allows defining custom validation logic.

### Using Safety Policies

```typescript
import { 
  loadTaskSpec,
  WorkflowChecker,
  DEFAULT_SAFETY_POLICY,
  STRICT_SAFETY_POLICY,
  PERMISSIVE_SAFETY_POLICY
} from '@aureus/kernel';

// Load and validate workflow with default policy
const workflow = await loadTaskSpec('workflow.yaml');

// Use a custom policy
const workflow = await loadTaskSpec('workflow.yaml', {
  safetyPolicy: STRICT_SAFETY_POLICY
});

// Skip validation (not recommended)
const workflow = await loadTaskSpec('workflow.yaml', {
  validate: false
});

// Validate programmatically
const result = WorkflowChecker.validate(workflow, DEFAULT_SAFETY_POLICY);
if (!result.valid) {
  console.error(WorkflowChecker.formatValidationResult(result));
  throw new Error('Workflow validation failed');
}
```

### Example: Valid CRITICAL Task Workflow

```yaml
id: bank-transfer
name: Bank Transfer

tasks:
  # CRITICAL task with proper safeguards
  - id: execute-transfer
    name: Execute Bank Transfer
    type: action
    riskTier: CRITICAL
    requiredPermissions:
      - action: write
        resource: account
    compensation:
      onFailure: rollback-transfer
    
  # Compensation task (approved to follow CRITICAL)
  - id: rollback-transfer
    name: Rollback Transfer
    type: action
    riskTier: LOW
    compensationAction:
      tool: reverse-transaction
      args: { reason: failure }

dependencies:
  rollback-transfer:
    - execute-transfer
```

### Example: Invalid Workflow (Will Fail Validation)

```yaml
tasks:
  # ❌ CRITICAL without permissions
  - id: delete-db
    riskTier: CRITICAL
    
  # ❌ Regular action following CRITICAL (not approved)
  - id: send-email
    riskTier: LOW

dependencies:
  send-email:
    - delete-db  # VIOLATION!
```

See `examples/bank-transfer-safe.yaml` and `examples/unsafe-workflow.yaml` for complete examples.

## Multi-Agent Coordination

The kernel provides comprehensive support for coordinating multiple agents that may compete for shared resources.

### Quick Start

```typescript
import {
  MultiAgentCoordinator,
  LivelockDetector,
  CoordinationMitigator,
  CoordinationPolicyType,
  MitigationStrategy,
} from '@aureus/kernel';

// Initialize coordination components
const coordinator = new MultiAgentCoordinator(30000, true);
const detector = new LivelockDetector(10, 3, 60000);
const mitigator = new CoordinationMitigator(coordinator, detector);

// Register resource policies
coordinator.registerPolicy({
  type: CoordinationPolicyType.EXCLUSIVE,
  resourceId: 'database',
  lockTimeout: 60000
});

// Acquire lock before accessing resource
const acquired = await coordinator.acquireLock(
  'database',
  'agent-1',
  'workflow-1',
  'write'
);

if (acquired) {
  // Perform operation
  await performDatabaseUpdate();
  
  // Release lock
  await coordinator.releaseLock('database', 'agent-1', 'workflow-1');
}

// Detect and mitigate deadlocks
const deadlock = coordinator.detectDeadlock();
if (deadlock.detected) {
  await mitigator.mitigateDeadlock(deadlock, MitigationStrategy.REPLAN);
}

// Detect and mitigate livelocks
const livelock = detector.detectLivelock();
if (livelock.detected) {
  await mitigator.mitigateLivelock(livelock, MitigationStrategy.ESCALATE);
}
```

### Coordination Policies

**EXCLUSIVE**: Only one agent can access resource at a time
```typescript
coordinator.registerPolicy({
  type: CoordinationPolicyType.EXCLUSIVE,
  resourceId: 'database',
  lockTimeout: 30000
});
```

**SHARED**: Multiple readers, exclusive writer
```typescript
coordinator.registerPolicy({
  type: CoordinationPolicyType.SHARED,
  resourceId: 'config',
  maxConcurrentAccess: 5,
  lockTimeout: 15000
});
```

**ORDERED/PRIORITY**: Priority-based access
```typescript
coordinator.registerPolicy({
  type: CoordinationPolicyType.ORDERED,
  resourceId: 'sequence',
  priorityOrder: ['high-priority-agent', 'normal-agent']
});
```

### Deadlock Detection

The coordinator automatically detects deadlocks using cycle detection in the wait-for dependency graph:

```typescript
// Example deadlock scenario
await coordinator.acquireLock('resource-A', 'agent-1', 'wf-1', 'write');
await coordinator.acquireLock('resource-B', 'agent-2', 'wf-2', 'write');

// These will block
await coordinator.acquireLock('resource-B', 'agent-1', 'wf-1', 'write');
await coordinator.acquireLock('resource-A', 'agent-2', 'wf-2', 'write');

// Detect the cycle
const deadlock = coordinator.detectDeadlock();
// deadlock.detected === true
// deadlock.cycle === ['agent-1', 'agent-2']
```

### Livelock Detection

The detector identifies repeated state patterns that indicate lack of progress:

```typescript
// Agent repeatedly retrying
for (let i = 0; i < 10; i++) {
  detector.recordState('agent-1', 'wf-1', 'task-1', {
    phase: i % 2 === 0 ? 'acquiring' : 'releasing'
  });
}

const livelock = detector.detectLivelock();
// livelock.detected === true
// livelock.repeatedPattern === "Repeated 2-state pattern 5 times"
```

### Mitigation Strategies

**ABORT**: Terminate agents to break deadlock/livelock
```typescript
await mitigator.mitigateDeadlock(deadlock, MitigationStrategy.ABORT);
// Selects and aborts victim agent holding most resources
```

**REPLAN**: Trigger replanning for affected agents
```typescript
await mitigator.mitigateLivelock(livelock, MitigationStrategy.REPLAN);
// Clears state and signals agents to replan
```

**ESCALATE**: Human operator intervention
```typescript
mitigator.onEscalation(async (context) => {
  console.log('Escalation needed:', context.type);
  await notifyOperators(context);
});

await mitigator.mitigateDeadlock(deadlock, MitigationStrategy.ESCALATE);
```

See [Multi-Agent Coordination Guide](./docs/multi-agent-coordination.md) for complete documentation.

## Testing

```bash
npm test
```

## Invariants

1. **DAG Execution Order**: Tasks execute in topologically sorted order
2. **Event Durability**: All transitions persisted to append-only log
3. **Safety Validation**: Workflows validated against safety policies before execution
4. **Timeout Enforcement**: Tasks exceeding timeout are terminated
5. **Retry with Jitter**: Backoff includes random jitter (0.5x-1.5x)
6. **Compensation Execution**: Compensation runs on failure/timeout
7. **CRITICAL Task Protection**: No action after CRITICAL risk unless approved

## Agent Lifecycle Manager

The Agent Lifecycle Manager provides comprehensive session management, sleep/awake cycles, and context refresh for always-on agents.

### Features

- **Session Management**: Track agent sessions with metadata and state
- **Lifecycle States**: INITIALIZING, AWAKE, SLEEPING, HIBERNATING, TERMINATED
- **Sleep/Awake Cycles**: Automatic cycle management with configurable timers
- **Context Refresh**: Refresh agent context on wake with multiple strategies
- **Session Snapshots**: Capture session state for continuity across cycles
- **Inactivity Tracking**: Automatic sleep based on inactivity

### Usage

```typescript
import { AgentLifecycleManager, AgentLifecycleState } from '@aureus/kernel';

// Create lifecycle manager
const manager = new AgentLifecycleManager({
  awakeTimeMs: 60 * 60 * 1000, // 1 hour max awake
  sleepTimeMs: 5 * 60 * 1000,  // 5 minutes sleep
  inactivityThresholdMs: 10 * 60 * 1000, // 10 minutes inactivity
  contextRefreshOnWake: true,
});

// Create agent session
const session = manager.createSession('agent-1', 'task-123', {
  priority: 'high',
  owner: 'user-456',
});

// Record agent activity
manager.recordActivity(session.sessionId, 100, 50); // contextSize, memoryCount

// Manual sleep/wake
manager.sleep(session.sessionId);
manager.wake(session.sessionId);

// Hibernate for long periods
manager.hibernate(session.sessionId);

// Terminate when done
manager.terminate(session.sessionId);

// Get session info
const sessionInfo = manager.getSession(session.sessionId);
console.log(`State: ${sessionInfo?.state}, Cycle: ${sessionInfo?.cycleNumber}`);

// Get all sessions for an agent
const agentSessions = manager.getAgentSessions('agent-1');

// Get lifecycle statistics
const stats = manager.getStats();
console.log(`Active sessions: ${stats.activeSessions}`);
console.log(`Sleeping sessions: ${stats.sleepingSessions}`);
```

### Context Refresh

Refresh agent context when waking from sleep:

```typescript
// Define memory provider
const memoryProvider = async (sessionId: string, strategy: ContextRefreshStrategy) => {
  // Retrieve relevant memories based on strategy
  if (strategy.type === 'incremental') {
    // Only get new memories
    return memoryAPI.getIncrementalUpdates(lastTimestamp, strategy.maxContextSize);
  } else if (strategy.type === 'full') {
    // Get full context
    return memoryAPI.read({ task_id: session.taskId });
  }
  return [];
};

// Refresh context
const memoryIds = await manager.refreshContext(
  session.sessionId,
  {
    type: 'incremental',
    maxContextSize: 100,
    prioritizeRecent: true,
  },
  memoryProvider
);
```

### Session Snapshots

Capture and restore session state:

```typescript
// Snapshots are created automatically on sleep/hibernate
manager.sleep(session.sessionId);

// Get snapshots
const snapshots = manager.getSnapshots(session.sessionId);
console.log(`${snapshots.length} snapshots created`);

// Restore from snapshot
const restored = manager.restoreSession(session.sessionId);
console.log(`Restored to cycle ${restored?.cycleNumber}`);
```

### Automatic Lifecycle Management

The lifecycle manager automatically handles:

1. **Inactivity Detection**: Auto-sleep after inactivity threshold
2. **Max Awake Time**: Auto-sleep after max awake time
3. **Auto-Wake**: Auto-wake after sleep time
4. **Snapshot Creation**: Auto-snapshot on sleep/hibernate
5. **Cycle Tracking**: Auto-increment cycle number on wake

