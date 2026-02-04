/**
 * Sandboxed tool wrapper - executes tools in constrained environments
 * Integrates sandbox execution with policy enforcement and audit logging
 */

import { IntegratedToolWrapper, IntegratedToolContext } from '../integrated-wrapper';
import { ToolSpec, ToolResult } from '../index';
import { Principal } from '@aureus/policy';
import {
  SandboxConfig,
  SandboxType,
  SandboxPermissions,
  PermissionCheckResult,
  EscalationRequest,
} from './types';
import { SandboxExecutor } from './sandbox-executor';
import { PermissionChecker } from './permission-checker';
import { SandboxAuditLogger } from './audit-logger';
import { EscalationManager } from './escalation-manager';

/**
 * Extended context for sandboxed tool execution
 */
export interface SandboxedToolContext extends IntegratedToolContext {
  /**
   * Sandbox configuration to use
   */
  sandboxConfig?: SandboxConfig;
  
  /**
   * Sandbox executor instance
   */
  sandboxExecutor?: SandboxExecutor;
  
  /**
   * Escalation manager for permission escalation
   */
  escalationManager?: EscalationManager;
  
  /**
   * Principal (user/agent) executing the tool
   */
  principal?: Principal;
  
  /**
   * Sandbox audit logger
   */
  sandboxAuditLogger?: SandboxAuditLogger;
}

/**
 * Sandboxed tool wrapper - executes tools in isolated environments
 */
export class SandboxedToolWrapper {
  private integratedWrapper: IntegratedToolWrapper;
  private tool: ToolSpec;
  private defaultSandboxConfig?: SandboxConfig;

  constructor(
    tool: ToolSpec,
    defaultSandboxConfig?: SandboxConfig,
    timeoutMs?: number
  ) {
    this.tool = tool;
    this.integratedWrapper = new IntegratedToolWrapper(tool, timeoutMs);
    this.defaultSandboxConfig = defaultSandboxConfig;
  }

  /**
   * Execute tool in sandbox with full safety checks
   */
  async execute(
    params: Record<string, unknown>,
    context?: SandboxedToolContext
  ): Promise<ToolResult> {
    // Use provided sandbox config or default
    const sandboxConfig = context?.sandboxConfig || this.defaultSandboxConfig;
    
    if (!sandboxConfig) {
      // No sandbox configured - fall back to integrated wrapper
      return this.integratedWrapper.execute(params, context);
    }

    // Validate required dependencies
    if (!context?.sandboxExecutor) {
      return {
        success: false,
        error: 'Sandbox executor not provided in context',
      };
    }

    const executor = context.sandboxExecutor;
    const auditLogger = context.sandboxAuditLogger;
    const escalationManager = context.escalationManager;
    const permissionChecker = new PermissionChecker(sandboxConfig.permissions);

    // Create sandbox
    let sandboxId: string;
    try {
      sandboxId = await executor.createSandbox(
        sandboxConfig,
        context.workflowId,
        context.taskId,
        context.principal?.id
      );
    } catch (error) {
      return {
        success: false,
        error: `Failed to create sandbox: ${error instanceof Error ? error.message : String(error)}`,
      };
    }

    try {
      // Pre-execution permission checks
      const permissionCheckResult = await this.performPermissionChecks(
        params,
        permissionChecker,
        auditLogger,
        sandboxId,
        context
      );

      if (!permissionCheckResult.granted) {
        // Check if escalation is possible
        if (permissionCheckResult.canEscalate && escalationManager && context.principal) {
          const escalationResult = await this.attemptEscalation(
            permissionCheckResult,
            params,
            sandboxConfig,
            escalationManager,
            context
          );

          if (!escalationResult.approved) {
            return {
              success: false,
              error: `Permission denied: ${permissionCheckResult.reason}. Escalation ${escalationResult.reason}`,
              metadata: {
                sandboxId,
                permissionDenied: true,
                escalationDenied: true,
              },
            };
          }

          // Apply escalation to sandbox config
          const updatedConfig = { ...sandboxConfig };
          // The escalation has been applied through the manager
          // Update permission checker with new permissions
          // Note: In a real implementation, would recreate sandbox with new permissions
        } else {
          return {
            success: false,
            error: `Permission denied: ${permissionCheckResult.reason}`,
            metadata: {
              sandboxId,
              permissionDenied: true,
              canEscalate: permissionCheckResult.canEscalate,
            },
          };
        }
      }

      // Execute in sandbox
      const result = await executor.executeInSandbox(
        sandboxId,
        async () => {
          // Execute through integrated wrapper for policy + CRV checks
          return this.integratedWrapper.execute(params, context);
        },
        params,
        context.workflowId,
        context.taskId,
        this.tool.id,
        context.principal?.id
      );

      // Extract the actual tool result from sandbox execution
      if (result.success && result.data) {
        const toolResult = result.data as ToolResult;
        
        // Merge sandbox metadata with tool result metadata
        return {
          ...toolResult,
          metadata: {
            ...toolResult.metadata,
            sandboxId,
            sandboxExecution: true,
            sandboxMetadata: result.metadata,
          },
        };
      }

      return {
        success: result.success,
        error: result.error,
        data: result.data,
        metadata: {
          sandboxId,
          sandboxExecution: true,
          sandboxMetadata: result.metadata,
        },
      };
    } finally {
      // Cleanup sandbox if not persistent
      if (!sandboxConfig.persistent) {
        await executor.destroySandbox(
          sandboxId,
          context.workflowId,
          context.taskId,
          'execution_complete'
        );
      }
    }
  }

