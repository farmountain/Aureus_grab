import { describe, it, expect } from 'vitest';
import { MCPActionPolicyRule } from '../src/mcp-action-policy';
import { Action, Principal, RiskTier, Permission } from '../src/types';

describe('MCPActionPolicyRule', () => {
  const mcpPolicy = new MCPActionPolicyRule();

  const createPrincipal = (): Principal => ({
    id: 'test-agent',
    type: 'agent',
    permissions: [
      {
        action: 'execute',
        resource: 'mcp-action',
      },
    ],
  });

  describe('evaluateMCPAction', () => {
    it('should allow non-MCP actions', () => {
      const principal = createPrincipal();
      const action: Action = {
        id: 'read-file',
        name: 'Read File',
        riskTier: RiskTier.LOW,
        requiredPermissions: [],
      };

      const decision = mcpPolicy.evaluateMCPAction(principal, action);

      expect(decision.allowed).toBe(true);
      expect(decision.requiresHumanApproval).toBe(false);
      expect(decision.reason).toContain('Not an MCP action');
    });

    it('should require approval for HIGH risk MCP actions', () => {
      const principal = createPrincipal();
      const action: Action = {
        id: 'mcp-write-database',
        name: 'MCP Write Database',
        riskTier: RiskTier.HIGH,
        requiredPermissions: [
          {
            action: 'execute',
            resource: 'mcp-action',
          },
        ],
        metadata: {
          mcpServerName: 'database-server',
          mcpActionName: 'write_record',
          requiresCRVValidation: true,
        },
      };

      const decision = mcpPolicy.evaluateMCPAction(principal, action);

      expect(decision.allowed).toBe(false);
      expect(decision.requiresHumanApproval).toBe(true);
      expect(decision.reason).toContain('risk tier requires explicit human approval');
      expect(decision.metadata?.mcpAction).toBe(true);
      expect(decision.metadata?.mcpServerName).toBe('database-server');
      expect(decision.metadata?.requiresCRV).toBe(true);
    });

    it('should require approval for CRITICAL risk MCP actions', () => {
      const principal = createPrincipal();
      const action: Action = {
        id: 'mcp-delete-production',
        name: 'MCP Delete Production Data',
        riskTier: RiskTier.CRITICAL,
        requiredPermissions: [
          {
            action: 'execute',
            resource: 'mcp-action',
          },
        ],
        metadata: {
          mcpServerName: 'production-server',
          mcpActionName: 'delete_all',
          requiresCRVValidation: true,
        },
      };

      const decision = mcpPolicy.evaluateMCPAction(principal, action);

      expect(decision.allowed).toBe(false);
      expect(decision.requiresHumanApproval).toBe(true);
      expect(decision.reason).toContain('risk tier requires explicit human approval');
      expect(decision.metadata?.mcpAction).toBe(true);
    });

    it('should allow MEDIUM risk MCP actions with CRV validation', () => {
      const principal = createPrincipal();
      const action: Action = {
        id: 'mcp-update-config',
        name: 'MCP Update Config',
        riskTier: RiskTier.MEDIUM,
        requiredPermissions: [
          {
            action: 'execute',
            resource: 'mcp-action',
          },
        ],
        metadata: {
          mcpServerName: 'config-server',
          mcpActionName: 'update_setting',
          requiresCRVValidation: true,
          crvGateName: 'config-validation',
        },
      };

      const decision = mcpPolicy.evaluateMCPAction(principal, action);

      expect(decision.allowed).toBe(true);
      expect(decision.requiresHumanApproval).toBe(false);
      expect(decision.reason).toContain('approved with CRV validation required');
      expect(decision.metadata?.requiresCRV).toBe(true);
      expect(decision.metadata?.crvGateName).toBe('config-validation');
    });

    it('should allow LOW risk MCP actions without approval', () => {
      const principal = createPrincipal();
      const action: Action = {
        id: 'mcp-read-data',
        name: 'MCP Read Data',
        riskTier: RiskTier.LOW,
        requiredPermissions: [],
        metadata: {
          mcpServerName: 'read-server',
          mcpActionName: 'read_data',
          requiresCRVValidation: false,
        },
      };

      const decision = mcpPolicy.evaluateMCPAction(principal, action);

      expect(decision.allowed).toBe(true);
      expect(decision.requiresHumanApproval).toBe(false);
      expect(decision.reason).toContain('approved without additional approval');
    });
  });

  describe('isMCPAction', () => {
    it('should identify MCP actions', () => {
      const action: Action = {
        id: 'mcp-action',
        name: 'MCP Action',
        riskTier: RiskTier.MEDIUM,
        requiredPermissions: [],
        metadata: {
          mcpActionName: 'test_action',
        },
      };

      expect(mcpPolicy.isMCPAction(action)).toBe(true);
    });

    it('should identify non-MCP actions', () => {
      const action: Action = {
        id: 'regular-action',
        name: 'Regular Action',
        riskTier: RiskTier.MEDIUM,
        requiredPermissions: [],
      };

      expect(mcpPolicy.isMCPAction(action)).toBe(false);
    });
  });

  describe('validateMCPAction', () => {
    it('should return no issues for valid MCP actions', () => {
      const action: Action = {
        id: 'mcp-action',
        name: 'MCP Action',
        riskTier: RiskTier.HIGH,
        requiredPermissions: [
          {
            action: 'execute',
            resource: 'mcp-action',
          },
        ],
        metadata: {
          mcpServerName: 'test-server',
          mcpActionName: 'test_action',
          requiresCRVValidation: true,
        },
      };

      const issues = mcpPolicy.validateMCPAction(action);

      expect(issues).toHaveLength(0);
    });

    it('should flag HIGH risk actions without permissions', () => {
      const action: Action = {
        id: 'mcp-action',
        name: 'MCP Action',
        riskTier: RiskTier.HIGH,
        requiredPermissions: [],
        metadata: {
          mcpServerName: 'test-server',
          mcpActionName: 'test_action',
        },
      };

      const issues = mcpPolicy.validateMCPAction(action);

      expect(issues.length).toBeGreaterThan(0);
      expect(issues[0]).toContain('must have required permissions defined');
    });

    it('should flag CRITICAL actions without CRV validation', () => {
      const action: Action = {
        id: 'mcp-action',
        name: 'MCP Action',
        riskTier: RiskTier.CRITICAL,
        requiredPermissions: [
          {
            action: 'execute',
            resource: 'mcp-action',
          },
        ],
        metadata: {
          mcpServerName: 'test-server',
          mcpActionName: 'test_action',
          requiresCRVValidation: false,
        },
      };

      const issues = mcpPolicy.validateMCPAction(action);

      expect(issues.length).toBeGreaterThan(0);
      expect(issues[0]).toContain('must have CRV validation enabled');
    });

    it('should flag actions without mcpServerName', () => {
      const action: Action = {
        id: 'mcp-action',
        name: 'MCP Action',
        riskTier: RiskTier.MEDIUM,
        requiredPermissions: [],
        metadata: {
          mcpActionName: 'test_action',
        },
      };

      const issues = mcpPolicy.validateMCPAction(action);

      expect(issues.length).toBeGreaterThan(0);
      expect(issues[0]).toContain('must specify mcpServerName');
    });
  });
});
