/**
 * Audit logging for sandbox tool executions
 * Records all tool access attempts, permissions checks, and resource usage
 */

import { TelemetryCollector, TelemetryEventType } from '@aureus/observability';
import {
  SandboxConfig,
  PermissionCheckResult,
  EscalationRequest,
  EscalationResponse,
  SandboxExecutionResult,
} from './types';

/**
 * Audit event types specific to sandbox operations
 */
export enum SandboxAuditEventType {
  SANDBOX_CREATED = 'sandbox_created',
  SANDBOX_DESTROYED = 'sandbox_destroyed',
  PERMISSION_CHECK = 'permission_check',
  PERMISSION_DENIED = 'permission_denied',
  ESCALATION_REQUESTED = 'escalation_requested',
  ESCALATION_APPROVED = 'escalation_approved',
  ESCALATION_DENIED = 'escalation_denied',
  TOOL_EXECUTION_START = 'tool_execution_start',
  TOOL_EXECUTION_END = 'tool_execution_end',
  RESOURCE_LIMIT_EXCEEDED = 'resource_limit_exceeded',
  SECURITY_VIOLATION = 'security_violation',
}

/**
 * Audit log entry for sandbox operations
 */
export interface SandboxAuditEntry {
  /**
   * Unique ID for this audit entry
   */
  id: string;
  
  /**
   * Type of audit event
   */
  eventType: SandboxAuditEventType;
  
  /**
   * Timestamp of the event
   */
  timestamp: Date;
  
  /**
   * Workflow context
   */
  workflowId: string;
  
  /**
   * Task context
   */
  taskId: string;
  
  /**
   * Tool that triggered the event
   */
  toolId?: string;
  
  /**
   * Sandbox ID involved
   */
  sandboxId?: string;
  
  /**
   * Principal (user/agent) performing the action
   */
  principalId?: string;
  
  /**
   * Event-specific data
   */
  data: Record<string, unknown>;
  
  /**
   * Severity level
   */
  severity: 'info' | 'warning' | 'error' | 'critical';
  
  /**
   * Tags for filtering and querying
   */
  tags?: Record<string, string>;
}

/**
 * Audit logger for sandbox operations
 * Integrates with TelemetryCollector and maintains separate audit trail
 */
export class SandboxAuditLogger {
  private auditLog: SandboxAuditEntry[] = [];
  private telemetry?: TelemetryCollector;
  private idCounter = 0;

  constructor(telemetry?: TelemetryCollector) {
    this.telemetry = telemetry;
  }

  /**
   * Record sandbox creation
   */
  logSandboxCreated(
    workflowId: string,
    taskId: string,
    sandboxId: string,
    config: SandboxConfig,
    principalId?: string
  ): void {
    const entry: SandboxAuditEntry = {
      id: this.generateId(),
      eventType: SandboxAuditEventType.SANDBOX_CREATED,
      timestamp: new Date(),
      workflowId,
      taskId,
      sandboxId,
      principalId,
      data: {
        sandboxType: config.type,
        permissions: config.permissions,
        baseImage: config.baseImage,
        persistent: config.persistent,
      },
      severity: 'info',
      tags: {
        sandboxType: config.type,
      },
    };

    this.recordEntry(entry);
  }

  /**
   * Record sandbox destruction
   */
  logSandboxDestroyed(
    workflowId: string,
    taskId: string,
    sandboxId: string,
    reason: string,
    resourceUsage?: Record<string, unknown>
  ): void {
    const entry: SandboxAuditEntry = {
      id: this.generateId(),
      eventType: SandboxAuditEventType.SANDBOX_DESTROYED,
      timestamp: new Date(),
      workflowId,
      taskId,
      sandboxId,
      data: {
        reason,
        resourceUsage,
      },
      severity: 'info',
    };

    this.recordEntry(entry);
  }

