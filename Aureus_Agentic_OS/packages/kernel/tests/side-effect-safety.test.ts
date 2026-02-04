import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { 
  WorkflowOrchestrator, 
  WorkflowSpec, 
  TaskSpec, 
  TaskExecutor, 
  InMemoryStateStore, 
  InMemoryEventLog,
  CompensationExecutor,
  CompensationAction,
  TaskState,
} from '../src';

describe('Side Effect Safety Integration', () => {
  let stateStore: InMemoryStateStore;
  let eventLog: InMemoryEventLog;
  const testDir = '/tmp/saga-test';

  beforeEach(() => {
    stateStore = new InMemoryStateStore();
    eventLog = new InMemoryEventLog();
    
    // Clean up test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
    fs.mkdirSync(testDir, { recursive: true });
  });

  it('should execute saga compensations in reverse order on failure', async () => {
    const executionLog: string[] = [];
    
    // Mock executor that tracks execution
    const executor: TaskExecutor = {
      execute: async (task: TaskSpec) => {
        executionLog.push(`execute:${task.id}`);
        
        if (task.id === 'task3') {
          throw new Error('Task 3 failed');
        }
        
        return { success: true };
      },
    };

    // Mock compensation executor
    const compensationLog: string[] = [];
    const compensationExecutor: CompensationExecutor = {
      execute: async (action: CompensationAction, workflowId: string, taskId: string) => {
        compensationLog.push(`compensate:${taskId}:${action.tool}`);
      },
    };

    const orchestrator = new WorkflowOrchestrator(
      stateStore, 
      executor, 
      eventLog, 
      compensationExecutor
    );

    const spec: WorkflowSpec = {
      id: 'saga-test-workflow',
      name: 'Saga Test Workflow',
      tasks: [
        {
          id: 'task1',
          name: 'Task 1',
          type: 'action',
          compensationAction: {
            tool: 'undo-task1',
            args: { taskId: 'task1' },
          },
        },
        {
          id: 'task2',
          name: 'Task 2',
          type: 'action',
          compensationAction: {
            tool: 'undo-task2',
            args: { taskId: 'task2' },
          },
        },
        {
          id: 'task3',
          name: 'Task 3 (fails)',
          type: 'action',
          retry: { maxAttempts: 1, backoffMs: 10 },
        },
      ],
      dependencies: new Map([
        ['task2', ['task1']],
        ['task3', ['task2']],
      ]),
    };

    // Execute workflow - should fail at task3
    await expect(orchestrator.executeWorkflow(spec)).rejects.toThrow();

    // Verify execution order
    expect(executionLog).toEqual(['execute:task1', 'execute:task2', 'execute:task3']);

    // Verify compensations were executed in reverse order (LIFO)
    expect(compensationLog).toEqual([
      'compensate:task2:undo-task2',
      'compensate:task1:undo-task1',
    ]);

    // Verify events were logged
    const events = await eventLog.read('saga-test-workflow');
    const compensationEvents = events.filter(e => 
      e.type === 'COMPENSATION_TRIGGERED' || 
      e.type === 'COMPENSATION_COMPLETED'
    );
    
    expect(compensationEvents.length).toBeGreaterThan(0);
    
    console.log('✅ Saga compensations executed in reverse order on failure');
  });

  it('should not execute compensations on successful workflow', async () => {
    const executionLog: string[] = [];
    
    const executor: TaskExecutor = {
      execute: async (task: TaskSpec) => {
        executionLog.push(`execute:${task.id}`);
        return { success: true };
      },
    };

    const compensationLog: string[] = [];
    const compensationExecutor: CompensationExecutor = {
      execute: async (action: CompensationAction, workflowId: string, taskId: string) => {
        compensationLog.push(`compensate:${taskId}`);
      },
    };

    const orchestrator = new WorkflowOrchestrator(
      stateStore, 
      executor, 
      eventLog, 
      compensationExecutor
    );

    const spec: WorkflowSpec = {
      id: 'success-workflow',
      name: 'Success Workflow',
      tasks: [
        {
          id: 'task1',
          name: 'Task 1',
          type: 'action',
          compensationAction: {
            tool: 'undo-task1',
            args: {},
          },
        },
        {
          id: 'task2',
          name: 'Task 2',
          type: 'action',
          compensationAction: {
            tool: 'undo-task2',
            args: {},
          },
        },
      ],
      dependencies: new Map([['task2', ['task1']]]),
    };

    const result = await orchestrator.executeWorkflow(spec);

    expect(result.status).toBe('completed');
    expect(executionLog).toEqual(['execute:task1', 'execute:task2']);
    expect(compensationLog).toEqual([]); // No compensations on success
    
    console.log('✅ No compensations executed on successful workflow');
  });

  it('should handle compensation failures gracefully', async () => {
    const executor: TaskExecutor = {
      execute: async (task: TaskSpec) => {
        if (task.id === 'task2') {
          throw new Error('Task 2 failed');
        }
        return { success: true };
      },
    };

    const compensationExecutor: CompensationExecutor = {
      execute: async (action: CompensationAction) => {
        if (action.tool === 'undo-task1') {
          throw new Error('Compensation failed');
        }
      },
    };

    const orchestrator = new WorkflowOrchestrator(
      stateStore, 
      executor, 
      eventLog, 
      compensationExecutor
    );

    const spec: WorkflowSpec = {
      id: 'compensation-failure-workflow',
      name: 'Compensation Failure Workflow',
      tasks: [
        {
          id: 'task1',
          name: 'Task 1',
          type: 'action',
          compensationAction: {
            tool: 'undo-task1',
            args: {},
          },
        },
        {
          id: 'task2',
          name: 'Task 2 (fails)',
          type: 'action',
          retry: { maxAttempts: 1, backoffMs: 10 },
        },
      ],
      dependencies: new Map([['task2', ['task1']]]),
    };

    // Workflow should fail, compensation should be attempted
    await expect(orchestrator.executeWorkflow(spec)).rejects.toThrow();

    // Verify compensation failure was logged
    const events = await eventLog.read('compensation-failure-workflow');
    const compensationFailedEvent = events.find(e => e.type === 'COMPENSATION_FAILED');
    
    expect(compensationFailedEvent).toBeDefined();
    expect(compensationFailedEvent?.metadata?.error).toContain('Compensation failed');
    
    console.log('✅ Compensation failures handled gracefully');
  });

  it('should demonstrate file write idempotency with saga compensation', async () => {
    const file1 = path.join(testDir, 'file1.txt');
    const file2 = path.join(testDir, 'file2.txt');
    let task1ExecutionCount = 0;
    let task2ExecutionCount = 0;

    const executor: TaskExecutor = {
      execute: async (task: TaskSpec, state: TaskState) => {
        if (task.id === 'write-file-1') {
          task1ExecutionCount++;
          fs.writeFileSync(file1, `Content 1 - Execution ${task1ExecutionCount}`);
          return { written: true, path: file1 };
        }
        if (task.id === 'write-file-2') {
          task2ExecutionCount++;
          fs.writeFileSync(file2, `Content 2 - Execution ${task2ExecutionCount}`);
          
          // Fail on first attempt
          if (state.attempt === 1) {
            throw new Error('First attempt failed');
          }
          
          return { written: true, path: file2 };
        }
        if (task.id === 'failing-task') {
          throw new Error('This task always fails');
        }
        return {};
      },
    };

    const compensationExecutor: CompensationExecutor = {
      execute: async (action: CompensationAction) => {
        if (action.tool === 'delete-file') {
          const filePath = action.args.path as string;
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        }
      },
    };

    const orchestrator = new WorkflowOrchestrator(
      stateStore, 
      executor, 
      eventLog, 
      compensationExecutor
    );

    const spec: WorkflowSpec = {
      id: 'file-write-saga',
      name: 'File Write Saga',
      tasks: [
        {
          id: 'write-file-1',
          name: 'Write File 1',
          type: 'action',
          idempotencyKey: 'write-file-1-key',
          compensationAction: {
            tool: 'delete-file',
            args: { path: file1 },
          },
        },
        {
          id: 'write-file-2',
          name: 'Write File 2',
          type: 'action',
          idempotencyKey: 'write-file-2-key',
          retry: { maxAttempts: 2, backoffMs: 10 },
          compensationAction: {
            tool: 'delete-file',
            args: { path: file2 },
          },
        },
        {
          id: 'failing-task',
          name: 'Failing Task',
          type: 'action',
          retry: { maxAttempts: 1, backoffMs: 10 },
        },
      ],
      dependencies: new Map([
        ['write-file-2', ['write-file-1']],
        ['failing-task', ['write-file-2']],
      ]),
    };

    // Execute workflow - should fail at failing-task
    await expect(orchestrator.executeWorkflow(spec)).rejects.toThrow();

    // Verify files were created
    expect(task1ExecutionCount).toBe(1); // Executed once
    expect(task2ExecutionCount).toBe(2); // Executed twice (retry)

    // Verify files were deleted by compensation
    expect(fs.existsSync(file1)).toBe(false);
    expect(fs.existsSync(file2)).toBe(false);

    console.log('✅ File write with idempotency and saga compensation working correctly');
  });

  it('should skip compensation for tasks without compensationAction', async () => {
    const compensationLog: string[] = [];
    
    const executor: TaskExecutor = {
      execute: async (task: TaskSpec) => {
        if (task.id === 'task2') {
          throw new Error('Task 2 failed');
        }
        return { success: true };
      },
    };

    const compensationExecutor: CompensationExecutor = {
      execute: async (action: CompensationAction, workflowId: string, taskId: string) => {
        compensationLog.push(`compensate:${taskId}`);
      },
    };

    const orchestrator = new WorkflowOrchestrator(
      stateStore, 
      executor, 
      eventLog, 
      compensationExecutor
    );

    const spec: WorkflowSpec = {
      id: 'partial-compensation-workflow',
      name: 'Partial Compensation Workflow',
      tasks: [
        {
          id: 'task1',
          name: 'Task 1 (no compensation)',
          type: 'action',
          // No compensationAction
        },
        {
          id: 'task2',
          name: 'Task 2 (fails)',
          type: 'action',
          retry: { maxAttempts: 1, backoffMs: 10 },
        },
      ],
      dependencies: new Map([['task2', ['task1']]]),
    };

    await expect(orchestrator.executeWorkflow(spec)).rejects.toThrow();

    // No compensations should be executed
    expect(compensationLog).toEqual([]);
    
    console.log('✅ Tasks without compensationAction skipped during compensation');
  });
});
