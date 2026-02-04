# Implementation Backlog — Aureus ↔ OpenClaw (Week 1 → Week 6)

Priority order (Week 1 focus first):

Epic E1 — Foundations & Evidence-Gated SDLC (Week 1)
- Story S1.1: Scaffold orchestration repo
  - Task T1.1.1: Create repo layout (`README`, `docs`, `contracts`, `bridge`, `tests`, `ci`)
  - Task T1.1.2: Add evidence ledger template and CI placeholder
  - Task T1.1.3: Add architecture overview and diagrams
  - Estimate: 3d
- Story S1.2: PR evidence policy
  - Task T1.2.1: Add GitHub Action `week1-evidence-gate.yml`
  - Task T1.2.2: Document evidence template and reviewer checklist
  - Estimate: 1d

Epic E2 — Contract-First Integration (Week 2)
- Story S2.1: Contract v1 schemas
  - Task T2.1.1: Draft JSON Schemas for IntentEnvelope, ContextSnapshot, Plan, Approval, Report
  - Task T2.1.2: Add schema lint + unit tests (examples)
  - Estimate: 4d
- Story S2.2: Schema test harness
  - Task T2.2.1: Wire `node tests/schema-test-runner.js` to run in CI
  - Estimate: 1d

Epic E2.5 — Governance & Enforcement (inline with E2/E3)
- Story S2.5.1: Executor Wrapper enforcement
  - Task T2.5.1.1: Define executor wrapper contract and API (verify signature, TTL, tool profile)
  - Task T2.5.1.2: Implement executor wrapper pseudocode and reference implementation (OpenClaw side)
  - Task T2.5.1.3: Add unit tests for signature verification + TTL expiry + policy refusal
  - Estimate: 3d
- Story S2.5.2: Bridge enforcement and audit
  - Task T2.5.2.1: Ensure Bridge persists request/response for replay and forwards signed approvals only
  - Task T2.5.2.2: Add integration tests for Bridge -> Aureus -> OpenClaw signed approval flow
  - Estimate: 2d

Epic E3 — Signer & Verifier Prototype (Week 3)

Epic E3 — Signer & Verifier Prototype (Week 3)
- Story S3.1: Ed25519 signer + verifier
  - Task T3.1.1: Implement signer service (env key loading, TTL)
  - Task T3.1.2: Implement verifier client used by OpenClaw executor wrapper
  - Task T3.1.3: Unit tests (valid/invalid/expired)
  - Estimate: 3d
  - Task T3.1.4: Add key management requirements (env/secret store, rotation notes) and CI secrets handling

Epic E3.5 — Policy & Human Approval Hooks (Week 3-4)
- Story S3.5.1: Human approval integration
  - Task T3.5.1.1: Define approval UX/flow and API for manual overrides per risk band
  - Task T3.5.1.2: Implement human-approval gating in Aureus decision engine (flags + TTL)
  - Task T3.5.1.3: Add tests demonstrating human-approval required for high-risk plans
  - Estimate: 4d

Epic E4 — Bridge & Replay (Week 3-4)
- Story S4.1: Bridge PoC end-to-end
  - Task T4.1.1: Bridge endpoints `/intents`, validation, forward to Aureus stub
  - Task T4.1.2: Event persistence for replay
  - Task T4.1.3: Replay harness skeleton
  - Estimate: 4d
  - Task T4.1.4: Add tamper-evident audit logging and SIEM export formatting
  - Task T4.1.5: Implement replay verification harness that compares recorded vs replay outputs
  - Estimate: +2d

Epic E5 — Policy Engine & Deny-by-Default Profiles (Week 4-5)
- Story S5.1: Policy FSM integration
  - Task T5.1.1: Define risk bands and tool profiles
  - Task T5.1.2: Integrate policy checks in decision flow
  - Estimate: 5d

Notes
- Each epic should create a corresponding `openspec` change under `openspec/changes/` and add evidence artifacts to `Aureus-Sentinel/docs/evidence/`.
- Keep changes small and gated: spec → tests → code → evidence.

Next immediate work items:
1. Implement `contracts/v1` schema placeholders and schema test harness (Week 2 kickoff)
2. Implement ed25519 signer prototype and unit tests (Week 3 prep)
