# Demo Deployment Implementation

This directory contains all necessary files to deploy the interactive demo environments for Aureus Agentic OS.

## Directory Structure

```
demo-deployment/
├── README.md                          # This file
├── infrastructure/                    # Infrastructure as Code
│   ├── terraform/                     # Terraform configurations
│   ├── kubernetes/                    # Kubernetes manifests
│   └── docker/                        # Docker configurations
├── configurations/                    # Environment configurations
│   ├── personal/                      # Personal user configs
│   ├── developer/                     # Developer configs
│   ├── admin/                         # Administrator configs
│   └── devops/                        # DevOps configs
├── demo-scenarios/                    # Pre-built demo scenarios
│   ├── personal/                      # Personal user demos
│   ├── developer/                     # Developer demos
│   ├── admin/                         # Admin demos
│   └── devops/                        # DevOps demos
├── scripts/                           # Deployment scripts
│   ├── provision-demo.sh              # Main provisioning script
│   ├── setup-persona.sh               # Persona-specific setup
│   └── teardown-demo.sh               # Cleanup script
└── monitoring/                        # Monitoring configurations
    ├── dashboards/                    # Grafana dashboards
    ├── alerts/                        # Alert rules
    └── exporters/                     # Custom metric exporters
```

## Quick Start

### Prerequisites

- Node.js 18+
- Docker and Docker Compose
- kubectl (for Kubernetes deployment)
- Terraform (for cloud deployment)
- Access to cloud provider (AWS/Azure/GCP)

### Local Demo Setup

For local testing of the demo environments:

```bash
# 1. Clone repository
cd demo-deployment

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Edit .env with your settings

# 4. Start local demo
./scripts/provision-demo.sh --mode local --persona all

# 5. Access demos
# Personal: http://localhost:3000/personal
# Developer: http://localhost:3000/developer
# Admin: http://localhost:3000/admin
# DevOps: http://localhost:3000/devops
```

### Cloud Deployment

For production demo environment:

```bash
# 1. Configure cloud provider
cd infrastructure/terraform/aws  # or azure, gcp

# 2. Initialize Terraform
terraform init

# 3. Deploy infrastructure
terraform apply -var-file=demo.tfvars

# 4. Deploy application
cd ../../kubernetes
kubectl apply -f namespace.yaml
kubectl apply -f demo-deployment.yaml

# 5. Configure personas
../scripts/setup-persona.sh --persona all --environment production
```

## Persona-Specific Deployments

### Personal Users

Deploy a simplified, guided experience:

```bash
./scripts/provision-demo.sh --persona personal
```

Features enabled:
- Simplified Agent Studio UI
- Pre-built agent templates
- Guided tutorials
- Sandbox execution (simulation mode)
- Rate limits: 50 executions/day

### Developers

Deploy a full-featured development environment:

```bash
./scripts/provision-demo.sh --persona developer
```

Features enabled:
- Full SDK access (TypeScript + Python)
- API documentation portal
- Code editor integration
- Container sandbox
- Rate limits: 500 executions/day

### Administrators

Deploy an admin control center:

```bash
./scripts/provision-demo.sh --persona admin
```

Features enabled:
- Multi-tenant management
- Policy configuration
- Audit log viewer
- Compliance reports
- Full system access

### DevOps Engineers

Deploy infrastructure playground:

```bash
./scripts/provision-demo.sh --persona devops
```

Features enabled:
- Kubernetes cluster access
- Infrastructure as Code templates
- CI/CD pipeline examples
- Monitoring stack (Prometheus/Grafana)
- Full SSH access

## Demo Scenarios

Each persona has pre-configured demo scenarios in `demo-scenarios/<persona>/`:

### Personal User Scenarios
- `my-first-agent/` - 5-minute guided tutorial
- `smart-home/` - Smart home assistant demo
- `research-helper/` - Research aggregation agent

### Developer Scenarios
- `sdk-quickstart/` - SDK introduction with code examples
- `custom-tool/` - Build and register custom tools
- `robotics-agent/` - Robotics agent with ROS2
- `healthcare-agent/` - HIPAA-compliant healthcare agent

