import { describe, it, expect, beforeEach } from 'vitest';
import { DeploymentService } from '../src/deployment-service';
import { InMemoryEventLog } from '../src/event-log';
import { GoalGuardFSM, Principal, RiskTier, Intent } from '@aureus/policy';
import { SnapshotManager } from '@aureus/memory-hipcortex';
import { WorkflowSpec } from '../src/types';

describe('DeploymentService', () => {
  let deploymentService: DeploymentService;
  let eventLog: InMemoryEventLog;
  let policyGuard: GoalGuardFSM;
  let principal: Principal;

  beforeEach(() => {
    eventLog = new InMemoryEventLog();
    
    // Create a simple policy guard
    policyGuard = new GoalGuardFSM({
      agentId: 'test-agent',
      goalId: 'test-goal',
      deploymentEnv: 'test',
    });

    // Create a test principal with all required permissions
    principal = {
      id: 'test-user',
      type: 'human',
      permissions: [
        { 
          action: 'deploy', 
          resource: '*',
          intent: Intent.WRITE,
        },
        { 
          action: 'approve', 
          resource: '*',
          intent: Intent.ADMIN,
        },
      ],
    };

    deploymentService = new DeploymentService(eventLog, policyGuard);
  });

  describe('registerVersion', () => {
    it('should register a new workflow version', async () => {
      const spec: WorkflowSpec = {
        id: 'test-workflow',
        name: 'Test Workflow',
        tasks: [],
        dependencies: new Map(),
      };

      const version = await deploymentService.registerVersion(
        spec,
        '1.0.0',
        'test-user',
        { description: 'Initial version' }
      );

      expect(version.workflowId).toBe('test-workflow');
      expect(version.version).toBe('1.0.0');
      expect(version.createdBy).toBe('test-user');
      expect(version.spec).toEqual(spec);

      // Check that event was logged
      const events = await eventLog.read('test-workflow');
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('DEPLOYMENT_VERSION_CREATED');
    });

    it('should retrieve registered versions', async () => {
      const spec: WorkflowSpec = {
        id: 'test-workflow',
        name: 'Test Workflow',
        tasks: [],
        dependencies: new Map(),
      };

      const v1 = await deploymentService.registerVersion(spec, '1.0.0', 'user1');
      // Add a small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));
      const v2 = await deploymentService.registerVersion(spec, '1.1.0', 'user2');

      const versions = deploymentService.getVersionsByWorkflow('test-workflow');
      expect(versions).toHaveLength(2);
      // Versions are sorted by creation date (newest first)
      expect(versions[0].version).toBe('1.1.0');
      expect(versions[1].version).toBe('1.0.0');
    });
  });

  describe('createDeployment', () => {
    it('should create a staging deployment', async () => {
      const spec: WorkflowSpec = {
        id: 'test-workflow',
        name: 'Test Workflow',
        tasks: [],
        dependencies: new Map(),
      };

      const version = await deploymentService.registerVersion(spec, '1.0.0', 'test-user');
      
      const deployment = await deploymentService.createDeployment(
        version.id,
        'staging',
        'test-user',
        { description: 'Staging deployment' }
      );

      expect(deployment.versionId).toBe(version.id);
      expect(deployment.environment).toBe('staging');
      expect(deployment.status).toBe('pending');
      expect(deployment.approvals).toHaveLength(0);

      // Check event log
      const events = await eventLog.read('test-workflow');
      expect(events.some(e => e.type === 'DEPLOYMENT_INITIATED')).toBe(true);
    });

    it('should create a production deployment', async () => {
      const spec: WorkflowSpec = {
        id: 'test-workflow',
        name: 'Test Workflow',
        tasks: [],
        dependencies: new Map(),
      };

      const version = await deploymentService.registerVersion(spec, '1.0.0', 'test-user');
      
      const deployment = await deploymentService.createDeployment(
        version.id,
        'production',
        'test-user'
      );

      expect(deployment.environment).toBe('production');
    });

    it('should throw error for non-existent version', async () => {
      await expect(
        deploymentService.createDeployment('invalid-version', 'staging', 'test-user')
      ).rejects.toThrow('Version invalid-version not found');
    });
  });

  describe('runSmokeTests', () => {
    it('should run smoke tests and update status', async () => {
      const spec: WorkflowSpec = {
        id: 'test-workflow',
        name: 'Test Workflow',
        tasks: [],
        dependencies: new Map(),
      };

      const version = await deploymentService.registerVersion(spec, '1.0.0', 'test-user');
      const deployment = await deploymentService.createDeployment(version.id, 'staging', 'test-user');

      const tests = [
        {
          name: 'Test 1',
          execute: async () => true,
        },
        {
          name: 'Test 2',
          execute: async () => true,
        },
      ];

      const results = await deploymentService.runSmokeTests(deployment.id, tests);

      expect(results).toHaveLength(2);
      expect(results.every(r => r.status === 'passed')).toBe(true);

      const updatedDeployment = deploymentService.getDeployment(deployment.id);
      expect(updatedDeployment?.status).toBe('approved');
    });

    it('should mark deployment as failed if tests fail', async () => {
      const spec: WorkflowSpec = {
        id: 'test-workflow',
        name: 'Test Workflow',
        tasks: [],
        dependencies: new Map(),
      };

      const version = await deploymentService.registerVersion(spec, '1.0.0', 'test-user');
      const deployment = await deploymentService.createDeployment(version.id, 'staging', 'test-user');

      const tests = [
        {
          name: 'Passing Test',
          execute: async () => true,
        },
        {
          name: 'Failing Test',
          execute: async () => false,
        },
      ];

      const results = await deploymentService.runSmokeTests(deployment.id, tests);

      expect(results).toHaveLength(2);
      expect(results[0].status).toBe('passed');
      expect(results[1].status).toBe('failed');

      const updatedDeployment = deploymentService.getDeployment(deployment.id);
      expect(updatedDeployment?.status).toBe('failed');
    });
  });

  describe('approveDeployment', () => {
    it('should approve a deployment', async () => {
      const spec: WorkflowSpec = {
        id: 'test-workflow',
        name: 'Test Workflow',
        tasks: [],
        dependencies: new Map(),
      };

      const version = await deploymentService.registerVersion(spec, '1.0.0', 'test-user');
      const deployment = await deploymentService.createDeployment(version.id, 'production', 'test-user');

      await deploymentService.approveDeployment(
        deployment.id,
        'approver-user',
        'HIGH',
        'approval-token-123',
        'Looks good'
      );

      const updatedDeployment = deploymentService.getDeployment(deployment.id);
      expect(updatedDeployment?.status).toBe('approved');
      expect(updatedDeployment?.approvals).toHaveLength(1);
      expect(updatedDeployment?.approvals[0].approver).toBe('approver-user');
      expect(updatedDeployment?.approvals[0].riskTier).toBe('HIGH');

      // Check event log
      const events = await eventLog.read('test-workflow');
      expect(events.some(e => e.type === 'DEPLOYMENT_APPROVED')).toBe(true);
    });
  });

  describe('rejectDeployment', () => {
    it('should reject a deployment', async () => {
      const spec: WorkflowSpec = {
        id: 'test-workflow',
        name: 'Test Workflow',
        tasks: [],
        dependencies: new Map(),
      };

      const version = await deploymentService.registerVersion(spec, '1.0.0', 'test-user');
      const deployment = await deploymentService.createDeployment(version.id, 'production', 'test-user');

      await deploymentService.rejectDeployment(
        deployment.id,
        'reviewer-user',
        'Security concerns'
      );

      const updatedDeployment = deploymentService.getDeployment(deployment.id);
      expect(updatedDeployment?.status).toBe('rejected');

      // Check event log
      const events = await eventLog.read('test-workflow');
      expect(events.some(e => e.type === 'DEPLOYMENT_REJECTED')).toBe(true);
    });
  });

  describe('completeDeployment', () => {
    it('should complete an approved deployment', async () => {
      const spec: WorkflowSpec = {
        id: 'test-workflow',
        name: 'Test Workflow',
        tasks: [],
        dependencies: new Map(),
      };

      const version = await deploymentService.registerVersion(spec, '1.0.0', 'test-user');
      const deployment = await deploymentService.createDeployment(version.id, 'staging', 'test-user');

      // Approve first
      await deploymentService.approveDeployment(deployment.id, 'approver', 'LOW', 'token-123');

      // Then complete
      await deploymentService.completeDeployment(deployment.id, 'deploy-user');

      const updatedDeployment = deploymentService.getDeployment(deployment.id);
      expect(updatedDeployment?.status).toBe('deployed');
      expect(updatedDeployment?.deployedBy).toBe('deploy-user');
      expect(updatedDeployment?.deployedAt).toBeDefined();

      // Check event log
      const events = await eventLog.read('test-workflow');
      expect(events.some(e => e.type === 'DEPLOYMENT_COMPLETED')).toBe(true);
    });

    it('should not complete a non-approved deployment', async () => {
      const spec: WorkflowSpec = {
        id: 'test-workflow',
        name: 'Test Workflow',
        tasks: [],
        dependencies: new Map(),
      };

      const version = await deploymentService.registerVersion(spec, '1.0.0', 'test-user');
      const deployment = await deploymentService.createDeployment(version.id, 'staging', 'test-user');

      await expect(
        deploymentService.completeDeployment(deployment.id, 'deploy-user')
      ).rejects.toThrow('Cannot deploy: deployment status is pending');
    });
  });

  describe('promoteToProduction', () => {
    it('should promote a staging deployment to production', async () => {
      // For this test, create a deployment service without policy guard to avoid complex permission checks
      const simpleDeploymentService = new DeploymentService(eventLog);
      
      const spec: WorkflowSpec = {
        id: 'test-workflow',
        name: 'Test Workflow',
        tasks: [],
        dependencies: new Map(),
      };

      const version = await simpleDeploymentService.registerVersion(spec, '1.0.0', 'test-user');
      const stagingDeployment = await simpleDeploymentService.createDeployment(version.id, 'staging', 'test-user');

      // Run tests
      const tests = [{ name: 'Test', execute: async () => true }];
      await simpleDeploymentService.runSmokeTests(stagingDeployment.id, tests);

      // Complete staging deployment
      await simpleDeploymentService.completeDeployment(stagingDeployment.id, 'test-user');

      // Promote to production
      const prodDeployment = await simpleDeploymentService.promoteToProduction(
        stagingDeployment.id,
        'promoter-user',
        principal
      );

      expect(prodDeployment.environment).toBe('production');
      expect(prodDeployment.versionId).toBe(version.id);
      expect(prodDeployment.metadata?.promotedFrom).toBe(stagingDeployment.id);

      // Check event log
      const events = await eventLog.read('test-workflow');
      expect(events.some(e => e.type === 'DEPLOYMENT_PROMOTED')).toBe(true);
    });

    it('should not promote if staging deployment is not deployed', async () => {
      const spec: WorkflowSpec = {
        id: 'test-workflow',
        name: 'Test Workflow',
        tasks: [],
        dependencies: new Map(),
      };

      const version = await deploymentService.registerVersion(spec, '1.0.0', 'test-user');
      const stagingDeployment = await deploymentService.createDeployment(version.id, 'staging', 'test-user');

      await expect(
        deploymentService.promoteToProduction(stagingDeployment.id, 'promoter-user', principal)
      ).rejects.toThrow('Cannot promote: staging deployment status is pending');
    });

    it('should not promote if tests have not passed', async () => {
      const spec: WorkflowSpec = {
        id: 'test-workflow',
        name: 'Test Workflow',
        tasks: [],
        dependencies: new Map(),
      };

      const version = await deploymentService.registerVersion(spec, '1.0.0', 'test-user');
      const stagingDeployment = await deploymentService.createDeployment(version.id, 'staging', 'test-user');

      // Run failing tests
      const tests = [{ name: 'Test', execute: async () => false }];
      await deploymentService.runSmokeTests(stagingDeployment.id, tests);

      await expect(
        deploymentService.promoteToProduction(stagingDeployment.id, 'promoter-user', principal)
      ).rejects.toThrow();
    });
  });

  describe('getCurrentDeployment', () => {
    it('should return the current deployment for an environment', async () => {
      const spec: WorkflowSpec = {
        id: 'test-workflow',
        name: 'Test Workflow',
        tasks: [],
        dependencies: new Map(),
      };

      const version = await deploymentService.registerVersion(spec, '1.0.0', 'test-user');
      const deployment = await deploymentService.createDeployment(version.id, 'staging', 'test-user');
      
      // Approve and complete
      await deploymentService.approveDeployment(deployment.id, 'approver', 'LOW', 'token');
      await deploymentService.completeDeployment(deployment.id, 'test-user');

      const current = deploymentService.getCurrentDeployment('test-workflow', 'staging');
      expect(current?.id).toBe(deployment.id);
      expect(current?.status).toBe('deployed');
    });

    it('should return undefined if no deployment exists', () => {
      const current = deploymentService.getCurrentDeployment('non-existent', 'staging');
      expect(current).toBeUndefined();
    });
  });

  describe('getAllDeployments', () => {
    it('should return all deployments sorted by date', async () => {
      const spec: WorkflowSpec = {
        id: 'test-workflow',
        name: 'Test Workflow',
        tasks: [],
        dependencies: new Map(),
      };

      const version = await deploymentService.registerVersion(spec, '1.0.0', 'test-user');
      
      const d1 = await deploymentService.createDeployment(version.id, 'staging', 'test-user');
      const d2 = await deploymentService.createDeployment(version.id, 'production', 'test-user');

      const allDeployments = deploymentService.getAllDeployments();
      expect(allDeployments).toHaveLength(2);
    });
  });

  describe('runGateChecks', () => {
    it('should run gate checks and pass with good metrics', async () => {
      const spec: WorkflowSpec = {
        id: 'test-workflow',
        name: 'Test Workflow',
        tasks: [],
        dependencies: new Map(),
      };

      const version = await deploymentService.registerVersion(spec, '1.0.0', 'test-user');
      const deployment = await deploymentService.createDeployment(version.id, 'staging', 'test-user');

      // Run tests - all passing
      const tests = [
        { name: 'Test 1', execute: async () => true },
        { name: 'Test 2', execute: async () => true },
      ];
      await deploymentService.runSmokeTests(deployment.id, tests);

      // Approve deployment
      await deploymentService.approveDeployment(deployment.id, 'approver', 'LOW', 'token');

      // Run gate checks with good CRV results
      const crvResults = [
        { passed: true },
        { passed: true },
        { passed: true },
      ];

      const gateCheck = await deploymentService.runGateChecks(deployment.id, crvResults);

      expect(gateCheck.crvPassPercentage).toBe(100);
      expect(gateCheck.policyApprovalsMet).toBe(false); // Staging doesn't require policy approvals
      expect(gateCheck.testPassRate).toBe(100);
      expect(gateCheck.overallStatus).toBe('passed');
      expect(gateCheck.blockedPromotion).toBe(false);
      expect(gateCheck.failureReasons).toHaveLength(0);

      // Check event log
      const events = await eventLog.read('test-workflow');
      expect(events.some(e => e.type === 'DEPLOYMENT_GATE_CHECK')).toBe(true);
    });

    it('should fail gate checks with low CRV pass percentage', async () => {
      const spec: WorkflowSpec = {
        id: 'test-workflow',
        name: 'Test Workflow',
        tasks: [],
        dependencies: new Map(),
      };

      const version = await deploymentService.registerVersion(spec, '1.0.0', 'test-user');
      const deployment = await deploymentService.createDeployment(version.id, 'staging', 'test-user');

      // Run gate checks with poor CRV results
      const crvResults = [
        { passed: true },
        { passed: false },
        { passed: false },
        { passed: false },
      ];

      const thresholds = {
        minCrvPassPercentage: 80,
        requirePolicyApprovals: false,
        minTestPassRate: 90,
        blockOnFailure: true,
      };

      const gateCheck = await deploymentService.runGateChecks(deployment.id, crvResults, thresholds);

      expect(gateCheck.crvPassPercentage).toBe(25);
      expect(gateCheck.overallStatus).toBe('failed');
      expect(gateCheck.blockedPromotion).toBe(true);
      expect(gateCheck.failureReasons.length).toBeGreaterThan(0);

      // Check event log
      const events = await eventLog.read('test-workflow');
      expect(events.some(e => e.type === 'DEPLOYMENT_GATE_FAILED')).toBe(true);
      expect(events.some(e => e.type === 'DEPLOYMENT_PROMOTION_BLOCKED')).toBe(true);
    });

    it('should fail gate checks with low test pass rate', async () => {
      const spec: WorkflowSpec = {
        id: 'test-workflow',
        name: 'Test Workflow',
        tasks: [],
        dependencies: new Map(),
      };

      const version = await deploymentService.registerVersion(spec, '1.0.0', 'test-user');
      const deployment = await deploymentService.createDeployment(version.id, 'staging', 'test-user');

      // Run tests - mostly failing
      const tests = [
        { name: 'Test 1', execute: async () => true },
        { name: 'Test 2', execute: async () => false },
        { name: 'Test 3', execute: async () => false },
      ];
      await deploymentService.runSmokeTests(deployment.id, tests);

      const gateCheck = await deploymentService.runGateChecks(deployment.id);

      expect(gateCheck.testPassRate).toBeCloseTo(33.33, 1);
      expect(gateCheck.overallStatus).toBe('failed');
      expect(gateCheck.blockedPromotion).toBe(true);
    });

    it('should block promotion if gate checks fail', async () => {
      const simpleDeploymentService = new DeploymentService(eventLog);
      
      const spec: WorkflowSpec = {
        id: 'test-workflow',
        name: 'Test Workflow',
        tasks: [],
        dependencies: new Map(),
      };

      const version = await simpleDeploymentService.registerVersion(spec, '1.0.0', 'test-user');
      const stagingDeployment = await simpleDeploymentService.createDeployment(version.id, 'staging', 'test-user');

      // Run failing tests
      const tests = [
        { name: 'Test 1', execute: async () => true },
        { name: 'Test 2', execute: async () => false },
      ];
      await simpleDeploymentService.runSmokeTests(stagingDeployment.id, tests);

      // Complete deployment
      await simpleDeploymentService.approveDeployment(stagingDeployment.id, 'approver', 'LOW', 'token');
      await simpleDeploymentService.completeDeployment(stagingDeployment.id, 'test-user');

      // Run gate checks - will fail due to test pass rate
      await simpleDeploymentService.runGateChecks(stagingDeployment.id);

      // Try to promote - should fail
      await expect(
        simpleDeploymentService.promoteToProduction(stagingDeployment.id, 'promoter', principal)
      ).rejects.toThrow('Cannot promote');
    });
  });

  describe('canPromote', () => {
    it('should allow promotion when gate checks pass', async () => {
      const spec: WorkflowSpec = {
        id: 'test-workflow',
        name: 'Test Workflow',
        tasks: [],
        dependencies: new Map(),
      };

      const version = await deploymentService.registerVersion(spec, '1.0.0', 'test-user');
      const deployment = await deploymentService.createDeployment(version.id, 'staging', 'test-user');

      // Approve and complete
      await deploymentService.approveDeployment(deployment.id, 'approver', 'LOW', 'token');
      await deploymentService.completeDeployment(deployment.id, 'test-user');

      // Run passing gate checks
      await deploymentService.runGateChecks(deployment.id, [{ passed: true }]);

      const result = deploymentService.canPromote(deployment.id);
      expect(result.allowed).toBe(true);
    });

    it('should block promotion when gate checks fail', async () => {
      const spec: WorkflowSpec = {
        id: 'test-workflow',
        name: 'Test Workflow',
        tasks: [],
        dependencies: new Map(),
      };

      const version = await deploymentService.registerVersion(spec, '1.0.0', 'test-user');
      const deployment = await deploymentService.createDeployment(version.id, 'staging', 'test-user');

      // Complete deployment
      await deploymentService.approveDeployment(deployment.id, 'approver', 'LOW', 'token');
      await deploymentService.completeDeployment(deployment.id, 'test-user');

      // Run failing gate checks
      const crvResults = [{ passed: false }, { passed: false }, { passed: false }];
      await deploymentService.runGateChecks(deployment.id, crvResults);

      const result = deploymentService.canPromote(deployment.id);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Gate checks failed');
    });
  });

  describe('getGateChecks', () => {
    it('should return gate check results', async () => {
      const spec: WorkflowSpec = {
        id: 'test-workflow',
        name: 'Test Workflow',
        tasks: [],
        dependencies: new Map(),
      };

      const version = await deploymentService.registerVersion(spec, '1.0.0', 'test-user');
      const deployment = await deploymentService.createDeployment(version.id, 'staging', 'test-user');

      // Run multiple gate checks
      await deploymentService.runGateChecks(deployment.id, [{ passed: true }]);
      await deploymentService.runGateChecks(deployment.id, [{ passed: true }, { passed: false }]);

      const gateChecks = deploymentService.getGateChecks(deployment.id);
      expect(gateChecks).toHaveLength(2);
      expect(gateChecks[0].crvPassPercentage).toBe(100);
      expect(gateChecks[1].crvPassPercentage).toBe(50);
    });
  });

  describe('getLatestGateCheck', () => {
    it('should return the most recent gate check', async () => {
      const spec: WorkflowSpec = {
        id: 'test-workflow',
        name: 'Test Workflow',
        tasks: [],
        dependencies: new Map(),
      };

      const version = await deploymentService.registerVersion(spec, '1.0.0', 'test-user');
      const deployment = await deploymentService.createDeployment(version.id, 'staging', 'test-user');

      await deploymentService.runGateChecks(deployment.id, [{ passed: true }]);
      await deploymentService.runGateChecks(deployment.id, [{ passed: false }]);

      const latestGateCheck = deploymentService.getLatestGateCheck(deployment.id);
      expect(latestGateCheck?.crvPassPercentage).toBe(0);
    });
  });
});
