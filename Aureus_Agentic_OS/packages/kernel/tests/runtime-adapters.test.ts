import { describe, it, expect, beforeEach } from 'vitest';
import {
  RuntimeType,
  RuntimeAdapterConfig,
  RuntimeContext,
  RoboticsRuntimeAdapter,
  RoboticsRuntimeConfig,
  MobileDesktopRuntimeAdapter,
  MobileDesktopRuntimeConfig,
  SmartGlassesRuntimeAdapter,
  SmartGlassesRuntimeConfig,
  RuntimeAdapterRegistry,
  globalRuntimeAdapterRegistry,
} from '../src/runtime-adapters';

describe('Runtime Adapters', () => {
  describe('RoboticsRuntimeAdapter', () => {
    let adapter: RoboticsRuntimeAdapter;
    let config: RoboticsRuntimeConfig;
    let context: RuntimeContext;

    beforeEach(() => {
      config = {
        adapterId: 'test-robotics',
        runtimeType: RuntimeType.ROBOTICS,
        name: 'Test Robotics Adapter',
        capabilities: {
          realTime: true,
          perception: true,
          actuation: true,
          sandbox: false,
          streaming: true,
          lowLatency: true,
          acceleration: true,
          network: true,
          storage: true,
        },
        enabled: true,
        ros2: {
          enabled: false,
        },
        safetyEnvelope: {
          enabled: true,
          limits: {
            velocity: [2.0, 1.0],
            acceleration: [1.0, 0.5],
          },
        },
        perception: {
          enabled: true,
          adapters: ['camera', 'lidar'],
        },
        emergencyStop: {
          enabled: true,
          autoTriggerOnViolation: true,
        },
      };

      context = {
        runtimeType: RuntimeType.ROBOTICS,
        environment: {
          platform: 'linux',
          architecture: 'x64',
        },
        sessionId: 'test-session',
      };

      adapter = new RoboticsRuntimeAdapter(config);
    });

    it('should initialize successfully', async () => {
      await adapter.initialize(context);
      const health = await adapter.getHealthStatus();
      expect(health.timestamp).toBeDefined();
    });

    it('should validate compatible robotics tasks', async () => {
      const taskData = {
        type: 'motion',
        parameters: {
          targetPosition: [1, 0, 0],
        },
        safetyConstraints: {
          maxVelocity: 1.5,
        },
      };

      const validation = await adapter.validateTask(taskData);
      expect(validation.compatible).toBe(true);
      expect(validation.errors).toBeUndefined();
    });

    it('should reject tasks exceeding safety limits', async () => {
      const taskData = {
        type: 'motion',
        parameters: {
          targetPosition: [1, 0, 0],
        },
        safetyConstraints: {
          maxVelocity: 3.0, // Exceeds configured limit of 2.0
        },
      };

      const validation = await adapter.validateTask(taskData);
      expect(validation.compatible).toBe(false);
      expect(validation.errors).toBeDefined();
      expect(validation.errors![0]).toContain('maxVelocity exceeds');
    });

    it('should reject invalid task types', async () => {
      const taskData = {
        type: 'invalid-type',
        parameters: {},
      };

      const validation = await adapter.validateTask(taskData);
      expect(validation.compatible).toBe(false);
      expect(validation.errors).toBeDefined();
    });

    it('should shutdown cleanly', async () => {
      await adapter.initialize(context);
      await adapter.shutdown();
      // No errors should be thrown
    });
  });

  describe('MobileDesktopRuntimeAdapter', () => {
    let adapter: MobileDesktopRuntimeAdapter;
    let config: MobileDesktopRuntimeConfig;
    let context: RuntimeContext;

    beforeEach(() => {
      config = {
        adapterId: 'test-mobile',
        runtimeType: RuntimeType.MOBILE,
        name: 'Test Mobile Adapter',
        capabilities: {
          realTime: false,
          perception: true,
          actuation: false,
          sandbox: true,
          streaming: true,
          lowLatency: false,
          acceleration: true,
          network: true,
          storage: true,
        },
        enabled: true,
        sandbox: {
          enabled: true,
          defaultType: 'process',
          defaultPermissions: {
            network: true,
            filesystem: true,
            allowedDomains: ['api.example.com'],
            allowedPaths: ['/tmp'],
          },
        },
        toolAdapters: {
          enabled: true,
          availableTools: ['http-client', 'file-tool'],
          toolTimeout: 30000,
        },
        resourceLimits: {
          maxMemoryMb: 512,
          maxCpuPercent: 80,
          maxExecutionTimeMs: 60000,
        },
        security: {
          enforcePermissions: true,
          allowExternalNetworkAccess: true,
          allowFileSystemAccess: true,
          requireSignedTools: false,
        },
      };

      context = {
        runtimeType: RuntimeType.MOBILE,
        environment: {
          platform: 'android',
          architecture: 'arm64',
        },
        sessionId: 'test-session',
      };

      adapter = new MobileDesktopRuntimeAdapter(config);
    });

    it('should initialize successfully', async () => {
      await adapter.initialize(context);
      const health = await adapter.getHealthStatus();
      expect(health.timestamp).toBeDefined();
    });

    it('should validate compatible mobile tasks', async () => {
      const taskData = {
        type: 'api-call',
        parameters: {
          url: 'https://api.example.com/data',
        },
        toolName: 'http-client',
      };

      const validation = await adapter.validateTask(taskData);
      expect(validation.compatible).toBe(true);
      expect(validation.errors).toBeUndefined();
    });

    it('should reject tasks with unavailable tools', async () => {
      const taskData = {
        type: 'api-call',
        parameters: {},
        toolName: 'unavailable-tool',
      };

      const validation = await adapter.validateTask(taskData);
      expect(validation.compatible).toBe(false);
      expect(validation.errors).toBeDefined();
      expect(validation.errors![0]).toContain('is not available');
    });

    it('should reject tasks exceeding resource limits', async () => {
      const taskData = {
        type: 'computation',
        parameters: {},
        resourceLimits: {
          maxMemoryMb: 1024, // Exceeds configured limit of 512
        },
      };

      const validation = await adapter.validateTask(taskData);
      expect(validation.compatible).toBe(false);
      expect(validation.errors).toBeDefined();
      expect(validation.errors![0]).toContain('maxMemoryMb exceeds');
    });

    it('should shutdown cleanly', async () => {
      await adapter.initialize(context);
      await adapter.shutdown();
      // No errors should be thrown
    });
  });

  describe('SmartGlassesRuntimeAdapter', () => {
    let adapter: SmartGlassesRuntimeAdapter;
    let config: SmartGlassesRuntimeConfig;
    let context: RuntimeContext;

    beforeEach(() => {
      config = {
        adapterId: 'test-smart-glasses',
        runtimeType: RuntimeType.SMART_GLASSES,
        name: 'Test Smart Glasses Adapter',
        capabilities: {
          realTime: true,
          perception: true,
          actuation: false,
          sandbox: false,
          streaming: true,
          lowLatency: true,
          acceleration: true,
          network: true,
          storage: false,
        },
        enabled: true,
        perception: {
          enabled: true,
          camera: {
            enabled: true,
            defaultResolution: '1920x1080',
            defaultFrameRate: 30,
          },
          microphone: {
            enabled: true,
            defaultSampleRate: 48000,
          },
          imu: {
            enabled: true,
            defaultUpdateRate: 100,
          },
        },
        output: {
          visual: {
            enabled: true,
            maxLatencyMs: 20,
            resolution: '1920x1080',
          },
          audio: {
            enabled: true,
            maxLatencyMs: 10,
            sampleRate: 48000,
          },
          haptic: {
            enabled: true,
            maxLatencyMs: 5,
          },
        },
        processing: {
          enableGestureRecognition: true,
          enableVoiceRecognition: true,
          enableObjectDetection: true,
          enableSceneUnderstanding: true,
        },
        performance: {
          targetFrameRate: 60,
          maxEndToEndLatencyMs: 50,
        },
      };

      context = {
        runtimeType: RuntimeType.SMART_GLASSES,
        environment: {
          platform: 'qualcomm-xr2',
          architecture: 'arm64',
        },
        sessionId: 'test-session',
      };

      adapter = new SmartGlassesRuntimeAdapter(config);
    });

    it('should initialize successfully', async () => {
      await adapter.initialize(context);
      const health = await adapter.getHealthStatus();
      expect(health.timestamp).toBeDefined();
    });

    it('should validate compatible smart glasses tasks', async () => {
      const taskData = {
        type: 'perception',
        parameters: {},
        perceptionStream: {
          camera: {
            enabled: true,
            resolution: '1920x1080',
            frameRate: 30,
          },
        },
      };

      const validation = await adapter.validateTask(taskData);
      expect(validation.compatible).toBe(true);
      expect(validation.errors).toBeUndefined();
    });

    it('should reject tasks with disabled features', async () => {
      const taskData = {
        type: 'perception',
        parameters: {},
        perceptionStream: {
          camera: {
            enabled: false,
          },
          microphone: {
            enabled: false,
          },
        },
      };

      // Disable camera in config
      const testConfig = { ...config };
      testConfig.perception.camera.enabled = false;
      const testAdapter = new SmartGlassesRuntimeAdapter(testConfig);

      const taskDataWithCamera = {
        type: 'perception',
        parameters: {},
        perceptionStream: {
          camera: {
            enabled: true,
          },
        },
      };

      const validation = await testAdapter.validateTask(taskDataWithCamera);
      expect(validation.compatible).toBe(false);
      expect(validation.errors).toBeDefined();
      expect(validation.errors![0]).toContain('Camera stream requested');
    });

    it('should reject gesture tasks when disabled', async () => {
      const testConfig = { ...config };
      testConfig.processing.enableGestureRecognition = false;
      const testAdapter = new SmartGlassesRuntimeAdapter(testConfig);

      const taskData = {
        type: 'gesture-input',
        parameters: {},
      };

      const validation = await testAdapter.validateTask(taskData);
      expect(validation.compatible).toBe(false);
      expect(validation.errors).toBeDefined();
      expect(validation.errors![0]).toContain('gesture recognition');
    });

    it('should shutdown cleanly', async () => {
      await adapter.initialize(context);
      await adapter.shutdown();
      // No errors should be thrown
    });
  });

  describe('RuntimeAdapterRegistry', () => {
    let registry: RuntimeAdapterRegistry;
    let roboticsAdapter: RoboticsRuntimeAdapter;
    let mobileAdapter: MobileDesktopRuntimeAdapter;

    beforeEach(() => {
      registry = new RuntimeAdapterRegistry();

      roboticsAdapter = new RoboticsRuntimeAdapter({
        adapterId: 'robotics-1',
        runtimeType: RuntimeType.ROBOTICS,
        name: 'Robotics Adapter 1',
        capabilities: {
          realTime: true,
          perception: true,
          actuation: true,
          sandbox: false,
          streaming: true,
          lowLatency: true,
          acceleration: true,
          network: true,
          storage: true,
        },
        enabled: true,
        ros2: { enabled: false },
        safetyEnvelope: { enabled: true, limits: {} },
        perception: { enabled: true, adapters: [] },
        emergencyStop: { enabled: true, autoTriggerOnViolation: true },
      });

      mobileAdapter = new MobileDesktopRuntimeAdapter({
        adapterId: 'mobile-1',
        runtimeType: RuntimeType.MOBILE,
        name: 'Mobile Adapter 1',
        capabilities: {
          realTime: false,
          perception: true,
          actuation: false,
          sandbox: true,
          streaming: true,
          lowLatency: false,
          acceleration: true,
          network: true,
          storage: true,
        },
        enabled: true,
        sandbox: {
          enabled: true,
          defaultType: 'process',
          defaultPermissions: {
            network: true,
            filesystem: true,
            allowedDomains: [],
            allowedPaths: [],
          },
        },
        toolAdapters: {
          enabled: true,
          availableTools: ['http-client'],
        },
        resourceLimits: {
          maxMemoryMb: 512,
          maxCpuPercent: 80,
          maxExecutionTimeMs: 60000,
        },
        security: {
          enforcePermissions: true,
          allowExternalNetworkAccess: true,
          allowFileSystemAccess: true,
          requireSignedTools: false,
        },
      });
    });

    it('should register adapters successfully', () => {
      registry.register(roboticsAdapter);
      registry.register(mobileAdapter);

      const stats = registry.getStatistics();
      expect(stats.totalAdapters).toBe(2);
      expect(stats.activeAdapters).toBe(2);
    });

    it('should prevent duplicate registration', () => {
      registry.register(roboticsAdapter);
      expect(() => registry.register(roboticsAdapter)).toThrow('already registered');
    });

    it('should get adapters by runtime type', () => {
      registry.register(roboticsAdapter);
      registry.register(mobileAdapter);

      const roboticsAdapters = registry.getAdaptersByRuntime(RuntimeType.ROBOTICS);
      expect(roboticsAdapters.length).toBe(1);
      expect(roboticsAdapters[0].config.adapterId).toBe('robotics-1');

      const mobileAdapters = registry.getAdaptersByRuntime(RuntimeType.MOBILE);
      expect(mobileAdapters.length).toBe(1);
      expect(mobileAdapters[0].config.adapterId).toBe('mobile-1');
    });

    it('should check if runtime is supported', () => {
      registry.register(roboticsAdapter);

      expect(registry.isRuntimeSupported(RuntimeType.ROBOTICS)).toBe(true);
      expect(registry.isRuntimeSupported(RuntimeType.SMART_GLASSES)).toBe(false);
    });

    it('should validate blueprint with valid deployment target', async () => {
      registry.register(roboticsAdapter);

      const blueprint = {
        deploymentTarget: 'robotics',
        requiredCapabilities: ['perception', 'actuation'],
      };

      const validation = await registry.validateBlueprint(blueprint);
      expect(validation.valid).toBe(true);
      expect(validation.compatibleAdapters).toContain('robotics-1');
    });

    it('should reject blueprint with unsupported deployment target', async () => {
      registry.register(roboticsAdapter);

      const blueprint = {
        deploymentTarget: 'smart-glasses',
        requiredCapabilities: [],
      };

      const validation = await registry.validateBlueprint(blueprint);
      expect(validation.valid).toBe(false);
      expect(validation.errors).toBeDefined();
      expect(validation.errors![0]).toContain('not supported');
    });

    it('should validate blueprint without deployment target', async () => {
      registry.register(roboticsAdapter);

      const blueprint = {
        requiredCapabilities: [],
      };

      const validation = await registry.validateBlueprint(blueprint);
      expect(validation.valid).toBe(true);
      expect(validation.warnings).toBeDefined();
      expect(validation.warnings![0]).toContain('No deployment target');
    });

    it('should unregister adapters', () => {
      registry.register(roboticsAdapter);
      registry.register(mobileAdapter);

      registry.unregister('robotics-1');

      const stats = registry.getStatistics();
      expect(stats.totalAdapters).toBe(1);

      expect(() => registry.unregister('robotics-1')).toThrow('is not registered');
    });

    it('should get supported runtimes', () => {
      registry.register(roboticsAdapter);
      registry.register(mobileAdapter);

      const supported = registry.getSupportedRuntimes();
      expect(supported).toContain(RuntimeType.ROBOTICS);
      expect(supported).toContain(RuntimeType.MOBILE);
      expect(supported).not.toContain(RuntimeType.SMART_GLASSES);
    });
  });
});
