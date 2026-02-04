# Sandbox Execution Path

## Overview

The sandbox execution path provides a secure, auditable way to execute tools with side effect capture, permission validation, and CRV (Circuit Reasoning Validation) integration. This feature is essential for:

- **Testing and Validation**: Simulate tool execution without actual side effects
- **Security**: Execute untrusted code in isolated environments
- **Auditability**: Log all tool executions to HipCortex for compliance
- **Risk Mitigation**: Apply CRV validation to simulated outputs before committing

## Architecture

### Components

1. **SimulationSandboxProvider** (`packages/tools/src/sandbox/simulation-provider.ts`)
   - Captures side effects without executing them
   - Validates permissions against captured effects
   - Provides simulated responses for testing

2. **SandboxIntegration** (`packages/kernel/src/sandbox-integration.ts`)
   - Wires sandbox execution into the kernel orchestrator
   - Manages sandbox lifecycle (create, execute, destroy)
   - Logs all results to HipCortex for auditability
   - Runs CRV validation on simulated outputs

3. **WorkflowOrchestrator Integration**
   - Automatically routes sandboxed tasks through SandboxIntegration
   - Applies risk-based sandbox configurations (HIGH risk → restrictive)
   - Preserves all existing orchestrator features (CRV, policy, memory)

### Execution Flow

```
Task Execution Request
    ↓
Check sandboxConfig.enabled?
    ↓ Yes
Create Sandbox (type: simulation/mock/container)
    ↓
Execute Tool in Sandbox
    ↓
Capture Side Effects (simulation mode)
    ↓
Run CRV Validation on Output
    ↓
Log to HipCortex (with metadata)
    ↓
Destroy Sandbox (if not persistent)
    ↓
Return Result with Metadata
```

## Configuration

### Task-Level Configuration

Add `sandboxConfig` to any `TaskSpec`:

```typescript
const task: TaskSpec = {
  id: 'my-task',
  name: 'My Task',
  type: 'action',
  inputs: { /* ... */ },
  
  // Sandbox configuration
  sandboxConfig: {
    enabled: true,              // Enable sandbox execution
    simulationMode: true,       // Capture side effects without executing
    type: 'simulation',         // sandbox type (simulation/mock/container/vm)
    permissions: {              // Optional: override default permissions
      filesystem: {
        readOnlyPaths: ['/tmp'],
        deniedPaths: ['/etc'],
      },
      network: {
        enabled: false,
      },
    },
  },
  
  // Risk tier affects default sandbox configuration
  riskTier: 'HIGH',  // HIGH/CRITICAL → restrictive sandbox
};
```

### Orchestrator Integration

```typescript
import { WorkflowOrchestrator, SandboxIntegration } from '@aureus/kernel';

// Create sandbox integration
const sandboxIntegration = new SandboxIntegration(telemetry);

// Pass to orchestrator
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
  hypothesisManager,
  sandboxIntegration  // <-- Add sandbox integration
);
```

## Features

### 1. Side Effect Capture

When `simulationMode: true`, the sandbox captures all side effects without executing them:

```typescript
export interface CapturedSideEffect {
  type: 'filesystem_write' | 'filesystem_read' | 'network_request' | 'state_mutation' | 'external_api_call';
  timestamp: Date;
  details: Record<string, unknown>;
  simulatedResult?: unknown;
  wouldSucceed: boolean;
  failureReason?: string;
}
```

Side effects are validated against sandbox permissions and logged.

**Tool Implementation Note**: Tools can detect simulation mode by checking for `SIMULATION_CONTEXT_KEY` in their parameters:

```typescript
import { SIMULATION_CONTEXT_KEY, SimulationContext } from '@aureus/tools';

async function myTool(params: Record<string, unknown>) {
  const simContext = params[SIMULATION_CONTEXT_KEY] as SimulationContext | undefined;
  
  if (simContext?.isSimulation) {
    // Record side effect instead of executing
    simContext.recordSideEffect({
      type: 'filesystem_write',
      timestamp: new Date(),
      details: { path: params.path, content: params.content },
      wouldSucceed: true,
    });
    return { simulated: true };
  }
  
  // Normal execution
  return actualExecution(params);
}
```