### Admin Scenarios
- `multi-tenant/` - Tenant management demonstration
- `policy-config/` - Policy and governance setup
- `compliance-audit/` - Compliance reporting
- `incident-response/` - Rollback and recovery

### DevOps Scenarios
- `docker-deployment/` - Docker Compose setup
- `k8s-deployment/` - Kubernetes deployment
- `ci-cd-pipeline/` - GitHub Actions workflow
- `monitoring-setup/` - Observability stack
- `disaster-recovery/` - Backup and restore

## Configuration Files

### Environment Variables

```bash
# Demo Environment Configuration
DEMO_MODE=enabled
DEMO_ENVIRONMENT=shared  # or personal, developer, admin, devops

# Database
STATE_STORE_TYPE=postgres
DATABASE_URL=postgresql://aureus:password@postgres:5432/aureus_demo

# Authentication
AUTH_PROVIDER=oauth  # google, github, sso
JWT_SECRET=your-demo-jwt-secret
SESSION_TIMEOUT=86400  # 24 hours

# Resource Limits
MAX_AGENTS_PERSONAL=5
MAX_AGENTS_DEVELOPER=20
MAX_EXECUTIONS_PER_DAY_PERSONAL=50
MAX_EXECUTIONS_PER_DAY_DEVELOPER=500

# LLM Configuration
LLM_PROVIDER=openai
LLM_MODEL=gpt-4
OPENAI_API_KEY=your-api-key
LLM_CACHE_ENABLED=true
LLM_MOCK_FALLBACK=true  # Use mock LLM when rate limited

# Monitoring
PROMETHEUS_ENABLED=true
GRAFANA_ENABLED=true
METRICS_RETENTION_DAYS=30
```

### Tenant Configuration

Each persona gets a pre-configured tenant:

```json
{
  "personal": {
    "tenantId": "personal-demo",
    "displayName": "Personal User Demo",
    "resources": {
      "maxAgents": 5,
      "maxExecutionsPerDay": 50,
      "maxMemoryMB": 100,
      "sandboxType": "simulation"
    },
    "features": {
      "agentStudio": "simplified",
      "advancedFeatures": false,
      "customPolicies": false
    }
  },
  "developer": {
    "tenantId": "developer-demo",
    "displayName": "Developer Demo",
    "resources": {
      "maxAgents": 20,
      "maxExecutionsPerDay": 500,
      "maxMemoryMB": 1000,
      "sandboxType": "container"
    },
    "features": {
      "sdkAccess": true,
      "apiDocs": true,
      "customTools": true,
      "advancedFeatures": true
    }
  },
  "admin": {
    "tenantId": "admin-demo",
    "displayName": "Administrator Demo",
    "resources": {
      "unlimited": true
    },
    "features": {
      "multiTenantView": true,
      "policyEditor": true,
      "auditLogs": true,
      "userManagement": true
    }
  },
  "devops": {
    "tenantId": "devops-demo",
    "displayName": "DevOps Demo",
    "resources": {
      "infrastructure": "dedicated"
    },
    "features": {
      "infrastructureAccess": true,
      "cicdTemplates": true,
      "monitoringStack": true,
      "fullAccess": true
    }
  }
}
```

## Monitoring & Observability

### Grafana Dashboards

Pre-configured dashboards for each persona:

1. **Personal User Dashboard**
   - Agent creation rate
   - Execution success rate
   - User engagement metrics

2. **Developer Dashboard**
   - API usage patterns
   - SDK adoption metrics
   - Test coverage
   - Build/deploy frequency

3. **Admin Dashboard**
   - System health overview
   - Multi-tenant metrics
   - Policy decisions
   - Audit log activity

4. **DevOps Dashboard**
   - Infrastructure health
   - Resource utilization
   - Error rates
   - Performance metrics

### Alert Rules

