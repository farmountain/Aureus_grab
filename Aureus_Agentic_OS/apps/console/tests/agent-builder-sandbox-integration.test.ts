import { describe, it, expect, beforeEach } from 'vitest';
import { AgentBuilder } from '../src/agent-builder';
import { 
  EventLog, 
  InMemoryStateStore, 
  AgentBlueprint, 
  SandboxIntegration 
} from '@aureus/kernel';
import { GoalGuardFSM } from '@aureus/policy';
import { CRVGate, GateConfig } from '@aureus/crv';
import { TelemetryCollector } from '@aureus/observability';
import { MemoryAPI } from '@aureus/memory-hipcortex';

/**
 * Integration tests for agent builder with real sandbox execution
 * Tests the SandboxIntegration execution paths with policy checks and CRV validation
 */
describe('Agent Builder Sandbox Integration Tests', () => {
  let agentBuilder: AgentBuilder;
  let eventLog: EventLog;
  let policyGuard: GoalGuardFSM;
  let stateStore: InMemoryStateStore;
  let sandboxIntegration: SandboxIntegration;
  let crvGate: CRVGate;
  let telemetry: TelemetryCollector;
  let memoryAPI: MemoryAPI;

  beforeEach(() => {
    stateStore = new InMemoryStateStore();
    eventLog = new EventLog(stateStore);
    policyGuard = new GoalGuardFSM();
    telemetry = new TelemetryCollector();
    
    // Create mock MemoryAPI
    memoryAPI = {
      write: (content: any, provenance: any, options: any) => {
        return { 
          id: `mem-${Date.now()}`,
          content,
          provenance,
          timestamp: new Date(),
        };
      },
      read: (query: any) => [],
      query: (query: any) => [],
      delete: (id: string) => true,
    } as any;

    // Create CRV gate with simple validators
    const gateConfig: GateConfig = {
      name: 'test-gate',
      validators: [
        async (commit) => ({
          valid: true,
          confidence: 0.95,
          reason: 'Test validation passed',
        }),
      ],
      blockOnFailure: false,
    };
    crvGate = new CRVGate(gateConfig);

    // Create sandbox integration
    sandboxIntegration = new SandboxIntegration(telemetry);

    // Create agent builder with all integrations
    agentBuilder = new AgentBuilder(
      eventLog,
      policyGuard,
      undefined, // No LLM provider needed for tests
      sandboxIntegration,
      crvGate,
      telemetry,
      memoryAPI
    );
  });

  describe('Real Sandbox Execution Path', () => {
    it('should execute tools in real sandbox when not in dry-run mode', async () => {
      const blueprint: AgentBlueprint = {
        id: 'sandbox-test-1',
        name: 'Sandbox Test Agent',
        version: '1.0.0',
        description: 'Test real sandbox execution',
        goal: 'Test sandbox',
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
          description: 'Real sandbox execution test',
          inputs: { test: true },
        },
        dryRun: false, // Use real sandbox
      });

      expect(result.success).toBe(true);
      expect(result.toolCalls.length).toBeGreaterThan(0);
      
      // Tool should be executed, not simulated
      const toolCall = result.toolCalls[0];
      expect(toolCall.status).toBe('executed');
      expect(toolCall.outputs).toBeDefined();
    });

    it('should capture side effects through sandbox isolation in dry-run mode', async () => {
      const blueprint: AgentBlueprint = {
        id: 'sandbox-test-2',
        name: 'Side Effects Capture Agent',
        version: '1.0.0',
        description: 'Test side effects capture',
        goal: 'Test side effects',
        riskProfile: 'MEDIUM',
        domain: 'general',
        config: {},
        tools: [
          {
            toolId: 'tool-1',
            name: 'tool-with-effects',
            riskTier: 'MEDIUM',
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
          description: 'Test side effects capture',
          inputs: {},
        },
        dryRun: true, // Dry-run mode should capture side effects
      });

      expect(result.success).toBe(true);
      expect(result.sideEffects).toBeDefined();
      
      // Side effects should be captured
      const capturedEffect = result.sideEffects.find(
        se => se.captured === true
      );
      expect(capturedEffect).toBeDefined();
    });

    it('should run actual policy checks on tool execution', async () => {
      const blueprint: AgentBlueprint = {
        id: 'sandbox-test-3',
        name: 'Policy Check Agent',
        version: '1.0.0',
        description: 'Test policy checks',
        goal: 'Test policies',
        riskProfile: 'HIGH',
        domain: 'general',
        config: {},
        tools: [
          {
            toolId: 'tool-1',
            name: 'high-risk-tool',
            riskTier: 'HIGH',
            hasSideEffects: true,
          },
        ],
        policies: [
          {
            policyId: 'policy-1',
            name: 'High Risk Policy',
            enabled: true,
            rules: [
              {
                type: 'risk_check',
                description: 'Check high-risk operations',
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
          description: 'Test policy checks',
          inputs: {},
        },
        dryRun: false, // Real execution with policy checks
      });

      expect(result.success).toBe(true);
      expect(result.policyDecisions).toBeDefined();
      expect(result.policyDecisions.length).toBeGreaterThan(0);
      
      // Should have policy decision for blueprint creation
      const blueprintPolicyDecision = result.policyDecisions.find(
        pd => pd.policyName.includes('Blueprint Creation')
      );
      expect(blueprintPolicyDecision).toBeDefined();
      expect(blueprintPolicyDecision?.decision).toMatch(/allow|deny|requires_approval/);
    });

    it('should run CRV validation on real tool outputs', async () => {
      const blueprint: AgentBlueprint = {
        id: 'sandbox-test-4',
        name: 'CRV Validation Agent',
        version: '1.0.0',
        description: 'Test CRV validation',
        goal: 'Test CRV',
        riskProfile: 'MEDIUM',
        domain: 'general',
        config: {},
        tools: [
          {
            toolId: 'tool-1',
            name: 'validated-tool',
            riskTier: 'MEDIUM',
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
          description: 'Test CRV validation',
          inputs: {},
        },
        dryRun: false, // Real execution with CRV validation
      });

      expect(result.success).toBe(true);
      expect(result.crvOutcomes).toBeDefined();
      expect(result.crvOutcomes.length).toBeGreaterThan(0);
      
      // Should have CRV validation for tool output
      const toolValidation = result.crvOutcomes.find(
        co => co.checkName.includes('Tool Output Validation')
      );
      expect(toolValidation).toBeDefined();
      expect(toolValidation?.passed).toBeDefined();
      expect(toolValidation?.confidence).toBeDefined();
    });
  });

  describe('Sandbox Isolation and Safety', () => {
    it('should isolate tool execution in sandbox environment', async () => {
      const blueprint: AgentBlueprint = {
        id: 'sandbox-test-5',
        name: 'Isolation Test Agent',
        version: '1.0.0',
        description: 'Test sandbox isolation',
        goal: 'Test isolation',
        riskProfile: 'CRITICAL',
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
          description: 'Test sandbox isolation',
          inputs: {},
        },
        dryRun: false, // Real sandbox execution
      });

      expect(result.success).toBe(true);
      
      // Critical tools should execute in isolated sandbox
      const toolCall = result.toolCalls.find(tc => tc.toolName === 'critical-tool');
      expect(toolCall).toBeDefined();
      
      // Tool should either execute successfully or be blocked by policy/CRV
      expect(toolCall?.status).toMatch(/executed|blocked/);
    });

    it('should preserve dry-run mode while capturing side effects', async () => {
      const blueprint: AgentBlueprint = {
        id: 'sandbox-test-6',
        name: 'Dry-Run Preservation Agent',
        version: '1.0.0',
        description: 'Test dry-run mode preservation',
        goal: 'Test dry-run',
        riskProfile: 'HIGH',
        domain: 'general',
        config: {},
        tools: [
          {
            toolId: 'tool-1',
            name: 'low-risk-tool',
            riskTier: 'LOW',
            hasSideEffects: true,
          },
          {
            toolId: 'tool-2',
            name: 'high-risk-tool',
            riskTier: 'HIGH',
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
          description: 'Test dry-run preservation',
          inputs: {},
        },
        dryRun: true, // Dry-run mode
      });

      expect(result.success).toBe(true);
      
      // High-risk tools should be blocked in dry-run
      const highRiskCall = result.toolCalls.find(tc => tc.toolName === 'high-risk-tool');
      expect(highRiskCall?.status).toBe('blocked');
      
      // Low-risk tools should be simulated in dry-run
      const lowRiskCall = result.toolCalls.find(tc => tc.toolName === 'low-risk-tool');
      expect(lowRiskCall?.status).toBe('simulated');
      
      // Side effects should still be captured
      expect(result.sideEffects.length).toBeGreaterThan(0);
    });
  });

  describe('CRV Validation Blocking', () => {
    it('should block tool execution when CRV validation fails', async () => {
      // Create a failing CRV gate
      const failingGateConfig: GateConfig = {
        name: 'failing-gate',
        validators: [
          async (commit) => ({
            valid: false,
            confidence: 0.95,
            reason: 'Validation failed for testing',
          }),
        ],
        blockOnFailure: true, // Block on failure
      };
      const failingCrvGate = new CRVGate(failingGateConfig);

      // Create agent builder with failing CRV gate
      const agentBuilderWithFailingCRV = new AgentBuilder(
        eventLog,
        policyGuard,
        undefined,
        sandboxIntegration,
        failingCrvGate,
        telemetry,
        memoryAPI
      );

      const blueprint: AgentBlueprint = {
        id: 'sandbox-test-7',
        name: 'CRV Block Agent',
        version: '1.0.0',
        description: 'Test CRV blocking',
        goal: 'Test CRV blocking',
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

      const result = await agentBuilderWithFailingCRV.simulateAgent({
        blueprint,
        testScenario: {
          description: 'Test CRV blocking',
          inputs: {},
        },
        dryRun: false, // Real execution with CRV
      });

      expect(result.success).toBe(true);
      
      // Tool should be blocked by CRV validation
      const blockedTool = result.blockedSteps.find(bs => bs.reason.includes('CRV'));
      expect(blockedTool).toBeDefined();
      
      // CRV outcome should show failure
      const crvOutcome = result.crvOutcomes.find(co => !co.passed);
      expect(crvOutcome).toBeDefined();
      expect(crvOutcome?.reason).toContain('failed');
    });
  });

  describe('Legacy Fallback Behavior', () => {
    it('should fallback to legacy simulation when sandbox integration is not available', async () => {
      // Create agent builder without sandbox integration
      const agentBuilderWithoutSandbox = new AgentBuilder(
        eventLog,
        policyGuard,
        undefined,
        undefined, // No sandbox integration
        crvGate,
        telemetry,
        memoryAPI
      );

      const blueprint: AgentBlueprint = {
        id: 'sandbox-test-8',
        name: 'Legacy Fallback Agent',
        version: '1.0.0',
        description: 'Test legacy fallback',
        goal: 'Test fallback',
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

      const result = await agentBuilderWithoutSandbox.simulateAgent({
        blueprint,
        testScenario: {
          description: 'Test legacy fallback',
          inputs: {},
        },
        dryRun: true, // Dry-run mode
      });

      expect(result.success).toBe(true);
      expect(result.toolCalls.length).toBeGreaterThan(0);
      
      // Tool should be simulated (legacy behavior)
      const toolCall = result.toolCalls[0];
      expect(toolCall.status).toBe('simulated');
    });
  });

  describe('Integration with Event Log', () => {
    it('should log sandbox execution results to event log', async () => {
      const blueprint: AgentBlueprint = {
        id: 'sandbox-test-9',
        name: 'Event Log Test Agent',
        version: '1.0.0',
        description: 'Test event logging',
        goal: 'Test event log',
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
          description: 'Test event logging',
          inputs: {},
        },
        dryRun: false,
      });

      expect(result.success).toBe(true);
      
      // Verify events were logged
      const events = await eventLog.queryEvents({
        workflowId: `simulation-${blueprint.id}`,
      });
      
      expect(events.length).toBeGreaterThan(0);
      
      // Should have simulation started event
      const startEvent = events.find(e => e.data?.event === 'simulation_started');
      expect(startEvent).toBeDefined();
      
      // Should have simulation completed event
      const completeEvent = events.find(e => e.data?.event === 'simulation_completed');
      expect(completeEvent).toBeDefined();
    });
  });
});
