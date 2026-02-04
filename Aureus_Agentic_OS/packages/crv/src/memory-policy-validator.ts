import { Commit, Validator, ValidationResult, FailureTaxonomy, FailureRemediation } from './types';

/**
 * Memory policy metadata that should be included in commit data
 */
export interface MemoryPolicyMetadata {
  retentionPeriodMs?: number;
  maxSize?: number;
  compressionEnabled?: boolean;
  encryptionRequired?: boolean;
  complianceStandards?: string[];
  dataClassification?: 'public' | 'internal' | 'sensitive' | 'confidential';
}

/**
 * Memory policy compliance validator
 * Validates that memory operations comply with defined retention, compression,
 * encryption, and compliance policies
 */
export class MemoryPolicyValidator {
  /**
   * Validate retention policy compliance
   * Ensures data is not retained beyond the allowed period
   */
  static retentionCompliance(
    maxRetentionMs: number,
    timestampField: string = 'timestamp'
  ): Validator {
    return (commit: Commit): ValidationResult => {
      if (typeof commit.data !== 'object' || commit.data === null) {
        return {
          valid: false,
          reason: 'Data is not an object',
          confidence: 1.0,
          failure_code: FailureTaxonomy.CONFLICT,
          remediation: FailureRemediation[FailureTaxonomy.CONFLICT],
        };
      }

      const data = commit.data as Record<string, unknown>;
      
      if (!(timestampField in data)) {
        return {
          valid: false,
          reason: `Timestamp field '${timestampField}' is missing`,
          confidence: 1.0,
          failure_code: FailureTaxonomy.MISSING_DATA,
          remediation: FailureRemediation[FailureTaxonomy.MISSING_DATA],
        };
      }

      const timestamp = data[timestampField];
      let timestampMs: number | null = null;

      // Parse timestamp
      if (timestamp instanceof Date) {
        timestampMs = timestamp.getTime();
      } else if (typeof timestamp === 'string') {
        timestampMs = new Date(timestamp).getTime();
      } else if (typeof timestamp === 'number') {
        timestampMs = timestamp;
      }

      if (timestampMs === null || isNaN(timestampMs)) {
        return {
          valid: false,
          reason: `Invalid timestamp in field '${timestampField}'`,
          confidence: 1.0,
          failure_code: FailureTaxonomy.CONFLICT,
          remediation: FailureRemediation[FailureTaxonomy.CONFLICT],
        };
      }

      const now = Date.now();
      const age = now - timestampMs;

      if (age > maxRetentionMs) {
        return {
          valid: false,
          reason: `Data age ${age}ms exceeds maximum retention period ${maxRetentionMs}ms`,
          confidence: 1.0,
          failure_code: FailureTaxonomy.POLICY_VIOLATION,
          remediation: 'Data exceeds retention period and should be deleted or archived',
          metadata: { age, maxRetentionMs, timestamp: timestampMs },
        };
      }

      return {
        valid: true,
        reason: 'Retention policy compliance verified',
        confidence: 1.0,
        metadata: { age, maxRetentionMs },
      };
    };
  }

  /**
   * Validate compression policy compliance
   * Ensures large data is compressed when required
   */
  static compressionCompliance(
    sizeThresholdBytes: number,
    compressionField: string = 'compressed'
  ): Validator {
    return (commit: Commit): ValidationResult => {
      const dataSize = JSON.stringify(commit.data).length;

      if (dataSize > sizeThresholdBytes) {
        if (typeof commit.data !== 'object' || commit.data === null) {
          return {
            valid: false,
            reason: `Data size ${dataSize} bytes exceeds threshold ${sizeThresholdBytes} bytes but is not an object`,
            confidence: 1.0,
            failure_code: FailureTaxonomy.POLICY_VIOLATION,
            remediation: 'Large data should be compressed',
          };
        }

        const data = commit.data as Record<string, unknown>;
        const isCompressed = data[compressionField];

        if (!isCompressed) {
          return {
            valid: false,
            reason: `Data size ${dataSize} bytes exceeds threshold ${sizeThresholdBytes} bytes but is not compressed`,
            confidence: 1.0,
            failure_code: FailureTaxonomy.POLICY_VIOLATION,
            remediation: 'Enable compression for large data to comply with policy',
            metadata: { dataSize, sizeThresholdBytes },
          };
        }
      }

      return {
        valid: true,
        reason: 'Compression policy compliance verified',
        confidence: 1.0,
        metadata: { dataSize, sizeThresholdBytes },
      };
    };
  }

