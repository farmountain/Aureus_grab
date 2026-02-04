import {
  WorkflowOrchestrator,
  WorkflowSpec,
  WorkflowState,
  StateStore,
  EventLog,
  Event,
} from '@aureus/kernel';
import { EvaluationHarness, EvaluationReport } from '@aureus/evaluation-harness';
import { TelemetryCollector, TelemetryEvent, TelemetryEventType } from '@aureus/observability';
import { GoalGuardFSM, GuardDecision, Action, Principal } from '@aureus/policy';
import { CRVGate, GateResult } from '@aureus/crv';

/**
 * Test execution mode
 */
export enum TestMode {
  DRY_RUN = 'dry_run',
  VALIDATION = 'validation',
  SIMULATION = 'simulation',
}

/**
 * Test case definition
 * Uses a plain object version of WorkflowSpec for easier JSON serialization
 */
export interface TestCase {
  id: string;
  name: string;
  description: string;
  workflowSpec: {
    id: string;
    name: string;
    tasks: Array<{
      id: string;
      name?: string;
      type?: string;
      riskTier?: string;
      crvGate?: {
        name: string;
        validators: unknown[];
        blockOnFailure: boolean;
      };
      requiredPermissions?: Array<{
        action: string;
        resource: string;
        intent?: string;
        dataZone?: string;
      }>;
      [key: string]: unknown;
    }>;
    dependencies?: Record<string, string[]> | Map<string, string[]>;
    safetyPolicy?: {
      name: string;
      description?: string;
      rules: unknown[];
      failFast?: boolean;
    };
  };
  sampleData: Record<string, unknown>;
  expectedOutcome?: {
    shouldPass: boolean;
    crvValidation?: boolean;
    policyApproval?: boolean;
  };
}

/**
 * Test execution result
 */
export interface TestResult {
  testId: string;
  executionId: string;
  mode: TestMode;
  startedAt: Date;
  completedAt: Date;
  status: 'passed' | 'failed' | 'error';
  workflowStatus?: string;
  crvResults: CRVTestResult[];
  policyResults: PolicyTestResult[];
  evaluationReport?: EvaluationReport;
  error?: string;
  artifacts: TestArtifact[];
}

/**
 * CRV test result
 */
export interface CRVTestResult {
  gateName: string;
  passed: boolean;
  blockedCommit: boolean;
  timestamp: Date;
  validationResults: Array<{
    valid: boolean;
    reason?: string;
    confidence?: number;
  }>;
}

/**
 * Policy test result
 */
export interface PolicyTestResult {
  actionId: string;
  actionName: string;
  riskTier: string;
  decision: GuardDecision;
  timestamp: Date;
  approvalPath?: string[];
}

/**
 * Test artifact
 */
export interface TestArtifact {
  id: string;
  type: 'report_json' | 'report_markdown' | 'events_log' | 'telemetry';
  name: string;
  content: string;
  timestamp: Date;
}

/**
 * Policy simulation request
 */
export interface PolicySimulationRequest {
  action: Action;
  principal: Principal;
  context?: Record<string, unknown>;
}

/**
 * Policy simulation result
 */
export interface PolicySimulationResult {
  decision: GuardDecision;
  approvalPath: string[];
  estimatedApprovalTime?: string;
  alternativeActions?: string[];
}

/**
 * Test runner service for pre-deployment testing
 * Provides dry-run execution, validation, and simulation capabilities
 */
export class TestRunnerService {
  private stateStore: StateStore;
  private eventLog: EventLog;
  private telemetryCollector: TelemetryCollector;
  private policyGuard?: GoalGuardFSM;
  private evaluationHarness?: EvaluationHarness;
  private testResults: Map<string, TestResult> = new Map();

  constructor(
    stateStore: StateStore,
    eventLog: EventLog,
    telemetryCollector: TelemetryCollector,
    policyGuard?: GoalGuardFSM,
    evaluationHarness?: EvaluationHarness
  ) {
    this.stateStore = stateStore;
    this.eventLog = eventLog;
    this.telemetryCollector = telemetryCollector;
    this.policyGuard = policyGuard;
    this.evaluationHarness = evaluationHarness;
  }

