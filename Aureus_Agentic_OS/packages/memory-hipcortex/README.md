# Memory HipCortex

Temporal index, snapshots, audit log, memory API with provenance tracking, long-horizon memory management, and integrated symbolic and procedural memory stores.

## Overview

The Memory HipCortex package provides a comprehensive memory system for the Aureus Agentic OS with:

- **TemporalIndexer**: Efficient indexing of memory entries by time, task_id, step_id, and tags
- **AuditLog**: Append-only event logging with cryptographic hashes and source event references
- **MemoryAPI**: High-level API for writing and reading memory entries with mandatory provenance
- **HipCortex**: Original temporal indexing, snapshots, audit log, and rollback functionality
- **RetentionPolicyManager**: Long-horizon memory management with retention tiers (hot/warm/cold/archived)
- **MemorySummarizer**: Event compaction and summarization strategies
- **AlwaysOnSnapshotManager**: Snapshot strategies for always-on agents
- **StreamingContextAPI**: Streaming and incremental context retrieval
- **SymbolicStore**: Storage for symbolic entities from Perception pipeline
- **ProceduralCache**: Caching for procedural knowledge and learned patterns
- **UnifiedMemoryAPI**: Unified query interface across all memory stores
- **Integration**: Bridges to Perception and ReflexionEngine

## Key Features

### Provenance Tracking

All memory writes require provenance information:
- `task_id`: The workflow/task that created the entry
- `step_id`: The specific step within the task
- `source_event_id`: Optional reference to the originating event
- `timestamp`: When the entry was created

### Memory Entry Types

- **episodic_note**: Records of events and observations during task execution
- **artifact**: Outputs, files, or data produced by tasks
- **snapshot**: Point-in-time state captures

### Audit Trail

Every memory write is logged to an append-only audit log with:
- Cryptographic hash (SHA-256) for integrity verification
- References to source events for full traceability
- Provenance information for complete lineage tracking

## Usage

### Writing Memory Entries

```typescript
import { MemoryAPI, Provenance } from '@aureus/memory-hipcortex';

const memoryAPI = new MemoryAPI();

const provenance: Provenance = {
  task_id: 'workflow-123',
  step_id: 'step-5',
  source_event_id: 'event-456',
  timestamp: new Date(),
};

// Write an episodic note
const note = memoryAPI.write(
  { message: 'User clicked submit button' },
  provenance,
  { type: 'episodic_note', tags: ['user-action', 'important'] }
);

// Write an artifact
const artifact = memoryAPI.write(
  { filename: 'report.pdf', size: 1024 },
  provenance,
  { type: 'artifact', tags: ['report', 'output'] }
);

// Write a snapshot
const snapshot = memoryAPI.write(
  { state: { counter: 42 } },
  provenance,
  { type: 'snapshot' }
);
```

### Reading Memory Entries

```typescript
// Read by task_id
const taskEntries = memoryAPI.read({ task_id: 'workflow-123' });

// Read by step_id
const stepEntries = memoryAPI.read({ step_id: 'step-5' });

// Read by tags
const importantEntries = memoryAPI.read({ tags: ['important'] });

// Read by type
const artifacts = memoryAPI.read({ type: 'artifact' });

// Read by time range
const recentEntries = memoryAPI.read({
  timeRange: {
    start: new Date('2024-01-01'),
    end: new Date('2024-12-31'),
  },
});

// Get timeline for a task (sorted chronologically)
const timeline = memoryAPI.list_timeline('workflow-123');
```

### Using TemporalIndexer

```typescript
import { TemporalIndexer, MemoryEntry } from '@aureus/memory-hipcortex';

const indexer = new TemporalIndexer();

// Index an entry
const index = indexer.indexEntry(entry);

// Query by task_id
const taskIndices = indexer.queryByTaskId('workflow-123');

// Query by step_id
const stepIndices = indexer.queryByStepId('step-5');

// Query by tag
const taggedIndices = indexer.queryByTag('important');

// Query with multiple filters
const filtered = indexer.query({
  task_id: 'workflow-123',
  tags: ['important'],
  timeRange: { start: new Date('2024-01-01'), end: new Date() },
});
```

### Using AuditLog

