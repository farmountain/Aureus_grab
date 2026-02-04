/**
 * Target Capability Matrix for Perception
 * 
 * Defines capabilities required for perception adapters and provides validation
 * functions to ensure agent blueprints have appropriate perception configurations.
 */

/**
 * Perception capabilities
 */
export enum PerceptionCapability {
  // Vision capabilities
  CAMERA = 'camera',
  DEPTH_CAMERA = 'depth-camera',
  STEREO_CAMERA = 'stereo-camera',
  THERMAL_CAMERA = 'thermal-camera',
  LIDAR = 'lidar',
  RADAR = 'radar',
  
  // Audio capabilities
  MICROPHONE = 'microphone',
  MICROPHONE_ARRAY = 'microphone-array',
  
  // Position/Motion sensing
  GPS = 'gps',
  IMU = 'imu',
  MAGNETOMETER = 'magnetometer',
  GYROSCOPE = 'gyroscope',
  ACCELEROMETER = 'accelerometer',
  
  // Environmental sensing
  TEMPERATURE_SENSOR = 'temperature-sensor',
  PRESSURE_SENSOR = 'pressure-sensor',
  HUMIDITY_SENSOR = 'humidity-sensor',
  LIGHT_SENSOR = 'light-sensor',
  PROXIMITY_SENSOR = 'proximity-sensor',
  
  // Touch/Force sensing
  TOUCHSCREEN = 'touchscreen',
  FORCE_SENSOR = 'force-sensor',
  TACTILE_SENSOR = 'tactile-sensor',
  
  // Computer Vision
  OBJECT_DETECTION = 'object-detection',
  OBJECT_TRACKING = 'object-tracking',
  OBJECT_RECOGNITION = 'object-recognition',
  FACE_DETECTION = 'face-detection',
  FACE_RECOGNITION = 'face-recognition',
  PERSON_DETECTION = 'person-detection',
  POSE_ESTIMATION = 'pose-estimation',
  GESTURE_RECOGNITION = 'gesture-recognition',
  SCENE_UNDERSTANDING = 'scene-understanding',
  SEMANTIC_SEGMENTATION = 'semantic-segmentation',
  INSTANCE_SEGMENTATION = 'instance-segmentation',
  DEPTH_ESTIMATION = 'depth-estimation',
  OPTICAL_FLOW = 'optical-flow',
  
  // OCR and Text
  OCR = 'ocr',
  TEXT_DETECTION = 'text-detection',
  HANDWRITING_RECOGNITION = 'handwriting-recognition',
  
  // Audio Processing
  SPEECH_RECOGNITION = 'speech-recognition',
  SPEAKER_RECOGNITION = 'speaker-recognition',
  SOUND_CLASSIFICATION = 'sound-classification',
  NOISE_CANCELLATION = 'noise-cancellation',
  SPATIAL_AUDIO = 'spatial-audio',
  
  // Natural Language Understanding
  NLP = 'nlp',
  SENTIMENT_ANALYSIS = 'sentiment-analysis',
  INTENT_EXTRACTION = 'intent-extraction',
  ENTITY_RECOGNITION = 'entity-recognition',
  
  // SLAM and Mapping
  SLAM = 'slam',
  VISUAL_SLAM = 'visual-slam',
  LIDAR_SLAM = 'lidar-slam',
  MAPPING = 'mapping',
  LOCALIZATION = 'localization',
  
  // Data Processing
  SENSOR_FUSION = 'sensor-fusion',
  KALMAN_FILTERING = 'kalman-filtering',
  PARTICLE_FILTERING = 'particle-filtering',
  
  // Real-time Processing
  REAL_TIME_PROCESSING = 'real-time-processing',
  LOW_LATENCY = 'low-latency',
  EDGE_INFERENCE = 'edge-inference',
  
  // Data Formats
  IMAGE_PROCESSING = 'image-processing',
  VIDEO_PROCESSING = 'video-processing',
  AUDIO_PROCESSING = 'audio-processing',
  POINT_CLOUD_PROCESSING = 'point-cloud-processing',
}

