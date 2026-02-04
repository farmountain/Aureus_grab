# Interactive Demo Architecture - Visual Guide

This document provides visual diagrams to understand the demo deployment architecture.

## System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     AUREUS AGENTIC OS DEMO PLATFORM                      │
│                                                                           │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    USER ACCESS LAYER                             │   │
│  │                                                                   │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │   │
│  │  │ Personal │  │Developer │  │  Admin   │  │  DevOps  │       │   │
│  │  │  Users   │  │  Users   │  │  Users   │  │  Users   │       │   │
│  │  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘       │   │
│  │       │             │             │             │               │   │
│  └───────┼─────────────┼─────────────┼─────────────┼───────────────┘   │
│          │             │             │             │                     │
│          │             │             │             │                     │
│  ┌───────▼─────────────▼─────────────▼─────────────▼───────────────┐   │
│  │                   NGINX REVERSE PROXY                            │   │
│  │                    (SSL Termination)                             │   │
│  │                                                                   │   │
│  │  Routes:                                                          │   │
│  │  /personal     → Personal UI (simplified)                        │   │
│  │  /developer    → Developer Portal (full SDK)                     │   │
│  │  /admin        → Admin Console (multi-tenant)                    │   │
│  │  /devops       → DevOps Portal (infrastructure)                  │   │
│  │  /api          → REST API (authenticated)                        │   │
│  └───────┬───────────────────────────────────────────────────────────┘   │
│          │                                                                │
│          │                                                                │
│  ┌───────▼───────────────────────────────────────────────────────────┐   │
│  │                   AUREUS CONSOLE                                  │   │
│  │              (Node.js / Express API Server)                       │   │
│  │                                                                   │   │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐                │   │
│  │  │   Agent    │  │  Workflow  │  │Deployment  │                │   │
│  │  │  Studio    │  │Orchestrator│  │  Manager   │                │   │
│  │  └────────────┘  └────────────┘  └────────────┘                │   │
│  │                                                                   │   │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐                │   │
│  │  │    CRV     │  │   Policy   │  │   Memory   │                │   │
│  │  │ Validation │  │  GoalGuard │  │ HipCortex  │                │   │
│  │  └────────────┘  └────────────┘  └────────────┘                │   │
│  └───────┬───────────┬───────────────────┬───────────────────────────┘   │
│          │           │                   │                                │
│  ┌───────▼───────┐  ┌▼──────────┐  ┌────▼────────────────────────────┐   │
│  │  PostgreSQL   │  │   Redis    │  │   Monitoring Stack             │   │
│  │               │  │            │  │                                 │   │
│  │  ┌─────────┐  │  │  ┌──────┐ │  │  ┌──────────┐  ┌──────────┐   │   │
│  │  │Workflows│  │  │  │Cache │ │  │  │Prometheus│  │ Grafana  │   │   │
│  │  │ States  │  │  │  │      │ │  │  │          │  │          │   │   │
│  │  ├─────────┤  │  │  │      │ │  │  │ Metrics  │  │Dashboards│   │   │
│  │  │ Memory  │  │  │  └──────┘ │  │  │          │  │          │   │   │
│  │  ├─────────┤  │  │            │  │  └────┬─────┘  └──────────┘   │   │
│  │  │  Audit  │  │  │            │  │       │                        │   │
│  │  │  Logs   │  │  │            │  │  ┌────▼──────┐                │   │
│  │  ├─────────┤  │  │            │  │  │AlertMgr   │                │   │
│  │  │ Tenants │  │  │            │  │  │           │                │   │
│  │  └─────────┘  │  │            │  │  └───────────┘                │   │
│  └───────────────┘  └────────────┘  └────────────────────────────────┘   │
│                                                                           │
└─────────────────────────────────────────────────────────────────────────┘
```

## Persona-Specific Data Flow

### Personal User Flow

```
┌──────────────┐
│ Personal User│
│  (Browser)   │
└──────┬───────┘
       │
       │ 1. Access /personal
       ▼
┌──────────────┐
│  Nginx       │
└──────┬───────┘
       │ 2. Route to console
       ▼
┌──────────────────────────────────────┐
│  Console (Simplified UI)             │
│  ┌────────────────────────────────┐  │
│  │ Agent Studio (Simplified)      │  │
│  │ - Natural language input       │  │
│  │ - Pre-built templates          │  │
│  │ - Visual tool selection        │  │
│  │ - One-click deployment         │  │
│  └────────────────────────────────┘  │
└──────┬───────────────────────────────┘
       │ 3. Create agent
       ▼
