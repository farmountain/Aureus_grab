/**
 * Intent Ledger - Tracks user intents with versioning, audit trail, and linkage to workflows/hypotheses
 * 
 * An Intent represents a user's goal or objective that drives the system's behavior.
 * This module provides version control, audit trail, and integration with workflows and hypotheses.
 */

/**
 * Status of an intent
 */
export enum IntentStatus {
  DRAFT = 'DRAFT',               // Intent is being drafted
  ACTIVE = 'ACTIVE',             // Intent is active and can drive executions
  COMPLETED = 'COMPLETED',       // Intent has been fulfilled
  CANCELLED = 'CANCELLED',       // Intent was cancelled
  SUPERSEDED = 'SUPERSEDED',     // Intent was replaced by a new version
}

/**
 * A versioned snapshot of an intent
 */
export interface IntentVersion {
  /** Version number (monotonically increasing) */
  version: number;
  /** Human-readable description of the intent */
  description: string;
  /** Structured parameters for the intent */
  parameters: Record<string, unknown>;
  /** Status at this version */
  status: IntentStatus;
  /** When this version was created */
  createdAt: Date;
  /** Who created this version */
  createdBy: string;
  /** Optional reason for the change */
  changeReason?: string;
  /** Metadata for extensibility */
  metadata?: Record<string, unknown>;
}

/**
 * An intent represents a user's goal or objective
 */
export interface Intent {
  /** Unique identifier */
  id: string;
  /** User or system that owns this intent */
  owner: string;
  /** Current version number */
  currentVersion: number;
  /** Current status */
  status: IntentStatus;
  /** Version history (ordered by version number) */
  versions: IntentVersion[];
  /** Linked workflow IDs */
  workflowIds: string[];
  /** Linked hypothesis IDs */
  hypothesisIds: string[];
  /** When this intent was first created */
  createdAt: Date;
  /** When this intent was last updated */
  updatedAt: Date;
  /** Tags for categorization */
  tags?: string[];
  /** Metadata for extensibility */
  metadata?: Record<string, unknown>;
}

/**
 * Event types for intent changes
 */
export enum IntentEventType {
  INTENT_CREATED = 'INTENT_CREATED',
  INTENT_UPDATED = 'INTENT_UPDATED',
  INTENT_COMPLETED = 'INTENT_COMPLETED',
  INTENT_CANCELLED = 'INTENT_CANCELLED',
  WORKFLOW_LINKED = 'WORKFLOW_LINKED',
  WORKFLOW_UNLINKED = 'WORKFLOW_UNLINKED',
  HYPOTHESIS_LINKED = 'HYPOTHESIS_LINKED',
  HYPOTHESIS_UNLINKED = 'HYPOTHESIS_UNLINKED',
  VERSION_CREATED = 'VERSION_CREATED',
}

/**
 * Audit event for intent changes
 */
export interface IntentEvent {
  /** Event type */
  type: IntentEventType;
  /** Intent ID */
  intentId: string;
  /** Version number (if applicable) */
  version?: number;
  /** Timestamp */
  timestamp: Date;
  /** User or system that triggered the event */
  actor: string;
  /** Event-specific data */
  data: Record<string, unknown>;
}

/**
 * Options for creating an intent
 */
export interface CreateIntentOptions {
  /** Initial description */
  description: string;
  /** Initial parameters */
  parameters?: Record<string, unknown>;
  /** Created by (user or system) */
  createdBy: string;
  /** Initial status (defaults to DRAFT) */
  status?: IntentStatus;
  /** Tags for categorization */
  tags?: string[];
  /** Metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Options for updating an intent
 */
export interface UpdateIntentOptions {
  /** New description */
  description?: string;
  /** New parameters (merged with existing) */
  parameters?: Record<string, unknown>;
  /** New status */
  status?: IntentStatus;
  /** Updated by (user or system) */
  updatedBy: string;
  /** Reason for the change */
  changeReason?: string;
  /** Metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Query options for retrieving intents
 */
export interface QueryIntentOptions {
  /** Filter by owner */
  owner?: string;
  /** Filter by status */
  status?: IntentStatus;
  /** Filter by tags (match any) */
  tags?: string[];
  /** Filter by creation date range */
  createdAfter?: Date;
  createdBefore?: Date;
  /** Filter by linked workflow */
  workflowId?: string;
  /** Filter by linked hypothesis */
  hypothesisId?: string;
  /** Limit results */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
}

/**
 * Store interface for persisting intents
 */
export interface IntentStore {
  /** Save an intent */
  save(intent: Intent): Promise<void>;
  /** Load an intent by ID */
  load(intentId: string): Promise<Intent | null>;
  /** Load a specific version of an intent */
  loadVersion(intentId: string, version: number): Promise<IntentVersion | null>;
  /** Query intents */
  query(options: QueryIntentOptions): Promise<Intent[]>;
  /** List all intents (for admin/debugging) */
  listAll(): Promise<Intent[]>;
}

/**
 * IntentLedger manages intents with versioning and audit trail
 */
export class IntentLedger {
  private store: IntentStore;
  private events: IntentEvent[] = [];