/**
 * Perception adapter categories and their capabilities
 */
export const PerceptionAdapterCategories: Record<string, PerceptionCapability[]> = {
  'camera-adapter': [
    PerceptionCapability.CAMERA,
    PerceptionCapability.IMAGE_PROCESSING,
    PerceptionCapability.OBJECT_DETECTION,
    PerceptionCapability.FACE_DETECTION,
  ],
  'depth-camera-adapter': [
    PerceptionCapability.DEPTH_CAMERA,
    PerceptionCapability.DEPTH_ESTIMATION,
    PerceptionCapability.POINT_CLOUD_PROCESSING,
    PerceptionCapability.OBJECT_DETECTION,
  ],
  'lidar-adapter': [
    PerceptionCapability.LIDAR,
    PerceptionCapability.POINT_CLOUD_PROCESSING,
    PerceptionCapability.LIDAR_SLAM,
    PerceptionCapability.MAPPING,
    PerceptionCapability.LOCALIZATION,
  ],
  'audio-adapter': [
    PerceptionCapability.MICROPHONE,
    PerceptionCapability.AUDIO_PROCESSING,
    PerceptionCapability.SPEECH_RECOGNITION,
    PerceptionCapability.SOUND_CLASSIFICATION,
  ],
  'imu-adapter': [
    PerceptionCapability.IMU,
    PerceptionCapability.ACCELEROMETER,
    PerceptionCapability.GYROSCOPE,
    PerceptionCapability.SENSOR_FUSION,
  ],
  'gps-adapter': [
    PerceptionCapability.GPS,
    PerceptionCapability.LOCALIZATION,
  ],
  'vision-ai-adapter': [
    PerceptionCapability.OBJECT_DETECTION,
    PerceptionCapability.OBJECT_TRACKING,
    PerceptionCapability.OBJECT_RECOGNITION,
    PerceptionCapability.FACE_DETECTION,
    PerceptionCapability.FACE_RECOGNITION,
    PerceptionCapability.POSE_ESTIMATION,
    PerceptionCapability.GESTURE_RECOGNITION,
    PerceptionCapability.SEMANTIC_SEGMENTATION,
  ],
  'ocr-adapter': [
    PerceptionCapability.OCR,
    PerceptionCapability.TEXT_DETECTION,
    PerceptionCapability.HANDWRITING_RECOGNITION,
  ],
  'nlp-adapter': [
    PerceptionCapability.NLP,
    PerceptionCapability.INTENT_EXTRACTION,
    PerceptionCapability.ENTITY_RECOGNITION,
    PerceptionCapability.SENTIMENT_ANALYSIS,
  ],
  'slam-adapter': [
    PerceptionCapability.SLAM,
    PerceptionCapability.VISUAL_SLAM,
    PerceptionCapability.MAPPING,
    PerceptionCapability.LOCALIZATION,
    PerceptionCapability.SENSOR_FUSION,
  ],
};

/**
 * Deployment target to required perception capabilities
 */