  /**
   * Validate encryption policy compliance
   * Ensures sensitive data is encrypted
   */
  static encryptionCompliance(
    dataClassificationField: string = 'dataClassification',
    encryptedField: string = 'encrypted'
  ): Validator {
    return (commit: Commit): ValidationResult => {
      if (typeof commit.data !== 'object' || commit.data === null) {
        return {
          valid: true,
          reason: 'Non-object data does not require encryption check',
          confidence: 1.0,
        };
      }

      const data = commit.data as Record<string, unknown>;
      const classification = data[dataClassificationField] as string | undefined;

      // Sensitive and confidential data must be encrypted
      if (classification === 'sensitive' || classification === 'confidential') {
        const isEncrypted = data[encryptedField];

        if (!isEncrypted) {
          return {
            valid: false,
            reason: `Data classified as '${classification}' must be encrypted`,
            confidence: 1.0,
            failure_code: FailureTaxonomy.POLICY_VIOLATION,
            remediation: `Enable encryption for ${classification} data to comply with security policy`,
            metadata: { classification },
          };
        }
      }

      return {
        valid: true,
        reason: 'Encryption policy compliance verified',
        confidence: 1.0,
        metadata: { classification },
      };
    };
  }

  /**
   * Validate compliance standards
   * Ensures data handling meets specified compliance requirements (GDPR, HIPAA, etc.)
   */
  static complianceStandards(
    requiredStandards: string[],
    standardsField: string = 'complianceStandards'
  ): Validator {
    return (commit: Commit): ValidationResult => {
      if (requiredStandards.length === 0) {
        return {
          valid: true,
          reason: 'No compliance standards required',
          confidence: 1.0,
        };
      }

      if (typeof commit.data !== 'object' || commit.data === null) {
        return {
          valid: false,
          reason: 'Data must be an object to validate compliance standards',
          confidence: 1.0,
          failure_code: FailureTaxonomy.CONFLICT,
          remediation: FailureRemediation[FailureTaxonomy.CONFLICT],
        };
      }

      const data = commit.data as Record<string, unknown>;
      const standards = data[standardsField] as string[] | undefined;

      if (!standards || !Array.isArray(standards)) {
        return {
          valid: false,
          reason: `Missing compliance standards field '${standardsField}'`,
          confidence: 1.0,
          failure_code: FailureTaxonomy.MISSING_DATA,
          remediation: `Specify compliance standards: ${requiredStandards.join(', ')}`,
          metadata: { requiredStandards },
        };
      }

      const missingStandards = requiredStandards.filter(
        required => !standards.includes(required)
      );

      if (missingStandards.length > 0) {
        return {
          valid: false,
          reason: `Missing required compliance standards: ${missingStandards.join(', ')}`,
          confidence: 1.0,
          failure_code: FailureTaxonomy.POLICY_VIOLATION,
          remediation: `Add compliance standards: ${missingStandards.join(', ')}`,
          metadata: { requiredStandards, providedStandards: standards, missingStandards },
        };
      }

      return {
        valid: true,
        reason: 'Compliance standards verified',
        confidence: 1.0,
        metadata: { requiredStandards, providedStandards: standards },
      };
    };
  }

  /**
   * Combined memory policy validator
   * Validates all memory policy requirements in a single validator
   */
  static fullMemoryPolicyCompliance(policy: {
    maxRetentionMs?: number;
    maxSizeBytes?: number;
    requireCompression?: boolean;
    requireEncryption?: boolean;
    requiredCompliance?: string[];
  }): Validator {
    return async (commit: Commit): Promise<ValidationResult> => {
      const results: ValidationResult[] = [];

      // Validate retention if specified
      if (policy.maxRetentionMs !== undefined) {
        const retentionValidator = this.retentionCompliance(policy.maxRetentionMs);
        results.push(await retentionValidator(commit));
      }

      // Validate compression if specified
      if (policy.requireCompression && policy.maxSizeBytes !== undefined) {
        const compressionValidator = this.compressionCompliance(policy.maxSizeBytes);
        results.push(await compressionValidator(commit));
      }

      // Validate encryption if specified
      if (policy.requireEncryption) {
        const encryptionValidator = this.encryptionCompliance();
        results.push(await encryptionValidator(commit));
      }

      // Validate compliance if specified
      if (policy.requiredCompliance && policy.requiredCompliance.length > 0) {
        const complianceValidator = this.complianceStandards(policy.requiredCompliance);
        results.push(await complianceValidator(commit));
      }

      // Check if any validation failed
      const failed = results.filter(r => !r.valid);

      if (failed.length > 0) {
        return {
          valid: false,
          reason: `Memory policy violations: ${failed.map(f => f.reason).join('; ')}`,
          confidence: Math.min(...failed.map(f => f.confidence || 1.0)),
          failure_code: failed[0].failure_code,
          remediation: failed.map(f => f.remediation).filter(r => r).join('; '),
          metadata: {
            violations: failed.length,
            details: failed.map(f => ({ reason: f.reason, code: f.failure_code })),
          },
        };
      }

      return {
        valid: true,
        reason: 'All memory policy requirements met',
        confidence: 1.0,
        metadata: {
          checksPerformed: results.length,
        },
      };
    };
  }
}
