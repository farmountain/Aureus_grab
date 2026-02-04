# Side-Effect Safety Model

## Overview

The Aureus Agentic OS implements a comprehensive side-effect safety model to ensure that workflows with side effects (such as file writes, API calls, database modifications) can be executed reliably even in the presence of failures and retries. The model consists of three key mechanisms:

1. **Idempotency Keys**: Unique identifiers for tool invocations that prevent duplicate execution on retries
2. **ToolResultCache**: A cache that stores and replays tool execution results
3. **Saga Compensation**: Automatic rollback of completed steps when a workflow fails

## Idempotency Keys

### Key Generation

Idempotency keys are automatically generated for each tool invocation based on:
- **Task ID**: The unique identifier of the task
- **Step ID**: The step within the task
- **Tool ID**: The identifier of the tool being executed
- **Normalized Args**: Arguments passed to the tool (sorted for consistency)

The key is computed as a SHA-256 hash:
```
hash(task_id + step_id + tool_id + normalized_args)
```

### Argument Normalization

Arguments are normalized before hashing to ensure consistent key generation:
- Object keys are sorted alphabetically
- Nested objects are recursively normalized
- Arrays preserve their order (not sorted)

Example:
```typescript
import { generateIdempotencyKey } from '@aureus/tools';

const key = generateIdempotencyKey(
  'task-1',
  'step-1', 
  'write-file',
  { path: '/tmp/file.txt', content: 'Hello' }
);
// => '3f7b9c...' (64-char hex string)
```

## ToolResultCache

### Purpose

The ToolResultCache stores the results of tool executions keyed by their idempotency key. When a tool is invoked with the same parameters (resulting in the same idempotency key), the cached result is returned instead of re-executing the tool.

### Cache Interface

```typescript
interface ToolResultCache {
  get(idempotencyKey: string): Promise<CachedToolResult | null>;
  set(idempotencyKey: string, result: ToolResult): Promise<void>;
  has(idempotencyKey: string): Promise<boolean>;
  clear(idempotencyKey: string): Promise<void>;
  clearAll(): Promise<void>;
}
```

### Cached Results

Cached results include:
- **success**: Whether the tool execution succeeded
- **data**: The result data from the tool
- **error**: Error message if the tool failed
- **metadata**: Additional metadata
- **idempotencyKey**: The key used for caching
- **timestamp**: When the result was cached
- **replayed**: Flag indicating if this result was replayed from cache

### Cache Behavior

1. **Successful executions are cached**: Results from successful tool invocations are stored in the cache
2. **Failures are NOT cached**: Failed executions are not cached, allowing retries to attempt the operation again
3. **Replayed results are marked**: When a result is retrieved from cache, it includes `replayed: true` in metadata
4. **Tools without side effects can opt-out**: Tools can set `hasSideEffects: false` to disable caching

### Usage Example

```typescript
import { SafeToolWrapper, InMemoryToolResultCache } from '@aureus/tools';

const cache = new InMemoryToolResultCache();
const wrapper = new SafeToolWrapper(writeFileTool);

const context = {
  taskId: 'task-1',
  stepId: 'step-1',
  cache,
};

// First execution - tool is invoked
const result1 = await wrapper.execute(
  { path: '/tmp/file.txt', content: 'Hello' },
  context
);
// result1.metadata.replayed is undefined

// Second execution - result is replayed from cache
const result2 = await wrapper.execute(
  { path: '/tmp/file.txt', content: 'Hello' },
  context
);
// result2.metadata.replayed === true
// Tool was NOT executed again
```

## Saga Compensation

### Purpose

Saga compensation provides a mechanism to rollback or undo completed steps when a workflow fails. This is essential for maintaining consistency when dealing with distributed transactions or multi-step operations that cannot be rolled back atomically.

### Compensation Actions

Each task can define a compensation action that specifies:
- **tool**: The tool ID to execute for compensation
- **args**: Arguments to pass to the compensation tool

```typescript
const task: TaskSpec = {
  id: 'write-file',
  name: 'Write File',
  type: 'action',
  compensationAction: {
    tool: 'delete-file',
    args: { path: '/tmp/file.txt' }
  }
};
```

