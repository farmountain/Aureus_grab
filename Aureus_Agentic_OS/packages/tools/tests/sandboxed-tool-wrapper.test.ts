import { describe, it, expect, beforeEach } from 'vitest';
import {
  SandboxedToolWrapper,
  SandboxConfigFactory,
  SandboxExecutor,
  SandboxAuditLogger,
  EscalationManager,
  MockEscalationHandler,
  SandboxedToolContext,
} from '../src/sandbox';
import { ToolSpec, InMemoryToolResultCache } from '../src/index';

describe('SandboxedToolWrapper', () => {
  let executor: SandboxExecutor;
  let auditLogger: SandboxAuditLogger;
  let escalationManager: EscalationManager;
  let cache: InMemoryToolResultCache;

  beforeEach(() => {
    auditLogger = new SandboxAuditLogger();
    executor = new SandboxExecutor(auditLogger);
    const escalationHandler = new MockEscalationHandler(false); // Auto-deny by default
    escalationManager = new EscalationManager(escalationHandler, undefined, auditLogger);
    cache = new InMemoryToolResultCache();
  });

  describe('Basic execution', () => {
    it('should execute tool in sandbox successfully', async () => {
      const tool: ToolSpec = {
        id: 'test-tool',
        name: 'Test Tool',
        description: 'A test tool',
        parameters: [],
        execute: async () => {
          return { result: 'success' };
        },
      };

      const config = SandboxConfigFactory.createStandard('test-sandbox');
      const wrapper = new SandboxedToolWrapper(tool, config);

      const context: SandboxedToolContext = {
        workflowId: 'workflow-1',
        taskId: 'task-1',
        stepId: 'step-1',
        sandboxExecutor: executor,
        sandboxAuditLogger: auditLogger,
        cache,
      };

      const result = await wrapper.execute({}, context);

      expect(result.success).toBe(true);
      expect(result.metadata?.sandboxExecution).toBe(true);
      expect(result.metadata?.sandboxId).toBeTruthy();
    });

    it('should fall back to integrated wrapper when no sandbox config provided', async () => {
      const tool: ToolSpec = {
        id: 'test-tool',
        name: 'Test Tool',
        description: 'A test tool',
        parameters: [],
        execute: async () => {
          return { result: 'no sandbox' };
        },
      };

      const wrapper = new SandboxedToolWrapper(tool); // No sandbox config

      const context: SandboxedToolContext = {
        workflowId: 'workflow-1',
        taskId: 'task-1',
        stepId: 'step-1',
        cache,
      };

      const result = await wrapper.execute({}, context);

      expect(result.success).toBe(true);
      expect(result.metadata?.sandboxExecution).toBeUndefined();
    });

    it('should cleanup non-persistent sandbox after execution', async () => {
      const tool: ToolSpec = {
        id: 'test-tool',
        name: 'Test Tool',
        description: 'A test tool',
        parameters: [],
        execute: async () => {
          return { result: 'success' };
        },
      };

      const config = SandboxConfigFactory.createStandard('test-sandbox');
      config.persistent = false; // Explicitly non-persistent
      const wrapper = new SandboxedToolWrapper(tool, config);

      const context: SandboxedToolContext = {
        workflowId: 'workflow-1',
        taskId: 'task-1',
        stepId: 'step-1',
        sandboxExecutor: executor,
        sandboxAuditLogger: auditLogger,
        cache,
      };

      const result = await wrapper.execute({}, context);
      const sandboxId = result.metadata?.sandboxId as string;

      expect(result.success).toBe(true);
      expect(sandboxId).toBeTruthy();

      // Sandbox should be cleaned up
      expect(await executor.sandboxExists(sandboxId)).toBe(false);
    });
  });

  describe('Permission enforcement', () => {
    it('should deny filesystem access outside allowed paths', async () => {
      const tool: ToolSpec = {
        id: 'file-tool',
        name: 'File Tool',
        description: 'File access tool',
        parameters: [
          { name: 'path', type: 'string', required: true },
        ],
        execute: async (params) => {
          return { path: params.path, content: 'data' };
        },
      };

      const config = SandboxConfigFactory.createRestrictive('restrictive-sandbox');
      const wrapper = new SandboxedToolWrapper(tool, config);

      const context: SandboxedToolContext = {
        workflowId: 'workflow-1',
        taskId: 'task-1',
        stepId: 'step-1',
        sandboxExecutor: executor,
        sandboxAuditLogger: auditLogger,
        escalationManager,
        cache,
      };

      // Try to access a denied path
      const result = await wrapper.execute(
        { path: '/etc/passwd' },
        context
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Permission denied');
      expect(result.metadata?.permissionDenied).toBe(true);
    });

    it('should allow filesystem access to allowed paths', async () => {
      const tool: ToolSpec = {
        id: 'file-tool',
        name: 'File Tool',
        description: 'File access tool',
        parameters: [
          { name: 'path', type: 'string', required: true },
        ],
        execute: async (params) => {
          return { path: params.path, content: 'data' };
        },
      };

      const config = SandboxConfigFactory.createRestrictive('restrictive-sandbox');
      const wrapper = new SandboxedToolWrapper(tool, config);

      const context: SandboxedToolContext = {
        workflowId: 'workflow-1',
        taskId: 'task-1',
        stepId: 'step-1',
        sandboxExecutor: executor,
        sandboxAuditLogger: auditLogger,
        cache,
      };

      // Try to access an allowed path
      const result = await wrapper.execute(
        { path: '/tmp/test.txt' },
        context
      );

      expect(result.success).toBe(true);
    });

    it('should deny network access when network is disabled', async () => {
      const tool: ToolSpec = {
        id: 'http-tool',
        name: 'HTTP Tool',
        description: 'HTTP access tool',
        parameters: [
          { name: 'url', type: 'string', required: true },
        ],
        execute: async (params) => {
          return { url: params.url, data: 'response' };
        },
      };

      const config = SandboxConfigFactory.createRestrictive('restrictive-sandbox');
      // Restrictive config has network disabled
      const wrapper = new SandboxedToolWrapper(tool, config);

      const context: SandboxedToolContext = {
        workflowId: 'workflow-1',
        taskId: 'task-1',
        stepId: 'step-1',
        sandboxExecutor: executor,
        sandboxAuditLogger: auditLogger,
        escalationManager,
        cache,
      };

      const result = await wrapper.execute(
        { url: 'https://example.com/api' },
        context
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Permission denied');
    });

    it('should allow network access to allowed domains', async () => {
      const tool: ToolSpec = {
        id: 'http-tool',
        name: 'HTTP Tool',
        description: 'HTTP access tool',
        parameters: [
          { name: 'url', type: 'string', required: true },
        ],
        execute: async (params) => {
          return { url: params.url, data: 'response' };
        },
      };

      const config = SandboxConfigFactory.createStandard('standard-sandbox');
      // Standard config has network enabled with *.example.com allowed
      const wrapper = new SandboxedToolWrapper(tool, config);

      const context: SandboxedToolContext = {
        workflowId: 'workflow-1',
        taskId: 'task-1',
        stepId: 'step-1',
        sandboxExecutor: executor,
        sandboxAuditLogger: auditLogger,
        cache,
      };

      const result = await wrapper.execute(
        { url: 'https://api.example.com/data' },
        context
      );

      expect(result.success).toBe(true);
    });
  });

  describe('Escalation handling', () => {
    it('should deny escalation when handler denies', async () => {
      const tool: ToolSpec = {
        id: 'file-tool',
        name: 'File Tool',
        description: 'File access tool',
        parameters: [
          { name: 'path', type: 'string', required: true },
        ],
        execute: async (params) => {
          return { path: params.path, content: 'data' };
        },
      };

      const config = SandboxConfigFactory.createRestrictive('restrictive-sandbox');
      const wrapper = new SandboxedToolWrapper(tool, config);

      const principal = {
        id: 'user-1',
        type: 'user' as const,
        permissions: [],
      };

      const context: SandboxedToolContext = {
        workflowId: 'workflow-1',
        taskId: 'task-1',
        stepId: 'step-1',
        sandboxExecutor: executor,
        sandboxAuditLogger: auditLogger,
        escalationManager, // Auto-deny handler
        principal,
        cache,
      };

      const result = await wrapper.execute(
        { path: '/home/user/secret.txt' },
        context
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Escalation');
      expect(result.metadata?.escalationDenied).toBe(true);
    });

    it('should approve escalation when handler approves', async () => {
      // Create escalation manager with auto-approve handler
      const autoApproveHandler = new MockEscalationHandler(true);
      const approveManager = new EscalationManager(
        autoApproveHandler,
        undefined,
        auditLogger
      );

      const tool: ToolSpec = {
        id: 'file-tool',
        name: 'File Tool',
        description: 'File access tool',
        parameters: [
          { name: 'path', type: 'string', required: true },
        ],
        execute: async (params) => {
          return { path: params.path, content: 'data' };
        },
      };

      const config = SandboxConfigFactory.createRestrictive('restrictive-sandbox');
      const wrapper = new SandboxedToolWrapper(tool, config);

      const principal = {
        id: 'user-1',
        type: 'user' as const,
        permissions: [],
      };

      const context: SandboxedToolContext = {
        workflowId: 'workflow-1',
        taskId: 'task-1',
        stepId: 'step-1',
        sandboxExecutor: executor,
        sandboxAuditLogger: auditLogger,
        escalationManager: approveManager,
        principal,
        cache,
      };

      const result = await wrapper.execute(
        { path: '/home/user/data.txt' },
        context
      );

      // With auto-approve, execution should proceed
      // Note: In real implementation, would need to recreate sandbox with new permissions
      expect(result.success).toBe(true);
    });
  });

  describe('Audit logging', () => {
    it('should log permission checks', async () => {
      const tool: ToolSpec = {
        id: 'file-tool',
        name: 'File Tool',
        description: 'File access tool',
        parameters: [
          { name: 'path', type: 'string', required: true },
        ],
        execute: async (params) => {
          return { path: params.path };
        },
      };

      const config = SandboxConfigFactory.createStandard('standard-sandbox');
      const wrapper = new SandboxedToolWrapper(tool, config);

      const principal = {
        id: 'user-1',
        type: 'user' as const,
        permissions: [],
      };

      const context: SandboxedToolContext = {
        workflowId: 'workflow-1',
        taskId: 'task-1',
        stepId: 'step-1',
        sandboxExecutor: executor,
        sandboxAuditLogger: auditLogger,
        principal,
        cache,
      };

      await wrapper.execute(
        { path: '/tmp/sandbox/test.txt' },
        context
      );

      const logs = auditLogger.getAuditLog();
      const permissionLog = logs.find(
        log => log.eventType === 'permission_check'
      );

      expect(permissionLog).toBeDefined();
      expect(permissionLog?.toolId).toBe('file-tool');
      expect(permissionLog?.principalId).toBe('user-1');
    });

    it('should log escalation requests', async () => {
      const tool: ToolSpec = {
        id: 'file-tool',
        name: 'File Tool',
        description: 'File access tool',
        parameters: [
          { name: 'path', type: 'string', required: true },
        ],
        execute: async (params) => {
          return { path: params.path };
        },
      };

      const config = SandboxConfigFactory.createRestrictive('restrictive-sandbox');
      const wrapper = new SandboxedToolWrapper(tool, config);

      const principal = {
        id: 'user-1',
        type: 'user' as const,
        permissions: [],
      };

      const context: SandboxedToolContext = {
        workflowId: 'workflow-1',
        taskId: 'task-1',
        stepId: 'step-1',
        sandboxExecutor: executor,
        sandboxAuditLogger: auditLogger,
        escalationManager,
        principal,
        cache,
      };

      await wrapper.execute(
        { path: '/home/user/data.txt' },
        context
      );

      const logs = auditLogger.getAuditLog();
      const escalationLog = logs.find(
        log => log.eventType === 'escalation_requested'
      );

      expect(escalationLog).toBeDefined();
      expect(escalationLog?.toolId).toBe('file-tool');
    });
  });

  describe('Config factory', () => {
    it('should create restrictive config', () => {
      const config = SandboxConfigFactory.createRestrictive('test');
      
      expect(config.permissions.network.enabled).toBe(false);
      expect(config.permissions.filesystem.readOnlyPaths).toContain('/tmp');
      expect(config.permissions.filesystem.deniedPaths).toContain('/etc');
      expect(config.permissions.resources.maxMemory).toBeLessThan(512 * 1024 * 1024);
    });

    it('should create standard config', () => {
      const config = SandboxConfigFactory.createStandard('test');
      
      expect(config.permissions.network.enabled).toBe(true);
      expect(config.permissions.network.allowedDomains).toBeDefined();
      expect(config.permissions.filesystem.readWritePaths).toBeDefined();
      expect(config.permissions.resources.maxCpu).toBeGreaterThan(1);
    });

    it('should create permissive config', () => {
      const config = SandboxConfigFactory.createPermissive('test');
      
      expect(config.permissions.network.enabled).toBe(true);
      expect(config.permissions.filesystem.readOnlyPaths).toContain('/*');
      expect(config.permissions.resources.maxMemory).toBeGreaterThan(1024 * 1024 * 1024);
    });
  });
});
