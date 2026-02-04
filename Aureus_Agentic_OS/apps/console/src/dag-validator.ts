import { WorkflowSpec, TaskSpec } from '@aureus/kernel';
import { WorkflowChecker, SafetyPolicy } from '@aureus/kernel';
import { GoalGuardFSM, RiskTier, Intent, DataZone } from '@aureus/policy';

/**
 * DAG validation result
 */
export interface DAGValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  topologicalOrder?: string[]; // Task IDs in execution order
}

/**
 * Validation error
 */
export interface ValidationError {
  type: 'cycle' | 'missing_dependency' | 'orphan_task' | 'invalid_task';
  taskId?: string;
  message: string;
  details?: string;
}

/**
 * Validation warning
 */
export interface ValidationWarning {
  type: 'unreachable' | 'multiple_entry_points' | 'missing_compensation' | 'high_risk_without_approval';
  taskId?: string;
  message: string;
  suggestion?: string;
}

/**
 * Policy validation result
 */
export interface PolicyValidationResult {
  valid: boolean;
  violations: PolicyViolation[];
  warnings: PolicyWarning[];
}

/**
 * Policy violation
 */
export interface PolicyViolation {
  taskId: string;
  type: 'permission_required' | 'risk_tier_mismatch' | 'missing_compensation' | 'action_after_critical';
  message: string;
  severity: 'error' | 'warning';
  remediation?: string;
}

/**
 * Policy warning
 */
export interface PolicyWarning {
  taskId: string;
  type: 'risk_tier' | 'tool_usage' | 'data_zone';
  message: string;
  suggestion?: string;
}

/**
 * DAGValidator validates workflow DAG structure and policies
 */
export class DAGValidator {
  /**
   * Validate DAG topology (cycles, dependencies, etc.)
   */
  static validateTopology(spec: WorkflowSpec): DAGValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Check for cycles using DFS
    const visited = new Set<string>();
    const recStack = new Set<string>();
    const taskMap = new Map(spec.tasks.map(t => [t.id, t]));

    const hasCycle = (taskId: string): boolean => {
      visited.add(taskId);
      recStack.add(taskId);

      const deps = spec.dependencies.get(taskId) || [];
      for (const depId of deps) {
        if (!visited.has(depId)) {
          if (hasCycle(depId)) {
            return true;
          }
        } else if (recStack.has(depId)) {
          errors.push({
            type: 'cycle',
            taskId,
            message: `Cyclic dependency detected: ${taskId} depends on ${depId}`,
            details: 'Workflows cannot have circular dependencies. Remove the dependency to break the cycle.',
          });
          return true;
        }
      }

      recStack.delete(taskId);
      return false;
    };

    // Check all tasks for cycles
    for (const task of spec.tasks) {
      if (!visited.has(task.id)) {
        hasCycle(task.id);
      }
    }

    // Check for missing dependencies
    for (const [taskId, deps] of spec.dependencies.entries()) {
      for (const depId of deps) {
        if (!taskMap.has(depId)) {
          errors.push({
            type: 'missing_dependency',
            taskId,
            message: `Task ${taskId} depends on non-existent task ${depId}`,
            details: 'All task dependencies must reference existing tasks in the workflow.',
          });
        }
      }
    }

    // Check for orphan tasks (not referenced by any other task and not a root)
    const referencedTasks = new Set<string>();
    for (const deps of spec.dependencies.values()) {
      deps.forEach(dep => referencedTasks.add(dep));
    }

    const rootTasks = spec.tasks.filter(t => {
      const deps = spec.dependencies.get(t.id) || [];
      return deps.length === 0;
    });

    if (rootTasks.length === 0 && spec.tasks.length > 0) {
      errors.push({
        type: 'invalid_task',
        message: 'Workflow has no root tasks (tasks with no dependencies)',
        details: 'At least one task must have no dependencies to serve as an entry point.',
      });
    }

