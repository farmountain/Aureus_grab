import { EventLog } from './types';
import { StateStore as WorldModelStateStore, StateSnapshot } from '@aureus/world-model';
import { SnapshotManager, CombinedSnapshot, RollbackRequest, CombinedRollbackResult, MemoryAPI } from '@aureus/memory-hipcortex';
import { GoalGuardFSM, RiskTier, Principal, Action, GuardDecision } from '@aureus/policy';
import { TelemetryCollector } from '@aureus/observability';
import { RollbackError, SnapshotNotFoundError, PolicyViolationError } from './errors';

/**
 * RollbackOrchestrator handles rollback operations with policy approval for high-risk operations
 */
export class RollbackOrchestrator {
  private snapshotManager: SnapshotManager;
  private worldStateStore: WorldModelStateStore;
  private memoryAPI?: MemoryAPI;
  private eventLog: EventLog;
  private policyGuard?: GoalGuardFSM;
  private telemetry?: TelemetryCollector;

  constructor(
    snapshotManager: SnapshotManager,
    worldStateStore: WorldModelStateStore,
    eventLog: EventLog,
    memoryAPI?: MemoryAPI,
    policyGuard?: GoalGuardFSM,
    telemetry?: TelemetryCollector
  ) {
    this.snapshotManager = snapshotManager;
    this.worldStateStore = worldStateStore;
    this.eventLog = eventLog;
    this.memoryAPI = memoryAPI;
    this.policyGuard = policyGuard;
    this.telemetry = telemetry;
  }

