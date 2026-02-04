/**
 * Enhanced error classes with remediation guidance for Aureus Agentic OS
 */

/**
 * Base error class with remediation guidance
 */
export abstract class AureusError extends Error {
  public readonly code: string;
  public readonly remediation: string;
  public readonly context?: Record<string, unknown>;
  public readonly timestamp: Date;

  constructor(message: string, code: string, remediation: string, context?: Record<string, unknown>) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.remediation = remediation;
    this.context = context;
    this.timestamp = new Date();
    
    // Maintains proper stack trace for where error was thrown (V8 only)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Get formatted error message with remediation
   */
  getDetailedMessage(): string {
    const parts = [
      `Error [${this.code}]: ${this.message}`,
      `Remediation: ${this.remediation}`,
    ];

    if (this.context && Object.keys(this.context).length > 0) {
      parts.push(`Context: ${JSON.stringify(this.context, null, 2)}`);
    }

    return parts.join('\n');
  }

  /**
   * Convert to JSON for logging/telemetry
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      remediation: this.remediation,
      context: this.context,
      timestamp: this.timestamp.toISOString(),
      stack: this.stack,
    };
  }
}

/**
 * Workflow execution errors
 */
export class WorkflowExecutionError extends AureusError {
  constructor(
    workflowId: string,
    taskId: string,
    message: string,
    originalError?: string,
    context?: Record<string, unknown>
  ) {
    const fullContext = {
      workflowId,
      taskId,
      originalError,
      ...context,
    };

    super(
      `Workflow ${workflowId}, Task ${taskId}: ${message}`,
      'WORKFLOW_EXECUTION_ERROR',
      'Check task configuration, verify input data, review event logs for details, and ensure all dependencies are met. If the error persists, examine the compensation strategy and consider adjusting retry parameters.',
      fullContext
    );
  }
}

/**
 * Task execution timeout error
 */
export class TaskTimeoutError extends AureusError {
  constructor(
    workflowId: string,
    taskId: string,
    timeoutMs: number,
    context?: Record<string, unknown>
  ) {
    const fullContext = {
      workflowId,
      taskId,
      timeoutMs,
      ...context,
    };

    super(
      `Task ${taskId} in workflow ${workflowId} exceeded timeout of ${timeoutMs}ms`,
      'TASK_TIMEOUT',
      `Increase the timeout value in task configuration if the operation legitimately requires more time. Alternatively, optimize the task implementation to complete faster, break the task into smaller sub-tasks, or check for blocking operations that might be causing delays.`,
      fullContext
    );
  }
}

/**
 * State store errors
 */
export class StateStoreError extends AureusError {
  constructor(
    operation: string,
    message: string,
    context?: Record<string, unknown>
  ) {
    super(
      `State store operation '${operation}' failed: ${message}`,
      'STATE_STORE_ERROR',
      'Verify state store connectivity, check disk space if using file-based storage, ensure proper permissions, and verify database/storage service is operational. Consider implementing backup state stores for high availability.',
      { operation, ...context }
    );
  }
}

/**
 * Idempotency violation error
 */
export class IdempotencyViolationError extends AureusError {
  constructor(
    taskId: string,
    idempotencyKey: string,
    context?: Record<string, unknown>
  ) {
    super(
      `Idempotency key '${idempotencyKey}' already used for task ${taskId}`,
      'IDEMPOTENCY_VIOLATION',
      'Do not retry this operation with the same idempotency key. If you need to re-execute the task, generate a new idempotency key. Review the event log to understand the original execution outcome.',
      { taskId, idempotencyKey, ...context }
    );
  }
}

/**
 * Rollback errors
 */
export class RollbackError extends AureusError {
  constructor(
    taskId: string,
    snapshotId: string,
    reason: string,
    context?: Record<string, unknown>
  ) {
    super(
      `Rollback of task ${taskId} to snapshot ${snapshotId} failed: ${reason}`,
      'ROLLBACK_ERROR',
      'Verify snapshot exists and is not corrupted. Check world model state consistency. If rollback continues to fail, manual intervention may be required. Review audit logs to understand state changes since snapshot was created.',
      { taskId, snapshotId, reason, ...context }
    );
  }
}

/**
 * Snapshot not found error
 */
export class SnapshotNotFoundError extends AureusError {
  constructor(
    snapshotId: string,
    taskId?: string,
    context?: Record<string, unknown>
  ) {
    super(
      `Snapshot ${snapshotId} not found${taskId ? ` for task ${taskId}` : ''}`,
      'SNAPSHOT_NOT_FOUND',
      'Verify the snapshot ID is correct. The snapshot may have been deleted or expired. Check snapshot retention policies. Use the memory API to list available snapshots for this task.',
      { snapshotId, taskId, ...context }
    );
  }
}

/**
 * CRV validation errors
 */
export class CRVValidationError extends AureusError {
  constructor(
    gateName: string,
    validationFailures: string[],
    blocked: boolean,
    context?: Record<string, unknown>
  ) {
    super(
      `CRV gate '${gateName}' validation failed: ${validationFailures.join(', ')}`,
      'CRV_VALIDATION_FAILED',
      blocked
        ? 'This commit was blocked due to validation failures. Review the validation failures, correct the data or logic, and retry. Check CRV operator configurations and ensure input data meets schema requirements.'
        : 'Validation failed but commit was not blocked (gate configured as non-blocking). Review validation failures and consider fixing them to improve data quality.',
      { gateName, validationFailures, blocked, ...context }
    );
  }
}

/**
 * Policy violation errors
 */
export class PolicyViolationError extends AureusError {
  constructor(
    actionId: string,
    actionName: string,
    reason: string,
    requiresApproval: boolean,
    context?: Record<string, unknown>
  ) {
    super(
      `Action '${actionName}' (${actionId}) denied by policy: ${reason}`,
      'POLICY_VIOLATION',
      requiresApproval
        ? 'This action requires human approval. Obtain an approval token from an authorized approver and provide it when retrying the action. The token will be validated by the policy engine.'
        : 'This action was denied by the policy engine. Review required permissions, verify principal has necessary access rights, check risk tier classifications, and ensure data zone restrictions are met. Contact your administrator if you believe this is an error.',
      { actionId, actionName, reason, requiresApproval, ...context }
    );
  }
}

/**
 * Permission denied error
 */
export class PermissionDeniedError extends AureusError {
  constructor(
    principalId: string,
    action: string,
    resource: string,
    context?: Record<string, unknown>
  ) {
    super(
      `Principal ${principalId} does not have permission to ${action} on ${resource}`,
      'PERMISSION_DENIED',
      'Request the necessary permissions from your administrator. Review the permission model to understand which permissions are required for this action. Verify you are using the correct principal identity.',
      { principalId, action, resource, ...context }
    );
  }
}

/**
 * Authentication errors
 */
export class AuthenticationError extends AureusError {
  constructor(
    reason: string,
    context?: Record<string, unknown>
  ) {
    super(
      `Authentication failed: ${reason}`,
      'AUTHENTICATION_FAILED',
      'Verify your credentials are correct and have not expired. If using JWT tokens, ensure the token is valid and properly signed. Check that the authentication service is reachable. Generate a new token if the current one has expired.',
      { reason, ...context }
    );
  }
}

/**
 * Configuration errors
 */
export class ConfigurationError extends AureusError {
  constructor(
    configKey: string,
    issue: string,
    context?: Record<string, unknown>
  ) {
    super(
      `Configuration error for '${configKey}': ${issue}`,
      'CONFIGURATION_ERROR',
      'Review the configuration file and correct the identified issue. Verify the configuration value is of the correct type and within acceptable ranges. Consult documentation for valid configuration options.',
      { configKey, issue, ...context }
    );
  }
}

/**
 * Dependency errors
 */
export class DependencyError extends AureusError {
  constructor(
    taskId: string,
    missingDependencies: string[],
    context?: Record<string, unknown>
  ) {
    super(
      `Task ${taskId} has unmet dependencies: ${missingDependencies.join(', ')}`,
      'DEPENDENCY_ERROR',
      'Ensure all task dependencies are defined in the workflow specification. Verify dependency tasks are completing successfully before this task executes. Check for circular dependencies in the DAG.',
      { taskId, missingDependencies, ...context }
    );
  }
}

/**
 * Conflict errors (for world model)
 */
export class ConflictError extends AureusError {
  constructor(
    key: string,
    expectedVersion?: number,
    actualVersion?: number,
    context?: Record<string, unknown>
  ) {
    super(
      `State conflict detected for key '${key}'${expectedVersion !== undefined ? ` (expected version ${expectedVersion}, found ${actualVersion})` : ''}`,
      'STATE_CONFLICT',
      'This indicates concurrent modifications to the same state. Retry the operation to get the latest state. If conflicts persist, review concurrent workflow execution patterns and consider implementing optimistic locking or serialization for critical state updates.',
      { key, expectedVersion, actualVersion, ...context }
    );
  }
}

/**
 * Memory API errors
 */
export class MemoryError extends AureusError {
  constructor(
    operation: string,
    reason: string,
    context?: Record<string, unknown>
  ) {
    super(
      `Memory operation '${operation}' failed: ${reason}`,
      'MEMORY_ERROR',
      'Verify memory store connectivity and capacity. Check provenance tracking is properly configured. If searching for memories, ensure query parameters are correct. Consider memory retention policies if storage is full.',
      { operation, reason, ...context }
    );
  }
}

/**
 * Resource exhaustion errors
 */
export class ResourceExhaustedError extends AureusError {
  constructor(
    resourceType: string,
    limit: number,
    current: number,
    context?: Record<string, unknown>
  ) {
    super(
      `Resource '${resourceType}' exhausted: current usage ${current} exceeds limit ${limit}`,
      'RESOURCE_EXHAUSTED',
      'Reduce resource consumption by optimizing workflows, implementing rate limiting, or increasing resource limits. Monitor resource usage patterns to identify optimization opportunities. Consider implementing backpressure mechanisms.',
      { resourceType, limit, current, ...context }
    );
  }
}

/**
 * Tool execution errors
 */
export class ToolExecutionError extends AureusError {
  constructor(
    toolName: string,
    reason: string,
    context?: Record<string, unknown>
  ) {
    super(
      `Tool '${toolName}' execution failed: ${reason}`,
      'TOOL_EXECUTION_ERROR',
      'Verify tool configuration and connectivity to external systems. Check tool input parameters are valid. Review tool adapter safety wrappers. If the tool interacts with external services, ensure those services are available and responsive.',
      { toolName, reason, ...context }
    );
  }
}

/**
 * Validation errors (generic)
 */
export class ValidationError extends AureusError {
  constructor(
    field: string,
    value: unknown,
    constraint: string,
    context?: Record<string, unknown>
  ) {
    super(
      `Validation failed for field '${field}': ${constraint}`,
      'VALIDATION_ERROR',
      'Correct the validation error and retry. Review field constraints in the schema definition. Ensure input values meet type, format, and range requirements.',
      { field, value, constraint, ...context }
    );
  }
}

/**
 * Helper function to determine if an error is an Aureus error
 */
export function isAureusError(error: unknown): error is AureusError {
  return error instanceof AureusError;
}

/**
 * Helper function to format any error with context
 */
export function formatError(error: unknown, additionalContext?: Record<string, unknown>): string {
  if (isAureusError(error)) {
    return error.getDetailedMessage();
  }

  if (error instanceof Error) {
    const parts = [
      `Error: ${error.message}`,
      `Remediation: Review the error message and stack trace to identify the issue. Check application logs for additional context.`,
    ];

    if (additionalContext && Object.keys(additionalContext).length > 0) {
      parts.push(`Context: ${JSON.stringify(additionalContext, null, 2)}`);
    }

    if (error.stack) {
      parts.push(`Stack: ${error.stack}`);
    }

    return parts.join('\n');
  }

  return `Unknown error: ${String(error)}`;
}
