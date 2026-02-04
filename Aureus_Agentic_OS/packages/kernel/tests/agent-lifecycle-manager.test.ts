import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  AgentLifecycleManager,
  AgentLifecycleState,
  TransitionReason,
  ContextRefreshStrategy,
} from '../src';

describe('AgentLifecycleManager', () => {
  let manager: AgentLifecycleManager;

  beforeEach(() => {
    manager = new AgentLifecycleManager({
      awakeTimeMs: 1000,
      sleepTimeMs: 500,
      inactivityThresholdMs: 500,
      contextRefreshOnWake: true,
    });
  });

  afterEach(() => {
    // Clean up any pending timers
    vi.clearAllTimers();
  });

  describe('createSession', () => {
    it('should create a new session', () => {
      const session = manager.createSession('agent-1', 'task-1', { custom: 'data' });

      expect(session.agentId).toBe('agent-1');
      expect(session.taskId).toBe('task-1');
      expect(session.state).toBe(AgentLifecycleState.AWAKE);
      expect(session.cycleNumber).toBe(1);
      expect(session.metadata?.custom).toBe('data');
    });

    it('should start with cycle number 1', () => {
      const session = manager.createSession('agent-1');

      expect(session.cycleNumber).toBe(1);
    });

    it('should initialize with zero context and memory', () => {
      const session = manager.createSession('agent-1');

      expect(session.contextSize).toBe(0);
      expect(session.memoryCount).toBe(0);
    });
  });

  describe('transitionState', () => {
    it('should transition to new state', () => {
      const session = manager.createSession('agent-1');
      
      manager.transitionState(
        session.sessionId,
        AgentLifecycleState.SLEEPING,
        TransitionReason.MANUAL
      );

      const updatedSession = manager.getSession(session.sessionId);
      expect(updatedSession?.state).toBe(AgentLifecycleState.SLEEPING);
    });

    it('should record transition', () => {
      const session = manager.createSession('agent-1');
      
      manager.transitionState(
        session.sessionId,
        AgentLifecycleState.SLEEPING,
        TransitionReason.MANUAL
      );

      const transitions = manager.getTransitions(session.sessionId);
      expect(transitions.length).toBeGreaterThan(0);
      
      const lastTransition = transitions[transitions.length - 1];
      expect(lastTransition.fromState).toBe(AgentLifecycleState.AWAKE);
      expect(lastTransition.toState).toBe(AgentLifecycleState.SLEEPING);
      expect(lastTransition.reason).toBe(TransitionReason.MANUAL);
    });

    it('should not transition if already in target state', () => {
      const session = manager.createSession('agent-1');
      const initialTransitionCount = manager.getTransitions(session.sessionId).length;
      
      manager.transitionState(
        session.sessionId,
        AgentLifecycleState.AWAKE,
        TransitionReason.MANUAL
      );

      const transitions = manager.getTransitions(session.sessionId);
      expect(transitions.length).toBe(initialTransitionCount);
    });

    it('should increment cycle number when waking', () => {
      const session = manager.createSession('agent-1');
      const initialCycle = session.cycleNumber;
      
      manager.sleep(session.sessionId);
      manager.wake(session.sessionId);

      const updatedSession = manager.getSession(session.sessionId);
      expect(updatedSession?.cycleNumber).toBe(initialCycle + 1);
    });

    it('should create snapshot when sleeping', () => {
      const session = manager.createSession('agent-1');
      
      manager.sleep(session.sessionId);

      const snapshots = manager.getSnapshots(session.sessionId);
      expect(snapshots.length).toBeGreaterThan(0);
    });
  });

  describe('recordActivity', () => {
    it('should update last activity time', () => {
      const session = manager.createSession('agent-1');
      const beforeActivity = session.lastActivityTime;

      // Wait a bit to ensure time difference
      setTimeout(() => {
        manager.recordActivity(session.sessionId);
      }, 10);

      const updatedSession = manager.getSession(session.sessionId);
      expect(updatedSession?.lastActivityTime.getTime())
        .toBeGreaterThanOrEqual(beforeActivity.getTime());
    });

    it('should update context size and memory count', () => {
      const session = manager.createSession('agent-1');
      
      manager.recordActivity(session.sessionId, 100, 50);

      const updatedSession = manager.getSession(session.sessionId);
      expect(updatedSession?.contextSize).toBe(100);
      expect(updatedSession?.memoryCount).toBe(50);
    });
  });

  describe('sleep and wake', () => {
    it('should put agent to sleep', () => {
      const session = manager.createSession('agent-1');
      
      manager.sleep(session.sessionId, TransitionReason.INACTIVITY);

      const updatedSession = manager.getSession(session.sessionId);
      expect(updatedSession?.state).toBe(AgentLifecycleState.SLEEPING);
    });

    it('should wake agent up', () => {
      const session = manager.createSession('agent-1');
      manager.sleep(session.sessionId);
      
      manager.wake(session.sessionId, TransitionReason.SCHEDULED);

      const updatedSession = manager.getSession(session.sessionId);
      expect(updatedSession?.state).toBe(AgentLifecycleState.AWAKE);
    });
  });

  describe('hibernate', () => {
    it('should hibernate agent', () => {
      const session = manager.createSession('agent-1');
      
      manager.hibernate(session.sessionId, TransitionReason.RESOURCE_PRESSURE);

      const updatedSession = manager.getSession(session.sessionId);
      expect(updatedSession?.state).toBe(AgentLifecycleState.HIBERNATING);
    });

    it('should create snapshot when hibernating', () => {
      const session = manager.createSession('agent-1');
      
      manager.hibernate(session.sessionId);

      const snapshots = manager.getSnapshots(session.sessionId);
      expect(snapshots.length).toBeGreaterThan(0);
    });
  });

  describe('terminate', () => {
    it('should terminate agent session', () => {
      const session = manager.createSession('agent-1');
      
      manager.terminate(session.sessionId, TransitionReason.TASK_COMPLETION);

      const updatedSession = manager.getSession(session.sessionId);
      expect(updatedSession?.state).toBe(AgentLifecycleState.TERMINATED);
    });
  });

  describe('getSession', () => {
    it('should return session by ID', () => {
      const session = manager.createSession('agent-1');
      
      const retrieved = manager.getSession(session.sessionId);
      
      expect(retrieved).toBeDefined();
      expect(retrieved?.sessionId).toBe(session.sessionId);
      expect(retrieved?.agentId).toBe('agent-1');
    });

    it('should return undefined for non-existent session', () => {
      const retrieved = manager.getSession('non-existent');
      
      expect(retrieved).toBeUndefined();
    });
  });

  describe('getAgentSessions', () => {
    it('should return all sessions for an agent', () => {
      manager.createSession('agent-1', 'task-1');
      manager.createSession('agent-1', 'task-2');
      manager.createSession('agent-2', 'task-3');

      const agent1Sessions = manager.getAgentSessions('agent-1');
      
      expect(agent1Sessions).toHaveLength(2);
      expect(agent1Sessions[0].agentId).toBe('agent-1');
      expect(agent1Sessions[1].agentId).toBe('agent-1');
    });
  });

  describe('getTransitions', () => {
    it('should return all transitions for a session', () => {
      const session = manager.createSession('agent-1');
      
      manager.sleep(session.sessionId);
      manager.wake(session.sessionId);
      manager.hibernate(session.sessionId);

      const transitions = manager.getTransitions(session.sessionId);
      
      // Should have transitions: INITIALIZING->AWAKE, AWAKE->SLEEPING, SLEEPING->AWAKE, AWAKE->HIBERNATING
      expect(transitions.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe('getSnapshots', () => {
    it('should return snapshots for a session', () => {
      const session = manager.createSession('agent-1');
      
      manager.sleep(session.sessionId);
      manager.wake(session.sessionId);
      manager.sleep(session.sessionId);

      const snapshots = manager.getSnapshots(session.sessionId);
      
      expect(snapshots.length).toBeGreaterThanOrEqual(2);
    });

    it('should include context checkpoint in snapshot', () => {
      const session = manager.createSession('agent-1');
      manager.recordActivity(session.sessionId, 100, 50);
      
      manager.sleep(session.sessionId);

      const snapshots = manager.getSnapshots(session.sessionId);
      const snapshot = snapshots[0];
      
      expect(snapshot.contextCheckpoint).toBeDefined();
      expect(snapshot.contextCheckpoint.lastProcessedTimestamp).toBeDefined();
    });
  });

  describe('restoreSession', () => {
    it('should restore session from snapshot', () => {
      const session = manager.createSession('agent-1');
      manager.recordActivity(session.sessionId, 100, 50);
      
      manager.sleep(session.sessionId);
      
      const restored = manager.restoreSession(session.sessionId);
      
      expect(restored).toBeDefined();
      expect(restored?.cycleNumber).toBe(session.cycleNumber);
    });

    it('should return null for non-existent session', () => {
      const restored = manager.restoreSession('non-existent');
      
      expect(restored).toBeNull();
    });
  });

  describe('refreshContext', () => {
    it('should call memory provider', async () => {
      const session = manager.createSession('agent-1');
      
      const mockProvider = vi.fn().mockResolvedValue(['mem-1', 'mem-2', 'mem-3']);
      
      const strategy: ContextRefreshStrategy = {
        type: 'incremental',
        maxContextSize: 100,
        prioritizeRecent: true,
      };
      
      const memoryIds = await manager.refreshContext(
        session.sessionId,
        strategy,
        mockProvider
      );
      
      expect(mockProvider).toHaveBeenCalledWith(session.sessionId, strategy);
      expect(memoryIds).toEqual(['mem-1', 'mem-2', 'mem-3']);
    });

    it('should throw for non-existent session', async () => {
      const mockProvider = vi.fn().mockResolvedValue([]);
      
      await expect(
        manager.refreshContext('non-existent', { type: 'full' }, mockProvider)
      ).rejects.toThrow('Session non-existent not found');
    });
  });

  describe('getStats', () => {
    it('should return lifecycle statistics', () => {
      manager.createSession('agent-1');
      manager.createSession('agent-2');
      const session3 = manager.createSession('agent-3');
      manager.sleep(session3.sessionId);

      const stats = manager.getStats();
      
      expect(stats.totalSessions).toBe(3);
      expect(stats.activeSessions).toBe(2);
      expect(stats.sleepingSessions).toBe(1);
      expect(stats.byState[AgentLifecycleState.AWAKE]).toBe(2);
      expect(stats.byState[AgentLifecycleState.SLEEPING]).toBe(1);
    });

    it('should calculate average cycle number', () => {
      const session1 = manager.createSession('agent-1');
      manager.sleep(session1.sessionId);
      manager.wake(session1.sessionId); // cycle 2
      
      const session2 = manager.createSession('agent-2'); // cycle 1

      const stats = manager.getStats();
      
      expect(stats.avgCycleNumber).toBe(1.5); // (2 + 1) / 2
    });
  });
});
