import { describe, it, expect, beforeEach } from 'vitest';
import { WorkflowOrchestrator } from '../src/orchestrator';
import { TaskSpec, WorkflowSpec, TaskState, StateStore, TaskExecutor, WorkflowState, EventLog, Event } from '../src/types';
import { CRVGate, Validators, Commit, RecoveryExecutor, RecoveryResult, RecoveryStrategy } from '@aureus/crv';
import { TelemetryCollector, TelemetryEvent } from '@aureus/observability';

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
    if (task.id === 'task-negative-value') {
      return { id: '123', value: -10 }; // Negative value for recovery testing
    }
    return { result: 'ok' };
  }
}

// Mock event log for capturing events
class MockEventLog implements EventLog {
  public events: Event[] = [];

  async append(event: Event): Promise<void> {
    this.events.push(event);
  }

  async getEvents(workflowId: string): Promise<Event[]> {
    return this.events.filter(e => e.workflowId === workflowId);
  }
}

// Mock telemetry collector
class MockTelemetryCollector implements TelemetryCollector {
  public events: TelemetryEvent[] = [];
  public metrics: Array<{ name: string; value: number; tags?: Record<string, string> }> = [];

  recordEvent(event: TelemetryEvent): void {
    this.events.push(event);
  }

  recordMetric(name: string, value: number, tags?: Record<string, string>): void {
    this.metrics.push({ name, value, tags });
  }

  recordStepStart(workflowId: string, taskId: string, taskType: string, metadata?: Record<string, unknown>): void {
    // Not needed for this test
  }

  recordStepEnd(workflowId: string, taskId: string, taskType: string, success: boolean, duration?: number, error?: string): void {
    // Not needed for this test
  }

  recordCRVResult(workflowId: string, taskId: string, gateName: string, passed: boolean, blocked: boolean, failureCode?: string): void {
    this.recordMetric('crv_result', passed ? 1 : 0, {
      workflowId,
      taskId,
      gateName,
      blocked: String(blocked),
      failureCode: failureCode || '',
    });
  }

  recordSnapshotCommit(workflowId: string, taskId: string, snapshotId: string): void {
    // Not needed for this test
  }
}

// Mock recovery executor that tracks recovery calls
class MockRecoveryExecutor implements RecoveryExecutor {
  public recoveryCalls: Array<{
    type: string;
    args: unknown;
    commit: Commit;
  }> = [];

  async executeRetryAltTool(toolName: string, maxRetries: number, commit: Commit): Promise<RecoveryResult> {
    this.recoveryCalls.push({
      type: 'retry_alt_tool',
      args: { toolName, maxRetries },
      commit,
    });

    return {
      success: true,
      strategy: { type: 'retry_alt_tool', toolName, maxRetries },
      message: `Retried with alternative tool: ${toolName}`,
      recoveredData: { id: '123', value: 42 }, // Return valid data
    };
  }

  async executeAskUser(prompt: string, commit: Commit): Promise<RecoveryResult> {
    this.recoveryCalls.push({
      type: 'ask_user',
      args: { prompt },
      commit,
    });

    return {
      success: true,
      strategy: { type: 'ask_user', prompt },
      message: 'User provided valid input',
      recoveredData: { id: '123', value: 50 }, // Return valid data from user
    };
  }

  async executeEscalate(reason: string, commit: Commit): Promise<RecoveryResult> {
    this.recoveryCalls.push({
      type: 'escalate',
      args: { reason },
      commit,
    });

    return {
      success: true,
      strategy: { type: 'escalate', reason },
      message: `Escalated to human operator: ${reason}`,
    };
  }
}

