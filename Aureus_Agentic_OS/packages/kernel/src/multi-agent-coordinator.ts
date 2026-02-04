import {
  ResourceLock,
  AgentDependency,
  CoordinationPolicy,
  CoordinationPolicyType,
  DeadlockDetectionResult,
  CoordinationEvent,
  CoordinationEventType,
} from './coordination-types';

/**
 * Coordinator for managing multi-agent resource access with deadlock detection
 * 
 * Key features:
 * - Resource locking with exclusive/shared policies
 * - Dependency graph tracking
 * - Cycle detection for deadlock identification
 * - Timeout-based detection
 */
export class MultiAgentCoordinator {
  private locks: Map<string, ResourceLock[]> = new Map(); // resourceId -> locks
  private dependencies: Map<string, AgentDependency> = new Map(); // agentId -> dependency
  private policies: Map<string, CoordinationPolicy> = new Map(); // resourceId -> policy
  private events: CoordinationEvent[] = [];
  private timeoutCheckerInterval?: NodeJS.Timeout;

  constructor(
    private defaultLockTimeout: number = 30000, // 30 seconds default
    private enableTimeoutChecker: boolean = true
  ) {
    if (this.enableTimeoutChecker) {
      this.startTimeoutChecker();
    }
  }

  /**
   * Register a coordination policy for a resource
   */
  registerPolicy(policy: CoordinationPolicy): void {
    this.policies.set(policy.resourceId, policy);
  }

  /**
   * Acquire a lock on a resource
   * Returns true if lock acquired, false if blocked
   */
  async acquireLock(
    resourceId: string,
    agentId: string,
    workflowId: string,
    lockType: 'read' | 'write' = 'write'
  ): Promise<boolean> {
    const policy = this.policies.get(resourceId) || {
      type: CoordinationPolicyType.EXCLUSIVE,
      resourceId,
      lockTimeout: this.defaultLockTimeout,
    };

    // Check if lock can be acquired based on policy
    const existingLocks = this.locks.get(resourceId) || [];
    const canAcquire = this.canAcquireLock(existingLocks, lockType, policy);

    if (!canAcquire) {
      // Update dependency tracking - this agent is waiting
      this.updateDependency(agentId, workflowId, resourceId, existingLocks);
      return false;
    }

    // Acquire the lock
    const lock: ResourceLock = {
      resourceId,
      agentId,
      lockType,
      acquiredAt: new Date(),
      expiresAt: policy.lockTimeout
        ? new Date(Date.now() + policy.lockTimeout)
        : undefined,
    };

    const locks = this.locks.get(resourceId) || [];
    locks.push(lock);
    this.locks.set(resourceId, locks);

    // Update dependency - agent now holds this resource
    const dependency = this.dependencies.get(agentId) || {
      agentId,
      waitingFor: [],
      heldResources: [],
      requestedResources: [],
      timestamp: new Date(),
    };
    dependency.heldResources.push(resourceId);
    dependency.requestedResources = dependency.requestedResources.filter(
      (r) => r !== resourceId
    );
    this.dependencies.set(agentId, dependency);

    // Log event
    this.logEvent({
      type: CoordinationEventType.LOCK_ACQUIRED,
      timestamp: new Date(),
      agentId,
      workflowId,
      resourceId,
      data: { lockType, expiresAt: lock.expiresAt },
    });

    return true;
  }

  /**
   * Release a lock on a resource
   */
  async releaseLock(
    resourceId: string,
    agentId: string,
    workflowId: string
  ): Promise<void> {
    const locks = this.locks.get(resourceId) || [];
    const updatedLocks = locks.filter((lock) => lock.agentId !== agentId);
    
    if (updatedLocks.length === 0) {
      this.locks.delete(resourceId);
    } else {
      this.locks.set(resourceId, updatedLocks);
    }

    // Update dependency
    const dependency = this.dependencies.get(agentId);
    if (dependency) {
      dependency.heldResources = dependency.heldResources.filter(
        (r) => r !== resourceId
      );
      if (
        dependency.heldResources.length === 0 &&
        dependency.requestedResources.length === 0
      ) {
        this.dependencies.delete(agentId);
      }
    }

    // Log event
    this.logEvent({
      type: CoordinationEventType.LOCK_RELEASED,
      timestamp: new Date(),
      agentId,
      workflowId,
      resourceId,
    });
  }

  /**
   * Detect deadlocks using cycle detection in the wait-for graph
   */
  detectDeadlock(): DeadlockDetectionResult {
    const waitForGraph = this.buildWaitForGraph();
    const cycle = this.detectCycle(waitForGraph);

    if (cycle.length > 0) {
      const affectedResources = this.getAffectedResources(cycle);
      
      // Log deadlock detection event
      for (const agentId of cycle) {
        const dependency = this.dependencies.get(agentId);
        if (dependency) {
          this.logEvent({
            type: CoordinationEventType.DEADLOCK_DETECTED,
            timestamp: new Date(),
            agentId,
            workflowId: 'system', // System-level detection
            data: { cycle, affectedResources },
          });
        }
      }

      return {
        detected: true,
        cycle,
        timestamp: new Date(),
        affectedResources,
      };
    }

    return {
      detected: false,
      timestamp: new Date(),
      affectedResources: [],
    };
  }

