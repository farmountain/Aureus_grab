# Quick Start: Memory with Provenance

This guide helps you get started with the memory system in Aureus Agentic OS.

## Basic Usage

### 1. Create a Memory API Instance

```typescript
import { MemoryAPI } from '@aureus/memory-hipcortex';

const memoryAPI = new MemoryAPI();
```

### 1a. Create a Memory API with Persistence (Optional)

For production deployments, enable persistence to maintain state across restarts:

```typescript
import { 
  MemoryAPI, 
  HipCortex,
  InMemoryTemporalIndexPersistence,
  InMemorySnapshotPersistence,
  InMemoryAuditLogPersistence
} from '@aureus/memory-hipcortex';
import { Pool } from 'pg';

// For PostgreSQL persistence
import { 
  PostgresTemporalIndexPersistence,
  PostgresSnapshotPersistence,
  PostgresAuditLogPersistence
} from '@aureus/memory-hipcortex';

// Create database pool for PostgreSQL
const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'aureus_memory',
  user: 'postgres',
  password: 'password',
});

// Initialize MemoryAPI with persistence
const memoryAPI = new MemoryAPI({
  temporalIndexPersistence: new PostgresTemporalIndexPersistence(pool),
});

// Initialize HipCortex with persistence
const hipCortex = new HipCortex({
  snapshotPersistence: new PostgresSnapshotPersistence(pool),
  auditLogPersistence: new PostgresAuditLogPersistence(pool),
});

// Load persisted state on startup
await memoryAPI.loadPersistedState();
await hipCortex.loadPersistedState();
```

**Important**: The `loadPersistedState()` method performs SHA-256 integrity checks on all audit log entries. If any entries fail verification, an error will be thrown to prevent loading corrupted data.

### 2. Write Memory Entries

All writes require provenance information:

```typescript
import { Provenance } from '@aureus/memory-hipcortex';

const provenance: Provenance = {
  task_id: 'my-workflow-123',
  step_id: 'step-1',
  source_event_id: 'event-456', // optional
  timestamp: new Date(),
};

// Write an episodic note
const note = memoryAPI.write(
  { observation: 'User clicked submit button' },
  provenance,
  { type: 'episodic_note', tags: ['user-action', 'important'] }
);

// Write an artifact
const artifact = memoryAPI.write(
  { filename: 'report.pdf', size: 1024, path: '/output/report.pdf' },
  provenance,
  { type: 'artifact', tags: ['report', 'output'] }
);

// Write a snapshot
const snapshot = memoryAPI.write(
  { state: { counter: 42, step: 'processing' } },
  provenance,
  { type: 'snapshot', tags: ['checkpoint'] }
);
```

### 3. Query Memory Entries

```typescript
// Get all entries for a task
const taskEntries = memoryAPI.read({ task_id: 'my-workflow-123' });

// Get entries for a specific step
const stepEntries = memoryAPI.read({ step_id: 'step-1' });

// Get entries by tags
const importantNotes = memoryAPI.read({ 
  tags: ['important'] 
});

// Get entries by type
const artifacts = memoryAPI.read({ 
  type: 'artifact' 
});

// Get timeline (chronologically ordered)
const timeline = memoryAPI.list_timeline('my-workflow-123');
```

### 4. Use with Kernel Orchestrator

```typescript
import { WorkflowOrchestrator } from '@aureus/kernel';
import { MemoryAPI } from '@aureus/memory-hipcortex';

// Create memory API
const memoryAPI = new MemoryAPI();

// Create orchestrator with memory integration
const orchestrator = new WorkflowOrchestrator(
  stateStore,
  executor,
  eventLog,
  compensationExecutor,
  worldStateStore,
  memoryAPI  // Enable automatic memory tracking
);

// Execute workflow - episodic notes are automatically written
await orchestrator.executeWorkflow(workflowSpec);

// Manually write episodic notes during execution
orchestrator.writeEpisodicNote(
  'my-workflow-123',
  'step-1',
  { observation: 'Critical threshold reached', value: 95 },
  { 
    tags: ['alert', 'threshold'], 
    source_event_id: 'event-789' 
  }
);

// Write artifacts
orchestrator.writeArtifact(
  'my-workflow-123',
  'step-1',
  { filename: 'results.json', data: { ... } },
  { tags: ['output', 'final'] }
);

// Get complete timeline
const timeline = orchestrator.getMemoryTimeline('my-workflow-123');
```

## Memory Entry Types

