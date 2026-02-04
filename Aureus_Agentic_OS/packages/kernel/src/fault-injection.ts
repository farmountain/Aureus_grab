import { EventLog, Event } from './types';

/**
 * Types of faults that can be injected
 */
export enum FaultType {
  TOOL_FAILURE = 'tool_failure',
  LATENCY_SPIKE = 'latency_spike',
  PARTIAL_OUTAGE = 'partial_outage',
}

/**
 * Configuration for a specific fault injection rule
 */
export interface FaultInjectionRule {
  /**
   * Type of fault to inject
   */
  type: FaultType;
  
  /**
   * Probability of fault injection (0.0 to 1.0)
   * 0.0 = never inject, 1.0 = always inject
   */
  probability: number;
  
  /**
   * Optional: Specific task IDs to target (if empty, applies to all tasks)
   */
  targetTaskIds?: string[];
  
  /**
   * Optional: Specific tool names to target (if empty, applies to all tools)
   */
  targetTools?: string[];
  
  /**
   * Configuration specific to fault type
   */
  config?: FaultConfig;
}

/**
 * Configuration specific to each fault type
 */
export interface FaultConfig {
  /**
   * For TOOL_FAILURE: Error message to return
   */
  errorMessage?: string;
  
  /**
   * For LATENCY_SPIKE: Delay in milliseconds
   */
  delayMs?: number;
  
  /**
   * For PARTIAL_OUTAGE: Duration in milliseconds
   */
  outageDurationMs?: number;
  
  /**
   * For PARTIAL_OUTAGE: Probability of failure during outage (0.0 to 1.0)
   */
  failureRate?: number;
}

/**
 * Configuration for fault injection at workflow level
 */
export interface FaultInjectionConfig {
  /**
   * Whether fault injection is enabled globally
   */
  enabled: boolean;
  
  /**
   * Workflow IDs for which fault injection is enabled
   * If empty, applies to all workflows when enabled=true
   */
  enabledWorkflows?: string[];
  
  /**
   * Workflow IDs for which fault injection is disabled
   * Takes precedence over enabledWorkflows
   */
  disabledWorkflows?: string[];
  
  /**
   * List of fault injection rules
   */
  rules: FaultInjectionRule[];
}

/**
 * Record of an injected fault for audit logging
 */
export interface InjectedFault {
  /**
   * Unique identifier for this fault injection
   */
  id: string;
  
  /**
   * Type of fault injected
   */
  type: FaultType;
  
  /**
   * Timestamp when fault was injected
   */
  timestamp: Date;
  
  /**
   * Workflow ID where fault was injected
   */
  workflowId: string;
  
  /**
   * Task ID where fault was injected
   */
  taskId: string;
  
  /**
   * Tool name (if applicable)
   */
  toolName?: string;
  
  /**
   * Configuration used for this fault
   */
  config: FaultConfig;
  
  /**
   * Rule that triggered this fault
   */
  ruleIndex: number;
}

/**
 * FaultInjector simulates various types of failures for chaos engineering
 * and resilience testing of workflow execution
 */
export class FaultInjector {
  private config: FaultInjectionConfig;
  private eventLog?: EventLog;
  private outageState: Map<string, { endTime: Date; failureRate: number }> = new Map();

  constructor(config: FaultInjectionConfig, eventLog?: EventLog) {
    this.config = config;
    this.eventLog = eventLog;
  }

  /**
   * Check if fault injection is enabled for a specific workflow
   */
  isEnabledForWorkflow(workflowId: string): boolean {
    if (!this.config.enabled) {
      return false;
    }

    // Check if workflow is explicitly disabled
    if (this.config.disabledWorkflows?.includes(workflowId)) {
      return false;
    }

    // If enabledWorkflows is specified, check if workflow is in the list
    if (this.config.enabledWorkflows && this.config.enabledWorkflows.length > 0) {
      return this.config.enabledWorkflows.includes(workflowId);
    }

    // Otherwise, fault injection is enabled for all workflows
    return true;
  }

  /**
   * Inject faults before task execution
   * Returns a function to execute the actual task with injected faults
   */
  async injectBeforeTask<T>(
    workflowId: string,
    taskId: string,
    toolName: string | undefined,
    taskFn: () => Promise<T>
  ): Promise<T> {
    // Check if fault injection is enabled for this workflow
    if (!this.isEnabledForWorkflow(workflowId)) {
      return taskFn();
    }

    // Check each rule to see if we should inject a fault
    for (let ruleIndex = 0; ruleIndex < this.config.rules.length; ruleIndex++) {
      const rule = this.config.rules[ruleIndex];

      // Check if rule applies to this task
      if (!this.shouldApplyRule(rule, taskId, toolName)) {
        continue;
      }

      // Check probability
      if (Math.random() > rule.probability) {
        continue;
      }

      // Inject the fault based on type
      const injectedFault = await this.injectFault(
        rule,
        ruleIndex,
        workflowId,
        taskId,
        toolName,
        taskFn
      );

      // If fault was injected and resulted in error, throw it
      if (injectedFault.error) {
        throw injectedFault.error;
      }

      // Return the result (which may have been delayed)
      return injectedFault.result as T;
    }

    // No fault injected, execute normally
    return taskFn();
  }