export const DeploymentTargetPerceptionCapabilities: Record<string, PerceptionCapability[]> = {
  robotics: [
    PerceptionCapability.CAMERA,
    PerceptionCapability.LIDAR,
    PerceptionCapability.IMU,
    PerceptionCapability.OBJECT_DETECTION,
    PerceptionCapability.SLAM,
    PerceptionCapability.LOCALIZATION,
    PerceptionCapability.REAL_TIME_PROCESSING,
    PerceptionCapability.SENSOR_FUSION,
  ],
  humanoid: [
    PerceptionCapability.CAMERA,
    PerceptionCapability.MICROPHONE,
    PerceptionCapability.IMU,
    PerceptionCapability.OBJECT_DETECTION,
    PerceptionCapability.FACE_RECOGNITION,
    PerceptionCapability.SPEECH_RECOGNITION,
    PerceptionCapability.GESTURE_RECOGNITION,
    PerceptionCapability.POSE_ESTIMATION,
    PerceptionCapability.SLAM,
    PerceptionCapability.REAL_TIME_PROCESSING,
  ],
  'smart-glasses': [
    PerceptionCapability.CAMERA,
    PerceptionCapability.MICROPHONE,
    PerceptionCapability.IMU,
    PerceptionCapability.OBJECT_DETECTION,
    PerceptionCapability.OCR,
    PerceptionCapability.GESTURE_RECOGNITION,
    PerceptionCapability.SPEECH_RECOGNITION,
    PerceptionCapability.EDGE_INFERENCE,
  ],
  smartphone: [
    PerceptionCapability.CAMERA,
    PerceptionCapability.MICROPHONE,
    PerceptionCapability.GPS,
    PerceptionCapability.IMU,
    PerceptionCapability.TOUCHSCREEN,
    PerceptionCapability.OBJECT_DETECTION,
    PerceptionCapability.SPEECH_RECOGNITION,
    PerceptionCapability.NLP,
  ],
  industrial: [
    PerceptionCapability.CAMERA,
    PerceptionCapability.LIDAR,
    PerceptionCapability.TEMPERATURE_SENSOR,
    PerceptionCapability.PRESSURE_SENSOR,
    PerceptionCapability.PROXIMITY_SENSOR,
    PerceptionCapability.OBJECT_DETECTION,
    PerceptionCapability.OCR,
    PerceptionCapability.REAL_TIME_PROCESSING,
  ],
  retail: [
    PerceptionCapability.CAMERA,
    PerceptionCapability.OBJECT_DETECTION,
    PerceptionCapability.OBJECT_RECOGNITION,
    PerceptionCapability.OCR,
    PerceptionCapability.FACE_DETECTION,
    PerceptionCapability.PERSON_DETECTION,
  ],
  travel: [
    PerceptionCapability.GPS,
    PerceptionCapability.CAMERA,
    PerceptionCapability.MICROPHONE,
    PerceptionCapability.OCR,
    PerceptionCapability.NLP,
    PerceptionCapability.SPEECH_RECOGNITION,
  ],
};

/**
 * Perception adapter information
 */
export interface PerceptionAdapterInfo {
  name: string;
  category: string;
  providedCapabilities: PerceptionCapability[];
  requiredHardware?: string[];
  computeRequirement?: 'low' | 'medium' | 'high' | 'gpu';
  latency?: 'low' | 'medium' | 'high';
}

/**
 * Common perception adapters
 */
