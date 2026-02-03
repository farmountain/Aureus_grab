# Evidence — Week 01: Scaffold + CI Evidence Gate

- **Title**: Week 1 scaffold, CI evidence gate, contract placeholders, signer PoC
- **Change / PR**: feature/week-01-scaffold (linked to `openspec/changes/week-01-scaffold/`)
- **Author(s)**: Development Team
- **Date**: 2026-02-03
- **Summary of change**: Created orchestration repo scaffold, added CI evidence-gate workflow, implemented contract schema placeholders, signer PoC (ed25519), bridge server, executor wrapper reference, and full test suite.

## Tests & Validation

### Schema tests
- **Status**: PASS
- **Command**: `node aureus-openclaw-platform/tests/schema-test-runner.js`
- **Output**: All 5 schemas validated (intent, context, plan, approval, report)
- **Result**: OK: all schemas have `additionalProperties: false` and required fields

### Signer unit tests
- **Status**: PASS
- **Command**: `node aureus-openclaw-platform/tests/signer.test.js`
- **Output**: 
  - OK: valid signature verified
  - OK: tampered payload detected
  - OK: signature remains valid for expired approval (expiry must be checked by caller)
- **Result**: All signer tests passed

### Integration tests (Bridge server)
- **Status**: PASS
- **Command**: `node aureus-openclaw-platform/tests/integration.test.js`
- **Output**: 
  - Bridge started with ephemeral keypair
  - PUBLIC_KEY_BASE64 emitted
  - Signature verified successfully
- **Result**: OK: integration sign+verify

### Executor wrapper tests
- **Status**: PASS
- **Command**: `node aureus-openclaw-platform/tests/executor_wrapper.test.js`
- **Output**:
  - OK: low-risk allowed without human approval
  - OK: high-risk rejected without human approval
  - OK: expired approval rejected
- **Result**: All executor wrapper tests passed

### CI workflow
- **Status**: Configured
- **Workflow**: `.github/workflows/week1-evidence-gate.yml`
- **Steps**: Evidence check, schema tests, signer tests, integration test, executor wrapper test, KMS adapter test (conditional)
- **Result**: Workflow ready for PR validation

## Threat Model / Security

- **Threat model updated**: Yes — added key management guidance in `docs/key_management_and_kms.md`
- **Secrets touched**: Yes — signer private keys (ephemeral in dev, KMS in production)
- **Details**: 
  - Signer generates ephemeral ed25519 keypair when env keys not provided
  - Production must use KMS or secret store (AWS KMS adapter skeleton added)
  - Public key published via server stdout for integration tests
  - TTL and signature verification enforced by executor wrapper

## Artifacts

- **Architecture docs**: `docs/architecture_overview.md`, `aureus-openclaw-platform/docs/architecture/`
- **Contract schemas**: `aureus-openclaw-platform/contracts/v1/*.schema.json`
- **Signer PoC**: `aureus-openclaw-platform/bridge/signer.js`, `bridge/server.js`
- **Executor wrapper**: `aureus-openclaw-platform/docs/executor_wrapper_reference.js`
- **Tests**: `aureus-openclaw-platform/tests/*.js`
- **CI logs**: (link to GitHub Actions run once PR opened)
- **Key management docs**: `docs/key_management_and_kms.md`, `docs/aws_kms_integration.md`

## Reviewer Checklist

- [x] Spec updated (`openspec/changes/week-01-scaffold/proposal.md`)
- [x] Tests added/updated (schema, signer, integration, executor wrapper)
- [x] Evidence attached (this file)
- [x] Threat model updated (key management guidance added)
- [x] CI workflow configured and ready

## Notes

- AWS KMS adapter is a skeleton; production KMS integration requires `@aws-sdk/client-kms` and IAM role configuration.
- Week 1 establishes foundation; Week 2 will expand contract schemas and wire full policy engine integration.
- Executor wrapper is a reference implementation; OpenClaw integration requires adapter code in the OpenClaw repo.

## Acceptance Sign-off

- Week 1 deliverables complete: scaffold, CI, contracts, signer PoC, tests, docs
- Ready for PR review and merge
