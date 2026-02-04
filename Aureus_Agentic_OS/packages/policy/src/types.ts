/**
 * Risk tiers for action classification
 */
export enum RiskTier {
  LOW = 'low',           // Read-only, no side effects
  MEDIUM = 'medium',     // Reversible changes
  HIGH = 'high',         // Significant changes, may require approval
  CRITICAL = 'critical'  // Irreversible, requires human approval
}

/**
 * Data zones for resource isolation
 */
export enum DataZone {
  PUBLIC = 'public',         // Publicly accessible data
  INTERNAL = 'internal',     // Internal organizational data
  CONFIDENTIAL = 'confidential', // Confidential/sensitive data
  RESTRICTED = 'restricted'  // Highly restricted data
}

/**
 * Allowed intents for actions
 */
export enum Intent {
  READ = 'read',           // Read-only operations
  WRITE = 'write',         // Write/modify operations
  DELETE = 'delete',       // Delete operations
  EXECUTE = 'execute',     // Execute/run operations
  ADMIN = 'admin'          // Administrative operations
}

/**
 * Permission model for action authorization
 */
export interface Permission {
  action: string;
  resource: string;
  intent?: Intent; // Optional intent restriction
  dataZone?: DataZone; // Optional data zone restriction
  conditions?: Record<string, unknown>;
}

/**
 * Action definition with risk classification
 */
export interface Action {
  id: string;
  name: string;
  riskTier: RiskTier;
  requiredPermissions: Permission[];
  intent?: Intent; // The intent of this action
  dataZone?: DataZone; // The data zone this action operates in
  allowedTools?: string[]; // List of allowed tools for this action
  metadata?: Record<string, unknown>;
}

/**
 * FSM state for goal-guard
 */
export enum GoalGuardState {
  IDLE = 'idle',
  EVALUATING = 'evaluating',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  PENDING_HUMAN = 'pending_human'
}

/**
 * Goal-guard decision result
 */
export interface GuardDecision {
  allowed: boolean;
  reason: string;
  requiresHumanApproval: boolean;
  approvalToken?: string; // Token required for approval
  metadata?: Record<string, unknown>;
}

/**
 * Principal (actor) attempting an action
 */
export interface Principal {
  id: string;
  type: 'agent' | 'human' | 'service';
  permissions: Permission[];
}

/**
 * Context for policy evaluation
 */
export interface PolicyContext {
  principal: Principal;
  action: Action;
  currentState: GoalGuardState;
  auditLog: AuditEntry[];
}

/**
 * Audit entry for action tracking (invariant 5: Auditability)
 */
export interface AuditEntry {
  timestamp: Date;
  principal: Principal;
  action: Action;
  decision: GuardDecision;
  stateTransition?: {
    from: GoalGuardState;
    to: GoalGuardState;
  };
  approvalToken?: string; // Token used for approval
}

/**
 * Approval token for HIGH/CRITICAL risk actions
 */
export interface ApprovalToken {
  token: string;
  actionId: string;
  principal: Principal;
  expiresAt: Date;
  used: boolean;
}
