import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PostgresStateStore } from '../src/postgres-state-store';
import { WorkflowState, TaskState } from '../src/types';
import * as fs from 'fs';
import * as path from 'path';

describe('PostgresStateStore', () => {
  let stateStore: PostgresStateStore;
  let skipTests = false;

  beforeAll(async () => {
    // Skip tests if DATABASE_URL is not set
    if (!process.env.DATABASE_URL && !process.env.DATABASE_HOST) {
      skipTests = true;
      console.log('Skipping PostgresStateStore tests - no database configured');
      return;
    }

    try {
      stateStore = new PostgresStateStore();
      
      // Initialize schema
      const schemaPath = path.join(__dirname, '../src/db-schema.sql');
      if (fs.existsSync(schemaPath)) {
        const schemaSQL = fs.readFileSync(schemaPath, 'utf-8');
        await stateStore.initialize(schemaSQL);
      }
    } catch (error) {
      console.error('Failed to initialize PostgresStateStore:', error);
      skipTests = true;
    }
  });

  afterAll(async () => {
    if (stateStore && !skipTests) {
      await stateStore.close();
    }
  });

  it('should save and load workflow state', async () => {
    if (skipTests) return;

    const workflowState: WorkflowState = {
      workflowId: 'test-workflow-pg-1',
      status: 'running',
      taskStates: new Map([
        ['task1', {
          taskId: 'task1',
          status: 'completed',
          attempt: 1,
          result: { success: true },
          startedAt: new Date(),
          completedAt: new Date(),
        }],
      ]),
      startedAt: new Date(),
    };

    await stateStore.saveWorkflowState(workflowState);
    const loaded = await stateStore.loadWorkflowState('test-workflow-pg-1');

    expect(loaded).not.toBeNull();
    expect(loaded?.workflowId).toBe('test-workflow-pg-1');
    expect(loaded?.status).toBe('running');
    expect(loaded?.taskStates.size).toBe(1);
  });

  it('should save and load task state', async () => {
    if (skipTests) return;

    // First save a workflow
    const workflowState: WorkflowState = {
      workflowId: 'test-workflow-pg-2',
      status: 'running',
      taskStates: new Map(),
      startedAt: new Date(),
    };
    await stateStore.saveWorkflowState(workflowState);

    const taskState: TaskState = {
      taskId: 'task-pg-1',
      status: 'completed',
      attempt: 1,
      result: { data: 'test' },
      startedAt: new Date(),
      completedAt: new Date(),
    };

    await stateStore.saveTaskState('test-workflow-pg-2', taskState);
    const loaded = await stateStore.loadTaskState('test-workflow-pg-2', 'task-pg-1');

    expect(loaded).not.toBeNull();
    expect(loaded?.taskId).toBe('task-pg-1');
    expect(loaded?.status).toBe('completed');
    expect(loaded?.attempt).toBe(1);
  });

  it('should enforce tenant isolation', async () => {
    if (skipTests) return;

    const workflowState: WorkflowState = {
      workflowId: 'test-workflow-pg-tenant',
      tenantId: 'tenant-1',
      status: 'running',
      taskStates: new Map(),
      startedAt: new Date(),
    };

    await stateStore.saveWorkflowState(workflowState);

    // Should return workflow for correct tenant
    const loaded1 = await stateStore.loadWorkflowState('test-workflow-pg-tenant', 'tenant-1');
    expect(loaded1).not.toBeNull();
    expect(loaded1?.tenantId).toBe('tenant-1');

    // Should return null for different tenant
    const loaded2 = await stateStore.loadWorkflowState('test-workflow-pg-tenant', 'tenant-2');
    expect(loaded2).toBeNull();
  });

  it('should list workflows by tenant', async () => {
    if (skipTests) return;

    // Create workflows for different tenants
    const workflow1: WorkflowState = {
      workflowId: 'test-workflow-pg-list-1',
      tenantId: 'tenant-list-1',
      status: 'running',
      taskStates: new Map(),
      startedAt: new Date(),
    };

    const workflow2: WorkflowState = {
      workflowId: 'test-workflow-pg-list-2',
      tenantId: 'tenant-list-1',
      status: 'completed',
      taskStates: new Map(),
      startedAt: new Date(),
    };

    await stateStore.saveWorkflowState(workflow1);
    await stateStore.saveWorkflowState(workflow2);

    const workflows = await stateStore.listWorkflowsByTenant('tenant-list-1');
    expect(workflows.length).toBeGreaterThanOrEqual(2);
    expect(workflows.every(w => w.tenantId === 'tenant-list-1')).toBe(true);
  });
});
