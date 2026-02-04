# Memory with Provenance Rules

This document describes the rules and guarantees for the Memory HipCortex system with provenance tracking.

## Core Principles

### 1. Mandatory Provenance

**Rule**: All memory writes MUST include provenance information with at minimum:
- `task_id`: Identifier of the workflow/task creating the entry
- `step_id`: Identifier of the specific step within the task
- `timestamp`: When the entry was created

**Optional**:
- `source_event_id`: Reference to the originating event

**Enforcement**: The `MemoryAPI.write()` method throws an error if `task_id` or `step_id` is missing or empty.

```typescript
// ✅ Valid - includes required provenance
memoryAPI.write(
  { data: 'test' },
  { task_id: 'workflow-1', step_id: 'step-1', timestamp: new Date() }
);

// ❌ Invalid - missing task_id
memoryAPI.write(
  { data: 'test' },
  { task_id: '', step_id: 'step-1', timestamp: new Date() }
);
// Throws: "Provenance must include task_id and step_id"
```

### 2. Immutability

**Rule**: Memory entries are immutable once written. Modifications require creating a new entry with appropriate provenance linking to the original.

**Implementation**: 
- All content is deep-cloned before storage
- No update or delete methods are provided
- Original objects cannot affect stored entries

```typescript
const content = { value: 42 };
const entry = memoryAPI.write(content, provenance);

// Modifying original doesn't affect stored entry
content.value = 999;

const retrieved = memoryAPI.getEntry(entry.id);
console.log(retrieved.content.value); // Still 42
```

### 3. Cryptographic Integrity

**Rule**: All audit log entries include SHA-256 cryptographic hashes computed over their content for integrity verification.

**Implementation**:
- Hash computed using SHA-256 over JSON-serialized entry (excluding the hash field itself)
- Object keys are sorted for deterministic hashing
- Hash can be verified at any time using `auditLog.verifyEntry(id)`

```typescript
const entry = auditLog.append('actor', 'action', before, after);
console.log(entry.contentHash); // "a3f5b2c1..."

// Verify integrity
const isValid = auditLog.verifyEntry(entry.id);
console.log(isValid); // true

// Tampered entries fail verification
entry.stateAfter = { modified: true };
const stillValid = auditLog.verifyEntry(entry.id);
console.log(stillValid); // false
```

### 4. Source Traceability

**Rule**: Memory entries SHOULD include `source_event_id` when they are derived from or triggered by a specific event.

**Purpose**: Enables complete lineage tracking from events through to memory entries.

```typescript
// Event occurs
const eventId = 'event-123';

// Memory entry references the source event
memoryAPI.write(
  { observation: 'User action detected' },
  {
    task_id: 'workflow-1',
    step_id: 'step-1',
    source_event_id: eventId,
    timestamp: new Date(),
  }
);

// Can query audit log by source event
const relatedEntries = auditLog.queryBySourceEventId(eventId);
```

### 5. Chronological Ordering

**Rule**: Timeline queries (`list_timeline`) MUST return entries sorted by timestamp in ascending order.

**Guarantee**: The system maintains chronological order for timeline views.

```typescript
// Entries added in any order
memoryAPI.write(data3, { ...provenance, timestamp: new Date('2024-01-03') });
memoryAPI.write(data1, { ...provenance, timestamp: new Date('2024-01-01') });
memoryAPI.write(data2, { ...provenance, timestamp: new Date('2024-01-02') });

// Timeline is always chronologically sorted
const timeline = memoryAPI.list_timeline('workflow-1');
// Returns [entry1, entry2, entry3] ordered by timestamp
```

### 6. Type Safety

**Rule**: Memory entries MUST specify one of three types:
- `episodic_note`: Events and observations
- `artifact`: Outputs and produced data
- `snapshot`: Point-in-time state captures

**Default**: If type is not specified, defaults to `episodic_note`.

```typescript
// Explicit type
memoryAPI.write(data, provenance, { type: 'artifact' });

// Default type
memoryAPI.write(data, provenance); // Defaults to 'episodic_note'
```

### 7. Tag Support

**Rule**: Memory entries MAY include tags for flexible categorization and querying.

**Implementation**:
- Tags are optional
- Multiple tags can be assigned to a single entry
- Queries match entries with ANY of the specified tags (OR semantics)

```typescript
// Write with tags
memoryAPI.write(
  data,
  provenance,
  { tags: ['important', 'user-action', 'billing'] }
);

// Query by tags (matches entries with ANY tag)
const entries = memoryAPI.read({ tags: ['important', 'urgent'] });
// Returns entries tagged with 'important' OR 'urgent'
```

### 8. Audit Trail