```typescript
import { AuditLog, Provenance } from '@aureus/memory-hipcortex';

const auditLog = new AuditLog();

// Append an entry
const entry = auditLog.append(
  'agent-1',
  'memory_write',
  null,
  { entryId: 'entry-123' },
  {
    provenance: {
      task_id: 'workflow-123',
      step_id: 'step-5',
      timestamp: new Date(),
    },
    sourceEventIds: ['event-456'],
  }
);

// Verify entry integrity
const isValid = auditLog.verifyEntry(entry.id);

// Verify all entries
const verification = auditLog.verifyAll();

// Query by task_id
const taskEntries = auditLog.queryByTaskId('workflow-123');

// Query by source event
const sourceEntries = auditLog.queryBySourceEventId('event-456');
```

## Integration with Kernel

The Memory HipCortex integrates with the kernel orchestrator to automatically track task execution:

```typescript
import { WorkflowOrchestrator } from '@aureus/kernel';
import { MemoryAPI } from '@aureus/memory-hipcortex';

const memoryAPI = new MemoryAPI();

const orchestrator = new WorkflowOrchestrator(
  stateStore,
  executor,
  eventLog,
  compensationExecutor,
  worldStateStore,
  memoryAPI  // Pass memory API to enable automatic tracking
);

// Execute workflow - episodic notes are automatically written
await orchestrator.executeWorkflow(workflowSpec);

// Manually write episodic notes
orchestrator.writeEpisodicNote(
  'workflow-123',
  'step-5',
  { observation: 'Critical threshold reached' },
  { tags: ['alert'], source_event_id: 'event-789' }
);

// Write artifacts
orchestrator.writeArtifact(
  'workflow-123',
  'step-5',
  { filename: 'results.json', data: {...} },
  { tags: ['output'] }
);

// Get timeline for workflow
const timeline = orchestrator.getMemoryTimeline('workflow-123');
```

## Memory with Provenance Rules

1. **Mandatory Provenance**: All memory writes must include `task_id` and `step_id`
2. **Immutability**: Memory entries are immutable once written
3. **Cryptographic Integrity**: All audit log entries include SHA-256 hashes
4. **Source Traceability**: Optional `source_event_id` links entries to originating events
5. **Chronological Ordering**: Timeline queries return entries sorted by timestamp
6. **Type Safety**: Memory entries must specify type (episodic_note, artifact, or snapshot)
7. **Tag Support**: Entries can be tagged for flexible querying
8. **Audit Trail**: Every write is logged to the audit log with full provenance

## Testing

Run tests with:

```bash
npm test
```

Test coverage includes:
- TemporalIndexer functionality (7 tests)
- AuditLog with hashing and references (16 tests)
- Memory API with provenance (21 tests)
- Original HipCortex functionality (11 tests)

## Architecture

The package follows a layered architecture:

1. **Types Layer**: Core interfaces for Provenance, MemoryEntry, AuditLogEntry, etc.
2. **Indexing Layer**: TemporalIndexer for efficient querying
3. **Storage Layer**: AuditLog for append-only event storage with integrity
4. **API Layer**: MemoryAPI for high-level operations
5. **Legacy Layer**: HipCortex for backward compatibility
6. **Long-Horizon Memory**: RetentionPolicyManager and MemorySummarizer for memory lifecycle management
7. **Always-On Support**: AlwaysOnSnapshotManager for continuous agent operation
8. **Streaming API**: StreamingContextAPI and ContextRetrievalAPI for efficient context retrieval

All layers integrate seamlessly to provide a complete memory solution with provenance tracking.

## Long-Horizon Memory Management

### Retention Policies

The retention policy manager supports four tiers for memory lifecycle:

```typescript
import { RetentionPolicyManager, RetentionTier } from '@aureus/memory-hipcortex';

const manager = new RetentionPolicyManager([
  {
    tier: RetentionTier.HOT,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    accessThreshold: 10,
  },
  {
    tier: RetentionTier.WARM,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    compressionRatio: 0.5,
  },
  {
    tier: RetentionTier.COLD,
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    compressionRatio: 0.2,
  },
  {
    tier: RetentionTier.ARCHIVED,
    compressionRatio: 0.1,
  },
]);

// Track entries
manager.trackEntry('entry-1');
manager.recordAccess('entry-1');

// Evaluate retention policy
const decision = manager.evaluateEntry('entry-1', entry);
if (decision.action === 'summarize') {
  // Transition to next tier
  manager.transitionEntry('entry-1', decision.targetTier);
}

// Get statistics
const stats = manager.getStats();
console.log(`Total entries: ${stats.totalEntries}`);
console.log(`By tier:`, stats.byTier);
```

