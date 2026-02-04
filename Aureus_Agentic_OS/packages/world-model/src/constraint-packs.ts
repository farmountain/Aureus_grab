import { HardConstraint, SoftConstraint } from './constraints';
import { ConstraintPack, ConstraintPackSchema } from './domain-constraints';

const masSandboxSchema: ConstraintPackSchema = {
  stateSchema: {
    $id: 'mas-sandbox-state',
    type: 'object',
    required: ['participants', 'dataAssets', 'riskControls'],
    properties: {
      participants: {
        type: 'array',
        items: {
          type: 'object',
          required: ['id', 'role', 'approved'],
          properties: {
            id: { type: 'string' },
            role: { type: 'string', enum: ['sponsor', 'operator', 'auditor'] },
            approved: { type: 'boolean' },
          },
        },
      },
      dataAssets: {
        type: 'array',
        items: {
          type: 'object',
          required: ['assetId', 'classification', 'consentStatus'],
          properties: {
            assetId: { type: 'string' },
            classification: { type: 'string', enum: ['synthetic', 'sandbox', 'restricted'] },
            consentStatus: { type: 'string', enum: ['pending', 'granted', 'revoked'] },
          },
        },
      },
      riskControls: {
        type: 'object',
        required: ['limits', 'monitoring'],
        properties: {
          limits: {
            type: 'object',
            required: ['transactionCap'],
            properties: {
              transactionCap: { type: 'number', minimum: 0 },
            },
          },
          monitoring: {
            type: 'object',
            required: ['enabled'],
            properties: {
              enabled: { type: 'boolean' },
            },
          },
        },
      },
    },
  },
  actionSchema: {
    $id: 'mas-sandbox-action',
    type: 'object',
    required: ['action'],
    properties: {
      action: { type: 'string' },
    },
  },
  paramsSchema: {
    $id: 'mas-sandbox-params',
    type: 'object',
    properties: {
      assetId: { type: 'string' },
      transactionValue: { type: 'number', minimum: 0 },
      requestedClassification: { type: 'string', enum: ['synthetic', 'sandbox', 'restricted'] },
      consentStatus: { type: 'string', enum: ['pending', 'granted', 'revoked'] },
      traceId: { type: 'string' },
    },
  },
};

const baselAuditSchema: ConstraintPackSchema = {
  stateSchema: {
    $id: 'basel-iii-state',
    type: 'object',
    required: ['capitalRatios', 'exposures', 'auditTrail'],
    properties: {
      capitalRatios: {
        type: 'object',
        required: ['cet1', 'tier1', 'total'],
        properties: {
          cet1: { type: 'number', minimum: 0 },
          tier1: { type: 'number', minimum: 0 },
          total: { type: 'number', minimum: 0 },
        },
      },
      exposures: {
        type: 'array',
        items: {
          type: 'object',
          required: ['exposureId', 'riskWeight', 'amount'],
          properties: {
            exposureId: { type: 'string' },
            riskWeight: { type: 'number', minimum: 0 },
            amount: { type: 'number', minimum: 0 },
          },
        },
      },
      auditTrail: {
        type: 'object',
        required: ['enabled', 'retentionDays'],
        properties: {
          enabled: { type: 'boolean' },
          retentionDays: { type: 'number', minimum: 0 },
        },
      },
    },
  },
  actionSchema: {
    $id: 'basel-iii-action',
    type: 'object',
    required: ['action'],
    properties: {
      action: { type: 'string' },
    },
  },
  paramsSchema: {
    $id: 'basel-iii-params',
    type: 'object',
    properties: {
      traceId: { type: 'string' },
      counterpartyId: { type: 'string' },
      exposureAmount: { type: 'number', minimum: 0 },
      capitalRatioOverride: { type: 'number', minimum: 0 },
    },
  },
};