┌──────────────────────────────────────┐
│  Agent Builder Service               │
│  - Generate blueprint (LLM)          │
│  - Apply safe defaults               │
│  - Validate with CRV                 │
│  - Deploy to sandbox                 │
└──────┬───────────────────────────────┘
       │ 4. Execute in sandbox
       ▼
┌──────────────────────────────────────┐
│  Workflow Orchestrator               │
│  - Simulation sandbox                │
│  - No real side effects              │
│  - Record all actions                │
└──────┬───────────────────────────────┘
       │ 5. Store results
       ▼
┌──────────────────────────────────────┐
│  PostgreSQL (tenant: personal-demo)  │
│  - Agent blueprints                  │
│  - Execution history                 │
│  - Memory snapshots                  │
└──────────────────────────────────────┘

Resource Limits:
- Max agents: 5
- Max executions/day: 50
- Sandbox: Simulation only
```

### Developer Flow

```
┌──────────────┐
│  Developer   │
│ (IDE/Browser)│
└──────┬───────┘
       │
       │ 1. Use SDK or UI
       ▼
┌──────────────────────────────────────┐
│  Developer Portal                    │
│  ┌────────────────────────────────┐  │
│  │ SDK Access                     │  │
│  │ - TypeScript/Python            │  │
│  │ - API documentation            │  │
│  │ - Code examples                │  │
│  │ - Test harness                 │  │
│  └────────────────────────────────┘  │
│                                      │
│  ┌────────────────────────────────┐  │
│  │ Agent Studio (Full)            │  │
│  │ - Custom tools                 │  │
│  │ - Policy editor                │  │
│  │ - CRV configuration            │  │
│  │ - Version control              │  │
│  └────────────────────────────────┘  │
└──────┬───────────────────────────────┘
       │ 2. Build agent
       ▼
┌──────────────────────────────────────┐
│  API Server                          │
│  POST /api/agents/generate           │
│  POST /api/agents/validate           │
│  POST /api/agents/deploy             │
└──────┬───────────────────────────────┘
       │ 3. Test in sandbox
       ▼
┌──────────────────────────────────────┐
│  Container Sandbox                   │
│  - Docker container                  │
│  - Resource limits (2 CPU, 4GB)      │
│  - Network isolation                 │
│  - Full tool access                  │
└──────┬───────────────────────────────┘
       │ 4. Deploy to staging
       ▼
┌──────────────────────────────────────┐
│  Deployment Pipeline                 │
│  - Staging environment               │
│  - Smoke tests                       │
│  - Approval workflow                 │
│  - Production promotion              │
└──────────────────────────────────────┘

Resource Limits:
- Max agents: 20
- Max executions/day: 500
- Sandbox: Container with limits
```

### Administrator Flow

```
┌──────────────┐
│Administrator │
│  (Browser)   │
└──────┬───────┘
       │
       │ 1. Access /admin
       ▼
┌──────────────────────────────────────┐
│  Admin Console                       │
│  ┌────────────────────────────────┐  │
│  │ Multi-Tenant View              │  │
│  │ - All tenants list             │  │
│  │ - Resource utilization         │  │
│  │ - Active agents                │  │
│  └────────────────────────────────┘  │
│                                      │
│  ┌────────────────────────────────┐  │
│  │ Policy Management              │  │
│  │ - Policy editor (visual)       │  │
│  │ - Approval workflows           │  │
│  │ - Risk tier configuration      │  │
│  └────────────────────────────────┘  │
│                                      │
│  ┌────────────────────────────────┐  │
│  │ Compliance                     │  │
│  │ - Audit log viewer             │  │
│  │ - Export functionality         │  │
│  │ - Retention policies           │  │
│  └────────────────────────────────┘  │
└──────┬───────────────────────────────┘
       │ 2. View/manage system
       ▼
┌──────────────────────────────────────┐
│  Console Service                     │
│  - Read all tenant data              │
│  - Configure policies                │
│  - Review audit logs                 │
│  - Approve deployments               │
└──────┬───────────────────────────────┘
       │ 3. Query database
       ▼
┌──────────────────────────────────────┐
│  PostgreSQL (cross-tenant access)    │
│  SELECT * FROM workflows             │
│    WHERE tenant_id IN (...)          │
│  SELECT * FROM audit_logs            │
│    WHERE timestamp > ...             │
└──────────────────────────────────────┘

Resource Limits:
- Unlimited read access
- Policy configuration
- Audit log export
```

### DevOps Flow

```
┌──────────────┐
│DevOps Engineer│
│ (CLI/Browser)│
└──────┬───────┘
       │
       │ 1. Infrastructure access
       ▼
