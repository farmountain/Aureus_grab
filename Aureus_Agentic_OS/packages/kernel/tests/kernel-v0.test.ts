import { describe, it, expect, beforeEach } from 'vitest';
import { WorkflowOrchestrator, TaskSpec, WorkflowSpec, TaskExecutor, InMemoryStateStore, InMemoryEventLog } from '../src';

describe('Kernel v0 - DAG Ordering', () => {
  let stateStore: InMemoryStateStore;
  let eventLog: InMemoryEventLog;
  let executionOrder: string[];
  let executor: TaskExecutor;
  let orchestrator: WorkflowOrchestrator;

  beforeEach(() => {
    stateStore = new InMemoryStateStore();
    eventLog = new InMemoryEventLog();
    executionOrder = [];
    executor = {
      execute: async (task: TaskSpec) => {
        executionOrder.push(task.id);
        return { result: 'success' };
      },
    };
    orchestrator = new WorkflowOrchestrator(stateStore, executor, eventLog);
  });

  it('should execute tasks in dependency order (simple chain)', async () => {
    const spec: WorkflowSpec = {
      id: 'dag-test-1',
      name: 'Simple Chain',
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

    expect(executionOrder).toEqual(['task1', 'task2', 'task3']);
  });

  it('should execute tasks in dependency order (diamond pattern)', async () => {
    const spec: WorkflowSpec = {
      id: 'dag-test-2',
      name: 'Diamond Pattern',
      tasks: [
        { id: 'task1', name: 'Task 1', type: 'action' },
        { id: 'task2', name: 'Task 2', type: 'action' },
        { id: 'task3', name: 'Task 3', type: 'action' },
        { id: 'task4', name: 'Task 4', type: 'action' },
      ],
      dependencies: new Map([
        ['task2', ['task1']],
        ['task3', ['task1']],
        ['task4', ['task2', 'task3']],
      ]),
    };

    await orchestrator.executeWorkflow(spec);

    // Task1 must be first
    expect(executionOrder[0]).toBe('task1');
    // Task4 must be last
    expect(executionOrder[3]).toBe('task4');
    // Task2 and Task3 can be in any order but both before Task4
    expect(executionOrder.slice(1, 3)).toContain('task2');
    expect(executionOrder.slice(1, 3)).toContain('task3');
  });

  it('should execute independent tasks (no dependencies)', async () => {
    const spec: WorkflowSpec = {
      id: 'dag-test-3',
      name: 'Independent Tasks',
      tasks: [
        { id: 'task1', name: 'Task 1', type: 'action' },
        { id: 'task2', name: 'Task 2', type: 'action' },
        { id: 'task3', name: 'Task 3', type: 'action' },
      ],
      dependencies: new Map(),
    };

    await orchestrator.executeWorkflow(spec);

    // All tasks should execute
    expect(executionOrder.length).toBe(3);
    expect(executionOrder).toContain('task1');
    expect(executionOrder).toContain('task2');
    expect(executionOrder).toContain('task3');
  });

  it('should execute complex DAG with multiple dependencies', async () => {
    const spec: WorkflowSpec = {
      id: 'dag-test-4',
      name: 'Complex DAG',
      tasks: [
        { id: 'A', name: 'Task A', type: 'action' },
        { id: 'B', name: 'Task B', type: 'action' },
        { id: 'C', name: 'Task C', type: 'action' },
        { id: 'D', name: 'Task D', type: 'action' },
        { id: 'E', name: 'Task E', type: 'action' },
      ],
      dependencies: new Map([
        ['B', ['A']],
        ['C', ['A']],
        ['D', ['B', 'C']],
        ['E', ['D']],
      ]),
    };

    await orchestrator.executeWorkflow(spec);

    // Verify order constraints
    const indexA = executionOrder.indexOf('A');
    const indexB = executionOrder.indexOf('B');
    const indexC = executionOrder.indexOf('C');
    const indexD = executionOrder.indexOf('D');
    const indexE = executionOrder.indexOf('E');

    expect(indexA).toBeLessThan(indexB);
    expect(indexA).toBeLessThan(indexC);
    expect(indexB).toBeLessThan(indexD);
    expect(indexC).toBeLessThan(indexD);
    expect(indexD).toBeLessThan(indexE);
  });
});

describe('Kernel v0 - Retry Behavior', () => {
  let stateStore: InMemoryStateStore;
  let eventLog: InMemoryEventLog;
  let orchestrator: WorkflowOrchestrator;

  beforeEach(() => {
    stateStore = new InMemoryStateStore();
    eventLog = new InMemoryEventLog();
  });

  it('should retry failed tasks with exponential backoff', async () => {
    let attemptCount = 0;
    const executor: TaskExecutor = {
      execute: async (task: TaskSpec) => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new Error('Simulated failure');
        }
        return { result: 'success' };
      },
    };

    orchestrator = new WorkflowOrchestrator(stateStore, executor, eventLog);

    const spec: WorkflowSpec = {
      id: 'retry-test-1',
      name: 'Retry Test',
      tasks: [
        {
          id: 'task1',
          name: 'Task 1',
          type: 'action',
          retry: {
            maxAttempts: 3,
            backoffMs: 10,
            backoffMultiplier: 2,
            jitter: false, // Disable jitter for predictable timing
          },
        },
      ],
      dependencies: new Map(),
    };

    const startTime = Date.now();
    await orchestrator.executeWorkflow(spec);
    const endTime = Date.now();

    // Should have retried twice: 10ms + 20ms = 30ms minimum
    expect(attemptCount).toBe(3);
    expect(endTime - startTime).toBeGreaterThanOrEqual(30);
  });

  it('should apply jitter to retry backoff', async () => {
    let attemptCount = 0;
    const backoffTimes: number[] = [];
    const executor: TaskExecutor = {
      execute: async (task: TaskSpec) => {
        attemptCount++;
        if (attemptCount < 4) {
          throw new Error('Simulated failure');
        }
        return { result: 'success' };
      },
    };

    orchestrator = new WorkflowOrchestrator(stateStore, executor, eventLog);

    const spec: WorkflowSpec = {
      id: 'retry-test-2',
      name: 'Jitter Test',
      tasks: [
        {
          id: 'task1',
          name: 'Task 1',
          type: 'action',
          retry: {
            maxAttempts: 4,
            backoffMs: 100,
            backoffMultiplier: 2,
            jitter: true,
          },
        },
      ],
      dependencies: new Map(),
    };

    const startTime = Date.now();
    await orchestrator.executeWorkflow(spec);
    const endTime = Date.now();
    const totalTime = endTime - startTime;

    // With jitter, backoff times are randomized between 0.5x and 1.5x
    // Expected: ~50-150ms, ~100-300ms, ~200-600ms
    // Without jitter: 100ms + 200ms + 400ms = 700ms
    // With jitter: should be between 350ms (all 0.5x) and 1050ms (all 1.5x)
    expect(totalTime).toBeGreaterThanOrEqual(350);
    expect(totalTime).toBeLessThan(1500); // Give some buffer
  });

  it('should fail after max retry attempts', async () => {
    const executor: TaskExecutor = {
      execute: async () => {
        throw new Error('Persistent failure');
      },
    };

    orchestrator = new WorkflowOrchestrator(stateStore, executor, eventLog);

    const spec: WorkflowSpec = {
      id: 'retry-test-3',
      name: 'Max Retries Test',
      tasks: [
        {
          id: 'task1',
          name: 'Task 1',
          type: 'action',
          retry: {
            maxAttempts: 3,
            backoffMs: 10,
          },
        },
      ],
      dependencies: new Map(),
    };

    await expect(orchestrator.executeWorkflow(spec)).rejects.toThrow();

    const taskState = await stateStore.loadTaskState('retry-test-3', 'task1');
    expect(taskState?.status).toBe('failed');
    expect(taskState?.attempt).toBe(3);
  });

  it('should log retry events', async () => {
    let attemptCount = 0;
    const executor: TaskExecutor = {
      execute: async () => {
        attemptCount++;
        if (attemptCount < 2) {
          throw new Error('Simulated failure');
        }
        return { result: 'success' };
      },
    };

    orchestrator = new WorkflowOrchestrator(stateStore, executor, eventLog);

    const spec: WorkflowSpec = {
      id: 'retry-test-4',
      name: 'Retry Event Log Test',
      tasks: [
        {
          id: 'task1',
          name: 'Task 1',
          type: 'action',
          retry: {
            maxAttempts: 2,
            backoffMs: 10,
          },
        },
      ],
      dependencies: new Map(),
    };

    await orchestrator.executeWorkflow(spec);

    const events = await eventLog.read('retry-test-4');
    const retryEvents = events.filter(e => e.type === 'TASK_RETRY');
    expect(retryEvents.length).toBe(1);
    expect(retryEvents[0].metadata?.attempt).toBe(1);
  });
});