  /**
   * Execute a test case in dry-run mode
   */
  async runTest(testCase: TestCase, mode: TestMode = TestMode.DRY_RUN): Promise<TestResult> {
    const executionId = `test_${testCase.id}_${Date.now()}`;
    const startedAt = new Date();

    try {
      // Create a test-specific telemetry collector
      const testCollector = new TelemetryCollector();

      // Initialize workflow state (simplified for testing)
      const workflowState: WorkflowState = {
        workflowId: executionId,
        status: 'running',
        taskStates: new Map(),
        startedAt,
      };

      // Collect CRV and policy results
      const crvResults: CRVTestResult[] = [];
      const policyResults: PolicyTestResult[] = [];

      // Simulate workflow execution by evaluating each task
      for (const task of testCase.workflowSpec.tasks) {
        // Simulate CRV validation if configured
        const taskAny = task as any; // Cast to access potential crvGate property
        if (taskAny.crvGate) {
          const crvResult = await this.validateCRV(taskAny.crvGate, task.id, testCase.sampleData);
          crvResults.push(crvResult);

          // Record telemetry
          testCollector.recordEvent({
            timestamp: new Date(),
            type: TelemetryEventType.CRV_RESULT,
            workflowId: executionId,
            taskId: task.id,
            taskType: task.type || 'action',
            data: {
              passed: crvResult.passed,
              gateName: crvResult.gateName,
            },
          });
        }

        // Simulate policy check if guard is configured
        if (this.policyGuard && task.riskTier) {
          const policyResult = await this.checkPolicy(task, testCase.sampleData);
          policyResults.push(policyResult);

          // Record telemetry
          testCollector.recordEvent({
            timestamp: new Date(),
            type: TelemetryEventType.POLICY_CHECK,
            workflowId: executionId,
            taskId: task.id,
            taskType: task.type || 'action',
            data: {
              allowed: policyResult.decision.allowed,
              requiresHumanApproval: policyResult.decision.requiresHumanApproval,
            },
          });
        }

        // Simulate task execution
        testCollector.recordEvent({
          timestamp: new Date(),
          type: TelemetryEventType.STEP_START,
          workflowId: executionId,
          taskId: task.id,
          taskType: task.type || 'action',
          data: {},
        });

        // Simulate task completion
        const taskSuccess = this.shouldTaskSucceed(crvResults, policyResults, task.id);
        testCollector.recordEvent({
          timestamp: new Date(),
          type: TelemetryEventType.STEP_END,
          workflowId: executionId,
          taskId: task.id,
          taskType: task.type || 'action',
          data: {
            success: taskSuccess,
            duration: 100, // Simulated duration
          },
        });
      }

      const completedAt = new Date();

      // Generate evaluation report if harness is available
      let evaluationReport: EvaluationReport | undefined;
      if (this.evaluationHarness) {
        // Create a temporary harness with test telemetry
        const testHarness = new EvaluationHarness(testCollector);
        evaluationReport = testHarness.generateReport();
      }

      // Determine overall test status
      const allCrvPassed = crvResults.every(r => r.passed);
      const allPolicyApproved = policyResults.every(r => 
        r.decision.allowed || r.decision.requiresHumanApproval
      );
      const status = this.determineTestStatus(
        allCrvPassed,
        allPolicyApproved,
        testCase.expectedOutcome
      );

      // Generate artifacts
      const artifacts = this.generateArtifacts(
        executionId,
        crvResults,
        policyResults,
        evaluationReport,
        testCollector.getEvents()
      );

      const result: TestResult = {
        testId: testCase.id,
        executionId,
        mode,
        startedAt,
        completedAt,
        status,
        workflowStatus: 'completed',
        crvResults,
        policyResults,
        evaluationReport,
        artifacts,
      };

      // Store result
      this.testResults.set(executionId, result);

      return result;
    } catch (error) {
      const completedAt = new Date();
      const result: TestResult = {
        testId: testCase.id,
        executionId,
        mode,
        startedAt,
        completedAt,
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
        crvResults: [],
        policyResults: [],
        artifacts: [],
      };

      this.testResults.set(executionId, result);
      return result;
    }
  }

  /**
   * Simulate policy decision without executing workflow
   */
  async simulatePolicy(request: PolicySimulationRequest): Promise<PolicySimulationResult> {
    if (!this.policyGuard) {
      throw new Error('Policy guard not configured');
    }

    const decision = await this.policyGuard.evaluate(
      request.principal,
      request.action
    );

    // Determine approval path based on risk tier and decision
    const approvalPath = this.determineApprovalPath(request.action, decision);

    // Estimate approval time (simplified)
    const estimatedApprovalTime = decision.requiresHumanApproval
      ? this.estimateApprovalTime(request.action)
      : 'Immediate';

    return {
      decision,
      approvalPath,
      estimatedApprovalTime,
      alternativeActions: [],
    };
  }

  /**
   * Get test result by execution ID
   */
  getTestResult(executionId: string): TestResult | undefined {
    return this.testResults.get(executionId);
  }

  /**
   * Get all test results
   */
  getAllTestResults(): TestResult[] {
    return Array.from(this.testResults.values());
  }

  /**
   * Get test artifact
   */
  getArtifact(executionId: string, artifactId: string): TestArtifact | undefined {
    const result = this.testResults.get(executionId);
    if (!result) return undefined;
    return result.artifacts.find(a => a.id === artifactId);
  }

  /**
   * Validate CRV gate
   */
  private async validateCRV(
    gateConfig: any,
    taskId: string,
    data: Record<string, unknown>
  ): Promise<CRVTestResult> {
    // Create a mock commit
    const commit = {
      id: `${taskId}_commit`,
      data,
    };

    // Create CRV gate
    const gate = new CRVGate(gateConfig);

    // Validate
    const result: GateResult = await gate.validate(commit);

    return {
      gateName: gateConfig.name || 'unnamed',
      passed: result.passed,
      blockedCommit: result.blockedCommit,
      timestamp: result.timestamp,
      validationResults: result.validationResults,
    };
  }

