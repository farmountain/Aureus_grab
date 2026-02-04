# Beta Program Onboarding Guide

Welcome to the Aureus Agentic OS Technical Beta! This guide will help you get up and running quickly.

## Prerequisites Checklist

Before starting, ensure you have:

- [ ] **Docker Desktop** installed and running
- [ ] **Node.js 18+** installed
- [ ] **Git** installed
- [ ] **OpenAI API key** (or plan to use mock LLM mode)
- [ ] **4 GB RAM** free
- [ ] **10 GB disk space** available
- [ ] **Access to terminal/command line**

## Quick Start (30 Minutes)

### Step 1: Get the Code (5 min)

```bash
# Clone the repository
git clone https://github.com/aureus/Aureus_Agentic_OS.git
cd Aureus_Agentic_OS

# Check you're on the beta branch
git checkout beta  # Or main, depending on distribution
```

### Step 2: Configure Environment (10 min)

```bash
# Navigate to demo deployment
cd demo-deployment

# Copy the environment template
cp .env.example .env

# Edit .env with your settings
nano .env  # or use your preferred editor
```

**Minimum Required Configuration**:

```bash
# Database
DB_PASSWORD=your-secure-password

# Authentication
JWT_SECRET=$(openssl rand -base64 32)

# LLM Provider (choose one)
# Option A: Use real OpenAI
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-your-api-key

# Option B: Use mock for testing (no API key needed)
LLM_PROVIDER=mock
LLM_MOCK_FALLBACK=true
```

### Step 3: Start the Platform (10 min)

**On Linux/macOS**:
```bash
# Make scripts executable
chmod +x scripts/*.sh

# Start all services
./scripts/start-demo.sh

# Wait for health checks (2-3 minutes)
docker-compose ps
```

**On Windows PowerShell**:
```powershell
# Start all services
docker-compose up -d

# Check status
docker-compose ps
```

**Verify startup**:
```bash
# Check console health
curl http://localhost:3000/health

# Check PostgreSQL
docker-compose exec postgres pg_isready

# Check Redis
docker-compose exec redis redis-cli ping
```

### Step 4: Access the Console (5 min)

Open your browser and navigate to:

**Console URL**: http://localhost:3000

**Default Credentials** (if auth is enabled):
- Username: `demo@aureus.ai`
- Password: `demo123` (change immediately!)

**Available UIs**:
- Agent Studio: http://localhost:3000/agent-studio.html
- Workflow Wizard: http://localhost:3000/workflow-wizard.html
- Monitoring: http://localhost:3000/monitoring.html
- Grafana: http://localhost:3001 (user: admin, pass: as configured)
- Prometheus: http://localhost:9090

## Your First Agent (15 Minutes)

### Option A: Use Agent Studio (Visual)

1. Open http://localhost:3000/agent-studio.html
2. Click "Generate New Agent"
3. Fill in:
   - **Name**: "Demo DevOps Agent"
   - **Description**: "Automates system checks"
   - **Risk Profile**: LOW
4. Click "Generate Blueprint"
5. Review the generated agent configuration
6. Click "Simulate" to test
7. Click "Deploy" to make it live

### Option B: Use API (Programmatic)

```bash
# Generate an agent via API
curl -X POST http://localhost:3000/api/agents/generate \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Demo DevOps Agent",
    "description": "Automates system health checks",
    "riskProfile": "LOW",
    "capabilities": ["monitoring", "diagnostics"],
    "tools": ["shell", "http"]
  }'

# Execute a workflow
curl -X POST http://localhost:3000/api/workflows/execute \
  -H "Content-Type: application/json" \
  -d '{
    "workflowId": "agent-generated-workflow-id",
    "tenantId": "your-tenant-id"
  }'
```

### Option C: Use Python SDK

```python
from aureus_sdk import AureusClient

# Initialize client
client = AureusClient(
    base_url="http://localhost:3000",
    api_key="your-api-key"  # if auth is enabled
)

# Create an agent
agent = client.agents.generate(
    name="Demo DevOps Agent",
    description="Automates system health checks",
    risk_profile="LOW",
    capabilities=["monitoring", "diagnostics"],
    tools=["shell", "http"]
)

# Execute a workflow
execution = client.workflows.execute(
    workflow_id=agent.workflow_id,
    tenant_id="your-tenant-id"
)

# Monitor execution
status = client.workflows.get_status(execution.id)
print(f"Status: {status.state}")
```

## Verification Checklist

After setup, verify these features work:

- [ ] **Orchestration**: Create and execute a simple workflow
- [ ] **CRV Validation**: Test with invalid input (should be blocked)
- [ ] **Policy Enforcement**: Try a high-risk action (should require approval)
- [ ] **Memory & Rollback**: Create snapshot, make changes, rollback
- [ ] **Monitoring**: View execution in dashboard
- [ ] **Telemetry**: Check Prometheus metrics at http://localhost:9090

## Common Setup Issues

### Issue: Docker containers won't start

**Symptoms**: `docker-compose up` fails

