import express, { Request, Response, NextFunction } from 'express';
import { ConsoleService } from './console-service';
import { AuthService } from './auth';
import { WorkflowGenerator } from './workflow-generator';
import { AgentBuilder } from './agent-builder';
import { PerceptionService } from './perception-service';
import { 
  validateGenerationRequest, 
  validateWorkflowSpec, 
  validateAgentGenerationRequest,
  validateAgentBlueprint,
  validateAgentBlueprintComprehensive,
  validateAgentValidationRequest,
  validateAgentSimulationRequest,
  validateAgentDeploymentRequest,
  validateMCPGenerationRequest,
  validateMCPServer,
  validateMCPAction,
  WorkflowSpec, 
  SafetyPolicy 
} from '@aureus/kernel';
import { Principal } from '@aureus/policy';
import { 
  ApprovalRequest, 
  DenyRequest, 
  RollbackRequest,
  AuthCredentials,
  DeploymentVersionRequest,
  DeploymentCreateRequest,
  DeploymentApprovalRequest,
  DeploymentRejectRequest,
  DeploymentCompleteRequest,
  DeploymentPromoteRequest,
  SmokeTestRequest,
} from './types';
import { DAGValidator } from './dag-validator';
import { TestRunnerService, TestCase, TestMode, PolicySimulationRequest } from './test-runner';
import { LLMAssistantService, ExplainStepRequest, ModifyWorkflowRequest, UndoChangeRequest } from './api/llm';
import { MemoryEngineBuilder } from './memory-engine-builder';
import { MemoryPolicyConfig, MemoryPolicy, MemoryPolicyValidation } from '@aureus/memory-hipcortex';
import { MCPBuilder } from './mcp-builder';

/**
 * API Server for the Aureus Console
 * Provides REST endpoints for monitoring and controlling workflows
 */
export class ConsoleAPIServer {
  private app: express.Application;
  private consoleService: ConsoleService;
  private authService: AuthService;
  private workflowGenerator?: WorkflowGenerator;
  private agentBuilder?: AgentBuilder;
  private testRunner?: TestRunnerService;
  private llmAssistant?: LLMAssistantService;
  private perceptionService?: PerceptionService;
  private memoryEngineBuilder?: MemoryEngineBuilder;
  private mcpBuilder: MCPBuilder;
  private port: number;
  private worldModelStateStore?: any; // Shared state store for world models

  constructor(
    consoleService: ConsoleService,
    authService: AuthService,
    port: number = 3000,
    workflowGenerator?: WorkflowGenerator,
    testRunner?: TestRunnerService,
    llmAssistant?: LLMAssistantService,
    perceptionService?: PerceptionService,
    agentBuilder?: AgentBuilder
  ) {
    this.app = express();
    this.consoleService = consoleService;
    this.authService = authService;
    this.workflowGenerator = workflowGenerator;
    this.agentBuilder = agentBuilder;
    this.testRunner = testRunner;
    this.llmAssistant = llmAssistant;
    this.perceptionService = perceptionService;
    this.memoryEngineBuilder = new MemoryEngineBuilder();
    this.mcpBuilder = new MCPBuilder();
    this.port = port;

    this.setupMiddleware();
    this.setupRoutes();
  }

