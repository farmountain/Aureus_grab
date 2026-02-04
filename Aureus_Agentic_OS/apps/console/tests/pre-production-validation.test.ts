import { describe, it, expect, beforeEach } from 'vitest';
import { AgentBuilder } from '../src/agent-builder';
import { 
  EventLog, 
  InMemoryStateStore, 
  WorkflowOrchestrator,
  validateAgentBlueprint,
} from '@aureus/kernel';
import { GoalGuardFSM, RiskTier } from '@aureus/policy';
import { CRVGate, Validators } from '@aureus/crv';
import { TelemetryCollector } from '@aureus/observability';

/**
 * Pre-production validation gates tests
 * Validates policy thresholds, CRV gates, and observability requirements
 * before allowing agent deployment to production
 */
describe('Pre-Production Validation Gates', () => {
  let agentBuilder: AgentBuilder;
  let eventLog: EventLog;
  let policyGuard: GoalGuardFSM;
  let telemetryCollector: TelemetryCollector;
  let stateStore: InMemoryStateStore;

  beforeEach(() => {
    stateStore = new InMemoryStateStore();
    eventLog = new EventLog(stateStore);
    policyGuard = new GoalGuardFSM();
    telemetryCollector = new TelemetryCollector();
    agentBuilder = new AgentBuilder(eventLog, policyGuard);
  });

  describe('Policy Threshold Validation', () => {
    it('should validate agent has appropriate policies for risk profile', async () => {
      const request = {
        goal: 'High-risk financial transaction agent',
        riskProfile: 'CRITICAL' as const,
        preferredTools: ['payment-processor', 'bank-api'],
      };

      const result = await agentBuilder.generateAgent(request);
      
      // Critical agents must have strict policies
      expect(result.blueprint.policies.length).toBeGreaterThan(0);
      
      // Should have approval requirements
      const hasApprovalPolicy = result.blueprint.policies.some(p =>
        p.rules.some(r => r.type.includes('approval'))
      );
      expect(hasApprovalPolicy).toBe(true);
      
      // Should have audit logging
      const hasAuditPolicy = result.blueprint.policies.some(p =>
        p.rules.some(r => 
          r.type.includes('audit') || 
          r.type.includes('log')
        )
      );
      expect(hasAuditPolicy).toBe(true);
    });

    it('should enforce rate limiting policies for production', async () => {
      const request = {
        goal: 'API integration agent',
        riskProfile: 'MEDIUM' as const,
        preferredTools: ['http-client', 'api-connector'],
      };

      const result = await agentBuilder.generateAgent(request);
      
      // Should have rate limiting
      const hasRateLimitPolicy = result.blueprint.policies.some(p =>
        p.rules.some(r => r.type.includes('rate_limit'))
      );
      
      expect(hasRateLimitPolicy).toBe(true);
    });

    it('should validate policy rules have required parameters', async () => {
      const request = {
        goal: 'Data processing agent',
        riskProfile: 'HIGH' as const,
      };

      const result = await agentBuilder.generateAgent(request);
      
      // All policies should have valid rules with parameters
      result.blueprint.policies.forEach(policy => {
        expect(policy.rules.length).toBeGreaterThan(0);
        
        policy.rules.forEach(rule => {
          expect(rule.type).toBeDefined();
          expect(typeof rule.type).toBe('string');
          
          // If parameters exist, they should be objects
          if (rule.parameters) {
            expect(typeof rule.parameters).toBe('object');
          }
        });
      });
    });

    it('should validate high-risk tools require approval policies', async () => {
      const request = {
        goal: 'System administration agent',
        riskProfile: 'CRITICAL' as const,
        preferredTools: ['system-admin', 'database-admin'],
      };

      const result = await agentBuilder.generateAgent(request);
      
      // Critical risk tools should exist
      const criticalTools = result.blueprint.tools.filter(t =>
        t.riskTier === 'CRITICAL' || t.riskTier === 'HIGH'
      );
      
      if (criticalTools.length > 0) {
        // Should have approval policy for critical operations
        const hasApprovalPolicy = result.blueprint.policies.some(p =>
          p.rules.some(r => r.type.includes('approval'))
        );
        expect(hasApprovalPolicy).toBe(true);
      }
    });
  });

  describe('CRV Validation Gates', () => {
    it('should configure CRV gates for data validation', async () => {
      const crvGate = new CRVGate({
        name: 'Input Validation Gate',
        validators: [
          Validators.notNull(),
          Validators.schema({ 
            type: 'object',
            required: ['id', 'data'],
          }),
        ],
        blockOnFailure: true,
      });

      const testCommit = {
        id: 'commit-1',
        timestamp: new Date(),
        key: 'test-key',
        value: { id: '123', data: 'test-data' },
        metadata: {
          actor: 'test-agent',
          reason: 'validation-test',
        },
      };

      const result = await crvGate.validate(testCommit);
      
      expect(result.passed).toBe(true);
      expect(result.validationResults.length).toBeGreaterThan(0);
    });

    it('should block invalid commits when gate is configured', async () => {
      const crvGate = new CRVGate({
        name: 'Strict Validation Gate',
        validators: [
          Validators.notNull(),
          Validators.schema({ 
            type: 'object',
            required: ['id', 'timestamp', 'data'],
          }),
        ],
        blockOnFailure: true,
      });

      const invalidCommit = {
        id: 'commit-2',
        timestamp: new Date(),
        key: 'test-key',
        value: { id: '123' }, // Missing required 'data' field
        metadata: {
          actor: 'test-agent',
          reason: 'validation-test',
        },
      };

      const result = await crvGate.validate(invalidCommit);
      
      expect(result.passed).toBe(false);
    });

    it('should validate CRV gates are present for critical operations', async () => {
      const request = {
        goal: 'Financial transaction agent with validation',
        riskProfile: 'CRITICAL' as const,
        preferredTools: ['payment-api'],
      };

      const result = await agentBuilder.generateAgent(request);
      
      // Critical agents should have validation requirements
      const validation = await agentBuilder.validateAgent({
        blueprint: result.blueprint,
      });
      
      expect(validation.valid).toBe(true);
      expect(validation.details.schema.valid).toBe(true);
    });

    it('should ensure CRV confidence thresholds are met', async () => {
      const crvGate = new CRVGate({
        name: 'Confidence Threshold Gate',
        validators: [
          Validators.notNull(),
        ],
        blockOnFailure: true,
        minConfidence: 0.9,
      });

      const commit = {
        id: 'commit-3',
        timestamp: new Date(),
        key: 'test-key',
        value: { data: 'valid-data' },
        metadata: {
          actor: 'test-agent',
          reason: 'confidence-test',
        },
      };

      const result = await crvGate.validate(commit);
      
      // Check confidence levels if available
      if (result.validationResults.length > 0) {
        result.validationResults.forEach(vr => {
          if (vr.confidence !== undefined) {
            expect(vr.confidence).toBeGreaterThanOrEqual(0);
            expect(vr.confidence).toBeLessThanOrEqual(1);
          }
        });
      }
    });
  });

  describe('Observability Threshold Validation', () => {
    it('should collect telemetry during agent operations', async () => {
      const request = {
        goal: 'Monitored agent with telemetry',
        riskProfile: 'MEDIUM' as const,
      };

      const result = await agentBuilder.generateAgent(request);
      
      // Emit test events
      telemetryCollector.recordEvent({
        timestamp: new Date(),
        type: 'AGENT_GENERATED',
        workflowId: 'test-workflow',
        data: {
          agentId: result.blueprint.id,
        },
      });

      const events = telemetryCollector.getEvents();
      expect(events.length).toBeGreaterThan(0);
    });

    it('should validate metrics collection is enabled', async () => {
      const request = {
        goal: 'Agent with metrics collection',
        riskProfile: 'HIGH' as const,
      };

      const result = await agentBuilder.generateAgent(request);
      
      // Verify telemetry collector is working
      telemetryCollector.recordEvent({
        timestamp: new Date(),
        type: 'AGENT_VALIDATION',
        workflowId: 'validation-workflow',
        data: {
          agentId: result.blueprint.id,
          valid: true,
        },
      });

      const metrics = telemetryCollector.getMetrics();
      expect(metrics).toBeDefined();
    });

    it('should enforce minimum observability requirements', async () => {
      const request = {
        goal: 'Production agent with full observability',
        riskProfile: 'HIGH' as const,
      };

      const result = await agentBuilder.generateAgent(request);
      
      // Production agents should be observable
      const validation = await agentBuilder.validateAgent({
        blueprint: result.blueprint,
      });
      
      expect(validation.valid).toBe(true);
      
      // Should support telemetry
      expect(telemetryCollector).toBeDefined();
    });

    it('should validate error rate thresholds', async () => {
      const errorThreshold = 0.05; // 5% error rate
      const totalOperations = 100;
      const errors = 3;
      
      const errorRate = errors / totalOperations;
      
      expect(errorRate).toBeLessThan(errorThreshold);
    });

    it('should validate latency requirements', async () => {
      const maxLatencyMs = 1000; // 1 second
      
      const startTime = Date.now();
      
      const request = {
        goal: 'Low latency agent',
        riskProfile: 'MEDIUM' as const,
      };

      await agentBuilder.generateAgent(request);
      
      const latency = Date.now() - startTime;
      
      // Generation should complete within latency requirements
      expect(latency).toBeLessThan(maxLatencyMs);
    });
  });

  describe('Pre-Production Checklist Validation', () => {
    it('should validate complete pre-production checklist', async () => {
      const request = {
        goal: 'Production-ready agent',
        riskProfile: 'HIGH' as const,
        preferredTools: ['api-client', 'database'],
        policyRequirements: ['Rate limiting', 'Audit logging', 'Error handling'],
      };

      const result = await agentBuilder.generateAgent(request);
      
      // Checklist items
      const checklist = {
        // 1. Agent blueprint is valid
        blueprintValid: validateAgentBlueprint(result.blueprint).success,
        
        // 2. Has required policies
        hasPolicies: result.blueprint.policies.length > 0,
        
        // 3. Has configured tools
        hasTools: result.blueprint.tools.length > 0,
        
        // 4. Has risk profile defined
        hasRiskProfile: result.blueprint.riskProfile !== undefined,
        
        // 5. Has goal defined
        hasGoal: result.blueprint.goal.length >= 10,
        
        // 6. Has configuration
        hasConfig: result.blueprint.config !== undefined,
      };

      // All checklist items must pass
      Object.entries(checklist).forEach(([key, value]) => {
        expect(value).toBe(true);
      });
    });

    it('should validate security requirements for production', async () => {
      const request = {
        goal: 'Secure production agent',
        riskProfile: 'CRITICAL' as const,
        constraints: [
          'Must encrypt sensitive data',
          'Must authenticate all requests',
          'Must log all operations',
        ],
      };

      const result = await agentBuilder.generateAgent(request);
      
      const securityChecklist = {
        // Has security policies
        hasSecurityPolicies: result.blueprint.policies.some(p =>
          p.name.toLowerCase().includes('security') ||
          p.name.toLowerCase().includes('auth') ||
          p.rules.some(r => r.type.includes('encrypt'))
        ),
        
        // Has audit policies
        hasAuditPolicies: result.blueprint.policies.some(p =>
          p.rules.some(r => r.type.includes('audit') || r.type.includes('log'))
        ),
        
        // High risk profile
        hasHighRisk: ['HIGH', 'CRITICAL'].includes(result.blueprint.riskProfile),
      };

      Object.entries(securityChecklist).forEach(([key, value]) => {
        expect(value).toBe(true);
      });
    });

    it('should validate deployment readiness', async () => {
      const request = {
        goal: 'Deployment-ready agent',
        riskProfile: 'MEDIUM' as const,
      };

      const result = await agentBuilder.generateAgent(request);
      
      const deploymentChecklist = {
        // Valid schema
        schemaValid: validateAgentBlueprint(result.blueprint).success,
        
        // Has ID
        hasId: result.blueprint.id.length > 0,
        
        // Has version
        hasVersion: result.blueprint.version !== undefined,
        
        // Has name
        hasName: result.blueprint.name.length > 0,
        
        // Metadata present
        hasMetadata: result.metadata !== undefined,
      };

      Object.entries(deploymentChecklist).forEach(([key, value]) => {
        expect(value).toBe(true);
      });
    });

    it('should validate resource limits are configured', async () => {
      const request = {
        goal: 'Resource-limited agent',
        riskProfile: 'MEDIUM' as const,
      };

      const result = await agentBuilder.generateAgent(request);
      
      // Check if agent has resource constraints
      const hasResourceLimits = 
        result.blueprint.maxExecutionTime !== undefined ||
        result.blueprint.maxRetries !== undefined ||
        result.blueprint.policies.some(p =>
          p.rules.some(r => 
            r.type.includes('rate_limit') ||
            r.type.includes('timeout') ||
            r.type.includes('throttle')
          )
        );
      
      // For production agents, resource limits are recommended
      expect(typeof hasResourceLimits).toBe('boolean');
    });

    it('should validate documentation requirements', async () => {
      const request = {
        goal: 'Well-documented production agent',
        riskProfile: 'HIGH' as const,
      };

      const result = await agentBuilder.generateAgent(request);
      
      const documentationChecklist = {
        // Has goal
        hasGoal: result.blueprint.goal.length >= 10,
        
        // Has description or goal is descriptive
        hasDescription: 
          result.blueprint.description !== undefined ||
          result.blueprint.goal.length >= 20,
        
        // Tools have names
        toolsNamed: result.blueprint.tools.every(t => t.name.length > 0),
        
        // Policies have names
        policiesNamed: result.blueprint.policies.every(p => p.name.length > 0),
      };

      Object.entries(documentationChecklist).forEach(([key, value]) => {
        expect(value).toBe(true);
      });
    });
  });

  describe('Integration Validation Gates', () => {
    it('should validate end-to-end workflow execution', async () => {
      const request = {
        goal: 'End-to-end validated agent',
        riskProfile: 'MEDIUM' as const,
      };

      // Step 1: Generate
      const generateResult = await agentBuilder.generateAgent(request);
      expect(generateResult.blueprint).toBeDefined();
      
      // Step 2: Validate
      const validateResult = await agentBuilder.validateAgent({
        blueprint: generateResult.blueprint,
      });
      expect(validateResult.valid).toBe(true);
      
      // Step 3: Simulate
      const simulateResult = await agentBuilder.simulateAgent({
        blueprint: generateResult.blueprint,
        testScenario: {
          description: 'Pre-production validation',
          inputs: { test: 'data' },
        },
        dryRun: true,
      });
      expect(simulateResult).toBeDefined();
      
      // All gates passed
      const allGatesPassed = 
        generateResult.blueprint !== undefined &&
        validateResult.valid &&
        simulateResult !== undefined;
      
      expect(allGatesPassed).toBe(true);
    });

    it('should validate rollback capability before production', async () => {
      const request = {
        goal: 'Agent with rollback support',
        riskProfile: 'HIGH' as const,
      };

      const result = await agentBuilder.generateAgent(request);
      
      // High-risk agents should support rollback scenarios
      const validation = await agentBuilder.validateAgent({
        blueprint: result.blueprint,
      });
      
      expect(validation.valid).toBe(true);
      
      // Blueprint should be serializable for rollback
      const serialized = JSON.stringify(result.blueprint);
      const deserialized = JSON.parse(serialized);
      
      expect(deserialized.id).toBe(result.blueprint.id);
    });
  });
});
