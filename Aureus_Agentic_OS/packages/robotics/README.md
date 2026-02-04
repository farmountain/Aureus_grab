# @aureus/robotics

ROS2 integration with real-time-safe adapters, watchdogs, emergency stops, and safety envelopes for robot control in the Aureus Agentic OS.

## Features

- **ROS2 Integration**: Real-time-safe adapter for ROS2 or equivalent control middleware
- **Watchdog System**: Multiple watchdogs for monitoring different aspects of robot operation
- **Emergency Stop Triggers**: Comprehensive emergency stop system with multiple trigger types
- **Safety Envelopes**: Physical limit checking with automatic workflow override
- **Workflow Integration**: Seamless integration with Aureus workflow orchestration
- **Real-time Safety**: Lock-free data structures and bounded execution times

## Installation

```bash
npm install @aureus/robotics
```

## Core Concepts

### ROS2 Adapter

The ROS2 adapter provides integration with ROS2 (Robot Operating System 2) middleware with real-time safety guarantees:

- **Real-time-safe operations**: Lock-free data structures and pre-allocated buffers
- **Bounded execution times**: Predictable performance for control loops
- **Priority-based scheduling**: Support for real-time priority execution
- **Quality of Service**: Configurable QoS profiles for reliability and durability

### Watchdog System

Watchdogs monitor robot operations and trigger emergency stops on timeout:

- **Multiple watchdogs**: Monitor different subsystems independently
- **Auto-restart**: Configurable automatic restart on timeout
- **Heartbeat mechanism**: Simple heartbeat API for keeping watchdogs alive
- **Centralized management**: WatchdogManager for coordinating multiple watchdogs

### Emergency Stop System

Comprehensive emergency stop system with multiple trigger types:

- **Safety violations**: Automatic triggers when physical limits are exceeded
- **Watchdog timeouts**: Triggers when watchdog timeouts occur
- **Manual triggers**: Support for manual emergency stop activation
- **Communication loss**: Automatic triggers on communication failures
- **Hardware failures**: Triggers for hardware fault detection
- **Event history**: Complete audit trail of all emergency stop events

### Safety Envelopes

Safety envelopes monitor robot state against physical limits:

- **Position limits**: Monitor workspace boundaries (X, Y, Z)
- **Velocity limits**: Monitor linear and angular velocity
- **Acceleration limits**: Monitor linear and angular acceleration
- **Force limits**: Monitor applied forces
- **Torque limits**: Monitor joint torques
- **Temperature limits**: Monitor temperature ranges
- **Warning thresholds**: Configurable warning levels before critical violations
- **Workflow override**: Automatic workflow interruption on violations

### Workflow Integration

Integration with Aureus workflow orchestration:

- **Safety gates**: Pre-execution safety checks
- **Override controller**: Automatic workflow interruption on safety events
- **Step-by-step execution**: Safety checks between workflow steps
- **Audit trail**: Complete logging of safety decisions

## Quick Start

### Basic Setup

