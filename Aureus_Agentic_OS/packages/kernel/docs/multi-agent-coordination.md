# Multi-Agent Coordination with Deadlock/Livelock Detection

This document describes the multi-agent coordination system in the Aureus Kernel, including deadlock and livelock detection with automatic mitigation strategies.

## Overview

The multi-agent coordination system provides:

1. **Resource Locking** - Coordinate access to shared resources with multiple policy types
2. **Deadlock Detection** - Runtime detection using dependency graph analysis and cycle detection
3. **Livelock Detection** - Track agent state transitions to detect repeated patterns without progress
4. **Mitigation Strategies** - Automated and manual strategies including abort, replan, and human escalation

## Architecture

### Components

#### 1. MultiAgentCoordinator

Manages resource locks and tracks agent dependencies.

**Key Features:**
- Support for multiple coordination policies (EXCLUSIVE, SHARED, ORDERED, PRIORITY)
- Real-time dependency graph tracking
- Cycle detection for deadlock identification
- Timeout-based lock expiration
- Comprehensive event logging

**API:**
```typescript
const coordinator = new MultiAgentCoordinator(
  defaultLockTimeout: number,  // 30000ms default
  enableTimeoutChecker: boolean // true default
);

// Register a policy for a resource
coordinator.registerPolicy({
  type: CoordinationPolicyType.EXCLUSIVE,
  resourceId: 'database',
  lockTimeout: 60000
});

// Acquire a lock
const acquired = await coordinator.acquireLock(
  resourceId: string,
  agentId: string,
  workflowId: string,
  lockType: 'read' | 'write'
);

// Release a lock
await coordinator.releaseLock(resourceId, agentId, workflowId);

// Detect deadlocks
const deadlock = coordinator.detectDeadlock();
if (deadlock.detected) {
  console.log('Deadlock detected:', deadlock.cycle);
}
```

#### 2. LivelockDetector

Identifies livelock conditions by analyzing agent state patterns.

**Key Features:**
- Configurable window size for state history
- Repeated pattern detection (cyclic behavior)
- Alternating state detection
- Progress timeout monitoring
- Per-agent state tracking

**API:**
```typescript
const detector = new LivelockDetector(
  windowSize: number,        // 10 default - states to track
  patternThreshold: number,  // 3 default - repeated count to trigger
  progressTimeout: number    // 60000ms default - time without progress
);

// Record agent state
detector.recordState(agentId, workflowId, taskId, stateData);

// Detect livelock
const livelock = detector.detectLivelock();
if (livelock.detected) {
  console.log('Livelock detected:', livelock.repeatedPattern);
}

// Clear history after resolution
detector.clearAgentHistory(agentId);
```

#### 3. CoordinationMitigator

Implements mitigation strategies for detected deadlock/livelock conditions.

**Key Features:**
- Three mitigation strategies: ABORT, REPLAN, ESCALATE
- Smart victim selection for abort strategy
- Escalation callbacks for human intervention
- Comprehensive event logging

**API:**
```typescript
const mitigator = new CoordinationMitigator(coordinator, detector);

// Register escalation callback
mitigator.onEscalation(async (context) => {
  console.log('Escalation:', context.type, context.details);
  // Notify human operator, send alert, etc.
});

// Mitigate deadlock
const deadlock = coordinator.detectDeadlock();
const result = await mitigator.mitigateDeadlock(
  deadlock,
  MitigationStrategy.ABORT
);

// Mitigate livelock
const livelock = detector.detectLivelock();
const result = await mitigator.mitigateLivelock(
  livelock,
  MitigationStrategy.REPLAN
);
```

## Coordination Policies

### EXCLUSIVE

Only one agent can access the resource at a time.

```typescript
coordinator.registerPolicy({
  type: CoordinationPolicyType.EXCLUSIVE,
  resourceId: 'database',
  lockTimeout: 30000
});
```

**Use Cases:**
- Database write operations
- File modifications
- Critical sections

### SHARED

Multiple agents can read simultaneously, but writes are exclusive.

```typescript
coordinator.registerPolicy({
  type: CoordinationPolicyType.SHARED,
  resourceId: 'config-file',
  maxConcurrentAccess: 5,
  lockTimeout: 15000
});
```

**Use Cases:**
- Read-heavy resources
- Configuration files
- Cached data

### ORDERED

Agents must access in a specific order (priority-based).

```typescript
coordinator.registerPolicy({
  type: CoordinationPolicyType.ORDERED,
  resourceId: 'sequence-generator',
  priorityOrder: ['agent-1', 'agent-2', 'agent-3']
});
```

**Use Cases:**
- Sequential processing
- Priority-based access
- Ordered task execution

## Deadlock Detection

### How It Works

1. **Dependency Tracking**: Each time an agent requests a resource that's held by another agent, a dependency edge is created
2. **Wait-For Graph**: Build a directed graph where edges represent "waiting for" relationships
3. **Cycle Detection**: Use depth-first search (DFS) to detect cycles in the wait-for graph
4. **Timeout Detection**: Locks that exceed their timeout are automatically released