  /**
   * Perform pre-execution permission checks
   */
  private async performPermissionChecks(
    params: Record<string, unknown>,
    permissionChecker: PermissionChecker,
    auditLogger: SandboxAuditLogger | undefined,
    sandboxId: string,
    context: SandboxedToolContext
  ): Promise<PermissionCheckResult> {
    // Extract permission-relevant parameters
    // This is tool-specific; different tools need different checks
    
    // Check filesystem permissions if path parameter exists
    if (params.path && typeof params.path === 'string') {
      const access = this.inferFileAccess(params);
      const check = access === 'write'
        ? permissionChecker.checkFilesystemWrite(params.path)
        : permissionChecker.checkFilesystemRead(params.path);

      if (auditLogger) {
        auditLogger.logPermissionCheck(
          context.workflowId,
          context.taskId,
          this.tool.id,
          sandboxId,
          'filesystem',
          { path: params.path, access },
          check,
          context.principal?.id
        );
      }

      if (!check.granted) {
        return check;
      }
    }

    // Check network permissions if URL/domain parameter exists
    if (params.url && typeof params.url === 'string') {
      const domain = this.extractDomain(params.url);
      const port = this.extractPort(params.url);
      
      const check = permissionChecker.checkNetworkAccess(domain, undefined, port);

      if (auditLogger) {
        auditLogger.logPermissionCheck(
          context.workflowId,
          context.taskId,
          this.tool.id,
          sandboxId,
          'network',
          { url: params.url, domain, port },
          check,
          context.principal?.id
        );
      }

      if (!check.granted) {
        return check;
      }
    }

    // All checks passed
    return { granted: true };
  }

  /**
   * Attempt permission escalation
   */
  private async attemptEscalation(
    permissionCheck: PermissionCheckResult,
    params: Record<string, unknown>,
    sandboxConfig: SandboxConfig,
    escalationManager: EscalationManager,
    context: SandboxedToolContext
  ): Promise<{ approved: boolean; reason?: string }> {
    if (!context.principal) {
      return { approved: false, reason: 'No principal provided for escalation' };
    }

    // Determine escalation type and details based on failed permission check
    let permissionType: EscalationRequest['permissionType'];
    let details: Record<string, unknown>;

    if (params.path) {
      permissionType = 'filesystem';
      details = {
        path: params.path,
        access: this.inferFileAccess(params),
      };
    } else if (params.url) {
      permissionType = 'network';
      details = {
        url: params.url,
        domain: this.extractDomain(params.url as string),
      };
    } else {
      return { approved: false, reason: 'Unknown permission type for escalation' };
    }

    const response = await escalationManager.requestEscalation(
      permissionType,
      details,
      permissionCheck.reason || 'Permission required for tool execution',
      this.tool.id,
      context.workflowId,
      context.taskId,
      context.principal
    );

    return {
      approved: response.approved,
      reason: response.reason,
    };
  }

