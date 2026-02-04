# Runtime Adapters

Runtime adapters enable agent deployment across different platforms (robotics, mobile, desktop, smart-glasses, etc.) by providing platform-specific execution environments with capability validation and resource management.

## Overview

The runtime adapter system provides:

- **Platform-specific execution environments** - Tailored runtimes for different deployment targets
- **Capability validation** - Ensures agent blueprints are compatible with target runtimes
- **Resource management** - Monitors and controls resource usage (CPU, memory, network, etc.)
- **Security and sandboxing** - Provides isolation and permission management
- **Integration points** - Connects with platform-specific services (perception, actuation, tooling)

## Available Runtime Adapters

**Note**: The runtime type enum includes `HUMANOID` which is intended for humanoid robots with advanced perception and actuation capabilities (face recognition, speech, gesture control, etc.). This is a specialized variant of the robotics runtime and can use the `RoboticsRuntimeAdapter` with extended configurations for humanoid-specific features.

### 1. Robotics Runtime Adapter

For robotic platforms with real-time control requirements.

**Note**: This adapter provides integration points for the `@aureus/robotics` and `@aureus/perception` packages. The actual integration implementations are placeholders that will be filled in as those packages are integrated.

**Features:**
- ROS2 integration
- Perception pipeline integration (camera, lidar, IMU)
- Real-time control loops
- Safety envelope validation
- Emergency stop handling
- Watchdog monitoring

**Example:**
```typescript
import { RoboticsRuntimeAdapter, RuntimeType } from '@aureus/kernel';

const adapter = new RoboticsRuntimeAdapter({
  adapterId: 'robotics-main',
  runtimeType: RuntimeType.ROBOTICS,
  name: 'Main Robotics Runtime',
  capabilities: {
    realTime: true,
    perception: true,
    actuation: true,
    lowLatency: true,
    // ...
  },
  enabled: true,
  safetyEnvelope: {
    enabled: true,
    limits: {
      velocity: [2.0, 1.0],
      acceleration: [1.0, 0.5],
    },
  },
  // ...
});

await adapter.initialize(context);
```

### 2. Mobile/Desktop Runtime Adapter

For mobile and desktop platforms with secure sandbox execution.

**Note**: This adapter provides integration points for the `@aureus/tools` package sandbox and tool adapters. The actual integration implementations are placeholders that will be filled in as those components are integrated.

**Features:**
- Secure sandbox execution (container, process, VM)
- Tool adapters for API access
- Resource limits and monitoring
- Permission-based security
- File system and network access control

**Example:**
```typescript
import { MobileDesktopRuntimeAdapter, RuntimeType } from '@aureus/kernel';

const adapter = new MobileDesktopRuntimeAdapter({
  adapterId: 'mobile-main',
  runtimeType: RuntimeType.MOBILE,
  name: 'Mobile Runtime Adapter',
  capabilities: {
    sandbox: true,
    network: true,
    storage: true,
    // ...
  },
  enabled: true,
  sandbox: {
    enabled: true,
    defaultType: 'process',
    defaultPermissions: {
      network: true,
      filesystem: true,
      allowedDomains: ['api.example.com'],
    },
  },
  // ...
});

await adapter.initialize(context);
```

### 3. Smart Glasses Runtime Adapter

For AR/VR wearable devices with low-latency requirements.

**Note**: This adapter provides integration points for device-specific AR/VR APIs and perception services. The actual integration implementations are placeholders that will be filled in as platform SDKs are integrated.

**Features:**
- Streamed perception (camera, microphone, IMU)
- Low-latency visual and audio outputs
- Gesture and voice recognition
- Real-time processing
- Performance monitoring

**Example:**
```typescript
import { SmartGlassesRuntimeAdapter, RuntimeType } from '@aureus/kernel';

const adapter = new SmartGlassesRuntimeAdapter({
  adapterId: 'smart-glasses-main',
  runtimeType: RuntimeType.SMART_GLASSES,
  name: 'Smart Glasses Runtime Adapter',
  capabilities: {
    realTime: true,
    perception: true,
    streaming: true,
    lowLatency: true,
    // ...
  },
  enabled: true,
  perception: {
    enabled: true,
    camera: { enabled: true, defaultFrameRate: 30 },
    microphone: { enabled: true },
    imu: { enabled: true },
  },
  performance: {
    targetFrameRate: 60,
    maxEndToEndLatencyMs: 50,
  },
  // ...
});

await adapter.initialize(context);
```

## Runtime Adapter Registry

The `RuntimeAdapterRegistry` manages all registered adapters and provides validation for agent blueprints.

**Usage:**
```typescript
import { globalRuntimeAdapterRegistry } from '@aureus/kernel';

// Register adapters
globalRuntimeAdapterRegistry.register(roboticsAdapter);
globalRuntimeAdapterRegistry.register(mobileAdapter);

// Check if a runtime is supported
const isSupported = globalRuntimeAdapterRegistry.isRuntimeSupported(RuntimeType.ROBOTICS);

// Validate an agent blueprint
const validation = await globalRuntimeAdapterRegistry.validateBlueprint({
  deploymentTarget: 'robotics',
  requiredCapabilities: ['perception', 'actuation'],
});

if (validation.valid) {
  console.log('Compatible adapters:', validation.compatibleAdapters);
  console.log('Recommended:', validation.recommendedAdapter);
}

// Perform health checks
const healthResults = await globalRuntimeAdapterRegistry.performHealthChecks();
```

