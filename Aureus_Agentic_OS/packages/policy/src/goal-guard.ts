import {
  Action,
  Principal,
  Permission,
  RiskTier,
  GoalGuardState,
  GuardDecision,
  PolicyContext,
  AuditEntry,
  ApprovalToken,
  DataZone,
} from './types';
import { TelemetryCollector } from '@aureus/observability';
import { MCPActionPolicyRule } from './mcp-action-policy';

// Data zone hierarchy for permission checks (static to avoid recreation)
const DATA_ZONE_HIERARCHY = ['public', 'internal', 'confidential', 'restricted'] as const;

/**
 * GoalGuardFSM implements the finite state machine for action gating
 * Guarantees: Governance (invariant 4) and Auditability (invariant 5)
 */
export class GoalGuardFSM {
  private state: GoalGuardState = GoalGuardState.IDLE;
  private auditLog: AuditEntry[] = [];
  private pendingApprovals: Map<string, ApprovalToken> = new Map();
  private usedTokens: Set<string> = new Set();
  private telemetry?: TelemetryCollector;
  private mcpPolicy: MCPActionPolicyRule;

  constructor(telemetry?: TelemetryCollector) {
    this.telemetry = telemetry;
    this.mcpPolicy = new MCPActionPolicyRule();
  }

  /**
   * Evaluate an action and determine if it should be allowed
   * Gates risky actions based on risk tier and permissions (invariant 4)
   * Also validates allowed tools, intents, and data zones
   * 
   * @param principal The principal requesting the action
   * @param action The action to evaluate
   * @param toolName Optional tool name to validate against allowed tools
   * @param workflowId Optional workflow ID for telemetry
   * @param taskId Optional task ID for telemetry
   */
  async evaluate(
    principal: Principal,
    action: Action,
    toolName?: string,
    workflowId?: string,
    taskId?: string
  ): Promise<GuardDecision> {
    // Transition to evaluating state
    this.transitionTo(GoalGuardState.EVALUATING);

    const context: PolicyContext = {
      principal,
      action,
      currentState: this.state,
      auditLog: this.auditLog,
    };

    // Check if tool is allowed for this action
    if (toolName && action.allowedTools && action.allowedTools.length > 0) {
      if (!action.allowedTools.includes(toolName)) {
        const decision: GuardDecision = {
          allowed: false,
          reason: `Tool '${toolName}' is not allowed for this action. Allowed tools: ${action.allowedTools.join(', ')}`,
          requiresHumanApproval: false,
        };
        
        this.transitionTo(GoalGuardState.REJECTED);
        this.audit(principal, action, decision);
        
        // Record telemetry before returning
        this.recordTelemetry(action, decision, workflowId, taskId);
        
        return decision;
      }
    }

    // Check permissions, intent, and data zones
    const hasPermissions = this.checkPermissions(principal, action);
    if (!hasPermissions) {
      const decision: GuardDecision = {
        allowed: false,
        reason: 'Insufficient permissions, intent mismatch, or data zone violation',
        requiresHumanApproval: false,
      };
      
      this.transitionTo(GoalGuardState.REJECTED);
      this.audit(principal, action, decision);
      
      // Record telemetry before returning
      this.recordTelemetry(action, decision, workflowId, taskId);
      
      return decision;
    }

    // Check if this is an MCP action and apply MCP-specific policy
    let decision: GuardDecision;
    if (this.mcpPolicy.isMCPAction(action)) {
      decision = this.mcpPolicy.evaluateMCPAction(principal, action);
    } else {
      // Check risk tier and apply standard governance rules
      decision = await this.evaluateRisk(action);
    }
    
    if (decision.requiresHumanApproval) {
      this.transitionTo(GoalGuardState.PENDING_HUMAN);
    } else if (decision.allowed) {
      this.transitionTo(GoalGuardState.APPROVED);
    } else {
      this.transitionTo(GoalGuardState.REJECTED);
    }

    this.audit(principal, action, decision);
    
    // Record telemetry
    this.recordTelemetry(action, decision, workflowId, taskId);
    
    return decision;
  }

  /**
   * Record telemetry for policy check
   */
  private recordTelemetry(
    action: Action,
    decision: GuardDecision,
    workflowId?: string,
    taskId?: string
  ): void {
    // Record telemetry if available
    // Use provided workflowId/taskId or fall back to action metadata
    if (this.telemetry) {
      const effectiveWorkflowId = workflowId || action.metadata?.workflowId;
      const effectiveTaskId = taskId || action.metadata?.taskId;
      
      if (typeof effectiveWorkflowId === 'string' && typeof effectiveTaskId === 'string') {
        this.telemetry.recordPolicyCheck(
          effectiveWorkflowId,
          effectiveTaskId,
          decision.allowed,
          decision.requiresHumanApproval || false,
          decision.reason
        );
      }
    }
  }

