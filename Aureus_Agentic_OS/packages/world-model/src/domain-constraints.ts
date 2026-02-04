import { ConstraintEngine, ConstraintValidationResult, HardConstraint, SoftConstraint } from './constraints';

export type JsonSchema = Record<string, unknown>;

export type ConstraintPackStatus = 'draft' | 'in_review' | 'approved' | 'deployed' | 'retired';

export interface ConstraintPackVersion {
  major: number;
  minor: number;
  patch: number;
  label?: string;
}

export interface ConstraintPackSchema {
  stateSchema: JsonSchema;
  actionSchema: JsonSchema;
  paramsSchema: JsonSchema;
  metadataSchema?: JsonSchema;
}

export interface ConstraintPackAuditEvent {
  packId: string;
  version: ConstraintPackVersion;
  action: 'load' | 'validate' | 'violation' | 'deploy' | 'retire' | 'approval';
  timestamp: string;
  actor: string;
  details?: Record<string, unknown>;
}

export interface ConstraintPackAuditHooks {
  onLoad?: (event: ConstraintPackAuditEvent) => void;
  onValidate?: (event: ConstraintPackAuditEvent) => void;
  onViolation?: (event: ConstraintPackAuditEvent) => void;
  onDeploy?: (event: ConstraintPackAuditEvent) => void;
  onRetire?: (event: ConstraintPackAuditEvent) => void;
  onApproval?: (event: ConstraintPackAuditEvent) => void;
}

export interface ConstraintPackValidationContext {
  stateSample?: Record<string, unknown>;
  actionSample?: Record<string, unknown>;
  paramsSample?: Record<string, unknown>;
}

export interface ConstraintPackValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  engineResult?: ConstraintValidationResult;
}

export interface ConstraintPackValidator {
  validate: (
    pack: ConstraintPack,
    context?: ConstraintPackValidationContext
  ) => ConstraintPackValidationResult;
}

export interface ConstraintPack {
  id: string;
  name: string;
  description: string;
  domain: string;
  version: ConstraintPackVersion;
  status: ConstraintPackStatus;
  schema: ConstraintPackSchema;
  constraints: {
    hard: HardConstraint[];
    soft: SoftConstraint[];
  };
  createdBy: string;
  createdAt: string;
  lastUpdatedAt: string;
  auditHooks?: ConstraintPackAuditHooks;
  validator?: ConstraintPackValidator;
  metadata?: Record<string, unknown>;
}

export interface ConstraintPackDeploymentRecord {
  packId: string;
  version: ConstraintPackVersion;
  deployedAt: string;
  deployedBy: string;
  notes?: string;
}

export interface PolicyApprovalRecord {
  approvalId: string;
  packId: string;
  version: ConstraintPackVersion;
  approver: string;
  approvedAt: string;
  policyReferences: string[];
  conditions?: string[];
}

export type ConstraintEvolutionStage =
  | 'prompt'
  | 'draft'
  | 'crv_validation'
  | 'policy_approval'
  | 'deployment'
  | 'rejected';

export interface ConstraintEvolutionAuditEntry {
  stage: ConstraintEvolutionStage;
  actor: string;
  timestamp: string;
  notes?: string;
}

export interface ConstraintEvolutionRecord {
  id: string;
  prompt: string;
  stage: ConstraintEvolutionStage;
  draftPack?: ConstraintPack;
  crvValidation?: ConstraintPackValidationResult;
  policyApproval?: PolicyApprovalRecord;
  deployment?: ConstraintPackDeploymentRecord;
  history: ConstraintEvolutionAuditEntry[];
}

export interface ConstraintRiskValidationResult {
  passed: boolean;
  issues: string[];
  recommendations: string[];
}

export interface ConstraintRiskValidator {
  validate: (pack: ConstraintPack) => ConstraintRiskValidationResult;
}

const isVersionValid = (version: ConstraintPackVersion): boolean => {
  return (
    Number.isInteger(version.major) &&
    Number.isInteger(version.minor) &&
    Number.isInteger(version.patch) &&
    version.major >= 0 &&
    version.minor >= 0 &&
    version.patch >= 0
  );
};

const nowIso = () => new Date().toISOString();

export const validateConstraintPack = (
  pack: ConstraintPack,
  context?: ConstraintPackValidationContext
): ConstraintPackValidationResult => {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!pack.id.trim()) {
    errors.push('Pack id is required.');
  }

  if (!pack.name.trim()) {
    errors.push('Pack name is required.');
  }

  if (!pack.domain.trim()) {
    errors.push('Pack domain is required.');
  }

  if (!isVersionValid(pack.version)) {
    errors.push('Pack version must be a valid semver object.');
  }

  if (!pack.schema || !pack.schema.stateSchema || !pack.schema.actionSchema || !pack.schema.paramsSchema) {
    errors.push('Pack schema must include state, action, and params schemas.');
  }

  if (pack.constraints.hard.length === 0 && pack.constraints.soft.length === 0) {
    warnings.push('Pack has no constraints defined.');
  }

  let engineResult: ConstraintValidationResult | undefined;

  if (context?.stateSample) {
    const engine = new ConstraintEngine();
    pack.constraints.hard.forEach((constraint) => engine.addHardConstraint(constraint));
    pack.constraints.soft.forEach((constraint) => engine.addSoftConstraint(constraint));

    engineResult = engine.validate(
      context.stateSample as never,
      context.actionSample?.action as string | undefined,
      context.paramsSample
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    engineResult,
  };
};

export class ConstraintPackRegistry {
  private packs = new Map<string, ConstraintPack>();
  private deployments: ConstraintPackDeploymentRecord[] = [];
  private activePackId?: string;