  /**
   * Infer file access type from parameters
   */
  private inferFileAccess(params: Record<string, unknown>): 'read' | 'write' {
    // Check for write indicators
    if (params.content || params.data || params.write) {
      return 'write';
    }
    
    // Check tool name/description
    const toolName = this.tool.name.toLowerCase();
    if (toolName.includes('write') || toolName.includes('create') || toolName.includes('update')) {
      return 'write';
    }
    
    return 'read';
  }

  /**
   * Extract domain from URL
   */
  private extractDomain(url: string): string {
    try {
      const parsed = new URL(url);
      return parsed.hostname;
    } catch {
      return url; // Fallback if not a valid URL
    }
  }

  /**
   * Extract port from URL
   */
  private extractPort(url: string): number | undefined {
    try {
      const parsed = new URL(url);
      if (parsed.port) {
        return parseInt(parsed.port, 10);
      }
      // Default ports
      if (parsed.protocol === 'https:') return 443;
      if (parsed.protocol === 'http:') return 80;
    } catch {
      // Ignore parse errors
    }
    return undefined;
  }

  /**
   * Get the underlying tool specification
   */
  getToolSpec(): ToolSpec {
    return this.tool;
  }

  /**
   * Get the tool ID
   */
  getToolId(): string {
    return this.tool.id;
  }
}

/**
 * Helper to create default sandbox configurations
 */
export class SandboxConfigFactory {
  /**
   * Create a restrictive sandbox config (minimal permissions)
   */
  static createRestrictive(id: string): SandboxConfig {
    return {
      id,
      type: SandboxType.MOCK,
      permissions: {
        filesystem: {
          readOnlyPaths: ['/tmp'],
          readWritePaths: [],
          deniedPaths: ['/etc', '/sys', '/proc'],
          maxDiskUsage: 100 * 1024 * 1024, // 100 MB
          maxFileCount: 100,
        },
        network: {
          enabled: false,
        },
        resources: {
          maxCpu: 1,
          maxMemory: 256 * 1024 * 1024, // 256 MB
          maxExecutionTime: 30000, // 30 seconds
          maxProcesses: 10,
        },
        capabilities: [],
        allowedEnvVars: ['PATH', 'HOME'],
      },
    };
  }

  /**
   * Create a standard sandbox config (moderate permissions)
   */
  static createStandard(id: string): SandboxConfig {
    return {
      id,
      type: SandboxType.MOCK,
      permissions: {
        filesystem: {
          readOnlyPaths: ['/tmp', '/var/tmp'],
          readWritePaths: ['/tmp/sandbox'],
          deniedPaths: ['/etc', '/sys', '/proc'],
          maxDiskUsage: 500 * 1024 * 1024, // 500 MB
          maxFileCount: 500,
        },
        network: {
          enabled: true,
          allowedDomains: ['*.example.com'],
          allowedPorts: [80, 443],
          deniedDomains: [],
          maxBandwidth: 10 * 1024 * 1024, // 10 MB/s
        },
        resources: {
          maxCpu: 2,
          maxMemory: 512 * 1024 * 1024, // 512 MB
          maxExecutionTime: 60000, // 60 seconds
          maxProcesses: 20,
        },
        capabilities: [],
        allowedEnvVars: ['PATH', 'HOME', 'USER'],
      },
    };
  }

  /**
   * Create a permissive sandbox config (for trusted operations)
   */
  static createPermissive(id: string): SandboxConfig {
    return {
      id,
      type: SandboxType.MOCK,
      permissions: {
        filesystem: {
          readOnlyPaths: ['/*'],
          readWritePaths: ['/tmp', '/var/tmp', '/home'],
          deniedPaths: [],
          maxDiskUsage: 2 * 1024 * 1024 * 1024, // 2 GB
          maxFileCount: 10000,
        },
        network: {
          enabled: true,
          allowedDomains: [],
          allowedPorts: [],
          deniedDomains: [],
        },
        resources: {
          maxCpu: 4,
          maxMemory: 2 * 1024 * 1024 * 1024, // 2 GB
          maxExecutionTime: 300000, // 5 minutes
          maxProcesses: 100,
        },
        capabilities: [],
      },
    };
  }
}
