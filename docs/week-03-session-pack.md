# Week 3 Session Pack: Policy Engine Integration

## Purpose
Wire Aureus policy engine to evaluate intents and generate risk assessments before plan approval.

## Objectives
1. Integrate Aureus policy engine (from `knowledgebase/Aureus_Agentic_OS/packages/policy`)
2. Implement risk assessment logic (tool profiles, user context, history)
3. Wire policy evaluation into bridge approval flow
4. Add policy override mechanism for human reviewers
5. Expand tests for policy evaluation paths

## Deliverables
- **Integration**: Bridge calls Aureus policy engine for approval decisions
- **Risk logic**: Tool risk profiles, user trust scores, historical violations
- **Overrides**: Human approval override mechanism with audit trail
- **Tests**: Policy evaluation tests, override tests
- **Docs**: Policy integration guide

## Session Plan (5 days)
- **Day 1** (3h): Review Aureus policy engine APIs
- **Day 2** (4h): Wire bridge to policy engine, add tool profiles
- **Day 3** (4h): Implement risk assessment logic
- **Day 4** (3h): Add override mechanism, audit logging
- **Day 5** (2h): Expand tests, update docs

## Lab 1: Wire Policy Engine (120m)
1. Import `@aureus/policy` into bridge project
2. Create `bridge/policy-client.js` wrapping policy engine calls
3. Update `server.js /sign` endpoint to call policy engine
4. Return `riskLevel` and `requiresHumanApproval` in response

## Lab 2: Risk Assessment Logic (90m)
1. Add tool risk profiles (in `bridge/tool-profiles.json`)
2. Implement `assessRisk(intent, context)` function
3. Factor in user trust score, historical violations, tool risk
4. Return structured risk assessment object

## Lab 3: Override Mechanism (90m)
1. Add `POST /override` endpoint accepting human approval + justification
2. Store override in audit log (postgres or file for PoC)
3. Update approval signature to include override metadata
4. Test override flow end-to-end

## CI Tasks
- Add policy evaluation tests to CI
- Add override audit log validation
- Require evidence update for policy changes

## Evidence Checklist
- [ ] Policy engine integrated (`bridge/policy-client.js`)
- [ ] Risk assessment logic (`bridge/risk-assessment.js`)
- [ ] Override mechanism (`POST /override`)
- [ ] Tool profiles (`bridge/tool-profiles.json`)
- [ ] Tests pass (`tests/policy-evaluation.test.js`)
- [ ] Evidence file (`docs/evidence/week-03.md`)

## Acceptance Criteria
- Policy engine evaluates all intents before approval
- High-risk intents require human approval
- Override mechanism logs justification and approver identity
- CI validates policy evaluation paths

## Next Steps
- Week 4: OpenClaw channel adapters (Telegram, Discord)
