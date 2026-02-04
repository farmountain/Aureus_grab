# Aureus Sentinel Deployment Guide

Complete guide for deploying the Aureus Sentinel full stack (OpenClaw + Bridge + Aureus OS).

## Table of Contents

- [Quick Start](#quick-start)
- [Prerequisites](#prerequisites)
- [Deployment Methods](#deployment-methods)
- [Configuration](#configuration)
- [Monitoring](#monitoring)
- [Troubleshooting](#troubleshooting)

---

## Quick Start

### Docker Compose (Recommended for Development)

```bash
# 1. Clone repository
git clone https://github.com/farmountain/Aureus-Sentinel.git
cd Aureus-Sentinel

# 2. Copy environment file
cp .env.full-stack.example .env

# 3. Configure secrets (edit .env)
nano .env

# 4. Start full stack
docker-compose -f docker-compose-full.yml up -d

#5. Verify services
docker-compose -f docker-compose-full.yml ps

# 6. Check logs
docker-compose -f docker-compose-full.yml logs -f
```

**Access URLs:**
- OpenClaw: http://localhost:8080
- Bridge: http://localhost:3000
- Aureus OS: http://localhost:5000
- Grafana: http://localhost:3001
- Prometheus: http://localhost:9090

### Kubernetes (Production)

```bash
# 1. Create namespace
kubectl create namespace aureus

# 2. Configure secrets
kubectl create secret generic postgres-secrets \
  --from-literal=password='your-secure-password' \
  -n aureus

# 3. Deploy full stack
kubectl apply -f k8s/ -n aureus

# 4. Watch deployment
kubectl get pods -n aureus -w

# 5. Access services
kubectl port-forward -n aureus svc/openclaw-service 8080:8080
```

---

## Prerequisites

### Software Requirements

- **Docker**: >= 20.10
- **Docker Compose**: >= 2.0
- **Kubernetes** (production): >= 1.23
- **kubectl**: >= 1.23
- **Node.js** (local dev): >= 18.0

### Infrastructure Requirements (Production)

- **Compute**: 4 vCPU, 8 GB RAM minimum
- **Storage**: 50 GB minimum
- **Network**: Static IP, ports 80/443 open
- **Database**: PostgreSQL 15
- **Cache**: Redis 7
- **Vector DB**: Weaviate or Pinecone

### Cloud Provider Accounts (Optional)

- **AWS**: For KMS, RDS, ElastiCache, EKS
- **Telegram/Discord**: Bot tokens for channels

---

## Deployment Methods

### 1. Local Development (Docker Compose)

**Use Case:** Local development and testing

```bash
# Start services
docker-compose -f docker-compose-full.yml up -d

# Start with dev tools (pgAdmin, Redis Commander)
docker-compose -f docker-compose-full.yml --profile dev up -d

# Stop services
docker-compose -f docker-compose-full.yml down

# Stop and remove volumes (clean slate)
docker-compose -f docker-compose-full.yml down -v
```

**Features:**
- ✅ All services on single machine
- ✅ Ephemeral data (unless volumes persisted)
- ✅ Hot reload for development
- ✅ Built-in monitoring tools

### 2. Staging (Kubernetes)

**Use Case:** Pre-production testing

```bash
# Deploy to staging cluster
kubectl config use-context staging
kubectl apply -f k8s/ -n aureus-staging

# Scale down for cost savings
kubectl scale deployment/openclaw --replicas=2 -n aureus-staging
kubectl scale deployment/bridge --replicas=2 -n aureus-staging
kubectl scale deployment/aureus-os --replicas=2 -n aureus-staging
```

**Features:**
- ✅ Production-like environment
- ✅ 2 replicas per service
- ✅ Full monitoring stack
- ✅ Cost-optimized

### 3. Production (Kubernetes + AWS)

**Use Case:** Live production traffic

```bash
# Deploy to production cluster
kubectl config use-context production
kubectl apply -f k8s/ -n aureus

# Enable auto-scaling
kubectl autoscale deployment/openclaw --cpu-percent=70 --min=3 --max=10 -n aureus
kubectl autoscale deployment/bridge --cpu-percent=70 --min=3 --max=10 -n aureus
kubectl autoscale deployment/aureus-os --cpu-percent=70 --min=3 --max=10 -n aureus

# Configure external load balancer
kubectl apply -f k8s/ingress.yaml -n aureus
```

**Features:**
- ✅ High availability (multi-AZ)
- ✅ Auto-scaling (3-10 replicas)
- ✅ AWS KMS integration
- ✅ RDS Multi-AZ
- ✅ Full monitoring + alerting

---

## Configuration

### Environment Variables

See `.env.full-stack.example` for complete list.

**Critical Variables:**

```env
# Database
POSTGRES_PASSWORD=<strong-password>

# Bridge API Key (shared across services)
BRIDGE_API_KEY=<generate-strong-key>

# Channel Tokens
TELEGRAM_BOT_TOKEN=<from-botfather>
DISCORD_BOT_TOKEN=<from-discord-dev-portal>

# Security
JWT_SECRET=<generate-strong-secret>
SESSION_SECRET=<generate-strong-secret>
```

### Generating Secrets

```bash
# Generate random secrets
openssl rand -base64 32

# Or use Python
python3 -c "import secrets; print(secrets.token_urlsafe(32))"
```

### KMS Configuration (Production)

```bash
# Create KMS key
aws kms create-key \
  --key-spec ECC_NIST_P384 \
  --key-usage SIGN_VERIFY \
  --description "Aureus Sentinel Bridge"

# Create alias
aws kms create-alias \
  --alias-name alias/aureus-bridge \
  --target-key-id <key-id>

# Update Bridge environment
USE_KMS=true
KMS_KEY_ID=alias/aureus-bridge
AWS_REGION=us-east-1
```

---

## Monitoring

### Access Monitoring Tools

**Prometheus:**
- URL: http://localhost:9090
- Metrics explorer and alerting

**Grafana:**
- URL: http://localhost:3001
- Username: admin
- Password: (from .env, default: admin)

**Loki:**
- URL: http://localhost:3100
- Log aggregation endpoint

### Key Metrics

**Bridge:**
- `bridge_signatures_total` - Total signatures created
- `bridge_signature_duration_seconds` - Signature latency
- `bridge_errors_total` - Error count

**Aureus OS:**
- `aureus_os_risk_assessments_total` - Risk assessments
- `aureus_os_assessment_duration_seconds` - Assessment latency
- `aureus_os_policy_violations_total` - Policy violations

**OpenClaw:**
- `openclaw_requests_total` - Total requests
- `openclaw_request_duration_seconds` - Request latency
- `openclaw_active_connections` - Active WebSocket connections

### Alerting

Alerts are defined in `monitoring/alerts.yml`.

**Critical Alerts:**
- ServiceDown: Service unavailable for >1 minute
- BridgeHighErrorRate: >5% error rate
- SignatureVerificationFailures: Signature failures detected

**Warning Alerts:**
- HighLatency: p95 latency >1 second
- HighMemoryUsage: >90% memory used
- HighDiskUsage: >90% disk used

---

## Troubleshooting

### Common Issues

#### Services Not Starting

```bash
# Check service logs
docker-compose -f docker-compose-full.yml logs [service-name]

# Check service health
curl http://localhost:3000/health  # Bridge
curl http://localhost:5000/api/health  # Aureus OS
curl http://localhost:8080/api/health  # OpenClaw
```

#### Database Connection Errors

```bash
# Verify PostgreSQL is running
docker-compose -f docker-compose-full.yml ps postgres

# Test connection
docker-compose -f docker-compose-full.yml exec postgres \
  psql -U aureus -d bridge -c "SELECT 1;"

# Check database logs
docker-compose -f docker-compose-full.yml logs postgres
```

#### Bridge Signature Failures

```bash
# Check KMS configuration (if USE_KMS=true)
aws kms describe-key --key-id alias/aureus-bridge

# Verify key permissions
aws kms get-key-policy --key-id alias/aureus-bridge --policy-name default

# Test local keys (if USE_KMS=false)
ls -la keys/private.pem keys/public.pem
```

#### High Latency

```bash
# Check resource usage
docker stats

# Scale services if needed
docker-compose -f docker-compose-full.yml up -d --scale openclaw=3

# Check database performance
docker-compose -f docker-compose-full.yml exec postgres \
  psql -U aureus -d openclaw -c "SELECT * FROM pg_stat_activity;"
```

### Health Checks

```bash
# Check all services
./scripts/health-check.sh

# Or manually:
curl -f http://localhost:8080/api/health || echo "OpenClaw DOWN"
curl -f http://localhost:3000/health || echo "Bridge DOWN"
curl -f http://localhost:5000/api/health || echo "Aureus OS DOWN"
```

### Log Analysis

```bash
# View logs in real-time
docker-compose -f docker-compose-full.yml logs -f --tail=100

# Search logs
docker-compose -f docker-compose-full.yml logs | grep ERROR

# Export logs
docker-compose -f docker-compose-full.yml logs > full-stack.log
```

---

## Backup & Recovery

### Database Backup

```bash
# Backup all databases
docker-compose -f docker-compose-full.yml exec postgres \
  pg_dumpall -U aureus > backup-$(date +%Y%m%d).sql

# Restore backup
cat backup-20240204.sql | \
  docker-compose -f docker-compose-full.yml exec -T postgres \
  psql -U aureus
```

### Configuration Backup

```bash
# Backup secrets and config
cp .env .env.backup-$(date +%Y%m%d)
kubectl get secrets -n aureus -o yaml > k8s-secrets-backup.yaml
```

---

## Performance Tuning

### Database Optimization

```sql
-- Create indexes
CREATE INDEX idx_signatures_timestamp ON signatures(created_at);
CREATE INDEX idx_assessments_risk_level ON risk_assessments(risk_level);

-- Analyze query performance
EXPLAIN ANALYZE SELECT * FROM signatures WHERE created_at > NOW() - INTERVAL '1 day';
```

### Caching Strategy

```yaml
# Redis configuration
redis:
  maxmemory: 256mb
  maxmemory-policy: allkeys-lru
  save: "900 1 300 10 60 10000"
```

### Resource Limits

```yaml
# Kubernetes resource requests/limits
resources:
  requests:
    cpu: 500m
    memory: 512Mi
  limits:
    cpu: 2000m
    memory: 2Gi
```

---

## Security Checklist

- [ ] Strong passwords for all services
- [ ] TLS/SSL enabled for production
- [ ] Secrets stored in vault (not .env)
- [ ] KMS enabled for Bridge (production)
- [ ] Network policies configured
- [ ] Firewall rules restrictive
- [ ] Regular security audits
- [ ] Dependency vulnerability scanning
- [ ] Log retention policies configured
- [ ] Backup encryption enabled

---

## Next Steps

After deployment:

1. **Configure Monitoring**: Set up Grafana dashboards
2. **Set Up Alerts**: Configure alert destinations (Slack, PagerDuty)
3. **Run Load Tests**: Validate performance under load
4. **Document Runbooks**: Create operational procedures
5. **Train Team**: Ensure ops team understands system

---

**Version:** 1.0  
**Last Updated:** Week 13 - Pilot Deployment  
**Support:** https://github.com/farmountain/Aureus-Sentinel/issues
