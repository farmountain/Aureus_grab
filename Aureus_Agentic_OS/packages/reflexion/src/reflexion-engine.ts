import { GoalGuardFSM } from '@aureus/policy';
import { CRVGate } from '@aureus/crv';
import { TelemetryCollector } from '@aureus/observability';
import { FailureAnalyzer } from './failure-analyzer';
import { SandboxExecutor } from './sandbox-executor';
import {
  Postmortem,
  ProposedFix,
  SandboxResult,
  ReflexionConfig,
  ChaosTestScenario,
} from './types';

/**
 * Default configuration for Reflexion
 */
const DEFAULT_CONFIG: ReflexionConfig = {
  enabled: true,
  minConfidence: 0.6,
  maxFixAttempts: 3,
  crvThresholdBounds: {
    minMultiplier: 0.8,
    maxMultiplier: 1.2,
  },
  chaosTestScenarios: ['idempotency', 'rollback-safety', 'boundary-conditions'],
  sandboxEnabled: true,
};

/**
 * ReflexionEngine orchestrates failure analysis and self-healing
 * 
 * After failures:
 * 1. Generates structured postmortem with failure taxonomy, root cause, and proposed fix
 * 2. Executes proposed fixes in a sandbox with:
 *    - Alternate tool selection
 *    - Modified CRV operator thresholds (within policy bounds)
 *    - Workflow step re-ordering (only if safe)
 * 3. Promotes fixes only if:
 *    - Goal-Guard FSM approves
 *    - CRV passes
 *    - Chaos tests pass for scenario
 */
export class ReflexionEngine {
  private config: ReflexionConfig;
  private failureAnalyzer: FailureAnalyzer;
  private sandboxExecutor: SandboxExecutor;
  private telemetry?: TelemetryCollector;
  
  // History tracking
  private postmortems: Map<string, Postmortem> = new Map();
  private sandboxResults: Map<string, SandboxResult> = new Map();
  private fixAttempts: Map<string, number> = new Map(); // taskId -> attempt count
  
  constructor(
    goalGuard: GoalGuardFSM,
    crvGate: CRVGate,
    config: Partial<ReflexionConfig> = {},
    chaosScenarios: ChaosTestScenario[] = [],
    telemetry?: TelemetryCollector
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.failureAnalyzer = new FailureAnalyzer();
    this.sandboxExecutor = new SandboxExecutor(goalGuard, crvGate, chaosScenarios);
    this.telemetry = telemetry;
  }
  
  /**
   * Handle a workflow failure with reflexion
   * Returns proposed fix if analysis succeeds and fix is promoted
   */
  async handleFailure(
    workflowId: string,
    taskId: string,
    error: Error,
    contextData?: Record<string, unknown>
  ): Promise<{
    postmortem: Postmortem;
    sandboxResult?: SandboxResult;
    fixPromoted: boolean;
  }> {
    // Check if reflexion is enabled
    if (!this.config.enabled) {
      throw new Error('Reflexion is disabled');
    }
    
    // Check if we've exceeded max fix attempts for this task
    const attemptCount = this.fixAttempts.get(taskId) || 0;
    if (attemptCount >= this.config.maxFixAttempts) {
      throw new Error(
        `Max fix attempts (${this.config.maxFixAttempts}) exceeded for task ${taskId}`
      );
    }
    
    // Increment attempt counter
    this.fixAttempts.set(taskId, attemptCount + 1);
    
    // Step 1: Analyze failure and generate postmortem
    const postmortem = await this.failureAnalyzer.analyzeFailure(
      workflowId,
      taskId,
      error,
      contextData
    );
    
    // Store postmortem
    this.postmortems.set(postmortem.id, postmortem);
    
    // Record telemetry
    if (this.telemetry) {
      this.telemetry.recordMetric(
        'reflexion.postmortem.generated',
        1,
        {
          workflowId,
          taskId,
          taxonomy: postmortem.failureTaxonomy,
          confidence: postmortem.confidence.toString(),
        }
      );
    }
    
    // Check if confidence meets threshold
    if (postmortem.confidence < this.config.minConfidence) {
      // Record telemetry for low confidence
      if (this.telemetry) {
        this.telemetry.recordMetric(
          'reflexion.low_confidence',
          1,
          { 
            workflowId, 
            taskId,
            confidence: postmortem.confidence.toString(),
            threshold: this.config.minConfidence.toString(),
          }
        );
      }
      
      return {
        postmortem,
        fixPromoted: false,
      };
    }
    
    // Step 2: Execute fix in sandbox (if enabled)
    if (!this.config.sandboxEnabled) {
      return {
        postmortem,
        fixPromoted: false,
      };
    }
    
    const sandboxResult = await this.sandboxExecutor.executeFix(
      postmortem.proposedFix,
      workflowId,
      taskId,
      {
        taxonomy: postmortem.failureTaxonomy,
        rootCause: postmortem.rootCause,
      }
    );
    
    // Store sandbox result
    this.sandboxResults.set(sandboxResult.fixId, sandboxResult);
    
    // Record telemetry
    if (this.telemetry) {
      this.telemetry.recordMetric(
        'reflexion.sandbox.executed',
        1,
        {
          workflowId,
          taskId,
          fixId: sandboxResult.fixId,
          success: sandboxResult.success.toString(),
        }
      );
      
      if (sandboxResult.shouldPromoteFix) {
        this.telemetry.recordMetric(
          'reflexion.fix.promoted',
          1,
          { workflowId, taskId, fixId: sandboxResult.fixId }
        );
      } else {
        this.telemetry.recordMetric(
          'reflexion.fix.rejected',
          1,
          { workflowId, taskId, fixId: sandboxResult.fixId }
        );
      }
    }
    
    return {
      postmortem,
      sandboxResult,
      fixPromoted: sandboxResult.shouldPromoteFix,
    };
  }
  
