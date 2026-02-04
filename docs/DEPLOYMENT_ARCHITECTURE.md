# Deployment Architecture — Aureus Sentinel Complete Stack

Complete deployment architecture for the integrated Aureus Sentinel system comprising three core components.

## System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        AUREUS SENTINEL STACK                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌──────────────┐      ┌──────────────┐      ┌──────────────┐      │
│  │   OpenClaw   │─────▶│    Bridge    │─────▶│ Aureus OS    │      │
│  │   (Channels) │      │   (Signer)   │      │  (Policy)    │      │
│  └──────────────┘      └──────────────┘      └──────────────┘      │
│         │                      │                      │              │
│    User Intent          Crypto Sign            Risk Assess          │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

## Architecture Components

### 1. OpenClaw (Multi-Channel AI Platform)
**Role:** User-facing channels and agent orchestration  
**Technology:** Node.js/Python, WebSocket, REST API  
**Port:** 8080 (HTTP), 8081 (WebSocket)  
**Dependencies:** PostgreSQL, Redis

**Responsibilities:**
- Telegram bot interface
- Discord bot interface
- Slack integration
- Web chat interface
- User session management
- Message routing
- Agent coordination

**Key Endpoints:**
- `POST /api/message` - Receive user messages
- `GET /api/health` - Health check
- `WS /ws` - WebSocket connections

### 2. Aureus-Sentinel Bridge (Cryptographic Signing Service)
**Role:** Signing service enforcing cryptographic approval protocol  
**Technology:** Node.js (Express)  
**Port:** 3000 (HTTP)  
**Dependencies:** AWS KMS (production), local keys (development)

**Responsibilities:**
- ed25519 signature generation
- Signature verification
- TTL enforcement
- JSON Schema validation
- Audit logging
- KMS integration

**Key Endpoints:**
- `POST /sign` - Sign approval requests
- `GET /verify` - Verify signatures
- `GET /public-key` - Retrieve public key
- `GET /health` - Health check

### 3. Aureus Agentic OS (Constitutional Policy Engine)
**Role:** Policy evaluation, risk assessment, memory, and governance  
**Technology:** Python/Node.js, ML models  
**Port:** 5000 (HTTP)  
**Dependencies:** PostgreSQL, Vector DB (Pinecone/Weaviate), Redis

**Responsibilities:**
- Risk assessment (low/medium/high)
- Policy enforcement
- Memory management
- Context evaluation
- Decision logging
- Constitutional rule application

**Key Endpoints:**
- `POST /api/assess-risk` - Evaluate action risk
- `POST /api/check-policy` - Policy compliance check
- `POST /api/context` - Store/retrieve context
- `GET /api/health` - Health check

---

## Integration Flow

### End-to-End Request Flow

```
1. User Message (Telegram)
   │
   ▼
2. OpenClaw receives message
   │
   ▼
3. OpenClaw extracts intent
   │
   ▼
4. OpenClaw → Aureus OS (risk assessment)
   │
   ▼
5. Aureus OS evaluates risk, returns policy decision
   │
   ▼
6. If approval needed:
   OpenClaw → Bridge (sign request)
   │
   ▼
7. Bridge signs with ed25519, returns signed approval
   │
   ▼
8. OpenClaw executes action with signed approval
   │
   ▼
9. Bridge verifies signature before execution
   │
   ▼
10. Result sent back to user via OpenClaw
```

### Message Flow Diagram

```
┌─────────┐
│  User   │
│(Telegram)│
└────┬────┘
     │ 1. "Transfer $500 to Alice"
     ▼
┌──────────────────┐
│    OpenClaw      │
│  Port: 8080      │
└────┬─────────────┘
     │ 2. POST /api/assess-risk
     │    {intent: "transfer", amount: 500}
     ▼
┌──────────────────┐
│  Aureus OS       │
│  Port: 5000      │
└────┬─────────────┘
     │ 3. {risk: "high", requires_approval: true}
     ▼
┌──────────────────┐
│    Bridge        │
│  Port: 3000      │
└────┬─────────────┘
     │ 4. Signed Approval (ed25519)
     │    {signature, public_key, ttl}
     ▼
┌──────────────────┐
│  Executor        │
│  (in OpenClaw)   │
└────┬─────────────┘
     │ 5. Verify signature
     ▼
┌──────────────────┐
│  Execute Action  │
│  (with audit)    │
└──────────────────┘
```