export const CommonPerceptionAdapters: Record<string, PerceptionAdapterInfo> = {
  'rgb-camera': {
    name: 'RGB Camera',
    category: 'camera-adapter',
    providedCapabilities: [
      PerceptionCapability.CAMERA,
      PerceptionCapability.IMAGE_PROCESSING,
    ],
    requiredHardware: ['camera'],
    computeRequirement: 'low',
    latency: 'low',
  },
  'depth-camera': {
    name: 'Depth Camera',
    category: 'depth-camera-adapter',
    providedCapabilities: [
      PerceptionCapability.DEPTH_CAMERA,
      PerceptionCapability.DEPTH_ESTIMATION,
      PerceptionCapability.POINT_CLOUD_PROCESSING,
    ],
    requiredHardware: ['depth-camera'],
    computeRequirement: 'medium',
    latency: 'low',
  },
  'yolo-detector': {
    name: 'YOLO Object Detector',
    category: 'vision-ai-adapter',
    providedCapabilities: [
      PerceptionCapability.OBJECT_DETECTION,
      PerceptionCapability.OBJECT_TRACKING,
      PerceptionCapability.REAL_TIME_PROCESSING,
    ],
    requiredHardware: ['camera'],
    computeRequirement: 'gpu',
    latency: 'low',
  },
  'lidar-scanner': {
    name: 'LiDAR Scanner',
    category: 'lidar-adapter',
    providedCapabilities: [
      PerceptionCapability.LIDAR,
      PerceptionCapability.POINT_CLOUD_PROCESSING,
      PerceptionCapability.LIDAR_SLAM,
    ],
    requiredHardware: ['lidar'],
    computeRequirement: 'high',
    latency: 'low',
  },
  'speech-to-text': {
    name: 'Speech to Text',
    category: 'audio-adapter',
    providedCapabilities: [
      PerceptionCapability.MICROPHONE,
      PerceptionCapability.SPEECH_RECOGNITION,
      PerceptionCapability.AUDIO_PROCESSING,
    ],
    requiredHardware: ['microphone'],
    computeRequirement: 'medium',
    latency: 'low',
  },
  'tesseract-ocr': {
    name: 'Tesseract OCR',
    category: 'ocr-adapter',
    providedCapabilities: [
      PerceptionCapability.OCR,
      PerceptionCapability.TEXT_DETECTION,
    ],
    requiredHardware: ['camera'],
    computeRequirement: 'medium',
    latency: 'medium',
  },
  'mediapipe-pose': {
    name: 'MediaPipe Pose',
    category: 'vision-ai-adapter',
    providedCapabilities: [
      PerceptionCapability.POSE_ESTIMATION,
      PerceptionCapability.PERSON_DETECTION,
      PerceptionCapability.REAL_TIME_PROCESSING,
    ],
    requiredHardware: ['camera'],
    computeRequirement: 'gpu',
    latency: 'low',
  },
  'vslam-system': {
    name: 'Visual SLAM System',
    category: 'slam-adapter',
    providedCapabilities: [
      PerceptionCapability.VISUAL_SLAM,
      PerceptionCapability.MAPPING,
      PerceptionCapability.LOCALIZATION,
      PerceptionCapability.SENSOR_FUSION,
    ],
    requiredHardware: ['camera', 'imu'],
    computeRequirement: 'high',
    latency: 'low',
  },
};

/**
 * Validate if perception adapters provide required capabilities
 */
export function validatePerceptionCapabilities(
  requiredCapabilities: (PerceptionCapability | string)[],
  adapterNames: string[]
): {
  valid: boolean;
  missingCapabilities: PerceptionCapability[];
  recommendations?: string[];
} {
  const providedCapabilities = new Set<string>();
  
  // Collect capabilities from specified adapters
  adapterNames.forEach((adapterName) => {
    const adapter = CommonPerceptionAdapters[adapterName];
    if (adapter) {
      adapter.providedCapabilities.forEach((cap) => 
        providedCapabilities.add(cap)
      );
    }
  });

  const missing = requiredCapabilities.filter(
    (cap) => !providedCapabilities.has(cap as string)
  );

  const recommendations: string[] = [];
  
  // Suggest adapters that can provide missing capabilities
  if (missing.length > 0) {
    const missingSet = new Set(missing);
    const suggestedAdapters = Object.entries(CommonPerceptionAdapters)
      .filter(([_, info]) => 
        info.providedCapabilities.some((cap) => missingSet.has(cap))
      )
      .map(([name, info]) => ({
        name,
        capabilities: info.providedCapabilities.filter((cap) => missingSet.has(cap)),
      }));

    if (suggestedAdapters.length > 0) {
      recommendations.push(
        'Consider adding these perception adapters to provide missing capabilities:'
      );
      suggestedAdapters.forEach(({ name, capabilities }) => {
        recommendations.push(`  - ${name}: provides ${capabilities.join(', ')}`);
      });
    }
  }

  return {
    valid: missing.length === 0,
    missingCapabilities: missing as PerceptionCapability[],
    recommendations: recommendations.length > 0 ? recommendations : undefined,
  };
}

/**
 * Get recommended perception capabilities for a deployment target
 */
export function getRecommendedPerceptionCapabilities(
  deploymentTarget: string
): PerceptionCapability[] {
  return DeploymentTargetPerceptionCapabilities[deploymentTarget] || [];
}

