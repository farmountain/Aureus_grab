/**
 * MCP (Model Context Protocol) Builder
 * Generates MCP server definitions and action schemas from tool descriptions
 */

import { RiskProfile } from '@aureus/kernel';

/**
 * Tool description input for MCP generation
 */
export interface ToolDescription {
  name: string;
  description: string;
  parameters: {
    name: string;
    type: string;
    description?: string;
    required?: boolean;
  }[];
  returns?: {
    type: string;
    description?: string;
  };
  capabilities?: string[];
  metadata?: Record<string, unknown>;
}

/**
 * MCP Action Schema with risk tier
 */
export interface MCPActionSchema {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, {
      type: string;
      description?: string;
      enum?: string[];
    }>;
    required?: string[];
  };
  outputSchema?: {
    type: string;
    description?: string;
  };
  riskTier: RiskProfile;
  requiredPermissions?: string[];
  requiresApproval: boolean;
  crvValidation?: boolean;
}

/**
 * MCP Server Definition
 */
export interface MCPServerDefinition {
  name: string;
  version: string;
  description: string;
  actions: MCPActionSchema[];
  metadata: {
    generatedAt: Date;
    totalActions: number;
    riskDistribution: Record<RiskProfile, number>;
  };
}

/**
 * MCP Generation Options
 */
export interface MCPGenerationOptions {
  serverName: string;
  serverVersion?: string;
  serverDescription?: string;
  defaultRiskTier?: RiskProfile;
  enableCRVValidation?: boolean;
  inferRiskFromCapabilities?: boolean;
}

/**
 * MCP Validation Result
 */
export interface MCPValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  governance: {
    highRiskActionsWithoutPermissions: string[];
    criticalActionsWithoutApproval: string[];
    blockedActions: string[];
  };
}

/**
 * MCP Builder class for generating and validating MCP server definitions
 */
export class MCPBuilder {
  /**
   * Infer risk tier from tool capabilities
   */
  private inferRiskTier(tool: ToolDescription): RiskProfile {
    const capabilities = tool.capabilities || [];
    const name = tool.name.toLowerCase();
    const description = tool.description.toLowerCase();

    // Check for CRITICAL indicators
    if (
      capabilities.some(cap => 
        ['command-executor', 'system-control', 'deployment'].includes(cap)
      ) ||
      name.includes('delete') ||
      name.includes('destroy') ||
      name.includes('drop') ||
      description.includes('irreversible') ||
      description.includes('production')
    ) {
      return 'CRITICAL';
    }

    // Check for HIGH indicators
    if (
      capabilities.some(cap => 
        ['database', 'payment-api', 'user-management'].includes(cap)
      ) ||
      name.includes('write') ||
      name.includes('update') ||
      name.includes('modify') ||
      description.includes('sensitive') ||
      description.includes('financial')
    ) {
      return 'HIGH';
    }

    // Check for MEDIUM indicators
    if (
      capabilities.some(cap => 
        ['http-client', 'file-system', 'api-caller'].includes(cap)
      ) ||
      name.includes('create') ||
      name.includes('send') ||
      description.includes('external')
    ) {
      return 'MEDIUM';
    }

    // Default to LOW
    return 'LOW';
  }

  /**
   * Determine required permissions based on risk tier
   */
  private determineRequiredPermissions(
    tool: ToolDescription, 
    riskTier: RiskProfile
  ): string[] {
    const permissions: string[] = [];

    // Risk-based permissions
    if (riskTier === 'CRITICAL') {
      permissions.push('admin', 'critical_operations');
    } else if (riskTier === 'HIGH') {
      permissions.push('elevated_operations');
    }

    // Capability-based permissions
    const capabilities = tool.capabilities || [];
    if (capabilities.includes('database')) {
      permissions.push('database_access');
    }
    if (capabilities.includes('payment-api')) {
      permissions.push('financial_operations');
    }
    if (capabilities.includes('user-management')) {
      permissions.push('user_management');
    }

    return permissions;
  }

  /**
   * Determine if approval is required
   */
  private requiresApproval(riskTier: RiskProfile): boolean {
    return riskTier === 'HIGH' || riskTier === 'CRITICAL';
  }

  /**
   * Convert tool description to MCP action schema
   */
  private toolToActionSchema(
    tool: ToolDescription, 
    options: MCPGenerationOptions
  ): MCPActionSchema {
    const riskTier = options.inferRiskFromCapabilities 
      ? this.inferRiskTier(tool)
      : (options.defaultRiskTier || 'MEDIUM');

    const properties: Record<string, {
      type: string;
      description?: string;
      enum?: string[];
    }> = {};

    const required: string[] = [];

    tool.parameters.forEach(param => {
      properties[param.name] = {
        type: param.type,
        description: param.description,
      };

      if (param.required) {
        required.push(param.name);
      }
    });

    const requiredPermissions = this.determineRequiredPermissions(tool, riskTier);

    return {
      name: tool.name,
      description: tool.description,
      inputSchema: {
        type: 'object',
        properties,
        required: required.length > 0 ? required : undefined,
      },
      outputSchema: tool.returns ? {
        type: tool.returns.type,
        description: tool.returns.description,
      } : undefined,
      riskTier,
      requiredPermissions: requiredPermissions.length > 0 ? requiredPermissions : undefined,
      requiresApproval: this.requiresApproval(riskTier),
      crvValidation: options.enableCRVValidation || riskTier === 'HIGH' || riskTier === 'CRITICAL',
    };
  }

