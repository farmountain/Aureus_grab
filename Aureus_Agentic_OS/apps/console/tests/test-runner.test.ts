import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestRunnerService, TestCase, TestMode } from '../src/test-runner';
import type { StateStore, EventLog, Event, WorkflowState, TaskState } from '@aureus/kernel';
import { TelemetryCollector } from '@aureus/observability';
import { GoalGuardFSM, Action, Principal, GuardDecision } from '@aureus/policy';
import { EvaluationHarness } from '@aureus/evaluation-harness';

// Mock implementations
class MockStateStore implements StateStore {
  private states = new Map<string, WorkflowState>();
  
  async saveWorkflowState(state: WorkflowState): Promise<void> {
    this.states.set(state.workflowId, state);
  }
  
  async loadWorkflowState(workflowId: string): Promise<WorkflowState | null> {
    return this.states.get(workflowId) || null;
  }
  
  async saveTaskState(workflowId: string, taskState: TaskState): Promise<void> {}
  
  async loadTaskState(workflowId: string, taskId: string): Promise<TaskState | null> {
    return null;
  }
}

class MockEventLog implements EventLog {
  private events: Event[] = [];
  
  async append(event: Event): Promise<void> {
    this.events.push(event);
  }
  
  async read(workflowId: string): Promise<Event[]> {
    return this.events.filter(e => e.workflowId === workflowId);
  }
}

