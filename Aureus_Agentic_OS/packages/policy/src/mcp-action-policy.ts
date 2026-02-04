import {
  Action,
  Principal,
  RiskTier,
  GuardDecision,
} from './types';

/**
 * MCP Action metadata that can be attached to actions
 */
export interface MCPActionMetadata {
  mcpServerName?: string;
  mcpActionName?: string;
  requiresCRVValidation?: boolean;
  crvGateName?: string;
}

/**
 * Policy rule for high-risk MCP actions
 * Ensures that HIGH and CRITICAL risk MCP actions require human approval
 */
export class MCPActionPolicyRule {
  /**
   * Evaluate MCP action and apply governance rules
   * 
   * @param principal The principal requesting the action
   * @param action The action to evaluate (should have MCP metadata)
   * @returns Guard decision with approval requirements
   */
  evaluateMCPAction(
    principal: Principal,
    action: Action
  ): GuardDecision {
    const metadata = action.metadata as MCPActionMetadata | undefined;

    // If not an MCP action, delegate to standard policy
    if (!metadata?.mcpActionName) {
      return {
        allowed: true,
        reason: 'Not an MCP action, standard policy applies',
        requiresHumanApproval: false,
      };
    }

    // HIGH and CRITICAL risk MCP actions require approval
    if (action.riskTier === RiskTier.HIGH || action.riskTier === RiskTier.CRITICAL) {
      return {
        allowed: false,
        reason: `MCP action '${metadata.mcpActionName}' from server '${metadata.mcpServerName}' ` +
                `with ${action.riskTier} risk tier requires explicit human approval`,
        requiresHumanApproval: true,
        metadata: {
          mcpAction: true,
          mcpServerName: metadata.mcpServerName,
          mcpActionName: metadata.mcpActionName,
          requiresCRV: metadata.requiresCRVValidation || false,
          crvGateName: metadata.crvGateName,
        },
      };
    }

    // MEDIUM risk MCP actions with CRV validation requirement need special handling
    if (action.riskTier === RiskTier.MEDIUM && metadata.requiresCRVValidation) {
      return {
        allowed: true,
        reason: `MCP action '${metadata.mcpActionName}' approved with CRV validation required`,
        requiresHumanApproval: false,
        metadata: {
          mcpAction: true,
          mcpServerName: metadata.mcpServerName,
          mcpActionName: metadata.mcpActionName,
          requiresCRV: true,
          crvGateName: metadata.crvGateName,
        },
      };
    }

    // LOW and MEDIUM risk without CRV can proceed
    return {
      allowed: true,
      reason: `MCP action '${metadata.mcpActionName}' approved without additional approval`,
      requiresHumanApproval: false,
      metadata: {
        mcpAction: true,
        mcpServerName: metadata.mcpServerName,
        mcpActionName: metadata.mcpActionName,
        requiresCRV: metadata.requiresCRVValidation || false,
      },
    };
  }

  /**
   * Check if an action is an MCP action
   */
  isMCPAction(action: Action): boolean {
    const metadata = action.metadata as MCPActionMetadata | undefined;
    return !!metadata?.mcpActionName;
  }

  /**
   * Get MCP action metadata from action
   */
  getMCPMetadata(action: Action): MCPActionMetadata | undefined {
    if (!this.isMCPAction(action)) {
      return undefined;
    }
    return action.metadata as MCPActionMetadata;
  }

  /**
   * Validate MCP action against policy constraints
   * Returns validation issues if any
   */
  validateMCPAction(action: Action): string[] {
    const issues: string[] = [];
    const metadata = action.metadata as MCPActionMetadata | undefined;

    if (!metadata?.mcpActionName) {
      return issues; // Not an MCP action
    }

    // Validate that HIGH/CRITICAL actions have required permissions
    if (action.riskTier === RiskTier.HIGH || action.riskTier === RiskTier.CRITICAL) {
      if (!action.requiredPermissions || action.requiredPermissions.length === 0) {
        issues.push(
          `MCP action '${metadata.mcpActionName}' with ${action.riskTier} risk tier ` +
          `must have required permissions defined`
        );
      }
    }

    // Validate that CRITICAL actions have CRV validation enabled
    if (action.riskTier === RiskTier.CRITICAL && !metadata.requiresCRVValidation) {
      issues.push(
        `MCP action '${metadata.mcpActionName}' with CRITICAL risk tier ` +
        `must have CRV validation enabled`
      );
    }

    // Validate MCP server name is present
    if (!metadata.mcpServerName) {
      issues.push(
        `MCP action '${metadata.mcpActionName}' must specify mcpServerName in metadata`
      );
    }

    return issues;
  }
}
