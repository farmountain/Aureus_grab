import {
  OutboxService,
  OutboxStore,
  OutboxEntry,
  OutboxEntryState,
  ReconciliationResult,
  ReconciliationOptions,
} from './outbox';

/**
 * DefaultOutboxService implements the OutboxService interface
 * Provides high-level operations for managing outbox entries
 */
export class DefaultOutboxService implements OutboxService {
  private outboxStore: OutboxStore;

  constructor(store: OutboxStore) {
    this.outboxStore = store;
  }

  async store(
    entry: Omit<OutboxEntry, 'id' | 'createdAt' | 'updatedAt' | 'state' | 'attempts'>
  ): Promise<OutboxEntry> {
    // Check if entry already exists (replay protection)
    const existing = await this.outboxStore.getByIdempotencyKey(entry.idempotencyKey);
    if (existing) {
      return existing;
    }

    // Create new entry in PENDING state
    return await this.outboxStore.create({
      ...entry,
      state: OutboxEntryState.PENDING,
      attempts: 0,
    });
  }

  async exists(idempotencyKey: string): Promise<OutboxEntry | null> {
    return await this.outboxStore.getByIdempotencyKey(idempotencyKey);
  }

  async commit(id: string, result: unknown): Promise<void> {
    await this.outboxStore.markCommitted(id, result);
  }

  async fail(id: string, error: string): Promise<void> {
    await this.outboxStore.markFailed(id, error);
  }

  async getByIdempotencyKey(idempotencyKey: string): Promise<OutboxEntry | null> {
    return await this.outboxStore.getByIdempotencyKey(idempotencyKey);
  }

  async reconcile(options?: ReconciliationOptions): Promise<ReconciliationResult[]> {
    const results: ReconciliationResult[] = [];
    const maxAgeMs = options?.maxAgeMs || 24 * 60 * 60 * 1000; // Default: 24 hours
    const cutoff = Date.now() - maxAgeMs;

    // Get all pending and processing entries
    const pendingEntries = await this.outboxStore.listByState(OutboxEntryState.PENDING);
    const processingEntries = await this.outboxStore.listByState(OutboxEntryState.PROCESSING);
    const failedEntries = await this.outboxStore.listByState(OutboxEntryState.FAILED);

    // Reconcile each type of entry
    for (const entry of [...pendingEntries, ...processingEntries, ...failedEntries]) {
      // Skip entries that are too old
      if (entry.createdAt.getTime() < cutoff) {
        continue;
      }

      const result = await this.reconcileEntry(entry, options);
      results.push(result);
    }

    return results;
  }

  private async reconcileEntry(
    entry: OutboxEntry,
    options?: ReconciliationOptions
  ): Promise<ReconciliationResult> {
    const actions: ReconciliationResult['actions'] = [];

    // Use custom reconciliation if provided
    if (options?.onReconcile) {
      return await options.onReconcile(entry);
    }

    // Default reconciliation logic
    const now = new Date();

    // Handle entries stuck in PROCESSING state
    if (entry.state === OutboxEntryState.PROCESSING) {
      // Check if entry has been processing for too long (e.g., > 5 minutes)
      const processingTime = now.getTime() - entry.updatedAt.getTime();
      const maxProcessingTime = 5 * 60 * 1000; // 5 minutes

      if (processingTime > maxProcessingTime) {
        // Reset to PENDING for retry
        await this.outboxStore.update(entry.id, {
          state: OutboxEntryState.PENDING,
        });

        actions.push({
          type: 'retry',
          reason: `Entry stuck in PROCESSING for ${processingTime}ms, reset to PENDING`,
          timestamp: now,
        });

        return {
          needsReconciliation: true,
          actions,
        };
      }
    }

    // Handle FAILED entries with auto-retry
    if (entry.state === OutboxEntryState.FAILED && options?.autoRetry) {
      if (entry.attempts < entry.maxAttempts) {
        // Reset to PENDING for retry
        await this.outboxStore.update(entry.id, {
          state: OutboxEntryState.PENDING,
        });

        actions.push({
          type: 'retry',
          reason: `Auto-retry failed entry (attempt ${entry.attempts}/${entry.maxAttempts})`,
          timestamp: now,
        });

        return {
          needsReconciliation: true,
          actions,
        };
      }
    }

    // No reconciliation needed
    actions.push({
      type: 'no_action',
      reason: 'Entry state is valid',
      timestamp: now,
    });

    return {
      needsReconciliation: false,
      actions,
    };
  }

  /**
   * Execute a side effect through the outbox pattern
   * 
   * This method:
   * 1. Stores the intent in the outbox
   * 2. Executes the side effect
   * 3. Marks it as committed
   * 4. Handles failures gracefully
   */
  async execute(
    workflowId: string,
    taskId: string,
    toolId: string,
    params: Record<string, unknown>,
    idempotencyKey: string,
    executor: (params: Record<string, unknown>) => Promise<unknown>,
    maxAttempts: number = 3
  ): Promise<unknown> {
    // Check if already executed (replay protection)
    const existing = await this.exists(idempotencyKey);
    if (existing) {
      if (existing.state === OutboxEntryState.COMMITTED) {
        // Already executed successfully, return cached result
        return existing.result;
      }
      
      if (existing.state === OutboxEntryState.DEAD_LETTER) {
        // Permanently failed
        throw new Error(`Side effect permanently failed: ${existing.error}`);
      }
      
      // Otherwise, continue with execution (retry)
    }

    // Store intent in outbox
    const entry = await this.store({
      workflowId,
      taskId,
      toolId,
      params,
      idempotencyKey,
      maxAttempts,
    });

    try {
      // Mark as processing
      await this.outboxStore.markProcessing(entry.id);

      // Execute the side effect
      const result = await executor(params);

      // Mark as committed
      await this.commit(entry.id, result);

      return result;
    } catch (error) {
      // Mark as failed
      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.fail(entry.id, errorMessage);

      throw error;
    }
  }

  /**
   * Cleanup old committed entries
   */
  async cleanup(olderThanMs: number = 7 * 24 * 60 * 60 * 1000): Promise<number> {
    return await this.outboxStore.cleanup(olderThanMs);
  }
}