  /**
   * Check policy for a task
   */
  private async checkPolicy(
    task: any,
    data: Record<string, unknown>
  ): Promise<PolicyTestResult> {
    if (!this.policyGuard) {
      throw new Error('Policy guard not configured');
    }

    const action: Action = {
      id: task.id,
      name: task.name || task.id,
      riskTier: task.riskTier,
      requiredPermissions: task.requiredPermissions || [],
    };

    // Create a test principal
    const principal: Principal = {
      id: 'test_agent',
      type: 'agent',
      permissions: [],
    };

    const decision = await this.policyGuard.evaluate(principal, action);

    return {
      actionId: task.id,
      actionName: task.name || task.id,
      riskTier: task.riskTier,
      decision,
      timestamp: new Date(),
      approvalPath: this.determineApprovalPath(action, decision),
    };
  }

  /**
   * Determine if a task should succeed based on validation results
   */
  private shouldTaskSucceed(
    crvResults: CRVTestResult[],
    policyResults: PolicyTestResult[],
    taskId: string
  ): boolean {
    // Check if any CRV blocked this task
    const taskCrvBlocked = crvResults.some(r => !r.passed && r.blockedCommit);
    if (taskCrvBlocked) return false;

    // Check if policy denied this task
    const taskPolicyDenied = policyResults.some(
      r => r.actionId === taskId && !r.decision.allowed && !r.decision.requiresHumanApproval
    );
    if (taskPolicyDenied) return false;

    return true;
  }

  /**
   * Determine overall test status
   */
  private determineTestStatus(
    allCrvPassed: boolean,
    allPolicyApproved: boolean,
    expectedOutcome?: TestCase['expectedOutcome']
  ): 'passed' | 'failed' | 'error' {
    if (!expectedOutcome) {
      // No expected outcome, just check if validations passed
      return allCrvPassed && allPolicyApproved ? 'passed' : 'failed';
    }

    // Check against expected outcome
    const crvMatches = expectedOutcome.crvValidation === undefined || 
                       expectedOutcome.crvValidation === allCrvPassed;
    const policyMatches = expectedOutcome.policyApproval === undefined ||
                          expectedOutcome.policyApproval === allPolicyApproved;

    return crvMatches && policyMatches ? 'passed' : 'failed';
  }

  /**
   * Determine approval path for an action
   */
  private determineApprovalPath(action: Action, decision: GuardDecision): string[] {
    if (!decision.requiresHumanApproval) {
      return ['Automatic approval'];
    }

    // Simplified approval path based on risk tier
    switch (action.riskTier) {
      case 'critical':
        return ['Senior Engineer', 'Tech Lead', 'Director'];
      case 'high':
        return ['Senior Engineer', 'Tech Lead'];
      case 'medium':
        return ['Senior Engineer'];
      default:
        return ['Any Engineer'];
    }
  }

  /**
   * Estimate approval time
   */
  private estimateApprovalTime(action: Action): string {
    switch (action.riskTier) {
      case 'critical':
        return '24-48 hours';
      case 'high':
        return '4-8 hours';
      case 'medium':
        return '1-2 hours';
      default:
        return '< 1 hour';
    }
  }

  /**
   * Generate test artifacts
   */
  private generateArtifacts(
    executionId: string,
    crvResults: CRVTestResult[],
    policyResults: PolicyTestResult[],
    evaluationReport: EvaluationReport | undefined,
    events: TelemetryEvent[]
  ): TestArtifact[] {
    const artifacts: TestArtifact[] = [];
    const timestamp = new Date();

    // Generate JSON report
    if (evaluationReport) {
      artifacts.push({
        id: `${executionId}_report_json`,
        type: 'report_json',
        name: 'evaluation_report.json',
        content: JSON.stringify(evaluationReport, null, 2),
        timestamp,
      });

      // Generate Markdown report
      const harness = new EvaluationHarness(this.telemetryCollector);
      const markdown = harness.exportReportMarkdown(evaluationReport);
      artifacts.push({
        id: `${executionId}_report_md`,
        type: 'report_markdown',
        name: 'evaluation_report.md',
        content: markdown,
        timestamp,
      });
    }

    // Generate events log
    artifacts.push({
      id: `${executionId}_events`,
      type: 'events_log',
      name: 'events.json',
      content: JSON.stringify(events, null, 2),
      timestamp,
    });

    // Generate telemetry summary
    const telemetrySummary = {
      executionId,
      crvResults,
      policyResults,
      eventCount: events.length,
    };
    artifacts.push({
      id: `${executionId}_telemetry`,
      type: 'telemetry',
      name: 'telemetry_summary.json',
      content: JSON.stringify(telemetrySummary, null, 2),
      timestamp,
    });

    return artifacts;
  }
}
