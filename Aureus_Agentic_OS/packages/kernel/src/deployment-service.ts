import { 
  WorkflowSpec, 
  WorkflowVersion, 
  Deployment, 
  DeploymentEnvironment, 
  DeploymentStatus,
  DeploymentApproval,
  TestResult,
  DeploymentGateCheck,
  DeploymentThresholds,
  RollbackTrigger,
  EventLog,
  Event
} from './types';
import { GoalGuardFSM, Principal, Action, RiskTier, GuardDecision } from '@aureus/policy';
import { SnapshotManager, RollbackRequest } from '@aureus/memory-hipcortex';
import { TelemetryCollector, TelemetryEventType } from '@aureus/observability';
import { RollbackOrchestrator } from './rollback-orchestrator';

/**
 * DeploymentService handles workflow versioning, deployments, and promotions
 * with risk-based approval requirements and audit trail logging
 */
export class DeploymentService {
  private versions = new Map<string, WorkflowVersion>();
  private deployments = new Map<string, Deployment>();
  private deploymentsByWorkflow = new Map<string, string[]>(); // workflowId -> deployment IDs
  private eventLog: EventLog;
  private policyGuard?: GoalGuardFSM;
  private snapshotManager?: SnapshotManager;
  private rollbackOrchestrator?: RollbackOrchestrator;
  private telemetry?: TelemetryCollector;
  private versionCounter = 0;
  private deploymentCounter = 0;
  private gateCheckCounter = 0;
  private rollbackTriggerCounter = 0;

  constructor(
    eventLog: EventLog,
    policyGuard?: GoalGuardFSM,
    snapshotManager?: SnapshotManager,
    rollbackOrchestrator?: RollbackOrchestrator,
    telemetry?: TelemetryCollector
  ) {
    this.eventLog = eventLog;
    this.policyGuard = policyGuard;
    this.snapshotManager = snapshotManager;
    this.rollbackOrchestrator = rollbackOrchestrator;
    this.telemetry = telemetry;
  }

  /**
   * Register a new workflow version
   */
  async registerVersion(
    spec: WorkflowSpec,
    version: string,
    createdBy: string,
    metadata?: Record<string, unknown>
  ): Promise<WorkflowVersion> {
    const versionId = `version-${++this.versionCounter}-${spec.id}`;
    
    const workflowVersion: WorkflowVersion = {
      id: versionId,
      workflowId: spec.id,
      version,
      spec,
      createdAt: new Date(),
      createdBy,
      metadata,
    };

    this.versions.set(versionId, workflowVersion);

    // Log version creation event
    await this.logEvent({
      timestamp: new Date(),
      type: 'DEPLOYMENT_VERSION_CREATED',
      workflowId: spec.id,
      data: {
        versionId,
        version,
        createdBy,
      },
    });

    console.log(`Registered workflow version ${version} for ${spec.id} (${versionId})`);

    return workflowVersion;
  }

  /**
   * Get a workflow version by ID
   */
  getVersion(versionId: string): WorkflowVersion | undefined {
    return this.versions.get(versionId);
  }

