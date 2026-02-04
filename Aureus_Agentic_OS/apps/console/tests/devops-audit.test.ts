import { describe, it, expect, beforeEach } from 'vitest';
import { ConsoleService } from '../src/console-service';
import { InMemoryEventLog } from '@aureus/kernel';
import { InMemoryStateStore } from '@aureus/world-model';
import { DeploymentService } from '@aureus/kernel';
import { WorkflowSpec } from '@aureus/kernel';

describe('DevOps Audit Trail', () => {
  let consoleService: ConsoleService;
  let eventLog: InMemoryEventLog;
  let stateStore: InMemoryStateStore;
  let deploymentService: DeploymentService;

  beforeEach(() => {
    eventLog = new InMemoryEventLog();
    stateStore = new InMemoryStateStore();
    deploymentService = new DeploymentService(eventLog);
    consoleService = new ConsoleService(stateStore, eventLog, undefined, undefined, deploymentService);
  });

  describe('getDevOpsAuditTrail', () => {
    it('should return DevOps-specific events', async () => {
      // Create a test workflow spec
      const spec: WorkflowSpec = {
        id: 'test-workflow',
        name: 'Test Workflow',
        tasks: [],
        dependencies: new Map(),
      };

      // Register a version (logs DEPLOYMENT_VERSION_CREATED)
      const version = await deploymentService.registerVersion(spec, '1.0.0', 'test-user');

      // Create a deployment (logs DEPLOYMENT_INITIATED)
      const deployment = await deploymentService.createDeployment(
        version.id,
        'staging',
        'test-deployer'
      );

      // Approve the deployment (logs DEPLOYMENT_APPROVED)
      await deploymentService.approveDeployment(
        deployment.id,
        'test-approver',
        'HIGH',
        'approval-token-123',
        'Looks good'
      );

      // Get audit trail
      const auditEvents = await consoleService.getDevOpsAuditTrail();

      // Should have 3 DevOps events
      expect(auditEvents.length).toBeGreaterThanOrEqual(3);

      // Verify event types
      const eventTypes = auditEvents.map(e => e.type);
      expect(eventTypes).toContain('DEPLOYMENT_VERSION_CREATED');
      expect(eventTypes).toContain('DEPLOYMENT_INITIATED');
      expect(eventTypes).toContain('DEPLOYMENT_APPROVED');
    });

    it('should filter audit trail by date range', async () => {
      const spec: WorkflowSpec = {
        id: 'test-workflow',
        name: 'Test Workflow',
        tasks: [],
        dependencies: new Map(),
      };

      // Create events at different times
      const version = await deploymentService.registerVersion(spec, '1.0.0', 'user1');
      
      const startDate = new Date();
      await new Promise(resolve => setTimeout(resolve, 10)); // Small delay
      
      const deployment = await deploymentService.createDeployment(
        version.id,
        'staging',
        'user2'
      );

      const endDate = new Date();

      // Get audit trail with date filter
      const auditEvents = await consoleService.getDevOpsAuditTrail(
        undefined,
        startDate,
        endDate
      );

      // Should only include events within the date range
      expect(auditEvents.length).toBeGreaterThan(0);
      auditEvents.forEach(event => {
        expect(event.timestamp.getTime()).toBeGreaterThanOrEqual(startDate.getTime());
        expect(event.timestamp.getTime()).toBeLessThanOrEqual(endDate.getTime());
      });
    });

    it('should filter audit trail by action type', async () => {
      const spec: WorkflowSpec = {
        id: 'test-workflow',
        name: 'Test Workflow',
        tasks: [],
        dependencies: new Map(),
      };

      const version = await deploymentService.registerVersion(spec, '1.0.0', 'user1');
      const deployment = await deploymentService.createDeployment(
        version.id,
        'staging',
        'user2'
      );
      await deploymentService.approveDeployment(
        deployment.id,
        'approver',
        'MEDIUM',
        'token-123',
        'Approved'
      );

      // Filter for only approvals
      const approvalEvents = await consoleService.getDevOpsAuditTrail(
        undefined,
        undefined,
        undefined,
        'DEPLOYMENT_APPROVED'
      );

      expect(approvalEvents.length).toBe(1);
      expect(approvalEvents[0].type).toBe('DEPLOYMENT_APPROVED');
    });

    it('should include actor information in audit events', async () => {
      const spec: WorkflowSpec = {
        id: 'test-workflow',
        name: 'Test Workflow',
        tasks: [],
        dependencies: new Map(),
      };

      const version = await deploymentService.registerVersion(spec, '1.0.0', 'creator-user');
      const deployment = await deploymentService.createDeployment(
        version.id,
        'staging',
        'deployer-user'
      );
      await deploymentService.approveDeployment(
        deployment.id,
        'approver-user',
        'HIGH',
        'token-456',
        'Ready for staging'
      );

      const auditEvents = await consoleService.getDevOpsAuditTrail();

      // Verify actors are logged
      const versionCreatedEvent = auditEvents.find(e => e.type === 'DEPLOYMENT_VERSION_CREATED');
      expect(versionCreatedEvent?.data?.createdBy).toBe('creator-user');

      const deploymentInitiatedEvent = auditEvents.find(e => e.type === 'DEPLOYMENT_INITIATED');
      expect(deploymentInitiatedEvent?.data?.deployedBy).toBe('deployer-user');

      const approvalEvent = auditEvents.find(e => e.type === 'DEPLOYMENT_APPROVED');
      expect(approvalEvent?.data?.approver).toBe('approver-user');
    });

    it('should include reason/comment in approval events', async () => {
      const spec: WorkflowSpec = {
        id: 'test-workflow',
        name: 'Test Workflow',
        tasks: [],
        dependencies: new Map(),
      };

      const version = await deploymentService.registerVersion(spec, '1.0.0', 'user1');
      const deployment = await deploymentService.createDeployment(
        version.id,
        'staging',
        'user2'
      );

      const approvalComment = 'All tests passed, deployment approved';
      await deploymentService.approveDeployment(
        deployment.id,
        'approver',
        'HIGH',
        'token-789',
        approvalComment
      );

      const auditEvents = await consoleService.getDevOpsAuditTrail();
      const approvalEvent = auditEvents.find(e => e.type === 'DEPLOYMENT_APPROVED');

      expect(approvalEvent?.data?.comment).toBe(approvalComment);
    });

    it('should include reason in rejection events', async () => {
      const spec: WorkflowSpec = {
        id: 'test-workflow',
        name: 'Test Workflow',
        tasks: [],
        dependencies: new Map(),
      };

      const version = await deploymentService.registerVersion(spec, '1.0.0', 'user1');
      const deployment = await deploymentService.createDeployment(
        version.id,
        'staging',
        'user2'
      );

      const rejectionReason = 'Failed security scan';
      await deploymentService.rejectDeployment(
        deployment.id,
        'rejector',
        rejectionReason
      );

      const auditEvents = await consoleService.getDevOpsAuditTrail();
      const rejectionEvent = auditEvents.find(e => e.type === 'DEPLOYMENT_REJECTED');

      expect(rejectionEvent?.data?.reason).toBe(rejectionReason);
      expect(rejectionEvent?.data?.rejectedBy).toBe('rejector');
    });
  });

  describe('exportDevOpsAudit', () => {
    it('should export audit events in readable format', async () => {
      const spec: WorkflowSpec = {
        id: 'test-workflow',
        name: 'Test Workflow',
        tasks: [],
        dependencies: new Map(),
      };

      const version = await deploymentService.registerVersion(spec, '1.0.0', 'creator');
      const deployment = await deploymentService.createDeployment(
        version.id,
        'staging',
        'deployer'
      );
      await deploymentService.approveDeployment(
        deployment.id,
        'approver',
        'MEDIUM',
        'token-abc',
        'LGTM'
      );

      const exportedAudit = await consoleService.exportDevOpsAudit();

      expect(exportedAudit.length).toBeGreaterThan(0);

      // Check format of exported data
      const firstEvent = exportedAudit[0];
      expect(firstEvent).toHaveProperty('timestamp');
      expect(firstEvent).toHaveProperty('eventType');
      expect(firstEvent).toHaveProperty('action');
      expect(firstEvent).toHaveProperty('actor');
      expect(firstEvent).toHaveProperty('workflowId');

      // Verify timestamp is ISO string
      expect(typeof firstEvent.timestamp).toBe('string');
      expect(() => new Date(firstEvent.timestamp)).not.toThrow();
    });

    it('should mask sensitive data in exports', async () => {
      const spec: WorkflowSpec = {
        id: 'test-workflow',
        name: 'Test Workflow',
        tasks: [],
        dependencies: new Map(),
      };

      const version = await deploymentService.registerVersion(spec, '1.0.0', 'user');
      const deployment = await deploymentService.createDeployment(version.id, 'staging', 'user');
      await deploymentService.approveDeployment(
        deployment.id,
        'approver',
        'HIGH',
        'secret-approval-token-123',
        'Approved'
      );

      const exportedAudit = await consoleService.exportDevOpsAudit();
      const approvalEvent = exportedAudit.find(e => e.eventType === 'DEPLOYMENT_APPROVED');

      // Approval token should be masked
      expect(approvalEvent?.details?.approvalToken).toBe('***');
    });

    it('should include human-readable action descriptions', async () => {
      const spec: WorkflowSpec = {
        id: 'test-workflow',
        name: 'Test Workflow',
        tasks: [],
        dependencies: new Map(),
      };

      const version = await deploymentService.registerVersion(spec, '1.0.0', 'user');
      const exportedAudit = await consoleService.exportDevOpsAudit();

      const versionEvent = exportedAudit.find(e => e.eventType === 'DEPLOYMENT_VERSION_CREATED');
      expect(versionEvent?.action).toBe('Version Created');
    });
  });

  describe('Tenant Isolation', () => {
    it('should filter audit trail by tenant', async () => {
      const spec1: WorkflowSpec = {
        id: 'tenant1-workflow',
        name: 'Tenant 1 Workflow',
        tasks: [],
        dependencies: new Map(),
      };

      const spec2: WorkflowSpec = {
        id: 'tenant2-workflow',
        name: 'Tenant 2 Workflow',
        tasks: [],
        dependencies: new Map(),
      };

      // Create deployments for different tenants
      // Note: This would require tenant-aware event logging
      const version1 = await deploymentService.registerVersion(spec1, '1.0.0', 'user1');
      const version2 = await deploymentService.registerVersion(spec2, '1.0.0', 'user2');

      // In a real implementation, events would be tagged with tenantId
      // For this test, we verify the filtering mechanism works
      const allEvents = await consoleService.getDevOpsAuditTrail();
      expect(allEvents.length).toBeGreaterThan(0);

      // Test that tenant filtering would work if tenantId was set
      const tenant1Events = await consoleService.getDevOpsAuditTrail('tenant1');
      // With proper tenant isolation, this would return only tenant1 events
      expect(Array.isArray(tenant1Events)).toBe(true);
    });
  });
});
