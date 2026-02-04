import { describe, it, expect, beforeEach } from 'vitest';
import {
  SandboxExecutor,
  MockSandboxProvider,
  SandboxConfig,
  SandboxType,
  SandboxAuditLogger,
} from '../src/sandbox';

describe('SandboxExecutor', () => {
  let executor: SandboxExecutor;
  let auditLogger: SandboxAuditLogger;

  beforeEach(() => {
    auditLogger = new SandboxAuditLogger();
    executor = new SandboxExecutor(auditLogger);
  });

  describe('Sandbox lifecycle', () => {
    it('should create and destroy sandbox', async () => {
      const config: SandboxConfig = {
        id: 'test-config',
        type: SandboxType.MOCK,
        permissions: {
          filesystem: {
            readOnlyPaths: ['/tmp'],
            readWritePaths: [],
          },
          network: {
            enabled: false,
          },
          resources: {
            maxCpu: 1,
            maxMemory: 256 * 1024 * 1024,
            maxExecutionTime: 30000,
          },
        },
      };

      const sandboxId = await executor.createSandbox(
        config,
        'workflow-1',
        'task-1',
        'user-1'
      );

      expect(sandboxId).toBeTruthy();
      expect(await executor.sandboxExists(sandboxId)).toBe(true);

      await executor.destroySandbox(sandboxId, 'workflow-1', 'task-1', 'test_complete');

      expect(await executor.sandboxExists(sandboxId)).toBe(false);
    });

    it('should execute function in sandbox', async () => {
      const config: SandboxConfig = {
        id: 'test-config',
        type: SandboxType.MOCK,
        permissions: {
          filesystem: {},
          network: { enabled: false },
          resources: {
            maxExecutionTime: 30000,
          },
        },
      };

      const sandboxId = await executor.createSandbox(config, 'workflow-1', 'task-1');

      const result = await executor.executeInSandbox(
        sandboxId,
        async () => {
          return { message: 'Hello from sandbox' };
        },
        {},
        'workflow-1',
        'task-1',
        'tool-1'
      );

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ message: 'Hello from sandbox' });
      expect(result.metadata?.sandboxId).toBe(sandboxId);

      await executor.destroySandbox(sandboxId, 'workflow-1', 'task-1');
    });

    it('should handle execution errors in sandbox', async () => {
      const config: SandboxConfig = {
        id: 'test-config',
        type: SandboxType.MOCK,
        permissions: {
          filesystem: {},
          network: { enabled: false },
          resources: {},
        },
      };

      const sandboxId = await executor.createSandbox(config, 'workflow-1', 'task-1');

      const result = await executor.executeInSandbox(
        sandboxId,
        async () => {
          throw new Error('Test error');
        },
        {},
        'workflow-1',
        'task-1',
        'tool-1'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Test error');

      await executor.destroySandbox(sandboxId, 'workflow-1', 'task-1');
    });

    it('should track resource usage', async () => {
      const config: SandboxConfig = {
        id: 'test-config',
        type: SandboxType.MOCK,
        permissions: {
          filesystem: {},
          network: { enabled: false },
          resources: {},
        },
      };

      const sandboxId = await executor.createSandbox(config, 'workflow-1', 'task-1');

      await executor.executeInSandbox(
        sandboxId,
        async () => {
          return { data: 'test' };
        },
        {},
        'workflow-1',
        'task-1',
        'tool-1'
      );

      const usage = await executor.getResourceUsage(sandboxId);
      expect(usage).toBeDefined();
      expect(typeof usage.cpu).toBe('number');
      expect(typeof usage.memory).toBe('number');

      await executor.destroySandbox(sandboxId, 'workflow-1', 'task-1');
    });
  });

  describe('Resource limits enforcement', () => {
    it('should enforce CPU limits', async () => {
      const config: SandboxConfig = {
        id: 'test-config',
        type: SandboxType.MOCK,
        permissions: {
          filesystem: {},
          network: { enabled: false },
          resources: {
            maxCpu: 0.1, // Very low limit
            maxMemory: 256 * 1024 * 1024,
          },
        },
      };

      const sandboxId = await executor.createSandbox(config, 'workflow-1', 'task-1');

      // Execute multiple times to accumulate CPU usage
      let failed = false;
      for (let i = 0; i < 5; i++) {
        const result = await executor.executeInSandbox(
          sandboxId,
          async () => {
            return { iteration: i };
          },
          {},
          'workflow-1',
          'task-1',
          'tool-1'
        );

        if (!result.success && result.metadata?.resourceLimitExceeded) {
          failed = true;
          expect(result.error).toContain('CPU');
          break;
        }
      }

      expect(failed).toBe(true);
      await executor.destroySandbox(sandboxId, 'workflow-1', 'task-1');
    });

    it('should enforce memory limits', async () => {
      const config: SandboxConfig = {
        id: 'test-config',
        type: SandboxType.MOCK,
        permissions: {
          filesystem: {},
          network: { enabled: false },
          resources: {
            maxMemory: 1024, // Very low limit (1 KB)
          },
        },
      };

      const sandboxId = await executor.createSandbox(config, 'workflow-1', 'task-1');

      // Execute multiple times to accumulate memory usage
      let failed = false;
      for (let i = 0; i < 5; i++) {
        const result = await executor.executeInSandbox(
          sandboxId,
          async () => {
            return { iteration: i };
          },
          {},
          'workflow-1',
          'task-1',
          'tool-1'
        );

        if (!result.success && result.metadata?.resourceLimitExceeded) {
          failed = true;
          expect(result.error).toContain('Memory');
          break;
        }
      }

      expect(failed).toBe(true);
      await executor.destroySandbox(sandboxId, 'workflow-1', 'task-1');
    });

    it('should enforce execution time limits', async () => {
      const config: SandboxConfig = {
        id: 'test-config',
        type: SandboxType.MOCK,
        permissions: {
          filesystem: {},
          network: { enabled: false },
          resources: {
            maxExecutionTime: 10, // Very short limit (10ms)
          },
        },
      };

      const sandboxId = await executor.createSandbox(config, 'workflow-1', 'task-1');

      const result = await executor.executeInSandbox(
        sandboxId,
        async () => {
          // Simulate slow operation
          await new Promise(resolve => setTimeout(resolve, 50));
          return { data: 'test' };
        },
        {},
        'workflow-1',
        'task-1',
        'tool-1'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('time');
      expect(result.metadata?.resourceLimitExceeded).toBe(true);

      await executor.destroySandbox(sandboxId, 'workflow-1', 'task-1');
    });
  });

  describe('Audit logging', () => {
    it('should log sandbox creation', async () => {
      const config: SandboxConfig = {
        id: 'test-config',
        type: SandboxType.MOCK,
        permissions: {
          filesystem: {},
          network: { enabled: false },
          resources: {},
        },
      };

      const sandboxId = await executor.createSandbox(
        config,
        'workflow-1',
        'task-1',
        'user-1'
      );

      const logs = auditLogger.getAuditLog();
      const creationLog = logs.find(
        log => log.eventType === 'sandbox_created' && log.sandboxId === sandboxId
      );

      expect(creationLog).toBeDefined();
      expect(creationLog?.workflowId).toBe('workflow-1');
      expect(creationLog?.taskId).toBe('task-1');
      expect(creationLog?.principalId).toBe('user-1');

      await executor.destroySandbox(sandboxId, 'workflow-1', 'task-1');
    });

    it('should log sandbox destruction', async () => {
      const config: SandboxConfig = {
        id: 'test-config',
        type: SandboxType.MOCK,
        permissions: {
          filesystem: {},
          network: { enabled: false },
          resources: {},
        },
      };

      const sandboxId = await executor.createSandbox(config, 'workflow-1', 'task-1');
      await executor.destroySandbox(sandboxId, 'workflow-1', 'task-1', 'test_cleanup');

      const logs = auditLogger.getAuditLog();
      const destructionLog = logs.find(
        log => log.eventType === 'sandbox_destroyed' && log.sandboxId === sandboxId
      );

      expect(destructionLog).toBeDefined();
      expect(destructionLog?.data.reason).toBe('test_cleanup');
    });

    it('should log tool execution', async () => {
      const config: SandboxConfig = {
        id: 'test-config',
        type: SandboxType.MOCK,
        permissions: {
          filesystem: {},
          network: { enabled: false },
          resources: {},
        },
      };

      const sandboxId = await executor.createSandbox(config, 'workflow-1', 'task-1');

      await executor.executeInSandbox(
        sandboxId,
        async () => {
          return { result: 'success' };
        },
        { param1: 'value1' },
        'workflow-1',
        'task-1',
        'tool-1',
        'user-1'
      );

      const logs = auditLogger.getAuditLog();
      const startLog = logs.find(
        log => log.eventType === 'tool_execution_start' && log.toolId === 'tool-1'
      );
      const endLog = logs.find(
        log => log.eventType === 'tool_execution_end' && log.toolId === 'tool-1'
      );

      expect(startLog).toBeDefined();
      expect(startLog?.principalId).toBe('user-1');
      expect(endLog).toBeDefined();
      expect(endLog?.data.success).toBe(true);

      await executor.destroySandbox(sandboxId, 'workflow-1', 'task-1');
    });
  });

  describe('Multiple sandboxes', () => {
    it('should manage multiple sandboxes concurrently', async () => {
      const config1: SandboxConfig = {
        id: 'config-1',
        type: SandboxType.MOCK,
        permissions: {
          filesystem: {},
          network: { enabled: false },
          resources: {},
        },
      };

      const config2: SandboxConfig = {
        id: 'config-2',
        type: SandboxType.MOCK,
        permissions: {
          filesystem: {},
          network: { enabled: false },
          resources: {},
        },
      };

      const sandboxId1 = await executor.createSandbox(config1, 'workflow-1', 'task-1');
      const sandboxId2 = await executor.createSandbox(config2, 'workflow-1', 'task-2');

      expect(sandboxId1).not.toBe(sandboxId2);
      expect(await executor.sandboxExists(sandboxId1)).toBe(true);
      expect(await executor.sandboxExists(sandboxId2)).toBe(true);

      const activeSandboxes = executor.listActiveSandboxes();
      expect(activeSandboxes).toContain(sandboxId1);
      expect(activeSandboxes).toContain(sandboxId2);

      await executor.destroySandbox(sandboxId1, 'workflow-1', 'task-1');
      await executor.destroySandbox(sandboxId2, 'workflow-1', 'task-2');
    });

    it('should cleanup all sandboxes', async () => {
      const config: SandboxConfig = {
        id: 'test-config',
        type: SandboxType.MOCK,
        permissions: {
          filesystem: {},
          network: { enabled: false },
          resources: {},
        },
      };

      await executor.createSandbox(config, 'workflow-1', 'task-1');
      await executor.createSandbox(config, 'workflow-1', 'task-2');
      await executor.createSandbox(config, 'workflow-1', 'task-3');

      expect(executor.listActiveSandboxes().length).toBe(3);

      await executor.cleanup('workflow-1', 'cleanup-task');

      expect(executor.listActiveSandboxes().length).toBe(0);
    });
  });
});
