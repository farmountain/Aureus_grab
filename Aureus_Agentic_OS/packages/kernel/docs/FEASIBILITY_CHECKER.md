# Feasibility Check Layer

The Feasibility Check Layer provides pre-execution validation of actions against world model constraints and tool capabilities. This ensures that only safe and feasible actions are executed by the orchestrator.

## Overview

The feasibility checker validates tasks before tool invocation by checking:

1. **Tool Availability**: Whether the requested tool is registered and available
2. **Tool Capabilities**: Whether the tool has the required capabilities
3. **Risk Tier Compatibility**: Whether the tool's risk level is appropriate for the task
4. **Constraint Validation**: Whether the action satisfies world model constraints (hard and soft)
5. **Input Validation**: Whether task inputs are valid
6. **Permission Validation**: Whether required permissions are specified correctly
7. **Allowed Tools**: Whether the tool is in the task's allowed tools list

## Architecture

### Components

1. **FeasibilityChecker**: Main class that orchestrates feasibility checks
2. **ToolRegistry**: Manages available tools and their capabilities
3. **ConstraintEngine** (from world-model): Validates actions against constraints
4. **FeasibilityCheckResult**: Contains check results and violation details

### Integration with Orchestrator

The feasibility checker is integrated into the `WorkflowOrchestrator` execution pipeline:

```
Task Execution Flow:
1. Policy Gate Check (permissions, approval)
2. ✨ Feasibility Check (NEW) ✨
3. State Snapshot
4. Tool Execution
5. CRV Gate Validation
6. State Update
```

## Usage

### Basic Setup

```typescript
import { 
  WorkflowOrchestrator,
  FeasibilityChecker,
  ToolRegistry,
  ToolInfo 
} from '@aureus/kernel';

// Create tool registry
const toolRegistry = new ToolRegistry();

// Register tools
const httpTool: ToolInfo = {
  name: 'http-client',
  capabilities: ['http-get', 'http-post'],
  available: true,
  riskLevel: 'LOW',
};
toolRegistry.registerTool(httpTool);

// Create feasibility checker
const feasibilityChecker = new FeasibilityChecker(toolRegistry);

// Create orchestrator with feasibility checker
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
  undefined, // faultInjector
  undefined, // hypothesisManager
  undefined, // sandboxIntegration
  feasibilityChecker // Add feasibility checker here
);
```

### With Constraint Engine

```typescript
import { ConstraintEngine, HardConstraint, WorldState } from '@aureus/world-model';

// Create world state
const worldState: WorldState = {
  id: 'world-1',
  entities: new Map(),
  relationships: [],
  constraints: [],
  timestamp: new Date(),
};

// Create constraint engine
const constraintEngine = new ConstraintEngine();

// Add hard constraint
const noDeleteConstraint: HardConstraint = {
  id: 'no-delete',
  description: 'Deletion operations are not allowed',
  category: 'policy',
  severity: 'hard',
  predicate: (state, action) => action !== 'delete-tool',
  violationMessage: 'Deletion is forbidden by policy',
};
constraintEngine.addHardConstraint(noDeleteConstraint);

// Create feasibility checker with constraints
const feasibilityChecker = new FeasibilityChecker(
  toolRegistry,
  constraintEngine,
  worldState
);
```

### Standalone Feasibility Check

You can also use the feasibility checker standalone to validate tasks:

```typescript
const task: TaskSpec = {
  id: 'task-1',
  name: 'Fetch Data',
  type: 'action',
  toolName: 'http-client',
  riskTier: 'LOW',
};

const result = await feasibilityChecker.checkFeasibility(task);

if (!result.feasible) {
  console.error('Task is not feasible:', result.reasons);
} else {
  console.log('Task is feasible with confidence:', result.confidenceScore);
}
```

### Batch Feasibility Checks

Check multiple tasks at once:

```typescript
const tasks: TaskSpec[] = [
  { id: 'task-1', name: 'Task 1', type: 'action', toolName: 'tool-1' },
  { id: 'task-2', name: 'Task 2', type: 'action', toolName: 'tool-2' },
];

const results = await feasibilityChecker.checkBatchFeasibility(tasks);

results.forEach((result, taskId) => {
  console.log(`Task ${taskId}: ${result.feasible ? 'Feasible' : 'Not Feasible'}`);
});
```

## API Reference

### FeasibilityChecker

#### Constructor
```typescript
constructor(
  toolRegistry?: ToolRegistry,
  constraintEngine?: ConstraintEngine,
  worldState?: WorldState
)
```

