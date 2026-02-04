# Changelog

All notable changes to Aureus Agentic OS will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-01-01

### Added

#### Core Infrastructure
- **Durable Orchestration**: DAG/FSM-based workflow execution with automatic persistence and resume
- **Circuit Reasoning Validation (CRV)**: Validation gates that block invalid commits before they affect the system
  - Operator interface with input/output schemas, invariants, and oracle checks
  - Core operators: Extract, Normalize, Compare, Decide, VerifySchema, VerifyConstraints
  - CRV Gate with configurable verification pipeline
  - Recovery strategies (retry, alternate tool, escalate)
- **Goal-Guard FSM**: Policy-based governance that gates risky actions based on risk tiers
  - Four risk tiers: LOW, MEDIUM, HIGH, CRITICAL
  - Permission system with intent and data zone support
  - Approval workflow for HIGH and CRITICAL risk actions
- **Memory HipCortex**: Temporal indexing, snapshots, and audit logs with rollback capability
  - Episodic memory with provenance tracking
  - Snapshot creation and restoration
  - Rollback to verified checkpoints
- **World Model**: Causal state management with do-graph and constraint validation
  - State store with conflict detection
  - Causal intervention tracking
  - Constraint validation engine
- **Observability**: Comprehensive telemetry, metrics, and distributed tracing
  - Task lifecycle tracking
  - Advanced metrics (success rate, MTTR, escalation rate)
  - CLI dashboard for metrics visualization

#### Non-negotiable Invariants Implemented
1. **Durability**: Workflows resume from persisted state after failures
2. **Idempotency**: Retries don't duplicate side effects
3. **Verification**: CRV gates block invalid commits
4. **Governance**: Goal-Guard FSM gates risky actions
5. **Auditability**: All actions and state diffs are logged and traceable
6. **Rollback**: Safe restore to last verified snapshot

#### Developer Tools
- **Operator Console**: API server and CLI for monitoring and control
  - JWT-based authentication
  - Real-time workflow monitoring
  - Action approval/denial
  - Rollback triggering
  - Audit log viewing
- **SDK**: TypeScript SDK for building agent applications
- **Demo Scenarios**: Bank credit reconciliation demonstration

#### Documentation
- Architecture documentation
- Solution documentation
- Policy system guide
- Side-effect safety model
- Monitoring and alerting guide
- Memory system documentation
- Reflexion policy documentation
- Production readiness checklist
- Security model and threat analysis

### Changed
- N/A (Initial release)

### Deprecated
- N/A (Initial release)

### Removed
- N/A (Initial release)

### Fixed
- N/A (Initial release)

### Security
- Security model documented with threat analysis
- Authentication and authorization controls
- Data protection strategies
- Input validation and sanitization
- Audit logging for security events

## [Unreleased]

### Planned Features
- Persistent state store (PostgreSQL/Redis)
- Python SDK
- Advanced CRV validators
- Enhanced world model constraints
- Performance optimizations
- Multi-tenancy support
- High availability setup

---

## Version History

- **0.1.0** (2026-01-01): Initial production release with all core invariants and features
