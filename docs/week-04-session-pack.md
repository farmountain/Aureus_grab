# Week 4 Session Pack: OpenClaw Channel Adapters

## Purpose
Integrate OpenClaw channels (Telegram, Discord) with bridge signed-plan protocol.

## Objectives
1. Fork/clone OpenClaw repo into local workspace
2. Implement channel adapters calling bridge `/sign` endpoint
3. Wire executor wrapper into OpenClaw runtime
4. Add channel-specific intent parsing (commands → IntentEnvelope)
5. End-to-end test: user command → signed plan → execution → audit

## Deliverables
- **OpenClaw fork**: Local clone with adapters
- **Adapters**: Telegram/Discord → bridge integration
- **Executor wrapper**: Wired into OpenClaw runtime
- **Tests**: Channel integration tests, e2e golden path
- **Docs**: Channel integration guide

## Session Plan (5 days)
- **Day 1** (2h): Clone OpenClaw, review architecture
- **Day 2** (4h): Implement Telegram adapter → bridge
- **Day 3** (4h): Implement Discord adapter → bridge
- **Day 4** (4h): Wire executor wrapper, test enforcement
- **Day 5** (2h): E2E test, update docs

## Lab 1: Telegram Adapter (120m)
1. In `knowledgebase/openclaw/src/telegram/`, create `bridge-adapter.ts`
2. Parse Telegram command into IntentEnvelope
3. Call bridge `/sign` with intent + context
4. Return approval or rejection to user
5. Test with mock bridge server

## Lab 2: Discord Adapter (120m)
1. In `knowledgebase/openclaw/src/discord/`, create `bridge-adapter.ts`
2. Parse Discord slash command into IntentEnvelope
3. Call bridge `/sign` with intent + context
4. Handle high-risk rejection (prompt human reviewer)
5. Test with mock bridge server

## Lab 3: Executor Wrapper Integration (90m)
1. Copy `executor_wrapper_reference.js` into OpenClaw runtime
2. Wire into executor dispatch logic
3. Enforce signature verification before tool execution
4. Test low-risk, high-risk, expired flows

## CI Tasks
- Add OpenClaw adapter tests to CI
- Add e2e golden path test (Telegram → bridge → executor)
- Require evidence for OpenClaw integration changes

## Evidence Checklist
- [ ] OpenClaw cloned and configured
- [ ] Telegram adapter (`src/telegram/bridge-adapter.ts`)
- [ ] Discord adapter (`src/discord/bridge-adapter.ts`)
- [ ] Executor wrapper wired (`src/executor-wrapper.ts`)
- [ ] E2E test passes
- [ ] Evidence file (`docs/evidence/week-04.md`)

## Acceptance Criteria
- User sends Telegram command, gets approval/rejection
- High-risk commands prompt human approval
- Executor wrapper enforces signature before execution
- E2E golden path test passes

## Next Steps
- Week 5: Context engine + memory integration