  /**
   * Record permission check
   */
  logPermissionCheck(
    workflowId: string,
    taskId: string,
    toolId: string,
    sandboxId: string,
    permissionType: string,
    details: Record<string, unknown>,
    result: PermissionCheckResult,
    principalId?: string
  ): void {
    const entry: SandboxAuditEntry = {
      id: this.generateId(),
      eventType: result.granted
        ? SandboxAuditEventType.PERMISSION_CHECK
        : SandboxAuditEventType.PERMISSION_DENIED,
      timestamp: new Date(),
      workflowId,
      taskId,
      toolId,
      sandboxId,
      principalId,
      data: {
        permissionType,
        details,
        granted: result.granted,
        reason: result.reason,
        canEscalate: result.canEscalate,
        policyDecision: result.policyDecision,
      },
      severity: result.granted ? 'info' : 'warning',
      tags: {
        permissionType,
        granted: String(result.granted),
      },
    };

    this.recordEntry(entry);

    // Also record in telemetry if available
    if (this.telemetry) {
      this.telemetry.recordEvent({
        type: TelemetryEventType.POLICY_CHECK,
        timestamp: new Date(),
        workflowId,
        taskId,
        data: {
          toolId,
          sandboxId,
          permissionType,
          granted: result.granted,
          reason: result.reason,
        },
      });
    }
  }

  /**
   * Record escalation request
   */
  logEscalationRequest(
    request: EscalationRequest
  ): void {
    const entry: SandboxAuditEntry = {
      id: this.generateId(),
      eventType: SandboxAuditEventType.ESCALATION_REQUESTED,
      timestamp: new Date(),
      workflowId: request.context.workflowId,
      taskId: request.context.taskId,
      toolId: request.toolId,
      data: {
        requestId: request.id,
        permissionType: request.permissionType,
        details: request.details,
        justification: request.justification,
      },
      severity: 'warning',
      tags: {
        permissionType: request.permissionType,
        escalationId: request.id,
      },
    };

    this.recordEntry(entry);
  }

  /**
   * Record escalation response
   */
  logEscalationResponse(
    request: EscalationRequest,
    response: EscalationResponse
  ): void {
    const entry: SandboxAuditEntry = {
      id: this.generateId(),
      eventType: response.approved
        ? SandboxAuditEventType.ESCALATION_APPROVED
        : SandboxAuditEventType.ESCALATION_DENIED,
      timestamp: new Date(),
      workflowId: request.context.workflowId,
      taskId: request.context.taskId,
      toolId: request.toolId,
      data: {
        requestId: request.id,
        approved: response.approved,
        approvalToken: response.approvalToken,
        reason: response.reason,
        decidedBy: response.decidedBy,
        responseTimestamp: response.timestamp,
      },
      severity: response.approved ? 'info' : 'warning',
      tags: {
        escalationId: request.id,
        approved: String(response.approved),
      },
    };

    this.recordEntry(entry);
  }

  /**
   * Record tool execution start in sandbox
   */
  logToolExecutionStart(
    workflowId: string,
    taskId: string,
    toolId: string,
    sandboxId: string,
    params: Record<string, unknown>,
    principalId?: string
  ): void {
    const entry: SandboxAuditEntry = {
      id: this.generateId(),
      eventType: SandboxAuditEventType.TOOL_EXECUTION_START,
      timestamp: new Date(),
      workflowId,
      taskId,
      toolId,
      sandboxId,
      principalId,
      data: {
        params,
      },
      severity: 'info',
    };

    this.recordEntry(entry);

    // Also record in telemetry
    if (this.telemetry) {
      this.telemetry.recordToolCall(workflowId, taskId, toolId, params);
    }
  }

  /**
   * Record tool execution end in sandbox
   */
  logToolExecutionEnd(
    workflowId: string,
    taskId: string,
    toolId: string,
    sandboxId: string,
    result: SandboxExecutionResult,
    principalId?: string
  ): void {
    const entry: SandboxAuditEntry = {
      id: this.generateId(),
      eventType: SandboxAuditEventType.TOOL_EXECUTION_END,
      timestamp: new Date(),
      workflowId,
      taskId,
      toolId,
      sandboxId,
      principalId,
      data: {
        success: result.success,
        error: result.error,
        executionTime: result.metadata?.executionTime,
        resourceUsage: result.metadata?.resourceUsage,
        permissionViolations: result.metadata?.permissionViolations,
        resourceLimitExceeded: result.metadata?.resourceLimitExceeded,
      },
      severity: result.success ? 'info' : 'error',
      tags: {
        success: String(result.success),
      },
    };

    this.recordEntry(entry);
  }

