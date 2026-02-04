import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  FaultInjector,
  FaultType,
  FaultInjectionConfig,
  FaultInjectionRule,
  WorkflowOrchestrator,
  WorkflowSpec,
  TaskSpec,
  TaskExecutor,
  TaskState,
  InMemoryStateStore,
  InMemoryEventLog,
} from '../src';

describe('FaultInjector', () => {
  let eventLog: InMemoryEventLog;

  beforeEach(() => {
    eventLog = new InMemoryEventLog();
  });

  describe('Configuration and Enablement', () => {
    it('should respect enabled flag', async () => {
      const config: FaultInjectionConfig = {
        enabled: false,
        rules: [
          {
            type: FaultType.TOOL_FAILURE,
            probability: 1.0,
            config: { errorMessage: 'Test failure' },
          },
        ],
      };

      const injector = new FaultInjector(config, eventLog);
      let executed = false;
      const taskFn = async () => {
        executed = true;
        return 'success';
      };

      const result = await injector.injectBeforeTask(
        'workflow-1',
        'task-1',
        'test-tool',
        taskFn
      );

      expect(result).toBe('success');
      expect(executed).toBe(true);
    });

    it('should enable for specific workflows only', async () => {
      const config: FaultInjectionConfig = {
        enabled: true,
        enabledWorkflows: ['workflow-1'],
        rules: [
          {
            type: FaultType.TOOL_FAILURE,
            probability: 1.0,
            config: { errorMessage: 'Test failure' },
          },
        ],
      };

      const injector = new FaultInjector(config, eventLog);

      // Should inject fault for workflow-1
      expect(injector.isEnabledForWorkflow('workflow-1')).toBe(true);
      
      // Should NOT inject fault for workflow-2
      expect(injector.isEnabledForWorkflow('workflow-2')).toBe(false);
    });

    it('should respect disabled workflows', async () => {
      const config: FaultInjectionConfig = {
        enabled: true,
        disabledWorkflows: ['workflow-2'],
        rules: [
          {
            type: FaultType.TOOL_FAILURE,
            probability: 1.0,
            config: { errorMessage: 'Test failure' },
          },
        ],
      };

      const injector = new FaultInjector(config, eventLog);

      // Should inject fault for workflow-1
      expect(injector.isEnabledForWorkflow('workflow-1')).toBe(true);
      
      // Should NOT inject fault for workflow-2 (disabled)
      expect(injector.isEnabledForWorkflow('workflow-2')).toBe(false);
    });
  });

  describe('Tool Failure Injection', () => {
    it('should inject tool failure with probability 1.0', async () => {
      const config: FaultInjectionConfig = {
        enabled: true,
        rules: [
          {
            type: FaultType.TOOL_FAILURE,
            probability: 1.0,
            config: { errorMessage: 'Injected tool failure' },
          },
        ],
      };

      const injector = new FaultInjector(config, eventLog);
      const taskFn = async () => 'success';

      await expect(
        injector.injectBeforeTask('workflow-1', 'task-1', 'test-tool', taskFn)
      ).rejects.toThrow('Injected tool failure');
    });

    it('should log injected fault to event log', async () => {
      const config: FaultInjectionConfig = {
        enabled: true,
        rules: [
          {
            type: FaultType.TOOL_FAILURE,
            probability: 1.0,
            config: { errorMessage: 'Test failure' },
          },
        ],
      };

      const injector = new FaultInjector(config, eventLog);
      const taskFn = async () => 'success';

      try {
        await injector.injectBeforeTask('workflow-1', 'task-1', 'test-tool', taskFn);
      } catch (error) {
        // Expected to fail
      }

      const events = await eventLog.read('workflow-1');
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('FAULT_INJECTED');
      expect(events[0].metadata?.faultType).toBe(FaultType.TOOL_FAILURE);
      expect(events[0].metadata?.toolName).toBe('test-tool');
    });

    it('should target specific task IDs', async () => {
      const config: FaultInjectionConfig = {
        enabled: true,
        rules: [
          {
            type: FaultType.TOOL_FAILURE,
            probability: 1.0,
            targetTaskIds: ['task-2'],
            config: { errorMessage: 'Test failure' },
          },
        ],
      };

      const injector = new FaultInjector(config, eventLog);
      let task1Executed = false;
      let task2Executed = false;

      const task1Fn = async () => {
        task1Executed = true;
        return 'task1-success';
      };
      const task2Fn = async () => {
        task2Executed = true;
        return 'task2-success';
      };

      // Task 1 should execute normally
      const result1 = await injector.injectBeforeTask(
        'workflow-1',
        'task-1',
        'test-tool',
        task1Fn
      );
      expect(result1).toBe('task1-success');
      expect(task1Executed).toBe(true);

      // Task 2 should fail
      await expect(
        injector.injectBeforeTask('workflow-1', 'task-2', 'test-tool', task2Fn)
      ).rejects.toThrow('Test failure');
      expect(task2Executed).toBe(false);
    });

    it('should target specific tools', async () => {
      const config: FaultInjectionConfig = {
        enabled: true,
        rules: [
          {
            type: FaultType.TOOL_FAILURE,
            probability: 1.0,
            targetTools: ['failing-tool'],
            config: { errorMessage: 'Test failure' },
          },
        ],
      };

      const injector = new FaultInjector(config, eventLog);

      // Task with 'safe-tool' should execute normally
      const result1 = await injector.injectBeforeTask(
        'workflow-1',
        'task-1',
        'safe-tool',
        async () => 'success'
      );
      expect(result1).toBe('success');

      // Task with 'failing-tool' should fail
      await expect(
        injector.injectBeforeTask(
          'workflow-1',
          'task-1',
          'failing-tool',
          async () => 'success'
        )
      ).rejects.toThrow('Test failure');
    });
  });

  describe('Latency Spike Injection', () => {
    it('should inject latency spike', async () => {
      const config: FaultInjectionConfig = {
        enabled: true,
        rules: [
          {
            type: FaultType.LATENCY_SPIKE,
            probability: 1.0,
            config: { delayMs: 100 },
          },
        ],
      };

      const injector = new FaultInjector(config, eventLog);
      let executed = false;
      const taskFn = async () => {
        executed = true;
        return 'success';
      };

      const startTime = Date.now();
      const result = await injector.injectBeforeTask(
        'workflow-1',
        'task-1',
        'test-tool',
        taskFn
      );
      const duration = Date.now() - startTime;

      expect(result).toBe('success');
      expect(executed).toBe(true);
      expect(duration).toBeGreaterThanOrEqual(100);
    });

    it('should log latency spike to event log', async () => {
      const config: FaultInjectionConfig = {
        enabled: true,
        rules: [
          {
            type: FaultType.LATENCY_SPIKE,
            probability: 1.0,
            config: { delayMs: 50 },
          },
        ],
      };

      const injector = new FaultInjector(config, eventLog);
      await injector.injectBeforeTask(
        'workflow-1',
        'task-1',
        'test-tool',
        async () => 'success'
      );

      const events = await eventLog.read('workflow-1');
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('FAULT_INJECTED');
      expect(events[0].metadata?.faultType).toBe(FaultType.LATENCY_SPIKE);
    });
  });

  describe('Partial Outage Injection', () => {
    it('should inject partial outage with failure rate', async () => {
      const config: FaultInjectionConfig = {
        enabled: true,
        rules: [
          {
            type: FaultType.PARTIAL_OUTAGE,
            probability: 1.0,
            config: {
              outageDurationMs: 5000,
              failureRate: 1.0, // Always fail during outage
            },
          },
        ],
      };

      const injector = new FaultInjector(config, eventLog);
      injector.clearOutageState(); // Ensure clean state
      const taskFn = async () => 'success';

      // Should fail during outage
      await expect(
        injector.injectBeforeTask('workflow-1', 'task-1', 'test-tool', taskFn)
      ).rejects.toThrow('Injected partial outage failure');
    });

    it('should sometimes succeed during partial outage', async () => {
      const config: FaultInjectionConfig = {
        enabled: true,
        rules: [
          {
            type: FaultType.PARTIAL_OUTAGE,
            probability: 1.0,
            config: {
              outageDurationMs: 5000,
              failureRate: 0.0, // Never fail during outage
            },
          },
        ],
      };

      const injector = new FaultInjector(config, eventLog);
      injector.clearOutageState(); // Ensure clean state
      const taskFn = async () => 'success';

      // Should succeed even during outage
      const result = await injector.injectBeforeTask(
        'workflow-1',
        'task-1',
        'test-tool',
        taskFn
      );
      expect(result).toBe('success');
    });

    it('should maintain outage state across calls', async () => {
      const config: FaultInjectionConfig = {
        enabled: true,
        rules: [
          {
            type: FaultType.PARTIAL_OUTAGE,
            probability: 1.0,
            config: {
              outageDurationMs: 5000,
              failureRate: 1.0,
            },
          },
        ],
      };

      const injector = new FaultInjector(config, eventLog);
      injector.clearOutageState(); // Ensure clean state
      const taskFn = async () => 'success';

      // First call should fail (start outage)
      await expect(
        injector.injectBeforeTask('workflow-1', 'task-1', 'test-tool', taskFn)
      ).rejects.toThrow('Injected partial outage failure');

      // Second call should also fail (still in outage)
      await expect(
        injector.injectBeforeTask('workflow-1', 'task-1', 'test-tool', taskFn)
      ).rejects.toThrow('Injected partial outage failure');
    });
  });

  describe('Probability-based Injection', () => {
    it('should respect probability < 1.0', async () => {
      const config: FaultInjectionConfig = {
        enabled: true,
        rules: [
          {
            type: FaultType.TOOL_FAILURE,
            probability: 0.0, // Never inject
            config: { errorMessage: 'Test failure' },
          },
        ],
      };

      const injector = new FaultInjector(config, eventLog);
      let executionCount = 0;

      for (let i = 0; i < 10; i++) {
        const result = await injector.injectBeforeTask(
          'workflow-1',
          'task-1',
          'test-tool',
          async () => {
            executionCount++;
            return 'success';
          }
        );
        expect(result).toBe('success');
      }

      // All tasks should have executed successfully
      expect(executionCount).toBe(10);
    });
  });

  describe('Multiple Rules', () => {
    it('should apply first matching rule', async () => {
      const config: FaultInjectionConfig = {
        enabled: true,
        rules: [
          {
            type: FaultType.TOOL_FAILURE,
            probability: 1.0,
            targetTaskIds: ['task-1'],
            config: { errorMessage: 'First rule failure' },
          },
          {
            type: FaultType.TOOL_FAILURE,
            probability: 1.0,
            targetTaskIds: ['task-1'],
            config: { errorMessage: 'Second rule failure' },
          },
        ],
      };

      const injector = new FaultInjector(config, eventLog);

      // Should apply first rule
      await expect(
        injector.injectBeforeTask(
          'workflow-1',
          'task-1',
          'test-tool',
          async () => 'success'
        )
      ).rejects.toThrow('First rule failure');
    });
  });
});

