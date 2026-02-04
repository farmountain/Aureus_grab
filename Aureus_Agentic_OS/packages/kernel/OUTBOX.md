# Outbox Pattern for Durable Side Effects

The outbox pattern ensures that side effects are executed reliably with the following guarantees:

1. **Durable Storage**: Side effect intentions are stored before execution
2. **Exactly-Once Execution**: Side effects are committed only once
3. **Replay Protection**: Duplicate requests return cached results
4. **Reconciliation**: Failed or stuck entries can be recovered

## Architecture

### Core Components

- **OutboxEntry**: Represents an intended side effect with state tracking
- **OutboxStore**: Durable storage for outbox entries
- **OutboxService**: High-level API for managing side effects
- **OutboxServiceAdapter**: Adapter for tools package integration

### Entry States

- `PENDING`: Entry created, ready for processing
- `PROCESSING`: Entry currently being executed
- `COMMITTED`: Entry successfully executed
- `FAILED`: Entry failed, may retry
- `DEAD_LETTER`: Entry permanently failed after max attempts

## Usage

### Basic Usage (Kernel)

```typescript
import { DefaultOutboxService, InMemoryOutboxStore } from '@aureus/kernel';

// Create outbox service
const store = new InMemoryOutboxStore();
const outbox = new DefaultOutboxService(store);

// Execute a side effect through outbox
const result = await outbox.execute(
  'workflow-1',      // workflowId
  'task-1',          // taskId
  'file-write',      // toolId
  { path: '/tmp/test.txt', content: 'hello' },  // params
  'unique-key-123',  // idempotencyKey
  async (params) => {
    // Execute the actual side effect
    return fs.promises.writeFile(params.path, params.content);
  },
  3  // maxAttempts
);
```

### Integration with Tools

The outbox is automatically integrated with the tools package when provided in the execution context:

```typescript
import { SafeToolWrapper, createOutboxAdapter } from '@aureus/tools';
import { DefaultOutboxService, InMemoryOutboxStore } from '@aureus/kernel';

// Setup outbox
const store = new InMemoryOutboxStore();
const outboxService = new DefaultOutboxService(store);
const outboxAdapter = createOutboxAdapter(outboxService);

// Create tool wrapper
const tool = {
  id: 'file-write',
  name: 'File Write',
  description: 'Write to a file',
  parameters: [],
  sideEffect: true,  // Mark as having side effects
  execute: async (params) => {
    return fs.promises.writeFile(params.path, params.content);
  },
};

const wrapper = new SafeToolWrapper(tool);

// Execute with outbox context
const result = await wrapper.execute(
  { path: '/tmp/test.txt', content: 'hello' },
  {
    workflowId: 'wf-1',
    taskId: 'task-1',
    stepId: 'step-1',
    outbox: outboxAdapter,  // Provide outbox adapter
  }
);
```

### Replay Protection

When the same operation is attempted multiple times (e.g., due to retries), the outbox returns the cached result:

```typescript
// First execution - actually runs
const result1 = await outbox.execute(
  'wf-1', 'task-1', 'tool-1',
  { data: 'test' },
  'same-key',
  executor
);

// Second execution - returns cached result without re-executing
const result2 = await outbox.execute(
  'wf-1', 'task-1', 'tool-1',
  { data: 'test' },
  'same-key',
  executor
);

// result1 === result2, executor called only once
```

### Reconciliation

Reconciliation helps recover from failures or stuck entries:

```typescript
// Reconcile all pending/processing/failed entries
const results = await outbox.reconcile({
  maxAgeMs: 24 * 60 * 60 * 1000,  // Only reconcile entries < 24 hours old
  autoRetry: true,  // Automatically retry failed entries
});

// Custom reconciliation logic
const results = await outbox.reconcile({
  onReconcile: async (entry) => {
    // Custom logic for each entry
    return {
      needsReconciliation: true,
      actions: [{ type: 'retry', reason: 'Custom retry', timestamp: new Date() }],
    };
  },
});
```

### Cleanup

