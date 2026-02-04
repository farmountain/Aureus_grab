/**
 * Workflow integration for robotics safety
 * 
 * Integrates safety envelopes with the Aureus workflow orchestrator,
 * allowing safety systems to override workflow execution when physical
 * limits are exceeded.
 */

import { SafetyEnvelope } from './safety-envelope';
import { EmergencyStopTrigger } from './emergency-stop';
import { WatchdogManager } from './watchdog';
import { RobotState } from './types';

/**
 * Safety gate for workflow execution
 * 
 * This gate checks robot state against safety envelopes before
 * allowing workflow steps to execute.
 */
export class SafetyGate {
  private readonly safetyEnvelope: SafetyEnvelope;
  private readonly emergencyStop: EmergencyStopTrigger;

  constructor(safetyEnvelope: SafetyEnvelope, emergencyStop: EmergencyStopTrigger) {
    this.safetyEnvelope = safetyEnvelope;
    this.emergencyStop = emergencyStop;
  }

  /**
   * Check if workflow execution is safe
   */
  async canExecute(robotState: RobotState): Promise<{
    allowed: boolean;
    reason?: string;
    violations?: Array<{ type: string; severity: string; message: string }>;
  }> {
    // Check if in emergency stop state
    if (this.emergencyStop.isInEmergencyStop()) {
      return {
        allowed: false,
        reason: 'System is in emergency stop state',
      };
    }

    // Check safety envelope
    const { safe, violations } = await this.safetyEnvelope.checkState(robotState);

    if (!safe) {
      return {
        allowed: false,
        reason: 'Safety envelope violation detected',
        violations: violations.map(v => ({
          type: v.type,
          severity: v.severity,
          message: v.message,
        })),
      };
    }

    // Check for warnings
    const warnings = violations.filter(v => v.severity === 'warning');
    if (warnings.length > 0) {
      return {
        allowed: true,
        reason: 'Execution allowed with warnings',
        violations: warnings.map(v => ({
          type: v.type,
          severity: v.severity,
          message: v.message,
        })),
      };
    }

    return { allowed: true };
  }
}

/**
 * Workflow override controller
 * 
 * Provides mechanisms to override or interrupt workflow execution
 * in response to safety events.
 */
export class WorkflowOverrideController {
  private readonly safetyGate: SafetyGate;
  private readonly watchdogManager: WatchdogManager;
  private readonly emergencyStop: EmergencyStopTrigger;
  private overrideCallbacks: Array<(reason: string) => Promise<void>> = [];

  constructor(
    safetyGate: SafetyGate,
    watchdogManager: WatchdogManager,
    emergencyStop: EmergencyStopTrigger
  ) {
    this.safetyGate = safetyGate;
    this.watchdogManager = watchdogManager;
    this.emergencyStop = emergencyStop;

    // Register emergency stop handler to trigger overrides
    this.emergencyStop.registerHandler(async (event) => {
      await this.triggerOverride(`Emergency stop: ${event.reason} - ${event.message}`);
    });
  }

  /**
   * Register a callback to be invoked when workflow should be overridden
   */
  registerOverrideCallback(callback: (reason: string) => Promise<void>): void {
    this.overrideCallbacks.push(callback);
    console.log('Registered workflow override callback');
  }

  /**
   * Remove an override callback
   */
  removeOverrideCallback(callback: (reason: string) => Promise<void>): void {
    const index = this.overrideCallbacks.indexOf(callback);
    if (index !== -1) {
      this.overrideCallbacks.splice(index, 1);
      console.log('Removed workflow override callback');
    }
  }

  /**
   * Trigger workflow override
   */
  async triggerOverride(reason: string): Promise<void> {
    console.warn(`WORKFLOW OVERRIDE TRIGGERED: ${reason}`);

    const callbackPromises = this.overrideCallbacks.map(async (callback) => {
      try {
        await callback(reason);
      } catch (error) {
        console.error('Error in workflow override callback:', error);
      }
    });

    await Promise.all(callbackPromises);
  }

  /**
   * Check if workflow execution should be allowed
   */
  async shouldAllowExecution(robotState: RobotState): Promise<{
    allowed: boolean;
    reason?: string;
  }> {
    const gateResult = await this.safetyGate.canExecute(robotState);
    
    if (!gateResult.allowed) {
      // Trigger override if not allowed
      await this.triggerOverride(gateResult.reason || 'Safety check failed');
    }

    return {
      allowed: gateResult.allowed,
      reason: gateResult.reason,
    };
  }

  /**
   * Get safety gate
   */
  getSafetyGate(): SafetyGate {
    return this.safetyGate;
  }

  /**
   * Get watchdog manager
   */
  getWatchdogManager(): WatchdogManager {
    return this.watchdogManager;
  }

  /**
   * Get emergency stop trigger
   */
  getEmergencyStop(): EmergencyStopTrigger {
    return this.emergencyStop;
  }
}

/**
 * Robot workflow executor
 * 
 * Executes robot workflows with integrated safety checks and
 * override capabilities.
 */
export class RobotWorkflowExecutor {
  private readonly overrideController: WorkflowOverrideController;

  constructor(overrideController: WorkflowOverrideController) {
    this.overrideController = overrideController;
  }

  /**
   * Execute a workflow step with safety checks
   */
  async executeStep(
    stepName: string,
    stepFn: () => Promise<void>,
    robotState: RobotState
  ): Promise<{
    success: boolean;
    error?: string;
    overridden?: boolean;
  }> {
    console.log(`Executing workflow step: ${stepName}`);

    // Check if execution is allowed
    const { allowed, reason } = await this.overrideController.shouldAllowExecution(robotState);

    if (!allowed) {
      console.error(`Workflow step ${stepName} blocked: ${reason}`);
      return {
        success: false,
        error: reason,
        overridden: true,
      };
    }

    // Execute the step
    try {
      await stepFn();
      console.log(`Workflow step ${stepName} completed successfully`);
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Workflow step ${stepName} failed:`, errorMessage);
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Execute a workflow with multiple steps
   */
  async executeWorkflow(
    workflowName: string,
    steps: Array<{
      name: string;
      fn: () => Promise<void>;
      getRobotState: () => Promise<RobotState>;
    }>
  ): Promise<{
    success: boolean;
    completedSteps: number;
    totalSteps: number;
    errors?: string[];
  }> {
    console.log(`Executing workflow: ${workflowName} (${steps.length} steps)`);

    const errors: string[] = [];
    let completedSteps = 0;

    for (const step of steps) {
      // Get current robot state
      const robotState = await step.getRobotState();

      // Execute step
      const result = await this.executeStep(step.name, step.fn, robotState);

      if (!result.success) {
        errors.push(`Step ${step.name}: ${result.error || 'Unknown error'}`);
        
        // Note: Workflow continues on regular errors to allow partial completion,
        // but halts immediately on safety overrides to prevent unsafe operations.
        // This allows non-critical failures to be handled while ensuring safety.
        if (result.overridden) {
          console.error(`Workflow ${workflowName} overridden at step ${step.name}`);
          break;
        }
      } else {
        completedSteps++;
      }
    }

    const success = completedSteps === steps.length && errors.length === 0;
    console.log(`Workflow ${workflowName} completed: ${completedSteps}/${steps.length} steps, ${errors.length} errors`);

    return {
      success,
      completedSteps,
      totalSteps: steps.length,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Get override controller
   */
  getOverrideController(): WorkflowOverrideController {
    return this.overrideController;
  }
}