describe('CRV Recovery Integration', () => {
  let stateStore: StateStore;
  let executor: TaskExecutor;
  let eventLog: MockEventLog;
  let telemetry: MockTelemetryCollector;

  beforeEach(() => {
    stateStore = new InMemoryStateStore();
    executor = new MockTaskExecutor();
    eventLog = new MockEventLog();
    telemetry = new MockTelemetryCollector();
  });

  it('should apply retry_alt_tool recovery strategy when CRV blocks commit', async () => {
    const recoveryExecutor = new MockRecoveryExecutor();
    
    const crvGate = new CRVGate({
      name: 'Validation Gate',
      validators: [
        Validators.notNull(),
        Validators.custom(
          'positive-value',
          (commit: Commit) => {
            const data = commit.data as any;
            return data && data.value > 0;
          },
          'Value must be positive'
        ),
      ],
      blockOnFailure: true,
      recoveryStrategy: {
        type: 'retry_alt_tool',
        toolName: 'alternative-validator',
        maxRetries: 3,
      },
    });

    const orchestrator = new WorkflowOrchestrator(
      stateStore,
      executor,
      eventLog,
      undefined,
      undefined,
      undefined,
      crvGate,
      undefined,
      undefined,
      telemetry,
      undefined,
      undefined,
      undefined,
      undefined,
      recoveryExecutor
    );

    const workflow: WorkflowSpec = {
      id: 'workflow-recovery-1',
      name: 'Recovery Test Workflow',
      tasks: [
        {
          id: 'task-negative-value',
          name: 'Task with Negative Value',
          type: 'action',
        },
      ],
      dependencies: new Map(),
    };

    const result = await orchestrator.executeWorkflow(workflow);

    // Verify recovery was called
    expect(recoveryExecutor.recoveryCalls).toHaveLength(1);
    expect(recoveryExecutor.recoveryCalls[0].type).toBe('retry_alt_tool');
    expect(recoveryExecutor.recoveryCalls[0].args).toEqual({
      toolName: 'alternative-validator',
      maxRetries: 3,
    });

    // Verify the workflow completed successfully with recovered data
    expect(result.status).toBe('completed');
    expect(result.taskStates.get('task-negative-value')?.status).toBe('completed');

    // Verify event log captured recovery
    const recoveryEvents = eventLog.events.filter(
      e => e.metadata?.crvRecovery !== undefined
    );
    expect(recoveryEvents).toHaveLength(1);
    expect(recoveryEvents[0].metadata?.crvRecovery).toMatchObject({
      strategyType: 'retry_alt_tool',
      success: true,
    });

    // Verify telemetry captured recovery
    const recoveryMetrics = telemetry.metrics.filter(m => m.name === 'crv_recovery_attempt');
    expect(recoveryMetrics).toHaveLength(1);
    expect(recoveryMetrics[0].value).toBe(1); // Success
    expect(recoveryMetrics[0].tags?.strategyType).toBe('retry_alt_tool');
  });

  it('should apply ask_user recovery strategy when CRV blocks commit', async () => {
    const recoveryExecutor = new MockRecoveryExecutor();
    
    const crvGate = new CRVGate({
      name: 'User Input Gate',
      validators: [Validators.notNull()],
      blockOnFailure: true,
      recoveryStrategy: {
        type: 'ask_user',
        prompt: 'Please provide valid data',
      },
    });

    const orchestrator = new WorkflowOrchestrator(
      stateStore,
      executor,
      eventLog,
      undefined,
      undefined,
      undefined,
      crvGate,
      undefined,
      undefined,
      telemetry,
      undefined,
      undefined,
      undefined,
      undefined,
      recoveryExecutor
    );

    const workflow: WorkflowSpec = {
      id: 'workflow-recovery-2',
      name: 'Ask User Recovery Workflow',
      tasks: [
        {
          id: 'task-invalid-null',
          name: 'Task with Null Value',
          type: 'action',
        },
      ],
      dependencies: new Map(),
    };

    const result = await orchestrator.executeWorkflow(workflow);

    // Verify recovery was called
    expect(recoveryExecutor.recoveryCalls).toHaveLength(1);
    expect(recoveryExecutor.recoveryCalls[0].type).toBe('ask_user');
    expect(recoveryExecutor.recoveryCalls[0].args).toEqual({
      prompt: 'Please provide valid data',
    });

    // Verify the workflow completed successfully with user-provided data
    expect(result.status).toBe('completed');

    // Verify event log captured recovery
    const recoveryEvents = eventLog.events.filter(
      e => e.metadata?.crvRecovery !== undefined
    );
    expect(recoveryEvents).toHaveLength(1);
    expect(recoveryEvents[0].metadata?.crvRecovery).toMatchObject({
      strategyType: 'ask_user',
      success: true,
    });
  });

  it('should apply escalate recovery strategy when CRV blocks commit', async () => {
    const recoveryExecutor = new MockRecoveryExecutor();
    
    const crvGate = new CRVGate({
      name: 'Escalation Gate',
      validators: [Validators.notNull()],
      blockOnFailure: true,
      recoveryStrategy: {
        type: 'escalate',
        reason: 'Critical validation failure requires human review',
      },
    });

    const orchestrator = new WorkflowOrchestrator(
      stateStore,
      executor,
      eventLog,
      undefined,
      undefined,
      undefined,
      crvGate,
      undefined,
      undefined,
      telemetry,
      undefined,
      undefined,
      undefined,
      undefined,
      recoveryExecutor
    );

    const workflow: WorkflowSpec = {
      id: 'workflow-recovery-3',
      name: 'Escalation Recovery Workflow',
      tasks: [
        {
          id: 'task-invalid-null',
          name: 'Task with Null Value',
          type: 'action',
        },
      ],
      dependencies: new Map(),
    };

    const result = await orchestrator.executeWorkflow(workflow);

    // Verify recovery was called
    expect(recoveryExecutor.recoveryCalls).toHaveLength(1);
    expect(recoveryExecutor.recoveryCalls[0].type).toBe('escalate');

    // Escalation doesn't provide recovered data, so task should fail
    expect(result.status).toBe('failed');

    // Verify event log captured recovery
    const recoveryEvents = eventLog.events.filter(
      e => e.metadata?.crvRecovery !== undefined
    );
    expect(recoveryEvents).toHaveLength(1);
    expect(recoveryEvents[0].metadata?.crvRecovery).toMatchObject({
      strategyType: 'escalate',
      success: true,
    });
  });

  it('should apply ignore recovery strategy when CRV blocks commit', async () => {
    const recoveryExecutor = new MockRecoveryExecutor();
    
    const crvGate = new CRVGate({
      name: 'Ignore Gate',
      validators: [Validators.notNull()],
      blockOnFailure: true,
      recoveryStrategy: {
        type: 'ignore',
        justification: 'Non-critical validation - proceeding anyway',
      },
    });

    const orchestrator = new WorkflowOrchestrator(
      stateStore,
      executor,
      eventLog,
      undefined,
      undefined,
      undefined,
      crvGate,
      undefined,
      undefined,
      telemetry,
      undefined,
      undefined,
      undefined,
      undefined,
      recoveryExecutor
    );

    const workflow: WorkflowSpec = {
      id: 'workflow-recovery-4',
      name: 'Ignore Recovery Workflow',
      tasks: [
        {
          id: 'task-invalid-null',
          name: 'Task with Null Value',
          type: 'action',
        },
      ],
      dependencies: new Map(),
    };

    const result = await orchestrator.executeWorkflow(workflow);

    // With 'ignore' strategy, the commit should be allowed despite validation failure
    expect(result.status).toBe('completed');
    expect(result.taskStates.get('task-invalid-null')?.status).toBe('completed');

    // Verify event log captured recovery with 'ignore'
    const recoveryEvents = eventLog.events.filter(
      e => e.metadata?.crvRecovery !== undefined
    );
    expect(recoveryEvents).toHaveLength(1);
    expect(recoveryEvents[0].metadata?.crvRecovery).toMatchObject({
      strategyType: 'ignore',
      success: true,
    });

    // Verify telemetry captured recovery
    const recoveryMetrics = telemetry.metrics.filter(m => m.name === 'crv_recovery_attempt');
    expect(recoveryMetrics).toHaveLength(1);
    expect(recoveryMetrics[0].value).toBe(1); // Success
  });

  it('should fail task when CRV blocks commit without recovery executor', async () => {
    const crvGate = new CRVGate({
      name: 'No Recovery Gate',
      validators: [Validators.notNull()],
      blockOnFailure: true,
      recoveryStrategy: {
        type: 'retry_alt_tool',
        toolName: 'alternative-tool',
        maxRetries: 3,
      },
    });

    // Create orchestrator WITHOUT recovery executor
    const orchestrator = new WorkflowOrchestrator(
      stateStore,
      executor,
      eventLog,
      undefined,
      undefined,
      undefined,
      crvGate,
      undefined,
      undefined,
      telemetry
    );

    const workflow: WorkflowSpec = {
      id: 'workflow-recovery-5',
      name: 'No Recovery Executor Workflow',
      tasks: [
        {
          id: 'task-invalid-null',
          name: 'Task with Null Value',
          type: 'action',
        },
      ],
      dependencies: new Map(),
    };

    await expect(orchestrator.executeWorkflow(workflow)).rejects.toThrow();

    const state = await stateStore.loadWorkflowState('workflow-recovery-5');
    expect(state?.status).toBe('failed');

    const taskState = await stateStore.loadTaskState('workflow-recovery-5', 'task-invalid-null');
    expect(taskState?.status).toBe('failed');
    expect(taskState?.error).toContain('CRV gate blocked commit');

    // Verify event log shows no recovery was attempted
    const taskFailedEvents = eventLog.events.filter(
      e => e.type === 'TASK_FAILED' && e.taskId === 'task-invalid-null'
    );
    expect(taskFailedEvents).toHaveLength(1);
    expect(taskFailedEvents[0].metadata?.recoveryAttempted).toBe(false);
  });

  it('should fail task when CRV blocks commit without recovery strategy', async () => {
    const recoveryExecutor = new MockRecoveryExecutor();
    
    const crvGate = new CRVGate({
      name: 'No Strategy Gate',
      validators: [Validators.notNull()],
      blockOnFailure: true,
      // No recovery strategy configured
    });

    const orchestrator = new WorkflowOrchestrator(
      stateStore,
      executor,
      eventLog,
      undefined,
      undefined,
      undefined,
      crvGate,
      undefined,
      undefined,
      telemetry,
      undefined,
      undefined,
      undefined,
      undefined,
      recoveryExecutor
    );

    const workflow: WorkflowSpec = {
      id: 'workflow-recovery-6',
      name: 'No Strategy Workflow',
      tasks: [
        {
          id: 'task-invalid-null',
          name: 'Task with Null Value',
          type: 'action',
        },
      ],
      dependencies: new Map(),
    };

    await expect(orchestrator.executeWorkflow(workflow)).rejects.toThrow();

    // Recovery executor should not be called
    expect(recoveryExecutor.recoveryCalls).toHaveLength(0);

    const taskState = await stateStore.loadTaskState('workflow-recovery-6', 'task-invalid-null');
    expect(taskState?.status).toBe('failed');
  });

  it('should record telemetry for failed recovery attempt', async () => {
    // Create a recovery executor that fails
    const failingRecoveryExecutor: RecoveryExecutor = {
      async executeRetryAltTool(toolName: string, maxRetries: number, commit: Commit): Promise<RecoveryResult> {
        throw new Error('Recovery execution failed');
      },
      async executeAskUser(prompt: string, commit: Commit): Promise<RecoveryResult> {
        throw new Error('Recovery execution failed');
      },
      async executeEscalate(reason: string, commit: Commit): Promise<RecoveryResult> {
        throw new Error('Recovery execution failed');
      },
    };
    
    const crvGate = new CRVGate({
      name: 'Failing Recovery Gate',
      validators: [Validators.notNull()],
      blockOnFailure: true,
      recoveryStrategy: {
        type: 'retry_alt_tool',
        toolName: 'alt-tool',
        maxRetries: 3,
      },
    });

    const orchestrator = new WorkflowOrchestrator(
      stateStore,
      executor,
      eventLog,
      undefined,
      undefined,
      undefined,
      crvGate,
      undefined,
      undefined,
      telemetry,
      undefined,
      undefined,
      undefined,
      undefined,
      failingRecoveryExecutor
    );

    const workflow: WorkflowSpec = {
      id: 'workflow-recovery-7',
      name: 'Failing Recovery Workflow',
      tasks: [
        {
          id: 'task-invalid-null',
          name: 'Task with Null Value',
          type: 'action',
        },
      ],
      dependencies: new Map(),
    };

    await expect(orchestrator.executeWorkflow(workflow)).rejects.toThrow();

    // Verify event log captured failed recovery
    const recoveryEvents = eventLog.events.filter(
      e => e.metadata?.crvRecovery !== undefined
    );
    expect(recoveryEvents).toHaveLength(1);
    expect(recoveryEvents[0].metadata?.crvRecovery).toMatchObject({
      strategyType: 'retry_alt_tool',
      success: false,
    });
    expect(recoveryEvents[0].metadata?.crvRecovery?.error).toContain('Recovery execution failed');

    // Verify task failed event shows recovery was attempted
    const taskFailedEvents = eventLog.events.filter(
      e => e.type === 'TASK_FAILED' && e.taskId === 'task-invalid-null'
    );
    expect(taskFailedEvents).toHaveLength(1);
    expect(taskFailedEvents[0].metadata?.recoveryAttempted).toBe(true);
    expect(taskFailedEvents[0].metadata?.recoverySuccess).toBe(false);
  });
});