```typescript
import {
  ROS2AdapterFactory,
  RealTimeConfig,
  WatchdogManager,
  WatchdogConfig,
  EmergencyStopTrigger,
  EmergencyStopCoordinator,
  SafetyEnvelope,
  PhysicalLimits,
  SafetyGate,
  WorkflowOverrideController,
  RobotWorkflowExecutor,
} from '@aureus/robotics';

// Configure real-time adapter
const rtConfig: RealTimeConfig = {
  frequency: 100, // 100 Hz control loop
  useRealTimePriority: true,
  maxJitterMs: 5, // 5ms max jitter
};

// Create ROS2 adapter
const ros2Adapter = ROS2AdapterFactory.createRealTimeSafeAdapter(rtConfig);

// Connect to ROS2
await ros2Adapter.connect({
  nodeName: 'aureus_robot_controller',
  domainId: 0,
  qosProfile: {
    reliability: 'reliable',
    durability: 'transient-local',
    history: 'keep-last',
    depth: 10,
  },
});

// Create emergency stop system
const emergencyStop = new EmergencyStopTrigger();
const emergencyCoordinator = new EmergencyStopCoordinator(emergencyStop);

// Register emergency stop actions
emergencyCoordinator.registerStopAction('stop_robot', async () => {
  console.log('Stopping robot motion');
  // Send stop command to robot
});

emergencyCoordinator.registerStopAction('disable_actuators', async () => {
  console.log('Disabling actuators');
  // Disable robot actuators
});

// Create watchdog manager
const watchdogManager = new WatchdogManager();

// Add watchdogs
watchdogManager.addWatchdog({
  name: 'communication',
  timeoutMs: 1000, // 1 second timeout
  onTimeout: async () => {
    await emergencyStop.triggerForWatchdogTimeout('communication');
  },
  autoRestart: true,
  maxRestarts: 3,
});

watchdogManager.addWatchdog({
  name: 'control_loop',
  timeoutMs: 100, // 100ms timeout
  onTimeout: async () => {
    await emergencyStop.triggerForWatchdogTimeout('control_loop');
  },
});

// Start watchdogs
watchdogManager.startAll();

// Define safety limits
const limits: PhysicalLimits = {
  position: [-1.0, 1.0, -1.0, 1.0, 0.0, 2.0], // [x_min, x_max, y_min, y_max, z_min, z_max] in meters
  velocity: [1.0, 0.5], // [linear_max, angular_max] in m/s and rad/s
  acceleration: [2.0, 1.0], // [linear_max, angular_max] in m/s² and rad/s²
  force: 100, // Max force in Newtons
  torque: 50, // Max torque in Nm
  temperature: [10, 80], // [min, max] in Celsius
};

// Create safety envelope
const safetyEnvelope = new SafetyEnvelope(limits, emergencyStop);

// Create safety gate
const safetyGate = new SafetyGate(safetyEnvelope, emergencyStop);

// Create workflow override controller
const overrideController = new WorkflowOverrideController(
  safetyGate,
  watchdogManager,
  emergencyStop
);

// Register override callback
overrideController.registerOverrideCallback(async (reason) => {
  console.error(`Workflow overridden: ${reason}`);
  // Handle workflow interruption
});

// Create workflow executor
const workflowExecutor = new RobotWorkflowExecutor(overrideController);
```

### Using the ROS2 Adapter

```typescript
import { ROS2Message } from '@aureus/robotics';

// Publish a message
const message: ROS2Message = {
  topic: '/cmd_vel',
  messageType: 'geometry_msgs/Twist',
  data: {
    linear: { x: 0.5, y: 0.0, z: 0.0 },
    angular: { x: 0.0, y: 0.0, z: 0.1 },
  },
};

await ros2Adapter.publish(message);

// Subscribe to a topic
await ros2Adapter.subscribe('/odom', (message) => {
  console.log('Received odometry:', message.data);
  
  // Send heartbeat to watchdog
  watchdogManager.heartbeat('communication');
});

// Call a service
const response = await ros2Adapter.callService({
  service: '/get_robot_state',
  serviceType: 'robot_msgs/GetState',
  request: {},
});

console.log('Robot state:', response.response);

// Get control loop statistics
const stats = ros2Adapter.getControlLoopStats();
console.log('Control loop stats:', stats);
```

### Using Watchdogs

```typescript
// Send heartbeat to specific watchdog
watchdogManager.heartbeat('communication');

// Send heartbeat to all watchdogs
watchdogManager.heartbeatAll();

// Get watchdog status
const status = watchdogManager.getWatchdogStatus('communication');
console.log('Watchdog status:', status);

// Get all statuses
const allStatuses = watchdogManager.getAllStatus();
console.log('All watchdog statuses:', allStatuses);

// Stop a watchdog
watchdogManager.stopWatchdog('communication');

// Reset a watchdog
watchdogManager.resetWatchdog('communication');
```

### Using Safety Envelopes

```typescript
import { RobotState } from '@aureus/robotics';

// Check robot state
const robotState: RobotState = {
  position: [0.5, 0.3, 1.0],
  orientation: [0.0, 0.0, 0.0],
  velocity: [0.2, 0.1],
  acceleration: [0.5, 0.2],
  force: 30,
  torque: 15,
  temperature: 45,
  timestamp: Date.now(),
};

const { safe, violations } = await safetyEnvelope.checkState(robotState);

if (!safe) {
  console.error('Safety violation detected!');
  for (const violation of violations) {
    console.error(`- ${violation.message}`);
  }
}

// Get violation history
const history = safetyEnvelope.getViolationHistory();
console.log('Violation history:', history);

// Update limits
safetyEnvelope.updateLimits({
  velocity: [0.8, 0.4], // Reduce velocity limits
});
```

### Executing Workflows with Safety

