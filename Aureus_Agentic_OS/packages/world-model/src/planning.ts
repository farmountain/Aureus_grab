/**
 * Planning module for world-model
 * Provides APIs for querying available actions based on current state and constraints
 */

import { WorldState, DoNode } from './index';
import { ConstraintEngine, ConstraintValidationResult } from './constraints';

/**
 * Action definition with metadata
 */
export interface ActionDefinition {
  id: string;
  name: string;
  description: string;
  /**
   * Required parameters for the action
   */
  parameters?: Record<string, ActionParameter>;
  /**
   * Preconditions that must be satisfied
   */
  preconditions?: Array<(state: WorldState) => boolean>;
  /**
   * Expected effects on state
   */
  effects?: Array<{
    entityId: string;
    property: string;
    value: unknown;
  }>;
  /**
   * Estimated cost (for optimization)
   */
  cost?: number;
  /**
   * Estimated time (for optimization)
   */
  timeEstimate?: number;
  /**
   * Risk level (0-1, for optimization)
   */
  riskLevel?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Parameter definition for an action
 */
export interface ActionParameter {
  name: string;
  type: string;
  required: boolean;
  description?: string;
  defaultValue?: unknown;
}

/**
 * Result of querying available actions
 */
export interface AvailableActionsResult {
  /**
   * Actions that satisfy all hard constraints
   */
  allowed: ActionInfo[];
  /**
   * Actions blocked by hard constraints
   */
  blocked: ActionInfo[];
  /**
   * Recommended action (highest scoring allowed action)
   */
  recommended?: ActionInfo;
}

/**
 * Information about an action's availability
 */
export interface ActionInfo {
  action: ActionDefinition;
  /**
   * Whether the action is allowed (hard constraints satisfied)
   */
  allowed: boolean;
  /**
   * Score from soft constraints (0-1)
   */
  score: number;
  /**
   * Constraint validation result
   */
  validation: ConstraintValidationResult;
  /**
   * Suggested parameters for the action
   */
  suggestedParams?: Record<string, unknown>;
}

/**
 * Options for planning queries
 */
export interface PlanningOptions {
  /**
   * Filter actions by category
   */
  category?: string;
  /**
   * Filter actions by tag
   */
  tags?: string[];
  /**
   * Minimum score threshold for recommendations
   */
  minScore?: number;
  /**
   * Maximum number of actions to return
   */
  limit?: number;
  /**
   * Sort order for actions
   */
  sortBy?: 'score' | 'cost' | 'time' | 'risk';
  /**
   * Sort direction
   */
  sortDirection?: 'asc' | 'desc';
}

/**
 * PlanningEngine provides APIs for action planning with constraint checking
 */
export class PlanningEngine {
  private actions = new Map<string, ActionDefinition>();
  private constraintEngine: ConstraintEngine;

  constructor(constraintEngine: ConstraintEngine) {
    this.constraintEngine = constraintEngine;
  }

  /**
   * Register an action definition
   */
  registerAction(action: ActionDefinition): void {
    this.actions.set(action.id, action);
  }

  /**
   * Unregister an action
   */
  unregisterAction(actionId: string): boolean {
    return this.actions.delete(actionId);
  }

  /**
   * Get all registered actions
   */
  getAllActions(): ActionDefinition[] {
    return Array.from(this.actions.values());
  }

  /**
   * Get an action by ID
   */
  getAction(actionId: string): ActionDefinition | undefined {
    return this.actions.get(actionId);
  }

