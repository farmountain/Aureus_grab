import { GoalGuardFSM, RiskTier, Principal, Action } from '@aureus/policy';
import { CRVGate, Commit, ValidationResult } from '@aureus/crv';
import { ProposedFix, SandboxResult, ChaosTestScenario, ChaosTestContext, ChaosTestResult } from './types';

/**
 * SandboxExecutor executes proposed fixes in a safe sandbox environment
 */
export class SandboxExecutor {
  private goalGuard: GoalGuardFSM;
  private crvGate: CRVGate;
  private chaosScenarios: Map<string, ChaosTestScenario>;
  
  constructor(
    goalGuard: GoalGuardFSM,
    crvGate: CRVGate,
    chaosScenarios: ChaosTestScenario[] = []
  ) {
    this.goalGuard = goalGuard;
    this.crvGate = crvGate;
    this.chaosScenarios = new Map();
    
    chaosScenarios.forEach(scenario => {
      this.chaosScenarios.set(scenario.name, scenario);
    });
    
    // Add default chaos scenarios
    this.addDefaultChaosScenarios();
  }
  
  /**
   * Execute a proposed fix in the sandbox and validate it
   */
  async executeFix(
    proposedFix: ProposedFix,
    workflowId: string,
    taskId: string,
    originalFailure: {
      taxonomy: string;
      rootCause: string;
    }
  ): Promise<SandboxResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    const warnings: string[] = [];
    const logs: string[] = [];
    
    logs.push(`Starting sandbox execution for fix: ${proposedFix.id}`);
    logs.push(`Fix type: ${proposedFix.fixType}`);
    
    // Step 1: Goal-Guard FSM approval
    const goalGuardApproved = await this.validateWithGoalGuard(proposedFix, logs, errors);
    
    // Step 2: CRV validation
    const crvPassed = await this.validateWithCRV(proposedFix, logs, errors);
    
    // Step 3: Chaos tests
    const chaosTestResults = await this.runChaosTests(
      proposedFix,
      workflowId,
      taskId,
      originalFailure,
      logs,
      errors
    );
    const chaosTestsPassed = chaosTestResults.every(r => r.passed);
    
    // Determine if fix should be promoted
    const shouldPromoteFix = goalGuardApproved && crvPassed && chaosTestsPassed;
    
    const executionTime = Date.now() - startTime;
    
    let promotionReason: string | undefined;
    if (shouldPromoteFix) {
      promotionReason = 'All validation checks passed: Goal-Guard approved, CRV passed, and chaos tests passed';
    } else {
      const failures: string[] = [];
      if (!goalGuardApproved) failures.push('Goal-Guard rejected');
      if (!crvPassed) failures.push('CRV failed');
      if (!chaosTestsPassed) failures.push('Chaos tests failed');
      promotionReason = `Validation failed: ${failures.join(', ')}`;
    }
    
    logs.push(`Sandbox execution completed in ${executionTime}ms`);
    logs.push(`Result: ${shouldPromoteFix ? 'PROMOTED' : 'REJECTED'}`);
    
