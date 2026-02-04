/**
 * Sandbox integration for kernel orchestrator
 * Wires sandbox execution into the kernel before tool invocation
 * Logs all sandbox results to HipCortex for auditability
 */

import { TaskSpec, TaskState } from './types';
import { MemoryAPI } from '@aureus/memory-hipcortex';
import { CRVGate, Commit } from '@aureus/crv';
import { 
  SandboxExecutor, 
  SandboxConfig, 
  SandboxType,
  SandboxAuditLogger,
  SandboxConfigFactory,
  SimulationSandboxProvider,
  CapturedSideEffect
} from '@aureus/tools';
import { TelemetryCollector } from '@aureus/observability';

/**
 * Sandbox execution context for kernel
 */
export interface SandboxExecutionContext {
  workflowId: string;
  taskId: string;
  principalId?: string;
  telemetry?: TelemetryCollector;
  memoryAPI?: MemoryAPI;
  crvGate?: CRVGate;
}

/**
 * Sandbox execution result with metadata
 */
export interface SandboxExecutionOutput {
  success: boolean;
  data?: unknown;
  error?: string;
  metadata: {
    sandboxId: string;
    executionTime: number;
    simulationMode: boolean;
    sideEffects?: CapturedSideEffect[];
    crvValidation?: {
      passed: boolean;
      blockedCommit: boolean;
      validationResults: unknown[];
    };
    hipCortexEntryId?: string;
  };
}

/**
 * Sandbox integration manager for kernel
 */
export class SandboxIntegration {
  private sandboxExecutor: SandboxExecutor;
  private auditLogger: SandboxAuditLogger;

  constructor(
    telemetry?: TelemetryCollector
  ) {
    this.auditLogger = new SandboxAuditLogger(telemetry);
    this.sandboxExecutor = new SandboxExecutor(this.auditLogger);
  }

  /**
   * Execute a task in a sandbox environment
   * Logs results to HipCortex and runs CRV validation on simulated outputs
   */
  async executeInSandbox(
    task: TaskSpec,
    taskState: TaskState,
    executor: (task: TaskSpec, state: TaskState) => Promise<unknown>,
    context: SandboxExecutionContext
  ): Promise<SandboxExecutionOutput> {
    // Check if sandbox is enabled for this task
    if (!task.sandboxConfig || !task.sandboxConfig.enabled) {
      // Execute normally without sandbox
      try {
        const result = await executor(task, taskState);
        return {
          success: true,
          data: result,
          metadata: {
            sandboxId: 'none',
            executionTime: 0,
            simulationMode: false,
          },
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          metadata: {
            sandboxId: 'none',
            executionTime: 0,
            simulationMode: false,
          },
        };
      }
    }

    // Create sandbox configuration
    const sandboxConfig = this.createSandboxConfig(task);
    
    // Create sandbox
    const sandboxId = await this.sandboxExecutor.createSandbox(
      sandboxConfig,
      context.workflowId,
      task.id,
      context.principalId
    );

    const startTime = Date.now();
    let sideEffects: CapturedSideEffect[] | undefined;
    let crvValidation: SandboxExecutionOutput['metadata']['crvValidation'] | undefined;

    try {
      // Execute in sandbox
      const result = await this.sandboxExecutor.executeInSandbox(
        sandboxId,
        async () => {
          return await executor(task, taskState);
        },
        task.inputs || {},
        context.workflowId,
        task.id,
        task.toolName || 'unknown',
        context.principalId
      );

      const executionTime = Date.now() - startTime;

      // Get side effects if in simulation mode
      if (sandboxConfig.type === SandboxType.SIMULATION) {
        sideEffects = this.sandboxExecutor.getSimulationSideEffects(sandboxId) as CapturedSideEffect[];
      }

      // Run CRV validation on the output if CRV gate is available
      if (context.crvGate && result.success && result.data) {
        const commit: Commit = {
          id: `${context.workflowId}-${task.id}-sandbox-output`,
          data: result.data,
          previousState: taskState.result,
          metadata: {
            workflowId: context.workflowId,
            taskId: task.id,
            sandboxId,
            simulationMode: sandboxConfig.type === SandboxType.SIMULATION,
            sideEffects,
          },
        };

        const gateResult = await context.crvGate.validate(commit);
        crvValidation = {
          passed: gateResult.passed,
          blockedCommit: gateResult.blockedCommit || false,
          validationResults: gateResult.validationResults,
        };

        // Record CRV validation in telemetry
        if (context.telemetry) {
          context.telemetry.recordCRVResult(
            context.workflowId,
            task.id,
            gateResult.gateName,
            gateResult.passed,
            gateResult.blockedCommit || false,
            gateResult.failure_code
          );
        }

        // If CRV blocked the commit, return error
        if (gateResult.blockedCommit) {
          const error = `CRV validation failed: ${gateResult.validationResults
            .filter((r: any) => !r.valid)
            .map((r: any) => r.reason)
            .join(', ')}`;

          // Log to HipCortex
          const hipCortexEntryId = await this.logToHipCortex(
            context,
            task,
            sandboxId,
            {
              success: false,
              error,
              executionTime,
              simulationMode: sandboxConfig.type === SandboxType.SIMULATION,
              sideEffects,
              crvValidation,
            }
          );

          return {
            success: false,
            error,
            metadata: {
              sandboxId,
              executionTime,
              simulationMode: sandboxConfig.type === SandboxType.SIMULATION,
              sideEffects,
              crvValidation,
              hipCortexEntryId,
            },
          };
        }
      }

      // Log successful execution to HipCortex
      const hipCortexEntryId = await this.logToHipCortex(
        context,
        task,
        sandboxId,
        {
          success: result.success,
          data: result.data,
          error: result.error,
          executionTime,
          simulationMode: sandboxConfig.type === SandboxType.SIMULATION,
          sideEffects,
          crvValidation,
        }
      );

      return {
        success: result.success,
        data: result.data,
        error: result.error,
        metadata: {
          sandboxId,
          executionTime,
          simulationMode: sandboxConfig.type === SandboxType.SIMULATION,
          sideEffects,
          crvValidation,
          hipCortexEntryId,
        },
      };
    } finally {
      // Cleanup sandbox if not persistent
      if (!sandboxConfig.persistent) {
        await this.sandboxExecutor.destroySandbox(
          sandboxId,
          context.workflowId,
          task.id,
          'execution_complete'
        );
      }
    }
  }