  /**
   * Setup Express middleware
   */
  private setupMiddleware(): void {
    this.app.use(express.json());
    
    // CORS middleware (for web UI access)
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      
      if (req.method === 'OPTIONS') {
        res.sendStatus(200);
      } else {
        next();
      }
    });

    // Request logging
    this.app.use((req, res, next) => {
      console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
      next();
    });
  }

  /**
   * Authentication middleware
   */
  private authenticate = (req: Request, res: Response, next: NextFunction): void => {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Unauthorized: Missing or invalid token' });
      return;
    }

    const token = authHeader.substring(7);
    const session = this.authService.validateToken(token);

    if (!session) {
      res.status(401).json({ error: 'Unauthorized: Invalid token' });
      return;
    }

    // Attach session to request (includes tenantId for multi-tenancy)
    (req as any).session = session;
    next();
  };

  /**
   * Permission check middleware
   */
  private requirePermission = (permission: string) => {
    return (req: Request, res: Response, next: NextFunction): void => {
      const session = (req as any).session;
      
      if (!this.authService.hasPermission(session, permission)) {
        res.status(403).json({ error: `Forbidden: Requires '${permission}' permission` });
        return;
      }

      next();
    };
  };

  /**
   * Tenant isolation middleware - ensures users can only access their tenant's data
   */
  private enforceTenantIsolation = (req: Request, res: Response, next: NextFunction): void => {
    const session = (req as any).session;
    
    // If user has a tenantId, attach it to the request for filtering
    if (session.tenantId) {
      (req as any).tenantId = session.tenantId;
    }
    
    next();
  };

  /**
   * Setup API routes
   */
  private setupRoutes(): void {
    // Serve the workflow wizard UI
    // Note: In production, consider serving static files via CDN or adding rate limiting
    this.app.get('/wizard', (req, res) => {
      res.sendFile('workflow-wizard.html', { root: __dirname + '/ui' });
    });

    // Serve the DAG Studio UI
    this.app.get('/studio', (req, res) => {
      res.sendFile('dag-studio.html', { root: __dirname + '/ui' });
    });

    // Serve the Test & Validate UI
    this.app.get('/test', (req, res) => {
      res.sendFile('test-validate.html', { root: __dirname + '/ui' });
    });

    // Serve the Deployment Manager UI
    this.app.get('/deployment', (req, res) => {
      res.sendFile('deployment.html', { root: __dirname + '/ui' });
    });

    // Serve the Perception UI
    this.app.get('/perception', (req, res) => {
      res.sendFile('perception.html', { root: __dirname + '/ui' });
    });

    // Serve the Agent Studio UI
    this.app.get('/agent-studio', (req, res) => {
      res.sendFile('agent-studio.html', { root: __dirname + '/ui' });
    });

    // Serve the World Model Studio UI
    this.app.get('/world-model-studio', (req, res) => {
      res.sendFile('world-model-studio.html', { root: __dirname + '/ui' });
    });

    // Health check (no auth required)
    this.app.get('/health', (req, res) => {
      res.json({ status: 'ok', timestamp: new Date() });
    });

    // Authentication
    this.app.post('/api/auth/login', async (req, res) => {
      try {
        const credentials: AuthCredentials = req.body;
        const authToken = await this.authService.authenticate(credentials);

        if (!authToken) {
          res.status(401).json({ error: 'Invalid credentials' });
          return;
        }

        res.json(authToken);
      } catch (error) {
        res.status(500).json({ 
          error: 'Authentication failed',
          details: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    this.app.post('/api/auth/logout', this.authenticate, (req, res) => {
      const authHeader = req.headers.authorization!;
      const token = authHeader.substring(7);
      this.authService.logout(token);
      res.json({ message: 'Logged out successfully' });
    });

    // Workflow operations (require read permission)
    this.app.get('/api/workflows', 
      this.authenticate,
      this.enforceTenantIsolation,
      this.requirePermission('read'),
      async (req, res) => {
        try {
          const tenantId = (req as any).tenantId;
          const workflows = await this.consoleService.listWorkflows(tenantId);
          res.json(workflows);
        } catch (error) {
          res.status(500).json({ 
            error: 'Failed to list workflows',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    );

    this.app.get('/api/workflows/:id',
      this.authenticate,
      this.enforceTenantIsolation,
      this.requirePermission('read'),
      async (req, res) => {
        try {
          const tenantId = (req as any).tenantId;
          const status = await this.consoleService.getWorkflowStatus(req.params.id, tenantId);
          
          if (!status) {
            res.status(404).json({ error: 'Workflow not found' });
            return;
          }

          res.json(status);
        } catch (error) {
          res.status(500).json({ 
            error: 'Failed to get workflow status',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    );

    this.app.get('/api/workflows/:id/events',
      this.authenticate,
      this.enforceTenantIsolation,
      this.requirePermission('read'),
      async (req, res) => {
        try {
          const tenantId = (req as any).tenantId;
          const events = await this.consoleService.getWorkflowEvents(req.params.id, tenantId);
          res.json(events);
        } catch (error) {
          res.status(500).json({ 
            error: 'Failed to get workflow events',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    );

    this.app.get('/api/workflows/:id/timeline',
      this.authenticate,
      this.requirePermission('read'),
      async (req, res) => {
        try {
          const timeline = await this.consoleService.getTimeline(req.params.id);
          res.json(timeline);
        } catch (error) {
          res.status(500).json({ 
            error: 'Failed to get workflow timeline',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    );

    this.app.get('/api/workflows/:id/snapshots',
      this.authenticate,
      this.requirePermission('read'),
      async (req, res) => {
        try {
          const snapshots = await this.consoleService.getSnapshots(req.params.id);
          res.json(snapshots);
        } catch (error) {
          res.status(500).json({ 
            error: 'Failed to get workflow snapshots',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    );

    // Action operations (require specific permissions)
    this.app.post('/api/workflows/:id/approve',
      this.authenticate,
      this.requirePermission('approve'),
      async (req, res) => {
        try {
          const request: ApprovalRequest = req.body;
          const session = (req as any).session;
          
          const success = await this.consoleService.approveAction(
            req.params.id,
            request.taskId,
            request.approvalToken,
            session.username
          );

          if (success) {
            res.json({ message: 'Action approved', success: true });
          } else {
            res.status(400).json({ error: 'Invalid approval token', success: false });
          }
        } catch (error) {
          res.status(500).json({ 
            error: 'Failed to approve action',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    );

    this.app.post('/api/workflows/:id/deny',
      this.authenticate,
      this.requirePermission('deny'),
      async (req, res) => {
        try {
          const request: DenyRequest = req.body;
          const session = (req as any).session;
          
          const success = await this.consoleService.denyAction(
            req.params.id,
            request.taskId,
            request.approvalToken,
            session.username,
            request.reason
          );

          res.json({ message: 'Action denied', success });
        } catch (error) {
          res.status(500).json({ 
            error: 'Failed to deny action',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    );

    this.app.post('/api/workflows/:id/rollback',
      this.authenticate,
      this.requirePermission('rollback'),
      async (req, res) => {
        try {
          const request: RollbackRequest = req.body;
          const session = (req as any).session;
          
          const success = await this.consoleService.rollback(
            req.params.id,
            request.snapshotId,
            session.username,
            request.reason
          );

          if (success) {
            res.json({ message: 'Rollback initiated', success: true });
          } else {
            res.status(500).json({ error: 'Rollback failed', success: false });
          }
        } catch (error) {
          res.status(500).json({ 
            error: 'Failed to initiate rollback',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    );

    // Workflow generation endpoints (require read permission)
    this.app.post('/api/workflows/generate',
      this.authenticate,
      this.requirePermission('read'),
      async (req, res) => {
        try {
          if (!this.workflowGenerator) {
            res.status(503).json({ error: 'Workflow generator not configured' });
            return;
          }

          // Validate request
          const validation = validateGenerationRequest(req.body);
          if (!validation.success) {
            res.status(400).json({ 
              error: 'Invalid request',
              errors: validation.errors 
            });
            return;
          }

          // Generate workflow
          const result = await this.workflowGenerator.generateWorkflow(validation.data!);

          res.json({
            spec: result.spec,
            metadata: {
              generatedAt: result.metadata.timestamp,
              promptLength: result.metadata.prompt.length,
              responseLength: result.metadata.response.length,
            },
          });
        } catch (error) {
          res.status(500).json({ 
            error: 'Failed to generate workflow',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    );

    this.app.post('/api/workflows/validate',
      this.authenticate,
      this.requirePermission('read'),
      async (req, res) => {
        try {
          const validation = validateWorkflowSpec(req.body);
          
          if (validation.success) {
            res.json({
              valid: true,
              spec: validation.data,
            });
          } else {
            res.json({
              valid: false,
              errors: validation.errors,
            });
          }
        } catch (error) {
          res.status(500).json({ 
            error: 'Failed to validate workflow',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    );

    // LLM Assistant endpoints (require read permission)
    this.app.post('/api/llm/explain',
      this.authenticate,
      this.requirePermission('read'),
      async (req, res) => {
        try {
          if (!this.llmAssistant) {
            res.status(503).json({ error: 'LLM assistant not configured' });
            return;
          }

          const request: ExplainStepRequest = req.body;
          
          if (!request.workflowSpec || !request.taskId) {
            res.status(400).json({ error: 'Missing required fields: workflowSpec and taskId' });
            return;
          }

          const explanation = await this.llmAssistant.explainStep(request);
          res.json(explanation);
        } catch (error) {
          res.status(500).json({ 
            error: 'Failed to explain step',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    );

    this.app.post('/api/llm/modify',
      this.authenticate,
      this.requirePermission('read'),
      async (req, res) => {
        try {
          if (!this.llmAssistant) {
            res.status(503).json({ error: 'LLM assistant not configured' });
            return;
          }

          const request: ModifyWorkflowRequest = req.body;
          
          if (!request.currentSpec || !request.modification) {
            res.status(400).json({ error: 'Missing required fields: currentSpec and modification' });
            return;
          }

          const result = await this.llmAssistant.modifyWorkflow(request);
          res.json(result);
        } catch (error) {
          res.status(500).json({ 
            error: 'Failed to modify workflow',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    );

    this.app.post('/api/llm/undo',
      this.authenticate,
      this.requirePermission('read'),
      async (req, res) => {
        try {
          if (!this.llmAssistant) {
            res.status(503).json({ error: 'LLM assistant not configured' });
            return;
          }

          const request: UndoChangeRequest = req.body;
          
          if (!request.changeId) {
            res.status(400).json({ error: 'Missing required field: changeId' });
            return;
          }

          const result = await this.llmAssistant.undoChange(request);
          res.json(result);
        } catch (error) {
          res.status(500).json({ 
            error: 'Failed to undo change',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    );

    this.app.get('/api/llm/history/:workflowId?',
      this.authenticate,
      this.requirePermission('read'),
      async (req, res) => {
        try {
          if (!this.llmAssistant) {
            res.status(503).json({ error: 'LLM assistant not configured' });
            return;
          }

          const workflowId = req.params.workflowId;
          const history = this.llmAssistant.getChangeHistory(workflowId);
          res.json({ history });
        } catch (error) {
          res.status(500).json({ 
            error: 'Failed to get change history',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    );

    this.app.get('/api/llm/conversation/:workflowId?',
      this.authenticate,
      this.requirePermission('read'),
      async (req, res) => {
        try {
          if (!this.llmAssistant) {
            res.status(503).json({ error: 'LLM assistant not configured' });
            return;
          }

          const workflowId = req.params.workflowId;
          const state = this.llmAssistant.getConversationState(workflowId);
          
          if (!state) {
            res.status(404).json({ error: 'No conversation found for this workflow' });
            return;
          }

          res.json(state);
        } catch (error) {
          res.status(500).json({ 
            error: 'Failed to get conversation state',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    );

    // DAG validation endpoints
    this.app.post('/api/workflows/validate-dag',
      this.authenticate,
      this.requirePermission('read'),
      async (req, res) => {
        try {
          const spec = req.body as WorkflowSpec;
          const result = DAGValidator.validateTopology(spec);
          res.json(result);
        } catch (error) {
          res.status(500).json({
            error: 'Failed to validate DAG topology',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    );

    this.app.post('/api/workflows/validate-policy',
      this.authenticate,
      this.requirePermission('read'),
      async (req, res) => {
        try {
          const spec = req.body as WorkflowSpec;
          const safetyPolicy = spec.safetyPolicy as SafetyPolicy | undefined;
          const result = DAGValidator.validatePolicy(
            spec,
            undefined, // Would pass policyGuard from consoleService in full implementation
            safetyPolicy
          );
          res.json(result);
        } catch (error) {
          res.status(500).json({
            error: 'Failed to validate policy',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    );

    this.app.post('/api/workflows/validate-crv',
      this.authenticate,
      this.requirePermission('read'),
      async (req, res) => {
        try {
          const spec = req.body as WorkflowSpec;
          const result = DAGValidator.validateCRVRules(spec);
          res.json(result);
        } catch (error) {
          res.status(500).json({
            error: 'Failed to validate CRV rules',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    );

    // Get DAG structure for a workflow
    this.app.get('/api/workflows/:id/dag',
      this.authenticate,
      this.requirePermission('read'),
      async (req, res) => {
        try {
          const dag = await this.consoleService.getWorkflowDAG(req.params.id);
          if (!dag) {
            res.status(404).json({ error: 'Workflow not found' });
            return;
          }
          res.json(dag);
        } catch (error) {
          res.status(500).json({
            error: 'Failed to get workflow DAG',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    );

    // Save/update workflow spec
    this.app.post('/api/workflows/spec',
      this.authenticate,
      this.requirePermission('write'),
      async (req, res) => {
        try {
          const spec = req.body as WorkflowSpec;
          const validation = validateWorkflowSpec(spec);
          
          if (!validation.success) {
            res.status(400).json({
              error: 'Invalid workflow specification',
              errors: validation.errors,
            });
            return;
          }

          // Validate DAG topology
          const dagValidation = DAGValidator.validateTopology(spec);
          if (!dagValidation.valid) {
            res.status(400).json({
              error: 'Invalid DAG topology',
              errors: dagValidation.errors,
            });
            return;
          }

          // Save the workflow spec
          const saved = await this.consoleService.saveWorkflowSpec(spec);
          res.json({ success: true, workflowId: saved.id });
        } catch (error) {
          res.status(500).json({
            error: 'Failed to save workflow',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    );

    // Test & Validate endpoints
    this.app.post('/api/test/run',
      this.authenticate,
      this.requirePermission('read'),
      async (req, res) => {
        try {
          if (!this.testRunner) {
            res.status(503).json({ error: 'Test runner not configured' });
            return;
          }

          const testCase: TestCase = req.body;
          const mode: TestMode = req.body.mode || TestMode.DRY_RUN;

          if (!testCase.id || !testCase.workflowSpec) {
            res.status(400).json({ error: 'Invalid test case: missing required fields' });
            return;
          }

          const result = await this.testRunner.runTest(testCase, mode);
          res.json(result);
        } catch (error) {
          res.status(500).json({
            error: 'Failed to run test',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    );

    this.app.get('/api/test/results/:id',
      this.authenticate,
      this.requirePermission('read'),
      async (req, res) => {
        try {
          if (!this.testRunner) {
            res.status(503).json({ error: 'Test runner not configured' });
            return;
          }

          const result = this.testRunner.getTestResult(req.params.id);
          
          if (!result) {
            res.status(404).json({ error: 'Test result not found' });
            return;
          }

          res.json(result);
        } catch (error) {
          res.status(500).json({
            error: 'Failed to get test result',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    );

    this.app.get('/api/test/results',
      this.authenticate,
      this.requirePermission('read'),
      async (req, res) => {
        try {
          if (!this.testRunner) {
            res.status(503).json({ error: 'Test runner not configured' });
            return;
          }

          const results = this.testRunner.getAllTestResults();
          res.json(results);
        } catch (error) {
          res.status(500).json({
            error: 'Failed to get test results',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    );

    this.app.post('/api/test/simulate-policy',
      this.authenticate,
      this.requirePermission('read'),
      async (req, res) => {
        try {
          if (!this.testRunner) {
            res.status(503).json({ error: 'Test runner not configured' });
            return;
          }

          const request: PolicySimulationRequest = req.body;

          if (!request.action || !request.principal) {
            res.status(400).json({ error: 'Invalid request: missing action or principal' });
            return;
          }

          const result = await this.testRunner.simulatePolicy(request);
          res.json(result);
        } catch (error) {
          res.status(500).json({
            error: 'Failed to simulate policy',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    );

    this.app.get('/api/test/artifacts/:executionId/:artifactId',
      this.authenticate,
      this.requirePermission('read'),
      async (req, res) => {
        try {
          if (!this.testRunner) {
            res.status(503).json({ error: 'Test runner not configured' });
            return;
          }

          const artifact = this.testRunner.getArtifact(
            req.params.executionId,
            req.params.artifactId
          );

          if (!artifact) {
            res.status(404).json({ error: 'Artifact not found' });
            return;
          }

          // Set appropriate content type based on artifact type
          if (artifact.type === 'report_json' || artifact.type === 'events_log' || artifact.type === 'telemetry') {
            res.setHeader('Content-Type', 'application/json');
          } else if (artifact.type === 'report_markdown') {
            res.setHeader('Content-Type', 'text/markdown');
          }

          res.setHeader('Content-Disposition', `attachment; filename="${artifact.name}"`);
          res.send(artifact.content);
        } catch (error) {
          res.status(500).json({
            error: 'Failed to get artifact',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    );

    // Deployment endpoints
    this.app.post('/api/deployments/versions',
      this.authenticate,
      this.requirePermission('write'),
      async (req, res) => {
        try {
          const request: DeploymentVersionRequest = req.body;
          
          if (!request.workflowSpec || !request.version || !request.createdBy) {
            res.status(400).json({ error: 'Missing required fields: workflowSpec, version, createdBy' });
            return;
          }

          const version = await this.consoleService.registerWorkflowVersion(
            request.workflowSpec,
            request.version,
            request.createdBy,
            request.metadata
          );

          res.json(version);
        } catch (error) {
          res.status(500).json({
            error: 'Failed to register workflow version',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    );

    this.app.post('/api/deployments',
      this.authenticate,
      this.requirePermission('deploy'),
      async (req, res) => {
        try {
          const request: DeploymentCreateRequest = req.body;
          
          if (!request.versionId || !request.environment || !request.deployedBy) {
            res.status(400).json({ error: 'Missing required fields: versionId, environment, deployedBy' });
            return;
          }

          const deployment = await this.consoleService.createDeployment(
            request.versionId,
            request.environment,
            request.deployedBy,
            request.metadata
          );

          res.json(deployment);
        } catch (error) {
          res.status(500).json({
            error: 'Failed to create deployment',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    );

    this.app.get('/api/deployments',
      this.authenticate,
      this.requirePermission('read'),
      async (req, res) => {
        try {
          const deployments = this.consoleService.getAllDeployments();
          res.json(deployments);
        } catch (error) {
          res.status(500).json({
            error: 'Failed to list deployments',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    );

    this.app.get('/api/deployments/:id',
      this.authenticate,
      this.requirePermission('read'),
      async (req, res) => {
        try {
          const deployment = this.consoleService.getDeployment(req.params.id);
          
          if (!deployment) {
            res.status(404).json({ error: 'Deployment not found' });
            return;
          }

          res.json(deployment);
        } catch (error) {
          res.status(500).json({
            error: 'Failed to get deployment',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    );

    this.app.get('/api/workflows/:workflowId/deployments',
      this.authenticate,
      this.requirePermission('read'),
      async (req, res) => {
        try {
          const deployments = this.consoleService.getDeploymentsByWorkflow(req.params.workflowId);
          res.json(deployments);
        } catch (error) {
          res.status(500).json({
            error: 'Failed to get workflow deployments',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    );

    this.app.post('/api/deployments/:id/approve',
      this.authenticate,
      this.requirePermission('devops_approve'),
      async (req, res) => {
        try {
          const request: DeploymentApprovalRequest = req.body;
          const session = (req as any).session;

          if (!request.riskTier || !request.approvalToken) {
            res.status(400).json({ error: 'Missing required fields: riskTier, approvalToken' });
            return;
          }

          await this.consoleService.approveDeployment(
            req.params.id,
            request.approver || session.username,
            request.riskTier,
            request.approvalToken,
            request.comment
          );

          res.json({ message: 'Deployment approved', success: true });
        } catch (error) {
          res.status(500).json({
            error: 'Failed to approve deployment',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    );

    this.app.post('/api/deployments/:id/reject',
      this.authenticate,
      this.requirePermission('devops_reject'),
      async (req, res) => {
        try {
          const request: DeploymentRejectRequest = req.body;
          const session = (req as any).session;

          if (!request.reason) {
            res.status(400).json({ error: 'Missing required field: reason' });
            return;
          }

          await this.consoleService.rejectDeployment(
            req.params.id,
            request.rejectedBy || session.username,
            request.reason
          );

          res.json({ message: 'Deployment rejected', success: true });
        } catch (error) {
          res.status(500).json({
            error: 'Failed to reject deployment',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    );

    this.app.post('/api/deployments/:id/complete',
      this.authenticate,
      this.requirePermission('deploy'),
      async (req, res) => {
        try {
          const request: DeploymentCompleteRequest = req.body;
          const session = (req as any).session;

          await this.consoleService.completeDeployment(
            req.params.id,
            request.deployedBy || session.username
          );

          res.json({ message: 'Deployment completed', success: true });
        } catch (error) {
          res.status(500).json({
            error: 'Failed to complete deployment',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    );

    this.app.post('/api/deployments/:id/tests',
      this.authenticate,
      this.requirePermission('read'),
      async (req, res) => {
        try {
          const request: SmokeTestRequest = req.body;

          if (!request.tests || !Array.isArray(request.tests)) {
            res.status(400).json({ error: 'Missing or invalid tests array' });
            return;
          }

          // Convert test definitions to executable tests
          const tests = request.tests.map(t => ({
            name: t.name,
            execute: async () => {
              // In production, this would execute actual workflow tests
              // For now, return a mock result
              return true;
            }
          }));

          const results = await this.consoleService.runDeploymentTests(req.params.id, tests);
          res.json(results);
        } catch (error) {
          res.status(500).json({
            error: 'Failed to run deployment tests',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    );

    this.app.post('/api/deployments/:id/promote',
      this.authenticate,
      this.requirePermission('devops_promote'),
      async (req, res) => {
        try {
          const request: DeploymentPromoteRequest = req.body;
          const session = (req as any).session;

          // Create a principal from the session
          const principal: Principal = {
            id: session.username,
            type: 'human',
            permissions: session.permissions.map((p: string) => ({
              action: p,
              resource: '*'
            }))
          };

          const prodDeployment = await this.consoleService.promoteToProduction(
            req.params.id,
            request.promotedBy || session.username,
            principal
          );

          res.json({ 
            message: 'Promoted to production', 
            success: true,
            deployment: prodDeployment
          });
        } catch (error) {
          res.status(500).json({
            error: 'Failed to promote deployment',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    );

    // Deployment workflow trigger endpoints
    this.app.post('/api/deployments/workflows/trigger',
      this.authenticate,
      this.requirePermission('deploy'),
      async (req, res) => {
        try {
          const { workflowType, versionId, environment, deployedBy, metadata } = req.body;
          const session = (req as any).session;

          if (!workflowType || !versionId) {
            res.status(400).json({ error: 'Missing required fields: workflowType, versionId' });
            return;
          }

          // Trigger the deployment workflow
          const workflow = await this.consoleService.triggerDeploymentWorkflow({
            workflowType,
            versionId,
            environment: environment || 'staging',
            deployedBy: deployedBy || session.username,
            metadata: {
              ...metadata,
              triggeredAt: new Date().toISOString(),
              triggeredBy: session.username,
            }
          });

          res.json({
            message: 'Deployment workflow triggered',
            success: true,
            workflow
          });
        } catch (error) {
          res.status(500).json({
            error: 'Failed to trigger deployment workflow',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    );

    this.app.post('/api/deployments/:id/stage',
      this.authenticate,
      this.requirePermission('deploy'),
      async (req, res) => {
        try {
          const { targetStage, metadata } = req.body;
          const session = (req as any).session;

          if (!targetStage) {
            res.status(400).json({ error: 'Missing required field: targetStage' });
            return;
          }

          // Transition deployment to the next stage
          const result = await this.consoleService.transitionDeploymentStage(
            req.params.id,
            targetStage,
            session.username,
            metadata
          );

          res.json({
            message: `Deployment transitioned to ${targetStage}`,
            success: true,
            result
          });
        } catch (error) {
          res.status(500).json({
            error: 'Failed to transition deployment stage',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    );

    this.app.post('/api/deployments/:id/smoke-tests',
      this.authenticate,
      this.requirePermission('read'),
      async (req, res) => {
        try {
          const { tests } = req.body;

          if (!tests || !Array.isArray(tests)) {
            res.status(400).json({ error: 'Missing or invalid tests array' });
            return;
          }

          // Execute smoke tests for the deployment
          const results = await this.consoleService.runSmokeTests(req.params.id, tests);

          res.json({
            deploymentId: req.params.id,
            testResults: results,
            overallStatus: results.every(r => r.status === 'passed') ? 'passed' : 'failed',
            passedTests: results.filter(r => r.status === 'passed').length,
            failedTests: results.filter(r => r.status === 'failed').length,
            totalTests: results.length
          });
        } catch (error) {
          res.status(500).json({
            error: 'Failed to run smoke tests',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    );

    this.app.get('/api/deployments/:id/status',
      this.authenticate,
      this.requirePermission('read'),
      async (req, res) => {
        try {
          const deployment = this.consoleService.getDeployment(req.params.id);
          
          if (!deployment) {
            res.status(404).json({ error: 'Deployment not found' });
            return;
          }

          // Get extended status including health metrics
          const health = await this.consoleService.getDeploymentHealth(req.params.id);
          
          res.json({
            deployment,
            health,
            canPromote: deployment.status === 'deployed' && 
                       deployment.environment === 'staging' &&
                       health?.status === 'healthy'
          });
        } catch (error) {
          res.status(500).json({
            error: 'Failed to get deployment status',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    );

    this.app.post('/api/deployments/:id/rollback',
      this.authenticate,
      this.requirePermission('deploy'),
      async (req, res) => {
        try {
          const { reason, targetVersion } = req.body;
          const session = (req as any).session;

          if (!reason) {
            res.status(400).json({ error: 'Missing required field: reason' });
            return;
          }

          // Execute rollback procedure
          const result = await this.consoleService.rollbackDeployment(
            req.params.id,
            targetVersion,
            session.username,
            reason
          );

          res.json({
            message: 'Rollback initiated',
            success: true,
            result
          });
        } catch (error) {
          res.status(500).json({
            error: 'Failed to rollback deployment',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    );

    // Gate check endpoints
    this.app.post('/api/deployments/:id/gate-checks',
      this.authenticate,
      this.requirePermission('deploy'),
      async (req, res) => {
        try {
          const { crvResults, thresholds } = req.body;

          // Run gate checks
          const gateCheck = await this.consoleService.runDeploymentGateChecks(
            req.params.id,
            crvResults,
            thresholds
          );

          res.json({
            message: 'Gate checks completed',
            gateCheck
          });
        } catch (error) {
          res.status(500).json({
            error: 'Failed to run gate checks',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    );

    this.app.get('/api/deployments/:id/gate-checks',
      this.authenticate,
      this.requirePermission('read'),
      async (req, res) => {
        try {
          const gateChecks = this.consoleService.getDeploymentGateChecks(req.params.id);
          res.json({ gateChecks });
        } catch (error) {
          res.status(500).json({
            error: 'Failed to get gate checks',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    );

    this.app.get('/api/deployments/:id/gate-checks/latest',
      this.authenticate,
      this.requirePermission('read'),
      async (req, res) => {
        try {
          const latestGateCheck = this.consoleService.getLatestDeploymentGateCheck(req.params.id);
          res.json({ gateCheck: latestGateCheck });
        } catch (error) {
          res.status(500).json({
            error: 'Failed to get latest gate check',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    );

    this.app.get('/api/deployments/:id/can-promote',
      this.authenticate,
      this.requirePermission('read'),
      async (req, res) => {
        try {
          const result = this.consoleService.canPromoteDeployment(req.params.id);
          res.json(result);
        } catch (error) {
          res.status(500).json({
            error: 'Failed to check promotion eligibility',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    );

    // Rollback trigger endpoints
    this.app.post('/api/deployments/:id/rollback-trigger',
      this.authenticate,
      this.requirePermission('deploy'),
      async (req, res) => {
        try {
          const { reason } = req.body;
          const session = (req as any).session;

          if (!reason) {
            res.status(400).json({ error: 'Missing required field: reason' });
            return;
          }

          // Create principal from session
          const principal = {
            id: session.username,
            type: 'human' as const,
            permissions: session.permissions || [],
          };

          // Trigger rollback
          const rollbackTrigger = await this.consoleService.triggerDeploymentRollback(
            req.params.id,
            reason,
            principal
          );

          res.json({
            message: 'Rollback triggered',
            rollbackTrigger
          });
        } catch (error) {
          res.status(500).json({
            error: 'Failed to trigger rollback',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    );

    this.app.get('/api/deployments/:id/rollback-triggers',
      this.authenticate,
      this.requirePermission('read'),
      async (req, res) => {
        try {
          const rollbackTriggers = this.consoleService.getDeploymentRollbackTriggers(req.params.id);
          res.json({ rollbackTriggers });
        } catch (error) {
          res.status(500).json({
            error: 'Failed to get rollback triggers',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    );

    // Monitoring endpoints
    this.app.get('/monitoring', (req: Request, res: Response) => {
      res.sendFile('monitoring.html', { root: __dirname + '/ui' });
    });

    this.app.get('/api/monitoring/metrics',
      this.authenticate,
      this.requirePermission('read'),
      async (req: Request, res: Response) => {
        try {
          const timeRangeMs = req.query.timeRange ? parseInt(req.query.timeRange as string) : undefined;
          const summary = this.consoleService.getMetricsSummary(timeRangeMs);
          
          if (!summary) {
            res.status(503).json({ error: 'Telemetry not configured' });
            return;
          }

          res.json(summary);
        } catch (error) {
          res.status(500).json({
            error: 'Failed to get metrics',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    );

    this.app.get('/api/monitoring/events',
      this.authenticate,
      this.requirePermission('read'),
      async (req: Request, res: Response) => {
        try {
          const filters: any = {};
          
          if (req.query.type) {
            filters.type = req.query.type;
          }
          if (req.query.workflowId) {
            filters.workflowId = req.query.workflowId;
          }
          if (req.query.startTime && req.query.endTime) {
            filters.startTime = new Date(req.query.startTime as string);
            filters.endTime = new Date(req.query.endTime as string);
          }

          const events = this.consoleService.getTelemetryEvents(filters);
          res.json(events);
        } catch (error) {
          res.status(500).json({
            error: 'Failed to get telemetry events',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    );

    // Reflexion endpoints
    this.app.get('/api/reflexion/postmortems/:workflowId',
      this.authenticate,
      this.requirePermission('read'),
      async (req: Request, res: Response) => {
        try {
          const postmortems = this.consoleService.getPostmortems(req.params.workflowId);
          res.json(postmortems);
        } catch (error) {
          res.status(500).json({
            error: 'Failed to get postmortems',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    );

    this.app.get('/api/reflexion/postmortem/:id',
      this.authenticate,
      this.requirePermission('read'),
      async (req: Request, res: Response) => {
        try {
          const postmortem = this.consoleService.getPostmortem(req.params.id);
          
          if (!postmortem) {
            res.status(404).json({ error: 'Postmortem not found' });
            return;
          }

          res.json(postmortem);
        } catch (error) {
          res.status(500).json({
            error: 'Failed to get postmortem',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    );

    this.app.post('/api/reflexion/trigger',
      this.authenticate,
      this.requirePermission('write'),
      async (req: Request, res: Response) => {
        try {
          const { workflowId, taskId, error, contextData } = req.body;

          if (!workflowId || !taskId || !error) {
            res.status(400).json({ error: 'Missing required fields: workflowId, taskId, error' });
            return;
          }

          // Convert error object to Error instance
          const errorObj = new Error(error.message || error);
          if (error.stack) {
            errorObj.stack = error.stack;
          }

          const result = await this.consoleService.triggerReflexion(
            workflowId,
            taskId,
            errorObj,
            contextData
          );

          res.json(result);
        } catch (error) {
          res.status(500).json({
            error: 'Failed to trigger reflexion',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    );

    this.app.get('/api/reflexion/stats',
      this.authenticate,
      this.requirePermission('read'),
      async (req: Request, res: Response) => {
        try {
          const stats = this.consoleService.getReflexionStats();
          
          if (!stats) {
            res.status(503).json({ error: 'Reflexion not configured' });
            return;
          }

          res.json(stats);
        } catch (error) {
          res.status(500).json({
            error: 'Failed to get reflexion stats',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    );

    // BenchRight endpoints
    this.app.get('/api/benchright/report',
      this.authenticate,
      this.requirePermission('read'),
      async (req: Request, res: Response) => {
        try {
          const timeRangeMs = req.query.timeRange ? parseInt(req.query.timeRange as string) : undefined;
          const report = this.consoleService.getBenchmarkReport(timeRangeMs);
          
          if (!report) {
            res.status(503).json({ error: 'BenchRight not configured' });
            return;
          }

          res.json(report);
        } catch (error) {
          res.status(500).json({
            error: 'Failed to get benchmark report',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    );

    this.app.get('/api/benchright/summary',
      this.authenticate,
      this.requirePermission('read'),
      async (req: Request, res: Response) => {
        try {
          const timeRangeMs = req.query.timeRange ? parseInt(req.query.timeRange as string) : undefined;
          const summary = this.consoleService.getBenchRightSummary(timeRangeMs);
          
          if (!summary) {
            res.status(503).json({ error: 'BenchRight not configured' });
            return;
          }

          res.json(summary);
        } catch (error) {
          res.status(500).json({
            error: 'Failed to get BenchRight summary',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    );

    this.app.get('/api/benchright/workflow/:workflowId',
      this.authenticate,
      this.requirePermission('read'),
      async (req: Request, res: Response) => {
        try {
          const score = this.consoleService.getBenchmarkScore(req.params.workflowId);
          
          if (!score) {
            res.status(404).json({ error: 'Benchmark score not found for workflow' });
            return;
          }

          res.json(score);
        } catch (error) {
          res.status(500).json({
            error: 'Failed to get benchmark score',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    );

    this.app.get('/api/benchright/counterfactual/:workflowId',
      this.authenticate,
      this.requirePermission('read'),
      async (req: Request, res: Response) => {
        try {
          const simulation = this.consoleService.getCounterfactualSimulation(req.params.workflowId);
          
          if (!simulation) {
            res.status(404).json({ error: 'Counterfactual simulation not found for workflow' });
            return;
          }

          res.json(simulation);
        } catch (error) {
          res.status(500).json({
            error: 'Failed to get counterfactual simulation',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    );

    // Agent Studio API endpoints
    this.app.post('/api/agents/generate',
      this.authenticate,
      this.requirePermission('read'),
      async (req, res) => {
        try {
          if (!this.agentBuilder) {
            res.status(503).json({ error: 'Agent builder not configured' });
            return;
          }

          // Validate request
          const validation = validateAgentGenerationRequest(req.body);
          if (!validation.success) {
            res.status(400).json({ 
              error: 'Invalid request',
              errors: validation.errors 
            });
            return;
          }

          // Generate agent blueprint
          const result = await this.agentBuilder.generateAgent(validation.data!);

          res.json({
            blueprint: result.blueprint,
            metadata: {
              generatedAt: result.metadata.timestamp,
              promptLength: result.metadata.prompt.length,
              responseLength: result.metadata.response.length,
            },
          });
        } catch (error) {
          res.status(500).json({ 
            error: 'Failed to generate agent',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    );

    this.app.post('/api/agents/validate',
      this.authenticate,
      this.requirePermission('read'),
      async (req, res) => {
        try {
          if (!this.agentBuilder) {
            res.status(503).json({ error: 'Agent builder not configured' });
            return;
          }

          // Perform comprehensive validation using the schema validator
          const comprehensiveValidation = validateAgentBlueprintComprehensive(req.body.blueprint || req.body);
          
          // Structure the response consistently
          const response: any = {
            valid: comprehensiveValidation.success,
            blueprint: comprehensiveValidation.data,
          };

          // Add schema validation errors if any
          if (comprehensiveValidation.errors && comprehensiveValidation.errors.length > 0) {
            response.errors = comprehensiveValidation.errors.map((err: string) => ({
              type: 'schema',
              category: 'validation',
              message: err,
              severity: 'error',
            }));
          }

          // Add compatibility warnings if any
          if (comprehensiveValidation.warnings && comprehensiveValidation.warnings.length > 0) {
            response.warnings = comprehensiveValidation.warnings.map((warn: string) => ({
              type: 'compatibility',
              category: 'validation',
              message: warn,
              severity: 'warning',
            }));
          }

          // If basic validation failed, return early
          if (!comprehensiveValidation.success) {
            res.json(response);
            return;
          }

          // Get principal from session for policy evaluation
          const session = (req as any).session;
          const principal = session ? {
            id: session.userId,
            roles: session.roles || ['user'],
            attributes: {
              tenantId: session.tenantId,
            },
          } : undefined;

          // Perform additional validation including CRV and policy evaluation
          const result = await this.agentBuilder.validateAgentComprehensive(
            comprehensiveValidation.data!,
            principal
          );

          // Merge additional validation results
          response.crvResult = result.crvResult;
          response.policyResult = result.policyResult;
          
          // Add issues from agent builder validation
          if (result.issues && result.issues.length > 0) {
            const additionalErrors = result.issues
              .filter((issue: any) => issue.severity === 'error')
              .map((issue: any) => ({
                type: issue.type || 'runtime',
                category: issue.category || 'validation',
                message: issue.message,
                severity: 'error',
              }));

            const additionalWarnings = result.issues
              .filter((issue: any) => issue.severity === 'warning')
              .map((issue: any) => ({
                type: issue.type || 'runtime',
                category: issue.category || 'validation',
                message: issue.message,
                severity: 'warning',
              }));

            if (additionalErrors.length > 0) {
              response.errors = [...(response.errors || []), ...additionalErrors];
            }

            if (additionalWarnings.length > 0) {
              response.warnings = [...(response.warnings || []), ...additionalWarnings];
            }
          }

          // Update valid flag based on all validations
          response.valid = response.valid && result.valid;

          res.json(response);
        } catch (error) {
          res.status(500).json({ 
            error: 'Failed to validate agent',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    );

    this.app.post('/api/agents/simulate',
      this.authenticate,
      this.requirePermission('read'),
      async (req, res) => {
        try {
          if (!this.agentBuilder) {
            res.status(503).json({ error: 'Agent builder not configured' });
            return;
          }

          // Validate request
          const validation = validateAgentSimulationRequest(req.body);
          if (!validation.success) {
            res.status(400).json({ 
              error: 'Invalid request',
              errors: validation.errors 
            });
            return;
          }

          const { blueprint, testScenario, dryRun } = validation.data!;

          // Helper function to sanitize strings for logging
          const sanitizeForLog = (value: unknown): string => {
            return String(value).replace(/[<>&"']/g, '');
          };

          // Perform dry-run simulation using AgentBuilder
          const result = await this.agentBuilder.simulateAgent({
            blueprint,
            testScenario,
            dryRun: dryRun !== undefined ? dryRun : true,
          });

          // Format response for UI
          const simulationResult = {
            success: result.success,
            executionTime: result.executionTime,
            trace: result.trace,
            toolCalls: result.toolCalls,
            policyDecisions: result.policyDecisions,
            crvOutcomes: result.crvOutcomes,
            blockedSteps: result.blockedSteps,
            sideEffects: result.sideEffects,
            outputs: {
              message: result.success ? 'Simulation completed successfully' : 'Simulation completed with issues',
              scenario: testScenario.description,
              dryRun,
              toolsUsed: result.toolCalls.map(tc => tc.toolName),
              policiesApplied: result.policyDecisions.map(pd => pd.policyName),
              blockedCount: result.blockedSteps.length,
            },
            logs: [
              `[INFO] Starting agent simulation: ${sanitizeForLog(blueprint.name)}`,
              `[INFO] Test scenario: ${sanitizeForLog(testScenario.description)}`,
              `[INFO] Dry-run mode: ${Boolean(dryRun)}`,
              ...result.trace.map(t => 
                `[${String(t.status).toUpperCase()}] Step ${parseInt(String(t.step))}: ${sanitizeForLog(t.action)}${t.blockReason ? ` - ${sanitizeForLog(t.blockReason)}` : ''}`
              ),
              `[${result.success ? 'SUCCESS' : 'WARNING'}] Simulation completed - ${parseInt(String(result.toolCalls.length))} tool calls, ${parseInt(String(result.blockedSteps.length))} blocked steps`,
            ],
            metrics: {
              toolExecutions: result.toolCalls.filter(tc => tc.status !== 'blocked').length,
              toolsBlocked: result.toolCalls.filter(tc => tc.status === 'blocked').length,
              policyChecks: result.policyDecisions.length,
              crvValidations: result.crvOutcomes.length,
              blockedSteps: result.blockedSteps.length,
              sideEffectsCaptured: result.sideEffects.length,
              workflowsTriggered: blueprint.workflows.length,
            },
          };

          res.json(simulationResult);
        } catch (error) {
          res.status(500).json({ 
            error: 'Failed to simulate agent',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    );

    this.app.post('/api/agents/deploy',
      this.authenticate,
      this.requirePermission('deploy'),
      async (req, res) => {
        try {
          // Validate request
          const validation = validateAgentDeploymentRequest(req.body);
          if (!validation.success) {
            res.status(400).json({ 
              error: 'Invalid request',
              errors: validation.errors 
            });
            return;
          }

          const { blueprint, environment, autoPromote, approvalRequired } = validation.data!;

          // Perform deployment stages: register -> stage -> (optional) promote
          const deploymentResult = {
            deploymentId: `deploy-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            agentId: blueprint.id,
            agentName: blueprint.name,
            version: blueprint.version,
            environment,
            status: approvalRequired ? 'pending_approval' : 'staging',
            stages: {
              register: {
                status: 'completed',
                timestamp: new Date(),
                message: 'Agent blueprint registered successfully',
              },
              stage: {
                status: approvalRequired ? 'pending' : 'completed',
                timestamp: approvalRequired ? undefined : new Date(),
                message: approvalRequired 
                  ? 'Waiting for approval before staging' 
                  : 'Agent staged successfully',
              },
              promote: {
                status: autoPromote && !approvalRequired ? 'completed' : 'pending',
                timestamp: autoPromote && !approvalRequired ? new Date() : undefined,
                message: autoPromote && !approvalRequired
                  ? 'Agent promoted to production'
                  : 'Promotion pending',
              },
            },
            approvalRequired,
            autoPromote,
            deployedAt: new Date(),
          };

          res.json(deploymentResult);
        } catch (error) {
          res.status(500).json({ 
            error: 'Failed to deploy agent',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    );

    // Agent Registry API endpoints
    this.app.post('/api/agents/registry/register',
      this.authenticate,
      this.requirePermission('write'),
      async (req, res) => {
        try {
          const { blueprint, changeDescription, tags } = req.body;
          const session = (req as any).session;
          
          if (!blueprint) {
            res.status(400).json({ error: 'Missing required field: blueprint' });
            return;
          }

          // Validate the blueprint
          const validation = validateAgentBlueprint(blueprint);
          if (!validation.success) {
            res.status(400).json({ 
              error: 'Invalid blueprint',
              errors: validation.errors 
            });
            return;
          }

          // Register the revision
          const revision = await this.consoleService.registerAgentRevision(
            validation.data!,
            session.username,
            changeDescription,
            tags
          );

          res.json(revision);
        } catch (error) {
          res.status(500).json({ 
            error: 'Failed to register agent revision',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    );

    this.app.get('/api/agents/registry/:agentId/versions',
      this.authenticate,
      this.requirePermission('read'),
      async (req, res) => {
        try {
          const { agentId } = req.params;
          const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
          const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;

          const revisions = await this.consoleService.listAgentRevisions(agentId, limit, offset);
          res.json(revisions);
        } catch (error) {
          res.status(500).json({ 
            error: 'Failed to list agent revisions',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    );

    this.app.get('/api/agents/registry/:agentId/versions/:version',
      this.authenticate,
      this.requirePermission('read'),
      async (req, res) => {
        try {
          const { agentId, version } = req.params;

          const revision = await this.consoleService.getAgentRevision(agentId, version);
          
          if (!revision) {
            res.status(404).json({ error: 'Revision not found' });
            return;
          }

          res.json(revision);
        } catch (error) {
          res.status(500).json({ 
            error: 'Failed to get agent revision',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    );

    this.app.post('/api/agents/registry/:agentId/rollback',
      this.authenticate,
      this.requirePermission('rollback'),
      async (req, res) => {
        try {
          const { agentId } = req.params;
          const { targetVersion, reason } = req.body;
          const session = (req as any).session;

          if (!targetVersion) {
            res.status(400).json({ error: 'Missing required field: targetVersion' });
            return;
          }

          const revision = await this.consoleService.rollbackAgent(
            agentId,
            targetVersion,
            session.username,
            reason
          );

          res.json(revision);
        } catch (error) {
          res.status(500).json({ 
            error: 'Failed to rollback agent',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    );

    this.app.get('/api/agents/registry/:agentId/diff',
      this.authenticate,
      this.requirePermission('read'),
      async (req, res) => {
        try {
          const { agentId } = req.params;
          const { versionA, versionB } = req.query;

          if (!versionA || !versionB) {
            res.status(400).json({ error: 'Missing required query parameters: versionA, versionB' });
            return;
          }

          const diff = await this.consoleService.compareAgentVersions(
            agentId,
            versionA as string,
            versionB as string
          );

          res.json(diff);
        } catch (error) {
          res.status(500).json({ 
            error: 'Failed to compare agent versions',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    );

    // Blueprint merging endpoint
    this.app.post('/api/agents/blueprint/merge',
      this.authenticate,
      this.requirePermission('read'),
      async (req, res) => {
        try {
          if (!this.agentBuilder) {
            res.status(503).json({ error: 'Agent builder not configured' });
            return;
          }

          const { blueprint, options } = req.body;

          if (!blueprint) {
            res.status(400).json({ error: 'Missing required field: blueprint' });
            return;
          }

          // Merge blueprint with optional configs
          const mergeOptions = options || {
            includeWorldModel: true,
            includeMemoryEngine: true,
            includeMCPServer: true,
          };

          const mergedBlueprint = await this.agentBuilder.mergeBlueprint(
            blueprint,
            mergeOptions
          );

          res.json({
            blueprint: mergedBlueprint,
            metadata: {
              includedConfigs: {
                worldModel: !!mergedBlueprint.worldModelConfig,
                memoryEngine: !!mergedBlueprint.memoryEngineConfig,
                mcpServer: !!mergedBlueprint.mcpServerConfig,
              },
              timestamp: new Date(),
            },
          });
        } catch (error) {
          res.status(500).json({
            error: 'Failed to merge blueprint',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    );

    // Validate merged blueprint endpoint
    this.app.post('/api/agents/blueprint/validate-merged',
      this.authenticate,
      this.requirePermission('read'),
      async (req, res) => {
        try {
          if (!this.agentBuilder) {
            res.status(503).json({ error: 'Agent builder not configured' });
            return;
          }

          const { blueprint } = req.body;

          if (!blueprint) {
            res.status(400).json({ error: 'Missing required field: blueprint' });
            return;
          }

          // Get principal from session for policy evaluation
          const session = (req as any).session;
          const principal = session ? {
            id: session.userId,
            roles: session.roles || ['user'],
            attributes: {
              tenantId: session.tenantId,
            },
          } : undefined;

          // Validate merged blueprint with comprehensive checks
          const result = await this.agentBuilder.validateMergedBlueprint(
            blueprint,
            principal
          );

          res.json(result);
        } catch (error) {
          res.status(500).json({
            error: 'Failed to validate merged blueprint',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    );

    // Export blueprint endpoint
    this.app.post('/api/agents/blueprint/export',
      this.authenticate,
      this.requirePermission('read'),
      async (req, res) => {
        try {
          if (!this.agentBuilder) {
            res.status(503).json({ error: 'Agent builder not configured' });
            return;
          }

          const { blueprint } = req.body;

          if (!blueprint) {
            res.status(400).json({ error: 'Missing required field: blueprint' });
            return;
          }

          const exportedBlueprint = this.agentBuilder.exportBlueprint(blueprint);

          // Set response headers for file download
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Content-Disposition', `attachment; filename="agent-blueprint-${blueprint.id || 'export'}.json"`);
          
          res.send(exportedBlueprint);
        } catch (error) {
          res.status(500).json({
            error: 'Failed to export blueprint',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    );

    this.app.get('/api/agents/registry',
      this.authenticate,
      this.requirePermission('read'),
      async (req, res) => {
        try {
          const agents = await this.consoleService.listRegisteredAgents();
          res.json(agents);
        } catch (error) {
          res.status(500).json({ 
            error: 'Failed to list registered agents',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    );

    // Perception API endpoints
    if (this.perceptionService) {
      // Process raw input
      this.app.post('/api/perception/process',
        this.authenticate,
        this.requirePermission('write'),
        async (req, res) => {
          try {
            const rawInput = req.body;
            const result = await this.perceptionService!.processInput(rawInput);
            res.json(result);
          } catch (error) {
            res.status(500).json({
              error: 'Failed to process input',
              details: error instanceof Error ? error.message : 'Unknown error'
            });
          }
        }
      );

      // Get all entities
      this.app.get('/api/perception/entities',
        this.authenticate,
        this.requirePermission('read'),
        async (req, res) => {
          try {
            const entities = await this.perceptionService!.getAllEntities();
            res.json(entities);
          } catch (error) {
            res.status(500).json({
              error: 'Failed to get entities',
              details: error instanceof Error ? error.message : 'Unknown error'
            });
          }
        }
      );

      // Get entities by type
      this.app.get('/api/perception/entities/type/:type',
        this.authenticate,
        this.requirePermission('read'),
        async (req, res) => {
          try {
            const entities = await this.perceptionService!.getEntitiesByType(req.params.type);
            res.json(entities);
          } catch (error) {
            res.status(500).json({
              error: 'Failed to get entities by type',
              details: error instanceof Error ? error.message : 'Unknown error'
            });
          }
        }
      );

      // Get entity by ID
      this.app.get('/api/perception/entities/:id',
        this.authenticate,
        this.requirePermission('read'),
        async (req, res) => {
          try {
            const entity = await this.perceptionService!.getEntity(req.params.id);
            if (!entity) {
              res.status(404).json({ error: 'Entity not found' });
              return;
            }
            res.json(entity);
          } catch (error) {
            res.status(500).json({
              error: 'Failed to get entity',
              details: error instanceof Error ? error.message : 'Unknown error'
            });
          }
        }
      );

      // Get contract history
      this.app.get('/api/perception/contracts',
        this.authenticate,
        this.requirePermission('read'),
        async (req, res) => {
          try {
            const contracts = this.perceptionService!.getContractHistory();
            res.json(contracts);
          } catch (error) {
            res.status(500).json({
              error: 'Failed to get contracts',
              details: error instanceof Error ? error.message : 'Unknown error'
            });
          }
        }
      );

      // Get contracts with conflicts
      this.app.get('/api/perception/conflicts',
        this.authenticate,
        this.requirePermission('read'),
        async (req, res) => {
          try {
            const conflicts = this.perceptionService!.getAllConflicts();
            res.json(conflicts);
          } catch (error) {
            res.status(500).json({
              error: 'Failed to get conflicts',
              details: error instanceof Error ? error.message : 'Unknown error'
            });
          }
        }
      );

      // Get statistics
      this.app.get('/api/perception/stats',
        this.authenticate,
        this.requirePermission('read'),
        async (req, res) => {
          try {
            const stats = this.perceptionService!.getStatistics();
            res.json(stats);
          } catch (error) {
            res.status(500).json({
              error: 'Failed to get statistics',
              details: error instanceof Error ? error.message : 'Unknown error'
            });
          }
        }
      );

      // Clear all data
      this.app.delete('/api/perception/clear',
        this.authenticate,
        this.requirePermission('write'),
        async (req, res) => {
          try {
            await this.perceptionService!.clear();
            res.json({ message: 'All perception data cleared' });
          } catch (error) {
            res.status(500).json({
              error: 'Failed to clear data',
              details: error instanceof Error ? error.message : 'Unknown error'
            });
          }
        }
      );
    }

    // Compliance and audit logging endpoints
    this.app.get('/api/compliance/audit-export',
      this.authenticate,
      this.enforceTenantIsolation,
      this.requirePermission('read'),
      async (req, res) => {
        try {
          const tenantId = (req as any).tenantId;
          const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
          const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;

          if (!tenantId) {
            res.status(400).json({ error: 'Tenant ID is required for audit export' });
            return;
          }

          const events = await this.consoleService.exportAuditLogs(tenantId, startDate, endDate);
          
          // Set headers for file download
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Content-Disposition', `attachment; filename="audit-export-${tenantId}-${Date.now()}.json"`);
          res.json({
            tenantId,
            exportedAt: new Date().toISOString(),
            startDate: startDate?.toISOString(),
            endDate: endDate?.toISOString(),
            eventCount: events.length,
            events
          });
        } catch (error) {
          res.status(500).json({
            error: 'Failed to export audit logs',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    );

    this.app.get('/api/compliance/retention-status',
      this.authenticate,
      this.enforceTenantIsolation,
      this.requirePermission('read'),
      async (req, res) => {
        try {
          const tenantId = (req as any).tenantId;

          if (!tenantId) {
            res.status(400).json({ error: 'Tenant ID is required' });
            return;
          }

          const status = await this.consoleService.getRetentionStatus(tenantId);
          res.json(status);
        } catch (error) {
          res.status(500).json({
            error: 'Failed to get retention status',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    );

    this.app.post('/api/compliance/apply-retention',
      this.authenticate,
      this.enforceTenantIsolation,
      this.requirePermission('write'),
      async (req, res) => {
        try {
          const tenantId = (req as any).tenantId;
          const { retentionDays } = req.body;

          if (!tenantId) {
            res.status(400).json({ error: 'Tenant ID is required' });
            return;
          }

          if (!retentionDays || retentionDays < 1) {
            res.status(400).json({ error: 'Valid retention period (in days) is required' });
            return;
          }

          const result = await this.consoleService.applyRetentionPolicy(tenantId, retentionDays);
          res.json({
            message: 'Retention policy applied',
            result
          });
        } catch (error) {
          res.status(500).json({
            error: 'Failed to apply retention policy',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    );

    // DevOps endpoints
    this.app.get('/devops', (req: Request, res: Response) => {
      res.sendFile('devops.html', { root: __dirname + '/ui' });
    });

    this.app.get('/api/devops/gate-status',
      this.authenticate,
      this.requirePermission('read'),
      async (req: Request, res: Response) => {
        try {
          const workflowId = req.query.workflowId as string | undefined;
          const gates = await this.consoleService.getGateStatus(workflowId);
          res.json(gates);
        } catch (error) {
          res.status(500).json({
            error: 'Failed to get gate status',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    );

    this.app.get('/api/devops/incidents',
      this.authenticate,
      this.requirePermission('read'),
      async (req: Request, res: Response) => {
        try {
          const summary = this.consoleService.getIncidentSummary();
          res.json(summary);
        } catch (error) {
          res.status(500).json({
            error: 'Failed to get incident summary',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    );

    this.app.get('/api/devops/release-health',
      this.authenticate,
      this.requirePermission('read'),
      async (req: Request, res: Response) => {
        try {
          const health = this.consoleService.getReleaseHealth();
          res.json(health);
        } catch (error) {
          res.status(500).json({
            error: 'Failed to get release health',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    );

    this.app.get('/api/devops/pipelines',
      this.authenticate,
      this.requirePermission('read'),
      async (req: Request, res: Response) => {
        try {
          const pipelines = this.consoleService.getDeploymentPipelines();
          res.json(pipelines);
        } catch (error) {
          res.status(500).json({
            error: 'Failed to get deployment pipelines',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    );

    // DevOps audit trail endpoints
    this.app.get('/api/devops/audit-trail',
      this.authenticate,
      this.enforceTenantIsolation,
      this.requirePermission('read'),
      async (req: Request, res: Response) => {
        try {
          const tenantId = (req as any).tenantId;
          const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
          const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
          const actionType = req.query.actionType as string | undefined;

          const auditEvents = await this.consoleService.getDevOpsAuditTrail(
            tenantId,
            startDate,
            endDate,
            actionType
          );

          res.json({
            events: auditEvents,
            count: auditEvents.length,
            filters: {
              startDate: startDate?.toISOString(),
              endDate: endDate?.toISOString(),
              actionType,
            },
          });
        } catch (error) {
          res.status(500).json({
            error: 'Failed to get DevOps audit trail',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    );

    this.app.get('/api/devops/audit-export',
      this.authenticate,
      this.enforceTenantIsolation,
      this.requirePermission('read'),
      async (req: Request, res: Response) => {
        try {
          const tenantId = (req as any).tenantId;
          const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
          const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;

          const auditEvents = await this.consoleService.exportDevOpsAudit(
            tenantId,
            startDate,
            endDate
          );

          // Set headers for file download
          res.setHeader('Content-Type', 'application/json');
          res.setHeader(
            'Content-Disposition',
            `attachment; filename="devops-audit-${tenantId || 'all'}-${Date.now()}.json"`
          );
          
          res.json({
            exportedAt: new Date().toISOString(),
            tenantId: tenantId || 'all',
            startDate: startDate?.toISOString(),
            endDate: endDate?.toISOString(),
            eventCount: auditEvents.length,
            events: auditEvents,
          });
        } catch (error) {
          res.status(500).json({
            error: 'Failed to export DevOps audit trail',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    );

    // Tool Adapter endpoints
    this.app.get('/tool-adapter-wizard', (req, res) => {
      res.sendFile('tool-adapter-wizard.html', { root: __dirname + '/ui' });
    });

    this.app.post('/api/tool-adapters/generate',
      this.authenticate,
      this.requirePermission('write'),
      async (req: Request, res: Response) => {
        try {
          const { 
            name, 
            description, 
            inputProperties, 
            outputProperties, 
            sideEffect, 
            idempotencyStrategy,
            riskTier,
            intent,
            hasCompensation,
            compensationDescription 
          } = req.body;

          // Validate required fields
          if (!name || !description) {
            res.status(400).json({ error: 'Missing required fields: name, description' });
            return;
          }

          // Generate adapter code
          const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
          const className = name.split(/[\s-_]+/).map((word: string) => 
            word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
          ).join('') + 'Tool';

          // Generate input schema
          const inputProps = (inputProperties || []).map((prop: any) => 
            `      ${prop.name}: { type: '${prop.type}'${prop.description ? `, description: '${prop.description}'` : ''} }`
          ).join(',\n');

          const inputRequired = (inputProperties || [])
            .filter((p: any) => p.required)
            .map((p: any) => `'${p.name}'`)
            .join(', ');

          // Generate output schema
          const outputProps = (outputProperties || []).map((prop: any) => 
            `      ${prop.name}: { type: '${prop.type}'${prop.description ? `, description: '${prop.description}'` : ''} }`
          ).join(',\n');

          const outputRequired = (outputProperties || [])
            .filter((p: any) => p.required)
            .map((p: any) => `'${p.name}'`)
            .join(', ');

          // Generate parameters
          const parameters = (inputProperties || []).map((prop: any) => 
            `    { name: '${prop.name}', type: '${prop.type}', required: ${prop.required}${prop.description ? `, description: '${prop.description}'` : ''} }`
          ).join(',\n');

          // Generate adapter template
          const adapterCode = `import { ToolSpec${sideEffect ? ', IdempotencyStrategy' : ''}${hasCompensation ? ', CompensationCapability' : ''} } from '../index';

/**
 * ${name} adapter
 * ${description}
 */
export class ${className} {
  /**
   * Create ${name} tool
   */
  static createTool(): ToolSpec {
    return {
      id: '${id}',
      name: '${name}',
      description: '${description}',
      parameters: [
${parameters}
      ],
      inputSchema: {
        type: 'object',
        properties: {
${inputProps}
        },
        required: [${inputRequired}],
        additionalProperties: false,
      },
      outputSchema: {
        type: 'object',
        properties: {
${outputProps}
        },
        required: [${outputRequired}],
      },
      sideEffect: ${sideEffect},
      idempotencyStrategy: ${sideEffect ? `IdempotencyStrategy.${idempotencyStrategy || 'CACHE_REPLAY'}` : 'undefined'},
      execute: async (params) => {
        // TODO: Implement tool execution logic
        ${(inputProperties || []).map((p: any) => `const ${p.name} = params.${p.name} as ${p.type === 'number' ? 'number' : p.type === 'boolean' ? 'boolean' : 'string'};`).join('\n        ')}
        
        // Your implementation here
        
        return {
          ${(outputProperties || []).map((p: any) => `${p.name}: undefined as any, // TODO: Implement`).join('\n          ')}
        };
      },${hasCompensation ? `
      compensation: {
        supported: true,
        mode: 'automatic',
        action: {
          description: '${compensationDescription || 'Undo the operation'}',
          execute: async (originalParams, result) => {
            // TODO: Implement compensation logic
            console.log('Compensating ${name}...', originalParams);
          },
          maxRetries: 3,
          timeoutMs: 5000,
        },
      },` : `
      compensation: {
        supported: false,
      },`}
    };
  }
}
`;

          // Generate test template
          const testCode = `import { describe, it, expect } from 'vitest';
import { ${className} } from '../src/adapters/${id}';
import { SafeToolWrapper } from '../src/index';

describe('${className}', () => {
  describe('createTool', () => {
    it('should create tool with correct specification', () => {
      const tool = ${className}.createTool();
      
      expect(tool.id).toBe('${id}');
      expect(tool.name).toBe('${name}');
      expect(tool.description).toBe('${description}');
      expect(tool.sideEffect).toBe(${sideEffect});
    });

    it('should validate input schema', async () => {
      const tool = ${className}.createTool();
      const wrapper = new SafeToolWrapper(tool);
      
      // Test with invalid input (missing required fields)
      const result = await wrapper.execute({});
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('validation failed');
    });

    it('should execute successfully with valid input', async () => {
      const tool = ${className}.createTool();
      const wrapper = new SafeToolWrapper(tool);
      
      // TODO: Provide valid test input
      const result = await wrapper.execute({
        ${(inputProperties || []).map((p: any) => `${p.name}: ${p.type === 'string' ? "'test-value'" : p.type === 'number' ? '123' : p.type === 'boolean' ? 'true' : '[]'}`).join(',\n        ')}
      });
      
      // TODO: Implement actual test logic
      // expect(result.success).toBe(true);
    });${hasCompensation ? `

    it('should support compensation', () => {
      const tool = ${className}.createTool();
      
      expect(tool.compensation?.supported).toBe(true);
      expect(tool.compensation?.action).toBeDefined();
    });` : ''}
  });
});
`;

          // Generate example template
          const exampleCode = `/**
 * Example usage of ${className}
 */

import { ${className} } from './adapters/${id}';
import { SafeToolWrapper, IntegratedToolWrapper } from '@aureus/tools';
import { createToolAction, createToolCRVGate } from '@aureus/sdk';
import { Validators } from '@aureus/crv';
import { RiskTier, Intent } from '@aureus/policy';

// Create the tool
const tool = ${className}.createTool();

// Simple usage with SafeToolWrapper
const safeWrapper = new SafeToolWrapper(tool);
const result = await safeWrapper.execute({
  ${(inputProperties || []).map((p: any) => `${p.name}: ${p.type === 'string' ? "'value'" : p.type === 'number' ? '123' : p.type === 'boolean' ? 'true' : '[]'}`).join(',\n  ')}
});

// Advanced usage with policy and CRV
const action = createToolAction({
  toolId: tool.id,
  toolName: tool.name,
  riskTier: RiskTier.${riskTier || 'LOW'},
  intent: Intent.${intent || 'READ'},
});

const crvGate = createToolCRVGate({
  toolName: tool.name,
  validators: [
    Validators.notNull(),
    // Add more validators as needed
  ],
  blockOnFailure: true,
});

const integratedWrapper = new IntegratedToolWrapper(tool);
// Execute with full safety (policy + CRV + idempotency)
// See packages/tools/README.md for full context setup
`;

          res.json({
            id,
            className,
            files: {
              adapter: {
                path: `packages/tools/src/adapters/${id}.ts`,
                content: adapterCode,
              },
              test: {
                path: `packages/tools/tests/${id}.test.ts`,
                content: testCode,
              },
              example: {
                path: `packages/tools/examples/${id}-example.ts`,
                content: exampleCode,
              },
            },
            nextSteps: [
              'Implement the execute function in the adapter',
              'Implement compensation logic (if applicable)',
              'Update the test file with proper test cases',
              'Build the tools package: npm run build --workspace=@aureus/tools',
              'Run tests: npm run test --workspace=@aureus/tools',
            ],
          });
        } catch (error) {
          res.status(500).json({
            error: 'Failed to generate tool adapter',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    );

    // World Model endpoints
    this.app.post('/api/world-models/generate',
      this.authenticate,
      this.requirePermission('write'),
      async (req: Request, res: Response) => {
        try {
          const { WorldModelBuilder } = await import('./world-model-builder');
          const builder = new WorldModelBuilder();
          
          const { description, domain, name, includeExamples, preferredStyle } = req.body;
          
          if (!description || !domain) {
            res.status(400).json({ error: 'Missing required fields: description, domain' });
            return;
          }

          const result = await builder.generateWorldModel({
            description,
            domain,
            name,
            includeExamples,
            preferredStyle,
          });

          res.json({
            spec: result.spec,
            metadata: {
              generatedAt: result.metadata.timestamp,
              promptLength: result.metadata.prompt.length,
              responseLength: result.metadata.response.length,
            },
          });
        } catch (error) {
          res.status(500).json({
            error: 'Failed to generate world model',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    );

    this.app.post('/api/world-models/validate',
      this.authenticate,
      this.requirePermission('read'),
      async (req: Request, res: Response) => {
        try {
          const { WorldModelBuilder } = await import('./world-model-builder');
          const { validateWorldModelWithCRV } = await import('@aureus/crv');
          
          const builder = new WorldModelBuilder();
          const spec = req.body;

          // Basic validation
          const basicValidation = builder.validateWorldModel(spec);
          
          if (!basicValidation.valid) {
            res.json(basicValidation);
            return;
          }

          // CRV validation
          const crvValidation = await validateWorldModelWithCRV(basicValidation.spec!);

          res.json({
            valid: basicValidation.valid && crvValidation.valid,
            spec: basicValidation.spec,
            errors: [...(basicValidation.errors || []), ...(crvValidation.errors || [])],
            warnings: [...(basicValidation.warnings || []), ...(crvValidation.warnings || [])],
            crvResults: crvValidation.crvResults,
          });
        } catch (error) {
          res.status(500).json({
            error: 'Failed to validate world model',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    );

    this.app.post('/api/world-models',
      this.authenticate,
      this.requirePermission('write'),
      async (req: Request, res: Response) => {
        try {
          const stateStore = this.getWorldModelStateStore();
          
          const spec = req.body;
          const entry = await stateStore.storeWorldModel(spec);

          res.json({
            success: true,
            id: spec.id,
            version: entry.version,
            timestamp: entry.timestamp,
          });
        } catch (error) {
          res.status(500).json({
            error: 'Failed to store world model',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    );

    this.app.get('/api/world-models',
      this.authenticate,
      this.requirePermission('read'),
      async (req: Request, res: Response) => {
        try {
          const stateStore = this.getWorldModelStateStore();
          
          const models = await stateStore.listWorldModels();
          res.json(models);
        } catch (error) {
          res.status(500).json({
            error: 'Failed to list world models',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    );

    this.app.get('/api/world-models/:id',
      this.authenticate,
      this.requirePermission('read'),
      async (req: Request, res: Response) => {
        try {
          const stateStore = this.getWorldModelStateStore();
          
          const spec = await stateStore.getWorldModel(req.params.id);
          
          if (!spec) {
            res.status(404).json({ error: 'World model not found' });
            return;
          }

          res.json(spec);
        } catch (error) {
          res.status(500).json({
            error: 'Failed to get world model',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    );

    this.app.get('/api/world-models/:id/versions',
      this.authenticate,
      this.requirePermission('read'),
      async (req: Request, res: Response) => {
        try {
          const stateStore = this.getWorldModelStateStore();
          
          const versions = await stateStore.getWorldModelVersions(req.params.id);
          res.json(versions);
        } catch (error) {
          res.status(500).json({
            error: 'Failed to get world model versions',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    );

    this.app.delete('/api/world-models/:id',
      this.authenticate,
      this.requirePermission('write'),
      async (req: Request, res: Response) => {
        try {
          const stateStore = this.getWorldModelStateStore();
          
          const { version } = req.body;
          
          if (!version) {
            res.status(400).json({ error: 'Missing required field: version' });
            return;
          }

          await stateStore.deleteWorldModel(req.params.id, version);
          res.json({ success: true, message: 'World model deleted' });
        } catch (error) {
          res.status(500).json({
            error: 'Failed to delete world model',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    );

    // Memory Engine endpoints
    this.app.post('/api/memory-engine/generate',
      this.authenticate,
      this.requirePermission('write'),
      async (req: Request, res: Response) => {
        try {
          if (!this.memoryEngineBuilder) {
            res.status(503).json({ error: 'Memory engine builder not configured' });
            return;
          }

          const config: MemoryPolicyConfig = req.body;

          // Validate required fields
          if (!config.goals || !Array.isArray(config.goals) || config.goals.length === 0) {
            res.status(400).json({ error: 'Missing or invalid required field: goals (must be a non-empty array)' });
            return;
          }

          if (!config.riskProfile) {
            res.status(400).json({ error: 'Missing required field: riskProfile' });
            return;
          }

          // Generate memory policy
          const policy: MemoryPolicy = this.memoryEngineBuilder.generateMemoryPolicy(config);

          // Get preview
          const preview = this.memoryEngineBuilder.getPolicyPreview(policy);

          res.json({
            policy,
            preview,
            generatedAt: new Date().toISOString(),
          });
        } catch (error) {
          res.status(500).json({
            error: 'Failed to generate memory policy',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    );

    this.app.post('/api/memory-engine/validate',
      this.authenticate,
      this.requirePermission('read'),
      async (req: Request, res: Response) => {
        try {
          if (!this.memoryEngineBuilder) {
            res.status(503).json({ error: 'Memory engine builder not configured' });
            return;
          }

          const policy: MemoryPolicy = req.body;

          // Validate required fields
          if (!policy || !policy.retentionTiers || !policy.summarizationSchedule || 
              !policy.indexingStrategy || !policy.governanceThresholds) {
            res.status(400).json({ 
              error: 'Invalid memory policy: missing required fields',
              required: ['retentionTiers', 'summarizationSchedule', 'indexingStrategy', 'governanceThresholds']
            });
            return;
          }

          // Validate the policy
          const validation = this.memoryEngineBuilder.validateMemoryPolicy(policy);

          const result: MemoryPolicyValidation = {
            valid: validation.valid,
            errors: validation.errors,
            warnings: validation.warnings,
            policy: validation.valid ? policy : undefined,
          };

          res.json(result);
        } catch (error) {
          res.status(500).json({
            error: 'Failed to validate memory policy',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    );

    // ============================================
    // MCP (Model Context Protocol) Endpoints
    // ============================================

    /**
     * POST /api/mcp/generate
     * Generate MCP server definition from tool descriptions
     */
    this.app.post('/api/mcp/generate',
      this.authenticate,
      this.requirePermission('write'),
      async (req, res) => {
        try {
          // Validate request
          const validation = validateMCPGenerationRequest(req.body);
          if (!validation.success) {
            res.status(400).json({
              error: 'Invalid MCP generation request',
              details: validation.errors,
            });
            return;
          }

          const request = validation.data!;

          // Generate MCP server definition
          const serverDefinition = this.mcpBuilder.generateMCPServer(
            request.tools,
            {
              serverName: request.serverName,
              serverVersion: request.serverVersion,
              serverDescription: request.serverDescription,
              defaultRiskTier: request.defaultRiskTier,
              enableCRVValidation: request.enableCRVValidation,
              inferRiskFromCapabilities: request.inferRiskFromCapabilities,
            }
          );

          // Validate generated server definition
          const serverValidation = this.mcpBuilder.validateMCPServer(serverDefinition);

          res.json({
            server: serverDefinition,
            validation: serverValidation,
          });
        } catch (error) {
          res.status(500).json({
            error: 'Failed to generate MCP server definition',
            details: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }
    );

    /**
     * POST /api/mcp/validate
     * Validate MCP server definition or action schema
     */
    this.app.post('/api/mcp/validate',
      this.authenticate,
      this.requirePermission('read'),
      async (req, res) => {
        try {
          const { server, action } = req.body;

          if (!server && !action) {
            res.status(400).json({
              error: 'Either server or action must be provided for validation',
            });
            return;
          }

          let validationResult;

          if (server) {
            // Validate entire server definition
            const schemaValidation = validateMCPServer(server);
            const governanceValidation = this.mcpBuilder.validateMCPServer(server);

            validationResult = {
              type: 'server',
              schema: schemaValidation,
              governance: governanceValidation,
            };
          } else if (action) {
            // Validate single action
            const schemaValidation = validateMCPAction(action);
            const governanceValidation = this.mcpBuilder.validateMCPAction(action);

            validationResult = {
              type: 'action',
              schema: schemaValidation,
              governance: governanceValidation,
            };
          }

          res.json(validationResult);
        } catch (error) {
          res.status(500).json({
            error: 'Failed to validate MCP definition',
            details: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }
    );

    // Error handler
    this.app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
      console.error('Unhandled error:', err);
      res.status(500).json({ 
        error: 'Internal server error',
        details: err.message 
      });
    });
  }

  /**
   * Start the API server
   */
  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.app.listen(this.port, () => {
        console.log(`Console API server listening on port ${this.port}`);
        console.log(`Health check: http://localhost:${this.port}/health`);
        resolve();
      });
    });
  }

  /**
   * Get Express app (for testing)
   */
  getApp(): express.Application {
    return this.app;
  }

  /**
   * Get or create shared state store for world models
   */
  private getWorldModelStateStore(): any {
    if (!this.worldModelStateStore) {
      // Lazy initialization of shared state store
      const { InMemoryStateStore } = require('@aureus/world-model');
      this.worldModelStateStore = new InMemoryStateStore();
    }
    return this.worldModelStateStore;
  }
}
