/**
 * Runtime Adapter Types
 * 
 * Defines interfaces and types for runtime adapters that enable agent deployment
 * across different platforms (robotics, mobile, desktop, smart-glasses, etc.)
 */

/**
 * Supported runtime types for agent deployment
 */
export enum RuntimeType {
  ROBOTICS = 'robotics',
  HUMANOID = 'humanoid',
  MOBILE = 'mobile',
  DESKTOP = 'desktop',
  SMART_GLASSES = 'smart-glasses',
  CLOUD = 'cloud',
  EDGE = 'edge',
}

/**
 * Runtime capability flags
 */
export interface RuntimeCapabilities {
  /** Supports real-time control loops */
  realTime: boolean;
  /** Supports perception pipelines */
  perception: boolean;
  /** Supports actuator control */
  actuation: boolean;
  /** Supports secure sandboxing */
  sandbox: boolean;
  /** Supports streaming data */
  streaming: boolean;
  /** Low-latency output required */
  lowLatency: boolean;
  /** GPU/TPU acceleration available */
  acceleration: boolean;
  /** Network connectivity available */
  network: boolean;
  /** Local storage available */
  storage: boolean;
  /** Custom capabilities */
  custom?: Record<string, boolean>;
}

/**
 * Runtime adapter configuration
 */
export interface RuntimeAdapterConfig {
  /** Unique adapter identifier */
  adapterId: string;
  /** Runtime type this adapter supports */
  runtimeType: RuntimeType;
  /** Human-readable name */
  name: string;
  /** Description of the adapter */
  description?: string;
  /** Capabilities provided by this adapter */
  capabilities: RuntimeCapabilities;
  /** Adapter-specific configuration */
  configuration?: Record<string, unknown>;
  /** Whether the adapter is enabled */
  enabled: boolean;
}

/**
 * Runtime context for adapter execution
 */
export interface RuntimeContext {
  /** Runtime type */
  runtimeType: RuntimeType;
  /** Execution environment information */
  environment: {
    /** OS/platform identifier */
    platform: string;
    /** Architecture (arm64, x64, etc.) */
    architecture: string;
    /** Available memory in bytes */
    availableMemory?: number;
    /** Available CPU cores */
    availableCores?: number;
    /** Custom environment data */
    custom?: Record<string, unknown>;
  };
  /** Session/execution identifier */
  sessionId: string;
  /** Tenant identifier for multi-tenancy */
  tenantId?: string;
  /** Additional context metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Runtime adapter execution result
 */
export interface RuntimeExecutionResult {
  /** Whether execution was successful */
  success: boolean;
  /** Result data from execution */
  data?: unknown;
  /** Error information if failed */
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  /** Execution metrics */
  metrics?: {
    /** Execution duration in milliseconds */
    durationMs: number;
    /** Memory used in bytes */
    memoryUsed?: number;
    /** CPU usage percentage */
    cpuUsage?: number;
    /** Custom metrics */
    custom?: Record<string, number>;
  };
  /** Output artifacts (files, streams, etc.) */
  artifacts?: Array<{
    type: string;
    location: string;
    metadata?: Record<string, unknown>;
  }>;
}

/**
 * Runtime health status
 */
export interface RuntimeHealthStatus {
  /** Overall health status */
  healthy: boolean;
  /** Timestamp of health check */
  timestamp: Date;
  /** Detailed status per component */
  components: Record<string, {
    healthy: boolean;
    message?: string;
    lastCheck?: Date;
  }>;
  /** System resource status */
  resources?: {
    cpu: { usage: number; available: number };
    memory: { usage: number; available: number };
    disk?: { usage: number; available: number };
  };
  /** Errors or warnings */
  issues?: Array<{
    severity: 'warning' | 'error' | 'critical';
    message: string;
    component?: string;
  }>;
}

/**
 * Base interface for all runtime adapters
 */
export interface RuntimeAdapter {
  /** Adapter configuration */
  readonly config: RuntimeAdapterConfig;

  /**
   * Initialize the runtime adapter
   * @param context - Runtime context for initialization
   */
  initialize(context: RuntimeContext): Promise<void>;

  /**
   * Execute a task in the runtime
   * @param taskId - Unique task identifier
   * @param taskData - Task data to execute
   * @param context - Runtime context
   */
  execute(
    taskId: string,
    taskData: unknown,
    context: RuntimeContext
  ): Promise<RuntimeExecutionResult>;

  /**
   * Shutdown the runtime adapter
   */
  shutdown(): Promise<void>;

  /**
   * Get health status of the runtime
   */
  getHealthStatus(): Promise<RuntimeHealthStatus>;

  /**
   * Validate if a task is compatible with this runtime
   * @param taskData - Task data to validate
   */
  validateTask(taskData: unknown): Promise<{
    compatible: boolean;
    errors?: string[];
    warnings?: string[];
  }>;
}