┌──────────────────────────────────────┐
│  Infrastructure Layer                │
│  ┌────────────────────────────────┐  │
│  │ Terraform                      │  │
│  │ - AWS/Azure/GCP resources      │  │
│  │ - Auto-scaling                 │  │
│  │ - Load balancers               │  │
│  └────────────────────────────────┘  │
│                                      │
│  ┌────────────────────────────────┐  │
│  │ Kubernetes                     │  │
│  │ - Pod management               │  │
│  │ - ConfigMaps/Secrets           │  │
│  │ - Ingress                      │  │
│  └────────────────────────────────┘  │
│                                      │
│  ┌────────────────────────────────┐  │
│  │ CI/CD                          │  │
│  │ - GitHub Actions               │  │
│  │ - Deployment automation        │  │
│  │ - Rollback procedures          │  │
│  └────────────────────────────────┘  │
└──────┬───────────────────────────────┘
       │ 2. Deploy/monitor
       ▼
┌──────────────────────────────────────┐
│  Monitoring Stack                    │
│  ┌────────────────────────────────┐  │
│  │ Prometheus                     │  │
│  │ - Scrape metrics               │  │
│  │ - Store time series            │  │
│  │ - Evaluate alerts              │  │
│  └────────────────────────────────┘  │
│                                      │
│  ┌────────────────────────────────┐  │
│  │ Grafana                        │  │
│  │ - System health dashboard      │  │
│  │ - Resource utilization         │  │
│  │ - Alert visualization          │  │
│  └────────────────────────────────┘  │
└──────────────────────────────────────┘

Access:
- Full infrastructure access
- Kubernetes cluster admin
- CI/CD configuration
- Monitoring stack
```

## Multi-Tenant Isolation

```
┌─────────────────────────────────────────────────────────────────┐
│                      POSTGRESQL DATABASE                         │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  workflows table                                           │  │
│  │  ┌──────────┬─────────────┬─────────┬──────────┐          │  │
│  │  │   id     │ tenant_id   │  name   │   spec   │          │  │
│  │  ├──────────┼─────────────┼─────────┼──────────┤          │  │
│  │  │ wf-001   │ personal-1  │ Agent A │ {...}    │ ◄────┐   │  │
│  │  │ wf-002   │ personal-1  │ Agent B │ {...}    │ ◄────┤   │  │
│  │  │ wf-003   │ developer-1 │ Agent C │ {...}    │ ◄────┼─┐ │  │
│  │  │ wf-004   │ developer-1 │ Agent D │ {...}    │ ◄────┼─┤ │  │
│  │  │ wf-005   │ admin-1     │ Agent E │ {...}    │ ◄────┼─┼─┤ │
│  │  └──────────┴─────────────┴─────────┴──────────┘      │ │ │ │
│  └──────────────────────────────────────────────────────│─┼─┼─┘ │
│                                                          │ │ │   │
│  Row-Level Security Policies:                           │ │ │   │
│  ┌──────────────────────────────────────────────────┐   │ │ │   │
│  │ Personal User (tenant_id = 'personal-1')         │───┘ │ │   │
│  │   WHERE tenant_id = 'personal-1'                 │     │ │   │
│  │   → Can only see wf-001, wf-002                  │     │ │   │
│  └──────────────────────────────────────────────────┘     │ │   │
│                                                            │ │   │
│  ┌──────────────────────────────────────────────────┐     │ │   │
│  │ Developer (tenant_id = 'developer-1')            │─────┘ │   │
│  │   WHERE tenant_id = 'developer-1'                │       │   │
│  │   → Can only see wf-003, wf-004                  │       │   │
│  └──────────────────────────────────────────────────┘       │   │
│                                                              │   │
│  ┌──────────────────────────────────────────────────┐       │   │
│  │ Administrator (no tenant_id restriction)         │───────┘   │
│  │   No WHERE clause (see all)                      │           │
│  │   → Can see all workflows                        │           │
│  └──────────────────────────────────────────────────┘           │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

## Deployment Pipeline

```
Developer commits code
         │
         ▼
┌──────────────────┐
│  GitHub Actions  │
│   Trigger CI/CD  │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Build Stage     │
│  - npm install   │
│  - npm build     │
│  - Run tests     │
└────────┬─────────┘
         │ Success
         ▼
┌──────────────────┐
│ Security Scan    │
│  - npm audit     │
│  - CodeQL        │
│  - Container scan│
└────────┬─────────┘
         │ Pass
         ▼
┌──────────────────┐
│ Build Image      │
│  - Docker build  │
│  - Tag image     │
│  - Push to       │
│    registry      │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Deploy Staging   │
│  - kubectl apply │
│  - Wait for      │
│    rollout       │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Run Smoke Tests  │
│  - Health checks │
│  - API tests     │
│  - E2E tests     │
└────────┬─────────┘
         │ Pass
         ▼
┌──────────────────┐
│ Approval Gate    │
│  - Risk = HIGH?  │
│  - Require human │
│    approval      │
└────────┬─────────┘
         │ Approved
         ▼
┌──────────────────┐
│ Deploy Production│
│  - kubectl apply │
│  - Blue/Green    │
│  - Health check  │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Post-Deploy      │
│  - Verify metrics│
│  - Alert setup   │
│  - Notify team   │
└──────────────────┘
         │
         ▼
    Production ✓
```

