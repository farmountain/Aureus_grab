# DevOps Guide for Aureus Agentic OS

This comprehensive guide covers the complete DevOps lifecycle for Aureus Agentic OS, including release management, CI/CD pipelines, environment configuration, and operational procedures.

## Table of Contents

1. [Release Flow](#release-flow)
2. [Environment Requirements](#environment-requirements)
3. [Environment Variables and Secrets](#environment-variables-and-secrets)
4. [CI/CD Pipeline Architecture](#cicd-pipeline-architecture)
5. [Deployment Workflows](#deployment-workflows)
6. [Rollback Procedures](#rollback-procedures)
7. [Monitoring and Health Checks](#monitoring-and-health-checks)
8. [Security Best Practices](#security-best-practices)
9. [Troubleshooting](#troubleshooting)

---

## Release Flow

### Overview

Aureus follows a multi-stage release process that ensures quality, stability, and safety at each step:

```
Development → Build → Test → Staging → Smoke Tests → Production → Monitoring
```

### Release Stages

#### 1. Development Stage

**Purpose**: Feature development and initial testing

**Actions**:
- Developers commit code to feature branches
- Unit tests run automatically on each commit
- Code review required before merging to `main`
- Integration tests run on `main` branch

**Quality Gates**:
- All unit tests pass
- Code coverage ≥ 80%
- No critical security vulnerabilities
- Code review approved by at least 1 reviewer

#### 2. Build Stage

**Purpose**: Compile and package the application

**Actions**:
- Build all packages in dependency order
- Generate build artifacts
- Create deployment packages
- Tag with semantic version

**Artifacts**:
- Compiled TypeScript (dist/ directories)
- npm packages (.tgz files)
- Docker images (optional)
- Deployment archives (.tar.gz)

**Quality Gates**:
- Build succeeds without errors
- All dependencies resolved
- Artifacts pass integrity checks

#### 3. Test Stage

**Purpose**: Comprehensive automated testing

**Actions**:
- Run unit tests across all packages
- Execute integration tests
- Run security scans (CodeQL, npm audit)
- Perform policy validation tests
- Execute CRV (Correctness, Reliability, Validity) checks

**Quality Gates**:
- All tests pass (100%)
- Security scan: No high/critical vulnerabilities
- Policy tests: All rules enforced
- CRV gates: All validators pass

#### 4. Staging Deployment

**Purpose**: Deploy to production-like environment for validation

**Actions**:
- Deploy to staging environment
- Run smoke tests
- Execute end-to-end tests
- Performance testing
- Load testing (optional)

**Quality Gates**:
- Deployment succeeds
- All smoke tests pass
- No errors in logs for 30 minutes
- Health checks pass
- Performance metrics within acceptable range

#### 5. Production Deployment

**Purpose**: Release to production environment

**Actions**:
- Create deployment record
- Deploy to production servers (rolling or blue-green)
- Run production smoke tests
- Enable monitoring and alerting
- Update deployment status

**Quality Gates**:
- Staging deployment successful
- All approvals obtained (for high-risk changes)
- Rollback plan verified
- Backup created

**Deployment Strategies**:
- **Rolling Deployment**: Deploy to one server at a time
- **Blue-Green Deployment**: Switch traffic between two identical environments
- **Canary Deployment**: Gradually roll out to subset of users

#### 6. Post-Deployment Monitoring

**Purpose**: Verify production health and performance

**Actions**:
- Monitor error rates
- Track performance metrics
- Watch for anomalies
- Collect user feedback

**Success Criteria**:
- Error rate < 1%
- Response time < 500ms (p95)
- No critical incidents for 24 hours
- User reports: No major issues

### Version Management

Aureus uses semantic versioning (SemVer): `MAJOR.MINOR.PATCH`

**Version Bumping Rules**:
- **MAJOR**: Breaking changes to APIs or workflows
- **MINOR**: New features, backward-compatible
- **PATCH**: Bug fixes, no new features

**Release Branches**:
- `main`: Development branch, always deployable
- `production`: Production-ready code
- `v{major}.{minor}.x`: Long-term support branches

**Tagging**:
```bash
# Create a release tag
git tag -a v1.2.3 -m "Release version 1.2.3"
git push origin v1.2.3
```

### Release Checklist

Before releasing to production:

- [ ] All tests pass in CI/CD pipeline
- [ ] Security scans completed with no critical issues
- [ ] Documentation updated (CHANGELOG.md, README.md)
- [ ] Version number bumped appropriately
- [ ] Staging deployment successful
- [ ] Smoke tests pass in staging
- [ ] Rollback plan documented and tested
- [ ] Monitoring and alerts configured
- [ ] On-call engineer identified
- [ ] Stakeholders notified of deployment

---

## Environment Requirements

### Development Environment

**Required Software**:
- Node.js: ≥ 18.0.0
- npm: ≥ 9.0.0
- TypeScript: ≥ 5.3.0
- Git: ≥ 2.30.0

**Optional Tools**:
- Docker: For containerized development
- PostgreSQL: For persistent state store
- Redis: For caching and high-performance state store

**Hardware Requirements**:
- CPU: 2+ cores
- RAM: 4GB minimum, 8GB recommended
- Disk: 10GB free space

### Staging Environment

**Purpose**: Production-like testing environment

**Infrastructure**:
- Application servers: 2-3 instances
- Load balancer: 1 instance (nginx or HAProxy)
- Database: PostgreSQL with replication
- Event storage: NFS or S3-compatible storage
- Monitoring: Prometheus + Grafana

**Recommended Specifications**:
- CPU: 4 cores per app server
- RAM: 8GB per app server
- Disk: 50GB SSD per server
- Network: 1Gbps

**Configuration**:
- Environment: `staging`
- Log level: `info`
- Debug mode: Enabled
- Monitoring: Full observability stack

### Production Environment

**Purpose**: Live production system serving real users

**Infrastructure**:
- Application servers: 3-5 instances (depending on load)
- Load balancer: 2+ instances (HA configuration)
- Database: PostgreSQL with primary-standby replication
- Event storage: Replicated NFS or S3 with versioning
- Monitoring: Full observability stack with alerting

**Minimum Specifications**:
- CPU: 8 cores per app server
- RAM: 16GB per app server
- Disk: 100GB SSD per server
- Network: 10Gbps

**High-Availability Requirements**:
- Multiple availability zones
- Automated failover
- Regular backups (hourly for critical data)
- Disaster recovery site (optional but recommended)

**Configuration**:
- Environment: `production`
- Log level: `warn` or `error`
- Debug mode: Disabled
- Monitoring: Real-time alerts enabled

### Container Requirements (Optional)

If using Docker/Kubernetes:

**Docker**:
- Base image: `node:18-alpine`
- Multi-stage builds for smaller images
- Health checks configured
- Resource limits set

**Kubernetes**:
- Minimum version: 1.24
- Ingress controller: nginx-ingress or Traefik
- Persistent volumes: For state and event logs
- HorizontalPodAutoscaler: For auto-scaling

---

## Environment Variables and Secrets

### Application Environment Variables

#### Console App (`apps/console`)

| Variable | Description | Required | Default | Example |
|----------|-------------|----------|---------|---------|
| `NODE_ENV` | Environment mode | Yes | `development` | `production` |
| `PORT` | HTTP server port | No | `3000` | `8080` |
| `LOG_LEVEL` | Logging level | No | `info` | `error` |
| `STATE_STORE_TYPE` | State storage backend | No | `memory` | `postgres` |
| `EVENT_LOG_BASE_DIR` | Event log directory | No | `./var/run` | `/var/aureus/events` |
| `ENABLE_AUTH` | Enable authentication | No | `true` | `false` |
| `JWT_SECRET` | Secret for JWT tokens | Yes (if auth enabled) | - | `your-secret-key` |
| `JWT_EXPIRY` | JWT token expiration | No | `24h` | `7d` |
| `CORS_ORIGIN` | CORS allowed origins | No | `*` | `https://console.example.com` |
| `MAX_REQUEST_SIZE` | Max request body size | No | `10mb` | `50mb` |

#### Database Configuration (PostgreSQL)

| Variable | Description | Required | Example |
|----------|-------------|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string | Yes | `postgresql://user:pass@host:5432/aureus` |
| `DATABASE_POOL_SIZE` | Connection pool size | No | `20` |
| `DATABASE_SSL` | Enable SSL for DB connection | No | `true` |
| `DATABASE_TIMEOUT` | Query timeout (ms) | No | `30000` |

#### Redis Configuration (Optional)

| Variable | Description | Required | Example |
|----------|-------------|----------|---------|
| `REDIS_URL` | Redis connection string | No | `redis://localhost:6379` |
| `REDIS_PASSWORD` | Redis password | No | `your-redis-password` |
| `REDIS_TTL` | Cache TTL (seconds) | No | `3600` |

#### LLM Provider Configuration

| Variable | Description | Required | Example |
|----------|-------------|----------|---------|
| `OPENAI_API_KEY` | OpenAI API key | No | `sk-...` |
| `ANTHROPIC_API_KEY` | Anthropic API key | No | `sk-ant-...` |
| `LLM_PROVIDER` | Default LLM provider | No | `openai` |
| `LLM_MODEL` | Default model name | No | `gpt-4` |
| `LLM_TEMPERATURE` | Generation temperature | No | `0.7` |
| `LLM_MAX_TOKENS` | Max tokens per request | No | `2048` |

#### Observability Configuration

| Variable | Description | Required | Example |
|----------|-------------|----------|---------|
| `ENABLE_METRICS` | Enable Prometheus metrics | No | `true` |
| `METRICS_PORT` | Metrics endpoint port | No | `9090` |
| `ENABLE_TRACING` | Enable distributed tracing | No | `false` |
| `JAEGER_ENDPOINT` | Jaeger collector endpoint | No | `http://jaeger:14268/api/traces` |

### CI/CD Secrets

#### GitHub Actions Secrets

Configure these secrets in your GitHub repository settings:

| Secret Name | Description | Example |
|-------------|-------------|---------|
| `STAGING_SSH_KEY` | SSH private key for staging deployment | `-----BEGIN OPENSSH PRIVATE KEY-----...` |
| `STAGING_HOST` | Staging server hostname | `staging.aureus.example.com` |
| `STAGING_USER` | SSH user for staging | `deploy` |
| `PRODUCTION_SSH_KEY` | SSH private key for production deployment | `-----BEGIN OPENSSH PRIVATE KEY-----...` |
| `PRODUCTION_HOSTS` | Comma-separated production hosts | `prod1.example.com,prod2.example.com` |
| `PRODUCTION_USER` | SSH user for production | `deploy` |
| `NPM_TOKEN` | npm registry authentication token | `npm_...` |
| `DOCKER_USERNAME` | Docker Hub username | `youruser` |
| `DOCKER_PASSWORD` | Docker Hub password | `yourpassword` |
| `SLACK_WEBHOOK` | Slack webhook for notifications | `https://hooks.slack.com/...` |

#### GitLab CI/CD Variables

Configure these variables in GitLab CI/CD settings:

| Variable Name | Description | Protected | Masked |
|---------------|-------------|-----------|--------|
| `STAGING_SSH_KEY` | SSH private key for staging | Yes | Yes |
| `STAGING_HOST` | Staging server hostname | No | No |
| `PRODUCTION_SSH_KEY` | SSH private key for production | Yes | Yes |
| `PRODUCTION_HOSTS` | Production server hostnames | Yes | No |
| `DATABASE_URL` | Production database URL | Yes | Yes |
| `JWT_SECRET` | JWT signing secret | Yes | Yes |
| `OPENAI_API_KEY` | OpenAI API key | Yes | Yes |

### Secrets Management

**Best Practices**:
1. Never commit secrets to version control
2. Use `.env` files for local development (add to `.gitignore`)
3. Use secrets management tools in production:
   - **AWS Secrets Manager**
   - **HashiCorp Vault**
   - **Azure Key Vault**
   - **Google Secret Manager**

**Loading Secrets at Runtime**:

```typescript
// Example: Load from AWS Secrets Manager
import { SecretsManager } from '@aws-sdk/client-secrets-manager';

async function loadSecrets() {
  const client = new SecretsManager({ region: 'us-east-1' });
  const response = await client.getSecretValue({ 
    SecretId: 'aureus/production/app-secrets' 
  });
  
  const secrets = JSON.parse(response.SecretString);
  process.env.JWT_SECRET = secrets.JWT_SECRET;
  process.env.DATABASE_URL = secrets.DATABASE_URL;
}
```

**Environment File Template** (`.env.example`):

```bash
# Application Configuration
NODE_ENV=production
PORT=3000
LOG_LEVEL=info

# Database Configuration
DATABASE_URL=postgresql://user:password@localhost:5432/aureus
DATABASE_POOL_SIZE=20

# Authentication
ENABLE_AUTH=true
JWT_SECRET=your-secret-key-here
JWT_EXPIRY=24h

# LLM Configuration (optional)
OPENAI_API_KEY=sk-your-key-here
LLM_PROVIDER=openai
LLM_MODEL=gpt-4

# Storage Configuration
STATE_STORE_TYPE=postgres
EVENT_LOG_BASE_DIR=/var/aureus/events

# Observability
ENABLE_METRICS=true
METRICS_PORT=9090
```

---

## CI/CD Pipeline Architecture

### Pipeline Overview

The CI/CD pipeline automates the entire release process from code commit to production deployment.

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Commit    │────▶│    Build    │────▶│    Test     │
└─────────────┘     └─────────────┘     └─────────────┘
                                               │
                    ┌──────────────────────────┘
                    │
                    ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Staging    │────▶│   Smoke     │────▶│ Production  │
│  Deploy     │     │   Tests     │     │   Deploy    │
└─────────────┘     └─────────────┘     └─────────────┘
                                               │
                    ┌──────────────────────────┘
                    │
                    ▼
                ┌─────────────┐
                │  Monitoring │
                └─────────────┘
```

### Pipeline Stages

#### Stage 1: Build

**Triggers**:
- Push to `main` branch
- Pull request creation
- Manual trigger

**Jobs**:
1. Install dependencies (`npm ci`)
2. Build packages in dependency order (`npm run build:ordered`)
3. Build console app (`npm run build --workspace=@aureus/console`)
4. Create deployment artifacts
5. Upload artifacts to CI storage

**Duration**: ~5-10 minutes

#### Stage 2: Test

**Jobs**:
1. Unit tests (`npm run test`)
2. Integration tests
3. Security scanning (`npm audit`, CodeQL)
4. Policy validation tests
5. CRV gate validation
6. Code coverage analysis

**Duration**: ~10-15 minutes

**Failure Actions**:
- Notify developers via Slack/email
- Block merge to main branch
- Create issue for tracking

#### Stage 3: Package

**Jobs**:
1. Create deployment packages (.tar.gz)
2. Build Docker images (optional)
3. Tag with version number
4. Push to artifact registry (npm, Docker Hub)

**Duration**: ~5 minutes

#### Stage 4: Deploy to Staging

**Jobs**:
1. Deploy to staging environment
2. Run database migrations (if needed)
3. Restart services
4. Wait for services to be ready

**Duration**: ~5-10 minutes

**Deployment Methods**:
- SSH + rsync
- Docker + Kubernetes
- Ansible playbooks

#### Stage 5: Smoke Tests

**Jobs**:
1. Execute smoke test suite
2. Health check validation
3. API endpoint testing
4. Performance benchmarking

**Duration**: ~5-10 minutes

**Test Types**:
- Basic workflow execution
- API response validation
- Database connectivity
- Authentication flow

#### Stage 6: Deploy to Production

**Triggers**:
- Successful staging deployment
- Manual approval (for high-risk changes)
- Tag push (`v*`)

**Jobs**:
1. Create deployment record
2. Deploy to production servers (one at a time)
3. Health check after each server
4. Run production smoke tests
5. Update deployment status

**Duration**: ~15-30 minutes (depending on number of servers)

**Deployment Strategies**:
- Rolling deployment with health checks
- Blue-green deployment with traffic switching
- Canary deployment with gradual rollout

#### Stage 7: Post-Deployment

**Jobs**:
1. Monitor error rates for 30 minutes
2. Check performance metrics
3. Verify no regressions
4. Send deployment notification

**Duration**: ~30 minutes of monitoring

### Pipeline Templates

See the following directories for ready-to-use CI/CD templates:
- `docs/ci-cd-templates/github-actions/` - GitHub Actions workflows
- `docs/ci-cd-templates/gitlab-ci/` - GitLab CI pipelines
- `docs/ci-cd-templates/jenkins/` - Jenkins pipelines

---

## Deployment Workflows

### API-Driven Deployment Workflow

The Console API provides endpoints to trigger and manage deployment workflows programmatically.

#### 1. Register a Version

Register a new workflow version for deployment:

**Endpoint**: `POST /api/deployments/versions`

**Request**:
```json
{
  "workflowSpec": {
    "id": "my-workflow",
    "name": "My Workflow",
    "version": "1.0.0",
    "tasks": [...]
  },
  "version": "1.0.0",
  "createdBy": "developer@example.com",
  "metadata": {
    "gitCommit": "abc123",
    "buildNumber": "42"
  }
}
```

**Response**:
```json
{
  "id": "version-uuid",
  "version": "1.0.0",
  "workflowId": "my-workflow",
  "createdAt": "2024-01-09T10:00:00Z",
  "createdBy": "developer@example.com",
  "status": "registered"
}
```

#### 2. Create Deployment to Staging

Deploy a registered version to staging:

**Endpoint**: `POST /api/deployments`

**Request**:
```json
{
  "versionId": "version-uuid",
  "environment": "staging",
  "deployedBy": "ci-cd-bot",
  "metadata": {
    "triggeredBy": "pipeline",
    "pipelineId": "run-123"
  }
}
```

**Response**:
```json
{
  "id": "deployment-uuid",
  "versionId": "version-uuid",
  "environment": "staging",
  "status": "pending",
  "createdAt": "2024-01-09T10:05:00Z",
  "deployedBy": "ci-cd-bot"
}
```

#### 3. Run Smoke Tests

Execute smoke tests against the staged deployment:

**Endpoint**: `POST /api/deployments/:id/smoke-tests`

**Request**:
```json
{
  "tests": [
    {
      "name": "Basic Workflow Execution",
      "workflowId": "my-workflow",
      "expectedOutcome": "success"
    },
    {
      "name": "API Health Check",
      "endpoint": "/health",
      "expectedStatus": 200
    }
  ]
}
```

**Response**:
```json
{
  "deploymentId": "deployment-uuid",
  "testResults": [
    {
      "name": "Basic Workflow Execution",
      "status": "passed",
      "duration": 1500
    },
    {
      "name": "API Health Check",
      "status": "passed",
      "duration": 50
    }
  ],
  "overallStatus": "passed",
  "passedTests": 2,
  "failedTests": 0,
  "totalTests": 2
}
```

#### 4. Promote to Production

Promote a successful staging deployment to production:

**Endpoint**: `POST /api/deployments/:id/promote`

**Request**:
```json
{
  "promotedBy": "release-manager@example.com",
  "targetEnvironment": "production",
  "strategy": "rolling",
  "metadata": {
    "approvalTicket": "JIRA-123"
  }
}
```

**Response**:
```json
{
  "id": "production-deployment-uuid",
  "sourceDeploymentId": "deployment-uuid",
  "environment": "production",
  "status": "pending",
  "strategy": "rolling",
  "createdAt": "2024-01-09T11:00:00Z",
  "promotedBy": "release-manager@example.com"
}
```

#### 5. Monitor Deployment Status

Check deployment status:

**Endpoint**: `GET /api/deployments/:id`

**Response**:
```json
{
  "id": "production-deployment-uuid",
  "versionId": "version-uuid",
  "environment": "production",
  "status": "deployed",
  "strategy": "rolling",
  "deployedAt": "2024-01-09T11:10:00Z",
  "health": {
    "status": "healthy",
    "errorRate": 0.001,
    "responseTime": 250,
    "lastChecked": "2024-01-09T11:15:00Z"
  }
}
```

### Automated Deployment Workflow Example

```bash
#!/bin/bash
# automated-deployment.sh

set -e

VERSION="1.0.0"
API_BASE="https://console.aureus.example.com/api"
AUTH_TOKEN="your-jwt-token"

echo "Starting automated deployment for version ${VERSION}"

# 1. Register version
echo "Registering version..."
VERSION_ID=$(curl -X POST "${API_BASE}/deployments/versions" \
  -H "Authorization: Bearer ${AUTH_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{
    \"workflowSpec\": $(cat workflow-spec.json),
    \"version\": \"${VERSION}\",
    \"createdBy\": \"ci-cd-bot\"
  }" | jq -r '.id')

echo "Version registered: ${VERSION_ID}"

# 2. Deploy to staging
echo "Deploying to staging..."
STAGING_DEPLOYMENT_ID=$(curl -X POST "${API_BASE}/deployments" \
  -H "Authorization: Bearer ${AUTH_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{
    \"versionId\": \"${VERSION_ID}\",
    \"environment\": \"staging\",
    \"deployedBy\": \"ci-cd-bot\"
  }" | jq -r '.id')

echo "Staging deployment created: ${STAGING_DEPLOYMENT_ID}"

# 3. Wait for deployment to complete
echo "Waiting for staging deployment..."
while true; do
  STATUS=$(curl -s "${API_BASE}/deployments/${STAGING_DEPLOYMENT_ID}" \
    -H "Authorization: Bearer ${AUTH_TOKEN}" | jq -r '.status')
  
  if [ "$STATUS" == "deployed" ]; then
    echo "Staging deployment successful"
    break
  elif [ "$STATUS" == "failed" ]; then
    echo "Staging deployment failed"
    exit 1
  fi
  
  sleep 10
done

# 4. Run smoke tests
echo "Running smoke tests..."
TEST_RESULTS=$(curl -X POST "${API_BASE}/deployments/${STAGING_DEPLOYMENT_ID}/smoke-tests" \
  -H "Authorization: Bearer ${AUTH_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{
    \"tests\": [
      {\"name\": \"Basic Workflow\", \"workflowId\": \"my-workflow\"}
    ]
  }" | jq -r '.overallStatus')

if [ "$TEST_RESULTS" != "passed" ]; then
  echo "Smoke tests failed"
  exit 1
fi

echo "Smoke tests passed"

# 5. Promote to production (requires manual approval in this example)
echo "Ready to promote to production"
echo "Run: curl -X POST ${API_BASE}/deployments/${STAGING_DEPLOYMENT_ID}/promote ..."

# Or auto-promote for low-risk changes
# PROD_DEPLOYMENT_ID=$(curl -X POST "${API_BASE}/deployments/${STAGING_DEPLOYMENT_ID}/promote" \
#   -H "Authorization: Bearer ${AUTH_TOKEN}" \
#   -H "Content-Type: application/json" \
#   -d "{\"promotedBy\": \"ci-cd-bot\"}" | jq -r '.id')

echo "Deployment workflow complete"
```

---

## Rollback Procedures

### When to Rollback

Rollback immediately if:
- Critical bug discovered in production
- Security vulnerability exploited
- Performance degradation (>50% slower)
- Error rate spike (>5% of requests)
- Data corruption detected
- Service unavailable (outage)

### Rollback Strategy

#### 1. Automated Rollback (Recommended)

The CI/CD pipeline can automatically rollback on deployment failure:

**Triggers**:
- Post-deployment verification fails
- Health checks fail after 5 minutes
- Error rate exceeds threshold
- Smoke tests fail in production

**Process**:
1. Detect failure condition
2. Stop ongoing deployment
3. Restore previous version from backup
4. Restart services
5. Verify rollback success
6. Send notifications

**Script**: `ops/rollback/automated-rollback.sh`

```bash
#!/bin/bash
# Automated rollback script

ENVIRONMENT=${ENVIRONMENT:-production}
ROLLBACK_VERSION=${ROLLBACK_VERSION:-previous}

echo "Initiating automated rollback for ${ENVIRONMENT}"

# 1. Get current deployment
CURRENT_DEPLOYMENT=$(curl -s http://localhost:3000/api/deployments?environment=${ENVIRONMENT} | jq -r '.[0].id')

# 2. Create rollback deployment record
ROLLBACK_ID=$(curl -X POST http://localhost:3000/api/deployments/rollback \
  -H "Content-Type: application/json" \
  -d "{
    \"deploymentId\": \"${CURRENT_DEPLOYMENT}\",
    \"reason\": \"Automated rollback due to health check failure\"
  }" | jq -r '.id')

# 3. Stop services
sudo systemctl stop aureus-console

# 4. Restore from backup
BACKUP_DIR="/opt/aureus/apps/console.backup"
if [ -d "${BACKUP_DIR}" ]; then
  sudo rm -rf /opt/aureus/apps/console
  sudo cp -r "${BACKUP_DIR}" /opt/aureus/apps/console
else
  echo "Error: Backup directory not found"
  exit 1
fi

# 5. Restart services
sudo systemctl start aureus-console

# 6. Wait for service to be ready
sleep 30

# 7. Verify rollback
HEALTH_STATUS=$(curl -s http://localhost:3000/health | jq -r '.status')
if [ "$HEALTH_STATUS" != "healthy" ]; then
  echo "Rollback verification failed"
  exit 1
fi

echo "Rollback completed successfully"
```

#### 2. Manual Rollback

For controlled rollback with human oversight:

**Step 1: Identify Issue**
```bash
# Check logs
tail -f /var/log/aureus/console.log

# Check metrics
curl http://localhost:3000/metrics | grep error_rate
```

**Step 2: Notify Team**
```bash
# Send alert to team
./ops/notify.sh "ALERT: Production issue detected, initiating rollback"
```

**Step 3: Create Rollback Plan**
- Document current state
- Identify target rollback version
- List affected components
- Estimate downtime

**Step 4: Execute Rollback**
```bash
# Set environment variables
export ENVIRONMENT=production
export ROLLBACK_VERSION=v1.2.2

# Run rollback script
./ops/rollback/manual-rollback.sh
```

**Step 5: Verify Rollback**
```bash
# Check version
curl http://localhost:3000/health | jq -r '.version'

# Run smoke tests
./ops/verification/post-deployment.sh

# Check error rate
curl http://localhost:3000/metrics | grep error_rate
```

**Step 6: Post-Mortem**
- Document what went wrong
- Identify root cause
- Create action items to prevent recurrence
- Update runbooks

#### 3. Database Rollback

If database migrations were included:

**Option A: Forward-Fix** (Recommended)
- Create new migration to revert changes
- Deploy fix as new version

**Option B: Database Restore** (Last Resort)
```bash
# Stop application
sudo systemctl stop aureus-console

# Restore database from backup
pg_restore -d aureus_state backup_before_deployment.dump

# Restart application with previous version
sudo systemctl start aureus-console
```

#### 4. Event Log Rollback

Event logs are append-only and should not be rolled back. Instead:

**Compensation Strategy**:
- Add compensating events to correct state
- Mark problematic events as "compensated"
- Use snapshots to rebuild state if needed

```bash
# Restore from snapshot
./ops/rollback/restore-snapshot.sh snapshot-id-before-deployment
```

### Rollback Testing

Test rollback procedures regularly:

**Monthly Rollback Drill**:
1. Deploy to staging
2. Intentionally introduce a "failure"
3. Execute rollback procedure
4. Verify system recovery
5. Document lessons learned

**Checklist**:
- [ ] Rollback script tested and working
- [ ] Backups verified and restorable
- [ ] Team trained on rollback procedure
- [ ] Rollback time measured (target: <5 minutes)
- [ ] Communication plan established

---

## Monitoring and Health Checks

### Health Check Endpoints

#### Primary Health Check

**Endpoint**: `GET /health`

**Response**:
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "uptime": 3600,
  "timestamp": "2024-01-09T12:00:00Z",
  "components": {
    "api": "operational",
    "database": "operational",
    "stateStore": "operational",
    "eventLog": "operational"
  }
}
```

**Status Codes**:
- `200`: Healthy
- `503`: Unhealthy or degraded

#### Readiness Probe

**Endpoint**: `GET /ready`

Used by Kubernetes to determine if pod can receive traffic.

**Response**:
```json
{
  "ready": true,
  "checks": {
    "database": true,
    "dependencies": true
  }
}
```

#### Liveness Probe

**Endpoint**: `GET /live`

Used by Kubernetes to determine if pod should be restarted.

**Response**:
```json
{
  "alive": true
}
```

### Metrics Collection

Prometheus metrics available at `/metrics`:

**Key Metrics**:
- `aureus_workflow_executions_total`: Total workflow executions
- `aureus_workflow_execution_duration_seconds`: Workflow execution time
- `aureus_workflow_errors_total`: Total workflow errors
- `aureus_state_store_operations_total`: State store operation count
- `aureus_event_log_writes_total`: Event log write count
- `aureus_api_requests_total`: API request count
- `aureus_api_request_duration_seconds`: API request duration

### Alerting Rules

Configure alerts in Prometheus:

```yaml
# Example alert rules
groups:
  - name: aureus_production_alerts
    rules:
      - alert: HighErrorRate
        expr: rate(aureus_workflow_errors_total[5m]) > 0.05
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "High error rate detected"
          description: "Error rate is {{ $value }} errors/sec"

      - alert: HighLatency
        expr: histogram_quantile(0.95, rate(aureus_api_request_duration_seconds_bucket[5m])) > 1.0
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "High API latency"
          description: "95th percentile latency is {{ $value }}s"

      - alert: ServiceDown
        expr: up{job="aureus-console"} == 0
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "Aureus Console is down"
```

---

## Security Best Practices

### Secure Deployment

1. **Use TLS/SSL for all endpoints**
   - Configure HTTPS in production
   - Use Let's Encrypt for certificates
   - Redirect HTTP to HTTPS

2. **Implement Authentication and Authorization**
   - Enable JWT authentication
   - Use role-based access control (RBAC)
   - Rotate JWT secrets regularly

3. **Secure Secrets Management**
   - Never commit secrets to git
   - Use secrets management tools (Vault, AWS Secrets Manager)
   - Rotate secrets quarterly

4. **Network Security**
   - Use firewalls to restrict access
   - Implement network segmentation
   - Use VPN for internal services

5. **Regular Security Audits**
   - Run `npm audit` before each release
   - Use CodeQL for static analysis
   - Perform penetration testing annually

6. **Data Encryption**
   - Encrypt data at rest (database encryption)
   - Encrypt data in transit (TLS)
   - Encrypt backups

### Security Checklist

Before deploying to production:

- [ ] All secrets rotated and stored securely
- [ ] TLS/SSL certificates valid and up-to-date
- [ ] Authentication enabled and tested
- [ ] Authorization rules configured correctly
- [ ] Firewall rules reviewed and applied
- [ ] Security audit passed (no critical vulnerabilities)
- [ ] Backups encrypted
- [ ] Audit logging enabled
- [ ] Incident response plan documented
- [ ] Security monitoring alerts configured

---

## Troubleshooting

### Common Issues

#### Issue: Deployment Fails During Build

**Symptoms**: Build stage fails, compilation errors

**Diagnosis**:
```bash
# Check build logs
npm run build:ordered 2>&1 | tee build.log

# Check for dependency issues
npm ls
```

**Resolution**:
- Fix compilation errors
- Update dependencies: `npm update`
- Clear cache: `npm cache clean --force`

#### Issue: Deployment Fails During Tests

**Symptoms**: Test stage fails, tests don't pass

**Diagnosis**:
```bash
# Run tests locally
npm run test

# Check specific failing tests
npm run test -- --reporter=verbose
```

**Resolution**:
- Fix failing tests
- Update test expectations if behavior changed
- Check for environment-specific issues

#### Issue: Service Won't Start After Deployment

**Symptoms**: Service crashes immediately after startup

**Diagnosis**:
```bash
# Check service status
sudo systemctl status aureus-console

# Check logs
sudo journalctl -u aureus-console -n 100

# Check for port conflicts
sudo lsof -i :3000
```

**Resolution**:
- Fix configuration errors
- Kill process using the port
- Check environment variables are set correctly

#### Issue: High Error Rate After Deployment

**Symptoms**: Error rate spikes after deployment

**Diagnosis**:
```bash
# Check error logs
tail -f /var/log/aureus/error.log

# Check metrics
curl http://localhost:3000/metrics | grep error_rate
```

**Resolution**:
- Rollback immediately if critical
- Fix identified issues
- Deploy fix as new version

---

## Additional Resources

- [Deployment Guide](./deployment.md) - Detailed deployment procedures
- [CI/CD Templates](./ci-cd-templates/) - Ready-to-use pipeline templates
- [Security Model](./security_model.md) - Security architecture and policies
- [Monitoring Guide](./monitoring-and-alerting.md) - Comprehensive monitoring setup

## Support

For DevOps support:
- **Documentation**: https://docs.aureus.example.com/devops
- **Issues**: https://github.com/farmountain/Aureus_Agentic_OS/issues
- **Community**: https://community.aureus.example.com

---

**Last Updated**: 2024-01-09
**Version**: 1.0.0