### 2. CRV Validation

All sandbox outputs are validated through CRV gates before being committed:

```typescript
// CRV validation happens automatically
const result = await sandboxIntegration.executeInSandbox(
  task,
  taskState,
  executor,
  {
    workflowId: 'workflow-1',
    taskId: 'task-1',
    crvGate,  // CRV gate for validation
  }
);

// Check validation results
if (result.metadata.crvValidation?.blockedCommit) {
  console.log('CRV validation failed:', result.error);
}
```

### 3. HipCortex Logging

All sandbox executions are automatically logged to HipCortex with:

- Task and workflow context
- Execution results (success/failure)
- Side effects captured
- CRV validation results
- Resource usage
- Provenance information

```typescript
// Query audit trail
const auditEntries = memoryAPI.read({ 
  tags: ['sandbox_execution', 'simulation_mode'] 
});

auditEntries.forEach(entry => {
  const content = entry.content as any;
  console.log(`Task: ${content.taskName}`);
  console.log(`Success: ${content.result.success}`);
  console.log(`Side Effects: ${content.result.sideEffectCount}`);
});
```

### 4. Risk-Based Configuration

The sandbox automatically applies appropriate configurations based on task risk:

| Risk Tier | Default Config | Characteristics |
|-----------|---------------|-----------------|
| LOW       | Standard      | Moderate permissions, 512MB memory |
| MEDIUM    | Standard      | Moderate permissions, 512MB memory |
| HIGH      | Restrictive   | Minimal permissions, 256MB memory, no network |
| CRITICAL  | Restrictive   | Minimal permissions, 256MB memory, no network |

Override defaults by providing custom `permissions` in `sandboxConfig`.

## Usage Examples

### Example 1: Basic Simulation

```typescript
const task: TaskSpec = {
  id: 'write-config',
  name: 'Write Configuration',
  type: 'action',
  inputs: {
    path: '/etc/app/config.json',
    content: JSON.stringify({ apiKey: 'secret' }),
  },
  sandboxConfig: {
    enabled: true,
    simulationMode: true,
  },
};

const result = await sandboxIntegration.executeInSandbox(
  task,
  taskState,
  executor,
  context
);

// Result includes:
// - result.metadata.simulationMode: true
// - result.metadata.sideEffects: [captured effects]
// - result.metadata.hipCortexEntryId: audit log ID
```

### Example 2: Production Execution with Validation

```typescript
const task: TaskSpec = {
  id: 'deploy-service',
  name: 'Deploy to Production',
  type: 'action',
  riskTier: 'HIGH',
  sandboxConfig: {
    enabled: true,
    simulationMode: false,  // Real execution
    type: 'container',      // Container isolation
  },
};

// Executes in isolated container with CRV validation
const result = await sandboxIntegration.executeInSandbox(
  task,
  taskState,
  executor,
  { workflowId, taskId, crvGate, memoryAPI }
);
```

### Example 3: Test Dangerous Operations Safely

```typescript
// Test a database migration without touching the database
const task: TaskSpec = {
  id: 'db-migration',
  name: 'Migrate Production Database',
  type: 'action',
  riskTier: 'CRITICAL',
  inputs: {
    database: 'production',
    migrations: ['001_add_users', '002_add_orders'],
  },
  sandboxConfig: {
    enabled: true,
    simulationMode: true,  // SIMULATE - don't touch prod!
  },
};

const result = await sandboxIntegration.executeInSandbox(
  task,
  taskState,
  executor,
  context
);

// Review side effects before real execution
console.log('Would execute migrations:');
result.metadata.sideEffects?.forEach(effect => {
  console.log(`- ${effect.type}: ${JSON.stringify(effect.details)}`);
});

// After review, execute for real by setting simulationMode: false
```

## Testing

### Unit Tests

Run sandbox tests:

```bash
# Test simulation provider
npm test --workspace=@aureus/tools -- simulation-provider.test.ts

# Test sandbox integration
npm test --workspace=@aureus/kernel -- sandbox-integration.test.ts

# Test sandbox executor
npm test --workspace=@aureus/tools -- sandbox-executor.test.ts
```

