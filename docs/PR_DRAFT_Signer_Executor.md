PR Draft: Signer + Executor Enforcement

Branch name:
  feature/signer-executor-enforcement

PR title:
  feat: signer + executor enforcement (ed25519 signing, TTL, executor wrapper)

Description:
- Implements PoC signer service (ed25519) and Bridge server signing endpoint
- Adds executor wrapper reference implementation and tests enforcing signature, TTL, and human-approval for high-risk steps
- Adds JSON Schemas, schema test harness, CI steps, KMS adapter skeleton and docs

Openspec changes:
- openspec/changes/week-01-scaffold/proposal.md
- openspec/changes/signer-executor-enforcement/proposal.md
- openspec/changes/key-management/proposal.md
- openspec/changes/aws-kms-integration/proposal.md

Files of interest:
- aureus-openclaw-platform/bridge/signer.js
- aureus-openclaw-platform/bridge/server.js
- aureus-openclaw-platform/contracts/v1/*.json
- aureus-openclaw-platform/tests/*.js
- .github/workflows/week1-evidence-gate.yml
- docs/key_management_and_kms.md
- docs/aws_kms_integration.md

Checklist (for reviewers):
- [ ] Spec updated and linked above
- [ ] Tests pass locally and in CI
- [ ] Evidence file added to `aureus-openclaw-platform/docs/evidence/` (week-01.md)
- [ ] Threat model updated if required
- [ ] Key management guidance reviewed and approved

Commands to create branch and open PR (local):
```bash
# create branch and push
git checkout -b feature/signer-executor-enforcement
git add .
git commit -m "feat: signer + executor enforcement (PoC)"
git push origin feature/signer-executor-enforcement

# Then open a PR in GitHub using UI or gh cli:
# gh pr create --base main --head feature/signer-executor-enforcement --title "feat: signer + executor enforcement" --body-file docs/PR_DRAFT_Signer_Executor.md
```

Notes:
- The AWS KMS adapter test is conditional in CI and only runs when `TEST_KMS_KEY_ARN` is configured in repository secrets.
- Production key management must use a KMS or secret store as documented in `docs/key_management_and_kms.md`.