const masSandboxHardConstraints: HardConstraint[] = [
  {
    id: 'mas-sandbox-approved-participant',
    description: 'Sandbox actions must be initiated by approved participants.',
    category: 'policy',
    severity: 'hard',
    predicate: (state, action, params) => {
      if (!action?.startsWith('sandbox.')) {
        return true;
      }
      const actorId = params?.actorId as string | undefined;
      const participants = Array.from(state.entities.values()) as Array<{ properties: Record<string, unknown> }>;
      return participants.some((participant) => {
        const properties = participant.properties;
        return properties.id === actorId && properties.approved === true;
      });
    },
    violationMessage: 'Sandbox operation attempted by unapproved participant.',
  },
  {
    id: 'mas-sandbox-data-classification',
    description: 'Sandbox data exports cannot exceed approved classification.',
    category: 'data_zone',
    severity: 'hard',
    predicate: (_state, action, params) => {
      if (action !== 'sandbox.export-data') {
        return true;
      }
      const classification = params?.requestedClassification as string | undefined;
      return classification !== 'restricted';
    },
    violationMessage: 'Restricted data cannot be exported from the sandbox.',
  },
  {
    id: 'mas-sandbox-consent-required',
    description: 'Client onboarding requires explicit consent in sandbox workflows.',
    category: 'policy',
    severity: 'hard',
    predicate: (_state, action, params) => {
      if (action !== 'sandbox.onboard-client') {
        return true;
      }
      return params?.consentStatus === 'granted';
    },
    violationMessage: 'Consent must be granted before onboarding clients.',
  },
];

const masSandboxSoftConstraints: SoftConstraint[] = [
  {
    id: 'mas-sandbox-transaction-cap',
    description: 'Prefer transactions well below sandbox cap.',
    category: 'risk',
    severity: 'soft',
    score: (state, _action, params) => {
      const cap = state.entities.get('risk-controls')?.properties.transactionCap as number | undefined;
      const value = params?.transactionValue as number | undefined;
      if (!cap || value === undefined) {
        return 1;
      }
      return Math.max(0, 1 - value / cap);
    },
    weight: 1.5,
    minScore: 0.2,
  },
];

const baselHardConstraints: HardConstraint[] = [
  {
    id: 'basel-capital-adequacy',
    description: 'Capital ratios must meet Basel III minimums before approving exposure.',
    category: 'risk',
    severity: 'hard',
    predicate: (state, action) => {
      if (action !== 'credit.approve') {
        return true;
      }
      const ratios = state.entities.get('capital-ratios')?.properties as
        | { cet1?: number; tier1?: number; total?: number }
        | undefined;
      if (!ratios) {
        return false;
      }
      return (ratios.cet1 ?? 0) >= 4.5 && (ratios.tier1 ?? 0) >= 6 && (ratios.total ?? 0) >= 8;
    },
    violationMessage: 'Capital ratios below Basel III thresholds.',
  },
  {
    id: 'basel-audit-trace-required',
    description: 'All Basel III governed actions must include a traceId for auditability.',
    category: 'security',
    severity: 'hard',
    predicate: (_state, action, params) => {
      if (!action?.startsWith('credit.')) {
        return true;
      }
      return Boolean(params?.traceId);
    },
    violationMessage: 'Trace ID is required for Basel III audit trail compliance.',
  },
];

const baselSoftConstraints: SoftConstraint[] = [
  {
    id: 'basel-leverage-preference',
    description: 'Prefer exposures with lower leverage impact.',
    category: 'risk',
    severity: 'soft',
    score: (_state, _action, params) => {
      const leverage = params?.leverageImpact as number | undefined;
      if (leverage === undefined) {
        return 1;
      }
      return Math.max(0, 1 - leverage);
    },
    weight: 2,
    minScore: 0.3,
  },
];

export const masSandboxConstraintPack: ConstraintPack = {
  id: 'mas-sandbox',
  name: 'MAS Sandbox Guardrails',
  description: 'Constraint pack for Monetary Authority of Singapore sandbox controls.',
  domain: 'fintech-sandbox',
  version: { major: 1, minor: 0, patch: 0 },
  status: 'draft',
  schema: masSandboxSchema,
  constraints: {
    hard: masSandboxHardConstraints,
    soft: masSandboxSoftConstraints,
  },
  createdBy: 'policy-engineering',
  createdAt: new Date().toISOString(),
  lastUpdatedAt: new Date().toISOString(),
  metadata: {
    jurisdiction: 'SG',
    regulator: 'MAS',
  },
};

export const baselIIIConstraintPack: ConstraintPack = {
  id: 'basel-iii-audit',
  name: 'Basel III Audit Tracing',
  description: 'Constraint pack capturing Basel III capital and audit trace requirements.',
  domain: 'banking-risk',
  version: { major: 1, minor: 0, patch: 0 },
  status: 'draft',
  schema: baselAuditSchema,
  constraints: {
    hard: baselHardConstraints,
    soft: baselSoftConstraints,
  },
  createdBy: 'risk-compliance',
  createdAt: new Date().toISOString(),
  lastUpdatedAt: new Date().toISOString(),
  metadata: {
    regulation: 'Basel III',
    auditScope: 'capital adequacy and traceability',
  },
};

export const exampleConstraintPacks = [masSandboxConstraintPack, baselIIIConstraintPack];
