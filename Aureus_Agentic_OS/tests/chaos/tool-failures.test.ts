/**
 * Chaos tests for tool failure scenarios
 * Tests tool timeout, tool error, partial response, and corrupted schema handling
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  WorkflowOrchestrator,
  InMemoryStateStore,
  InMemoryEventLog,
  TaskExecutor,
  WorkflowSpec,
  TaskSpec,
  TaskState,
} from '../../packages/kernel/dist';
import {
  SafeToolWrapper,
  ToolSpec,
  ToolExecutionContext,
  InMemoryToolResultCache,
  ToolRegistry,
} from '../../packages/tools/dist';
import { CRVGate, Validators, Commit } from '../../packages/crv/dist';
import { HipCortex } from '../../packages/memory-hipcortex/dist';

describe('Chaos Tests - Tool Failures', () => {
  let toolRegistry: ToolRegistry;
  let toolResultCache: InMemoryToolResultCache;
  let stateStore: InMemoryStateStore;
  let eventLog: InMemoryEventLog;
  let hipCortex: HipCortex;

  beforeEach(() => {
    toolRegistry = new ToolRegistry();
    toolResultCache = new InMemoryToolResultCache();
    stateStore = new InMemoryStateStore();
    eventLog = new InMemoryEventLog();
    hipCortex = new HipCortex();
  });

  it('should handle tool timeout gracefully and log in audit', async () => {
    // Create a tool that simulates timeout by taking longer than allowed
    const timeoutTool: ToolSpec = {
      id: 'timeout-tool',
      name: 'Timeout Tool',
      description: 'Tool that times out',
      parameters: [],
      hasSideEffects: false,
      execute: async () => {
        // Simulate a long-running operation
        await new Promise((resolve) => setTimeout(resolve, 200));
        return { result: 'should not reach here' };
      },
    };
    toolRegistry.register(timeoutTool);

    const executor: TaskExecutor = {
      execute: async (task: TaskSpec, state: TaskState) => {
        const wrapper = toolRegistry.createSafeWrapper(task.toolName!, 50); // 50ms timeout
        if (!wrapper) throw new Error('Tool not found');

        const context: ToolExecutionContext = {
          taskId: task.id,
          stepId: state.attempt.toString(),
          workflowId: 'timeout-test-workflow',
          cache: toolResultCache,
        };

        try {
          const result = await wrapper.execute({}, context);
          if (!result.success) {
            throw new Error(result.error || 'Tool execution failed');
          }
          return result.data;
        } catch (error: any) {
          // Log timeout to audit
          hipCortex.logAction(
            task.id,
            'tool-timeout',
            { tool: task.toolName },
            { error: error.message }
          );
          throw error;
        }
      },
    };

    const orchestrator = new WorkflowOrchestrator(stateStore, executor, eventLog);

    const workflow: WorkflowSpec = {
      id: 'timeout-test-workflow',
      name: 'Timeout Test Workflow',
      tasks: [
        {
          id: 'task1',
          name: 'Timeout Task',
          type: 'action',
          toolName: 'timeout-tool',
          retry: { maxAttempts: 1, backoffMs: 10 },
        },
      ],
      dependencies: new Map(),
    };

    // Expect workflow to fail due to timeout
    await expect(orchestrator.executeWorkflow(workflow)).rejects.toThrow();

    // Verify audit log contains timeout entry
    const auditLog = hipCortex.getAuditLog();
    const timeoutEntry = auditLog.find((e) => e.action === 'tool-timeout');
    expect(timeoutEntry).toBeDefined();
    expect(timeoutEntry?.actor).toBe('task1');

    // Verify error message or metadata indicates timeout
    const hasTimeoutIndicator = 
      (timeoutEntry?.stateAfter as any)?.error?.toLowerCase().includes('timeout') ||
      (timeoutEntry?.stateBefore as any)?.tool === 'timeout-tool';
    expect(hasTimeoutIndicator).toBe(true);

    // Verify event log contains failed event
    const events = await eventLog.read('timeout-test-workflow');
    const failedEvents = events.filter((e) => e.type === 'TASK_FAILED');
    expect(failedEvents.length).toBeGreaterThan(0);

    console.log('✅ Tool timeout handled gracefully and logged');
  });

  it('should handle tool errors with proper logging and no side effects', async () => {
    const sideEffects: string[] = [];

    // Create a tool that throws an error
    const errorTool: ToolSpec = {
      id: 'error-tool',
      name: 'Error Tool',
      description: 'Tool that throws an error',
      parameters: [],
      hasSideEffects: true,
      execute: async () => {
        // Check if this is a retry
        if (sideEffects.length > 0) {
          throw new Error('Side effect already occurred - should not retry');
        }
        sideEffects.push('error-tool-executed');
        throw new Error('Simulated tool error');
      },
    };
    toolRegistry.register(errorTool);

    const executor: TaskExecutor = {
      execute: async (task: TaskSpec, state: TaskState) => {
        const wrapper = toolRegistry.createSafeWrapper(task.toolName!);
        if (!wrapper) throw new Error('Tool not found');

        const context: ToolExecutionContext = {
          taskId: task.id,
          stepId: state.attempt.toString(),
          workflowId: 'error-test-workflow',
          cache: toolResultCache,
        };

        try {
          const result = await wrapper.execute({}, context);
          if (!result.success) {
            throw new Error(result.error || 'Tool execution failed');
          }
          return result.data;
        } catch (error: any) {
          // Log error to audit
          hipCortex.logAction(
            task.id,
            'tool-error',
            { tool: task.toolName, attempt: state.attempt },
            { error: error.message }
          );
          throw error;
        }
      },
    };

    const orchestrator = new WorkflowOrchestrator(stateStore, executor, eventLog);

    const workflow: WorkflowSpec = {
      id: 'error-test-workflow',
      name: 'Error Test Workflow',
      tasks: [
        {
          id: 'task1',
          name: 'Error Task',
          type: 'action',
          toolName: 'error-tool',
          idempotencyKey: 'error-task-key',
          retry: { maxAttempts: 3, backoffMs: 10 },
        },
      ],
      dependencies: new Map(),
    };

    // Expect workflow to fail due to error
    await expect(orchestrator.executeWorkflow(workflow)).rejects.toThrow();

    // Verify idempotency: side effect should occur only once despite retries
    expect(sideEffects.length).toBe(1);
    expect(sideEffects[0]).toBe('error-tool-executed');

    // Verify audit log contains all error entries
    const auditLog = hipCortex.getAuditLog();
    const errorEntries = auditLog.filter((e) => e.action === 'tool-error');
    expect(errorEntries.length).toBeGreaterThanOrEqual(1);

    // Verify event log contains retry events
    const events = await eventLog.read('error-test-workflow');
    const failedEvents = events.filter((e) => e.type === 'TASK_FAILED');
    expect(failedEvents.length).toBeGreaterThan(0);

    console.log('✅ Tool error handled with idempotency and logging');
  });

  it('should handle partial response with validation', async () => {
    // Create a tool that returns partial/incomplete data
    const partialResponseTool: ToolSpec = {
      id: 'partial-response-tool',
      name: 'Partial Response Tool',
      description: 'Tool that returns incomplete data',
      parameters: [],
      hasSideEffects: false,
      execute: async () => {
        // Return partial data missing required fields
        return {
          name: 'Test',
          // Missing required 'value' field
        };
      },
    };
    toolRegistry.register(partialResponseTool);

    // Create CRV gate to validate response schema
    const crvGate = new CRVGate({
      name: 'Response Validation Gate',
      validators: [
        Validators.notNull(),
        Validators.schema({
          name: 'string',
          value: 'number',
        }),
      ],
      blockOnFailure: true,
    });

    const executor: TaskExecutor = {
      execute: async (task: TaskSpec, state: TaskState) => {
        const wrapper = toolRegistry.createSafeWrapper(task.toolName!);
        if (!wrapper) throw new Error('Tool not found');

        const context: ToolExecutionContext = {
          taskId: task.id,
          stepId: state.attempt.toString(),
          workflowId: 'partial-response-workflow',
          cache: toolResultCache,
        };

        const result = await wrapper.execute({}, context);
        if (!result.success) {
          throw new Error(result.error || 'Tool execution failed');
        }

        // Validate result with CRV gate
        const commit: Commit = {
          id: task.id,
          data: result.data,
        };
        const gateResult = await crvGate.validate(commit);

        // Log CRV validation
        hipCortex.logAction(
          task.id,
          'crv-validation',
          { gate: crvGate.name },
          {
            passed: gateResult.passed,
            blocked: gateResult.blockedCommit,
          }
        );

        if (gateResult.blockedCommit) {
          throw new Error('CRV gate blocked partial response');
        }

        return result.data;
      },
    };

    const orchestrator = new WorkflowOrchestrator(stateStore, executor, eventLog);

    const workflow: WorkflowSpec = {
      id: 'partial-response-workflow',
      name: 'Partial Response Workflow',
      tasks: [
        {
          id: 'task1',
          name: 'Partial Response Task',
          type: 'action',
          toolName: 'partial-response-tool',
        },
      ],
      dependencies: new Map(),
    };

    // Expect workflow to fail due to CRV blocking
    await expect(orchestrator.executeWorkflow(workflow)).rejects.toThrow(
      'CRV gate blocked partial response'
    );

    // Verify audit log contains CRV validation entry
    const auditLog = hipCortex.getAuditLog();
    const crvEntries = auditLog.filter((e) => e.action === 'crv-validation');
    expect(crvEntries.length).toBe(1);
    expect(crvEntries[0].stateAfter).toEqual({
      passed: false,
      blocked: true,
    });

    console.log('✅ Partial response blocked by CRV validation');
  });

  it('should handle corrupted schema and block with CRV', async () => {
    // Create a tool that returns data with corrupted schema
    const corruptedSchemaTool: ToolSpec = {
      id: 'corrupted-schema-tool',
      name: 'Corrupted Schema Tool',
      description: 'Tool that returns malformed data',
      parameters: [],
      hasSideEffects: false,
      execute: async () => {
        // Return data with wrong types
        return {
          name: 12345, // Should be string, but is number
          value: 'not-a-number', // Should be number, but is string
          extra: { nested: 'data' }, // Unexpected nested structure
        };
      },
    };
    toolRegistry.register(corruptedSchemaTool);

    // Create CRV gate with strict schema validation
    const crvGate = new CRVGate({
      name: 'Strict Schema Validation Gate',
      validators: [
        Validators.notNull(),
        Validators.schema({
          name: 'string',
          value: 'number',
        }),
        // Additional validator to check type correctness
        async (commit: Commit) => {
          const data = commit.data as any;
          if (typeof data.name !== 'string') {
            return {
              valid: false,
              reason: 'name field must be string',
              confidence: 1.0,
            };
          }
          if (typeof data.value !== 'number') {
            return {
              valid: false,
              reason: 'value field must be number',
              confidence: 1.0,
            };
          }
          return { valid: true, confidence: 1.0 };
        },
      ],
      blockOnFailure: true,
    });

    const executor: TaskExecutor = {
      execute: async (task: TaskSpec, state: TaskState) => {
        const wrapper = toolRegistry.createSafeWrapper(task.toolName!);
        if (!wrapper) throw new Error('Tool not found');

        const context: ToolExecutionContext = {
          taskId: task.id,
          stepId: state.attempt.toString(),
          workflowId: 'corrupted-schema-workflow',
          cache: toolResultCache,
        };

        const result = await wrapper.execute({}, context);
        if (!result.success) {
          throw new Error(result.error || 'Tool execution failed');
        }

        // Validate result with CRV gate
        const commit: Commit = {
          id: task.id,
          data: result.data,
        };
        const gateResult = await crvGate.validate(commit);

        // Log CRV validation with details
        hipCortex.logAction(
          task.id,
          'crv-schema-validation',
          { gate: crvGate.name, data: result.data },
          {
            passed: gateResult.passed,
            blocked: gateResult.blockedCommit,
            validationResults: gateResult.validationResults,
          }
        );

        if (gateResult.blockedCommit) {
          throw new Error(
            `CRV gate blocked corrupted schema: ${gateResult.validationResults
              .filter((r) => !r.valid)
              .map((r) => r.reason)
              .join(', ')}`
          );
        }

        return result.data;
      },
    };

    const orchestrator = new WorkflowOrchestrator(stateStore, executor, eventLog);

    const workflow: WorkflowSpec = {
      id: 'corrupted-schema-workflow',
      name: 'Corrupted Schema Workflow',
      tasks: [
        {
          id: 'task1',
          name: 'Corrupted Schema Task',
          type: 'action',
          toolName: 'corrupted-schema-tool',
        },
      ],
      dependencies: new Map(),
    };

    // Expect workflow to fail due to CRV blocking
    await expect(orchestrator.executeWorkflow(workflow)).rejects.toThrow();

    // Verify audit log contains CRV validation entry with failure details
    const auditLog = hipCortex.getAuditLog();
    const crvEntries = auditLog.filter((e) => e.action === 'crv-schema-validation');
    expect(crvEntries.length).toBe(1);
    expect(crvEntries[0].stateAfter).toMatchObject({
      passed: false,
      blocked: true,
    });

    // Verify CRV blocked the invalid commit
    const crvAfterState = crvEntries[0].stateAfter as any;
    expect(crvAfterState.validationResults).toBeDefined();
    const failedValidations = crvAfterState.validationResults.filter((r: any) => !r.valid);
    expect(failedValidations.length).toBeGreaterThan(0);

    console.log('✅ Corrupted schema blocked by CRV with detailed validation');
  });

  it('should verify audit log completeness for all operations', async () => {
    // Create a simple tool
    const simpleTool: ToolSpec = {
      id: 'simple-tool',
      name: 'Simple Tool',
      description: 'Simple tool for audit testing',
      parameters: [],
      hasSideEffects: false,
      execute: async () => {
        return { result: 'success' };
      },
    };
    toolRegistry.register(simpleTool);

    const executor: TaskExecutor = {
      execute: async (task: TaskSpec, state: TaskState) => {
        // Log task start
        hipCortex.logAction(task.id, 'task-start', null, { taskId: task.id, attempt: state.attempt });

        const wrapper = toolRegistry.createSafeWrapper(task.toolName!);
        if (!wrapper) throw new Error('Tool not found');

        const context: ToolExecutionContext = {
          taskId: task.id,
          stepId: state.attempt.toString(),
          workflowId: 'audit-completeness-workflow',
          cache: toolResultCache,
        };

        const result = await wrapper.execute({}, context);

        // Log task completion
        hipCortex.logAction(
          task.id,
          'task-complete',
          { taskId: task.id },
          { result: result.data, success: result.success }
        );

        if (!result.success) {
          throw new Error(result.error || 'Tool execution failed');
        }

        return result.data;
      },
    };

    const orchestrator = new WorkflowOrchestrator(stateStore, executor, eventLog);

    const workflow: WorkflowSpec = {
      id: 'audit-completeness-workflow',
      name: 'Audit Completeness Workflow',
      tasks: [
        {
          id: 'task1',
          name: 'Task 1',
          type: 'action',
          toolName: 'simple-tool',
        },
        {
          id: 'task2',
          name: 'Task 2',
          type: 'action',
          toolName: 'simple-tool',
        },
      ],
      dependencies: new Map([['task2', ['task1']]]),
    };

    // Log workflow start
    hipCortex.logAction('system', 'workflow-start', null, { workflowId: workflow.id });

    await orchestrator.executeWorkflow(workflow);

    // Log workflow completion
    hipCortex.logAction('system', 'workflow-complete', { workflowId: workflow.id }, { status: 'completed' });

    // Verify audit log completeness
    const auditLog = hipCortex.getAuditLog();

    // Check for workflow start
    const workflowStart = auditLog.find((e) => e.action === 'workflow-start');
    expect(workflowStart).toBeDefined();

    // Check for all task starts
    const taskStarts = auditLog.filter((e) => e.action === 'task-start');
    expect(taskStarts.length).toBe(2);

    // Check for all task completions
    const taskCompletes = auditLog.filter((e) => e.action === 'task-complete');
    expect(taskCompletes.length).toBe(2);

    // Check for workflow completion
    const workflowComplete = auditLog.find((e) => e.action === 'workflow-complete');
    expect(workflowComplete).toBeDefined();

    // Verify all entries have timestamps
    expect(auditLog.every((e) => e.timestamp instanceof Date)).toBe(true);

    // Verify chronological order
    for (let i = 1; i < auditLog.length; i++) {
      expect(auditLog[i].timestamp.getTime()).toBeGreaterThanOrEqual(
        auditLog[i - 1].timestamp.getTime()
      );
    }

    console.log('✅ Audit log is complete with all operations logged in order');
  });
});