describe('TestRunnerService', () => {
  let testRunner: TestRunnerService;
  let stateStore: MockStateStore;
  let eventLog: MockEventLog;
  let telemetryCollector: TelemetryCollector;
  let policyGuard: GoalGuardFSM;
  let evaluationHarness: EvaluationHarness;

  beforeEach(() => {
    stateStore = new MockStateStore();
    eventLog = new MockEventLog();
    telemetryCollector = new TelemetryCollector();
    policyGuard = new GoalGuardFSM();
    evaluationHarness = new EvaluationHarness(telemetryCollector);
    
    testRunner = new TestRunnerService(
      stateStore,
      eventLog,
      telemetryCollector,
      policyGuard,
      evaluationHarness
    );
  });

  describe('runTest', () => {
    it('should execute a test case in dry-run mode', async () => {
      const testCase: TestCase = {
        id: 'test_1',
        name: 'Simple Test',
        description: 'A simple test case',
        workflowSpec: {
          id: 'test_workflow',
          name: 'Test Workflow',
          tasks: [
            {
              id: 'task_1',
              name: 'Task 1',
              type: 'action',
              riskTier: 'low'
            }
          ]
        },
        sampleData: {
          testData: 'value'
        }
      };

      const result = await testRunner.runTest(testCase, TestMode.DRY_RUN);

      expect(result).toBeDefined();
      expect(result.testId).toBe('test_1');
      expect(result.mode).toBe(TestMode.DRY_RUN);
      expect(result.status).toBe('passed');
      expect(result.artifacts).toBeDefined();
      expect(result.artifacts.length).toBeGreaterThan(0);
    });

    it('should collect CRV validation results', async () => {
      const testCase: TestCase = {
        id: 'test_crv',
        name: 'CRV Test',
        description: 'Test with CRV validation',
        workflowSpec: {
          id: 'test_workflow',
          name: 'Test Workflow',
          tasks: [
            {
              id: 'task_1',
              name: 'Task 1',
              type: 'validation',
              crvGate: {
                name: 'test_gate',
                validators: [],
                blockOnFailure: true
              }
            }
          ]
        },
        sampleData: {
          testData: 'value'
        }
      };

      const result = await testRunner.runTest(testCase);

      expect(result.crvResults).toBeDefined();
      expect(result.crvResults.length).toBeGreaterThan(0);
      expect(result.crvResults[0].gateName).toBe('test_gate');
    });

    it('should collect policy decision results', async () => {
      const testCase: TestCase = {
        id: 'test_policy',
        name: 'Policy Test',
        description: 'Test with policy checks',
        workflowSpec: {
          id: 'test_workflow',
          name: 'Test Workflow',
          tasks: [
            {
              id: 'task_1',
              name: 'Task 1',
              type: 'action',
              riskTier: 'high'
            }
          ]
        },
        sampleData: {
          testData: 'value'
        }
      };

      const result = await testRunner.runTest(testCase);

      expect(result.policyResults).toBeDefined();
      expect(result.policyResults.length).toBeGreaterThan(0);
      expect(result.policyResults[0].riskTier).toBe('high');
    });

    it('should generate evaluation report', async () => {
      const testCase: TestCase = {
        id: 'test_report',
        name: 'Report Test',
        description: 'Test with evaluation report',
        workflowSpec: {
          id: 'test_workflow',
          name: 'Test Workflow',
          tasks: [
            {
              id: 'task_1',
              name: 'Task 1',
              type: 'action'
            }
          ]
        },
        sampleData: {
          testData: 'value'
        }
      };

      const result = await testRunner.runTest(testCase);

      expect(result.evaluationReport).toBeDefined();
      expect(result.evaluationReport?.evaluation).toBeDefined();
    });

    it('should generate artifacts', async () => {
      const testCase: TestCase = {
        id: 'test_artifacts',
        name: 'Artifacts Test',
        description: 'Test artifact generation',
        workflowSpec: {
          id: 'test_workflow',
          name: 'Test Workflow',
          tasks: [
            {
              id: 'task_1',
              name: 'Task 1',
              type: 'action'
            }
          ]
        },
        sampleData: {
          testData: 'value'
        }
      };

      const result = await testRunner.runTest(testCase);

      expect(result.artifacts).toBeDefined();
      expect(result.artifacts.length).toBeGreaterThan(0);
      
      // Should have JSON report
      const jsonReport = result.artifacts.find(a => a.type === 'report_json');
      expect(jsonReport).toBeDefined();
      
      // Should have markdown report
      const mdReport = result.artifacts.find(a => a.type === 'report_markdown');
      expect(mdReport).toBeDefined();
      
      // Should have events log
      const eventsLog = result.artifacts.find(a => a.type === 'events_log');
      expect(eventsLog).toBeDefined();
    });

    it('should handle errors gracefully', async () => {
      const testCase: TestCase = {
        id: 'test_error',
        name: 'Error Test',
        description: 'Test error handling',
        workflowSpec: {
          id: 'test_workflow',
          name: 'Test Workflow',
          tasks: []
        },
        sampleData: {}
      };

      const result = await testRunner.runTest(testCase);

      expect(result).toBeDefined();
      expect(result.status).toBe('passed'); // Empty workflow should pass
    });
  });

  describe('simulatePolicy', () => {
    it('should simulate policy decisions', async () => {
      const action: Action = {
        id: 'test_action',
        name: 'Test Action',
        riskTier: 'high',
        requiredPermissions: []
      };

      const principal: Principal = {
        id: 'test_principal',
        type: 'agent',
        permissions: []
      };

      const result = await testRunner.simulatePolicy({
        action,
        principal
      });

      expect(result).toBeDefined();
      expect(result.decision).toBeDefined();
      expect(result.approvalPath).toBeDefined();
      expect(result.approvalPath.length).toBeGreaterThan(0);
    });

    it('should determine approval path based on risk tier', async () => {
      const criticalAction: Action = {
        id: 'critical_action',
        name: 'Critical Action',
        riskTier: 'critical',
        requiredPermissions: []
      };

      const principal: Principal = {
        id: 'test_principal',
        type: 'agent',
        permissions: []
      };

      const result = await testRunner.simulatePolicy({
        action: criticalAction,
        principal
      });

      expect(result.approvalPath).toContain('Senior Engineer');
      expect(result.approvalPath).toContain('Tech Lead');
      expect(result.approvalPath).toContain('Director');
    });

    it('should estimate approval time', async () => {
      const action: Action = {
        id: 'test_action',
        name: 'Test Action',
        riskTier: 'high',
        requiredPermissions: []
      };

      const principal: Principal = {
        id: 'test_principal',
        type: 'agent',
        permissions: []
      };

      const result = await testRunner.simulatePolicy({
        action,
        principal
      });

      expect(result.estimatedApprovalTime).toBeDefined();
      expect(typeof result.estimatedApprovalTime).toBe('string');
    });
  });

  describe('getTestResult', () => {
    it('should retrieve test results by execution ID', async () => {
      const testCase: TestCase = {
        id: 'test_retrieve',
        name: 'Retrieve Test',
        description: 'Test result retrieval',
        workflowSpec: {
          id: 'test_workflow',
          name: 'Test Workflow',
          tasks: [
            {
              id: 'task_1',
              name: 'Task 1',
              type: 'action'
            }
          ]
        },
        sampleData: {}
      };

      const runResult = await testRunner.runTest(testCase);
      const retrievedResult = testRunner.getTestResult(runResult.executionId);

      expect(retrievedResult).toBeDefined();
      expect(retrievedResult?.executionId).toBe(runResult.executionId);
    });

    it('should return undefined for non-existent execution ID', () => {
      const result = testRunner.getTestResult('non_existent_id');
      expect(result).toBeUndefined();
    });
  });

  describe('getAllTestResults', () => {
    it('should retrieve all test results', async () => {
      const testCase1: TestCase = {
        id: 'test_1',
        name: 'Test 1',
        description: 'First test',
        workflowSpec: {
          id: 'test_workflow',
          name: 'Test Workflow',
          tasks: []
        },
        sampleData: {}
      };

      const testCase2: TestCase = {
        id: 'test_2',
        name: 'Test 2',
        description: 'Second test',
        workflowSpec: {
          id: 'test_workflow',
          name: 'Test Workflow',
          tasks: []
        },
        sampleData: {}
      };

      await testRunner.runTest(testCase1);
      await testRunner.runTest(testCase2);

      const allResults = testRunner.getAllTestResults();

      expect(allResults).toBeDefined();
      expect(allResults.length).toBe(2);
    });
  });

  describe('getArtifact', () => {
    it('should retrieve specific artifacts', async () => {
      const testCase: TestCase = {
        id: 'test_artifact',
        name: 'Artifact Test',
        description: 'Test artifact retrieval',
        workflowSpec: {
          id: 'test_workflow',
          name: 'Test Workflow',
          tasks: []
        },
        sampleData: {}
      };

      const result = await testRunner.runTest(testCase);
      const artifact = result.artifacts[0];
      const retrievedArtifact = testRunner.getArtifact(
        result.executionId,
        artifact.id
      );

      expect(retrievedArtifact).toBeDefined();
      expect(retrievedArtifact?.id).toBe(artifact.id);
    });

    it('should return undefined for non-existent artifact', async () => {
      const testCase: TestCase = {
        id: 'test_artifact',
        name: 'Artifact Test',
        description: 'Test artifact retrieval',
        workflowSpec: {
          id: 'test_workflow',
          name: 'Test Workflow',
          tasks: []
        },
        sampleData: {}
      };

      const result = await testRunner.runTest(testCase);
      const artifact = testRunner.getArtifact(
        result.executionId,
        'non_existent_artifact'
      );

      expect(artifact).toBeUndefined();
    });
  });
});
