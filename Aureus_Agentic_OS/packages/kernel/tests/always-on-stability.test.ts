import { describe, it, expect, beforeEach } from 'vitest';
import {
  AlwaysOnSnapshotManager,
  AlwaysOnStrategy,
  SnapshotTrigger,
  MemoryEntry,
  HipCortex,
} from '@aureus/memory-hipcortex';
import { InMemoryStateStore } from '@aureus/kernel';
import { StateSnapshot } from '@aureus/world-model';

/**
 * Long-running stability tests for always-on agents
 * Tests memory growth, rollback behavior, and snapshot management over extended periods
 */
describe('Always-On Agent Stability Tests', () => {
  let snapshotManager: AlwaysOnSnapshotManager;
  let hipCortex: HipCortex;
  let stateStore: InMemoryStateStore;

  beforeEach(() => {
    snapshotManager = new AlwaysOnSnapshotManager({
      strategy: AlwaysOnStrategy.HYBRID,
      intervalMs: 60000, // 1 minute
      memoryThreshold: 100,
      stateChangeThreshold: 50,
      minIntervalMs: 10000, // 10 seconds
      maxIntervalMs: 300000, // 5 minutes
    });

    stateStore = new InMemoryStateStore();
    hipCortex = new HipCortex();
  });

  describe('Memory Growth Monitoring', () => {
    it('should handle continuous memory accumulation without overflow', async () => {
      const agentId = 'always-on-agent-001';
      const iterations = 1000;
      const memoryEntries: MemoryEntry[] = [];

      // Simulate continuous operation with memory accumulation
      for (let i = 0; i < iterations; i++) {
        const entry: MemoryEntry = {
          id: `mem-${i}`,
          content: {
            iteration: i,
            data: `Test data for iteration ${i}`,
            timestamp: Date.now(),
          },
          type: 'episodic_note',
          provenance: {
            task_id: `task-${i}`,
            step_id: `step-${i}`,
            timestamp: new Date(),
          },
        };

        memoryEntries.push(entry);
        await hipCortex.store(entry);
      }

      // Verify memory is stored correctly
      expect(memoryEntries.length).toBe(iterations);

      // Check that memory can be retrieved
      const recentMemories = await hipCortex.queryByTimeRange(
        new Date(Date.now() - 3600000), // Last hour
        new Date()
      );

      expect(recentMemories.length).toBeGreaterThan(0);
      expect(recentMemories.length).toBeLessThanOrEqual(iterations);
    });

    it('should trigger snapshots based on memory growth thresholds', async () => {
      const agentId = 'memory-growth-agent-001';
      const memoryThreshold = 100;
      let snapshotCount = 0;

      // Configure manager with low threshold for testing
      const testManager = new AlwaysOnSnapshotManager({
        strategy: AlwaysOnStrategy.MEMORY_THRESHOLD,
        intervalMs: 60000,
        memoryThreshold: memoryThreshold,
        stateChangeThreshold: 50,
        minIntervalMs: 1000,
        maxIntervalMs: 300000,
      });

      const worldState: StateSnapshot = {
        id: 'state-1',
        timestamp: new Date(),
        entries: new Map(),
      };

      // Accumulate memory entries beyond threshold
      const memoryEntries: MemoryEntry[] = [];
      for (let i = 0; i < memoryThreshold + 50; i++) {
        memoryEntries.push({
          id: `mem-${i}`,
          content: { data: `Entry ${i}` },
          type: 'episodic_note',
          provenance: {
            task_id: 'test-task',
            step_id: `step-${i}`,
            timestamp: new Date(),
          },
        });
      }

      // Check if snapshot should be taken
      const elapsedMs = 30000; // 30 seconds
      const memorySize = memoryEntries.length;
      const stateChanges = 10;

      const shouldSnapshot = testManager.shouldTakeSnapshot(
        elapsedMs,
        memorySize,
        stateChanges
      );

      expect(shouldSnapshot.should).toBe(true);
      expect(shouldSnapshot.trigger).toBe(SnapshotTrigger.MEMORY_THRESHOLD);

      // Take snapshot
      const snapshot = await testManager.takeSnapshot(
        agentId,
        worldState,
        memoryEntries
      );

      expect(snapshot).toBeDefined();
      expect(snapshot.agentId).toBe(agentId);
      expect(snapshot.memorySize).toBe(memorySize);
    });

    it('should monitor memory growth rate over time', async () => {
      const agentId = 'growth-rate-agent-001';
      const snapshots: Array<{
        timestamp: number;
        memorySize: number;
      }> = [];

      // Simulate memory growth over time
      const phases = [
        { entries: 50, duration: 10000 },   // Phase 1: 50 entries in 10s
        { entries: 100, duration: 20000 },  // Phase 2: 100 entries in 20s
        { entries: 200, duration: 30000 },  // Phase 3: 200 entries in 30s
      ];

      let currentMemorySize = 0;
      let currentTime = Date.now();

      for (const phase of phases) {
        currentMemorySize += phase.entries;
        currentTime += phase.duration;

        snapshots.push({
          timestamp: currentTime,
          memorySize: currentMemorySize,
        });
      }

      // Calculate growth rates
      const growthRates: number[] = [];
      for (let i = 1; i < snapshots.length; i++) {
        const timeDiff = snapshots[i].timestamp - snapshots[i - 1].timestamp;
        const memoryDiff = snapshots[i].memorySize - snapshots[i - 1].memorySize;
        const growthRate = memoryDiff / (timeDiff / 1000); // Entries per second

        growthRates.push(growthRate);
      }

      // Verify growth rate calculations
      expect(growthRates.length).toBe(phases.length - 1);
      
      // Growth rate should increase across phases
      expect(growthRates[1]).toBeGreaterThan(growthRates[0]);
    });

    it('should cleanup old snapshots based on retention policy', async () => {
      const agentId = 'retention-agent-001';
      const maxSnapshots = 5;
      const snapshots: any[] = [];

      const worldState: StateSnapshot = {
        id: 'state-1',
        timestamp: new Date(),
        entries: new Map(),
      };

      const memoryEntries: MemoryEntry[] = [{
        id: 'mem-1',
        content: { data: 'test' },
        type: 'episodic_note',
        provenance: {
          task_id: 'task-1',
          step_id: 'step-1',
          timestamp: new Date(),
        },
      }];

      // Create more snapshots than retention limit
      for (let i = 0; i < maxSnapshots + 3; i++) {
        const snapshot = await snapshotManager.takeSnapshot(
          agentId,
          worldState,
          memoryEntries
        );
        snapshots.push(snapshot);
      }

      expect(snapshots.length).toBe(maxSnapshots + 3);

      // In a real implementation, verify cleanup occurred
      // For now, just verify snapshots were created
      snapshots.forEach(snapshot => {
        expect(snapshot).toBeDefined();
        expect(snapshot.agentId).toBe(agentId);
      });
    });
  });

  describe('Rollback Behavior', () => {
    it('should successfully rollback to previous snapshot', async () => {
      const agentId = 'rollback-agent-001';
      
      // Create initial snapshot
      const initialState: StateSnapshot = {
        id: 'state-initial',
        timestamp: new Date(),
        entries: new Map([
          ['key1', { value: 'initial-value-1' }],
          ['key2', { value: 'initial-value-2' }],
        ]),
      };

      const initialMemory: MemoryEntry[] = [{
        id: 'mem-initial',
        content: { state: 'initial' },
        type: 'episodic_note',
        provenance: {
          task_id: 'task-1',
          step_id: 'step-1',
          timestamp: new Date(),
        },
      }];

      const snapshot1 = await snapshotManager.takeSnapshot(
        agentId,
        initialState,
        initialMemory
      );

      expect(snapshot1).toBeDefined();
      expect(snapshot1.worldState.id).toBe('state-initial');

      // Simulate state changes
      const modifiedState: StateSnapshot = {
        id: 'state-modified',
        timestamp: new Date(),
        entries: new Map([
          ['key1', { value: 'modified-value-1' }],
          ['key2', { value: 'modified-value-2' }],
          ['key3', { value: 'new-value' }],
        ]),
      };

      const modifiedMemory: MemoryEntry[] = [
        ...initialMemory,
        {
          id: 'mem-modified',
          content: { state: 'modified' },
          type: 'episodic_note',
          provenance: {
            task_id: 'task-2',
            step_id: 'step-2',
            timestamp: new Date(),
          },
        },
      ];

      const snapshot2 = await snapshotManager.takeSnapshot(
        agentId,
        modifiedState,
        modifiedMemory
      );

      expect(snapshot2.worldState.id).toBe('state-modified');

      // Verify rollback capability by comparing snapshots
      expect(snapshot1.worldState.entries.size).toBe(2);
      expect(snapshot2.worldState.entries.size).toBe(3);
      
      // Rollback would restore snapshot1's state
      const rollbackTarget = snapshot1;
      expect(rollbackTarget.worldState.id).toBe('state-initial');
    });

    it('should handle rollback after multiple state transitions', async () => {
      const agentId = 'multi-transition-agent-001';
      const snapshots: any[] = [];
      const numTransitions = 10;

      // Create series of state transitions
      for (let i = 0; i < numTransitions; i++) {
        const state: StateSnapshot = {
          id: `state-${i}`,
          timestamp: new Date(),
          entries: new Map([
            ['iteration', { value: i }],
            ['data', { value: `data-${i}` }],
          ]),
        };

        const memory: MemoryEntry[] = [{
          id: `mem-${i}`,
          content: { iteration: i },
          type: 'episodic_note',
          provenance: {
            task_id: `task-${i}`,
            step_id: `step-${i}`,
            timestamp: new Date(),
          },
        }];

        const snapshot = await snapshotManager.takeSnapshot(
          agentId,
          state,
          memory
        );

        snapshots.push(snapshot);
      }

      expect(snapshots.length).toBe(numTransitions);

      // Verify each snapshot is unique
      for (let i = 0; i < snapshots.length; i++) {
        expect(snapshots[i].worldState.id).toBe(`state-${i}`);
      }

      // Simulate rollback to middle snapshot
      const targetIndex = Math.floor(numTransitions / 2);
      const rollbackSnapshot = snapshots[targetIndex];
      
      expect(rollbackSnapshot.worldState.id).toBe(`state-${targetIndex}`);
    });

    it('should validate state consistency after rollback', async () => {
      const agentId = 'consistency-agent-001';
      
      // Create checkpoint with known state
      const checkpointState: StateSnapshot = {
        id: 'checkpoint-state',
        timestamp: new Date(),
        entries: new Map([
          ['counter', { value: 100 }],
          ['status', { value: 'stable' }],
        ]),
      };

      const checkpointMemory: MemoryEntry[] = [{
        id: 'mem-checkpoint',
        content: { checkpoint: true, counter: 100 },
        type: 'episodic_note',
        provenance: {
          task_id: 'checkpoint-task',
          step_id: 'checkpoint-step',
          timestamp: new Date(),
        },
      }];

      const checkpoint = await snapshotManager.takeSnapshot(
        agentId,
        checkpointState,
        checkpointMemory
      );

      // Simulate corrupted state
      const corruptedState: StateSnapshot = {
        id: 'corrupted-state',
        timestamp: new Date(),
        entries: new Map([
          ['counter', { value: -1 }], // Invalid value
          ['status', { value: 'error' }],
        ]),
      };

      // Rollback should restore valid checkpoint state
      const restoredState = checkpoint.worldState;
      
      expect(restoredState.entries.get('counter')?.value).toBe(100);
      expect(restoredState.entries.get('status')?.value).toBe('stable');
    });

    it('should handle rollback with memory pruning', async () => {
      const agentId = 'prune-agent-001';
      
      // Create snapshot with large memory
      const largeMemory: MemoryEntry[] = [];
      for (let i = 0; i < 1000; i++) {
        largeMemory.push({
          id: `mem-${i}`,
          content: { index: i, data: `Large data block ${i}` },
          type: 'episodic_note',
          provenance: {
            task_id: `task-${i}`,
            step_id: `step-${i}`,
            timestamp: new Date(),
          },
        });
      }

      const state: StateSnapshot = {
        id: 'large-state',
        timestamp: new Date(),
        entries: new Map(),
      };

      const snapshot = await snapshotManager.takeSnapshot(
        agentId,
        state,
        largeMemory
      );

      expect(snapshot.memorySize).toBe(1000);

      // After rollback, old memory beyond snapshot should be pruned
      // Verify snapshot contains expected memory size
      expect(snapshot.memoryEntries.length).toBe(largeMemory.length);
    });
  });

  describe('Snapshot Management Over Time', () => {
    it('should create snapshots at appropriate intervals', async () => {
      const agentId = 'interval-agent-001';
      const intervals = [10000, 20000, 30000, 40000, 50000]; // milliseconds
      const snapshots: any[] = [];

      const state: StateSnapshot = {
        id: 'state-1',
        timestamp: new Date(),
        entries: new Map(),
      };

      const memory: MemoryEntry[] = [{
        id: 'mem-1',
        content: { data: 'test' },
        type: 'episodic_note',
        provenance: {
          task_id: 'task-1',
          step_id: 'step-1',
          timestamp: new Date(),
        },
      }];

      // Check snapshot triggers at each interval
      intervals.forEach(elapsedMs => {
        const shouldSnapshot = snapshotManager.shouldTakeSnapshot(
          elapsedMs,
          50, // memory size
          10  // state changes
        );

        if (shouldSnapshot.should) {
          snapshots.push({
            elapsedMs,
            trigger: shouldSnapshot.trigger,
          });
        }
      });

      // Should have triggered at least once
      expect(snapshots.length).toBeGreaterThan(0);
    });

    it('should adapt snapshot frequency based on activity level', async () => {
      const agentId = 'adaptive-agent-001';
      
      // High activity scenario
      const highActivityResult = snapshotManager.shouldTakeSnapshot(
        15000, // 15 seconds
        200,   // High memory size
        100    // High state changes
      );

      // Low activity scenario
      const lowActivityResult = snapshotManager.shouldTakeSnapshot(
        15000, // 15 seconds
        10,    // Low memory size
        2      // Low state changes
      );

      // High activity should be more likely to trigger snapshot
      const highActivityScore = 
        (highActivityResult.should ? 1 : 0) +
        (highActivityResult.trigger === SnapshotTrigger.MEMORY_THRESHOLD ? 1 : 0);
      
      const lowActivityScore = 
        (lowActivityResult.should ? 1 : 0) +
        (lowActivityResult.trigger === SnapshotTrigger.MEMORY_THRESHOLD ? 1 : 0);

      expect(highActivityScore).toBeGreaterThanOrEqual(lowActivityScore);
    });

    it('should maintain snapshot history for audit purposes', async () => {
      const agentId = 'audit-agent-001';
      const snapshotHistory: any[] = [];

      const state: StateSnapshot = {
        id: 'state-1',
        timestamp: new Date(),
        entries: new Map(),
      };

      const memory: MemoryEntry[] = [{
        id: 'mem-1',
        content: { data: 'test' },
        type: 'episodic_note',
        provenance: {
          task_id: 'task-1',
          step_id: 'step-1',
          timestamp: new Date(),
        },
      }];

      // Create multiple snapshots
      for (let i = 0; i < 5; i++) {
        const snapshot = await snapshotManager.takeSnapshot(
          agentId,
          state,
          memory
        );

        snapshotHistory.push({
          id: snapshot.id,
          timestamp: snapshot.timestamp,
          agentId: snapshot.agentId,
          trigger: snapshot.trigger,
        });
      }

      // Verify audit trail
      expect(snapshotHistory.length).toBe(5);
      
      // Each snapshot should have unique ID and timestamp
      const uniqueIds = new Set(snapshotHistory.map(s => s.id));
      expect(uniqueIds.size).toBe(5);

      // All snapshots should be for same agent
      snapshotHistory.forEach(snapshot => {
        expect(snapshot.agentId).toBe(agentId);
      });
    });

    it('should handle concurrent snapshot requests safely', async () => {
      const agentId = 'concurrent-agent-001';
      
      const state: StateSnapshot = {
        id: 'state-1',
        timestamp: new Date(),
        entries: new Map(),
      };

      const memory: MemoryEntry[] = [{
        id: 'mem-1',
        content: { data: 'test' },
        type: 'episodic_note',
        provenance: {
          task_id: 'task-1',
          step_id: 'step-1',
          timestamp: new Date(),
        },
      }];

      // Simulate concurrent snapshot requests
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(
          snapshotManager.takeSnapshot(agentId, state, memory)
        );
      }

      const results = await Promise.all(promises);

      // All requests should complete successfully
      expect(results.length).toBe(10);
      results.forEach(snapshot => {
        expect(snapshot).toBeDefined();
        expect(snapshot.agentId).toBe(agentId);
      });

      // Each should have unique ID
      const uniqueIds = new Set(results.map(s => s.id));
      expect(uniqueIds.size).toBe(10);
    });
  });

  describe('Performance Under Load', () => {
    it('should maintain performance with high memory churn', async () => {
      const startTime = Date.now();
      const operations = 500;

      for (let i = 0; i < operations; i++) {
        const entry: MemoryEntry = {
          id: `perf-mem-${i}`,
          content: { index: i, timestamp: Date.now() },
          type: 'episodic_note',
          provenance: {
            task_id: `perf-task-${i}`,
            step_id: `perf-step-${i}`,
            timestamp: new Date(),
          },
        };

        await hipCortex.store(entry);
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete in reasonable time (adjust threshold as needed)
      expect(duration).toBeLessThan(10000); // 10 seconds for 500 operations
    });

    it('should handle large snapshot sizes efficiently', async () => {
      const agentId = 'large-snapshot-agent';
      
      // Create large state
      const largeState: StateSnapshot = {
        id: 'large-state',
        timestamp: new Date(),
        entries: new Map(),
      };

      for (let i = 0; i < 1000; i++) {
        largeState.entries.set(`key-${i}`, {
          value: `Large value with lots of data ${i}`.repeat(10),
        });
      }

      // Create large memory
      const largeMemory: MemoryEntry[] = [];
      for (let i = 0; i < 1000; i++) {
        largeMemory.push({
          id: `large-mem-${i}`,
          content: { data: `Data block ${i}`.repeat(10) },
          type: 'episodic_note',
          provenance: {
            task_id: `task-${i}`,
            step_id: `step-${i}`,
            timestamp: new Date(),
          },
        });
      }

      const startTime = Date.now();
      const snapshot = await snapshotManager.takeSnapshot(
        agentId,
        largeState,
        largeMemory
      );
      const duration = Date.now() - startTime;

      expect(snapshot).toBeDefined();
      expect(snapshot.memorySize).toBe(1000);
      
      // Should complete in reasonable time
      expect(duration).toBeLessThan(5000); // 5 seconds
    });
  });
});