```typescript
// Execute a single step
const result = await workflowExecutor.executeStep(
  'move_to_position',
  async () => {
    // Move robot to target position
    console.log('Moving robot...');
  },
  robotState
);

if (!result.success) {
  if (result.overridden) {
    console.error('Step was overridden by safety system');
  } else {
    console.error('Step failed:', result.error);
  }
}

// Execute a multi-step workflow
const workflowResult = await workflowExecutor.executeWorkflow(
  'pick_and_place',
  [
    {
      name: 'move_to_pick',
      fn: async () => {
        console.log('Moving to pick position');
        // Implementation
      },
      getRobotState: async () => {
        // Return current robot state
        return robotState;
      },
    },
    {
      name: 'grasp_object',
      fn: async () => {
        console.log('Grasping object');
        // Implementation
      },
      getRobotState: async () => {
        // Return current robot state
        return robotState;
      },
    },
    {
      name: 'move_to_place',
      fn: async () => {
        console.log('Moving to place position');
        // Implementation
      },
      getRobotState: async () => {
        // Return current robot state
        return robotState;
      },
    },
    {
      name: 'release_object',
      fn: async () => {
        console.log('Releasing object');
        // Implementation
      },
      getRobotState: async () => {
        // Return current robot state
        return robotState;
      },
    },
  ]
);

console.log(`Workflow completed: ${workflowResult.completedSteps}/${workflowResult.totalSteps} steps`);
if (workflowResult.errors) {
  console.error('Errors:', workflowResult.errors);
}
```

### Handling Emergency Stops

```typescript
// Manual emergency stop
await emergencyStop.triggerManual('User requested emergency stop');

// Check if in emergency stop
if (emergencyStop.isInEmergencyStop()) {
  console.log('System is in emergency stop state');
}

// Get last event
const lastEvent = emergencyStop.getLastEvent();
console.log('Last emergency stop:', lastEvent);

// Get statistics
const stats = emergencyStop.getStats();
console.log('Emergency stop stats:', stats);

// Reset after emergency stop (if recoverable)
try {
  await emergencyStop.reset();
  console.log('Emergency stop reset successful');
} catch (error) {
  console.error('Cannot reset:', error);
}

// Get event history
const history = emergencyStop.getEventHistory();
console.log('Emergency stop history:', history);
```

## Architecture

The robotics package follows a layered architecture:

1. **ROS2 Adapter Layer**: Provides real-time-safe communication with ROS2 middleware
2. **Monitoring Layer**: Watchdogs monitor system health and trigger alerts
3. **Safety Layer**: Safety envelopes check physical limits and trigger emergency stops
4. **Control Layer**: Emergency stop system coordinates responses to safety events
5. **Integration Layer**: Workflow integration allows safety systems to override execution

All layers work together to ensure safe robot operation while integrating with the Aureus workflow orchestration system.

## Real-time Safety Guarantees

The package provides several real-time safety guarantees:

- **Bounded execution times**: All critical operations have bounded worst-case execution times
- **Lock-free operations**: Uses lock-free data structures where possible
- **Pre-allocated buffers**: Avoids dynamic memory allocation in control loops
- **Priority-based scheduling**: Supports real-time priority for critical operations
- **Jitter monitoring**: Tracks and reports control loop jitter violations

## Testing

Run the test suite:

```bash
npm test
```

The package includes comprehensive tests for:
- ROS2 adapter functionality
- Watchdog timeout behavior
- Emergency stop triggers
- Safety envelope checking
- Workflow integration

## Best Practices

1. **Always use safety envelopes**: Define appropriate physical limits for your robot
2. **Configure multiple watchdogs**: Monitor different subsystems independently
3. **Test emergency stops**: Regularly test emergency stop functionality
4. **Monitor violation history**: Review safety violations to identify potential issues
5. **Use real-time configuration**: Enable real-time priority for critical control loops
6. **Set appropriate timeouts**: Configure watchdog timeouts based on expected operation
7. **Implement recovery procedures**: Define clear procedures for emergency stop recovery

## Integration with Aureus

The robotics package integrates with other Aureus components:

- **@aureus/kernel**: Workflow orchestration with safety overrides
- **@aureus/policy**: Policy-based control for robot operations
- **@aureus/crv**: Circuit reasoning validation for robot commands
- **@aureus/observability**: Telemetry and metrics for robot monitoring

## License

MIT
