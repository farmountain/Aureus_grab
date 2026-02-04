import {
  MitigationStrategy,
  MitigationResult,
  DeadlockDetectionResult,
  LivelockDetectionResult,
  CoordinationEvent,
  CoordinationEventType,
} from './coordination-types';
import { MultiAgentCoordinator } from './multi-agent-coordinator';
import { LivelockDetector } from './livelock-detector';

/**
 * Mitigation strategies for deadlock and livelock conditions
 * 
 * Provides three strategies:
 * 1. ABORT - Terminate one or more agents to break the deadlock/livelock
 * 2. REPLAN - Trigger replanning for affected agents
 * 3. ESCALATE - Escalate to human operator for manual resolution
 */
export class CoordinationMitigator {
  private events: CoordinationEvent[] = [];
  private escalationCallbacks: Array<(context: EscalationContext) => Promise<void>> = [];

  constructor(
    private coordinator: MultiAgentCoordinator,
    private livelockDetector: LivelockDetector
  ) {}

  /**
   * Register a callback for human escalation
   */
  onEscalation(callback: (context: EscalationContext) => Promise<void>): void {
    this.escalationCallbacks.push(callback);
  }

  /**
   * Mitigate a detected deadlock
   */
  async mitigateDeadlock(
    detection: DeadlockDetectionResult,
    strategy: MitigationStrategy = MitigationStrategy.ABORT
  ): Promise<MitigationResult> {
    if (!detection.detected || !detection.cycle) {
      return {
        strategy,
        success: false,
        affectedAgents: [],
        timestamp: new Date(),
        reason: 'No deadlock detected',
      };
    }

    this.logEvent({
      type: CoordinationEventType.MITIGATION_STARTED,
      timestamp: new Date(),
      agentId: 'system',
      workflowId: 'system',
      data: {
        strategy,
        type: 'deadlock',
        cycle: detection.cycle,
        affectedResources: detection.affectedResources,
      },
    });

    let result: MitigationResult;

    switch (strategy) {
      case MitigationStrategy.ABORT:
        result = await this.abortDeadlockedAgents(detection);
        break;
      case MitigationStrategy.REPLAN:
        result = await this.replanDeadlockedAgents(detection);
        break;
      case MitigationStrategy.ESCALATE:
        result = await this.escalateDeadlock(detection);
        break;
      default:
        result = {
          strategy,
          success: false,
          affectedAgents: detection.cycle,
          timestamp: new Date(),
          reason: `Unknown strategy: ${strategy}`,
        };
    }

    this.logEvent({
      type: result.success
        ? CoordinationEventType.MITIGATION_COMPLETED
        : CoordinationEventType.MITIGATION_FAILED,
      timestamp: new Date(),
      agentId: 'system',
      workflowId: 'system',
      data: {
        strategy,
        type: 'deadlock',
        success: result.success,
        affectedAgents: result.affectedAgents,
        reason: result.reason,
      },
    });

    return result;
  }

  /**
   * Mitigate a detected livelock
   */
  async mitigateLivelock(
    detection: LivelockDetectionResult,
    strategy: MitigationStrategy = MitigationStrategy.REPLAN
  ): Promise<MitigationResult> {
    if (!detection.detected) {
      return {
        strategy,
        success: false,
        affectedAgents: [],
        timestamp: new Date(),
        reason: 'No livelock detected',
      };
    }

    this.logEvent({
      type: CoordinationEventType.MITIGATION_STARTED,
      timestamp: new Date(),
      agentId: 'system',
      workflowId: 'system',
      data: {
        strategy,
        type: 'livelock',
        agentIds: detection.agentIds,
        pattern: detection.repeatedPattern,
        iterationCount: detection.iterationCount,
      },
    });

    let result: MitigationResult;

    switch (strategy) {
      case MitigationStrategy.ABORT:
        result = await this.abortLivelockedAgents(detection);
        break;
      case MitigationStrategy.REPLAN:
        result = await this.replanLivelockedAgents(detection);
        break;
      case MitigationStrategy.ESCALATE:
        result = await this.escalateLivelock(detection);
        break;
      default:
        result = {
          strategy,
          success: false,
          affectedAgents: detection.agentIds,
          timestamp: new Date(),
          reason: `Unknown strategy: ${strategy}`,
        };
    }

    this.logEvent({
      type: result.success
        ? CoordinationEventType.MITIGATION_COMPLETED
        : CoordinationEventType.MITIGATION_FAILED,
      timestamp: new Date(),
      agentId: 'system',
      workflowId: 'system',
      data: {
        strategy,
        type: 'livelock',
        success: result.success,
        affectedAgents: result.affectedAgents,
        reason: result.reason,
      },
    });

    return result;
  }

  /**
   * Abort strategy: Release locks and mark agents as aborted
   */
  private async abortDeadlockedAgents(
    detection: DeadlockDetectionResult
  ): Promise<MitigationResult> {
    if (!detection.cycle) {
      return {
        strategy: MitigationStrategy.ABORT,
        success: false,
        affectedAgents: [],
        timestamp: new Date(),
        reason: 'No cycle information available',
      };
    }

    // Choose victim: abort the agent with the most resources held
    const victim = this.selectVictimAgent(detection.cycle);
    
    // Release all locks held by the victim
    const dependencies = this.coordinator.getDependencies();
    const victimDep = dependencies.get(victim);
    
    if (victimDep) {
      for (const resourceId of victimDep.heldResources) {
        await this.coordinator.releaseLock(resourceId, victim, 'system');
      }
    }

    return {
      strategy: MitigationStrategy.ABORT,
      success: true,
      affectedAgents: [victim],
      timestamp: new Date(),
      reason: `Aborted agent ${victim} to break deadlock cycle`,
      metadata: { cycle: detection.cycle, resources: victimDep?.heldResources || [] },
    };
  }

