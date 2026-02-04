/**
 * Sandbox execution types and interfaces
 * Defines the structure for constrained execution environments
 */

/**
 * Types of sandbox environments
 */
export enum SandboxType {
  /**
   * Container-based isolation (Docker, Podman, etc.)
   */
  CONTAINER = 'container',
  
  /**
   * Virtual machine-based isolation
   */
  VM = 'vm',
  
  /**
   * Process-based isolation (namespaces, cgroups)
   */
  PROCESS = 'process',
  
  /**
   * Mock sandbox for testing
   */
  MOCK = 'mock',
  
  /**
   * Simulation mode - captures side effects without executing
   */
  SIMULATION = 'simulation',
}

/**
 * Filesystem permissions for sandbox
 */
export interface FilesystemPermissions {
  /**
   * Read-only paths accessible to the sandbox
   */
  readOnlyPaths?: string[];
  
  /**
   * Read-write paths accessible to the sandbox
   */
  readWritePaths?: string[];
  
  /**
   * Paths explicitly denied (overrides other permissions)
   */
  deniedPaths?: string[];
  
  /**
   * Maximum total disk space (in bytes)
   */
  maxDiskUsage?: number;
  
  /**
   * Maximum number of files that can be created
   */
  maxFileCount?: number;
}

/**
 * Network permissions for sandbox
 */
export interface NetworkPermissions {
  /**
   * Whether network access is allowed at all
   */
  enabled: boolean;
  
  /**
   * Allowed outbound domains (whitelist)
   */
  allowedDomains?: string[];
  
  /**
   * Allowed IP ranges (CIDR notation)
   */
  allowedIpRanges?: string[];
  
  /**
   * Allowed ports
   */
  allowedPorts?: number[];
  
  /**
   * Denied domains (blacklist, overrides allowlist)
   */
  deniedDomains?: string[];
  
  /**
   * Maximum bandwidth (bytes per second)
   */
  maxBandwidth?: number;
}

/**
 * Resource limits for sandbox
 */
export interface ResourceLimits {
  /**
   * Maximum CPU usage (cores or percentage)
   */
  maxCpu?: number;
  
  /**
   * Maximum memory usage (in bytes)
   */
  maxMemory?: number;
  
  /**
   * Maximum execution time (in milliseconds)
   */
  maxExecutionTime?: number;
  
  /**
   * Maximum number of processes
   */
  maxProcesses?: number;
}

/**
 * Complete sandbox permissions
 */
export interface SandboxPermissions {
  /**
   * Filesystem access permissions
   */
  filesystem: FilesystemPermissions;
  
  /**
   * Network access permissions
   */
  network: NetworkPermissions;
  
  /**
   * Resource limits
   */
  resources: ResourceLimits;
  
  /**
   * Additional capabilities (Linux capabilities, etc.)
   */
  capabilities?: string[];
  
  /**
   * Environment variables allowed in sandbox
   */
  allowedEnvVars?: string[];
}

/**
 * Sandbox configuration
 */
export interface SandboxConfig {
  /**
   * Unique identifier for this sandbox configuration
   */
  id: string;
  
  /**
   * Type of sandbox to use
   */
  type: SandboxType;
  
  /**
   * Permissions for the sandbox
   */
  permissions: SandboxPermissions;
  
  /**
   * Base image for container/VM (if applicable)
   */
  baseImage?: string;
  
  /**
   * Working directory inside sandbox
   */
  workDir?: string;
  
  /**
   * Whether to persist sandbox between executions
   */
  persistent?: boolean;
  
  /**
   * Custom metadata
   */
  metadata?: Record<string, unknown>;
}

/**
 * Result of a permission check
 */
export interface PermissionCheckResult {
  /**
   * Whether the permission is granted
   */
  granted: boolean;
  
  /**
   * Reason for denial (if not granted)
   */
  reason?: string;
  
  /**
   * Whether escalation is possible
   */
  canEscalate?: boolean;
  
  /**
   * Policy decision that influenced this check
   */
  policyDecision?: Record<string, unknown>;
}

/**
 * Request for permission escalation
 */
export interface EscalationRequest {
  /**
   * Unique ID for this escalation request
   */
  id: string;
  
  /**
   * Type of permission being requested
   */
  permissionType: 'filesystem' | 'network' | 'resource' | 'capability';
  
  /**
   * Details of the permission request
   */
  details: Record<string, unknown>;
  
  /**
   * Reason/justification for escalation
   */
  justification: string;
  
  /**
   * Tool requesting the escalation
   */
  toolId: string;
  
  /**
   * Context information
   */
  context: {
    workflowId: string;
    taskId: string;
    timestamp: Date;
  };
}

/**
 * Response to escalation request
 */
export interface EscalationResponse {
  /**
   * Whether the escalation was approved
   */
  approved: boolean;
  
  /**
   * Approval token if approved
   */
  approvalToken?: string;
  
  /**
   * Reason for denial (if not approved)
   */
  reason?: string;
  
  /**
   * Who approved/denied the request
   */
  decidedBy?: string;
  
  /**
   * Timestamp of decision
   */
  timestamp: Date;
}

/**
 * Sandbox execution result
 */
export interface SandboxExecutionResult {
  /**
   * Whether execution succeeded
   */
  success: boolean;
  
  /**
   * Result data from execution
   */
  data?: unknown;
  
  /**
   * Error message if failed
   */
  error?: string;
  
  /**
   * Metadata about execution
   */
  metadata?: {
    /**
     * Sandbox ID used
     */
    sandboxId?: string;
    
    /**
     * Execution time in milliseconds
     */
    executionTime?: number;
    
    /**
     * Whether this was a simulation (no actual side effects)
     */
    simulationMode?: boolean;
    
    /**
     * Captured side effects (simulation mode only)
     */
    sideEffects?: unknown[];
    
    /**
     * Number of side effects captured
     */
    sideEffectCount?: number;
    
    /**
     * Resource usage
     */
    resourceUsage?: {
      cpu?: number;
      memory?: number;
      disk?: number;
      network?: number;
    };
    
    /**
     * Permission violations encountered
     */
    permissionViolations?: string[];
    
    /**
     * Whether execution was terminated due to resource limits
     */
    resourceLimitExceeded?: boolean;
  };
}
