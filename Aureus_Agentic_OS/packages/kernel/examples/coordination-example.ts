/**
 * Example: Multi-Agent Coordination with Deadlock Detection
 * 
 * This example demonstrates how to use the multi-agent coordination system
 * to manage shared resource access with automatic deadlock detection and mitigation.
 */

import {
  MultiAgentCoordinator,
  LivelockDetector,
  CoordinationMitigator,
  CoordinationPolicyType,
  MitigationStrategy,
} from '../src';

async function main() {
  console.log('Multi-Agent Coordination Example\n');

  // Initialize coordination components
  const coordinator = new MultiAgentCoordinator(30000, true);
  const detector = new LivelockDetector(10, 3, 60000);
  const mitigator = new CoordinationMitigator(coordinator, detector);

  // Register resource policies
  console.log('Registering resource policies...');
  coordinator.registerPolicy({
    type: CoordinationPolicyType.EXCLUSIVE,
    resourceId: 'database',
    lockTimeout: 60000,
  });

  coordinator.registerPolicy({
    type: CoordinationPolicyType.SHARED,
    resourceId: 'cache',
    maxConcurrentAccess: 5,
    lockTimeout: 30000,
  });

  // Register escalation handler
  mitigator.onEscalation(async (context) => {
    console.log('\n🚨 Escalation Required:');
    console.log(`  Type: ${context.type}`);
    console.log(`  Details:`, context.details);
    console.log(`  Suggested Actions:`, context.suggestedActions);
  });

  // Example 1: Normal lock acquisition and release
  console.log('\n--- Example 1: Normal Lock Operations ---');
  const acquired1 = await coordinator.acquireLock('database', 'agent-1', 'workflow-1', 'write');
  console.log(`Agent 1 acquired database lock: ${acquired1}`);

  await new Promise(resolve => setTimeout(resolve, 1000));

  await coordinator.releaseLock('database', 'agent-1', 'workflow-1');
  console.log('Agent 1 released database lock');

  // Example 2: Shared read locks
  console.log('\n--- Example 2: Shared Read Locks ---');
  const readLock1 = await coordinator.acquireLock('cache', 'agent-2', 'workflow-2', 'read');
  const readLock2 = await coordinator.acquireLock('cache', 'agent-3', 'workflow-3', 'read');
  console.log(`Agent 2 acquired cache read lock: ${readLock1}`);
  console.log(`Agent 3 acquired cache read lock: ${readLock2}`);

  await coordinator.releaseLock('cache', 'agent-2', 'workflow-2');
  await coordinator.releaseLock('cache', 'agent-3', 'workflow-3');
  console.log('Both agents released cache locks');

  // Example 3: Deadlock detection and mitigation
  console.log('\n--- Example 3: Deadlock Detection ---');
  
  // Agent 1 locks resource A
  await coordinator.acquireLock('database', 'agent-1', 'workflow-1', 'write');
  console.log('Agent 1: Locked database');

  // Agent 2 locks resource B (cache)
  await coordinator.acquireLock('cache', 'agent-2', 'workflow-2', 'write');
  console.log('Agent 2: Locked cache');

  // Agent 1 tries to lock resource B (blocked)
  const blocked1 = await coordinator.acquireLock('cache', 'agent-1', 'workflow-1', 'write');
  console.log(`Agent 1: Tried to lock cache: ${blocked1}`);

  // Agent 2 tries to lock resource A (blocked - creates deadlock)
  const blocked2 = await coordinator.acquireLock('database', 'agent-2', 'workflow-2', 'write');
  console.log(`Agent 2: Tried to lock database: ${blocked2}`);

  // Detect deadlock
  const deadlock = coordinator.detectDeadlock();
  if (deadlock.detected) {
    console.log('\n⚠️  Deadlock Detected!');
    console.log(`  Cycle: ${deadlock.cycle?.join(' → ')}`);
    console.log(`  Affected Resources: ${deadlock.affectedResources.join(', ')}`);

    // Mitigate with REPLAN strategy
    const result = await mitigator.mitigateDeadlock(deadlock, MitigationStrategy.REPLAN);
    console.log(`\n✓ Mitigation ${result.success ? 'successful' : 'failed'}`);
    console.log(`  Strategy: ${result.strategy}`);
    console.log(`  Affected Agents: ${result.affectedAgents.join(', ')}`);
    console.log(`  Reason: ${result.reason}`);
  }

  // Clean up remaining locks
  await coordinator.releaseLock('database', 'agent-1', 'workflow-1');
  await coordinator.releaseLock('cache', 'agent-2', 'workflow-2');

  // Example 4: Livelock detection
  console.log('\n--- Example 4: Livelock Detection ---');
  
  // Simulate agent in livelock (alternating states)
  console.log('Simulating agent in livelock...');
  for (let i = 0; i < 12; i++) {
    const state = i % 2 === 0 ? 'acquiring' : 'releasing';
    detector.recordState('agent-4', 'workflow-4', 'task-1', { state });
    if (i % 4 === 0) {
      console.log(`  Agent 4: ${state}...`);
    }
  }

  // Detect livelock
  const livelock = detector.detectLivelock();
  if (livelock.detected) {
    console.log('\n⚠️  Livelock Detected!');
    console.log(`  Agents: ${livelock.agentIds.join(', ')}`);
    console.log(`  Pattern: ${livelock.repeatedPattern}`);

    // Mitigate with REPLAN strategy
    const result = await mitigator.mitigateLivelock(livelock, MitigationStrategy.REPLAN);
    console.log(`\n✓ Mitigation ${result.success ? 'successful' : 'failed'}`);
    console.log(`  Strategy: ${result.strategy}`);
    console.log(`  Affected Agents: ${result.affectedAgents.join(', ')}`);
  }

  // Show coordination events
  console.log('\n--- Coordination Events Summary ---');
  const events = coordinator.getEvents();
  const eventCounts = events.reduce((acc, e) => {
    acc[e.type] = (acc[e.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  console.log('Event counts:');
  Object.entries(eventCounts).forEach(([type, count]) => {
    console.log(`  ${type}: ${count}`);
  });

  // Cleanup
  coordinator.shutdown();
  console.log('\nExample completed successfully!');
}

// Run the example
if (require.main === module) {
  main().catch(console.error);
}

export { main };
