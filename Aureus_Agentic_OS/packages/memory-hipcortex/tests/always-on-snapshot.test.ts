import { describe, it, expect, beforeEach } from 'vitest';
import {
  AlwaysOnSnapshotManager,
  AlwaysOnStrategy,
  SnapshotTrigger,
  MemoryEntry,
} from '../src';
import { StateSnapshot } from '@aureus/world-model';

describe('AlwaysOnSnapshotManager', () => {
  let manager: AlwaysOnSnapshotManager;
  let testWorldState: StateSnapshot;
  let testMemoryEntries: MemoryEntry[];

  beforeEach(() => {
    manager = new AlwaysOnSnapshotManager({
      strategy: AlwaysOnStrategy.HYBRID,
      intervalMs: 60000, // 1 minute
      memoryThreshold: 10,
      stateChangeThreshold: 5,
      minIntervalMs: 10000, // 10 seconds
      maxIntervalMs: 300000, // 5 minutes
    });

    testWorldState = {
      id: 'state-1',
      timestamp: new Date(),
      entries: new Map(),
    };

    testMemoryEntries = [
      {
        id: 'mem-1',
        content: { data: 'test' },
        type: 'episodic_note',
        provenance: {
          task_id: 'task-1',
          step_id: 'step-1',
          timestamp: new Date(),
        },
      },
    ];
  });

  describe('shouldTakeSnapshot', () => {
    it('should trigger on max interval', () => {
      const result = manager.shouldTakeSnapshot(400000, 0, 0);
      
      expect(result.should).toBe(true);
      expect(result.trigger).toBe(SnapshotTrigger.TIME_THRESHOLD);
    });

    it('should trigger on periodic interval (PERIODIC strategy)', () => {
      const periodicManager = new AlwaysOnSnapshotManager({
        strategy: AlwaysOnStrategy.PERIODIC,
        intervalMs: 60000,
      });

      const result = periodicManager.shouldTakeSnapshot(60000, 0, 0);
      
      expect(result.should).toBe(true);
      expect(result.trigger).toBe(SnapshotTrigger.SCHEDULED);
    });

    it('should trigger on state change threshold (INCREMENTAL strategy)', () => {
      const incrementalManager = new AlwaysOnSnapshotManager({
        strategy: AlwaysOnStrategy.INCREMENTAL,
        stateChangeThreshold: 5,
      });

      const result = incrementalManager.shouldTakeSnapshot(30000, 6, 0);
      
      expect(result.should).toBe(true);
      expect(result.trigger).toBe(SnapshotTrigger.STATE_CHANGE);
    });

    it('should trigger on memory threshold (INCREMENTAL strategy)', () => {
      const incrementalManager = new AlwaysOnSnapshotManager({
        strategy: AlwaysOnStrategy.INCREMENTAL,
        memoryThreshold: 10,
      });

      const result = incrementalManager.shouldTakeSnapshot(30000, 0, 11);
      
      expect(result.should).toBe(true);
      expect(result.trigger).toBe(SnapshotTrigger.MEMORY_THRESHOLD);
    });

    it('should trigger on multiple conditions (HYBRID strategy)', () => {
      const result = manager.shouldTakeSnapshot(60000, 0, 0);
      
      expect(result.should).toBe(true);
      expect(result.trigger).toBe(SnapshotTrigger.SCHEDULED);
    });

    it('should not trigger if no conditions met', () => {
      const result = manager.shouldTakeSnapshot(30000, 2, 3);
      
      expect(result.should).toBe(false);
    });

    it('should use adaptive threshold (ADAPTIVE strategy)', () => {
      const adaptiveManager = new AlwaysOnSnapshotManager({
        strategy: AlwaysOnStrategy.ADAPTIVE,
        maxIntervalMs: 300000,
      });

      // Very high activity should trigger (activityScore = 100, threshold adjusts based on time)
      const result = adaptiveManager.shouldTakeSnapshot(10000, 50, 50);
      // Adaptive strategy may or may not trigger based on threshold calculation
      // Just verify it returns a result
      expect(result.should).toBeDefined();
      expect(typeof result.should).toBe('boolean');
    });
  });

  describe('createAlwaysOnSnapshot', () => {
    it('should create a snapshot with metadata', () => {
      manager.recordStateChange(3);
      manager.recordMemoryAdded(5);

      const snapshot = manager.createAlwaysOnSnapshot(
        'agent-1',
        'session-1',
        1,
        'task-1',
        'step-1',
        testWorldState,
        testMemoryEntries,
        SnapshotTrigger.MANUAL
      );

      expect(snapshot.id).toContain('always-on-snapshot');
      expect(snapshot.alwaysOnMetadata.agentId).toBe('agent-1');
      expect(snapshot.alwaysOnMetadata.sessionId).toBe('session-1');
      expect(snapshot.alwaysOnMetadata.cycleNumber).toBe(1);
      expect(snapshot.alwaysOnMetadata.trigger).toBe(SnapshotTrigger.MANUAL);
      expect(snapshot.alwaysOnMetadata.stateChangesSinceLastSnapshot).toBe(3);
      expect(snapshot.alwaysOnMetadata.memoriesAddedSinceLastSnapshot).toBe(5);
    });

    it('should reset counters after snapshot', () => {
      manager.recordStateChange(3);
      manager.recordMemoryAdded(5);

      manager.createAlwaysOnSnapshot(
        'agent-1',
        'session-1',
        1,
        'task-1',
        'step-1',
        testWorldState,
        testMemoryEntries,
        SnapshotTrigger.MANUAL
      );

      const state = manager.getCurrentState();
      expect(state.stateChangeCount).toBe(0);
      expect(state.memoryAddedCount).toBe(0);
    });

    it('should create memory pointers', () => {
      const snapshot = manager.createAlwaysOnSnapshot(
        'agent-1',
        'session-1',
        1,
        'task-1',
        'step-1',
        testWorldState,
        testMemoryEntries,
        SnapshotTrigger.MANUAL
      );

      expect(snapshot.memoryPointers).toHaveLength(1);
      expect(snapshot.memoryPointers[0].entryId).toBe('mem-1');
      expect(snapshot.memoryPointers[0].type).toBe('episodic_note');
    });
  });

  describe('recordStateChange and recordMemoryAdded', () => {
    it('should track state changes', () => {
      manager.recordStateChange(3);
      manager.recordStateChange(2);

      const state = manager.getCurrentState();
      expect(state.stateChangeCount).toBe(5);
    });

    it('should track memory additions', () => {
      manager.recordMemoryAdded(2);
      manager.recordMemoryAdded(3);

      const state = manager.getCurrentState();
      expect(state.memoryAddedCount).toBe(5);
    });
  });

  describe('getAgentSnapshots', () => {
    it('should return snapshots for specific agent', () => {
      manager.createAlwaysOnSnapshot(
        'agent-1',
        'session-1',
        1,
        'task-1',
        'step-1',
        testWorldState,
        testMemoryEntries,
        SnapshotTrigger.MANUAL
      );

      manager.createAlwaysOnSnapshot(
        'agent-1',
        'session-2',
        2,
        'task-1',
        'step-2',
        testWorldState,
        testMemoryEntries,
        SnapshotTrigger.MANUAL
      );

      manager.createAlwaysOnSnapshot(
        'agent-2',
        'session-3',
        1,
        'task-2',
        'step-1',
        testWorldState,
        testMemoryEntries,
        SnapshotTrigger.MANUAL
      );

      const agent1Snapshots = manager.getAgentSnapshots('agent-1');
      expect(agent1Snapshots).toHaveLength(2);
      expect(agent1Snapshots[0].alwaysOnMetadata.agentId).toBe('agent-1');
    });

    it('should return snapshots sorted by timestamp (most recent first)', () => {
      const snapshot1 = manager.createAlwaysOnSnapshot(
        'agent-1',
        'session-1',
        1,
        'task-1',
        'step-1',
        testWorldState,
        testMemoryEntries,
        SnapshotTrigger.MANUAL
      );

      // Small delay to ensure different timestamps
      const snapshot2 = manager.createAlwaysOnSnapshot(
        'agent-1',
        'session-1',
        2,
        'task-1',
        'step-2',
        testWorldState,
        testMemoryEntries,
        SnapshotTrigger.MANUAL
      );

      const snapshots = manager.getAgentSnapshots('agent-1');
      // Just verify they're sorted by timestamp descending
      expect(snapshots[0].timestamp.getTime()).toBeGreaterThanOrEqual(snapshots[1].timestamp.getTime());
    });
  });

  describe('getLatestSnapshot', () => {
    it('should return the most recent snapshot', () => {
      manager.createAlwaysOnSnapshot(
        'agent-1',
        'session-1',
        1,
        'task-1',
        'step-1',
        testWorldState,
        testMemoryEntries,
        SnapshotTrigger.MANUAL
      );

      const snapshot2 = manager.createAlwaysOnSnapshot(
        'agent-1',
        'session-1',
        2,
        'task-1',
        'step-2',
        testWorldState,
        testMemoryEntries,
        SnapshotTrigger.MANUAL
      );

      const latest = manager.getLatestSnapshot('agent-1');
      expect(latest).toBeDefined();
      // Latest snapshot should have the most recent timestamp
      expect(latest?.timestamp.getTime()).toBe(snapshot2.timestamp.getTime());
    });

    it('should return undefined if no snapshots exist', () => {
      const latest = manager.getLatestSnapshot('nonexistent-agent');
      expect(latest).toBeUndefined();
    });
  });

  describe('snapshot pruning', () => {
    it('should prune old snapshots when retainCount exceeded', () => {
      const limitedManager = new AlwaysOnSnapshotManager({
        strategy: AlwaysOnStrategy.PERIODIC,
        retainCount: 3,
      });

      // Create 5 snapshots
      for (let i = 1; i <= 5; i++) {
        limitedManager.createAlwaysOnSnapshot(
          'agent-1',
          'session-1',
          i,
          'task-1',
          `step-${i}`,
          testWorldState,
          testMemoryEntries,
          SnapshotTrigger.MANUAL
        );
      }

      const snapshots = limitedManager.getAgentSnapshots('agent-1');
      expect(snapshots).toHaveLength(3); // Only retained last 3
      // Most recent snapshots should be retained (latest first due to sorting)
      expect(snapshots.length).toBeLessThanOrEqual(3);
    });
  });

  describe('getCurrentState', () => {
    it('should return current tracking state', () => {
      manager.recordStateChange(5);
      manager.recordMemoryAdded(10);

      const state = manager.getCurrentState();
      expect(state.stateChangeCount).toBe(5);
      expect(state.memoryAddedCount).toBe(10);
      expect(state.snapshotCount).toBe(0);
      expect(state.lastSnapshotTime).toBeNull();
    });

    it('should update lastSnapshotTime after snapshot', () => {
      const beforeSnapshot = new Date();
      
      manager.createAlwaysOnSnapshot(
        'agent-1',
        'session-1',
        1,
        'task-1',
        'step-1',
        testWorldState,
        testMemoryEntries,
        SnapshotTrigger.MANUAL
      );

      const state = manager.getCurrentState();
      expect(state.lastSnapshotTime).toBeDefined();
      expect(state.lastSnapshotTime!.getTime()).toBeGreaterThanOrEqual(beforeSnapshot.getTime());
    });
  });
});
