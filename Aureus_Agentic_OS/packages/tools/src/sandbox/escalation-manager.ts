/**
 * Escalation manager for policy-guarded privilege escalation
 * Handles permission escalation requests with human approval
 */

import { GoalGuardFSM, Principal, Action, RiskTier } from '@aureus/policy';
import {
  EscalationRequest,
  EscalationResponse,
  SandboxPermissions,
  PermissionCheckResult,
} from './types';
import { SandboxAuditLogger } from './audit-logger';

/**
 * Escalation handler interface for custom approval workflows
 */
export interface EscalationHandler {
  /**
   * Handle an escalation request
   * Returns a promise that resolves when approval/denial is received
   */
  handle(request: EscalationRequest): Promise<EscalationResponse>;
}

/**
 * Mock escalation handler for testing (auto-approves based on criteria)
 */
export class MockEscalationHandler implements EscalationHandler {
  private autoApproveAll: boolean;

  constructor(autoApproveAll: boolean = false) {
    this.autoApproveAll = autoApproveAll;
  }

  async handle(request: EscalationRequest): Promise<EscalationResponse> {
    // Simulate some processing delay
    await new Promise(resolve => setTimeout(resolve, 10));

    if (this.autoApproveAll) {
      return {
        approved: true,
        approvalToken: `token-${request.id}`,
        decidedBy: 'mock-approver',
        timestamp: new Date(),
      };
    }

    // Auto-deny by default in testing
    return {
      approved: false,
      reason: 'Mock handler: auto-denied for testing',
      decidedBy: 'mock-approver',
      timestamp: new Date(),
    };
  }
}

/**
 * Human approval escalation handler (placeholder)
 */
export class HumanApprovalHandler implements EscalationHandler {
  async handle(request: EscalationRequest): Promise<EscalationResponse> {
    // This is a placeholder - in production, would integrate with:
    // - Notification system to alert operators
    // - Approval UI/API for human decision
    // - Timeout mechanism for abandoned requests
    
    console.log('Human approval required for escalation:', request);
    
    return {
      approved: false,
      reason: 'Human approval handler not implemented - requires integration with approval system',
      decidedBy: 'system',
      timestamp: new Date(),
    };
  }
}

/**
 * Escalation manager - coordinates permission escalation with policy enforcement
 */
export class EscalationManager {
  private policyGuard?: GoalGuardFSM;
  private auditLogger?: SandboxAuditLogger;
  private handler: EscalationHandler;
  private pendingRequests = new Map<string, EscalationRequest>();
  private requestIdCounter = 0;

  constructor(
    handler: EscalationHandler,
    policyGuard?: GoalGuardFSM,
    auditLogger?: SandboxAuditLogger
  ) {
    this.handler = handler;
    this.policyGuard = policyGuard;
    this.auditLogger = auditLogger;
  }

  /**
   * Request permission escalation
   */
  async requestEscalation(
    permissionType: EscalationRequest['permissionType'],
    details: Record<string, unknown>,
    justification: string,
    toolId: string,
    workflowId: string,
    taskId: string,
    principal?: Principal
  ): Promise<EscalationResponse> {
    // Create escalation request
    const request: EscalationRequest = {
      id: this.generateRequestId(),
      permissionType,
      details,
      justification,
      toolId,
      context: {
        workflowId,
        taskId,
        timestamp: new Date(),
      },
    };

    // Track pending request
    this.pendingRequests.set(request.id, request);

    // Audit log
    if (this.auditLogger) {
      this.auditLogger.logEscalationRequest(request);
    }

    // Check policy if available
    if (this.policyGuard && principal) {
      const action = this.createEscalationAction(permissionType, details);
      const policyDecision = await this.policyGuard.evaluate(
        principal,
        action,
        toolId,
        workflowId,
        taskId
      );

      // If policy denies escalation, reject immediately
      if (!policyDecision.allowed) {
        const response: EscalationResponse = {
          approved: false,
          reason: `Policy denied escalation: ${policyDecision.reason}`,
          decidedBy: 'policy-guard',
          timestamp: new Date(),
        };

        this.completeRequest(request, response);
        return response;
      }

      // If policy requires human approval, proceed to handler
      if (!policyDecision.requiresHumanApproval) {
        // Policy allows without human approval
        const response: EscalationResponse = {
          approved: true,
          approvalToken: `policy-${request.id}`,
          decidedBy: 'policy-guard',
          timestamp: new Date(),
        };

        this.completeRequest(request, response);
        return response;
      }
    }

    // Route to escalation handler (e.g., human approval)
    const response = await this.handler.handle(request);
    this.completeRequest(request, response);

    return response;
  }

