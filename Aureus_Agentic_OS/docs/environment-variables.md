# Environment Variables and Secrets Configuration

This document provides a comprehensive reference for all environment variables and secrets required to run Aureus Agentic OS in different environments.

## Table of Contents

- [Application Environment Variables](#application-environment-variables)
- [CI/CD Secrets](#cicd-secrets)
- [Environment-Specific Configuration](#environment-specific-configuration)
- [Secrets Management](#secrets-management)
- [Environment File Templates](#environment-file-templates)
- [Security Best Practices](#security-best-practices)

---

## Application Environment Variables

### Core Configuration

| Variable | Description | Required | Default | Example | Valid Values |
|----------|-------------|----------|---------|---------|--------------|
| `NODE_ENV` | Node.js environment mode | Yes | `development` | `production` | `development`, `staging`, `production`, `test` |
| `PORT` | HTTP server port | No | `3000` | `8080` | Any valid port number (1-65535) |
| `HOST` | Server bind address | No | `0.0.0.0` | `localhost` | Any valid IP address or hostname |
| `LOG_LEVEL` | Application log level | No | `info` | `error` | `trace`, `debug`, `info`, `warn`, `error`, `fatal` |
| `LOG_FORMAT` | Log output format | No | `json` | `pretty` | `json`, `pretty`, `text` |

### Storage Configuration

| Variable | Description | Required | Default | Example |
|----------|-------------|----------|---------|---------|
| `STATE_STORE_TYPE` | State storage backend | No | `memory` | `postgres` |
| `EVENT_LOG_TYPE` | Event log storage backend | No | `filesystem` | `s3` |
| `EVENT_LOG_BASE_DIR` | Base directory for event logs | No | `./var/run` | `/var/aureus/events` |
| `SNAPSHOT_STORAGE_TYPE` | Snapshot storage backend | No | `memory` | `s3` |
| `BACKUP_ENABLED` | Enable automated backups | No | `false` | `true` |
| `BACKUP_INTERVAL_HOURS` | Backup frequency in hours | No | `24` | `6` |

### Database Configuration (PostgreSQL)

| Variable | Description | Required | Example |
|----------|-------------|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string | Yes* | `postgresql://user:pass@localhost:5432/aureus` |
| `DATABASE_HOST` | Database host | Yes* | `localhost` |
| `DATABASE_PORT` | Database port | No | `5432` |
| `DATABASE_NAME` | Database name | Yes* | `aureus_state` |
| `DATABASE_USER` | Database user | Yes* | `aureus` |
| `DATABASE_PASSWORD` | Database password | Yes* | `secure-password` |
| `DATABASE_POOL_MIN` | Minimum pool size | No | `2` |
| `DATABASE_POOL_MAX` | Maximum pool size | No | `20` |
| `DATABASE_SSL` | Enable SSL for DB connection | No | `false` |
| `DATABASE_TIMEOUT` | Query timeout (milliseconds) | No | `30000` |
| `DATABASE_IDLE_TIMEOUT` | Idle connection timeout (ms) | No | `10000` |

\* Either `DATABASE_URL` or the individual connection parameters are required.

### Redis Configuration (Optional)

| Variable | Description | Required | Example |
|----------|-------------|----------|---------|
| `REDIS_URL` | Redis connection string | No | `redis://localhost:6379` |
| `REDIS_HOST` | Redis host | No | `localhost` |
| `REDIS_PORT` | Redis port | No | `6379` |
| `REDIS_PASSWORD` | Redis password | No | `your-redis-password` |
| `REDIS_DB` | Redis database number | No | `0` |
| `REDIS_TTL` | Cache TTL (seconds) | No | `3600` |
| `REDIS_KEY_PREFIX` | Prefix for all Redis keys | No | `aureus:` |

### Authentication & Security

| Variable | Description | Required | Example |
|----------|-------------|----------|---------|
| `ENABLE_AUTH` | Enable JWT authentication | No | `true` |
| `JWT_SECRET` | Secret for signing JWT tokens | Yes* | `your-256-bit-secret-key-here` |
| `JWT_ALGORITHM` | JWT signing algorithm | No | `HS256` |
| `JWT_EXPIRY` | JWT token expiration time | No | `24h` |
| `JWT_REFRESH_EXPIRY` | Refresh token expiration | No | `7d` |
| `BCRYPT_ROUNDS` | Password hashing rounds | No | `10` |
| `SESSION_SECRET` | Session secret key | No | `session-secret-key` |
| `CORS_ORIGIN` | CORS allowed origins | No | `*` |
| `CORS_CREDENTIALS` | Allow CORS credentials | No | `true` |
| `RATE_LIMIT_ENABLED` | Enable rate limiting | No | `true` |
| `RATE_LIMIT_MAX` | Max requests per window | No | `100` |
| `RATE_LIMIT_WINDOW_MS` | Rate limit window (ms) | No | `60000` |

\* Required if `ENABLE_AUTH` is `true`.

### LLM Provider Configuration

| Variable | Description | Required | Example |
|----------|-------------|----------|---------|
| `LLM_PROVIDER` | Default LLM provider | No | `openai` |
| `LLM_MODEL` | Default model name | No | `gpt-4` |
| `LLM_TEMPERATURE` | Generation temperature | No | `0.7` |
| `LLM_MAX_TOKENS` | Max tokens per request | No | `2048` |
| `LLM_TIMEOUT` | Request timeout (ms) | No | `30000` |
| `OPENAI_API_KEY` | OpenAI API key | No* | `sk-...` |
| `OPENAI_ORG_ID` | OpenAI organization ID | No | `org-...` |
| `ANTHROPIC_API_KEY` | Anthropic API key | No* | `sk-ant-...` |
| `AZURE_OPENAI_KEY` | Azure OpenAI API key | No* | `your-azure-key` |
| `AZURE_OPENAI_ENDPOINT` | Azure OpenAI endpoint | No* | `https://your-resource.openai.azure.com` |
| `GOOGLE_AI_API_KEY` | Google AI API key | No* | `your-google-key` |

\* At least one LLM provider API key is required if using LLM features.

### Observability & Monitoring

| Variable | Description | Required | Example |
|----------|-------------|----------|---------|
| `ENABLE_METRICS` | Enable Prometheus metrics | No | `true` |
| `METRICS_PORT` | Metrics endpoint port | No | `9090` |
| `METRICS_PATH` | Metrics endpoint path | No | `/metrics` |
| `ENABLE_TRACING` | Enable distributed tracing | No | `false` |
| `TRACING_PROVIDER` | Tracing provider | No | `jaeger` |
| `JAEGER_ENDPOINT` | Jaeger collector endpoint | No | `http://jaeger:14268/api/traces` |
| `JAEGER_AGENT_HOST` | Jaeger agent host | No | `localhost` |
| `JAEGER_AGENT_PORT` | Jaeger agent port | No | `6831` |
| `OTLP_ENDPOINT` | OpenTelemetry collector endpoint | No | `http://otel:4318` |
| `ENABLE_PROFILING` | Enable performance profiling | No | `false` |
| `SENTRY_DSN` | Sentry error tracking DSN | No | `https://...@sentry.io/...` |
| `SENTRY_ENVIRONMENT` | Sentry environment name | No | `production` |

### Notification Configuration

| Variable | Description | Required | Example |
|----------|-------------|----------|---------|
| `SLACK_WEBHOOK_URL` | Slack webhook for notifications | No | `https://hooks.slack.com/...` |
| `SLACK_CHANNEL` | Default Slack channel | No | `#deployments` |
| `EMAIL_ENABLED` | Enable email notifications | No | `false` |
| `SMTP_HOST` | SMTP server host | No | `smtp.example.com` |
| `SMTP_PORT` | SMTP server port | No | `587` |
| `SMTP_USER` | SMTP username | No | `user@example.com` |
| `SMTP_PASSWORD` | SMTP password | No | `smtp-password` |
| `EMAIL_FROM` | Default from address | No | `aureus@example.com` |

### Feature Flags

| Variable | Description | Required | Default | Example |
|----------|-------------|----------|---------|---------|
| `ENABLE_WORKFLOW_GENERATOR` | Enable workflow generator | No | `true` | `false` |
| `ENABLE_AGENT_BUILDER` | Enable agent builder | No | `true` | `false` |
| `ENABLE_REFLEXION` | Enable reflexion/postmortem | No | `true` | `false` |
| `ENABLE_PERCEPTION` | Enable perception services | No | `false` | `true` |
| `ENABLE_CRV` | Enable CRV gates | No | `true` | `false` |
| `ENABLE_POLICY_GUARD` | Enable policy enforcement | No | `true` | `false` |
| `ENABLE_SANDBOX` | Enable sandbox execution | No | `false` | `true` |
| `ENABLE_MULTITENANCY` | Enable multi-tenancy | No | `false` | `true` |

### Resource Limits

| Variable | Description | Required | Default | Example |
|----------|-------------|----------|---------|---------|
| `MAX_REQUEST_SIZE` | Max HTTP request body size | No | `10mb` | `50mb` |
| `MAX_WORKFLOW_SIZE` | Max workflow spec size | No | `1mb` | `5mb` |
| `MAX_CONCURRENT_WORKFLOWS` | Max concurrent workflows | No | `100` | `500` |
| `WORKFLOW_TIMEOUT` | Default workflow timeout (ms) | No | `3600000` | `7200000` |
| `TASK_TIMEOUT` | Default task timeout (ms) | No | `300000` | `600000` |
| `MAX_RETRY_ATTEMPTS` | Max task retry attempts | No | `3` | `5` |
| `MEMORY_LIMIT` | Node.js memory limit (MB) | No | `2048` | `4096` |

---

## CI/CD Secrets

### GitHub Actions Secrets

Configure these secrets in your GitHub repository settings (Settings → Secrets and variables → Actions):

#### Deployment Secrets

| Secret Name | Description | Example | Required For |
|-------------|-------------|---------|--------------|
| `STAGING_SSH_KEY` | SSH private key for staging | `-----BEGIN OPENSSH PRIVATE KEY-----...` | Staging deployment |
| `STAGING_HOST` | Staging server hostname | `staging.aureus.example.com` | Staging deployment |
| `STAGING_USER` | SSH user for staging | `deploy` | Staging deployment |
| `PRODUCTION_SSH_KEY` | SSH private key for production | `-----BEGIN OPENSSH PRIVATE KEY-----...` | Production deployment |
| `PRODUCTION_HOSTS` | Production server hostnames (comma-separated) | `prod1.example.com,prod2.example.com` | Production deployment |
| `PRODUCTION_USER` | SSH user for production | `deploy` | Production deployment |

#### Registry & Container Secrets

| Secret Name | Description | Example | Required For |
|-------------|-------------|---------|--------------|
| `NPM_TOKEN` | npm registry authentication token | `npm_...` | Package publishing |
| `DOCKER_USERNAME` | Docker Hub username | `youruser` | Docker image publishing |
| `DOCKER_PASSWORD` | Docker Hub password/token | `dckr_pat_...` | Docker image publishing |
| `GITHUB_TOKEN` | GitHub API token (auto-provided) | `ghp_...` | GitHub Actions (automatic) |

#### Application Secrets

| Secret Name | Description | Example | Required For |
|-------------|-------------|---------|--------------|
| `JWT_SECRET` | JWT signing secret | `your-256-bit-secret-here` | Authentication |
| `DATABASE_URL` | Production database URL | `postgresql://...` | Database access |
| `OPENAI_API_KEY` | OpenAI API key | `sk-...` | LLM features |
| `ANTHROPIC_API_KEY` | Anthropic API key | `sk-ant-...` | LLM features |
| `SLACK_WEBHOOK_URL` | Slack webhook for notifications | `https://hooks.slack.com/...` | Notifications |

#### Monitoring & Error Tracking

| Secret Name | Description | Example | Required For |
|-------------|-------------|---------|--------------|
| `SENTRY_DSN` | Sentry error tracking DSN | `https://...@sentry.io/...` | Error tracking |
| `SENTRY_AUTH_TOKEN` | Sentry authentication token | `sntrys_...` | Release tracking |

### GitLab CI/CD Variables

Configure these variables in GitLab CI/CD settings (Settings → CI/CD → Variables):

| Variable Name | Description | Protected | Masked | Example |
|---------------|-------------|-----------|--------|---------|
| `STAGING_SSH_KEY` | SSH private key for staging | Yes | Yes | `-----BEGIN OPENSSH PRIVATE KEY-----...` |
| `STAGING_HOST` | Staging server hostname | No | No | `staging.aureus.example.com` |
| `STAGING_USER` | SSH user for staging | No | No | `deploy` |
| `PRODUCTION_SSH_KEY` | SSH private key for production | Yes | Yes | `-----BEGIN OPENSSH PRIVATE KEY-----...` |
| `PRODUCTION_HOSTS` | Production server hostnames | Yes | No | `prod1.example.com,prod2.example.com` |
| `PRODUCTION_USER` | SSH user for production | Yes | No | `deploy` |
| `DATABASE_URL` | Production database URL | Yes | Yes | `postgresql://...` |
| `JWT_SECRET` | JWT signing secret | Yes | Yes | `your-256-bit-secret` |
| `OPENAI_API_KEY` | OpenAI API key | Yes | Yes | `sk-...` |
| `SLACK_WEBHOOK_URL` | Slack webhook | Yes | Yes | `https://hooks.slack.com/...` |

---

## Environment-Specific Configuration

### Development Environment

```bash
# .env.development
NODE_ENV=development
PORT=3000
LOG_LEVEL=debug
LOG_FORMAT=pretty

# Local storage
STATE_STORE_TYPE=memory
EVENT_LOG_TYPE=filesystem
EVENT_LOG_BASE_DIR=./var/run

# Disable auth for local dev
ENABLE_AUTH=false

# Local LLM (if needed)
OPENAI_API_KEY=sk-your-dev-key-here
LLM_PROVIDER=openai
LLM_MODEL=gpt-3.5-turbo

# Development features
ENABLE_WORKFLOW_GENERATOR=true
ENABLE_AGENT_BUILDER=true
```

### Staging Environment

```bash
# .env.staging
NODE_ENV=staging
PORT=3000
LOG_LEVEL=info
LOG_FORMAT=json

# PostgreSQL
DATABASE_URL=postgresql://aureus:password@staging-db:5432/aureus_staging
DATABASE_POOL_MAX=10
DATABASE_SSL=true

# Event logs to NFS or S3
EVENT_LOG_TYPE=filesystem
EVENT_LOG_BASE_DIR=/mnt/shared-storage/events

# Authentication enabled
ENABLE_AUTH=true
JWT_SECRET=your-staging-jwt-secret
JWT_EXPIRY=24h

# Staging LLM keys
OPENAI_API_KEY=sk-your-staging-key-here

# Monitoring
ENABLE_METRICS=true
METRICS_PORT=9090

# Notifications
SLACK_WEBHOOK_URL=https://hooks.slack.com/staging-channel
```

### Production Environment

```bash
# .env.production
NODE_ENV=production
PORT=3000
LOG_LEVEL=warn
LOG_FORMAT=json

# PostgreSQL with replication
DATABASE_URL=postgresql://aureus:password@prod-db-primary:5432/aureus_prod
DATABASE_POOL_MAX=20
DATABASE_SSL=true
DATABASE_TIMEOUT=30000

# S3 for event logs
EVENT_LOG_TYPE=s3
EVENT_LOG_BASE_DIR=s3://aureus-prod-events/

# Security
ENABLE_AUTH=true
JWT_SECRET=your-production-jwt-secret
JWT_EXPIRY=8h
JWT_REFRESH_EXPIRY=7d
RATE_LIMIT_ENABLED=true

# Production LLM
OPENAI_API_KEY=sk-your-production-key-here
LLM_TIMEOUT=60000

# Full observability
ENABLE_METRICS=true
ENABLE_TRACING=true
METRICS_PORT=9090
JAEGER_ENDPOINT=http://jaeger-collector:14268/api/traces
SENTRY_DSN=https://...@sentry.io/...
SENTRY_ENVIRONMENT=production

# Notifications
SLACK_WEBHOOK_URL=https://hooks.slack.com/production-alerts
EMAIL_ENABLED=true
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=aureus@example.com
EMAIL_FROM=aureus@example.com

# Resource limits
MAX_CONCURRENT_WORKFLOWS=500
WORKFLOW_TIMEOUT=7200000
MEMORY_LIMIT=4096

# Backups
BACKUP_ENABLED=true
BACKUP_INTERVAL_HOURS=6
```

---

## Secrets Management

### Best Practices

1. **Never commit secrets to version control**
   - Add `.env` files to `.gitignore`
   - Use `.env.example` for documentation only
   - Rotate secrets regularly

2. **Use secrets management tools in production**
   - AWS Secrets Manager
   - HashiCorp Vault
   - Azure Key Vault
   - Google Secret Manager
   - Kubernetes Secrets

3. **Encrypt secrets at rest**
   - Use encrypted storage for backups
   - Enable encryption for secrets managers
   - Use encrypted volumes for sensitive data

4. **Principle of least privilege**
   - Grant minimum necessary access
   - Use separate secrets per environment
   - Rotate secrets after personnel changes

### Loading Secrets from AWS Secrets Manager

```typescript
// Example: Load secrets at application startup
import { SecretsManager } from '@aws-sdk/client-secrets-manager';

async function loadSecrets() {
  const client = new SecretsManager({ region: process.env.AWS_REGION || 'us-east-1' });
  
  const secretName = `aureus/${process.env.NODE_ENV}/secrets`;
  const response = await client.getSecretValue({ SecretId: secretName });
  
  const secrets = JSON.parse(response.SecretString || '{}');
  
  // Set environment variables
  process.env.JWT_SECRET = secrets.JWT_SECRET;
  process.env.DATABASE_URL = secrets.DATABASE_URL;
  process.env.OPENAI_API_KEY = secrets.OPENAI_API_KEY;
  
  console.log('Secrets loaded successfully');
}

// Call before starting the application
loadSecrets().then(() => {
  require('./server');
});
```

### Loading Secrets from HashiCorp Vault

```typescript
// Example: Load secrets from Vault
import vault from 'node-vault';

async function loadSecretsFromVault() {
  const client = vault({
    apiVersion: 'v1',
    endpoint: process.env.VAULT_ADDR || 'http://vault:8200',
    token: process.env.VAULT_TOKEN,
  });
  
  const result = await client.read(`secret/data/aureus/${process.env.NODE_ENV}`);
  const secrets = result.data.data;
  
  process.env.JWT_SECRET = secrets.JWT_SECRET;
  process.env.DATABASE_URL = secrets.DATABASE_URL;
  process.env.OPENAI_API_KEY = secrets.OPENAI_API_KEY;
  
  console.log('Vault secrets loaded');
}
```

### Using Kubernetes Secrets

```yaml
# k8s/secrets.yaml
apiVersion: v1
kind: Secret
metadata:
  name: aureus-secrets
type: Opaque
stringData:
  JWT_SECRET: "your-jwt-secret-here"
  DATABASE_URL: "postgresql://user:pass@host:5432/db"
  OPENAI_API_KEY: "sk-your-key-here"
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: aureus-console
spec:
  template:
    spec:
      containers:
      - name: console
        image: aureus/console:latest
        envFrom:
        - secretRef:
            name: aureus-secrets
```

---

## Environment File Templates

### .env.example

```bash
# Aureus Agentic OS Configuration Template
# Copy this file to .env and fill in the values

# ===========================================
# CORE CONFIGURATION
# ===========================================
NODE_ENV=development
PORT=3000
HOST=0.0.0.0
LOG_LEVEL=info
LOG_FORMAT=json

# ===========================================
# STORAGE CONFIGURATION
# ===========================================
STATE_STORE_TYPE=memory
EVENT_LOG_TYPE=filesystem
EVENT_LOG_BASE_DIR=./var/run

# ===========================================
# DATABASE CONFIGURATION (PostgreSQL)
# ===========================================
# Option 1: Connection string
DATABASE_URL=postgresql://user:password@localhost:5432/aureus

# Option 2: Individual parameters
# DATABASE_HOST=localhost
# DATABASE_PORT=5432
# DATABASE_NAME=aureus
# DATABASE_USER=aureus
# DATABASE_PASSWORD=your-password

DATABASE_POOL_MAX=20
DATABASE_SSL=false

# ===========================================
# REDIS CONFIGURATION (Optional)
# ===========================================
# REDIS_URL=redis://localhost:6379
# REDIS_PASSWORD=
# REDIS_TTL=3600

# ===========================================
# AUTHENTICATION & SECURITY
# ===========================================
ENABLE_AUTH=true
JWT_SECRET=your-256-bit-secret-key-change-this-in-production
JWT_EXPIRY=24h
CORS_ORIGIN=*

# ===========================================
# LLM PROVIDER CONFIGURATION
# ===========================================
LLM_PROVIDER=openai
LLM_MODEL=gpt-4
LLM_TEMPERATURE=0.7
LLM_MAX_TOKENS=2048

# API Keys (at least one required if using LLM features)
OPENAI_API_KEY=sk-your-openai-key-here
# ANTHROPIC_API_KEY=sk-ant-your-anthropic-key-here
# AZURE_OPENAI_KEY=your-azure-key
# AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com

# ===========================================
# OBSERVABILITY & MONITORING
# ===========================================
ENABLE_METRICS=true
METRICS_PORT=9090
ENABLE_TRACING=false
# JAEGER_ENDPOINT=http://jaeger:14268/api/traces
# SENTRY_DSN=https://...@sentry.io/...

# ===========================================
# NOTIFICATIONS
# ===========================================
# SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
# EMAIL_ENABLED=false
# SMTP_HOST=smtp.example.com
# SMTP_PORT=587
# SMTP_USER=user@example.com
# SMTP_PASSWORD=your-smtp-password

# ===========================================
# FEATURE FLAGS
# ===========================================
ENABLE_WORKFLOW_GENERATOR=true
ENABLE_AGENT_BUILDER=true
ENABLE_REFLEXION=true
ENABLE_CRV=true
ENABLE_POLICY_GUARD=true

# ===========================================
# RESOURCE LIMITS
# ===========================================
MAX_REQUEST_SIZE=10mb
MAX_CONCURRENT_WORKFLOWS=100
WORKFLOW_TIMEOUT=3600000
MEMORY_LIMIT=2048
```

---

## Security Best Practices

### Secret Rotation

1. **Regular Rotation Schedule**
   - JWT secrets: Every 90 days
   - Database passwords: Every 180 days
   - API keys: As recommended by provider
   - SSH keys: Annually or after personnel changes

2. **Rotation Process**
   ```bash
   # 1. Generate new secret
   NEW_SECRET=$(openssl rand -base64 32)
   
   # 2. Update secrets manager
   aws secretsmanager update-secret \
     --secret-id aureus/production/jwt-secret \
     --secret-string "$NEW_SECRET"
   
   # 3. Restart application to load new secret
   kubectl rollout restart deployment/aureus-console
   
   # 4. Verify application health
   curl https://aureus.example.com/health
   ```

### Access Control

1. **Limit secret access**
   - Use IAM roles with minimal permissions
   - Implement approval workflows for sensitive secrets
   - Audit secret access regularly

2. **Environment isolation**
   - Use separate secrets for each environment
   - Never reuse production secrets in staging/dev
   - Use different AWS accounts/projects per environment

### Compliance

1. **Audit logging**
   - Enable audit logs for all secret access
   - Monitor for unauthorized access attempts
   - Set up alerts for suspicious activity

2. **Encryption**
   - Use TLS for all network communication
   - Encrypt secrets at rest
   - Use encrypted backups

3. **Documentation**
   - Document all secrets and their purpose
   - Maintain secret inventory
   - Document rotation procedures

---

## Additional Resources

- [DevOps Guide](./devops.md) - Complete DevOps procedures
- [Deployment Guide](./deployment.md) - Detailed deployment instructions
- [Security Model](./security_model.md) - Security architecture
- [CI/CD Templates](./ci-cd-templates/) - Pipeline templates

## Support

For questions about environment configuration:
- **Documentation**: https://docs.aureus.example.com
- **Issues**: https://github.com/farmountain/Aureus_Agentic_OS/issues
- **Community**: https://community.aureus.example.com

---

**Last Updated**: 2024-01-09
**Version**: 1.0.0
