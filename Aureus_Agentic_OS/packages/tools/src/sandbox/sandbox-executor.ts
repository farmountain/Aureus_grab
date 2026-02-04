/**
 * Sandbox executor - manages constrained execution environments
 * Provides interface for container/VM-based sandboxing
 */

import {
  SandboxConfig,
  SandboxType,
  SandboxExecutionResult,
  SandboxPermissions,
} from './types';
import { PermissionChecker } from './permission-checker';
import { SandboxAuditLogger } from './audit-logger';
import { SimulationSandboxProvider } from './simulation-provider';

/**
 * Base interface for sandbox providers
 */
export interface SandboxProvider {
  /**
   * Type of sandbox this provider manages
   */
  readonly type: SandboxType;

  /**
   * Initialize the sandbox environment
   */
  initialize(config: SandboxConfig): Promise<string>;

  /**
   * Execute code/command in the sandbox
   */
  execute(
    sandboxId: string,
    executable: () => Promise<unknown>,
    params: Record<string, unknown>
  ): Promise<SandboxExecutionResult>;

  /**
   * Destroy the sandbox environment
   */
  destroy(sandboxId: string): Promise<void>;

  /**
   * Check if sandbox exists
   */
  exists(sandboxId: string): Promise<boolean>;

  /**
   * Get resource usage for sandbox
   */
  getResourceUsage(sandboxId: string): Promise<Record<string, number>>;
}

/**
 * Mock sandbox provider for testing
 */
export class MockSandboxProvider implements SandboxProvider {
  readonly type = SandboxType.MOCK;
  private sandboxes = new Map<string, SandboxConfig>();
  private resourceUsage = new Map<string, Record<string, number>>();