### Memory Summarization

Compress and summarize old memories with multiple strategies:

```typescript
import { MemorySummarizer, SummarizationStrategy } from '@aureus/memory-hipcortex';

const summarizer = new MemorySummarizer();

// Truncate content
const result = summarizer.summarize(entry, SummarizationStrategy.TRUNCATE, 0.5);

// Extract key information
const keyInfo = summarizer.summarize(entry, SummarizationStrategy.EXTRACT_KEY);

// Semantic compression
const semantic = summarizer.summarize(entry, SummarizationStrategy.SEMANTIC, 0.3);

// Compact multiple events
const compacted = summarizer.compactEvents(entries, {
  windowSize: 60000,
  minEventsToCompact: 10,
  strategy: SummarizationStrategy.AGGREGATE,
});
```

### Always-On Agent Snapshots

Manage snapshots for long-running agents:

```typescript
import { AlwaysOnSnapshotManager, AlwaysOnStrategy } from '@aureus/memory-hipcortex';

const snapshotManager = new AlwaysOnSnapshotManager({
  strategy: AlwaysOnStrategy.HYBRID,
  intervalMs: 60000, // 1 minute
  memoryThreshold: 100,
  stateChangeThreshold: 50,
  retainCount: 10,
});

// Record activity
snapshotManager.recordStateChange(5);
snapshotManager.recordMemoryAdded(10);

// Check if snapshot needed
const { should, trigger } = snapshotManager.shouldTakeSnapshot(30000, 5, 10);

if (should) {
  // Create snapshot
  const snapshot = snapshotManager.createAlwaysOnSnapshot(
    'agent-1',
    'session-1',
    1,
    'task-1',
    'step-1',
    worldState,
    memoryEntries,
    trigger
  );
}

// Retrieve snapshots
const latest = snapshotManager.getLatestSnapshot('agent-1');
const allSnapshots = snapshotManager.getAgentSnapshots('agent-1');
```

### Streaming Context Retrieval

Stream large contexts efficiently:

```typescript
import { StreamingContextAPI, ContextRetrievalAPI } from '@aureus/memory-hipcortex';

const streamingAPI = new StreamingContextAPI();
const contextAPI = new ContextRetrievalAPI();

// Stream in batches
for await (const batch of streamingAPI.streamBatches(entries, { 
  batchSize: 10,
  priorityOrder: 'recent'
})) {
  console.log(`Processing batch ${batch.batchNumber}: ${batch.entries.length} entries`);
}

// Get incremental updates
const lastFetch = new Date('2024-01-01');
const updates = streamingAPI.getIncrementalContext(entries, lastFetch, 50);

// Get tool-specific context
const toolContext = await contextAPI.getToolContext(entries, 'database-query', 10);

// Get workflow context
const workflowContext = await contextAPI.getWorkflowContext(entries, 'task-123', true);

// Paginate results
const page = streamingAPI.getPaginatedContext(entries, 0, 20);
console.log(`Page ${page.page} of ${page.totalPages}`);
```

## Symbolic and Procedural Memory

### SymbolicStore

Store and query symbolic entities extracted from the Perception pipeline:

```typescript
import { SymbolicStore, SymbolicEntity } from '@aureus/memory-hipcortex';

const symbolicStore = new SymbolicStore();

// Store a symbolic entity
const entity: SymbolicEntity = {
  id: 'entity-1',
  type: 'person',
  properties: { name: 'Alice', role: 'developer' },
  relationships: [
    { type: 'knows', targetId: 'entity-2' },
    { type: 'works-with', targetId: 'entity-3' },
  ],
  source: 'perception-input-1',
  confidence: 0.95,
  timestamp: new Date(),
  metadata: { extractedFrom: 'user-profile' },
};

await symbolicStore.store(entity);

// Query by type
const people = await symbolicStore.queryByType('person');

// Query by source
const fromPerception = await symbolicStore.queryBySource('perception-input-1');

// Find related entities
const relatedToPerson = await symbolicStore.findRelated('entity-1');
const colleagues = await symbolicStore.findRelated('entity-1', 'works-with');

// Query with filters
const highConfidenceEntities = await symbolicStore.query({
  type: 'person',
  minConfidence: 0.9,
  timeRange: {
    start: new Date('2024-01-01'),
    end: new Date('2024-12-31'),
  },
});

// Get statistics
const stats = symbolicStore.getStats();
console.log(`Total entities: ${stats.totalEntities}`);
console.log(`By type:`, stats.byType);
console.log(`Average confidence: ${stats.avgConfidence}`);
```

