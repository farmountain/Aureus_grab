import { describe, it, expect, beforeEach } from 'vitest';
import {
  MultiAgentCoordinator,
  LivelockDetector,
  CoordinationMitigator,
  CoordinationPolicyType,
  MitigationStrategy,
} from '../src';

describe('Multi-Agent Coordination', () => {
  let coordinator: MultiAgentCoordinator;

  beforeEach(() => {
    coordinator = new MultiAgentCoordinator(30000, false); // Disable auto timeout for testing
  });

  describe('MultiAgentCoordinator', () => {
    it('should acquire exclusive lock successfully', async () => {
      coordinator.registerPolicy({
        type: CoordinationPolicyType.EXCLUSIVE,
        resourceId: 'resource-1',
      });

      const acquired = await coordinator.acquireLock(
        'resource-1',
        'agent-1',
        'workflow-1',
        'write'
      );

      expect(acquired).toBe(true);
      
      const locks = coordinator.getLocks();
      expect(locks.get('resource-1')).toHaveLength(1);
      expect(locks.get('resource-1')?.[0].agentId).toBe('agent-1');
    });

    it('should block second agent from acquiring exclusive lock', async () => {
      coordinator.registerPolicy({
        type: CoordinationPolicyType.EXCLUSIVE,
        resourceId: 'resource-1',
      });

      await coordinator.acquireLock('resource-1', 'agent-1', 'workflow-1', 'write');
      const acquired = await coordinator.acquireLock('resource-1', 'agent-2', 'workflow-2', 'write');

      expect(acquired).toBe(false);
      
      const locks = coordinator.getLocks();
      expect(locks.get('resource-1')).toHaveLength(1);
    });

    it('should allow multiple read locks with shared policy', async () => {
      coordinator.registerPolicy({
        type: CoordinationPolicyType.SHARED,
        resourceId: 'resource-1',
        maxConcurrentAccess: 5,
      });

      const acquired1 = await coordinator.acquireLock('resource-1', 'agent-1', 'workflow-1', 'read');
      const acquired2 = await coordinator.acquireLock('resource-1', 'agent-2', 'workflow-2', 'read');

      expect(acquired1).toBe(true);
      expect(acquired2).toBe(true);
      
      const locks = coordinator.getLocks();
      expect(locks.get('resource-1')).toHaveLength(2);
    });

    it('should block write lock when read locks exist', async () => {
      coordinator.registerPolicy({
        type: CoordinationPolicyType.SHARED,
        resourceId: 'resource-1',
      });

      await coordinator.acquireLock('resource-1', 'agent-1', 'workflow-1', 'read');
      const acquired = await coordinator.acquireLock('resource-1', 'agent-2', 'workflow-2', 'write');

      expect(acquired).toBe(false);
    });

    it('should release lock successfully', async () => {
      coordinator.registerPolicy({
        type: CoordinationPolicyType.EXCLUSIVE,
        resourceId: 'resource-1',
      });

      await coordinator.acquireLock('resource-1', 'agent-1', 'workflow-1', 'write');
      await coordinator.releaseLock('resource-1', 'agent-1', 'workflow-1');

      const locks = coordinator.getLocks();
      expect(locks.get('resource-1')).toBeUndefined();
    });

    it('should detect simple deadlock cycle', async () => {
      coordinator.registerPolicy({
        type: CoordinationPolicyType.EXCLUSIVE,
        resourceId: 'resource-1',
      });
      coordinator.registerPolicy({
        type: CoordinationPolicyType.EXCLUSIVE,
        resourceId: 'resource-2',
      });

      // Agent 1 holds resource-1, wants resource-2
      await coordinator.acquireLock('resource-1', 'agent-1', 'workflow-1', 'write');
      await coordinator.acquireLock('resource-2', 'agent-2', 'workflow-2', 'write');
      
      // Create circular dependency
      await coordinator.acquireLock('resource-2', 'agent-1', 'workflow-1', 'write'); // Blocked
      await coordinator.acquireLock('resource-1', 'agent-2', 'workflow-2', 'write'); // Blocked

      const result = coordinator.detectDeadlock();

      expect(result.detected).toBe(true);
      expect(result.cycle).toBeDefined();
      expect(result.cycle?.length).toBeGreaterThan(0);
      expect(result.affectedResources).toContain('resource-1');
      expect(result.affectedResources).toContain('resource-2');
    });

    it('should not detect deadlock when no cycle exists', async () => {
      coordinator.registerPolicy({
        type: CoordinationPolicyType.EXCLUSIVE,
        resourceId: 'resource-1',
      });

      await coordinator.acquireLock('resource-1', 'agent-1', 'workflow-1', 'write');

      const result = coordinator.detectDeadlock();

      expect(result.detected).toBe(false);
      expect(result.cycle).toBeUndefined();
    });

    it('should track dependencies correctly', async () => {
      coordinator.registerPolicy({
        type: CoordinationPolicyType.EXCLUSIVE,
        resourceId: 'resource-1',
      });

      await coordinator.acquireLock('resource-1', 'agent-1', 'workflow-1', 'write');
      await coordinator.acquireLock('resource-1', 'agent-2', 'workflow-2', 'write'); // Blocked

      const dependencies = coordinator.getDependencies();
      const dep2 = dependencies.get('agent-2');

      expect(dep2).toBeDefined();
      expect(dep2?.waitingFor).toContain('agent-1');
      expect(dep2?.requestedResources).toContain('resource-1');
    });

    it('should log coordination events', async () => {
      coordinator.registerPolicy({
        type: CoordinationPolicyType.EXCLUSIVE,
        resourceId: 'resource-1',
      });

      await coordinator.acquireLock('resource-1', 'agent-1', 'workflow-1', 'write');
      await coordinator.releaseLock('resource-1', 'agent-1', 'workflow-1');

      const events = coordinator.getEvents();
      expect(events.length).toBeGreaterThan(0);
      expect(events.some(e => e.type === 'lock_acquired')).toBe(true);
      expect(events.some(e => e.type === 'lock_released')).toBe(true);
    });
  });

  describe('LivelockDetector', () => {
    let detector: LivelockDetector;

    beforeEach(() => {
      detector = new LivelockDetector(10, 3, 60000);
    });

    it('should not detect livelock with insufficient history', () => {
      detector.recordState('agent-1', 'workflow-1', 'task-1', { state: 'A' });
      detector.recordState('agent-1', 'workflow-1', 'task-1', { state: 'B' });

      const result = detector.detectLivelock();
      expect(result.detected).toBe(false);
    });

    it('should detect alternating state livelock', () => {
      // Create alternating pattern: A -> B -> A -> B -> A -> B
      for (let i = 0; i < 8; i++) {
        const state = i % 2 === 0 ? 'A' : 'B';
        detector.recordState('agent-1', 'workflow-1', 'task-1', { state });
      }

      const result = detector.detectLivelock();
      expect(result.detected).toBe(true);
      expect(result.agentIds).toContain('agent-1');
      expect(result.repeatedPattern).toContain('Repeated 2-state pattern');
    });

    it('should detect repeated pattern livelock', () => {
      // Create pattern: A -> B -> C -> A -> B -> C -> A -> B -> C
      const pattern = ['A', 'B', 'C'];
      for (let i = 0; i < 10; i++) {
        const state = pattern[i % pattern.length];
        detector.recordState('agent-1', 'workflow-1', 'task-1', { state });
      }

      const result = detector.detectLivelock();
      expect(result.detected).toBe(true);
      expect(result.agentIds).toContain('agent-1');
    });

    it('should not detect livelock with progressing states', () => {
      for (let i = 0; i < 10; i++) {
        detector.recordState('agent-1', 'workflow-1', 'task-1', { state: `state-${i}` });
      }

      const result = detector.detectLivelock();
      expect(result.detected).toBe(false);
    });

    it('should clear agent history', () => {
      detector.recordState('agent-1', 'workflow-1', 'task-1', { state: 'A' });
      detector.clearAgentHistory('agent-1');

      const history = detector.getAgentHistory('agent-1');
      expect(history).toHaveLength(0);
    });

    it('should track multiple agents independently', () => {
      // Agent 1 in livelock
      for (let i = 0; i < 8; i++) {
        const state = i % 2 === 0 ? 'A' : 'B';
        detector.recordState('agent-1', 'workflow-1', 'task-1', { state });
      }

      // Agent 2 progressing normally
      for (let i = 0; i < 5; i++) {
        detector.recordState('agent-2', 'workflow-2', 'task-2', { state: `state-${i}` });
      }

      const result = detector.detectLivelock();
      expect(result.detected).toBe(true);
      expect(result.agentIds).toContain('agent-1');
      expect(result.agentIds).not.toContain('agent-2');
    });
  });

  describe('CoordinationMitigator', () => {
    let coordinator: MultiAgentCoordinator;
    let detector: LivelockDetector;
    let mitigator: CoordinationMitigator;

    beforeEach(() => {
      coordinator = new MultiAgentCoordinator(30000, false);
      detector = new LivelockDetector(10, 3, 60000);
      mitigator = new CoordinationMitigator(coordinator, detector);
    });

    it('should mitigate deadlock with abort strategy', async () => {
      // Setup deadlock
      coordinator.registerPolicy({
        type: CoordinationPolicyType.EXCLUSIVE,
        resourceId: 'resource-1',
      });
      coordinator.registerPolicy({
        type: CoordinationPolicyType.EXCLUSIVE,
        resourceId: 'resource-2',
      });

      await coordinator.acquireLock('resource-1', 'agent-1', 'workflow-1', 'write');
      await coordinator.acquireLock('resource-2', 'agent-2', 'workflow-2', 'write');
      await coordinator.acquireLock('resource-2', 'agent-1', 'workflow-1', 'write');
      await coordinator.acquireLock('resource-1', 'agent-2', 'workflow-2', 'write');

      const deadlock = coordinator.detectDeadlock();
      expect(deadlock.detected).toBe(true);

      const result = await mitigator.mitigateDeadlock(deadlock, MitigationStrategy.ABORT);

      expect(result.success).toBe(true);
      expect(result.affectedAgents.length).toBeGreaterThan(0);
      expect(result.strategy).toBe(MitigationStrategy.ABORT);
    });

    it('should mitigate deadlock with replan strategy', async () => {
      // Setup deadlock
      coordinator.registerPolicy({
        type: CoordinationPolicyType.EXCLUSIVE,
        resourceId: 'resource-1',
      });
      coordinator.registerPolicy({
        type: CoordinationPolicyType.EXCLUSIVE,
        resourceId: 'resource-2',
      });

      await coordinator.acquireLock('resource-1', 'agent-1', 'workflow-1', 'write');
      await coordinator.acquireLock('resource-2', 'agent-2', 'workflow-2', 'write');
      await coordinator.acquireLock('resource-2', 'agent-1', 'workflow-1', 'write');
      await coordinator.acquireLock('resource-1', 'agent-2', 'workflow-2', 'write');

      const deadlock = coordinator.detectDeadlock();
      const result = await mitigator.mitigateDeadlock(deadlock, MitigationStrategy.REPLAN);

      expect(result.success).toBe(true);
      expect(result.strategy).toBe(MitigationStrategy.REPLAN);
    });

    it('should mitigate deadlock with escalate strategy', async () => {
      let escalationCalled = false;
      mitigator.onEscalation(async (context) => {
        escalationCalled = true;
        expect(context.type).toBe('deadlock');
        expect(context.suggestedActions.length).toBeGreaterThan(0);
      });

      // Setup deadlock
      coordinator.registerPolicy({
        type: CoordinationPolicyType.EXCLUSIVE,
        resourceId: 'resource-1',
      });

      await coordinator.acquireLock('resource-1', 'agent-1', 'workflow-1', 'write');
      await coordinator.acquireLock('resource-1', 'agent-2', 'workflow-2', 'write');
      
      // Force a simple waiting scenario (not a cycle, but for testing escalation)
      const fakeDeadlock = {
        detected: true,
        cycle: ['agent-1', 'agent-2'],
        timestamp: new Date(),
        affectedResources: ['resource-1'],
      };

      const result = await mitigator.mitigateDeadlock(fakeDeadlock, MitigationStrategy.ESCALATE);

      expect(result.success).toBe(true);
      expect(result.strategy).toBe(MitigationStrategy.ESCALATE);
      expect(escalationCalled).toBe(true);
    });

    it('should mitigate livelock with abort strategy', async () => {
      // Create livelock
      for (let i = 0; i < 8; i++) {
        const state = i % 2 === 0 ? 'A' : 'B';
        detector.recordState('agent-1', 'workflow-1', 'task-1', { state });
      }

      const livelock = detector.detectLivelock();
      expect(livelock.detected).toBe(true);

      const result = await mitigator.mitigateLivelock(livelock, MitigationStrategy.ABORT);

      expect(result.success).toBe(true);
      expect(result.affectedAgents).toContain('agent-1');
      expect(result.strategy).toBe(MitigationStrategy.ABORT);
    });

    it('should mitigate livelock with replan strategy', async () => {
      // Create livelock
      for (let i = 0; i < 8; i++) {
        const state = i % 2 === 0 ? 'A' : 'B';
        detector.recordState('agent-1', 'workflow-1', 'task-1', { state });
      }

      const livelock = detector.detectLivelock();
      const result = await mitigator.mitigateLivelock(livelock, MitigationStrategy.REPLAN);

      expect(result.success).toBe(true);
      expect(result.strategy).toBe(MitigationStrategy.REPLAN);
      
      // Verify history was cleared
      const history = detector.getAgentHistory('agent-1');
      expect(history).toHaveLength(0);
    });

    it('should mitigate livelock with escalate strategy', async () => {
      let escalationCalled = false;
      mitigator.onEscalation(async (context) => {
        escalationCalled = true;
        expect(context.type).toBe('livelock');
      });

      // Create livelock
      for (let i = 0; i < 8; i++) {
        const state = i % 2 === 0 ? 'A' : 'B';
        detector.recordState('agent-1', 'workflow-1', 'task-1', { state });
      }

      const livelock = detector.detectLivelock();
      const result = await mitigator.mitigateLivelock(livelock, MitigationStrategy.ESCALATE);

      expect(result.success).toBe(true);
      expect(result.strategy).toBe(MitigationStrategy.ESCALATE);
      expect(escalationCalled).toBe(true);
    });

    it('should log mitigation events', async () => {
      const fakeDeadlock = {
        detected: true,
        cycle: ['agent-1'],
        timestamp: new Date(),
        affectedResources: ['resource-1'],
      };

      await mitigator.mitigateDeadlock(fakeDeadlock, MitigationStrategy.ABORT);

      const events = mitigator.getEvents();
      expect(events.some(e => e.type === 'mitigation_started')).toBe(true);
      expect(events.some(e => e.type === 'mitigation_completed')).toBe(true);
    });
  });

  describe('Integration Tests', () => {
    it('should handle complete deadlock detection and mitigation flow', async () => {
      const coordinator = new MultiAgentCoordinator(30000, false);
      const detector = new LivelockDetector(10, 3, 60000);
      const mitigator = new CoordinationMitigator(coordinator, detector);

      // Setup resources and policies
      coordinator.registerPolicy({
        type: CoordinationPolicyType.EXCLUSIVE,
        resourceId: 'database',
      });
      coordinator.registerPolicy({
        type: CoordinationPolicyType.EXCLUSIVE,
        resourceId: 'file-system',
      });

      // Agent 1: Locks database, wants file-system
      await coordinator.acquireLock('database', 'agent-1', 'workflow-1', 'write');
      // Agent 2: Locks file-system, wants database
      await coordinator.acquireLock('file-system', 'agent-2', 'workflow-2', 'write');

      // Create deadlock
      const acquired1 = await coordinator.acquireLock('file-system', 'agent-1', 'workflow-1', 'write');
      const acquired2 = await coordinator.acquireLock('database', 'agent-2', 'workflow-2', 'write');

      expect(acquired1).toBe(false);
      expect(acquired2).toBe(false);

      // Detect deadlock
      const deadlock = coordinator.detectDeadlock();
      expect(deadlock.detected).toBe(true);

      // Mitigate
      const result = await mitigator.mitigateDeadlock(deadlock, MitigationStrategy.ABORT);
      expect(result.success).toBe(true);

      // Verify events
      const coordinatorEvents = coordinator.getEvents();
      const mitigatorEvents = mitigator.getEvents();
      expect(coordinatorEvents.some(e => e.type === 'deadlock_detected')).toBe(true);
      expect(mitigatorEvents.some(e => e.type === 'mitigation_completed')).toBe(true);
    });

    it('should handle complete livelock detection and mitigation flow', async () => {
      const coordinator = new MultiAgentCoordinator(30000, false);
      const detector = new LivelockDetector(10, 3, 60000);
      const mitigator = new CoordinationMitigator(coordinator, detector);

      // Simulate agent in livelock - state alternates but attempt changes
      // The state field is what matters for livelock detection
      for (let i = 0; i < 12; i++) {
        const state = i % 2 === 0 ? 'trying-A' : 'trying-B';
        detector.recordState('agent-1', 'workflow-1', 'task-1', { 
          state  // Only include state, not attempt which changes
        });
      }

      // Detect livelock
      const livelock = detector.detectLivelock();
      expect(livelock.detected).toBe(true);

      // Mitigate
      const result = await mitigator.mitigateLivelock(livelock, MitigationStrategy.REPLAN);
      expect(result.success).toBe(true);

      // Verify state was cleared
      const history = detector.getAgentHistory('agent-1');
      expect(history).toHaveLength(0);
    });
  });
});
