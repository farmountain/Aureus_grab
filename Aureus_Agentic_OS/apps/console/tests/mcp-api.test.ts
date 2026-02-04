import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { ConsoleAPIServer } from '../src/api-server';
import { ConsoleService } from '../src/console-service';
import { AuthService } from '../src/auth';
import { InMemoryStateStore, EventLog } from '@aureus/kernel';

describe('MCP API Endpoints', () => {
  let server: ConsoleAPIServer;
  let authService: AuthService;
  let authToken: string;

  beforeEach(async () => {
    // Setup in-memory services
    const stateStore = new InMemoryStateStore();
    const eventLog = new EventLog(stateStore);
    const consoleService = new ConsoleService(eventLog, stateStore);
    
    authService = new AuthService();
    
    // Create test user
    await authService.createUser({
      username: 'test-user',
      password: 'test-password',
      permissions: ['read', 'write'],
    });

    // Get auth token
    const authResult = await authService.authenticate({
      username: 'test-user',
      password: 'test-password',
    });
    authToken = authResult.token;

    // Create API server
    server = new ConsoleAPIServer(consoleService, authService, 3000);
  });

  describe('POST /api/mcp/generate', () => {
    it('should generate MCP server definition from tool descriptions', async () => {
      const response = await request(server.getApp())
        .post('/api/mcp/generate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          serverName: 'file-operations',
          serverVersion: '1.0.0',
          serverDescription: 'File operation tools',
          tools: [
            {
              name: 'read_file',
              description: 'Read contents of a file from the filesystem',
              parameters: [
                { 
                  name: 'path', 
                  type: 'string', 
                  description: 'File path', 
                  required: true 
                },
              ],
              returns: { 
                type: 'string', 
                description: 'File contents' 
              },
              capabilities: ['file-system'],
            },
            {
              name: 'write_file',
              description: 'Write contents to a file',
              parameters: [
                { 
                  name: 'path', 
                  type: 'string', 
                  description: 'File path', 
                  required: true 
                },
                { 
                  name: 'content', 
                  type: 'string', 
                  description: 'Content to write', 
                  required: true 
                },
              ],
              capabilities: ['file-system'],
            },
          ],
          inferRiskFromCapabilities: true,
        })
        .expect(200);

      expect(response.body).toBeDefined();
      expect(response.body.server).toBeDefined();
      expect(response.body.server.name).toBe('file-operations');
      expect(response.body.server.actions).toHaveLength(2);
      expect(response.body.validation).toBeDefined();
    });

    it('should return 400 for invalid request', async () => {
      const response = await request(server.getApp())
        .post('/api/mcp/generate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          // Missing required fields
          tools: [],
        })
        .expect(400);

      expect(response.body.error).toBeDefined();
      expect(response.body.details).toBeDefined();
    });

    it('should return 401 without authentication', async () => {
      await request(server.getApp())
        .post('/api/mcp/generate')
        .send({
          serverName: 'test-server',
          tools: [
            {
              name: 'test_tool',
              description: 'Test tool',
              parameters: [],
            },
          ],
        })
        .expect(401);
    });

    it('should validate generated server and return warnings for governance issues', async () => {
      const response = await request(server.getApp())
        .post('/api/mcp/generate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          serverName: 'risky-operations',
          tools: [
            {
              name: 'delete_database',
              description: 'Delete entire database - irreversible operation',
              parameters: [
                { 
                  name: 'db_name', 
                  type: 'string', 
                  required: true 
                },
              ],
              capabilities: ['database'],
            },
          ],
          inferRiskFromCapabilities: true,
        })
        .expect(200);

      const action = response.body.server.actions[0];
      expect(action.riskTier).toBe('CRITICAL');
      expect(action.requiresApproval).toBe(true);
      expect(action.requiredPermissions).toBeDefined();
    });
  });

  describe('POST /api/mcp/validate', () => {
    it('should validate MCP server definition', async () => {
      const server = {
        name: 'test-server',
        version: '1.0.0',
        description: 'Test server for validation',
        actions: [
          {
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
          },
        ],
        metadata: {
          generatedAt: new Date().toISOString(),
          totalActions: 1,
          riskDistribution: {
            LOW: 1,
            MEDIUM: 0,
            HIGH: 0,
            CRITICAL: 0,
          },
        },
      };

      const response = await request(server.getApp())
        .post('/api/mcp/validate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ server })
        .expect(200);

      expect(response.body.type).toBe('server');
      expect(response.body.schema).toBeDefined();
      expect(response.body.governance).toBeDefined();
    });

    it('should validate single MCP action', async () => {
      const action = {
        name: 'test_action',
        description: 'Test action for validation',
        inputSchema: {
          type: 'object',
          properties: {
            param1: { type: 'string' },
          },
        },
        riskTier: 'LOW',
        requiresApproval: false,
      };

      const response = await request(server.getApp())
        .post('/api/mcp/validate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ action })
        .expect(200);

      expect(response.body.type).toBe('action');
      expect(response.body.schema).toBeDefined();
      expect(response.body.governance).toBeDefined();
    });

    it('should detect HIGH risk actions without permissions', async () => {
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

      const response = await request(server.getApp())
        .post('/api/mcp/validate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ action })
        .expect(200);

      expect(response.body.governance.valid).toBe(false);
      expect(response.body.governance.errors.length).toBeGreaterThan(0);
      expect(response.body.governance.governance.highRiskActionsWithoutPermissions).toContain(
        'high_risk_operation'
      );
    });

    it('should detect CRITICAL actions without approval', async () => {
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

      const response = await request(server.getApp())
        .post('/api/mcp/validate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ action })
        .expect(200);

      expect(response.body.governance.valid).toBe(false);
      expect(response.body.governance.errors.length).toBeGreaterThan(0);
      expect(response.body.governance.governance.criticalActionsWithoutApproval).toContain(
        'critical_operation'
      );
      expect(response.body.governance.governance.blockedActions).toContain('critical_operation');
    });

    it('should return 400 when neither server nor action provided', async () => {
      const response = await request(server.getApp())
        .post('/api/mcp/validate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({})
        .expect(400);

      expect(response.body.error).toBeDefined();
    });

    it('should return 401 without authentication', async () => {
      await request(server.getApp())
        .post('/api/mcp/validate')
        .send({
          action: {
            name: 'test',
            description: 'Test action',
            inputSchema: { type: 'object', properties: {} },
            riskTier: 'LOW',
            requiresApproval: false,
          },
        })
        .expect(401);
    });
  });

  describe('MCP Governance Integration', () => {
    it('should enforce permission requirements for HIGH risk actions', async () => {
      const genResponse = await request(server.getApp())
        .post('/api/mcp/generate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          serverName: 'high-risk-server',
          tools: [
            {
              name: 'write_sensitive_data',
              description: 'Write sensitive financial data',
              parameters: [
                { name: 'data', type: 'string', required: true },
              ],
              capabilities: ['payment-api'],
            },
          ],
          inferRiskFromCapabilities: true,
        })
        .expect(200);

      const action = genResponse.body.server.actions[0];
      expect(action.riskTier).toBe('HIGH');
      expect(action.requiredPermissions).toBeDefined();
      expect(action.requiredPermissions.length).toBeGreaterThan(0);
    });

    it('should block CRITICAL actions without approval mechanism', async () => {
      const validateResponse = await request(server.getApp())
        .post('/api/mcp/validate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          action: {
            name: 'drop_production_database',
            description: 'Drop production database',
            inputSchema: {
              type: 'object',
              properties: {
                confirm: { type: 'boolean' },
              },
            },
            riskTier: 'CRITICAL',
            requiredPermissions: ['admin', 'critical_operations'],
            requiresApproval: false, // This should fail validation
          },
        })
        .expect(200);

      expect(validateResponse.body.governance.valid).toBe(false);
      expect(validateResponse.body.governance.governance.blockedActions).toContain(
        'drop_production_database'
      );
    });

    it('should pass validation for properly configured CRITICAL action', async () => {
      const validateResponse = await request(server.getApp())
        .post('/api/mcp/validate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          action: {
            name: 'critical_operation',
            description: 'A properly configured critical operation',
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
          },
        })
        .expect(200);

      expect(validateResponse.body.governance.valid).toBe(true);
      expect(validateResponse.body.governance.errors).toHaveLength(0);
    });
  });
});