  /**
   * Create sandbox configuration from task spec
   */
  private createSandboxConfig(task: TaskSpec): SandboxConfig {
    const HIGH_RISK_TIERS = ['HIGH', 'CRITICAL'];
    
    const sandboxType = task.sandboxConfig?.simulationMode 
      ? SandboxType.SIMULATION 
      : (task.sandboxConfig?.type as SandboxType) || SandboxType.MOCK;

    // Use config factory to create base config
    const baseConfig = task.riskTier && HIGH_RISK_TIERS.includes(task.riskTier)
      ? SandboxConfigFactory.createRestrictive(`sandbox-${task.id}`)
      : SandboxConfigFactory.createStandard(`sandbox-${task.id}`);

    // Override with task-specific config
    return {
      ...baseConfig,
      id: `sandbox-${task.id}`,
      type: sandboxType,
      permissions: {
        ...baseConfig.permissions,
        ...(task.sandboxConfig?.permissions || {}),
      },
    };
  }

  /**
   * Log sandbox execution results to HipCortex for auditability
   */
  private async logToHipCortex(
    context: SandboxExecutionContext,
    task: TaskSpec,
    sandboxId: string,
    result: {
      success: boolean;
      data?: unknown;
      error?: string;
      executionTime: number;
      simulationMode: boolean;
      sideEffects?: CapturedSideEffect[];
      crvValidation?: SandboxExecutionOutput['metadata']['crvValidation'];
    }
  ): Promise<string | undefined> {
    if (!context.memoryAPI) {
      return undefined;
    }

    try {
      // Create memory entry for sandbox execution
      const entry = context.memoryAPI.write(
        {
          event: 'sandbox_tool_execution',
          taskId: task.id,
          taskName: task.name,
          toolName: task.toolName,
          sandboxId,
          result: {
            success: result.success,
            error: result.error,
            executionTime: result.executionTime,
            simulationMode: result.simulationMode,
            sideEffectCount: result.sideEffects?.length || 0,
            crvPassed: result.crvValidation?.passed,
            crvBlocked: result.crvValidation?.blockedCommit,
          },
          sideEffects: result.sideEffects,
          timestamp: new Date(),
        },
        {
          task_id: context.taskId,
          step_id: sandboxId,
          timestamp: new Date(),
          source_event_id: `sandbox-${sandboxId}`,
        },
        {
          type: 'episodic_note',
          tags: [
            'sandbox_execution',
            'tool_invocation',
            result.simulationMode ? 'simulation_mode' : 'live_execution',
            result.success ? 'success' : 'failure',
            ...(result.crvValidation ? ['crv_validated'] : []),
          ],
          metadata: {
            workflowId: context.workflowId,
            taskId: task.id,
            sandboxId,
            riskTier: task.riskTier,
          },
        }
      );

      return entry.id;
    } catch (error) {
      // Log error through telemetry if available
      if (context.telemetry) {
        context.telemetry.recordEvent({
          type: 'error' as any,
          timestamp: new Date(),
          workflowId: context.workflowId,
          taskId: context.taskId,
          data: {
            error: error instanceof Error ? error.message : String(error),
            context: 'hipcortex_logging_failed',
          },
        });
      }
      // Fallback to console for visibility
      console.error('Failed to log sandbox execution to HipCortex:', error);
      return undefined;
    }
  }

  /**
   * Get sandbox executor instance
   */
  getSandboxExecutor(): SandboxExecutor {
    return this.sandboxExecutor;
  }

  /**
   * Get audit logger instance
   */
  getAuditLogger(): SandboxAuditLogger {
    return this.auditLogger;
  }
}