  /**
   * Generate MCP server definition from tool descriptions
   */
  generateMCPServer(
    tools: ToolDescription[],
    options: MCPGenerationOptions
  ): MCPServerDefinition {
    const actions = tools.map(tool => this.toolToActionSchema(tool, options));

    // Calculate risk distribution
    const riskDistribution: Record<RiskProfile, number> = {
      LOW: 0,
      MEDIUM: 0,
      HIGH: 0,
      CRITICAL: 0,
    };

    actions.forEach(action => {
      riskDistribution[action.riskTier]++;
    });

    return {
      name: options.serverName,
      version: options.serverVersion || '1.0.0',
      description: options.serverDescription || 'MCP Server generated from tool descriptions',
      actions,
      metadata: {
        generatedAt: new Date(),
        totalActions: actions.length,
        riskDistribution,
      },
    };
  }

  /**
   * Validate MCP action schema with governance rules
   */
  validateMCPAction(action: MCPActionSchema): MCPValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const governance = {
      highRiskActionsWithoutPermissions: [] as string[],
      criticalActionsWithoutApproval: [] as string[],
      blockedActions: [] as string[],
    };

    // Rule 1: Action risk tier required
    if (!action.riskTier) {
      errors.push(`Action '${action.name}' missing required risk tier`);
    }

    // Rule 2: Permission requirements for HIGH/CRITICAL
    if ((action.riskTier === 'HIGH' || action.riskTier === 'CRITICAL')) {
      if (!action.requiredPermissions || action.requiredPermissions.length === 0) {
        errors.push(
          `Action '${action.name}' has ${action.riskTier} risk tier but missing required permissions`
        );
        governance.highRiskActionsWithoutPermissions.push(action.name);
      }
    }

    // Rule 3: Blocked actions in CRITICAL tier without approvals
    if (action.riskTier === 'CRITICAL' && !action.requiresApproval) {
      errors.push(
        `Action '${action.name}' has CRITICAL risk tier but approval not required`
      );
      governance.criticalActionsWithoutApproval.push(action.name);
      governance.blockedActions.push(action.name);
    }

    // Warnings for best practices
    if (action.riskTier === 'HIGH' && !action.crvValidation) {
      warnings.push(
        `Action '${action.name}' has HIGH risk tier. Consider enabling CRV validation`
      );
    }

    if (!action.inputSchema || !action.inputSchema.properties) {
      warnings.push(`Action '${action.name}' has no input schema defined`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      governance,
    };
  }

  /**
   * Validate entire MCP server definition
   */
  validateMCPServer(server: MCPServerDefinition): MCPValidationResult {
    const allErrors: string[] = [];
    const allWarnings: string[] = [];
    const governance = {
      highRiskActionsWithoutPermissions: [] as string[],
      criticalActionsWithoutApproval: [] as string[],
      blockedActions: [] as string[],
    };

    // Validate each action
    server.actions.forEach(action => {
      const result = this.validateMCPAction(action);
      allErrors.push(...result.errors);
      allWarnings.push(...result.warnings);
      governance.highRiskActionsWithoutPermissions.push(
        ...result.governance.highRiskActionsWithoutPermissions
      );
      governance.criticalActionsWithoutApproval.push(
        ...result.governance.criticalActionsWithoutApproval
      );
      governance.blockedActions.push(...result.governance.blockedActions);
    });

    // Server-level validations
    if (!server.name || server.name.trim() === '') {
      allErrors.push('Server name is required');
    }

    if (!server.version || server.version.trim() === '') {
      allErrors.push('Server version is required');
    }

    if (server.actions.length === 0) {
      allWarnings.push('Server has no actions defined');
    }

    return {
      valid: allErrors.length === 0,
      errors: allErrors,
      warnings: allWarnings,
      governance,
    };
  }

  /**
   * Apply CRV validation to MCP action execution
   * Integrates with CRV package for runtime validation
   * 
   * Note: This is a placeholder for future CRV integration.
   * Actual implementation will require CRV validator setup.
   */
  async applyCRVValidation(
    action: MCPActionSchema,
    input: Record<string, unknown>
  ): Promise<{ valid: boolean; reason?: string }> {
    // Skip if CRV validation not enabled for this action
    if (!action.crvValidation) {
      return { valid: true };
    }

    // TODO: Integrate with actual CRV validators when available
    // This is a simplified validation that checks basic requirements
    
    try {
      // Basic validation checks
      if (action.requiredPermissions && action.requiredPermissions.length > 0) {
        // In actual implementation, validate against user's permissions
      }

      if (action.requiresApproval) {
        // In actual implementation, check if approval was granted
      }

      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        reason: error instanceof Error ? error.message : 'CRV validation failed',
      };
    }
  }

  /**
   * Apply policy guard checks for MCP action risk tiers
   */
  applyPolicyGuard(
    action: MCPActionSchema,
    userPermissions: string[]
  ): { allowed: boolean; reason?: string } {
    // Quick check for CRITICAL tier without approval
    if (action.riskTier === 'CRITICAL' && !action.requiresApproval) {
      return {
        allowed: false,
        reason: 'Action is blocked due to CRITICAL risk tier without approval',
      };
    }

    // Check permission requirements
    if (action.requiredPermissions && action.requiredPermissions.length > 0) {
      const hasAllPermissions = action.requiredPermissions.every(perm =>
        userPermissions.includes(perm)
      );

      if (!hasAllPermissions) {
        const missingPermissions = action.requiredPermissions.filter(
          perm => !userPermissions.includes(perm)
        );
        return {
          allowed: false,
          reason: `Missing required permissions: ${missingPermissions.join(', ')}`,
        };
      }
    }

    // Check approval requirement
    if (action.requiresApproval) {
      // In a real implementation, this would check if approval was granted
      // For now, we just flag that approval is needed
      return {
        allowed: false,
        reason: 'Action requires approval before execution',
      };
    }

    return { allowed: true };
  }
}

/**
 * Create a new MCP Builder instance
 */
export function createMCPBuilder(): MCPBuilder {
  return new MCPBuilder();
}