**Rule**: Every memory write MUST be logged to the audit log with full provenance and source event references.

**Implementation**: The `MemoryAPI.write()` method automatically appends an entry to the audit log.

```typescript
memoryAPI.write(data, provenance);

// Audit log automatically contains entry
const auditLog = memoryAPI.getAuditLog();
const entries = auditLog.queryByTaskId(provenance.task_id);
// Contains audit entry for the write
```

## Kernel Integration Rules

### 9. Automatic Episodic Notes

**Rule**: When a MemoryAPI is configured, the kernel orchestrator automatically writes episodic notes for:
- Task start events
- Task completion events

**Content**:
- `event`: Event type ('task_started' or 'task_completed')
- `taskId`: Task identifier
- `attempt`: Attempt number
- `timestamp`: Event timestamp
- `duration`: Duration for completed tasks
- `result`: Result for completed tasks

**Tags**:
- `task_lifecycle`: All automatic task events
- `started` or `completed`: Specific event type

**Metadata**:
- `taskType`: Type of task (action, decision, parallel)
- `riskTier`: Risk tier if specified

### 10. Manual Memory Writes

**Rule**: The kernel orchestrator provides methods for manual memory writes with automatic provenance:

```typescript
// Write episodic note
orchestrator.writeEpisodicNote(workflowId, stepId, content, options);

// Write artifact
orchestrator.writeArtifact(workflowId, stepId, content, options);

// Write snapshot
orchestrator.writeSnapshot(workflowId, stepId, content, options);
```

These methods automatically construct proper provenance from workflow and task identifiers.

### 11. Memory Timeline

**Rule**: The kernel orchestrator provides a method to retrieve the complete memory timeline for a workflow:

```typescript
const timeline = orchestrator.getMemoryTimeline(workflowId);
```

This returns all memory entries (automatic and manual) for the workflow in chronological order.

## Query Semantics

### 12. Multi-Filter Queries

**Rule**: When multiple filters are provided to `read()`, ALL filters must match (AND semantics), except for tags which use OR semantics.

```typescript
// AND semantics for most filters
memoryAPI.read({
  task_id: 'workflow-1',      // Must match
  step_id: 'step-5',          // Must match
  type: 'artifact',           // Must match
  tags: ['output', 'final'],  // Must have 'output' OR 'final'
});
```

### 13. Empty Query Results

**Rule**: Queries that match no entries return an empty array, never null or undefined.

```typescript
const results = memoryAPI.read({ task_id: 'non-existent' });
console.log(results); // []
```

## Error Handling

### 14. Graceful Degradation

**Rule**: When MemoryAPI is not configured in the kernel orchestrator, memory operations:
- Log a warning to console
- Return undefined for write operations
- Return empty arrays for read operations
- Do not throw errors or halt execution

```typescript
// Orchestrator without MemoryAPI
const orchestrator = new WorkflowOrchestrator(stateStore, executor);

const entry = orchestrator.writeEpisodicNote(...);
// Logs: "Memory API not configured, skipping episodic note"
// Returns: undefined

const timeline = orchestrator.getMemoryTimeline('workflow-1');
// Returns: []
```

## Verification and Auditing

### 15. Integrity Verification

**Rule**: The audit log provides methods to verify the integrity of individual entries or all entries:

```typescript
// Verify single entry
const isValid = auditLog.verifyEntry(entryId);

// Verify all entries
const { valid, invalidEntries } = auditLog.verifyAll();
if (!valid) {
  console.log('Tampered entries:', invalidEntries);
}
```

### 16. Audit Log Queries

**Rule**: The audit log supports queries by:
- Actor
- Action
- Time range
- Task ID (from provenance)
- Step ID (from provenance)
- Source event ID

All queries return entries in insertion order (chronological).

## Performance Considerations

### 17. Indexing Strategy

**Rule**: The TemporalIndexer maintains multiple indices for efficient queries:
- Primary index: Ordered list of all indices
- Secondary indices:
  - By task_id (Map)
  - By step_id (Map)
  - By tag (Map, one entry per tag)

**Complexity**:
- Write: O(1 + t) where t is number of tags
- Query by task_id/step_id/tag: O(1) for index lookup
- Query with multiple filters: O(n) where n is result set size

### 18. Memory Management

**Rule**: All memory entries and indices are kept in memory. For production use with large datasets:
- Implement pagination for timeline queries
- Consider time-based archiving of old entries
- Implement external storage backend

## Future Extensions

The memory system is designed to support future extensions:
- External storage backends (database, object storage)
- Compression of old entries
- Sharding by task_id for distributed systems
- Real-time memory subscriptions
- Cross-task memory sharing with access controls