**Solutions**:
1. Check Docker Desktop is running
2. Verify ports are available (3000, 5432, 6379, 9090, 3001)
3. Increase Docker memory limit to 4GB+
4. Check logs: `docker-compose logs`

### Issue: "No API key" errors

**Symptoms**: LLM operations fail

**Solutions**:
1. Set `OPENAI_API_KEY` in `.env`
2. OR set `LLM_MOCK_FALLBACK=true` for testing
3. Restart services: `docker-compose restart console`

### Issue: Database connection errors

**Symptoms**: "Cannot connect to PostgreSQL"

**Solutions**:
1. Wait 30 seconds after startup (initialization time)
2. Check PostgreSQL health: `docker-compose exec postgres pg_isready`
3. Verify `DB_PASSWORD` matches in `.env`
4. Check logs: `docker-compose logs postgres`

### Issue: Permission denied (Linux/Mac)

**Symptoms**: Scripts won't execute

**Solutions**:
```bash
chmod +x scripts/*.sh
sudo chown -R $USER:$USER ./
```

## Next Steps

### Week 1: Exploration

- [ ] Complete installation and verification
- [ ] Run 3 different example workflows
- [ ] Explore Agent Studio features
- [ ] Review architecture documentation
- [ ] Fill out Setup Survey (link in Slack)

### Week 2: Integration

- [ ] Identify your real-world use case
- [ ] Design your first custom agent
- [ ] Integrate with your existing tools
- [ ] Test with production-like data (in staging)
- [ ] Report any issues or feedback

### Week 3-4: Deep Dive

- [ ] Test CRV validation with edge cases
- [ ] Configure custom policies
- [ ] Set up monitoring dashboards
- [ ] Test rollback and recovery
- [ ] Share your use case in Slack

## Resources

### Documentation

- [Architecture Overview](../architecture/architecture.md)
- [Agent Studio Guide](../../AGENT_STUDIO_IMPLEMENTATION.md)
- [Policy Configuration](../guides/policy-guide.md)
- [Python SDK Reference](../guides/sdk-python-usage.md)
- [Monitoring Guide](../deployment/monitoring-and-alerting.md)

### Examples

- [Example Workflows](../../examples/)
- [Demo Scenarios](../../apps/demo-scenarios/)
- [Tool Adapters](../../packages/tools/examples/)

### Support

- **Slack**: #beta-technical channel
- **Email**: beta@aureus.ai
- **GitHub Issues**: [Report bugs](https://github.com/aureus/Aureus_Agentic_OS/issues)
- **Office Hours**: Bi-weekly (schedule in Slack)

## Feedback Guidelines

### What We Want to Know

**Installation Experience**:
- How long did setup take?
- What was confusing?
- What could be clearer?

**Feature Functionality**:
- Does it work as expected?
- Are there bugs or edge cases?
- Is performance acceptable?

**Developer Experience**:
- Is the API intuitive?
- Is documentation helpful?
- Are error messages clear?

**Use Case Fit**:
- Does it solve your problem?
- What's missing?
- What would you prioritize?

### How to Provide Feedback

**Weekly Survey** (5 minutes):
- Link posted in Slack every Monday
- Quick ratings + open comments
- Takes 5 minutes

**Bug Reports**:
- Use GitHub Issues
- Include: steps to reproduce, expected vs actual behavior, logs
- Tag with `beta` label

**Feature Requests**:
- Discuss in Slack first
- If validated, create GitHub Issue
- Tag with `feature-request` label

**Office Hours**:
- Bi-weekly video calls
- Demo your use case
- Ask questions
- Provide verbal feedback

## Pro Tips

### Performance Optimization

```bash
# Increase PostgreSQL shared buffers
# Edit docker-compose.yml
command: postgres -c shared_buffers=256MB -c max_connections=100

# Enable Redis persistence
# Edit docker-compose.yml under redis service
command: redis-server --appendonly yes --maxmemory 512mb
```

### Development Mode

```bash
# Enable hot reload for local development
cd Aureus_Agentic_OS
npm install
npm run dev

# Console will auto-restart on code changes
```

### Debugging

```bash
# View real-time logs
docker-compose logs -f console

# Access PostgreSQL directly
docker-compose exec postgres psql -U aureus -d aureus_demo

# Check Redis cache
docker-compose exec redis redis-cli
> KEYS *
> GET key-name
```

### Backup & Restore

```bash
# Backup database
docker-compose exec postgres pg_dump -U aureus aureus_demo > backup.sql

# Restore database
cat backup.sql | docker-compose exec -T postgres psql -U aureus -d aureus_demo

# Backup event logs
cp -r ./var/run/events ./backups/events-$(date +%Y%m%d)
```

## Welcome to the Beta!

You're now part of shaping the future of AI agent orchestration. We're excited to see what you build and learn from your feedback.

**Questions?** Drop them in Slack or email beta@aureus.ai

**Found a bug?** Report it on GitHub Issues

**Built something cool?** Share it in #beta-showcase on Slack!

---

*Last Updated: January 31, 2026*
