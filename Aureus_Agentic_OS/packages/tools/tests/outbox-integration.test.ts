import { describe, it, expect, beforeEach } from 'vitest';
import {
  SafeToolWrapper,
  ToolSpec,
  ToolExecutionContext,
  OutboxServiceAdapter,
  createOutboxAdapter,
} from '../src';

describe('Outbox Integration with Tools', () => {
  let executionCount: number;
  let mockOutboxService: any;
  let outboxAdapter: OutboxServiceAdapter;

  beforeEach(() => {
    executionCount = 0;

    // Mock outbox service
    const entries = new Map<string, any>();

    mockOutboxService = {
      execute: async (
        workflowId: string,
        taskId: string,
        toolId: string,
        params: Record<string, unknown>,
        idempotencyKey: string,
        executor: (params: Record<string, unknown>) => Promise<unknown>,
        maxAttempts: number
      ) => {
        // Check if already executed
        const existing = entries.get(idempotencyKey);
        if (existing && existing.state === 'COMMITTED') {
          return existing.result;
        }

        // Execute
        try {
          const result = await executor(params);
          entries.set(idempotencyKey, {
            state: 'COMMITTED',
            result,
          });
          return result;
        } catch (error) {
          entries.set(idempotencyKey, {
            state: 'FAILED',
            error: error instanceof Error ? error.message : String(error),
          });
          throw error;
        }
      },
      getByIdempotencyKey: async (idempotencyKey: string) => {
        return entries.get(idempotencyKey) || null;
      },
    };

    outboxAdapter = createOutboxAdapter(mockOutboxService);
  });

  it('should execute tool through outbox when available', async () => {
    const tool: ToolSpec = {
      id: 'test-tool',
      name: 'Test Tool',
      description: 'A test tool',
      parameters: [],
      sideEffect: true,
      execute: async (params) => {
        executionCount++;
        return { success: true, count: executionCount };
      },
    };

    const wrapper = new SafeToolWrapper(tool);
    const context: ToolExecutionContext = {
      workflowId: 'wf-1',
      taskId: 'task-1',
      stepId: 'step-1',
      outbox: outboxAdapter,
    };

    const result = await wrapper.execute({ test: 'data' }, context);

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ success: true, count: 1 });
    expect(result.metadata?.outboxManaged).toBe(true);
    expect(executionCount).toBe(1);
  });

  it('should prevent duplicate execution with outbox (replay protection)', async () => {
    const tool: ToolSpec = {
      id: 'test-tool',
      name: 'Test Tool',
      description: 'A test tool',
      parameters: [],
      sideEffect: true,
      execute: async (params) => {
        executionCount++;
        return { success: true, count: executionCount };
      },
    };

    const wrapper = new SafeToolWrapper(tool);
    const context: ToolExecutionContext = {
      workflowId: 'wf-1',
      taskId: 'task-1',
      stepId: 'step-1',
      outbox: outboxAdapter,
    };

    // Execute first time
    const result1 = await wrapper.execute({ test: 'data' }, context);
    expect(result1.success).toBe(true);
    expect(result1.data).toEqual({ success: true, count: 1 });

    // Execute second time with same parameters (should replay)
    const result2 = await wrapper.execute({ test: 'data' }, context);
    expect(result2.success).toBe(true);
    expect(result2.data).toEqual({ success: true, count: 1 }); // Same result

    // Execution count should still be 1 (not executed twice)
    expect(executionCount).toBe(1);
  });

  it('should execute different operations separately', async () => {
    const tool: ToolSpec = {
      id: 'test-tool',
      name: 'Test Tool',
      description: 'A test tool',
      parameters: [],
      sideEffect: true,
      execute: async (params) => {
        executionCount++;
        return { success: true, count: executionCount, params };
      },
    };

    const wrapper = new SafeToolWrapper(tool);
    const context: ToolExecutionContext = {
      workflowId: 'wf-1',
      taskId: 'task-1',
      stepId: 'step-1',
      outbox: outboxAdapter,
    };

    // Execute with different parameters
    const result1 = await wrapper.execute({ op: 'read' }, context);
    const result2 = await wrapper.execute({ op: 'write' }, context);

    expect(result1.success).toBe(true);
    expect(result2.success).toBe(true);
    expect(result1.data).toEqual({ success: true, count: 1, params: { op: 'read' } });
    expect(result2.data).toEqual({ success: true, count: 2, params: { op: 'write' } });
    expect(executionCount).toBe(2); // Both executed
  });

  it('should not use outbox for read-only tools', async () => {
    const tool: ToolSpec = {
      id: 'read-tool',
      name: 'Read Tool',
      description: 'A read-only tool',
      parameters: [],
      sideEffect: false, // No side effects
      execute: async (params) => {
        executionCount++;
        return { data: 'some data', count: executionCount };
      },
    };

    const wrapper = new SafeToolWrapper(tool);
    const context: ToolExecutionContext = {
      workflowId: 'wf-1',
      taskId: 'task-1',
      stepId: 'step-1',
      outbox: outboxAdapter,
    };

    const result = await wrapper.execute({}, context);

    expect(result.success).toBe(true);
    expect(result.metadata?.outboxManaged).toBeUndefined(); // Not managed by outbox
    expect(executionCount).toBe(1);
  });

  it('should handle outbox execution failure gracefully', async () => {
    const tool: ToolSpec = {
      id: 'failing-tool',
      name: 'Failing Tool',
      description: 'A tool that fails',
      parameters: [],
      sideEffect: true,
      execute: async (params) => {
        executionCount++;
        throw new Error('Tool execution failed');
      },
    };

    const wrapper = new SafeToolWrapper(tool);
    const context: ToolExecutionContext = {
      workflowId: 'wf-1',
      taskId: 'task-1',
      stepId: 'step-1',
      outbox: outboxAdapter,
    };

    const result = await wrapper.execute({}, context);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Tool execution failed');
    expect(result.metadata?.outboxManaged).toBe(true);
    expect(executionCount).toBe(1);
  });

  it('should validate output schema before committing to outbox', async () => {
    const tool: ToolSpec = {
      id: 'validated-tool',
      name: 'Validated Tool',
      description: 'A tool with output validation',
      parameters: [],
      sideEffect: true,
      outputSchema: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          value: { type: 'number' },
        },
        required: ['success', 'value'],
      },
      execute: async (params) => {
        executionCount++;
        // Return invalid output (missing required field)
        return { success: true };
      },
    };

    const wrapper = new SafeToolWrapper(tool);
    const context: ToolExecutionContext = {
      workflowId: 'wf-1',
      taskId: 'task-1',
      stepId: 'step-1',
      outbox: outboxAdapter,
    };

    const result = await wrapper.execute({}, context);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Output validation failed');
    expect(executionCount).toBe(1);
  });

  it('should use idempotency key based on task, step, tool, and params', async () => {
    const tool: ToolSpec = {
      id: 'keyed-tool',
      name: 'Keyed Tool',
      description: 'A tool to test idempotency keys',
      parameters: [],
      sideEffect: true,
      execute: async (params) => {
        executionCount++;
        return { count: executionCount };
      },
    };

    const wrapper = new SafeToolWrapper(tool);

    // Execute with same params but different task
    const context1: ToolExecutionContext = {
      workflowId: 'wf-1',
      taskId: 'task-1',
      stepId: 'step-1',
      outbox: outboxAdapter,
    };

    const context2: ToolExecutionContext = {
      workflowId: 'wf-1',
      taskId: 'task-2', // Different task
      stepId: 'step-1',
      outbox: outboxAdapter,
    };

    const result1 = await wrapper.execute({ data: 'same' }, context1);
    const result2 = await wrapper.execute({ data: 'same' }, context2);

    // Different tasks should execute separately
    expect(result1.data).toEqual({ count: 1 });
    expect(result2.data).toEqual({ count: 2 });
    expect(executionCount).toBe(2);
  });

  it('should prefer outbox over cache when both available', async () => {
    const tool: ToolSpec = {
      id: 'test-tool',
      name: 'Test Tool',
      description: 'A test tool',
      parameters: [],
      sideEffect: true,
      execute: async (params) => {
        executionCount++;
        return { success: true, count: executionCount };
      },
    };

    const wrapper = new SafeToolWrapper(tool);
    
    // Mock cache
    const cache = {
      get: async () => null,
      set: async () => {},
      has: async () => false,
      clear: async () => {},
      clearAll: async () => {},
    };

    const context: ToolExecutionContext = {
      workflowId: 'wf-1',
      taskId: 'task-1',
      stepId: 'step-1',
      outbox: outboxAdapter,
      cache, // Both outbox and cache provided
    };

    const result = await wrapper.execute({ test: 'data' }, context);

    expect(result.success).toBe(true);
    expect(result.metadata?.outboxManaged).toBe(true); // Should use outbox
    expect(executionCount).toBe(1);
  });
});
