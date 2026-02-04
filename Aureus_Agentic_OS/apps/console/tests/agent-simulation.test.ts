import { describe, it, expect, beforeEach } from 'vitest';
import { AgentBuilder } from '../src/agent-builder';
import { EventLog, InMemoryStateStore, AgentBlueprint } from '@aureus/kernel';
import { GoalGuardFSM } from '@aureus/policy';

/**
 * Integration tests for agent simulation functionality
 * Tests the sandbox execution path and dry-run simulation
 */
describe('Agent Simulation Integration Tests', () => {
  let agentBuilder: AgentBuilder;
  let eventLog: EventLog;
  let policyGuard: GoalGuardFSM;
  let stateStore: InMemoryStateStore;

  beforeEach(() => {
    stateStore = new InMemoryStateStore();
    eventLog = new EventLog(stateStore);
    policyGuard = new GoalGuardFSM();
    agentBuilder = new AgentBuilder(eventLog, policyGuard);
  });

  describe('Basic Simulation', () => {
    it('should simulate agent with low-risk tools successfully', async () => {
      // Create a simple agent blueprint
      const blueprint: AgentBlueprint = {
        id: 'test-agent-1',
        name: 'Test Agent',
        version: '1.0.0',
        description: 'A test agent for simulation',
        goal: 'Test goal',
        riskProfile: 'LOW',
        domain: 'general',
        config: {},
        tools: [
          {
            toolId: 'tool-1',
            name: 'http-client',
            riskTier: 'LOW',
            hasSideEffects: false,
          },
          {
            toolId: 'tool-2',
            name: 'file-reader',
            riskTier: 'LOW',
            hasSideEffects: false,
          },
        ],
        policies: [
          {
            policyId: 'policy-1',
            name: 'Rate Limiting',
            enabled: true,
            rules: [
              {
                type: 'rate_limiting',
                description: 'Limit tool execution rate',
              },
            ],
          },
        ],
        workflows: [
          {
            workflowId: 'workflow-1',
            name: 'Primary Workflow',
            description: 'Main workflow',
            triggerConditions: ['start'],
            priority: 1,
          },
        ],
        constraints: [],
        maxExecutionTime: 30000,
        maxRetries: 3,
        successCriteria: ['Complete all tasks'],
        tags: ['test'],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await agentBuilder.simulateAgent({
        blueprint,
        testScenario: {
          description: 'Basic simulation test',
          inputs: { test: true },
        },
        dryRun: true,
      });

      expect(result.success).toBe(true);
      expect(result.executionTime).toBeGreaterThan(0);
      expect(result.trace).toBeDefined();
      expect(result.trace.length).toBeGreaterThan(0);
      expect(result.toolCalls).toBeDefined();
      expect(result.toolCalls.length).toBe(2);
      expect(result.policyDecisions).toBeDefined();
      expect(result.crvOutcomes).toBeDefined();
      expect(result.blockedSteps).toBeDefined();
      expect(result.sideEffects).toBeDefined();
    });

    it('should capture execution trace with correct steps', async () => {
      const blueprint: AgentBlueprint = {
        id: 'test-agent-2',
        name: 'Trace Test Agent',
        version: '1.0.0',
        description: 'Test execution trace',
        goal: 'Test trace',
        riskProfile: 'LOW',
        domain: 'general',
        config: {},
        tools: [
          {
            toolId: 'tool-1',
            name: 'test-tool',
            riskTier: 'LOW',
            hasSideEffects: false,
          },
        ],
        policies: [],
        workflows: [],
        constraints: [],
        maxExecutionTime: 30000,
        maxRetries: 3,
        successCriteria: [],
        tags: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await agentBuilder.simulateAgent({
        blueprint,
        testScenario: {
          description: 'Trace test',
          inputs: {},
        },
        dryRun: true,
      });

      expect(result.trace.length).toBeGreaterThan(0);
      
      // Verify trace has validation step
      const validationStep = result.trace.find(t => t.action.includes('Validate'));
      expect(validationStep).toBeDefined();
      expect(validationStep?.status).toBe('completed');
      
      // Verify trace has tool execution steps
      const toolSteps = result.trace.filter(t => t.action.includes('Execute tool'));
      expect(toolSteps.length).toBeGreaterThan(0);
      
      // Verify all steps have timestamps and step numbers
      result.trace.forEach((step, index) => {
        expect(step.step).toBe(index + 1);
        expect(step.timestamp).toBeDefined();
        expect(step.action).toBeDefined();
        expect(step.status).toBeDefined();
      });
    });
  });

  describe('Blocked Steps Detection', () => {
    it('should block CRITICAL risk tools in dry-run mode', async () => {
      const blueprint: AgentBlueprint = {
        id: 'test-agent-3',
        name: 'High Risk Agent',
        version: '1.0.0',
        description: 'Test high-risk tool blocking',
        goal: 'Test blocking',
        riskProfile: 'CRITICAL',
        domain: 'general',
        config: {},
        tools: [
          {
            toolId: 'tool-1',
            name: 'low-risk-tool',
            riskTier: 'LOW',
            hasSideEffects: false,
          },
          {
            toolId: 'tool-2',
            name: 'critical-risk-tool',
            riskTier: 'CRITICAL',
            hasSideEffects: true,
          },
        ],
        policies: [],
        workflows: [],
        constraints: [],
        maxExecutionTime: 30000,
        maxRetries: 3,
        successCriteria: [],
        tags: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await agentBuilder.simulateAgent({
        blueprint,
        testScenario: {
          description: 'Test critical tool blocking',
          inputs: {},
        },
        dryRun: true,
      });

      expect(result.success).toBe(true);
      expect(result.blockedSteps.length).toBeGreaterThan(0);
      
      // Verify critical tool was blocked
      const criticalToolBlocked = result.blockedSteps.find(
        bs => bs.tool === 'critical-risk-tool'
      );
      expect(criticalToolBlocked).toBeDefined();
      expect(criticalToolBlocked?.reason).toContain('High-risk tool blocked');
      
      // Verify low-risk tool was not blocked
      const lowRiskToolCall = result.toolCalls.find(
        tc => tc.toolName === 'low-risk-tool'
      );
      expect(lowRiskToolCall).toBeDefined();
      expect(lowRiskToolCall?.status).not.toBe('blocked');
    });

    it('should record blocked steps in trace', async () => {
      const blueprint: AgentBlueprint = {
        id: 'test-agent-4',
        name: 'Blocked Trace Agent',
        version: '1.0.0',
        description: 'Test blocked steps in trace',
        goal: 'Test blocking',
        riskProfile: 'HIGH',
        domain: 'general',
        config: {},
        tools: [
          {
            toolId: 'tool-1',
            name: 'critical-tool',
            riskTier: 'CRITICAL',
            hasSideEffects: true,
          },
        ],
        policies: [],
        workflows: [],
        constraints: [],
        maxExecutionTime: 30000,
        maxRetries: 3,
        successCriteria: [],
        tags: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await agentBuilder.simulateAgent({
        blueprint,
        testScenario: {
          description: 'Test blocked trace',
          inputs: {},
        },
        dryRun: true,
      });

      // Find blocked step in trace
      const blockedTraceStep = result.trace.find(
        t => t.status === 'blocked' && t.tool === 'critical-tool'
      );
      expect(blockedTraceStep).toBeDefined();
      expect(blockedTraceStep?.blockReason).toBeDefined();
      expect(blockedTraceStep?.blockReason).toContain('High-risk tool blocked');
    });
  });

  describe('Policy Decisions Capture', () => {
    it('should capture all policy decisions during simulation', async () => {
      const blueprint: AgentBlueprint = {
        id: 'test-agent-5',
        name: 'Policy Test Agent',
        version: '1.0.0',
        description: 'Test policy capture',
        goal: 'Test policies',
        riskProfile: 'MEDIUM',
        domain: 'general',
        config: {},
        tools: [
          {
            toolId: 'tool-1',
            name: 'test-tool',
            riskTier: 'MEDIUM',
            hasSideEffects: false,
          },
        ],
        policies: [
          {
            policyId: 'policy-1',
            name: 'Test Policy',
            enabled: true,
            rules: [
              {
                type: 'test_rule',
                description: 'Test rule',
              },
            ],
          },
        ],
        workflows: [],
        constraints: [],
        maxExecutionTime: 30000,
        maxRetries: 3,
        successCriteria: [],
        tags: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await agentBuilder.simulateAgent({
        blueprint,
        testScenario: {
          description: 'Test policy capture',
          inputs: {},
        },
        dryRun: true,
      });

      expect(result.policyDecisions).toBeDefined();
      expect(result.policyDecisions.length).toBeGreaterThan(0);
      
      // Verify policy decisions have required fields
      result.policyDecisions.forEach(decision => {
        expect(decision.policyName).toBeDefined();
        expect(decision.timestamp).toBeDefined();
        expect(decision.decision).toMatch(/allow|deny|requires_approval/);
      });
      
      // Should have blueprint creation policy decision
      const blueprintPolicyDecision = result.policyDecisions.find(
        pd => pd.policyName.includes('Blueprint Creation')
      );
      expect(blueprintPolicyDecision).toBeDefined();
    });
  });

  describe('CRV Validation Outcomes', () => {
    it('should capture CRV validation outcomes', async () => {
      const blueprint: AgentBlueprint = {
        id: 'test-agent-6',
        name: 'CRV Test Agent',
        version: '1.0.0',
        description: 'Test CRV capture',
        goal: 'Test CRV',
        riskProfile: 'LOW',
        domain: 'general',
        config: {},
        tools: [
          {
            toolId: 'tool-1',
            name: 'test-tool',
            riskTier: 'LOW',
            hasSideEffects: false,
          },
        ],
        policies: [],
        workflows: [],
        constraints: [],
        maxExecutionTime: 30000,
        maxRetries: 3,
        successCriteria: [],
        tags: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await agentBuilder.simulateAgent({
        blueprint,
        testScenario: {
          description: 'Test CRV capture',
          inputs: {},
        },
        dryRun: true,
      });

      expect(result.crvOutcomes).toBeDefined();
      expect(result.crvOutcomes.length).toBeGreaterThan(0);
      
      // Verify CRV outcomes have required fields
      result.crvOutcomes.forEach(outcome => {
        expect(outcome.checkName).toBeDefined();
        expect(outcome.timestamp).toBeDefined();
        expect(outcome.passed).toBeDefined();
      });
      
      // Should have blueprint validation outcome
      const blueprintValidation = result.crvOutcomes.find(
        co => co.checkName.includes('Blueprint Validation')
      );
      expect(blueprintValidation).toBeDefined();
      
      // Should have tool output validation outcomes
      const toolValidations = result.crvOutcomes.filter(
        co => co.checkName.includes('Tool Output Validation')
      );
      expect(toolValidations.length).toBeGreaterThan(0);
    });
  });

  describe('Side Effects Capture', () => {
    it('should capture side effects from tools', async () => {
      const blueprint: AgentBlueprint = {
        id: 'test-agent-7',
        name: 'Side Effects Agent',
        version: '1.0.0',
        description: 'Test side effects capture',
        goal: 'Test side effects',
        riskProfile: 'MEDIUM',
        domain: 'general',
        config: {},
        tools: [
          {
            toolId: 'tool-1',
            name: 'tool-with-side-effects',
            riskTier: 'MEDIUM',
            hasSideEffects: true,
          },
          {
            toolId: 'tool-2',
            name: 'tool-without-side-effects',
            riskTier: 'LOW',
            hasSideEffects: false,
          },
        ],
        policies: [],
        workflows: [],
        constraints: [],
        maxExecutionTime: 30000,
        maxRetries: 3,
        successCriteria: [],
        tags: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await agentBuilder.simulateAgent({
        blueprint,
        testScenario: {
          description: 'Test side effects',
          inputs: {},
        },
        dryRun: true,
      });

      expect(result.sideEffects).toBeDefined();
      
      // Should capture side effect from tool with side effects
      const capturedEffect = result.sideEffects.find(
        se => se.type === 'tool-with-side-effects'
      );
      expect(capturedEffect).toBeDefined();
      expect(capturedEffect?.captured).toBe(true);
      
      // Should not capture from tool without side effects
      const notCaptured = result.sideEffects.find(
        se => se.type === 'tool-without-side-effects'
      );
      expect(notCaptured).toBeUndefined();
    });
  });

  describe('Tool Call Status', () => {
    it('should mark tool calls as simulated in dry-run mode', async () => {
      const blueprint: AgentBlueprint = {
        id: 'test-agent-8',
        name: 'Tool Status Agent',
        version: '1.0.0',
        description: 'Test tool call status',
        goal: 'Test status',
        riskProfile: 'LOW',
        domain: 'general',
        config: {},
        tools: [
          {
            toolId: 'tool-1',
            name: 'test-tool',
            riskTier: 'LOW',
            hasSideEffects: false,
          },
        ],
        policies: [],
        workflows: [],
        constraints: [],
        maxExecutionTime: 30000,
        maxRetries: 3,
        successCriteria: [],
        tags: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await agentBuilder.simulateAgent({
        blueprint,
        testScenario: {
          description: 'Test tool status',
          inputs: {},
        },
        dryRun: true,
      });

      expect(result.toolCalls.length).toBeGreaterThan(0);
      
      // All non-blocked tools should be marked as simulated
      const simulatedCalls = result.toolCalls.filter(tc => tc.status === 'simulated');
      expect(simulatedCalls.length).toBeGreaterThan(0);
      
      // Verify tool calls have inputs and outputs
      result.toolCalls.forEach(call => {
        expect(call.toolName).toBeDefined();
        expect(call.timestamp).toBeDefined();
        expect(call.status).toMatch(/executed|blocked|simulated/);
        expect(call.inputs).toBeDefined();
        if (call.status !== 'blocked') {
          expect(call.outputs).toBeDefined();
        }
      });
    });
  });

  describe('Comprehensive Simulation', () => {
    it('should perform complete simulation with all features', async () => {
      const blueprint: AgentBlueprint = {
        id: 'test-agent-9',
        name: 'Comprehensive Agent',
        version: '1.0.0',
        description: 'Test complete simulation',
        goal: 'Complete test',
        riskProfile: 'MEDIUM',
        domain: 'general',
        config: {},
        tools: [
          {
            toolId: 'tool-1',
            name: 'low-risk-tool',
            riskTier: 'LOW',
            hasSideEffects: false,
          },
          {
            toolId: 'tool-2',
            name: 'medium-risk-tool',
            riskTier: 'MEDIUM',
            hasSideEffects: true,
          },
          {
            toolId: 'tool-3',
            name: 'critical-risk-tool',
            riskTier: 'CRITICAL',
            hasSideEffects: true,
          },
        ],
        policies: [
          {
            policyId: 'policy-1',
            name: 'Safety Policy',
            enabled: true,
            rules: [
              {
                type: 'safety_check',
                description: 'Safety check',
              },
            ],
          },
        ],
        workflows: [
          {
            workflowId: 'workflow-1',
            name: 'Main Workflow',
            description: 'Main workflow',
            triggerConditions: ['start'],
            priority: 1,
          },
        ],
        constraints: ['Constraint 1'],
        maxExecutionTime: 30000,
        maxRetries: 3,
        successCriteria: ['Success criterion'],
        tags: ['comprehensive'],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await agentBuilder.simulateAgent({
        blueprint,
        testScenario: {
          description: 'Comprehensive simulation',
          inputs: { comprehensive: true },
          expectedOutputs: { success: true },
        },
        dryRun: true,
      });

      // Verify all aspects are present
      expect(result.success).toBe(true);
      expect(result.executionTime).toBeGreaterThan(0);
      expect(result.trace.length).toBeGreaterThan(0);
      expect(result.toolCalls.length).toBe(3);
      expect(result.policyDecisions.length).toBeGreaterThan(0);
      expect(result.crvOutcomes.length).toBeGreaterThan(0);
      expect(result.blockedSteps.length).toBeGreaterThan(0); // Critical tool should be blocked
      expect(result.sideEffects.length).toBeGreaterThan(0); // Medium tool has side effects
      
      // Verify critical tool was blocked
      const criticalBlocked = result.blockedSteps.find(bs => bs.tool === 'critical-risk-tool');
      expect(criticalBlocked).toBeDefined();
      
      // Verify other tools executed/simulated
      const lowRiskCall = result.toolCalls.find(tc => tc.toolName === 'low-risk-tool');
      expect(lowRiskCall?.status).not.toBe('blocked');
      
      const mediumRiskCall = result.toolCalls.find(tc => tc.toolName === 'medium-risk-tool');
      expect(mediumRiskCall?.status).not.toBe('blocked');
    });
  });
});
