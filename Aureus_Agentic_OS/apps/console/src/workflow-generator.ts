import { EventLog, WorkflowSpec, TaskSpec } from '@aureus/kernel';
import {
  WorkflowGenerationRequest,
  RiskTier,
} from '@aureus/kernel';
import { LLMProvider, MockLLMProvider } from './llm-provider';

/**
 * Extended WorkflowSpec with optional fields for generation
 * These fields match the WorkflowSpecSchema but not the base WorkflowSpec type
 */
interface GeneratedWorkflowSpec extends WorkflowSpec {
  goal?: string;
  constraints?: string[];
  successCriteria?: string[];
}

/**
 * LLM Orchestrator for generating workflow specifications
 * Uses pluggable LLM providers (OpenAI, Anthropic, etc.) for workflow generation
 */
export class WorkflowGenerator {
  private eventLog?: EventLog;
  private llmProvider: LLMProvider;

  constructor(eventLog?: EventLog, llmProvider?: LLMProvider) {
    this.eventLog = eventLog;
    // Use provided LLM provider or default to MockLLMProvider for backward compatibility
    // In production, consider making llmProvider required to avoid unintentional use of mock
    this.llmProvider = llmProvider || new MockLLMProvider();
  }

  /**
   * Generate a structured workflow specification from a natural language goal
   * @param request - The workflow generation request
   * @returns A structured workflow specification with optional metadata fields
   */
  async generateWorkflow(request: WorkflowGenerationRequest): Promise<{
    spec: GeneratedWorkflowSpec;
    metadata: {
      prompt: string;
      response: string;
      timestamp: Date;
    };
  }> {
    const timestamp = new Date();

    // Build prompt for LLM
    const prompt = this.buildPrompt(request);

    // Log the prompt for audit
    if (this.eventLog) {
      await this.eventLog.append({
        timestamp,
        type: 'LLM_PROMPT_GENERATED',
        workflowId: 'workflow-generator',
        data: {
          prompt,
          request,
        },
      });
    }

    // Call LLM provider
    const llmResponse = await this.callLLM(prompt, request);

    // Log the response for audit
    if (this.eventLog) {
      await this.eventLog.append({
        timestamp: new Date(),
        type: 'LLM_RESPONSE_RECEIVED',
        workflowId: 'workflow-generator',
        data: {
          response: llmResponse,
        },
      });
    }

    // Parse LLM response into structured spec
    const spec = this.parseLLMResponse(llmResponse, request);

    return {
      spec,
      metadata: {
        prompt,
        response: llmResponse,
        timestamp,
      },
    };
  }

  /**
   * Build a prompt for the LLM to generate a workflow spec
   */
  private buildPrompt(request: WorkflowGenerationRequest): string {
    const parts: string[] = [
      'You are an expert workflow architect. Generate a structured workflow specification based on the following requirements:',
      '',
      `Goal: ${request.goal}`,
    ];

    if (request.constraints && request.constraints.length > 0) {
      parts.push('', 'Constraints:');
      request.constraints.forEach((c: string, i: number) => parts.push(`${i + 1}. ${c}`));
    }

    if (request.preferredTools && request.preferredTools.length > 0) {
      parts.push('', `Preferred Tools: ${request.preferredTools.join(', ')}`);
    }

    if (request.riskTolerance) {
      parts.push('', `Risk Tolerance: ${request.riskTolerance}`);
    }

    if (request.additionalContext) {
      parts.push('', `Additional Context: ${request.additionalContext}`);
    }

    parts.push(
      '',
      'Generate a workflow specification that includes:',
      '1. A list of tasks with clear names and types (action, decision, or parallel)',
      '2. Tool assignments for each task',
      '3. Risk tier classification (LOW, MEDIUM, HIGH, CRITICAL)',
      '4. Task dependencies',
      '5. Success criteria',
      '6. Safety considerations',
      '',
      'Return the specification in JSON format.'
    );

    return parts.join('\n');
  }

