import {
  MemoryPolicy,
  MemoryPolicyConfig,
  RiskProfile,
  IndexingStrategy,
  RetentionTierPolicy,
  SummarizationSchedule,
  GovernanceThresholds,
} from '@aureus/memory-hipcortex';

/**
 * Memory Engine Builder
 * Generates memory configuration from goals and risk profile
 */
export class MemoryEngineBuilder {
  /**
   * Generate memory policy from configuration
   */
  generateMemoryPolicy(config: MemoryPolicyConfig): MemoryPolicy {
    const policyId = `policy-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    
    return {
      id: policyId,
      name: this.generatePolicyName(config),
      description: this.generatePolicyDescription(config),
      retentionTiers: this.generateRetentionTiers(config),
      summarizationSchedule: this.generateSummarizationSchedule(config),
      indexingStrategy: this.generateIndexingStrategy(config),
      governanceThresholds: this.generateGovernanceThresholds(config),
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: {
        generatedFrom: config,
      },
    };
  }

  /**
   * Generate policy name based on configuration
   */
  private generatePolicyName(config: MemoryPolicyConfig): string {
    const riskLevel = config.riskProfile.toUpperCase();
    const primaryGoal = config.goals[0] || 'standard';
    return `${riskLevel}-${primaryGoal.replace(/\s+/g, '-').toLowerCase()}-policy`;
  }

  /**
   * Generate policy description
   */
  private generatePolicyDescription(config: MemoryPolicyConfig): string {
    const parts: string[] = [
      `Memory policy for ${config.riskProfile} risk profile.`,
    ];
    
    if (config.goals.length > 0) {
      parts.push(`Goals: ${config.goals.join(', ')}.`);
    }
    
    if (config.complianceRequirements && config.complianceRequirements.length > 0) {
      parts.push(`Compliance: ${config.complianceRequirements.join(', ')}.`);
    }
    
    return parts.join(' ');
  }

  /**
   * Generate retention tiers based on risk profile and goals
   */
  private generateRetentionTiers(config: MemoryPolicyConfig): RetentionTierPolicy[] {
    const riskMultipliers = {
      [RiskProfile.LOW]: { hot: 1, warm: 1, cold: 1, archived: 1 },
      [RiskProfile.MEDIUM]: { hot: 1.5, warm: 1.5, cold: 1.3, archived: 1.2 },
      [RiskProfile.HIGH]: { hot: 2, warm: 2, cold: 1.5, archived: 1.5 },
      [RiskProfile.CRITICAL]: { hot: 3, warm: 3, cold: 2, archived: 2 },
    };

    const multiplier = riskMultipliers[config.riskProfile];
    const costOptimized = config.goals.some(g => g.toLowerCase().includes('cost'));
    const retentionOptimized = config.goals.some(g => g.toLowerCase().includes('retention'));

    // Base times in milliseconds
    const HOURS_24 = 24 * 60 * 60 * 1000;
    const DAYS_7 = 7 * 24 * 60 * 60 * 1000;
    const DAYS_30 = 30 * 24 * 60 * 60 * 1000;

    const tiers: RetentionTierPolicy[] = [
      {
        tier: 'hot',
        maxAgeMs: Math.floor(HOURS_24 * multiplier.hot),
        accessThreshold: 10,
        compressionEnabled: false,
        summarizationEnabled: false,
      },
      {
        tier: 'warm',
        maxAgeMs: Math.floor(DAYS_7 * multiplier.warm),
        accessThreshold: 5,
        compressionEnabled: !retentionOptimized,
        summarizationEnabled: costOptimized,
      },
      {
        tier: 'cold',
        maxAgeMs: Math.floor(DAYS_30 * multiplier.cold),
        accessThreshold: 2,
        compressionEnabled: true,
        summarizationEnabled: true,
      },
      {
        tier: 'archived',
        accessThreshold: 0,
        compressionEnabled: true,
        summarizationEnabled: true,
      },
    ];

    // Adjust based on budget constraints
    if (config.budgetConstraints?.maxStorageMb) {
      // Enable more aggressive compression for all tiers
      tiers.forEach(tier => {
        tier.compressionEnabled = true;
        if (tier.tier !== 'hot') {
          tier.summarizationEnabled = true;
        }
      });
    }

    return tiers;
  }

  /**
   * Generate summarization schedule based on goals and risk profile
   */
  private generateSummarizationSchedule(config: MemoryPolicyConfig): SummarizationSchedule {
    const costOptimized = config.goals.some(g => g.toLowerCase().includes('cost'));
    const performanceOptimized = config.goals.some(g => g.toLowerCase().includes('performance'));

    // Base interval: 1 hour
    const BASE_INTERVAL = 60 * 60 * 1000;
    
    let intervalMultiplier = 1;
    if (costOptimized) {
      intervalMultiplier = 0.5; // More frequent summarization to save space
    } else if (performanceOptimized) {
      intervalMultiplier = 2; // Less frequent to reduce CPU overhead
    }

    const riskMultipliers = {
      [RiskProfile.LOW]: 2,
      [RiskProfile.MEDIUM]: 1.5,
      [RiskProfile.HIGH]: 1,
      [RiskProfile.CRITICAL]: 0.5,
    };

    const enabled = config.riskProfile !== RiskProfile.CRITICAL || costOptimized;
    
    return {
      enabled,
      intervalMs: Math.floor(BASE_INTERVAL * intervalMultiplier * riskMultipliers[config.riskProfile]),
      batchSize: costOptimized ? 100 : 50,
      strategy: 'extract_key',
      retentionAfterSummarization: 7 * 24 * 60 * 60 * 1000, // 7 days
    };
  }

  /**
   * Generate indexing strategy based on goals
   */
  private generateIndexingStrategy(config: MemoryPolicyConfig): IndexingStrategy {
    const performanceGoal = config.goals.some(g => 
      g.toLowerCase().includes('performance') || g.toLowerCase().includes('speed')
    );
    const semanticGoal = config.goals.some(g => 
      g.toLowerCase().includes('semantic') || g.toLowerCase().includes('context')
    );
    const costOptimized = config.goals.some(g => g.toLowerCase().includes('cost'));

    if (semanticGoal && !costOptimized) {
      return IndexingStrategy.SEMANTIC;
    } else if (performanceGoal && !costOptimized) {
      return IndexingStrategy.HYBRID;
    } else if (costOptimized) {
      return IndexingStrategy.TEMPORAL;
    } else if (config.riskProfile === RiskProfile.CRITICAL) {
      return IndexingStrategy.HYBRID;
    }

    return IndexingStrategy.TEMPORAL;
  }

  /**
   * Generate governance thresholds based on risk profile and compliance
   */
  private generateGovernanceThresholds(config: MemoryPolicyConfig): GovernanceThresholds {
    const hasCompliance = config.complianceRequirements && config.complianceRequirements.length > 0;
    const isHighRisk = config.riskProfile === RiskProfile.HIGH || config.riskProfile === RiskProfile.CRITICAL;

    // Minimum retention based on compliance
    let minRetentionMs = 24 * 60 * 60 * 1000; // 1 day default
    if (hasCompliance) {
      minRetentionMs = 30 * 24 * 60 * 60 * 1000; // 30 days for compliance
    }
    if (isHighRisk) {
      minRetentionMs = 90 * 24 * 60 * 60 * 1000; // 90 days for high risk
    }

    // Maximum retention based on compliance and data classification
    let maxRetentionMs = 365 * 24 * 60 * 60 * 1000; // 1 year default
    if (hasCompliance) {
      maxRetentionMs = 7 * 365 * 24 * 60 * 60 * 1000; // 7 years for compliance
    }

    return {
      minRetentionMs,
      maxRetentionMs,
      minSummarizationIntervalMs: 30 * 60 * 1000, // 30 minutes minimum
      requireAuditLog: isHighRisk || hasCompliance,
      requireEncryption: isHighRisk || hasCompliance || config.dataClassification === 'sensitive',
    };
  }

  /**
   * Validate memory policy against governance thresholds
   */
  validateMemoryPolicy(policy: MemoryPolicy): { valid: boolean; errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate retention tiers
    if (!policy.retentionTiers || policy.retentionTiers.length === 0) {
      errors.push('Memory policy must define at least one retention tier');
    } else {
      // Check that retention tiers meet minimum governance thresholds
      const hotTier = policy.retentionTiers.find(t => t.tier === 'hot');
      if (hotTier && hotTier.maxAgeMs) {
        if (hotTier.maxAgeMs < policy.governanceThresholds.minRetentionMs) {
          errors.push(
            `Hot tier retention (${hotTier.maxAgeMs}ms) is below minimum threshold (${policy.governanceThresholds.minRetentionMs}ms)`
          );
        }
      }

      // Check for proper tier ordering
      const tiersWithAge = policy.retentionTiers.filter(t => t.maxAgeMs);
      for (let i = 1; i < tiersWithAge.length; i++) {
        if (tiersWithAge[i].maxAgeMs! <= tiersWithAge[i - 1].maxAgeMs!) {
          warnings.push(`Retention tier ${tiersWithAge[i].tier} should have longer retention than ${tiersWithAge[i - 1].tier}`);
        }
      }
    }

    // Validate summarization schedule
    if (policy.summarizationSchedule.enabled) {
      if (policy.summarizationSchedule.intervalMs < policy.governanceThresholds.minSummarizationIntervalMs) {
        errors.push(
          `Summarization interval (${policy.summarizationSchedule.intervalMs}ms) is below minimum threshold (${policy.governanceThresholds.minSummarizationIntervalMs}ms)`
        );
      }

      if (policy.summarizationSchedule.batchSize <= 0) {
        errors.push('Summarization batch size must be greater than 0');
      }
    }

    // Validate indexing strategy
    if (!Object.values(IndexingStrategy).includes(policy.indexingStrategy)) {
      errors.push(`Invalid indexing strategy: ${policy.indexingStrategy}`);
    }

    // Governance requirement validations
    if (policy.governanceThresholds.requireAuditLog) {
      warnings.push('Audit logging is required for this policy. Ensure audit log is enabled in the system.');
    }

    if (policy.governanceThresholds.requireEncryption) {
      warnings.push('Encryption is required for this policy. Ensure encryption is enabled for memory storage.');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Get policy preview as human-readable summary
   */
  getPolicyPreview(policy: MemoryPolicy): string {
    const lines: string[] = [
      `Memory Policy: ${policy.name}`,
      `Description: ${policy.description || 'No description'}`,
      ``,
      `Retention Tiers:`,
    ];

    policy.retentionTiers.forEach(tier => {
      const agePart = tier.maxAgeMs ? ` (max age: ${this.formatDuration(tier.maxAgeMs)})` : '';
      const compressionPart = tier.compressionEnabled ? ' [compression]' : '';
      const summarizationPart = tier.summarizationEnabled ? ' [summarization]' : '';
      lines.push(`  - ${tier.tier}${agePart}${compressionPart}${summarizationPart}`);
    });

    lines.push(``);
    lines.push(`Summarization:`);
    if (policy.summarizationSchedule.enabled) {
      lines.push(`  - Interval: ${this.formatDuration(policy.summarizationSchedule.intervalMs)}`);
      lines.push(`  - Batch size: ${policy.summarizationSchedule.batchSize}`);
      lines.push(`  - Strategy: ${policy.summarizationSchedule.strategy}`);
    } else {
      lines.push(`  - Disabled`);
    }

    lines.push(``);
    lines.push(`Indexing Strategy: ${policy.indexingStrategy}`);

    lines.push(``);
    lines.push(`Governance:`);
    lines.push(`  - Min retention: ${this.formatDuration(policy.governanceThresholds.minRetentionMs)}`);
    lines.push(`  - Max retention: ${this.formatDuration(policy.governanceThresholds.maxRetentionMs)}`);
    lines.push(`  - Audit log required: ${policy.governanceThresholds.requireAuditLog ? 'Yes' : 'No'}`);
    lines.push(`  - Encryption required: ${policy.governanceThresholds.requireEncryption ? 'Yes' : 'No'}`);

    return lines.join('\n');
  }

  /**
   * Format duration in milliseconds to human-readable string
   */
  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days} day${days !== 1 ? 's' : ''}`;
    } else if (hours > 0) {
      return `${hours} hour${hours !== 1 ? 's' : ''}`;
    } else if (minutes > 0) {
      return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
    } else {
      return `${seconds} second${seconds !== 1 ? 's' : ''}`;
    }
  }
}