### Compensation Execution

When a workflow fails:
1. **Only completed steps are compensated**: Steps that didn't complete successfully are not compensated
2. **Reverse order execution**: Compensations are executed in LIFO (Last In, First Out) order
3. **Best-effort execution**: If a compensation fails, it's logged but doesn't prevent other compensations from running
4. **Optional per-task**: Tasks without `compensationAction` are skipped during compensation

### Compensation Events

The following events are logged during compensation:
- **COMPENSATION_TRIGGERED**: When a compensation is about to be executed
- **COMPENSATION_COMPLETED**: When a compensation succeeds
- **COMPENSATION_FAILED**: When a compensation fails

### Example

```typescript
import { WorkflowOrchestrator, CompensationExecutor } from '@aureus/kernel';

// Define compensation executor
const compensationExecutor: CompensationExecutor = {
  execute: async (action, workflowId, taskId) => {
    const tool = toolRegistry.get(action.tool);
    if (tool) {
      await tool.execute(action.args);
    }
  }
};

// Create orchestrator with compensation support
const orchestrator = new WorkflowOrchestrator(
  stateStore,
  executor,
  eventLog,
  compensationExecutor
);

// Define workflow with compensation actions
const workflow: WorkflowSpec = {
  id: 'file-processing',
  name: 'File Processing Workflow',
  tasks: [
    {
      id: 'create-temp-file',
      name: 'Create Temporary File',
      type: 'action',
      compensationAction: {
        tool: 'delete-file',
        args: { path: '/tmp/temp.txt' }
      }
    },
    {
      id: 'process-file',
      name: 'Process File',
      type: 'action',
      compensationAction: {
        tool: 'rollback-processing',
        args: { fileId: 'temp' }
      }
    },
    {
      id: 'upload-file',
      name: 'Upload File',
      type: 'action',
      retry: { maxAttempts: 3, backoffMs: 1000 }
    }
  ],
  dependencies: new Map([
    ['process-file', ['create-temp-file']],
    ['upload-file', ['process-file']]
  ])
};

// Execute workflow
try {
  await orchestrator.executeWorkflow(workflow);
} catch (error) {
  // If upload-file fails after retries:
  // 1. rollback-processing is executed (for process-file)
  // 2. delete-file is executed (for create-temp-file)
  console.error('Workflow failed, compensations executed');
}
```

## Integration with WorkflowOrchestrator

The WorkflowOrchestrator automatically handles side-effect safety:

1. **Idempotency**: Uses task idempotency keys to skip already-completed tasks on resume
2. **Result Caching**: Passes tool result cache to tool executors for automatic caching
3. **Compensation**: Tracks completed steps and executes compensations on failure

### Tool Executor Integration

Tool executors should pass the cache context when invoking tools:

```typescript
const executor: TaskExecutor = {
  execute: async (task: TaskSpec, state: TaskState) => {
    const toolWrapper = registry.createSafeWrapper(task.toolId);
    
    const context = {
      taskId: task.id,
      stepId: state.attempt.toString(),
      cache: toolResultCache
    };
    
    return await toolWrapper.execute(task.inputs, context);
  }
};
```

## Production Considerations

### Cache Implementation

In production environments:
- Use a distributed cache (e.g., Redis, Memcached) instead of `InMemoryToolResultCache`
- Set appropriate TTL (Time To Live) for cached entries
- Consider cache eviction policies for long-running workflows
- Ensure cache is shared across workflow instances for horizontal scaling

### Compensation Design

When designing compensation actions:
- Make compensations idempotent (safe to execute multiple times)
- Design compensations to be tolerant of partial failures
- Log compensation execution for audit trails
- Consider implementing compensation retries for critical rollbacks
- Test compensation paths as thoroughly as success paths

### Monitoring

Monitor the following metrics:
- Cache hit rate for tool executions
- Number of compensations triggered per workflow
- Compensation success/failure rates
- Duration of compensation executions

## Invariant Guarantees

The side-effect safety model maintains the following invariants:

1. **Idempotency (Invariant 2)**: Retries don't duplicate side effects
   - Tools with side effects are executed at most once per unique invocation
   - Cached results are replayed on retries

2. **Durability (Invariant 1)**: State is persisted and workflows can resume
   - Workflow state is saved after each task completion
   - On resume, completed tasks are skipped using idempotency

3. **Auditability (Invariant 5)**: All actions are logged
   - Tool executions are logged with idempotency keys
   - Compensation actions are logged with COMPENSATION_* events
   - Cache hits/misses can be tracked via replay metadata

4. **Consistency**: Failed workflows trigger compensations
   - Completed steps are compensated in reverse order
   - Best-effort compensation ensures cleanup even with partial failures

## API Reference

### @aureus/tools

```typescript
// Generate idempotency key
function generateIdempotencyKey(
  taskId: string,
  stepId: string,
  toolId: string,
  args: Record<string, unknown>
): string;

// Normalize arguments for consistent hashing
function normalizeArgs(args: Record<string, unknown>): Record<string, unknown>;

// Tool result cache interface
interface ToolResultCache {
  get(key: string): Promise<CachedToolResult | null>;
  set(key: string, result: ToolResult): Promise<void>;
  has(key: string): Promise<boolean>;
  clear(key: string): Promise<void>;
  clearAll(): Promise<void>;
}

// In-memory cache implementation
class InMemoryToolResultCache implements ToolResultCache;

// Tool execution context
interface ToolExecutionContext {
  taskId: string;
  stepId: string;
  cache?: ToolResultCache;
}

// Safe tool wrapper with idempotency
class SafeToolWrapper {
  execute(
    params: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult>;
}
```

### @aureus/kernel

```typescript
// Compensation action definition
interface CompensationAction {
  tool: string;
  args: Record<string, unknown>;
}

// Task specification with compensation
interface TaskSpec {
  id: string;
  name: string;
  type: 'action' | 'decision' | 'parallel';
  compensationAction?: CompensationAction;
  // ... other fields
}

// Compensation executor interface
interface CompensationExecutor {
  execute(
    action: CompensationAction,
    workflowId: string,
    taskId: string
  ): Promise<void>;
}

// Workflow orchestrator with compensation support
class WorkflowOrchestrator {
  constructor(
    stateStore: StateStore,
    executor: TaskExecutor,
    eventLog?: EventLog,
    compensationExecutor?: CompensationExecutor
  );
}

// Event types
type EventType = 
  | 'COMPENSATION_TRIGGERED'
  | 'COMPENSATION_COMPLETED'
  | 'COMPENSATION_FAILED'
  | // ... other events
```

## Examples

See the test files for complete examples:
- `packages/tools/tests/safe-tool-wrapper.test.ts`: Tool idempotency examples
- `packages/kernel/tests/side-effect-safety.test.ts`: Saga compensation examples

## Migration Guide

### For Existing Workflows

To add side-effect safety to existing workflows:

1. **Add compensation actions to tasks**:
   ```typescript
   {
     id: 'my-task',
     compensationAction: {
       tool: 'undo-my-task',
       args: { /* undo parameters */ }
     }
   }
   ```

2. **Create compensation tools**:
   ```typescript
   const undoTool: ToolSpec = {
     id: 'undo-my-task',
     execute: async (args) => {
       // Undo logic
     }
   };
   toolRegistry.register(undoTool);
   ```

3. **Implement CompensationExecutor**:
   ```typescript
   const compensationExecutor: CompensationExecutor = {
     execute: async (action, workflowId, taskId) => {
       const tool = toolRegistry.get(action.tool);
       await tool.execute(action.args);
     }
   };
   ```

4. **Pass cache to tool wrappers**:
   ```typescript
   const context = {
     taskId: task.id,
     stepId: state.attempt.toString(),
     cache: toolResultCache
   };
   await toolWrapper.execute(params, context);
   ```

### For New Workflows

When creating new workflows:
- Design compensation actions alongside forward actions
- Mark tools with side effects using `hasSideEffects: true`
- Use idempotent compensation logic
- Test both success and failure paths