  registerPack(pack: ConstraintPack, actor = 'system'): ConstraintPackValidationResult {
    const validation = pack.validator?.validate(pack) ?? validateConstraintPack(pack);
    pack.auditHooks?.onLoad?.({
      packId: pack.id,
      version: pack.version,
      action: 'load',
      timestamp: nowIso(),
      actor,
      details: { valid: validation.valid },
    });

    if (!validation.valid) {
      return validation;
    }

    this.packs.set(pack.id, pack);
    return validation;
  }

  validatePack(
    packId: string,
    context?: ConstraintPackValidationContext,
    actor = 'system'
  ): ConstraintPackValidationResult {
    const pack = this.packs.get(packId);
    if (!pack) {
      return {
        valid: false,
        errors: [`Constraint pack ${packId} not found.`],
        warnings: [],
      };
    }

    const validation = pack.validator?.validate(pack, context) ?? validateConstraintPack(pack, context);
    pack.auditHooks?.onValidate?.({
      packId: pack.id,
      version: pack.version,
      action: 'validate',
      timestamp: nowIso(),
      actor,
      details: { errors: validation.errors, warnings: validation.warnings },
    });

    return validation;
  }

  deployPack(packId: string, actor = 'system', notes?: string): ConstraintPackDeploymentRecord | null {
    const pack = this.packs.get(packId);
    if (!pack) {
      return null;
    }

    const deployment: ConstraintPackDeploymentRecord = {
      packId: pack.id,
      version: pack.version,
      deployedAt: nowIso(),
      deployedBy: actor,
      notes,
    };

    pack.status = 'deployed';
    pack.lastUpdatedAt = deployment.deployedAt;
    this.activePackId = packId;
    this.deployments.push(deployment);

    pack.auditHooks?.onDeploy?.({
      packId: pack.id,
      version: pack.version,
      action: 'deploy',
      timestamp: deployment.deployedAt,
      actor,
      details: { notes },
    });

    return deployment;
  }

  retirePack(packId: string, actor = 'system', notes?: string): boolean {
    const pack = this.packs.get(packId);
    if (!pack) {
      return false;
    }

    pack.status = 'retired';
    pack.lastUpdatedAt = nowIso();

    pack.auditHooks?.onRetire?.({
      packId: pack.id,
      version: pack.version,
      action: 'retire',
      timestamp: pack.lastUpdatedAt,
      actor,
      details: { notes },
    });

    if (this.activePackId === packId) {
      this.activePackId = undefined;
    }

    return true;
  }

  getPack(packId: string): ConstraintPack | undefined {
    return this.packs.get(packId);
  }

  listPacks(): ConstraintPack[] {
    return Array.from(this.packs.values());
  }

  getActivePack(): ConstraintPack | undefined {
    if (!this.activePackId) {
      return undefined;
    }

    return this.packs.get(this.activePackId);
  }

  getDeploymentHistory(): ConstraintPackDeploymentRecord[] {
    return [...this.deployments];
  }
}

export class ConstraintEvolutionWorkflow {
  private records = new Map<string, ConstraintEvolutionRecord>();

  start(prompt: string, actor: string): ConstraintEvolutionRecord {
    const id = `evolution-${Date.now()}`;
    const record: ConstraintEvolutionRecord = {
      id,
      prompt,
      stage: 'prompt',
      history: [{ stage: 'prompt', actor, timestamp: nowIso() }],
    };

    this.records.set(id, record);
    return record;
  }

  submitDraft(id: string, draftPack: ConstraintPack, actor: string): ConstraintEvolutionRecord | null {
    const record = this.records.get(id);
    if (!record) {
      return null;
    }

    record.draftPack = draftPack;
    record.stage = 'draft';
    record.history.push({ stage: 'draft', actor, timestamp: nowIso() });
    return record;
  }

  runCrvValidation(
    id: string,
    validator: ConstraintRiskValidator,
    actor: string
  ): ConstraintEvolutionRecord | null {
    const record = this.records.get(id);
    if (!record || !record.draftPack) {
      return null;
    }

    const validation = validator.validate(record.draftPack);
    record.crvValidation = {
      valid: validation.passed,
      errors: validation.issues,
      warnings: validation.recommendations,
    };
    record.stage = validation.passed ? 'crv_validation' : 'rejected';
    record.history.push({ stage: record.stage, actor, timestamp: nowIso() });
    return record;
  }

  approvePolicy(id: string, approval: PolicyApprovalRecord, actor: string): ConstraintEvolutionRecord | null {
    const record = this.records.get(id);
    if (!record || record.stage !== 'crv_validation') {
      return null;
    }

    record.policyApproval = approval;
    record.stage = 'policy_approval';
    record.history.push({ stage: 'policy_approval', actor, timestamp: nowIso() });
    return record;
  }

  deploy(
    id: string,
    registry: ConstraintPackRegistry,
    actor: string,
    notes?: string
  ): ConstraintEvolutionRecord | null {
    const record = this.records.get(id);
    if (!record || !record.draftPack || record.stage !== 'policy_approval') {
      return null;
    }

    registry.registerPack(record.draftPack, actor);
    const deployment = registry.deployPack(record.draftPack.id, actor, notes);
    if (!deployment) {
      return null;
    }

    record.deployment = deployment;
    record.stage = 'deployment';
    record.history.push({ stage: 'deployment', actor, timestamp: nowIso() });
    return record;
  }

  getRecord(id: string): ConstraintEvolutionRecord | null {
    return this.records.get(id) ?? null;
  }
}
