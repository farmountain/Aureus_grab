/**
 * Constraints system for world-model
 * Supports hard constraints (must never be violated) and soft constraints (preferences to optimize)
 */

import { WorldState } from './index';

/**
 * Constraint severity levels
 */
export type ConstraintSeverity = 'hard' | 'soft';

/**
 * Constraint categories for organization
 */
export type ConstraintCategory = 
  | 'policy'        // Policy/permission constraints
  | 'data_zone'     // Data zone/access constraints
  | 'security'      // Security constraints
  | 'cost'          // Cost optimization preferences
  | 'time'          // Time optimization preferences
  | 'risk'          // Risk minimization preferences
  | 'custom';       // Custom constraints

/**
 * Base constraint interface
 */
export interface BaseConstraint {
  id: string;
  description: string;
  category: ConstraintCategory;
  severity: ConstraintSeverity;
  metadata?: Record<string, unknown>;
}

/**
 * Hard constraint - must never be violated
 */
export interface HardConstraint extends BaseConstraint {
  severity: 'hard';
  /**
   * Predicate function that returns true if constraint is satisfied
   */
  predicate: (state: WorldState, action?: string, params?: Record<string, unknown>) => boolean;
  /**
   * Error message to display when constraint is violated
   */
  violationMessage?: string;
}

/**
 * Soft constraint - preference to optimize
 */
export interface SoftConstraint extends BaseConstraint {
  severity: 'soft';
  /**
   * Score function that returns a value between 0 and 1
   * Higher score = better satisfaction of the preference
   * 0 = completely unsatisfied
   * 1 = perfectly satisfied
   */
  score: (state: WorldState, action?: string, params?: Record<string, unknown>) => number;
  /**
   * Weight for multi-objective optimization (default: 1.0)
   */
  weight?: number;
  /**
   * Minimum acceptable score (default: 0)
   * If score falls below this threshold, action may be rejected
   */
  minScore?: number;
}

/**
 * Union type for all constraints
 */
export type Constraint = HardConstraint | SoftConstraint;

/**
 * Result of constraint validation
 */
export interface ConstraintValidationResult {
  satisfied: boolean;
  violations: ConstraintViolation[];
  score?: number; // Overall score for soft constraints (0-1)
  details: ConstraintCheckDetail[];
}

/**
 * Details of a constraint violation
 */
export interface ConstraintViolation {
  constraintId: string;
  description: string;
  category: ConstraintCategory;
  message?: string;
  severity: ConstraintSeverity;
}

/**
 * Detailed result for individual constraint check
 */
export interface ConstraintCheckDetail {
  constraintId: string;
  description: string;
  category: ConstraintCategory;
  severity: ConstraintSeverity;
  satisfied: boolean;
  score?: number; // For soft constraints
  weight?: number; // For soft constraints
}

/**
 * ConstraintEngine validates constraints and computes satisfaction scores
 */
export class ConstraintEngine {
  private hardConstraints = new Map<string, HardConstraint>();
  private softConstraints = new Map<string, SoftConstraint>();

  /**
   * Add a hard constraint
   */
  addHardConstraint(constraint: HardConstraint): void {
    this.hardConstraints.set(constraint.id, constraint);
  }

  /**
   * Add a soft constraint
   */
  addSoftConstraint(constraint: SoftConstraint): void {
    this.softConstraints.set(constraint.id, constraint);
  }

  /**
   * Remove a constraint by ID
   */
  removeConstraint(constraintId: string): boolean {
    return this.hardConstraints.delete(constraintId) || 
           this.softConstraints.delete(constraintId);
  }

  /**
   * Get all constraints
   */
  getAllConstraints(): Constraint[] {
    return [
      ...Array.from(this.hardConstraints.values()),
      ...Array.from(this.softConstraints.values()),
    ];
  }

  /**
   * Get constraints by category
   */
  getConstraintsByCategory(category: ConstraintCategory): Constraint[] {
    return this.getAllConstraints().filter(c => c.category === category);
  }

  /**
   * Get constraints by severity
   */
  getConstraintsBySeverity(severity: ConstraintSeverity): Constraint[] {
    return this.getAllConstraints().filter(c => c.severity === severity);
  }

  /**
   * Validate all constraints for a given state and optional action
   */
  validate(
    state: WorldState,
    action?: string,
    params?: Record<string, unknown>
  ): ConstraintValidationResult {
    const violations: ConstraintViolation[] = [];
    const details: ConstraintCheckDetail[] = [];
    let allHardConstraintsSatisfied = true;

    // Check hard constraints
    for (const constraint of this.hardConstraints.values()) {
      const satisfied = constraint.predicate(state, action, params);
      
      details.push({
        constraintId: constraint.id,
        description: constraint.description,
        category: constraint.category,
        severity: 'hard',
        satisfied,
      });

      if (!satisfied) {
        allHardConstraintsSatisfied = false;
        violations.push({
          constraintId: constraint.id,
          description: constraint.description,
          category: constraint.category,
          message: constraint.violationMessage,
          severity: 'hard',
        });
      }
    }

    // Check soft constraints and compute weighted score
    let totalWeight = 0;
    let weightedScore = 0;

    for (const constraint of this.softConstraints.values()) {
      const score = constraint.score(state, action, params);
      const weight = constraint.weight ?? 1.0;
      const minScore = constraint.minScore ?? 0;

      totalWeight += weight;
      weightedScore += score * weight;

      const satisfied = score >= minScore;

      details.push({
        constraintId: constraint.id,
        description: constraint.description,
        category: constraint.category,
        severity: 'soft',
        satisfied,
        score,
        weight,
      });

      if (!satisfied) {
        violations.push({
          constraintId: constraint.id,
          description: constraint.description,
          category: constraint.category,
          message: `Score ${score.toFixed(2)} below minimum ${minScore}`,
          severity: 'soft',
        });
      }
    }

    // Overall score is the weighted average of soft constraints
    const overallScore = totalWeight > 0 ? weightedScore / totalWeight : 1.0;

    return {
      satisfied: allHardConstraintsSatisfied && violations.length === 0,
      violations,
      score: overallScore,
      details,
    };
  }

  /**
   * Check if an action is allowed (all hard constraints satisfied)
   */
  isActionAllowed(
    state: WorldState,
    action: string,
    params?: Record<string, unknown>
  ): boolean {
    for (const constraint of this.hardConstraints.values()) {
      if (!constraint.predicate(state, action, params)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Get satisfaction score for an action (soft constraints only)
   * Returns a value between 0 and 1
   */
  getActionScore(
    state: WorldState,
    action: string,
    params?: Record<string, unknown>
  ): number {
    let totalWeight = 0;
    let weightedScore = 0;

    for (const constraint of this.softConstraints.values()) {
      const score = constraint.score(state, action, params);
      const weight = constraint.weight ?? 1.0;
      
      totalWeight += weight;
      weightedScore += score * weight;
    }

    return totalWeight > 0 ? weightedScore / totalWeight : 1.0;
  }

  /**
   * Clear all constraints
   */
  clear(): void {
    this.hardConstraints.clear();
    this.softConstraints.clear();
  }
}
