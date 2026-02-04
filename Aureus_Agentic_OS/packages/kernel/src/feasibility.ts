/**
 * Pre-execution Feasibility Check Layer
 * 
 * Validates actions against world model constraints and tool capabilities
 * before tool invocation to ensure safe and feasible execution.
 */

import { WorldState, ConstraintEngine, ConstraintValidationResult } from '@aureus/world-model';
import { TaskSpec } from './types';

/**
 * Result of a feasibility check
 */
export interface FeasibilityCheckResult {
  /**
   * Whether the action is feasible to execute
   */
  feasible: boolean;

  /**
   * Reasons for infeasibility (if any)
   */
  reasons: string[];

  /**
   * Constraint validation result (if constraints were checked)
   */
  constraintValidation?: ConstraintValidationResult;

  /**
   * Tool capability check result
   */
  toolCapabilityCheck?: {
    available: boolean;
    missingCapabilities?: string[];
  };

  /**
   * Overall confidence score (0-1) for soft constraints
   */
  confidenceScore?: number;

  /**
   * Additional metadata about the check
   */
  metadata?: Record<string, unknown>;
}

/**
 * Tool capability information
 */
export interface ToolInfo {
  name: string;
  capabilities: string[];
  available: boolean;
  riskLevel?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  requiredPermissions?: string[];
}

/**
 * Tool registry for tracking available tools and their capabilities
 */
export class ToolRegistry {
  private tools = new Map<string, ToolInfo>();

  /**
   * Register a tool with its capabilities
   */
  registerTool(tool: ToolInfo): void {
    this.tools.set(tool.name, tool);
  }

  /**
   * Unregister a tool
   */
  unregisterTool(toolName: string): boolean {
    return this.tools.delete(toolName);
  }

  /**
   * Get tool information
   */
  getTool(toolName: string): ToolInfo | undefined {
    return this.tools.get(toolName);
  }

  /**
   * Check if a tool is available
   */
  isToolAvailable(toolName: string): boolean {
    const tool = this.tools.get(toolName);
    return tool?.available ?? false;
  }

  /**
   * Get all available tools
   */
  getAvailableTools(): ToolInfo[] {
    return Array.from(this.tools.values()).filter(t => t.available);
  }

  /**
   * Check if a tool has required capabilities
   */
  hasCapabilities(toolName: string, requiredCapabilities: string[]): {
    hasAll: boolean;
    missing: string[];
  } {
    const tool = this.tools.get(toolName);
    if (!tool) {
      return { hasAll: false, missing: requiredCapabilities };
    }

    const missing = requiredCapabilities.filter(
      cap => !tool.capabilities.includes(cap)
    );

    return {
      hasAll: missing.length === 0,
      missing,
    };
  }

  /**
   * Clear all registered tools
   */
  clear(): void {
    this.tools.clear();
  }
}

/**
 * FeasibilityChecker validates actions before execution
 */
export class FeasibilityChecker {
  private constraintEngine?: ConstraintEngine;
  private toolRegistry: ToolRegistry;
  private worldState?: WorldState;

  constructor(
    toolRegistry?: ToolRegistry,
    constraintEngine?: ConstraintEngine,
    worldState?: WorldState
  ) {
    this.toolRegistry = toolRegistry || new ToolRegistry();
    this.constraintEngine = constraintEngine;
    this.worldState = worldState;
  }

  /**
   * Update the world state
   */
  updateWorldState(state: WorldState): void {
    this.worldState = state;
  }

  /**
   * Get the tool registry
   */
  getToolRegistry(): ToolRegistry {
    return this.toolRegistry;
  }

  /**
   * Get the constraint engine
   */
  getConstraintEngine(): ConstraintEngine | undefined {
    return this.constraintEngine;
  }

  /**
   * Set the constraint engine
   */
  setConstraintEngine(engine: ConstraintEngine): void {
    this.constraintEngine = engine;
  }