## Monitoring & Observability Flow

```
┌──────────────────┐
│ Aureus Console   │
│ (Node.js App)    │
└────────┬─────────┘
         │
         │ Emit metrics
         ▼
┌────────────────────────────────────┐
│  Application Metrics               │
│  - Agent execution count           │
│  - API request latency             │
│  - CRV validation results          │
│  - Policy decisions                │
│  - Error rates                     │
└────────┬───────────────────────────┘
         │
         │ Scrape every 15s
         ▼
┌──────────────────┐
│   Prometheus     │
│  Time Series DB  │
│  - Store metrics │
│  - Evaluate rules│
│  - Send alerts   │
└────────┬─────────┘
         │
         ├─────────────┐
         │             │
         ▼             ▼
┌──────────────┐  ┌──────────────┐
│   Grafana    │  │ AlertManager │
│  Dashboards  │  │  - Email     │
│  - System    │  │  - Slack     │
│    health    │  │  - PagerDuty │
│  - Resource  │  └──────────────┘
│    usage     │
│  - Business  │
│    metrics   │
└──────────────┘

Alert Example:
  High Error Rate
       │
       ▼
  AlertManager
       │
       ├─── Email ──→ DevOps team
       │
       └─── Slack ──→ #alerts channel
```

## Security Layers

```
┌───────────────────────────────────────────────────────────────┐
│                     SECURITY LAYERS                            │
│                                                                 │
│  Layer 1: Network Security                                     │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │ - Firewall (only 443, 80 open)                          │  │
│  │ - DDoS protection                                        │  │
│  │ - Rate limiting (100 req/min)                            │  │
│  └─────────────────────────────────────────────────────────┘  │
│                            ▼                                   │
│  Layer 2: Authentication                                       │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │ - JWT tokens (15 min expiry)                             │  │
│  │ - OAuth 2.0 (Google, GitHub)                             │  │
│  │ - SSO (SAML, OIDC)                                        │  │
│  │ - MFA (optional)                                          │  │
│  └─────────────────────────────────────────────────────────┘  │
│                            ▼                                   │
│  Layer 3: Authorization                                        │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │ - RBAC (role-based access control)                       │  │
│  │ - Tenant isolation (row-level security)                  │  │
│  │ - Resource quotas                                         │  │
│  │ - Policy-based access (GoalGuard FSM)                    │  │
│  └─────────────────────────────────────────────────────────┘  │
│                            ▼                                   │
│  Layer 4: Data Protection                                      │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │ - TLS 1.3 (data in transit)                              │  │
│  │ - AES-256 (data at rest)                                 │  │
│  │ - Encrypted backups                                       │  │
│  │ - Secrets management                                      │  │
│  └─────────────────────────────────────────────────────────┘  │
│                            ▼                                   │
│  Layer 5: Application Security                                 │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │ - Input validation (CRV)                                  │  │
│  │ - Sandbox execution                                       │  │
│  │ - SQL injection prevention (parameterized queries)       │  │
│  │ - XSS protection                                          │  │
│  └─────────────────────────────────────────────────────────┘  │
│                            ▼                                   │
│  Layer 6: Audit & Compliance                                   │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │ - Comprehensive logging                                   │  │
│  │ - Immutable audit trail                                   │  │
│  │ - Compliance exports (GDPR, HIPAA)                        │  │
│  │ - Retention policies                                      │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                                 │
└───────────────────────────────────────────────────────────────┘
```

## Quick Reference: Services & Ports

```
Service          Port   Purpose
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Console          3000   Main API server & UI
Grafana          3001   Monitoring dashboards
Prometheus       9090   Metrics collection
AlertManager     9093   Alert routing
PostgreSQL       5432   Primary database
Redis            6379   Cache & sessions
Nginx            80     HTTP reverse proxy
Nginx            443    HTTPS reverse proxy
```

---

**Visual Guide Metadata:**
- Created: January 22, 2026
- Last Updated: January 22, 2026
- Version: 1.0