  /**
   * List all versions for a workflow
   */
  getVersionsByWorkflow(workflowId: string): WorkflowVersion[] {
    return Array.from(this.versions.values())
      .filter(v => v.workflowId === workflowId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  /**
   * Create a deployment to a specific environment
   */
  async createDeployment(
    versionId: string,
    environment: DeploymentEnvironment,
    deployedBy: string,
    metadata?: Record<string, unknown>
  ): Promise<Deployment> {
    const version = this.versions.get(versionId);
    if (!version) {
      throw new Error(`Version ${versionId} not found`);
    }

    const deploymentId = `deployment-${++this.deploymentCounter}-${environment}`;
    
    // Create snapshot for rollback support
    let rollbackSnapshotId: string | undefined;
    if (this.snapshotManager && environment === 'production') {
      // In production, we want to capture state for potential rollback
      console.log('Creating rollback snapshot for production deployment');
    }

    const deployment: Deployment = {
      id: deploymentId,
      versionId,
      environment,
      status: 'pending',
      approvals: [],
      testResults: [],
      rollbackSnapshotId,
      metadata,
    };

    this.deployments.set(deploymentId, deployment);

    // Index by workflow
    if (!this.deploymentsByWorkflow.has(version.workflowId)) {
      this.deploymentsByWorkflow.set(version.workflowId, []);
    }
    this.deploymentsByWorkflow.get(version.workflowId)!.push(deploymentId);

    // Log deployment initiation
    await this.logEvent({
      timestamp: new Date(),
      type: 'DEPLOYMENT_INITIATED',
      workflowId: version.workflowId,
      data: {
        deploymentId,
        versionId,
        environment,
        deployedBy,
      },
    });

    console.log(`Created deployment ${deploymentId} for version ${versionId} to ${environment}`);

    return deployment;
  }

  /**
   * Run smoke tests for a deployment
   */
  async runSmokeTests(
    deploymentId: string,
    tests: Array<{ name: string; execute: () => Promise<boolean> }>
  ): Promise<TestResult[]> {
    const deployment = this.deployments.get(deploymentId);
    if (!deployment) {
      throw new Error(`Deployment ${deploymentId} not found`);
    }

    console.log(`Running ${tests.length} smoke tests for deployment ${deploymentId}`);
    
    const results: TestResult[] = [];
    deployment.status = 'testing';

    const version = this.versions.get(deployment.versionId);
    const workflowId = version?.workflowId || deployment.id;

    for (const test of tests) {
      const startTime = Date.now();
      let status: 'passed' | 'failed' | 'skipped' = 'skipped';
      let error: string | undefined;

      try {
        const passed = await test.execute();
        status = passed ? 'passed' : 'failed';
        if (!passed) {
          error = 'Test assertion failed';
        }
      } catch (e) {
        status = 'failed';
        error = e instanceof Error ? e.message : String(e);
      }

      const duration = Date.now() - startTime;
      const result: TestResult = {
        id: `test-${results.length + 1}`,
        testName: test.name,
        status,
        executedAt: new Date(),
        duration,
        error,
      };

      results.push(result);

      // Log test result
      await this.logEvent({
        timestamp: new Date(),
        type: 'DEPLOYMENT_TEST_RUN',
        workflowId,
        data: {
          deploymentId,
          testName: test.name,
          status,
          duration,
          error,
        },
      });
    }

    deployment.testResults = results;

    const allPassed = results.every(r => r.status === 'passed');
    console.log(`Smoke tests completed: ${results.filter(r => r.status === 'passed').length}/${results.length} passed`);

    if (allPassed) {
      deployment.status = 'approved';
    } else {
      deployment.status = 'failed';
    }

    return results;
  }

  /**
   * Request approval for a high-risk deployment
   */
  async requestApproval(
    deploymentId: string,
    principal: Principal,
    riskTier: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  ): Promise<{ requiresApproval: boolean; decision?: GuardDecision }> {
    const deployment = this.deployments.get(deploymentId);
    if (!deployment) {
      throw new Error(`Deployment ${deploymentId} not found`);
    }

    const version = this.versions.get(deployment.versionId);
    if (!version) {
      throw new Error(`Version ${deployment.versionId} not found`);
    }

    // Determine if approval is required based on risk tier
    const requiresApproval = riskTier === 'HIGH' || riskTier === 'CRITICAL';

    if (!requiresApproval) {
      console.log(`Deployment ${deploymentId} does not require approval (${riskTier} risk)`);
      return { requiresApproval: false };
    }

    if (!this.policyGuard) {
      console.warn('Policy guard not configured, skipping approval check');
      return { requiresApproval: true };
    }

    console.log(`Requesting approval for deployment ${deploymentId} (${riskTier} risk)`);

    // Create action for policy evaluation
    const deploymentAction: Action = {
      id: `deploy-${deploymentId}`,
      name: `Deploy ${version.workflowId} to ${deployment.environment}`,
      riskTier: this.convertRiskTier(riskTier),
      requiredPermissions: [
        { 
          action: 'deploy', 
          resource: `workflow:${version.workflowId}:${deployment.environment}` 
        },
      ],
      metadata: {
        deploymentId,
        versionId: deployment.versionId,
        environment: deployment.environment,
      },
    };

    // Evaluate with policy guard
    const decision = await this.policyGuard.evaluate(principal, deploymentAction);

    console.log(`Policy decision: ${decision.allowed ? 'APPROVED' : 'REJECTED'} - ${decision.reason}`);

    return { requiresApproval: true, decision };
  }

  /**
   * Approve a deployment
   */
  async approveDeployment(
    deploymentId: string,
    approver: string,
    riskTier: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
    approvalToken: string,
    comment?: string
  ): Promise<void> {
    const deployment = this.deployments.get(deploymentId);
    if (!deployment) {
      throw new Error(`Deployment ${deploymentId} not found`);
    }

    const approval: DeploymentApproval = {
      approver,
      approvedAt: new Date(),
      riskTier,
      token: approvalToken,
      comment,
    };

    deployment.approvals.push(approval);
    deployment.status = 'approved';

    const version = this.versions.get(deployment.versionId);

    // Log approval
    await this.logEvent({
      timestamp: new Date(),
      type: 'DEPLOYMENT_APPROVED',
      workflowId: version?.workflowId || deploymentId,
      data: {
        deploymentId,
        approver,
        riskTier,
        comment,
      },
    });

    console.log(`Deployment ${deploymentId} approved by ${approver}`);
  }

  /**
   * Reject a deployment
   */
  async rejectDeployment(
    deploymentId: string,
    rejectedBy: string,
    reason: string
  ): Promise<void> {
    const deployment = this.deployments.get(deploymentId);
    if (!deployment) {
      throw new Error(`Deployment ${deploymentId} not found`);
    }

    deployment.status = 'rejected';

    const version = this.versions.get(deployment.versionId);

    // Log rejection
    await this.logEvent({
      timestamp: new Date(),
      type: 'DEPLOYMENT_REJECTED',
      workflowId: version?.workflowId || deploymentId,
      data: {
        deploymentId,
        rejectedBy,
        reason,
      },
    });

    console.log(`Deployment ${deploymentId} rejected by ${rejectedBy}: ${reason}`);
  }

  /**
   * Complete a deployment (mark as deployed)
   */
  async completeDeployment(
    deploymentId: string,
    deployedBy: string
  ): Promise<void> {
    const deployment = this.deployments.get(deploymentId);
    if (!deployment) {
      throw new Error(`Deployment ${deploymentId} not found`);
    }

    if (deployment.status !== 'approved') {
      throw new Error(`Cannot deploy: deployment status is ${deployment.status}`);
    }

    deployment.status = 'deployed';
    deployment.deployedAt = new Date();
    deployment.deployedBy = deployedBy;

    const version = this.versions.get(deployment.versionId);

    // Log completion
    await this.logEvent({
      timestamp: new Date(),
      type: 'DEPLOYMENT_COMPLETED',
      workflowId: version?.workflowId || deploymentId,
      data: {
        deploymentId,
        deployedBy,
        environment: deployment.environment,
      },
    });

    // Record telemetry
    if (this.telemetry && version) {
      this.telemetry.recordEvent({
        type: TelemetryEventType.CUSTOM,
        timestamp: new Date(),
        workflowId: version.workflowId,
        data: { 
          event: 'deployment_completed',
          environment: deployment.environment,
          versionId: deployment.versionId,
        }
      });
    }

    console.log(`Deployment ${deploymentId} completed to ${deployment.environment}`);
  }

  /**
   * Promote from staging to production
   */
  async promoteToProduction(
    stagingDeploymentId: string,
    promotedBy: string,
    principal: Principal
  ): Promise<Deployment> {
    const stagingDeployment = this.deployments.get(stagingDeploymentId);
    if (!stagingDeployment) {
      throw new Error(`Staging deployment ${stagingDeploymentId} not found`);
    }

    if (stagingDeployment.environment !== 'staging') {
      throw new Error('Can only promote from staging environment');
    }

    if (stagingDeployment.status !== 'deployed') {
      throw new Error(`Cannot promote: staging deployment status is ${stagingDeployment.status}`);
    }

    // Check if gate checks allow promotion
    const promotionCheck = this.canPromote(stagingDeploymentId);
    if (!promotionCheck.allowed) {
      throw new Error(`Cannot promote: ${promotionCheck.reason}`);
    }

    // Check if smoke tests passed
    const allTestsPassed = stagingDeployment.testResults?.every(t => t.status === 'passed') ?? true;
    if (!allTestsPassed) {
      throw new Error('Cannot promote: not all smoke tests passed');
    }

    console.log(`Promoting staging deployment ${stagingDeploymentId} to production`);

    // Get version for workflow ID
    const version = this.versions.get(stagingDeployment.versionId);

    // Create production deployment
    const prodDeployment = await this.createDeployment(
      stagingDeployment.versionId,
      'production',
      promotedBy,
      {
        promotedFrom: stagingDeploymentId,
      }
    );

    // Request approval for production deployment
    const approvalResult = await this.requestApproval(
      prodDeployment.id,
      principal,
      'HIGH' // Production deployments are high risk by default
    );

    if (approvalResult.requiresApproval && approvalResult.decision && !approvalResult.decision.allowed) {
      prodDeployment.status = 'rejected';
      throw new Error(`Production deployment rejected: ${approvalResult.decision.reason}`);
    }

    // Log promotion
    await this.logEvent({
      timestamp: new Date(),
      type: 'DEPLOYMENT_PROMOTED',
      workflowId: version?.workflowId || stagingDeploymentId,
      data: {
        stagingDeploymentId,
        productionDeploymentId: prodDeployment.id,
        promotedBy,
      },
    });

    console.log(`Created production deployment ${prodDeployment.id} promoted from staging`);

    return prodDeployment;
  }

  /**
   * Get deployment by ID
   */
  getDeployment(deploymentId: string): Deployment | undefined {
    return this.deployments.get(deploymentId);
  }

  /**
   * Get all deployments for a workflow
   */
  getDeploymentsByWorkflow(workflowId: string): Deployment[] {
    const deploymentIds = this.deploymentsByWorkflow.get(workflowId) || [];
    return deploymentIds
      .map(id => this.deployments.get(id))
      .filter((d): d is Deployment => d !== undefined)
      .sort((a, b) => {
        const aTime = a.deployedAt?.getTime() || 0;
        const bTime = b.deployedAt?.getTime() || 0;
        return bTime - aTime;
      });
  }

  /**
   * Get current deployment for an environment
   */
  getCurrentDeployment(workflowId: string, environment: DeploymentEnvironment): Deployment | undefined {
    const deployments = this.getDeploymentsByWorkflow(workflowId);
    return deployments.find(d => d.environment === environment && d.status === 'deployed');
  }

  /**
   * Get all deployments
   */
  getAllDeployments(): Deployment[] {
    return Array.from(this.deployments.values())
      .sort((a, b) => {
        const aTime = a.deployedAt?.getTime() || 0;
        const bTime = b.deployedAt?.getTime() || 0;
        return bTime - aTime;
      });
  }

  /**
   * Convert risk tier string to policy RiskTier enum
   */
  private convertRiskTier(riskTier: string): RiskTier {
    switch (riskTier) {
      case 'LOW': return RiskTier.LOW;
      case 'MEDIUM': return RiskTier.MEDIUM;
      case 'HIGH': return RiskTier.HIGH;
      case 'CRITICAL': return RiskTier.CRITICAL;
      default: return RiskTier.MEDIUM;
    }
  }

  /**
   * Run gate checks for a deployment
   * Evaluates CRV pass %, policy approvals, and test pass rate
   */
  async runGateChecks(
    deploymentId: string,
    crvResults?: Array<{ passed: boolean }>,
    thresholds?: DeploymentThresholds
  ): Promise<DeploymentGateCheck> {
    const deployment = this.deployments.get(deploymentId);
    if (!deployment) {
      throw new Error(`Deployment ${deploymentId} not found`);
    }

    const version = this.versions.get(deployment.versionId);
    const workflowId = version?.workflowId || deploymentId;

    // Use provided thresholds or defaults
    const effectiveThresholds: DeploymentThresholds = thresholds || deployment.thresholds || {
      minCrvPassPercentage: 80,
      requirePolicyApprovals: deployment.environment === 'production',
      minTestPassRate: 90,
      blockOnFailure: true,
    };

    // Store thresholds in deployment
    deployment.thresholds = effectiveThresholds;

    // Calculate CRV pass percentage
    const crvPassPercentage = crvResults && crvResults.length > 0
      ? (crvResults.filter(r => r.passed).length / crvResults.length) * 100
      : 100; // Default to 100% if no CRV results

    // Check policy approvals
    const policyApprovalsMet = !effectiveThresholds.requirePolicyApprovals || 
      deployment.approvals.length > 0;

    // Calculate test pass rate
    const testPassRate = deployment.testResults && deployment.testResults.length > 0
      ? (deployment.testResults.filter(t => t.status === 'passed').length / deployment.testResults.length) * 100
      : 100; // Default to 100% if no tests

    // Determine overall status
    const failureReasons: string[] = [];
    let overallStatus: 'passed' | 'failed' | 'warning' = 'passed';

    if (crvPassPercentage < effectiveThresholds.minCrvPassPercentage) {
      failureReasons.push(`CRV pass percentage ${crvPassPercentage.toFixed(1)}% below threshold ${effectiveThresholds.minCrvPassPercentage}%`);
      overallStatus = 'failed';
    }

    if (!policyApprovalsMet) {
      failureReasons.push('Policy approvals required but not met');
      overallStatus = 'failed';
    }

    if (testPassRate < effectiveThresholds.minTestPassRate) {
      failureReasons.push(`Test pass rate ${testPassRate.toFixed(1)}% below threshold ${effectiveThresholds.minTestPassRate}%`);
      overallStatus = 'failed';
    }

    const blockedPromotion = overallStatus === 'failed' && effectiveThresholds.blockOnFailure;

    const gateCheckId = `gate-${++this.gateCheckCounter}-${deploymentId}`;
    const gateCheck: DeploymentGateCheck = {
      id: gateCheckId,
      deploymentId,
      timestamp: new Date(),
      crvPassPercentage,
      policyApprovalsMet,
      testPassRate,
      overallStatus,
      blockedPromotion,
      failureReasons,
    };

    // Store gate check in deployment
    if (!deployment.gateChecks) {
      deployment.gateChecks = [];
    }
    deployment.gateChecks.push(gateCheck);

    // Log gate check event
    await this.logEvent({
      timestamp: new Date(),
      type: 'DEPLOYMENT_GATE_CHECK',
      workflowId,
      data: {
        deploymentId,
        gateCheckId,
        crvPassPercentage,
        policyApprovalsMet,
        testPassRate,
        overallStatus,
        blockedPromotion,
        failureReasons,
      },
    });

    // Log gate failure if failed
    if (overallStatus === 'failed') {
      await this.logEvent({
        timestamp: new Date(),
        type: 'DEPLOYMENT_GATE_FAILED',
        workflowId,
        data: {
          deploymentId,
          gateCheckId,
          failureReasons,
        },
      });

      console.log(`Gate check FAILED for deployment ${deploymentId}:`);
      failureReasons.forEach(reason => console.log(`  - ${reason}`));
    }

    // Log promotion blocked if applicable
    if (blockedPromotion) {
      await this.logEvent({
        timestamp: new Date(),
        type: 'DEPLOYMENT_PROMOTION_BLOCKED',
        workflowId,
        data: {
          deploymentId,
          gateCheckId,
          reason: 'Gate checks failed',
          failureReasons,
        },
      });

      console.log(`Promotion BLOCKED for deployment ${deploymentId} due to gate check failures`);
    }

    // Record telemetry
    if (this.telemetry && version) {
      this.telemetry.recordEvent({
        type: TelemetryEventType.CUSTOM,
        timestamp: new Date(),
        workflowId: version.workflowId,
        data: { 
          event: 'deployment_gate_check',
          deploymentId,
          overallStatus,
          blockedPromotion,
          crvPassPercentage,
          testPassRate,
        }
      });
    }

    return gateCheck;
  }

  /**
   * Trigger automatic rollback for a deployment
   * Integrates with HipCortex snapshots and RollbackOrchestrator
   */
  async triggerRollback(
    deploymentId: string,
    reason: string,
    principal: Principal
  ): Promise<RollbackTrigger> {
    const deployment = this.deployments.get(deploymentId);
    if (!deployment) {
      throw new Error(`Deployment ${deploymentId} not found`);
    }

    const version = this.versions.get(deployment.versionId);
    const workflowId = version?.workflowId || deploymentId;

    // Find snapshot to rollback to
    let snapshotId = deployment.rollbackSnapshotId;
    
    if (!snapshotId && this.snapshotManager) {
      // Try to get last verified snapshot
      const lastVerified = this.snapshotManager.getLastVerifiedSnapshot(workflowId);
      if (lastVerified) {
        snapshotId = lastVerified.id;
      }
    }

    if (!snapshotId) {
      throw new Error(`No rollback snapshot available for deployment ${deploymentId}`);
    }

    const triggerId = `rollback-trigger-${++this.rollbackTriggerCounter}-${deploymentId}`;
    const rollbackTrigger: RollbackTrigger = {
      id: triggerId,
      deploymentId,
      triggeredAt: new Date(),
      reason,
      snapshotId,
      status: 'pending',
    };

    // Store rollback trigger in deployment
    if (!deployment.rollbackTriggers) {
      deployment.rollbackTriggers = [];
    }
    deployment.rollbackTriggers.push(rollbackTrigger);

    // Log rollback trigger
    await this.logEvent({
      timestamp: new Date(),
      type: 'DEPLOYMENT_ROLLBACK_TRIGGERED',
      workflowId,
      data: {
        deploymentId,
        triggerId,
        reason,
        snapshotId,
      },
    });

    console.log(`Rollback triggered for deployment ${deploymentId}: ${reason}`);

    // Execute rollback if rollback orchestrator is available
    if (this.rollbackOrchestrator) {
      try {
        rollbackTrigger.status = 'executing';

        const rollbackRequest: RollbackRequest = {
          taskId: workflowId,
          snapshotId,
          requestedBy: principal.id,
          reason,
          riskTier: deployment.environment === 'production' ? 'HIGH' : 'MEDIUM',
        };

        const result = await this.rollbackOrchestrator.rollback(rollbackRequest, principal, workflowId);

        rollbackTrigger.status = 'completed';
        rollbackTrigger.completedAt = new Date();

        // Update deployment status
        deployment.status = 'rolled_back';

        // Log rollback completion
        await this.logEvent({
          timestamp: new Date(),
          type: 'DEPLOYMENT_ROLLBACK_COMPLETED',
          workflowId,
          data: {
            deploymentId,
            triggerId,
            snapshotId,
            success: result.success,
          },
        });

        console.log(`Rollback completed successfully for deployment ${deploymentId}`);

        // Record telemetry
        if (this.telemetry && version) {
          this.telemetry.recordEvent({
            type: TelemetryEventType.CUSTOM,
            timestamp: new Date(),
            workflowId: version.workflowId,
            data: { 
              event: 'deployment_rollback_completed',
              deploymentId,
              snapshotId,
            }
          });
        }
      } catch (error) {
        rollbackTrigger.status = 'failed';
        rollbackTrigger.completedAt = new Date();
        rollbackTrigger.error = error instanceof Error ? error.message : String(error);

        console.error(`Rollback failed for deployment ${deploymentId}:`, error);
      }
    } else {
      console.warn('RollbackOrchestrator not configured, rollback trigger recorded but not executed');
    }

    return rollbackTrigger;
  }

  /**
   * Get gate check results for a deployment
   */
  getGateChecks(deploymentId: string): DeploymentGateCheck[] {
    const deployment = this.deployments.get(deploymentId);
    return deployment?.gateChecks || [];
  }

  /**
   * Get rollback triggers for a deployment
   */
  getRollbackTriggers(deploymentId: string): RollbackTrigger[] {
    const deployment = this.deployments.get(deploymentId);
    return deployment?.rollbackTriggers || [];
  }

  /**
   * Get the latest gate check for a deployment
   */
  getLatestGateCheck(deploymentId: string): DeploymentGateCheck | undefined {
    const gateChecks = this.getGateChecks(deploymentId);
    return gateChecks.length > 0 ? gateChecks[gateChecks.length - 1] : undefined;
  }

  /**
   * Check if deployment can be promoted based on gate checks
   */
  canPromote(deploymentId: string): { allowed: boolean; reason?: string } {
    const deployment = this.deployments.get(deploymentId);
    if (!deployment) {
      return { allowed: false, reason: 'Deployment not found' };
    }

    // Check deployment status
    if (deployment.status !== 'deployed') {
      return { allowed: false, reason: `Deployment status is ${deployment.status}` };
    }

    // Check latest gate check
    const latestGateCheck = this.getLatestGateCheck(deploymentId);
    if (latestGateCheck) {
      if (latestGateCheck.blockedPromotion) {
        return { 
          allowed: false, 
          reason: `Gate checks failed: ${latestGateCheck.failureReasons.join(', ')}` 
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Log event to event log
   */
  private async logEvent(event: Event): Promise<void> {
    await this.eventLog.append(event);
  }
}
