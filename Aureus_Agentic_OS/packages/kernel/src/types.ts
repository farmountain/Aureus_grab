// Forward declaration for SafetyPolicy to avoid circular dependency
// The actual type is defined in safety-policy.ts
export interface SafetyPolicyLike {
  name: string;
  description?: string;
  rules: unknown[];
  failFast?: boolean;
}

/**
 * TaskSpec defines the contract for workflow tasks
 */
export interface TaskSpec {
  id: string;
  name: string;
  type: 'action' | 'decision' | 'parallel';
  inputs?: Record<string, unknown>;
  retry?: RetryConfig;
  idempotencyKey?: string;
  timeoutMs?: number;
  riskTier?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  compensation?: CompensationHook;
  compensationAction?: CompensationAction; // Direct compensation action
  toolName?: string; // Tool to use for this task
  requiredPermissions?: Array<{
    action: string;
    resource: string;
    intent?: 'read' | 'write' | 'delete' | 'execute' | 'admin';
    dataZone?: 'public' | 'internal' | 'confidential' | 'restricted';
  }>;
  allowedTools?: string[]; // List of allowed tools
  intent?: 'read' | 'write' | 'delete' | 'execute' | 'admin';
  dataZone?: 'public' | 'internal' | 'confidential' | 'restricted';
  sandboxConfig?: {
    enabled: boolean;
    type?: 'mock' | 'simulation' | 'container' | 'vm' | 'process';
    simulationMode?: boolean; // If true, capture side effects without executing
    permissions?: Record<string, unknown>; // Sandbox permissions
  };
}

export interface CompensationHook {
  onFailure?: string; // Task ID to execute on failure
  onTimeout?: string; // Task ID to execute on timeout
}

/**
 * CompensationAction defines a direct compensation action
 * Consists of a tool ID and its arguments
 */
export interface CompensationAction {
  tool: string; // Tool ID to execute for compensation
  args: Record<string, unknown>; // Arguments for the tool
}

export interface RetryConfig {
  maxAttempts: number;
  backoffMs: number;
  backoffMultiplier?: number;
  jitter?: boolean; // Add random jitter to backoff
}

/**
 * TaskState represents the persisted state of a task
 */
export interface TaskState {
  taskId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'retrying' | 'timeout';
  attempt: number;
  result?: unknown;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
  metadata?: Record<string, unknown>;
  timedOut?: boolean;
}

/**
 * WorkflowSpec defines a complete workflow with dependencies
 */
export interface WorkflowSpec {
  id: string;
  name: string;
  tasks: TaskSpec[];
  dependencies: Map<string, string[]>; // taskId -> [dependsOn taskIds]
  safetyPolicy?: SafetyPolicyLike; // Optional safety policy for model-checking
}

/**
 * WorkflowState represents the durable state of a workflow
 */
export interface WorkflowState {
  workflowId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'paused';
  taskStates: Map<string, TaskState>;
  startedAt?: Date;
  completedAt?: Date;
  checkpointId?: string;
  tenantId?: string; // Optional tenant identifier for multi-tenancy
}

/**
 * StateStore interface for persisting workflow state
 */
export interface StateStore {
  saveWorkflowState(state: WorkflowState): Promise<void>;
  loadWorkflowState(workflowId: string, tenantId?: string): Promise<WorkflowState | null>;
  saveTaskState(workflowId: string, taskState: TaskState): Promise<void>;
  loadTaskState(workflowId: string, taskId: string, tenantId?: string): Promise<TaskState | null>;
  // List workflows for a specific tenant
  listWorkflowsByTenant?(tenantId: string): Promise<WorkflowState[]>;
}

/**
 * TaskExecutor interface for executing individual tasks
 */
export interface TaskExecutor {
  execute(task: TaskSpec, state: TaskState): Promise<unknown>;
}

/**
 * Event types for the append-only event log
 */
