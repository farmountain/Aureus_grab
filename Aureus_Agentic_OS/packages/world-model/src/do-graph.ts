/**
 * Do-Graph implementation for causal reasoning
 * Tracks actions, their effects, and causal dependencies
 */

/**
 * Action node representing a tool call or step
 */
export interface ActionNode {
  id: string;
  type: 'action';
  name: string;
  toolCall?: string;
  inputs?: Record<string, unknown>;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Effect node representing a state diff
 */
export interface EffectNode {
  id: string;
  type: 'effect';
  description: string;
  stateDiff: {
    key: string;
    before: unknown;
    after: unknown;
  };
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Graph node can be either an action or an effect
 */
export type GraphNode = ActionNode | EffectNode;

/**
 * Edge types in the do-graph
 */
export type EdgeType = 'causes' | 'enables';

/**
 * Edge connecting nodes in the causal graph
 */
export interface GraphEdge {
  id: string;
  from: string; // node id
  to: string;   // node id
  type: EdgeType;
  timestamp: Date;
}

/**
 * Entry in the append-only graph log
 */
export interface GraphLogEntry {
  id: string;
  eventId: string; // reference to external event
  timestamp: Date;
  operation: 'add_node' | 'add_edge';
  node?: GraphNode;
  edge?: GraphEdge;
}

/**
 * Result of a why() query
 */
export interface CausalChain {
  effect: EffectNode;
  actions: ActionNode[];
  path: GraphNode[];
}

/**
 * Result of a what_if() query
 */
export interface ImpactAnalysis {
  removedAction: ActionNode;
  directEffects: EffectNode[];
  indirectEffects: EffectNode[];
  impactedActions: ActionNode[];
}

/**
 * DoGraph implements a causal graph for tracking actions and effects
 */
export class DoGraph {
  private nodes = new Map<string, GraphNode>();
  private edges = new Map<string, GraphEdge>();
  private log: GraphLogEntry[] = [];
  private logCounter = 0;
  private edgeCounter = 0;

  // Adjacency lists for efficient traversal
  private outgoing = new Map<string, Set<string>>(); // nodeId -> set of edge ids
  private incoming = new Map<string, Set<string>>(); // nodeId -> set of edge ids

  /**
   * Add an action node to the graph
   */
  addAction(action: Omit<ActionNode, 'type'>, eventId: string): ActionNode {
    const node: ActionNode = {
      ...action,
      type: 'action',
    };

    this.nodes.set(node.id, node);
    this.log.push({
      id: `log-${++this.logCounter}`,
      eventId,
      timestamp: new Date(),
      operation: 'add_node',
      node,
    });

    return node;
  }

  /**
   * Add an effect node to the graph
   */
  addEffect(effect: Omit<EffectNode, 'type'>, eventId: string): EffectNode {
    const node: EffectNode = {
      ...effect,
      type: 'effect',
    };

    this.nodes.set(node.id, node);
    this.log.push({
      id: `log-${++this.logCounter}`,
      eventId,
      timestamp: new Date(),
      operation: 'add_node',
      node,
    });

    return node;
  }

  /**
   * Link an action to an effect it causes
   */
  linkActionToEffect(actionId: string, effectId: string, eventId: string): GraphEdge {
    return this.addEdge(actionId, effectId, 'causes', eventId);
  }

  /**
   * Link an effect to a subsequent action it enables
   */
  linkEffectToAction(effectId: string, actionId: string, eventId: string): GraphEdge {
    return this.addEdge(effectId, actionId, 'enables', eventId);
  }

  /**
   * Add an edge to the graph
   */
  private addEdge(from: string, to: string, type: EdgeType, eventId: string): GraphEdge {
    if (!this.nodes.has(from)) {
      throw new Error(`Source node ${from} not found`);
    }
    if (!this.nodes.has(to)) {
      throw new Error(`Target node ${to} not found`);
    }

    const edge: GraphEdge = {
      id: `edge-${++this.edgeCounter}`,
      from,
      to,
      type,
      timestamp: new Date(),
    };

    this.edges.set(edge.id, edge);

    // Update adjacency lists
    if (!this.outgoing.has(from)) {
      this.outgoing.set(from, new Set());
    }
    this.outgoing.get(from)!.add(edge.id);

    if (!this.incoming.has(to)) {
      this.incoming.set(to, new Set());
    }
    this.incoming.get(to)!.add(edge.id);

    this.log.push({
      id: `log-${++this.logCounter}`,
      eventId,
      timestamp: new Date(),
      operation: 'add_edge',
      edge,
    });

    return edge;
  }

  /**
   * Get a node by ID
   */
  getNode(nodeId: string): GraphNode | undefined {
    return this.nodes.get(nodeId);
  }

  /**
   * Get all nodes
   */
  getAllNodes(): GraphNode[] {
    return Array.from(this.nodes.values());
  }

  /**
   * Get all edges
   */
  getAllEdges(): GraphEdge[] {
    return Array.from(this.edges.values());
  }

  /**
   * Get the append-only log
   */
  getLog(): GraphLogEntry[] {
    return [...this.log];
  }

