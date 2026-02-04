// Export state store types and implementations
export * from './state-store';

// Export do-graph types and implementations
export * from './do-graph';

// Export constraint system
export * from './constraints';
export * from './domain-constraints';
export * from './constraint-packs';

// Export planning engine
export * from './planning';

// Export latent state representation
export * from './latent-state';

// Export world model specification schema
export * from './world-model-spec-schema';

/**
 * World state representation
 */
export interface WorldState {
  id: string;
  entities: Map<string, Entity>;
  relationships: Relationship[];
  constraints: Constraint[];
  timestamp: Date;
}

/**
 * Entity in the world model
 */
export interface Entity {
  id: string;
  type: string;
  properties: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

/**
 * Relationship between entities
 */
export interface Relationship {
  id: string;
  source: string;
  target: string;
  type: string;
  properties?: Record<string, unknown>;
}

/**
 * Constraint on world state
 */
export interface Constraint {
  id: string;
  type: 'invariant' | 'precondition' | 'postcondition';
  predicate: (state: WorldState) => boolean;
  description: string;
}

/**
 * Do-graph node representing an action and its causal effects
 */
export interface DoNode {
  id: string;
  action: string;
  preconditions: Constraint[];
  effects: Effect[];
  metadata?: Record<string, unknown>;
}

/**
 * Effect of an action on world state
 */
export interface Effect {
  entityId: string;
  property: string;
  value: unknown;
}

/**
 * WorldModel manages state and causal reasoning
 */
export class WorldModel {
  private state: WorldState;
  private doGraph: Map<string, DoNode> = new Map();

  constructor(initialState: WorldState) {
    this.state = initialState;
  }

  /**
   * Get do-graph nodes
   */
  getDoGraph(): Map<string, DoNode> {
    return new Map(this.doGraph);
  }

  /**
   * Get current world state
   */
  getState(): WorldState {
    return { ...this.state };
  }

  /**
   * Add entity to world model
   */
  addEntity(entity: Entity): void {
    this.state.entities.set(entity.id, entity);
  }

  /**
   * Add relationship between entities
   */
  addRelationship(relationship: Relationship): void {
    this.state.relationships.push(relationship);
  }

  /**
   * Add constraint to world model
   */
  addConstraint(constraint: Constraint): void {
    this.state.constraints.push(constraint);
  }

  /**
   * Validate that all constraints are satisfied
   */
  validateConstraints(): boolean {
    for (const constraint of this.state.constraints) {
      if (!constraint.predicate(this.state)) {
        console.log(`Constraint violated: ${constraint.description}`);
        return false;
      }
    }
    return true;
  }

  /**
   * Add action to do-graph
   */
  addDoNode(node: DoNode): void {
    this.doGraph.set(node.id, node);
  }

  /**
   * Simulate action and check if preconditions are met
   */
  canExecuteAction(actionId: string): boolean {
    const node = this.doGraph.get(actionId);
    if (!node) return false;

    for (const precondition of node.preconditions) {
      if (!precondition.predicate(this.state)) {
        console.log(`Precondition failed: ${precondition.description}`);
        return false;
      }
    }

    return true;
  }

  /**
   * Apply action effects to world state
   */
  applyAction(actionId: string): boolean {
    const node = this.doGraph.get(actionId);
    if (!node || !this.canExecuteAction(actionId)) {
      return false;
    }

    for (const effect of node.effects) {
      const entity = this.state.entities.get(effect.entityId);
      if (entity) {
        entity.properties[effect.property] = effect.value;
      }
    }

    this.state.timestamp = new Date();
    return true;
  }
}