  /**
   * Check if an agent can acquire a lock based on policy
   */
  private canAcquireLock(
    existingLocks: ResourceLock[],
    lockType: 'read' | 'write',
    policy: CoordinationPolicy
  ): boolean {
    if (existingLocks.length === 0) {
      return true;
    }

    switch (policy.type) {
      case CoordinationPolicyType.EXCLUSIVE:
        return false; // Any existing lock blocks acquisition

      case CoordinationPolicyType.SHARED:
        if (lockType === 'write') {
          return false; // Write locks are always exclusive
        }
        // Read locks can be shared
        const hasWriteLock = existingLocks.some((l) => l.lockType === 'write');
        if (hasWriteLock) {
          return false;
        }
        const maxConcurrent = policy.maxConcurrentAccess || Infinity;
        return existingLocks.length < maxConcurrent;

      case CoordinationPolicyType.ORDERED:
      case CoordinationPolicyType.PRIORITY:
        // For ordered/priority, implement based on priorityOrder
        // Simplified: allow if no conflicts
        return existingLocks.length === 0;

      default:
        return false;
    }
  }

  /**
   * Update dependency tracking when an agent waits for a resource
   */
  private updateDependency(
    agentId: string,
    workflowId: string,
    resourceId: string,
    existingLocks: ResourceLock[]
  ): void {
    const dependency = this.dependencies.get(agentId) || {
      agentId,
      waitingFor: [],
      heldResources: [],
      requestedResources: [],
      timestamp: new Date(),
    };

    // Add resource to requested list
    if (!dependency.requestedResources.includes(resourceId)) {
      dependency.requestedResources.push(resourceId);
    }

    // Add agents holding the resource to waitingFor
    for (const lock of existingLocks) {
      if (!dependency.waitingFor.includes(lock.agentId)) {
        dependency.waitingFor.push(lock.agentId);
      }
    }

    this.dependencies.set(agentId, dependency);
  }

  /**
   * Build wait-for graph from dependencies
   * Returns adjacency list: agentId -> [agentIds it's waiting for]
   */
  private buildWaitForGraph(): Map<string, string[]> {
    const graph = new Map<string, string[]>();
    
    for (const [agentId, dependency] of this.dependencies) {
      graph.set(agentId, dependency.waitingFor);
    }
    
    return graph;
  }

  /**
   * Detect cycle in directed graph using DFS
   * Returns the cycle if found, empty array otherwise
   */
  private detectCycle(graph: Map<string, string[]>): string[] {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const path: string[] = [];

    for (const node of graph.keys()) {
      if (!visited.has(node)) {
        const cycle = this.dfs(node, graph, visited, recursionStack, path);
        if (cycle.length > 0) {
          return cycle;
        }
      }
    }

    return [];
  }

  /**
   * DFS helper for cycle detection
   */
  private dfs(
    node: string,
    graph: Map<string, string[]>,
    visited: Set<string>,
    recursionStack: Set<string>,
    path: string[]
  ): string[] {
    visited.add(node);
    recursionStack.add(node);
    path.push(node);

    const neighbors = graph.get(node) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        const cycle = this.dfs(neighbor, graph, visited, recursionStack, path);
        if (cycle.length > 0) {
          return cycle;
        }
      } else if (recursionStack.has(neighbor)) {
        // Found a cycle
        const cycleStart = path.indexOf(neighbor);
        return path.slice(cycleStart);
      }
    }

    recursionStack.delete(node);
    path.pop();
    return [];
  }

  /**
   * Get resources affected by agents in a deadlock cycle
   */
  private getAffectedResources(cycle: string[]): string[] {
    const resources = new Set<string>();
    
    for (const agentId of cycle) {
      const dependency = this.dependencies.get(agentId);
      if (dependency) {
        dependency.heldResources.forEach((r) => resources.add(r));
        dependency.requestedResources.forEach((r) => resources.add(r));
      }
    }
    
    return Array.from(resources);
  }

  /**
   * Start periodic timeout checker
   */
  private startTimeoutChecker(): void {
    this.timeoutCheckerInterval = setInterval(() => {
      this.checkTimeouts();
    }, 5000); // Check every 5 seconds
  }

  /**
   * Check for timed-out locks and release them
   */
  private checkTimeouts(): void {
    const now = new Date();
    
    for (const [resourceId, locks] of this.locks) {
      const validLocks = locks.filter((lock) => {
        if (lock.expiresAt && lock.expiresAt < now) {
          // Lock has expired
          this.logEvent({
            type: CoordinationEventType.LOCK_TIMEOUT,
            timestamp: now,
            agentId: lock.agentId,
            workflowId: 'system',
            resourceId,
            data: { acquiredAt: lock.acquiredAt, expiresAt: lock.expiresAt },
          });
          return false;
        }
        return true;
      });

      if (validLocks.length === 0) {
        this.locks.delete(resourceId);
      } else if (validLocks.length < locks.length) {
        this.locks.set(resourceId, validLocks);
      }
    }
  }

  /**
   * Log a coordination event
   */
  private logEvent(event: CoordinationEvent): void {
    this.events.push(event);
  }

  /**
   * Get all coordination events
   */
  getEvents(): CoordinationEvent[] {
    return [...this.events];
  }

  /**
   * Get current locks
   */
  getLocks(): Map<string, ResourceLock[]> {
    return new Map(this.locks);
  }

  /**
   * Get current dependencies
   */
  getDependencies(): Map<string, AgentDependency> {
    return new Map(this.dependencies);
  }

  /**
   * Cleanup - stop timeout checker
   */
  shutdown(): void {
    if (this.timeoutCheckerInterval) {
      clearInterval(this.timeoutCheckerInterval);
    }
  }
}
