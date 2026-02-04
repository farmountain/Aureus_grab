import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryEngineBuilder } from '../../../apps/console/src/memory-engine-builder';
import {
  MemoryPolicyConfig,
  RiskProfile,
  IndexingStrategy,
} from '../src/types';

describe('Memory Policy Validation and Enforcement', () => {
  let builder: MemoryEngineBuilder;

  beforeEach(() => {
    builder = new MemoryEngineBuilder();
  });

  describe('Policy Generation', () => {
    it('should generate valid policy from minimal config', () => {
      const config: MemoryPolicyConfig = {
        goals: ['optimize for cost'],
        riskProfile: RiskProfile.LOW,
      };

      const policy = builder.generateMemoryPolicy(config);

      expect(policy.id).toBeDefined();
      expect(policy.name).toBeDefined();
      expect(policy.retentionTiers).toBeDefined();
      expect(policy.retentionTiers.length).toBeGreaterThan(0);
      expect(policy.summarizationSchedule).toBeDefined();
      expect(policy.indexingStrategy).toBeDefined();
      expect(policy.governanceThresholds).toBeDefined();
    });

    it('should adjust retention tiers based on risk profile', () => {
      const lowRiskConfig: MemoryPolicyConfig = {
        goals: ['standard'],
        riskProfile: RiskProfile.LOW,
      };

      const highRiskConfig: MemoryPolicyConfig = {
        goals: ['standard'],
        riskProfile: RiskProfile.HIGH,
      };

      const lowPolicy = builder.generateMemoryPolicy(lowRiskConfig);
      const highPolicy = builder.generateMemoryPolicy(highRiskConfig);

      const lowHotTier = lowPolicy.retentionTiers.find(t => t.tier === 'hot');
      const highHotTier = highPolicy.retentionTiers.find(t => t.tier === 'hot');

      expect(highHotTier?.maxAgeMs).toBeGreaterThan(lowHotTier?.maxAgeMs || 0);
    });

    it('should enable compression when cost-optimized', () => {
      const config: MemoryPolicyConfig = {
        goals: ['optimize for cost'],
        riskProfile: RiskProfile.MEDIUM,
      };

      const policy = builder.generateMemoryPolicy(config);
      const warmTier = policy.retentionTiers.find(t => t.tier === 'warm');

      expect(warmTier?.summarizationEnabled).toBe(true);
    });

    it('should set temporal indexing for cost-optimized goals', () => {
      const config: MemoryPolicyConfig = {
        goals: ['optimize for cost'],
        riskProfile: RiskProfile.LOW,
      };

      const policy = builder.generateMemoryPolicy(config);

      expect(policy.indexingStrategy).toBe(IndexingStrategy.TEMPORAL);
    });

    it('should set semantic indexing for semantic goals', () => {
      const config: MemoryPolicyConfig = {
        goals: ['semantic search', 'context optimization'],
        riskProfile: RiskProfile.MEDIUM,
      };

      const policy = builder.generateMemoryPolicy(config);

      expect(policy.indexingStrategy).toBe(IndexingStrategy.SEMANTIC);
    });

    it('should increase governance thresholds for compliance requirements', () => {
      const configWithoutCompliance: MemoryPolicyConfig = {
        goals: ['standard'],
        riskProfile: RiskProfile.LOW,
      };

      const configWithCompliance: MemoryPolicyConfig = {
        goals: ['standard'],
        riskProfile: RiskProfile.LOW,
        complianceRequirements: ['GDPR'],
      };

      const policyWithout = builder.generateMemoryPolicy(configWithoutCompliance);
      const policyWith = builder.generateMemoryPolicy(configWithCompliance);

      expect(policyWith.governanceThresholds.minRetentionMs).toBeGreaterThan(
        policyWithout.governanceThresholds.minRetentionMs
      );
      expect(policyWith.governanceThresholds.requireAuditLog).toBe(true);
    });
  });

  describe('Policy Validation', () => {
    it('should validate a correctly formed policy', () => {
      const config: MemoryPolicyConfig = {
        goals: ['optimize for cost'],
        riskProfile: RiskProfile.MEDIUM,
      };

      const policy = builder.generateMemoryPolicy(config);
      const validation = builder.validateMemoryPolicy(policy);

      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should reject policy with no retention tiers', () => {
      const config: MemoryPolicyConfig = {
        goals: ['test'],
        riskProfile: RiskProfile.LOW,
      };

      const policy = builder.generateMemoryPolicy(config);
      policy.retentionTiers = [];

      const validation = builder.validateMemoryPolicy(policy);

      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
      expect(validation.errors[0]).toContain('at least one retention tier');
    });

    it('should reject policy with retention below minimum threshold', () => {
      const config: MemoryPolicyConfig = {
        goals: ['test'],
        riskProfile: RiskProfile.MEDIUM,
      };

      const policy = builder.generateMemoryPolicy(config);
      // Set hot tier retention below minimum
      policy.retentionTiers[0].maxAgeMs = 1000; // 1 second
      policy.governanceThresholds.minRetentionMs = 86400000; // 1 day

      const validation = builder.validateMemoryPolicy(policy);

      expect(validation.valid).toBe(false);
      expect(validation.errors.some(e => e.includes('below minimum threshold'))).toBe(true);
    });

    it('should reject policy with summarization interval below threshold', () => {
      const config: MemoryPolicyConfig = {
        goals: ['test'],
        riskProfile: RiskProfile.LOW,
      };

      const policy = builder.generateMemoryPolicy(config);
      policy.summarizationSchedule.intervalMs = 60000; // 1 minute
      policy.governanceThresholds.minSummarizationIntervalMs = 1800000; // 30 minutes

      const validation = builder.validateMemoryPolicy(policy);

      expect(validation.valid).toBe(false);
      expect(validation.errors.some(e => e.includes('Summarization interval'))).toBe(true);
    });

    it('should reject policy with invalid batch size', () => {
      const config: MemoryPolicyConfig = {
        goals: ['test'],
        riskProfile: RiskProfile.LOW,
      };

      const policy = builder.generateMemoryPolicy(config);
      policy.summarizationSchedule.batchSize = 0;

      const validation = builder.validateMemoryPolicy(policy);

      expect(validation.valid).toBe(false);
      expect(validation.errors.some(e => e.includes('batch size'))).toBe(true);
    });

    it('should warn about audit log requirements', () => {
      const config: MemoryPolicyConfig = {
        goals: ['test'],
        riskProfile: RiskProfile.HIGH,
      };

      const policy = builder.generateMemoryPolicy(config);
      const validation = builder.validateMemoryPolicy(policy);

      if (policy.governanceThresholds.requireAuditLog) {
        expect(validation.warnings.some(w => w.includes('Audit logging is required'))).toBe(true);
      }
    });

    it('should warn about encryption requirements', () => {
      const config: MemoryPolicyConfig = {
        goals: ['test'],
        riskProfile: RiskProfile.CRITICAL,
        dataClassification: 'sensitive',
      };

      const policy = builder.generateMemoryPolicy(config);
      const validation = builder.validateMemoryPolicy(policy);

      expect(validation.warnings.some(w => w.includes('Encryption is required'))).toBe(true);
    });

    it('should warn about tier ordering issues', () => {
      const config: MemoryPolicyConfig = {
        goals: ['test'],
        riskProfile: RiskProfile.LOW,
      };

      const policy = builder.generateMemoryPolicy(config);
      // Make warm tier shorter than hot tier (invalid ordering)
      const hotTier = policy.retentionTiers.find(t => t.tier === 'hot');
      const warmTier = policy.retentionTiers.find(t => t.tier === 'warm');
      if (hotTier && warmTier && hotTier.maxAgeMs && warmTier.maxAgeMs) {
        warmTier.maxAgeMs = hotTier.maxAgeMs - 1000;
      }

      const validation = builder.validateMemoryPolicy(policy);

      expect(validation.warnings.some(w => w.includes('should have longer retention'))).toBe(true);
    });
  });

  describe('Policy Preview', () => {
    it('should generate human-readable preview', () => {
      const config: MemoryPolicyConfig = {
        goals: ['optimize for cost'],
        riskProfile: RiskProfile.MEDIUM,
      };

      const policy = builder.generateMemoryPolicy(config);
      const preview = builder.getPolicyPreview(policy);

      expect(preview).toContain('Memory Policy:');
      expect(preview).toContain('Retention Tiers:');
      expect(preview).toContain('Summarization:');
      expect(preview).toContain('Indexing Strategy:');
      expect(preview).toContain('Governance:');
    });

    it('should include all retention tiers in preview', () => {
      const config: MemoryPolicyConfig = {
        goals: ['standard'],
        riskProfile: RiskProfile.LOW,
      };

      const policy = builder.generateMemoryPolicy(config);
      const preview = builder.getPolicyPreview(policy);

      policy.retentionTiers.forEach(tier => {
        expect(preview).toContain(tier.tier);
      });
    });

    it('should show compression and summarization flags', () => {
      const config: MemoryPolicyConfig = {
        goals: ['optimize for cost'],
        riskProfile: RiskProfile.LOW,
      };

      const policy = builder.generateMemoryPolicy(config);
      const preview = builder.getPolicyPreview(policy);

      expect(preview).toContain('[compression]');
      expect(preview).toContain('[summarization]');
    });
  });
});