  /**
   * Call LLM provider to generate workflow specification
   */
  private async callLLM(prompt: string, request: WorkflowGenerationRequest): Promise<string> {
    try {
      const response = await this.llmProvider.generateCompletion(prompt);
      return response.content;
    } catch (error) {
      // If LLM call fails, fall back to generating a basic structure
      throw new Error(
        `LLM provider failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Extract a workflow name from the goal
   */
  private extractWorkflowName(goal: string): string {
    // Simple heuristic: take first few words and convert to title case
    const words = goal.split(' ').slice(0, 5);
    return words.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
  }

  /**
   * Generate success criteria based on the goal
   */
  private generateSuccessCriteria(goal: string): string[] {
    // In production, LLM would generate these intelligently
    return [
      'All tasks completed successfully',
      'No errors or exceptions encountered',
      'Goal objective achieved as specified',
      'All safety checks passed',
    ];
  }

  /**
   * Generate mock tasks based on the request
   */
  private generateMockTasks(request: WorkflowGenerationRequest): Array<{
    id: string;
    name: string;
    type: string;
    riskTier: RiskTier;
    toolName?: string;
    retry?: { maxAttempts: number; backoffMs: number };
  }> {
    const baseRiskTier = request.riskTolerance || 'MEDIUM';

    // Generate 3-5 tasks based on the goal
    const taskCount = 3 + Math.floor(Math.random() * 3);
    const tasks = [];

    for (let i = 0; i < taskCount; i++) {
      const taskType = i === 0 ? 'action' : i === taskCount - 1 ? 'decision' : 'action';
      const riskTier = this.assignRiskTier(i, taskCount, baseRiskTier);

      tasks.push({
        id: `task-${i + 1}`,
        name: `Task ${i + 1}: ${this.generateTaskName(i, taskCount)}`,
        type: taskType,
        riskTier,
        toolName: request.preferredTools?.[i % (request.preferredTools.length || 1)],
        retry:
          riskTier === 'HIGH' || riskTier === 'CRITICAL'
            ? {
                maxAttempts: 3,
                backoffMs: 1000,
              }
            : undefined,
      });
    }

    return tasks;
  }

  /**
   * Assign risk tier to a task
   */
  private assignRiskTier(taskIndex: number, totalTasks: number, baseRiskTier: RiskTier): RiskTier {
    // First and last tasks typically higher risk
    if (taskIndex === 0 || taskIndex === totalTasks - 1) {
      return baseRiskTier === 'LOW' ? 'MEDIUM' : baseRiskTier;
    }

    // Middle tasks can be lower risk
    return baseRiskTier === 'CRITICAL' || baseRiskTier === 'HIGH' ? 'MEDIUM' : 'LOW';
  }

  /**
   * Generate a task name based on position in workflow
   */
  private generateTaskName(index: number, total: number): string {
    if (index === 0) return 'Initialize and validate inputs';
    if (index === total - 1) return 'Verify completion and cleanup';
    return `Process step ${index}`;
  }

  /**
   * Generate mock dependencies
   */
  private generateMockDependencies(request: WorkflowGenerationRequest): Record<string, string[]> {
    // Simple sequential dependency chain
    const dependencies: Record<string, string[]> = {};

    // Assume 3-5 tasks
    const taskCount = 3 + Math.floor(Math.random() * 3);

    for (let i = 1; i < taskCount; i++) {
      dependencies[`task-${i + 1}`] = [`task-${i}`];
    }

    return dependencies;
  }

  /**
   * Parse LLM response into a GeneratedWorkflowSpec
   * Converts from JSON representation (with Record) to runtime type (with Map)
   */
  private parseLLMResponse(response: string, request: WorkflowGenerationRequest): GeneratedWorkflowSpec {
    try {
      const parsed = JSON.parse(response);
      const workflowData = parsed.workflow || parsed;

      // Convert dependencies from object to Map for runtime type compatibility
      const dependenciesMap = new Map<string, string[]>();
      if (workflowData.dependencies) {
        Object.entries(workflowData.dependencies).forEach(([key, value]) => {
          dependenciesMap.set(key, value as string[]);
        });
      }

      // Build the spec with proper structure matching GeneratedWorkflowSpec type
      const spec: GeneratedWorkflowSpec = {
        id: `workflow-${Date.now()}`,
        name: workflowData.name || this.extractWorkflowName(request.goal),
        tasks: workflowData.tasks.map((t: any) => this.normalizeTask(t)),
        dependencies: dependenciesMap,
        safetyPolicy: workflowData.safetyPolicy,
      };

      // Add optional fields from LLM response or request
      if (workflowData.goal || request.goal) {
        spec.goal = workflowData.goal || request.goal;
      }
      if (workflowData.constraints || request.constraints) {
        spec.constraints = workflowData.constraints || request.constraints;
      }
      if (workflowData.successCriteria) {
        spec.successCriteria = workflowData.successCriteria;
      }

      // Basic validation (full Zod validation not possible due to Map vs Record mismatch)
      if (!spec.id || !spec.name || !spec.tasks || spec.tasks.length === 0) {
        throw new Error('Invalid workflow spec: missing required fields');
      }

      return spec;
    } catch (error) {
      throw new Error(
        `Failed to parse LLM response: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Normalize a task from LLM response to match TaskSpec
   */
  private normalizeTask(task: any): TaskSpec {
    return {
      id: task.id,
      name: task.name,
      type: task.type || 'action',
      riskTier: task.riskTier || 'MEDIUM',
      toolName: task.toolName,
      retry: task.retry,
      inputs: task.inputs,
      timeoutMs: task.timeoutMs || 30000,
      idempotencyKey: task.idempotencyKey,
      compensation: task.compensation,
      compensationAction: task.compensationAction,
      requiredPermissions: task.requiredPermissions,
      allowedTools: task.allowedTools,
      intent: task.intent,
      dataZone: task.dataZone,
      sandboxConfig: task.sandboxConfig,
    };
  }
}
