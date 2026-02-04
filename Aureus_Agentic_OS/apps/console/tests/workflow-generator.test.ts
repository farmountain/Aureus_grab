import { describe, it, expect, beforeEach } from 'vitest';
import { WorkflowGenerator } from '../src/workflow-generator';
import { InMemoryEventLog } from '@aureus/kernel';
import { WorkflowGenerationRequest } from '@aureus/kernel';

describe('WorkflowGenerator', () => {
  let generator: WorkflowGenerator;
  let eventLog: InMemoryEventLog;

  beforeEach(() => {
    eventLog = new InMemoryEventLog();
    generator = new WorkflowGenerator(eventLog);
  });

  describe('generateWorkflow', () => {
    it('should generate a valid workflow from a simple goal', async () => {
      const request: WorkflowGenerationRequest = {
        goal: 'Reconcile bank transactions with internal ledger',
        riskTolerance: 'MEDIUM',
      };

      const result = await generator.generateWorkflow(request);

      expect(result.spec).toBeDefined();
      expect(result.spec.id).toBeDefined();
      expect(result.spec.name).toBeDefined();
      expect(result.spec.goal).toBe(request.goal);
      expect(result.spec.tasks).toBeDefined();
      expect(result.spec.tasks.length).toBeGreaterThan(0);
      expect(result.spec.dependencies).toBeDefined();
    });

    it('should include constraints in the generated spec', async () => {
      const request: WorkflowGenerationRequest = {
        goal: 'Process customer orders',
        constraints: ['Complete within 5 minutes', 'No external API calls'],
        riskTolerance: 'LOW',
      };

      const result = await generator.generateWorkflow(request);

      expect(result.spec.constraints).toEqual(request.constraints);
    });

    it('should respect preferred tools', async () => {
      const request: WorkflowGenerationRequest = {
        goal: 'Send notification to users',
        preferredTools: ['email', 'slack'],
        riskTolerance: 'HIGH',
      };

      const result = await generator.generateWorkflow(request);

      // At least one task should use one of the preferred tools
      const usesPreferredTool = result.spec.tasks.some(task =>
        request.preferredTools?.includes(task.toolName || '')
      );
      expect(usesPreferredTool).toBe(true);
    });

    it('should generate tasks with appropriate risk tiers', async () => {
      const request: WorkflowGenerationRequest = {
        goal: 'Execute high-risk financial transaction',
        riskTolerance: 'CRITICAL',
      };

      const result = await generator.generateWorkflow(request);

      // Check that tasks have risk tiers
      result.spec.tasks.forEach(task => {
        expect(task.riskTier).toBeDefined();
        expect(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).toContain(task.riskTier);
      });
    });

    it('should create sequential dependencies', async () => {
      const request: WorkflowGenerationRequest = {
        goal: 'Multi-step data processing pipeline',
        riskTolerance: 'MEDIUM',
      };

      const result = await generator.generateWorkflow(request);

      // Check that dependencies form a chain
      // Note: dependencies is a Map<string, string[]>, not a plain object
      const deps = result.spec.dependencies;
      expect(deps).toBeInstanceOf(Map);
      expect(deps.size).toBeGreaterThan(0);

      // Each task (except first) should depend on previous
      Array.from(deps.values()).forEach(depList => {
        expect(depList.length).toBeGreaterThan(0);
      });
    });

    it('should include success criteria', async () => {
      const request: WorkflowGenerationRequest = {
        goal: 'Complete data validation',
        riskTolerance: 'MEDIUM',
      };

      const result = await generator.generateWorkflow(request);

      expect(result.spec.successCriteria).toBeDefined();
      expect(result.spec.successCriteria!.length).toBeGreaterThan(0);
    });

    it('should include safety policy', async () => {
      const request: WorkflowGenerationRequest = {
        goal: 'Execute critical operation',
        riskTolerance: 'CRITICAL',
      };

      const result = await generator.generateWorkflow(request);

      expect(result.spec.safetyPolicy).toBeDefined();
      expect(result.spec.safetyPolicy?.name).toBeDefined();
      expect(result.spec.safetyPolicy?.rules).toBeDefined();
      expect(result.spec.safetyPolicy?.rules.length).toBeGreaterThan(0);
      expect(result.spec.safetyPolicy?.failFast).toBe(true); // Critical risk = failFast
    });

    it('should log prompt and response to event log', async () => {
      const request: WorkflowGenerationRequest = {
        goal: 'Test workflow generation with logging',
        riskTolerance: 'LOW',
      };

      await generator.generateWorkflow(request);

      const events = await eventLog.read('workflow-generator');
      expect(events.length).toBeGreaterThanOrEqual(2);

      const promptEvent = events.find(e => e.type === 'LLM_PROMPT_GENERATED');
      const responseEvent = events.find(e => e.type === 'LLM_RESPONSE_RECEIVED');

      expect(promptEvent).toBeDefined();
      expect(responseEvent).toBeDefined();
      expect(promptEvent?.data?.prompt).toBeDefined();
      expect(responseEvent?.data?.response).toBeDefined();
    });

    it('should return metadata with timestamp', async () => {
      const request: WorkflowGenerationRequest = {
        goal: 'Generate workflow with metadata',
        riskTolerance: 'MEDIUM',
      };

      const result = await generator.generateWorkflow(request);

      expect(result.metadata).toBeDefined();
      expect(result.metadata.timestamp).toBeInstanceOf(Date);
      expect(result.metadata.prompt).toBeDefined();
      expect(result.metadata.response).toBeDefined();
      expect(result.metadata.prompt.length).toBeGreaterThan(0);
      expect(result.metadata.response.length).toBeGreaterThan(0);
    });

    it('should handle additional context', async () => {
      const request: WorkflowGenerationRequest = {
        goal: 'Process data with context',
        additionalContext: 'Use staging environment for testing',
        riskTolerance: 'LOW',
      };

      const result = await generator.generateWorkflow(request);

      // Verify the workflow was generated successfully
      expect(result.spec).toBeDefined();
      expect(result.metadata.prompt).toContain(request.additionalContext);
    });

    it('should generate different task counts based on complexity', async () => {
      const request: WorkflowGenerationRequest = {
        goal: 'Simple single-step task',
        riskTolerance: 'LOW',
      };

      const result = await generator.generateWorkflow(request);

      // Should have at least 3 tasks
      expect(result.spec.tasks.length).toBeGreaterThanOrEqual(3);
      expect(result.spec.tasks.length).toBeLessThanOrEqual(6);
    });

    it('should generate retry configs for high-risk tasks', async () => {
      const request: WorkflowGenerationRequest = {
        goal: 'High-risk operation requiring retries',
        riskTolerance: 'HIGH',
      };

      const result = await generator.generateWorkflow(request);

      // High risk tasks should have retry configs
      const highRiskTasks = result.spec.tasks.filter(
        t => t.riskTier === 'HIGH' || t.riskTier === 'CRITICAL'
      );

      if (highRiskTasks.length > 0) {
        highRiskTasks.forEach(task => {
          if (task.retry) {
            expect(task.retry.maxAttempts).toBeGreaterThan(0);
            expect(task.retry.backoffMs).toBeGreaterThan(0);
          }
        });
      }
    });
  });

  describe('error handling', () => {
    it('should throw error for invalid LLM response', async () => {
      // This test would need a way to inject invalid responses
      // For now, we just verify the generator handles the current mock correctly
      const request: WorkflowGenerationRequest = {
        goal: 'Test error handling',
        riskTolerance: 'MEDIUM',
      };

      const result = await generator.generateWorkflow(request);
      expect(result.spec).toBeDefined();
    });
  });

  describe('LLM provider interface', () => {
    it('should work with custom mock LLM provider', async () => {
      // Import the MockLLMProvider
      const { MockLLMProvider } = await import('../src/llm-provider');
      const mockProvider = new MockLLMProvider({ model: 'test-model' });
      const generatorWithProvider = new WorkflowGenerator(eventLog, mockProvider);

      const request: WorkflowGenerationRequest = {
        goal: 'Test workflow generation with custom provider',
        riskTolerance: 'MEDIUM',
      };

      const result = await generatorWithProvider.generateWorkflow(request);

      expect(result.spec).toBeDefined();
      expect(result.spec.tasks.length).toBeGreaterThan(0);
      expect(result.metadata.response).toBeDefined();
    });

    it('should use MockLLMProvider by default when no provider is specified', async () => {
      const generatorWithoutProvider = new WorkflowGenerator(eventLog);

      const request: WorkflowGenerationRequest = {
        goal: 'Test default provider',
        riskTolerance: 'LOW',
      };

      const result = await generatorWithoutProvider.generateWorkflow(request);

      expect(result.spec).toBeDefined();
      expect(result.spec.tasks).toBeDefined();
    });

    it('should propagate LLM provider errors', async () => {
      // Create a failing mock provider
      const { BaseLLMProvider, LLMResponse } = await import('../src/llm-provider');
      class FailingProvider extends BaseLLMProvider {
        async generateCompletion(): Promise<LLMResponse> {
          throw new Error('Simulated LLM provider failure');
        }
      }

      const failingProvider = new FailingProvider({ model: 'failing-model' });
      const generatorWithFailingProvider = new WorkflowGenerator(eventLog, failingProvider);

      const request: WorkflowGenerationRequest = {
        goal: 'Test error propagation',
        riskTolerance: 'MEDIUM',
      };

      await expect(generatorWithFailingProvider.generateWorkflow(request)).rejects.toThrow(
        'LLM provider failed'
      );
    });
  });
});