describe('Kernel v0 - Timeout Behavior', () => {
  let stateStore: InMemoryStateStore;
  let eventLog: InMemoryEventLog;
  let orchestrator: WorkflowOrchestrator;

  beforeEach(() => {
    stateStore = new InMemoryStateStore();
    eventLog = new InMemoryEventLog();
  });

  it('should timeout long-running tasks', async () => {
    const executor: TaskExecutor = {
      execute: async () => {
        // Sleep for longer than timeout
        await new Promise(resolve => setTimeout(resolve, 200));
        return { result: 'success' };
      },
    };

    orchestrator = new WorkflowOrchestrator(stateStore, executor, eventLog);

    const spec: WorkflowSpec = {
      id: 'timeout-test-1',
      name: 'Timeout Test',
      tasks: [
        {
          id: 'task1',
          name: 'Task 1',
          type: 'action',
          timeoutMs: 50,
        },
      ],
      dependencies: new Map(),
    };

    await expect(orchestrator.executeWorkflow(spec)).rejects.toThrow();

    const taskState = await stateStore.loadTaskState('timeout-test-1', 'task1');
    expect(taskState?.status).toBe('timeout');
    expect(taskState?.timedOut).toBe(true);
  });

  it('should complete tasks that finish before timeout', async () => {
    const executor: TaskExecutor = {
      execute: async () => {
        // Sleep for less than timeout
        await new Promise(resolve => setTimeout(resolve, 20));
        return { result: 'success' };
      },
    };

    orchestrator = new WorkflowOrchestrator(stateStore, executor, eventLog);

    const spec: WorkflowSpec = {
      id: 'timeout-test-2',
      name: 'No Timeout Test',
      tasks: [
        {
          id: 'task1',
          name: 'Task 1',
          type: 'action',
          timeoutMs: 100,
        },
      ],
      dependencies: new Map(),
    };

    const result = await orchestrator.executeWorkflow(spec);

    expect(result.status).toBe('completed');
    expect(result.taskStates.get('task1')?.status).toBe('completed');
  });

  it('should log timeout events', async () => {
    const executor: TaskExecutor = {
      execute: async () => {
        await new Promise(resolve => setTimeout(resolve, 200));
        return { result: 'success' };
      },
    };

    orchestrator = new WorkflowOrchestrator(stateStore, executor, eventLog);

    const spec: WorkflowSpec = {
      id: 'timeout-test-3',
      name: 'Timeout Event Log Test',
      tasks: [
        {
          id: 'task1',
          name: 'Task 1',
          type: 'action',
          timeoutMs: 50,
        },
      ],
      dependencies: new Map(),
    };

    await expect(orchestrator.executeWorkflow(spec)).rejects.toThrow();

    const events = await eventLog.read('timeout-test-3');
    const timeoutEvents = events.filter(e => e.type === 'TASK_TIMEOUT');
    expect(timeoutEvents.length).toBe(1);
  });

  it('should handle timeout with compensation', async () => {
    const executedTasks: string[] = [];
    const executor: TaskExecutor = {
      execute: async (task: TaskSpec) => {
        executedTasks.push(task.id);
        if (task.id === 'task1') {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
        return { result: 'success' };
      },
    };

    orchestrator = new WorkflowOrchestrator(stateStore, executor, eventLog);

    const spec: WorkflowSpec = {
      id: 'timeout-test-4',
      name: 'Timeout Compensation Test',
      tasks: [
        {
          id: 'task1',
          name: 'Task 1',
          type: 'action',
          timeoutMs: 50,
          compensation: {
            onTimeout: 'compensation1',
          },
        },
        {
          id: 'compensation1',
          name: 'Compensation Task',
          type: 'action',
        },
      ],
      dependencies: new Map(),
    };

    await expect(orchestrator.executeWorkflow(spec)).rejects.toThrow();

    // Compensation task should have been executed
    expect(executedTasks).toContain('compensation1');

    const events = await eventLog.read('timeout-test-4');
    const compensationEvents = events.filter(e => e.type === 'COMPENSATION_TRIGGERED');
    expect(compensationEvents.length).toBe(1);
  });

  it('should retry on timeout if retries are configured', async () => {
    let attemptCount = 0;
    const executor: TaskExecutor = {
      execute: async () => {
        attemptCount++;
        if (attemptCount < 2) {
          await new Promise(resolve => setTimeout(resolve, 200));
        } else {
          // Second attempt succeeds quickly
          return { result: 'success' };
        }
      },
    };

    orchestrator = new WorkflowOrchestrator(stateStore, executor, eventLog);

    const spec: WorkflowSpec = {
      id: 'timeout-test-5',
      name: 'Timeout Retry Test',
      tasks: [
        {
          id: 'task1',
          name: 'Task 1',
          type: 'action',
          timeoutMs: 50,
          retry: {
            maxAttempts: 2,
            backoffMs: 10,
          },
        },
      ],
      dependencies: new Map(),
    };

    const result = await orchestrator.executeWorkflow(spec);

    expect(result.status).toBe('completed');
    expect(attemptCount).toBe(2);
  });
});