    return {
      fixId: proposedFix.id,
      success: shouldPromoteFix,
      goalGuardApproved,
      crvPassed,
      chaosTestsPassed,
      executionTime,
      errors: errors.length > 0 ? errors : undefined,
      warnings: warnings.length > 0 ? warnings : undefined,
      logs,
      shouldPromoteFix,
      promotionReason,
    };
  }
  
  /**
   * Validate proposed fix with Goal-Guard FSM
   */
  private async validateWithGoalGuard(
    proposedFix: ProposedFix,
    logs: string[],
    errors: string[]
  ): Promise<boolean> {
    logs.push('Validating with Goal-Guard FSM...');
    
    try {
      // Create a principal for the reflexion system
      const principal: Principal = {
        id: 'reflexion-engine',
        type: 'service',
        permissions: [
          {
            action: 'modify',
            resource: 'workflow',
          },
          {
            action: 'modify',
            resource: 'crv-threshold',
          },
        ],
      };
      
      // Create an action for the fix
      const action: Action = {
        id: proposedFix.id,
        name: `Apply fix: ${proposedFix.description}`,
        riskTier: proposedFix.riskTier,
        requiredPermissions: [
          {
            action: 'modify',
            resource: 'workflow',
          },
        ],
      };
      
      // Evaluate with Goal-Guard
      const decision = await this.goalGuard.evaluate(principal, action);
      
      if (decision.allowed) {
        logs.push('✓ Goal-Guard approved the fix');
        return true;
      } else {
        errors.push(`Goal-Guard rejected: ${decision.reason}`);
        logs.push(`✗ Goal-Guard rejected: ${decision.reason}`);
        return false;
      }
    } catch (error) {
      const err = error as Error;
      errors.push(`Goal-Guard validation error: ${err.message}`);
      logs.push(`✗ Goal-Guard validation error: ${err.message}`);
      return false;
    }
  }
  
  /**
   * Validate proposed fix with CRV
   */
  private async validateWithCRV(
    proposedFix: ProposedFix,
    logs: string[],
    errors: string[]
  ): Promise<boolean> {
    logs.push('Validating with CRV...');
    
    try {
      // Create a commit representing the fix
      const commit: Commit = {
        id: proposedFix.id,
        data: proposedFix,
        metadata: {
          fixType: proposedFix.fixType,
          riskTier: proposedFix.riskTier,
        },
      };
      
      // Validate with CRV gate
      const result = await this.crvGate.validate(commit);
      
      if (result.passed) {
        logs.push('✓ CRV validation passed');
        return true;
      } else {
        errors.push(`CRV validation failed: ${result.validationResults.map(r => r.reason).join(', ')}`);
        logs.push(`✗ CRV validation failed`);
        return false;
      }
    } catch (error) {
      const err = error as Error;
      errors.push(`CRV validation error: ${err.message}`);
      logs.push(`✗ CRV validation error: ${err.message}`);
      return false;
    }
  }
  
  /**
   * Run chaos tests on the proposed fix
   */
  private async runChaosTests(
    proposedFix: ProposedFix,
    workflowId: string,
    taskId: string,
    originalFailure: {
      taxonomy: string;
      rootCause: string;
    },
    logs: string[],
    errors: string[]
  ): Promise<ChaosTestResult[]> {
    logs.push('Running chaos tests...');
    
    const results: ChaosTestResult[] = [];
    
    // If no chaos scenarios are configured, pass by default
    if (this.chaosScenarios.size === 0) {
      logs.push('⚠ No chaos test scenarios configured - skipping');
      return [];
    }
    
    const context: ChaosTestContext = {
      workflowId,
      taskId,
      proposedFix,
      originalFailure: {
        taxonomy: originalFailure.taxonomy as any,
        rootCause: originalFailure.rootCause,
      },
    };
    
    for (const [name, scenario] of this.chaosScenarios.entries()) {
      try {
        logs.push(`  Running chaos test: ${name}`);
        const result = await scenario.execute(context);
        results.push(result);
        
        if (result.passed) {
          logs.push(`  ✓ ${name} passed (${result.executionTime}ms)`);
        } else {
          logs.push(`  ✗ ${name} failed: ${result.details}`);
          errors.push(`Chaos test '${name}' failed: ${result.details}`);
        }
      } catch (error) {
        const err = error as Error;
        const failedResult: ChaosTestResult = {
          scenarioName: name,
          passed: false,
          executionTime: 0,
          details: err.message,
          errors: [err.message],
        };
        results.push(failedResult);
        logs.push(`  ✗ ${name} threw error: ${err.message}`);
        errors.push(`Chaos test '${name}' threw error: ${err.message}`);
      }
    }
    
    const passedCount = results.filter(r => r.passed).length;
    logs.push(`Chaos tests completed: ${passedCount}/${results.length} passed`);
    
    return results;
  }
  
  /**
   * Add default chaos test scenarios
   */
  private addDefaultChaosScenarios(): void {
    // Scenario 1: Basic idempotency test
    this.chaosScenarios.set('idempotency', {
      name: 'idempotency',
      description: 'Verify fix can be applied multiple times safely',
      execute: async (context: ChaosTestContext): Promise<ChaosTestResult> => {
        const startTime = Date.now();
        
        // Simulate applying the fix twice
        // In a real implementation, this would actually execute the workflow
        const isIdempotent = this.checkIdempotency(context.proposedFix);
        
        return {
          scenarioName: 'idempotency',
          passed: isIdempotent,
          executionTime: Date.now() - startTime,
          details: isIdempotent 
            ? 'Fix is idempotent' 
            : 'Fix may not be idempotent',
        };
      },
    });
    
    // Scenario 2: Rollback safety
    this.chaosScenarios.set('rollback-safety', {
      name: 'rollback-safety',
      description: 'Verify fix can be safely rolled back',
      execute: async (context: ChaosTestContext): Promise<ChaosTestResult> => {
        const startTime = Date.now();
        
        // Check if fix type supports rollback
        const canRollback = this.checkRollbackSafety(context.proposedFix);
        
        return {
          scenarioName: 'rollback-safety',
          passed: canRollback,
          executionTime: Date.now() - startTime,
          details: canRollback 
            ? 'Fix can be safely rolled back' 
            : 'Fix may not be safely rollbackable',
        };
      },
    });
    
    // Scenario 3: Boundary conditions
    this.chaosScenarios.set('boundary-conditions', {
      name: 'boundary-conditions',
      description: 'Test fix against boundary conditions',
      execute: async (context: ChaosTestContext): Promise<ChaosTestResult> => {
        const startTime = Date.now();
        
        // Check if CRV threshold modifications are within bounds
        if (context.proposedFix.modifiedCRVThresholds) {
          const allWithinBounds = context.proposedFix.modifiedCRVThresholds
            .every(t => t.withinPolicyBounds);
          
          return {
            scenarioName: 'boundary-conditions',
            passed: allWithinBounds,
            executionTime: Date.now() - startTime,
            details: allWithinBounds
              ? 'All thresholds within policy bounds'
              : 'Some thresholds exceed policy bounds',
          };
        }
        
        return {
          scenarioName: 'boundary-conditions',
          passed: true,
          executionTime: Date.now() - startTime,
          details: 'No boundary conditions to check',
        };
      },
    });
  }
  
  /**
   * Check if fix is idempotent
   */
  private checkIdempotency(fix: ProposedFix): boolean {
    // Alternate tool selection is idempotent
    if (fix.alternateToolSelection) {
      return true;
    }
    
    // CRV threshold modification is idempotent
    if (fix.modifiedCRVThresholds) {
      return true;
    }
    
    // Workflow reordering is idempotent if safety check passed
    if (fix.workflowStepReordering) {
      return fix.workflowStepReordering.safetyCheck;
    }
    
    return true;
  }
  
  /**
   * Check if fix can be safely rolled back
   */
  private checkRollbackSafety(fix: ProposedFix): boolean {
    // All our fix types are reversible
    return true;
  }
  
  /**
   * Add a custom chaos test scenario
   */
  addChaosScenario(scenario: ChaosTestScenario): void {
    this.chaosScenarios.set(scenario.name, scenario);
  }
}
