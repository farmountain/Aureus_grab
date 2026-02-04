# Executor Wrapper — Design & Pseudocode

Purpose: enforce that OpenClaw only executes steps from Aureus-signed `ExecutionApproval` objects and that policy/TTL/tool-profile checks are applied.

Responsibilities
- Verify ed25519 signature on `ExecutionApproval`.
- Validate `expiresAt` TTL and `issuedAt` freshness.
- Enforce per-step tool profiles (deny-by-default; check allowlist/hash pins).
- Block execution of any unsigned or policy-violating steps and surface clear error messages.
- Emit `ExecutionReport` to Aureus and persist execution trace locally for replay.

Pseudocode (Node.js-like)

- Input: `approval` (object), `proposedPlan` (object), `toolProfiles` (map)

1. function `verifyAndEnforce(approval, proposedPlan)`:
   - if (!verifySignature(approval)) throw Error('invalid signature')
   - if (now > Date.parse(approval.expiresAt)) throw Error('approval expired')
   - if (approval.planId !== proposedPlan.planId) throw Error('plan mismatch')

   - for each step in proposedPlan.steps:
       - profile = toolProfiles[step.tool] || denyAllProfile
       - if (!profile.allowed) reject step
       - if (profile.hashPin && profile.hashPin !== step.skillHash) reject step
       - if (step.risk === 'high' && !approval.humanApproved) reject step

   - execute allowed steps sequentially or as defined by plan
   - collect per-step results and produce `ExecutionReport`
   - POST `ExecutionReport` back to Aureus

2. `verifySignature(approval)` delegates to verifier using Aureus public key; must also validate canonicalization and deterministic serialization used by signer.

Key considerations
- TTL vs clock skew: allow small clock skew buffer (e.g., 30s) but require tight TTL for high-risk actions.
- Replayability: persist raw approval + plan + execution trace to event store for deterministic re-run.
- Fail-open vs fail-closed: default to fail-closed for all enforcement checks.
- Secrets: public keys loaded from trusted secret store or environment variables; rotate via documented strategy.

Examples & Test Cases
- Valid approval -> execute allowed low-risk steps
- Expired approval -> reject execution
- Tampered approval (planId changed) -> reject
- High-risk step without human approval -> reject
- Skill hash mismatch -> reject

Where to implement
- Provide the reference implementation as a small module in OpenClaw codebase: `openclaw/executor/wrapper.js` and unit tests that use fixtures from `Aureus-Sentinel/contracts/v1/`.
