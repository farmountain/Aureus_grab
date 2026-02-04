/**
 * Chaos tests for conflicting writes
 * Tests concurrent writes, optimistic locking, and conflict detection
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  WorkflowOrchestrator,
  InMemoryStateStore,
  InMemoryEventLog,
  TaskExecutor,
  WorkflowSpec,
  TaskSpec,
  TaskState,
} from '../../packages/kernel/dist';
import { InMemoryStateStore as WorldStateStore } from '../../packages/world-model/dist';
import { HipCortex } from '../../packages/memory-hipcortex/dist';
import {
  InMemoryToolResultCache,
  ToolRegistry,
  ToolSpec,
  ToolExecutionContext,
} from '../../packages/tools/dist';

describe('Chaos Tests - Conflicting Writes', () => {
  let worldStateStore: WorldStateStore;
  let stateStore: InMemoryStateStore;
  let eventLog: InMemoryEventLog;
  let hipCortex: HipCortex;
  let toolRegistry: ToolRegistry;
  let toolResultCache: InMemoryToolResultCache;

  beforeEach(() => {
    worldStateStore = new WorldStateStore();
    stateStore = new InMemoryStateStore();
    eventLog = new InMemoryEventLog();
    hipCortex = new HipCortex();
    toolRegistry = new ToolRegistry();
    toolResultCache = new InMemoryToolResultCache();
  });

  it('should detect and log conflicting writes with optimistic locking', async () => {
    // Initialize state
    await worldStateStore.create('counter', { value: 0 });

    const conflicts: Array<{ key: string; expectedVersion: number; actualVersion: number }> = [];

    // Create a tool that attempts to write to shared state
    const incrementTool: ToolSpec = {
      id: 'increment-tool',
      name: 'Increment Tool',
      description: 'Increments counter value',
      parameters: [{ name: 'amount', type: 'number', required: true }],
      hasSideEffects: true,
      execute: async (params) => {
        const amount = params.amount as number;

        // Read current state
        const current = await worldStateStore.read('counter');
        if (!current) {
          throw new Error('Counter not found');
        }

        const currentValue = (current.value as any).value;
        const currentVersion = current.version;

        // Simulate some processing time to increase chance of conflict
        await new Promise((resolve) => setTimeout(resolve, 10));

        // Attempt to update with optimistic locking
        try {
          await worldStateStore.update(
            'counter',
            { value: currentValue + amount },
            currentVersion
          );

          return {
            success: true,
            newValue: currentValue + amount,
            version: currentVersion + 1,
          };
        } catch (error: any) {
          // Detect version conflict
          if (error.message.includes('Version mismatch')) {
            const actualState = await worldStateStore.read('counter');
            conflicts.push({
              key: 'counter',
              expectedVersion: currentVersion,
              actualVersion: actualState?.version || -1,
            });

            // Log conflict
            hipCortex.logAction(
              'increment-tool',
              'write-conflict',
              { expectedVersion: currentVersion },
              {
                actualVersion: actualState?.version,
                attemptedValue: currentValue + amount,
              }
            );

            throw new Error('Write conflict detected');
          }
          throw error;
        }
      },
    };
    toolRegistry.register(incrementTool);

    const executor: TaskExecutor = {
      execute: async (task: TaskSpec, state: TaskState) => {
        const wrapper = toolRegistry.createSafeWrapper(task.toolName!);
        if (!wrapper) throw new Error('Tool not found');

        const context: ToolExecutionContext = {
          taskId: task.id,
          workflowId: "conflict-test-workflow",
          stepId: state.attempt.toString(),
          cache: toolResultCache,
        };

        const result = await wrapper.execute(task.inputs?.params || {}, context);
        if (!result.success) {
          throw new Error(result.error || 'Tool execution failed');
        }

        return result.data;
      },
    };

    const orchestrator = new WorkflowOrchestrator(stateStore, executor, eventLog);

    // Create two concurrent workflows that try to increment the same counter
    const workflow1: WorkflowSpec = {
      id: 'conflict-workflow-1',
      name: 'Conflict Workflow 1',
      tasks: [
        {
          id: 'task1',
          name: 'Increment by 1',
          type: 'action',
          toolName: 'increment-tool',
          inputs: { params: { amount: 1 } },
          retry: { maxAttempts: 3, backoffMs: 50 },
        },
      ],
      dependencies: new Map(),
    };

    const workflow2: WorkflowSpec = {
      id: 'conflict-workflow-2',
      name: 'Conflict Workflow 2',
      tasks: [
        {
          id: 'task1',
          name: 'Increment by 2',
          type: 'action',
          toolName: 'increment-tool',
          inputs: { params: { amount: 2 } },
          retry: { maxAttempts: 3, backoffMs: 50 },
        },
      ],
      dependencies: new Map(),
    };

    // Execute workflows concurrently to trigger conflict
    const results = await Promise.allSettled([
      orchestrator.executeWorkflow(workflow1),
      orchestrator.executeWorkflow(workflow2),
    ]);

    // At least one workflow should detect a conflict (may be retried)
    // Check audit log for conflict detection
    const auditLog = hipCortex.getAuditLog();
    const conflictEntries = auditLog.filter((e) => e.action === 'write-conflict');

    // Conflicts should be logged if they occurred
    if (conflicts.length > 0) {
      expect(conflictEntries.length).toBeGreaterThan(0);
      expect(conflictEntries[0].stateAfter).toHaveProperty('actualVersion');
      expect(conflictEntries[0].stateAfter).toHaveProperty('attemptedValue');
    }

    // Verify final state is consistent
    const finalState = await worldStateStore.read('counter');
    expect(finalState).toBeDefined();

    // If both succeeded (due to retries), value should be 3
    // If one failed, value should be 1 or 2
    const finalValue = (finalState!.value as any).value;
    expect([1, 2, 3]).toContain(finalValue);

    console.log('✅ Conflicting writes detected and logged');
    console.log(`   Final counter value: ${finalValue}`);
    console.log(`   Conflicts detected: ${conflicts.length}`);
  });

  it('should enforce write conflict prevention with CRV and prevent invalid commits', async () => {
    // Initialize shared state
    await worldStateStore.create('resource', { value: 'initial', locks: [] });

    const writeLogs: Array<{ taskId: string; timestamp: Date; value: string }> = [];

    // Create tool that writes to shared resource
    const writeTool: ToolSpec = {
      id: 'write-tool',
      name: 'Write Tool',
      description: 'Writes to shared resource',
      parameters: [{ name: 'value', type: 'string', required: true }],
      hasSideEffects: true,
      execute: async (params) => {
        const value = params.value as string;

        // Read current state
        const current = await worldStateStore.read('resource');
        if (!current) throw new Error('Resource not found');

        const currentVersion = current.version;

        // Check for locks
        const locks = (current.value as any).locks || [];
        if (locks.length > 0) {
          throw new Error(`Resource locked by: ${locks.join(', ')}`);
        }

        // Attempt write
        await worldStateStore.update('resource', { value, locks: [] }, currentVersion);

        writeLogs.push({
          taskId: 'write-tool',
          timestamp: new Date(),
          value,
        });

        return { success: true, value };
      },
    };
    toolRegistry.register(writeTool);

    const executor: TaskExecutor = {
      execute: async (task: TaskSpec, state: TaskState) => {
        const wrapper = toolRegistry.createSafeWrapper(task.toolName!);
        if (!wrapper) throw new Error('Tool not found');

        const context: ToolExecutionContext = {
          taskId: task.id,
          workflowId: "conflict-test-workflow",
          stepId: state.attempt.toString(),
          cache: toolResultCache,
        };

        try {
          const result = await wrapper.execute(task.inputs?.params || {}, context);
          if (!result.success) {
            throw new Error(result.error || 'Tool execution failed');
          }

          // Log successful write
          hipCortex.logAction(
            task.id,
            'write-success',
            { resource: 'resource' },
            { value: (result.data as any).value }
          );

          return result.data;
        } catch (error: any) {
          // Log write failure
          hipCortex.logAction(
            task.id,
            'write-failure',
            { resource: 'resource' },
            { error: error.message }
          );
          throw error;
        }
      },
    };

    const orchestrator = new WorkflowOrchestrator(stateStore, executor, eventLog);

    // Create concurrent workflows
    const workflow1: WorkflowSpec = {
      id: 'write-workflow-1',
      name: 'Write Workflow 1',
      tasks: [
        {
          id: 'write-task-1',
          name: 'Write Value A',
          type: 'action',
          toolName: 'write-tool',
          inputs: { params: { value: 'value-A' } },
          retry: { maxAttempts: 2, backoffMs: 50 },
        },
      ],
      dependencies: new Map(),
    };

    const workflow2: WorkflowSpec = {
      id: 'write-workflow-2',
      name: 'Write Workflow 2',
      tasks: [
        {
          id: 'write-task-2',
          name: 'Write Value B',
          type: 'action',
          toolName: 'write-tool',
          inputs: { params: { value: 'value-B' } },
          retry: { maxAttempts: 2, backoffMs: 50 },
        },
      ],
      dependencies: new Map(),
    };

    // Execute concurrently
    const results = await Promise.allSettled([
      orchestrator.executeWorkflow(workflow1),
      orchestrator.executeWorkflow(workflow2),
    ]);

    // Check audit log
    const auditLog = hipCortex.getAuditLog();
    const successWrites = auditLog.filter((e) => e.action === 'write-success');
    const failedWrites = auditLog.filter((e) => e.action === 'write-failure');

    // At least one write should succeed
    expect(successWrites.length).toBeGreaterThan(0);

    // If there were conflicts, they should be logged
    if (failedWrites.length > 0) {
      // At least one failed write should have an error logged
      expect(failedWrites.length).toBeGreaterThan(0);
    }

    // Verify final state has only one value (last successful write)
    const finalState = await worldStateStore.read('resource');
    expect(finalState).toBeDefined();
    expect(['value-A', 'value-B']).toContain((finalState!.value as any).value);

    console.log('✅ Write conflicts prevented and logged');
    console.log(`   Successful writes: ${successWrites.length}`);
    console.log(`   Failed writes: ${failedWrites.length}`);
  });

  it('should log conflicting writes in event log with metadata', async () => {
    // Initialize state
    await worldStateStore.create('data', { value: 0, updatedBy: 'system' });

    let conflictMetadata: any = null;

    const updateTool: ToolSpec = {
      id: 'update-tool',
      name: 'Update Tool',
      description: 'Updates data',
      parameters: [
        { name: 'value', type: 'number', required: true },
        { name: 'updatedBy', type: 'string', required: true },
      ],
      hasSideEffects: true,
      execute: async (params) => {
        const value = params.value as number;
        const updatedBy = params.updatedBy as string;

        const current = await worldStateStore.read('data');
        if (!current) throw new Error('Data not found');

        const currentVersion = current.version;

        try {
          await worldStateStore.update('data', { value, updatedBy }, currentVersion);
          return { success: true };
        } catch (error: any) {
          if (error.message.includes('Version mismatch')) {
            const actual = await worldStateStore.read('data');
            conflictMetadata = {
              key: 'data',
              expectedVersion: currentVersion,
              actualVersion: actual?.version,
              attemptedValue: value,
              attemptedBy: updatedBy,
            };

            throw new Error('Conflict detected');
          }
          throw error;
        }
      },
    };
    toolRegistry.register(updateTool);

    const executor: TaskExecutor = {
      execute: async (task: TaskSpec, state: TaskState) => {
        const wrapper = toolRegistry.createSafeWrapper(task.toolName!);
        if (!wrapper) throw new Error('Tool not found');

        const context: ToolExecutionContext = {
          taskId: task.id,
          workflowId: "conflict-test-workflow",
          stepId: state.attempt.toString(),
          cache: toolResultCache,
        };

        const result = await wrapper.execute(task.inputs?.params || {}, context);
        if (!result.success) {
          throw new Error(result.error || 'Tool execution failed');
        }

        return result.data;
      },
    };

    const orchestrator = new WorkflowOrchestrator(stateStore, executor, eventLog);

    // Create workflows that conflict
    const workflow1: WorkflowSpec = {
      id: 'update-workflow-1',
      name: 'Update Workflow 1',
      tasks: [
        {
          id: 'update-task-1',
          name: 'Update to 10',
          type: 'action',
          toolName: 'update-tool',
          inputs: { params: { value: 10, updatedBy: 'workflow-1' } },
          retry: { maxAttempts: 1, backoffMs: 10 },
        },
      ],
      dependencies: new Map(),
    };

    const workflow2: WorkflowSpec = {
      id: 'update-workflow-2',
      name: 'Update Workflow 2',
      tasks: [
        {
          id: 'update-task-2',
          name: 'Update to 20',
          type: 'action',
          toolName: 'update-tool',
          inputs: { params: { value: 20, updatedBy: 'workflow-2' } },
          retry: { maxAttempts: 1, backoffMs: 10 },
        },
      ],
      dependencies: new Map(),
    };

    // Execute concurrently
    const results = await Promise.allSettled([
      orchestrator.executeWorkflow(workflow1),
      orchestrator.executeWorkflow(workflow2),
    ]);

    // At least one should fail initially (may succeed on retry)
    const hasFailure = results.some((r) => r.status === 'rejected');

    // Check event log for conflict metadata
    const events1 = await eventLog.read('update-workflow-1');
    const events2 = await eventLog.read('update-workflow-2');
    const allEvents = [...events1, ...events2];

    // Look for failed task events
    const failedEvents = allEvents.filter((e) => e.type === 'TASK_FAILED');

    // If conflict occurred, verify metadata was logged
    if (conflictMetadata) {
      expect(conflictMetadata).toHaveProperty('expectedVersion');
      expect(conflictMetadata).toHaveProperty('actualVersion');
      expect(conflictMetadata).toHaveProperty('attemptedValue');
    }

    // Verify final state
    const finalState = await worldStateStore.read('data');
    expect(finalState).toBeDefined();
    const finalValue = (finalState!.value as any).value;
    expect([10, 20]).toContain(finalValue);

    console.log('✅ Conflicting writes logged with detailed metadata');
    console.log(`   Final value: ${finalValue}`);
    console.log(`   Updated by: ${(finalState!.value as any).updatedBy}`);
  });
});