  constructor(store: IntentStore) {
    this.store = store;
  }

  /**
   * Create a new intent
   */
  async createIntent(owner: string, options: CreateIntentOptions): Promise<Intent> {
    const now = new Date();
    
    const initialVersion: IntentVersion = {
      version: 1,
      description: options.description,
      parameters: options.parameters || {},
      status: options.status || IntentStatus.DRAFT,
      createdAt: now,
      createdBy: options.createdBy,
      metadata: options.metadata,
    };

    const intent: Intent = {
      id: this.generateId(),
      owner,
      currentVersion: 1,
      status: initialVersion.status,
      versions: [initialVersion],
      workflowIds: [],
      hypothesisIds: [],
      createdAt: now,
      updatedAt: now,
      tags: options.tags,
      metadata: options.metadata,
    };

    await this.store.save(intent);

    this.emitEvent({
      type: IntentEventType.INTENT_CREATED,
      intentId: intent.id,
      version: 1,
      timestamp: now,
      actor: options.createdBy,
      data: {
        description: options.description,
        status: initialVersion.status,
      },
    });

    return intent;
  }

  /**
   * Update an intent, creating a new version
   */
  async updateIntent(intentId: string, options: UpdateIntentOptions): Promise<Intent> {
    const intent = await this.store.load(intentId);
    if (!intent) {
      throw new Error(`Intent ${intentId} not found`);
    }

    const now = new Date();
    const currentVersionData = intent.versions[intent.versions.length - 1];
    
    // Create new version
    const newVersion: IntentVersion = {
      version: intent.currentVersion + 1,
      description: options.description ?? currentVersionData.description,
      parameters: {
        ...currentVersionData.parameters,
        ...(options.parameters || {}),
      },
      status: options.status ?? currentVersionData.status,
      createdAt: now,
      createdBy: options.updatedBy,
      changeReason: options.changeReason,
      metadata: options.metadata,
    };

    // Mark previous version as superseded if status changed to active
    if (options.status && options.status !== currentVersionData.status) {
      if (newVersion.status === IntentStatus.ACTIVE) {
        // Mark previous version as superseded
        const prevVersion = intent.versions[intent.versions.length - 1];
        if (prevVersion.status === IntentStatus.ACTIVE) {
          prevVersion.status = IntentStatus.SUPERSEDED;
        }
      }
    }

    intent.versions.push(newVersion);
    intent.currentVersion = newVersion.version;
    intent.status = newVersion.status;
    intent.updatedAt = now;

    await this.store.save(intent);

    this.emitEvent({
      type: IntentEventType.VERSION_CREATED,
      intentId: intent.id,
      version: newVersion.version,
      timestamp: now,
      actor: options.updatedBy,
      data: {
        description: newVersion.description,
        status: newVersion.status,
        changeReason: options.changeReason,
      },
    });

    this.emitEvent({
      type: IntentEventType.INTENT_UPDATED,
      intentId: intent.id,
      version: newVersion.version,
      timestamp: now,
      actor: options.updatedBy,
      data: {
        status: newVersion.status,
        changeReason: options.changeReason,
      },
    });

    return intent;
  }

  /**
   * Complete an intent
   */
  async completeIntent(intentId: string, completedBy: string): Promise<Intent> {
    return this.updateIntent(intentId, {
      status: IntentStatus.COMPLETED,
      updatedBy: completedBy,
      changeReason: 'Intent fulfilled',
    });
  }

  /**
   * Cancel an intent
   */
  async cancelIntent(intentId: string, cancelledBy: string, reason?: string): Promise<Intent> {
    return this.updateIntent(intentId, {
      status: IntentStatus.CANCELLED,
      updatedBy: cancelledBy,
      changeReason: reason || 'Intent cancelled',
    });
  }

