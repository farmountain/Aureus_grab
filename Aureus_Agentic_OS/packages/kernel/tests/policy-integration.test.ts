import { describe, it, expect, beforeEach } from 'vitest';
import { WorkflowOrchestrator } from '../src/orchestrator';
import { InMemoryStateStore } from '../src/state-store';
import { TaskSpec, TaskState, WorkflowSpec, TaskExecutor } from '../src/types';
import { GoalGuardFSM, Principal, RiskTier } from '@aureus/policy';

/**
 * Tests for policy integration with kernel orchestrator
 * Validates that policy checks are enforced before tool execution
 */
describe('Policy Integration', () => {
  let stateStore: InMemoryStateStore;
  let policyGuard: GoalGuardFSM;
  let principal: Principal;
  let executor: TaskExecutor;

  beforeEach(() => {
    stateStore = new InMemoryStateStore();
    policyGuard = new GoalGuardFSM();
    
    // Create principal with read/write permissions
    principal = {
      id: 'test-agent',
      type: 'agent',
      permissions: [
        { action: 'read', resource: 'data' },
        { action: 'write', resource: 'data' },
      ],
    };

    // Mock executor
    executor = {
      execute: async (task: TaskSpec, state: TaskState) => {
        return { success: true, taskId: task.id };
      },
    };
  });

  it('should allow LOW risk tasks without approval', async () => {
    const orchestrator = new WorkflowOrchestrator(
      stateStore,
      executor,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      policyGuard,
      principal
    );

    const spec: WorkflowSpec = {
      id: 'workflow-1',
      name: 'Low Risk Workflow',
      tasks: [
        {
          id: 'task-1',
          name: 'Read Data',
          type: 'action',
          riskTier: 'LOW',
          requiredPermissions: [{ action: 'read', resource: 'data' }],
        },
      ],
      dependencies: new Map(),
    };

    const result = await orchestrator.executeWorkflow(spec);
    
    expect(result.status).toBe('completed');
    expect(result.taskStates.get('task-1')?.status).toBe('completed');
  });

  it('should allow MEDIUM risk tasks without approval', async () => {
    const orchestrator = new WorkflowOrchestrator(
      stateStore,
      executor,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      policyGuard,
      principal
    );

    const spec: WorkflowSpec = {
      id: 'workflow-2',
      name: 'Medium Risk Workflow',
      tasks: [
        {
          id: 'task-1',
          name: 'Write Data',
          type: 'action',
          riskTier: 'MEDIUM',
          requiredPermissions: [{ action: 'write', resource: 'data' }],
        },
      ],
      dependencies: new Map(),
    };

    const result = await orchestrator.executeWorkflow(spec);
    
    expect(result.status).toBe('completed');
    expect(result.taskStates.get('task-1')?.status).toBe('completed');
  });

  it('should block HIGH risk tasks without approval', async () => {
    const orchestrator = new WorkflowOrchestrator(
      stateStore,
      executor,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      policyGuard,
      principal
    );

    const spec: WorkflowSpec = {
      id: 'workflow-3',
      name: 'High Risk Workflow',
      tasks: [
        {
          id: 'task-1',
          name: 'Delete Data',
          type: 'action',
          riskTier: 'HIGH',
          requiredPermissions: [{ action: 'write', resource: 'data' }],
        },
      ],
      dependencies: new Map(),
    };

    // Expect workflow to throw since HIGH risk requires approval
    await expect(orchestrator.executeWorkflow(spec)).rejects.toThrow('Policy gate blocked');
  });

  it('should block CRITICAL risk tasks without approval', async () => {
    const orchestrator = new WorkflowOrchestrator(
      stateStore,
      executor,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      policyGuard,
      principal
    );

    const spec: WorkflowSpec = {
      id: 'workflow-4',
      name: 'Critical Risk Workflow',
      tasks: [
        {
          id: 'task-1',
          name: 'Drop Database',
          type: 'action',
          riskTier: 'CRITICAL',
          requiredPermissions: [{ action: 'write', resource: 'data' }],
        },
      ],
      dependencies: new Map(),
    };

    // Expect workflow to throw since CRITICAL risk requires approval
    await expect(orchestrator.executeWorkflow(spec)).rejects.toThrow('Policy gate blocked');
  });

  it('should block tasks without required permissions', async () => {
    const orchestrator = new WorkflowOrchestrator(
      stateStore,
      executor,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      policyGuard,
      principal
    );

    const spec: WorkflowSpec = {
      id: 'workflow-5',
      name: 'Unauthorized Workflow',
      tasks: [
        {
          id: 'task-1',
          name: 'Admin Action',
          type: 'action',
          riskTier: 'LOW',
          requiredPermissions: [{ action: 'admin', resource: 'system' }],
        },
      ],
      dependencies: new Map(),
    };

    // Expect workflow to throw since permissions are missing
    await expect(orchestrator.executeWorkflow(spec)).rejects.toThrow('Policy gate blocked');
  });

  it('should validate allowed tools', async () => {
    const orchestrator = new WorkflowOrchestrator(
      stateStore,
      executor,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      policyGuard,
      principal
    );

    const spec: WorkflowSpec = {
      id: 'workflow-6',
      name: 'Tool Validation Workflow',
      tasks: [
        {
          id: 'task-1',
          name: 'Restricted Tool Action',
          type: 'action',
          riskTier: 'LOW',
          requiredPermissions: [{ action: 'read', resource: 'data' }],
          allowedTools: ['tool-a', 'tool-b'],
          toolName: 'tool-c', // Not in allowed list
        },
      ],
      dependencies: new Map(),
    };

    // Expect workflow to throw since tool is not allowed
    await expect(orchestrator.executeWorkflow(spec)).rejects.toThrow('not allowed');
  });

  it('should allow tasks with correct tool from allowed list', async () => {
    const orchestrator = new WorkflowOrchestrator(
      stateStore,
      executor,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      policyGuard,
      principal
    );

    const spec: WorkflowSpec = {
      id: 'workflow-7',
      name: 'Allowed Tool Workflow',
      tasks: [
        {
          id: 'task-1',
          name: 'Allowed Tool Action',
          type: 'action',
          riskTier: 'LOW',
          requiredPermissions: [{ action: 'read', resource: 'data' }],
          allowedTools: ['tool-a', 'tool-b'],
          toolName: 'tool-a', // In allowed list
        },
      ],
      dependencies: new Map(),
    };

    const result = await orchestrator.executeWorkflow(spec);
    
    expect(result.status).toBe('completed');
    expect(result.taskStates.get('task-1')?.status).toBe('completed');
  });

  it('should work without policy guard when not configured', async () => {
    // Create orchestrator without policy guard
    const orchestrator = new WorkflowOrchestrator(
      stateStore,
      executor
    );

    const spec: WorkflowSpec = {
      id: 'workflow-8',
      name: 'No Policy Workflow',
      tasks: [
        {
          id: 'task-1',
          name: 'High Risk Action',
          type: 'action',
          riskTier: 'HIGH', // Would normally require approval
          requiredPermissions: [{ action: 'write', resource: 'data' }],
        },
      ],
      dependencies: new Map(),
    };

    const result = await orchestrator.executeWorkflow(spec);
    
    // Should complete because policy guard is not configured
    expect(result.status).toBe('completed');
    expect(result.taskStates.get('task-1')?.status).toBe('completed');
  });
});