  /**
   * Abort strategy for livelock: Clear state and abort agents
   */
  private async abortLivelockedAgents(
    detection: LivelockDetectionResult
  ): Promise<MitigationResult> {
    // Abort all agents in livelock
    for (const agentId of detection.agentIds) {
      this.livelockDetector.clearAgentHistory(agentId);
    }

    return {
      strategy: MitigationStrategy.ABORT,
      success: true,
      affectedAgents: detection.agentIds,
      timestamp: new Date(),
      reason: `Aborted ${detection.agentIds.length} agents to break livelock`,
      metadata: { pattern: detection.repeatedPattern, iterationCount: detection.iterationCount },
    };
  }

  /**
   * Replan strategy: Signal agents to replan their tasks
   */
  private async replanDeadlockedAgents(
    detection: DeadlockDetectionResult
  ): Promise<MitigationResult> {
    if (!detection.cycle) {
      return {
        strategy: MitigationStrategy.REPLAN,
        success: false,
        affectedAgents: [],
        timestamp: new Date(),
        reason: 'No cycle information available',
      };
    }

    // Select one agent to replan (the one with fewest resources)
    const agentToReplan = this.selectReplanAgent(detection.cycle);
    
    // In a real system, this would trigger a replan workflow
    // For now, we release locks and mark for replan
    const dependencies = this.coordinator.getDependencies();
    const dep = dependencies.get(agentToReplan);
    
    if (dep) {
      for (const resourceId of dep.heldResources) {
        await this.coordinator.releaseLock(resourceId, agentToReplan, 'system');
      }
    }

    return {
      strategy: MitigationStrategy.REPLAN,
      success: true,
      affectedAgents: [agentToReplan],
      timestamp: new Date(),
      reason: `Triggered replan for agent ${agentToReplan}`,
      metadata: { cycle: detection.cycle },
    };
  }

  /**
   * Replan strategy for livelock: Trigger replanning for affected agents
   */
  private async replanLivelockedAgents(
    detection: LivelockDetectionResult
  ): Promise<MitigationResult> {
    // Clear state history to allow fresh start
    for (const agentId of detection.agentIds) {
      this.livelockDetector.clearAgentHistory(agentId);
    }

    return {
      strategy: MitigationStrategy.REPLAN,
      success: true,
      affectedAgents: detection.agentIds,
      timestamp: new Date(),
      reason: `Triggered replan for ${detection.agentIds.length} agents`,
      metadata: { pattern: detection.repeatedPattern },
    };
  }

  /**
   * Escalate strategy: Notify human operator
   */
  private async escalateDeadlock(
    detection: DeadlockDetectionResult
  ): Promise<MitigationResult> {
    const context: EscalationContext = {
      type: 'deadlock',
      timestamp: new Date(),
      details: {
        cycle: detection.cycle || [],
        affectedResources: detection.affectedResources,
      },
      suggestedActions: [
        'Abort one or more agents in the cycle',
        'Manually release locks on affected resources',
        'Restart affected workflows',
      ],
    };

    // Trigger escalation callbacks
    for (const callback of this.escalationCallbacks) {
      try {
        await callback(context);
      } catch (error) {
        console.error('Escalation callback failed:', error);
      }
    }

    return {
      strategy: MitigationStrategy.ESCALATE,
      success: true,
      affectedAgents: detection.cycle || [],
      timestamp: new Date(),
      reason: 'Escalated deadlock to human operator',
      metadata: { escalationContext: context },
    };
  }

  /**
   * Escalate strategy for livelock: Notify human operator
   */
  private async escalateLivelock(
    detection: LivelockDetectionResult
  ): Promise<MitigationResult> {
    const context: EscalationContext = {
      type: 'livelock',
      timestamp: new Date(),
      details: {
        agentIds: detection.agentIds,
        repeatedPattern: detection.repeatedPattern,
        iterationCount: detection.iterationCount,
      },
      suggestedActions: [
        'Review agent state and task definitions',
        'Adjust coordination policies',
        'Abort and restart affected agents',
      ],
    };

    // Trigger escalation callbacks
    for (const callback of this.escalationCallbacks) {
      try {
        await callback(context);
      } catch (error) {
        console.error('Escalation callback failed:', error);
      }
    }

    return {
      strategy: MitigationStrategy.ESCALATE,
      success: true,
      affectedAgents: detection.agentIds,
      timestamp: new Date(),
      reason: 'Escalated livelock to human operator',
      metadata: { escalationContext: context },
    };
  }

  /**
   * Select victim agent for abort (agent holding most resources)
   */
  private selectVictimAgent(cycle: string[]): string {
    const dependencies = this.coordinator.getDependencies();
    let maxResources = -1;
    let victim = cycle[0];

    for (const agentId of cycle) {
      const dep = dependencies.get(agentId);
      if (dep && dep.heldResources.length > maxResources) {
        maxResources = dep.heldResources.length;
        victim = agentId;
      }
    }

    return victim;
  }

  /**
   * Select agent for replan (agent holding fewest resources)
   */
  private selectReplanAgent(cycle: string[]): string {
    const dependencies = this.coordinator.getDependencies();
    let minResources = Infinity;
    let agent = cycle[0];

    for (const agentId of cycle) {
      const dep = dependencies.get(agentId);
      const resourceCount = dep ? dep.heldResources.length : 0;
      if (resourceCount < minResources) {
        minResources = resourceCount;
        agent = agentId;
      }
    }

    return agent;
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
}

/**
 * Context for human escalation
 */
export interface EscalationContext {
  type: 'deadlock' | 'livelock';
  timestamp: Date;
  details: Record<string, unknown>;
  suggestedActions: string[];
}
