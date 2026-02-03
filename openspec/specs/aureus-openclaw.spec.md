---
id: aureus-openclaw
title: Aureus OpenClaw Platform — Project Scaffold
version: 0.1.0
tags: [contracts, scaffold, openclaw]
---

Context:

- Provide a minimal, spec-driven scaffold for the Aureus OpenClaw project.
- Source knowledgebase: `knowledgebase/aureus_openclaw_program_design.md` and files under `knowledgebase/aureus-openclaw-platform/contracts/v1/`.

Goals:

1. Create `contracts/v1/` JSON Schema placeholders (intent, context, plan, approval, report) if not present.
2. Add a test harness that loads and validates all JSON schemas.
3. Add `scripts/schema-lint` and simple CI step (`.github/workflows/ci.yml`) that runs schema lint and tests.
4. Add `docs/evidence/` template and initial evidence placeholder describing spec-driven workflow.
5. Provide README and minimal package.json (Node) with test script using `vitest` or `jest` as preferred.

Sources:

- knowledgebase/aureus_openclaw_program_design.md
- knowledgebase/aureus-openclaw-platform/contracts/v1/*.json

Constraints:

- Schemas must be strict (`additionalProperties=false`) and versioned under `contracts/v1`.
- Keep scaffold minimal and easy to extend.

Acceptance Criteria:

- `contracts/v1/*.schema.json` present
- `tests/schema.test.*` loads and parses all schema files
- `.github/workflows/ci.yml` runs `npm test` and schema lint
- `docs/evidence/template.md` exists with spec summary

Implementation notes:

- Use existing JSON schemas under `knowledgebase/aureus-openclaw-platform/contracts/v1` as sources where available; create placeholders for any missing ones.
- Prefer TypeScript + Vitest if the repo already contains TS config; otherwise use plain Node + Jest.