    if (rootTasks.length > 1) {
      warnings.push({
        type: 'multiple_entry_points',
        message: `Workflow has ${rootTasks.length} root tasks: ${rootTasks.map(t => t.id).join(', ')}`,
        suggestion: 'Consider adding a single entry task that coordinates the parallel roots.',
      });
    }

    // Compute topological order if no cycles
    let topologicalOrder: string[] | undefined;
    if (errors.length === 0) {
      topologicalOrder = this.computeTopologicalOrder(spec);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      topologicalOrder,
    };
  }

  /**
   * Compute topological order using Kahn's algorithm
   */
  private static computeTopologicalOrder(spec: WorkflowSpec): string[] {
    const inDegree = new Map<string, number>();
    const adjList = new Map<string, string[]>();

    // Initialize
    for (const task of spec.tasks) {
      inDegree.set(task.id, 0);
      adjList.set(task.id, []);
    }

    // Build adjacency list and compute in-degrees
    for (const [taskId, deps] of spec.dependencies.entries()) {
      const currentDegree = inDegree.get(taskId) || 0;
      inDegree.set(taskId, currentDegree + deps.length);

      for (const depId of deps) {
        const neighbors = adjList.get(depId) || [];
        neighbors.push(taskId);
        adjList.set(depId, neighbors);
      }
    }

    // Find all nodes with in-degree 0
    const queue: string[] = [];
    for (const [taskId, degree] of inDegree.entries()) {
      if (degree === 0) {
        queue.push(taskId);
      }
    }

    const result: string[] = [];
    while (queue.length > 0) {
      const current = queue.shift()!;
      result.push(current);

      const neighbors = adjList.get(current) || [];
      for (const neighbor of neighbors) {
        const degree = inDegree.get(neighbor)!;
        inDegree.set(neighbor, degree - 1);
        if (degree - 1 === 0) {
          queue.push(neighbor);
        }
      }
    }

    return result;
  }

  /**
   * Validate policy and risk tiers
   */
  static validatePolicy(
    spec: WorkflowSpec,
    policyGuard?: GoalGuardFSM,
    safetyPolicy?: SafetyPolicy
  ): PolicyValidationResult {
    const violations: PolicyViolation[] = [];
    const warnings: PolicyWarning[] = [];

    // Use workflow checker if safety policy is provided
    if (safetyPolicy) {
      const checkerResult = WorkflowChecker.validate(spec, safetyPolicy);
      
      for (const violation of checkerResult.violations) {
        violations.push({
          taskId: (violation.taskIds && violation.taskIds.length > 0) ? violation.taskIds[0] : 'unknown',
          type: this.mapViolationType(violation.ruleType),
          message: violation.message,
          severity: violation.severity,
          remediation: undefined, // Not available in SafetyViolation
        });
      }

      for (const warning of checkerResult.warnings) {
        warnings.push({
          taskId: (warning.taskIds && warning.taskIds.length > 0) ? warning.taskIds[0] : 'unknown',
          type: this.mapWarningType(warning.ruleType),
          message: warning.message,
          suggestion: undefined, // Not available in SafetyViolation
        });
      }
    }

    // Validate each task's risk tier and permissions
    for (const task of spec.tasks) {
      // Check for high/critical risk tasks without compensation
      if ((task.riskTier === 'HIGH' || task.riskTier === 'CRITICAL') && 
          !task.compensation && !task.compensationAction) {
        warnings.push({
          taskId: task.id,
          type: 'risk_tier',
          message: `Task ${task.id} has ${task.riskTier} risk but no compensation configured`,
          suggestion: 'Add a compensation action or hook to handle failures',
        });
      }

      // Check for critical tasks without required permissions
      if (task.riskTier === 'CRITICAL' && (!task.requiredPermissions || task.requiredPermissions.length === 0)) {
        warnings.push({
          taskId: task.id,
          type: 'risk_tier',
          message: `Critical task ${task.id} should have explicit permission requirements`,
          suggestion: 'Define required permissions for this critical operation',
        });
      }

      // Validate with policy guard if available
      if (policyGuard && task.toolName) {
        const riskTier = this.mapRiskTier(task.riskTier);
        const intent = this.mapIntent(task.intent);
        const dataZone = this.mapDataZone(task.dataZone);

        // This is a simplified check - in reality would need full context
        if (riskTier === RiskTier.CRITICAL && !task.requiredPermissions) {
          violations.push({
            taskId: task.id,
            type: 'permission_required',
            message: `Critical operation requires explicit permissions`,
            severity: 'error',
            remediation: 'Add requiredPermissions field with appropriate permissions',
          });
        }
      }
    }

    // Check for action after critical without approval
    const taskMap = new Map(spec.tasks.map(t => [t.id, t]));
    for (const [taskId, deps] of spec.dependencies.entries()) {
      const task = taskMap.get(taskId);
      if (!task) continue;

      for (const depId of deps) {
        const depTask = taskMap.get(depId);
        if (depTask && depTask.riskTier === 'CRITICAL') {
          // Check if current task requires approval
          // This is a simplified check - full implementation would check approval hooks
          warnings.push({
            taskId: task.id,
            type: 'risk_tier',
            message: `Task ${task.id} executes after CRITICAL task ${depId}`,
            suggestion: 'Consider requiring human approval for actions following critical operations',
          });
        }
      }
    }

    return {
      valid: violations.filter(v => v.severity === 'error').length === 0,
      violations,
      warnings,
    };
  }

  /**
   * Validate CRV rules for a workflow
   */
  static validateCRVRules(spec: WorkflowSpec): {
    valid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Basic CRV rule validation
    // In a full implementation, this would validate CRV gate configurations
    for (const task of spec.tasks) {
      if (task.riskTier === 'CRITICAL' || task.riskTier === 'HIGH') {
        // Could check if CRV gates are configured
        warnings.push(`Task ${task.id}: Consider adding CRV validation gates for ${task.riskTier} risk operations`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Map safety rule type to violation type
   */
  private static mapViolationType(ruleType: string): PolicyViolation['type'] {
    switch (ruleType) {
      case 'NO_ACTION_AFTER_CRITICAL_WITHOUT_APPROVAL':
        return 'action_after_critical';
      case 'REQUIRE_PERMISSIONS_FOR_HIGH_RISK':
        return 'permission_required';
      case 'REQUIRE_COMPENSATION_FOR_CRITICAL':
        return 'missing_compensation';
      default:
        return 'risk_tier_mismatch';
    }
  }

  /**
   * Map safety rule type to warning type
   */
  private static mapWarningType(ruleType: string): PolicyWarning['type'] {
    switch (ruleType) {
      case 'REQUIRE_PERMISSIONS_FOR_HIGH_RISK':
        return 'risk_tier';
      default:
        return 'tool_usage';
    }
  }

  /**
   * Map risk tier string to enum
   */
  private static mapRiskTier(tier?: string): RiskTier {
    switch (tier) {
      case 'LOW': return RiskTier.LOW;
      case 'MEDIUM': return RiskTier.MEDIUM;
      case 'HIGH': return RiskTier.HIGH;
      case 'CRITICAL': return RiskTier.CRITICAL;
      default: return RiskTier.LOW;
    }
  }

  /**
   * Map intent string to enum
   */
  private static mapIntent(intent?: string): Intent {
    switch (intent) {
      case 'read': return Intent.READ;
      case 'write': return Intent.WRITE;
      case 'delete': return Intent.DELETE;
      case 'execute': return Intent.EXECUTE;
      case 'admin': return Intent.ADMIN;
      default: return Intent.READ;
    }
  }

  /**
   * Map data zone string to enum
   */
  private static mapDataZone(zone?: string): DataZone {
    switch (zone) {
      case 'public': return DataZone.PUBLIC;
      case 'internal': return DataZone.INTERNAL;
      case 'confidential': return DataZone.CONFIDENTIAL;
      case 'restricted': return DataZone.RESTRICTED;
      default: return DataZone.PUBLIC;
    }
  }
}