### Integration Testing

The sandbox integrates with:
- ✅ CRV validation gates
- ✅ HipCortex memory/audit logging
- ✅ Policy enforcement (Goal-Guard FSM)
- ✅ Telemetry collection
- ✅ World model state management

## Metadata Structure

Sandbox execution results include comprehensive metadata:

```typescript
interface SandboxExecutionOutput {
  success: boolean;
  data?: unknown;
  error?: string;
  metadata: {
    sandboxId: string;           // Unique sandbox identifier
    executionTime: number;       // Execution time in ms
    simulationMode: boolean;     // Was this simulated?
    sideEffects?: CapturedSideEffect[];  // Captured effects (simulation)
    crvValidation?: {            // CRV validation results
      passed: boolean;
      blockedCommit: boolean;
      validationResults: unknown[];
    };
    hipCortexEntryId?: string;   // Audit log entry ID
  };
}
```

## Best Practices

1. **Always Enable Simulation for Dangerous Operations**
   ```typescript
   sandboxConfig: {
     enabled: true,
     simulationMode: true,  // Safe by default
   }
   ```

2. **Use Appropriate Risk Tiers**
   - `LOW`: Read-only operations
   - `MEDIUM`: Non-critical writes
   - `HIGH`: Production updates, deletions
   - `CRITICAL`: Database migrations, infra changes

3. **Review Side Effects Before Production**
   ```typescript
   // 1. Simulate first
   const simResult = await executeWithSimulation(task);
   
   // 2. Review side effects
   console.log('Side effects:', simResult.metadata.sideEffects);
   
   // 3. Get approval
   if (await getHumanApproval(simResult)) {
     // 4. Execute for real
     task.sandboxConfig.simulationMode = false;
     const realResult = await executeInSandbox(task);
   }
   ```

4. **Monitor Audit Logs**
   ```typescript
   // Query recent sandbox executions
   const recentExecutions = memoryAPI.read({
     tags: ['sandbox_execution'],
     timeRange: {
       start: new Date(Date.now() - 24 * 60 * 60 * 1000),
       end: new Date(),
     },
   });
   ```

## Limitations

1. **Simulation Accuracy**: Side effects are captured based on tool implementation. Tools must properly use the simulation context.

2. **Container Support**: Container-based sandboxes require Docker/Podman. Currently uses mock provider by default.

3. **Performance**: Sandbox creation adds overhead (~10-50ms). Consider persistent sandboxes for repeated executions.

4. **Network Isolation**: Full network isolation requires container/VM sandboxes. Mock sandboxes only validate permissions.

## Future Enhancements

- [ ] WebAssembly sandbox provider for true isolation
- [ ] GPU/TPU resource limits for ML workloads
- [ ] Distributed sandbox pools for scaling
- [ ] Real-time side effect streaming
- [ ] Sandbox snapshots for rollback
- [ ] Advanced permission models (SELinux, AppArmor)

## Troubleshooting

### Problem: Sandbox execution slow

**Solution**: Use persistent sandboxes or mock provider:
```typescript
sandboxConfig: {
  enabled: true,
  type: 'mock',  // Faster than container
  persistent: true,  // Reuse sandbox
}
```

### Problem: Permission violations not detected

**Solution**: Ensure sandbox permissions are configured:
```typescript
sandboxConfig: {
  enabled: true,
  permissions: {
    filesystem: {
      deniedPaths: ['/etc', '/sys', '/proc'],
    },
  },
}
```

### Problem: HipCortex entries missing

**Solution**: Verify memoryAPI is passed to context:
```typescript
await sandboxIntegration.executeInSandbox(
  task,
  taskState,
  executor,
  {
    workflowId,
    taskId,
    memoryAPI,  // Required for logging
  }
);
```

## See Also

- [CRV Implementation Guide](../packages/crv/README.md)
- [HipCortex Memory System](../packages/memory-hipcortex/README.md)
- [Policy Enforcement](../packages/policy/README.md)
- [Examples](../packages/kernel/examples/sandbox-execution-example.ts)
