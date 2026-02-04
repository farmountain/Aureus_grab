# Requirements & Acceptance Criteria — Aureus Project

## Overview
This document consolidates functional and non-functional requirements, constraints, and acceptance criteria for the Aureus + OpenClaw integration program.

## Functional Requirements
- Runtime core: durable orchestration, CRV gates, policy FSM, memory (HipCortex).
- Contract-driven API: strict JSON Schemas for IntentEnvelope, ContextSnapshot, Plan, Approval, Report.
- Signed-plan protocol: aureus signer (ed25519) and OpenClaw verifier with TTLs.
- Bridge/adapter: reliable message exchange, replayable event logs, deterministic replays.
- Channel adapters: telegram/discord/web (OpenClaw) integration and onboarding flows.
- Evidence ledger: PR-level evidence entries required for merges.
- Replay & verification harness: event capture → deterministic replay → diff report.

## Non-functional Requirements
- Durability: persisted state + event logs (Postgres/Redis recommended).
- Idempotency: retries must not duplicate side effects.
- Auditability: tamper-evident audit logs with SIEM-friendly export.
- Security: deny-by-default tool governance, secrets isolation, key rotation strategy.
- Observability: metrics, tracing, and dashboards for golden-paths & failures.
- Testability: schema tests, unit tests, property/fuzz tests, injection corpus.
- Developer ergonomics: devcontainers, scaffold scripts, clear runbook.

## Constraints & Policies
- All JSON Schemas: `additionalProperties: false` and include `version` & `type` discriminator.
- No unsigned action execution by OpenClaw; Aureus must sign approvals.
- No production high-risk actions without human approval (configurable per risk band).
- New dependencies require justification and license review.

## Acceptance Criteria
- Contracts: all files under `contracts/v1/` parse and pass `node tests/schema-test-runner.js`.
- CI: PRs enforce lint, tests, secret-scan placeholders, and evidence ledger checks.
- Signer/verifier: unit tests for valid/invalid/expired signatures.
- Replay: a sample event replay reproduces a signed plan and verification report.
- Security: threat model updated on risky changes; secrets scan passes on PR.
- Demo: staging deployment runs golden-path e2e demonstrating signed plan execution without unsafe side-effects.

## Measurable Success Metrics
- Schema validation: 100% passing on PRs
- CI pass rate: 95% on main branch
- E2E golden-path success: ≥95% in staging
- Evidence coverage: 100% of PRs with required evidence entries

## Next Steps
- Create `openspec` change(s) for Week 1 scaffold and contract v1.
- Scaffold orchestration repo `Aureus-Sentinel/` and CI placeholders.
- Implement minimal signer/verifier prototype and schema test harness.

Generated: 2026-02-03