  /**
   * Record resource limit exceeded
   */
  logResourceLimitExceeded(
    workflowId: string,
    taskId: string,
    toolId: string,
    sandboxId: string,
    limitType: string,
    limitValue: number,
    actualValue: number
  ): void {
    const entry: SandboxAuditEntry = {
      id: this.generateId(),
      eventType: SandboxAuditEventType.RESOURCE_LIMIT_EXCEEDED,
      timestamp: new Date(),
      workflowId,
      taskId,
      toolId,
      sandboxId,
      data: {
        limitType,
        limitValue,
        actualValue,
      },
      severity: 'warning',
      tags: {
        limitType,
      },
    };

    this.recordEntry(entry);
  }

  /**
   * Record security violation
   */
  logSecurityViolation(
    workflowId: string,
    taskId: string,
    toolId: string,
    sandboxId: string,
    violationType: string,
    details: Record<string, unknown>,
    principalId?: string
  ): void {
    const entry: SandboxAuditEntry = {
      id: this.generateId(),
      eventType: SandboxAuditEventType.SECURITY_VIOLATION,
      timestamp: new Date(),
      workflowId,
      taskId,
      toolId,
      sandboxId,
      principalId,
      data: {
        violationType,
        details,
      },
      severity: 'critical',
      tags: {
        violationType,
      },
    };

    this.recordEntry(entry);
  }

  /**
   * Get all audit entries
   */
  getAuditLog(): SandboxAuditEntry[] {
    return [...this.auditLog];
  }

  /**
   * Get audit entries by event type
   */
  getAuditLogByType(eventType: SandboxAuditEventType): SandboxAuditEntry[] {
    return this.auditLog.filter(entry => entry.eventType === eventType);
  }

  /**
   * Get audit entries by workflow
   */
  getAuditLogByWorkflow(workflowId: string): SandboxAuditEntry[] {
    return this.auditLog.filter(entry => entry.workflowId === workflowId);
  }

  /**
   * Get audit entries by sandbox
   */
  getAuditLogBySandbox(sandboxId: string): SandboxAuditEntry[] {
    return this.auditLog.filter(entry => entry.sandboxId === sandboxId);
  }

  /**
   * Get audit entries in time range
   */
  getAuditLogByTimeRange(startTime: Date, endTime: Date): SandboxAuditEntry[] {
    return this.auditLog.filter(
      entry => entry.timestamp >= startTime && entry.timestamp <= endTime
    );
  }

  /**
   * Get audit entries by severity
   */
  getAuditLogBySeverity(severity: SandboxAuditEntry['severity']): SandboxAuditEntry[] {
    return this.auditLog.filter(entry => entry.severity === severity);
  }

  /**
   * Export audit log to JSON
   */
  exportToJSON(): string {
    return JSON.stringify(this.auditLog, null, 2);
  }

  /**
   * Clear audit log (use with caution)
   */
  clear(): void {
    this.auditLog = [];
  }

  private recordEntry(entry: SandboxAuditEntry): void {
    this.auditLog.push(entry);
    
    // Also log to console for immediate visibility
    const timestamp = entry.timestamp.toISOString();
    const severity = entry.severity.toUpperCase();
    console.log(
      `[${timestamp}] ${severity} [SANDBOX_AUDIT] ${entry.eventType}: ` +
      `workflow=${entry.workflowId}, task=${entry.taskId}, ` +
      `tool=${entry.toolId || 'N/A'}, sandbox=${entry.sandboxId || 'N/A'}`
    );
  }

  private generateId(): string {
    this.idCounter++;
    return `audit-${Date.now()}-${this.idCounter}`;
  }
}
