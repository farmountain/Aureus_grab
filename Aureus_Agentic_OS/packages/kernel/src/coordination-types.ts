/**
 * Types for multi-agent coordination policies and deadlock/livelock detection
 */

/**
 * Coordination policy types for managing multi-agent resource access
 */
export enum CoordinationPolicyType {
  EXCLUSIVE = 'exclusive',     // Only one agent can access resource at a time
  SHARED = 'shared',          // Multiple agents can read simultaneously
  ORDERED = 'ordered',        // Agents must access in specific order
  PRIORITY = 'priority'       // Higher priority agents get preference
}

/**
 * Resource lock for coordination
 */
export interface ResourceLock {
  resourceId: string;
  agentId: string;
  lockType: 'read' | 'write';
  acquiredAt: Date;
  expiresAt?: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Agent dependency for tracking wait-for relationships
 */
export interface AgentDependency {
  agentId: string;
  waitingFor: string[];        // Agent IDs this agent is waiting for
  heldResources: string[];     // Resource IDs held by this agent
  requestedResources: string[]; // Resource IDs requested by this agent
  timestamp: Date;
}

/**
 * Coordination policy configuration
 */
export interface CoordinationPolicy {
  type: CoordinationPolicyType;
  resourceId: string;
  maxConcurrentAccess?: number; // For SHARED type
  priorityOrder?: string[];     // For ORDERED/PRIORITY types
  lockTimeout?: number;         // Timeout in milliseconds
  metadata?: Record<string, unknown>;
}

/**
 * Deadlock detection result
 */
export interface DeadlockDetectionResult {
  detected: boolean;
  cycle?: string[];            // Agent IDs in the deadlock cycle
  timestamp: Date;
  affectedResources: string[];
  metadata?: Record<string, unknown>;
}

/**
 * Livelock detection result
 */
export interface LivelockDetectionResult {
  detected: boolean;
  agentIds: string[];          // Agents involved in livelock
  repeatedPattern: string;     // Description of repeated pattern
  timestamp: Date;
  iterationCount: number;      // Number of repeated iterations detected
  metadata?: Record<string, unknown>;
}

/**
 * Mitigation strategy types
 */
export enum MitigationStrategy {
  ABORT = 'abort',             // Abort conflicting agents
  REPLAN = 'replan',          // Replan agent tasks
  ESCALATE = 'escalate'       // Escalate to human operator
}

/**
 * Mitigation action result
 */
export interface MitigationResult {
  strategy: MitigationStrategy;
  success: boolean;
  affectedAgents: string[];
  timestamp: Date;
  reason: string;
  metadata?: Record<string, unknown>;
}

/**
 * Agent state for livelock detection
 */
export interface AgentState {
  agentId: string;
  workflowId: string;
  taskId: string;
  stateHash: string;           // Hash of current state for comparison
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Coordination event types
 */
export enum CoordinationEventType {
  LOCK_ACQUIRED = 'lock_acquired',
  LOCK_RELEASED = 'lock_released',
  LOCK_TIMEOUT = 'lock_timeout',
  DEADLOCK_DETECTED = 'deadlock_detected',
  LIVELOCK_DETECTED = 'livelock_detected',
  MITIGATION_STARTED = 'mitigation_started',
  MITIGATION_COMPLETED = 'mitigation_completed',
  MITIGATION_FAILED = 'mitigation_failed'
}

/**
 * Coordination event for audit log
 */
export interface CoordinationEvent {
  type: CoordinationEventType;
  timestamp: Date;
  agentId: string;
  workflowId: string;
  resourceId?: string;
  data?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}