  /**
   * Link a workflow to an intent
   */
  async linkWorkflow(intentId: string, workflowId: string, linkedBy: string): Promise<void> {
    const intent = await this.store.load(intentId);
    if (!intent) {
      throw new Error(`Intent ${intentId} not found`);
    }

    if (!intent.workflowIds.includes(workflowId)) {
      intent.workflowIds.push(workflowId);
      intent.updatedAt = new Date();
      await this.store.save(intent);

      this.emitEvent({
        type: IntentEventType.WORKFLOW_LINKED,
        intentId: intent.id,
        timestamp: new Date(),
        actor: linkedBy,
        data: {
          workflowId,
        },
      });
    }
  }

  /**
   * Unlink a workflow from an intent
   */
  async unlinkWorkflow(intentId: string, workflowId: string, unlinkedBy: string): Promise<void> {
    const intent = await this.store.load(intentId);
    if (!intent) {
      throw new Error(`Intent ${intentId} not found`);
    }

    const index = intent.workflowIds.indexOf(workflowId);
    if (index !== -1) {
      intent.workflowIds.splice(index, 1);
      intent.updatedAt = new Date();
      await this.store.save(intent);

      this.emitEvent({
        type: IntentEventType.WORKFLOW_UNLINKED,
        intentId: intent.id,
        timestamp: new Date(),
        actor: unlinkedBy,
        data: {
          workflowId,
        },
      });
    }
  }

  /**
   * Link a hypothesis to an intent
   */
  async linkHypothesis(intentId: string, hypothesisId: string, linkedBy: string): Promise<void> {
    const intent = await this.store.load(intentId);
    if (!intent) {
      throw new Error(`Intent ${intentId} not found`);
    }

    if (!intent.hypothesisIds.includes(hypothesisId)) {
      intent.hypothesisIds.push(hypothesisId);
      intent.updatedAt = new Date();
      await this.store.save(intent);

      this.emitEvent({
        type: IntentEventType.HYPOTHESIS_LINKED,
        intentId: intent.id,
        timestamp: new Date(),
        actor: linkedBy,
        data: {
          hypothesisId,
        },
      });
    }
  }

  /**
   * Unlink a hypothesis from an intent
   */
  async unlinkHypothesis(intentId: string, hypothesisId: string, unlinkedBy: string): Promise<void> {
    const intent = await this.store.load(intentId);
    if (!intent) {
      throw new Error(`Intent ${intentId} not found`);
    }

    const index = intent.hypothesisIds.indexOf(hypothesisId);
    if (index !== -1) {
      intent.hypothesisIds.splice(index, 1);
      intent.updatedAt = new Date();
      await this.store.save(intent);

      this.emitEvent({
        type: IntentEventType.HYPOTHESIS_UNLINKED,
        intentId: intent.id,
        timestamp: new Date(),
        actor: unlinkedBy,
        data: {
          hypothesisId,
        },
      });
    }
  }

  /**
   * Get an intent by ID
   */
  async getIntent(intentId: string): Promise<Intent | null> {
    return this.store.load(intentId);
  }

  /**
   * Get a specific version of an intent
   */
  async getIntentVersion(intentId: string, version: number): Promise<IntentVersion | null> {
    return this.store.loadVersion(intentId, version);
  }

  /**
   * Query intents
   */
  async queryIntents(options: QueryIntentOptions): Promise<Intent[]> {
    return this.store.query(options);
  }

  /**
   * Get intents by owner
   */
  async getIntentsByOwner(owner: string): Promise<Intent[]> {
    return this.store.query({ owner });
  }

  /**
   * Get intents by status
   */
  async getIntentsByStatus(status: IntentStatus): Promise<Intent[]> {
    return this.store.query({ status });
  }

  /**
   * Get intents linked to a workflow
   */
  async getIntentsByWorkflow(workflowId: string): Promise<Intent[]> {
    return this.store.query({ workflowId });
  }

  /**
   * Get intents linked to a hypothesis
   */
  async getIntentsByHypothesis(hypothesisId: string): Promise<Intent[]> {
    return this.store.query({ hypothesisId });
  }

  /**
   * Get audit trail for an intent
   */
  getAuditTrail(intentId: string): IntentEvent[] {
    return this.events.filter(e => e.intentId === intentId);
  }