## Agent Blueprint Integration

When creating an agent blueprint, specify the deployment target and required capabilities:

```json
{
  "id": "robot-navigation-agent",
  "name": "Robot Navigation Agent",
  "deploymentTarget": "robotics",
  "requiredCapabilities": [
    "perception",
    "actuation",
    "real-time",
    "camera",
    "lidar",
    "motors"
  ],
  "toolAdapters": [
    {
      "adapterId": "ros2-perception",
      "adapterType": "perception",
      "name": "ROS2 Perception Adapter",
      "enabled": true,
      "requiredCapabilities": ["camera", "lidar"]
    }
  ],
  "config": {
    "prompt": "You are a navigation agent..."
  }
}
```

## Validation

Validate agent blueprints against the runtime adapter registry:

```typescript
import { validateAgentBlueprintWithRuntime, globalRuntimeAdapterRegistry } from '@aureus/kernel';

const blueprint = {
  // ... agent blueprint
};

const result = await validateAgentBlueprintWithRuntime(
  blueprint,
  globalRuntimeAdapterRegistry
);

if (result.success) {
  console.log('Blueprint is valid!');
  console.log('Compatible adapters:', result.runtimeValidation?.compatibleAdapters);
} else {
  console.error('Validation failed:', result.errors);
}
```

## Creating Custom Runtime Adapters

To create a custom runtime adapter, implement the `RuntimeAdapter` interface:

```typescript
import { RuntimeAdapter, RuntimeAdapterConfig, RuntimeContext, RuntimeExecutionResult, RuntimeHealthStatus } from '@aureus/kernel';

export class CustomRuntimeAdapter implements RuntimeAdapter {
  readonly config: RuntimeAdapterConfig;
  
  constructor(config: RuntimeAdapterConfig) {
    this.config = config;
  }
  
  async initialize(context: RuntimeContext): Promise<void> {
    // Initialize your runtime
  }
  
  async execute(taskId: string, taskData: unknown, context: RuntimeContext): Promise<RuntimeExecutionResult> {
    // Execute task in your runtime
    return {
      success: true,
      data: { /* result */ },
      metrics: { durationMs: 0 },
    };
  }
  
  async shutdown(): Promise<void> {
    // Cleanup resources
  }
  
  async getHealthStatus(): Promise<RuntimeHealthStatus> {
    // Return health status
    return {
      healthy: true,
      timestamp: new Date(),
      components: {},
    };
  }
  
  async validateTask(taskData: unknown): Promise<{ compatible: boolean; errors?: string[]; warnings?: string[] }> {
    // Validate task compatibility
    return { compatible: true };
  }
}
```

## Deployment

See [docs/deployment.md](../../docs/deployment.md#runtime-adapter-configurations) for detailed deployment configuration examples for each runtime adapter type.

## Testing

Tests are available in `tests/runtime-adapters.test.ts`:

```bash
npm test -- runtime-adapters.test.ts
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Agent Blueprint                           │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ - Deployment Target: robotics                        │   │
│  │ - Required Capabilities: [perception, actuation]     │   │
│  │ - Tool Adapters: [ros2-perception, ros2-control]    │   │
│  └─────────────────────────────────────────────────────┘   │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│              Runtime Adapter Registry                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │  Robotics    │  │   Mobile     │  │Smart Glasses │     │
│  │   Adapter    │  │   Adapter    │  │   Adapter    │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                  Platform Integration                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ ROS2, Safety │  │ Sandbox,     │  │ AR/VR APIs,  │     │
│  │ Perception   │  │ Tool Adapters│  │ Perception   │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

## Extensibility

### Custom Deployment Targets

The runtime adapter registry includes a mapping from deployment target strings to runtime types. To support custom deployment targets without code changes:

1. Create a custom runtime adapter that extends one of the existing adapters
2. Register it with a unique adapter ID
3. Use the existing runtime type that best matches your platform
4. Alternatively, contribute a new runtime type to the enum for widely-used platforms

### Future Integrations

The current implementation provides interface definitions and placeholder integration points for:
- `@aureus/robotics`: ROS2 adapter, safety envelopes, emergency stops, watchdogs
- `@aureus/perception`: Perception pipelines for camera, lidar, and sensor data
- `@aureus/tools`: Sandbox execution and tool adapters

These integration points will be implemented as those packages are developed and integrated with the runtime adapter system.

## API Reference

### RuntimeAdapter Interface

- `initialize(context)` - Initialize the runtime adapter
- `execute(taskId, taskData, context)` - Execute a task
- `shutdown()` - Shutdown the adapter
- `getHealthStatus()` - Get health status
- `validateTask(taskData)` - Validate task compatibility

### RuntimeAdapterRegistry

- `register(adapter)` - Register a runtime adapter
- `unregister(adapterId)` - Unregister an adapter
- `getAdapter(adapterId)` - Get adapter by ID
- `getAdaptersByRuntime(runtimeType)` - Get adapters for runtime type
- `isRuntimeSupported(runtimeType)` - Check if runtime is supported
- `validateBlueprint(blueprint)` - Validate agent blueprint
- `performHealthChecks()` - Run health checks on all adapters

## License

Part of the Aureus Agentic OS - see root LICENSE file.
