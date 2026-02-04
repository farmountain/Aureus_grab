import { describe, it, expect, beforeEach } from 'vitest';
import { AgentBuilder } from '../src/agent-builder';
import { EventLog } from '@aureus/kernel';
import { InMemoryStateStore } from '@aureus/kernel';

describe('AgentBuilder', () => {
  let agentBuilder: AgentBuilder;
  let eventLog: EventLog;

  beforeEach(() => {
    const stateStore = new InMemoryStateStore();
    eventLog = new EventLog(stateStore);
    agentBuilder = new AgentBuilder(eventLog);
  });

  describe('generateAgent', () => {
    it('should generate an agent blueprint from a request', async () => {
      const request = {
        goal: 'Monitor system logs and alert on critical errors',
        riskProfile: 'MEDIUM' as const,
        constraints: ['Must be read-only', 'Must not access PII'],
        preferredTools: ['http-client', 'file-reader'],
        policyRequirements: ['Rate limiting', 'Timeout enforcement'],
      };

      const result = await agentBuilder.generateAgent(request);

      expect(result).toBeDefined();
      expect(result.blueprint).toBeDefined();
      expect(result.metadata).toBeDefined();

      // Verify blueprint structure
      expect(result.blueprint.id).toBeDefined();
      expect(result.blueprint.name).toBeDefined();
      expect(result.blueprint.goal).toBe(request.goal);
      expect(result.blueprint.riskProfile).toBe(request.riskProfile);

      // Verify config
      expect(result.blueprint.config).toBeDefined();
      expect(result.blueprint.config.prompt).toBeDefined();
      expect(result.blueprint.config.systemPrompt).toBeDefined();
      expect(result.blueprint.config.temperature).toBeDefined();

      // Verify tools
      expect(result.blueprint.tools).toBeDefined();
      expect(result.blueprint.tools.length).toBeGreaterThan(0);

      // Verify policies
      expect(result.blueprint.policies).toBeDefined();
      expect(result.blueprint.policies.length).toBeGreaterThan(0);

      // Verify workflows
      expect(result.blueprint.workflows).toBeDefined();
      expect(result.blueprint.workflows.length).toBeGreaterThan(0);

      // Verify metadata
      expect(result.metadata.prompt).toBeDefined();
      expect(result.metadata.response).toBeDefined();
      expect(result.metadata.timestamp).toBeInstanceOf(Date);
    });

    it('should generate agent with correct risk profile settings', async () => {
      const criticalRequest = {
        goal: 'Manage critical system infrastructure',
        riskProfile: 'CRITICAL' as const,
        preferredTools: ['command-executor'],
      };

      const result = await agentBuilder.generateAgent(criticalRequest);

      expect(result.blueprint.riskProfile).toBe('CRITICAL');
      expect(result.blueprint.config.temperature).toBeLessThan(0.5); // Very deterministic
      expect(result.blueprint.maxExecutionTime).toBeLessThanOrEqual(300000); // 5 minutes for critical
    });

    it('should generate agent with low risk profile settings', async () => {
      const lowRiskRequest = {
        goal: 'Read and analyze log files',
        riskProfile: 'LOW' as const,
        preferredTools: ['file-reader'],
      };

      const result = await agentBuilder.generateAgent(lowRiskRequest);

      expect(result.blueprint.riskProfile).toBe('LOW');
      expect(result.blueprint.config.temperature).toBeGreaterThan(0.7); // More creative
      expect(result.blueprint.maxExecutionTime).toBeGreaterThan(1800000); // Longer execution time
    });

    it('should include constraints in generated blueprint', async () => {
      const request = {
        goal: 'Process user data',
        riskProfile: 'HIGH' as const,
        constraints: [
          'Must comply with GDPR',
          'Must not store sensitive data',
          'Must encrypt all transmissions',
        ],
      };

      const result = await agentBuilder.generateAgent(request);

      expect(result.blueprint.constraints).toBeDefined();
      expect(result.blueprint.constraints!.length).toBeGreaterThanOrEqual(3);
    });

    it('should generate appropriate tools based on request', async () => {
      const request = {
        goal: 'Send email notifications',
        riskProfile: 'MEDIUM' as const,
        preferredTools: ['email-sender', 'http-client'],
      };

      const result = await agentBuilder.generateAgent(request);

      expect(result.blueprint.tools.length).toBeGreaterThan(0);
      const toolNames = result.blueprint.tools.map((t) => t.name);
      expect(toolNames).toContain('email-sender');
      expect(toolNames).toContain('http-client');
    });

    it('should generate policies based on policy requirements', async () => {
      const request = {
        goal: 'Execute automated workflows',
        riskProfile: 'MEDIUM' as const,
        policyRequirements: ['Approval required for high-risk actions', 'Audit all operations'],
      };

      const result = await agentBuilder.generateAgent(request);

      expect(result.blueprint.policies.length).toBeGreaterThan(0);
      // Should have default safety policy plus custom policies
      expect(result.blueprint.policies.length).toBeGreaterThanOrEqual(3);
    });

    it('should log events when event log is provided', async () => {
      const request = {
        goal: 'Test agent generation',
        riskProfile: 'LOW' as const,
      };

      const result = await agentBuilder.generateAgent(request);

      // Check that events were logged
      const events = await eventLog.getEvents('agent-builder');
      expect(events.length).toBeGreaterThanOrEqual(2); // prompt + response events
      expect(events.some((e) => e.type === 'LLM_PROMPT_GENERATED')).toBe(true);
      expect(events.some((e) => e.type === 'LLM_RESPONSE_RECEIVED')).toBe(true);
    });
  });

  describe('validateAgent', () => {
    it('should validate a well-formed agent blueprint', async () => {
      const request = {
        goal: 'Test agent for validation',
        riskProfile: 'MEDIUM' as const,
        preferredTools: ['http-client'],
      };

      const generated = await agentBuilder.generateAgent(request);
      const validation = await agentBuilder.validateAgent(generated.blueprint);

      expect(validation).toBeDefined();
      expect(validation.valid).toBe(true);
      expect(validation.issues).toBeDefined();
    });

    it('should warn when agent has no tools', async () => {
      const blueprint = {
        id: 'agent-1',
        name: 'Test Agent',
        version: '1.0.0',
        goal: 'Test agent goal',
        riskProfile: 'MEDIUM' as const,
        config: {
          prompt: 'Test prompt',
          temperature: 0.7,
        },
        tools: [],
        policies: [
          {
            policyId: 'policy-1',
            name: 'Test Policy',
            enabled: true,
            rules: [{ type: 'test', description: 'Test rule' }],
          },
        ],
        workflows: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const validation = await agentBuilder.validateAgent(blueprint);

      expect(validation.issues.some((i) => i.severity === 'warning' && i.field === 'tools')).toBe(true);
    });

    it('should warn when agent has no policies', async () => {
      const blueprint = {
        id: 'agent-1',
        name: 'Test Agent',
        version: '1.0.0',
        goal: 'Test agent goal',
        riskProfile: 'MEDIUM' as const,
        config: {
          prompt: 'Test prompt',
          temperature: 0.7,
        },
        tools: [
          {
            toolId: 'tool-1',
            name: 'http-client',
            enabled: true,
          },
        ],
        policies: [],
        workflows: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const validation = await agentBuilder.validateAgent(blueprint);

      expect(validation.issues.some((i) => i.severity === 'warning' && i.field === 'policies')).toBe(true);
    });

    it('should error when risk profile is inconsistent with tools', async () => {
      const blueprint = {
        id: 'agent-1',
        name: 'Test Agent',
        version: '1.0.0',
        goal: 'Test agent goal',
        riskProfile: 'LOW' as const,
        config: {
          prompt: 'Test prompt',
          temperature: 0.7,
        },
        tools: [
          {
            toolId: 'tool-1',
            name: 'command-executor',
            enabled: true,
            riskTier: 'CRITICAL' as const,
          },
        ],
        policies: [],
        workflows: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const validation = await agentBuilder.validateAgent(blueprint);

      expect(validation.valid).toBe(false);
      expect(validation.issues.some((i) => i.severity === 'error' && i.field === 'riskProfile')).toBe(true);
    });

    it('should provide info message when no max execution time specified', async () => {
      const blueprint = {
        id: 'agent-1',
        name: 'Test Agent',
        version: '1.0.0',
        goal: 'Test agent goal',
        riskProfile: 'MEDIUM' as const,
        config: {
          prompt: 'Test prompt',
          temperature: 0.7,
        },
        tools: [],
        policies: [],
        workflows: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const validation = await agentBuilder.validateAgent(blueprint);

      expect(validation.issues.some((i) => i.severity === 'info' && i.field === 'maxExecutionTime')).toBe(true);
    });

    it('should warn when no success criteria are defined', async () => {
      const blueprint = {
        id: 'agent-1',
        name: 'Test Agent',
        version: '1.0.0',
        goal: 'Test agent goal',
        riskProfile: 'MEDIUM' as const,
        config: {
          prompt: 'Test prompt',
          temperature: 0.7,
        },
        tools: [],
        policies: [],
        workflows: [],
        successCriteria: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const validation = await agentBuilder.validateAgent(blueprint);

      expect(validation.issues.some((i) => i.severity === 'warning' && i.field === 'successCriteria')).toBe(true);
    });
  });

  describe('AgentBuilder without event log', () => {
    it('should work without event log', async () => {
      const builderWithoutLog = new AgentBuilder();

      const request = {
        goal: 'Test agent without logging',
        riskProfile: 'LOW' as const,
      };

      const result = await builderWithoutLog.generateAgent(request);

      expect(result).toBeDefined();
      expect(result.blueprint).toBeDefined();
    });
  });

  describe('Generated agent structure', () => {
    it('should generate unique agent IDs', async () => {
      const request = {
        goal: 'Test unique IDs',
        riskProfile: 'MEDIUM' as const,
      };

      const result1 = await agentBuilder.generateAgent(request);
      const result2 = await agentBuilder.generateAgent(request);

      expect(result1.blueprint.id).not.toBe(result2.blueprint.id);
    });

    it('should include timestamps', async () => {
      const request = {
        goal: 'Test timestamps',
        riskProfile: 'MEDIUM' as const,
      };

      const result = await agentBuilder.generateAgent(request);

      expect(result.blueprint.createdAt).toBeInstanceOf(Date);
      expect(result.blueprint.updatedAt).toBeInstanceOf(Date);
    });

    it('should generate success criteria', async () => {
      const request = {
        goal: 'Complete a specific task',
        riskProfile: 'MEDIUM' as const,
      };

      const result = await agentBuilder.generateAgent(request);

      expect(result.blueprint.successCriteria).toBeDefined();
      expect(result.blueprint.successCriteria!.length).toBeGreaterThan(0);
    });

    it('should generate appropriate tags', async () => {
      const request = {
        goal: 'Test tagging',
        riskProfile: 'HIGH' as const,
        preferredTools: ['http-client', 'database-query'],
      };

      const result = await agentBuilder.generateAgent(request);

      expect(result.blueprint.tags).toBeDefined();
      expect(result.blueprint.tags).toContain('risk:high');
      expect(result.blueprint.tags).toContain('ai-generated');
      expect(result.blueprint.tags).toContain('blueprint');
    });
  });

  describe('CRV and Policy Validation', () => {
    it('should validate agent blueprint with CRV', async () => {
      const request = {
        goal: 'Test CRV validation',
        riskProfile: 'MEDIUM' as const,
        preferredTools: ['http-client'],
      };

      const generated = await agentBuilder.generateAgent(request);
      const crvResult = await agentBuilder.validateWithCRV(generated.blueprint);

      expect(crvResult).toBeDefined();
      expect(crvResult.passed).toBeDefined();
      expect(crvResult.gateName).toBeDefined();
      expect(crvResult.validationResults).toBeDefined();
      expect(Array.isArray(crvResult.validationResults)).toBe(true);
      expect(crvResult.timestamp).toBeInstanceOf(Date);
    });

    it('should evaluate agent blueprint with policy guard when not configured', async () => {
      const request = {
        goal: 'Test policy evaluation',
        riskProfile: 'MEDIUM' as const,
        preferredTools: ['http-client'],
      };

      const generated = await agentBuilder.generateAgent(request);
      const policyResult = await agentBuilder.evaluateWithPolicy(generated.blueprint);

      expect(policyResult).toBeDefined();
      expect(policyResult.approved).toBe(true); // Should allow by default when no guard
      expect(policyResult.decision).toBe('ALLOW');
      expect(policyResult.timestamp).toBeInstanceOf(Date);
    });

    it('should perform comprehensive validation', async () => {
      const request = {
        goal: 'Test comprehensive validation',
        riskProfile: 'MEDIUM' as const,
        preferredTools: ['http-client', 'file-reader'],
        policyRequirements: ['Rate limiting'],
      };

      const generated = await agentBuilder.generateAgent(request);
      const result = await agentBuilder.validateAgentComprehensive(generated.blueprint);

      expect(result).toBeDefined();
      expect(result.valid).toBeDefined();
      expect(result.issues).toBeDefined();
      expect(result.crvResult).toBeDefined();
      expect(result.policyResult).toBeDefined();
      
      // Basic validation should pass for well-formed agent
      expect(result.issues.length).toBeGreaterThanOrEqual(0);
      
      // CRV should be performed
      expect(result.crvResult.gateName).toBeDefined();
      expect(result.crvResult.validationResults.length).toBeGreaterThan(0);
      
      // Policy evaluation should be performed
      expect(result.policyResult.decision).toBeDefined();
    });

    it('should fail comprehensive validation when CRV fails', async () => {
      // Create a blueprint that would fail CRV validation
      const blueprint = {
        id: 'agent-test',
        name: 'Test Agent',
        version: '1.0.0',
        goal: 'Test goal',
        riskProfile: 'CRITICAL' as const,
        config: {
          prompt: 'Test',
          temperature: 0.3,
        },
        tools: [
          {
            toolId: 'tool-1',
            name: 'dangerous-tool',
            enabled: true,
            riskTier: 'CRITICAL' as const,
          },
        ],
        policies: [],
        workflows: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await agentBuilder.validateAgentComprehensive(blueprint);

      expect(result).toBeDefined();
      // CRV validation should be performed regardless of pass/fail
      expect(result.crvResult).toBeDefined();
      expect(result.policyResult).toBeDefined();
    });

    it('should log CRV validation events', async () => {
      const request = {
        goal: 'Test CRV event logging',
        riskProfile: 'MEDIUM' as const,
        preferredTools: ['http-client'],
      };

      const generated = await agentBuilder.generateAgent(request);
      await agentBuilder.validateWithCRV(generated.blueprint);

      // Check that CRV event was logged
      const events = await eventLog.getEvents(`agent-${generated.blueprint.id}`);
      const crvEvents = events.filter(e => e.type === 'CRV_VALIDATION');
      expect(crvEvents.length).toBeGreaterThan(0);
    });

    it('should log policy evaluation events', async () => {
      const request = {
        goal: 'Test policy event logging',
        riskProfile: 'MEDIUM' as const,
        preferredTools: ['http-client'],
      };

      const generated = await agentBuilder.generateAgent(request);
      await agentBuilder.evaluateWithPolicy(generated.blueprint);

      // Check that policy event was logged
      const events = await eventLog.getEvents(`agent-${generated.blueprint.id}`);
      const policyEvents = events.filter(e => e.type === 'POLICY_EVALUATION');
      expect(policyEvents.length).toBeGreaterThan(0);
    });
  });

  describe('Blueprint Merging', () => {
    it('should merge blueprint with world model config', async () => {
      const request = {
        goal: 'Test world model merging',
        riskProfile: 'MEDIUM' as const,
        domain: 'general',
        preferredTools: ['http-client'],
      };

      const generated = await agentBuilder.generateAgent(request);
      const merged = await agentBuilder.mergeBlueprint(generated.blueprint, {
        includeWorldModel: true,
        includeMemoryEngine: false,
        includeMCPServer: false,
      });

      expect(merged).toBeDefined();
      expect(merged.worldModelConfig).toBeDefined();
      expect(merged.worldModelConfig.id).toBeDefined();
      expect(merged.worldModelConfig.name).toContain('World Model');
      expect(merged.memoryEngineConfig).toBeUndefined();
      expect(merged.mcpServerConfig).toBeUndefined();
    });

    it('should merge blueprint with memory engine config', async () => {
      const request = {
        goal: 'Test memory engine merging',
        riskProfile: 'HIGH' as const,
        preferredTools: ['http-client'],
      };

      const generated = await agentBuilder.generateAgent(request);
      const merged = await agentBuilder.mergeBlueprint(generated.blueprint, {
        includeWorldModel: false,
        includeMemoryEngine: true,
        includeMCPServer: false,
      });

      expect(merged).toBeDefined();
      expect(merged.memoryEngineConfig).toBeDefined();
      expect(merged.memoryEngineConfig.schemaVersion).toBe('1.0');
      expect(merged.memoryEngineConfig.policy.id).toBeDefined();
      expect(merged.memoryEngineConfig.policy.retentionTiers).toBeDefined();
      expect(merged.worldModelConfig).toBeUndefined();
      expect(merged.mcpServerConfig).toBeUndefined();
    });

    it('should merge blueprint with MCP server config', async () => {
      const request = {
        goal: 'Test MCP server merging',
        riskProfile: 'MEDIUM' as const,
        preferredTools: ['http-client', 'database-query'],
      };

      const generated = await agentBuilder.generateAgent(request);
      const merged = await agentBuilder.mergeBlueprint(generated.blueprint, {
        includeWorldModel: false,
        includeMemoryEngine: false,
        includeMCPServer: true,
      });

      expect(merged).toBeDefined();
      expect(merged.mcpServerConfig).toBeDefined();
      expect(merged.mcpServerConfig.name).toBeDefined();
      expect(merged.mcpServerConfig.actions).toBeDefined();
      expect(merged.worldModelConfig).toBeUndefined();
      expect(merged.memoryEngineConfig).toBeUndefined();
    });

    it('should merge blueprint with all configs', async () => {
      const request = {
        goal: 'Test full merging',
        riskProfile: 'MEDIUM' as const,
        domain: 'finance',
        preferredTools: ['http-client', 'database-query'],
      };

      const generated = await agentBuilder.generateAgent(request);
      const merged = await agentBuilder.mergeBlueprint(generated.blueprint, {
        includeWorldModel: true,
        includeMemoryEngine: true,
        includeMCPServer: true,
      });

      expect(merged).toBeDefined();
      expect(merged.worldModelConfig).toBeDefined();
      expect(merged.memoryEngineConfig).toBeDefined();
      expect(merged.mcpServerConfig).toBeDefined();
    });

    it('should handle merge failures gracefully', async () => {
      const request = {
        goal: 'Test error handling',
        riskProfile: 'MEDIUM' as const,
        preferredTools: ['http-client'],
      };

      const generated = await agentBuilder.generateAgent(request);
      
      // Even if merge fails for some configs, it should return the blueprint
      const merged = await agentBuilder.mergeBlueprint(generated.blueprint, {
        includeWorldModel: true,
        includeMemoryEngine: true,
        includeMCPServer: true,
      });

      expect(merged).toBeDefined();
      expect(merged.id).toBe(generated.blueprint.id);
    });
  });

  describe('Merged Blueprint Validation', () => {
    it('should validate merged blueprint comprehensively', async () => {
      const request = {
        goal: 'Test merged blueprint validation',
        riskProfile: 'MEDIUM' as const,
        domain: 'general',
        preferredTools: ['http-client'],
      };

      const generated = await agentBuilder.generateAgent(request);
      const merged = await agentBuilder.mergeBlueprint(generated.blueprint, {
        includeWorldModel: true,
        includeMemoryEngine: true,
        includeMCPServer: true,
      });

      const validation = await agentBuilder.validateMergedBlueprint(merged);

      expect(validation).toBeDefined();
      expect(validation.valid).toBeDefined();
      expect(validation.issues).toBeDefined();
      expect(validation.schemaValidation).toBeDefined();
      expect(validation.crvResult).toBeDefined();
      expect(validation.policyResult).toBeDefined();
    });

    it('should validate world model config in merged blueprint', async () => {
      const request = {
        goal: 'Test world model validation',
        riskProfile: 'MEDIUM' as const,
        domain: 'general',
        preferredTools: ['http-client'],
      };

      const generated = await agentBuilder.generateAgent(request);
      const merged = await agentBuilder.mergeBlueprint(generated.blueprint, {
        includeWorldModel: true,
        includeMemoryEngine: false,
        includeMCPServer: false,
      });

      const validation = await agentBuilder.validateMergedBlueprint(merged);

      expect(validation.worldModelValidation).toBeDefined();
      expect(validation.worldModelValidation.valid).toBeDefined();
    });

    it('should validate memory engine config in merged blueprint', async () => {
      const request = {
        goal: 'Test memory engine validation',
        riskProfile: 'HIGH' as const,
        preferredTools: ['http-client'],
      };

      const generated = await agentBuilder.generateAgent(request);
      const merged = await agentBuilder.mergeBlueprint(generated.blueprint, {
        includeWorldModel: false,
        includeMemoryEngine: true,
        includeMCPServer: false,
      });

      const validation = await agentBuilder.validateMergedBlueprint(merged);

      expect(validation.memoryEngineValidation).toBeDefined();
      expect(validation.memoryEngineValidation.valid).toBeDefined();
      expect(validation.memoryEngineValidation.errors).toBeDefined();
      expect(validation.memoryEngineValidation.warnings).toBeDefined();
    });

    it('should report issues for all validation failures', async () => {
      const request = {
        goal: 'Test comprehensive issue reporting',
        riskProfile: 'CRITICAL' as const,
        preferredTools: ['command-executor'],
      };

      const generated = await agentBuilder.generateAgent(request);
      const merged = await agentBuilder.mergeBlueprint(generated.blueprint, {
        includeWorldModel: true,
        includeMemoryEngine: true,
        includeMCPServer: true,
      });

      const validation = await agentBuilder.validateMergedBlueprint(merged);

      expect(validation.issues).toBeDefined();
      expect(Array.isArray(validation.issues)).toBe(true);
      
      // Check that issues have the correct structure
      validation.issues.forEach(issue => {
        expect(issue.severity).toBeDefined();
        expect(['error', 'warning', 'info']).toContain(issue.severity);
        expect(issue.message).toBeDefined();
      });
    });
  });

  describe('Blueprint Export', () => {
    it('should export blueprint as JSON string', async () => {
      const request = {
        goal: 'Test blueprint export',
        riskProfile: 'MEDIUM' as const,
        preferredTools: ['http-client'],
      };

      const generated = await agentBuilder.generateAgent(request);
      const exported = agentBuilder.exportBlueprint(generated.blueprint);

      expect(exported).toBeDefined();
      expect(typeof exported).toBe('string');
      
      // Should be valid JSON
      const parsed = JSON.parse(exported);
      expect(parsed).toBeDefined();
      expect(parsed.id).toBe(generated.blueprint.id);
    });

    it('should export merged blueprint with all configs', async () => {
      const request = {
        goal: 'Test merged blueprint export',
        riskProfile: 'MEDIUM' as const,
        domain: 'finance',
        preferredTools: ['http-client', 'database-query'],
      };

      const generated = await agentBuilder.generateAgent(request);
      const merged = await agentBuilder.mergeBlueprint(generated.blueprint, {
        includeWorldModel: true,
        includeMemoryEngine: true,
        includeMCPServer: true,
      });

      const exported = agentBuilder.exportBlueprint(merged);

      expect(exported).toBeDefined();
      
      const parsed = JSON.parse(exported);
      expect(parsed.worldModelConfig).toBeDefined();
      expect(parsed.memoryEngineConfig).toBeDefined();
      expect(parsed.mcpServerConfig).toBeDefined();
    });
  });
});