  /**
   * Apply a promoted fix to the workflow
   * This would be called by the orchestrator after reflexion promotes a fix
   */
  async applyFix(
    proposedFix: ProposedFix,
    workflowContext: Record<string, unknown>
  ): Promise<void> {
    // Record telemetry
    if (this.telemetry) {
      this.telemetry.recordMetric(
        'reflexion.fix.applied',
        1,
        {
          fixId: proposedFix.id,
          fixType: proposedFix.fixType,
        }
      );
    }
    
    // In a real implementation, this would modify the workflow
    // For now, we just track the application via telemetry
  }
  
  /**
   * Get postmortem by ID
   */
  getPostmortem(postmortemId: string): Postmortem | undefined {
    return this.postmortems.get(postmortemId);
  }
  
  /**
   * Get sandbox result by fix ID
   */
  getSandboxResult(fixId: string): SandboxResult | undefined {
    return this.sandboxResults.get(fixId);
  }
  
  /**
   * Get all postmortems for a workflow
   */
  getPostmortemsForWorkflow(workflowId: string): Postmortem[] {
    return Array.from(this.postmortems.values())
      .filter(p => p.workflowId === workflowId);
  }
  
  /**
   * Get all postmortems for a task
   */
  getPostmortemsForTask(workflowId: string, taskId: string): Postmortem[] {
    return Array.from(this.postmortems.values())
      .filter(p => p.workflowId === workflowId && p.taskId === taskId);
  }
  
  /**
   * Get fix attempt count for a task
   */
  getFixAttemptCount(taskId: string): number {
    return this.fixAttempts.get(taskId) || 0;
  }
  
  /**
   * Reset fix attempt counter for a task
   */
  resetFixAttempts(taskId: string): void {
    this.fixAttempts.delete(taskId);
  }
  
  /**
   * Get reflexion statistics
   */
  getStats(): {
    totalPostmortems: number;
    totalSandboxExecutions: number;
    promotedFixes: number;
    rejectedFixes: number;
    averageConfidence: number;
  } {
    const postmortemsArray = Array.from(this.postmortems.values());
    const sandboxResultsArray = Array.from(this.sandboxResults.values());
    
    const totalPostmortems = postmortemsArray.length;
    const totalSandboxExecutions = sandboxResultsArray.length;
    const promotedFixes = sandboxResultsArray.filter(r => r.shouldPromoteFix).length;
    const rejectedFixes = sandboxResultsArray.filter(r => !r.shouldPromoteFix).length;
    
    const averageConfidence = totalPostmortems > 0
      ? postmortemsArray.reduce((sum, p) => sum + p.confidence, 0) / totalPostmortems
      : 0;
    
    return {
      totalPostmortems,
      totalSandboxExecutions,
      promotedFixes,
      rejectedFixes,
      averageConfidence,
    };
  }
  
  /**
   * Clear all reflexion history
   */
  clearHistory(): void {
    this.postmortems.clear();
    this.sandboxResults.clear();
    this.fixAttempts.clear();
  }
  
  /**
   * Add a custom chaos test scenario
   */
  addChaosScenario(scenario: ChaosTestScenario): void {
    this.sandboxExecutor.addChaosScenario(scenario);
  }
}
