import { z } from 'zod';
import type { TaskSpec } from './types';
import type { SafetyPolicy } from './safety-policy';

/**
 * Zod schemas for validating workflow specifications
 * Used by the workflow generator wizard to validate user input
 */

// Risk tier schema
export const RiskTierSchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);

// Intent schema
export const IntentSchema = z.enum(['read', 'write', 'delete', 'execute', 'admin']);

// Data zone schema
export const DataZoneSchema = z.enum(['public', 'internal', 'confidential', 'restricted']);

// Sandbox type schema
export const SandboxTypeSchema = z.enum(['mock', 'simulation', 'container', 'vm', 'process']);

// Sandbox config schema
export const SandboxConfigSchema = z.object({
  enabled: z.boolean(),
  type: SandboxTypeSchema.optional(),
  simulationMode: z.boolean().optional(),
  permissions: z.record(z.string(), z.unknown()).optional(),
});

// Permission schema
export const PermissionSchema = z.object({
  action: z.string(),
  resource: z.string(),
  intent: IntentSchema.optional(),
  dataZone: DataZoneSchema.optional(),
});

// Retry config schema
export const RetryConfigSchema = z.object({
  maxAttempts: z.number().int().min(1),
  backoffMs: z.number().int().min(1),
  backoffMultiplier: z.number().min(0).optional(),
  jitter: z.boolean().optional(),
});

// Compensation action schema
export const CompensationActionSchema = z.object({
  tool: z.string(),
  args: z.record(z.string(), z.unknown()),
});

// Compensation hook schema
export const CompensationHookSchema = z.object({
  onFailure: z.string().optional(),
  onTimeout: z.string().optional(),
});

// Task spec schema
export const TaskSpecSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['action', 'decision', 'parallel']),
  inputs: z.record(z.string(), z.unknown()).optional(),
  retry: RetryConfigSchema.optional(),
  idempotencyKey: z.string().optional(),
  timeoutMs: z.number().int().min(1).optional(),
  riskTier: RiskTierSchema.optional(),
  compensation: CompensationHookSchema.optional(),
  compensationAction: CompensationActionSchema.optional(),
  toolName: z.string().optional(),
  requiredPermissions: z.array(PermissionSchema).optional(),
  allowedTools: z.array(z.string()).optional(),
  intent: IntentSchema.optional(),
  dataZone: DataZoneSchema.optional(),
  sandboxConfig: SandboxConfigSchema.optional(),
});

// Safety rule schema (basic version)
export const SafetyRuleSchema = z.object({
  type: z.string(),
  description: z.string().optional(),
});

// Safety policy schema
export const SafetyPolicySchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  rules: z.array(SafetyRuleSchema),
  failFast: z.boolean().optional(),
});

// Workflow spec schema (for validation - uses Record instead of Map for JSON compatibility)
// Note: The actual WorkflowSpec type in types.ts uses Map<string, string[]> for dependencies
// This schema validates the JSON representation before conversion to the Map-based type
export const WorkflowSpecSchema = z.object({
  id: z.string(),
  name: z.string(),
  goal: z.string().optional(),
  constraints: z.array(z.string()).optional(),
  successCriteria: z.array(z.string()).optional(),
  tasks: z.array(TaskSpecSchema),
  dependencies: z.record(z.string(), z.array(z.string())), // taskId -> dependsOn taskIds
  safetyPolicy: SafetyPolicySchema.optional(),
});

// Type for validating JSON-based workflow specs (before converting to WorkflowSpec)
// This represents the structure that comes from JSON serialization or LLM responses
export type WorkflowSpecJSON = z.infer<typeof WorkflowSpecSchema>;

// Workflow generation request schema
export const WorkflowGenerationRequestSchema = z.object({
  goal: z.string().min(10, 'Goal must be at least 10 characters'),
  constraints: z.array(z.string()).optional(),
  preferredTools: z.array(z.string()).optional(),
  riskTolerance: RiskTierSchema.optional().default('MEDIUM'),
  additionalContext: z.string().optional(),
});

// Export TypeScript types inferred from schemas
export type RiskTier = z.infer<typeof RiskTierSchema>;
export type Intent = z.infer<typeof IntentSchema>;
export type DataZone = z.infer<typeof DataZoneSchema>;
export type SandboxType = z.infer<typeof SandboxTypeSchema>;
export type SandboxConfig = z.infer<typeof SandboxConfigSchema>;
export type Permission = z.infer<typeof PermissionSchema>;
export type WorkflowGenerationRequest = z.infer<typeof WorkflowGenerationRequestSchema>;

/**
 * Validate a workflow specification (JSON format with Record dependencies)
 * @param spec - The workflow spec to validate
 * @returns Validation result with errors if any
 */
export function validateWorkflowSpec(spec: unknown): {
  success: boolean;
  data?: WorkflowSpecJSON;
  errors?: string[];
} {
  try {
    const result = WorkflowSpecSchema.parse(spec);
    return { success: true, data: result };
  } catch (error: any) {
    if (error && error.issues) {
      const errors = error.issues.map((err: any) => {
        const path = err.path.join('.');
        return `${path}: ${err.message}`;
      });
      return { success: false, errors };
    }
    return { success: false, errors: ['Unknown validation error'] };
  }
}

/**
 * Validate a workflow generation request
 * @param request - The request to validate
 * @returns Validation result with errors if any
 */
export function validateGenerationRequest(request: unknown): {
  success: boolean;
  data?: WorkflowGenerationRequest;
  errors?: string[];
} {
  try {
    const result = WorkflowGenerationRequestSchema.parse(request);
    return { success: true, data: result };
  } catch (error: any) {
    if (error && error.issues) {
      const errors = error.issues.map((err: any) => {
        const path = err.path.join('.');
        return `${path}: ${err.message}`;
      });
      return { success: false, errors };
    }
    return { success: false, errors: ['Unknown validation error'] };
  }
}

/**
 * Convert a validated WorkflowSpecJSON to WorkflowSpec
 * This handles the conversion from Record (JSON) to Map (runtime type)
 * @param json - The validated JSON workflow spec
 * @returns WorkflowSpec with Map-based dependencies
 */
export function convertJSONToWorkflowSpec(json: WorkflowSpecJSON): {
  id: string;
  name: string;
  tasks: TaskSpec[];
  dependencies: Map<string, string[]>;
  safetyPolicy?: SafetyPolicy;
} {
  const dependenciesMap = new Map<string, string[]>();
  Object.entries(json.dependencies).forEach(([key, value]) => {
    dependenciesMap.set(key, value);
  });

  return {
    id: json.id,
    name: json.name,
    tasks: json.tasks,
    dependencies: dependenciesMap,
    safetyPolicy: json.safetyPolicy as SafetyPolicy | undefined,
  };
}
