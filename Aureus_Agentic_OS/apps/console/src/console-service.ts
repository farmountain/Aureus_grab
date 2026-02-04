import {
  WorkflowOrchestrator,
  WorkflowState,
  WorkflowSpec,
  TaskState,
  Event,
  StateStore,
  EventLog,
  DeploymentService,
  WorkflowVersion,
  Deployment,
  DeploymentEnvironment,
  AgentRegistry,
  AgentBlueprint,
  AgentBlueprintRevision,
  AgentBlueprintDiff,
  InMemoryAgentRegistryStorage,
} from '@aureus/kernel';
import { GoalGuardFSM, AuditEntry, Principal } from '@aureus/policy';
import { SnapshotManager, CombinedSnapshot } from '@aureus/memory-hipcortex';
import { TelemetryCollector, MetricsAggregator, MetricsSummary } from '@aureus/observability';
import { ReflexionEngine, Postmortem } from '@aureus/reflexion';
import {
  TraceCollector,
  BenchmarkEvaluator,
  BenchmarkReport,
  BenchmarkScore,
  CounterfactualSimulator,
  CounterfactualSimulation,
} from '@aureus/benchright';
import { WorkflowStatus, TaskStatusSummary, TimelineEntry, CRVStatus, PolicyStatus, DeploymentSummary } from './types';

// Extended snapshot type for console
type ConsoleSnapshot = CombinedSnapshot;

/**
 * ConsoleService provides high-level operations for the operator console
 * Integrates with kernel, policy, CRV, and memory components
 */
export class ConsoleService {
  private stateStore: StateStore;
  private eventLog: EventLog;
  private policyGuard?: GoalGuardFSM;
  private snapshotManager?: SnapshotManager;
  private deploymentService?: DeploymentService;
  private telemetryCollector?: TelemetryCollector;
  private metricsAggregator?: MetricsAggregator;
  private reflexionEngine?: ReflexionEngine;
  private traceCollector?: TraceCollector;
  private benchmarkEvaluator?: BenchmarkEvaluator;
  private counterfactualSimulator?: CounterfactualSimulator;
  private agentRegistry: AgentRegistry;
  private workflows: Map<string, WorkflowState> = new Map();
  private defaultRetentionDays: number;

  constructor(
    stateStore: StateStore,
    eventLog: EventLog,
    policyGuard?: GoalGuardFSM,
    snapshotManager?: SnapshotManager,
    deploymentService?: DeploymentService,
    telemetryCollector?: TelemetryCollector,
    reflexionEngine?: ReflexionEngine,
    defaultRetentionDays: number = 90
  ) {
    this.stateStore = stateStore;
    this.eventLog = eventLog;
    this.policyGuard = policyGuard;
    this.snapshotManager = snapshotManager;
    this.deploymentService = deploymentService;
    this.telemetryCollector = telemetryCollector;
    this.reflexionEngine = reflexionEngine;
    this.defaultRetentionDays = defaultRetentionDays;
    
    // Initialize agent registry with in-memory storage
    // In production, you'd pass a persistent storage implementation
    this.agentRegistry = new AgentRegistry(new InMemoryAgentRegistryStorage());
    
    // Initialize metrics aggregator if telemetry is available
    if (telemetryCollector) {
      this.metricsAggregator = new MetricsAggregator(telemetryCollector);
      
      // Initialize BenchRight components
      this.traceCollector = new TraceCollector();
      this.benchmarkEvaluator = new BenchmarkEvaluator();
      this.counterfactualSimulator = new CounterfactualSimulator();
    }
  }

  /**
   * Get list of all workflows (optionally filtered by tenant)
   */
  async listWorkflows(tenantId?: string): Promise<WorkflowStatus[]> {
    const statuses: WorkflowStatus[] = [];
    
    // If tenantId is provided and state store supports tenant filtering, use it
    if (tenantId && this.stateStore.listWorkflowsByTenant) {
      const tenantWorkflows = await this.stateStore.listWorkflowsByTenant(tenantId);
      for (const workflow of tenantWorkflows) {
        const status = await this.getWorkflowStatus(workflow.workflowId, tenantId);
        if (status) {
          statuses.push(status);
        }
      }
    } else {
      // Fallback to original behavior
      for (const [workflowId, workflow] of this.workflows.entries()) {
        const status = await this.getWorkflowStatus(workflowId, tenantId);
        if (status) {
          statuses.push(status);
        }
      }
    }

    return statuses;
  }

  /**
   * Get detailed status of a specific workflow (with tenant isolation)
   */
  async getWorkflowStatus(workflowId: string, tenantId?: string): Promise<WorkflowStatus | null> {
    const state = await this.stateStore.loadWorkflowState(workflowId, tenantId);
    if (!state) {
      return null;
    }

    // Store in cache
    this.workflows.set(workflowId, state);

    // Get events to determine current step and statuses
    const events = await this.eventLog.read(workflowId);
    
    // Extract CRV and policy status from events
    const crvStatus = this.extractCRVStatus(events);
    const policyStatus = this.extractPolicyStatus(events);
    
    // Find current step (most recent running or pending task)
    let currentStep: string | undefined;
    const runningTasks = Array.from(state.taskStates.entries())
      .filter(([_, task]) => task.status === 'running' || task.status === 'pending')
      .sort((a, b) => {
        const aTime = a[1].startedAt?.getTime() || 0;
        const bTime = b[1].startedAt?.getTime() || 0;
        return bTime - aTime;
      });
    
    if (runningTasks.length > 0) {
      currentStep = runningTasks[0][0];
    }

    // Convert task states to summaries
    const tasks: TaskStatusSummary[] = Array.from(state.taskStates.entries()).map(
      ([taskId, taskState]) => {
        // Check if this task requires approval
        const taskEvents = events.filter(e => e.taskId === taskId);
        const policyEvent = taskEvents.find(e => 
          e.metadata?.policyDecision?.requiresHumanApproval
        );

        return {
          taskId,
          name: taskId, // In real implementation, would get from task spec
          status: taskState.status,
          attempt: taskState.attempt,
          startedAt: taskState.startedAt,
          completedAt: taskState.completedAt,
          error: taskState.error,
          requiresApproval: policyEvent?.metadata?.policyDecision?.requiresHumanApproval || false,
          approvalToken: policyEvent?.metadata?.policyDecision?.approvalToken,
        };
      }
    );

    return {
      workflowId: state.workflowId,
      status: state.status,
      startedAt: state.startedAt,
      completedAt: state.completedAt,
      tasks,
      currentStep,
      crvStatus,
      policyStatus,
    };
  }

