# Key Management & KMS Integration — Aureus Signer

This document describes recommended key management practices for the Aureus signer service and OpenClaw verifier.

Goals
- Protect signer private keys with an enterprise KMS (e.g., AWS KMS, Azure Key Vault, GCP KMS, HashiCorp Vault)
- Support key rotation, emergency revocation, and audit trails
- Avoid embedding keys in source or environment files in production

Environments
- Local/dev: ephemeral keypairs generated on startup or dev-provided base64-encoded keys in env. Use only for development/testing.
- CI: use repository secrets or CI-provided secret store; prefer short-lived keys or service account credentials to fetch keys at runtime.
- Production: use a dedicated KMS or HSM and grant signer service minimal access (encrypt/decrypt or cryptographic-signing role).

Key Usage Patterns
- Signer service should perform signing operations inside a trusted KMS where possible; do not export private key material to application memory unless KMS cannot perform signing operations.
- Verifier only needs the public key; publish public key via a signed metadata endpoint or a secure configuration store.

Rotation & Revocation
- Maintain a `key-version` identifier attached to each `ExecutionApproval` (e.g., `keyId: 'aureus-signer-v1'`).
- Rotation steps:
  1. Generate new key in KMS and mark as `pending`.
  2. Update signer service to use new key for new approvals; continue accepting prior key for verification until a cutover time.
  3. Update OpenClaw to trust the new public key and retire old keys after expiration.
- Revoke compromised keys immediately and ensure audit logs document revocation events.

Implementation Notes
- KMS-backed signing (recommended): use provider SDK to sign payload hashes inside KMS (no private key export).
- If KMS does not support ed25519 signing, use a Vault HSM or a dedicated signing service running inside a secured enclave.
- Fallback: load private key from secret store into memory but rotate frequently and restrict access using OS-level protections.

CI/CD
- Use CI secrets to store KMS credentials or service account tokens; avoid embedding raw private keys in CI variables where possible.
- Provision ephemeral credentials for pipeline runs via GitHub Actions OIDC or cloud-specific short-lived credentials.

Audit & Monitoring
- Ensure signing operations are logged with correlation IDs and request metadata.
- Export signing audit events to SIEM for alerting on abnormal signing rates or unexpected keys.

Developer Experience
- Provide a small CLI `tools/keygen.js` to generate local keypairs for dev testing (already available in `bridge/signer.js` via `generateKeypair`).
- Document how to configure `AUREUS_PUBLIC_KEY_DER` and `SIGNER_PRIVATE_KEY_DER` in `.env` for local runs.

Security Checklist (pre-release)
- [ ] Private key material not stored in repo
- [ ] KMS or secret store used in production
- [ ] Key rotation plan documented and tested
- [ ] Audit logging enabled for signing operations
- [ ] CI uses ephemeral or least-privileged credentials to fetch keys

References
- NIST Key Management Guidelines
- Provider KMS docs (AWS KMS, Azure Key Vault, GCP KMS, HashiCorp Vault)

Generated: 2026-02-03
