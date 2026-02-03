# Proposal: Week 3 — Policy Engine Integration

**Status**: Planned  
**Proposed By**: SDLC Swarm Driver  
**Date**: 2026-02-03

## Problem Statement
Bridge currently signs all intents without policy evaluation. Need to wire Aureus policy engine to assess risk and enforce approval gates before signing.

## Proposed Solution
Integrate Aureus policy engine into bridge approval flow:
1. Import `@aureus/policy` package into bridge project
2. Create `bridge/policy-client.js` wrapping policy engine calls
3. Implement risk assessment logic:
   - Tool risk profiles (low/medium/high per tool)
   - User trust scores (based on history)
   - Contextual risk factors (time, location, resource access)
4. Update `/sign` endpoint to call policy engine before generating signature
5. Add human approval override mechanism (`POST /override`)
6. Log all policy decisions to audit trail

## Acceptance Criteria
1. Policy engine evaluates all intents before signing
2. High-risk intents return `requiresHumanApproval: true` and block signature
3. Override endpoint accepts human justification and logs to audit trail
4. Tool risk profiles cover all OpenClaw tools
5. CI validates policy evaluation paths (low-risk allowed, high-risk blocked)

## Evidence Required
- Policy client (`bridge/policy-client.js`)
- Risk assessment logic (`bridge/risk-assessment.js`)
- Tool profiles (`bridge/tool-profiles.json`)
- Override endpoint implementation
- Policy evaluation tests (`tests/policy-evaluation.test.js`)
- Evidence file (`docs/evidence/week-03.md`)

## Impact Assessment
- **Risk**: Medium — changes approval flow, potential for false positives/negatives
- **Effort**: High — 3-4 days development + testing + tuning
- **Blast Radius**: All approval requests — requires careful rollout and monitoring

## Related Changes
- Depends on: Week 2 contract hardening (needs validated intents)
- Enables: Week 4 OpenClaw integration (needs risk-gated approvals)

## Notes
- Start with conservative risk profiles (prefer false positives over false negatives)
- Add telemetry for policy decision latency and override rates
- Human override requires authenticated identity (OIDC/JWT)