### Episodic Notes
Records of events, observations, and actions during execution.

**Use cases:**
- User interactions
- Decision points
- State transitions
- Alerts and notifications
- Debugging information

```typescript
memoryAPI.write(
  { event: 'payment_processed', amount: 100, currency: 'USD' },
  provenance,
  { type: 'episodic_note', tags: ['payment', 'transaction'] }
);
```

### Artifacts
Outputs, files, or data produced by tasks.

**Use cases:**
- Generated reports
- Processed files
- API responses
- Computed results
- Exported data

```typescript
memoryAPI.write(
  { 
    filename: 'monthly-report.pdf', 
    path: '/reports/2024-01.pdf',
    size: 2048,
    format: 'pdf'
  },
  provenance,
  { type: 'artifact', tags: ['report', 'monthly'] }
);
```

### Snapshots
Point-in-time state captures.

**Use cases:**
- Checkpoints
- State before critical operations
- Recovery points
- Version history
- Audit trail

```typescript
memoryAPI.write(
  { 
    state: { 
      step: 'processing',
      progress: 75,
      remaining: 25
    } 
  },
  provenance,
  { type: 'snapshot', tags: ['checkpoint', 'progress'] }
);
```

## Querying Patterns

### By Task
Get all memories for a workflow:
```typescript
const taskMemories = memoryAPI.read({ task_id: 'workflow-123' });
```

### By Step
Get memories for a specific step:
```typescript
const stepMemories = memoryAPI.read({ step_id: 'step-5' });
```

### By Tags
Find entries with specific tags:
```typescript
const urgentItems = memoryAPI.read({ tags: ['urgent', 'critical'] });
```

### By Type
Get specific types of entries:
```typescript
const artifacts = memoryAPI.getArtifacts('workflow-123');
const notes = memoryAPI.getEpisodicNotes('workflow-123');
const snapshots = memoryAPI.getSnapshots('workflow-123');
```

### By Time Range
Query within a time window:
```typescript
const recentEntries = memoryAPI.read({
  task_id: 'workflow-123',
  timeRange: {
    start: new Date('2024-01-01T00:00:00Z'),
    end: new Date('2024-01-31T23:59:59Z'),
  }
});
```

### Combined Filters
Mix multiple filters for precise queries:
```typescript
const criticalArtifacts = memoryAPI.read({
  task_id: 'workflow-123',
  type: 'artifact',
  tags: ['critical', 'output'],
  timeRange: {
    start: lastWeek,
    end: now,
  }
});
```

## Audit Trail

Access the audit log for integrity verification:

```typescript
// Get the audit log
const auditLog = memoryAPI.getAuditLog();

// Verify entry integrity
const isValid = auditLog.verifyEntry(entryId);

// Verify all entries
const { valid, invalidEntries } = auditLog.verifyAll();

// Query by task
const taskAudits = auditLog.queryByTaskId('workflow-123');

// Query by source event
const relatedAudits = auditLog.queryBySourceEventId('event-456');
```

## Best Practices

### 1. Always Include Provenance
```typescript
// ✅ Good
const provenance = {
  task_id: workflowId,
  step_id: stepId,
  timestamp: new Date(),
};
memoryAPI.write(data, provenance);

// ❌ Bad - will throw error
memoryAPI.write(data, { task_id: '', step_id: '' });
```

### 2. Use Meaningful Tags
```typescript
// ✅ Good - specific and searchable
memoryAPI.write(data, provenance, {
  tags: ['user-action', 'payment', 'critical']
});

// ❌ Avoid generic tags
memoryAPI.write(data, provenance, {
  tags: ['data', 'thing']
});
```

### 3. Link to Source Events
```typescript
// ✅ Good - enables full traceability
const provenance = {
  task_id: 'workflow-123',
  step_id: 'step-1',
  source_event_id: eventId, // Link to originating event
  timestamp: new Date(),
};
```

### 4. Use Appropriate Types
```typescript
// Observations and events → episodic_note
memoryAPI.write(
  { action: 'button_clicked' },
  provenance,
  { type: 'episodic_note' }
);

// Outputs and files → artifact
memoryAPI.write(
  { filename: 'output.csv' },
  provenance,
  { type: 'artifact' }
);

// State captures → snapshot
memoryAPI.write(
  { state: { ... } },
  provenance,
  { type: 'snapshot' }
);
```

