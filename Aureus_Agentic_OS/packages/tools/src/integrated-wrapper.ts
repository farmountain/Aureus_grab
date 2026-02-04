import { SafeToolWrapper, ToolSpec, ToolExecutionContext, ToolResult } from './index';
import { GoalGuardFSM, Action, Principal, RiskTier, EffortEvaluator, EffortEvaluationContext } from '@aureus/policy';
import { CRVGate, Commit, GateConfig } from '@aureus/crv';
import { WorldState } from '@aureus/world-model';

/**
 * Extended execution context with policy and CRV
 */
export interface IntegratedToolContext extends ToolExecutionContext {
  principal?: Principal;
  action?: Action;
  policyGuard?: GoalGuardFSM;
  crvGate?: CRVGate;
  effortEvaluator?: EffortEvaluator;
  worldState?: WorldState;
}

/**
 * IntegratedToolWrapper provides complete safety through effort evaluation + policy + CRV + idempotency
 * Ensures all tools pass through:
 * 0. Effort evaluation (cost/risk/value analysis)
 * 1. Policy validation (Goal-Guard FSM)
 * 2. CRV validation gates (pre and post execution)
 * 3. Tool execution with idempotency and schema validation (via SafeToolWrapper)
 */
export class IntegratedToolWrapper {
  private safeWrapper: SafeToolWrapper;
  private tool: ToolSpec;
  
  constructor(tool: ToolSpec, timeoutMs?: number) {
    this.tool = tool;
    this.safeWrapper = new SafeToolWrapper(tool, timeoutMs);
  }
  
  /**
   * Execute tool with full effort evaluation + policy + CRV + safety checks
   */
  async execute(
    params: Record<string, unknown>,
    context?: IntegratedToolContext
  ): Promise<ToolResult> {
    let effortEvaluation;

    // Step 0: Effort evaluation (cost/risk/value analysis) - before policy validation
    if (context?.effortEvaluator && context?.principal && context?.action) {
      const effortContext: EffortEvaluationContext = {
        principal: context.principal,
        action: context.action,
        toolName: this.tool.name,
        params,
        worldState: context.worldState,
        workflowId: context.workflowId,
        taskId: context.taskId,
      };

      effortEvaluation = await context.effortEvaluator.evaluate(effortContext);

      // Check if effort evaluation recommends rejection
      if (effortEvaluation.recommendation === 'reject') {
        return {
          success: false,
          error: `Effort evaluation rejected: ${effortEvaluation.reason}`,
          metadata: {
            effortEvaluation,
            phase: 'effort-evaluation',
          },
        };
      }

      // If review is recommended, it will be included in the final result metadata
    }

    // Step 1: Policy validation (Goal-Guard FSM)
    if (context?.policyGuard && context?.principal && context?.action) {
      const decision = await context.policyGuard.evaluate(
        context.principal,
        context.action,
        this.tool.name,
        context.workflowId,
        context.taskId
      );
      
      if (!decision.allowed) {
        return {
          success: false,
          error: `Policy violation: ${decision.reason}`,
          metadata: {
            requiresHumanApproval: decision.requiresHumanApproval,
            approvalToken: decision.approvalToken,
            policyDecision: decision,
            ...(effortEvaluation && { effortEvaluation }),
          },
        };
      }
      
      // If requires human approval but was approved, continue
      if (decision.requiresHumanApproval && !decision.approvalToken) {
        return {
          success: false,
          error: 'Action requires human approval',
          metadata: {
            requiresHumanApproval: true,
            policyDecision: decision,
            ...(effortEvaluation && { effortEvaluation }),
          },
        };
      }
    }
    
    // Step 2: Pre-execution CRV validation (validate inputs)
    if (context?.crvGate) {
      const inputCommit: Commit = {
        id: `${context.taskId}-${context.stepId}-input`,
        data: params,
        metadata: {
          toolId: this.tool.id,
          toolName: this.tool.name,
          phase: 'pre-execution',
        },
      };
      
      const inputValidation = await context.crvGate.validate(inputCommit);
      
      if (inputValidation.blockedCommit) {
        return {
          success: false,
          error: `CRV input validation failed: ${inputValidation.validationResults
            .filter(r => !r.valid)
            .map(r => r.reason)
            .join(', ')}`,
          metadata: {
            crvStatus: inputValidation.crv_status,
            validationResults: inputValidation.validationResults,
            failureCode: inputValidation.failure_code,
            remediation: inputValidation.remediation,
            ...(effortEvaluation && { effortEvaluation }),
          },
        };
      }
    }
    
    // Step 3: Execute with SafeToolWrapper (includes idempotency + schema validation)
    const result = await this.safeWrapper.execute(params, context);
    
    // Step 4: Post-execution CRV validation (validate outputs)
    if (context?.crvGate && result.success) {
      const outputCommit: Commit = {
        id: `${context.taskId}-${context.stepId}-output`,
        data: result.data,
        previousState: params,
        metadata: {
          toolId: this.tool.id,
          toolName: this.tool.name,
          phase: 'post-execution',
        },
      };
      
      const outputValidation = await context.crvGate.validate(outputCommit);
      
      if (outputValidation.blockedCommit) {
        return {
          success: false,
          error: `CRV output validation failed: ${outputValidation.validationResults
            .filter(r => !r.valid)
            .map(r => r.reason)
            .join(', ')}`,
          data: result.data, // Include data even though validation failed
          metadata: {
            ...result.metadata,
            crvStatus: outputValidation.crv_status,
            validationResults: outputValidation.validationResults,
            failureCode: outputValidation.failure_code,
            remediation: outputValidation.remediation,
            ...(effortEvaluation && { effortEvaluation }),
          },
        };
      }
      
      // Add CRV validation metadata to successful result
      result.metadata = {
        ...result.metadata,
        crvStatus: outputValidation.crv_status,
        crvPassed: true,
      };
    }
    
    // Add effort evaluation to metadata if it was performed
    if (effortEvaluation) {
      result.metadata = {
        ...result.metadata,
        effortEvaluation,
      };
    }
    
    return result;
  }
  