export type EventType = 
  | 'WORKFLOW_STARTED'
  | 'WORKFLOW_COMPLETED'
  | 'WORKFLOW_FAILED'
  | 'TASK_STARTED'
  | 'TASK_COMPLETED'
  | 'TASK_FAILED'
  | 'TASK_RETRY'
  | 'TASK_TIMEOUT'
  | 'COMPENSATION_TRIGGERED'
  | 'COMPENSATION_COMPLETED'
  | 'COMPENSATION_FAILED'
  | 'STATE_SNAPSHOT'
  | 'STATE_UPDATED'
  | 'ROLLBACK_INITIATED'
  | 'ROLLBACK_COMPLETED'
  | 'ROLLBACK_FAILED'
  | 'ROLLBACK_POLICY_DECISION'
  | 'FAULT_INJECTED'
  | 'LLM_PROMPT_GENERATED'
  | 'LLM_RESPONSE_RECEIVED'
  | 'DEPLOYMENT_VERSION_CREATED'
  | 'DEPLOYMENT_INITIATED'
  | 'DEPLOYMENT_APPROVED'
  | 'DEPLOYMENT_REJECTED'
  | 'DEPLOYMENT_COMPLETED'
  | 'DEPLOYMENT_FAILED'
  | 'DEPLOYMENT_TEST_RUN'
  | 'DEPLOYMENT_PROMOTED'
  | 'DEPLOYMENT_GATE_CHECK'
  | 'DEPLOYMENT_GATE_FAILED'
  | 'DEPLOYMENT_PROMOTION_BLOCKED'
  | 'DEPLOYMENT_ROLLBACK_TRIGGERED'
  | 'DEPLOYMENT_ROLLBACK_COMPLETED';

export interface Event {
  timestamp: Date;
  type: EventType;
  workflowId: string;
  taskId?: string;
  tenantId?: string; // Optional tenant identifier for multi-tenancy
  data?: Record<string, unknown>;
  metadata?: {
    attempt?: number;
    error?: string;
    duration?: number;
    compensationFor?: string; // Task ID being compensated
    snapshotId?: string; // State snapshot ID
    crvGateResult?: {
      passed: boolean;
      gateName: string;
      blockedCommit: boolean;
    };
    crvBlocked?: boolean; // Whether CRV gate blocked the commit
    crvRecovery?: {
      strategyType: string;
      success: boolean;
      message: string;
      error?: string;
    };
    recoveryAttempted?: boolean; // Whether recovery was attempted
    recoverySuccess?: boolean; // Whether recovery succeeded
    policyDecision?: {
      allowed: boolean;
      reason: string;
      requiresHumanApproval: boolean;
      approvalToken?: string;
    };
    policyBlocked?: boolean; // Whether policy gate blocked the action
    feasibilityCheck?: {
      feasible: boolean;
      reasons: string[];
      confidenceScore?: number;
      toolCapabilityCheck?: {
        available: boolean;
        missingCapabilities?: string[];
      };
    };
    feasibilityBlocked?: boolean; // Whether feasibility check blocked the action
    feasibilityReasons?: string[]; // Reasons for feasibility failure
    stateDiff?: Array<{
      key: string;
      before: unknown | null;
      after: unknown | null;
      operation: 'create' | 'update' | 'delete';
      timestamp: Date;
    }>; // State differences
    stateConflicts?: Array<{
      key: string;
      expectedVersion: number;
      actualVersion: number;
      attemptedValue: unknown;
      timestamp: Date;
    }>; // State conflicts detected
    faultId?: string; // Unique identifier for injected fault
    faultType?: string; // Type of fault injected
    toolName?: string; // Tool name for fault injection
    config?: Record<string, unknown>; // Fault configuration
    ruleIndex?: number; // Index of the rule that triggered the fault
  };
}

/**
 * EventLog interface for persisting workflow events
 */
