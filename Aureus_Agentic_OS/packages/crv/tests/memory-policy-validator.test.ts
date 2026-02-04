import { describe, it, expect } from 'vitest';
import { MemoryPolicyValidator } from '../src/memory-policy-validator';
import { Commit, FailureTaxonomy } from '../src/types';

describe('MemoryPolicyValidator', () => {
  describe('retentionCompliance', () => {
    it('should pass for data within retention period', async () => {
      const validator = MemoryPolicyValidator.retentionCompliance(
        24 * 60 * 60 * 1000 // 24 hours
      );

      const commit: Commit = {
        id: 'test-1',
        data: {
          timestamp: new Date(Date.now() - 12 * 60 * 60 * 1000), // 12 hours ago
          content: 'test data',
        },
      };

      const result = await validator(commit);

      expect(result.valid).toBe(true);
      expect(result.reason).toContain('Retention policy compliance verified');
    });

    it('should fail for data beyond retention period', async () => {
      const validator = MemoryPolicyValidator.retentionCompliance(
        24 * 60 * 60 * 1000 // 24 hours
      );

      const commit: Commit = {
        id: 'test-2',
        data: {
          timestamp: new Date(Date.now() - 48 * 60 * 60 * 1000), // 48 hours ago
          content: 'old data',
        },
      };

      const result = await validator(commit);

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('exceeds maximum retention period');
      expect(result.failure_code).toBe(FailureTaxonomy.POLICY_VIOLATION);
    });

    it('should fail for missing timestamp field', async () => {
      const validator = MemoryPolicyValidator.retentionCompliance(
        24 * 60 * 60 * 1000
      );

      const commit: Commit = {
        id: 'test-3',
        data: {
          content: 'test data',
        },
      };

      const result = await validator(commit);

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Timestamp field');
      expect(result.failure_code).toBe(FailureTaxonomy.MISSING_DATA);
    });
  });

  describe('compressionCompliance', () => {
    it('should pass for small data without compression', async () => {
      const validator = MemoryPolicyValidator.compressionCompliance(1000); // 1KB threshold

      const commit: Commit = {
        id: 'test-4',
        data: {
          content: 'small data',
        },
      };

      const result = await validator(commit);

      expect(result.valid).toBe(true);
    });

    it('should pass for large compressed data', async () => {
      const validator = MemoryPolicyValidator.compressionCompliance(100); // 100 bytes threshold

      const largeData = 'x'.repeat(200);
      const commit: Commit = {
        id: 'test-5',
        data: {
          content: largeData,
          compressed: true,
        },
      };

      const result = await validator(commit);

      expect(result.valid).toBe(true);
    });

    it('should fail for large uncompressed data', async () => {
      const validator = MemoryPolicyValidator.compressionCompliance(100); // 100 bytes threshold

      const largeData = 'x'.repeat(200);
      const commit: Commit = {
        id: 'test-6',
        data: {
          content: largeData,
          compressed: false,
        },
      };

      const result = await validator(commit);

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('exceeds threshold');
      expect(result.reason).toContain('not compressed');
      expect(result.failure_code).toBe(FailureTaxonomy.POLICY_VIOLATION);
    });
  });

  describe('encryptionCompliance', () => {
    it('should pass for public data without encryption', async () => {
      const validator = MemoryPolicyValidator.encryptionCompliance();

      const commit: Commit = {
        id: 'test-7',
        data: {
          dataClassification: 'public',
          content: 'public data',
        },
      };

      const result = await validator(commit);

      expect(result.valid).toBe(true);
    });

    it('should pass for sensitive encrypted data', async () => {
      const validator = MemoryPolicyValidator.encryptionCompliance();

      const commit: Commit = {
        id: 'test-8',
        data: {
          dataClassification: 'sensitive',
          content: 'encrypted-content-hash',
          encrypted: true,
        },
      };

      const result = await validator(commit);

      expect(result.valid).toBe(true);
    });

    it('should fail for sensitive unencrypted data', async () => {
      const validator = MemoryPolicyValidator.encryptionCompliance();

      const commit: Commit = {
        id: 'test-9',
        data: {
          dataClassification: 'sensitive',
          content: 'plain text sensitive data',
          encrypted: false,
        },
      };

      const result = await validator(commit);

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('must be encrypted');
      expect(result.failure_code).toBe(FailureTaxonomy.POLICY_VIOLATION);
    });

    it('should fail for confidential unencrypted data', async () => {
      const validator = MemoryPolicyValidator.encryptionCompliance();

      const commit: Commit = {
        id: 'test-10',
        data: {
          dataClassification: 'confidential',
          content: 'confidential data',
          encrypted: false,
        },
      };

      const result = await validator(commit);

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('must be encrypted');
    });
  });

  describe('complianceStandards', () => {
    it('should pass when no standards required', async () => {
      const validator = MemoryPolicyValidator.complianceStandards([]);

      const commit: Commit = {
        id: 'test-11',
        data: {
          content: 'test data',
        },
      };

      const result = await validator(commit);

      expect(result.valid).toBe(true);
    });

    it('should pass when all required standards are met', async () => {
      const validator = MemoryPolicyValidator.complianceStandards(['GDPR', 'HIPAA']);

      const commit: Commit = {
        id: 'test-12',
        data: {
          content: 'compliant data',
          complianceStandards: ['GDPR', 'HIPAA', 'SOC2'],
        },
      };

      const result = await validator(commit);

      expect(result.valid).toBe(true);
      expect(result.reason).toContain('Compliance standards verified');
    });

    it('should fail when compliance standards are missing', async () => {
      const validator = MemoryPolicyValidator.complianceStandards(['GDPR', 'HIPAA']);

      const commit: Commit = {
        id: 'test-13',
        data: {
          content: 'non-compliant data',
          complianceStandards: ['GDPR'],
        },
      };

      const result = await validator(commit);

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Missing required compliance standards');
      expect(result.reason).toContain('HIPAA');
      expect(result.failure_code).toBe(FailureTaxonomy.POLICY_VIOLATION);
    });

    it('should fail when compliance standards field is missing', async () => {
      const validator = MemoryPolicyValidator.complianceStandards(['GDPR']);

      const commit: Commit = {
        id: 'test-14',
        data: {
          content: 'data without compliance field',
        },
      };

      const result = await validator(commit);

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Missing compliance standards field');
      expect(result.failure_code).toBe(FailureTaxonomy.MISSING_DATA);
    });
  });

  describe('fullMemoryPolicyCompliance', () => {
    it('should pass when all policies are met', async () => {
      const validator = MemoryPolicyValidator.fullMemoryPolicyCompliance({
        maxRetentionMs: 24 * 60 * 60 * 1000, // 24 hours
        maxSizeBytes: 1000,
        requireCompression: true,
        requireEncryption: true,
        requiredCompliance: ['GDPR'],
      });

      const commit: Commit = {
        id: 'test-15',
        data: {
          timestamp: new Date(),
          content: 'small data',
          compressed: false,
          dataClassification: 'public',
          encrypted: false,
          complianceStandards: ['GDPR', 'SOC2'],
        },
      };

      const result = await validator(commit);

      expect(result.valid).toBe(true);
    });

    it('should fail when retention policy is violated', async () => {
      const validator = MemoryPolicyValidator.fullMemoryPolicyCompliance({
        maxRetentionMs: 24 * 60 * 60 * 1000,
      });

      const commit: Commit = {
        id: 'test-16',
        data: {
          timestamp: new Date(Date.now() - 48 * 60 * 60 * 1000), // 48 hours ago
          content: 'old data',
        },
      };

      const result = await validator(commit);

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Memory policy violations');
      expect(result.metadata?.violations).toBe(1);
    });

    it('should aggregate multiple policy violations', async () => {
      const validator = MemoryPolicyValidator.fullMemoryPolicyCompliance({
        maxRetentionMs: 24 * 60 * 60 * 1000,
        requireEncryption: true,
        requiredCompliance: ['GDPR', 'HIPAA'],
      });

      const commit: Commit = {
        id: 'test-17',
        data: {
          timestamp: new Date(Date.now() - 48 * 60 * 60 * 1000), // Old
          dataClassification: 'sensitive',
          encrypted: false, // Unencrypted
          complianceStandards: ['GDPR'], // Missing HIPAA
          content: 'problematic data',
        },
      };

      const result = await validator(commit);

      expect(result.valid).toBe(false);
      expect(result.metadata?.violations).toBeGreaterThan(1);
      expect(result.reason).toContain('Memory policy violations');
    });
  });
});
