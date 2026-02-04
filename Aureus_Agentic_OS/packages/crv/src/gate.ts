import { Commit, GateConfig, GateResult, ValidationResult, RecoveryStrategy, RecoveryResult, FailureTaxonomy } from './types';
import { TelemetryCollector } from '@aureus/observability';

/**
 * CRVGate implements circuit reasoning validation gates
 * Guarantees: Verification (invariant 3) - gates block invalid commits
 */
export class CRVGate {
  private config: GateConfig;
  private telemetry?: TelemetryCollector;

  constructor(config: GateConfig, telemetry?: TelemetryCollector) {
    this.config = config;
    this.telemetry = telemetry;
  }

  /**
   * Validate a commit through all configured validators
   * Blocks invalid commits (invariant 3)
   */
  async validate(commit: Commit): Promise<GateResult> {
    const validationResults: ValidationResult[] = [];
    let allPassed = true;
    let hasLowConfidence = false;

    // Run all validators
    for (const validator of this.config.validators) {
      const result = await validator(commit);
      validationResults.push(result);

      // Check if validation failed
      if (!result.valid) {
        allPassed = false;
      }

      // Check confidence threshold if specified
      if (this.config.requiredConfidence && result.confidence) {
        if (result.confidence < this.config.requiredConfidence) {
          allPassed = false;
          hasLowConfidence = true;
        }
      }
    }

    // Determine if commit should be blocked
    const blockedCommit = this.config.blockOnFailure && !allPassed;

    // Determine crv_status
    let crvStatus: 'passed' | 'blocked' | 'warning';
    if (blockedCommit) {
      crvStatus = 'blocked';
    } else if (!allPassed) {
      crvStatus = 'warning';
    } else {
      crvStatus = 'passed';
    }

    // Find first failure code and remediation
    const failedResult = validationResults.find(r => !r.valid && r.failure_code);
    const failureCode = failedResult?.failure_code;
    const remediation = failedResult?.remediation;

    // If low confidence but no explicit failure code, mark it
    if (hasLowConfidence && !failureCode) {
      failedResult && (failedResult.failure_code = FailureTaxonomy.LOW_CONFIDENCE);
    }

    const gateResult: GateResult = {
      passed: allPassed,
      gateName: this.config.name,
      validationResults,
      blockedCommit,
      timestamp: new Date(),
      recoveryStrategy: !allPassed ? this.config.recoveryStrategy : undefined,
      crv_status: crvStatus,
      failure_code: failureCode,
      remediation: remediation,
    };

    // Log the gate result for auditability with observability fields
    if (blockedCommit) {
      console.log(`CRV Gate "${this.config.name}" BLOCKED commit ${commit.id}`);
      console.log('CRV Status:', crvStatus);
      console.log('Failure Code:', failureCode || 'N/A');
      console.log('Remediation:', remediation || 'N/A');
      console.log('Validation failures:', validationResults.filter(r => !r.valid));
      
      if (this.config.recoveryStrategy) {
        console.log('Recovery strategy:', this.config.recoveryStrategy);
      }
    }

    // Record telemetry if available
    // Note: workflowId and taskId should be passed in commit metadata
    if (this.telemetry && commit.metadata) {
      const workflowId = commit.metadata.workflowId as string | undefined;
      const taskId = commit.metadata.taskId as string | undefined;
      
      if (workflowId && taskId) {
        this.telemetry.recordCRVResult(
          workflowId,
          taskId,
          this.config.name,
          allPassed,
          blockedCommit,
          failureCode
        );
      }
    }

    return gateResult;
  }

  /**
   * Get gate configuration
   */
  getConfig(): GateConfig {
    return { ...this.config };
  }
}

/**
 * GateChain allows multiple gates to be composed
 */
export class GateChain {
  private gates: CRVGate[] = [];

  addGate(gate: CRVGate): void {
    this.gates.push(gate);
  }

  /**
   * Validate commit through all gates in sequence
   * If any gate blocks, the commit is blocked (invariant 3)
   */
  async validate(commit: Commit): Promise<GateResult[]> {
    const results: GateResult[] = [];

    for (const gate of this.gates) {
      const result = await gate.validate(commit);
      results.push(result);

      // If commit is blocked, stop processing
      if (result.blockedCommit) {
        console.log(`Commit ${commit.id} blocked by gate chain`);
        break;
      }
    }

    return results;
  }

  /**
   * Check if any gate would block the commit
   */
  wouldBlock(results: GateResult[]): boolean {
    return results.some(r => r.blockedCommit);
  }
}
