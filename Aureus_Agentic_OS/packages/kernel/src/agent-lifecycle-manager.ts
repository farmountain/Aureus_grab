/**
 * Agent lifecycle states
 */
export enum AgentLifecycleState {
  INITIALIZING = 'initializing',
  AWAKE = 'awake',
  SLEEPING = 'sleeping',
  HIBERNATING = 'hibernating',
  TERMINATED = 'terminated'
}

/**
 * Lifecycle transition reasons
 */
export enum TransitionReason {
  MANUAL = 'manual',
  TIMEOUT = 'timeout',
  INACTIVITY = 'inactivity',
  ERROR = 'error',
  SCHEDULED = 'scheduled',
  RESOURCE_PRESSURE = 'resource_pressure',
  TASK_COMPLETION = 'task_completion'
}

/**
 * Agent session information
 */
export interface AgentSession {
  sessionId: string;
  agentId: string;
  startTime: Date;
  lastActivityTime: Date;
  state: AgentLifecycleState;
  cycleNumber: number;
  contextSize: number;        // Current context size
  memoryCount: number;        // Number of memories
  taskId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Lifecycle transition event
 */
export interface LifecycleTransition {
  sessionId: string;
  agentId: string;
  fromState: AgentLifecycleState;
  toState: AgentLifecycleState;
  reason: TransitionReason;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Sleep/awake cycle configuration
 */
export interface CycleConfig {
  awakeTimeMs: number;        // Max time to stay awake
  sleepTimeMs: number;        // Time to sleep between cycles
  inactivityThresholdMs: number; // Inactivity before auto-sleep
  maxCycles?: number;         // Max cycles before hibernation
  contextRefreshOnWake: boolean; // Whether to refresh context on wake
}

/**
 * Context refresh strategy
 */
export interface ContextRefreshStrategy {
  type: 'full' | 'incremental' | 'selective';
  maxContextSize?: number;    // Max context entries to load
  prioritizeRecent?: boolean; // Prioritize recent memories
  includeRelated?: boolean;   // Include related context
}

/**
 * Session continuity snapshot
 */
export interface SessionSnapshot {
  sessionId: string;
  agentId: string;
  timestamp: Date;
  state: AgentLifecycleState;
  cycleNumber: number;
  contextCheckpoint: {
    memoryIds: string[];
    lastProcessedTimestamp: Date;
    stateSnapshot: unknown;
  };
  metadata?: Record<string, unknown>;
}

/**
 * AgentLifecycleManager manages agent lifecycle, sleep/awake cycles, and session continuity
 */
export class AgentLifecycleManager {
  private sessions: Map<string, AgentSession> = new Map();
  private transitions: Map<string, LifecycleTransition[]> = new Map();
  private snapshots: Map<string, SessionSnapshot[]> = new Map();
  private cycleConfig: CycleConfig;
  private timers: Map<string, NodeJS.Timeout> = new Map();

  constructor(cycleConfig?: Partial<CycleConfig>) {
    this.cycleConfig = {
      awakeTimeMs: 60 * 60 * 1000, // 1 hour default
      sleepTimeMs: 5 * 60 * 1000,  // 5 minutes default
      inactivityThresholdMs: 10 * 60 * 1000, // 10 minutes default
      contextRefreshOnWake: true,
      ...cycleConfig,
    };
  }

  /**
   * Create a new agent session
   */
  createSession(agentId: string, taskId?: string, metadata?: Record<string, unknown>): AgentSession {
    const sessionId = `session-${agentId}-${Date.now()}`;
    
    const session: AgentSession = {
      sessionId,
      agentId,
      startTime: new Date(),
      lastActivityTime: new Date(),
      state: AgentLifecycleState.INITIALIZING,
      cycleNumber: 0,
      contextSize: 0,
      memoryCount: 0,
      taskId,
      metadata,
    };

    this.sessions.set(sessionId, session);
    this.transitions.set(sessionId, []);

    // Transition to awake state
    this.transitionState(sessionId, AgentLifecycleState.AWAKE, TransitionReason.MANUAL);

    return session;
  }

  /**
   * Transition agent state
   */
  transitionState(
    sessionId: string,
    toState: AgentLifecycleState,
    reason: TransitionReason,
    metadata?: Record<string, unknown>
  ): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const fromState = session.state;
    