### 5. Query Efficiently
```typescript
// ✅ Good - specific query
const entries = memoryAPI.read({
  task_id: 'workflow-123',
  type: 'artifact'
});

// ⚠️ Less efficient - gets everything
const allEntries = memoryAPI.read({ task_id: 'workflow-123' });
const artifacts = allEntries.filter(e => e.type === 'artifact');
```

## Error Handling

```typescript
try {
  const entry = memoryAPI.write(data, provenance);
  console.log('Memory written:', entry.id);
} catch (error) {
  if (error.message.includes('Provenance must include')) {
    console.error('Invalid provenance:', error.message);
  } else {
    console.error('Memory write failed:', error);
  }
}
```

## Next Steps

- Read the full [Memory HipCortex README](../packages/memory-hipcortex/README.md)
- Review [Memory Provenance Rules](memory-provenance-rules.md)
- Check out [Architecture](../architecture.md) for system integration details

## Persistence Requirements

### Database Setup

For production deployments with persistence enabled, you need to set up a PostgreSQL database:

1. **Create Database**:
```sql
CREATE DATABASE aureus_memory;
```

2. **Run Schema Migration**:
```bash
psql -U postgres -d aureus_memory -f packages/memory-hipcortex/src/db-schema.sql
```

The schema includes tables for:
- `memory_entries` - Memory entries with provenance
- `snapshots` - State snapshots with verification flags
- `audit_log_entries` - Audit log with SHA-256 content hashes
- `temporal_indices` - Temporal indices for time-based queries

### Persistence Layer Interfaces

The memory system provides three persistence interfaces:

1. **SnapshotPersistence**: Persist and load snapshots
   - `save(snapshot)` - Save a snapshot
   - `load(snapshotId)` - Load a specific snapshot
   - `loadAll()` - Load all snapshots
   - `loadVerified()` - Load only verified snapshots

2. **AuditLogPersistence**: Persist audit logs with integrity verification
   - `save(entry)` - Save an audit log entry
   - `loadAll()` - Load all audit log entries
   - `verifyIntegrity(entries)` - Verify SHA-256 hashes of entries

3. **TemporalIndexPersistence**: Persist temporal indices
   - `save(index)` - Save a temporal index
   - `loadAll()` - Load all temporal indices
   - `query(filters)` - Query indices with filters

### Implementations

Two implementations are provided:

1. **PostgreSQL** (Production): `PostgresSnapshotPersistence`, `PostgresAuditLogPersistence`, `PostgresTemporalIndexPersistence`
2. **In-Memory** (Testing/Development): `InMemorySnapshotPersistence`, `InMemoryAuditLogPersistence`, `InMemoryTemporalIndexPersistence`

### Integrity Verification

**SHA-256 Integrity Checks**: When loading persisted state, the system automatically verifies the integrity of all audit log entries using SHA-256 hashes. If any entry fails verification:

```typescript
// This will throw an error if integrity check fails
await hipCortex.loadPersistedState();
// Error: "Audit log integrity check failed: X invalid entries detected"
```

This ensures that audit logs have not been tampered with and provides a secure audit trail.

### Example: Full Setup with Persistence

```typescript
import { Pool } from 'pg';
import { 
  MemoryAPI, 
  HipCortex,
  PostgresTemporalIndexPersistence,
  PostgresSnapshotPersistence,
  PostgresAuditLogPersistence,
} from '@aureus/memory-hipcortex';

// Initialize database connection
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'aureus_memory',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
});

// Create persistence layers
const temporalIndexPersistence = new PostgresTemporalIndexPersistence(pool);
const snapshotPersistence = new PostgresSnapshotPersistence(pool);
const auditLogPersistence = new PostgresAuditLogPersistence(pool);

// Initialize components with persistence
const memoryAPI = new MemoryAPI({ temporalIndexPersistence });
const hipCortex = new HipCortex({ 
  snapshotPersistence, 
  auditLogPersistence 
});

// Load persisted state (with automatic integrity checks)
try {
  await memoryAPI.loadPersistedState();
  await hipCortex.loadPersistedState();
  console.log('Persisted state loaded successfully');
} catch (error) {
  console.error('Failed to load persisted state:', error);
  process.exit(1);
}

// Now use the components normally
// All snapshots, audit logs, and indices are automatically persisted
const snapshot = hipCortex.createSnapshot({ state: 'initialized' }, true);
const entry = memoryAPI.write(
  { note: 'System started' },
  { task_id: 'startup', step_id: 'init', timestamp: new Date() },
  { type: 'episodic_note' }
);
```
