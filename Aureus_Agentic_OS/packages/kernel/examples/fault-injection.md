# Fault Injection Example

This example demonstrates how to use the fault injection module to simulate various failures in workflow execution for chaos engineering and resilience testing.

## Overview

The fault injection module supports three types of faults:
1. **Tool Failure**: Simulates complete tool/service failures
2. **Latency Spike**: Adds artificial delays to task execution
3. **Partial Outage**: Simulates intermittent service availability

## Basic Usage

```typescript
import {
  WorkflowOrchestrator,
  FaultInjector,
  FaultType,
  FaultInjectionConfig,
  InMemoryStateStore,
  InMemoryEventLog,
} from '@aureus/kernel';

// Configure fault injection
const faultConfig: FaultInjectionConfig = {
  enabled: true,
  rules: [
    {
      type: FaultType.TOOL_FAILURE,
      probability: 0.3, // 30% chance of failure
      targetTools: ['external-api'], // Only affect this tool
      config: {
        errorMessage: 'External API unavailable',
      },
    },
    {
      type: FaultType.LATENCY_SPIKE,
      probability: 0.2, // 20% chance
      config: {
        delayMs: 2000, // 2 second delay
      },
    },
  ],
};

// Create fault injector
const faultInjector = new FaultInjector(faultConfig, eventLog);

// Create orchestrator with fault injection
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
  faultInjector // Add fault injector
);

// Execute workflow with fault injection enabled
const result = await orchestrator.executeWorkflow(workflowSpec);
```

## Per-Workflow Configuration

You can enable/disable fault injection for specific workflows:

```typescript
const faultConfig: FaultInjectionConfig = {
  enabled: true,
  // Only enable for these workflows
  enabledWorkflows: ['test-workflow', 'dev-workflow'],
  // Disable for these workflows (takes precedence)
  disabledWorkflows: ['production-workflow'],
  rules: [
    {
      type: FaultType.TOOL_FAILURE,
      probability: 1.0, // Always fail (for testing)
      config: {
        errorMessage: 'Simulated failure',
      },
    },
  ],
};
```

## Targeting Specific Tasks

Target specific tasks by ID or tool name:

```typescript
const faultConfig: FaultInjectionConfig = {
  enabled: true,
  rules: [
    {
      type: FaultType.LATENCY_SPIKE,
      probability: 1.0,
      targetTaskIds: ['task-2', 'task-5'], // Only these tasks
      config: {
        delayMs: 1000,
      },
    },
    {
      type: FaultType.TOOL_FAILURE,
      probability: 0.5,
      targetTools: ['database', 'cache'], // Only these tools
      config: {
        errorMessage: 'Service temporarily unavailable',
      },
    },
  ],
};
```

## Partial Outage Simulation

Simulate intermittent service failures:

```typescript
const faultConfig: FaultInjectionConfig = {
  enabled: true,
  rules: [
    {
      type: FaultType.PARTIAL_OUTAGE,
      probability: 0.1, // 10% chance to start an outage
      config: {
        outageDurationMs: 5000, // 5 second outage window
        failureRate: 0.7, // 70% of calls fail during outage
      },
    },
  ],
};
```

## Audit Log Integration

All injected faults are automatically logged to the event log for postmortem analysis:

```typescript
// Read events after workflow execution
const events = await eventLog.read(workflowId);

// Filter for fault injection events
const faultEvents = events.filter(e => e.type === 'FAULT_INJECTED');

faultEvents.forEach(event => {
  console.log('Fault injected:', {
    faultId: event.metadata?.faultId,
    faultType: event.metadata?.faultType,
    taskId: event.taskId,
    toolName: event.metadata?.toolName,
    timestamp: event.timestamp,
  });
});
```

## Dynamic Configuration Updates

Update fault injection configuration at runtime:

```typescript
const faultInjector = new FaultInjector(initialConfig, eventLog);

// Later, update the configuration
faultInjector.updateConfig({
  enabled: true,
  rules: [
    {
      type: FaultType.TOOL_FAILURE,
      probability: 0.5,
      config: { errorMessage: 'Updated failure scenario' },
    },
  ],
});
```

## Testing Retry Logic

Use fault injection to test retry mechanisms:

```typescript
const workflowSpec: WorkflowSpec = {
  id: 'retry-test',
  name: 'Retry Test Workflow',
  tasks: [
    {
      id: 'task-1',
      name: 'Task with Retry',
      type: 'action',
      retry: {
        maxAttempts: 3,
        backoffMs: 1000,
        backoffMultiplier: 2,
      },
    },
  ],
  dependencies: new Map(),
};

// Configure to fail first 2 attempts
const faultConfig: FaultInjectionConfig = {
  enabled: true,
  rules: [
    {
      type: FaultType.TOOL_FAILURE,
      probability: 0.67, // ~2 out of 3 attempts fail
      config: { errorMessage: 'Transient failure' },
    },
  ],
};
```

## Best Practices

1. **Start with low probabilities** in production-like environments
2. **Use per-workflow configuration** to isolate fault injection to test environments
3. **Monitor audit logs** to correlate failures with injected faults
4. **Combine with telemetry** to measure resilience metrics
5. **Test recovery mechanisms** by varying fault types and probabilities
6. **Clear outage state** between test runs for deterministic behavior

```typescript
faultInjector.clearOutageState(); // Reset partial outage state
```

## Complete Example

```typescript
import {
  WorkflowOrchestrator,
  WorkflowSpec,
  TaskSpec,
  FaultInjector,
  FaultType,
  FaultInjectionConfig,
  InMemoryStateStore,
  InMemoryEventLog,
} from '@aureus/kernel';

// Create infrastructure
const stateStore = new InMemoryStateStore();
const eventLog = new InMemoryEventLog();

// Mock executor for demonstration
const mockExecutor = {
  execute: async (task: TaskSpec) => {
    console.log(`Executing task: ${task.name}`);
    return { taskId: task.id, result: 'success' };
  },
};

// Configure fault injection
const faultConfig: FaultInjectionConfig = {
  enabled: true,
  enabledWorkflows: ['chaos-test-workflow'],
  rules: [
    {
      type: FaultType.TOOL_FAILURE,
      probability: 0.3,
      targetTaskIds: ['task-2'],
      config: { errorMessage: 'Simulated API failure' },
    },
    {
      type: FaultType.LATENCY_SPIKE,
      probability: 0.4,
      config: { delayMs: 1500 },
    },
  ],
};

const faultInjector = new FaultInjector(faultConfig, eventLog);

// Create orchestrator with fault injection
const orchestrator = new WorkflowOrchestrator(
  stateStore,
  mockExecutor,
  eventLog,
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  faultInjector
);

// Define workflow
const workflowSpec: WorkflowSpec = {
  id: 'chaos-test-workflow',
  name: 'Chaos Engineering Test',
  tasks: [
    {
      id: 'task-1',
      name: 'Fetch Data',
      type: 'action',
      retry: { maxAttempts: 2, backoffMs: 500 },
    },
    {
      id: 'task-2',
      name: 'Process Data',
      type: 'action',
      retry: { maxAttempts: 3, backoffMs: 1000 },
    },
  ],
  dependencies: new Map([['task-2', ['task-1']]]),
};

// Execute workflow
try {
  const result = await orchestrator.executeWorkflow(workflowSpec);
  console.log('Workflow completed:', result.status);
  
  // Analyze fault injection events
  const events = await eventLog.read('chaos-test-workflow');
  const faultEvents = events.filter(e => e.type === 'FAULT_INJECTED');
  console.log(`Total faults injected: ${faultEvents.length}`);
} catch (error) {
  console.error('Workflow failed:', error);
  
  // Check if failure was due to fault injection
  const events = await eventLog.read('chaos-test-workflow');
  const faultEvents = events.filter(e => e.type === 'FAULT_INJECTED');
  if (faultEvents.length > 0) {
    console.log('Failure caused by injected fault:', faultEvents);
  }
}
```

## Correlation with Observability

When used with the observability package, fault injection events can be correlated with telemetry data:

```typescript
import { TelemetryCollector } from '@aureus/observability';

const telemetry = new TelemetryCollector();

const orchestrator = new WorkflowOrchestrator(
  stateStore,
  executor,
  eventLog,
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  telemetry,
  faultInjector
);

// After execution, analyze impact
const metrics = telemetry.getMetrics();
const faultEvents = await eventLog.read(workflowId);

// Correlate faults with metrics
const faultsInjected = faultEvents.filter(e => e.type === 'FAULT_INJECTED');
console.log({
  totalFaults: faultsInjected.length,
  metrics: {
    taskSuccessRate: metrics.filter(m => m.name === 'task_success_rate'),
    averageDuration: metrics.filter(m => m.name === 'task_duration'),
  },
});
```