### Detection Algorithm

```typescript
// Pseudocode
function detectDeadlock():
  graph = buildWaitForGraph()  // agentId -> [waitingFor agentIds]
  
  for each node in graph:
    if not visited[node]:
      cycle = dfs(node, graph, visited, recursionStack)
      if cycle.length > 0:
        return { detected: true, cycle, affectedResources }
  
  return { detected: false }
```

### Example Scenario

```typescript
// Agent 1 holds resource-A, wants resource-B
await coordinator.acquireLock('resource-A', 'agent-1', 'wf-1', 'write');
await coordinator.acquireLock('resource-B', 'agent-1', 'wf-1', 'write'); // Blocked

// Agent 2 holds resource-B, wants resource-A
await coordinator.acquireLock('resource-B', 'agent-2', 'wf-2', 'write');
await coordinator.acquireLock('resource-A', 'agent-2', 'wf-2', 'write'); // Blocked

// Deadlock detected!
const deadlock = coordinator.detectDeadlock();
// deadlock.cycle = ['agent-1', 'agent-2']
// deadlock.affectedResources = ['resource-A', 'resource-B']
```

## Livelock Detection

### How It Works

1. **State Recording**: Track agent state over time (window of last N states)
2. **Pattern Analysis**: Detect repeated patterns (e.g., A -> B -> A -> B)
3. **Progress Monitoring**: Check if state is changing but without meaningful progress
4. **Threshold Triggering**: Livelock is detected when pattern repeats ≥ threshold times

### Detection Patterns

#### Alternating States
```
Agent repeatedly switches between two states:
State A -> State B -> State A -> State B -> ... (no progress)
```

#### Cyclic Patterns
```
Agent cycles through multiple states:
State A -> State B -> State C -> State A -> State B -> State C -> ... (no progress)
```

#### Lack of Progress
```
Agent remains in same state for too long (exceeds progressTimeout)
```

### Example Scenario

```typescript
// Agent stuck in retry loop
for (let i = 0; i < 10; i++) {
  const state = i % 2 === 0 ? 'acquiring-lock' : 'releasing-lock';
  detector.recordState('agent-1', 'wf-1', 'task-1', { state });
}

// Livelock detected!
const livelock = detector.detectLivelock();
// livelock.detected = true
// livelock.repeatedPattern = "Repeated 2-state pattern 5 times"
```

## Mitigation Strategies

### 1. ABORT Strategy

Terminates one or more agents to break the deadlock/livelock.

**Deadlock Mitigation:**
- Selects victim agent (one holding most resources)
- Releases all locks held by victim
- Logs abort action with context

**Livelock Mitigation:**
- Aborts all agents in livelock
- Clears state history
- Allows restart with fresh state

```typescript
const result = await mitigator.mitigateDeadlock(
  deadlock,
  MitigationStrategy.ABORT
);

if (result.success) {
  console.log('Aborted:', result.affectedAgents);
  // Re-execute affected agents
}
```

**When to Use:**
- Critical operations must proceed
- Affected agents can be safely restarted
- System stability is priority

### 2. REPLAN Strategy

Triggers replanning for affected agents.

**Deadlock Mitigation:**
- Selects agent with fewest resources held
- Releases their locks
- Signals agent to replan task execution

**Livelock Mitigation:**
- Clears state history for all affected agents
- Allows agents to replan with fresh context
- Preserves system state

```typescript
const result = await mitigator.mitigateLivelock(
  livelock,
  MitigationStrategy.REPLAN
);

if (result.success) {
  console.log('Replanning:', result.affectedAgents);
  // Agents will replan their tasks
}
```

**When to Use:**
- Agents can adapt their plans
- Resource contention is temporary
- Preserving progress is important

### 3. ESCALATE Strategy

Notifies human operator for manual intervention.

**Process:**
1. Creates escalation context with details
2. Invokes registered escalation callbacks
3. Logs escalation event
4. Waits for human decision

```typescript
mitigator.onEscalation(async (context) => {
  // Send alert to operator
  await sendAlert({
    type: context.type,
    details: context.details,
    suggestedActions: context.suggestedActions
  });
  
  // Display in console UI
  console.displayAlert(context);
});

const result = await mitigator.mitigateDeadlock(
  deadlock,
  MitigationStrategy.ESCALATE
);

// Human will decide next action
```

**When to Use:**
- Critical production systems
- Complex coordination scenarios
- Policy requires human approval
- Automated strategies are uncertain

## Integration Example

