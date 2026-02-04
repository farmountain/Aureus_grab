# Quick Reference Guide - Aureus Agentic OS

**Last Updated**: January 31, 2026

## 🚀 Fast Access

### I Want To...

| Task | Go Here |
|------|---------|
| **Start using Aureus in 5 minutes** | [demo-deployment/QUICKSTART.md](../demo-deployment/QUICKSTART.md) |
| **Join the beta program** | [beta/overview.md](./beta/overview.md) |
| **Deploy to Kubernetes** | [infrastructure/kubernetes/](../infrastructure/kubernetes/) |
| **Understand the architecture** | [architecture.md](../architecture.md) |
| **Build my first agent** | [beta/onboarding.md](./beta/onboarding.md#your-first-agent-15-minutes) |
| **Configure policies** | [policy-guide.md](./policy-guide.md) |
| **Set up monitoring** | [monitoring-and-alerting.md](./monitoring-and-alerting.md) |
| **Read API docs** | [README.md](./README.md) → Implementation Guides |
| **Report a bug** | [GitHub Issues](https://github.com/aureus/Aureus_Agentic_OS/issues) |
| **Get help** | beta@aureus.ai (beta) or support@aureus.ai |

## 📚 Documentation Map

```
docs/
├── README.md                 # 📍 START HERE - Documentation index
├── beta/
│   ├── overview.md          # Beta program details
│   └── onboarding.md        # Beta quick start (30 min)
├── guides/                  # User tutorials
│   ├── installation.md
│   ├── policy-guide.md
│   ├── memory-quick-start.md
│   └── ...
└── deployment/              # Operations guides
    ├── deployment.md
    ├── monitoring-and-alerting.md
    └── production_readiness.md
```

## 🏗️ Deployment Quick Start

### Docker Compose (Easiest)
```bash
cd demo-deployment
cp .env.example .env
# Edit .env with your config
docker-compose up -d
open http://localhost:3000
```

### Kubernetes (Enterprise)
```bash
cd infrastructure/kubernetes
cp base/secrets.yaml.template base/secrets.yaml
# Edit secrets.yaml
kubectl apply -k base/
kubectl apply -k overlays/production/
```

## 🔑 Key Concepts (60 Seconds)

| Concept | What It Does | Why It Matters |
|---------|--------------|----------------|
| **Orchestrator** | Executes workflows as DAGs | Guarantees durability & resume |
| **CRV Gates** | Validates actions before execution | Blocks invalid/unsafe operations |
| **Policy FSM** | Governs risk-based actions | Enforces approval workflows |
| **Memory HipCortex** | Stores state with snapshots | Enables rollback & audit |
| **World Model** | Tracks causal relationships | Predicts action outcomes |
| **Agent Studio** | Visual agent builder | No-code agent creation |

## 🎯 Common Tasks

### Create an Agent
1. Open Agent Studio: `http://localhost:3000/agent-studio.html`
2. Click "Generate New Agent"
3. Fill in: Name, Description, Risk Profile, Capabilities
4. Click "Generate Blueprint"
5. Review, Simulate, Deploy

### Execute a Workflow
```bash
# Via CLI
aureus run workflow.yaml --tenant-id my-tenant

# Via API
curl -X POST http://localhost:3000/api/workflows/execute \
  -H "Content-Type: application/json" \
  -d '{"workflowId": "...", "tenantId": "..."}'

# Via Python SDK
from aureus_sdk import AureusClient
client = AureusClient("http://localhost:3000")
result = client.workflows.execute(workflow_id, tenant_id)
```

### Monitor Execution
- **Console**: http://localhost:3000/monitoring.html
- **Grafana**: http://localhost:3001
- **Prometheus**: http://localhost:9090
- **Logs**: `docker-compose logs -f console`

### Rollback to Snapshot
```typescript
import { HipCortex } from '@aureus/memory-hipcortex';

const hipCortex = new HipCortex();
const snapshots = await hipCortex.listSnapshots(agentId);
await hipCortex.restoreSnapshot(snapshots[0].id);
```

## 🐛 Troubleshooting

| Problem | Solution |
|---------|----------|
| **Containers won't start** | Check Docker is running, ports available (3000, 5432, 6379) |
| **"No API key" errors** | Set `OPENAI_API_KEY` or `LLM_MOCK_FALLBACK=true` |
| **Database errors** | Wait 30s for PostgreSQL init, check `DB_PASSWORD` |
| **Permission denied (Linux)** | `chmod +x scripts/*.sh` |
| **Kubernetes pods pending** | Check PVC binding, storage class available |

## 📞 Support Channels

| Type | Channel | Response Time |
|------|---------|---------------|
| **Beta Support** | beta@aureus.ai | 48 hours |
| **Bug Reports** | GitHub Issues | Variable |
| **General Questions** | support@aureus.ai | 3-5 days |
| **Office Hours** | Bi-weekly (beta) | Live |

## 🗺️ Project Status

- **Core Features**: ✅ Production-ready
- **Docker Compose**: ✅ Production-ready
- **Kubernetes**: ⚠️ Beta (Week 6-8)
- **Beta Program**: ✅ Open for applications
- **General Availability**: Q2 2026

## 🔗 Important Links

- **Main README**: [../README.md](../README.md)
- **Architecture**: [../architecture.md](../architecture.md)
- **Roadmap**: [../roadmap.md](../roadmap.md)
- **Changelog**: [../CHANGELOG.md](../CHANGELOG.md)
- **Examples**: [../examples/](../examples/)
- **Beta Program**: [beta/overview.md](./beta/overview.md)

## 📦 Package Quick Reference

| Package | Purpose | Key Classes |
|---------|---------|-------------|
| `@aureus/kernel` | Orchestration | WorkflowOrchestrator, AgentLifecycleManager |
| `@aureus/crv` | Validation | CRVGate, Validators |
| `@aureus/policy` | Governance | GoalGuardFSM, RiskTier |
| `@aureus/memory-hipcortex` | Memory | HipCortex, SnapshotManager |
| `@aureus/world-model` | State | WorldModel, DoGraph |
| `@aureus/tools` | Tool adapters | SafeToolWrapper, ToolRegistry |
| `@aureus/observability` | Monitoring | TelemetryCollector, MetricsExporter |

## 🎓 Learning Path

**Day 1**: Installation + First Agent
1. [Quick Start](../demo-deployment/QUICKSTART.md) (30 min)
2. [Beta Onboarding](./beta/onboarding.md) (30 min)
3. Create your first agent (15 min)

**Day 2**: Architecture Understanding
1. Read [Architecture](../architecture.md) (45 min)
2. Read [Solution](../solution.md) (30 min)
3. Explore code examples (30 min)

**Week 1**: Hands-on Practice
1. Build custom agent for your use case
2. Test CRV validation
3. Configure policies
4. Set up monitoring

**Week 2+**: Production Readiness
1. Deploy to staging
2. Test rollback procedures
3. Configure production settings
4. Plan Kubernetes migration

---

**Need help?** Check [docs/README.md](./README.md) for comprehensive documentation index.