export interface EventLog {
  append(event: Event): Promise<void>;
  read(workflowId: string, tenantId?: string): Promise<Event[]>;
  // Read all events for a specific tenant
  readByTenant?(tenantId: string): Promise<Event[]>;
  // Export events for compliance (e.g., audit trail export)
  exportEvents?(tenantId: string, startDate?: Date, endDate?: Date): Promise<Event[]>;
}

/**
 * CompensationExecutor interface for executing compensation actions
 */
export interface CompensationExecutor {
  execute(action: CompensationAction, workflowId: string, taskId: string): Promise<void>;
}

/**
 * Deployment environment types
 */
export type DeploymentEnvironment = 'staging' | 'production';

/**
 * Deployment status types
 */
export type DeploymentStatus = 'pending' | 'testing' | 'approved' | 'rejected' | 'deployed' | 'failed' | 'rolled_back';

/**
 * WorkflowVersion represents a versioned workflow deployment
 */
export interface WorkflowVersion {
  id: string; // Unique version ID
  workflowId: string; // Original workflow ID
  version: string; // Semantic version (e.g., "1.0.0")
  spec: WorkflowSpec; // The workflow specification
  createdAt: Date;
  createdBy: string;
  metadata?: Record<string, unknown>;
}

/**
 * Deployment represents a workflow deployment to an environment
 */
export interface Deployment {
  id: string; // Unique deployment ID
  versionId: string; // Reference to WorkflowVersion
  environment: DeploymentEnvironment;
  status: DeploymentStatus;
  deployedAt?: Date;
  deployedBy?: string;
  approvals: DeploymentApproval[];
  testResults?: TestResult[];
  gateChecks?: DeploymentGateCheck[]; // Gate validation results
  rollbackSnapshotId?: string; // Snapshot to rollback to
  rollbackTriggers?: RollbackTrigger[]; // Automatic rollback triggers
  thresholds?: DeploymentThresholds; // Promotion thresholds
  metadata?: Record<string, unknown>;
}

/**
 * DeploymentApproval represents an approval for a deployment
 */
export interface DeploymentApproval {
  approver: string; // User or service that approved
  approvedAt: Date;
  riskTier: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  comment?: string;
  token: string; // Approval token
}

/**
 * TestResult represents the result of a smoke test
 */
export interface TestResult {
  id: string;
  testName: string;
  status: 'passed' | 'failed' | 'skipped';
  executedAt: Date;
  duration?: number;
  error?: string;
  metadata?: Record<string, unknown>;
}

/**
 * DeploymentGateCheck represents gate validation results for a deployment
 */
export interface DeploymentGateCheck {
  id: string;
  deploymentId: string;
  timestamp: Date;
  crvPassPercentage: number; // Percentage of CRV checks that passed
  policyApprovalsMet: boolean; // Whether policy approval requirements are met
  testPassRate: number; // Percentage of tests that passed
  overallStatus: 'passed' | 'failed' | 'warning';
  blockedPromotion: boolean; // Whether promotion is blocked
  failureReasons: string[]; // Reasons for gate check failure
  metadata?: Record<string, unknown>;
}

/**
 * DeploymentThresholds defines minimum requirements for deployment promotion
 */
export interface DeploymentThresholds {
  minCrvPassPercentage: number; // Minimum CRV pass percentage (0-100)
  requirePolicyApprovals: boolean; // Whether policy approvals are required
  minTestPassRate: number; // Minimum test pass rate (0-100)
  blockOnFailure: boolean; // Whether to block promotion on failure
}

/**
 * RollbackTrigger represents a trigger for automatic rollback
 */
export interface RollbackTrigger {
  id: string;
  deploymentId: string;
  triggeredAt: Date;
  reason: string;
  snapshotId: string; // HipCortex snapshot to rollback to
  status: 'pending' | 'executing' | 'completed' | 'failed';
  completedAt?: Date;
  error?: string;
  metadata?: Record<string, unknown>;
}