  async initialize(config: SandboxConfig): Promise<string> {
    const sandboxId = `mock-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.sandboxes.set(sandboxId, config);
    this.resourceUsage.set(sandboxId, {
      cpu: 0,
      memory: 0,
      disk: 0,
      network: 0,
    });
    return sandboxId;
  }

  async execute(
    sandboxId: string,
    executable: () => Promise<unknown>,
    params: Record<string, unknown>
  ): Promise<SandboxExecutionResult> {
    if (!this.sandboxes.has(sandboxId)) {
      return {
        success: false,
        error: `Sandbox ${sandboxId} not found`,
      };
    }

    const startTime = Date.now();
    const config = this.sandboxes.get(sandboxId)!;
    const permissionChecker = new PermissionChecker(config.permissions);

    try {
      // Simulate resource usage
      const usage = this.resourceUsage.get(sandboxId)!;
      usage.cpu += Math.random() * 0.5;
      usage.memory += Math.random() * 1024 * 1024; // Random MB
      
      // Check resource limits before execution
      const cpuCheck = permissionChecker.checkResourceLimit('cpu', usage.cpu);
      if (!cpuCheck.granted) {
        return {
          success: false,
          error: cpuCheck.reason,
          metadata: {
            sandboxId,
            resourceLimitExceeded: true,
          },
        };
      }

      const memoryCheck = permissionChecker.checkResourceLimit('memory', usage.memory);
      if (!memoryCheck.granted) {
        return {
          success: false,
          error: memoryCheck.reason,
          metadata: {
            sandboxId,
            resourceLimitExceeded: true,
          },
        };
      }

      // Execute the function
      const data = await executable();
      const executionTime = Date.now() - startTime;

      // Check execution time limit
      const timeCheck = permissionChecker.checkResourceLimit('execution_time', executionTime);
      if (!timeCheck.granted) {
        return {
          success: false,
          error: timeCheck.reason,
          data,
          metadata: {
            sandboxId,
            executionTime,
            resourceLimitExceeded: true,
            resourceUsage: usage,
          },
        };
      }

      return {
        success: true,
        data,
        metadata: {
          sandboxId,
          executionTime,
          resourceUsage: usage,
        },
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          sandboxId,
          executionTime,
          resourceUsage: this.resourceUsage.get(sandboxId),
        },
      };
    }
  }

  async destroy(sandboxId: string): Promise<void> {
    this.sandboxes.delete(sandboxId);
    this.resourceUsage.delete(sandboxId);
  }

  async exists(sandboxId: string): Promise<boolean> {
    return this.sandboxes.has(sandboxId);
  }

  async getResourceUsage(sandboxId: string): Promise<Record<string, number>> {
    return this.resourceUsage.get(sandboxId) || {};
  }
}

/**
 * Container-based sandbox provider (Docker-compatible interface)
 */
export class ContainerSandboxProvider implements SandboxProvider {
  readonly type = SandboxType.CONTAINER;

  async initialize(config: SandboxConfig): Promise<string> {
    // This is a placeholder - in production, would use Docker API
    // to create and start a container with the specified config
    throw new Error(
      'Container sandbox provider requires Docker/Podman integration. ' +
      'Use MockSandboxProvider for testing or implement Docker API integration.'
    );
  }

  async execute(
    sandboxId: string,
    executable: () => Promise<unknown>,
    params: Record<string, unknown>
  ): Promise<SandboxExecutionResult> {
    throw new Error('Container sandbox not implemented');
  }

  async destroy(sandboxId: string): Promise<void> {
    throw new Error('Container sandbox not implemented');
  }

  async exists(sandboxId: string): Promise<boolean> {
    throw new Error('Container sandbox not implemented');
  }

  async getResourceUsage(sandboxId: string): Promise<Record<string, number>> {
    throw new Error('Container sandbox not implemented');
  }
}

/**
 * VM-based sandbox provider
 */
export class VMSandboxProvider implements SandboxProvider {
  readonly type = SandboxType.VM;

  async initialize(config: SandboxConfig): Promise<string> {
    // This is a placeholder - in production, would use VM orchestration API
    throw new Error(
      'VM sandbox provider requires virtualization integration. ' +
      'Use MockSandboxProvider for testing or implement VM orchestration.'
    );
  }

  async execute(
    sandboxId: string,
    executable: () => Promise<unknown>,
    params: Record<string, unknown>
  ): Promise<SandboxExecutionResult> {
    throw new Error('VM sandbox not implemented');
  }

  async destroy(sandboxId: string): Promise<void> {
    throw new Error('VM sandbox not implemented');
  }

  async exists(sandboxId: string): Promise<boolean> {
    throw new Error('VM sandbox not implemented');
  }

  async getResourceUsage(sandboxId: string): Promise<Record<string, number>> {
    throw new Error('VM sandbox not implemented');
  }
}

/**
 * Sandbox executor - manages sandbox lifecycle and execution
 */
export class SandboxExecutor {
  private providers = new Map<SandboxType, SandboxProvider>();
  private auditLogger?: SandboxAuditLogger;
  private activeSandboxes = new Map<string, { config: SandboxConfig; provider: SandboxProvider }>();

  constructor(auditLogger?: SandboxAuditLogger) {
    this.auditLogger = auditLogger;
    
    // Register default providers
    this.registerProvider(new MockSandboxProvider());
    this.registerProvider(new ContainerSandboxProvider());
    this.registerProvider(new VMSandboxProvider());
    this.registerProvider(new SimulationSandboxProvider());
  }

  /**
   * Register a sandbox provider
   */
  registerProvider(provider: SandboxProvider): void {
    this.providers.set(provider.type, provider);
  }

  /**
   * Create and initialize a sandbox
   */
  async createSandbox(
    config: SandboxConfig,
    workflowId: string,
    taskId: string,
    principalId?: string
  ): Promise<string> {
    const provider = this.providers.get(config.type);
    if (!provider) {
      throw new Error(`No provider registered for sandbox type: ${config.type}`);
    }

    // Initialize the sandbox
    const sandboxId = await provider.initialize(config);

    // Track active sandbox
    this.activeSandboxes.set(sandboxId, { config, provider });

    // Audit log
    if (this.auditLogger) {
      this.auditLogger.logSandboxCreated(
        workflowId,
        taskId,
        sandboxId,
        config,
        principalId
      );
    }

    return sandboxId;
  }

  /**
   * Execute a function in the sandbox
   */
  async executeInSandbox(
    sandboxId: string,
    executable: () => Promise<unknown>,
    params: Record<string, unknown>,
    workflowId: string,
    taskId: string,
    toolId: string,
    principalId?: string
  ): Promise<SandboxExecutionResult> {
    const sandbox = this.activeSandboxes.get(sandboxId);
    if (!sandbox) {
      return {
        success: false,
        error: `Sandbox ${sandboxId} not found`,
      };
    }

    // Audit log - execution start
    if (this.auditLogger) {
      this.auditLogger.logToolExecutionStart(
        workflowId,
        taskId,
        toolId,
        sandboxId,
        params,
        principalId
      );
    }

    // Execute in sandbox
    const result = await sandbox.provider.execute(sandboxId, executable, params);

    // Audit log - execution end
    if (this.auditLogger) {
      this.auditLogger.logToolExecutionEnd(
        workflowId,
        taskId,
        toolId,
        sandboxId,
        result,
        principalId
      );
    }

    return result;
  }

  /**
   * Destroy a sandbox
   */
  async destroySandbox(
    sandboxId: string,
    workflowId: string,
    taskId: string,
    reason: string = 'normal_termination'
  ): Promise<void> {
    const sandbox = this.activeSandboxes.get(sandboxId);
    if (!sandbox) {
      return; // Already destroyed or doesn't exist
    }

    // Get final resource usage
    const resourceUsage = await sandbox.provider.getResourceUsage(sandboxId);

    // Destroy the sandbox
    await sandbox.provider.destroy(sandboxId);

    // Remove from tracking
    this.activeSandboxes.delete(sandboxId);

    // Audit log
    if (this.auditLogger) {
      this.auditLogger.logSandboxDestroyed(
        workflowId,
        taskId,
        sandboxId,
        reason,
        resourceUsage
      );
    }
  }

  /**
   * Check if sandbox exists
   */
  async sandboxExists(sandboxId: string): Promise<boolean> {
    const sandbox = this.activeSandboxes.get(sandboxId);
    if (!sandbox) {
      return false;
    }
    return await sandbox.provider.exists(sandboxId);
  }

  /**
   * Get resource usage for a sandbox
   */
  async getResourceUsage(sandboxId: string): Promise<Record<string, number>> {
    const sandbox = this.activeSandboxes.get(sandboxId);
    if (!sandbox) {
      return {};
    }
    return await sandbox.provider.getResourceUsage(sandboxId);
  }

  /**
   * Get sandbox configuration
   */
  getSandboxConfig(sandboxId: string): SandboxConfig | undefined {
    return this.activeSandboxes.get(sandboxId)?.config;
  }

  /**
   * List all active sandboxes
   */
  listActiveSandboxes(): string[] {
    return Array.from(this.activeSandboxes.keys());
  }

  /**
   * Cleanup all sandboxes (for shutdown)
   */
  async cleanup(workflowId: string, taskId: string): Promise<void> {
    const sandboxIds = this.listActiveSandboxes();
    await Promise.all(
      sandboxIds.map(id => this.destroySandbox(id, workflowId, taskId, 'cleanup'))
    );
  }

  /**
   * Get the provider for a specific sandbox type
   */
  getProvider(type: SandboxType): SandboxProvider | undefined {
    return this.providers.get(type);
  }

  /**
   * Get captured side effects for a simulation sandbox
   */
  getSimulationSideEffects(sandboxId: string): unknown[] {
    const sandbox = this.activeSandboxes.get(sandboxId);
    if (sandbox && sandbox.provider instanceof SimulationSandboxProvider) {
      return sandbox.provider.getSideEffects(sandboxId);
    }
    return [];
  }
}