    if (fromState === toState) {
      return; // No transition needed
    }

    // Create transition event
    const transition: LifecycleTransition = {
      sessionId,
      agentId: session.agentId,
      fromState,
      toState,
      reason,
      timestamp: new Date(),
      metadata,
    };

    // Update session state
    session.state = toState;
    session.lastActivityTime = new Date();

    // Record transition
    const sessionTransitions = this.transitions.get(sessionId) || [];
    sessionTransitions.push(transition);
    this.transitions.set(sessionId, sessionTransitions);

    // Handle state-specific logic
    this.handleStateTransition(session, toState, reason);

    console.log(`Agent ${session.agentId} transitioned from ${fromState} to ${toState} (${reason})`);
  }

  /**
   * Handle state-specific logic
   */
  private handleStateTransition(
    session: AgentSession,
    toState: AgentLifecycleState,
    reason: TransitionReason
  ): void {
    // Clear any existing timers
    this.clearTimer(session.sessionId);

    switch (toState) {
      case AgentLifecycleState.AWAKE:
        session.cycleNumber++;
        // Set inactivity timer
        this.setInactivityTimer(session.sessionId);
        // Set max awake timer
        this.setAwakeTimer(session.sessionId);
        break;

      case AgentLifecycleState.SLEEPING:
        // Create snapshot before sleeping
        this.createSessionSnapshot(session.sessionId);
        // Set wake timer
        this.setSleepTimer(session.sessionId);
        break;

      case AgentLifecycleState.HIBERNATING:
        // Create snapshot before hibernating
        this.createSessionSnapshot(session.sessionId);
        break;

      case AgentLifecycleState.TERMINATED:
        // Cleanup resources
        this.cleanupSession(session.sessionId);
        break;
    }
  }

  /**
   * Record agent activity
   */
  recordActivity(sessionId: string, contextSize?: number, memoryCount?: number): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.lastActivityTime = new Date();
    
    if (contextSize !== undefined) {
      session.contextSize = contextSize;
    }
    
    if (memoryCount !== undefined) {
      session.memoryCount = memoryCount;
    }

    // Reset inactivity timer
    if (session.state === AgentLifecycleState.AWAKE) {
      this.setInactivityTimer(sessionId);
    }
  }

  /**
   * Put agent to sleep
   */
  sleep(sessionId: string, reason: TransitionReason = TransitionReason.MANUAL): void {
    this.transitionState(sessionId, AgentLifecycleState.SLEEPING, reason);
  }

  /**
   * Wake agent up
   */
  wake(sessionId: string, reason: TransitionReason = TransitionReason.MANUAL): void {
    this.transitionState(sessionId, AgentLifecycleState.AWAKE, reason);
  }

  /**
   * Hibernate agent (deep sleep)
   */
  hibernate(sessionId: string, reason: TransitionReason = TransitionReason.MANUAL): void {
    this.transitionState(sessionId, AgentLifecycleState.HIBERNATING, reason);
  }

  /**
   * Terminate agent session
   */
  terminate(sessionId: string, reason: TransitionReason = TransitionReason.MANUAL): void {
    this.transitionState(sessionId, AgentLifecycleState.TERMINATED, reason);
  }

  /**
   * Create session snapshot for continuity
   */
  private createSessionSnapshot(sessionId: string): SessionSnapshot {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const snapshot: SessionSnapshot = {
      sessionId,
      agentId: session.agentId,
      timestamp: new Date(),
      state: session.state,
      cycleNumber: session.cycleNumber,
      contextCheckpoint: {
        memoryIds: [], // Would be populated with actual memory IDs
        lastProcessedTimestamp: session.lastActivityTime,
        stateSnapshot: {}, // Would contain actual state
      },
      metadata: session.metadata,
    };

    // Store snapshot
    const sessionSnapshots = this.snapshots.get(sessionId) || [];
    sessionSnapshots.push(snapshot);
    this.snapshots.set(sessionId, sessionSnapshots);

    return snapshot;
  }

  /**
   * Restore session from snapshot
   */
  restoreSession(sessionId: string, snapshotTimestamp?: Date): AgentSession | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    const sessionSnapshots = this.snapshots.get(sessionId);
    if (!sessionSnapshots || sessionSnapshots.length === 0) {
      return session;
    }

