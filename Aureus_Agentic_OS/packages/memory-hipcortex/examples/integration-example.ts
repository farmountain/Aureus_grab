/**
 * Example demonstrating the usage of SymbolicStore, ProceduralCache, and UnifiedMemoryAPI
 * with integration to Perception and ReflexionEngine
 */

import {
  SymbolicStore,
  ProceduralCache,
  UnifiedMemoryAPIBuilder,
  MemoryAPI,
  IntegrationBridge,
  Provenance,
} from '@aureus/memory-hipcortex';

async function main() {
  console.log('=== Memory HipCortex Integration Example ===\n');

  // Initialize all stores
  const memoryAPI = new MemoryAPI();
  const symbolicStore = new SymbolicStore();
  const proceduralCache = new ProceduralCache();

  // Create unified API
  const unifiedAPI = new UnifiedMemoryAPIBuilder()
    .withMemoryAPI(memoryAPI)
    .withSymbolicStore(symbolicStore)
    .withProceduralCache(proceduralCache)
    .build();

  // Create integration bridge
  const bridge = new IntegrationBridge(symbolicStore, proceduralCache);

  // Example provenance
  const provenance: Provenance = {
    task_id: 'workflow-123',
    step_id: 'step-1',
    timestamp: new Date(),
  };

  // 1. Write episodic memory
  console.log('1. Writing episodic memory...');
  memoryAPI.write(
    { event: 'User initiated data sync', status: 'started' },
    provenance,
    { type: 'episodic_note', tags: ['user-action', 'sync'] }
  );

  // 2. Store symbolic entities (from Perception)
  console.log('2. Storing symbolic entities from Perception...');
  await bridge.perception.storePerceptionOutput({
    entities: [
      {
        id: 'user-1',
        type: 'user',
        properties: { name: 'Alice', role: 'admin' },
        source: 'perception-pipeline',
        confidence: 0.95,
        timestamp: new Date(),
      },
      {
        id: 'action-1',
        type: 'action',
        properties: { action: 'sync', target: 'database' },
        relationships: [{ type: 'performed-by', targetId: 'user-1' }],
        source: 'perception-pipeline',
        confidence: 0.9,
        timestamp: new Date(),
      },
    ],
    inputId: 'input-123',
    timestamp: new Date(),
  }, provenance);

  // 3. Store procedural knowledge (from ReflexionEngine)
  console.log('3. Storing procedural knowledge from ReflexionEngine...');
  await bridge.reflexion.storePostmortem({
    id: 'pm-1',
    workflowId: 'workflow-123',
    taskId: 'task-1',
    failureTaxonomy: 'sync-timeout',
    rootCause: 'Database connection pool exhausted',
    proposedFix: {
      id: 'fix-1',
      fixType: 'parameter-change',
      description: 'Increase connection pool size',
      changes: { maxConnections: 100 },
      confidence: 0.92,
    },
    confidence: 0.88,
    timestamp: new Date(),
  }, provenance);

  // 4. Query across all stores
  console.log('\n4. Querying across all stores...');
  const results = await unifiedAPI.query({
    memory: { task_id: 'workflow-123' },
    symbolic: { type: 'user' },
    procedural: { context: 'sync-timeout' },
  });

  console.log(`  - Memory entries: ${results.metadata.memoryCount}`);
  console.log(`  - Symbolic entities: ${results.metadata.symbolicCount}`);
  console.log(`  - Procedural entries: ${results.metadata.proceduralCount}`);

  // 5. Get high-confidence entities
  console.log('\n5. Getting high-confidence entities...');
  const highConfidence = await unifiedAPI.getHighConfidenceEntities(0.9);
  console.log(`  Found ${highConfidence.length} high-confidence entities`);
  highConfidence.forEach(e => {
    console.log(`  - ${e.type}: ${e.id} (confidence: ${e.confidence})`);
  });

  // 6. Get best procedural knowledge
  console.log('\n6. Getting best fix for sync-timeout...');
  const bestFix = await unifiedAPI.getBestProcedural('sync-timeout', 'fix');
  if (bestFix) {
    console.log(`  Best fix: ${bestFix.id}`);
    console.log(`  Confidence: ${bestFix.confidence}`);
    console.log(`  Success rate: ${bestFix.successRate}`);
  }

  // 7. Record fix usage
  console.log('\n7. Recording fix usage...');
  await bridge.reflexion.recordFixUsage('proc-pm-1', true, {
    appliedIn: 'workflow-456',
    outcome: 'success',
  });
  console.log('  Fix usage recorded successfully');

  // 8. Get comprehensive statistics
  console.log('\n8. Getting comprehensive statistics...');
  const stats = unifiedAPI.getStats();
  console.log('  Memory API:', stats.memory);
  console.log('  Symbolic Store:', stats.symbolic);
  console.log('  Procedural Cache:', stats.procedural);

  console.log('\n=== Example completed successfully! ===');
}

// Run the example
main().catch(console.error);