  /**
   * Get all audit events
   */
  getAllEvents(): IntentEvent[] {
    return [...this.events];
  }

  /**
   * Emit an audit event
   */
  private emitEvent(event: IntentEvent): void {
    this.events.push(event);
  }

  /**
   * Generate a unique ID using timestamp and random string
   * Note: For production use, consider using a proper UUID library
   * or ULID for better collision resistance
   */
  private generateId(): string {
    return `intent-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }
}

/**
 * In-memory implementation of IntentStore for testing
 */
export class InMemoryIntentStore implements IntentStore {
  private intents = new Map<string, Intent>();

  async save(intent: Intent): Promise<void> {
    // Deep clone to ensure immutability
    // Note: Using JSON serialization for simplicity. For better performance,
    // consider using structuredClone() in Node.js 17+ or a dedicated library
    this.intents.set(intent.id, JSON.parse(JSON.stringify({
      ...intent,
      createdAt: intent.createdAt.toISOString(),
      updatedAt: intent.updatedAt.toISOString(),
      versions: intent.versions.map(v => ({
        ...v,
        createdAt: v.createdAt.toISOString(),
      })),
    })));
  }

  async load(intentId: string): Promise<Intent | null> {
    const stored = this.intents.get(intentId);
    if (!stored) return null;

    // Reconstruct dates from stored ISO strings
    const parsed = JSON.parse(JSON.stringify(stored)) as any;
    return {
      ...parsed,
      createdAt: new Date(parsed.createdAt),
      updatedAt: new Date(parsed.updatedAt),
      versions: parsed.versions.map((v: any) => ({
        ...v,
        createdAt: new Date(v.createdAt),
      })),
    };
  }

  async loadVersion(intentId: string, version: number): Promise<IntentVersion | null> {
    const intent = await this.load(intentId);
    if (!intent) return null;

    const versionData = intent.versions.find(v => v.version === version);
    return versionData || null;
  }

  async query(options: QueryIntentOptions): Promise<Intent[]> {
    const allIntents = await this.listAll();
    
    return allIntents.filter(intent => {
      // Filter by owner
      if (options.owner && intent.owner !== options.owner) {
        return false;
      }
      
      // Filter by status
      if (options.status && intent.status !== options.status) {
        return false;
      }
      
      // Filter by tags
      if (options.tags && options.tags.length > 0) {
        const intentTags = intent.tags || [];
        const hasMatchingTag = options.tags.some(tag => intentTags.includes(tag));
        if (!hasMatchingTag) {
          return false;
        }
      }
      
      // Filter by creation date range
      if (options.createdAfter && intent.createdAt < options.createdAfter) {
        return false;
      }
      if (options.createdBefore && intent.createdAt > options.createdBefore) {
        return false;
      }
      
      // Filter by linked workflow
      if (options.workflowId && !intent.workflowIds.includes(options.workflowId)) {
        return false;
      }
      
      // Filter by linked hypothesis
      if (options.hypothesisId && !intent.hypothesisIds.includes(options.hypothesisId)) {
        return false;
      }
      
      return true;
    })
    .slice(options.offset || 0, (options.offset || 0) + (options.limit || Number.MAX_SAFE_INTEGER));
  }

  async listAll(): Promise<Intent[]> {
    const intents: Intent[] = [];
    for (const stored of this.intents.values()) {
      const parsed = JSON.parse(JSON.stringify(stored)) as any;
      intents.push({
        ...parsed,
        createdAt: new Date(parsed.createdAt),
        updatedAt: new Date(parsed.updatedAt),
        versions: parsed.versions.map((v: any) => ({
          ...v,
          createdAt: new Date(v.createdAt),
        })),
      });
    }
    return intents;
  }

  // Helper for testing
  clear(): void {
    this.intents.clear();
  }
}

/**
 * Helper function to check if error is Node.js ENOENT error
 */
function isNotFoundError(error: unknown): boolean {
  return error !== null && 
         typeof error === 'object' && 
         'code' in error && 
         (error as { code: string }).code === 'ENOENT';
}

/**
 * File system implementation of IntentStore for durability
 */
export class FileSystemIntentStore implements IntentStore {
  private baseDir: string;

  constructor(baseDir: string = './var/intents') {
    this.baseDir = baseDir;
  }

  async save(intent: Intent): Promise<void> {
    const fs = await import('fs');
    const path = await import('path');
    
    const intentDir = path.join(this.baseDir, intent.owner);
    const intentFile = path.join(intentDir, `${intent.id}.json`);

    // Ensure directory exists
    await fs.promises.mkdir(intentDir, { recursive: true });

    // Save as JSON
    const data = JSON.stringify({
      ...intent,
      createdAt: intent.createdAt.toISOString(),
      updatedAt: intent.updatedAt.toISOString(),
      versions: intent.versions.map(v => ({
        ...v,
        createdAt: v.createdAt.toISOString(),
      })),
    }, null, 2);

    await fs.promises.writeFile(intentFile, data, 'utf-8');
  }

  async load(intentId: string): Promise<Intent | null> {
    const fs = await import('fs');
    const path = await import('path');
    
    // Search across all owner directories
    try {
      const ownerDirs = await fs.promises.readdir(this.baseDir);
      
      for (const owner of ownerDirs) {
        const intentFile = path.join(this.baseDir, owner, `${intentId}.json`);
        
        try {
          const data = await fs.promises.readFile(intentFile, 'utf-8');
          const parsed = JSON.parse(data);
          
          return {
            ...parsed,
            createdAt: new Date(parsed.createdAt),
            updatedAt: new Date(parsed.updatedAt),
            versions: parsed.versions.map((v: any) => ({
              ...v,
              createdAt: new Date(v.createdAt),
            })),
          };
        } catch (error) {
          // File doesn't exist in this owner directory, continue searching
          continue;
        }
      }
      
      return null;
    } catch (error) {
      // Base directory doesn't exist yet
      if (isNotFoundError(error)) {
        return null;
      }
      throw error;
    }
  }

  async loadVersion(intentId: string, version: number): Promise<IntentVersion | null> {
    const intent = await this.load(intentId);
    if (!intent) return null;

    const versionData = intent.versions.find(v => v.version === version);
    return versionData || null;
  }

  async query(options: QueryIntentOptions): Promise<Intent[]> {
    const allIntents = await this.listAll();
    
    return allIntents.filter(intent => {
      // Filter by owner
      if (options.owner && intent.owner !== options.owner) {
        return false;
      }
      
      // Filter by status
      if (options.status && intent.status !== options.status) {
        return false;
      }
      
      // Filter by tags
      if (options.tags && options.tags.length > 0) {
        const intentTags = intent.tags || [];
        const hasMatchingTag = options.tags.some(tag => intentTags.includes(tag));
        if (!hasMatchingTag) {
          return false;
        }
      }
      
      // Filter by creation date range
      if (options.createdAfter && intent.createdAt < options.createdAfter) {
        return false;
      }
      if (options.createdBefore && intent.createdAt > options.createdBefore) {
        return false;
      }
      
      // Filter by linked workflow
      if (options.workflowId && !intent.workflowIds.includes(options.workflowId)) {
        return false;
      }
      
      // Filter by linked hypothesis
      if (options.hypothesisId && !intent.hypothesisIds.includes(options.hypothesisId)) {
        return false;
      }
      
      return true;
    })
    .slice(options.offset || 0, (options.offset || 0) + (options.limit || Number.MAX_SAFE_INTEGER));
  }

  async listAll(): Promise<Intent[]> {
    const fs = await import('fs');
    const path = await import('path');
    
    const intents: Intent[] = [];
    
    try {
      const ownerDirs = await fs.promises.readdir(this.baseDir);
      
      for (const owner of ownerDirs) {
        const ownerDir = path.join(this.baseDir, owner);
        const stats = await fs.promises.stat(ownerDir);
        
        if (stats.isDirectory()) {
          const files = await fs.promises.readdir(ownerDir);
          
          for (const file of files) {
            if (file.endsWith('.json')) {
              const intentFile = path.join(ownerDir, file);
              const data = await fs.promises.readFile(intentFile, 'utf-8');
              const parsed = JSON.parse(data);
              
              intents.push({
                ...parsed,
                createdAt: new Date(parsed.createdAt),
                updatedAt: new Date(parsed.updatedAt),
                versions: parsed.versions.map((v: any) => ({
                  ...v,
                  createdAt: new Date(v.createdAt),
                })),
              });
            }
          }
        }
      }
    } catch (error) {
      // Base directory doesn't exist yet
      if (isNotFoundError(error)) {
        return [];
      }
      throw error;
    }
    
    return intents;
  }
}