  /**
   * Get events for a workflow (audit log)
   */
  /**
   * Get all events for a specific workflow (with tenant isolation)
   */
  async getWorkflowEvents(workflowId: string, tenantId?: string): Promise<Event[]> {
    return await this.eventLog.read(workflowId, tenantId);
  }

  /**
   * Get timeline entries for visualization
   */
  async getTimeline(workflowId: string): Promise<TimelineEntry[]> {
    const events = await this.eventLog.read(workflowId);
    
    return events.map(event => ({
      timestamp: event.timestamp,
      type: event.type,
      workflowId: event.workflowId,
      taskId: event.taskId,
      description: this.formatEventDescription(event),
      metadata: event.metadata,
    }));
  }

  /**
   * Get available snapshots for a workflow
   */
  async getSnapshots(workflowId: string): Promise<ConsoleSnapshot[]> {
    if (!this.snapshotManager) {
      return [];
    }

    // Use getSnapshotsByTask which is the closest match
    // In real implementation, workflowId might be used as taskId
    return this.snapshotManager.getSnapshotsByTask(workflowId);
  }

  /**
   * Approve a gated action
   */
  async approveAction(
    workflowId: string,
    taskId: string,
    approvalToken: string,
    approver: string
  ): Promise<boolean> {
    if (!this.policyGuard) {
      throw new Error('Policy guard not configured');
    }

    // Validate the approval token
    const isValid = this.policyGuard.validateApprovalToken(taskId, approvalToken);
    
    if (isValid) {
      // Log the approval in event log
      await this.eventLog.append({
        timestamp: new Date(),
        type: 'ROLLBACK_POLICY_DECISION',
        workflowId,
        taskId,
        metadata: {
          policyDecision: {
            allowed: true,
            reason: `Approved by ${approver}`,
            requiresHumanApproval: false,
          },
        } as any,
      });
    }

    return isValid;
  }

  /**
   * Deny a gated action
   */
  async denyAction(
    workflowId: string,
    taskId: string,
    approvalToken: string,
    denier: string,
    reason: string
  ): Promise<boolean> {
    if (!this.policyGuard) {
      throw new Error('Policy guard not configured');
    }

    // For denial, we just log the decision
    // The token is not consumed, so the action remains blocked
    await this.eventLog.append({
      timestamp: new Date(),
      type: 'ROLLBACK_POLICY_DECISION',
      workflowId,
      taskId,
      metadata: {
        policyDecision: {
          allowed: false,
          reason: `Denied by ${denier}: ${reason}`,
          requiresHumanApproval: false,
        },
      } as any,
    });

    return true;
  }

