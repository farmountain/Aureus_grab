# OpenSpec Change Proposal: week-01-scaffold

## Summary
Scaffold the orchestration repo `aureus-openclaw-platform/` with docs, contract placeholders, bridge adapter PoC, tests, and CI evidence-gate for Week 1 deliverables.

## Artifacts
- `aureus-openclaw-platform/` scaffold (README, docs, bridge, contracts, tests, ci)
- `docs/architecture_overview.md` (system summary)
- Evidence ledger template and CI check placeholder
 - `aureus-openclaw-platform/docs/architecture/component_diagram.md` (component diagram)
 - `aureus-openclaw-platform/docs/architecture/sequence_diagrams.md` (sequence diagrams)
 - `aureus-openclaw-platform/ci/week1-evidence-gate.yml` (CI placeholder)
 - `aureus-openclaw-platform/docs/evidence/template.md` (evidence template)

## Acceptance Criteria
- Scaffolding commits present in repo
- `openspec` change links to PRs that implement the scaffold
- CI placeholder that enforces presence of evidence per PR

## Notes
This change kickstarts the dual-loop evidence-gated program. Subsequent changes will add contract schemas, signer/verifier, and CI workflows.