  /**
   * Check if a task is feasible to execute
   */
  async checkFeasibility(task: TaskSpec): Promise<FeasibilityCheckResult> {
    const reasons: string[] = [];
    let constraintValidation: ConstraintValidationResult | undefined;
    let toolCapabilityCheck: { available: boolean; missingCapabilities?: string[] } | undefined;
    let confidenceScore: number | undefined;

    // 1. Check tool availability and capabilities
    if (task.toolName) {
      const toolAvailable = this.toolRegistry.isToolAvailable(task.toolName);
      
      if (!toolAvailable) {
        reasons.push(`Tool '${task.toolName}' is not available or not registered`);
        toolCapabilityCheck = { available: false };
      } else {
        const tool = this.toolRegistry.getTool(task.toolName);
        
        // Check if tool has required capabilities (if specified)
        if (task.allowedTools && !task.allowedTools.includes(task.toolName)) {
          reasons.push(
            `Tool '${task.toolName}' is not in the list of allowed tools: ${task.allowedTools.join(', ')}`
          );
        }

        // Check risk tier compatibility
        if (tool && task.riskTier && tool.riskLevel) {
          const riskLevels = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
          const taskRiskIndex = riskLevels.indexOf(task.riskTier);
          const toolRiskIndex = riskLevels.indexOf(tool.riskLevel);
          
          if (toolRiskIndex > taskRiskIndex) {
            reasons.push(
              `Tool risk level '${tool.riskLevel}' exceeds task risk tier '${task.riskTier}'`
            );
          }
        }

        toolCapabilityCheck = { available: true };
      }
    }

    // 2. Validate against world model constraints
    if (this.constraintEngine && this.worldState) {
      try {
        constraintValidation = this.constraintEngine.validate(
          this.worldState,
          task.toolName || task.id,
          task.inputs
        );

        // Check hard constraints
        if (!constraintValidation.satisfied) {
          const hardViolations = constraintValidation.violations.filter(
            v => v.severity === 'hard'
          );
          
          if (hardViolations.length > 0) {
            reasons.push(
              `Hard constraint violations detected: ${hardViolations
                .map(v => v.description + (v.message ? ` - ${v.message}` : ''))
                .join('; ')}`
            );
          }

          // Soft constraint violations are warnings, not blockers
          const softViolations = constraintValidation.violations.filter(
            v => v.severity === 'soft'
          );
          
          if (softViolations.length > 0) {
            // Record soft violations in metadata but don't block execution
            confidenceScore = constraintValidation.score;
          }
        } else {
          confidenceScore = constraintValidation.score;
        }
      } catch (error) {
        reasons.push(
          `Constraint validation error: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    // 3. Check required permissions
    if (task.requiredPermissions && task.requiredPermissions.length > 0) {
      // This is a placeholder - actual permission checking would be done by policy guard
      // We just validate that permissions are specified correctly
      const hasPermissions = task.requiredPermissions.every(
        perm => perm.action && perm.resource
      );
      
      if (!hasPermissions) {
        reasons.push('Invalid permission specification in task');
      }
    }

    // 4. Validate task inputs if schema is available
    if (task.inputs) {
      // Basic input validation - check for null/undefined required fields
      // More sophisticated schema validation would go here
      const hasInvalidInputs = Object.values(task.inputs).some(
        value => value === null || value === undefined
      );
      
      if (hasInvalidInputs) {
        reasons.push('Task inputs contain null or undefined values');
      }
    }

    // Determine overall feasibility
    const feasible = reasons.length === 0;

    return {
      feasible,
      reasons,
      constraintValidation,
      toolCapabilityCheck,
      confidenceScore,
      metadata: {
        taskId: task.id,
        taskName: task.name,
        toolName: task.toolName,
        checkedAt: new Date().toISOString(),
      },
    };
  }

  /**
   * Batch check feasibility for multiple tasks
   */
  async checkBatchFeasibility(tasks: TaskSpec[]): Promise<Map<string, FeasibilityCheckResult>> {
    const results = new Map<string, FeasibilityCheckResult>();

    for (const task of tasks) {
      const result = await this.checkFeasibility(task);
      results.set(task.id, result);
    }

    return results;
  }

  /**
   * Check if an action is allowed based on constraints only
   */
  isActionAllowed(action: string, params?: Record<string, unknown>): boolean {
    if (!this.constraintEngine || !this.worldState) {
      return true; // No constraints configured, allow by default
    }

    return this.constraintEngine.isActionAllowed(this.worldState, action, params);
  }

  /**
   * Get action score based on soft constraints
   */
  getActionScore(action: string, params?: Record<string, unknown>): number {
    if (!this.constraintEngine || !this.worldState) {
      return 1.0; // No constraints configured, perfect score
    }

    return this.constraintEngine.getActionScore(this.worldState, action, params);
  }
}
