/**
 * Target Capability Matrix for Robotics
 * 
 * Defines capabilities required for robotics deployment targets and
 * provides validation functions to ensure agent blueprints are compatible
 * with robotics platforms.
 */

/**
 * Robotics-specific capabilities
 */
export enum RoboticsCapability {
  // Sensors
  CAMERA = 'camera',
  LIDAR = 'lidar',
  RADAR = 'radar',
  ULTRASONIC = 'ultrasonic',
  IMU = 'imu',
  GPS = 'gps',
  FORCE_SENSOR = 'force-sensor',
  TORQUE_SENSOR = 'torque-sensor',
  TEMPERATURE = 'temperature',
  PRESSURE = 'pressure',
  PROXIMITY = 'proximity',
  ENCODER = 'encoder',
  
  // Actuators
  MOTORS = 'motors',
  SERVOS = 'servos',
  GRIPPERS = 'grippers',
  WHEELS = 'wheels',
  LEGS = 'legs',
  ARMS = 'arms',
  MANIPULATOR = 'manipulator',
  
  // Perception
  OBJECT_DETECTION = 'object-detection',
  SLAM = 'slam',
  OBSTACLE_AVOIDANCE = 'obstacle-avoidance',
  PATH_PLANNING = 'path-planning',
  LOCALIZATION = 'localization',
  MAPPING = 'mapping',
  
  // Control
  MOTION_CONTROL = 'motion-control',
  TRAJECTORY_PLANNING = 'trajectory-planning',
  INVERSE_KINEMATICS = 'inverse-kinematics',
  FORCE_CONTROL = 'force-control',
  IMPEDANCE_CONTROL = 'impedance-control',
  
  // Communication
  ROS2 = 'ros2',
  CAN_BUS = 'can-bus',
  ETHERNET = 'ethernet',
  WIRELESS = 'wireless',
  
  // Safety
  EMERGENCY_STOP = 'emergency-stop',
  COLLISION_DETECTION = 'collision-detection',
  SAFETY_ZONES = 'safety-zones',
  WATCHDOG = 'watchdog',
  
  // Real-time
  REAL_TIME = 'real-time',
  LOW_LATENCY = 'low-latency',
  DETERMINISTIC = 'deterministic',
}

/**
 * Robotics deployment target capability requirements
 */
export const RoboticsTargetCapabilities: Record<string, RoboticsCapability[]> = {
  'mobile-robot': [
    RoboticsCapability.MOTORS,
    RoboticsCapability.WHEELS,
    RoboticsCapability.CAMERA,
    RoboticsCapability.LIDAR,
    RoboticsCapability.IMU,
    RoboticsCapability.OBJECT_DETECTION,
    RoboticsCapability.SLAM,
    RoboticsCapability.OBSTACLE_AVOIDANCE,
    RoboticsCapability.PATH_PLANNING,
    RoboticsCapability.EMERGENCY_STOP,
    RoboticsCapability.COLLISION_DETECTION,
    RoboticsCapability.REAL_TIME,
    RoboticsCapability.LOW_LATENCY,
  ],
  'manipulator-robot': [
    RoboticsCapability.SERVOS,
    RoboticsCapability.ARMS,
    RoboticsCapability.GRIPPERS,
    RoboticsCapability.CAMERA,
    RoboticsCapability.FORCE_SENSOR,
    RoboticsCapability.TORQUE_SENSOR,
    RoboticsCapability.OBJECT_DETECTION,
    RoboticsCapability.INVERSE_KINEMATICS,
    RoboticsCapability.TRAJECTORY_PLANNING,
    RoboticsCapability.FORCE_CONTROL,
    RoboticsCapability.EMERGENCY_STOP,
    RoboticsCapability.REAL_TIME,
  ],
  'humanoid-robot': [
    RoboticsCapability.MOTORS,
    RoboticsCapability.SERVOS,
    RoboticsCapability.ARMS,
    RoboticsCapability.LEGS,
    RoboticsCapability.CAMERA,
    RoboticsCapability.IMU,
    RoboticsCapability.FORCE_SENSOR,
    RoboticsCapability.OBJECT_DETECTION,
    RoboticsCapability.SLAM,
    RoboticsCapability.INVERSE_KINEMATICS,
    RoboticsCapability.TRAJECTORY_PLANNING,
    RoboticsCapability.MOTION_CONTROL,
    RoboticsCapability.EMERGENCY_STOP,
    RoboticsCapability.COLLISION_DETECTION,
    RoboticsCapability.REAL_TIME,
    RoboticsCapability.LOW_LATENCY,
  ],
  'industrial-robot': [
    RoboticsCapability.SERVOS,
    RoboticsCapability.ARMS,
    RoboticsCapability.CAMERA,
    RoboticsCapability.LIDAR,
    RoboticsCapability.FORCE_SENSOR,
    RoboticsCapability.TORQUE_SENSOR,
    RoboticsCapability.TEMPERATURE,
    RoboticsCapability.PRESSURE,
    RoboticsCapability.OBJECT_DETECTION,
    RoboticsCapability.INVERSE_KINEMATICS,
    RoboticsCapability.TRAJECTORY_PLANNING,
    RoboticsCapability.FORCE_CONTROL,
    RoboticsCapability.EMERGENCY_STOP,
    RoboticsCapability.SAFETY_ZONES,
    RoboticsCapability.REAL_TIME,
    RoboticsCapability.DETERMINISTIC,
  ],
  'drone': [
    RoboticsCapability.MOTORS,
    RoboticsCapability.CAMERA,
    RoboticsCapability.GPS,
    RoboticsCapability.IMU,
    RoboticsCapability.OBJECT_DETECTION,
    RoboticsCapability.LOCALIZATION,
    RoboticsCapability.PATH_PLANNING,
    RoboticsCapability.MOTION_CONTROL,
    RoboticsCapability.EMERGENCY_STOP,
    RoboticsCapability.REAL_TIME,
    RoboticsCapability.LOW_LATENCY,
  ],
};

