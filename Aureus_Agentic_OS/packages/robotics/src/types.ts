/**
 * Core types for robotics integration
 */

/**
 * Physical limits for robot operation
 */
export interface PhysicalLimits {
  /** Position limits [x_min, x_max, y_min, y_max, z_min, z_max] in meters */
  position?: [number, number, number, number, number, number];
  /** Velocity limits [linear_max, angular_max] in m/s and rad/s */
  velocity?: [number, number];
  /** Acceleration limits [linear_max, angular_max] in m/s² and rad/s² */
  acceleration?: [number, number];
  /** Force limits [max_force] in Newtons */
  force?: number;
  /** Torque limits [max_torque] in Nm */
  torque?: number;
  /** Temperature limits [min, max] in Celsius */
  temperature?: [number, number];
}

/**
 * Current robot state
 */
export interface RobotState {
  /** Current position [x, y, z] in meters */
  position: [number, number, number];
  /** Current orientation [roll, pitch, yaw] in radians */
  orientation: [number, number, number];
  /** Current velocity [linear, angular] in m/s and rad/s */
  velocity: [number, number];
  /** Current acceleration [linear, angular] in m/s² and rad/s² */
  acceleration: [number, number];
  /** Current force in Newtons */
  force?: number;
  /** Current torque in Nm */
  torque?: number;
  /** Current temperature in Celsius */
  temperature?: number;
  /** Timestamp of state */
  timestamp: number;
  /** Joint states if applicable */
  joints?: JointState[];
}

/**
 * Joint state for articulated robots
 */
export interface JointState {
  name: string;
  position: number;
  velocity: number;
  effort: number;
}

/**
 * Safety envelope violation
 */
export interface SafetyViolation {
  type: 'position' | 'velocity' | 'acceleration' | 'force' | 'torque' | 'temperature';
  severity: 'warning' | 'critical';
  message: string;
  currentValue: number | number[];
  limitValue: number | number[];
  timestamp: number;
}

/**
 * ROS2 message types
 */
export interface ROS2Message {
  topic: string;
  messageType: string;
  data: Record<string, unknown>;
  timestamp?: number;
}

/**
 * ROS2 service request
 */
export interface ROS2ServiceRequest {
  service: string;
  serviceType: string;
  request: Record<string, unknown>;
}

/**
 * ROS2 service response
 */
export interface ROS2ServiceResponse {
  success: boolean;
  response: Record<string, unknown>;
  error?: string;
}

/**
 * Watchdog configuration
 */
export interface WatchdogConfig {
  /** Watchdog name */
  name: string;
  /** Timeout in milliseconds */
  timeoutMs: number;
  /** Action to take on timeout */
  onTimeout: () => Promise<void>;
  /** Whether to auto-restart after timeout */
  autoRestart?: boolean;
  /** Maximum number of restarts */
  maxRestarts?: number;
}

/**
 * Watchdog status
 */
export interface WatchdogStatus {
  name: string;
  isActive: boolean;
  lastHeartbeat: number;
  timeoutCount: number;
  restartCount: number;
}

/**
 * Emergency stop reason
 */
export enum EmergencyStopReason {
  SAFETY_VIOLATION = 'safety_violation',
  WATCHDOG_TIMEOUT = 'watchdog_timeout',
  MANUAL_TRIGGER = 'manual_trigger',
  COMMUNICATION_LOSS = 'communication_loss',
  HARDWARE_FAILURE = 'hardware_failure',
}

/**
 * Emergency stop event
 */
export interface EmergencyStopEvent {
  reason: EmergencyStopReason;
  message: string;
  timestamp: number;
  violation?: SafetyViolation;
  recoverable: boolean;
}

/**
 * Real-time control configuration
 */
export interface RealTimeConfig {
  /** Control loop frequency in Hz */
  frequency: number;
  /** Whether to use real-time priority */
  useRealTimePriority: boolean;
  /** Maximum jitter allowed in milliseconds */
  maxJitterMs: number;
}

/**
 * Robot command
 */
export interface RobotCommand {
  /** Command type */
  type: 'move' | 'stop' | 'reset' | 'custom';
  /** Target position if applicable */
  targetPosition?: [number, number, number];
  /** Target orientation if applicable */
  targetOrientation?: [number, number, number];
  /** Target velocity if applicable */
  targetVelocity?: [number, number];
  /** Custom command data */
  customData?: Record<string, unknown>;
  /** Timestamp */
  timestamp: number;
}