### ProceduralCache

Cache and retrieve procedural knowledge from ReflexionEngine:

```typescript
import { ProceduralCache, ProceduralEntry } from '@aureus/memory-hipcortex';

const proceduralCache = new ProceduralCache();

// Store a fix
const fix: ProceduralEntry = {
  id: 'fix-timeout-1',
  type: 'fix',
  context: 'timeout-error',
  knowledge: {
    solution: 'increase timeout',
    parameters: { timeout: 30000 },
    reasoning: 'Network latency detected',
  },
  confidence: 0.9,
  usageCount: 0,
  timestamp: new Date(),
};

await proceduralCache.store(fix);

// Query fixes for a context
const timeoutFixes = await proceduralCache.query({
  type: 'fix',
  context: 'timeout-error',
  sortBy: 'successRate',
});

// Get best match for a context
const bestFix = await proceduralCache.getBestMatch('timeout-error', 'fix');

// Record usage of a fix
await proceduralCache.recordUsage('fix-timeout-1', true, {
  workflow: 'data-sync',
  appliedAt: new Date(),
});

// Check usage history
const history = proceduralCache.getUsageHistory('fix-timeout-1');

// Get statistics
const stats = proceduralCache.getStats();
console.log(`Total entries: ${stats.totalEntries}`);
console.log(`Average success rate: ${stats.avgSuccessRate}`);
console.log(`Total usage: ${stats.totalUsage}`);
```

### UnifiedMemoryAPI

Query across all memory stores with a unified interface:

```typescript
import { 
  UnifiedMemoryAPIBuilder,
  MemoryAPI,
  SymbolicStore,
  ProceduralCache,
} from '@aureus/memory-hipcortex';

// Build unified API
const unifiedAPI = new UnifiedMemoryAPIBuilder()
  .withMemoryAPI(new MemoryAPI())
  .withSymbolicStore(new SymbolicStore())
  .withProceduralCache(new ProceduralCache())
  .build();

// Query all stores
const results = await unifiedAPI.query({
  memory: { task_id: 'task-123' },
  symbolic: { type: 'person', minConfidence: 0.8 },
  procedural: { context: 'timeout-error', sortBy: 'successRate' },
});

console.log(`Memory entries: ${results.metadata.memoryCount}`);
console.log(`Symbolic entities: ${results.metadata.symbolicCount}`);
console.log(`Procedural entries: ${results.metadata.proceduralCount}`);

// Query specific stores
const symbolicOnly = await unifiedAPI.query({
  stores: ['symbolic'],
  symbolic: { type: 'event' },
});

// Get high-confidence entities
const highConfidence = await unifiedAPI.getHighConfidenceEntities(0.9);

// Get best procedural knowledge
const bestFix = await unifiedAPI.getBestProcedural('timeout-error', 'fix');

// Get task memory
const taskMemory = await unifiedAPI.getTaskMemory('task-123');

// Get time range across all stores
const timeRange = await unifiedAPI.getTimeRange(
  new Date('2024-01-01'),
  new Date('2024-12-31')
);

// Get comprehensive statistics
const allStats = unifiedAPI.getStats();
console.log('Memory:', allStats.memory);
console.log('Symbolic:', allStats.symbolic);
console.log('Procedural:', allStats.procedural);
```

## Integration with Perception and ReflexionEngine

### Perception Integration

Store entities from the Perception pipeline:

```typescript
import {
  PerceptionIntegrator,
  SymbolicStore,
  PerceptionOutput,
} from '@aureus/memory-hipcortex';

const symbolicStore = new SymbolicStore();
const perceptionIntegrator = new PerceptionIntegrator(symbolicStore);

// Store perception output
const perceptionOutput: PerceptionOutput = {
  entities: [
    {
      id: 'entity-1',
      type: 'user-action',
      properties: { action: 'click', target: 'submit-button' },
      source: 'perception-pipeline-1',
      confidence: 0.95,
      timestamp: new Date(),
    },
  ],
  inputId: 'input-123',
  timestamp: new Date(),
};

const provenance = {
  task_id: 'task-1',
  step_id: 'step-1',
  timestamp: new Date(),
};

await perceptionIntegrator.storePerceptionOutput(perceptionOutput, provenance);

// Query for perception-compatible format
const entities = await perceptionIntegrator.queryForPerception({
  type: 'user-action',
  minConfidence: 0.8,
});
```

