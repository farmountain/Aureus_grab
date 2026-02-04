import { z } from 'zod';

/**
 * Zod schemas for validating agent specifications
 * Used by the agent studio to validate agent blueprints
 */

// Domain enumeration for agent specialization
export const DomainSchema = z.enum([
  'general',
  'robotics',
  'healthcare',
  'finance',
  'retail',
  'manufacturing',
  'logistics',
  'education',
  'entertainment',
  'travel',
  'industrial',
  'custom',
]);

// Device class enumeration
export const DeviceClassSchema = z.enum([
  'cloud',
  'edge',
  'mobile',
  'wearable',
  'embedded',
  'robot',
  'humanoid',
  'iot',
  'desktop',
  'server',
]);

// Deployment target enumeration
export const DeploymentTargetSchema = z.enum([
  'robotics',
  'humanoid',
  'software',
  'travel',
  'retail',
  'industrial',
  'smartphone',
  'desktop',
  'smart-glasses',
  'cloud',
  'edge',
]);

// Required capabilities for different deployment targets
export const CapabilitySchema = z.enum([
  // Sensor capabilities
  'camera',
  'lidar',
  'radar',
  'microphone',
  'gps',
  'imu',
  'temperature',
  'pressure',
  'proximity',
  'touchscreen',
  // Actuator capabilities
  'motors',
  'servos',
  'grippers',
  'wheels',
  'legs',
  'arms',
  'display',
  'speaker',
  'haptic',
  // API/Software capabilities
  'http-client',
  'database',
  'file-system',
  'network',
  'websocket',
  'messaging',
  'payment-api',
  'map-api',
  'calendar-api',
  'email-api',
  // Perception capabilities
  'object-detection',
  'face-recognition',
  'speech-recognition',
  'nlp',
  'ocr',
  'gesture-recognition',
  // Computational capabilities
  'gpu',
  'tpu',
  'neural-engine',
  'low-latency',
  'real-time',
]);

// Deployment target to required capabilities mapping
export const DeploymentTargetCapabilitiesMap: Record<string, string[]> = {
  robotics: [
    'motors',
    'servos',
    'camera',
    'lidar',
    'imu',
    'object-detection',
    'real-time',
    'low-latency',
  ],
  humanoid: [
    'motors',
    'servos',
    'arms',
    'legs',
    'camera',
    'microphone',
    'speaker',
    'imu',
    'object-detection',
    'face-recognition',
    'speech-recognition',
    'gesture-recognition',
    'real-time',
    'low-latency',
  ],
  software: [
    'http-client',
    'database',
    'file-system',
    'network',
    'nlp',
  ],
  travel: [
    'gps',
    'map-api',
    'http-client',
    'payment-api',
    'camera',
    'touchscreen',
    'display',
  ],
  retail: [
    'payment-api',
    'database',
    'http-client',
    'camera',
    'ocr',
    'touchscreen',
    'display',
  ],
  industrial: [
    'motors',
    'servos',
    'camera',
    'lidar',
    'temperature',
    'pressure',
    'proximity',
    'object-detection',
    'real-time',
    'low-latency',
  ],
  smartphone: [
    'camera',
    'microphone',
    'speaker',
    'gps',
    'touchscreen',
    'display',
    'http-client',
    'network',
    'nlp',
  ],
  desktop: [
    'display',
    'network',
    'http-client',
    'file-system',
    'database',
    'nlp',
  ],
  'smart-glasses': [
    'camera',
    'microphone',
    'speaker',
    'display',
    'imu',
    'gesture-recognition',
    'object-detection',
    'speech-recognition',
  ],
  cloud: [
    'http-client',
    'database',
    'network',
    'messaging',
    'gpu',
    'nlp',
  ],
  edge: [
    'camera',
    'network',
    'http-client',
    'object-detection',
    'low-latency',
    'neural-engine',
  ],
};

// Tool adapter configuration
export const ToolAdapterSchema = z.object({
  adapterId: z.string(),
  adapterType: z.enum(['perception', 'actuator', 'api', 'sensor', 'custom']),
  name: z.string(),
  enabled: z.boolean().default(true),
  requiredCapabilities: z.array(CapabilitySchema).optional(),
  configuration: z.record(z.string(), z.unknown()).optional(),
});

// Risk profile schema (similar to RiskTier but more agent-focused)
export const RiskProfileSchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);

// Agent tool configuration
export const AgentToolConfigSchema = z.object({
  toolId: z.string(),
  name: z.string(),
  enabled: z.boolean().default(true),
  permissions: z.array(z.string()).optional(),
  parameters: z.record(z.string(), z.unknown()).optional(),
  riskTier: RiskProfileSchema.optional(),
});