---

## Network Topology

### Development Environment

```
Host Machine (localhost)
├── OpenClaw:        http://localhost:8080
├── Bridge:          http://localhost:3000
├── Aureus OS:       http://localhost:5000
├── PostgreSQL:      localhost:5432
├── Redis:           localhost:6379
└── Vector DB:       localhost:8000 (if local)
```

### Docker Compose Network

```yaml
networks:
  aureus-network:
    driver: bridge

services:
  openclaw:
    networks: [aureus-network]
    environment:
      BRIDGE_URL: http://bridge:3000
      AUREUS_OS_URL: http://aureus-os:5000
  
  bridge:
    networks: [aureus-network]
    
  aureus-os:
    networks: [aureus-network]
    environment:
      BRIDGE_URL: http://bridge:3000
```

### Kubernetes Network (Production)

```
┌─────────────────────────────────────────────┐
│          Ingress Controller                 │
│  aureus.example.com                         │
└─────────┬───────────────────────────────────┘
          │
          ├─ /api/channels/* → OpenClaw (Service)
          │                     ├─ Pod 1 (8080)
          │                     ├─ Pod 2 (8080)
          │                     └─ Pod 3 (8080)
          │
          ├─ /api/bridge/*   → Bridge (Service)
          │                     ├─ Pod 1 (3000)
          │                     ├─ Pod 2 (3000)
          │                     └─ Pod 3 (3000)
          │
          └─ /api/policy/*   → Aureus OS (Service)
                                ├─ Pod 1 (5000)
                                ├─ Pod 2 (5000)
                                └─ Pod 3 (5000)

Internal Service Discovery:
- openclaw-service.aureus.svc.cluster.local:8080
- bridge-service.aureus.svc.cluster.local:3000
- aureus-os-service.aureus.svc.cluster.local:5000
```

---

## Service Dependencies

### Dependency Graph

```
┌──────────────────────────────────────────────────┐
│  OpenClaw                                        │
│  ├─ Required: PostgreSQL (sessions)             │
│  ├─ Required: Redis (cache)                     │
│  ├─ Required: Bridge (signing)                  │
│  └─ Required: Aureus OS (policy)                │
└──────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────┐
│  Bridge                                          │
│  ├─ Optional: AWS KMS (production keys)         │
│  └─ Optional: PostgreSQL (audit logs)           │
└──────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────┐
│  Aureus OS                                       │
│  ├─ Required: PostgreSQL (policy data)          │
│  ├─ Required: Vector DB (memory/embeddings)     │
│  └─ Required: Redis (cache)                     │
└──────────────────────────────────────────────────┘
```

### Startup Order

1. **Infrastructure Layer**
   - PostgreSQL
   - Redis
   - Vector DB (Pinecone/Weaviate)

2. **Core Services** (can start in parallel)
   - Bridge (3000)
   - Aureus OS (5000)

3. **User-Facing Layer**
   - OpenClaw (8080) - starts after Bridge and Aureus OS are healthy

---

## Configuration Management

### Environment Variables

#### OpenClaw
```env
# Service URLs
BRIDGE_URL=http://bridge:3000
AUREUS_OS_URL=http://aureus-os:5000

# Database
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
POSTGRES_DB=openclaw
POSTGRES_USER=openclaw
POSTGRES_PASSWORD=<secret>

# Redis
REDIS_HOST=redis
REDIS_PORT=6379

# Channels
TELEGRAM_BOT_TOKEN=<secret>
DISCORD_BOT_TOKEN=<secret>
SLACK_APP_TOKEN=<secret>

# Server
PORT=8080
WS_PORT=8081
NODE_ENV=production
```

