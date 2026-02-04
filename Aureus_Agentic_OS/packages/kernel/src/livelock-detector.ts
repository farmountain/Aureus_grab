import {
  AgentState,
  LivelockDetectionResult,
  CoordinationEvent,
  CoordinationEventType,
} from './coordination-types';
import * as crypto from 'crypto';

/**
 * Detector for identifying livelock conditions in multi-agent systems
 * 
 * Livelock occurs when agents are actively changing state but making no progress
 * towards their goals. This detector identifies:
 * - Repeated state patterns
 * - Lack of forward progress
 * - Cyclic behavior without advancement
 */
export class LivelockDetector {
  private stateHistory: Map<string, AgentState[]> = new Map(); // agentId -> state history
  private events: CoordinationEvent[] = [];
  
  constructor(
    private windowSize: number = 10, // Number of states to track
    private patternThreshold: number = 3, // Repeated pattern count to trigger detection
    private progressTimeout: number = 60000 // Time without progress (ms) to consider livelock
  ) {}

  /**
   * Record agent state for livelock detection
   */
  recordState(
    agentId: string,
    workflowId: string,
    taskId: string,
    stateData: Record<string, unknown>
  ): void {
    const stateHash = this.computeStateHash(stateData);
    
    const state: AgentState = {
      agentId,
      workflowId,
      taskId,
      stateHash,
      timestamp: new Date(),
      metadata: stateData,
    };

    const history = this.stateHistory.get(agentId) || [];
    history.push(state);

    // Keep only last windowSize states
    if (history.length > this.windowSize) {
      history.shift();
    }

    this.stateHistory.set(agentId, history);
  }

  /**
   * Detect livelock conditions across all tracked agents
   */
  detectLivelock(): LivelockDetectionResult {
    const livelockAgents: string[] = [];
    const patterns: string[] = [];

    for (const [agentId, history] of this.stateHistory) {
      if (history.length < this.patternThreshold * 2) {
        continue; // Not enough history
      }

      // Check for repeated state patterns
      const pattern = this.detectRepeatedPattern(history);
      if (pattern) {
        livelockAgents.push(agentId);
        patterns.push(`Agent ${agentId}: ${pattern.description}`);

        // Log livelock detection event
        this.logEvent({
          type: CoordinationEventType.LIVELOCK_DETECTED,
          timestamp: new Date(),
          agentId,
          workflowId: history[history.length - 1].workflowId,
          data: {
            pattern: pattern.description,
            iterationCount: pattern.iterationCount,
            states: pattern.states,
          },
        });
      }

      // Check for lack of progress
      const lackOfProgress = this.detectLackOfProgress(history);
      if (lackOfProgress && !livelockAgents.includes(agentId)) {
        livelockAgents.push(agentId);
        patterns.push(`Agent ${agentId}: No progress for ${lackOfProgress}ms`);

        this.logEvent({
          type: CoordinationEventType.LIVELOCK_DETECTED,
          timestamp: new Date(),
          agentId,
          workflowId: history[history.length - 1].workflowId,
          data: {
            pattern: 'No progress',
            duration: lackOfProgress,
          },
        });
      }
    }

    if (livelockAgents.length > 0) {
      return {
        detected: true,
        agentIds: livelockAgents,
        repeatedPattern: patterns.join('; '),
        timestamp: new Date(),
        iterationCount: this.patternThreshold,
      };
    }

    return {
      detected: false,
      agentIds: [],
      repeatedPattern: '',
      timestamp: new Date(),
      iterationCount: 0,
    };
  }

  /**
   * Detect repeated state patterns in agent history
   */
  private detectRepeatedPattern(
    history: AgentState[]
  ): { description: string; iterationCount: number; states: string[] } | null {
    // Look for cyclic patterns of length 2, 3, 4, etc.
    for (let patternLength = 2; patternLength <= Math.floor(history.length / 2); patternLength++) {
      const pattern = history.slice(-patternLength).map((s) => s.stateHash);
      const fullPattern = pattern.join(',');
      
      // Count how many times this pattern repeats at the end of history
      let repeatCount = 1; // Start at 1 for the current pattern
      let currentIndex = history.length - patternLength - 1;
      
      while (currentIndex >= patternLength - 1) {
        const checkPattern = history
          .slice(currentIndex - patternLength + 1, currentIndex + 1)
          .map((s) => s.stateHash)
          .join(',');
        
        if (checkPattern === fullPattern) {
          repeatCount++;
          currentIndex -= patternLength;
        } else {
          break;
        }
      }

      if (repeatCount >= this.patternThreshold) {
        return {
          description: `Repeated ${patternLength}-state pattern ${repeatCount} times`,
          iterationCount: repeatCount,
          states: pattern,
        };
      }
    }

    // Check for alternating states (most common livelock pattern)
    if (history.length >= 4) {
      const last4 = history.slice(-4);
      if (
        last4[0].stateHash === last4[2].stateHash &&
        last4[1].stateHash === last4[3].stateHash &&
        last4[0].stateHash !== last4[1].stateHash
      ) {
        // Count how many times this alternation occurs
        let alternations = 2;
        for (let i = history.length - 5; i >= 0; i--) {
          const expectedHash = i % 2 === (history.length - 1) % 2
            ? last4[3].stateHash
            : last4[2].stateHash;
          if (history[i].stateHash === expectedHash) {
            alternations++;
          } else {
            break;
          }
        }

        if (alternations >= this.patternThreshold * 2) {
          return {
            description: `Alternating between 2 states ${Math.floor(alternations / 2)} times`,
            iterationCount: Math.floor(alternations / 2),
            states: [last4[2].stateHash, last4[3].stateHash],
          };
        }
      }
    }

    return null;
  }

  /**
   * Detect lack of progress based on time threshold
   */
  private detectLackOfProgress(history: AgentState[]): number | null {
    if (history.length < 2) {
      return null;
    }

    const first = history[0];
    const last = history[history.length - 1];
    const duration = last.timestamp.getTime() - first.timestamp.getTime();

    // Check if all states in the window are the same
    const allSame = history.every((s) => s.stateHash === first.stateHash);

    if (allSame && duration > this.progressTimeout) {
      return duration;
    }

    return null;
  }

  /**
   * Compute hash of agent state for comparison
   */
  private computeStateHash(stateData: Record<string, unknown>): string {
    const normalized = JSON.stringify(stateData, Object.keys(stateData).sort());
    return crypto.createHash('sha256').update(normalized).digest('hex').substring(0, 16);
  }

  /**
   * Clear history for an agent (e.g., after successful task completion)
   */
  clearAgentHistory(agentId: string): void {
    this.stateHistory.delete(agentId);
  }

  /**
   * Get state history for an agent
   */
  getAgentHistory(agentId: string): AgentState[] {
    return this.stateHistory.get(agentId) || [];
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
   * Get all agents being tracked
   */
  getTrackedAgents(): string[] {
    return Array.from(this.stateHistory.keys());
  }
}