  /**
   * Query: why did this effect occur?
   * Returns the chain of actions that caused it
   */
  why(effectId: string): CausalChain | null {
    const effectNode = this.nodes.get(effectId);
    if (!effectNode || effectNode.type !== 'effect') {
      return null;
    }

    const pathNodes = new Map<string, GraphNode>();
    const visited = new Set<string>();

    // Trace back through incoming edges (BFS)
    const queue: string[] = [effectId];
    visited.add(effectId);
    pathNodes.set(effectId, effectNode);

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      const incomingEdges = this.incoming.get(currentId);

      if (!incomingEdges) continue;

      for (const edgeId of incomingEdges) {
        const edge = this.edges.get(edgeId);
        if (!edge) continue;

        // For effects, we care about "causes" edges (action -> effect)
        // For actions, we care about "enables" edges (effect -> action)
        const currentNode = this.nodes.get(currentId);
        if (!currentNode) continue;

        let shouldFollow = false;
        if (currentNode.type === 'effect' && edge.type === 'causes') {
          shouldFollow = true;
        } else if (currentNode.type === 'action' && edge.type === 'enables') {
          shouldFollow = true;
        }

        if (!shouldFollow) continue;

        const sourceNode = this.nodes.get(edge.from);
        if (!sourceNode || visited.has(sourceNode.id)) continue;

        visited.add(sourceNode.id);
        pathNodes.set(sourceNode.id, sourceNode);

        queue.push(sourceNode.id);
      }
    }

    // Reconstruct path in correct order (topological)
    const path = this.reconstructPath(effectId, pathNodes);

    // Extract actions in order
    const actions = path.filter(node => node.type === 'action') as ActionNode[];

    return {
      effect: effectNode as EffectNode,
      actions,
      path,
    };
  }

  /**
   * Reconstruct causal path from root actions to target effect
   */
  private reconstructPath(targetId: string, nodes: Map<string, GraphNode>): GraphNode[] {
    // Build dependency graph from the nodes we visited
    const deps = new Map<string, string[]>();
    
    for (const nodeId of nodes.keys()) {
      const incoming = this.incoming.get(nodeId);
      if (!incoming) continue;

      for (const edgeId of incoming) {
        const edge = this.edges.get(edgeId);
        if (!edge || !nodes.has(edge.from)) continue;

        if (!deps.has(nodeId)) {
          deps.set(nodeId, []);
        }
        deps.get(nodeId)!.push(edge.from);
      }
    }

    // Topological sort to get correct order
    const sorted: string[] = [];
    const visited = new Set<string>();
    
    const visit = (nodeId: string) => {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);

      const dependencies = deps.get(nodeId);
      if (dependencies) {
        for (const depId of dependencies) {
          if (nodes.has(depId)) {
            visit(depId);
          }
        }
      }

      sorted.push(nodeId);
    };

    visit(targetId);

    return sorted.map(id => nodes.get(id)!);
  }

  /**
   * Query: what if this action is removed?
   * Returns best-effort estimate of impacted effects and downstream actions
   */
  whatIf(actionId: string): ImpactAnalysis | null {
    const actionNode = this.nodes.get(actionId);
    if (!actionNode || actionNode.type !== 'action') {
      return null;
    }

    const directEffects: EffectNode[] = [];
    const indirectEffects: EffectNode[] = [];
    const impactedActions: ActionNode[] = [];
    const visited = new Set<string>();

    // Find all effects caused by this action (direct effects)
    const outgoingEdges = this.outgoing.get(actionId);
    if (outgoingEdges) {
      for (const edgeId of outgoingEdges) {
        const edge = this.edges.get(edgeId);
        if (!edge || edge.type !== 'causes') continue;

        const targetNode = this.nodes.get(edge.to);
        if (targetNode && targetNode.type === 'effect') {
          directEffects.push(targetNode);
          visited.add(targetNode.id);
        }
      }
    }

    // Find downstream impacts (BFS from direct effects)
    const queue: string[] = directEffects.map(e => e.id);

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      const edges = this.outgoing.get(currentId);

      if (!edges) continue;

      for (const edgeId of edges) {
        const edge = this.edges.get(edgeId);
        if (!edge || edge.type !== 'enables') continue;

        const targetNode = this.nodes.get(edge.to);
        if (!targetNode || visited.has(targetNode.id)) continue;

        visited.add(targetNode.id);

        if (targetNode.type === 'action') {
          impactedActions.push(targetNode);
          // Continue to find effects of impacted actions
          const actionEdges = this.outgoing.get(targetNode.id);
          if (actionEdges) {
            for (const actionEdgeId of actionEdges) {
              const actionEdge = this.edges.get(actionEdgeId);
              if (!actionEdge || actionEdge.type !== 'causes') continue;

              const effectNode = this.nodes.get(actionEdge.to);
              if (effectNode && effectNode.type === 'effect' && !visited.has(effectNode.id)) {
                indirectEffects.push(effectNode);
                visited.add(effectNode.id);
                queue.push(effectNode.id);
              }
            }
          }
        }
      }
    }

    return {
      removedAction: actionNode as ActionNode,
      directEffects,
      indirectEffects,
      impactedActions,
    };
  }
}
