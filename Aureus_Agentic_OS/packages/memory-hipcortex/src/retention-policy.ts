import { MemoryEntry } from './types';

/**
 * Retention tiers for long-horizon memory management
 */
export enum RetentionTier {
  HOT = 'hot',           // Recent, frequently accessed - full fidelity
  WARM = 'warm',         // Older, less frequent - may be compressed
  COLD = 'cold',         // Rarely accessed - summarized
  ARCHIVED = 'archived'  // Long-term storage - heavily compressed
}

/**
 * Retention policy configuration
 */
export interface RetentionPolicyConfig {
  tier: RetentionTier;
  maxAge?: number;        // Max age in milliseconds before transitioning
  maxEntries?: number;    // Max entries before transitioning
  compressionRatio?: number; // Target compression ratio for summarization
  accessThreshold?: number;  // Access count threshold for tier transition
}

/**
 * Retention metadata for memory entries
 */
export interface RetentionMetadata {
  tier: RetentionTier;
  lastAccessed: Date;
  accessCount: number;
  transitionedAt?: Date;
  originalSize?: number;
  compressedSize?: number;
  summarized?: boolean;
}

/**
 * Retention policy decision
 */
export interface RetentionDecision {
  entryId: string;
  currentTier: RetentionTier;
  targetTier: RetentionTier;
  reason: string;
  action: 'keep' | 'transition' | 'summarize' | 'archive' | 'delete';
}

/**
 * Default retention policy configurations
 */
const HOURS_24_MS = 24 * 60 * 60 * 1000;
const DAYS_7_MS = 7 * 24 * 60 * 60 * 1000;
const DAYS_30_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * RetentionPolicyManager manages memory retention across different tiers
 */
export class RetentionPolicyManager {
  private policies: Map<RetentionTier, RetentionPolicyConfig> = new Map();
  private entryMetadata: Map<string, RetentionMetadata> = new Map();
  private defaultPolicies: RetentionPolicyConfig[] = [
    {
      tier: RetentionTier.HOT,
      maxAge: HOURS_24_MS,
      accessThreshold: 10,
    },
    {
      tier: RetentionTier.WARM,
      maxAge: DAYS_7_MS,
      accessThreshold: 5,
      compressionRatio: 0.5,
    },
    {
      tier: RetentionTier.COLD,
      maxAge: DAYS_30_MS,
      accessThreshold: 2,
      compressionRatio: 0.2,
    },
    {
      tier: RetentionTier.ARCHIVED,
      compressionRatio: 0.1,
    },
  ];

  constructor(customPolicies?: RetentionPolicyConfig[]) {
    // Initialize with default or custom policies
    const policiesToUse = customPolicies || this.defaultPolicies;
    policiesToUse.forEach(policy => {
      this.policies.set(policy.tier, policy);
    });
  }

  /**
   * Track a new memory entry
   */
  trackEntry(entryId: string, initialTier: RetentionTier = RetentionTier.HOT): void {
    this.entryMetadata.set(entryId, {
      tier: initialTier,
      lastAccessed: new Date(),
      accessCount: 0,
    });
  }

  /**
   * Record an access to a memory entry
   */
  recordAccess(entryId: string): void {
    const metadata = this.entryMetadata.get(entryId);
    if (metadata) {
      metadata.lastAccessed = new Date();
      metadata.accessCount++;
    }
  }

  /**
   * Evaluate retention policy for an entry
   */
  evaluateEntry(entryId: string, entry: MemoryEntry): RetentionDecision {
    const metadata = this.entryMetadata.get(entryId);
    if (!metadata) {
      throw new Error(`Entry ${entryId} not tracked`);
    }

    const currentPolicy = this.policies.get(metadata.tier);
    if (!currentPolicy) {
      throw new Error(`No policy for tier ${metadata.tier}`);
    }

    const now = Date.now();
    const age = now - entry.provenance.timestamp.getTime();

    // Check if entry should transition to next tier
    const targetTier = this.determineTargetTier(metadata, currentPolicy, age);

    if (targetTier === metadata.tier) {
      return {
        entryId,
        currentTier: metadata.tier,
        targetTier,
        reason: 'No transition needed',
        action: 'keep',
      };
    }

    // Determine action based on tier transition
    let action: RetentionDecision['action'] = 'transition';
    if (targetTier === RetentionTier.WARM || targetTier === RetentionTier.COLD) {
      action = 'summarize';
    } else if (targetTier === RetentionTier.ARCHIVED) {
      action = 'archive';
    }

    return {
      entryId,
      currentTier: metadata.tier,
      targetTier,
      reason: `Age: ${Math.round(age / (60 * 60 * 1000))}h, Access count: ${metadata.accessCount}`,
      action,
    };
  }

  /**
   * Determine target tier based on policy and access patterns
   */
  private determineTargetTier(
    metadata: RetentionMetadata,
    policy: RetentionPolicyConfig,
    age: number
  ): RetentionTier {
    // If access count is high, keep in current tier or promote
    if (policy.accessThreshold && metadata.accessCount >= policy.accessThreshold) {
      return metadata.tier;
    }

    // If age exceeds max age, transition to next tier
    if (policy.maxAge && age > policy.maxAge) {
      return this.getNextTier(metadata.tier);
    }

    return metadata.tier;
  }

  /**
   * Get the next tier in the retention hierarchy
   */
  private getNextTier(currentTier: RetentionTier): RetentionTier {
    switch (currentTier) {
      case RetentionTier.HOT:
        return RetentionTier.WARM;
      case RetentionTier.WARM:
        return RetentionTier.COLD;
      case RetentionTier.COLD:
        return RetentionTier.ARCHIVED;
      default:
        return RetentionTier.ARCHIVED;
    }
  }

  /**
   * Transition an entry to a new tier
   */
  transitionEntry(entryId: string, targetTier: RetentionTier): void {
    const metadata = this.entryMetadata.get(entryId);
    if (metadata) {
      metadata.tier = targetTier;
      metadata.transitionedAt = new Date();
    }
  }

  /**
   * Get metadata for an entry
   */
  getMetadata(entryId: string): RetentionMetadata | undefined {
    return this.entryMetadata.get(entryId);
  }

  /**
   * Get all entries in a specific tier
   */
  getEntriesByTier(tier: RetentionTier): string[] {
    return Array.from(this.entryMetadata.entries())
      .filter(([_, metadata]) => metadata.tier === tier)
      .map(([entryId, _]) => entryId);
  }

  /**
   * Get retention statistics
   */
  getStats(): {
    totalEntries: number;
    byTier: Record<RetentionTier, number>;
    avgAccessCount: number;
  } {
    const byTier: Record<RetentionTier, number> = {
      [RetentionTier.HOT]: 0,
      [RetentionTier.WARM]: 0,
      [RetentionTier.COLD]: 0,
      [RetentionTier.ARCHIVED]: 0,
    };

    let totalAccessCount = 0;
    let entryCount = 0;

    for (const metadata of this.entryMetadata.values()) {
      byTier[metadata.tier]++;
      totalAccessCount += metadata.accessCount;
      entryCount++;
    }

    return {
      totalEntries: entryCount,
      byTier,
      avgAccessCount: entryCount > 0 ? totalAccessCount / entryCount : 0,
    };
  }

  /**
   * Set compression metadata for an entry
   */
  setCompressionMetadata(
    entryId: string,
    originalSize: number,
    compressedSize: number,
    summarized: boolean
  ): void {
    const metadata = this.entryMetadata.get(entryId);
    if (metadata) {
      metadata.originalSize = originalSize;
      metadata.compressedSize = compressedSize;
      metadata.summarized = summarized;
    }
  }
}
