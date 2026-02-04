/**
 * Outbox pattern implementation for durable side effects
 * 
 * The outbox pattern ensures that side effects are:
 * 1. Stored durably BEFORE execution
 * 2. Committed exactly once
 * 3. Protected from replay on retries
 * 4. Reconcilable in case of failures
 */

/**
 * State of an outbox entry
 */
export enum OutboxEntryState {
  /** Entry created, ready for processing */
  PENDING = 'PENDING',
  /** Entry being processed */
  PROCESSING = 'PROCESSING',
  /** Entry successfully committed */
  COMMITTED = 'COMMITTED',
  /** Entry failed, may retry */
  FAILED = 'FAILED',
  /** Entry permanently failed, no more retries */
  DEAD_LETTER = 'DEAD_LETTER',
}

/**
 * An entry in the outbox representing an intended side effect
 */
export interface OutboxEntry {
  /** Unique identifier for this entry */
  id: string;
  
  /** Workflow this entry belongs to */
  workflowId: string;
  
  /** Task this entry belongs to */
  taskId: string;
  
  /** Tool to execute */
  toolId: string;
  
  /** Parameters for tool execution */
  params: Record<string, unknown>;
  
  /** Idempotency key for replay protection */
  idempotencyKey: string;
  
  /** Current state of the entry */
  state: OutboxEntryState;
  
  /** Number of execution attempts */
  attempts: number;
  
  /** Maximum number of retry attempts */
  maxAttempts: number;
  
  /** Result of execution (if successful) */
  result?: unknown;
  
  /** Error message (if failed) */
  error?: string;
  
  /** Timestamp when entry was created */
  createdAt: Date;
  
  /** Timestamp when entry was last updated */
  updatedAt: Date;
  
  /** Timestamp when entry was committed (if successful) */
  committedAt?: Date;
  
  /** Metadata for reconciliation and auditing */
  metadata?: Record<string, unknown>;
}

/**
 * Reconciliation result for an outbox entry
 */
export interface ReconciliationResult {
  /** Whether reconciliation found discrepancies */
  needsReconciliation: boolean;
  
  /** Current state according to the system */
  currentState?: unknown;
  
  /** Expected state according to outbox */
  expectedState?: unknown;
  
  /** Actions taken during reconciliation */
  actions: Array<{
    type: 'retry' | 'mark_committed' | 'mark_failed' | 'no_action';
    reason: string;
    timestamp: Date;
  }>;
}

/**
 * Options for outbox reconciliation
 */
export interface ReconciliationOptions {
  /** Maximum age of entries to reconcile (in milliseconds) */
  maxAgeMs?: number;
  
  /** Whether to automatically retry failed entries */
  autoRetry?: boolean;
  
  /** Callback for custom reconciliation logic */
  onReconcile?: (entry: OutboxEntry) => Promise<ReconciliationResult>;
}

/**
 * OutboxStore interface for persisting outbox entries
 */
export interface OutboxStore {
  /**
   * Create a new outbox entry
   */
  create(entry: Omit<OutboxEntry, 'id' | 'createdAt' | 'updatedAt'>): Promise<OutboxEntry>;
  
  /**
   * Get an outbox entry by ID
   */
  get(id: string): Promise<OutboxEntry | null>;
  
  /**
   * Get an outbox entry by idempotency key
   */
  getByIdempotencyKey(idempotencyKey: string): Promise<OutboxEntry | null>;
  
  /**
   * Update an outbox entry
   */
  update(id: string, updates: Partial<OutboxEntry>): Promise<OutboxEntry>;
  
  /**
   * List outbox entries by state
   */
  listByState(state: OutboxEntryState, limit?: number): Promise<OutboxEntry[]>;
  
  /**
   * List outbox entries by workflow
   */
  listByWorkflow(workflowId: string): Promise<OutboxEntry[]>;
  
  /**
   * Mark an entry as processing
   */
  markProcessing(id: string): Promise<void>;
  
  /**
   * Mark an entry as committed with result
   */
  markCommitted(id: string, result: unknown): Promise<void>;
  
  /**
   * Mark an entry as failed with error
   */
  markFailed(id: string, error: string): Promise<void>;
  
  /**
   * Delete old committed entries (cleanup)
   */
  cleanup(olderThanMs: number): Promise<number>;
}

/**
 * OutboxService manages outbox entries and provides reconciliation
 */
export interface OutboxService {
  /**
   * Store an intended side effect before execution
   */
  store(entry: Omit<OutboxEntry, 'id' | 'createdAt' | 'updatedAt' | 'state' | 'attempts'>): Promise<OutboxEntry>;
  
  /**
   * Check if an entry already exists (replay protection)
   */
  exists(idempotencyKey: string): Promise<OutboxEntry | null>;
  
  /**
   * Mark an entry as committed after successful execution
   */
  commit(id: string, result: unknown): Promise<void>;
  
  /**
   * Mark an entry as failed
   */
  fail(id: string, error: string): Promise<void>;
  
  /**
   * Reconcile pending entries (recovery)
   */
  reconcile(options?: ReconciliationOptions): Promise<ReconciliationResult[]>;
  
  /**
   * Get entry by idempotency key
   */
  getByIdempotencyKey(idempotencyKey: string): Promise<OutboxEntry | null>;
}
