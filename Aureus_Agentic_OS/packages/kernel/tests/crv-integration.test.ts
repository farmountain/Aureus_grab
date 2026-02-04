import { describe, it, expect, beforeEach } from 'vitest';
import { WorkflowOrchestrator } from '../src/orchestrator';
import { TaskSpec, WorkflowSpec, TaskState, StateStore, TaskExecutor, WorkflowState } from '../src/types';
import { CRVGate, Validators, Commit } from '@aureus/crv';

// In-memory state store for testing
class InMemoryStateStore implements StateStore {
  private workflowStates = new Map<string, WorkflowState>();
  private taskStates = new Map<string, Map<string, TaskState>>();

  async saveWorkflowState(state: WorkflowState): Promise<void> {
    this.workflowStates.set(state.workflowId, state);
  }

  async loadWorkflowState(workflowId: string): Promise<WorkflowState | null> {
    return this.workflowStates.get(workflowId) || null;
  }

  async saveTaskState(workflowId: string, taskState: TaskState): Promise<void> {
    if (!this.taskStates.has(workflowId)) {
      this.taskStates.set(workflowId, new Map());
    }
    this.taskStates.get(workflowId)!.set(taskState.taskId, taskState);
  }

  async loadTaskState(workflowId: string, taskId: string): Promise<TaskState | null> {
    return this.taskStates.get(workflowId)?.get(taskId) || null;
  }
}

// Mock task executor
class MockTaskExecutor implements TaskExecutor {
  async execute(task: TaskSpec, state: TaskState): Promise<unknown> {
    // Return different results based on task ID
    if (task.id === 'task-valid') {
      return { id: '123', value: 42 };
    }
    if (task.id === 'task-invalid-null') {
      return null; // Will be blocked by notNull validator
    }
    if (task.id === 'task-invalid-schema') {
      return { id: '123', value: 'not-a-number' }; // Wrong type
    }
    return { result: 'ok' };
  }
}

describe('CRV Gate Integration', () => {
  let stateStore: StateStore;
  let executor: TaskExecutor;

  beforeEach(() => {
    stateStore = new InMemoryStateStore();
    executor = new MockTaskExecutor();
  });

  it('should allow valid commits through CRV gate', async () => {
    const crvGate = new CRVGate({
      name: 'Test Gate',
      validators: [
        Validators.notNull(),
        Validators.schema({ id: 'string', value: 'number' }),
      ],
      blockOnFailure: true,
    });

    const orchestrator = new WorkflowOrchestrator(
      stateStore,
      executor,
      undefined,
      undefined,
      undefined,
      undefined,
      crvGate
    );

    const workflow: WorkflowSpec = {
      id: 'workflow-1',
      name: 'Test Workflow',
      tasks: [
        {
          id: 'task-valid',
          name: 'Valid Task',
          type: 'action',
        },
      ],
      dependencies: new Map(),
    };

    const result = await orchestrator.executeWorkflow(workflow);

    expect(result.status).toBe('completed');
    expect(result.taskStates.get('task-valid')?.status).toBe('completed');
  });

  it('should block null commits through CRV gate', async () => {
    const crvGate = new CRVGate({
      name: 'NotNull Gate',
      validators: [Validators.notNull()],
      blockOnFailure: true,
    });

    const orchestrator = new WorkflowOrchestrator(
      stateStore,
      executor,
      undefined,
      undefined,
      undefined,
      undefined,
      crvGate
    );

    const workflow: WorkflowSpec = {
      id: 'workflow-2',
      name: 'Null Test Workflow',
      tasks: [
        {
          id: 'task-invalid-null',
          name: 'Null Task',
          type: 'action',
        },
      ],
      dependencies: new Map(),
    };

    await expect(orchestrator.executeWorkflow(workflow)).rejects.toThrow();
    
    const state = await stateStore.loadWorkflowState('workflow-2');
    expect(state?.status).toBe('failed');
    
    const taskState = await stateStore.loadTaskState('workflow-2', 'task-invalid-null');
    expect(taskState?.status).toBe('failed');
    expect(taskState?.error).toContain('CRV gate blocked commit');
  });

  it('should block schema-invalid commits through CRV gate', async () => {
    const crvGate = new CRVGate({
      name: 'Schema Gate',
      validators: [
        Validators.schema({ id: 'string', value: 'number' }),
      ],
      blockOnFailure: true,
    });

    const orchestrator = new WorkflowOrchestrator(
      stateStore,
      executor,
      undefined,
      undefined,
      undefined,
      undefined,
      crvGate
    );

    const workflow: WorkflowSpec = {
      id: 'workflow-3',
      name: 'Schema Test Workflow',
      tasks: [
        {
          id: 'task-invalid-schema',
          name: 'Schema Invalid Task',
          type: 'action',
        },
      ],
      dependencies: new Map(),
    };

    await expect(orchestrator.executeWorkflow(workflow)).rejects.toThrow();
    
    const taskState = await stateStore.loadTaskState('workflow-3', 'task-invalid-schema');
    expect(taskState?.status).toBe('failed');
    expect(taskState?.error).toContain('wrong type');
  });

  it('should work without CRV gate configured', async () => {
    const orchestrator = new WorkflowOrchestrator(
      stateStore,
      executor
    );

    const workflow: WorkflowSpec = {
      id: 'workflow-4',
      name: 'No Gate Workflow',
      tasks: [
        {
          id: 'task-invalid-null',
          name: 'Task',
          type: 'action',
        },
      ],
      dependencies: new Map(),
    };

    // Without CRV gate, null result should be accepted
    const result = await orchestrator.executeWorkflow(workflow);
    expect(result.status).toBe('completed');
  });

  it('should support custom validators in CRV gate', async () => {
    const crvGate = new CRVGate({
      name: 'Custom Gate',
      validators: [
        Validators.custom('positive-value', (commit: Commit) => {
          const data = commit.data as any;
          return data && data.value > 0;
        }),
      ],
      blockOnFailure: true,
    });

    const orchestrator = new WorkflowOrchestrator(
      stateStore,
      executor,
      undefined,
      undefined,
      undefined,
      undefined,
      crvGate
    );

    const workflow: WorkflowSpec = {
      id: 'workflow-5',
      name: 'Custom Validator Workflow',
      tasks: [
        {
          id: 'task-valid',
          name: 'Valid Task',
          type: 'action',
        },
      ],
      dependencies: new Map(),
    };

    const result = await orchestrator.executeWorkflow(workflow);
    expect(result.status).toBe('completed');
  });
});