  /**
   * Get the underlying tool specification
   */
  getToolSpec(): ToolSpec {
    return this.tool;
  }
  
  /**
   * Get the tool ID
   */
  getToolId(): string {
    return this.tool.id;
  }
}

/**
 * Helper to create a default action for a tool based on its properties
 */
export function createActionForTool(tool: ToolSpec, options?: {
  riskTier?: RiskTier;
  allowedTools?: string[];
}): Action {
  // Determine risk tier based on tool properties
  let riskTier = options?.riskTier;
  
  if (!riskTier) {
    const hasSideEffects = tool.sideEffect ?? tool.hasSideEffects ?? true;
    if (!hasSideEffects) {
      riskTier = RiskTier.LOW;
    } else if (tool.compensation?.supported) {
      riskTier = RiskTier.MEDIUM; // Has compensation, medium risk
    } else {
      riskTier = RiskTier.HIGH; // Has side effects, no compensation
    }
  }
  
  return {
    id: tool.id,
    name: tool.name,
    riskTier,
    requiredPermissions: [
      {
        action: tool.sideEffect ? 'write' : 'read',
        resource: 'tool',
      },
    ],
    allowedTools: options?.allowedTools || [tool.name],
    metadata: {
      toolId: tool.id,
      description: tool.description,
    },
  };
}

/**
 * Helper to create a default CRV gate config for tool validation
 */
export function createCRVConfigForTool(tool: ToolSpec, gateConfig?: Partial<GateConfig>): GateConfig {
  return {
    name: `${tool.name} CRV Gate`,
    validators: gateConfig?.validators || [],
    blockOnFailure: gateConfig?.blockOnFailure ?? true,
    requiredConfidence: gateConfig?.requiredConfidence,
    recoveryStrategy: gateConfig?.recoveryStrategy,
  };
}