  /**
   * Initiate rollback to a snapshot
   */
  async rollback(
    workflowId: string,
    snapshotId: string,
    requestedBy: string,
    reason?: string
  ): Promise<boolean> {
    if (!this.snapshotManager) {
      throw new Error('Snapshot manager not configured');
    }

    // Log rollback initiation
    await this.eventLog.append({
      timestamp: new Date(),
      type: 'ROLLBACK_INITIATED',
      workflowId,
      metadata: {
        snapshotId,
      } as any,
    });

    try {
      // Perform rollback using restoreSnapshot
      const restoredState = await this.snapshotManager.restoreSnapshot(snapshotId);

      // Log completion
      await this.eventLog.append({
        timestamp: new Date(),
        type: 'ROLLBACK_COMPLETED',
        workflowId,
        metadata: {
          snapshotId,
        } as any,
      });

      return true;
    } catch (error) {
      // Log failure
      await this.eventLog.append({
        timestamp: new Date(),
        type: 'ROLLBACK_FAILED',
        workflowId,
        metadata: {
          snapshotId,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      });

      return false;
    }
  }

  /**
   * Register a workflow for monitoring
   */
  registerWorkflow(workflowId: string, state: WorkflowState): void {
    this.workflows.set(workflowId, state);
  }

  /**
   * Extract CRV status from events
   */
  private extractCRVStatus(events: Event[]): CRVStatus {
    // Find most recent CRV gate result
    const crvEvents = events
      .filter(e => e.metadata?.crvGateResult)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    if (crvEvents.length === 0) {
      return { status: 'none' };
    }

    const latestCrv = crvEvents[0].metadata!.crvGateResult!;
    return {
      lastCheck: crvEvents[0].timestamp,
      status: latestCrv.passed ? 'passed' : 'failed',
      gateName: latestCrv.gateName,
      details: latestCrv.blockedCommit ? 'Commit blocked' : 'Commit allowed',
    };
  }

  /**
   * Extract policy status from events
   */
  private extractPolicyStatus(events: Event[]): PolicyStatus {
    // Find most recent policy decision
    const policyEvents = events
      .filter(e => e.metadata?.policyDecision)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    if (policyEvents.length === 0) {
      return { 
        status: 'none',
        requiresHumanApproval: false,
      };
    }

    const latestPolicy = policyEvents[0].metadata!.policyDecision!;
    let status: 'approved' | 'rejected' | 'pending' | 'none';
    
    if (latestPolicy.requiresHumanApproval) {
      status = 'pending';
    } else if (latestPolicy.allowed) {
      status = 'approved';
    } else {
      status = 'rejected';
    }

    return {
      status,
      requiresHumanApproval: latestPolicy.requiresHumanApproval,
      approvalToken: latestPolicy.approvalToken,
      reason: latestPolicy.reason,
    };
  }

  /**
   * Get workflow DAG structure
   */
  async getWorkflowDAG(workflowId: string): Promise<{
    tasks: Array<{id: string; name: string; type: string; riskTier?: string}>;
    dependencies: Record<string, string[]>;
  } | null> {
    const state = await this.stateStore.loadWorkflowState(workflowId);
    if (!state) {
      return null;
    }

    // In a full implementation, would load the workflow spec from storage
    // For now, return a basic structure based on task states
    const tasks = Array.from(state.taskStates.entries()).map(([id, taskState]) => ({
      id,
      name: id,
      type: 'action', // Would get from spec
      riskTier: undefined, // Would get from spec
    }));

    return {
      tasks,
      dependencies: {}, // Would get from spec
    };
  }

  /**
   * Save workflow specification
   */
  async saveWorkflowSpec(spec: WorkflowSpec): Promise<WorkflowSpec> {
    // In a full implementation, would persist the spec to storage
    // For now, just return it
    return spec;
  }

  /**
   * Format event for human-readable description
   */
  private formatEventDescription(event: Event): string {
    const taskInfo = event.taskId ? ` (Task: ${event.taskId})` : '';
    
    switch (event.type) {
      case 'WORKFLOW_STARTED':
        return `Workflow started${taskInfo}`;
      case 'WORKFLOW_COMPLETED':
        return `Workflow completed${taskInfo}`;
      case 'WORKFLOW_FAILED':
        return `Workflow failed${taskInfo}: ${event.metadata?.error || 'Unknown error'}`;
      case 'TASK_STARTED':
        return `Task started${taskInfo} (Attempt ${event.metadata?.attempt || 1})`;
      case 'TASK_COMPLETED':
        return `Task completed${taskInfo}`;
      case 'TASK_FAILED':
        return `Task failed${taskInfo}: ${event.metadata?.error || 'Unknown error'}`;
      case 'TASK_RETRY':
        return `Task retry${taskInfo}`;
      case 'ROLLBACK_INITIATED':
        return `Rollback initiated to snapshot ${event.metadata?.snapshotId}`;
      case 'ROLLBACK_COMPLETED':
        return `Rollback completed`;
      case 'ROLLBACK_FAILED':
        return `Rollback failed: ${event.metadata?.error}`;
      default:
        return `${event.type}${taskInfo}`;
    }
  }

  /**
   * Register a workflow version for deployment
   */
  async registerWorkflowVersion(
    spec: WorkflowSpec,
    version: string,
    createdBy: string,
    metadata?: Record<string, unknown>
  ): Promise<WorkflowVersion> {
    if (!this.deploymentService) {
      throw new Error('Deployment service not configured');
    }
    return this.deploymentService.registerVersion(spec, version, createdBy, metadata);
  }

  /**
   * Create a deployment
   */
  async createDeployment(
    versionId: string,
    environment: DeploymentEnvironment,
    deployedBy: string,
    metadata?: Record<string, unknown>
  ): Promise<Deployment> {
    if (!this.deploymentService) {
      throw new Error('Deployment service not configured');
    }
    return this.deploymentService.createDeployment(versionId, environment, deployedBy, metadata);
  }

  /**
   * Run smoke tests for a deployment
   */
  async runDeploymentTests(
    deploymentId: string,
    tests: Array<{ name: string; execute: () => Promise<boolean> }>
  ): Promise<any[]> {
    if (!this.deploymentService) {
      throw new Error('Deployment service not configured');
    }
    return this.deploymentService.runSmokeTests(deploymentId, tests);
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
    if (!this.deploymentService) {
      throw new Error('Deployment service not configured');
    }
    return this.deploymentService.approveDeployment(deploymentId, approver, riskTier, approvalToken, comment);
  }

  /**
   * Reject a deployment
   */
  async rejectDeployment(
    deploymentId: string,
    rejectedBy: string,
    reason: string
  ): Promise<void> {
    if (!this.deploymentService) {
      throw new Error('Deployment service not configured');
    }
    return this.deploymentService.rejectDeployment(deploymentId, rejectedBy, reason);
  }

  /**
   * Complete a deployment
   */
  async completeDeployment(
    deploymentId: string,
    deployedBy: string
  ): Promise<void> {
    if (!this.deploymentService) {
      throw new Error('Deployment service not configured');
    }
    return this.deploymentService.completeDeployment(deploymentId, deployedBy);
  }

  /**
   * Promote from staging to production
   */
  async promoteToProduction(
    stagingDeploymentId: string,
    promotedBy: string,
    principal: Principal
  ): Promise<Deployment> {
    if (!this.deploymentService) {
      throw new Error('Deployment service not configured');
    }
    return this.deploymentService.promoteToProduction(stagingDeploymentId, promotedBy, principal);
  }

  /**
   * Get deployment by ID
   */
  getDeployment(deploymentId: string): Deployment | undefined {
    if (!this.deploymentService) {
      return undefined;
    }
    return this.deploymentService.getDeployment(deploymentId);
  }

  /**
   * Get all deployments for a workflow
   */
  getDeploymentsByWorkflow(workflowId: string): Deployment[] {
    if (!this.deploymentService) {
      return [];
    }
    return this.deploymentService.getDeploymentsByWorkflow(workflowId);
  }

  /**
   * Get all deployments with summaries
   */
  getAllDeployments(): DeploymentSummary[] {
    if (!this.deploymentService) {
      return [];
    }

    const deployments = this.deploymentService.getAllDeployments();
    return deployments.map(deployment => {
      const version = this.deploymentService!.getVersion(deployment.versionId);
      const requiresApproval = deployment.environment === 'production' || 
                               (deployment.approvals.some(a => a.riskTier === 'HIGH' || a.riskTier === 'CRITICAL'));
      const testsPassed = deployment.testResults?.every(t => t.status === 'passed') ?? false;
      const canPromote = deployment.environment === 'staging' && 
                        deployment.status === 'deployed' && 
                        testsPassed;

      return {
        deployment,
        version: version!,
        requiresApproval,
        testsPassed,
        canPromote,
      };
    });
  }

  /**
   * Get current deployment for an environment
   */
  getCurrentDeployment(workflowId: string, environment: DeploymentEnvironment): Deployment | undefined {
    if (!this.deploymentService) {
      return undefined;
    }
    return this.deploymentService.getCurrentDeployment(workflowId, environment);
  }

  /**
   * Run gate checks for a deployment
   */
  async runDeploymentGateChecks(
    deploymentId: string,
    crvResults?: Array<{ passed: boolean }>,
    thresholds?: any
  ): Promise<any> {
    if (!this.deploymentService) {
      throw new Error('Deployment service not configured');
    }
    return this.deploymentService.runGateChecks(deploymentId, crvResults, thresholds);
  }

  /**
   * Get gate check results for a deployment
   */
  getDeploymentGateChecks(deploymentId: string): any[] {
    if (!this.deploymentService) {
      return [];
    }
    return this.deploymentService.getGateChecks(deploymentId);
  }

  /**
   * Get latest gate check for a deployment
   */
  getLatestDeploymentGateCheck(deploymentId: string): any | undefined {
    if (!this.deploymentService) {
      return undefined;
    }
    return this.deploymentService.getLatestGateCheck(deploymentId);
  }

  /**
   * Check if deployment can be promoted
   */
  canPromoteDeployment(deploymentId: string): { allowed: boolean; reason?: string } {
    if (!this.deploymentService) {
      return { allowed: false, reason: 'Deployment service not configured' };
    }
    return this.deploymentService.canPromote(deploymentId);
  }

  /**
   * Trigger rollback for a deployment
   */
  async triggerDeploymentRollback(
    deploymentId: string,
    reason: string,
    principal: Principal
  ): Promise<any> {
    if (!this.deploymentService) {
      throw new Error('Deployment service not configured');
    }
    return this.deploymentService.triggerRollback(deploymentId, reason, principal);
  }

  /**
   * Get rollback triggers for a deployment
   */
  getDeploymentRollbackTriggers(deploymentId: string): any[] {
    if (!this.deploymentService) {
      return [];
    }
    return this.deploymentService.getRollbackTriggers(deploymentId);
  }

  /**
   * Get metrics summary for a time range
   */
  getMetricsSummary(timeRangeMs?: number): MetricsSummary | null {
    if (!this.metricsAggregator) {
      return null;
    }
    return this.metricsAggregator.getMetricsSummary(timeRangeMs);
  }

  /**
   * Get telemetry events with optional filters
   */
  getTelemetryEvents(filters?: {
    type?: string;
    workflowId?: string;
    startTime?: Date;
    endTime?: Date;
  }) {
    if (!this.telemetryCollector) {
      return [];
    }

    let events = this.telemetryCollector.getEvents();

    // Apply filters
    if (filters?.type) {
      events = events.filter(e => e.type === filters.type);
    }
    if (filters?.workflowId) {
      events = events.filter(e => e.workflowId === filters.workflowId);
    }
    if (filters?.startTime && filters?.endTime) {
      events = this.telemetryCollector.getEventsInTimeRange(filters.startTime, filters.endTime);
    }

    return events;
  }

  /**
   * Get all postmortems for a workflow
   */
  getPostmortems(workflowId: string): Postmortem[] {
    if (!this.reflexionEngine) {
      return [];
    }
    return this.reflexionEngine.getPostmortemsForWorkflow(workflowId);
  }

  /**
   * Get a specific postmortem by ID
   */
  getPostmortem(postmortemId: string): Postmortem | undefined {
    if (!this.reflexionEngine) {
      return undefined;
    }
    return this.reflexionEngine.getPostmortem(postmortemId);
  }

  /**
   * Trigger reflexion analysis for a workflow failure
   */
  async triggerReflexion(
    workflowId: string,
    taskId: string,
    error: Error,
    contextData?: Record<string, unknown>
  ) {
    if (!this.reflexionEngine) {
      throw new Error('Reflexion engine not configured');
    }

    return await this.reflexionEngine.handleFailure(
      workflowId,
      taskId,
      error,
      contextData
    );
  }

  /**
   * Get reflexion statistics
   */
  getReflexionStats() {
    if (!this.reflexionEngine) {
      return null;
    }
    return this.reflexionEngine.getStats();
  }

  /**
   * Get telemetry collector (for direct access if needed)
   */
  getTelemetryCollector(): TelemetryCollector | undefined {
    return this.telemetryCollector;
  }

  /**
   * Get BenchRight evaluation report for workflows
   */
  getBenchmarkReport(timeRangeMs?: number): BenchmarkReport | null {
    if (!this.traceCollector || !this.benchmarkEvaluator || !this.telemetryCollector) {
      return null;
    }

    // Ingest traces from telemetry
    this.traceCollector.clear();
    this.traceCollector.ingestFromTelemetry(this.telemetryCollector);

    // Get traces in time range if specified
    const traces = timeRangeMs
      ? this.traceCollector.getTracesInTimeRange(
          new Date(Date.now() - timeRangeMs),
          new Date()
        )
      : this.traceCollector.getCompletedTraces();

    // Evaluate traces
    return this.benchmarkEvaluator.evaluateTraces(traces);
  }

  /**
   * Get benchmark score for a specific workflow
   */
  getBenchmarkScore(workflowId: string): BenchmarkScore | null {
    if (!this.traceCollector || !this.benchmarkEvaluator || !this.telemetryCollector) {
      return null;
    }

    // Ingest traces from telemetry
    this.traceCollector.clear();
    this.traceCollector.ingestFromTelemetry(this.telemetryCollector);

    // Find trace for the workflow
    const trace = this.traceCollector.getTraces().find((t) => t.workflowId === workflowId);
    if (!trace) {
      return null;
    }

    // Evaluate the trace
    return this.benchmarkEvaluator.evaluateTrace(trace);
  }

  /**
   * Get counterfactual simulation for a workflow
   */
  getCounterfactualSimulation(workflowId: string): CounterfactualSimulation | null {
    if (!this.traceCollector || !this.counterfactualSimulator || !this.telemetryCollector) {
      return null;
    }

    // Ingest traces from telemetry
    this.traceCollector.clear();
    this.traceCollector.ingestFromTelemetry(this.telemetryCollector);

    // Find trace for the workflow
    const trace = this.traceCollector.getTraces().find((t) => t.workflowId === workflowId);
    if (!trace) {
      return null;
    }

    // Run counterfactual simulation
    return this.counterfactualSimulator.simulate(trace);
  }

  /**
   * Get BenchRight summary statistics
   */
  getBenchRightSummary(timeRangeMs?: number) {
    const report = this.getBenchmarkReport(timeRangeMs);
    if (!report) {
      return null;
    }

    return {
      totalTraces: report.metadata.totalTraces,
      overallAverageScore: report.aggregateMetrics.overallAverageScore,
      passRate: report.aggregateMetrics.passRate,
      averageReasoningCoherence: report.aggregateMetrics.averageReasoningCoherence,
      averageCostValue: report.aggregateMetrics.averageCostValue,
      averageCounterfactual: report.aggregateMetrics.averageCounterfactual,
      timeRange: report.metadata.timeRange,
    };
  }

  /**
   * Export audit logs for compliance (with tenant isolation)
   */
  async exportAuditLogs(tenantId: string, startDate?: Date, endDate?: Date): Promise<Event[]> {
    if (!this.eventLog.exportEvents) {
      // Fallback if exportEvents not implemented
      if (this.eventLog.readByTenant) {
        const events = await this.eventLog.readByTenant(tenantId);
        return events.filter(event => {
          if (startDate && event.timestamp < startDate) return false;
          if (endDate && event.timestamp > endDate) return false;
          return true;
        });
      }
      return [];
    }
    
    return await this.eventLog.exportEvents(tenantId, startDate, endDate);
  }

  /**
   * Get retention status for a tenant
   */
  async getRetentionStatus(tenantId: string): Promise<{
    tenantId: string;
    totalEvents: number;
    oldestEvent?: Date;
    newestEvent?: Date;
    retentionPolicy?: { days: number };
  }> {
    const events = this.eventLog.readByTenant 
      ? await this.eventLog.readByTenant(tenantId)
      : [];
    
    let oldestEvent: Date | undefined;
    let newestEvent: Date | undefined;
    
    if (events.length > 0) {
      oldestEvent = events.reduce((oldest, event) => 
        event.timestamp < oldest ? event.timestamp : oldest, events[0].timestamp);
      newestEvent = events.reduce((newest, event) => 
        event.timestamp > newest ? event.timestamp : newest, events[0].timestamp);
    }

    return {
      tenantId,
      totalEvents: events.length,
      oldestEvent,
      newestEvent,
      retentionPolicy: { days: this.defaultRetentionDays },
    };
  }

  /**
   * Apply retention policy (remove events older than specified days)
   * Note: This is a placeholder implementation. In production, this would be handled
   * by the event log storage system with proper archival.
   */
  async applyRetentionPolicy(tenantId: string, retentionDays: number): Promise<{
    tenantId: string;
    retentionDays: number;
    eventsKept: number;
    eventsArchived: number;
    cutoffDate: Date;
  }> {
    const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    
    // In production, this would archive old events to long-term storage
    // For now, we just return metadata about what would be archived
    const events = this.eventLog.readByTenant 
      ? await this.eventLog.readByTenant(tenantId)
      : [];
    
    const eventsToKeep = events.filter(e => e.timestamp >= cutoffDate);
    const eventsToArchive = events.filter(e => e.timestamp < cutoffDate);

    return {
      tenantId,
      retentionDays,
      eventsKept: eventsToKeep.length,
      eventsArchived: eventsToArchive.length,
      cutoffDate,
    };
  }

  /**
   * Register a new agent blueprint revision
   * @param blueprint - The agent blueprint to register
   * @param author - The author of this revision
   * @param changeDescription - Description of changes in this revision
   * @param tags - Optional tags for categorization
   * @returns The registered revision
   */
  async registerAgentRevision(
    blueprint: AgentBlueprint,
    author: string,
    changeDescription?: string,
    tags?: string[]
  ): Promise<AgentBlueprintRevision> {
    return this.agentRegistry.registerRevision(blueprint, author, changeDescription, tags);
  }

  /**
   * Get a specific agent revision
   * @param agentId - The agent ID
   * @param version - The version number (or 'latest')
   * @returns The revision or undefined if not found
   */
  async getAgentRevision(agentId: string, version: string): Promise<AgentBlueprintRevision | undefined> {
    return this.agentRegistry.getRevision(agentId, version);
  }

  /**
   * List all revisions for an agent
   * @param agentId - The agent ID
   * @param limit - Maximum number of revisions to return
   * @param offset - Offset for pagination
   * @returns Array of revisions
   */
  async listAgentRevisions(
    agentId: string,
    limit?: number,
    offset?: number
  ): Promise<AgentBlueprintRevision[]> {
    return this.agentRegistry.listRevisions(agentId, limit, offset);
  }

  /**
   * List all registered agents
   * @returns Array of agent IDs
   */
  async listRegisteredAgents(): Promise<string[]> {
    return this.agentRegistry.listAgents();
  }

  /**
   * Rollback agent to a previous version
   * @param agentId - The agent ID
   * @param targetVersion - The version to rollback to
   * @param author - The author performing the rollback
   * @param reason - Reason for rollback
   * @returns The new revision created by the rollback
   */
  async rollbackAgent(
    agentId: string,
    targetVersion: string,
    author: string,
    reason?: string
  ): Promise<AgentBlueprintRevision> {
    return this.agentRegistry.rollback(agentId, targetVersion, author, reason);
  }

  /**
   * Compare two versions of an agent blueprint
   * @param agentId - The agent ID
   * @param versionA - First version to compare
   * @param versionB - Second version to compare
   * @returns The diff between the two versions
   */
  async compareAgentVersions(
    agentId: string,
    versionA: string,
    versionB: string
  ): Promise<AgentBlueprintDiff> {
    return this.agentRegistry.compareVersions(agentId, versionA, versionB);
  }

  /**
   * Get gate status aggregating CRV, policy, and test results
   */
  async getGateStatus(workflowId?: string): Promise<any[]> {
    const gates: any[] = [];
    
    // Aggregate CRV gate status
    if (workflowId) {
      const events = await this.eventLog.read(workflowId);
      const crvEvents = events.filter(e => e.metadata?.crvGateResult);
      
      for (const event of crvEvents) {
        const crvResult = event.metadata!.crvGateResult!;
        gates.push({
          gateName: crvResult.gateName,
          status: crvResult.passed ? 'passed' : 'failed',
          lastCheck: event.timestamp,
          details: {
            crvStatus: {
              passed: crvResult.passed,
              validatorResults: [], // Simplified in event metadata
            },
          },
        });
      }
      
      // Aggregate policy gate status
      const policyEvents = events.filter(e => e.metadata?.policyDecision);
      
      if (policyEvents.length > 0) {
        const latestPolicy = policyEvents[policyEvents.length - 1];
        const decision = latestPolicy.metadata!.policyDecision!;
        gates.push({
          gateName: 'Policy Gate',
          status: decision.requiresHumanApproval ? 'pending' : (decision.allowed ? 'passed' : 'failed'),
          lastCheck: latestPolicy.timestamp,
          details: {
            policyStatus: {
              allowed: decision.allowed,
              requiresApproval: decision.requiresHumanApproval,
              reason: decision.reason,
            },
          },
        });
      }
    }
    
    // Add test gate status from deployments
    if (this.deploymentService) {
      const deployments = workflowId 
        ? this.deploymentService.getDeploymentsByWorkflow(workflowId)
        : this.deploymentService.getAllDeployments();
      
      for (const deployment of deployments) {
        if (deployment.testResults && deployment.testResults.length > 0) {
          const passed = deployment.testResults.filter(t => t.status === 'passed').length;
          const failed = deployment.testResults.filter(t => t.status === 'failed').length;
          const total = deployment.testResults.length;
          
          gates.push({
            gateName: `Test Gate (${deployment.environment})`,
            status: failed === 0 ? 'passed' : 'failed',
            lastCheck: new Date(deployment.deployedAt),
            details: {
              testStatus: {
                passed,
                failed,
                total,
                coverage: total > 0 ? (passed / total) * 100 : 0,
              },
            },
          });
        }
      }
    }
    
    return gates;
  }

  /**
   * Get incident summary from telemetry and workflow failures
   */
  getIncidentSummary(): any {
    const incidents: any[] = [];
    
    // Get incidents from telemetry errors
    if (this.telemetryCollector) {
      const events = this.telemetryCollector.getEvents();
      const errorEvents = events.filter(e => 
        e.type === 'error' || e.type === 'workflow_failed' || e.type === 'task_failed'
      );
      
      const incidentMap = new Map<string, any>();
      
      for (const event of errorEvents) {
        const incidentId = `incident-${event.workflowId}-${event.timestamp.getTime()}`;
        
        if (!incidentMap.has(incidentId)) {
          const severity = this.determineSeverity(event);
          incidentMap.set(incidentId, {
            id: incidentId,
            severity,
            status: 'active',
            title: event.metadata?.error || `Workflow ${event.workflowId} failed`,
            workflowId: event.workflowId,
            startedAt: event.timestamp,
            affectedComponents: [event.workflowId || 'unknown'],
          });
        }
      }
      
      incidents.push(...Array.from(incidentMap.values()));
    }
    
    // Get incidents from reflexion postmortems
    if (this.reflexionEngine) {
      const stats = this.reflexionEngine.getStats();
      if (stats && stats.totalFailures > 0) {
        // Recent failures are active incidents
        incidents.push({
          id: `reflexion-summary`,
          severity: 'medium',
          status: 'investigating',
          title: `${stats.totalFailures} workflow failures under investigation`,
          startedAt: new Date(),
          affectedComponents: ['reflexion-engine'],
        });
      }
    }
    
    const active = incidents.filter(i => i.status === 'active').length;
    const resolved = incidents.filter(i => i.status === 'resolved').length;
    const critical = incidents.filter(i => i.severity === 'critical').length;
    
    return {
      total: incidents.length,
      active,
      resolved,
      critical,
      incidents: incidents.slice(0, 10), // Return most recent 10
    };
  }

  /**
   * Get release health metrics
   */
  getReleaseHealth(): any {
    if (!this.deploymentService) {
      return {
        overallStatus: 'unknown',
        deployments: { total: 0, successful: 0, failed: 0, pending: 0 },
        metrics: { successRate: 0, averageDeployTime: 0, mttr: 0, changeFailureRate: 0 },
        recentDeployments: [],
      };
    }
    
    const allDeployments = this.deploymentService.getAllDeployments();
    
    const successful = allDeployments.filter(d => d.status === 'deployed').length;
    const failed = allDeployments.filter(d => d.status === 'failed').length;
    const pending = allDeployments.filter(d => d.status === 'pending_approval' || d.status === 'staging').length;
    const total = allDeployments.length;
    
    const successRate = total > 0 ? (successful / total) * 100 : 0;
    
    // Calculate average deploy time
    const completedDeployments = allDeployments.filter(d => d.status === 'deployed' || d.status === 'failed');
    const avgDeployTime = completedDeployments.length > 0
      ? completedDeployments.reduce((sum, d) => {
          const start = new Date(d.deployedAt).getTime();
          const end = d.approvals.length > 0 
            ? new Date(d.approvals[d.approvals.length - 1].approvedAt!).getTime()
            : start;
          return sum + (end - start);
        }, 0) / completedDeployments.length
      : 0;
    
    const changeFailureRate = total > 0 ? (failed / total) * 100 : 0;
    
    // Determine overall status
    let overallStatus: 'healthy' | 'degraded' | 'critical' = 'healthy';
    if (changeFailureRate > 20 || successRate < 80) {
      overallStatus = 'critical';
    } else if (changeFailureRate > 10 || successRate < 90) {
      overallStatus = 'degraded';
    }
    
    // Get recent deployments with health
    const recentDeployments = allDeployments
      .slice(-10)
      .reverse()
      .map(d => {
        const version = this.deploymentService!.getVersion(d.versionId);
        return {
          id: d.id,
          environment: d.environment,
          status: d.status,
          version: version?.version || 'unknown',
          deployedAt: d.deployedAt,
          health: d.status === 'deployed' ? 'healthy' : (d.status === 'failed' ? 'failed' : 'degraded'),
        };
      });
    
    return {
      overallStatus,
      deployments: { total, successful, failed, pending },
      metrics: {
        successRate: Math.round(successRate),
        averageDeployTime: Math.round(avgDeployTime / 1000), // Convert to seconds
        mttr: 0, // Would need incident tracking for this
        changeFailureRate: Math.round(changeFailureRate),
      },
      recentDeployments,
    };
  }

  /**
   * Get deployment pipelines with approval queues
   */
  getDeploymentPipelines(): any[] {
    if (!this.deploymentService) {
      return [];
    }
    
    const deployments = this.deploymentService.getAllDeployments();
    const pipelines: any[] = [];
    
    for (const deployment of deployments) {
      const version = this.deploymentService.getVersion(deployment.versionId);
      if (!version) continue;
      
      const stages = [
        {
          name: 'Version Registration',
          status: 'passed' as const,
          startedAt: new Date(version.createdAt),
          completedAt: new Date(version.createdAt),
        },
        {
          name: 'Staging Deployment',
          status: deployment.environment === 'staging' || deployment.environment === 'production'
            ? 'passed' as const
            : (deployment.status === 'failed' ? 'failed' as const : 'pending' as const),
          startedAt: new Date(deployment.deployedAt),
          completedAt: deployment.status === 'deployed' ? new Date(deployment.deployedAt) : undefined,
          gates: [], // Would be populated from getGateStatus
        },
        {
          name: 'Approval Queue',
          status: deployment.approvals.length > 0
            ? 'passed' as const
            : (deployment.status === 'pending_approval' ? 'pending' as const : 'blocked' as const),
          approvals: deployment.approvals.map(a => ({
            required: true,
            approver: a.approver,
            approvedAt: new Date(a.approvedAt!),
            comment: a.comment,
          })),
        },
        {
          name: 'Production Deployment',
          status: deployment.environment === 'production' && deployment.status === 'deployed'
            ? 'passed' as const
            : (deployment.environment === 'production' && deployment.status === 'failed'
              ? 'failed' as const
              : 'pending' as const),
        },
      ];
      
      const currentStage = stages.find(s => s.status === 'pending')?.name;
      const overallStatus = stages.some(s => s.status === 'failed') ? 'failed'
        : stages.some(s => s.status === 'blocked') ? 'blocked'
        : stages.some(s => s.status === 'pending') ? 'pending'
        : 'passed';
      
      pipelines.push({
        id: deployment.id,
        name: `${version.spec.name || 'Workflow'} Pipeline`,
        workflowId: version.spec.id,
        version: version.version,
        stages,
        currentStage,
        overallStatus,
      });
    }
    
    return pipelines;
  }

  /**
   * Determine incident severity from event
   */
  private determineSeverity(event: any): 'low' | 'medium' | 'high' | 'critical' {
    // Check if workflow or task has high risk tier
    if (event.metadata?.riskTier === 'CRITICAL') return 'critical';
    if (event.metadata?.riskTier === 'HIGH') return 'high';
    
    // Check error type
    if (event.type === 'workflow_failed') return 'high';
    if (event.type === 'task_failed') return 'medium';
    
    return 'low';
  }

  /**
   * Trigger a deployment workflow
   */
  async triggerDeploymentWorkflow(config: {
    workflowType: string;
    versionId: string;
    environment: string;
    deployedBy: string;
    metadata?: Record<string, unknown>;
  }): Promise<any> {
    // Create a deployment record
    const deployment = await this.createDeployment(
      config.versionId,
      config.environment as any,
      config.deployedBy,
      config.metadata
    );

    // In a full implementation, this would:
    // 1. Trigger CI/CD pipeline via webhook or API
    // 2. Create workflow execution for deployment
    // 3. Set up monitoring and health checks
    // 4. Return workflow execution details

    return {
      id: `workflow-${deployment.id}`,
      deploymentId: deployment.id,
      type: config.workflowType,
      status: 'pending',
      environment: config.environment,
      triggeredAt: new Date(),
      triggeredBy: config.deployedBy,
      stages: [
        { name: 'build', status: 'pending' },
        { name: 'test', status: 'pending' },
        { name: 'deploy', status: 'pending' },
        { name: 'verify', status: 'pending' },
      ]
    };
  }

  /**
   * Transition deployment to a different stage
   */
  async transitionDeploymentStage(
    deploymentId: string,
    targetStage: string,
    transitionedBy: string,
    metadata?: Record<string, unknown>
  ): Promise<any> {
    const deployment = this.getDeployment(deploymentId);
    
    if (!deployment) {
      throw new Error('Deployment not found');
    }

    // Update deployment status based on stage
    if (targetStage === 'testing') {
      deployment.status = 'pending';
    } else if (targetStage === 'deployed') {
      deployment.status = 'deployed';
      deployment.deployedAt = new Date();
    } else if (targetStage === 'failed') {
      deployment.status = 'failed';
    }

    // Log the stage transition
    this.logEvent({
      type: 'deployment_stage_transition',
      timestamp: new Date(),
      workflowId: deployment.versionId,
      metadata: {
        deploymentId,
        fromStage: deployment.status,
        toStage: targetStage,
        transitionedBy,
        ...metadata,
      }
    });

    return {
      deploymentId,
      stage: targetStage,
      status: deployment.status,
      transitionedAt: new Date(),
      transitionedBy,
    };
  }

  /**
   * Run smoke tests for a deployment
   */
  async runSmokeTests(deploymentId: string, tests: Array<{ name: string; workflowId?: string; endpoint?: string }>): Promise<any[]> {
    const deployment = this.getDeployment(deploymentId);
    
    if (!deployment) {
      throw new Error('Deployment not found');
    }

    // Execute each test
    const results = await Promise.all(
      tests.map(async (test) => {
        const startTime = Date.now();
        let status: 'passed' | 'failed' = 'passed';
        let error: string | undefined;

        try {
          if (test.workflowId) {
            // Execute workflow as smoke test
            // In production, this would actually run the workflow
            await new Promise(resolve => setTimeout(resolve, 100));
          } else if (test.endpoint) {
            // Test API endpoint
            // In production, this would make HTTP request
            await new Promise(resolve => setTimeout(resolve, 50));
          }
        } catch (e) {
          status = 'failed';
          error = e instanceof Error ? e.message : 'Unknown error';
        }

        const duration = Date.now() - startTime;

        return {
          name: test.name,
          status,
          duration,
          error,
          timestamp: new Date(),
        };
      })
    );

    // Log test results
    this.logEvent({
      type: 'smoke_tests_completed',
      timestamp: new Date(),
      workflowId: deployment.versionId,
      metadata: {
        deploymentId,
        results,
        passed: results.filter(r => r.status === 'passed').length,
        failed: results.filter(r => r.status === 'failed').length,
      }
    });

    return results;
  }

  /**
   * Get deployment health metrics
   */
  async getDeploymentHealth(deploymentId: string): Promise<any> {
    const deployment = this.getDeployment(deploymentId);
    
    if (!deployment) {
      throw new Error('Deployment not found');
    }

    // In production, this would query actual health metrics
    // For now, return mock health data
    return {
      status: deployment.status === 'deployed' ? 'healthy' : 'unknown',
      errorRate: 0.001,
      responseTime: 250,
      uptime: deployment.deployedAt ? Date.now() - deployment.deployedAt.getTime() : 0,
      lastChecked: new Date(),
      metrics: {
        requestsPerMinute: 100,
        activeConnections: 50,
        memoryUsage: 0.65,
        cpuUsage: 0.45,
      }
    };
  }

  /**
   * Rollback a deployment
   */
  async rollbackDeployment(
    deploymentId: string,
    targetVersion: string | undefined,
    rolledBackBy: string,
    reason: string
  ): Promise<any> {
    const deployment = this.getDeployment(deploymentId);
    
    if (!deployment) {
      throw new Error('Deployment not found');
    }

    // Find target version for rollback
    const targetVersionObj = targetVersion 
      ? this.workflowVersions.find(v => v.version === targetVersion)
      : this.workflowVersions
          .filter(v => v.spec.id === deployment.versionId)
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[1];

    if (!targetVersionObj) {
      throw new Error('Target version for rollback not found');
    }

    // Create a new deployment for the rollback
    const rollbackDeployment = await this.createDeployment(
      targetVersionObj.id,
      deployment.environment,
      rolledBackBy,
      {
        rollbackFrom: deploymentId,
        reason,
      }
    );

    // Mark original deployment as rolled back
    deployment.status = 'failed';

    // Log rollback event
    this.logEvent({
      type: 'deployment_rolled_back',
      timestamp: new Date(),
      workflowId: deployment.versionId,
      metadata: {
        deploymentId,
        targetVersion: targetVersionObj.version,
        rolledBackBy,
        reason,
        newDeploymentId: rollbackDeployment.id,
      }
    });

    return {
      rolledBackDeploymentId: deploymentId,
      newDeploymentId: rollbackDeployment.id,
      targetVersion: targetVersionObj.version,
      status: 'rollback_initiated',
      rolledBackAt: new Date(),
      rolledBackBy,
      reason,
    };
  }

  /**
   * Get DevOps audit trail with filtering
   * Returns deployment-related events with actor, action, reason, and timestamps
   */
  async getDevOpsAuditTrail(
    tenantId?: string,
    startDate?: Date,
    endDate?: Date,
    actionType?: string
  ): Promise<Event[]> {
    // Define DevOps-specific event types
    const devopsEventTypes = [
      'DEPLOYMENT_VERSION_CREATED',
      'DEPLOYMENT_INITIATED',
      'DEPLOYMENT_APPROVED',
      'DEPLOYMENT_REJECTED',
      'DEPLOYMENT_COMPLETED',
      'DEPLOYMENT_FAILED',
      'DEPLOYMENT_PROMOTED',
      'DEPLOYMENT_GATE_CHECK',
      'DEPLOYMENT_GATE_FAILED',
      'DEPLOYMENT_PROMOTION_BLOCKED',
      'DEPLOYMENT_ROLLBACK_TRIGGERED',
      'DEPLOYMENT_ROLLBACK_COMPLETED',
    ];

    // Get all events (filtered by tenant if provided)
    let events: Event[] = [];
    if (tenantId && this.eventLog.readByTenant) {
      events = await this.eventLog.readByTenant(tenantId);
    } else {
      // If no tenant filtering or tenant-aware read not available,
      // we'll need to aggregate from all workflows
      // For now, get all deployments and their events
      const workflowIds = Array.from(this.workflows.keys());
      for (const workflowId of workflowIds) {
        const workflowEvents = await this.eventLog.read(workflowId, tenantId);
        events.push(...workflowEvents);
      }
    }

    // Filter by DevOps event types
    events = events.filter(e => devopsEventTypes.includes(e.type));

    // Filter by action type if provided
    if (actionType) {
      events = events.filter(e => e.type === actionType);
    }

    // Filter by date range
    if (startDate) {
      events = events.filter(e => e.timestamp >= startDate);
    }
    if (endDate) {
      events = events.filter(e => e.timestamp <= endDate);
    }

    // Sort by timestamp (most recent first)
    events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    return events;
  }

  /**
   * Export DevOps audit trail for compliance
   * Returns comprehensive audit data including actor, action, reason, and timestamps
   */
  async exportDevOpsAudit(
    tenantId?: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<any[]> {
    const auditEvents = await this.getDevOpsAuditTrail(tenantId, startDate, endDate);

    // Transform events into a more readable audit format
    return auditEvents.map(event => ({
      timestamp: event.timestamp.toISOString(),
      eventType: event.type,
      action: this.getActionDescription(event.type),
      actor: event.data?.approver || event.data?.rejectedBy || event.data?.promotedBy || event.data?.deployedBy || event.data?.createdBy || 'system',
      workflowId: event.workflowId,
      deploymentId: event.data?.deploymentId || event.data?.productionDeploymentId || event.data?.stagingDeploymentId,
      environment: event.data?.environment,
      reason: event.data?.reason || event.data?.comment,
      riskTier: event.data?.riskTier,
      details: {
        versionId: event.data?.versionId,
        version: event.data?.version,
        approvalToken: event.data?.approvalToken ? '***' : undefined, // Mask sensitive data
        gateCheckId: event.data?.gateCheckId,
        gateStatus: event.data?.overallStatus,
        failureReasons: event.data?.failureReasons,
        snapshotId: event.data?.snapshotId,
        success: event.data?.success,
      },
      tenantId: event.tenantId,
      metadata: event.metadata,
    }));
  }

  /**
   * Helper method to get human-readable action description
   */
  private getActionDescription(eventType: string): string {
    const descriptions: Record<string, string> = {
      'DEPLOYMENT_VERSION_CREATED': 'Version Created',
      'DEPLOYMENT_INITIATED': 'Deployment Initiated',
      'DEPLOYMENT_APPROVED': 'Deployment Approved',
      'DEPLOYMENT_REJECTED': 'Deployment Rejected',
      'DEPLOYMENT_COMPLETED': 'Deployment Completed',
      'DEPLOYMENT_FAILED': 'Deployment Failed',
      'DEPLOYMENT_PROMOTED': 'Promoted to Production',
      'DEPLOYMENT_GATE_CHECK': 'Gate Check Executed',
      'DEPLOYMENT_GATE_FAILED': 'Gate Check Failed',
      'DEPLOYMENT_PROMOTION_BLOCKED': 'Promotion Blocked',
      'DEPLOYMENT_ROLLBACK_TRIGGERED': 'Rollback Triggered',
      'DEPLOYMENT_ROLLBACK_COMPLETED': 'Rollback Completed',
    };
    return descriptions[eventType] || eventType;
  }
}
