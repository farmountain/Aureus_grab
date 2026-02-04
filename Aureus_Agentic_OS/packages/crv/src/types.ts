/**
 * Failure taxonomy for CRV validation failures
 * Provides stable failure codes with remediation hints
 */
export enum FailureTaxonomy {
  MISSING_DATA = 'MISSING_DATA',
  CONFLICT = 'CONFLICT',
  OUT_OF_SCOPE = 'OUT_OF_SCOPE',
  LOW_CONFIDENCE = 'LOW_CONFIDENCE',
  POLICY_VIOLATION = 'POLICY_VIOLATION',
  TOOL_ERROR = 'TOOL_ERROR',
  NON_DETERMINISM = 'NON_DETERMINISM',
}

/**
 * Remediation hints for each failure code
 */
export const FailureRemediation: Record<FailureTaxonomy, string> = {
  [FailureTaxonomy.MISSING_DATA]: 'Ensure all required data fields are present. Check input schema and data extraction logic.',
  [FailureTaxonomy.CONFLICT]: 'Resolve data conflicts by checking for inconsistencies between expected and actual values.',
  [FailureTaxonomy.OUT_OF_SCOPE]: 'Review the operation scope. The data or operation may be outside defined boundaries.',
  [FailureTaxonomy.LOW_CONFIDENCE]: 'Increase confidence by providing more context, using alternative tools, or escalating for human review.',
  [FailureTaxonomy.POLICY_VIOLATION]: 'Review policy constraints and ensure compliance. Update data or request policy exception.',
  [FailureTaxonomy.TOOL_ERROR]: 'Check tool execution logs, verify tool configuration, and ensure proper error handling.',
  [FailureTaxonomy.NON_DETERMINISM]: 'Investigate sources of non-determinism. Ensure idempotence and consistent input/output behavior.',
};

/**
 * Validation result from CRV operators
 */
export interface ValidationResult {
  valid: boolean;
  reason?: string;
  confidence?: number; // 0-1 confidence score
  metadata?: Record<string, unknown>;
  failure_code?: FailureTaxonomy; // Stable failure code for categorization
  remediation?: string; // Remediation hint for the failure
}

/**
 * Commit or state change to be validated
 */
export interface Commit {
  id: string;
  data: unknown;
  previousState?: unknown;
  metadata?: Record<string, unknown>;
}

/**
 * Validator function interface
 */
export type Validator = (commit: Commit) => Promise<ValidationResult> | ValidationResult;

/**
 * Gate configuration for blocking invalid commits
 */
export interface GateConfig {
  name: string;
  validators: Validator[];
  blockOnFailure: boolean;
  requiredConfidence?: number; // Minimum confidence threshold
  recoveryStrategy?: RecoveryStrategy; // Strategy to apply on failure
}

/**
 * Gate result with detailed information
 */
export interface GateResult {
  passed: boolean;
  gateName: string;
  validationResults: ValidationResult[];
  blockedCommit: boolean;
  timestamp: Date;
  recoveryStrategy?: RecoveryStrategy;
  // Observability fields for monitoring and debugging
  crv_status: 'passed' | 'blocked' | 'warning';
  failure_code?: FailureTaxonomy;
  remediation?: string;
}

/**
 * Recovery strategy to apply when validation fails
 */
export type RecoveryStrategy = 
  | { type: 'retry_alt_tool'; toolName: string; maxRetries: number }
  | { type: 'ask_user'; prompt: string }
  | { type: 'escalate'; reason: string }
  | { type: 'ignore'; justification: string };

/**
 * Recovery action result
 */
export interface RecoveryResult {
  success: boolean;
  strategy: RecoveryStrategy;
  message: string;
  recoveredData?: unknown;
}
