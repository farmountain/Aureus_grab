/**
 * Example usage of the @aureus/robotics package
 * 
 * This example demonstrates how to set up a complete robotics control system
 * with ROS2 integration, safety envelopes, watchdogs, and workflow execution.
 */

import {
  // ROS2 Adapter
  ROS2AdapterFactory,
  RealTimeConfig,
  ROS2Message,
  
  // Watchdog System
  WatchdogManager,
  WatchdogConfig,
  
  // Emergency Stop
  EmergencyStopTrigger,
  EmergencyStopCoordinator,
  EmergencyStopReason,
  
  // Safety Envelope
  SafetyEnvelope,
  PhysicalLimits,
  RobotState,
  
  // Workflow Integration
  SafetyGate,
  WorkflowOverrideController,
  RobotWorkflowExecutor,
} from '@aureus/robotics';

async function main() {
  console.log('=== Aureus Robotics Package Example ===\n');

  // 1. Configure and create ROS2 adapter
  console.log('1. Setting up ROS2 adapter...');
  const rtConfig: RealTimeConfig = {
    frequency: 100, // 100 Hz control loop
    useRealTimePriority: false, // Set to true for real-time systems
    maxJitterMs: 5,
  };

  const ros2Adapter = ROS2AdapterFactory.createRealTimeSafeAdapter(rtConfig);

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
  console.log('   ✓ ROS2 adapter connected\n');

  // 2. Set up emergency stop system
  console.log('2. Setting up emergency stop system...');
  const emergencyStop = new EmergencyStopTrigger();
  const emergencyCoordinator = new EmergencyStopCoordinator(emergencyStop);

  // Register emergency stop actions
  emergencyCoordinator.registerStopAction('stop_robot', async () => {
    console.log('   → Emergency action: Stopping robot motion');
    // In real implementation: send stop command to robot
  });

  emergencyCoordinator.registerStopAction('disable_actuators', async () => {
    console.log('   → Emergency action: Disabling actuators');
    // In real implementation: disable robot actuators
  });

  console.log('   ✓ Emergency stop system configured\n');

  // 3. Set up watchdog system
  console.log('3. Setting up watchdog system...');
  const watchdogManager = new WatchdogManager();

  const communicationWatchdog: WatchdogConfig = {
    name: 'communication',
    timeoutMs: 1000,
    onTimeout: async () => {
      console.log('   ⚠ Communication watchdog timeout!');
      await emergencyStop.triggerForWatchdogTimeout('communication');
    },
    autoRestart: true,
    maxRestarts: 3,
  };

  const controlLoopWatchdog: WatchdogConfig = {
    name: 'control_loop',
    timeoutMs: 100,
    onTimeout: async () => {
      console.log('   ⚠ Control loop watchdog timeout!');
      await emergencyStop.triggerForWatchdogTimeout('control_loop');
    },
  };

  watchdogManager.addWatchdog(communicationWatchdog);
  watchdogManager.addWatchdog(controlLoopWatchdog);
  watchdogManager.startAll();
  console.log('   ✓ Watchdogs started\n');

  // 4. Configure safety limits and create safety envelope
  console.log('4. Configuring safety envelope...');
  const limits: PhysicalLimits = {
    position: [-1.0, 1.0, -1.0, 1.0, 0.0, 2.0], // [x_min, x_max, y_min, y_max, z_min, z_max] in meters
    velocity: [1.0, 0.5], // [linear_max, angular_max] in m/s and rad/s
    acceleration: [2.0, 1.0], // [linear_max, angular_max] in m/s² and rad/s²
    force: 100, // Max force in Newtons
    torque: 50, // Max torque in Nm
    temperature: [10, 80], // [min, max] in Celsius
  };

  const safetyEnvelope = new SafetyEnvelope(limits, emergencyStop);
  console.log('   ✓ Safety envelope configured\n');

  // 5. Create workflow integration
  console.log('5. Setting up workflow integration...');
  const safetyGate = new SafetyGate(safetyEnvelope, emergencyStop);
  const overrideController = new WorkflowOverrideController(
    safetyGate,
    watchdogManager,
    emergencyStop
  );

  overrideController.registerOverrideCallback(async (reason) => {
    console.log(`   ⚠ WORKFLOW OVERRIDDEN: ${reason}`);
  });

  const workflowExecutor = new RobotWorkflowExecutor(overrideController);
  console.log('   ✓ Workflow integration ready\n');

  // 6. Simulate robot operation
  console.log('6. Simulating robot operation...\n');

  // Safe robot state
  const safeState: RobotState = {
    position: [0.5, 0.5, 1.0],
    orientation: [0.0, 0.0, 0.0],
    velocity: [0.3, 0.1],
    acceleration: [0.5, 0.2],
    force: 30,
    torque: 15,
    temperature: 45,
    timestamp: Date.now(),
  };

  // Check safety
  console.log('   Testing safe state...');
  const { safe, violations } = await safetyEnvelope.checkState(safeState);
  console.log(`   ✓ State is safe: ${safe}`);
  if (violations.length > 0) {
    console.log(`   ℹ Warnings: ${violations.length}`);
  }

  // Send heartbeat to watchdogs
  watchdogManager.heartbeatAll();
  console.log('   ✓ Watchdog heartbeat sent\n');

  // 7. Execute a simple workflow
  console.log('7. Executing robot workflow...\n');

  const workflowResult = await workflowExecutor.executeWorkflow(
    'pick_and_place_demo',
    [
      {
        name: 'move_to_pick',
        fn: async () => {
          console.log('   → Step 1: Moving to pick position');
          // Simulate movement
          await new Promise(resolve => setTimeout(resolve, 100));
        },
        getRobotState: async () => safeState,
      },
      {
        name: 'grasp_object',
        fn: async () => {
          console.log('   → Step 2: Grasping object');
          await new Promise(resolve => setTimeout(resolve, 100));
        },
        getRobotState: async () => safeState,
      },
      {
        name: 'move_to_place',
        fn: async () => {
          console.log('   → Step 3: Moving to place position');
          await new Promise(resolve => setTimeout(resolve, 100));
        },
        getRobotState: async () => safeState,
      },
      {
        name: 'release_object',
        fn: async () => {
          console.log('   → Step 4: Releasing object');
          await new Promise(resolve => setTimeout(resolve, 100));
        },
        getRobotState: async () => safeState,
      },
    ]
  );

  console.log(`\n   ✓ Workflow completed: ${workflowResult.completedSteps}/${workflowResult.totalSteps} steps`);
  if (workflowResult.errors) {
    console.log(`   ✗ Errors: ${workflowResult.errors.join(', ')}`);
  }

  // 8. Simulate a safety violation
  console.log('\n8. Testing safety violation detection...\n');

  const unsafeState: RobotState = {
    ...safeState,
    position: [2.0, 0.5, 1.0], // Exceeds X limit
  };

  console.log('   Testing unsafe state (position exceeds limit)...');
  const { safe: isUnsafeSafe, violations: unsafeViolations } = await safetyEnvelope.checkState(unsafeState);
  console.log(`   ✓ State detected as unsafe: ${!isUnsafeSafe}`);
  console.log(`   ✓ Violations detected: ${unsafeViolations.length}`);
  if (unsafeViolations.length > 0) {
    unsafeViolations.forEach((v, i) => {
      console.log(`      ${i + 1}. ${v.severity.toUpperCase()}: ${v.message}`);
    });
  }

  // Check if emergency stop was triggered
  if (emergencyStop.isInEmergencyStop()) {
    console.log('\n   ⚠ Emergency stop was triggered due to critical violation');
    const lastEvent = emergencyStop.getLastEvent();
    if (lastEvent) {
      console.log(`      Reason: ${lastEvent.reason}`);
      console.log(`      Recoverable: ${lastEvent.recoverable}`);
    }
  }

  // 9. Get system statistics
  console.log('\n9. System Statistics:\n');

  const watchdogStatuses = watchdogManager.getAllStatus();
  console.log('   Watchdog Status:');
  watchdogStatuses.forEach(status => {
    console.log(`      - ${status.name}: ${status.isActive ? 'Active' : 'Inactive'}, Timeouts: ${status.timeoutCount}`);
  });

  const emergencyStats = emergencyStop.getStats();
  console.log('\n   Emergency Stop Statistics:');
  console.log(`      - Currently stopped: ${emergencyStats.isEmergencyStopped}`);
  console.log(`      - Total events: ${emergencyStats.totalEvents}`);
  console.log(`      - Events by reason: ${JSON.stringify(emergencyStats.eventsByReason)}`);

  const violationHistory = safetyEnvelope.getViolationHistory();
  console.log('\n   Safety Envelope:');
  console.log(`      - Total violations: ${violationHistory.length}`);

  // 10. Cleanup
  console.log('\n10. Cleaning up...\n');
  watchdogManager.stopAll();
  await ros2Adapter.disconnect();
  console.log('   ✓ All systems shut down gracefully');

  console.log('\n=== Example Complete ===');
}

// Run the example
main().catch(error => {
  console.error('Error running example:', error);
  process.exit(1);
});
