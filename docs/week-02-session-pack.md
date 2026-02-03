# Week 2 Session Pack: Contract Hardening + Schema Maturation

## Purpose
Expand contract schemas from placeholders to production-quality definitions with validation rules, examples, and full documentation.

## Objectives
1. Harden contract JSON Schemas (add constraints, enums, patterns)
2. Add schema examples (valid/invalid) and documentation
3. Wire zod schemas for runtime validation in TypeScript
4. Expand tests to cover edge cases and schema violations
5. Update CI to enforce schema compliance on all contract changes

## Deliverables
- **Contracts**: Hardened v1 schemas with full validation rules
- **Examples**: `contracts/v1/examples/*.json` (valid + invalid)
- **Docs**: Schema reference guide (`docs/contracts_reference.md`)
- **Tests**: Schema edge case tests, ajv integration tests
- **CI**: Schema validation on every commit touching contracts/

## Session Plan (4 days)
- **Day 1** (2h): Review Week 1 feedback, plan schema constraints
- **Day 2** (4h): Implement hardened schemas, add patterns/enums
- **Day 3** (3h): Write examples, add ajv/zod wrappers
- **Day 4** (2h): Expand tests, update CI, PR review

## Lab 1: Harden IntentEnvelope Schema (90m)
1. Add `pattern` for UUID fields (`intentId`, `ruleId`)
2. Add `enum` for `riskLevel` (low|medium|high)
3. Add `maxLength` for `description`
4. Add `format: date-time` for `timestamp`
5. Test with valid/invalid examples

## Lab 2: Schema Examples + Docs (60m)
1. Create `contracts/v1/examples/intent-valid.json`
2. Create `contracts/v1/examples/intent-invalid-*.json` (missing fields, bad enums)
3. Write `docs/contracts_reference.md` documenting each schema
4. Add inline annotations with JSON Schema `$comment`

## Lab 3: Runtime Validation (90m)
1. Install `ajv` and `zod`
2. Create `bridge/validation.js` exporting zod schemas from JSON Schemas
3. Update `server.js` to validate requests against zod schemas
4. Add validation error tests

## CI Tasks
- Add `npm run schema:validate` to CI (runs ajv on all examples)
- Add `npm run schema:test` to CI (edge case tests)
- Require evidence update for any contract schema change

## Evidence Checklist
- [ ] Hardened schemas committed (`contracts/v1/*.schema.json`)
- [ ] Examples added (`contracts/v1/examples/`)
- [ ] Schema reference docs (`docs/contracts_reference.md`)
- [ ] Validation tests pass (`tests/schema-validation.test.js`)
- [ ] CI updated (`.github/workflows/week2-contract-validation.yml`)
- [ ] Evidence file (`docs/evidence/week-02.md`)

## PR Submission
```bash
git checkout -b feature/week-02-contract-hardening
git add contracts/ docs/ tests/ .github/workflows/
git commit -m "feat: harden contract schemas with validation rules"
git push origin feature/week-02-contract-hardening
gh pr create --title "Week 2: Contract Hardening" --body "See docs/evidence/week-02.md"
```

## Acceptance Criteria
- All 5 schemas have patterns, enums, constraints
- At least 2 valid and 2 invalid examples per schema
- CI fails on invalid contract examples
- Schema reference docs complete

## Artifacts Created
- Hardened schemas, examples, validation wrappers, edge case tests, CI workflow, evidence file

## Next Steps
- Week 3: Policy engine integration + risk assessment logic