/**
 * Assess compute requirements for perception adapters
 */
export function assessComputeRequirements(
  adapterNames: string[]
): {
  overallRequirement: 'low' | 'medium' | 'high' | 'gpu';
  gpuRequired: boolean;
  recommendations?: string[];
} {
  const requirementLevels = { low: 0, medium: 1, high: 2, gpu: 3 };
  let maxRequirement = 0;
  let gpuRequired = false;
  
  adapterNames.forEach((name) => {
    const adapter = CommonPerceptionAdapters[name];
    if (adapter && adapter.computeRequirement) {
      const reqValue = requirementLevels[adapter.computeRequirement];
      maxRequirement = Math.max(maxRequirement, reqValue);
      if (adapter.computeRequirement === 'gpu') {
        gpuRequired = true;
      }
    }
  });

  const overallRequirement = (Object.keys(requirementLevels) as Array<keyof typeof requirementLevels>)
    .find((key) => requirementLevels[key] === maxRequirement) || 'low';

  const recommendations: string[] = [];
  if (gpuRequired) {
    recommendations.push(
      'GPU acceleration required for optimal performance.',
      'Consider deploying to a platform with GPU support or use edge TPU/neural engine.'
    );
  } else if (overallRequirement === 'high') {
    recommendations.push(
      'High compute requirements detected.',
      'Ensure sufficient CPU resources or consider using GPU acceleration.'
    );
  }

  return {
    overallRequirement,
    gpuRequired,
    recommendations: recommendations.length > 0 ? recommendations : undefined,
  };
}

/**
 * Validate adapter hardware requirements
 */
export function validateAdapterHardware(
  adapterNames: string[],
  availableHardware: string[]
): {
  valid: boolean;
  missingHardware: string[];
  adaptersMissingHardware: string[];
} {
  const missingHardware = new Set<string>();
  const adaptersMissingHardware: string[] = [];
  
  adapterNames.forEach((name) => {
    const adapter = CommonPerceptionAdapters[name];
    if (adapter && adapter.requiredHardware) {
      const missing = adapter.requiredHardware.filter(
        (hw) => !availableHardware.includes(hw)
      );
      if (missing.length > 0) {
        adaptersMissingHardware.push(name);
        missing.forEach((hw) => missingHardware.add(hw));
      }
    }
  });

  return {
    valid: missingHardware.size === 0,
    missingHardware: Array.from(missingHardware),
    adaptersMissingHardware,
  };
}

/**
 * Assess latency characteristics of perception pipeline
 */
export function assessLatencyCharacteristics(
  adapterNames: string[]
): {
  overallLatency: 'low' | 'medium' | 'high';
  realTimeCapable: boolean;
  recommendations?: string[];
} {
  const latencyLevels = { low: 0, medium: 1, high: 2 };
  let maxLatency = 0;
  let hasRealTimeProcessing = false;
  
  adapterNames.forEach((name) => {
    const adapter = CommonPerceptionAdapters[name];
    if (adapter) {
      if (adapter.latency) {
        const latValue = latencyLevels[adapter.latency];
        maxLatency = Math.max(maxLatency, latValue);
      }
      if (adapter.providedCapabilities.includes(PerceptionCapability.REAL_TIME_PROCESSING)) {
        hasRealTimeProcessing = true;
      }
    }
  });

  const overallLatency = (Object.keys(latencyLevels) as Array<keyof typeof latencyLevels>)
    .find((key) => latencyLevels[key] === maxLatency) || 'low';

  const realTimeCapable = overallLatency === 'low' || hasRealTimeProcessing;

  const recommendations: string[] = [];
  if (!realTimeCapable) {
    recommendations.push(
      'Perception pipeline may not meet real-time requirements.',
      'Consider optimizing adapters or using faster hardware.'
    );
  }

  return {
    overallLatency,
    realTimeCapable,
    recommendations: recommendations.length > 0 ? recommendations : undefined,
  };
}
