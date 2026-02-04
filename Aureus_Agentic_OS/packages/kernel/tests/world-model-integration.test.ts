import { describe, it, expect, beforeEach } from 'vitest';
import { 
  WorkflowOrchestrator, 
  TaskSpec, 
  WorkflowSpec, 
  TaskExecutor, 
  InMemoryStateStore, 
  InMemoryEventLog,
  InMemoryWorldStateStore,
  WorldStateStore,
  ConflictError,
} from '../src';

describe('World Model Integration', () => {
  let stateStore: InMemoryStateStore;
  let eventLog: InMemoryEventLog;
  let worldStateStore: InMemoryWorldStateStore;
  let mockExecutor: TaskExecutor;
  let orchestrator: WorkflowOrchestrator;

  beforeEach(() => {
    stateStore = new InMemoryStateStore();
    eventLog = new InMemoryEventLog();
    worldStateStore = new InMemoryWorldStateStore();
    mockExecutor = {
      execute: async (task: TaskSpec) => {
        return { taskId: task.id, result: 'success' };
      },
    };
    orchestrator = new WorkflowOrchestrator(
      stateStore, 
      mockExecutor, 
      eventLog, 
      undefined, 
      worldStateStore
    );
  });

  describe('State Snapshotting', () => {
    it('should take snapshot before task execution', async () => {
      const spec: WorkflowSpec = {
        id: 'test-workflow-1',
        name: 'Test Workflow',
        tasks: [
          { id: 'task1', name: 'Task 1', type: 'action' },
        ],
        dependencies: new Map(),
      };

      await orchestrator.executeWorkflow(spec);

      const events = await eventLog.read('test-workflow-1');
      const snapshotEvents = events.filter(e => e.type === 'STATE_SNAPSHOT');
      
      expect(snapshotEvents).toHaveLength(1);
      expect(snapshotEvents[0].taskId).toBe('task1');
      expect(snapshotEvents[0].metadata?.snapshotId).toBeDefined();
    });

    it('should record state updates after task execution', async () => {
      // Create initial state
      await worldStateStore.create('user:1', { name: 'Alice', status: 'active' });

      mockExecutor = {
        execute: async () => {
          // Simulate state changes during task execution
          await worldStateStore.update('user:1', { name: 'Alice', status: 'inactive' }, 1);
          return { result: 'updated' };
        },
      };

      orchestrator = new WorkflowOrchestrator(
        stateStore,
        mockExecutor,
        eventLog,
        undefined,
        worldStateStore
      );

      const spec: WorkflowSpec = {
        id: 'test-workflow-2',
        name: 'Update Workflow',
        tasks: [
          { id: 'task1', name: 'Update Task', type: 'action' },
        ],
        dependencies: new Map(),
      };

      await orchestrator.executeWorkflow(spec);

      const events = await eventLog.read('test-workflow-2');
      const stateUpdateEvents = events.filter(e => e.type === 'STATE_UPDATED');
      
      expect(stateUpdateEvents).toHaveLength(1);
      expect(stateUpdateEvents[0].metadata?.stateDiff).toBeDefined();
      
      const diff = stateUpdateEvents[0].metadata!.stateDiff!;
      expect(diff).toHaveLength(1);
      expect(diff[0].operation).toBe('update');
      expect(diff[0].key).toBe('user:1');
    });

    it('should compute diff for multiple state changes', async () => {
      mockExecutor = {
        execute: async () => {
          await worldStateStore.create('order:1', { total: 100 });
          await worldStateStore.create('order:2', { total: 200 });
          return { result: 'created' };
        },
      };

      orchestrator = new WorkflowOrchestrator(
        stateStore,
        mockExecutor,
        eventLog,
        undefined,
        worldStateStore
      );

      const spec: WorkflowSpec = {
        id: 'test-workflow-3',
        name: 'Create Orders',
        tasks: [
          { id: 'task1', name: 'Create Task', type: 'action' },
        ],
        dependencies: new Map(),
      };

      await orchestrator.executeWorkflow(spec);

      const events = await eventLog.read('test-workflow-3');
      const stateUpdateEvents = events.filter(e => e.type === 'STATE_UPDATED');
      
      const diff = stateUpdateEvents[0].metadata!.stateDiff!;
      expect(diff).toHaveLength(2);
      expect(diff[0].operation).toBe('create');
      expect(diff[1].operation).toBe('create');
      expect(diff.map(d => d.key)).toContain('order:1');
      expect(diff.map(d => d.key)).toContain('order:2');
    });
  });

  describe('Conflict Detection', () => {
    it('should handle conflicts during task execution', async () => {
      // Create initial state
      await worldStateStore.create('counter', { value: 0 });

      mockExecutor = {
        execute: async (task: TaskSpec) => {
          // First task updates counter
          if (task.id === 'task1') {
            await worldStateStore.update('counter', { value: 1 }, 1);
            return { result: 'updated' };
          }
          // Second task tries to update with wrong version (conflict)
          if (task.id === 'task2') {
            try {
              await worldStateStore.update('counter', { value: 2 }, 1); // wrong version
            } catch (error) {
              if (error instanceof ConflictError) {
                worldStateStore.recordConflict(task.id, {
                  key: 'counter',
                  expectedVersion: 1,
                  actualVersion: 2,
                  attemptedValue: { value: 2 },
                  timestamp: new Date(),
                });
                throw error;
              }
            }
          }
          return { result: 'success' };
        },
      };

      orchestrator = new WorkflowOrchestrator(
        stateStore,
        mockExecutor,
        eventLog,
        undefined,
        worldStateStore
      );

      const spec: WorkflowSpec = {
        id: 'test-workflow-4',
        name: 'Conflict Workflow',
        tasks: [
          { id: 'task1', name: 'Task 1', type: 'action' },
          { id: 'task2', name: 'Task 2', type: 'action' },
        ],
        dependencies: new Map([
          ['task2', ['task1']],
        ]),
      };

      try {
        await orchestrator.executeWorkflow(spec);
        expect.fail('Should have thrown conflict error');
      } catch (error) {
        // Error is wrapped by orchestrator, check the message contains conflict info
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('Conflict on key');
      }

      // Verify conflict was recorded
      const conflicts = worldStateStore.getConflicts('task2');
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].key).toBe('counter');
      expect(conflicts[0].expectedVersion).toBe(1);
      expect(conflicts[0].actualVersion).toBe(2);
    });

    it('should detect multiple conflicts in same task', async () => {
      await worldStateStore.create('counter1', { value: 0 });
      await worldStateStore.create('counter2', { value: 0 });

      // Update counters once
      await worldStateStore.update('counter1', { value: 1 }, 1);
      await worldStateStore.update('counter2', { value: 1 }, 1);

      mockExecutor = {
        execute: async (task: TaskSpec) => {
          // Try to update both with wrong versions
          for (const key of ['counter1', 'counter2']) {
            try {
              await worldStateStore.update(key, { value: 99 }, 1); // wrong version
            } catch (error) {
              if (error instanceof ConflictError) {
                worldStateStore.recordConflict(task.id, {
                  key,
                  expectedVersion: 1,
                  actualVersion: 2,
                  attemptedValue: { value: 99 },
                  timestamp: new Date(),
                });
              }
            }
          }
          return { result: 'completed with conflicts' };
        },
      };

      orchestrator = new WorkflowOrchestrator(
        stateStore,
        mockExecutor,
        eventLog,
        undefined,
        worldStateStore
      );

      const spec: WorkflowSpec = {
        id: 'test-workflow-5',
        name: 'Multi-Conflict Workflow',
        tasks: [
          { id: 'task1', name: 'Task 1', type: 'action' },
        ],
        dependencies: new Map(),
      };

      await orchestrator.executeWorkflow(spec);

      const conflicts = worldStateStore.getConflicts('task1');
      expect(conflicts).toHaveLength(2);
      expect(conflicts.map(c => c.key)).toContain('counter1');
      expect(conflicts.map(c => c.key)).toContain('counter2');
    });
  });

  describe('Versioning', () => {
    it('should maintain version history across workflow execution', async () => {
      mockExecutor = {
        execute: async (task: TaskSpec) => {
          if (task.id === 'task1') {
            await worldStateStore.create('document', { content: 'v1' });
          } else if (task.id === 'task2') {
            await worldStateStore.update('document', { content: 'v2' }, 1);
          } else if (task.id === 'task3') {
            await worldStateStore.update('document', { content: 'v3' }, 2);
          }
          return { result: 'success' };
        },
      };

      orchestrator = new WorkflowOrchestrator(
        stateStore,
        mockExecutor,
        eventLog,
        undefined,
        worldStateStore
      );

      const spec: WorkflowSpec = {
        id: 'test-workflow-6',
        name: 'Version Workflow',
        tasks: [
          { id: 'task1', name: 'Task 1', type: 'action' },
          { id: 'task2', name: 'Task 2', type: 'action' },
          { id: 'task3', name: 'Task 3', type: 'action' },
        ],
        dependencies: new Map([
          ['task2', ['task1']],
          ['task3', ['task2']],
        ]),
      };

      await orchestrator.executeWorkflow(spec);

      // Verify version history
      const v1 = await worldStateStore.readVersion('document', 1);
      const v2 = await worldStateStore.readVersion('document', 2);
      const v3 = await worldStateStore.readVersion('document', 3);

      expect(v1!.value).toEqual({ content: 'v1' });
      expect(v2!.value).toEqual({ content: 'v2' });
      expect(v3!.value).toEqual({ content: 'v3' });

      // Verify current version
      const current = await worldStateStore.read('document');
      expect(current!.version).toBe(3);
      expect(current!.value).toEqual({ content: 'v3' });
    });

    it('should include version info in state diffs', async () => {
      await worldStateStore.create('config', { setting: 'off' });

      mockExecutor = {
        execute: async () => {
          await worldStateStore.update('config', { setting: 'on' }, 1);
          return { result: 'updated' };
        },
      };

      orchestrator = new WorkflowOrchestrator(
        stateStore,
        mockExecutor,
        eventLog,
        undefined,
        worldStateStore
      );

      const spec: WorkflowSpec = {
        id: 'test-workflow-7',
        name: 'Config Workflow',
        tasks: [
          { id: 'task1', name: 'Update Config', type: 'action' },
        ],
        dependencies: new Map(),
      };

      await orchestrator.executeWorkflow(spec);

      const events = await eventLog.read('test-workflow-7');
      const stateUpdateEvents = events.filter(e => e.type === 'STATE_UPDATED');
      
      const diff = stateUpdateEvents[0].metadata!.stateDiff!;
      expect(diff[0].before).toBeDefined();
      expect(diff[0].after).toBeDefined();
    });
  });

  describe('Integration without WorldStateStore', () => {
    it('should work normally when worldStateStore is not provided', async () => {
      const orchestratorWithoutWorldState = new WorkflowOrchestrator(
        stateStore,
        mockExecutor,
        eventLog
      );

      const spec: WorkflowSpec = {
        id: 'test-workflow-8',
        name: 'No World State',
        tasks: [
          { id: 'task1', name: 'Task 1', type: 'action' },
        ],
        dependencies: new Map(),
      };

      const result = await orchestratorWithoutWorldState.executeWorkflow(spec);
      
      expect(result.status).toBe('completed');
      
      const events = await eventLog.read('test-workflow-8');
      const snapshotEvents = events.filter(e => e.type === 'STATE_SNAPSHOT');
      const stateUpdateEvents = events.filter(e => e.type === 'STATE_UPDATED');
      
      // No state events should be logged
      expect(snapshotEvents).toHaveLength(0);
      expect(stateUpdateEvents).toHaveLength(0);
    });
  });
});