/**
 * Adapter types that provide robotics capabilities
 */
export interface RoboticsAdapterInfo {
  type: string;
  providedCapabilities: RoboticsCapability[];
  requiredHardware?: string[];
}

/**
 * Common robotics adapters and their capabilities
 */
export const RoboticsAdapters: Record<string, RoboticsAdapterInfo> = {
  'ros2-adapter': {
    type: 'perception',
    providedCapabilities: [
      RoboticsCapability.ROS2,
      RoboticsCapability.REAL_TIME,
    ],
  },
  'camera-adapter': {
    type: 'sensor',
    providedCapabilities: [
      RoboticsCapability.CAMERA,
      RoboticsCapability.OBJECT_DETECTION,
    ],
    requiredHardware: ['camera'],
  },
  'lidar-adapter': {
    type: 'sensor',
    providedCapabilities: [
      RoboticsCapability.LIDAR,
      RoboticsCapability.SLAM,
      RoboticsCapability.OBSTACLE_AVOIDANCE,
      RoboticsCapability.MAPPING,
    ],
    requiredHardware: ['lidar'],
  },
  'imu-adapter': {
    type: 'sensor',
    providedCapabilities: [
      RoboticsCapability.IMU,
      RoboticsCapability.LOCALIZATION,
    ],
    requiredHardware: ['imu'],
  },
  'motor-controller': {
    type: 'actuator',
    providedCapabilities: [
      RoboticsCapability.MOTORS,
      RoboticsCapability.MOTION_CONTROL,
      RoboticsCapability.REAL_TIME,
    ],
    requiredHardware: ['motor-driver'],
  },
  'servo-controller': {
    type: 'actuator',
    providedCapabilities: [
      RoboticsCapability.SERVOS,
      RoboticsCapability.TRAJECTORY_PLANNING,
      RoboticsCapability.REAL_TIME,
    ],
    requiredHardware: ['servo-driver'],
  },
  'gripper-controller': {
    type: 'actuator',
    providedCapabilities: [
      RoboticsCapability.GRIPPERS,
      RoboticsCapability.FORCE_CONTROL,
    ],
    requiredHardware: ['gripper'],
  },
  'safety-envelope': {
    type: 'custom',
    providedCapabilities: [
      RoboticsCapability.EMERGENCY_STOP,
      RoboticsCapability.COLLISION_DETECTION,
      RoboticsCapability.SAFETY_ZONES,
      RoboticsCapability.WATCHDOG,
    ],
  },
};

/**
 * Validate if provided capabilities meet requirements for a robotics target
 */
export function validateRoboticsCapabilities(
  targetType: string,
  providedCapabilities: string[]
): {
  valid: boolean;
  missingCapabilities: RoboticsCapability[];
  recommendations?: string[];
} {
  const requiredCapabilities = RoboticsTargetCapabilities[targetType];
  
  if (!requiredCapabilities) {
    return {
      valid: true,
      missingCapabilities: [],
      recommendations: [`Unknown robotics target type: ${targetType}`],
    };
  }

  const missing = requiredCapabilities.filter(
    (cap) => !providedCapabilities.includes(cap)
  );

  const recommendations: string[] = [];
  
  // Suggest adapters that can provide missing capabilities
  if (missing.length > 0) {
    const missingSet = new Set(missing);
    const suggestedAdapters = Object.entries(RoboticsAdapters)
      .filter(([_, info]) => 
        info.providedCapabilities.some((cap) => missingSet.has(cap))
      )
      .map(([name, info]) => ({
        name,
        capabilities: info.providedCapabilities.filter((cap) => missingSet.has(cap)),
      }));

    if (suggestedAdapters.length > 0) {
      recommendations.push(
        'Consider adding these adapters to provide missing capabilities:'
      );
      suggestedAdapters.forEach(({ name, capabilities }) => {
        recommendations.push(`  - ${name}: provides ${capabilities.join(', ')}`);
      });
    }
  }

  return {
    valid: missing.length === 0,
    missingCapabilities: missing,
    recommendations: recommendations.length > 0 ? recommendations : undefined,
  };
}

/**
 * Get capabilities provided by a set of adapters
 */
export function getAdapterCapabilities(adapterNames: string[]): RoboticsCapability[] {
  const capabilities = new Set<RoboticsCapability>();
  
  adapterNames.forEach((name) => {
    const adapterInfo = RoboticsAdapters[name];
    if (adapterInfo) {
      adapterInfo.providedCapabilities.forEach((cap) => capabilities.add(cap));
    }
  });

  return Array.from(capabilities);
}

/**
 * Validate adapter compatibility with hardware requirements
 */
export function validateAdapterHardware(
  adapterName: string,
  availableHardware: string[]
): {
  compatible: boolean;
  missingHardware?: string[];
} {
  const adapterInfo = RoboticsAdapters[adapterName];
  
  if (!adapterInfo || !adapterInfo.requiredHardware) {
    return { compatible: true };
  }

  const missing = adapterInfo.requiredHardware.filter(
    (hw) => !availableHardware.includes(hw)
  );

  return {
    compatible: missing.length === 0,
    missingHardware: missing.length > 0 ? missing : undefined,
  };
}