  /**
   * Query available actions given current state and constraints
   */
  getAvailableActions(
    state: WorldState,
    options?: PlanningOptions
  ): AvailableActionsResult {
    let actions = Array.from(this.actions.values());

    // Apply filters
    if (options?.category) {
      actions = actions.filter(a => 
        a.metadata?.category === options.category
      );
    }

    if (options?.tags && options.tags.length > 0) {
      actions = actions.filter(a => {
        const actionTags = (a.metadata?.tags as string[]) || [];
        return options.tags!.some(tag => actionTags.includes(tag));
      });
    }

    // Check each action against constraints and preconditions
    const actionInfos: ActionInfo[] = actions.map(action => {
      // Check preconditions
      const preconditionsSatisfied = action.preconditions?.every(
        precond => precond(state)
      ) ?? true;

      // Check constraints
      const validation = this.constraintEngine.validate(
        state,
        action.id,
        this.extractActionParams(action)
      );

      const allowed = preconditionsSatisfied && validation.satisfied;
      const score = validation.score ?? 1.0;

      return {
        action,
        allowed,
        score,
        validation,
        suggestedParams: this.extractActionParams(action),
      };
    });

    // Split into allowed and blocked
    const allowed = actionInfos.filter(info => info.allowed);
    const blocked = actionInfos.filter(info => !info.allowed);

    // Sort allowed actions
    let sortedAllowed = [...allowed];
    const sortBy = options?.sortBy || 'score';
    const sortDirection = options?.sortDirection || 'desc';

    sortedAllowed.sort((a, b) => {
      let aValue: number;
      let bValue: number;

      switch (sortBy) {
        case 'score':
          aValue = a.score;
          bValue = b.score;
          break;
        case 'cost':
          aValue = a.action.cost ?? 0;
          bValue = b.action.cost ?? 0;
          break;
        case 'time':
          aValue = a.action.timeEstimate ?? 0;
          bValue = b.action.timeEstimate ?? 0;
          break;
        case 'risk':
          aValue = a.action.riskLevel ?? 0;
          bValue = b.action.riskLevel ?? 0;
          break;
        default:
          aValue = a.score;
          bValue = b.score;
      }

      return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
    });

    // Apply limit
    if (options?.limit) {
      sortedAllowed = sortedAllowed.slice(0, options.limit);
    }

    // Find recommended action (highest scoring that meets minScore threshold)
    const minScore = options?.minScore ?? 0;
    const recommended = sortedAllowed.find(info => info.score >= minScore);

    return {
      allowed: sortedAllowed,
      blocked,
      recommended,
    };
  }

  /**
   * Check if a specific action is available
   */
  isActionAvailable(
    actionId: string,
    state: WorldState,
    params?: Record<string, unknown>
  ): ActionInfo | null {
    const action = this.actions.get(actionId);
    if (!action) {
      return null;
    }

    // Check preconditions
    const preconditionsSatisfied = action.preconditions?.every(
      precond => precond(state)
    ) ?? true;

    // Check constraints
    const validation = this.constraintEngine.validate(
      state,
      action.id,
      params || this.extractActionParams(action)
    );

    const allowed = preconditionsSatisfied && validation.satisfied;
    const score = validation.score ?? 1.0;

    return {
      action,
      allowed,
      score,
      validation,
      suggestedParams: params || this.extractActionParams(action),
    };
  }

  /**
   * Get recommended action based on current state
   */
  getRecommendedAction(
    state: WorldState,
    options?: PlanningOptions
  ): ActionInfo | undefined {
    const result = this.getAvailableActions(state, options);
    return result.recommended;
  }

  /**
   * Explain why an action is not available
   */
  explainActionBlockage(
    actionId: string,
    state: WorldState,
    params?: Record<string, unknown>
  ): string[] {
    const action = this.actions.get(actionId);
    if (!action) {
      return [`Action '${actionId}' not found`];
    }

    const reasons: string[] = [];

    // Check preconditions
    if (action.preconditions) {
      for (let i = 0; i < action.preconditions.length; i++) {
        if (!action.preconditions[i](state)) {
          reasons.push(`Precondition ${i + 1} not satisfied`);
        }
      }
    }

    // Check constraints
    const validation = this.constraintEngine.validate(
      state,
      action.id,
      params || this.extractActionParams(action)
    );

    for (const violation of validation.violations) {
      reasons.push(
        `${violation.severity === 'hard' ? 'Hard' : 'Soft'} constraint violated: ${violation.description}${violation.message ? ` (${violation.message})` : ''}`
      );
    }

    return reasons;
  }

  /**
   * Extract default parameters from action definition
   */
  private extractActionParams(action: ActionDefinition): Record<string, unknown> {
    if (!action.parameters) {
      return {};
    }

    const params: Record<string, unknown> = {};
    for (const [key, param] of Object.entries(action.parameters)) {
      if (param.defaultValue !== undefined) {
        params[key] = param.defaultValue;
      }
    }
    return params;
  }

  /**
   * Clear all registered actions
   */
  clear(): void {
    this.actions.clear();
  }
}