#### Methods

- `checkFeasibility(task: TaskSpec): Promise<FeasibilityCheckResult>`
  - Checks if a task is feasible to execute
  - Returns detailed result with reasons for infeasibility

- `checkBatchFeasibility(tasks: TaskSpec[]): Promise<Map<string, FeasibilityCheckResult>>`
  - Checks feasibility for multiple tasks
  - Returns map of task IDs to results

- `isActionAllowed(action: string, params?: Record<string, unknown>): boolean`
  - Checks if an action is allowed based on constraints only
  - Returns true if allowed, false otherwise

- `getActionScore(action: string, params?: Record<string, unknown>): number`
  - Gets satisfaction score for an action based on soft constraints
  - Returns value between 0 and 1

- `updateWorldState(state: WorldState): void`
  - Updates the world state used for constraint validation

- `getToolRegistry(): ToolRegistry`
  - Returns the tool registry

- `getConstraintEngine(): ConstraintEngine | undefined`
  - Returns the constraint engine if configured

- `setConstraintEngine(engine: ConstraintEngine): void`
  - Sets the constraint engine

### ToolRegistry

#### Methods

- `registerTool(tool: ToolInfo): void`
  - Registers a tool with its capabilities

- `unregisterTool(toolName: string): boolean`
  - Unregisters a tool

- `getTool(toolName: string): ToolInfo | undefined`
  - Gets tool information

- `isToolAvailable(toolName: string): boolean`
  - Checks if a tool is available

- `getAvailableTools(): ToolInfo[]`
  - Gets all available tools

- `hasCapabilities(toolName: string, requiredCapabilities: string[]): { hasAll: boolean; missing: string[] }`
  - Checks if a tool has required capabilities

- `clear(): void`
  - Clears all registered tools

### FeasibilityCheckResult

```typescript
interface FeasibilityCheckResult {
  feasible: boolean;
  reasons: string[];
  constraintValidation?: ConstraintValidationResult;
  toolCapabilityCheck?: {
    available: boolean;
    missingCapabilities?: string[];
  };
  confidenceScore?: number;
  metadata?: Record<string, unknown>;
}
```

### ToolInfo

```typescript
interface ToolInfo {
  name: string;
  capabilities: string[];
  available: boolean;
  riskLevel?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  requiredPermissions?: string[];
}
```

## Event Logging

When a feasibility check is performed, it logs events to the event log:

```typescript
{
  type: 'STATE_UPDATED',
  metadata: {
    feasibilityCheck: {
      feasible: true,
      reasons: [],
      confidenceScore: 0.85,
      toolCapabilityCheck: {
        available: true
      }
    }
  }
}
```

Failed checks also log a `TASK_FAILED` event:

```typescript
{
  type: 'TASK_FAILED',
  metadata: {
    feasibilityBlocked: true,
    feasibilityReasons: ['Tool not available', 'Risk level mismatch']
  }
}
```

## Telemetry

Feasibility checks record telemetry metrics:

```typescript
{
  name: 'feasibility_check',
  value: 1, // 1 for feasible, 0 for not feasible
  tags: {
    workflowId: 'workflow-1',
    taskId: 'task-1',
    toolName: 'http-client'
  }
}
```

## Examples

See `/packages/kernel/examples/feasibility-usage.ts` for comprehensive examples including:

1. Basic tool registration and checking
2. Constraint-based feasibility checking
3. Integration with workflow orchestrator
4. Risk tier validation

## Testing

Run the test suite:

```bash
cd packages/kernel
npm test tests/feasibility.test.ts
npm test tests/feasibility-integration.test.ts
```

## Benefits

1. **Early Failure Detection**: Catches infeasible actions before execution
2. **Safety**: Enforces constraints and policies before side effects occur
3. **Resource Protection**: Prevents execution of unavailable or inappropriate tools
4. **Clear Error Messages**: Provides detailed reasons for infeasibility
5. **Observability**: Logs and metrics for feasibility checks
6. **Flexibility**: Supports hard and soft constraints with confidence scoring

## Future Enhancements

Potential future improvements:

1. **Dynamic Tool Discovery**: Auto-discover available tools from environment
2. **Capability Learning**: Learn tool capabilities from past executions
3. **Predictive Feasibility**: Use ML to predict feasibility before full check
4. **Feasibility Caching**: Cache feasibility results for identical tasks
5. **Alternative Suggestions**: Suggest alternative tools when primary is infeasible
6. **Cost Estimation**: Estimate execution cost during feasibility check