// Agent policy configuration
export const AgentPolicyConfigSchema = z.object({
  policyId: z.string(),
  name: z.string(),
  enabled: z.boolean().default(true),
  rules: z.array(z.object({
    type: z.string(),
    description: z.string().optional(),
    parameters: z.record(z.string(), z.unknown()).optional(),
  })),
  failFast: z.boolean().optional(),
});

// Agent workflow reference
export const AgentWorkflowRefSchema = z.object({
  workflowId: z.string(),
  name: z.string(),
  description: z.string().optional(),
  triggerConditions: z.array(z.string()).optional(),
  priority: z.number().int().min(0).optional(),
});

// Reasoning loop configuration schema
export const ReasoningLoopConfigSchema = z.object({
  enabled: z.boolean().default(true),
  maxIterations: z.number().int().min(1).max(100).default(10),
  pattern: z.enum(['plan_act_reflect', 'reason_act', 'observe_orient_decide_act']).default('plan_act_reflect'),
  reflectionEnabled: z.boolean().default(true),
  reflectionTriggers: z.array(z.enum(['task_completion', 'failure', 'milestone', 'iteration_end'])).default(['task_completion', 'failure']),
  planningStrategy: z.enum(['hierarchical', 'sequential', 'adaptive']).default('adaptive'),
  minConfidenceThreshold: z.number().min(0).max(1).optional(),
});

// Tool policy constraints schema
export const ToolPolicyConstraintsSchema = z.object({
  allowedTools: z.array(z.string()).optional(),
  forbiddenTools: z.array(z.string()).optional().default([]),
  toolRiskThresholds: z.record(z.string(), RiskProfileSchema).optional(),
  requireApprovalFor: z.array(z.string()).optional().default([]),
  rateLimits: z.record(z.string(), z.object({
    maxCallsPerMinute: z.number().int().min(1).optional(),
    maxCallsPerHour: z.number().int().min(1).optional(),
    maxCallsPerDay: z.number().int().min(1).optional(),
  })).optional(),
  toolTimeout: z.number().int().min(100).optional(), // milliseconds
});

// Memory persistence settings schema
export const MemorySettingsSchema = z.object({
  enabled: z.boolean().default(true),
  persistenceType: z.enum(['episodic', 'long-term', 'hybrid']).default('hybrid'),
  retentionPolicy: z.object({
    episodicNotes: z.string().default('30d'),
    artifacts: z.string().default('90d'),
    snapshots: z.string().default('7d'),
  }).optional(),
  indexingStrategy: z.enum(['temporal', 'semantic', 'hybrid']).default('temporal'),
  autoReflection: z.boolean().default(true),
  reflectionInterval: z.enum(['task_completion', 'hourly', 'daily', 'milestone']).default('task_completion'),
  maxMemoryEntries: z.number().int().min(1).optional(),
});

// Governance settings schema (CRV + policy thresholds)
export const GovernanceSettingsSchema = z.object({
  crvValidation: z.object({
    enabled: z.boolean().default(true),
    blockOnFailure: z.boolean().default(true),
    validators: z.array(z.string()).default(['schema', 'security', 'logic_consistency']),
    customValidators: z.array(z.string()).optional(),
  }),
  policyEnforcement: z.object({
    enabled: z.boolean().default(true),
    strictMode: z.boolean().default(true),
    approvalThresholds: z.record(RiskProfileSchema, z.enum([
      'auto_approve',
      'human_approval_required',
      'multi_party_approval_required',
      'blocked',
    ])).default({
      LOW: 'auto_approve',
      MEDIUM: 'auto_approve',
      HIGH: 'human_approval_required',
      CRITICAL: 'multi_party_approval_required',
    }),
    approvalTimeout: z.number().int().min(1000).optional(), // milliseconds
  }),
  auditLevel: z.enum(['minimal', 'standard', 'verbose']).default('standard'),
  rollbackEnabled: z.boolean().default(true),
});

// Agent configuration
export const AgentConfigSchema = z.object({
  prompt: z.string().min(10, 'Agent prompt must be at least 10 characters'),
  systemPrompt: z.string().optional(),
  temperature: z.number().min(0).max(2).optional().default(0.7),
  maxTokens: z.number().int().min(1).optional(),
  model: z.string().optional(),
  stopSequences: z.array(z.string()).optional(),
});

// Specialized deployment targets that should have specific domains
const SPECIALIZED_DEPLOYMENT_TARGETS: DeploymentTarget[] = ['robotics', 'humanoid', 'travel', 'retail', 'industrial'];