#### Bridge
```env
# Server
PORT=3000
NODE_ENV=production

# Keys
USE_KMS=true
KMS_KEY_ID=alias/aureus-bridge
AWS_REGION=us-east-1

# Security
API_KEY=<secret>
RATE_LIMIT_MAX_REQUESTS=100

# Logging
LOG_LEVEL=info
```

#### Aureus OS
```env
# Server
PORT=5000
FLASK_ENV=production

# Database
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
POSTGRES_DB=aureus_os
POSTGRES_USER=aureus
POSTGRES_PASSWORD=<secret>

# Vector DB
VECTOR_DB_TYPE=pinecone
PINECONE_API_KEY=<secret>
PINECONE_ENVIRONMENT=us-east-1

# Redis
REDIS_HOST=redis
REDIS_PORT=6379

# ML Models
RISK_MODEL_PATH=/models/risk_assessment.pkl
POLICY_MODEL_PATH=/models/policy_engine.pkl

# Bridge Integration
BRIDGE_URL=http://bridge:3000
BRIDGE_PUBLIC_KEY=<base64_encoded>
```

---

## Monitoring & Observability

### Metrics Collection

**Prometheus Endpoints:**
- OpenClaw: `http://openclaw:8080/metrics`
- Bridge: `http://bridge:3000/metrics`
- Aureus OS: `http://aureus-os:5000/metrics`

**Key Metrics:**
- Request rate (RPS)
- Response time (p50, p95, p99)
- Error rate
- Signature operations/sec
- Policy evaluations/sec
- Active connections
- Queue depth

### Log Aggregation

**Log Format:** JSON structured logs

**Log Levels:**
- DEBUG: Development details
- INFO: Normal operations
- WARN: Potential issues
- ERROR: Failures requiring attention
- CRITICAL: System-wide failures

**Log Shipping:**
- Filebeat → Elasticsearch (ELK)
- Promtail → Loki (Grafana Loki)

### Distributed Tracing

**Trace Context Propagation:**
```
X-Trace-ID: uuid
X-Span-ID: uuid
X-Parent-Span-ID: uuid
```

**Trace Flow:**
1. OpenClaw generates trace-id
2. Passes to Bridge via headers
3. Bridge logs with trace-id
4. Passes to Aureus OS
5. All logs correlatable by trace-id

---

## Security Considerations

### Network Security

1. **TLS/SSL:** All inter-service communication over HTTPS (production)
2. **API Authentication:** API keys for service-to-service auth
3. **Network Policies:** Kubernetes NetworkPolicies restrict traffic
4. **Firewall Rules:** Only necessary ports exposed

### Secrets Management

**Development:**
- `.env` files (gitignored)
- Local environment variables

**Production:**
- Kubernetes Secrets (encrypted at rest)
- AWS Secrets Manager
- HashiCorp Vault

**Secret Types:**
- Database credentials
- API keys (Bridge, Telegram, Discord)
- KMS credentials
- JWT signing keys

### Key Management

**Bridge Keys:**
- Development: Ephemeral ed25519 (generated on startup)
- Production: AWS KMS (alias/aureus-bridge)
- Rotation: Automated monthly rotation

**Access Control:**
- Service accounts with minimal permissions
- RBAC policies in Kubernetes
- IAM roles for AWS resources

---

## Scaling Strategy

### Horizontal Scaling

**OpenClaw:**
- Stateless: Scale freely 3-10 pods
- Load balanced via Kubernetes Service
- Session affinity via Redis

**Bridge:**
- Stateless: Scale freely 3-10 pods
- Signature operations CPU-bound
- KMS rate limits consideration

**Aureus OS:**
- Mostly stateless: Scale 3-10 pods
- ML model loading overhead
- Cache layer (Redis) for performance

### Vertical Scaling

