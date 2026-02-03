# Proposal: Week 2 — Contract Schema Hardening

**Status**: Planned  
**Proposed By**: SDLC Swarm Driver  
**Date**: 2026-02-03

## Problem Statement
Week 1 established placeholder contract schemas. They validate basic structure but lack production-quality constraints (patterns, enums, string lengths, format validation). Need to harden schemas with full validation rules to prevent invalid data from entering the system.

## Proposed Solution
Expand all 5 contract schemas (intent, context, plan, approval, report) with:
- UUID patterns for ID fields
- Enums for categorical fields (riskLevel, status)
- String length constraints (maxLength, minLength)
- Format validators (date-time, uri, email)
- Required vs optional field clarity
- Add valid/invalid examples for each schema
- Wire runtime validation (ajv, zod) into bridge server

## Acceptance Criteria
1. All 5 schemas have patterns, enums, constraints
2. At least 2 valid and 2 invalid examples per schema committed
3. CI fails on invalid contract examples
4. Bridge server validates requests against schemas (returns 400 on invalid)
5. Schema reference docs published (`docs/contracts_reference.md`)

## Evidence Required
- Updated schemas (`contracts/v1/*.schema.json`)
- Examples directory (`contracts/v1/examples/`)
- Validation tests (`tests/schema-validation.test.js`)
- CI workflow (`week2-contract-validation.yml`)
- Evidence file (`docs/evidence/week-02.md`)

## Impact Assessment
- **Risk**: Low — additive change, no breaking changes to existing schemas
- **Effort**: Medium — 2-3 days development + testing
- **Blast Radius**: Contract validation only — does not affect runtime behavior

## Related Changes
- Depends on: Week 1 scaffold
- Enables: Week 3 policy engine integration (needs validated intents)

## Notes
- Use ajv for JSON Schema validation, zod for TypeScript runtime validation
- Generate TypeScript types from schemas using json-schema-to-typescript
