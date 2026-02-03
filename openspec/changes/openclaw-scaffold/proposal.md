## Why

We need a minimal, testable scaffold that codifies the OpenClaw contract schemas and CI checks so development is spec-driven and evidence-gated from day one.

## What Changes

- Add `contracts/v1` JSON Schemas (intent, context, plan, approval, report).
- Add schema validation tests and a schema-lint script.
- Add a CI workflow that runs schema lint and tests.
- Add `docs/evidence/template.md` and initial evidence placeholder.

## Capabilities

### New Capabilities
- `contracts`: JSON Schema definitions for IntentEnvelope, ContextSnapshot, ProposedActionPlan, ExecutionApproval, ExecutionReport.
- `schema-validation`: Test harness and linting to validate schemas and examples.
- `evidence-docs`: Templates for evidence required by spec-driven change process.

### Modified Capabilities
- (none)

## Impact

- Affects repository layout (`contracts/`, `tests/`, `.github/workflows/ci.yml`, `docs/evidence/`).
- Adds minimal developer scripts and CI checks; no runtime code changes.