  /**
   * Check if a rule should apply to a specific task/tool
   */
  private shouldApplyRule(
    rule: FaultInjectionRule,
    taskId: string,
    toolName: string | undefined
  ): boolean {
    // Check task ID filter
    if (rule.targetTaskIds && rule.targetTaskIds.length > 0) {
      if (!rule.targetTaskIds.includes(taskId)) {
        return false;
      }
    }

    // Check tool name filter
    if (rule.targetTools && rule.targetTools.length > 0) {
      if (!toolName || !rule.targetTools.includes(toolName)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Inject a specific fault based on the rule
   */
  private async injectFault<T>(
    rule: FaultInjectionRule,
    ruleIndex: number,
    workflowId: string,
    taskId: string,
    toolName: string | undefined,
    taskFn: () => Promise<T>
  ): Promise<{ result?: T; error?: Error }> {
    const faultId = this.generateFaultId();
    const config = rule.config || {};

    const injectedFault: InjectedFault = {
      id: faultId,
      type: rule.type,
      timestamp: new Date(),
      workflowId,
      taskId,
      toolName,
      config,
      ruleIndex,
    };

    // Log the injected fault to event log
    await this.logInjectedFault(injectedFault);

    switch (rule.type) {
      case FaultType.TOOL_FAILURE:
        return this.injectToolFailure(config, taskFn);

      case FaultType.LATENCY_SPIKE:
        return this.injectLatencySpike(config, taskFn);

      case FaultType.PARTIAL_OUTAGE:
        return this.injectPartialOutage(config, workflowId, taskId, taskFn);

      default:
        // Unknown fault type, execute normally
        return { result: await taskFn() };
    }
  }

  /**
   * Inject a tool failure
   */
  private async injectToolFailure<T>(
    config: FaultConfig,
    taskFn: () => Promise<T>
  ): Promise<{ result?: T; error?: Error }> {
    const errorMessage = config.errorMessage || 'Injected tool failure';
    return { error: new Error(errorMessage) };
  }

  /**
   * Inject a latency spike
   */
  private async injectLatencySpike<T>(
    config: FaultConfig,
    taskFn: () => Promise<T>
  ): Promise<{ result?: T; error?: Error }> {
    const delayMs = config.delayMs || 1000;
    
    // Delay before executing
    await this.sleep(delayMs);
    
    // Execute task normally
    try {
      const result = await taskFn();
      return { result };
    } catch (error) {
      return { error: error instanceof Error ? error : new Error(String(error)) };
    }
  }

  /**
   * Inject a partial outage
   * This simulates a scenario where a service is partially unavailable
   */
  private async injectPartialOutage<T>(
    config: FaultConfig,
    workflowId: string,
    taskId: string,
    taskFn: () => Promise<T>
  ): Promise<{ result?: T; error?: Error }> {
    const outageDurationMs = config.outageDurationMs || 5000;
    const failureRate = config.failureRate || 0.5;
    const outageKey = `${workflowId}-${taskId}`;

    // Check if we're currently in an outage period
    let outage = this.outageState.get(outageKey);
    
    if (!outage || outage.endTime < new Date()) {
      // Start a new outage period
      outage = {
        endTime: new Date(Date.now() + outageDurationMs),
        failureRate,
      };
      this.outageState.set(outageKey, outage);
    }

    // Check if this call should fail based on failure rate
    if (Math.random() < outage.failureRate) {
      return { error: new Error('Injected partial outage failure') };
    }

    // Execute task normally (service is available for this call)
    try {
      const result = await taskFn();
      return { result };
    } catch (error) {
      return { error: error instanceof Error ? error : new Error(String(error)) };
    }
  }

  /**
   * Log an injected fault to the event log
   */
  private async logInjectedFault(fault: InjectedFault): Promise<void> {
    if (!this.eventLog) {
      return;
    }

    const event: Event = {
      timestamp: fault.timestamp,
      type: 'FAULT_INJECTED' as any, // Will be added to EventType enum
      workflowId: fault.workflowId,
      taskId: fault.taskId,
      metadata: {
        faultId: fault.id,
        faultType: fault.type,
        toolName: fault.toolName,
        config: fault.config as Record<string, unknown>,
        ruleIndex: fault.ruleIndex,
      },
    };

    try {
      await this.eventLog.append(event);
    } catch (error) {
      // Log to event log failed - this is a critical issue but we don't want to fail the workflow
      if (typeof process !== 'undefined' && process.stderr) {
        process.stderr.write(`Failed to log injected fault: ${error}\n`);
      }
    }
  }

  /**
   * Get the current configuration
   */
  getConfig(): FaultInjectionConfig {
    return { ...this.config };
  }

  /**
   * Update the configuration
   */
  updateConfig(config: FaultInjectionConfig): void {
    this.config = config;
  }

  /**
   * Clear outage state (useful for testing)
   */
  clearOutageState(): void {
    this.outageState.clear();
  }

  /**
   * Generate a unique fault ID
   */
  private generateFaultId(): string {
    return `fault-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
