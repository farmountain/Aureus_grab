# OpenSpec Change Proposal: key-management

## Summary
Document and implement key management guidance for signer keys (KMS integration, rotation, CI handling). Provide docs and CI guidance for secure handling of signer private keys.

## Artifacts
- `docs/key_management_and_kms.md` (key management guidance)
- Update CI docs and PR template to reference key handling requirements

## Acceptance Criteria
- Documentation added to `docs/` describing KMS and rotation
- PR template requires spec and evidence for key-related changes
- CI secrets guidance documented for maintainers

Notes: This is a documentation and operational change; implementation of provider-specific KMS integration will follow under separate `openspec` changes.
