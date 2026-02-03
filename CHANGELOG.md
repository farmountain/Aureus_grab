# Changelog

## [Unreleased]

### Added
- PoC signer service and Bridge signing endpoint (ed25519) (`aureus-openclaw-platform/bridge/`)
- Executor wrapper reference implementation enforcing signature verification, TTL, and human-approval gating (`docs/executor_wrapper_reference.js`)
- JSON Schema placeholders and schema test harness (`aureus-openclaw-platform/contracts/v1/`, `aureus-openclaw-platform/tests/schema-test-runner.js`)
- CI workflow to run schema, signer, integration, and executor wrapper tests (`.github/workflows/week1-evidence-gate.yml`)
- AWS KMS adapter skeleton and integration docs (`aureus-openclaw-platform/bridge/kms/aws_kms_adapter.js`, `docs/aws_kms_integration.md`)
- Key management guidance document (`docs/key_management_and_kms.md`)
- PR template requiring spec/evidence for key-related changes (`.github/PULL_REQUEST_TEMPLATE.md`)

