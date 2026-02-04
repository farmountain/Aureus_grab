import { FailureTaxonomy } from '@aureus/crv';
import { RiskTier } from '@aureus/policy';
import { Postmortem, ProposedFix, FixType } from './types';

/**
 * FailureAnalyzer generates structured postmortems from failures
 */
export class FailureAnalyzer {
  /**
   * Analyze a failure and generate a postmortem with proposed fix
   */
  async analyzeFailure(
    workflowId: string,
    taskId: string,
    error: Error,
    contextData?: Record<string, unknown>
  ): Promise<Postmortem> {
    // Classify the failure
    const failureTaxonomy = this.classifyFailure(error, contextData);
    
    // Determine root cause
    const rootCause = this.determineRootCause(error, failureTaxonomy, contextData);
    
    // Generate proposed fix
    const proposedFix = await this.generateProposedFix(
      failureTaxonomy,
      rootCause,
      contextData
    );
    
    // Calculate confidence in the analysis
    const confidence = this.calculateConfidence(failureTaxonomy, contextData);
    
    const postmortem: Postmortem = {
      id: `postmortem-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      workflowId,
      taskId,
      failureTaxonomy,
      rootCause,
      stackTrace: error.stack,
      contextData,
      proposedFix,
      generatedBy: 'reflexion-engine',
      confidence,
    };
    
    return postmortem;
  }
  
  /**
   * Classify the failure into a taxonomy category
   */
  private classifyFailure(
    error: Error,
    contextData?: Record<string, unknown>
  ): FailureTaxonomy {
    const errorMessage = error.message.toLowerCase();
    
    // Check for missing data
    if (errorMessage.includes('undefined') || 
        errorMessage.includes('null') ||
        errorMessage.includes('missing') ||
        errorMessage.includes('required field')) {
      return FailureTaxonomy.MISSING_DATA;
    }
    
    // Check for conflicts
    if (errorMessage.includes('conflict') ||
        errorMessage.includes('inconsistent') ||
        errorMessage.includes('mismatch')) {
      return FailureTaxonomy.CONFLICT;
    }
    
    // Check for policy violations
    if (errorMessage.includes('policy') ||
        errorMessage.includes('permission') ||
        errorMessage.includes('unauthorized') ||
        errorMessage.includes('forbidden')) {
      return FailureTaxonomy.POLICY_VIOLATION;
    }
    
    // Check for tool errors
    if (errorMessage.includes('tool') ||
        errorMessage.includes('execution') ||
        errorMessage.includes('timeout') ||
        contextData?.toolName) {
      return FailureTaxonomy.TOOL_ERROR;
    }
    
    // Check for low confidence
    if (errorMessage.includes('confidence') ||
        errorMessage.includes('uncertain') ||
        contextData?.confidence !== undefined && 
        typeof contextData.confidence === 'number' && 
        contextData.confidence < 0.5) {
      return FailureTaxonomy.LOW_CONFIDENCE;
    }
    
    // Check for non-determinism
    if (errorMessage.includes('non-deterministic') ||
        errorMessage.includes('race') ||
        errorMessage.includes('random')) {
      return FailureTaxonomy.NON_DETERMINISM;
    }
    
    // Check for out of scope
    if (errorMessage.includes('scope') ||
        errorMessage.includes('boundary') ||
        errorMessage.includes('out of range')) {
      return FailureTaxonomy.OUT_OF_SCOPE;
    }
    
    // Default to tool error if we can't classify
    return FailureTaxonomy.TOOL_ERROR;
  }
  
  /**
   * Determine the root cause of the failure
   */
  private determineRootCause(
    error: Error,
    taxonomy: FailureTaxonomy,
    contextData?: Record<string, unknown>
  ): string {
    let rootCause = `${taxonomy}: ${error.message}`;
    
    // Add context-specific details
    if (contextData) {
      if (contextData.toolName) {
        rootCause += ` | Tool: ${contextData.toolName}`;
      }
      if (contextData.validationResults) {
        rootCause += ` | Validation failed`;
      }
      if (contextData.threshold) {
        rootCause += ` | Threshold: ${contextData.threshold}`;
      }
    }
    
    return rootCause;
  }
  
  /**
   * Generate a proposed fix based on failure analysis
   */
  private async generateProposedFix(
    taxonomy: FailureTaxonomy,
    rootCause: string,
    contextData?: Record<string, unknown>
  ): Promise<ProposedFix> {
    const fixId = `fix-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    
    switch (taxonomy) {
      case FailureTaxonomy.TOOL_ERROR:
        return this.generateAlternateToolFix(fixId, rootCause, contextData);
      
      case FailureTaxonomy.LOW_CONFIDENCE:
      case FailureTaxonomy.CONFLICT:
        return this.generateCRVThresholdFix(fixId, rootCause, contextData);
      
      case FailureTaxonomy.NON_DETERMINISM:
        return this.generateWorkflowReorderingFix(fixId, rootCause, contextData);
      
      default:
        // For other failures, try alternate tool as default
        return this.generateAlternateToolFix(fixId, rootCause, contextData);
    }
  }
  
  /**
   * Generate a fix that uses an alternate tool
   */
  private generateAlternateToolFix(
    fixId: string,
    rootCause: string,
    contextData?: Record<string, unknown>
  ): ProposedFix {
    const originalTool = (contextData?.toolName as string) || 'unknown-tool';
    const alternativeTool = this.selectAlternativeTool(originalTool, contextData);
    
    return {
      id: fixId,
      description: `Replace failed tool '${originalTool}' with '${alternativeTool}'`,
      fixType: FixType.ALTERNATE_TOOL,
      alternateToolSelection: {
        originalTool,
        alternativeTool,
        reason: `Original tool failed: ${rootCause}`,
      },
      riskTier: RiskTier.MEDIUM,
      estimatedImpact: 'low',
    };
  }
  
  /**
   * Generate a fix that modifies CRV thresholds
   */
  private generateCRVThresholdFix(
    fixId: string,
    rootCause: string,
    contextData?: Record<string, unknown>
  ): ProposedFix {
    const operatorName = (contextData?.operatorName as string) || 'confidence-validator';
    const originalThreshold = (contextData?.threshold as number) || 0.8;
    
    // Reduce threshold by 10% to be more permissive
    const newThreshold = originalThreshold * 0.9;
    
    // Policy bounds for CRV thresholds
    const MIN_THRESHOLD = 0.5;
    const MAX_THRESHOLD = 1.0;
    
    // Check if within policy bounds
    const withinPolicyBounds = newThreshold >= MIN_THRESHOLD && newThreshold <= MAX_THRESHOLD;
    
    return {
      id: fixId,
      description: `Adjust CRV threshold for ${operatorName} from ${originalThreshold} to ${newThreshold}`,
      fixType: FixType.MODIFY_CRV_THRESHOLD,
      modifiedCRVThresholds: [{
        operatorName,
        originalThreshold,
        newThreshold,
        withinPolicyBounds,
      }],
      riskTier: withinPolicyBounds ? RiskTier.MEDIUM : RiskTier.HIGH,
      estimatedImpact: 'medium',
    };
  }
  
  /**
   * Generate a fix that reorders workflow steps
   */
  private generateWorkflowReorderingFix(
    fixId: string,
    rootCause: string,
    contextData?: Record<string, unknown>
  ): ProposedFix {
    const originalOrder = (contextData?.taskOrder as string[]) || [];
    
    // Simple reordering strategy: move failed task later in sequence
    const newOrder = [...originalOrder];
    const currentTaskId = contextData?.currentTaskId as string;
    
    if (currentTaskId && newOrder.includes(currentTaskId)) {
      const index = newOrder.indexOf(currentTaskId);
      if (index < newOrder.length - 1) {
        // Swap with next task
        [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];
      }
    }
    
    // Safety check: ensure no cyclic dependencies created
    const safetyCheck = this.checkReorderingSafety(originalOrder, newOrder, contextData);
    
    return {
      id: fixId,
      description: `Reorder workflow steps to avoid non-deterministic behavior`,
      fixType: FixType.REORDER_WORKFLOW,
      workflowStepReordering: {
        originalOrder,
        newOrder,
        safetyCheck,
      },
      riskTier: safetyCheck ? RiskTier.MEDIUM : RiskTier.HIGH,
      estimatedImpact: safetyCheck ? 'low' : 'high',
    };
  }
  
  /**
   * Select an alternative tool for the failed tool
   */
  private selectAlternativeTool(
    originalTool: string,
    contextData?: Record<string, unknown>
  ): string {
    // Check if there are allowed tools in context
    const allowedTools = contextData?.allowedTools as string[] || [];
    
    // Filter out the original tool
    const alternatives = allowedTools.filter(t => t !== originalTool);
    
    if (alternatives.length > 0) {
      // Return the first alternative
      return alternatives[0];
    }
    
    // Fallback: generate a generic alternative name
    return `${originalTool}-alternative`;
  }
  
  /**
   * Check if workflow reordering is safe
   */
  private checkReorderingSafety(
    originalOrder: string[],
    newOrder: string[],
    contextData?: Record<string, unknown>
  ): boolean {
    // Basic safety check: same tasks, just reordered
    if (originalOrder.length !== newOrder.length) {
      return false;
    }
    
    // Check all tasks are present
    const originalSet = new Set(originalOrder);
    const newSet = new Set(newOrder);
    
    if (originalSet.size !== newSet.size) {
      return false;
    }
    
    for (const task of originalOrder) {
      if (!newSet.has(task)) {
        return false;
      }
    }
    
    // Check dependencies if provided
    const dependencies = contextData?.dependencies as Map<string, string[]> | undefined;
    if (dependencies) {
      // Ensure dependencies are still satisfied in new order
      const taskIndices = new Map<string, number>();
      newOrder.forEach((task, index) => taskIndices.set(task, index));
      
      for (const [task, deps] of dependencies.entries()) {
        const taskIndex = taskIndices.get(task);
        if (taskIndex === undefined) continue;
        
        for (const dep of deps) {
          const depIndex = taskIndices.get(dep);
          if (depIndex === undefined) continue;
          
          // Dependency must come before dependent task
          if (depIndex >= taskIndex) {
            return false;
          }
        }
      }
    }
    
    return true;
  }
  
  /**
   * Calculate confidence in the failure analysis
   */
  private calculateConfidence(
    taxonomy: FailureTaxonomy,
    contextData?: Record<string, unknown>
  ): number {
    let confidence = 0.7; // Base confidence
    
    // Define confidence thresholds
    const MIN_CONFIDENCE = 0.5;
    
    // Increase confidence if we have more context
    if (contextData) {
      if (contextData.toolName) confidence += 0.1;
      if (contextData.stackTrace) confidence += 0.05;
      if (contextData.validationResults) confidence += 0.1;
    }
    
    // Adjust based on taxonomy clarity
    switch (taxonomy) {
      case FailureTaxonomy.TOOL_ERROR:
      case FailureTaxonomy.POLICY_VIOLATION:
        confidence += 0.05; // Clear failures
        break;
      case FailureTaxonomy.NON_DETERMINISM:
      case FailureTaxonomy.LOW_CONFIDENCE:
        confidence -= 0.1; // Harder to diagnose
        break;
    }
    
    // Clamp to [MIN_CONFIDENCE, 1]
    return Math.max(MIN_CONFIDENCE, Math.min(1, confidence));
  }
}
