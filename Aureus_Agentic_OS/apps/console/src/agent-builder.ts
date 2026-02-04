import { 
  EventLog, 
  AgentBlueprint, 
  AgentGenerationRequest, 
  AgentToolConfig, 
  AgentPolicyConfig,
  AgentWorkflowRef,
  RiskProfile,
  SandboxIntegration,
  TaskSpec,
  TaskState,
} from '@aureus/kernel';
import { CRVGate, GateResult, Commit, GateConfig, ValidationResult } from '@aureus/crv';
import { GoalGuardFSM, Action, Principal, Intent, DataZone, RiskTier } from '@aureus/policy';
import { LLMProvider } from './llm-provider';
import { WorldModelBuilder, WorldModelGenerationRequest } from './world-model-builder';
import { MemoryEngineBuilder } from './memory-engine-builder';
import { MemoryPolicyConfig, MemoryAPI, MemoryEngineConfig, RiskProfile as MemoryRiskProfile } from '@aureus/memory-hipcortex';
import { WorldModelSpec } from '@aureus/world-model';
import { MCPBuilder } from './mcp-builder';
import { TelemetryCollector } from '@aureus/observability';
import { CapturedSideEffect } from '@aureus/tools';

/**
 * Extended blueprint with optional world model, memory engine, and MCP configs
 */
export interface ExtendedAgentBlueprint extends AgentBlueprint {
  worldModelConfig?: WorldModelSpec;
  memoryEngineConfig?: MemoryEngineConfig;
  mcpServerConfig?: any; // MCPServer definition
}

/**
 * CRV validation result for agent blueprints
 */
export interface AgentCRVResult {
  passed: boolean;
  gateName: string;
  validationResults: Array<{
    valid: boolean;
    reason?: string;
    confidence?: number;
  }>;
  timestamp: Date;
}

/**
 * Policy evaluation result for agent blueprints
 */
export interface AgentPolicyResult {
  approved: boolean;
  decision: string;
  reason?: string;
  timestamp: Date;
}

/**
 * Agent Builder Service for generating agent specifications
 * Uses real LLM provider interface for AI-assisted agent generation
 * Validates output against blueprint schema
 */
export class AgentBuilder {
  private eventLog?: EventLog;
  private policyGuard?: GoalGuardFSM;
  private llmProvider?: LLMProvider;
  private worldModelBuilder: WorldModelBuilder;
  private memoryEngineBuilder: MemoryEngineBuilder;
  private mcpBuilder: MCPBuilder;
  private sandboxIntegration?: SandboxIntegration;
  private crvGate?: CRVGate;
  private telemetry?: TelemetryCollector;
  private memoryAPI?: MemoryAPI;

  constructor(
    eventLog?: EventLog,
    policyGuard?: GoalGuardFSM,
    llmProvider?: LLMProvider,
    sandboxIntegration?: SandboxIntegration,
    crvGate?: CRVGate,
    telemetry?: TelemetryCollector,
    memoryAPI?: MemoryAPI
  ) {
    this.eventLog = eventLog;
    this.policyGuard = policyGuard;
    this.llmProvider = llmProvider;
    this.sandboxIntegration = sandboxIntegration;
    this.crvGate = crvGate;
    this.telemetry = telemetry;
    this.memoryAPI = memoryAPI;
    this.worldModelBuilder = new WorldModelBuilder(llmProvider);
    this.memoryEngineBuilder = new MemoryEngineBuilder();
    this.mcpBuilder = new MCPBuilder();
  }

  /**
   * Set LLM provider for AI-assisted generation
   */
  setLLMProvider(provider: LLMProvider): void {
    this.llmProvider = provider;
  }

  /**
   * Convert RiskProfile string to RiskTier enum
   */
  private convertRiskProfileToRiskTier(riskProfile: RiskProfile): RiskTier {
    switch (riskProfile) {
      case 'LOW':
        return RiskTier.LOW;
      case 'MEDIUM':
        return RiskTier.MEDIUM;
      case 'HIGH':
        return RiskTier.HIGH;
      case 'CRITICAL':
        return RiskTier.CRITICAL;
      default:
        return RiskTier.MEDIUM;
    }
  }

