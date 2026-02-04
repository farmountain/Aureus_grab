import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { TaskSpec, WorkflowSpec } from './types';
import { WorkflowChecker, WorkflowValidationError } from './workflow-checker';
import { SafetyPolicy, DEFAULT_SAFETY_POLICY } from './safety-policy';

/**
 * Options for workflow loading and validation
 */
export interface LoadTaskSpecOptions {
  /**
   * Whether to validate the workflow against a safety policy
   * @default true
   */
  validate?: boolean;
  
  /**
   * Custom safety policy to use for validation
   * If not provided, uses the policy from the workflow spec or DEFAULT_SAFETY_POLICY
   */
  safetyPolicy?: SafetyPolicy;
  
  /**
   * Whether to throw on validation warnings
   * @default false
   */
  strictWarnings?: boolean;
}

/**
 * Load a workflow specification from a YAML file
 * Performs model-checking validation before returning the workflow
 */
export async function loadTaskSpec(
  filePath: string,
  options?: LoadTaskSpecOptions
): Promise<WorkflowSpec> {
  const content = await fs.promises.readFile(filePath, 'utf-8');
  const doc = yaml.load(content) as any;

  // Parse tasks
  const tasks: TaskSpec[] = doc.tasks.map((t: any) => ({
    id: t.id,
    name: t.name || t.id,
    type: t.type || 'action',
    inputs: t.inputs,
    retry: t.retry ? {
      maxAttempts: t.retry.maxAttempts || 1,
      backoffMs: t.retry.backoffMs || 1000,
      backoffMultiplier: t.retry.backoffMultiplier || 2,
      jitter: t.retry.jitter ?? true,
    } : undefined,
    idempotencyKey: t.idempotencyKey,
    timeoutMs: t.timeoutMs,
    riskTier: t.riskTier,
    compensation: t.compensation,
    compensationAction: t.compensationAction,
    toolName: t.toolName,
    requiredPermissions: t.requiredPermissions,
    allowedTools: t.allowedTools,
    intent: t.intent,
    dataZone: t.dataZone,
  }));

  // Parse dependencies
  const dependencies = new Map<string, string[]>();
  if (doc.dependencies) {
    for (const [taskId, deps] of Object.entries(doc.dependencies)) {
      dependencies.set(taskId, deps as string[]);
    }
  }

  // Parse safety policy if present
  let safetyPolicy: SafetyPolicy | undefined;
  if (doc.safetyPolicy) {
    safetyPolicy = parseSafetyPolicy(doc.safetyPolicy);
  }

  const workflow: WorkflowSpec = {
    id: doc.id || 'workflow',
    name: doc.name || 'Unnamed Workflow',
    tasks,
    dependencies,
    safetyPolicy,
  };

  // Perform model-checking validation
  const shouldValidate = options?.validate !== false;
  if (shouldValidate) {
    const policy = options?.safetyPolicy || (workflow.safetyPolicy as SafetyPolicy | undefined) || DEFAULT_SAFETY_POLICY;
    const result = WorkflowChecker.validate(workflow, policy);
    
    if (!result.valid) {
      throw new WorkflowValidationError(result);
    }
    
    // Check if we should treat warnings as errors
    if (options?.strictWarnings && result.warnings.length > 0) {
      throw new WorkflowValidationError({
        ...result,
        valid: false,
        violations: [...result.violations, ...result.warnings],
        warnings: [],
      });
    }
    
    // Log warnings if any
    if (result.warnings.length > 0) {
      console.warn(WorkflowChecker.formatValidationResult(result));
    }
  }

  return workflow;
}

/**
 * Parse a safety policy from a raw object
 */
function parseSafetyPolicy(raw: any): SafetyPolicy {
  return {
    name: raw.name || 'custom',
    description: raw.description,
    failFast: raw.failFast ?? false,
    rules: (raw.rules || []).map((r: any) => ({
      type: r.type,
      enabled: r.enabled !== false,
      severity: r.severity || 'error',
      message: r.message,
      ...r,
    })),
  };
}