  /**
   * Perform rollback to a specific snapshot
   * Requires policy approval if risk tier is HIGH or CRITICAL
   */
  async rollback(request: RollbackRequest, principal: Principal, workflowId?: string): Promise<CombinedRollbackResult> {
    console.log(`Rollback requested for task ${request.taskId} to snapshot ${request.snapshotId}`);
    console.log(`Requested by: ${request.requestedBy}`);

    // Use provided workflowId or fall back to taskId as workflow identifier
    const effectiveWorkflowId = workflowId || request.taskId;

    // Get the snapshot
    const snapshot = this.snapshotManager.getSnapshot(request.snapshotId);
    if (!snapshot) {
      throw new SnapshotNotFoundError(
        request.snapshotId,
        request.taskId,
        { requestedBy: request.requestedBy }
      );
    }

    // Verify snapshot belongs to the requested task
    if (snapshot.taskId !== request.taskId) {
      throw new RollbackError(
        request.taskId,
        request.snapshotId,
        `Snapshot does not belong to task ${request.taskId}`,
        { snapshotTaskId: snapshot.taskId, requestedBy: request.requestedBy }
      );
    }

    // Determine risk tier
    const riskTier = request.riskTier || this.determineRollbackRisk(snapshot);
    console.log(`Rollback risk tier: ${riskTier}`);

    // Check if policy approval is required
    const requiresApproval = riskTier === 'HIGH' || riskTier === 'CRITICAL';
    let approved = false;
    let approvedBy: string | undefined;

    if (requiresApproval && this.policyGuard) {
      console.log(`Rollback requires policy approval due to ${riskTier} risk tier`);
      
      // Create action for policy evaluation
      const rollbackAction: Action = {
        id: `rollback-${request.snapshotId}`,
        name: `Rollback to snapshot ${request.snapshotId}`,
        riskTier: this.convertRiskTierToPolicy(riskTier),
        requiredPermissions: [
          { action: 'rollback', resource: 'workflow' },
        ],
        metadata: {
          snapshotId: request.snapshotId,
          taskId: request.taskId,
          reason: request.reason,
        },
      };

      // Evaluate with policy guard
      const decision: GuardDecision = await this.policyGuard.evaluate(principal, rollbackAction);
      approved = decision.allowed;
      approvedBy = decision.allowed ? principal.id : undefined;

      console.log(`Policy decision: ${approved ? 'APPROVED' : 'REJECTED'} - ${decision.reason}`);

      // Log policy decision
      await this.logEvent({
        timestamp: new Date(),
        type: 'ROLLBACK_POLICY_DECISION',
        workflowId: request.taskId,
        taskId: request.taskId,
        metadata: {
          snapshotId: request.snapshotId,
          approved,
          approvedBy,
          reason: decision.reason,
          riskTier,
        },
      });

      if (!approved) {
        throw new PolicyViolationError(
          request.snapshotId,
          `Rollback to snapshot ${request.snapshotId}`,
          decision.reason || 'Policy denied rollback operation',
          true,
          { taskId: request.taskId, riskTier, requestedBy: request.requestedBy }
        );
      }
    } else if (requiresApproval && !this.policyGuard) {
      console.warn('Rollback requires approval but no policy guard configured - proceeding with caution');
    } else {
      approved = true; // Low/Medium risk doesn't require approval
      approvedBy = request.requestedBy;
    }

    // Capture current state before rollback
    const currentWorldState = await this.worldStateStore.snapshot();
    const currentMemoryState = this.snapshotManager.getCurrentState();

    // Log rollback initiation
    await this.logEvent({
      timestamp: new Date(),
      type: 'ROLLBACK_INITIATED',
      workflowId: request.taskId,
      taskId: request.taskId,
      metadata: {
        snapshotId: request.snapshotId,
        requestedBy: request.requestedBy,
        reason: request.reason,
        riskTier,
        approved,
        approvedBy,
      },
    });

    // Record telemetry: rollback
    if (this.telemetry) {
      this.telemetry.recordRollback(
        effectiveWorkflowId,
        request.taskId,
        request.snapshotId,
        request.reason || 'Manual rollback'
      );
    }

    try {
      // Restore snapshot
      const restored = await this.snapshotManager.restoreSnapshot(request.snapshotId);

      // Restore world state
      await this.restoreWorldState(restored.worldState);

      // Restore memory pointers (mark as restored in memory API)
      if (this.memoryAPI) {
        await this.restoreMemoryPointers(request.taskId, restored.memoryPointers);
      }

      const result: CombinedRollbackResult = {
        success: true,
        snapshotId: request.snapshotId,
        restoredState: {
          worldState: restored.worldState,
          memoryPointers: restored.memoryPointers,
        },
        previousState: {
          worldState: currentWorldState,
          memoryPointers: currentMemoryState.memoryPointers,
        },
        timestamp: new Date(),
        approvalRequired: requiresApproval,
        approved,
        approvedBy,
      };

      // Log successful rollback
      await this.logEvent({
        timestamp: new Date(),
        type: 'ROLLBACK_COMPLETED',
        workflowId: request.taskId,
        taskId: request.taskId,
        metadata: {
          snapshotId: request.snapshotId,
          success: true,
          approved,
          approvedBy,
          restoredStateHash: snapshot.contentHash,
        },
      });

      console.log(`Rollback completed successfully to snapshot ${request.snapshotId}`);

      return result;
    } catch (error) {
      // Log rollback failure
      await this.logEvent({
        timestamp: new Date(),
        type: 'ROLLBACK_FAILED',
        workflowId: request.taskId,
        taskId: request.taskId,
        metadata: {
          snapshotId: request.snapshotId,
          error: error instanceof Error ? error.message : String(error),
          approved,
          approvedBy,
        },
      });

      // Re-throw if already an Aureus error
      if (error instanceof RollbackError || error instanceof SnapshotNotFoundError || error instanceof PolicyViolationError) {
        throw error;
      }

      // Wrap other errors
      throw new RollbackError(
        request.taskId,
        request.snapshotId,
        error instanceof Error ? error.message : String(error),
        { approved, approvedBy, requestedBy: request.requestedBy }
      );
    }
  }

  /**
   * Rollback to the last verified snapshot for a task
   */
  async rollbackToLastVerified(taskId: string, requestedBy: string, principal: Principal): Promise<CombinedRollbackResult> {
    const lastVerified = this.snapshotManager.getLastVerifiedSnapshot(taskId);
    
    if (!lastVerified) {
      throw new SnapshotNotFoundError(
        'last-verified',
        taskId,
        { reason: 'No verified snapshot available', requestedBy }
      );
    }

    const request: RollbackRequest = {
      taskId,
      snapshotId: lastVerified.id,
      requestedBy,
      reason: 'Rollback to last verified snapshot',
    };

    return this.rollback(request, principal);
  }

