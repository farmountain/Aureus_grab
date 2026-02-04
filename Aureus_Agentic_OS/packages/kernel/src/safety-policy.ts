/**
 * Declarative safety policy language for workflow validation
 * Enables model-checking of workflow specifications before execution
 */

/**
 * Types of safety rules that can be enforced
 */
export enum SafetyRuleType {
  /**
   * Ensures no action follows a CRITICAL risk action unless it has approval
   */
  NO_ACTION_AFTER_CRITICAL_WITHOUT_APPROVAL = 'no_action_after_critical_without_approval',
  
  /**
   * Ensures no HIGH or CRITICAL actions without required permissions
   */
  REQUIRE_PERMISSIONS_FOR_HIGH_RISK = 'require_permissions_for_high_risk',
  
  /**
   * Ensures CRITICAL actions have compensation defined
   */
  REQUIRE_COMPENSATION_FOR_CRITICAL = 'require_compensation_for_critical',
  
  /**
   * Ensures no cycles in the workflow DAG
   */
  NO_CYCLES = 'no_cycles',
  
  /**
   * Custom rule with user-defined validation logic
   */
  CUSTOM = 'custom',
}

/**
 * Base interface for all safety rules
 */
export interface SafetyRule {
  type: SafetyRuleType;
  enabled: boolean;
  severity: 'error' | 'warning';
  message?: string; // Custom message for violations
}

/**
 * Rule: No action after CRITICAL risk unless approved
 */
export interface NoActionAfterCriticalRule extends SafetyRule {
  type: SafetyRuleType.NO_ACTION_AFTER_CRITICAL_WITHOUT_APPROVAL;
  /**
   * List of task IDs that are considered "approved" to follow CRITICAL tasks
   * These are typically compensation or cleanup tasks
   */
  approvedFollowers?: string[];
}

/**
 * Rule: Require permissions for HIGH/CRITICAL risk actions
 */
export interface RequirePermissionsRule extends SafetyRule {
  type: SafetyRuleType.REQUIRE_PERMISSIONS_FOR_HIGH_RISK;
  minimumRiskTier: 'HIGH' | 'CRITICAL';
}

/**
 * Rule: Require compensation for CRITICAL actions
 */
export interface RequireCompensationRule extends SafetyRule {
  type: SafetyRuleType.REQUIRE_COMPENSATION_FOR_CRITICAL;
}

/**
 * Rule: No cycles in workflow DAG
 */
export interface NoCyclesRule extends SafetyRule {
  type: SafetyRuleType.NO_CYCLES;
}

/**
 * Custom rule with user-defined validation function
 */
export interface CustomRule extends SafetyRule {
  type: SafetyRuleType.CUSTOM;
  validate: (workflow: WorkflowSpec) => SafetyViolation[];
}

/**
 * WorkflowSpec interface for type safety in custom rules
 * Using a minimal interface to avoid circular dependencies
 */
interface WorkflowSpec {
  id: string;
  name: string;
  tasks: Array<{
    id: string;
    name: string;
    type: string;
    riskTier?: string;
    requiredPermissions?: unknown[];
    compensation?: unknown;
    compensationAction?: unknown;
    [key: string]: unknown;
  }>;
  dependencies: Map<string, string[]>;
  safetyPolicy?: unknown;
}

/**
 * Union type of all safety rules
 */
export type AnySafetyRule = 
  | NoActionAfterCriticalRule 
  | RequirePermissionsRule 
  | RequireCompensationRule
  | NoCyclesRule
  | CustomRule;

/**
 * Safety policy containing all rules to enforce
 */
export interface SafetyPolicy {
  /**
   * Policy name for identification
   */
  name: string;
  
  /**
   * Description of what this policy enforces
   */
  description?: string;
  
  /**
   * List of safety rules to enforce
   */
  rules: AnySafetyRule[];
  
  /**
   * Whether to fail fast on first violation or collect all violations
   */
  failFast?: boolean;

  /**
   * Optional tenant identifier for multi-tenancy support
   * Policies can be scoped to specific tenants
   */
  tenantId?: string;
}

/**
 * Represents a violation of a safety rule
 */
export interface SafetyViolation {
  /**
   * Type of rule that was violated
   */
  ruleType: SafetyRuleType;
  
  /**
   * Severity of the violation
   */
  severity: 'error' | 'warning';
  
  /**
   * Human-readable description of the violation
   */
  message: string;
  
  /**
   * Task ID(s) involved in the violation
   */
  taskIds?: string[];
  
  /**
   * Additional context about the violation
   */
  context?: Record<string, unknown>;
}

/**
 * Result of workflow safety validation
 */
export interface SafetyValidationResult {
  /**
   * Whether the workflow passed all safety checks
   */
  valid: boolean;
  
  /**
   * List of violations found
   */
  violations: SafetyViolation[];
  
  /**
   * Warnings that don't prevent execution
   */
  warnings: SafetyViolation[];
  
  /**
   * Name of the policy that was applied
   */
  policyName: string;
}

/**
 * Default safety policy with common rules
 */
export const DEFAULT_SAFETY_POLICY: SafetyPolicy = {
  name: 'default',
  description: 'Default safety policy with essential safety checks',
  failFast: false,
  rules: [
    {
      type: SafetyRuleType.NO_ACTION_AFTER_CRITICAL_WITHOUT_APPROVAL,
      enabled: true,
      severity: 'error',
      // Don't set a custom message here - let the validator generate detailed messages
    },
    {
      type: SafetyRuleType.REQUIRE_PERMISSIONS_FOR_HIGH_RISK,
      enabled: true,
      severity: 'error',
      minimumRiskTier: 'HIGH',
      message: 'HIGH and CRITICAL risk actions must have requiredPermissions defined',
    },
    {
      type: SafetyRuleType.REQUIRE_COMPENSATION_FOR_CRITICAL,
      enabled: true,
      severity: 'warning',
      message: 'CRITICAL risk actions should have compensation defined',
    },
    {
      type: SafetyRuleType.NO_CYCLES,
      enabled: true,
      severity: 'error',
      message: 'Workflow must be a valid DAG with no cycles',
    },
  ],
};

/**
 * Strict safety policy with all rules enabled as errors
 */
export const STRICT_SAFETY_POLICY: SafetyPolicy = {
  name: 'strict',
  description: 'Strict safety policy requiring all safety checks',
  failFast: false,
  rules: [
    {
      type: SafetyRuleType.NO_ACTION_AFTER_CRITICAL_WITHOUT_APPROVAL,
      enabled: true,
      severity: 'error',
    },
    {
      type: SafetyRuleType.REQUIRE_PERMISSIONS_FOR_HIGH_RISK,
      enabled: true,
      severity: 'error',
      minimumRiskTier: 'HIGH',
    },
    {
      type: SafetyRuleType.REQUIRE_COMPENSATION_FOR_CRITICAL,
      enabled: true,
      severity: 'error',
    },
    {
      type: SafetyRuleType.NO_CYCLES,
      enabled: true,
      severity: 'error',
    },
  ],
};

/**
 * Permissive safety policy with minimal checks
 */
export const PERMISSIVE_SAFETY_POLICY: SafetyPolicy = {
  name: 'permissive',
  description: 'Permissive safety policy with only critical checks',
  failFast: false,
  rules: [
    {
      type: SafetyRuleType.NO_CYCLES,
      enabled: true,
      severity: 'error',
    },
  ],
};
