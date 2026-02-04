/**
 * @aureus/robotics
 * 
 * ROS2 integration with real-time-safe adapters, watchdogs, emergency stops,
 * and safety envelopes for robot control in the Aureus Agentic OS.
 */

// Types
export * from './types';

// Capability Matrix
export * from './capability-matrix';

// ROS2 Adapter
export {
  IROS2Adapter,
  ROS2ConnectionConfig,
  QoSProfile,
  RealTimeSafeROS2Adapter,
  ROS2AdapterFactory,
} from './ros2-adapter';

// Watchdog System
export {
  Watchdog,
  WatchdogManager,
} from './watchdog';

// Emergency Stop
export {
  EmergencyStopHandler,
  EmergencyStopTrigger,
  EmergencyStopCoordinator,
} from './emergency-stop';

// Safety Envelope
export {
  SafetyEnvelope,
} from './safety-envelope';

// Workflow Integration
export {
  SafetyGate,
  WorkflowOverrideController,
  RobotWorkflowExecutor,
} from './workflow-integration';
