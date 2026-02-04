# Week 1 Session Pack — Aureus ↔ OpenClaw

Purpose
-------
Execute Week 1: scaffold orchestration repo, add CI evidence gate, include contract skeletons, and confirm developer flow.

Objectives
----------
- Understand the dual-loop evidence-gated design.
- Create orchestration repo scaffold and architecture docs.
- Implement CI evidence-gate and schema test harness.
- Provide evidence template and PR draft for reviewers.

Deliverables
------------
- `Aureus-Sentinel/` scaffold (README, docs, contracts, bridge, tests, ci)
- Architecture overview and diagrams (`docs/architecture_overview.md`, `docs/architecture/*.md`)
- Evidence ledger template: `Aureus-Sentinel/docs/evidence/template.md`
- CI workflow: `.github/workflows/week1-evidence-gate.yml` (runs schema, signer, integration, executor tests)
- Contract placeholders: `Aureus-Sentinel/contracts/v1/*.schema.json`
- Tests: schema test runner and signer/integration/executor tests under `Aureus-Sentinel/tests/`
- PR draft: `docs/PR_DRAFT_Signer_Executor.md`

Session Plan
------------
Day 1 — Kickoff (2 hours)
- Review PRD and dual-loop design (15m)
- Walk through architecture diagram and trust boundary (20m)
- Confirm Week 1 deliverables and owner assignments (25m)
- Assign tasks in backlog (20m)

Day 2 — Scaffold & Docs (4 hours)
- Create folders and README files (1h)
- Write `docs/architecture_overview.md` and component diagrams (1.5h)
- Add evidence template and sample evidence file (1h)
- Add `docs/evidence/week-01.md` placeholder (0.5h)

Day 3 — CI & Tests (6 hours)
- Add schema placeholders under `contracts/v1` (1h)
- Implement `Aureus-Sentinel/tests/schema-test-runner.js` (1h)
- Add signer PoC and tests (`bridge/signer.js`, `tests/signer.test.js`) (2h)
- Add integration and executor wrapper tests (2h)

Day 4 — Review & Submission (3 hours)
- Run full test suite locally and fix issues (2h)
- Prepare PR draft and evidence file, run CI (1h)

Labs (step-by-step)
-------------------
Lab 1 — Repo scaffold (30–60m)
- Verify the following folders exist:
  - `Aureus-Sentinel/docs`
  - `Aureus-Sentinel/contracts/v1`
  - `Aureus-Sentinel/bridge`
  - `Aureus-Sentinel/tests`
  - `.github/workflows`
- Confirm `Aureus-Sentinel/README.md` describes the orchestration repo.

Lab 2 — Evidence ledger enforcement (30–60m)
- Ensure `Aureus-Sentinel/docs/evidence/template.md` exists.
- Verify `.github/workflows/week1-evidence-gate.yml` fails when `Aureus-Sentinel/docs/evidence/week-01.md` is missing.

Lab 3 — Contract skeleton + schema test (30–90m)
- Confirm placeholder schemas exist in `contracts/v1/` (intent, context, plan, approval, report).
- Run schema checks:

```bash
node Aureus-Sentinel/tests/schema-test-runner.js
```

CI Tasks
--------
- Enforce evidence file per PR (Week 1 workflow).
- Run schema test runner.
- Run signer unit tests and integration tests (server starts ephemeral keys).
- Conditionally run AWS KMS adapter test if `TEST_KMS_KEY_ARN` secret present.

Evidence Checklist (add to `Aureus-Sentinel/docs/evidence/week-01.md`)
- Title, PR link, Author(s), Date
- Summary of change
- Tests & Validation: schema test output, signer tests, integration tests
- Threat model updated (if applicable)
- Artifacts: links to CI runs, logs
- Reviewer checklist: spec updated, tests added, evidence attached, threat model (if needed)

PR Submission (quick steps)
--------------------------
- Create branch:

```bash
git checkout -b feature/week-01-scaffold
git add .
git commit -m "chore: Week 1 scaffold + CI evidence gate"
git push origin feature/week-01-scaffold
```
- Use `gh pr create` with `docs/PR_DRAFT_Signer_Executor.md` or open PR via GitHub UI.

Acceptance Criteria for Week 1
-----------------------------
- Orchestration scaffold present with docs and evidence template.
- CI evidence-gate workflow present and configured to run tests.
- Schema placeholders and schema test runner pass locally.
- Signer PoC + tests run and pass locally (or in CI with secrets configured).
- PR created with evidence file `Aureus-Sentinel/docs/evidence/week-01.md` and linked `openspec` proposal.

Artifacts Created (this session)
--------------------------------
- `Aureus-Sentinel/README.md`
- `docs/architecture_overview.md` and `docs/architecture/*`
- `Aureus-Sentinel/contracts/v1/*.json` schema placeholders
- `Aureus-Sentinel/bridge/signer.js` and `bridge/server.js` PoC
- `Aureus-Sentinel/tests/*` schema/signer/integration/executor tests
- `.github/workflows/week1-evidence-gate.yml`
- `Aureus-Sentinel/docs/evidence/template.md` and `docs/PR_DRAFT_Signer_Executor.md`

Notes & Next Steps
------------------
- After Week 1 is merged, proceed to Week 2: full contract definitions and schema linting in CI.
- Maintain `openspec/changes/` entries per week and attach evidence in `docs/evidence/` for each PR.

Generated: 2026-02-03
