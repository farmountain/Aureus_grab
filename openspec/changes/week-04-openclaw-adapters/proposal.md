# Proposal: Week 4 — OpenClaw Channel Adapters

**Status**: Planned  
**Proposed By**: SDLC Swarm Driver  
**Date**: 2026-02-03

## Problem Statement
OpenClaw channels (Telegram, Discord) currently execute tool calls directly without Aureus governance. Need to wire channels to bridge for signed-plan protocol enforcement.

## Proposed Solution
Implement channel adapters that intercept user commands and route through bridge:
1. Fork/clone OpenClaw repo into workspace (`knowledgebase/openclaw/`)
2. Create bridge adapters for Telegram and Discord:
   - Parse user commands into IntentEnvelope
   - Call bridge `/sign` endpoint with intent + context
   - Handle approval (proceed to execution) or rejection (notify user)
3. Wire executor wrapper into OpenClaw runtime:
   - Copy `executor_wrapper_reference.js` into OpenClaw
   - Enforce signature verification before tool dispatch
   - Reject expired or unsigned actions
4. Add end-to-end golden path test:
   - User sends command via Telegram
   - Bridge evaluates and signs (or rejects)
   - Executor validates signature and executes
   - Result logged to audit trail

## Acceptance Criteria
1. Telegram adapter routes commands through bridge
2. Discord adapter routes commands through bridge
3. High-risk commands prompt human approval (user notified)
4. Executor wrapper enforces signature verification
5. E2E golden path test passes (Telegram → bridge → executor → audit)
6. Low-risk commands execute without human approval

## Evidence Required
- Telegram adapter (`src/telegram/bridge-adapter.ts`)
- Discord adapter (`src/discord/bridge-adapter.ts`)
- Executor wrapper integration (`src/executor-wrapper.ts`)
- E2E test (`tests/e2e-golden-path.test.js`)
- Evidence file (`docs/evidence/week-04.md`)

## Impact Assessment
- **Risk**: High — modifies OpenClaw execution path, potential for breaking changes
- **Effort**: High — 4-5 days development + integration testing
- **Blast Radius**: All channel interactions — requires staged rollout and rollback plan

## Related Changes
- Depends on: Week 3 policy integration (needs policy-gated approvals)
- Enables: Week 5 context engine (needs execution history)

## Notes
- Test adapters with mock bridge server before full integration
- Add feature flag to toggle bridge enforcement per channel
- Monitor latency impact (bridge adds ~50-100ms per request)
- Plan rollback: revert to direct execution if critical issues
