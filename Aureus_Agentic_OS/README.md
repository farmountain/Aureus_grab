# Aureus Agentic OS

> **Production-Grade AI Agent Orchestration Platform**  
> Reliable execution through durable orchestration, verified reasoning (CRV), causal world models, and auditable memory with rollback.

[![Version](https://img.shields.io/badge/version-1.0.0--beta-blue)](./VERSION)
[![License](https://img.shields.io/badge/license-MIT-green)](./LICENSE)
[![Beta Program](https://img.shields.io/badge/beta-accepting_applications-orange)](./docs/beta/overview.md)

**Aureus** (Agentic Unified Reliability & Execution Under Steering) enables controlled autonomy—AI agents that can act in real systems safely, transparently, and at enterprise scale.

## 🎯 Quick Links

| For... | Start Here |
|--------|------------|
| **First-time users** | [5-Minute Quick Start](./demo-deployment/QUICKSTART.md) |
| **Beta participants** | [Beta Onboarding Guide](./docs/beta/onboarding.md) |
| **Production deployment** | [Docker Compose](./demo-deployment/) \| [Kubernetes](./infrastructure/kubernetes/) |
| **Developers** | [Installation Guide](./docs/installation.md) \| [API Docs](./docs/) |
| **Architecture deep-dive** | [Architecture Overview](./architecture.md) \| [Solution Design](./solution.md) |

## 📋 Table of Contents

- [Features](#features)
- [Quick Start](#quick-start)
- [Deployment Options](#deployment-options)
- [Documentation](#documentation)
- [Beta Program](#beta-program)
- [Project Structure](#project-structure)
- [Contributing](#contributing)

## ✨ Features

### Core Capabilities

- **Durable Orchestration**: DAG/FSM-based workflow execution with automatic persistence and resume
- **Circuit Reasoning Validation (CRV)**: Validation gates that block invalid commits before they affect the system
- **Goal-Guard FSM**: Policy-based governance that gates risky actions based on risk tiers
- **Memory HipCortex**: Temporal indexing, snapshots, and audit logs with rollback capability
- **World Model**: Causal state management with do-graph and constraint validation
- **Observability**: Comprehensive telemetry, metrics, and distributed tracing
- **Evaluation Harness**: Success criteria per task type with automated evaluation and reporting
- **Enhanced Error Handling**: Detailed error messages with actionable remediation guidance
- **Agent Studio**: Visual agent builder with AI-assisted generation, validation, simulation, and deployment

### Non-negotiable Invariants

1. **Durability**: Workflows resume from persisted state after failures
2. **Idempotency**: Retries don't duplicate side effects
3. **Verification**: CRV gates block invalid commits
4. **Governance**: Goal-Guard FSM gates risky actions
5. **Auditability**: All actions and state diffs are logged and traceable
6. **Rollback**: Safe restore to last verified snapshot

## 🚀 Quick Start

### Option 1: Docker Compose (Recommended for Testing)

```bash
# Clone and navigate
git clone https://github.com/aureus/Aureus_Agentic_OS.git
cd Aureus_Agentic_OS/demo-deployment

# Configure (takes 2 minutes)
cp .env.example .env
# Edit .env with your settings (DB password, JWT secret, optionally OpenAI key)

# Start all services
doc🏗️ Deployment Options

### Docker Compose (Production-Ready)
**Status**: ✅ **Production-ready** for on-premise/private cloud  
**Best for**: SMBs, on-premise deployments, single-node setups

- Multi-service orchestration (Console, PostgreSQL, Redis, Prometheus, Grafana)
- Health checks and auto-restart
- Volume persistence for data and logs
- Comprehensive configuration via `.env`

**Deploy**: See [demo-deployment/](./demo-deployment/)

### Kubernetes (Coming Week 6-8 of Beta)
**Status**: ⚠️ **Beta** - Manifests available, testing in progress  
**Best for**: Enterprise cloud deployments, multi-node clusters

- StatefulSets for PostgreSQL
- Horizontal pod autoscaling
- Ingress with TLS
- Network policies
- Multi-environment support (dev/staging/prod)

**Deploy**: See [infrastructure/kubernetes/](./infrastructure/kubernetes/)

### Production Configuration

# Access console
open http://localhost:3000
```

**Full guide**: [Demo Deployment Quick Start](./demo-deployment/QUICKSTART.md)

### Option 2: Development Setup

```bash
# Install dependencies
npm install

# Build all packages
npm run build

# Run tests
npm test

# Start development console
cd apps/console
npm run dev
```

**Full guide**: [Installation Guide](./docs/installation.md)

## Production Profile

Production-grade durability and auditability require a persistent `StateStore` plus persistent memory/audit stores, a real LLM provider, and sandbox execution enabled.

**CLI example (durable state + persistent event logs):**

```📚 Documentation

**Comprehensive docs available at**: [docs/](./docs/)

### By Topic

- **Getting Started**: [Installation](./docs/installation.md) | [Quick Start](./demo-deployment/QUICKSTART.md)
- **Architecture**: [Overview](./architecture.md) | [Solution Design](./solution.md) | [Visual Guide](./VISUAL_GUIDE.md)
- **User Guides**: [Policy Configuration](./docs/policy-guide.md) | [Memory](./docs/memory-quick-start.md) | [Python SDK](./docs/sdk-python-usage.md)
- **Deployment**: [Docker Compose](./demo-deployment/) | [Kubernetes](./infrastructure/kubernetes/) | [Production Readiness](./docs/production_readiness.md)
- **Operations**: [Monitoring](./docs/monitoring-and-alerting.md) | [DevOps](./docs/devops.md) | [Security](./docs/security_model.md)
- **Implementation Details**: See [docs/](./docs/) for 20+ component implementation guides

### Documentation Index

See **[docs/README.md](./docs/README.md)** for complete documentation index with navigation.

## 🎓 Beta Program

**Technical Beta is Now Open!** 

We're accepting 10-15 technical users to evaluate Aureus in production-like environments.

**✅ What's Included**:
- Full platform access (Docker Compose deployment)
- All core features: Orchestration, CRV, Policy, Memory, Observability
- Python SDK + TypeScript SDK
- Email support + bi-weekly office hours
- Direct feedback channel to engineering team

**📅 Timeline**: 8-12 weeks (February - April 2026)  
**💰 Cost**: Free for beta participants  
**🎁 Benefits**: $5K service credits, early access, roadmap influence

**Apply Now**: [Beta Program Overview](./docs/beta/overview.md) | [Onboarding Guide](./docs/beta/onboarding.md)

## 📁 Project
aureus run workflow.yaml \
  --state-store-type postgres \
  --event-log-dir /var/log/aureus/events
```

**Environment example (durable state, persistent memory/audit, real LLM, sandbox):**

```bash
export NODE_ENV=production
export STATE_STORE_TYPE=postgres
export DATABASE_URL="postgresql://aureus:your-password@db.example.com:5432/aureus"
export EVENT_LOG_DIR="/var/log/aureus/events"

# Real LLM provider
export LLM_PROVIDER="openai"
export LLM_MODEL="gpt-4"
export OPENAI_API_KEY="sk-..."

# Sandbox execution
export ENABLE_SANDBOX="true"
```

**Memory & audit persistence**: configure `HipCortex` with `PostgresMemoryStore` and `PostgresAuditLog` so memory entries and audit trails persist in the same PostgreSQL instance. See [`docs/persistence.md`](./docs/persistence.md) for wiring details.

## Package Structure

- `packages/kernel`: Orchestration runtime with DAG/FSM, retries, and idempotency
- `packages/hypothesis`: Hypothesis branching and evaluation for goal-driven reasoning with CRV validation
- `packages/policy`: Goal-guard FSM with permission model and risk tiers
- `packages/crv`: Circuit reasoning validation operators and gates
- `packages/memory-hipcortex`: Temporal index, snapshots, audit log, and rollback
- `packages/world-model`: State store with do-graph and constraints
- `packages/tools`: Tool adapters with safety wrappers
- `packages/observability`: Telemetry, metrics, and traces
- `packages/evaluation-harness`: Success criteria evaluation and metrics reporting
- `packages/benchright`: Benchmark evaluation for execution traces with output quality, reasoning coherence, cost/value, hypothesis switching, and counterfactual analysis
- `packages/sdk`: Developer SDK for building agent applications
- `packages/sdk-python`: Python SDK with client bindings for workflow execution, CRV, policy evaluation, and observability
- `apps/console`: Operator console with API and CLI for monitoring and control

## Usage Example

```typescript
import { WorkflowOrchestrator, InMemoryStateStore, HypothesisManager } from '@aureus/kernel';
import { GoalGuardFSM, RiskTier } from '@aureus/policy';
import { CRVGate, Validators } from '@aureus/crv';
import { HipCortex } from '@aureus/memory-hipcortex';

// Create components
const stateStore = new InMemoryStateStore();
const hipCortex = new HipCortex();
const goalGuard = new GoalGuardFSM();

// Setup CRV gate for validation
const crvGate = new CRVGate({
  name: 'State Validation',
  validators: [
    Validators.notNull(),
    Validators.schema({ value: 'number' }),
  ],
  blockOnFailure: true,
});

// Create hypothesis manager for goal-driven reasoning
const hypothesisManager = new HypothesisManager({
  maxConcurrentHypotheses: 5,
  scoringCriteria: {
    confidenceWeight: 0.3,
    costWeight: 0.2,
    riskWeight: 0.3,
    goalAlignmentWeight: 0.2,
  },
  minAcceptableScore: 0.6,
  autoPrune: true,
  enableTelemetry: true,
});

// Define and execute workflow with hypothesis support
const orchestrator = new WorkflowOrchestrator(
  stateStore, 
  executor,
  undefined,
  undefined,
  undefined,
  undefined,
  crvGate,
  goalGuard,
  undefined,
  undefined,
  undefined,
  hypothesisManager
);
const result = await orchestrator.executeWorkflow(spec);

// Use hypothesis manager to explore multiple solution approaches
hypothesisManager.registerGoal({
  id: 'optimize-workflow',
  description: 'Optimize workflow execution',
  successCriteria: [{
    id: 'sc-1',
    description: 'Execution time < 5 seconds',
    validator: (state) => state.executionTime < 5000,
    weight: 1.0,
  }],
});

// Create and evaluate multiple hypothesis branches
const hyp1 = await hypothesisManager.createHypothesis(
  'optimize-workflow',
  'Approach 1: Parallel execution',
  []
);

const hyp2 = await hypothesisManager.createHypothesis(
  'optimize-workflow',
  'Approach 2: Caching',
  []
);

// Evaluate with CRV validation
await hypothesisManager.evaluateHypothesis(hyp1.id, {
  executeActions: true,
  validateWithCRV: true,
});

await hypothesisManager.evaluateHypothesis(hyp2.id, {
  executeActions: true,
  validateWithCRV: true,
});

// Get best hypothesis and merge
const topHypotheses = hypothesisManager.getTopHypotheses('optimize-workflow', 1);
if (topHypotheses.length > 0) {
  await hypothesisManager.mergeHypothesis(topHypotheses[0].id);
}
```

## Operator Console

The Aureus Console provides monitoring and control capabilities for workflows:

- **API Server**: REST API for monitoring workflows and controlling actions
- **CLI Interface**: Command-line tool for viewing workflow status and events
- **Authentication**: JWT-based authentication with basic username/password
- **Real-time Monitoring**: View running tasks, CRV status, policy status
- **Action Control**: Approve/deny gated actions, trigger rollbacks
- **Audit Logs**: View complete timeline and event history
- **Agent Studio**: Visual agent builder with AI-assisted generation

See [apps/console/README.md](./apps/console/README.md) for usage details and the [Agent DevOps Guide](./docs/agent-devops.md) for lifecycle, approvals, and rollback workflows.

## Agent Studio

The Agent Studio is a comprehensive platform for designing, validating, and deploying AI agents with confidence:

### Features

- **AI-Assisted Generation**: Natural language goal → structured agent blueprint
- **Visual Configuration**: Interactive wizard for tool selection, policy configuration, and risk profiling
- **Validation & Simulation**: Test agents in sandbox environments before deployment
- **Deployment Pipeline**: Stage → Approve → Promote workflow with rollback support

### Agent Blueprint Schema

An agent blueprint defines:

- **Goal & Configuration**: Agent's objective, LLM settings (prompt, temperature, model)
- **Tools**: Available tools with permissions and risk tiers
- **Policies**: Safety policies and governance rules
- **Workflows**: Executable workflows the agent can trigger
- **Constraints**: Operational limits and guardrails
- **Success Criteria**: Metrics for evaluating agent performance

### Usage

#### Web UI

Access the Agent Studio at `http://localhost:3000/agent-studio` when running the console:

```bash
cd apps/console
npm run dev
```

Navigate through the 5-step wizard:
1. Define agent goal and risk profile
2. Select tools and capabilities
3. Configure policies and guardrails
4. Generate and validate agent blueprint
5. Deploy to target environment

#### API Endpoints

**Generate Agent Blueprint:**
```bash
POST /api/agents/generate
{
  "goal": "Monitor system logs and alert on critical errors",
  "riskProfile": "MEDIUM",
  "preferredTools": ["http-client", "email-sender"],
  "policyRequirements": ["Rate limiting", "Approval for alerts"]
}
```

**Validate Agent:**
```bash
POST /api/agents/validate
{
  "blueprint": { ... }
}
```

**Simulate Agent:**
```bash
POST /api/agents/simulate
{
  "blueprint": { ... },
  "testScenario": {
    "description": "Test log monitoring",
    "inputs": { "logFile": "system.log" }
  },
  "dryRun": true
}
```

**Deploy Agent:**
```bash
POST /api/agents/deploy
{
  "blueprint": { ... },
  "environment": "staging",
  "approvalRequired": true
}
```

#### Programmatic Usage

```typescript
import { AgentBuilder } from '@aureus/console';
import { validateAgentBlueprint } from '@aureus/kernel';

const builder = new AgentBuilder(eventLog);

// Generate agent
const result = await builder.generateAgent({
  goal: "Monitor API health and alert on failures",
  riskProfile: "MEDIUM",
  preferredTools: ["http-client", "email-sender"],
  constraints: ["Read-only access", "Max 10 requests/minute"]
});

// Validate
const validation = await builder.validateAgent(result.blueprint);
if (!validation.valid) {
  console.error("Validation issues:", validation.issues);
}

// Blueprint is ready for deployment
console.log("Agent ID:", result.blueprint.id);
```

### Example Agent Blueprint

```json
{
  "id": "agent-monitor-001",
  "name": "API Health Monitor Agent",
  "version": "1.0.0",
  "goal": "Monitor API endpoints and alert on failures",
  "riskProfile": "MEDIUM",
  "config": {
    "prompt": "You are an API monitoring agent...",
    "temperature": 0.5,
    "model": "gpt-4"
  },
  "tools": [
    {
      "toolId": "http-client",
      "name": "HTTP Client",
      "enabled": true,
      "permissions": ["read"],
      "riskTier": "LOW"
    },
    {
      "toolId": "email-sender",
      "name": "Email Sender",
      "enabled": true,
      "permissions": ["write"],
      "riskTier": "MEDIUM"
    }
  ],
  "policies": [
    {
      "policyId": "rate-limit",
      "name": "Rate Limiting",
      "enabled": true,
      "rules": [
        {
          "type": "rate_limit",
          "parameters": { "maxActionsPerMinute": 60 }
        }
      ]
    }
  ],
  "workflows": [
    {
      "workflowId": "monitor-workflow",
      "name": "Health Check Workflow",
      "triggerConditions": ["scheduled", "on_demand"]
    }
  ],
  "successCriteria": [
    "All endpoints checked successfully",
    "Alerts sent for failures",
    "No policy violations"
  ]
}
```

## Demo Scenarios

Reproducible scenarios demonstrating Aureus capabilities end-to-end:

### Bank Credit Reconciliation

A complete demonstration of a bank credit reconciliation workflow that showcases all core components working together. This scenario:

- Extracts schemas from DDL files
- Validates field mappings using CRV
- Performs batch reconciliation checks
- Generates comprehensive reports with audit trails

**Run the scenario:**

```bash
cd apps/demo-scenarios/bank-credit-recon
npm install
npm run build
npm start
```

**Run tests:**

```bash
npm test
```

**Generated outputs:**
- `recon_report.md` - Detailed reconciliation report with schema analysis and results
- `audit_timeline.md` - Complete audit trail of all actions
- `reliability_metrics.json` - Performance and accuracy metrics

See [apps/demo-scenarios/bank-credit-recon/README.md](./apps/demo-scenarios/bank-credit-recon/README.md) for complete documentation.

## Architecture

See [architecture.md](./architecture.md) for detailed architectural information.

## Documentation

- [Side-Effect Safety Model](./docs/side-effect-safety.md) - Idempotency, caching, and saga compensation
- [Monitoring and Alerting Guide](./docs/monitoring-and-alerting.md) - Observability, metrics, and alerting
- [Security Model & Threat Analysis](./docs/security_model.md) - Security architecture and threat model
- [Production Readiness Checklist](./docs/production_readiness.md) - Comprehensive production readiness review
- [Policy Guide](./docs/policy-guide.md) - Policy system and governance
- [Memory System](./docs/memory-quick-start.md) - Memory and provenance tracking
- [Evaluation Harness](./packages/evaluation-harness/README.md) - Success criteria and evaluation framework

## Solution

See [solution.md](./solution.md) for technical solution details.

## Roadmap

See [roadmap.md](./roadmap.md) for development roadmap.

## License

MIT