describe('FaultInjector Integration with WorkflowOrchestrator', () => {
  let stateStore: InMemoryStateStore;
  let eventLog: InMemoryEventLog;
  let mockExecutor: TaskExecutor;

  beforeEach(() => {
    stateStore = new InMemoryStateStore();
    eventLog = new InMemoryEventLog();
    mockExecutor = {
      execute: async (task: TaskSpec) => {
        return { taskId: task.id, result: 'success' };
      },
    };
  });

  it('should inject faults during workflow execution', async () => {
    const faultConfig: FaultInjectionConfig = {
      enabled: true,
      rules: [
        {
          type: FaultType.TOOL_FAILURE,
          probability: 1.0,
          targetTaskIds: ['task2'],
          config: { errorMessage: 'Injected failure' },
        },
      ],
    };

    const faultInjector = new FaultInjector(faultConfig, eventLog);
    const orchestrator = new WorkflowOrchestrator(
      stateStore,
      mockExecutor,
      eventLog,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      faultInjector
    );

    const spec: WorkflowSpec = {
      id: 'test-workflow',
      name: 'Test Workflow',
      tasks: [
        { id: 'task1', name: 'Task 1', type: 'action', toolName: 'test-tool' },
        { id: 'task2', name: 'Task 2', type: 'action', toolName: 'test-tool' },
      ],
      dependencies: new Map([['task2', ['task1']]]),
    };

    // Should fail on task2
    await expect(orchestrator.executeWorkflow(spec)).rejects.toThrow();

    // Verify task1 completed
    const state = await stateStore.loadWorkflowState('test-workflow');
    expect(state?.taskStates.get('task1')?.status).toBe('completed');

    // Verify task2 failed
    expect(state?.taskStates.get('task2')?.status).toBe('failed');

    // Verify fault was logged
    const events = await eventLog.read('test-workflow');
    const faultEvents = events.filter((e) => e.type === 'FAULT_INJECTED');
    expect(faultEvents).toHaveLength(1);
    expect(faultEvents[0].taskId).toBe('task2');
  });

  it('should inject latency spikes during workflow execution', async () => {
    const faultConfig: FaultInjectionConfig = {
      enabled: true,
      rules: [
        {
          type: FaultType.LATENCY_SPIKE,
          probability: 1.0,
          config: { delayMs: 100 },
        },
      ],
    };

    const faultInjector = new FaultInjector(faultConfig, eventLog);
    const orchestrator = new WorkflowOrchestrator(
      stateStore,
      mockExecutor,
      eventLog,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      faultInjector
    );

    const spec: WorkflowSpec = {
      id: 'test-workflow',
      name: 'Test Workflow',
      tasks: [{ id: 'task1', name: 'Task 1', type: 'action' }],
      dependencies: new Map(),
    };

    const startTime = Date.now();
    const result = await orchestrator.executeWorkflow(spec);
    const duration = Date.now() - startTime;

    // Should complete successfully but with delay
    expect(result.status).toBe('completed');
    expect(duration).toBeGreaterThanOrEqual(100);

    // Verify fault was logged
    const events = await eventLog.read('test-workflow');
    const faultEvents = events.filter((e) => e.type === 'FAULT_INJECTED');
    expect(faultEvents).toHaveLength(1);
  });

  it('should respect per-workflow enablement', async () => {
    const faultConfig: FaultInjectionConfig = {
      enabled: true,
      enabledWorkflows: ['enabled-workflow'],
      rules: [
        {
          type: FaultType.TOOL_FAILURE,
          probability: 1.0,
          config: { errorMessage: 'Injected failure' },
        },
      ],
    };

    const faultInjector = new FaultInjector(faultConfig, eventLog);
    const orchestrator = new WorkflowOrchestrator(
      stateStore,
      mockExecutor,
      eventLog,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      faultInjector
    );

    // Workflow with fault injection disabled should succeed
    const disabledSpec: WorkflowSpec = {
      id: 'disabled-workflow',
      name: 'Disabled Workflow',
      tasks: [{ id: 'task1', name: 'Task 1', type: 'action' }],
      dependencies: new Map(),
    };

    const disabledResult = await orchestrator.executeWorkflow(disabledSpec);
    expect(disabledResult.status).toBe('completed');

    // Workflow with fault injection enabled should fail
    const enabledSpec: WorkflowSpec = {
      id: 'enabled-workflow',
      name: 'Enabled Workflow',
      tasks: [{ id: 'task1', name: 'Task 1', type: 'action' }],
      dependencies: new Map(),
    };

    await expect(orchestrator.executeWorkflow(enabledSpec)).rejects.toThrow();
  });

  it('should work with retry logic', async () => {
    let attemptCount = 0;
    const executorWithAttempts: TaskExecutor = {
      execute: async (task: TaskSpec, state: TaskState) => {
        attemptCount++;
        return { taskId: task.id, attempt: state.attempt, result: 'success' };
      },
    };

    const faultConfig: FaultInjectionConfig = {
      enabled: true,
      rules: [
        {
          type: FaultType.TOOL_FAILURE,
          probability: 1.0,
          config: { errorMessage: 'Injected failure' },
        },
      ],
    };

    const faultInjector = new FaultInjector(faultConfig, eventLog);
    const orchestrator = new WorkflowOrchestrator(
      stateStore,
      executorWithAttempts,
      eventLog,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      faultInjector
    );

    const spec: WorkflowSpec = {
      id: 'test-workflow',
      name: 'Test Workflow',
      tasks: [
        {
          id: 'task1',
          name: 'Task 1',
          type: 'action',
          retry: { maxAttempts: 3, backoffMs: 10 },
        },
      ],
      dependencies: new Map(),
    };

    // Should fail after all retries
    await expect(orchestrator.executeWorkflow(spec)).rejects.toThrow();

    // Verify multiple attempts were made
    expect(attemptCount).toBe(0); // Executor never called due to fault injection
    const state = await stateStore.loadWorkflowState('test-workflow');
    expect(state?.taskStates.get('task1')?.attempt).toBe(3);
  });
});
