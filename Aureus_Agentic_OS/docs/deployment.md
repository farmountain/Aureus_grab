# Aureus Agentic OS Deployment Guide

This guide provides comprehensive deployment procedures, high availability (HA) configuration, and disaster recovery (DR) guidance for Aureus Agentic OS.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Deployment Models](#deployment-models)
3. [Runtime Adapter Configurations](#runtime-adapter-configurations)
4. [CI/CD Automation](#cicd-automation)
5. [High Availability Configuration](#high-availability-configuration)
6. [Disaster Recovery](#disaster-recovery)
7. [Backup and Restore](#backup-and-restore)
8. [Monitoring and Health Checks](#monitoring-and-health-checks)
9. [Security Considerations](#security-considerations)
10. [Troubleshooting](#troubleshooting)

## Architecture Overview

Aureus consists of several key components:

- **Console App** (`apps/console`): Operator console with REST API and web UI
- **Kernel Packages** (`packages/kernel`): Core orchestration runtime
- **Supporting Packages**: Memory, policy, observability, CRV, etc.
- **State Stores**: In-memory and file-based state persistence
- **Event Logs**: Append-only audit trail (file-based or in-memory)

### Critical Data Stores

1. **State Store** (`InMemoryStateStore`, `WorldStateStore`)
   - Location: In-memory or persistent storage
   - Contains: Workflow states, task states, execution context
   - Backup frequency: Real-time or every checkpoint

2. **Event Log** (`FileSystemEventLog`)
   - Location: `./var/run/<workflowId>/events.log`
   - Contains: Append-only audit trail of all events
   - Backup frequency: Continuous (append-only)

3. **Snapshots** (`SnapshotManager` in HipCortex)
   - Location: In-memory (production should use persistent storage)
   - Contains: Point-in-time state snapshots with Merkle hashes
   - Backup frequency: After each verified state change

## Deployment Models

### Single-Node Deployment

Suitable for development and small-scale production:

```bash
# 1. Clone repository
git clone https://github.com/your-org/Aureus_Agentic_OS.git
cd Aureus_Agentic_OS

# 2. Install dependencies
npm install

# 3. Build all packages
npm run build:ordered

# 4. Start console
cd apps/console
npm start
```

**Pros**: Simple setup, low resource requirements
**Cons**: Single point of failure, limited scalability

### Multi-Node Deployment (Recommended for Production)

Deploy components across multiple nodes for high availability:

```bash
# Node 1: Console API Server
cd apps/console
npm run build
PORT=3000 node dist/server.js

# Node 2: Console API Server (replica)
cd apps/console
PORT=3001 node dist/server.js

# Node 3: Workflow Orchestrator
cd packages/kernel
npm run build
node dist/cli.js

# Load Balancer (e.g., nginx)
# Configure to distribute traffic across console instances
```

### Containerized Deployment

Use Docker and Kubernetes for cloud-native deployments:

```dockerfile
# Dockerfile.console
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
COPY apps/console ./apps/console
COPY packages ./packages
RUN npm ci
RUN npm run build:ordered
RUN npm run build --workspace=@aureus/console
WORKDIR /app/apps/console
EXPOSE 3000
CMD ["node", "dist/server.js"]
```

```yaml
# k8s/console-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: aureus-console
spec:
  replicas: 3
  selector:
    matchLabels:
      app: aureus-console
  template:
    metadata:
      labels:
        app: aureus-console
    spec:
      containers:
      - name: console
        image: aureus/console:latest
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: production
        - name: STATE_STORE_TYPE
          value: persistent
        - name: EVENT_LOG_BASE_DIR
          value: /var/aureus/events
        volumeMounts:
        - name: event-logs
          mountPath: /var/aureus/events
        - name: state-data
          mountPath: /var/aureus/state
      volumes:
      - name: event-logs
        persistentVolumeClaim:
          claimName: aureus-event-logs-pvc
      - name: state-data
        persistentVolumeClaim:
          claimName: aureus-state-pvc
---
apiVersion: v1
kind: Service
metadata:
  name: aureus-console-service
spec:
  selector:
    app: aureus-console
  ports:
  - protocol: TCP
    port: 80
    targetPort: 3000
  type: LoadBalancer
```

## Runtime Adapter Configurations

Runtime adapters enable agent deployment across different platforms (robotics, mobile, desktop, smart-glasses, etc.). This section provides configuration templates for each runtime type.

### Overview

Runtime adapters provide:
- Platform-specific execution environments
- Capability validation and runtime compatibility checks
- Resource management and monitoring
- Security and sandboxing features
- Integration with platform-specific services (perception, actuation, tooling)

### Robotics Runtime Adapter

The robotics runtime adapter provides integration with robotic platforms, including ROS2, perception pipelines, and safety envelopes.

**Configuration Example:**

```typescript
import { 
  RoboticsRuntimeAdapter, 
  RoboticsRuntimeConfig,
  RuntimeType,
} from '@aureus/kernel';

const roboticsConfig: RoboticsRuntimeConfig = {
  adapterId: 'robotics-main',
  runtimeType: RuntimeType.ROBOTICS,
  name: 'Main Robotics Runtime',
  description: 'Runtime adapter for robotic platforms with ROS2 integration',
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
  
  // ROS2 configuration
  ros2: {
    enabled: true,
    nodeNamespace: '/aureus',
    domainId: 0,
  },
  
  // Safety envelope configuration
  safetyEnvelope: {
    enabled: true,
    limits: {
      position: [-5, 5, -5, 5, 0, 3], // [x_min, x_max, y_min, y_max, z_min, z_max] in meters
      velocity: [2.0, 1.0], // [linear_max, angular_max] in m/s and rad/s
      acceleration: [1.0, 0.5], // [linear_max, angular_max] in m/s² and rad/s²
      force: 100, // Max force in Newtons
      torque: 50, // Max torque in Nm
    },
  },
  
  // Perception pipeline configuration
  perception: {
    enabled: true,
    adapters: ['camera', 'lidar', 'imu'],
    processingRate: 30, // Hz
  },
  
  // Emergency stop configuration
  emergencyStop: {
    enabled: true,
    autoTriggerOnViolation: true,
  },
  
  // Watchdog configuration
  watchdog: {
    enabled: true,
    timeoutMs: 5000,
  },
};

// Initialize adapter
const roboticsAdapter = new RoboticsRuntimeAdapter(roboticsConfig);
await roboticsAdapter.initialize({
  runtimeType: RuntimeType.ROBOTICS,
  environment: {
    platform: 'linux',
    architecture: 'arm64',
    availableMemory: 8 * 1024 * 1024 * 1024, // 8 GB
    availableCores: 4,
  },
  sessionId: 'session-123',
  tenantId: 'tenant-1',
});

// Register with global registry
import { globalRuntimeAdapterRegistry } from '@aureus/kernel';
globalRuntimeAdapterRegistry.register(roboticsAdapter);
```

**Deployment Script (robotics-deploy.sh):**

```bash
#!/bin/bash
# Deploy Aureus agent with robotics runtime adapter

# 1. Set environment variables
export AUREUS_RUNTIME_TYPE="robotics"
export ROS_DOMAIN_ID=0
export AUREUS_SAFETY_ENABLED=true

# 2. Start ROS2 bridge (if needed)
ros2 run aureus_bridge ros2_adapter &

# 3. Start Aureus kernel with robotics adapter
cd /opt/aureus
node dist/cli.js \
  --runtime robotics \
  --config ./config/robotics-runtime.json \
  --blueprint ./blueprints/robot-agent.json

# 4. Monitor adapter health
watch -n 5 'curl -s http://localhost:3000/health/runtime-adapters'
```

### Mobile and Desktop Runtime Adapter

The mobile/desktop runtime adapter provides secure sandbox execution, tooling adapters, and resource management.

**Configuration Example:**

```typescript
import { 
  MobileDesktopRuntimeAdapter, 
  MobileDesktopRuntimeConfig,
  RuntimeType,
} from '@aureus/kernel';

const mobileConfig: MobileDesktopRuntimeConfig = {
  adapterId: 'mobile-main',
  runtimeType: RuntimeType.MOBILE,
  name: 'Mobile Runtime Adapter',
  description: 'Runtime adapter for mobile and desktop platforms',
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
  
  // Sandbox configuration
  sandbox: {
    enabled: true,
    defaultType: 'process',
    defaultPermissions: {
      network: true,
      filesystem: true,
      allowedDomains: [
        'api.example.com',
        '*.googleapis.com',
        'cdn.jsdelivr.net',
      ],
      allowedPaths: [
        '/tmp/aureus',
        '/home/user/.aureus',
        '/var/lib/aureus',
      ],
    },
  },
  
  // Tool adapter configuration
  toolAdapters: {
    enabled: true,
    availableTools: [
      'http-client',
      'file-tool',
      'shell-tool',
      'database-client',
    ],
    toolTimeout: 30000, // 30 seconds
  },
  
  // Resource limits
  resourceLimits: {
    maxMemoryMb: 512,
    maxCpuPercent: 80,
    maxExecutionTimeMs: 60000, // 60 seconds
    maxDiskUsageMb: 100,
  },
  
  // Security settings
  security: {
    enforcePermissions: true,
    allowExternalNetworkAccess: true,
    allowFileSystemAccess: true,
    requireSignedTools: false,
  },
};

// Initialize adapter
const mobileAdapter = new MobileDesktopRuntimeAdapter(mobileConfig);
await mobileAdapter.initialize({
  runtimeType: RuntimeType.MOBILE,
  environment: {
    platform: 'android',
    architecture: 'arm64',
    availableMemory: 4 * 1024 * 1024 * 1024, // 4 GB
    availableCores: 8,
  },
  sessionId: 'session-456',
  tenantId: 'tenant-1',
});

// Register with global registry
globalRuntimeAdapterRegistry.register(mobileAdapter);
```

**Deployment Script (mobile-deploy.sh):**

```bash
#!/bin/bash
# Deploy Aureus agent with mobile runtime adapter

# 1. Set environment variables
export AUREUS_RUNTIME_TYPE="mobile"
export AUREUS_SANDBOX_ENABLED=true
export AUREUS_TOOL_TIMEOUT=30000

# 2. Start Aureus kernel with mobile adapter
cd /opt/aureus
node dist/cli.js \
  --runtime mobile \
  --config ./config/mobile-runtime.json \
  --blueprint ./blueprints/mobile-agent.json \
  --sandbox-type process

# 3. Monitor adapter health
watch -n 5 'curl -s http://localhost:3000/health/runtime-adapters | jq .'
```

### Smart Glasses Runtime Adapter

The smart glasses runtime adapter provides low-latency perception streaming and output rendering for AR/VR wearables.

**Configuration Example:**

```typescript
import { 
  SmartGlassesRuntimeAdapter, 
  SmartGlassesRuntimeConfig,
  RuntimeType,
} from '@aureus/kernel';

const smartGlassesConfig: SmartGlassesRuntimeConfig = {
  adapterId: 'smart-glasses-main',
  runtimeType: RuntimeType.SMART_GLASSES,
  name: 'Smart Glasses Runtime Adapter',
  description: 'Runtime adapter for AR/VR smart glasses',
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
  
  // Perception stream configuration
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
      defaultUpdateRate: 100, // Hz
    },
    streamBufferSize: 10, // Buffer 10 frames
  },
  
  // Output configuration
  output: {
    visual: {
      enabled: true,
      maxLatencyMs: 20, // 20ms for visual output
      resolution: '1920x1080',
    },
    audio: {
      enabled: true,
      maxLatencyMs: 10, // 10ms for audio output
      sampleRate: 48000,
    },
    haptic: {
      enabled: true,
      maxLatencyMs: 5, // 5ms for haptic feedback
    },
  },
  
  // Processing configuration
  processing: {
    enableGestureRecognition: true,
    enableVoiceRecognition: true,
    enableObjectDetection: true,
    enableSceneUnderstanding: true,
    offloadToCloud: false,
    localProcessingOnly: true,
  },
  
  // Performance targets
  performance: {
    targetFrameRate: 60,
    maxEndToEndLatencyMs: 50, // 50ms end-to-end
    powerSavingMode: false,
  },
};

// Initialize adapter
const smartGlassesAdapter = new SmartGlassesRuntimeAdapter(smartGlassesConfig);
await smartGlassesAdapter.initialize({
  runtimeType: RuntimeType.SMART_GLASSES,
  environment: {
    platform: 'qualcomm-xr2',
    architecture: 'arm64',
    availableMemory: 6 * 1024 * 1024 * 1024, // 6 GB
    availableCores: 8,
  },
  sessionId: 'session-789',
  tenantId: 'tenant-1',
});

// Register with global registry
globalRuntimeAdapterRegistry.register(smartGlassesAdapter);
```

**Deployment Script (smart-glasses-deploy.sh):**

```bash
#!/bin/bash
# Deploy Aureus agent with smart glasses runtime adapter

# 1. Set environment variables
export AUREUS_RUNTIME_TYPE="smart-glasses"
export AUREUS_LOW_LATENCY=true
export AUREUS_TARGET_FRAMERATE=60

# 2. Enable hardware acceleration
export AUREUS_GPU_ENABLED=true
export AUREUS_NEURAL_ENGINE_ENABLED=true

# 3. Start Aureus kernel with smart glasses adapter
cd /opt/aureus
node dist/cli.js \
  --runtime smart-glasses \
  --config ./config/smart-glasses-runtime.json \
  --blueprint ./blueprints/ar-agent.json \
  --low-latency

# 4. Monitor latency metrics
watch -n 1 'curl -s http://localhost:3000/metrics/latency | jq .'
```

### Runtime Adapter Registry

The runtime adapter registry manages all registered adapters and provides validation for agent blueprints.

**Usage Example:**

```typescript
import { 
  globalRuntimeAdapterRegistry,
  RuntimeType,
} from '@aureus/kernel';

// Check if a runtime is supported
const isSupported = globalRuntimeAdapterRegistry.isRuntimeSupported(RuntimeType.ROBOTICS);
console.log(`Robotics runtime supported: ${isSupported}`);

// Get all supported runtimes
const supportedRuntimes = globalRuntimeAdapterRegistry.getSupportedRuntimes();
console.log('Supported runtimes:', supportedRuntimes);

// Validate an agent blueprint
const blueprint = {
  deploymentTarget: 'robotics',
  requiredCapabilities: ['perception', 'actuation', 'real-time'],
  toolAdapters: [
    {
      adapterId: 'ros2-adapter',
      adapterType: 'perception',
      requiredCapabilities: ['camera', 'lidar'],
    },
  ],
};

const validation = await globalRuntimeAdapterRegistry.validateBlueprint(blueprint);
if (validation.valid) {
  console.log('Blueprint is valid!');
  console.log('Compatible adapters:', validation.compatibleAdapters);
  console.log('Recommended adapter:', validation.recommendedAdapter);
} else {
  console.error('Blueprint validation failed:', validation.errors);
}

// Perform health checks
const healthResults = await globalRuntimeAdapterRegistry.performHealthChecks();
for (const [adapterId, health] of healthResults.entries()) {
  console.log(`Adapter ${adapterId}: ${health.healthy ? 'healthy' : 'unhealthy'}`);
}

// Get registry statistics
const stats = globalRuntimeAdapterRegistry.getStatistics();
console.log('Registry statistics:', stats);
```

### Agent Blueprint with Runtime Target

When creating an agent blueprint, specify the deployment target to ensure compatibility:

```json
{
  "id": "robot-navigation-agent",
  "name": "Robot Navigation Agent",
  "version": "1.0.0",
  "goal": "Navigate robot to target location while avoiding obstacles",
  "deploymentTarget": "robotics",
  "requiredCapabilities": [
    "perception",
    "actuation",
    "real-time",
    "camera",
    "lidar",
    "motors",
    "low-latency"
  ],
  "toolAdapters": [
    {
      "adapterId": "ros2-perception",
      "adapterType": "perception",
      "name": "ROS2 Perception Adapter",
      "enabled": true,
      "requiredCapabilities": ["camera", "lidar", "object-detection"]
    },
    {
      "adapterId": "ros2-control",
      "adapterType": "actuator",
      "name": "ROS2 Control Adapter",
      "enabled": true,
      "requiredCapabilities": ["motors", "servos"]
    }
  ],
  "config": {
    "prompt": "You are a navigation agent...",
    "temperature": 0.7
  },
  "policies": [
    {
      "policyId": "safety-policy",
      "name": "Robot Safety Policy",
      "enabled": true,
      "rules": [
        {
          "type": "velocity_limit",
          "parameters": { "maxVelocity": 2.0 }
        },
        {
          "type": "workspace_boundary",
          "parameters": { "boundary": [-5, 5, -5, 5, 0, 3] }
        }
      ]
    }
  ]
}
```

## CI/CD Automation

### GitHub Actions Workflows

#### Console App Deployment

Workflow file: `.github/workflows/deploy-console.yml`

**Triggers:**
- Push to `main` branch → Deploy to staging
- Push to `production` branch → Deploy to production
- Manual workflow dispatch → Deploy to specified environment

**Stages:**
1. **Build**: Compile TypeScript, run tests, create artifacts
2. **Deploy to Staging**: Deploy to staging environment, run smoke tests
3. **Deploy to Production**: Deploy to production (requires staging success)

**Usage:**
```bash
# Trigger manual deployment
gh workflow run deploy-console.yml \
  -f environment=production \
  -f version=v1.2.3
```

#### Kernel Packages Deployment

Workflow file: `.github/workflows/deploy-kernel-packages.yml`

**Features:**
- Build all kernel packages in dependency order
- Run integration tests
- Publish to npm registry (staging and production)
- Automatic rollback on failure

**Usage:**
```bash
# Publish specific packages
gh workflow run deploy-kernel-packages.yml \
  -f packages="kernel,policy,crv" \
  -f version=0.1.1 \
  -f registry=npm
```

### Local Deployment Scripts

#### Deploy Console Locally

```bash
# Development
npm run deploy:console

# Staging
cd apps/console
npm run deploy:staging

# Production
cd apps/console
npm run deploy:production
```

#### Deploy Packages

```bash
# Build and pack all packages
npm run deploy:packages

# Publish to npm
cd packages/kernel
npm publish
```

### Operational Tools

#### Health Checks

Comprehensive health monitoring scripts are available in the `ops/health-checks/` directory:

```bash
# Check console health
./ops/health-checks/console-health.sh

# Check state store health
STATE_STORE_TYPE=postgres \
DATABASE_URL=postgresql://user:pass@host/db \
./ops/health-checks/state-store-health.sh

# Full system health check
./ops/health-checks/full-system-health.sh
```

**Health Check Endpoints:**
- `/health` - Overall health status with component checks
- `/ready` - Kubernetes readiness probe
- `/live` - Kubernetes liveness probe

#### Pre/Post Deployment Verification

Automated verification scripts ensure deployment success:

```bash
# Pre-deployment verification
ENVIRONMENT=production \
VERSION=v1.2.3 \
./ops/verification/pre-deployment.sh

# Post-deployment verification
CONSOLE_URL=https://prod.example.com \
ENVIRONMENT=production \
VERSION=v1.2.3 \
./ops/verification/post-deployment.sh
```

**Pre-deployment checks:**
- Version format validation
- Environment configuration
- Build artifacts existence
- Test suite execution
- Security vulnerability scanning

**Post-deployment checks:**
- Service readiness
- Version verification
- Smoke tests
- Database connectivity
- Log error analysis
- Metrics collection

#### Rollback Automation

Automated rollback procedures for failed deployments:

```bash
# Automated rollback to previous version
ENVIRONMENT=production \
ROLLBACK_VERSION=v1.2.2 \
./ops/rollback/automated-rollback.sh

# Rollback to specific snapshot
ROLLBACK_SNAPSHOT=snapshot-abc123 \
./ops/rollback/automated-rollback.sh

# Emergency rollback (fast, minimal checks)
./ops/rollback/emergency-rollback.sh
```

**Rollback process:**
1. Create pre-rollback backup
2. Stop services
3. Restore version or snapshot
4. Start services
5. Verify rollback success
6. Send notifications

#### CI/CD Pipeline Templates

Production-ready pipeline templates are available in `docs/ci-cd-templates/`:

**GitHub Actions:**
- `production-deployment.yml` - Full production deployment pipeline with:
  - Pre-deployment verification
  - Multi-stage deployment (staging → production)
  - Post-deployment verification
  - Automated rollback on failure
  - Health monitoring

**Usage:**
```bash
# Copy template to your workflows
cp docs/ci-cd-templates/github-actions/production-deployment.yml .github/workflows/

# Customize for your environment
# Update secrets: STAGING_SSH_KEY, PRODUCTION_SSH_KEY, etc.
```

**Required Secrets:**
- `STAGING_SSH_KEY` - SSH key for staging servers
- `STAGING_HOST` - Staging server hostname
- `PRODUCTION_SSH_KEY` - SSH key for production servers
- `PRODUCTION_HOSTS` - Comma-separated list of production hosts
- `PRODUCTION_USER` - SSH user for production deployment

## High Availability Configuration

### Load Balancing

Use a load balancer to distribute traffic across multiple console instances:

**Nginx Configuration:**

```nginx
upstream aureus_console {
    least_conn;
    server console1.example.com:3000 max_fails=3 fail_timeout=30s;
    server console2.example.com:3000 max_fails=3 fail_timeout=30s;
    server console3.example.com:3000 max_fails=3 fail_timeout=30s;
}

server {
    listen 80;
    server_name aureus.example.com;

    location / {
        proxy_pass http://aureus_console;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        
        # Health check
        proxy_next_upstream error timeout http_502 http_503 http_504;
    }

    location /health {
        proxy_pass http://aureus_console/health;
        access_log off;
    }
}
```

**HAProxy Configuration:**

```haproxy
frontend aureus_frontend
    bind *:80
    default_backend aureus_console_backend

backend aureus_console_backend
    balance roundrobin
    option httpchk GET /health
    http-check expect status 200
    server console1 console1.example.com:3000 check inter 5s fall 3 rise 2
    server console2 console2.example.com:3000 check inter 5s fall 3 rise 2
    server console3 console3.example.com:3000 check inter 5s fall 3 rise 2
```

### State Store Replication

For production deployments, replace in-memory stores with persistent, replicated storage:

#### PostgreSQL State Store (Recommended)

```typescript
import { Pool } from 'pg';

export class PostgresStateStore implements StateStore {
  private pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({
      connectionString,
      max: 20,
      idleTimeoutMillis: 30000,
    });
  }

  async get(workflowId: string): Promise<WorkflowState | undefined> {
    const result = await this.pool.query(
      'SELECT state FROM workflow_states WHERE workflow_id = $1',
      [workflowId]
    );
    return result.rows[0]?.state;
  }

  async set(workflowId: string, state: WorkflowState): Promise<void> {
    await this.pool.query(
      'INSERT INTO workflow_states (workflow_id, state, updated_at) VALUES ($1, $2, NOW()) ON CONFLICT (workflow_id) DO UPDATE SET state = $2, updated_at = NOW()',
      [workflowId, JSON.stringify(state)]
    );
  }
}
```

**PostgreSQL Setup:**

```sql
-- Create database
CREATE DATABASE aureus_state;

-- Create tables
CREATE TABLE workflow_states (
  workflow_id VARCHAR(255) PRIMARY KEY,
  state JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_workflow_updated ON workflow_states(updated_at);

-- Enable point-in-time recovery
ALTER SYSTEM SET wal_level = replica;
ALTER SYSTEM SET max_wal_senders = 3;
```

**Replication Setup:**

```bash
# Primary server
pg_basebackup -h primary.example.com -D /var/lib/postgresql/data -U replicator -P -R

# Standby server (standby.conf)
primary_conninfo = 'host=primary.example.com port=5432 user=replicator password=<password>'
hot_standby = on
```

#### Redis State Store (High Performance)

```typescript
import { createClient } from 'redis';

export class RedisStateStore implements StateStore {
  private client;

  constructor(url: string) {
    this.client = createClient({ url });
    this.client.connect();
  }

  async get(workflowId: string): Promise<WorkflowState | undefined> {
    const data = await this.client.get(`workflow:${workflowId}`);
    return data ? JSON.parse(data) : undefined;
  }

  async set(workflowId: string, state: WorkflowState): Promise<void> {
    await this.client.set(`workflow:${workflowId}`, JSON.stringify(state));
  }
}
```

**Redis Cluster Setup:**

```bash
# redis.conf
port 6379
cluster-enabled yes
cluster-config-file nodes.conf
cluster-node-timeout 5000
appendonly yes
appendfsync everysec
```

### Event Log Replication

Use shared storage or distributed file systems for event logs:

#### NFS Shared Storage

```bash
# Mount NFS share on all nodes
sudo mount -t nfs nfs-server.example.com:/aureus/events /var/run/aureus/events

# /etc/fstab entry
nfs-server.example.com:/aureus/events /var/run/aureus/events nfs defaults 0 0
```

#### S3-Compatible Object Storage

```typescript
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';

export class S3EventLog implements EventLog {
  private s3Client: S3Client;
  private bucket: string;

  constructor(bucket: string, region: string) {
    this.bucket = bucket;
    this.s3Client = new S3Client({ region });
  }

  async append(event: Event): Promise<void> {
    const key = `events/${event.workflowId}/${event.timestamp.getTime()}.json`;
    await this.s3Client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: JSON.stringify(event),
    }));
  }

  async read(workflowId: string): Promise<Event[]> {
    // Implementation to list and read all events for workflow
    // Use S3 list and batch get operations
  }
}
```

## Disaster Recovery

### Recovery Time Objective (RTO) and Recovery Point Objective (RPO)

| Component | RTO Target | RPO Target | Strategy |
|-----------|-----------|-----------|----------|
| Console App | < 5 minutes | 0 (stateless) | Auto-scaling, multiple replicas |
| State Store | < 15 minutes | < 1 minute | Continuous replication, automated failover |
| Event Log | < 30 minutes | 0 (append-only) | Replicated storage, backup to S3 |
| Snapshots | < 30 minutes | < 5 minutes | Regular snapshots to persistent storage |

### Disaster Recovery Procedures

#### Scenario 1: Console App Failure

**Detection:**
- Health check failures
- No response from API endpoints
- Load balancer marking instance as unhealthy

**Recovery:**
1. Load balancer automatically routes to healthy instances
2. Auto-scaling launches new instances (if configured)
3. No data loss (stateless application)

**Manual Recovery:**
```bash
# Check status
kubectl get pods -l app=aureus-console

# Force restart
kubectl rollout restart deployment/aureus-console

# Scale up replicas
kubectl scale deployment/aureus-console --replicas=5
```

#### Scenario 2: State Store Corruption

**Detection:**
- Data inconsistencies
- Failed state reads/writes
- Database errors in logs

**Recovery:**
1. Switch to standby replica (PostgreSQL)
2. Restore from latest backup
3. Replay event log from last checkpoint

**Manual Recovery:**
```bash
# PostgreSQL failover
pg_ctl promote -D /var/lib/postgresql/data

# Restore from backup
pg_restore -d aureus_state state_backup.dump

# Verify data integrity
psql -d aureus_state -c "SELECT COUNT(*) FROM workflow_states;"
```

#### Scenario 3: Event Log Loss

**Detection:**
- Missing event log files
- Corrupted log entries
- File system errors

**Recovery:**
1. Restore from replicated storage (NFS, S3)
2. Rebuild from state snapshots
3. Manual reconciliation if necessary

**Manual Recovery:**
```bash
# Restore from S3
aws s3 sync s3://aureus-backups/events/ ./var/run/aureus/events/

# Restore from NFS backup
rsync -avz nfs-backup:/aureus/events/ ./var/run/aureus/events/

# Verify log integrity
node -e "require('./packages/kernel/dist/event-log').verifyLogIntegrity('./var/run')"
```

#### Scenario 4: Complete Data Center Failure

**Detection:**
- All services unreachable
- Network connectivity lost
- Infrastructure monitoring alerts

**Recovery:**
1. Activate DR site (standby data center)
2. Restore all backups to DR environment
3. Update DNS to point to DR site
4. Verify all services operational

**Manual Recovery:**
```bash
# 1. Provision infrastructure at DR site
terraform apply -var-file=dr-site.tfvars

# 2. Restore state store
pg_restore -h dr-db.example.com -d aureus_state state_backup.dump

# 3. Restore event logs
aws s3 sync s3://aureus-backups/events/ /var/run/aureus/events/

# 4. Deploy application
kubectl apply -f k8s/production/

# 5. Update DNS
# Update A records to point to DR load balancer

# 6. Verify
curl https://aureus.example.com/health
```

## Backup and Restore

### Automated Backup Strategy

#### State Store Backup

**PostgreSQL Continuous Archiving:**

```bash
# postgresql.conf
archive_mode = on
archive_command = 'aws s3 cp %p s3://aureus-backups/wal/%f'
wal_level = replica

# Create base backup (daily)
pg_basebackup -D /backups/base-$(date +%Y%m%d) -F tar -z -P
aws s3 cp /backups/base-$(date +%Y%m%d).tar.gz s3://aureus-backups/base/
```

**Redis Backup:**

```bash
# redis.conf
save 900 1
save 300 10
save 60 10000

# Manual backup
redis-cli BGSAVE
aws s3 cp /var/lib/redis/dump.rdb s3://aureus-backups/redis/dump-$(date +%Y%m%d-%H%M%S).rdb
```

#### Event Log Backup

```bash
#!/bin/bash
# backup-events.sh

BACKUP_DIR="/backups/events"
EVENT_DIR="./var/run"
BACKUP_NAME="events-backup-$(date +%Y%m%d-%H%M%S).tar.gz"

# Create compressed backup
tar -czf "${BACKUP_DIR}/${BACKUP_NAME}" -C "${EVENT_DIR}" .

# Upload to S3
aws s3 cp "${BACKUP_DIR}/${BACKUP_NAME}" "s3://aureus-backups/events/${BACKUP_NAME}"

# Retain only last 30 days locally
find "${BACKUP_DIR}" -type f -name "events-backup-*.tar.gz" -mtime +30 -delete

echo "Event log backup completed: ${BACKUP_NAME}"
```

**Cron Schedule:**

```cron
# Backup every hour
0 * * * * /opt/aureus/scripts/backup-events.sh

# Backup state store every 6 hours
0 */6 * * * /opt/aureus/scripts/backup-state.sh

# Full system backup daily at 2 AM
0 2 * * * /opt/aureus/scripts/backup-full.sh
```

#### Snapshot Backup

```bash
#!/bin/bash
# backup-snapshots.sh

SNAPSHOT_DIR="/var/aureus/snapshots"
BACKUP_NAME="snapshots-$(date +%Y%m%d-%H%M%S).tar.gz"

# Export snapshots
tar -czf "/backups/${BACKUP_NAME}" -C "${SNAPSHOT_DIR}" .

# Upload to S3 with versioning
aws s3 cp "/backups/${BACKUP_NAME}" "s3://aureus-backups/snapshots/${BACKUP_NAME}"

# Verify backup integrity
tar -tzf "/backups/${BACKUP_NAME}" > /dev/null && echo "Backup verified"
```

### Restore Procedures

#### Restore State Store

**PostgreSQL Point-in-Time Recovery:**

```bash
# 1. Stop PostgreSQL
systemctl stop postgresql

# 2. Restore base backup
cd /var/lib/postgresql/data
tar -xzf /backups/base-20240103.tar.gz

# 3. Configure recovery
cat > recovery.conf <<EOF
restore_command = 'aws s3 cp s3://aureus-backups/wal/%f %p'
recovery_target_time = '2024-01-03 12:00:00'
EOF

# 4. Start PostgreSQL (will enter recovery mode)
systemctl start postgresql

# 5. Verify recovery
psql -d aureus_state -c "SELECT MAX(updated_at) FROM workflow_states;"
```

**Redis Restore:**

```bash
# 1. Stop Redis
systemctl stop redis

# 2. Download backup
aws s3 cp s3://aureus-backups/redis/dump-20240103-120000.rdb /var/lib/redis/dump.rdb

# 3. Set permissions
chown redis:redis /var/lib/redis/dump.rdb

# 4. Start Redis
systemctl start redis

# 5. Verify
redis-cli PING
```

#### Restore Event Logs

```bash
#!/bin/bash
# restore-events.sh

BACKUP_FILE=$1
EVENT_DIR="./var/run"

# Validate backup file
if [ ! -f "${BACKUP_FILE}" ]; then
  echo "Error: Backup file not found: ${BACKUP_FILE}"
  exit 1
fi

# Create backup of current state
if [ -d "${EVENT_DIR}" ]; then
  mv "${EVENT_DIR}" "${EVENT_DIR}.backup-$(date +%Y%m%d-%H%M%S)"
fi

# Extract backup
mkdir -p "${EVENT_DIR}"
tar -xzf "${BACKUP_FILE}" -C "${EVENT_DIR}"

echo "Event logs restored from ${BACKUP_FILE}"
echo "Previous state backed up to ${EVENT_DIR}.backup-*"
```

**Usage:**

```bash
# Download backup from S3
aws s3 cp s3://aureus-backups/events/events-backup-20240103-120000.tar.gz .

# Restore
./restore-events.sh events-backup-20240103-120000.tar.gz

# Verify
ls -la ./var/run/*/events.log
```

#### Restore Snapshots

```bash
#!/bin/bash
# restore-snapshots.sh

BACKUP_FILE=$1
SNAPSHOT_DIR="/var/aureus/snapshots"

# Download from S3 if not local
if [[ $BACKUP_FILE == s3://* ]]; then
  LOCAL_FILE="/tmp/$(basename $BACKUP_FILE)"
  aws s3 cp "$BACKUP_FILE" "$LOCAL_FILE"
  BACKUP_FILE="$LOCAL_FILE"
fi

# Backup current snapshots
if [ -d "${SNAPSHOT_DIR}" ]; then
  mv "${SNAPSHOT_DIR}" "${SNAPSHOT_DIR}.backup-$(date +%Y%m%d-%H%M%S)"
fi

# Restore
mkdir -p "${SNAPSHOT_DIR}"
tar -xzf "${BACKUP_FILE}" -C "${SNAPSHOT_DIR}"

echo "Snapshots restored from ${BACKUP_FILE}"
```

### Backup Verification

```bash
#!/bin/bash
# verify-backups.sh

echo "=== Backup Verification Report ==="
echo "Generated: $(date)"
echo ""

# Check state store backup
echo "State Store Backup:"
pg_restore --list state_backup.dump | head -10
echo ""

# Check event log backup
echo "Event Log Backup:"
tar -tzf events-backup-latest.tar.gz | head -10
echo ""

# Check S3 backups
echo "S3 Backups:"
aws s3 ls s3://aureus-backups/events/ --recursive | tail -5
aws s3 ls s3://aureus-backups/state/ --recursive | tail -5
echo ""

# Check backup integrity
echo "Integrity Checks:"
sha256sum state_backup.dump > state_backup.sha256
sha256sum -c state_backup.sha256
echo ""

echo "=== Verification Complete ==="
```

## Monitoring and Health Checks

### Health Check Endpoints

#### Console App Health Check

```typescript
// apps/console/src/api-server.ts
app.get('/health', (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    components: {
      api: 'operational',
      stateStore: checkStateStore(),
      eventLog: checkEventLog(),
      database: checkDatabase(),
    }
  };
  
  const isHealthy = Object.values(health.components).every(s => s === 'operational');
  res.status(isHealthy ? 200 : 503).json(health);
});

app.get('/ready', (req, res) => {
  // Readiness check for Kubernetes
  const ready = checkDependencies();
  res.status(ready ? 200 : 503).json({ ready });
});

app.get('/live', (req, res) => {
  // Liveness check for Kubernetes
  res.status(200).json({ alive: true });
});
```

#### Monitoring Metrics

```bash
# Prometheus metrics endpoint
curl http://localhost:3000/metrics

# Key metrics to monitor:
# - aureus_workflow_executions_total
# - aureus_workflow_execution_duration_seconds
# - aureus_state_store_operations_total
# - aureus_event_log_writes_total
# - aureus_snapshot_creation_total
# - aureus_rollback_operations_total
```

### Alerting Rules

**Prometheus Alert Rules:**

```yaml
# alerts.yml
groups:
- name: aureus
  interval: 30s
  rules:
  - alert: ConsoleAppDown
    expr: up{job="aureus-console"} == 0
    for: 2m
    labels:
      severity: critical
    annotations:
      summary: "Console app is down"
      description: "Console app has been down for more than 2 minutes"

  - alert: HighErrorRate
    expr: rate(aureus_workflow_errors_total[5m]) > 0.1
    for: 5m
    labels:
      severity: warning
    annotations:
      summary: "High workflow error rate"
      description: "Error rate is {{ $value }} errors/sec"

  - alert: StateStoreHighLatency
    expr: histogram_quantile(0.95, rate(aureus_state_store_duration_seconds_bucket[5m])) > 1
    for: 5m
    labels:
      severity: warning
    annotations:
      summary: "State store high latency"
      description: "95th percentile latency is {{ $value }}s"

  - alert: EventLogDiskFull
    expr: node_filesystem_avail_bytes{mountpoint="/var/run"} / node_filesystem_size_bytes{mountpoint="/var/run"} < 0.1
    for: 5m
    labels:
      severity: critical
    annotations:
      summary: "Event log disk space low"
      description: "Less than 10% disk space available"
```

## Security Considerations

### Secure Deployment Checklist

- [ ] Enable TLS/SSL for all API endpoints
- [ ] Use secrets management (Vault, AWS Secrets Manager)
- [ ] Implement network segmentation and firewalls
- [ ] Enable database encryption at rest
- [ ] Use encrypted backups
- [ ] Implement role-based access control (RBAC)
- [ ] Enable audit logging for all operations
- [ ] Regular security updates and patches
- [ ] Vulnerability scanning (npm audit, CodeQL)

### Secrets Management

```bash
# Using AWS Secrets Manager
aws secretsmanager create-secret \
  --name aureus/production/db-password \
  --secret-string "your-secure-password"

# Retrieve in application
DB_PASSWORD=$(aws secretsmanager get-secret-value \
  --secret-id aureus/production/db-password \
  --query SecretString \
  --output text)
```

### Network Security

```bash
# Firewall rules (iptables)
# Allow console API
iptables -A INPUT -p tcp --dport 3000 -j ACCEPT

# Allow PostgreSQL (only from app servers)
iptables -A INPUT -p tcp --dport 5432 -s 10.0.1.0/24 -j ACCEPT

# Deny all other traffic
iptables -A INPUT -j DROP
```

## Troubleshooting

### Common Issues

#### Issue: Console app not starting

**Symptoms:** App crashes on startup, port already in use

**Diagnosis:**
```bash
# Check if port is in use
lsof -i :3000

# Check logs
journalctl -u aureus-console -n 50

# Check environment variables
printenv | grep AUREUS
```

**Resolution:**
```bash
# Kill process using port
kill -9 $(lsof -t -i:3000)

# Or change port
PORT=3001 node dist/server.js
```

#### Issue: State store connection failures

**Symptoms:** Database connection errors, timeout errors

**Diagnosis:**
```bash
# Test PostgreSQL connection
psql -h db-server.example.com -U aureus -d aureus_state -c "SELECT 1;"

# Check connection pool
psql -d aureus_state -c "SELECT * FROM pg_stat_activity;"

# Check network connectivity
telnet db-server.example.com 5432
```

**Resolution:**
```bash
# Increase connection pool size
# Update database configuration
ALTER SYSTEM SET max_connections = 200;

# Restart PostgreSQL
systemctl restart postgresql
```

#### Issue: Event log disk full

**Symptoms:** Write failures, disk space errors

**Diagnosis:**
```bash
# Check disk usage
df -h /var/run

# Check largest files
du -sh /var/run/* | sort -h | tail -10

# Check inode usage
df -i /var/run
```

**Resolution:**
```bash
# Compress old logs
find /var/run -name "events.log" -mtime +7 -exec gzip {} \;

# Move to archival storage
find /var/run -name "events.log.gz" -exec mv {} /archive/ \;

# Clean up old workflows
find /var/run -type d -mtime +30 -exec rm -rf {} \;
```

#### Issue: High memory usage

**Symptoms:** OOM errors, slow performance

**Diagnosis:**
```bash
# Check memory usage
ps aux | grep node | sort -k4 -rn | head -10

# Check Node.js heap
node --inspect dist/server.js

# Generate heap snapshot
kill -USR2 $(pgrep node)
```

**Resolution:**
```bash
# Increase Node.js memory limit
NODE_OPTIONS="--max-old-space-size=4096" node dist/server.js

# Enable garbage collection logging
NODE_OPTIONS="--trace-gc" node dist/server.js

# Restart application
systemctl restart aureus-console
```

## Additional Resources

- [Production Readiness Checklist](./production_readiness.md)
- [Security Model](./security_model.md)
- [Monitoring and Alerting Guide](./monitoring-and-alerting.md)
- [Policy Guide](./policy-guide.md)

## Support

For deployment support:
- Documentation: https://docs.aureus.example.com
- Issues: https://github.com/your-org/Aureus_Agentic_OS/issues
- Community: https://community.aureus.example.com