  /**
   * Apply approved escalation to sandbox permissions
   */
  applyEscalation(
    permissions: SandboxPermissions,
    request: EscalationRequest,
    response: EscalationResponse
  ): SandboxPermissions {
    if (!response.approved) {
      return permissions; // No changes if not approved
    }

    // Clone permissions for modification
    const updated: SandboxPermissions = JSON.parse(JSON.stringify(permissions));

    switch (request.permissionType) {
      case 'filesystem':
        this.applyFilesystemEscalation(updated, request.details);
        break;

      case 'network':
        this.applyNetworkEscalation(updated, request.details);
        break;

      case 'resource':
        this.applyResourceEscalation(updated, request.details);
        break;

      case 'capability':
        this.applyCapabilityEscalation(updated, request.details);
        break;
    }

    return updated;
  }

  /**
   * Get pending escalation request
   */
  getPendingRequest(requestId: string): EscalationRequest | undefined {
    return this.pendingRequests.get(requestId);
  }

  /**
   * List all pending requests
   */
  listPendingRequests(): EscalationRequest[] {
    return Array.from(this.pendingRequests.values());
  }

  private completeRequest(request: EscalationRequest, response: EscalationResponse): void {
    this.pendingRequests.delete(request.id);

    // Audit log
    if (this.auditLogger) {
      this.auditLogger.logEscalationResponse(request, response);
    }
  }

  private applyFilesystemEscalation(
    permissions: SandboxPermissions,
    details: Record<string, unknown>
  ): void {
    const path = details.path as string;
    const access = details.access as 'read' | 'write';

    if (!path) return;

    if (access === 'write') {
      if (!permissions.filesystem.readWritePaths) {
        permissions.filesystem.readWritePaths = [];
      }
      permissions.filesystem.readWritePaths.push(path);
    } else {
      if (!permissions.filesystem.readOnlyPaths) {
        permissions.filesystem.readOnlyPaths = [];
      }
      permissions.filesystem.readOnlyPaths.push(path);
    }

    // Remove from denied paths if present
    if (permissions.filesystem.deniedPaths) {
      permissions.filesystem.deniedPaths = permissions.filesystem.deniedPaths.filter(
        p => p !== path
      );
    }
  }

  private applyNetworkEscalation(
    permissions: SandboxPermissions,
    details: Record<string, unknown>
  ): void {
    // Enable network if not already enabled
    permissions.network.enabled = true;

    const domain = details.domain as string;
    const ip = details.ip as string;
    const port = details.port as number;

    if (domain) {
      if (!permissions.network.allowedDomains) {
        permissions.network.allowedDomains = [];
      }
      permissions.network.allowedDomains.push(domain);

      // Remove from denied domains if present
      if (permissions.network.deniedDomains) {
        permissions.network.deniedDomains = permissions.network.deniedDomains.filter(
          d => d !== domain
        );
      }
    }

    if (ip) {
      if (!permissions.network.allowedIpRanges) {
        permissions.network.allowedIpRanges = [];
      }
      permissions.network.allowedIpRanges.push(ip);
    }

    if (port) {
      if (!permissions.network.allowedPorts) {
        permissions.network.allowedPorts = [];
      }
      permissions.network.allowedPorts.push(port);
    }
  }

  private applyResourceEscalation(
    permissions: SandboxPermissions,
    details: Record<string, unknown>
  ): void {
    const resourceType = details.resourceType as string;
    const newLimit = details.newLimit as number;

    if (!resourceType || newLimit === undefined) return;

    switch (resourceType) {
      case 'cpu':
        permissions.resources.maxCpu = newLimit;
        break;
      case 'memory':
        permissions.resources.maxMemory = newLimit;
        break;
      case 'execution_time':
        permissions.resources.maxExecutionTime = newLimit;
        break;
      case 'processes':
        permissions.resources.maxProcesses = newLimit;
        break;
    }
  }

  private applyCapabilityEscalation(
    permissions: SandboxPermissions,
    details: Record<string, unknown>
  ): void {
    const capability = details.capability as string;

    if (!capability) return;

    if (!permissions.capabilities) {
      permissions.capabilities = [];
    }

    if (!permissions.capabilities.includes(capability)) {
      permissions.capabilities.push(capability);
    }
  }

  private createEscalationAction(
    permissionType: EscalationRequest['permissionType'],
    details: Record<string, unknown>
  ): Action {
    // Determine risk tier based on permission type
    let riskTier = RiskTier.MEDIUM;
    
    if (permissionType === 'filesystem' && details.access === 'write') {
      riskTier = RiskTier.HIGH;
    } else if (permissionType === 'network') {
      riskTier = RiskTier.HIGH;
    } else if (permissionType === 'capability') {
      riskTier = RiskTier.HIGH;
    }

    return {
      id: `escalate-${permissionType}`,
      name: `Escalate ${permissionType} permission`,
      riskTier,
      requiredPermissions: [
        {
          action: 'escalate',
          resource: permissionType,
        },
      ],
      allowedTools: [], // Escalation applies to tool execution
      metadata: {
        escalationType: permissionType,
        details,
      },
    };
  }

  private generateRequestId(): string {
    this.requestIdCounter++;
    return `escalation-${Date.now()}-${this.requestIdCounter}`;
  }
}