```typescript
import {
  MultiAgentCoordinator,
  LivelockDetector,
  CoordinationMitigator,
  CoordinationPolicyType,
  MitigationStrategy,
} from '@aureus/kernel';

// Initialize components
const coordinator = new MultiAgentCoordinator(30000, true);
const detector = new LivelockDetector(10, 3, 60000);
const mitigator = new CoordinationMitigator(coordinator, detector);

// Register policies
coordinator.registerPolicy({
  type: CoordinationPolicyType.EXCLUSIVE,
  resourceId: 'production-db',
  lockTimeout: 60000,
});

coordinator.registerPolicy({
  type: CoordinationPolicyType.SHARED,
  resourceId: 'cache',
  maxConcurrentAccess: 10,
  lockTimeout: 30000,
});

// Register escalation handler
mitigator.onEscalation(async (context) => {
  console.log('🚨 Escalation:', context);
  await notifyOperators(context);
});

// In your workflow execution
async function executeAgentTask(agentId: string, workflowId: string) {
  // Acquire resource lock
  const acquired = await coordinator.acquireLock(
    'production-db',
    agentId,
    workflowId,
    'write'
  );

  if (!acquired) {
    // Check for deadlock
    const deadlock = coordinator.detectDeadlock();
    if (deadlock.detected) {
      await mitigator.mitigateDeadlock(deadlock, MitigationStrategy.REPLAN);
    }
    return;
  }

  try {
    // Record state for livelock detection
    detector.recordState(agentId, workflowId, 'task-1', { 
      phase: 'executing',
      resource: 'production-db'
    });

    // Execute task
    await performDatabaseOperation();

    // Check for livelock periodically
    const livelock = detector.detectLivelock();
    if (livelock.detected) {
      await mitigator.mitigateLivelock(livelock, MitigationStrategy.ESCALATE);
    }
  } finally {
    // Release lock
    await coordinator.releaseLock('production-db', agentId, workflowId);
  }
}

// Cleanup
process.on('SIGTERM', () => {
  coordinator.shutdown();
});
```

## Best Practices

### 1. Choose Appropriate Timeouts

```typescript
// Short timeout for quick operations
coordinator.registerPolicy({
  type: CoordinationPolicyType.EXCLUSIVE,
  resourceId: 'cache-update',
  lockTimeout: 5000  // 5 seconds
});

// Long timeout for batch processing
coordinator.registerPolicy({
  type: CoordinationPolicyType.EXCLUSIVE,
  resourceId: 'batch-job',
  lockTimeout: 300000  // 5 minutes
});
```

### 2. Use Appropriate Policy Types

- **EXCLUSIVE**: Write operations, critical sections
- **SHARED**: Read-heavy resources, configuration files
- **ORDERED**: Sequential processing, priority workflows
- **PRIORITY**: Important agents get preference

### 3. Monitor Detection Metrics

```typescript
// Periodic deadlock checking
setInterval(() => {
  const deadlock = coordinator.detectDeadlock();
  if (deadlock.detected) {
    metrics.recordDeadlock(deadlock);
    mitigator.mitigateDeadlock(deadlock, MitigationStrategy.REPLAN);
  }
}, 5000);

// Periodic livelock checking
setInterval(() => {
  const livelock = detector.detectLivelock();
  if (livelock.detected) {
    metrics.recordLivelock(livelock);
    mitigator.mitigateLivelock(livelock, MitigationStrategy.REPLAN);
  }
}, 10000);
```

### 4. Log Coordination Events

```typescript
const events = coordinator.getEvents();
const livelockEvents = detector.getEvents();
const mitigationEvents = mitigator.getEvents();

// Send to observability platform
observability.logEvents([...events, ...livelockEvents, ...mitigationEvents]);
```

### 5. Test Coordination Scenarios

Write tests for:
- Simple deadlock (2 agents, 2 resources)
- Complex deadlock (N agents, M resources)
- Alternating livelock
- Cyclic livelock
- Timeout-based detection
- Each mitigation strategy

## Performance Considerations

### Memory Usage

- State history is bounded by `windowSize` (default 10)
- Lock maps grow with active agents/resources
- Events log grows unbounded (implement rotation)

### CPU Usage

- Deadlock detection: O(V + E) where V = agents, E = dependencies
- Livelock detection: O(W × P) where W = window size, P = pattern length
- Minimal overhead for lock operations

### Scalability

- Coordinator supports thousands of concurrent agents
- Detector tracks hundreds of agents efficiently
- Consider distributed coordination for multi-node setups

## Troubleshooting

### Deadlock Not Detected

1. Check if dependency tracking is correct
2. Verify lock acquisition/release calls
3. Ensure policies are registered
4. Check timeout values

### Livelock Not Detected

1. Verify state hashing is consistent
2. Check pattern threshold settings
3. Ensure sufficient history (windowSize)
4. Review state data structure

### Mitigation Fails

1. Check escalation callbacks are registered
2. Verify agent restart logic
3. Review lock release logic
4. Check for race conditions

## See Also

- [Kernel Architecture](../../architecture.md#kernel-orchestration)
- [Policy Framework](../../packages/policy/README.md)
- [Integration Tests](../tests/coordination.test.ts)
- [World Model State Management](../../packages/world-model/README.md)