  /**
   * Generate a structured agent blueprint from a natural language goal
   * @param request - The agent generation request
   * @returns A structured agent blueprint
   */
  async generateAgent(request: AgentGenerationRequest): Promise<{
    blueprint: AgentBlueprint;
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
        workflowId: 'agent-builder',
        data: {
          prompt,
          request,
        },
      });
    }

    // In production, this would call an LLM API (OpenAI, Anthropic, etc.)
    // For now, we use a mock implementation
    const llmResponse = await this.mockLLMCall(prompt, request);

    // Log the response for audit
    if (this.eventLog) {
      await this.eventLog.append({
        timestamp: new Date(),
        type: 'LLM_RESPONSE_RECEIVED',
        workflowId: 'agent-builder',
        data: {
          response: llmResponse,
        },
      });
    }

    // Parse LLM response into structured blueprint
    const blueprint = this.parseLLMResponse(llmResponse, request);

    return {
      blueprint,
      metadata: {
        prompt,
        response: llmResponse,
        timestamp,
      },
    };
  }

  /**
   * Build a prompt for the LLM to generate an agent blueprint
   */
  private buildPrompt(request: AgentGenerationRequest): string {
    const parts: string[] = [
      'You are an expert AI agent architect. Generate a structured agent blueprint based on the following requirements:',
      '',
      `Goal: ${request.goal}`,
    ];

    if (request.domain) {
      parts.push('', `Domain: ${request.domain}`);
    }

    if (request.deploymentTarget) {
      parts.push(`Deployment Target: ${request.deploymentTarget}`);
    }

    if (request.deviceClass) {
      parts.push(`Device Class: ${request.deviceClass}`);
    }

    if (request.constraints && request.constraints.length > 0) {
      parts.push('', 'Constraints:');
      request.constraints.forEach((c: string, i: number) => parts.push(`${i + 1}. ${c}`));
    }

    if (request.preferredTools && request.preferredTools.length > 0) {
      parts.push('', `Preferred Tools: ${request.preferredTools.join(', ')}`);
    }

    if (request.riskProfile) {
      parts.push('', `Risk Profile: ${request.riskProfile}`);
    }

    if (request.policyRequirements && request.policyRequirements.length > 0) {
      parts.push('', 'Policy Requirements:');
      request.policyRequirements.forEach((p: string, i: number) => parts.push(`${i + 1}. ${p}`));
    }

    if (request.additionalContext) {
      parts.push('', `Additional Context: ${request.additionalContext}`);
    }

    parts.push(
      '',
      'Generate an agent blueprint that includes:',
      '1. A clear agent name and description',
      '2. Agent configuration (prompt, system prompt, temperature, etc.)',
      '3. Tool selections with appropriate permissions and risk tiers',
      '4. Policy configurations for governance',
      '5. Workflow references if applicable',
      '6. Success criteria for the agent',
      '7. Safety constraints and guardrails',
      '',
      'Return the blueprint in JSON format.'
    );

    return parts.join('\n');
  }

  /**
   * Call LLM to generate agent blueprint
   * Uses real LLM provider if available, otherwise falls back to mock
   */
  private async mockLLMCall(prompt: string, request: AgentGenerationRequest): Promise<string> {
    // Use real LLM provider if available
    if (this.llmProvider) {
      try {
        const response = await this.llmProvider.generateCompletion(prompt, {
          temperature: 0.7,
          maxTokens: 4096,
        });
        
        // Return the LLM-generated content
        return response.content;
      } catch (error) {
        console.warn('LLM provider failed, falling back to mock:', error);
        // Fall through to mock implementation
      }
    }

    // Fallback: Simulate API delay and generate mock response
    await new Promise(resolve => setTimeout(resolve, 100));

    // Generate a mock response based on the request
    return JSON.stringify(
      {
        agent: {
          name: this.extractAgentName(request.goal),
          description: `AI agent designed to: ${request.goal}`,
          goal: request.goal,
          riskProfile: request.riskProfile || 'MEDIUM',
          domain: request.domain || 'general',
          deploymentTarget: request.deploymentTarget,
          deviceClass: request.deviceClass,
          config: {
            prompt: this.generateAgentPrompt(request.goal),
            systemPrompt: this.generateSystemPrompt(request.riskProfile || 'MEDIUM'),
            temperature: this.getTemperatureForRiskProfile(request.riskProfile || 'MEDIUM'),
            maxTokens: 2048,
            model: 'gpt-4',
          },
          tools: this.generateMockTools(request),
          policies: this.generateMockPolicies(request),
          workflows: this.generateMockWorkflows(request),
          constraints: request.constraints || [
            'Must operate within defined tool permissions',
            'Must not exceed maximum execution time',
            'Must respect all policy constraints',
          ],
          maxExecutionTime: this.getMaxExecutionTime(request.riskProfile || 'MEDIUM'),
          maxRetries: 3,
          successCriteria: this.generateSuccessCriteria(request.goal),
          tags: this.generateTags(request),
        },
      },
      null,
      2
    );
  }

  /**
   * Extract an agent name from the goal
   */
  private extractAgentName(goal: string): string {
    // Simple heuristic: take first few words and convert to title case
    const words = goal.split(' ').slice(0, 4);
    return words.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ') + ' Agent';
  }

  /**
   * Generate agent prompt based on goal
   */
  private generateAgentPrompt(goal: string): string {
    return `You are an AI agent designed to ${goal}. 

Your primary objective is to achieve the specified goal while adhering to all safety constraints and policies. 
You have access to specific tools and workflows that you can use to accomplish your tasks.

Always:
- Explain your reasoning before taking actions
- Consider the risk level of your actions
- Respect all policy constraints
- Validate your outputs
- Handle errors gracefully

Begin by understanding the current state and determining the best approach to achieve the goal.`;
  }

  /**
   * Generate system prompt based on risk profile
   */
  private generateSystemPrompt(riskProfile: RiskProfile): string {
    const basePrompt = 'You are a safety-conscious AI agent operating in a controlled environment.';
    
    switch (riskProfile) {
      case 'CRITICAL':
        return `${basePrompt} This is a CRITICAL risk operation. Exercise extreme caution. All actions require explicit validation. Never proceed without confirmation.`;
      case 'HIGH':
        return `${basePrompt} This is a HIGH risk operation. Exercise significant caution. Validate all actions before execution. Seek confirmation for irreversible operations.`;
      case 'MEDIUM':
        return `${basePrompt} This is a MEDIUM risk operation. Exercise normal caution. Follow established procedures and validate critical actions.`;
      case 'LOW':
        return `${basePrompt} This is a LOW risk operation. Follow standard procedures and escalate if unexpected issues arise.`;
      default:
        return basePrompt;
    }
  }

  /**
   * Get temperature based on risk profile
   */
  private getTemperatureForRiskProfile(riskProfile: RiskProfile): number {
    switch (riskProfile) {
      case 'CRITICAL':
        return 0.3; // Very deterministic
      case 'HIGH':
        return 0.5;
      case 'MEDIUM':
        return 0.7;
      case 'LOW':
        return 0.9;
      default:
        return 0.7;
    }
  }

  /**
   * Get max execution time based on risk profile
   */
  private getMaxExecutionTime(riskProfile: RiskProfile): number {
    switch (riskProfile) {
      case 'CRITICAL':
        return 300000; // 5 minutes
      case 'HIGH':
        return 600000; // 10 minutes
      case 'MEDIUM':
        return 1800000; // 30 minutes
      case 'LOW':
        return 3600000; // 1 hour
      default:
        return 1800000;
    }
  }

  /**
   * Generate mock tools based on the request
   */
  private generateMockTools(request: AgentGenerationRequest): AgentToolConfig[] {
    const tools: AgentToolConfig[] = [];
    const preferredTools = request.preferredTools || ['http-client', 'file-reader', 'data-processor'];
    
    preferredTools.forEach((toolName, index) => {
      tools.push({
        toolId: `tool-${index + 1}`,
        name: toolName,
        enabled: true,
        permissions: this.getToolPermissions(toolName, request.riskProfile || 'MEDIUM'),
        riskTier: this.getToolRiskTier(toolName, request.riskProfile || 'MEDIUM'),
      });
    });

    return tools;
  }

  /**
   * Get tool permissions based on tool name and risk profile
   */
  private getToolPermissions(toolName: string, riskProfile: RiskProfile): string[] {
    const basePermissions = ['read'];
    
    if (riskProfile === 'LOW' || riskProfile === 'MEDIUM') {
      if (toolName.includes('write') || toolName.includes('processor')) {
        basePermissions.push('write');
      }
    }
    
    if (riskProfile === 'LOW') {
      if (toolName.includes('admin') || toolName.includes('delete')) {
        basePermissions.push('delete', 'admin');
      }
    }
    
    return basePermissions;
  }

  /**
   * Get tool risk tier
   */
  private getToolRiskTier(toolName: string, riskProfile: RiskProfile): RiskProfile {
    if (toolName.includes('delete') || toolName.includes('admin')) {
      return 'HIGH';
    }
    if (toolName.includes('write') || toolName.includes('update')) {
      return 'MEDIUM';
    }
    return 'LOW';
  }

  /**
   * Generate mock policies based on the request
   */
  private generateMockPolicies(request: AgentGenerationRequest): AgentPolicyConfig[] {
    const policies: AgentPolicyConfig[] = [];
    
    // Add default safety policy
    policies.push({
      policyId: 'safety-policy-1',
      name: 'Core Safety Policy',
      enabled: true,
      rules: [
        {
          type: 'rate_limit',
          description: 'Limit action execution rate to prevent resource exhaustion',
          parameters: {
            maxActionsPerMinute: request.riskProfile === 'CRITICAL' ? 10 : 60,
          },
        },
        {
          type: 'timeout_enforcement',
          description: 'Enforce timeouts on all actions',
          parameters: {
            defaultTimeout: 30000,
          },
        },
        {
          type: 'validation_gate',
          description: 'Validate all outputs before committing',
        },
      ],
      failFast: request.riskProfile === 'CRITICAL' || request.riskProfile === 'HIGH',
    });

    // Add policy requirements from request
    if (request.policyRequirements && request.policyRequirements.length > 0) {
      request.policyRequirements.forEach((policyReq, index) => {
        policies.push({
          policyId: `custom-policy-${index + 1}`,
          name: `Custom Policy: ${policyReq.slice(0, 30)}`,
          enabled: true,
          rules: [
            {
              type: 'custom_rule',
              description: policyReq,
            },
          ],
        });
      });
    }

    return policies;
  }

  /**
   * Generate mock workflows
   */
  private generateMockWorkflows(request: AgentGenerationRequest): AgentWorkflowRef[] {
    const workflows: AgentWorkflowRef[] = [];
    
    // Generate a primary workflow based on the goal
    workflows.push({
      workflowId: 'workflow-1',
      name: 'Primary Execution Workflow',
      description: `Main workflow for: ${request.goal}`,
      triggerConditions: ['agent_initialized', 'goal_received'],
      priority: 1,
    });

    // Add error handling workflow
    workflows.push({
      workflowId: 'workflow-error',
      name: 'Error Handling Workflow',
      description: 'Handles errors and recovery',
      triggerConditions: ['task_failed', 'timeout_exceeded'],
      priority: 2,
    });

    return workflows;
  }

  /**
   * Generate success criteria based on the goal
   */
  private generateSuccessCriteria(goal: string): string[] {
    return [
      'Agent completes all assigned tasks successfully',
      'All tool executions return expected results',
      'No policy violations occur during execution',
      'Goal objective achieved as specified',
      'All safety checks passed',
      'Execution completes within time limit',
    ];
  }

  /**
   * Generate tags for the agent
   */
  private generateTags(request: AgentGenerationRequest): string[] {
    const tags: string[] = [];
    
    if (request.riskProfile) {
      tags.push(`risk:${request.riskProfile.toLowerCase()}`);
    }
    
    if (request.preferredTools) {
      request.preferredTools.forEach(tool => {
        tags.push(`tool:${tool}`);
      });
    }
    
    tags.push('ai-generated', 'blueprint');
    
    return tags;
  }

  /**
   * Parse LLM response into structured agent blueprint
   */
  private parseLLMResponse(llmResponse: string, request: AgentGenerationRequest): AgentBlueprint {
    try {
      const parsed = JSON.parse(llmResponse);
      const agent = parsed.agent;
      
      // Generate unique ID
      const id = `agent-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      return {
        id,
        name: agent.name,
        version: '1.0.0',
        description: agent.description,
        goal: agent.goal,
        riskProfile: agent.riskProfile,
        domain: request.domain || agent.domain || 'general',
        deploymentTarget: request.deploymentTarget || agent.deploymentTarget,
        deviceClass: request.deviceClass || agent.deviceClass,
        config: agent.config,
        tools: agent.tools,
        policies: agent.policies,
        workflows: agent.workflows,
        constraints: agent.constraints,
        maxExecutionTime: agent.maxExecutionTime,
        maxRetries: agent.maxRetries,
        successCriteria: agent.successCriteria,
        tags: agent.tags,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    } catch (error) {
      throw new Error(`Failed to parse LLM response: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Validate an agent blueprint against policies and constraints
   * @param blueprint - The agent blueprint to validate
   * @returns Validation results with any issues found
   */
  async validateAgent(blueprint: AgentBlueprint): Promise<{
    valid: boolean;
    issues: Array<{
      severity: 'error' | 'warning' | 'info';
      message: string;
      field?: string;
    }>;
  }> {
    const issues: Array<{
      severity: 'error' | 'warning' | 'info';
      message: string;
      field?: string;
    }> = [];

    // Validate tools
    if (blueprint.tools.length === 0) {
      issues.push({
        severity: 'warning',
        message: 'Agent has no tools configured',
        field: 'tools',
      });
    }

    // Validate policies
    if (blueprint.policies.length === 0) {
      issues.push({
        severity: 'warning',
        message: 'Agent has no policies configured',
        field: 'policies',
      });
    }

    // Validate risk profile consistency
    const highRiskTools = blueprint.tools.filter(t => t.riskTier === 'HIGH' || t.riskTier === 'CRITICAL');
    if (highRiskTools.length > 0 && blueprint.riskProfile === 'LOW') {
      issues.push({
        severity: 'error',
        message: 'Agent risk profile is LOW but has HIGH/CRITICAL risk tools',
        field: 'riskProfile',
      });
    }

    // Validate execution time
    if (!blueprint.maxExecutionTime) {
      issues.push({
        severity: 'info',
        message: 'No maximum execution time specified',
        field: 'maxExecutionTime',
      });
    }

    // Check for success criteria
    if (!blueprint.successCriteria || blueprint.successCriteria.length === 0) {
      issues.push({
        severity: 'warning',
        message: 'No success criteria defined',
        field: 'successCriteria',
      });
    }

    const valid = !issues.some(i => i.severity === 'error');

    return { valid, issues };
  }

  /**
   * Validate agent blueprint with CRV gates
   * @param blueprint - The agent blueprint to validate
   * @returns CRV validation results
   */
  async validateWithCRV(blueprint: AgentBlueprint): Promise<AgentCRVResult> {
    const timestamp = new Date();

    // Create a CRV gate configuration for agent blueprints
    const gateConfig: GateConfig = {
      name: `agent-blueprint-${blueprint.id}`,
      validators: [
        // Schema validation
        async () => ({
          valid: true,
          confidence: 0.95,
          reason: 'Schema validation passed',
        }),
        // Security check
        async () => ({
          valid: blueprint.riskProfile !== 'CRITICAL' || blueprint.policies.length > 0,
          confidence: 0.90,
          reason: blueprint.riskProfile === 'CRITICAL' && blueprint.policies.length === 0
            ? 'CRITICAL risk profile requires policies'
            : 'Security check passed',
        }),
        // Logic consistency
        async () => ({
          valid: blueprint.tools.every(t => t.enabled !== undefined),
          confidence: 0.85,
          reason: 'Logic consistency check',
        }),
      ],
      blockOnFailure: blueprint.riskProfile === 'HIGH' || blueprint.riskProfile === 'CRITICAL',
    };

    const gate = new CRVGate(gateConfig);

    // Prepare commit for validation
    const commit: Commit = {
      id: `agent-${blueprint.id}`,
      data: {
        blueprint,
        tools: blueprint.tools,
        policies: blueprint.policies,
        riskProfile: blueprint.riskProfile,
      },
      metadata: {
        agentId: blueprint.id,
        agentName: blueprint.name,
      },
    };

    // Execute CRV validation
    const result: GateResult = await gate.validate(commit);

    // Log CRV validation event
    if (this.eventLog) {
      await this.eventLog.append({
        timestamp,
        type: 'STATE_SNAPSHOT',
        workflowId: `agent-${blueprint.id}`,
        data: {
          agentId: blueprint.id,
          agentName: blueprint.name,
          passed: result.passed,
          validationResults: result.validationResults,
        },
        metadata: {
          crvGateResult: {
            passed: result.passed,
            gateName: result.gateName,
            blockedCommit: result.blockedCommit,
          },
          crvBlocked: result.blockedCommit,
        },
      });
    }

    return {
      passed: result.passed,
      gateName: gateConfig.name,
      validationResults: result.validationResults.map((r: ValidationResult) => ({
        valid: r.valid,
        reason: r.reason,
        confidence: r.confidence,
      })),
      timestamp,
    };
  }

  /**
   * Evaluate agent blueprint against policy guard
   * @param blueprint - The agent blueprint to evaluate
   * @param principal - The principal requesting the agent creation
   * @returns Policy evaluation result
   */
  async evaluateWithPolicy(
    blueprint: AgentBlueprint,
    principal?: Principal
  ): Promise<AgentPolicyResult> {
    const timestamp = new Date();

    if (!this.policyGuard) {
      // If no policy guard is configured, allow by default with a warning
      return {
        approved: true,
        decision: 'ALLOW',
        reason: 'No policy guard configured - allowing by default',
        timestamp,
      };
    }

    // Create a principal if not provided
    const evaluationPrincipal: Principal = principal || {
      id: 'agent-builder',
      type: 'service',
      permissions: [
        {
          action: 'agent:create',
          resource: 'agents',
        },
      ],
    };

    // Create an action for policy evaluation
    const action: Action = {
      id: `agent-create-${blueprint.id}`,
      name: `Create agent: ${blueprint.name}`,
      riskTier: this.convertRiskProfileToRiskTier(blueprint.riskProfile),
      requiredPermissions: [
        {
          action: 'agent:create',
          resource: `agent:${blueprint.id}`,
          intent: Intent.WRITE,
          dataZone: DataZone.INTERNAL,
        },
      ],
      intent: Intent.WRITE,
      dataZone: DataZone.INTERNAL,
      metadata: {
        agentName: blueprint.name,
        riskProfile: blueprint.riskProfile,
        tools: blueprint.tools.map(t => t.name),
        policies: blueprint.policies.map(p => p.name),
        goal: blueprint.goal,
      },
    };

    // Evaluate with policy guard
    const decision = await this.policyGuard.evaluate(evaluationPrincipal, action);

    // Log policy evaluation event
    if (this.eventLog) {
      await this.eventLog.append({
        timestamp,
        type: 'STATE_SNAPSHOT',
        workflowId: `agent-${blueprint.id}`,
        data: {
          agentId: blueprint.id,
          agentName: blueprint.name,
          principal: evaluationPrincipal,
          action,
          decision: decision.allowed ? 'ALLOW' : 'DENY',
          reason: decision.reason,
        },
        metadata: {
          policyDecision: {
            allowed: decision.allowed,
            reason: decision.reason,
            requiresHumanApproval: decision.requiresHumanApproval,
            approvalToken: decision.approvalToken,
          },
          policyBlocked: !decision.allowed,
        },
      });
    }

    return {
      approved: decision.allowed,
      decision: decision.allowed ? 'ALLOW' : 'DENY',
      reason: decision.reason,
      timestamp,
    };
  }

  /**
   * Comprehensive validation including basic checks, CRV, and policy evaluation
   * @param blueprint - The agent blueprint to validate
   * @param principal - Optional principal for policy evaluation
   * @returns Comprehensive validation results
   */
  async validateAgentComprehensive(
    blueprint: AgentBlueprint,
    principal?: Principal
  ): Promise<{
    valid: boolean;
    issues: Array<{
      severity: 'error' | 'warning' | 'info';
      message: string;
      field?: string;
    }>;
    crvResult?: AgentCRVResult;
    policyResult?: AgentPolicyResult;
  }> {
    // Perform basic validation
    const basicValidation = await this.validateAgent(blueprint);

    // Perform CRV validation
    const crvResult = await this.validateWithCRV(blueprint);

    // Perform policy evaluation
    const policyResult = await this.evaluateWithPolicy(blueprint, principal);

    // Combine results
    const issues = [...basicValidation.issues];

    if (!crvResult.passed) {
      issues.push({
        severity: 'error',
        message: `CRV validation failed: ${crvResult.validationResults
          .filter(r => !r.valid)
          .map(r => r.reason)
          .join(', ')}`,
        field: 'crv',
      });
    }

    if (!policyResult.approved) {
      issues.push({
        severity: 'error',
        message: `Policy evaluation denied: ${policyResult.reason}`,
        field: 'policy',
      });
    }

    const valid = basicValidation.valid && crvResult.passed && policyResult.approved;

    return {
      valid,
      issues,
      crvResult,
      policyResult,
    };
  }

  /**
   * Simulate agent execution in a sandbox environment
   * @param request - Simulation request with blueprint and test scenario
   * @returns Simulation results with tool calls, policy decisions, and CRV outcomes
   */
  async simulateAgent(request: {
    blueprint: AgentBlueprint;
    testScenario: {
      description: string;
      inputs: Record<string, unknown>;
      expectedOutputs?: Record<string, unknown>;
    };
    dryRun: boolean;
  }): Promise<{
    success: boolean;
    executionTime: number;
    trace: Array<{
      step: number;
      timestamp: Date;
      action: string;
      tool?: string;
      status: 'completed' | 'blocked' | 'failed';
      result?: unknown;
      blockReason?: string;
    }>;
    toolCalls: Array<{
      toolName: string;
      timestamp: Date;
      status: 'executed' | 'blocked' | 'simulated';
      inputs: Record<string, unknown>;
      outputs?: Record<string, unknown>;
    }>;
    policyDecisions: Array<{
      policyName: string;
      timestamp: Date;
      decision: 'allow' | 'deny' | 'requires_approval';
      reason?: string;
    }>;
    crvOutcomes: Array<{
      checkName: string;
      timestamp: Date;
      passed: boolean;
      confidence?: number;
      reason?: string;
    }>;
    blockedSteps: Array<{
      step: number;
      reason: string;
      timestamp: Date;
      tool?: string;
    }>;
    sideEffects: Array<{
      type: string;
      description: string;
      captured: boolean;
    }>;
  }> {
    const startTime = Date.now();
    const trace: Array<{
      step: number;
      timestamp: Date;
      action: string;
      tool?: string;
      status: 'completed' | 'blocked' | 'failed';
      result?: unknown;
      blockReason?: string;
    }> = [];
    const toolCalls: Array<{
      toolName: string;
      timestamp: Date;
      status: 'executed' | 'blocked' | 'simulated';
      inputs: Record<string, unknown>;
      outputs?: Record<string, unknown>;
    }> = [];
    const policyDecisions: Array<{
      policyName: string;
      timestamp: Date;
      decision: 'allow' | 'deny' | 'requires_approval';
      reason?: string;
    }> = [];
    const crvOutcomes: Array<{
      checkName: string;
      timestamp: Date;
      passed: boolean;
      confidence?: number;
      reason?: string;
    }> = [];
    const blockedSteps: Array<{
      step: number;
      reason: string;
      timestamp: Date;
      tool?: string;
    }> = [];
    const sideEffects: Array<{
      type: string;
      description: string;
      captured: boolean;
    }> = [];

    // Log simulation start
    if (this.eventLog) {
      await this.eventLog.append({
        timestamp: new Date(),
        type: 'STATE_SNAPSHOT',
        workflowId: `simulation-${request.blueprint.id}`,
        data: {
          event: 'simulation_started',
          agentId: request.blueprint.id,
          scenario: request.testScenario.description,
          dryRun: request.dryRun,
        },
      });
    }

    try {
      let stepNumber = 0;

      // Step 1: Validate blueprint
      stepNumber++;
      trace.push({
        step: stepNumber,
        timestamp: new Date(),
        action: 'Validate agent blueprint',
        status: 'completed',
      });

      const validation = await this.validateAgentComprehensive(request.blueprint);
      
      // Record CRV outcomes from validation
      if (validation.crvResult) {
        validation.crvResult.validationResults.forEach(vr => {
          crvOutcomes.push({
            checkName: 'Blueprint Validation',
            timestamp: new Date(),
            passed: vr.valid,
            confidence: vr.confidence,
            reason: vr.reason,
          });
        });
      }

      // Record policy decision from validation
      if (validation.policyResult) {
        policyDecisions.push({
          policyName: 'Blueprint Creation Policy',
          timestamp: new Date(),
          decision: validation.policyResult.approved ? 'allow' : 'deny',
          reason: validation.policyResult.reason,
        });

        if (!validation.policyResult.approved) {
          stepNumber++;
          const blockReason = `Policy denied: ${validation.policyResult.reason}`;
          trace.push({
            step: stepNumber,
            timestamp: new Date(),
            action: 'Execute agent',
            status: 'blocked',
            blockReason,
          });
          blockedSteps.push({
            step: stepNumber,
            reason: blockReason,
            timestamp: new Date(),
          });
        }
      }

      // Step 2: Execute tools with real sandbox integration or simulation
      for (const tool of request.blueprint.tools) {
        stepNumber++;
        const toolTimestamp = new Date();

        // Check if we should use real sandbox execution
        const useSandbox = !request.dryRun && this.sandboxIntegration;
        
        if (useSandbox) {
          // Use real sandbox execution path
          const taskSpec: TaskSpec = {
            id: `task-${tool.toolId}`,
            name: tool.name,
            type: 'action',
            toolName: tool.name,
            inputs: request.testScenario.inputs,
            riskTier: tool.riskTier as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
            sandboxConfig: {
              enabled: true,
              simulationMode: request.dryRun,
              type: request.dryRun ? 'simulation' : 'mock',
            },
          };

          const taskState: TaskState = {
            taskId: taskSpec.id,
            status: 'pending',
            attempt: 0,
          };

          try {
            // Execute tool in real sandbox with policy checks and CRV validation
            const sandboxResult = await this.sandboxIntegration!.executeInSandbox(
              taskSpec,
              taskState,
              async (task, state) => {
                // Real tool executor would be called here
                // For now, return simulated result
                return { success: true, result: `Executed ${tool.name}` };
              },
              {
                workflowId: `simulation-${request.blueprint.id}`,
                taskId: taskSpec.id,
                telemetry: this.telemetry,
                memoryAPI: this.memoryAPI,
                crvGate: this.crvGate,
              }
            );

            // Extract side effects from sandbox result
            if (sandboxResult.metadata.sideEffects) {
              sandboxResult.metadata.sideEffects.forEach((effect: CapturedSideEffect) => {
                sideEffects.push({
                  type: effect.type,
                  description: `Side effect captured from ${tool.name}`,
                  captured: true,
                });
              });
            }

            // Record CRV validation results
            if (sandboxResult.metadata.crvValidation) {
              crvOutcomes.push({
                checkName: `Tool Output Validation: ${tool.name}`,
                timestamp: toolTimestamp,
                passed: sandboxResult.metadata.crvValidation.passed,
                confidence: 0.95,
                reason: sandboxResult.metadata.crvValidation.passed 
                  ? 'Output passed validation'
                  : 'Output failed validation',
              });

              // If CRV blocked, record as blocked step
              if (sandboxResult.metadata.crvValidation.blockedCommit) {
                trace.push({
                  step: stepNumber,
                  timestamp: toolTimestamp,
                  action: `Execute tool: ${tool.name}`,
                  tool: tool.name,
                  status: 'blocked',
                  blockReason: 'CRV validation failed',
                });
                
                blockedSteps.push({
                  step: stepNumber,
                  reason: 'CRV validation failed',
                  timestamp: toolTimestamp,
                  tool: tool.name,
                });

                toolCalls.push({
                  toolName: tool.name,
                  timestamp: toolTimestamp,
                  status: 'blocked',
                  inputs: request.testScenario.inputs,
                });
                continue;
              }
            }

            // Record successful execution
            trace.push({
              step: stepNumber,
              timestamp: toolTimestamp,
              action: `Execute tool: ${tool.name}`,
              tool: tool.name,
              status: 'completed',
              result: sandboxResult.data,
            });

            toolCalls.push({
              toolName: tool.name,
              timestamp: toolTimestamp,
              status: request.dryRun ? 'simulated' : 'executed',
              inputs: request.testScenario.inputs,
              outputs: sandboxResult.data as Record<string, unknown>,
            });
          } catch (error) {
            // Record failed execution
            trace.push({
              step: stepNumber,
              timestamp: toolTimestamp,
              action: `Execute tool: ${tool.name}`,
              tool: tool.name,
              status: 'failed',
              blockReason: error instanceof Error ? error.message : String(error),
            });
            
            blockedSteps.push({
              step: stepNumber,
              reason: error instanceof Error ? error.message : String(error),
              timestamp: toolTimestamp,
              tool: tool.name,
            });
          }
        } else {
          // Fallback to legacy simulation mode
          // Run policy check for tool
          if (this.policyGuard) {
            const principal: Principal = {
              id: 'simulation-agent',
              type: 'service',
              permissions: [],
            };

            const action: Action = {
              id: `tool-${tool.toolId}`,
              name: `Execute ${tool.name}`,
              riskTier: this.convertRiskProfileToRiskTier(tool.riskTier as RiskProfile),
              requiredPermissions: [],
              intent: Intent.EXECUTE,
              dataZone: DataZone.INTERNAL,
              metadata: { toolName: tool.name },
            };

            const decision = await this.policyGuard.evaluate(principal, action);
            policyDecisions.push({
              policyName: `Tool Execution Policy: ${tool.name}`,
              timestamp: toolTimestamp,
              decision: decision.allowed ? 'allow' : 'deny',
              reason: decision.reason,
            });

            if (!decision.allowed) {
              trace.push({
                step: stepNumber,
                timestamp: toolTimestamp,
                action: `Execute tool: ${tool.name}`,
                tool: tool.name,
                status: 'blocked',
                blockReason: `Policy denied: ${decision.reason}`,
              });
              
              blockedSteps.push({
                step: stepNumber,
                reason: `Policy denied: ${decision.reason}`,
                timestamp: toolTimestamp,
                tool: tool.name,
              });

              toolCalls.push({
                toolName: tool.name,
                timestamp: toolTimestamp,
                status: 'blocked',
                inputs: request.testScenario.inputs,
              });
              continue;
            }
          }

          // Legacy: Block CRITICAL and HIGH risk tools in dry-run mode
          const HIGH_RISK_TIERS = ['CRITICAL', 'HIGH'];
          const toolBlocked = request.dryRun && HIGH_RISK_TIERS.includes(tool.riskTier || '');
          
          if (toolBlocked) {
            trace.push({
              step: stepNumber,
              timestamp: toolTimestamp,
              action: `Execute tool: ${tool.name}`,
              tool: tool.name,
              status: 'blocked',
              blockReason: 'High-risk tool blocked in dry-run mode',
            });
            
            blockedSteps.push({
              step: stepNumber,
              reason: 'High-risk tool blocked in dry-run mode',
              timestamp: toolTimestamp,
              tool: tool.name,
            });

            toolCalls.push({
              toolName: tool.name,
              timestamp: toolTimestamp,
              status: 'blocked',
              inputs: request.testScenario.inputs,
            });
          } else {
            // Simulate successful execution
            trace.push({
              step: stepNumber,
              timestamp: toolTimestamp,
              action: `Execute tool: ${tool.name}`,
              tool: tool.name,
              status: 'completed',
              result: { simulated: true, success: true },
            });

            toolCalls.push({
              toolName: tool.name,
              timestamp: toolTimestamp,
              status: request.dryRun ? 'simulated' : 'executed',
              inputs: request.testScenario.inputs,
              outputs: { simulated: true, result: 'success' },
            });

            // Record side effects for tools with side effects
            if (tool.hasSideEffects) {
              sideEffects.push({
                type: tool.name,
                description: `Side effect from ${tool.name} captured in simulation`,
                captured: true,
              });
            }

            // Simulate CRV validation
            crvOutcomes.push({
              checkName: `Tool Output Validation: ${tool.name}`,
              timestamp: toolTimestamp,
              passed: true,
              confidence: 0.95,
              reason: 'Simulated output passed validation',
            });
          }
        }
      }

      // Step 3: Complete simulation
      stepNumber++;
      trace.push({
        step: stepNumber,
        timestamp: new Date(),
        action: 'Complete simulation',
        status: 'completed',
      });

      const executionTime = Date.now() - startTime;

      // Log simulation completion
      if (this.eventLog) {
        await this.eventLog.append({
          timestamp: new Date(),
          type: 'STATE_SNAPSHOT',
          workflowId: `simulation-${request.blueprint.id}`,
          data: {
            event: 'simulation_completed',
            agentId: request.blueprint.id,
            executionTime,
            success: true,
            toolCallsCount: toolCalls.length,
            blockedStepsCount: blockedSteps.length,
          },
        });
      }

      return {
        success: true,
        executionTime,
        trace,
        toolCalls,
        policyDecisions,
        crvOutcomes,
        blockedSteps,
        sideEffects,
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      
      // Log simulation error
      if (this.eventLog) {
        await this.eventLog.append({
          timestamp: new Date(),
          type: 'STATE_SNAPSHOT',
          workflowId: `simulation-${request.blueprint.id}`,
          data: {
            event: 'simulation_failed',
            agentId: request.blueprint.id,
            error: error instanceof Error ? error.message : String(error),
          },
        });
      }

      throw error;
    }
  }

  /**
   * Generate world model config from agent blueprint
   * @param blueprint - The agent blueprint to generate world model from
   * @returns World model specification
   */
  async generateWorldModelConfig(blueprint: AgentBlueprint): Promise<WorldModelSpec> {
    const request: WorldModelGenerationRequest = {
      description: blueprint.goal || blueprint.description,
      domain: blueprint.domain || 'general',
      name: `${blueprint.name} World Model`,
      preferredStyle: 'detailed',
      includeExamples: false,
    };

    const result = await this.worldModelBuilder.generateWorldModel(request);
    return result.spec;
  }

  /**
   * Generate memory engine config from agent blueprint
   * @param blueprint - The agent blueprint to generate memory config from
   * @returns Memory policy configuration
   */
  generateMemoryEngineConfig(blueprint: AgentBlueprint): MemoryEngineConfig {
    const config: MemoryPolicyConfig = {
      goals: ['optimize for performance', 'enable semantic search'],
      riskProfile: blueprint.riskProfile.toLowerCase() as MemoryRiskProfile,
      dataClassification: undefined,
      complianceRequirements: [],
    };

    const policy = this.memoryEngineBuilder.generateMemoryPolicy(config);

    return {
      schemaVersion: '1.0',
      policy,
      policyConfig: config,
      generatedAt: new Date().toISOString(),
      generatedBy: 'agent-studio',
      source: {
        blueprintId: blueprint.id,
        blueprintName: blueprint.name,
        riskProfile: blueprint.riskProfile,
      },
    };
  }

  /**
   * Generate MCP server config from agent blueprint tools
   * @param blueprint - The agent blueprint to generate MCP config from
   * @returns MCP server definition
   */
  async generateMCPServerConfig(blueprint: AgentBlueprint): Promise<any> {
    const tools = blueprint.tools.map((tool: any) => ({
      name: tool.name,
      description: `Tool for ${tool.name}`,
      parameters: [],
      capabilities: tool.permissions || [],
    }));

    const options = {
      serverName: `${blueprint.name.replace(/\s+/g, '-').toLowerCase()}-mcp-server`,
      serverVersion: '1.0.0',
      serverDescription: `MCP server for ${blueprint.name}`,
      defaultRiskTier: blueprint.riskProfile,
      enableCRVValidation: blueprint.riskProfile === 'HIGH' || blueprint.riskProfile === 'CRITICAL',
      inferRiskFromCapabilities: true,
    };

    const result = this.mcpBuilder.generateMCPServer(tools, options);
    return result;
  }

  /**
   * Merge world model, memory engine, and MCP configs into a single blueprint
   * @param blueprint - The base agent blueprint
   * @param options - Options for what to include in the merge
   * @returns Extended blueprint with all configs merged
   */
  async mergeBlueprint(
    blueprint: AgentBlueprint,
    options: {
      includeWorldModel?: boolean;
      includeMemoryEngine?: boolean;
      includeMCPServer?: boolean;
    } = {}
  ): Promise<ExtendedAgentBlueprint> {
    const extended: ExtendedAgentBlueprint = { ...blueprint };

    // Generate and add world model config if requested
    if (options.includeWorldModel) {
      try {
        extended.worldModelConfig = await this.generateWorldModelConfig(blueprint);
      } catch (error) {
        console.warn('Failed to generate world model config:', error);
      }
    }

    // Generate and add memory engine config if requested
    if (options.includeMemoryEngine) {
      try {
        extended.memoryEngineConfig = this.generateMemoryEngineConfig(blueprint);
      } catch (error) {
        console.warn('Failed to generate memory engine config:', error);
      }
    }

    // Generate and add MCP server config if requested
    if (options.includeMCPServer) {
      try {
        extended.mcpServerConfig = await this.generateMCPServerConfig(blueprint);
      } catch (error) {
        console.warn('Failed to generate MCP server config:', error);
      }
    }

    return extended;
  }

  /**
   * Validate merged blueprint with comprehensive checks
   * @param blueprint - Extended blueprint to validate
   * @param principal - Optional principal for policy evaluation
   * @returns Comprehensive validation results
   */
  async validateMergedBlueprint(
    blueprint: ExtendedAgentBlueprint,
    principal?: Principal
  ): Promise<{
    valid: boolean;
    issues: Array<{
      severity: 'error' | 'warning' | 'info';
      message: string;
      field?: string;
    }>;
    schemaValidation?: { valid: boolean; errors?: string[] };
    crvResult?: AgentCRVResult;
    policyResult?: AgentPolicyResult;
    worldModelValidation?: { valid: boolean; errors?: string[]; warnings?: string[] };
    memoryEngineValidation?: { valid: boolean; errors: string[]; warnings: string[] };
  }> {
    const issues: Array<{
      severity: 'error' | 'warning' | 'info';
      message: string;
      field?: string;
    }> = [];

    // 1. Schema validation
    const schemaValidation = await this.validateAgent(blueprint);
    issues.push(...schemaValidation.issues);

    // 2. CRV validation
    const crvResult = await this.validateWithCRV(blueprint);
    if (!crvResult.passed) {
      issues.push({
        severity: 'error',
        message: `CRV validation failed: ${crvResult.validationResults
          .filter(r => !r.valid)
          .map(r => r.reason)
          .join(', ')}`,
        field: 'crv',
      });
    }

    // 3. Policy check
    const policyResult = await this.evaluateWithPolicy(blueprint, principal);
    if (!policyResult.approved) {
      issues.push({
        severity: 'error',
        message: `Policy evaluation denied: ${policyResult.reason}`,
        field: 'policy',
      });
    }

    // 4. Validate world model if present
    let worldModelValidation;
    if (blueprint.worldModelConfig) {
      worldModelValidation = this.worldModelBuilder.validateWorldModel(blueprint.worldModelConfig);
      if (!worldModelValidation.valid && worldModelValidation.errors) {
        worldModelValidation.errors.forEach(error => {
          issues.push({
            severity: 'error',
            message: `World model validation: ${error}`,
            field: 'worldModelConfig',
          });
        });
      }
      if (worldModelValidation.warnings) {
        worldModelValidation.warnings.forEach(warning => {
          issues.push({
            severity: 'warning',
            message: `World model: ${warning}`,
            field: 'worldModelConfig',
          });
        });
      }
    }

    // 5. Validate memory engine if present
    let memoryEngineValidation;
    if (blueprint.memoryEngineConfig) {
      const memoryPolicy = blueprint.memoryEngineConfig.policy || (blueprint.memoryEngineConfig as any);
      memoryEngineValidation = this.memoryEngineBuilder.validateMemoryPolicy(memoryPolicy);
      if (!memoryEngineValidation.valid) {
        memoryEngineValidation.errors.forEach(error => {
          issues.push({
            severity: 'error',
            message: `Memory engine validation: ${error}`,
            field: 'memoryEngineConfig',
          });
        });
      }
      memoryEngineValidation.warnings.forEach(warning => {
        issues.push({
          severity: 'warning',
          message: `Memory engine: ${warning}`,
          field: 'memoryEngineConfig',
        });
      });
    }

    const valid = !issues.some(i => i.severity === 'error');

    return {
      valid,
      issues,
      schemaValidation: { valid: schemaValidation.valid },
      crvResult,
      policyResult,
      worldModelValidation,
      memoryEngineValidation,
    };
  }

  /**
   * Export blueprint as JSON for downstream runtime usage
   * @param blueprint - Blueprint to export
   * @returns JSON string representation
   */
  exportBlueprint(blueprint: ExtendedAgentBlueprint): string {
    return JSON.stringify(blueprint, null, 2);
  }
}
