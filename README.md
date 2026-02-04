# Aureus-Sentinel — Aureus + OpenClaw Integration

An integration of [OpenClaw](https://github.com/openclaw) (previously Moltbot) with [Aureus Agentic OS™](https://github.com/aureus) providing enterprise security enhancement and governance for AI agent actions through cryptographic signing and policy-based approval gates.

## Overview

**Aureus-Sentinel** orchestrates the integration between:
- **OpenClaw** (Body) — Multi-channel AI agent platform (Telegram, Discord, Slack, Web)
- **Aureus Agentic OS™** (Constitutional Brain) — Policy engine, risk assessment, audit trail, memory
- **Bridge** — Signed-plan protocol enforcing cryptographic approval before action execution

### Architecture

```
┌─────────────────┐         ┌──────────────────┐         ┌─────────────────┐
│   OpenClaw      │         │      Bridge      │         │  Aureus Agentic │
│   (Channels)    │────────▶│  (Signer Service)│────────▶│      OS         │
│                 │  Intent │                  │  Policy │  (Policy Engine)│
│ • Telegram      │         │ • ed25519 Signing│  Eval   │                 │
│ • Discord       │         │ • TTL Enforcement│         │ • Risk Assessment│
│ • Slack         │         │ • KMS Integration│         │ • Memory Engine  │
│ • Web/API       │         │                  │         │ • Audit Trail    │
└─────────────────┘         └──────────────────┘         └─────────────────┘
         │                            │
         │         Signed Approval    │
         └────────────────────────────┘
                   │
                   ▼
         ┌─────────────────────┐
         │  Executor Wrapper   │
         │  (Validates Sig)    │
         │  • Signature Verify │
         │  • TTL Check        │
         │  • Human Approval   │
         │  • Audit Log        │
         └─────────────────────┘
```

## Features

✅ **Contract-First Integration** — JSON Schema contracts (v1) for intent, context, plan, approval, report  
✅ **Cryptographic Signing** — ed25519 signatures with TTL enforcement  
✅ **Policy-Based Approval** — Risk assessment determines human approval requirements  
✅ **Executor Wrapper** — Signature validation before tool execution  
✅ **Multi-Channel Support** — Telegram, Discord, Slack, Web, API  
✅ **Audit Trail** — Tamper-proof execution logs  
✅ **KMS Integration** — AWS KMS adapter for production key management  
✅ **Evidence-Gated SDLC** — CI enforces evidence files on all PRs

## Quick Start

### Installation

**Fastest way to get started:**

```bash
# Install CLI globally
npm install -g @aureus-sentinel/cli

# Test connectivity (starts a Bridge server if not running)
aureus test

# Or use Docker
docker run -p 3000:3000 ghcr.io/farmountain/aureus-bridge:latest
```

**For developers:**

```bash
# Install SDK in your project
npm install @aureus-sentinel/bridge-client
```

**From source:**

```bash
# Clone repository
git clone https://github.com/farmountain/Aureus-Sentinel.git
cd Aureus-Sentinel

# Install dependencies
cd Aureus-Sentinel/bridge
npm install

# Start bridge
node server.js
```

See [INSTALLATION.md](docs/INSTALLATION.md) for complete installation instructions (Windows, macOS, Linux, Docker, Kubernetes).

### Running the Bridge

```bash
# Development (ephemeral keys)
cd Aureus-Sentinel/bridge
node server.js

# Production (with KMS)
USE_KMS=true \
KMS_KEY_ARN=arn:aws:kms:us-east-1:123456789:key/... \
node server.js

# Docker
docker run -p 3000:3000 ghcr.io/farmountain/aureus-bridge:latest

# Docker Compose
docker-compose up -d

# Kubernetes
kubectl apply -f k8s/ -n aureus
```

The bridge will:
1. Generate ephemeral ed25519 keypair (dev) or load from KMS (prod)
2. Print `PUBLIC_KEY_BASE64:` to stdout
3. Listen on `http://localhost:3000/sign` for approval requests

### Quick Start Scripts

**Linux/macOS:**
```bash
curl -sL https://raw.githubusercontent.com/farmountain/Aureus-Sentinel/main/scripts/install.sh | bash
```

**Windows PowerShell:**
```powershell
iwr -useb https://raw.githubusercontent.com/farmountain/Aureus-Sentinel/main/scripts/install.ps1 | iex
```

### Integration with OpenClaw

See [docs/week-04-session-pack.md](docs/week-04-session-pack.md) for detailed OpenClaw integration guide.

## Repository Structure

```
Aureus-Sentinel/     # Orchestration repo
├── contracts/v1/             # JSON Schema contracts
│   ├── intent.schema.json
│   ├── context.schema.json
│   ├── plan.schema.json
│   ├── approval.schema.json
│   └── report.schema.json
├── bridge/                   # Signer service
│   ├── server.js             # HTTP server
│   ├── signer.js             # ed25519 signing/verification
│   └── kms/                  # KMS adapters
│       └── aws_kms_adapter.js
├── tests/                    # Test suite
│   ├── schema-test-runner.js
│   ├── signer.test.js
│   ├── integration.test.js
│   ├── executor_wrapper.test.js
│   └── aws_kms_adapter.test.js
├── docs/                     # Documentation
│   ├── architecture/
│   ├── evidence/             # Evidence files (Week 1, 2, ...)
│   └── executor_wrapper_reference.js
└── ci/                       # CI workflows

openclaw/                     # OpenClaw integration layer
├── src/
│   ├── telegram/
│   │   └── bridge-adapter.js  # Telegram adapter
│   ├── discord/
│   │   └── bridge-adapter.js  # Discord adapter
│   └── executor/
│       └── executor-wrapper.js # Signature enforcement
├── tests/
│   └── e2e-flow.test.js      # E2E integration tests
└── package.json

docs/                         # Project documentation
├── PRD_Aureus_Project.md     # Product requirements
├── Requirements_Aureus.md    # Acceptance criteria
├── architecture_overview.md  # System architecture
├── key_management_and_kms.md # Key management guide
├── week-01-session-pack.md   # Week 1 execution guide
├── week-02-session-pack.md   # Week 2 execution guide
└── ...

openspec/                     # OpenSpec proposals
├── config.yaml
├── specs/
│   └── aureus-openclaw.spec.md
└── changes/
    ├── week-01-scaffold/
    ├── week-02-contract-hardening/
    └── ...

.github/
├── workflows/
│   ├── ci.yml
│   └── week1-evidence-gate.yml  # Evidence enforcement
├── PULL_REQUEST_TEMPLATE.md
└── copilot-instructions.md
```

## Development Roadmap

**Week 1** ✅ — Foundation scaffold, contracts, signer PoC, CI evidence gate  
**Week 2** ✅ — Contract hardening with validation rules  
**Week 3** ✅ — Policy engine integration, risk assessment logic  
**Week 4** ✅ — OpenClaw channel adapters (Telegram, Discord)  
**Week 5** ✅ — Context engine + memory integration  
**Week 6** ✅ — Audit trail + observability  
**Week 7** ✅ — KMS production integration  
**Week 8** ✅ — Red team security audit  
**Week 9** ✅ — Reliability + error handling  
**Week 10** ✅ — Performance + load testing  
**Week 11** ✅ — Documentation + developer experience  
**Week 12** ✅ — Packaging + release automation  
**Week 13** ✅ — Pilot deployment + monitoring  
**Week 14** ✅ — Executive readiness + handoff

See [Aureus-Sentinel/docs/implementation_backlog.md](Aureus-Sentinel/docs/implementation_backlog.md) for detailed roadmap.

## Installation & Deployment

- **[Installation Guide](docs/INSTALLATION.md)** — Complete installation instructions for all platforms
  - npm installation (CLI and SDK)
  - Docker installation (single container and compose)
  - Manual installation from source
  - Platform-specific guides (Windows, macOS, Linux)
  - Quick start scripts (automated installation)
  - Kubernetes deployment (production-ready manifests)

## Documentation

### Getting Started
- **[Installation Guide](docs/INSTALLATION.md)** — Installation for all platforms
- **[Getting Started](Aureus-Sentinel/docs/GETTING_STARTED.md)** — First steps and tutorials
- **[API Reference](Aureus-Sentinel/docs/API_REFERENCE.md)** — Complete API documentation

### SDK & CLI
- **[SDK Documentation](Aureus-Sentinel/sdk/README.md)** — TypeScript SDK for Bridge integration
- **[CLI Documentation](Aureus-Sentinel/cli/README.md)** — Command-line tool for testing and dev

### Architecture & Design
- **[PRD](docs/PRD_Aureus_Project.md)** — Product requirements and success metrics
- **[Requirements](docs/Requirements_Aureus.md)** — Functional and non-functional requirements
- **[Architecture Overview](docs/architecture_overview.md)** — System design and interfaces
- **[Architecture Diagrams](Aureus-Sentinel/docs/architecture/)** — Component and sequence diagrams
- **[Key Management Guide](docs/key_management_and_kms.md)** — KMS integration and rotation

### Operations
- **[Troubleshooting Guide](Aureus-Sentinel/docs/TROUBLESHOOTING.md)** — Common issues and solutions
- **[Performance Testing](Aureus-Sentinel/performance/README.md)** — Load testing and benchmarks
- **[Kubernetes Deployment](k8s/README.md)** — Production Kubernetes setup

### Development
- **[Executor Wrapper Reference](Aureus-Sentinel/docs/executor_wrapper_reference.js)** — Enforcement implementation
- **[Examples](Aureus-Sentinel/examples/)** — Code examples and tutorials
- **[Session Packs](docs/)** — Week-by-week execution guides

## Testing

All tests passing:

```bash
# Schema validation
node Aureus-Sentinel/tests/schema-test-runner.js
# OK: All 5 schemas valid

# Signer unit tests
node Aureus-Sentinel/tests/signer.test.js
# OK: Valid signature verified
# OK: Tampered payload detected
# OK: Expired approval logic

# Integration tests
node Aureus-Sentinel/tests/integration.test.js
# OK: Bridge sign + verify

# Executor wrapper tests
node Aureus-Sentinel/tests/executor_wrapper.test.js
# OK: Low-risk allowed
# OK: High-risk rejected without approval
# OK: Expired approval rejected
```

## Contributing

This project follows **Evidence-Gated Development**:
1. All PRs must include evidence file in `Aureus-Sentinel/docs/evidence/`
2. CI enforces evidence presence and test passage
3. See [.github/PULL_REQUEST_TEMPLATE.md](.github/PULL_REQUEST_TEMPLATE.md)

## Security

- **Ephemeral Keys (Dev)**: Generated on startup, not persisted
- **KMS (Production)**: Use AWS KMS for private key management
- **TTL Enforcement**: Approvals expire after configured duration (default: 5 minutes)
- **Signature Verification**: Executor validates signatures before tool execution
- **Audit Trail**: All actions logged with cryptographic proof

Report security issues to: [farmountain/Aureus-Sentinel/security](https://github.com/farmountain/Aureus-Sentinel/security)

## License

MIT License — See [LICENSE](LICENSE)

## Links

- **GitHub**: https://github.com/farmountain/Aureus-Sentinel
- **OpenClaw**: https://github.com/openclaw
- **Aureus Agentic OS™**: https://github.com/aureus
- **OpenSpec**: [openspec/specs/aureus-openclaw.spec.md](openspec/specs/aureus-openclaw.spec.md)

---

**Status**: Week 12 Complete — Packaging & Release Automation ✅  
**Latest Release**: v1.0.0 Ready for Production

### Installation
```bash
# Get started in seconds
npm install -g @aureus-sentinel/cli
aureus test

# Or with Docker
docker run -p 3000:3000 ghcr.io/farmountain/aureus-bridge:latest
```

See [INSTALLATION.md](docs/INSTALLATION.md) for more options.
