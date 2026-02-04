# Interactive Demo Deployment - Quick Start Guide

## Overview

This guide provides a fast-track path to deploying interactive demos of the Aureus Agentic OS for different user personas. Follow this guide to get your demo environment up and running in under 30 minutes.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Quick Start (5 minutes)](#quick-start-5-minutes)
3. [Persona Guides](#persona-guides)
4. [Access Information](#access-information)
5. [Troubleshooting](#troubleshooting)
6. [Next Steps](#next-steps)

---

## Prerequisites

Before starting, ensure you have:

### Required Software
- **Node.js** 18+ ([Download](https://nodejs.org/))
- **Docker Desktop** ([Download](https://www.docker.com/products/docker-desktop/))
- **Git** ([Download](https://git-scm.com/))

### Optional (for cloud deployment)
- **kubectl** for Kubernetes ([Install](https://kubernetes.io/docs/tasks/tools/))
- **Terraform** for infrastructure ([Install](https://www.terraform.io/downloads))
- **Cloud CLI** (AWS CLI, Azure CLI, or gcloud)

### System Requirements
- **CPU:** 4+ cores recommended
- **RAM:** 8 GB minimum, 16 GB recommended
- **Disk:** 20 GB free space
- **OS:** Windows 10/11, macOS 10.15+, or Linux (Ubuntu 20.04+)

---

## Quick Start (5 minutes)

### Step 1: Clone Repository

```bash
git clone https://github.com/aureus/Aureus_Agentic_OS.git
cd Aureus_Agentic_OS/demo-deployment
```

### Step 2: Configure Environment

```bash
# Copy environment template
cp .env.example .env

# Edit .env with your settings (at minimum, set these):
# - DB_PASSWORD
# - JWT_SECRET
# - OPENAI_API_KEY (or use LLM_MOCK_FALLBACK=true)
```

**Quick config for testing (no real LLM):**
```bash
cat > .env << EOF
NODE_ENV=development
DEMO_MODE=enabled
DEMO_ENVIRONMENT=shared
DB_PASSWORD=testpassword123
JWT_SECRET=$(openssl rand -base64 32)
LLM_PROVIDER=mock
LLM_MOCK_FALLBACK=true
GRAFANA_PASSWORD=admin123
EOF
```

### Step 3: Start Demo Environment

**Linux/Mac Users:**
```bash
# Make scripts executable
chmod +x scripts/*.sh

# Start all services
./scripts/provision-demo.sh --mode local --persona all
```

**Windows Users (PowerShell):**
```powershell
# Run PowerShell script
.\scripts\provision-demo.ps1 -Mode local -Persona all

# Or use Docker Compose directly
docker-compose up -d
```

### Step 4: Verify Installation

```bash
# Check service health
curl http://localhost:3000/health

# Expected output:
# {"status": "healthy", "version": "0.1.0", "demo": true}
```

### Step 5: Access Demo

Open your browser and navigate to:
- **Main Console:** http://localhost:3000
- **Grafana Dashboard:** http://localhost:3001 (admin/admin123)

**Demo Credentials:**
- Email: `demo@aureus.io`
- Password: `AureusDemo2026!`

---

## Persona Guides

### 🎯 Personal Users

**Goal:** Create your first AI agent in 5 minutes

**Access:** http://localhost:3000/personal

**Quick Tutorial:**
1. Click "Create My First Agent"
2. Enter goal: "Send me a daily weather summary at 8 AM"
3. Select tools: Weather API, Email
4. Click "Create Agent"
5. Watch your agent execute!

**Pre-loaded Scenarios:**
- ✅ My First Agent (5 min tutorial)
- 🏠 Smart Home Assistant
- 📚 Research Helper
- 📅 Calendar Manager

**What You Can Do:**
- Create up to 5 agents
- 50 executions per day
- Use simulation sandbox (no real side effects)
- Learn AI agent basics

---

### 💻 Agent Developers

**Goal:** Build and deploy a custom agent using the SDK

**Access:** http://localhost:3000/developer

**Quick Tutorial:**

1. **Set up development environment:**
```bash
npm install -g @aureus/sdk
aureus login --token demo-dev-token
```

2. **Create your first agent:**
```typescript
// my-agent.ts
import { AgentBuilder } from '@aureus/sdk';

const agent = new AgentBuilder()
  .setGoal('Analyze CSV data and generate insights')
  .setDomain('data-science')
  .addTool('csv-reader')
  .addTool('data-analyzer')
  .addTool('report-generator')
  .setRiskTier('MEDIUM')
  .build();

const result = await agent.execute();
console.log(result);
```

3. **Test in sandbox:**
```bash
aureus test my-agent.ts --sandbox simulation
```

4. **Deploy to staging:**
```bash
aureus deploy my-agent.ts --environment staging
```

**Pre-loaded Scenarios:**
- 📖 SDK Quick Start (10 min)
- 🔧 Custom Tool Integration (20 min)
- 🤖 Robotics Agent with ROS2 (30 min)
- 🏥 Healthcare Agent (HIPAA-compliant) (25 min)

**Resources:**
- API Documentation: http://localhost:3000/docs
- Code Examples: `/demo-scenarios/developer/`
- VS Code Extension: Search "Aureus" in VS Code marketplace
- CLI Tool: `aureus --help`

**What You Can Do:**
- Create up to 20 agents
- 500 executions per day
- Use container sandbox
- Access full SDK and APIs
- Deploy to staging/production

---

### 🛡️ Administrators

**Goal:** Manage multi-tenant system with policies and compliance

**Access:** http://localhost:3000/admin

**Quick Tutorial:**

1. **View all tenants:**
   - Navigate to "Tenant Management"
   - See resource utilization
   - Monitor active agents

2. **Configure policies:**
   - Go to "Policy & Governance"
   - Create new policy
   - Set risk tier: HIGH
   - Require approval: Yes

3. **Review audit logs:**
   - Open "Compliance & Audit"
   - Filter by date range
   - Export for compliance

4. **Handle incident:**
   - Go to "Monitoring"
   - See CRV failure alert
   - Click "Rollback" to last good state

**Pre-loaded Scenarios:**
- 🏢 Multi-Tenant Management (10 min)
- 📋 Policy Configuration (15 min)
- 📊 Compliance Audit (15 min)
- 🚨 Incident Response (20 min)

**What You Can Do:**
- View all tenants (currently: 3 demo tenants)
- Configure global policies
- Review audit logs
- Export compliance reports
- Approve high-risk deployments
- Execute rollbacks

---

### ⚙️ DevOps Engineers

**Goal:** Deploy and maintain production infrastructure

**Access:** http://localhost:3000/devops

**Quick Tutorial:**

1. **Deploy with Docker Compose:**
```bash
cd demo-deployment
docker-compose up -d

# Verify deployment
docker-compose ps
curl http://localhost:3000/health
```

2. **Deploy to Kubernetes:**
```bash
cd infrastructure/kubernetes
kubectl apply -f namespace.yaml
kubectl apply -f demo-deployment.yaml

# Check status
kubectl get pods -n aureus-demo
kubectl logs -f deployment/aureus-console -n aureus-demo
```

3. **Set up monitoring:**
```bash
# Prometheus and Grafana are auto-deployed
# Access Grafana: http://localhost:3001

# Import dashboards
cd monitoring/grafana/dashboards
./import-dashboards.sh
```

4. **Configure CI/CD:**
```bash
# Copy GitHub Actions template
cp docs/ci-cd-templates/github-actions/deploy.yml .github/workflows/

# Configure secrets in GitHub
# - AUREUS_API_TOKEN
# - DATABASE_URL
# - OPENAI_API_KEY
```

**Pre-loaded Scenarios:**
- 🐳 Docker Deployment (15 min)
- ☸️ Kubernetes Deployment (25 min)
- 🔄 CI/CD Pipeline Setup (30 min)
- 📈 Monitoring Setup (20 min)
- 💾 Disaster Recovery (25 min)

**Infrastructure Files:**
- Docker Compose: `demo-deployment/docker-compose.yml`
- Kubernetes: `demo-deployment/infrastructure/kubernetes/`
- Terraform: `demo-deployment/infrastructure/terraform/`
- Helm Chart: `demo-deployment/infrastructure/helm/`

**What You Can Do:**
- Deploy to cloud (AWS/Azure/GCP)
- Configure auto-scaling
- Set up CI/CD pipelines
- Monitor system health
- Execute backup/restore
- Performance tuning

---

## Access Information

### Local Deployment URLs

| Service | URL | Credentials |
|---------|-----|-------------|
| Main Console | http://localhost:3000 | demo@aureus.io / AureusDemo2026! |
| Personal Demo | http://localhost:3000/personal | (same as above) |
| Developer Demo | http://localhost:3000/developer | (same as above) |
| Admin Console | http://localhost:3000/admin | (same as above) |
| DevOps Portal | http://localhost:3000/devops | (same as above) |
| Grafana | http://localhost:3001 | admin / admin123 |
| Prometheus | http://localhost:9090 | (no auth) |
| PostgreSQL | localhost:5432 | aureus / testpassword123 |
| Redis | localhost:6379 | (no auth) |

### API Endpoints

- Health: `GET http://localhost:3000/health`
- Metrics: `GET http://localhost:3000/api/metrics`
- Workflows: `GET http://localhost:3000/api/workflows`
- Agents: `POST http://localhost:3000/api/agents/generate`

**API Authentication:**
```bash
# Get token
TOKEN=$(curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@aureus.io","password":"AureusDemo2026!"}' \
  | jq -r '.token')

# Use token
curl http://localhost:3000/api/workflows \
  -H "Authorization: Bearer $TOKEN"
```

---

## Troubleshooting

### Services Won't Start

**Issue:** Docker Compose fails to start services

**Solutions:**
```bash
# Check Docker is running
docker ps

# Check port availability
netstat -ano | findstr :3000  # Windows
lsof -i :3000                 # Linux/Mac

# Clear old containers
docker-compose down -v
docker system prune -a

# Restart
docker-compose up -d
```

### Database Connection Errors

**Issue:** Console can't connect to PostgreSQL

**Solutions:**
```bash
# Check PostgreSQL is running
docker-compose ps postgres

# Check logs
docker-compose logs postgres

# Restart PostgreSQL
docker-compose restart postgres

# Wait for health check
docker-compose ps | grep postgres
```

### LLM API Errors

**Issue:** OpenAI API key not working or rate limited

**Solutions:**
```bash
# Enable mock LLM fallback
# Edit .env:
LLM_MOCK_FALLBACK=true
LLM_PROVIDER=mock

# Restart console
docker-compose restart console
```

### Cannot Access UI

**Issue:** Browser shows "Connection refused"

**Solutions:**
```bash
# Check console is running
docker-compose ps console

# Check logs
docker-compose logs console

# Verify health
curl http://localhost:3000/health

# Check firewall (Windows)
New-NetFirewallRule -DisplayName "Aureus Demo" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow
```

### High Memory Usage

**Issue:** Docker consuming too much memory

**Solutions:**
```bash
# Increase Docker memory limit (Docker Desktop)
# Settings → Resources → Memory → 8 GB

# Or reduce services
docker-compose up -d console postgres redis
# (Skip Prometheus, Grafana if not needed)
```

### Need More Help?

- 📖 Full Documentation: `/demo-deployment/README.md`
- 💬 Community Discord: https://discord.gg/aureus
- 📧 Email Support: demo-support@aureus.io
- 🐛 GitHub Issues: https://github.com/aureus/Aureus_Agentic_OS/issues

---

## Next Steps

### After Initial Setup

1. **Explore Demo Scenarios:**
   - Try all pre-loaded scenarios for your persona
   - Modify and experiment with examples
   - Create your own agents

2. **Read Documentation:**
   - Architecture overview: `/docs/architecture.md`
   - API reference: `/docs/api/README.md`
   - Best practices: `/docs/best-practices.md`

3. **Join Community:**
   - Discord: Share your agents and get help
   - GitHub: Contribute code and examples
   - Twitter: Follow @AureusOS for updates

### Evaluation Path

If you're evaluating Aureus for production:

1. **Week 1:** Explore all persona demos
2. **Week 2:** Build prototype agent for your use case
3. **Week 3:** Test in staging with real data
4. **Week 4:** Security and compliance review
5. **Month 2:** Production pilot with monitoring

**Schedule a demo with our team:**
- Email: sales@aureus.io
- Calendly: https://calendly.com/aureus/demo

### Production Deployment

Ready for production? See:
- Production Deployment Guide: `/docs/deployment.md`
- Security Checklist: `/docs/security_model.md`
- DevOps Guide: `/docs/devops.md`
- Terraform Templates: `/infrastructure/terraform/`

---

## Summary

You've successfully set up the Aureus Agentic OS demo environment! Here's what you have:

✅ **Fully functional demo environment** running locally
✅ **4 persona-specific experiences** (Personal, Developer, Admin, DevOps)
✅ **Pre-loaded demo scenarios** with sample data
✅ **Monitoring and observability** (Prometheus + Grafana)
✅ **Complete documentation** and code examples

**Resource Limits (Demo):**
- Personal: 5 agents, 50 executions/day
- Developer: 20 agents, 500 executions/day
- Admin: Unlimited (view-only for demo)
- DevOps: Infrastructure access

**Demo Duration:** 7 days (extendable)
**Data Retention:** 24 hours for shared demo, 7 days for persona demos

---

## Feedback

We'd love to hear your thoughts!

**Quick Survey (2 minutes):** https://forms.gle/aureus-demo-feedback

**What we'd love to know:**
- Which persona demo did you try?
- What was your favorite feature?
- What was confusing or missing?
- Would you use Aureus in production?

---

**Need Help?** Contact demo-support@aureus.io

**Ready for Production?** Contact sales@aureus.io

**Happy Agent Building!** 🚀