### ReflexionEngine Integration

Store postmortems and fixes from ReflexionEngine:

```typescript
import {
  ReflexionIntegrator,
  ProceduralCache,
  ReflexionPostmortem,
} from '@aureus/memory-hipcortex';

const proceduralCache = new ProceduralCache();
const reflexionIntegrator = new ReflexionIntegrator(proceduralCache);

// Store postmortem
const postmortem: ReflexionPostmortem = {
  id: 'pm-1',
  workflowId: 'workflow-123',
  taskId: 'task-456',
  failureTaxonomy: 'timeout-error',
  rootCause: 'Network latency exceeded threshold',
  proposedFix: {
    id: 'fix-1',
    fixType: 'parameter-change',
    description: 'Increase timeout to 30 seconds',
    changes: { timeout: 30000 },
    confidence: 0.92,
  },
  confidence: 0.88,
  timestamp: new Date(),
};

await reflexionIntegrator.storePostmortem(postmortem);

// Get relevant fixes for a failure
const fixes = await reflexionIntegrator.getRelevantFixes('timeout-error');

// Record fix usage
await reflexionIntegrator.recordFixUsage('proc-pm-1', true, {
  appliedIn: 'workflow-789',
  successful: true,
});

// Store successful fix as reusable pattern
await reflexionIntegrator.storeSuccessfulFix(
  'pm-1',
  'fix-1',
  'timeout-error',
  { strategy: 'exponential-backoff', baseTimeout: 30000 }
);
```

### Unified Integration Bridge

Use IntegrationBridge for combined operations:

```typescript
import {
  IntegrationBridge,
  SymbolicStore,
  ProceduralCache,
} from '@aureus/memory-hipcortex';

const symbolicStore = new SymbolicStore();
const proceduralCache = new ProceduralCache();
const bridge = new IntegrationBridge(symbolicStore, proceduralCache);

// Process both perception and reflexion data
await bridge.processAll({
  perceptionOutput: {
    entities: [/* ... */],
    inputId: 'input-1',
    timestamp: new Date(),
  },
  postmortem: {
    id: 'pm-1',
    workflowId: 'workflow-1',
    taskId: 'task-1',
    failureTaxonomy: 'validation-error',
    rootCause: 'Invalid schema',
    proposedFix: {
      id: 'fix-1',
      fixType: 'tool-swap',
      description: 'Use stricter validator',
      changes: { validator: 'strict-v2' },
      confidence: 0.9,
    },
    confidence: 0.85,
    timestamp: new Date(),
  },
  provenance: {
    task_id: 'task-1',
    step_id: 'step-1',
    timestamp: new Date(),
  },
});

// Access individual integrators
const entities = await bridge.perception.queryForPerception({ type: 'event' });
const bestFix = await bridge.reflexion.getBestFix('validation-error');
```

## Architecture

The package follows a layered architecture:

1. **Types Layer**: Core interfaces for Provenance, MemoryEntry, AuditLogEntry, SymbolicEntity, ProceduralEntry
2. **Indexing Layer**: TemporalIndexer for efficient querying
3. **Storage Layer**: AuditLog for append-only event storage with integrity
4. **API Layer**: MemoryAPI for high-level operations
5. **Legacy Layer**: HipCortex for backward compatibility
6. **Long-Horizon Memory**: RetentionPolicyManager and MemorySummarizer for memory lifecycle management
7. **Always-On Support**: AlwaysOnSnapshotManager for continuous agent operation
8. **Streaming API**: StreamingContextAPI and ContextRetrievalAPI for efficient context retrieval
9. **Symbolic Memory**: SymbolicStore for storing entities from Perception
10. **Procedural Memory**: ProceduralCache for storing learned patterns and fixes
11. **Unified Query**: UnifiedMemoryAPI for querying across all stores
12. **Integration**: Bridges to Perception and ReflexionEngine

All layers integrate seamlessly to provide a complete memory solution with provenance tracking, symbolic knowledge storage, and procedural learning capabilities.
