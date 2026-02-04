import { CRVGate } from './gate';
import { Commit, GateConfig, ValidationResult, FailureTaxonomy } from './types';
import { WorldModelSpec, validateWorldModelSpec } from '@aureus/world-model';

/**
 * World Model CRV Gate validates world model specifications
 * Checks schema validity, constraint consistency, and causal graph connectivity
 */
export class WorldModelCRVGate {
  /**
   * Create a CRV gate for world model validation
   */
  static createGate(): CRVGate {
    const config: GateConfig = {
      name: 'world-model-validation',
      validators: [
        WorldModelCRVGate.validateSchema,
        WorldModelCRVGate.validateConstraintConsistency,
        WorldModelCRVGate.validateCausalGraphConnectivity,
      ],
      blockOnFailure: true,
      recoveryStrategy: { type: 'escalate', reason: 'Manual review required for world model validation failures' },
    };

    return new CRVGate(config);
  }

  /**
   * Validate world model schema
   */
  private static async validateSchema(commit: Commit): Promise<ValidationResult> {
    const spec = commit.data as WorldModelSpec;
    
    if (!spec) {
      return {
        valid: false,
        reason: 'No world model spec provided',
        confidence: 1.0,
        failure_code: FailureTaxonomy.MISSING_DATA,
      };
    }

    const validation = validateWorldModelSpec(spec);
    
    if (!validation.success) {
      return {
        valid: false,
        reason: `Schema validation failed: ${validation.errors?.join(', ')}`,
        confidence: 1.0,
        failure_code: FailureTaxonomy.POLICY_VIOLATION,
        remediation: 'Fix schema errors: ' + validation.errors?.join(', '),
      };
    }

    return {
      valid: true,
      reason: 'Schema validation passed',
      confidence: 1.0,
    };
  }

  /**
   * Validate constraint consistency
   * Ensures that constraints don't conflict with each other
   */
  private static async validateConstraintConsistency(commit: Commit): Promise<ValidationResult> {
    const spec = commit.data as WorldModelSpec;
    
    if (!spec || !spec.constraints) {
      return {
        valid: true,
        reason: 'No constraints to validate',
        confidence: 1.0,
      };
    }

    const inconsistencies: string[] = [];

    // Check for conflicting constraints on the same entity/attribute
    const constraintsByEntity = new Map<string, typeof spec.constraints>();
    
    for (const constraint of spec.constraints) {
      const key = `${constraint.entity}:${constraint.attributes.join(',')}`;
      if (!constraintsByEntity.has(key)) {
        constraintsByEntity.set(key, []);
      }
      constraintsByEntity.get(key)!.push(constraint);
    }

    // Look for potential conflicts
    for (const [key, constraints] of constraintsByEntity.entries()) {
      if (constraints.length > 1) {
        // Check for conflicting constraint types
        const types = constraints.map(c => c.type);
        
        // Example: not-null and a check that allows null would conflict
        if (types.includes('not-null') && types.includes('check')) {
          const checkConstraints = constraints.filter(c => c.type === 'check');
          for (const check of checkConstraints) {
            if (check.rule.toLowerCase().includes('null')) {
              inconsistencies.push(
                `Potential conflict on ${key}: not-null constraint conflicts with check that may allow null`
              );
            }
          }
        }
      }
    }

    if (inconsistencies.length > 0) {
      return {
        valid: false,
        reason: `Constraint inconsistencies detected: ${inconsistencies.join('; ')}`,
        confidence: 0.8,
        failure_code: FailureTaxonomy.CONFLICT,
        remediation: 'Review and resolve conflicting constraints: ' + inconsistencies.join('; '),
      };
    }

    return {
      valid: true,
      reason: 'Constraint consistency validated',
      confidence: 1.0,
    };
  }

  /**
   * Validate causal graph connectivity
   */
  private static async validateCausalGraphConnectivity(commit: Commit): Promise<ValidationResult> {
    const spec = commit.data as WorldModelSpec;
    
    if (!spec || !spec.causalRules || spec.causalRules.length === 0) {
      return {
        valid: true,
        reason: 'No causal rules to validate',
        confidence: 1.0,
      };
    }

    const issues: string[] = [];
    const entityIds = new Set(spec.entities.map(e => e.id));
    
    for (const rule of spec.causalRules) {
      for (const condition of rule.conditions) {
        if (!entityIds.has(condition.entity)) {
          issues.push(`Rule "${rule.name}" references non-existent entity: ${condition.entity}`);
        }
      }
      for (const effect of rule.effects) {
        if (!entityIds.has(effect.entity)) {
          issues.push(`Rule "${rule.name}" references non-existent entity: ${effect.entity}`);
        }
      }
    }

    if (issues.length > 0) {
      return {
        valid: false,
        reason: `Causal graph issues: ${issues.join('; ')}`,
        confidence: 0.9,
        failure_code: FailureTaxonomy.CONFLICT,
        remediation: 'Fix causal graph issues: ' + issues.join('; '),
      };
    }

    return {
      valid: true,
      reason: 'Causal graph connectivity validated',
      confidence: 1.0,
    };
  }
}

/**
 * Validate a world model spec using CRV gates
 */
export async function validateWorldModelWithCRV(spec: WorldModelSpec): Promise<{
  valid: boolean;
  errors?: string[];
  warnings?: string[];
  crvResults?: any[];
}> {
  const gate = WorldModelCRVGate.createGate();
  
  const commit: Commit = {
    id: `validate-${Date.now()}`,
    data: spec,
  };

  const result = await gate.validate(commit);
  
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const validation of result.validationResults) {
    if (!validation.valid) {
      if (validation.confidence && validation.confidence < 1.0) {
        warnings.push(validation.reason || 'Unknown warning');
      } else {
        errors.push(validation.reason || 'Unknown error');
      }
    }
  }

  return {
    valid: result.passed,
    errors: errors.length > 0 ? errors : undefined,
    warnings: warnings.length > 0 ? warnings : undefined,
    crvResults: result.validationResults,
  };
}