Remove old committed entries to free storage:

```typescript
// Cleanup entries committed more than 7 days ago
const cleaned = await outbox.cleanup(7 * 24 * 60 * 60 * 1000);
console.log(`Cleaned ${cleaned} old entries`);
```

## Storage Implementations

### In-Memory Store (Testing)

```typescript
import { InMemoryOutboxStore } from '@aureus/kernel';

const store = new InMemoryOutboxStore();
```

### File System Store (Production)

```typescript
import { FileSystemOutboxStore } from '@aureus/kernel';

const store = new FileSystemOutboxStore('./var/outbox');
```

The file system store persists entries in:
- `./var/outbox/<workflowId>/<entryId>.json`
- `./var/outbox/_index/` (indexes for fast lookup)

## Best Practices

1. **Idempotency Keys**: Use deterministic keys based on operation parameters
   - Example: `hash(taskId + stepId + toolId + params)`

2. **Cleanup**: Regularly cleanup old committed entries to prevent unbounded growth
   ```typescript
   setInterval(async () => {
     await outbox.cleanup(7 * 24 * 60 * 60 * 1000);
   }, 24 * 60 * 60 * 1000);  // Daily cleanup
   ```

3. **Reconciliation**: Run periodic reconciliation to recover stuck entries
   ```typescript
   setInterval(async () => {
     await outbox.reconcile({ autoRetry: true });
   }, 5 * 60 * 1000);  // Every 5 minutes
   ```

4. **Monitoring**: Track outbox metrics
   - Number of pending entries
   - Number of failed entries
   - Number of dead letter entries
   - Reconciliation success rate

5. **Max Attempts**: Set appropriate retry limits based on operation criticality
   - Read operations: 1-2 attempts
   - Write operations: 3-5 attempts
   - Critical operations: 5-10 attempts

## Implementation Details

### Entry Lifecycle

```
PENDING → PROCESSING → COMMITTED
                    ↓
                  FAILED → DEAD_LETTER (after max attempts)
```

### Reconciliation Triggers

1. **Stuck Processing**: Entry in PROCESSING state for > 5 minutes
   - Action: Reset to PENDING

2. **Failed with Retry**: Entry in FAILED state with attempts < maxAttempts
   - Action: Reset to PENDING (if autoRetry enabled)

3. **Old Entries**: Entries older than maxAgeMs
   - Action: Skip (no reconciliation)

### Error Handling

- **Execution Errors**: Marked as FAILED, can be retried
- **Validation Errors**: Not stored in outbox (fail fast)
- **Storage Errors**: Propagate to caller (outbox integrity preserved)

## Testing

Run the outbox tests:

```bash
cd packages/kernel
npm test -- outbox.test.ts
```

Run the tools integration tests:

```bash
cd packages/tools
npm test -- outbox-integration.test.ts
```

## Migration from Cache-Based Idempotency

The outbox pattern is backward compatible. Tools will automatically prefer outbox over cache when both are available:

```typescript
// Old: cache-based
const context = {
  workflowId: 'wf-1',
  taskId: 'task-1',
  stepId: 'step-1',
  cache: myCache,
};

// New: outbox-based (preferred)
const context = {
  workflowId: 'wf-1',
  taskId: 'task-1',
  stepId: 'step-1',
  outbox: outboxAdapter,  // Preferred over cache
  cache: myCache,         // Fallback if outbox not available
};
```

## Performance Considerations

- **Write Overhead**: Each side effect requires 3 writes (create, processing, committed)
- **Read Optimization**: Indexes enable fast lookup by idempotency key
- **Cleanup**: Regular cleanup prevents unbounded growth
- **Batch Operations**: Consider batching for high-throughput scenarios

## Future Enhancements

1. **Distributed Outbox**: Support for distributed storage (PostgreSQL, Redis)
2. **Batch Processing**: Process multiple entries in parallel
3. **Priority Queues**: Prioritize critical operations
4. **Dead Letter Handling**: Configurable dead letter queue processing
5. **Metrics Integration**: Built-in metrics for observability
