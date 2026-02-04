import { describe, it, expect } from 'vitest';
import {
  MemoryPolicy,
  MemoryPolicyConfig,
  RiskProfile,
  IndexingStrategy,
} from '../src/types';

describe('Memory Policy Model', () => {
  describe('MemoryPolicyConfig', () => {
    it('should define valid configuration with minimal fields', () => {
      const config: MemoryPolicyConfig = {
        goals: ['optimize for cost'],
        riskProfile: RiskProfile.LOW,
      };

      expect(config.goals).toHaveLength(1);
      expect(config.riskProfile).toBe(RiskProfile.LOW);
    });

    it('should define configuration with all fields', () => {
      const config: MemoryPolicyConfig = {
        goals: ['optimize for cost', 'maximize retention'],
        riskProfile: RiskProfile.HIGH,
        dataClassification: 'sensitive',
        complianceRequirements: ['GDPR', 'HIPAA'],
        budgetConstraints: {
          maxStorageMb: 1000,
          maxCostPerMonth: 100,
        },
      };

      expect(config.goals).toHaveLength(2);
      expect(config.riskProfile).toBe(RiskProfile.HIGH);
      expect(config.dataClassification).toBe('sensitive');
      expect(config.complianceRequirements).toHaveLength(2);
      expect(config.budgetConstraints?.maxStorageMb).toBe(1000);
    });

    it('should support all risk profile levels', () => {
      const profiles = [
        RiskProfile.LOW,
        RiskProfile.MEDIUM,
        RiskProfile.HIGH,
        RiskProfile.CRITICAL,
      ];

      profiles.forEach(profile => {
        const config: MemoryPolicyConfig = {
          goals: ['test'],
          riskProfile: profile,
        };
        expect(config.riskProfile).toBe(profile);
      });
    });
  });

  describe('MemoryPolicy', () => {
    it('should define valid policy structure', () => {
      const policy: MemoryPolicy = {
        id: 'policy-123',
        name: 'test-policy',
        description: 'Test policy description',
        retentionTiers: [
          {
            tier: 'hot',
            maxAgeMs: 86400000,
            accessThreshold: 10,
            compressionEnabled: false,
            summarizationEnabled: false,
          },
          {
            tier: 'warm',
            maxAgeMs: 604800000,
            accessThreshold: 5,
            compressionEnabled: true,
            summarizationEnabled: true,
          },
        ],
        summarizationSchedule: {
          enabled: true,
          intervalMs: 3600000,
          batchSize: 50,
          strategy: 'extract_key',
          retentionAfterSummarization: 604800000,
        },
        indexingStrategy: IndexingStrategy.TEMPORAL,
        governanceThresholds: {
          minRetentionMs: 86400000,
          maxRetentionMs: 31536000000,
          minSummarizationIntervalMs: 1800000,
          requireAuditLog: false,
          requireEncryption: false,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(policy.id).toBe('policy-123');
      expect(policy.retentionTiers).toHaveLength(2);
      expect(policy.summarizationSchedule.enabled).toBe(true);
      expect(policy.indexingStrategy).toBe(IndexingStrategy.TEMPORAL);
    });

    it('should support all indexing strategies', () => {
      const strategies = [
        IndexingStrategy.TEMPORAL,
        IndexingStrategy.SEMANTIC,
        IndexingStrategy.HIERARCHICAL,
        IndexingStrategy.HYBRID,
      ];

      strategies.forEach(strategy => {
        const policy: Partial<MemoryPolicy> = {
          indexingStrategy: strategy,
        };
        expect(policy.indexingStrategy).toBe(strategy);
      });
    });

    it('should define retention tiers without max age (archived tier)', () => {
      const tier = {
        tier: 'archived',
        accessThreshold: 0,
        compressionEnabled: true,
        summarizationEnabled: true,
      };

      expect(tier.maxAgeMs).toBeUndefined();
      expect(tier.tier).toBe('archived');
    });
  });

  describe('GovernanceThresholds', () => {
    it('should enforce minimum retention requirements', () => {
      const thresholds = {
        minRetentionMs: 86400000, // 1 day
        maxRetentionMs: 31536000000, // 1 year
        minSummarizationIntervalMs: 1800000, // 30 minutes
        requireAuditLog: true,
        requireEncryption: true,
      };

      expect(thresholds.minRetentionMs).toBeGreaterThan(0);
      expect(thresholds.maxRetentionMs).toBeGreaterThan(thresholds.minRetentionMs);
      expect(thresholds.requireAuditLog).toBe(true);
      expect(thresholds.requireEncryption).toBe(true);
    });

    it('should allow flexible compliance configurations', () => {
      const strictThresholds = {
        minRetentionMs: 2592000000, // 30 days
        maxRetentionMs: 220752000000, // 7 years
        minSummarizationIntervalMs: 1800000,
        requireAuditLog: true,
        requireEncryption: true,
      };

      const relaxedThresholds = {
        minRetentionMs: 86400000, // 1 day
        maxRetentionMs: 31536000000, // 1 year
        minSummarizationIntervalMs: 1800000,
        requireAuditLog: false,
        requireEncryption: false,
      };

      expect(strictThresholds.minRetentionMs).toBeGreaterThan(relaxedThresholds.minRetentionMs);
      expect(strictThresholds.requireAuditLog).toBe(true);
      expect(relaxedThresholds.requireAuditLog).toBe(false);
    });
  });
});
