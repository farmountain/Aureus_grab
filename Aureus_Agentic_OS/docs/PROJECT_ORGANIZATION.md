# Project Organization Guide

This document describes the organizational structure of the Aureus Agentic OS repository.

## Directory Structure

```
Aureus_Agentic_OS/
├── apps/                          # Application code
│   ├── console/                   # Operator console (API + UI)
│   └── demo-scenarios/            # Demo implementations
│
├── packages/                      # Core packages (monorepo)
│   ├── kernel/                    # Orchestration engine
│   ├── crv/                       # Circuit Reasoning Validation
│   ├── policy/                    # Goal-Guard FSM
│   ├── memory-hipcortex/          # Memory engine
│   ├── world-model/               # Causal world model
│   ├── tools/                     # Tool adapters
│   ├── observability/             # Telemetry & metrics
│   ├── perception/                # Perception pipeline
│   ├── hypothesis/                # Hypothesis management
│   ├── reflexion/                 # Self-healing
│   ├── benchright/                # Quality evaluation
│   ├── robotics/                  # Robotics safety
│   ├── evaluation-harness/        # Success evaluation
│   ├── sdk/                       # TypeScript SDK
│   └── sdk-python/                # Python SDK
│
├── docs/                          # Documentation
│   ├── README.md                  # Documentation index
│   ├── architecture/              # System design docs
│   ├── implementation/            # Component implementation guides
│   ├── guides/                    # User guides
│   ├── deployment/                # Deployment & operations
│   └── beta/                      # Beta program resources
│
├── infrastructure/                # Infrastructure as Code
│   ├── kubernetes/                # K8s manifests
│   │   ├── base/                  # Base configurations
│   │   └── overlays/              # Environment-specific overlays
│   ├── docker/                    # Dockerfiles
│   └── terraform/                 # Cloud provisioning
│
├── demo-deployment/               # Interactive demo environment
│   ├── docker-compose.yml         # Multi-service orchestration
│   ├── QUICKSTART.md              # 5-minute demo setup
│   └── scripts/                   # Demo automation scripts
│
├── scripts/                       # Utility scripts
│   ├── backup-state.sh            # State backup
│   ├── restore-state.sh           # State restoration
│   └── README.md                  # Scripts documentation
│
├── ops/                           # Operational tools
│   ├── health-checks/             # Health check implementations
│   ├── rollback/                  # Rollback procedures
│   └── verification/              # System verification
│
├── tests/                         # Integration & chaos tests
│   ├── integration/               # Cross-package integration
│   └── chaos/                     # Chaos engineering tests
│
├── examples/                      # Code examples
│
├── .github/                       # GitHub workflows
│   └── workflows/                 # CI/CD pipelines
│
├── README.md                      # Main project README
├── roadmap.md                     # Development roadmap
├── CHANGELOG.md                   # Version history
├── package.json                   # Workspace configuration
└── tsconfig.json                  # TypeScript configuration
```

## File Naming Conventions

### Documentation Files

- **Architecture docs**: `architecture.md`, `solution.md`, `VISUAL_GUIDE.md`
- **Implementation docs**: `[COMPONENT]_IMPLEMENTATION_SUMMARY.md`
- **Guides**: `[topic]-guide.md` or `[topic].md`
- **Deployment docs**: `deployment.md`, `kubernetes.md`, etc.

### Code Files

- **TypeScript**: `kebab-case.ts` (e.g., `workflow-orchestrator.ts`)
- **Tests**: `*.test.ts` for unit tests, descriptive names for integration
- **Config**: `*.config.ts` or `*.config.js`

### Scripts

- **Bash scripts**: `kebab-case.sh` (e.g., `backup-state.sh`)
- **Node scripts**: `kebab-case.js` or `.ts`

## Documentation Organization Principles

### 1. Separation of Concerns
- **Architecture** (what & why): High-level design, invariants, theory
- **Implementation** (how): Detailed technical implementation
- **Guides** (doing): Step-by-step user instructions
- **Deployment** (running): Operations and production setup

### 2. Progressive Disclosure
- Start with README → Quick Start → Detailed Guides
- Each doc links to related docs for deeper dives

### 3. Single Source of Truth
- No duplicate documentation
- Cross-reference related content
- Keep index files updated

### 4. Versioning
- Documentation lives in version control
- Track changes via Git history
- Tag docs with version numbers when applicable

## Migration Notes

The following files were reorganized into structured directories:

### Moved to `docs/architecture/`:
- `architecture.md`
- `solution.md`
- `VISUAL_GUIDE.md`

### Moved to `docs/implementation/`:
- All `*_IMPLEMENTATION_SUMMARY.md` files
- All `*_IMPLEMENTATION.md` files
- Component-specific guides

### Already in correct location:
- Package-specific docs remain in `packages/[name]/docs/`
- Demo-specific docs remain in `demo-deployment/`
- Operations docs remain in `ops/`

### Created new structure:
- `docs/beta/` - Beta program resources
- `infrastructure/kubernetes/` - K8s manifests

## Maintenance

### Adding New Documentation

1. Determine the category (architecture/implementation/guide/deployment)
2. Place in appropriate directory
3. Update `docs/README.md` index
4. Add cross-references from related docs
5. Update main `README.md` if it's a primary resource

### Deprecating Documentation

1. Add deprecation notice at top of file
2. Link to replacement documentation
3. After 1 release cycle, move to `docs/archive/`
4. Remove from indexes

### Regular Review

- Quarterly: Review all docs for accuracy
- Before releases: Update version numbers and links
- After major features: Update architecture docs

## Best Practices

1. **Use relative links** for internal documentation
2. **Include code examples** in guides
3. **Add table of contents** for docs >100 lines
4. **Keep examples up-to-date** with current APIs
5. **Write for your audience** (technical vs. non-technical)
6. **Test deployment instructions** before publishing

---

**Last Updated**: January 31, 2026
