# OpenSpec Change Proposal: signer-executor-enforcement

## Summary
Implement signer and executor-enforcement flow: ed25519 signer service in Aureus, executor wrapper in OpenClaw that verifies signatures, TTLs, and enforces tool profiles and human-approval gates.

## Artifacts
- `aureus-openclaw-platform/bridge/signer.js` (signer + verifier)
- `aureus-openclaw-platform/bridge/server.js` (signer service PoC)
- `aureus-openclaw-platform/docs/executor_wrapper_reference.js` (reference implementation)
- Tests: `aureus-openclaw-platform/tests/signer.test.js`, `integration.test.js`, `executor_wrapper.test.js`
- CI update: `.github/workflows/week1-evidence-gate.yml` to run the tests

## Acceptance Criteria
- Signer unit tests pass (valid/invalid/expired cases).
- Integration test validates end-to-end sign+verify using published public key.
- Executor wrapper tests demonstrate rejection of expired approvals and high-risk steps without human approval, and allow low-risk steps.
- CI workflow runs these tests on PRs.

## Notes
Key management: keys load from env for CI; production must use a secret store and documented rotation strategy. Add `openspec` references when opening PRs.