// Device class to deployment target compatibility mapping
const DEVICE_CLASS_TARGET_MAP: Record<string, DeploymentTarget[]> = {
  robot: ['robotics', 'industrial'],
  humanoid: ['humanoid'],
  mobile: ['smartphone', 'travel'],
  wearable: ['smart-glasses'],
  cloud: ['cloud', 'software'],
  edge: ['edge'],
  desktop: ['desktop', 'software', 'retail'],
};

// Agent Blueprint schema
export const AgentBlueprintSchema = z.object({
  id: z.string(),
  name: z.string().min(1, 'Agent name is required'),
  version: z.string().default('1.0.0'),
  description: z.string().optional(),
  goal: z.string().min(10, 'Agent goal must be at least 10 characters'),
  riskProfile: RiskProfileSchema.default('MEDIUM'),
  
  // Domain and deployment specifications
  domain: DomainSchema.optional().default('general'),
  deviceClass: DeviceClassSchema.optional(),
  deploymentTarget: DeploymentTargetSchema.optional(),
  requiredCapabilities: z.array(CapabilitySchema).optional().default([]),
  
  // Core configuration
  config: AgentConfigSchema,
  
  // Tool adapters (perception, actuators, sensors, APIs)
  toolAdapters: z.array(ToolAdapterSchema).optional().default([]),
  
  // Tools and capabilities
  tools: z.array(AgentToolConfigSchema).default([]),
  
  // Policies and governance
  policies: z.array(AgentPolicyConfigSchema).default([]),
  
  // Workflows (agent can execute multiple workflows)
  workflows: z.array(AgentWorkflowRefSchema).default([]),
  
  // Constraints and guardrails
  constraints: z.array(z.string()).optional(),
  maxExecutionTime: z.number().int().min(1).optional(), // milliseconds
  maxRetries: z.number().int().min(0).optional(),
  
  // Success criteria
  successCriteria: z.array(z.string()).optional(),
  
  // Manus-like agent capabilities (new)
  reasoningLoop: ReasoningLoopConfigSchema.optional(),
  toolPolicyConstraints: ToolPolicyConstraintsSchema.optional(),
  memorySettings: MemorySettingsSchema.optional(),
  governanceSettings: GovernanceSettingsSchema.optional(),
  
  // Metadata
  tags: z.array(z.string()).optional(),
  owner: z.string().optional(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
}).refine(
  (data) => {
    // If deploymentTarget is specified, requiredCapabilities must not be empty
    return !data.deploymentTarget || (data.requiredCapabilities?.length ?? 0) > 0;
  },
  {
    message: 'requiredCapabilities must be specified when deploymentTarget is set',
    path: ['requiredCapabilities'],
  }
);

// Agent generation request schema
export const AgentGenerationRequestSchema = z.object({
  goal: z.string().min(10, 'Goal must be at least 10 characters'),
  constraints: z.array(z.string()).optional(),
  preferredTools: z.array(z.string()).optional(),
  riskProfile: RiskProfileSchema.optional().default('MEDIUM'),
  additionalContext: z.string().optional(),
  policyRequirements: z.array(z.string()).optional(),
  domain: DomainSchema.optional(),
  deploymentTarget: DeploymentTargetSchema.optional(),
  deviceClass: DeviceClassSchema.optional(),
}).refine(
  (data) => {
    // If deploymentTarget is specified, domain should also be specified
    if (data.deploymentTarget && !data.domain) {
      return false;
    }
    return true;
  },
  {
    message: 'domain must be specified when deploymentTarget is set',
    path: ['domain'],
  }
).refine(
  (data) => {
    // If deploymentTarget is specified, deviceClass should also be specified
    if (data.deploymentTarget && !data.deviceClass) {
      return false;
    }
    return true;
  },
  {
    message: 'deviceClass must be specified when deploymentTarget is set',
    path: ['deviceClass'],
  }
);

// Agent validation request schema
export const AgentValidationRequestSchema = z.object({
  blueprint: AgentBlueprintSchema,
  validatePolicies: z.boolean().optional().default(true),
  validateTools: z.boolean().optional().default(true),
  validateWorkflows: z.boolean().optional().default(true),
});

// Agent simulation request schema
export const AgentSimulationRequestSchema = z.object({
  blueprint: AgentBlueprintSchema,
  testScenario: z.object({
    description: z.string(),
    inputs: z.record(z.string(), z.unknown()),
    expectedOutputs: z.record(z.string(), z.unknown()).optional(),
  }),
  dryRun: z.boolean().default(true),
});

// Agent deployment request schema
export const AgentDeploymentRequestSchema = z.object({
  blueprint: AgentBlueprintSchema,
  environment: z.enum(['development', 'staging', 'production']).default('development'),
  autoPromote: z.boolean().default(false),
  approvalRequired: z.boolean().default(true),
});

// Export TypeScript types inferred from schemas
export type Domain = z.infer<typeof DomainSchema>;
export type DeviceClass = z.infer<typeof DeviceClassSchema>;
export type DeploymentTarget = z.infer<typeof DeploymentTargetSchema>;
export type Capability = z.infer<typeof CapabilitySchema>;
export type ToolAdapter = z.infer<typeof ToolAdapterSchema>;
export type RiskProfile = z.infer<typeof RiskProfileSchema>;
export type AgentToolConfig = z.infer<typeof AgentToolConfigSchema>;
export type AgentPolicyConfig = z.infer<typeof AgentPolicyConfigSchema>;
export type AgentWorkflowRef = z.infer<typeof AgentWorkflowRefSchema>;
export type AgentConfig = z.infer<typeof AgentConfigSchema>;
export type ReasoningLoopConfig = z.infer<typeof ReasoningLoopConfigSchema>;
export type ToolPolicyConstraints = z.infer<typeof ToolPolicyConstraintsSchema>;
export type MemorySettings = z.infer<typeof MemorySettingsSchema>;
export type GovernanceSettings = z.infer<typeof GovernanceSettingsSchema>;
export type AgentBlueprint = z.infer<typeof AgentBlueprintSchema>;
export type AgentGenerationRequest = z.infer<typeof AgentGenerationRequestSchema>;
export type AgentValidationRequest = z.infer<typeof AgentValidationRequestSchema>;
export type AgentSimulationRequest = z.infer<typeof AgentSimulationRequestSchema>;
export type AgentDeploymentRequest = z.infer<typeof AgentDeploymentRequestSchema>;

/**
 * Validate an agent blueprint
 * @param blueprint - The agent blueprint to validate
 * @returns Validation result with errors if any
 */
export function validateAgentBlueprint(blueprint: unknown): {
  success: boolean;
  data?: AgentBlueprint;
  errors?: string[];
} {
  try {
    const result = AgentBlueprintSchema.parse(blueprint);
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
 * Validate an agent generation request
 * @param request - The request to validate
 * @returns Validation result with errors if any
 */
export function validateAgentGenerationRequest(request: unknown): {
  success: boolean;
  data?: AgentGenerationRequest;
  errors?: string[];
} {
  try {
    const result = AgentGenerationRequestSchema.parse(request);
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
 * Validate an agent validation request
 * @param request - The request to validate
 * @returns Validation result with errors if any
 */
export function validateAgentValidationRequest(request: unknown): {
  success: boolean;
  data?: AgentValidationRequest;
  errors?: string[];
} {
  try {
    const result = AgentValidationRequestSchema.parse(request);
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
 * Validate an agent simulation request
 * @param request - The request to validate
 * @returns Validation result with errors if any
 */
export function validateAgentSimulationRequest(request: unknown): {
  success: boolean;
  data?: AgentSimulationRequest;
  errors?: string[];
} {
  try {
    const result = AgentSimulationRequestSchema.parse(request);
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
 * Validate an agent deployment request
 * @param request - The request to validate
 * @returns Validation result with errors if any
 */
export function validateAgentDeploymentRequest(request: unknown): {
  success: boolean;
  data?: AgentDeploymentRequest;
  errors?: string[];
} {
  try {
    const result = AgentDeploymentRequestSchema.parse(request);
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
 * Get required capabilities for a deployment target
 * @param target - The deployment target
 * @returns Array of required capabilities
 */
export function getRequiredCapabilities(target: DeploymentTarget): Capability[] {
  return (DeploymentTargetCapabilitiesMap[target] || []) as Capability[];
}

/**
 * Validate that an agent blueprint has the required capabilities for its deployment target
 * @param blueprint - The agent blueprint to validate
 * @returns Validation result with missing capabilities if any
 */
export function validateDeploymentTargetCompatibility(blueprint: AgentBlueprint): {
  compatible: boolean;
  missingCapabilities?: Capability[];
  errors?: string[];
} {
  if (!blueprint.deploymentTarget) {
    return { compatible: true, missingCapabilities: [] };
  }

  const requiredCapabilities = getRequiredCapabilities(blueprint.deploymentTarget);
  const providedCapabilities = blueprint.requiredCapabilities || [];
  
  const missingCapabilities = requiredCapabilities.filter(
    (cap) => !providedCapabilities.includes(cap as Capability)
  ) as Capability[];

  if (missingCapabilities.length > 0) {
    return {
      compatible: false,
      missingCapabilities,
      errors: [
        `Agent blueprint for deployment target '${blueprint.deploymentTarget}' is missing required capabilities: ${missingCapabilities.join(', ')}`,
      ],
    };
  }

  return { compatible: true, missingCapabilities: [] };
}

/**
 * Validate that tool adapters provide the required capabilities
 * @param toolAdapters - Array of tool adapters
 * @param requiredCapabilities - Array of required capabilities
 * @returns Validation result with missing capabilities if any
 */
export function validateToolAdapterCapabilities(
  toolAdapters: ToolAdapter[],
  requiredCapabilities: Capability[]
): {
  compatible: boolean;
  missingCapabilities?: Capability[];
  errors?: string[];
} {
  const providedCapabilities = new Set<Capability>();
  
  // Collect all capabilities provided by tool adapters
  toolAdapters.forEach((adapter) => {
    if (adapter.requiredCapabilities) {
      adapter.requiredCapabilities.forEach((cap) => providedCapabilities.add(cap));
    }
  });

  const missingCapabilities = requiredCapabilities.filter(
    (cap) => !providedCapabilities.has(cap)
  );

  if (missingCapabilities.length > 0) {
    return {
      compatible: false,
      missingCapabilities,
      errors: [
        `Tool adapters do not provide required capabilities: ${missingCapabilities.join(', ')}`,
      ],
    };
  }

  return { compatible: true };
}

/**
 * Validate deployment target requirements including domain and device class consistency
 * @param blueprint - The agent blueprint to validate
 * @returns Validation result with errors and warnings if any
 */
export function validateDeploymentTargetRequirements(blueprint: AgentBlueprint): {
  valid: boolean;
  errors?: string[];
  warnings?: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  // If deploymentTarget is specified, check domain consistency
  if (blueprint.deploymentTarget) {
    // Check if domain is set and not 'general' for specific deployment targets
    if (SPECIALIZED_DEPLOYMENT_TARGETS.includes(blueprint.deploymentTarget)) {
      if (!blueprint.domain || blueprint.domain === 'general') {
        warnings.push(
          `Deployment target '${blueprint.deploymentTarget}' is specialized but domain is '${blueprint.domain || 'general'}'. ` +
          `Consider setting a more specific domain.`
        );
      }
    }

    // Check deviceClass consistency with deploymentTarget
    if (blueprint.deviceClass) {
      const compatibleTargets = DEVICE_CLASS_TARGET_MAP[blueprint.deviceClass] || [];
      if (compatibleTargets.length > 0 && !compatibleTargets.includes(blueprint.deploymentTarget)) {
        errors.push(
          `Device class '${blueprint.deviceClass}' is not compatible with deployment target '${blueprint.deploymentTarget}'. ` +
          `Compatible targets for ${blueprint.deviceClass}: ${compatibleTargets.join(', ')}`
        );
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

/**
 * Validate capability consistency between blueprint, tool adapters, and deployment target
 * @param blueprint - The agent blueprint to validate
 * @returns Validation result with errors and warnings if any
 */
export function validateCapabilityConsistency(blueprint: AgentBlueprint): {
  valid: boolean;
  errors?: string[];
  warnings?: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  const requiredCapabilities = blueprint.requiredCapabilities || [];
  const toolAdapters = blueprint.toolAdapters || [];

  // If toolAdapters are specified, check if they provide the required capabilities
  if (toolAdapters.length > 0 && requiredCapabilities.length > 0) {
    const adapterValidation = validateToolAdapterCapabilities(toolAdapters, requiredCapabilities);
    if (!adapterValidation.compatible) {
      warnings.push(...(adapterValidation.errors || []));
    }
  }

  // Check if capabilities are specified but toolAdapters are not
  if (requiredCapabilities.length > 0 && toolAdapters.length === 0) {
    warnings.push(
      'Required capabilities are specified but no tool adapters are configured. ' +
      'Consider adding tool adapters to provide these capabilities.'
    );
  }

  // Check for unused toolAdapters (adapters that don't provide any required capabilities)
  if (toolAdapters.length > 0 && requiredCapabilities.length > 0) {
    const unusedAdapters = toolAdapters.filter((adapter) => {
      if (!adapter.requiredCapabilities || adapter.requiredCapabilities.length === 0) {
        return false;
      }
      return !adapter.requiredCapabilities.some((cap) => requiredCapabilities.includes(cap));
    });

    if (unusedAdapters.length > 0) {
      warnings.push(
        `The following tool adapters do not provide any required capabilities: ${unusedAdapters.map(a => a.name).join(', ')}. ` +
        'Consider removing them or updating requiredCapabilities.'
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

/**
 * Comprehensive validation of agent blueprint including deployment target compatibility
 * @param blueprint - The agent blueprint to validate
 * @returns Comprehensive validation result
 */
export function validateAgentBlueprintComprehensive(blueprint: unknown): {
  valid: boolean;
  data?: AgentBlueprint;
  errors?: string[];
  warnings?: string[];
  details: {
    schema: { valid: boolean; errors?: string[] };
    deploymentCompatibility: { compatible: boolean; missingCapabilities?: string[] };
    tools: { valid: boolean };
    policies: { valid: boolean };
    workflows: { valid: boolean };
    toolAdapters?: { valid: boolean; warnings?: string[] };
  };
} {
  // First validate the schema
  const schemaValidation = validateAgentBlueprint(blueprint);
  
  const result: {
    valid: boolean;
    data?: AgentBlueprint;
    errors?: string[];
    warnings?: string[];
    details: {
      schema: { valid: boolean; errors?: string[] };
      deploymentCompatibility: { compatible: boolean; missingCapabilities?: string[] };
      tools: { valid: boolean };
      policies: { valid: boolean };
      workflows: { valid: boolean };
      toolAdapters?: { valid: boolean; warnings?: string[] };
    };
  } = {
    valid: schemaValidation.success,
    data: schemaValidation.data,
    errors: schemaValidation.errors,
    warnings: [],
    details: {
      schema: {
        valid: schemaValidation.success,
        errors: schemaValidation.errors,
      },
      deploymentCompatibility: {
        compatible: true,
        missingCapabilities: [],
      },
      tools: { valid: true },
      policies: { valid: true },
      workflows: { valid: true },
    },
  };

  if (!schemaValidation.success) {
    return result;
  }

  const validBlueprint = schemaValidation.data!;
  const warnings: string[] = [];
  const errors: string[] = [];

  // Validate deployment target requirements
  const targetRequirements = validateDeploymentTargetRequirements(validBlueprint);
  if (!targetRequirements.valid && targetRequirements.errors) {
    errors.push(...targetRequirements.errors);
  }
  if (targetRequirements.warnings) {
    warnings.push(...targetRequirements.warnings);
  }

  // Validate deployment target compatibility (missing capabilities)
  const compatibilityValidation = validateDeploymentTargetCompatibility(validBlueprint);
  result.details.deploymentCompatibility = {
    compatible: compatibilityValidation.compatible,
    missingCapabilities: compatibilityValidation.missingCapabilities || [],
  };
  
  if (!compatibilityValidation.compatible && compatibilityValidation.errors) {
    warnings.push(...compatibilityValidation.errors);
  }

  // Validate capability consistency
  const capabilityConsistency = validateCapabilityConsistency(validBlueprint);
  if (!capabilityConsistency.valid && capabilityConsistency.errors) {
    errors.push(...capabilityConsistency.errors);
  }
  if (capabilityConsistency.warnings) {
    warnings.push(...capabilityConsistency.warnings);
  }

  // Validate tool adapters if present
  if (validBlueprint.toolAdapters && validBlueprint.toolAdapters.length > 0) {
    const adapterWarnings: string[] = [];
    const providedCapabilities = new Set<string>();
    
    // Collect all capabilities from adapters
    validBlueprint.toolAdapters.forEach(adapter => {
      if (adapter.requiredCapabilities) {
        adapter.requiredCapabilities.forEach(cap => providedCapabilities.add(cap));
      }
    });
    
    // Check if adapters cover required capabilities
    const requiredCaps = validBlueprint.requiredCapabilities || [];
    const missingFromAdapters = requiredCaps.filter(cap => !providedCapabilities.has(cap));
    
    if (missingFromAdapters.length > 0) {
      adapterWarnings.push(
        `Tool adapters do not provide all required capabilities. Missing: ${missingFromAdapters.join(', ')}`
      );
      warnings.push(...adapterWarnings);
    }
    
    // Tool adapters are valid if they are structurally correct (warnings don't invalidate)
    result.details.toolAdapters = {
      valid: true, // Structural validity; coverage gaps are warnings
      warnings: adapterWarnings.length > 0 ? adapterWarnings : undefined,
    };
  }

  // Set final result
  result.valid = errors.length === 0;
  result.errors = errors.length > 0 ? errors : undefined;
  result.warnings = warnings.length > 0 ? warnings : undefined;

  return result;
}

/**
 * Validate agent blueprint against runtime adapter registry
 * This validates that the blueprint's deployment target is supported by registered runtime adapters
 * 
 * @param blueprint - The agent blueprint to validate
 * @param registry - The runtime adapter registry to validate against (optional, uses global if not provided)
 * @returns Validation result with runtime compatibility information
 */
export async function validateAgentBlueprintWithRuntime(
  blueprint: unknown,
  registry?: { 
    validateBlueprint(blueprint: {
      deploymentTarget?: string;
      requiredCapabilities?: string[];
      toolAdapters?: Array<{
        adapterId: string;
        adapterType: string;
        requiredCapabilities?: string[];
      }>;
    }): Promise<{
      valid: boolean;
      errors?: string[];
      warnings?: string[];
      compatibleAdapters?: string[];
      recommendedAdapter?: string;
    }>;
  }
): Promise<{
  success: boolean;
  data?: AgentBlueprint;
  errors?: string[];
  warnings?: string[];
  runtimeValidation?: {
    compatibleAdapters?: string[];
    recommendedAdapter?: string;
  };
}> {
  // First do comprehensive schema validation
  const schemaValidation = validateAgentBlueprintComprehensive(blueprint);
  if (!schemaValidation.valid) {
    return {
      success: schemaValidation.valid,
      data: schemaValidation.data,
      errors: schemaValidation.errors,
      warnings: schemaValidation.warnings,
    };
  }

  const validBlueprint = schemaValidation.data!;
  const errors: string[] = [];
  const warnings: string[] = [...(schemaValidation.warnings || [])];

  // If registry is provided, validate against runtime adapters
  if (registry) {
    try {
      const runtimeValidation = await registry.validateBlueprint({
        deploymentTarget: validBlueprint.deploymentTarget,
        requiredCapabilities: validBlueprint.requiredCapabilities,
        toolAdapters: validBlueprint.toolAdapters?.map(adapter => ({
          adapterId: adapter.adapterId,
          adapterType: adapter.adapterType,
          requiredCapabilities: adapter.requiredCapabilities,
        })),
      });

      if (!runtimeValidation.valid) {
        errors.push(...(runtimeValidation.errors || []));
      }

      if (runtimeValidation.warnings) {
        warnings.push(...runtimeValidation.warnings);
      }

      // If validation failed against runtime, return errors
      if (errors.length > 0) {
        return {
          success: false,
          data: validBlueprint,
          errors,
          warnings: warnings.length > 0 ? warnings : undefined,
        };
      }

      return {
        success: true,
        data: validBlueprint,
        warnings: warnings.length > 0 ? warnings : undefined,
        runtimeValidation: {
          compatibleAdapters: runtimeValidation.compatibleAdapters,
          recommendedAdapter: runtimeValidation.recommendedAdapter,
        },
      };
    } catch (error: any) {
      errors.push(`Runtime validation error: ${error.message}`);
      return {
        success: false,
        data: validBlueprint,
        errors,
        warnings: warnings.length > 0 ? warnings : undefined,
      };
    }
  }

  // If no registry provided, just return schema validation result
  return {
    success: true,
    data: validBlueprint,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

/**
 * MCP (Model Context Protocol) Action Schema
 * Extends tool configuration with MCP-specific requirements
 */
export const MCPActionSchema = z.object({
  name: z.string().min(1, 'Action name is required'),
  description: z.string().min(10, 'Action description must be at least 10 characters'),
  inputSchema: z.object({
    type: z.literal('object'),
    properties: z.record(z.string(), z.object({
      type: z.string(),
      description: z.string().optional(),
      enum: z.array(z.string()).optional(),
    })),
    required: z.array(z.string()).optional(),
  }),
  outputSchema: z.object({
    type: z.string(),
    description: z.string().optional(),
  }).optional(),
  riskTier: RiskProfileSchema,
  requiredPermissions: z.array(z.string()).optional(),
  requiresApproval: z.boolean(),
  crvValidation: z.boolean().optional(),
}).refine(
  (data) => {
    // Rule 1: HIGH/CRITICAL risk tiers must have required permissions
    if ((data.riskTier === 'HIGH' || data.riskTier === 'CRITICAL')) {
      return data.requiredPermissions && data.requiredPermissions.length > 0;
    }
    return true;
  },
  {
    message: 'HIGH and CRITICAL risk tiers must have required permissions defined',
    path: ['requiredPermissions'],
  }
).refine(
  (data) => {
    // Rule 2: CRITICAL risk tier must require approval
    if (data.riskTier === 'CRITICAL') {
      return data.requiresApproval === true;
    }
    return true;
  },
  {
    message: 'CRITICAL risk tier must require approval',
    path: ['requiresApproval'],
  }
);

/**
 * MCP Server Definition Schema
 */
export const MCPServerDefinitionSchema = z.object({
  name: z.string().min(1, 'Server name is required'),
  version: z.string().default('1.0.0'),
  description: z.string().min(10, 'Server description must be at least 10 characters'),
  actions: z.array(MCPActionSchema).min(1, 'At least one action is required'),
  metadata: z.object({
    generatedAt: z.union([z.date(), z.string().datetime()]).transform(val => 
      typeof val === 'string' ? new Date(val) : val
    ),
    totalActions: z.number().int().min(0),
    riskDistribution: z.record(RiskProfileSchema, z.number().int().min(0)),
  }),
});

/**
 * MCP Generation Request Schema
 */
export const MCPGenerationRequestSchema = z.object({
  serverName: z.string().min(1, 'Server name is required'),
  serverVersion: z.string().optional().default('1.0.0'),
  serverDescription: z.string().optional(),
  tools: z.array(z.object({
    name: z.string().min(1),
    description: z.string().min(10),
    parameters: z.array(z.object({
      name: z.string().min(1),
      type: z.string().min(1),
      description: z.string().optional(),
      required: z.boolean().optional(),
    })),
    returns: z.object({
      type: z.string(),
      description: z.string().optional(),
    }).optional(),
    capabilities: z.array(z.string()).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })).min(1, 'At least one tool is required'),
  defaultRiskTier: RiskProfileSchema.optional().default('MEDIUM'),
  enableCRVValidation: z.boolean().optional().default(false),
  inferRiskFromCapabilities: z.boolean().optional().default(true),
});

/**
 * MCP Validation Request Schema
 */
export const MCPValidationRequestSchema = z.object({
  server: MCPServerDefinitionSchema.optional(),
  action: MCPActionSchema.optional(),
}).refine(
  (data) => data.server || data.action,
  {
    message: 'Either server or action must be provided for validation',
  }
);

// Export TypeScript types inferred from MCP schemas
export type MCPAction = z.infer<typeof MCPActionSchema>;
export type MCPServerDefinition = z.infer<typeof MCPServerDefinitionSchema>;
export type MCPGenerationRequest = z.infer<typeof MCPGenerationRequestSchema>;
export type MCPValidationRequest = z.infer<typeof MCPValidationRequestSchema>;

/**
 * Validate MCP action schema with governance rules
 * @param action - The MCP action to validate
 * @returns Validation result with errors if any
 */
export function validateMCPAction(action: unknown): {
  success: boolean;
  data?: MCPAction;
  errors?: string[];
  warnings?: string[];
} {
  try {
    const result = MCPActionSchema.parse(action);
    const warnings: string[] = [];

    // Add warnings for best practices
    if (result.riskTier === 'HIGH' && !result.crvValidation) {
      warnings.push('HIGH risk tier actions should enable CRV validation for better security');
    }

    if (!result.inputSchema.properties || Object.keys(result.inputSchema.properties).length === 0) {
      warnings.push('Action has no input parameters defined');
    }

    return {
      success: true,
      data: result,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
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
 * Validate MCP server definition
 * @param server - The MCP server definition to validate
 * @returns Validation result with errors if any
 */
export function validateMCPServer(server: unknown): {
  success: boolean;
  data?: MCPServerDefinition;
  errors?: string[];
  warnings?: string[];
} {
  try {
    const result = MCPServerDefinitionSchema.parse(server);
    const warnings: string[] = [];

    // Validate each action and collect warnings
    result.actions.forEach(action => {
      const actionValidation = validateMCPAction(action);
      if (actionValidation.warnings) {
        warnings.push(...actionValidation.warnings.map(w => `[${action.name}] ${w}`));
      }
    });

    // Check for risk distribution warnings
    const criticalCount = result.metadata.riskDistribution.CRITICAL || 0;
    if (criticalCount > 3) {
      warnings.push(
        `Server has ${criticalCount} CRITICAL actions. Consider reducing or splitting into multiple servers.`
      );
    }

    return {
      success: true,
      data: result,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
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
 * Validate MCP generation request
 * @param request - The MCP generation request to validate
 * @returns Validation result with errors if any
 */
export function validateMCPGenerationRequest(request: unknown): {
  success: boolean;
  data?: MCPGenerationRequest;
  errors?: string[];
} {
  try {
    const result = MCPGenerationRequestSchema.parse(request);
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