```yaml
# prometheus-alerts.yml
groups:
  - name: demo_alerts
    interval: 30s
    rules:
      - alert: HighDemoUserErrors
        expr: rate(aureus_demo_errors_total[5m]) > 0.05
        labels:
          severity: warning
          persona: all
        annotations:
          summary: "High error rate in demo environment"
          
      - alert: DemoResourceExhaustion
        expr: aureus_demo_tenant_quota_remaining < 0.1
        labels:
          severity: warning
        annotations:
          summary: "Demo tenant approaching resource limit"
```

## Backup & Recovery

### Automated Backups

```bash
# Backup configuration
BACKUP_ENABLED=true
BACKUP_SCHEDULE="0 2 * * *"  # Daily at 2 AM
BACKUP_RETENTION_DAYS=7
BACKUP_LOCATION=s3://aureus-demo-backups
```

### Manual Backup

```bash
# Backup demo environment
./scripts/backup-demo.sh --persona all --destination ./backups

# Restore from backup
./scripts/restore-demo.sh --backup ./backups/2026-01-22 --persona developer
```

## Security & Compliance

### Security Hardening

- All communications over HTTPS (TLS 1.3)
- JWT-based authentication with short expiration
- Rate limiting per user and tenant
- Sandbox execution for all untrusted code
- Regular security scans (daily)

### Data Isolation

- Separate PostgreSQL schema per tenant
- Row-level security policies
- API-level tenant filtering
- Audit logging for all access

### Compliance

- GDPR-compliant data handling
- Automated data purging (24 hours for shared demo)
- Audit trail export capabilities
- Privacy policy and terms acceptance

## Troubleshooting

### Common Issues

1. **Demo environment not accessible**
   ```bash
   # Check service health
   curl http://localhost:3000/health
   
   # Check logs
   docker-compose logs -f console
   
   # Restart services
   docker-compose restart
   ```

2. **Agent creation fails**
   ```bash
   # Check LLM provider status
   curl https://api.openai.com/v1/models
   
   # Check mock LLM fallback
   grep "LLM_MOCK_FALLBACK" .env
   
   # Review logs
   tail -f logs/agent-builder.log
   ```

3. **Database connection issues**
   ```bash
   # Test connection
   psql $DATABASE_URL -c "SELECT 1"
   
   # Check migrations
   npm run migrate:status
   
   # Re-run migrations
   npm run migrate:up
   ```

### Support

For issues with the demo deployment:
- Documentation: https://docs.aureus.io/demo
- Community: https://discord.gg/aureus
- Email: demo-support@aureus.io

## Maintenance

### Regular Tasks

- Daily: Monitor resource usage and error rates
- Weekly: Review user feedback and analytics
- Monthly: Update demo scenarios and content
- Quarterly: Security audit and penetration testing

### Updating Demo Content

```bash
# Update demo scenarios
cd demo-scenarios
git pull origin main
./scripts/deploy-scenarios.sh --persona all

# Update agent templates
cd configurations
./scripts/update-templates.sh

# Rebuild and deploy
docker-compose build
docker-compose up -d
```

## Cost Management

### Resource Optimization

- Enable LLM caching (50% cost reduction)
- Use mock LLM for non-critical demos
- Auto-scale down during off-hours
- Reserved instances for base capacity
- Set hard limits per tenant

### Cost Monitoring

```bash
# Generate cost report
./scripts/cost-report.sh --period monthly

# Set budget alerts
./scripts/set-budget-alert.sh --limit 2000 --email devops@aureus.io
```

## Roadmap

### Q1 2026
- [ ] Launch all 4 persona demos
- [ ] Implement auto-scaling
- [ ] Add 10 more demo scenarios
- [ ] Improve onboarding flow

### Q2 2026
- [ ] Multi-region deployment
- [ ] Advanced analytics
- [ ] Community-contributed scenarios
- [ ] Enterprise trial program

### Q3 2026
- [ ] Mobile-responsive UI
- [ ] Video tutorials in-app
- [ ] AI-powered demo recommendations
- [ ] Gamification features

## License

Copyright (c) 2026 Aureus Agentic OS. All rights reserved.

Demo deployment configurations are provided for evaluation purposes only.
