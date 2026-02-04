import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConsoleService } from '../src/console-service';
import type { WorkflowState, TaskState, StateStore, EventLog, Event } from '../src/types';
import { GoalGuardFSM } from '@aureus/policy';
import { SnapshotManager } from '@aureus/memory-hipcortex';

// Mock implementations to avoid js-yaml dependency
class MockStateStore implements StateStore {
  private states = new Map<string, WorkflowState>();
  
  async saveWorkflowState(state: WorkflowState): Promise<void> {
    this.states.set(state.workflowId, state);
  }
  
  async loadWorkflowState(workflowId: string): Promise<WorkflowState | null> {
    return this.states.get(workflowId) || null;
  }
  
  async saveTaskState(workflowId: string, taskState: TaskState): Promise<void> {}
  
  async loadTaskState(workflowId: string, taskId: string): Promise<TaskState | null> {
    return null;
  }
}

class MockEventLog implements EventLog {
  private events: Event[] = [];
  
  async append(event: Event): Promise<void> {
    this.events.push(event);
  }
  
  async read(workflowId: string): Promise<Event[]> {
    return this.events.filter(e => e.workflowId === workflowId);
  }
}

describe('ConsoleService', () => {
  let consoleService: ConsoleService;
  let stateStore: MockStateStore;
  let eventLog: MockEventLog;
  let policyGuard: GoalGuardFSM;
  let snapshotManager: SnapshotManager;

  beforeEach(() => {
    stateStore = new MockStateStore();
    eventLog = new MockEventLog();
    policyGuard = new GoalGuardFSM();
    snapshotManager = new SnapshotManager();
    
    consoleService = new ConsoleService(
      stateStore as any,
      eventLog as any,
      policyGuard,
      snapshotManager
    );
  });

  it('should list workflows', async () => {
    const workflows = await consoleService.listWorkflows();
    expect(workflows).toEqual([]);
  });

  it('should get workflow status', async () => {
    // Create a test workflow
    const taskState: TaskState = {
      taskId: 'task1',
      status: 'completed',
      attempt: 1,
    };

    const workflowState: WorkflowState = {
      workflowId: 'test-workflow',
      status: 'running',
      taskStates: new Map([['task1', taskState]]),
      startedAt: new Date(),
    };

    await stateStore.saveWorkflowState(workflowState);

    // Add some events
    await eventLog.append({
      timestamp: new Date(),
      type: 'WORKFLOW_STARTED',
      workflowId: 'test-workflow',
    });

    await eventLog.append({
      timestamp: new Date(),
      type: 'TASK_COMPLETED',
      workflowId: 'test-workflow',
      taskId: 'task1',
    });

    const status = await consoleService.getWorkflowStatus('test-workflow');
    
    expect(status).toBeDefined();
    expect(status?.workflowId).toBe('test-workflow');
    expect(status?.status).toBe('running');
    expect(status?.tasks).toHaveLength(1);
    expect(status?.tasks[0].taskId).toBe('task1');
    expect(status?.tasks[0].status).toBe('completed');
  });

  it('should get workflow events', async () => {
    await eventLog.append({
      timestamp: new Date(),
      type: 'WORKFLOW_STARTED',
      workflowId: 'test-workflow',
    });

    const events = await consoleService.getWorkflowEvents('test-workflow');
    
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('WORKFLOW_STARTED');
  });

  it('should get timeline', async () => {
    await eventLog.append({
      timestamp: new Date(),
      type: 'WORKFLOW_STARTED',
      workflowId: 'test-workflow',
    });

    await eventLog.append({
      timestamp: new Date(),
      type: 'TASK_STARTED',
      workflowId: 'test-workflow',
      taskId: 'task1',
    });

    const timeline = await consoleService.getTimeline('test-workflow');
    
    expect(timeline).toHaveLength(2);
    expect(timeline[0].type).toBe('WORKFLOW_STARTED');
    expect(timeline[1].type).toBe('TASK_STARTED');
    expect(timeline[0].description).toContain('Workflow started');
  });

  it('should register workflow', async () => {
    const taskState: TaskState = {
      taskId: 'task1',
      status: 'running',
      attempt: 1,
    };

    const workflowState: WorkflowState = {
      workflowId: 'test-workflow',
      status: 'running',
      taskStates: new Map([['task1', taskState]]),
      startedAt: new Date(),
    };

    // Save to state store first
    await stateStore.saveWorkflowState(workflowState);
    
    // Then register with console service
    consoleService.registerWorkflow('test-workflow', workflowState);

    // Workflow should now be available in list
    const workflows = await consoleService.listWorkflows();
    expect(workflows).toHaveLength(1);
  });

  it('should deny action', async () => {
    const workflowState: WorkflowState = {
      workflowId: 'test-workflow',
      status: 'running',
      taskStates: new Map(),
      startedAt: new Date(),
    };

    await stateStore.saveWorkflowState(workflowState);

    const result = await consoleService.denyAction(
      'test-workflow',
      'task1',
      'some-token',
      'operator',
      'Not authorized'
    );

    expect(result).toBe(true);

    // Check that event was logged
    const events = await eventLog.read('test-workflow');
    const denyEvent = events.find(e => e.type === 'ROLLBACK_POLICY_DECISION');
    expect(denyEvent).toBeDefined();
  });

  it('should extract CRV status from events', async () => {
    const workflowState: WorkflowState = {
      workflowId: 'test-workflow',
      status: 'running',
      taskStates: new Map(),
      startedAt: new Date(),
    };

    await stateStore.saveWorkflowState(workflowState);

    await eventLog.append({
      timestamp: new Date(),
      type: 'STATE_UPDATED',
      workflowId: 'test-workflow',
      metadata: {
        crvGateResult: {
          passed: true,
          gateName: 'TestGate',
          blockedCommit: false,
        },
      },
    });

    const status = await consoleService.getWorkflowStatus('test-workflow');
    
    expect(status?.crvStatus).toBeDefined();
    expect(status?.crvStatus?.status).toBe('passed');
    expect(status?.crvStatus?.gateName).toBe('TestGate');
  });

  it('should extract policy status from events', async () => {
    const taskState: TaskState = {
      taskId: 'task1',
      status: 'pending',
      attempt: 0,
    };

    const workflowState: WorkflowState = {
      workflowId: 'test-workflow',
      status: 'running',
      taskStates: new Map([['task1', taskState]]),
      startedAt: new Date(),
    };

    await stateStore.saveWorkflowState(workflowState);

    await eventLog.append({
      timestamp: new Date(),
      type: 'TASK_STARTED',
      workflowId: 'test-workflow',
      taskId: 'task1',
      metadata: {
        policyDecision: {
          allowed: false,
          reason: 'Requires approval',
          requiresHumanApproval: true,
          approvalToken: 'test-token',
        },
      },
    });

    const status = await consoleService.getWorkflowStatus('test-workflow');
    
    expect(status?.policyStatus).toBeDefined();
    expect(status?.policyStatus?.status).toBe('pending');
    expect(status?.policyStatus?.requiresHumanApproval).toBe(true);
    expect(status?.policyStatus?.approvalToken).toBe('test-token');
  });
});