    // Get the most recent snapshot or specific one
    const snapshot = snapshotTimestamp
      ? sessionSnapshots.find(s => s.timestamp.getTime() === snapshotTimestamp.getTime())
      : sessionSnapshots[sessionSnapshots.length - 1];

    if (!snapshot) return session;

    // Restore session state
    session.cycleNumber = snapshot.cycleNumber;
    session.metadata = snapshot.metadata;

    return session;
  }

  /**
   * Get session information
   */
  getSession(sessionId: string): AgentSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Get all sessions for an agent
   */
  getAgentSessions(agentId: string): AgentSession[] {
    return Array.from(this.sessions.values())
      .filter(s => s.agentId === agentId);
  }

  /**
   * Get session transitions
   */
  getTransitions(sessionId: string): LifecycleTransition[] {
    return this.transitions.get(sessionId) || [];
  }

  /**
   * Get session snapshots
   */
  getSnapshots(sessionId: string): SessionSnapshot[] {
    return this.snapshots.get(sessionId) || [];
  }

  /**
   * Refresh context for a session
   */
  refreshContext(
    sessionId: string,
    strategy: ContextRefreshStrategy,
    memoryProvider: (sessionId: string, strategy: ContextRefreshStrategy) => Promise<string[]>
  ): Promise<string[]> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // Delegate to memory provider
    return memoryProvider(sessionId, strategy);
  }

  /**
   * Set inactivity timer
   */
  private setInactivityTimer(sessionId: string): void {
    this.clearTimer(sessionId);
    
    const timer = setTimeout(() => {
      this.sleep(sessionId, TransitionReason.INACTIVITY);
    }, this.cycleConfig.inactivityThresholdMs);

    this.timers.set(`inactivity-${sessionId}`, timer);
  }

  /**
   * Set awake timer (max time awake)
   */
  private setAwakeTimer(sessionId: string): void {
    // Clear any existing timer first to avoid duplicates
    const awakeKey = `awake-${sessionId}`;
    const existingTimer = this.timers.get(awakeKey);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }
    
    const timer = setTimeout(() => {
      this.sleep(sessionId, TransitionReason.TIMEOUT);
    }, this.cycleConfig.awakeTimeMs);

    this.timers.set(awakeKey, timer);
  }

  /**
   * Set sleep timer (auto-wake)
   */
  private setSleepTimer(sessionId: string): void {
    const timer = setTimeout(() => {
      this.wake(sessionId, TransitionReason.SCHEDULED);
    }, this.cycleConfig.sleepTimeMs);

    this.timers.set(`sleep-${sessionId}`, timer);
  }

  /**
   * Clear all timers for a session
   */
  private clearTimer(sessionId: string): void {
    const timerKeys = [`inactivity-${sessionId}`, `awake-${sessionId}`, `sleep-${sessionId}`];
    
    for (const key of timerKeys) {
      const timer = this.timers.get(key);
      if (timer) {
        clearTimeout(timer);
        this.timers.delete(key);
      }
    }
  }

  /**
   * Cleanup session resources
   */
  private cleanupSession(sessionId: string): void {
    this.clearTimer(sessionId);
    // Keep session data for audit purposes but mark as terminated
  }

  /**
   * Get lifecycle statistics
   */
  getStats(): {
    totalSessions: number;
    activeSessions: number;
    sleepingSessions: number;
    byState: Record<AgentLifecycleState, number>;
    avgCycleNumber: number;
  } {
    const sessions = Array.from(this.sessions.values());
    const byState: Record<AgentLifecycleState, number> = {
      [AgentLifecycleState.INITIALIZING]: 0,
      [AgentLifecycleState.AWAKE]: 0,
      [AgentLifecycleState.SLEEPING]: 0,
      [AgentLifecycleState.HIBERNATING]: 0,
      [AgentLifecycleState.TERMINATED]: 0,
    };

    let totalCycles = 0;

    for (const session of sessions) {
      byState[session.state]++;
      totalCycles += session.cycleNumber;
    }

    return {
      totalSessions: sessions.length,
      activeSessions: byState[AgentLifecycleState.AWAKE],
      sleepingSessions: byState[AgentLifecycleState.SLEEPING],
      byState,
      avgCycleNumber: sessions.length > 0 ? totalCycles / sessions.length : 0,
    };
  }
}