**Resource Limits:**
```yaml
openclaw:
  requests: {cpu: 500m, memory: 512Mi}
  limits: {cpu: 2000m, memory: 2Gi}

bridge:
  requests: {cpu: 100m, memory: 128Mi}
  limits: {cpu: 500m, memory: 512Mi}

aureus-os:
  requests: {cpu: 1000m, memory: 1Gi}
  limits: {cpu: 4000m, memory: 4Gi}  # ML models
```

### Auto-Scaling

**HPA Configuration:**
- Target CPU: 70%
- Target Memory: 80%
- Min replicas: 3
- Max replicas: 10
- Scale-up: 30s delay
- Scale-down: 300s delay

---

## High Availability

### Redundancy

- **Multi-AZ Deployment:** Pods spread across availability zones
- **Database HA:** PostgreSQL with replication
- **Redis Sentinel:** For cache HA
- **Load Balancer:** Health-check based routing

### Failover

**Component Failures:**
1. Pod failure → Kubernetes auto-restart
2. Node failure → Pods rescheduled
3. AZ failure → Traffic routed to healthy AZs
4. Region failure → DR site activation (manual)

**Health Checks:**
```yaml
livenessProbe:
  httpGet: {path: /health, port: <port>}
  initialDelaySeconds: 30
  periodSeconds: 10

readinessProbe:
  httpGet: {path: /ready, port: <port>}
  initialDelaySeconds: 10
  periodSeconds: 5
```

### Disaster Recovery

**Backup Strategy:**
- Database: Daily automated backups (7-day retention)
- Secrets: Encrypted in separate S3 bucket
- Configuration: Git repository (IaC)

**RTO/RPO:**
- RTO (Recovery Time Objective): 1 hour
- RPO (Recovery Point Objective): 15 minutes

---

## Deployment Environments

### 1. Development (Local)
**Purpose:** Local development and testing  
**Infrastructure:** Docker Compose  
**Scale:** Single instance of each service  
**Data:** Ephemeral (containers)

### 2. Staging (AWS)
**Purpose:** Pre-production testing  
**Infrastructure:** Kubernetes (EKS)  
**Scale:** 2 replicas per service  
**Data:** Persistent (RDS, ElastiCache)  
**Monitoring:** Full Prometheus + Grafana

### 3. Production (AWS)
**Purpose:** Live user traffic  
**Infrastructure:** Kubernetes (EKS, multi-AZ)  
**Scale:** 3-10 replicas per service (auto-scaling)  
**Data:** Persistent with HA (RDS Multi-AZ, Redis Sentinel)  
**Monitoring:** Full stack + alerting

---

## Cost Estimation (AWS Production)

### Compute
- EKS Control Plane: $73/month
- EC2 Worker Nodes (t3.large x4): ~$120/month
- Load Balancer: $25/month

### Storage
- RDS PostgreSQL (db.t3.medium): ~$70/month
- ElastiCache Redis (cache.t3.micro): ~$15/month
- EBS Volumes (200GB): ~$20/month

### Services
- KMS: ~$1/month (1 key + operations)
- Secrets Manager: ~$1/month
- CloudWatch Logs: ~$10/month
- Data Transfer: ~$20/month

**Total Estimated Cost:** ~$355/month (baseline, before auto-scaling)

---

## Performance Targets

### Latency
- OpenClaw → User: < 500ms (p95)
- Bridge signature: < 50ms (p95)
- Aureus OS risk assessment: < 200ms (p95)
- End-to-end (intent → approval): < 1s (p95)

### Throughput
- OpenClaw: 1,000 RPS
- Bridge: 500 signatures/sec
- Aureus OS: 500 assessments/sec

### Availability
- Overall system: 99.9% uptime (< 43 minutes downtime/month)
- Individual services: 99.95% uptime

---

## Next Steps

1. Review this architecture with team
2. Provision infrastructure (AWS resources)
3. Deploy to staging environment
4. Run integration tests
5. Load test the complete stack
6. Document operational runbooks
7. Train ops team
8. Deploy to production (pilot)
9. Monitor and iterate

---

**Document Version:** 1.0  
**Last Updated:** Week 13 - Pilot Deployment  
**Maintained By:** Aureus Sentinel DevOps Team
