import { WorkflowSpec, TaskSpec } from './types';
import {
  SafetyPolicy,
  SafetyValidationResult,
  SafetyViolation,
  SafetyRuleType,
  AnySafetyRule,
  NoActionAfterCriticalRule,
  RequirePermissionsRule,
  RequireCompensationRule,
  NoCyclesRule,
  CustomRule,
} from './safety-policy';

/**
 * WorkflowChecker validates workflow specifications against safety policies
 * before execution (model-checking at compile time)
 */
export class WorkflowChecker {
  /**
   * Validate a workflow against a safety policy
   * @param workflow The workflow specification to validate
   * @param policy The safety policy to enforce
   * @returns Validation result with violations and warnings
   */
  static validate(workflow: WorkflowSpec, policy: SafetyPolicy): SafetyValidationResult {
    const violations: SafetyViolation[] = [];
    const warnings: SafetyViolation[] = [];

    for (const rule of policy.rules) {
      if (!rule.enabled) {
        continue;
      }

      let ruleViolations: SafetyViolation[] = [];

      switch (rule.type) {
        case SafetyRuleType.NO_ACTION_AFTER_CRITICAL_WITHOUT_APPROVAL:
          ruleViolations = this.validateNoActionAfterCritical(
            workflow,
            rule as NoActionAfterCriticalRule
          );
          break;

        case SafetyRuleType.REQUIRE_PERMISSIONS_FOR_HIGH_RISK:
          ruleViolations = this.validateRequirePermissions(
            workflow,
            rule as RequirePermissionsRule
          );
          break;

        case SafetyRuleType.REQUIRE_COMPENSATION_FOR_CRITICAL:
          ruleViolations = this.validateRequireCompensation(
            workflow,
            rule as RequireCompensationRule
          );
          break;

        case SafetyRuleType.NO_CYCLES:
          ruleViolations = this.validateNoCycles(
            workflow,
            rule as NoCyclesRule
          );
          break;

        case SafetyRuleType.CUSTOM:
          ruleViolations = (rule as CustomRule).validate(workflow as any);
          break;
      }

      // Categorize violations by severity
      for (const violation of ruleViolations) {
        if (violation.severity === 'error') {
          violations.push(violation);
        } else {
          warnings.push(violation);
        }
      }

      // Fail fast if configured
      if (policy.failFast && violations.length > 0) {
        break;
      }
    }

    return {
      valid: violations.length === 0,
      violations,
      warnings,
      policyName: policy.name,
    };
  }

  /**
   * Validate that no action follows a CRITICAL risk action without approval
   * This is the key invariant mentioned in the problem statement
   */
  private static validateNoActionAfterCritical(
    workflow: WorkflowSpec,
    rule: NoActionAfterCriticalRule
  ): SafetyViolation[] {
    const violations: SafetyViolation[] = [];

    // Find all CRITICAL risk tasks
    const criticalTasks = workflow.tasks.filter(
      (task) => task.riskTier === 'CRITICAL'
    );

    for (const criticalTask of criticalTasks) {
      // Find all tasks that depend on this CRITICAL task (followers)
      const followers = this.findFollowerTasks(workflow, criticalTask.id);

      for (const follower of followers) {
        // Check if follower is approved
        const isApproved = this.isApprovedFollower(
          follower,
          criticalTask,
          rule.approvedFollowers
        );

        if (!isApproved) {
          violations.push({
            ruleType: SafetyRuleType.NO_ACTION_AFTER_CRITICAL_WITHOUT_APPROVAL,
            severity: rule.severity,
            message:
              rule.message ||
              `Task "${follower.id}" follows CRITICAL risk task "${criticalTask.id}" without approval. ` +
              `CRITICAL tasks can only be followed by compensation tasks or explicitly approved tasks.`,
            taskIds: [criticalTask.id, follower.id],
            context: {
              criticalTask: criticalTask.id,
              followerTask: follower.id,
              criticalTaskName: criticalTask.name,
              followerTaskName: follower.name,
            },
          });
        }
      }
    }

    return violations;
  }

  /**
   * Check if a follower task is approved to follow a CRITICAL task
   * Approved tasks include:
   * - Compensation tasks defined in the CRITICAL task
   * - Tasks explicitly listed in approvedFollowers
   */
  private static isApprovedFollower(
    follower: TaskSpec,
    criticalTask: TaskSpec,
    approvedFollowers?: string[]
  ): boolean {
    // Check if it's a compensation task
    if (
      criticalTask.compensation?.onFailure === follower.id ||
      criticalTask.compensation?.onTimeout === follower.id
    ) {
      return true;
    }

    // Check if it's in the approved list
    if (approvedFollowers && approvedFollowers.includes(follower.id)) {
      return true;
    }

    // Check if the follower itself is a compensation task
    // (has compensationAction defined, suggesting it's meant for cleanup)
    if (follower.compensationAction) {
      return true;
    }

    return false;
  }

  /**
   * Find all tasks that directly or indirectly depend on the given task
   */
  private static findFollowerTasks(
    workflow: WorkflowSpec,
    taskId: string
  ): TaskSpec[] {
    const followers: TaskSpec[] = [];

    // Iterate through dependencies to find tasks that depend on taskId
    const entries = Array.from(workflow.dependencies.entries());
    for (const [dependentId, dependencies] of entries) {
      if (dependencies.includes(taskId)) {
        const followerTask = workflow.tasks.find((t) => t.id === dependentId);
        if (followerTask) {
          followers.push(followerTask);
        }
      }
    }

    return followers;
  }

