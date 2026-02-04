import { describe, it, expect, beforeEach } from 'vitest';
import { WorkflowOrchestrator, TaskSpec, WorkflowSpec, TaskExecutor, TaskState, InMemoryStateStore, InMemoryEventLog } from '../src';

describe('WorkflowOrchestrator', () => {
  let stateStore: InMemoryStateStore;
  let eventLog: InMemoryEventLog;
  let mockExecutor: TaskExecutor;
  let orchestrator: WorkflowOrchestrator;

  beforeEach(() => {
    stateStore = new InMemoryStateStore();
    eventLog = new InMemoryEventLog();
    mockExecutor = {
      execute: async (task: TaskSpec) => {
        return { taskId: task.id, result: 'success' };
      },
    };
    orchestrator = new WorkflowOrchestrator(stateStore, mockExecutor, eventLog);
  });

  it('should execute a simple workflow', async () => {
    const spec: WorkflowSpec = {
      id: 'test-workflow-1',
      name: 'Test Workflow',
      tasks: [
        { id: 'task1', name: 'Task 1', type: 'action' },
        { id: 'task2', name: 'Task 2', type: 'action' },
      ],
      dependencies: new Map([
        ['task2', ['task1']], // task2 depends on task1
      ]),
    };

    const result = await orchestrator.executeWorkflow(spec);
    
    expect(result.status).toBe('completed');
    expect(result.taskStates.size).toBe(2);
    expect(result.taskStates.get('task1')?.status).toBe('completed');
    expect(result.taskStates.get('task2')?.status).toBe('completed');
  });

  it('should persist and resume workflow state (durability)', async () => {
    let task2ExecutionCount = 0;
    const executorWithFailure: TaskExecutor = {
      execute: async (task: TaskSpec) => {
        if (task.id === 'task2') {
          task2ExecutionCount++;
          if (task2ExecutionCount === 1) {
            throw new Error('Simulated failure');
          }
        }
        return { taskId: task.id, result: 'success' };
      },
    };

    const orchestratorWithFailure = new WorkflowOrchestrator(stateStore, executorWithFailure, eventLog);
    
    const spec: WorkflowSpec = {
      id: 'test-workflow-2',
      name: 'Test Workflow with Failure',
      tasks: [
        { id: 'task1', name: 'Task 1', type: 'action' },
        { id: 'task2', name: 'Task 2', type: 'action', retry: { maxAttempts: 2, backoffMs: 10 } },
      ],
      dependencies: new Map([
        ['task2', ['task1']],
      ]),
    };

    const result = await orchestratorWithFailure.executeWorkflow(spec);
    
    // Task 2 should succeed on retry
    expect(result.status).toBe('completed');
    expect(result.taskStates.get('task2')?.status).toBe('completed');
    expect(result.taskStates.get('task2')?.attempt).toBeGreaterThan(1);
  });

  it('should ensure idempotency with idempotency key', async () => {
    let executionCount = 0;
    const countingExecutor: TaskExecutor = {
      execute: async (task: TaskSpec) => {
        executionCount++;
        return { taskId: task.id, count: executionCount };
      },
    };

    const orchestratorWithCounting = new WorkflowOrchestrator(stateStore, countingExecutor, eventLog);
    
    const spec: WorkflowSpec = {
      id: 'test-workflow-3',
      name: 'Idempotency Test',
      tasks: [
        { id: 'task1', name: 'Task 1', type: 'action', idempotencyKey: 'key-1' },
      ],
      dependencies: new Map(),
    };

    // Execute workflow twice
    await orchestratorWithCounting.executeWorkflow(spec);
    executionCount = 0; // Reset counter
    await orchestratorWithCounting.executeWorkflow(spec);
    
    // Task should not execute again due to idempotency
    expect(executionCount).toBe(0);
  });

  it('should handle task failures after max retries', async () => {
    const failingExecutor: TaskExecutor = {
      execute: async () => {
        throw new Error('Persistent failure');
      },
    };

    const orchestratorWithFailure = new WorkflowOrchestrator(stateStore, failingExecutor, eventLog);
    
    const spec: WorkflowSpec = {
      id: 'test-workflow-4',
      name: 'Failing Workflow',
      tasks: [
        { id: 'task1', name: 'Failing Task', type: 'action', retry: { maxAttempts: 2, backoffMs: 10 } },
      ],
      dependencies: new Map(),
    };

    await expect(orchestratorWithFailure.executeWorkflow(spec)).rejects.toThrow();
    
    const state = await stateStore.loadWorkflowState('test-workflow-4');
    expect(state?.status).toBe('failed');
    expect(state?.taskStates.get('task1')?.status).toBe('failed');
  });
});
