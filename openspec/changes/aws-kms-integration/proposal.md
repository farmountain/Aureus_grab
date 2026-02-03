# OpenSpec Change Proposal: aws-kms-integration

## Summary
Add an AWS KMS adapter for signer integration with Aureus. This change adds an adapter skeleton, documentation, and a test placeholder. Provider-specific implementation and CI secret wiring will follow.

## Artifacts
- `aureus-openclaw-platform/bridge/kms/aws_kms_adapter.js` (adapter skeleton)
- `docs/aws_kms_integration.md` (integration guide)
- `aureus-openclaw-platform/tests/aws_kms_adapter.test.js` (test placeholder)

## Acceptance Criteria
- Documentation added and reviewed
- Adapter skeleton present in repo
- Test placeholder included and documented how to run with `TEST_KMS_KEY_ARN`

Notes
- This change does not enable KMS signing in CI; that requires secure CI secrets and role configuration.
