import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryStateStore, InMemoryEventLog, WorkflowState, Event, EventType } from '../src';

describe('Tenant Isolation', () => {
  describe('InMemoryStateStore - Tenant Isolation', () => {
    let stateStore: InMemoryStateStore;

    beforeEach(() => {
      stateStore = new InMemoryStateStore();
    });

    it('should isolate workflows by tenant', async () => {
      // Create workflows for different tenants
      const tenant1Workflow: WorkflowState = {
        workflowId: 'wf-tenant1',
        status: 'running',
        taskStates: new Map(),
        tenantId: 'tenant-1',
      };

      const tenant2Workflow: WorkflowState = {
        workflowId: 'wf-tenant2',
        status: 'running',
        taskStates: new Map(),
        tenantId: 'tenant-2',
      };

      // Save both workflows
      await stateStore.saveWorkflowState(tenant1Workflow);
      await stateStore.saveWorkflowState(tenant2Workflow);

      // Tenant 1 should only see their workflow
      const tenant1Result = await stateStore.loadWorkflowState('wf-tenant1', 'tenant-1');
      expect(tenant1Result).toBeTruthy();
      expect(tenant1Result?.tenantId).toBe('tenant-1');

      // Tenant 1 should NOT see tenant 2's workflow
      const crossTenantResult = await stateStore.loadWorkflowState('wf-tenant2', 'tenant-1');
      expect(crossTenantResult).toBeNull();

      // Tenant 2 should see their workflow
      const tenant2Result = await stateStore.loadWorkflowState('wf-tenant2', 'tenant-2');
      expect(tenant2Result).toBeTruthy();
      expect(tenant2Result?.tenantId).toBe('tenant-2');
    });

    it('should allow admin users (no tenantId) to access all workflows', async () => {
      const tenantWorkflow: WorkflowState = {
        workflowId: 'wf-admin-test',
        status: 'running',
        taskStates: new Map(),
        tenantId: 'tenant-1',
      };

      await stateStore.saveWorkflowState(tenantWorkflow);

      // Admin user (no tenantId) should see the workflow
      const adminResult = await stateStore.loadWorkflowState('wf-admin-test');
      expect(adminResult).toBeTruthy();
      expect(adminResult?.tenantId).toBe('tenant-1');
    });

    it('should list workflows by tenant', async () => {
      // Create multiple workflows for different tenants
      const workflows: WorkflowState[] = [
        {
          workflowId: 'wf-t1-1',
          status: 'running',
          taskStates: new Map(),
          tenantId: 'tenant-1',
        },
        {
          workflowId: 'wf-t1-2',
          status: 'completed',
          taskStates: new Map(),
          tenantId: 'tenant-1',
        },
        {
          workflowId: 'wf-t2-1',
          status: 'running',
          taskStates: new Map(),
          tenantId: 'tenant-2',
        },
      ];

      for (const wf of workflows) {
        await stateStore.saveWorkflowState(wf);
      }

      // List workflows for tenant-1
      if (stateStore.listWorkflowsByTenant) {
        const tenant1Workflows = await stateStore.listWorkflowsByTenant('tenant-1');
        expect(tenant1Workflows).toHaveLength(2);
        expect(tenant1Workflows.every(wf => wf.tenantId === 'tenant-1')).toBe(true);

        // List workflows for tenant-2
        const tenant2Workflows = await stateStore.listWorkflowsByTenant('tenant-2');
        expect(tenant2Workflows).toHaveLength(1);
        expect(tenant2Workflows[0].tenantId).toBe('tenant-2');
      }
    });

    it('should isolate task states by tenant through workflow isolation', async () => {
      const tenant1Workflow: WorkflowState = {
        workflowId: 'wf-task-isolation',
        status: 'running',
        taskStates: new Map(),
        tenantId: 'tenant-1',
      };

      await stateStore.saveWorkflowState(tenant1Workflow);

      const taskState = {
        taskId: 'task1',
        status: 'completed' as const,
        attempt: 1,
      };

      await stateStore.saveTaskState('wf-task-isolation', taskState);

      // Tenant 1 should see the task
      const tenant1Task = await stateStore.loadTaskState('wf-task-isolation', 'task1', 'tenant-1');
      expect(tenant1Task).toBeTruthy();
      expect(tenant1Task?.taskId).toBe('task1');

      // Tenant 2 should NOT see the task (workflow access denied)
      const tenant2Task = await stateStore.loadTaskState('wf-task-isolation', 'task1', 'tenant-2');
      expect(tenant2Task).toBeNull();
    });
  });

  describe('InMemoryEventLog - Tenant Isolation', () => {
    let eventLog: InMemoryEventLog;

    beforeEach(() => {
      eventLog = new InMemoryEventLog();
    });

    it('should filter events by tenant', async () => {
      const tenant1Event: Event = {
        timestamp: new Date(),
        type: 'WORKFLOW_STARTED' as EventType,
        workflowId: 'wf-1',
        tenantId: 'tenant-1',
      };

      const tenant2Event: Event = {
        timestamp: new Date(),
        type: 'WORKFLOW_STARTED' as EventType,
        workflowId: 'wf-2',
        tenantId: 'tenant-2',
      };

      await eventLog.append(tenant1Event);
      await eventLog.append(tenant2Event);

      // Tenant 1 should only see their events
      const tenant1Events = await eventLog.read('wf-1', 'tenant-1');
      expect(tenant1Events).toHaveLength(1);
      expect(tenant1Events[0].tenantId).toBe('tenant-1');

      // Tenant 1 should NOT see tenant 2's events
      const crossTenantEvents = await eventLog.read('wf-2', 'tenant-1');
      expect(crossTenantEvents).toHaveLength(0);
    });

    it('should read all events for a tenant across workflows', async () => {
      const events: Event[] = [
        {
          timestamp: new Date(),
          type: 'WORKFLOW_STARTED' as EventType,
          workflowId: 'wf-1',
          tenantId: 'tenant-1',
        },
        {
          timestamp: new Date(),
          type: 'WORKFLOW_STARTED' as EventType,
          workflowId: 'wf-2',
          tenantId: 'tenant-1',
        },
        {
          timestamp: new Date(),
          type: 'WORKFLOW_STARTED' as EventType,
          workflowId: 'wf-3',
          tenantId: 'tenant-2',
        },
      ];

      for (const event of events) {
        await eventLog.append(event);
      }

      // Read all events for tenant-1
      if (eventLog.readByTenant) {
        const tenant1Events = await eventLog.readByTenant('tenant-1');
        expect(tenant1Events).toHaveLength(2);
        expect(tenant1Events.every(e => e.tenantId === 'tenant-1')).toBe(true);

        // Read all events for tenant-2
        const tenant2Events = await eventLog.readByTenant('tenant-2');
        expect(tenant2Events).toHaveLength(1);
        expect(tenant2Events[0].tenantId).toBe('tenant-2');
      }
    });

    it('should export events for compliance with date filtering', async () => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      const events: Event[] = [
        {
          timestamp: yesterday,
          type: 'WORKFLOW_STARTED' as EventType,
          workflowId: 'wf-old',
          tenantId: 'tenant-1',
        },
        {
          timestamp: now,
          type: 'WORKFLOW_STARTED' as EventType,
          workflowId: 'wf-current',
          tenantId: 'tenant-1',
        },
        {
          timestamp: tomorrow,
          type: 'WORKFLOW_STARTED' as EventType,
          workflowId: 'wf-future',
          tenantId: 'tenant-1',
        },
      ];

      for (const event of events) {
        await eventLog.append(event);
      }

      // Export all events for tenant-1
      if (eventLog.exportEvents) {
        const allEvents = await eventLog.exportEvents('tenant-1');
        expect(allEvents).toHaveLength(3);

        // Export events from today onwards
        const futureEvents = await eventLog.exportEvents('tenant-1', now);
        expect(futureEvents).toHaveLength(2);

        // Export events up to today
        const pastEvents = await eventLog.exportEvents('tenant-1', undefined, now);
        expect(pastEvents).toHaveLength(2);

        // Export events for today only
        const todayEvents = await eventLog.exportEvents('tenant-1', now, now);
        expect(todayEvents).toHaveLength(1);
        expect(todayEvents[0].workflowId).toBe('wf-current');
      }
    });

    it('should not leak events without tenantId to regular tenants', async () => {
      const tenantEvent: Event = {
        timestamp: new Date(),
        type: 'WORKFLOW_STARTED' as EventType,
        workflowId: 'wf-1',
        tenantId: 'tenant-1',
      };

      const adminEvent: Event = {
        timestamp: new Date(),
        type: 'WORKFLOW_STARTED' as EventType,
        workflowId: 'wf-admin',
        // No tenantId - admin/legacy event
      };

      await eventLog.append(tenantEvent);
      await eventLog.append(adminEvent);

      // Tenant should only see their events (not admin events)
      const tenant1Events = await eventLog.read('wf-1', 'tenant-1');
      expect(tenant1Events).toHaveLength(1);
      expect(tenant1Events[0].tenantId).toBe('tenant-1');

      // Admin events should NOT be accessible to tenants
      const tenantAttemptToReadAdmin = await eventLog.read('wf-admin', 'tenant-1');
      expect(tenantAttemptToReadAdmin).toHaveLength(0);

      // Admin events should be accessible without tenant filter (admin access)
      const allEvents = await eventLog.read('wf-admin');
      expect(allEvents).toHaveLength(1);
      expect(allEvents[0].tenantId).toBeUndefined();
    });
  });
});
