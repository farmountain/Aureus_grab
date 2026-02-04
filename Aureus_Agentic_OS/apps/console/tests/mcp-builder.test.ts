import { describe, it, expect, beforeEach } from 'vitest';
import { MCPBuilder, ToolDescription } from '../src/mcp-builder';

describe('MCPBuilder', () => {
  let mcpBuilder: MCPBuilder;

  beforeEach(() => {
    mcpBuilder = new MCPBuilder();
  });

  describe('generateMCPServer', () => {
    it('should generate MCP server definition from tool descriptions', () => {
      const tools: ToolDescription[] = [
        {
          name: 'read_file',
          description: 'Read contents of a file from the filesystem',
          parameters: [
            { name: 'path', type: 'string', description: 'File path', required: true },
          ],
          returns: { type: 'string', description: 'File contents' },
          capabilities: ['file-system'],
        },
        {
          name: 'write_file',
          description: 'Write contents to a file',
          parameters: [
            { name: 'path', type: 'string', description: 'File path', required: true },
            { name: 'content', type: 'string', description: 'Content to write', required: true },
          ],
          capabilities: ['file-system'],
        },
      ];

      const server = mcpBuilder.generateMCPServer(tools, {
        serverName: 'file-operations',
        serverVersion: '1.0.0',
        serverDescription: 'File operation tools',
        inferRiskFromCapabilities: true,
      });

      expect(server).toBeDefined();
      expect(server.name).toBe('file-operations');
      expect(server.version).toBe('1.0.0');
      expect(server.actions).toHaveLength(2);
      expect(server.metadata.totalActions).toBe(2);
    });

    it('should infer risk tiers from tool capabilities', () => {
      const tools: ToolDescription[] = [
        {
          name: 'read_log',
          description: 'Read application logs',
          parameters: [],
          capabilities: [], // No special capabilities for read-only operations
        },
        {
          name: 'delete_database',
          description: 'Delete entire database - irreversible operation',
          parameters: [{ name: 'db_name', type: 'string', required: true }],
          capabilities: ['database'],
        },
        {
          name: 'execute_command',
          description: 'Execute system command',
          parameters: [{ name: 'command', type: 'string', required: true }],
          capabilities: ['command-executor'],
        },
      ];

      const server = mcpBuilder.generateMCPServer(tools, {
        serverName: 'mixed-operations',
        inferRiskFromCapabilities: true,
      });

      // Check risk tier inference
      const readAction = server.actions.find(a => a.name === 'read_log');
      const deleteAction = server.actions.find(a => a.name === 'delete_database');
      const execAction = server.actions.find(a => a.name === 'execute_command');

      expect(readAction?.riskTier).toBe('LOW');
      expect(deleteAction?.riskTier).toBe('CRITICAL');
      expect(execAction?.riskTier).toBe('CRITICAL');
    });

    it('should calculate risk distribution correctly', () => {
      const tools: ToolDescription[] = [
        {
          name: 'read_file',
          description: 'Read file',
          parameters: [],
          capabilities: ['file-system'],
        },
        {
          name: 'write_file',
          description: 'Write file',
          parameters: [],
          capabilities: ['file-system'],
        },
        {
          name: 'delete_file',
          description: 'Delete file permanently',
          parameters: [],
          capabilities: ['file-system'],
        },
      ];

      const server = mcpBuilder.generateMCPServer(tools, {
        serverName: 'file-ops',
        inferRiskFromCapabilities: true,
      });

      expect(server.metadata.riskDistribution).toBeDefined();
      expect(server.metadata.riskDistribution.LOW).toBeGreaterThanOrEqual(0);
      expect(server.metadata.riskDistribution.MEDIUM).toBeGreaterThanOrEqual(0);
      expect(server.metadata.riskDistribution.HIGH).toBeGreaterThanOrEqual(0);
      expect(server.metadata.riskDistribution.CRITICAL).toBeGreaterThanOrEqual(0);
    });
  });

  describe('validateMCPAction', () => {
    it('should validate action with all required fields', () => {
      const action = {
        name: 'safe_operation',
        description: 'A safe operation',
        inputSchema: {
          type: 'object',
          properties: {
            param1: { type: 'string' },
          },
        },
        riskTier: 'LOW',
        requiresApproval: false,
      };

      const result = mcpBuilder.validateMCPAction(action);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail validation for HIGH risk without permissions', () => {
      const action = {
        name: 'high_risk_operation',
        description: 'A high risk operation',
        inputSchema: {
          type: 'object',
          properties: {},
        },
        riskTier: 'HIGH',
        requiresApproval: false,
      };

      const result = mcpBuilder.validateMCPAction(action);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.governance.highRiskActionsWithoutPermissions).toContain('high_risk_operation');
    });

    it('should fail validation for CRITICAL risk without approval', () => {
      const action = {
        name: 'critical_operation',
        description: 'A critical operation',
        inputSchema: {
          type: 'object',
          properties: {},
        },
        riskTier: 'CRITICAL',
        requiredPermissions: ['admin'],
        requiresApproval: false,
      };

      const result = mcpBuilder.validateMCPAction(action);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.governance.criticalActionsWithoutApproval).toContain('critical_operation');
      expect(result.governance.blockedActions).toContain('critical_operation');
    });

    it('should pass validation for CRITICAL risk with permissions and approval', () => {
      const action = {
        name: 'critical_operation',
        description: 'A critical operation with proper safeguards',
        inputSchema: {
          type: 'object',
          properties: {
            confirm: { type: 'boolean' },
          },
        },
        riskTier: 'CRITICAL',
        requiredPermissions: ['admin', 'critical_operations'],
        requiresApproval: true,
        crvValidation: true,
      };

      const result = mcpBuilder.validateMCPAction(action);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('validateMCPServer', () => {
    it('should validate entire server definition', () => {
      const tools: ToolDescription[] = [
        {
          name: 'safe_op',
          description: 'Safe operation',
          parameters: [],
        },
      ];

      const server = mcpBuilder.generateMCPServer(tools, {
        serverName: 'test-server',
        defaultRiskTier: 'LOW',
        inferRiskFromCapabilities: false,
      });

      const result = mcpBuilder.validateMCPServer(server);

      expect(result.valid).toBe(true);
    });

    it('should collect all validation errors from actions', () => {
      const server = {
        name: 'test-server',
        version: '1.0.0',
        description: 'Test server',
        actions: [
          {
            name: 'action1',
            description: 'Action 1',
            inputSchema: {
              type: 'object',
              properties: {},
            },
            riskTier: 'HIGH',
            requiresApproval: false,
          },
          {
            name: 'action2',
            description: 'Action 2',
            inputSchema: {
              type: 'object',
              properties: {},
            },
            riskTier: 'CRITICAL',
            requiresApproval: false,
          },
        ],
        metadata: {
          generatedAt: new Date(),
          totalActions: 2,
          riskDistribution: {
            LOW: 0,
            MEDIUM: 0,
            HIGH: 1,
            CRITICAL: 1,
          },
        },
      };

      const result = mcpBuilder.validateMCPServer(server);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.governance.highRiskActionsWithoutPermissions).toContain('action1');
      expect(result.governance.criticalActionsWithoutApproval).toContain('action2');
    });
  });

  describe('applyPolicyGuard', () => {
    it('should allow LOW risk actions without permissions', () => {
      const action = {
        name: 'safe_op',
        description: 'Safe operation',
        inputSchema: {
          type: 'object',
          properties: {},
        },
        riskTier: 'LOW' as const,
        requiresApproval: false,
      };

      const result = mcpBuilder.applyPolicyGuard(action, []);

      expect(result.allowed).toBe(true);
    });

    it('should block HIGH risk actions without required permissions', () => {
      const action = {
        name: 'high_risk_op',
        description: 'High risk operation',
        inputSchema: {
          type: 'object',
          properties: {},
        },
        riskTier: 'HIGH' as const,
        requiredPermissions: ['elevated_operations'],
        requiresApproval: false,
      };

      const result = mcpBuilder.applyPolicyGuard(action, []);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Missing required permissions');
    });

    it('should allow actions when user has required permissions', () => {
      const action = {
        name: 'high_risk_op',
        description: 'High risk operation',
        inputSchema: {
          type: 'object',
          properties: {},
        },
        riskTier: 'HIGH' as const,
        requiredPermissions: ['elevated_operations'],
        requiresApproval: false,
      };

      const result = mcpBuilder.applyPolicyGuard(action, ['elevated_operations']);

      expect(result.allowed).toBe(true);
    });

    it('should block actions requiring approval', () => {
      const action = {
        name: 'critical_op',
        description: 'Critical operation',
        inputSchema: {
          type: 'object',
          properties: {},
        },
        riskTier: 'CRITICAL' as const,
        requiredPermissions: ['admin'],
        requiresApproval: true,
      };

      const result = mcpBuilder.applyPolicyGuard(action, ['admin']);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('requires approval');
    });
  });

  describe('Risk Classification', () => {
    it('should classify delete operations as CRITICAL', () => {
      const tools: ToolDescription[] = [
        {
          name: 'delete_user',
          description: 'Delete user account',
          parameters: [],
        },
      ];

      const server = mcpBuilder.generateMCPServer(tools, {
        serverName: 'user-mgmt',
        inferRiskFromCapabilities: true,
      });

      expect(server.actions[0].riskTier).toBe('CRITICAL');
    });

    it('should classify write operations as HIGH', () => {
      const tools: ToolDescription[] = [
        {
          name: 'write_config',
          description: 'Write configuration file',
          parameters: [],
        },
      ];

      const server = mcpBuilder.generateMCPServer(tools, {
        serverName: 'config-mgmt',
        inferRiskFromCapabilities: true,
      });

      expect(server.actions[0].riskTier).toBe('HIGH');
    });

    it('should classify read operations as LOW', () => {
      const tools: ToolDescription[] = [
        {
          name: 'read_status',
          description: 'Read system status',
          parameters: [],
        },
      ];

      const server = mcpBuilder.generateMCPServer(tools, {
        serverName: 'status-check',
        inferRiskFromCapabilities: true,
      });

      expect(server.actions[0].riskTier).toBe('LOW');
    });
  });

  describe('Permission Requirements', () => {
    it('should require admin permissions for CRITICAL operations', () => {
      const tools: ToolDescription[] = [
        {
          name: 'destroy_system',
          description: 'Destroy system - irreversible',
          parameters: [],
          capabilities: ['system-control'],
        },
      ];

      const server = mcpBuilder.generateMCPServer(tools, {
        serverName: 'system-ops',
        inferRiskFromCapabilities: true,
      });

      const action = server.actions[0];
      expect(action.riskTier).toBe('CRITICAL');
      expect(action.requiredPermissions).toBeDefined();
      expect(action.requiredPermissions).toContain('admin');
      expect(action.requiresApproval).toBe(true);
    });

    it('should require database permissions for database operations', () => {
      const tools: ToolDescription[] = [
        {
          name: 'update_records',
          description: 'Update database records',
          parameters: [],
          capabilities: ['database'],
        },
      ];

      const server = mcpBuilder.generateMCPServer(tools, {
        serverName: 'db-ops',
        inferRiskFromCapabilities: true,
      });

      const action = server.actions[0];
      expect(action.requiredPermissions).toBeDefined();
      expect(action.requiredPermissions).toContain('database_access');
    });
  });
});