  /**
   * Determine rollback risk based on snapshot metadata and state changes
   */
  private determineRollbackRisk(snapshot: CombinedSnapshot): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
    // If snapshot has explicit risk tier metadata, use it
    if (snapshot.metadata?.riskTier) {
      return snapshot.metadata.riskTier as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    }

    // If snapshot is not verified, consider it HIGH risk
    if (!snapshot.verified) {
      return 'HIGH';
    }

    // If snapshot has many memory pointers (lots of state to restore), consider it MEDIUM
    if (snapshot.memoryPointers.length > 10) {
      return 'MEDIUM';
    }

    // Default to LOW for verified snapshots with minimal state
    return 'LOW';
  }

  /**
   * Convert risk tier string to policy RiskTier enum
   */
  private convertRiskTierToPolicy(riskTier: string): RiskTier {
    switch (riskTier) {
      case 'LOW': return RiskTier.LOW;
      case 'MEDIUM': return RiskTier.MEDIUM;
      case 'HIGH': return RiskTier.HIGH;
      case 'CRITICAL': return RiskTier.CRITICAL;
      default: return RiskTier.MEDIUM;
    }
  }

  /**
   * Restore world state from snapshot
   * This recreates state entries from the snapshot
   */
  private async restoreWorldState(snapshot: StateSnapshot): Promise<void> {
    console.log(`Restoring world state from snapshot ${snapshot.id}`);

    // Get current keys to determine what needs to be deleted
    const currentKeys = await this.worldStateStore.keys();
    
    // Handle both Map and serialized object formats
    // After JSON.parse/stringify (e.g., from persistence), Map becomes plain object
    const snapshotEntries = snapshot.entries instanceof Map 
      ? snapshot.entries 
      : new Map(Object.entries(snapshot.entries));
    
    const snapshotKeys = new Set(snapshotEntries.keys());

    // Delete keys that exist in current state but not in snapshot
    for (const key of currentKeys) {
      if (!snapshotKeys.has(key)) {
        const current = await this.worldStateStore.read(key);
        if (current) {
          await this.worldStateStore.delete(key, current.version);
        }
      }
    }

    // Restore or create entries from snapshot
    for (const [key, entryValue] of snapshotEntries) {
      const entry = entryValue as any; // Type assertion for deserialized data
      const current = await this.worldStateStore.read(key);
      
      if (!current) {
        // Create new entry
        await this.worldStateStore.create(key, entry.value, entry.metadata);
      } else if (current.version !== entry.version || 
                 JSON.stringify(current.value) !== JSON.stringify(entry.value)) {
        // Update to snapshot version - need to use current version for optimistic locking
        // but restore the exact snapshot value
        await this.worldStateStore.update(key, entry.value, current.version, entry.metadata);
      }
    }

    console.log(`World state restored: ${snapshotEntries.size} entries`);
  }

  /**
   * Restore memory pointers by writing a rollback marker in memory
   */
  private async restoreMemoryPointers(taskId: string, pointers: any[]): Promise<void> {
    if (!this.memoryAPI) {
      console.warn('Memory API not available, skipping memory pointer restoration');
      return;
    }

    console.log(`Restoring memory pointers: ${pointers.length} entries`);

    // Write a rollback marker in memory to indicate state was restored
    const provenance = {
      task_id: taskId,
      step_id: 'rollback',
      timestamp: new Date(),
    };

    this.memoryAPI.write(
      {
        message: 'Memory state rolled back',
        restoredPointers: pointers.map(p => ({
          entryId: p.entryId,
          type: p.type,
          timestamp: p.timestamp,
        })),
      },
      provenance,
      {
        type: 'snapshot',
        tags: ['rollback', 'memory_restore'],
      }
    );

    console.log('Memory rollback marker written');
  }

  /**
   * Log event to event log
   */
  private async logEvent(event: any): Promise<void> {
    await this.eventLog.append(event);
  }
}

/**
 * New event types for rollback operations
 */
export type RollbackEventType =
  | 'ROLLBACK_INITIATED'
  | 'ROLLBACK_COMPLETED'
  | 'ROLLBACK_FAILED'
  | 'ROLLBACK_POLICY_DECISION';
