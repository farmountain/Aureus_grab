# AWS KMS Integration Guide (Signer)

This document describes integrating Aureus signer with AWS KMS for production-grade key management.

Prerequisites
- Create an asymmetric KMS key using type `Ed25519` (supported in certain regions).
- Grant a dedicated signing role with `kms:Sign` permission on the key.

Recommended flow
1. Store the KMS Key ARN in configuration (do not store private key material).
2. The signer service calls KMS `Sign` with the canonicalized payload; KMS returns the signature (binary) which is base64-encoded for transport.
3. Publish the public key or key metadata (keyId/version) to consumers (OpenClaw) via a signed metadata endpoint or a configuration store.

CI / Secrets
- CI should not store private key material. Instead, use CI to assume a signing role or use OIDC to request short-lived credentials to call KMS.

Implementation notes
- Use the AWS SDK v3 `@aws-sdk/client-kms`.
- Use `MessageType: 'RAW'` and `SigningAlgorithm: 'ED25519'` when signing raw canonical payloads.
- Prefer server-side signing in KMS to avoid exporting private key material.

Fallback
- If a provider doesn't support ed25519 signing in their KMS, consider using a Vault HSM (HashiCorp Vault with transit/sign endpoint) or a dedicated signing service running in a secure enclave.

Security considerations
- Enforce least-privileged IAM roles.
- Audit KMS `Sign` calls and forward logs to SIEM.
- Implement keyId/version metadata and signature `keyId` in `ExecutionApproval` payload so consumers can validate which key version signed the approval.

Example (pseudo):
```
const { signWithKms } = require('./bridge/kms/aws_kms_adapter');
const signature = await signWithKms({ keyId: process.env.KMS_KEY_ARN, payload: canonicalPayload, region: 'us-east-1' });
```

Generated: 2026-02-03
