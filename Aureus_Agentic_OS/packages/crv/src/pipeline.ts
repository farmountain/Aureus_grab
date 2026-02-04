import { Commit, ValidationResult, RecoveryStrategy, RecoveryResult } from './types';
import { Operator } from './operators';

/**
 * Verification pipeline configuration
 */
export interface VerificationPipelineConfig {
  name: string;
  operators: Operator[];
  recoveryStrategy?: RecoveryStrategy;
  stopOnFirstFailure?: boolean;
}

/**
 * Verification pipeline result
 */
export interface VerificationPipelineResult {
  passed: boolean;
  pipelineName: string;
  operatorResults: Array<{
    operatorName: string;
    validation: ValidationResult;
    oracleChecks: ValidationResult[];
    invariants: ValidationResult;
  }>;
  recoveryApplied?: RecoveryResult;
  timestamp: Date;
}

/**
 * Recovery executor interface for executing recovery strategies
 */
export interface RecoveryExecutor {
  executeRetryAltTool(toolName: string, maxRetries: number, commit: Commit): Promise<RecoveryResult>;
  executeAskUser(prompt: string, commit: Commit): Promise<RecoveryResult>;
  executeEscalate(reason: string, commit: Commit): Promise<RecoveryResult>;
}

/**
 * Verification Pipeline executes operators in sequence
 * Runs after each step/tool response to validate output
 */
export class VerificationPipeline {
  private config: VerificationPipelineConfig;
  private recoveryExecutor?: RecoveryExecutor;

  constructor(config: VerificationPipelineConfig, recoveryExecutor?: RecoveryExecutor) {
    this.config = config;
    this.recoveryExecutor = recoveryExecutor;
  }

  /**
   * Run verification pipeline on commit/tool response
   * Returns validation results and applies recovery if needed
   */
  async verify(commit: Commit): Promise<VerificationPipelineResult> {
    const operatorResults: Array<{
      operatorName: string;
      validation: ValidationResult;
      oracleChecks: ValidationResult[];
      invariants: ValidationResult;
    }> = [];

    let allPassed = true;
    let currentData = commit.data;

    for (const operator of this.config.operators) {
      try {
        // Execute operator
        const output = await operator.execute(currentData);

        // Validate invariants
        const invariants = operator.validateInvariants(currentData, output);
        
        // Run oracle checks
        const oracleChecks = operator.runOracleChecks(currentData, output);

        // Check if any validation failed
        const operatorPassed = invariants.valid && oracleChecks.every(check => check.valid);

        operatorResults.push({
          operatorName: operator.name,
          validation: {
            valid: operatorPassed,
            reason: operatorPassed 
              ? `Operator ${operator.name} passed` 
              : `Operator ${operator.name} failed: ${invariants.reason || oracleChecks.find(c => !c.valid)?.reason}`,
            confidence: 1.0,
          },
          oracleChecks,
          invariants,
        });

        if (!operatorPassed) {
          allPassed = false;
          if (this.config.stopOnFirstFailure) {
            break;
          }
        }

        // Pass output to next operator
        currentData = output;
      } catch (error) {
        allPassed = false;
        operatorResults.push({
          operatorName: operator.name,
          validation: {
            valid: false,
            reason: `Operator ${operator.name} threw error: ${error instanceof Error ? error.message : String(error)}`,
            confidence: 1.0,
            metadata: { error: String(error) },
          },
          oracleChecks: [],
          invariants: { valid: false, reason: 'Operator execution failed' },
        });

        if (this.config.stopOnFirstFailure) {
          break;
        }
      }
    }

    const result: VerificationPipelineResult = {
      passed: allPassed,
      pipelineName: this.config.name,
      operatorResults,
      timestamp: new Date(),
    };

    // Apply recovery strategy if pipeline failed
    if (!allPassed && this.config.recoveryStrategy && this.recoveryExecutor) {
      const recoveryResult = await this.applyRecovery(this.config.recoveryStrategy, commit);
      result.recoveryApplied = recoveryResult;

      console.log(`Recovery strategy applied: ${this.config.recoveryStrategy.type}`, recoveryResult);
    }

    return result;
  }

  /**
   * Apply recovery strategy
   */
  private async applyRecovery(strategy: RecoveryStrategy, commit: Commit): Promise<RecoveryResult> {
    if (!this.recoveryExecutor) {
      return {
        success: false,
        strategy,
        message: 'No recovery executor configured',
      };
    }

    try {
      switch (strategy.type) {
        case 'retry_alt_tool':
          return await this.recoveryExecutor.executeRetryAltTool(strategy.toolName, strategy.maxRetries, commit);
        
        case 'ask_user':
          return await this.recoveryExecutor.executeAskUser(strategy.prompt, commit);
        
        case 'escalate':
          return await this.recoveryExecutor.executeEscalate(strategy.reason, commit);
        
        case 'ignore':
          return {
            success: true,
            strategy,
            message: `Ignoring validation failure: ${strategy.justification}`,
          };
        
        default:
          return {
            success: false,
            strategy,
            message: 'Unknown recovery strategy type',
          };
      }
    } catch (error) {
      return {
        success: false,
        strategy,
        message: `Recovery failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Get pipeline configuration
   */
  getConfig(): VerificationPipelineConfig {
    return { ...this.config };
  }
}

/**
 * Mock recovery executor for testing
 */
export class MockRecoveryExecutor implements RecoveryExecutor {
  async executeRetryAltTool(toolName: string, maxRetries: number, commit: Commit): Promise<RecoveryResult> {
    console.log(`Mock: Retry with alt tool ${toolName} (max ${maxRetries} retries)`);
    return {
      success: true,
      strategy: { type: 'retry_alt_tool', toolName, maxRetries },
      message: `Retried with alternative tool: ${toolName}`,
    };
  }

  async executeAskUser(prompt: string, commit: Commit): Promise<RecoveryResult> {
    console.log(`Mock: Ask user - ${prompt}`);
    return {
      success: true,
      strategy: { type: 'ask_user', prompt },
      message: 'User provided input (mocked)',
    };
  }

  async executeEscalate(reason: string, commit: Commit): Promise<RecoveryResult> {
    console.log(`Mock: Escalate - ${reason}`);
    return {
      success: true,
      strategy: { type: 'escalate', reason },
      message: `Escalated to human operator: ${reason}`,
    };
  }
}
