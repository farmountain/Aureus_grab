# Domain Constraints Layer

## Overview

The domain constraints layer extends the core `ConstraintEngine` with versioned, auditable packs that represent regulation- or domain-specific guardrails. Each pack bundles schema definitions, hard/soft constraints, audit hooks, and deployment metadata so that compliance teams can evolve constraint logic in a controlled workflow.

## Constraint Pack Interface

A **constraint pack** is a structured container with the following properties:

- **Versioning**: Semver object (`major`, `minor`, `patch`, optional `label`) so changes are traceable.
- **Schemas**: JSON Schemas for state, action, and params; the pack is invalid without them.
- **Constraints**: Hard/soft constraints that are pushed into the `ConstraintEngine`.
- **Audit hooks**: Callbacks invoked on load, validation, violations, approvals, deployments, and retirement.
- **Metadata**: Created/updated timestamps and domain context.

Relevant TypeScript interfaces:

```ts
import { ConstraintPack } from '@aureus/world-model';

const pack: ConstraintPack = {
  id: 'example-pack',
  name: 'Example Compliance Pack',
  description: 'Domain-specific constraints for regulated workflows.',
  domain: 'payments',
  version: { major: 1, minor: 0, patch: 0 },
  status: 'draft',
  schema: {
    stateSchema: { type: 'object', properties: {} },
    actionSchema: { type: 'object', properties: {} },
    paramsSchema: { type: 'object', properties: {} },
  },
  constraints: {
    hard: [],
    soft: [],
  },
  createdBy: 'compliance-team',
  createdAt: new Date().toISOString(),
  lastUpdatedAt: new Date().toISOString(),
};
```

## Registry and Deployment

The `ConstraintPackRegistry` is responsible for validation, deployment, and lifecycle management.

```ts
import { ConstraintPackRegistry, masSandboxConstraintPack } from '@aureus/world-model';

const registry = new ConstraintPackRegistry();
registry.registerPack(masSandboxConstraintPack, 'policy-bot');
registry.deployPack('mas-sandbox', 'policy-bot', 'Initial MAS sandbox rollout');
```

## LLM-Assisted Constraint Evolution Workflow

The default workflow follows a gated evolution path, with LLMs producing drafts and humans approving deployment:

1. **Prompt**: A human or policy system captures intent and regulatory context.
2. **Draft**: LLM produces a draft `ConstraintPack` with schemas + constraints.
3. **CRV validation**: A Constraint Risk Validator (CRV) checks risk exposure, bias, and invariant coverage.
4. **Policy approval**: Compliance leadership signs off on version and scope.
5. **Deployment**: The registry deploys the approved pack, capturing audit metadata.

The workflow is represented in `ConstraintEvolutionWorkflow` and tracked via `ConstraintEvolutionRecord`, which stores the prompt, draft, CRV results, approval record, and deployment record.

```ts
import {
  ConstraintEvolutionWorkflow,
  masSandboxConstraintPack,
  ConstraintPackRegistry,
} from '@aureus/world-model';

const workflow = new ConstraintEvolutionWorkflow();
const registry = new ConstraintPackRegistry();

const record = workflow.start('Need MAS sandbox constraints for fintech pilot', 'policy-analyst');
workflow.submitDraft(record.id, masSandboxConstraintPack, 'llm-drafter');
```

## Example Packs

### MAS Sandbox Guardrails

- **Domain**: fintech sandbox operations
- **Schema**: state + action + params schemas describing participants, data classifications, and risk controls
- **Constraints**:
  - Approved participant enforcement
  - Classification limits on sandbox exports
  - Consent requirement for onboarding

### Basel III Audit Tracing

- **Domain**: banking capital adequacy and audit traceability
- **Schema**: state + action + params schemas describing capital ratios, exposure data, and audit trail settings
- **Constraints**:
  - Minimum capital ratios before approving exposure
  - Mandatory `traceId` for auditability
  - Soft preference for lower leverage impact

## Governance Process for Constraint Updates

Constraint packs are treated as regulated artifacts. The governance process ensures changes are vetted and traceable:

1. **Initiation**
   - Change request submitted with regulatory references and business impact.
   - Risk/Compliance assigns an owner and reviewer.

2. **Drafting**
   - Draft pack authored (LLM-assisted or human-authored).
   - Schemas and constraint logic are documented with reasoning.

3. **CRV Validation**
   - Validate coverage against required control objectives.
   - Run scenario simulations and ensure no hard constraint regression.

4. **Policy Approval**
   - Compliance lead signs off on version, scope, and effective date.
   - Approvals logged via `PolicyApprovalRecord`.

5. **Deployment & Monitoring**
   - Deploy pack through `ConstraintPackRegistry`.
   - Monitor violations and log audit events.

6. **Post-Deployment Review**
   - Review violation metrics and operational impact.
   - Schedule periodic recertification or retirement.

## Suggested Checklist for Approvers

- [ ] Schema definitions match data sources and domains.
- [ ] Hard constraints encode mandatory regulations.
- [ ] Soft constraints align with risk appetite.
- [ ] CRV validation passed with no critical issues.
- [ ] Audit hooks record required metadata.
- [ ] Deployment notes include change ticket and regulator mapping.