  /**
   * Validate that HIGH/CRITICAL risk actions have required permissions
   */
  private static validateRequirePermissions(
    workflow: WorkflowSpec,
    rule: RequirePermissionsRule
  ): SafetyViolation[] {
    const violations: SafetyViolation[] = [];

    const targetTiers: string[] = [];
    if (rule.minimumRiskTier === 'HIGH') {
      targetTiers.push('HIGH', 'CRITICAL');
    } else if (rule.minimumRiskTier === 'CRITICAL') {
      targetTiers.push('CRITICAL');
    }

    for (const task of workflow.tasks) {
      if (task.riskTier && targetTiers.includes(task.riskTier)) {
        if (
          !task.requiredPermissions ||
          task.requiredPermissions.length === 0
        ) {
          violations.push({
            ruleType: SafetyRuleType.REQUIRE_PERMISSIONS_FOR_HIGH_RISK,
            severity: rule.severity,
            message:
              rule.message ||
              `Task "${task.id}" has ${task.riskTier} risk tier but no required permissions defined`,
            taskIds: [task.id],
            context: {
              taskId: task.id,
              taskName: task.name,
              riskTier: task.riskTier,
            },
          });
        }
      }
    }

    return violations;
  }

  /**
   * Validate that CRITICAL risk actions have compensation defined
   */
  private static validateRequireCompensation(
    workflow: WorkflowSpec,
    rule: RequireCompensationRule
  ): SafetyViolation[] {
    const violations: SafetyViolation[] = [];

    for (const task of workflow.tasks) {
      if (task.riskTier === 'CRITICAL') {
        const hasCompensationHook =
          task.compensation?.onFailure || task.compensation?.onTimeout;
        const hasCompensationAction = task.compensationAction;

        if (!hasCompensationHook && !hasCompensationAction) {
          violations.push({
            ruleType: SafetyRuleType.REQUIRE_COMPENSATION_FOR_CRITICAL,
            severity: rule.severity,
            message:
              rule.message ||
              `Task "${task.id}" has CRITICAL risk tier but no compensation defined`,
            taskIds: [task.id],
            context: {
              taskId: task.id,
              taskName: task.name,
              riskTier: task.riskTier,
            },
          });
        }
      }
    }

    return violations;
  }

  /**
   * Validate that the workflow has no cycles (is a valid DAG)
   */
  private static validateNoCycles(
    workflow: WorkflowSpec,
    rule: NoCyclesRule
  ): SafetyViolation[] {
    const violations: SafetyViolation[] = [];

    // Detect cycles using DFS with colors (white=unvisited, gray=visiting, black=visited)
    const colors = new Map<string, 'white' | 'gray' | 'black'>();
    const cycles: string[][] = [];
    const path: string[] = [];  // Mutable path for backtracking

    // Initialize all tasks as white (unvisited)
    for (const task of workflow.tasks) {
      colors.set(task.id, 'white');
    }

    const visit = (taskId: string): void => {
      if (colors.get(taskId) === 'gray') {
        // Found a cycle
        const cycleStart = path.indexOf(taskId);
        const cycle = path.slice(cycleStart).concat(taskId);
        cycles.push(cycle);
        return;
      }

      if (colors.get(taskId) === 'black') {
        // Already processed
        return;
      }

      // Mark as visiting
      colors.set(taskId, 'gray');
      path.push(taskId);

      // Visit dependencies
      const deps = workflow.dependencies.get(taskId) || [];
      for (const depId of deps) {
        visit(depId);
      }

      // Mark as visited and backtrack
      colors.set(taskId, 'black');
      path.pop();
    };

    // Start DFS from each unvisited node
    for (const task of workflow.tasks) {
      if (colors.get(task.id) === 'white') {
        visit(task.id);
      }
    }

    // Report cycles as violations
    for (const cycle of cycles) {
      violations.push({
        ruleType: SafetyRuleType.NO_CYCLES,
        severity: rule.severity,
        message:
          rule.message ||
          `Workflow contains a cycle: ${cycle.join(' -> ')}`,
        taskIds: cycle,
        context: {
          cycle,
          cycleLength: cycle.length,
        },
      });
    }

    return violations;
  }

  /**
   * Format validation result as a human-readable string
   */
  static formatValidationResult(result: SafetyValidationResult): string {
    const lines: string[] = [];

    lines.push(`Safety Validation Result (Policy: ${result.policyName})`);
    lines.push('='.repeat(60));

    if (result.valid && result.warnings.length === 0) {
      lines.push('✓ All safety checks passed');
      return lines.join('\n');
    }

    if (result.violations.length > 0) {
      lines.push(`\n✗ ${result.violations.length} Error(s):`);
      for (let i = 0; i < result.violations.length; i++) {
        const v = result.violations[i];
        lines.push(`\n${i + 1}. ${v.message}`);
        if (v.taskIds && v.taskIds.length > 0) {
          lines.push(`   Tasks: ${v.taskIds.join(', ')}`);
        }
      }
    }

    if (result.warnings.length > 0) {
      lines.push(`\n⚠ ${result.warnings.length} Warning(s):`);
      for (let i = 0; i < result.warnings.length; i++) {
        const w = result.warnings[i];
        lines.push(`\n${i + 1}. ${w.message}`);
        if (w.taskIds && w.taskIds.length > 0) {
          lines.push(`   Tasks: ${w.taskIds.join(', ')}`);
        }
      }
    }

    return lines.join('\n');
  }
}

/**
 * Error thrown when workflow validation fails
 */
export class WorkflowValidationError extends Error {
  public readonly result: SafetyValidationResult;

  constructor(result: SafetyValidationResult) {
    super(
      `Workflow validation failed with ${result.violations.length} error(s)`
    );
    this.name = 'WorkflowValidationError';
    this.result = result;
  }
}
