# Week 1 Pull Request — Foundation Scaffold

## Summary
This PR establishes the foundational scaffold for the Aureus + OpenClaw integration program, implementing the signed-plan protocol with cryptographic enforcement.

## Evidence File
See [aureus-openclaw-platform/docs/evidence/week-01.md](aureus-openclaw-platform/docs/evidence/week-01.md) for:
- Test results (schema, signer, integration, executor wrapper — all passing)
- Artifacts created (contracts, bridge, tests, CI workflow, docs)
- Security considerations (key management, TTL enforcement)
- Acceptance sign-off checklist

## Changes Included

### 1. Orchestration Repository Scaffold
- Created `aureus-openclaw-platform/` with organized structure:
  - `contracts/v1/` — JSON Schemas for intent, context, plan, approval, report
  - `bridge/` — Signer service with ed25519 cryptographic enforcement
  - `tests/` — Comprehensive test suite (schema, signer, integration, executor)
  - `docs/` — Architecture diagrams, evidence templates, executor wrapper reference

### 2. Contract Schemas (v1)
- **IntentEnvelope**: User intent with tool call and parameters
- **ContextSnapshot**: Session context (user, channel, history)
- **ProposedActionPlan**: Structured plan with risk assessment
- **ExecutionApproval**: Cryptographically signed approval with TTL
- **ExecutionReport**: Post-execution audit trail

All schemas enforce `additionalProperties: false` and include version/type discriminators.

### 3. Cryptographic Signer (ed25519)
- **signer.js**: Core signing/verification functions
  - `signApproval()` — Signs approval with private key
  - `verifyApproval()` — Verifies signature
  - `verifyApprovalStrict()` — Adds TTL enforcement (rejects expired)
- **server.js**: HTTP bridge service
  - `POST /sign` — Signs intents and returns approval
  - Ephemeral keypair generation for dev (KMS for production)
  - Publishes public key for integration tests

### 4. Executor Wrapper Reference
- **executor_wrapper_reference.js**: OpenClaw enforcement logic
  - Validates signature before tool execution
  - Enforces TTL (rejects expired approvals)
  - Implements human approval gates for high-risk actions
  - Provides audit trail hooks

### 5. Test Suite (All Passing)
- **schema-test-runner.js**: Validates contract schemas
- **signer.test.js**: Unit tests for signing/verification
- **integration.test.js**: E2E bridge test with public key extraction
- **executor_wrapper.test.js**: Cryptographic enforcement tests
- **aws_kms_adapter.test.js**: KMS adapter test (conditional)

### 6. CI Evidence Gate
- **week1-evidence-gate.yml**: GitHub Actions workflow
  - Enforces evidence file presence on PRs
  - Runs all tests (schema, signer, integration, executor)
  - Conditionally tests KMS adapter when secrets present
  - Fails PRs without evidence or failing tests

### 7. Documentation
- **Architecture diagrams**: Component and sequence diagrams
- **Key management guide**: KMS integration, rotation, secrets handling
- **Implementation backlog**: 14-week roadmap with epics/stories/tasks
- **Session packs**: Week 1-4 detailed, Weeks 5-14 summary
- **OpenSpec proposals**: Week 1-4, Week 8 (red team), Week 14 (exec readiness)

## Testing
Run locally:
```bash
# Schema validation
node aureus-openclaw-platform/tests/schema-test-runner.js

# Signer unit tests
node aureus-openclaw-platform/tests/signer.test.js

# Integration test (bridge + verification)
node aureus-openclaw-platform/tests/integration.test.js

# Executor wrapper enforcement tests
node aureus-openclaw-platform/tests/executor_wrapper.test.js
```

All tests passing locally ✅

## Security Considerations
- Signer uses ephemeral ed25519 keypairs (dev only)
- Production requires AWS KMS or equivalent (adapter skeleton provided)
- TTL enforcement prevents replay attacks
- High-risk actions require human approval gates
- Audit trail captures all signature events

## Breaking Changes
None — this is initial scaffold.

## Dependencies
- Node.js 18+ (native crypto for ed25519)
- AWS SDK for KMS (optional, production only)

## Rollout Plan
1. Merge Week 1 scaffold to `main`
2. Week 2: Harden contract schemas with validation rules
3. Week 3: Wire Aureus policy engine for risk assessment
4. Week 4: Integrate OpenClaw channels (Telegram, Discord)

## Reviewers
- [ ] Security: Approve key management approach and KMS adapter
- [ ] Architecture: Approve contract schemas and bridge design
- [ ] DevOps: Approve CI workflow and evidence gate
- [ ] QA: Validate test coverage and acceptance criteria

## Related
- OpenSpec Proposal: [openspec/changes/week-01-scaffold/proposal.md](openspec/changes/week-01-scaffold/proposal.md)
- PRD: [docs/PRD_Aureus_Project.md](docs/PRD_Aureus_Project.md)
- 14-Week Roadmap: [aureus-openclaw-platform/docs/implementation_backlog.md](aureus-openclaw-platform/docs/implementation_backlog.md)

---

**Acceptance Criteria** (per [week-01-session-pack.md](docs/week-01-session-pack.md)):
- [x] Repository scaffold complete with organized directory structure
- [x] Contract JSON Schemas created (5 schemas with strict validation)
- [x] Signer PoC implemented (ed25519 with TTL enforcement)
- [x] Bridge server operational (ephemeral keys + KMS routing)
- [x] Executor wrapper reference implementation complete
- [x] Test suite passing (schema, signer, integration, executor wrapper)
- [x] CI evidence-gate workflow configured
- [x] Architecture diagrams published
- [x] Key management documentation complete
- [x] Evidence file attached