  /**
   * Check if principal has required permissions
   * Also validates intent and data zone restrictions
   */
  private checkPermissions(principal: Principal, action: Action): boolean {
    for (const required of action.requiredPermissions) {
      const hasPermission = principal.permissions.some(p => {
        // Check action and resource match
        const actionMatch = p.action === required.action;
        const resourceMatch = p.resource === required.resource;
        
        if (!actionMatch || !resourceMatch) {
          return false;
        }
        
        // Check intent if specified
        if (required.intent && p.intent && p.intent !== required.intent) {
          return false;
        }
        
        // Check data zone if specified
        if (required.dataZone && p.dataZone) {
          // Principal can only access data zones at or below their level
          const principalLevel = DATA_ZONE_HIERARCHY.indexOf(p.dataZone);
          const requiredLevel = DATA_ZONE_HIERARCHY.indexOf(required.dataZone);
          
          if (principalLevel < requiredLevel) {
            return false;
          }
        }
        
        return true;
      });
      
      if (!hasPermission) {
        return false;
      }
    }
    
    return true;
  }

  /**
   * Evaluate risk tier and determine if action should be gated
   * CRITICAL and HIGH risk actions are gated (invariant 4)
   */
  private async evaluateRisk(action: Action): Promise<GuardDecision> {
    switch (action.riskTier) {
      case RiskTier.LOW:
        return {
          allowed: true,
          reason: 'Low risk action approved',
          requiresHumanApproval: false,
        };
      
      case RiskTier.MEDIUM:
        return {
          allowed: true,
          reason: 'Medium risk action approved with monitoring',
          requiresHumanApproval: false,
        };
      
      case RiskTier.HIGH:
      case RiskTier.CRITICAL: {
        // High and critical risk requires human approval with token
        const approvalToken = this.generateApprovalToken(action);
        return {
          allowed: false,
          reason: `${action.riskTier === RiskTier.CRITICAL ? 'Critical' : 'High risk'} action requires explicit human approval`,
          requiresHumanApproval: true,
          approvalToken: approvalToken.token,
        };
      }
      
      default:
        return {
          allowed: false,
          reason: 'Unknown risk tier',
          requiresHumanApproval: true,
        };
    }
  }

  /**
   * Transition FSM to new state
   */
  private transitionTo(newState: GoalGuardState): void {
    const oldState = this.state;
    this.state = newState;
    
    // Log state transition for auditability
    console.log(`GoalGuard FSM: ${oldState} -> ${newState}`);
  }

  /**
   * Audit action and decision (invariant 5: Auditability)
   * All actions and state diffs are logged and traceable
   */
  private audit(principal: Principal, action: Action, decision: GuardDecision, approvalToken?: string): void {
    const entry: AuditEntry = {
      timestamp: new Date(),
      principal,
      action,
      decision,
      stateTransition: {
        from: GoalGuardState.EVALUATING,
        to: this.state,
      },
      approvalToken,
    };
    
    this.auditLog.push(entry);
  }

  /**
   * Generate an approval token for HIGH/CRITICAL risk actions
   */
  private generateApprovalToken(action: Action): ApprovalToken {
    // Use cryptographically secure random token generation
    const randomPart = typeof crypto !== 'undefined' && crypto.randomUUID 
      ? crypto.randomUUID().replace(/-/g, '')
      : Math.random().toString(36).substring(2, 11) + Math.random().toString(36).substring(2, 11);
    
    const token = `approval-${action.id}-${Date.now()}-${randomPart}`;
    const approvalToken: ApprovalToken = {
      token,
      actionId: action.id,
      principal: { id: 'system', type: 'service', permissions: [] },
      expiresAt: new Date(Date.now() + 3600000), // 1 hour expiry
      used: false,
    };
    
    this.pendingApprovals.set(action.id, approvalToken);
    return approvalToken;
  }

  /**
   * Validate and consume an approval token
   */
  validateApprovalToken(actionId: string, token: string): boolean {
    const approval = this.pendingApprovals.get(actionId);
    
    if (!approval) {
      return false;
    }
    
    if (approval.token !== token) {
      return false;
    }
    
    if (approval.used) {
      return false;
    }
    
    if (approval.expiresAt < new Date()) {
      return false;
    }
    
    // Mark token as used
    approval.used = true;
    this.usedTokens.add(token);
    
    return true;
  }

  /**
   * Get current state
   */
  getState(): GoalGuardState {
    return this.state;
  }

  /**
   * Get audit log (for compliance and debugging)
   */
  getAuditLog(): AuditEntry[] {
    return [...this.auditLog];
  }

  /**
   * Reset FSM to idle state
   */
  reset(): void {
    this.state = GoalGuardState.IDLE;
  }

  /**
   * Approve a pending human action (simulates human approval)
   * Now requires an approval token for HIGH/CRITICAL risk actions
   */
  approveHumanAction(actionId: string, token: string): boolean {
    if (this.state !== GoalGuardState.PENDING_HUMAN) {
      return false;
    }
    
    if (!this.validateApprovalToken(actionId, token)) {
      return false;
    }
    
    this.transitionTo(GoalGuardState.APPROVED);
    return true;
  }

  /**
   * Reject a pending human action
   */
  rejectHumanAction(): void {
    if (this.state === GoalGuardState.PENDING_HUMAN) {
      this.transitionTo(GoalGuardState.REJECTED);
    }
  }

  /**
   * Get a pending approval token for an action
   */
  getPendingApproval(actionId: string): ApprovalToken | undefined {
    return this.pendingApprovals.get(actionId);
  }
}
