import { Commit, Validator, ValidationResult, FailureTaxonomy, FailureRemediation } from './types';

/**
 * Built-in validation operators
 */
export class Validators {
  /**
   * Validates that commit data is not null/undefined
   */
  static notNull(): Validator {
    return (commit: Commit): ValidationResult => {
      const valid = commit.data != null;
      return {
        valid,
        reason: valid ? 'Data is not null' : 'Data is null or undefined',
        confidence: 1.0,
        failure_code: valid ? undefined : FailureTaxonomy.MISSING_DATA,
        remediation: valid ? undefined : FailureRemediation[FailureTaxonomy.MISSING_DATA],
      };
    };
  }

  /**
   * Validates that commit data matches expected schema
   */
  static schema(expectedSchema: Record<string, string>): Validator {
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
      
      for (const [key, type] of Object.entries(expectedSchema)) {
        if (!(key in data)) {
          return {
            valid: false,
            reason: `Missing required field: ${key}`,
            confidence: 1.0,
            failure_code: FailureTaxonomy.MISSING_DATA,
            remediation: FailureRemediation[FailureTaxonomy.MISSING_DATA],
          };
        }
        
        if (typeof data[key] !== type) {
          return {
            valid: false,
            reason: `Field ${key} has wrong type: expected ${type}, got ${typeof data[key]}`,
            confidence: 1.0,
            failure_code: FailureTaxonomy.CONFLICT,
            remediation: FailureRemediation[FailureTaxonomy.CONFLICT],
          };
        }
      }

      return {
        valid: true,
        reason: 'Schema validation passed',
        confidence: 1.0,
      };
    };
  }

  /**
   * Validates that commit represents a monotonic change (no data loss)
   */
  static monotonic(): Validator {
    return (commit: Commit): ValidationResult => {
      if (!commit.previousState) {
        return {
          valid: true,
          reason: 'No previous state to compare',
          confidence: 1.0,
        };
      }

      // Simple check: ensure we're not going backwards in version/timestamp
      const prev = commit.previousState as any;
      const curr = commit.data as any;

      if (prev.version && curr.version && curr.version < prev.version) {
        return {
          valid: false,
          reason: 'Version decreased (non-monotonic)',
          confidence: 1.0,
          failure_code: FailureTaxonomy.CONFLICT,
          remediation: FailureRemediation[FailureTaxonomy.CONFLICT],
        };
      }

      return {
        valid: true,
        reason: 'Monotonic change verified',
        confidence: 0.9,
      };
    };
  }

  /**
   * Custom validator from predicate function
   */
  static custom(
    name: string,
    predicate: (commit: Commit) => boolean,
    reason?: string,
    failureCode?: FailureTaxonomy
  ): Validator {
    return (commit: Commit): ValidationResult => {
      const valid = predicate(commit);
      const code = failureCode || FailureTaxonomy.POLICY_VIOLATION;
      return {
        valid,
        reason: reason || (valid ? `${name} validation passed` : `${name} validation failed`),
        confidence: 1.0,
        failure_code: valid ? undefined : code,
        remediation: valid ? undefined : FailureRemediation[code],
      };
    };
  }

  /**
   * Validates that data size is within limits
   */
  static maxSize(maxBytes: number): Validator {
    return (commit: Commit): ValidationResult => {
      const size = JSON.stringify(commit.data).length;
      const valid = size <= maxBytes;
      
      return {
        valid,
        reason: valid 
          ? `Data size ${size} bytes is within limit` 
          : `Data size ${size} bytes exceeds limit of ${maxBytes} bytes`,
        confidence: 1.0,
        failure_code: valid ? undefined : FailureTaxonomy.OUT_OF_SCOPE,
        remediation: valid ? undefined : FailureRemediation[FailureTaxonomy.OUT_OF_SCOPE],
      };
    };
  }

  /**
   * Validates that numeric field values are within statistical bounds
   * @param field - The field to validate
   * @param bounds - Statistical bounds { min?, max?, mean?, stddev?, tolerance? }
   */
  static statisticalBounds(
    field: string,
    bounds: {
      min?: number;
      max?: number;
      mean?: number;
      stddev?: number;
      tolerance?: number; // Number of standard deviations from mean (default: 3)
    }
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
      
      if (!(field in data)) {
        return {
          valid: false,
          reason: `Field '${field}' is missing`,
          confidence: 1.0,
          failure_code: FailureTaxonomy.MISSING_DATA,
          remediation: FailureRemediation[FailureTaxonomy.MISSING_DATA],
          metadata: { field, bounds },
        };
      }

      const value = data[field];
      
      if (typeof value !== 'number' || isNaN(value)) {
        return {
          valid: false,
          reason: `Field '${field}' is not a valid number`,
          confidence: 1.0,
          failure_code: FailureTaxonomy.CONFLICT,
          remediation: FailureRemediation[FailureTaxonomy.CONFLICT],
          metadata: { field, value, bounds },
        };
      }

      // Check min/max bounds
      if (bounds.min !== undefined && value < bounds.min) {
        return {
          valid: false,
          reason: `Field '${field}' value ${value} is below minimum ${bounds.min}`,
          confidence: 1.0,
          failure_code: FailureTaxonomy.OUT_OF_SCOPE,
          remediation: FailureRemediation[FailureTaxonomy.OUT_OF_SCOPE],
          metadata: { field, value, bounds, violation: 'min' },
        };
      }

      if (bounds.max !== undefined && value > bounds.max) {
        return {
          valid: false,
          reason: `Field '${field}' value ${value} exceeds maximum ${bounds.max}`,
          confidence: 1.0,
          failure_code: FailureTaxonomy.OUT_OF_SCOPE,
          remediation: FailureRemediation[FailureTaxonomy.OUT_OF_SCOPE],
          metadata: { field, value, bounds, violation: 'max' },
        };
      }

      // Check statistical bounds (mean ± tolerance*stddev)
      if (bounds.mean !== undefined && bounds.stddev !== undefined) {
        const tolerance = bounds.tolerance ?? 3;
        
        // Handle zero standard deviation case
        if (bounds.stddev === 0) {
          const isValid = value === bounds.mean;
          return {
            valid: isValid,
            reason: isValid 
              ? `Field '${field}' value ${value} matches constant statistical bounds`
              : `Field '${field}' value ${value} differs from constant statistical bounds (mean: ${bounds.mean})`,
            confidence: 1.0,
            failure_code: isValid ? undefined : FailureTaxonomy.OUT_OF_SCOPE,
            remediation: isValid ? undefined : FailureRemediation[FailureTaxonomy.OUT_OF_SCOPE],
            metadata: { field, value, bounds, zScore: 0 },
          };
        }
        
        const lowerBound = bounds.mean - tolerance * bounds.stddev;
        const upperBound = bounds.mean + tolerance * bounds.stddev;
        const zScore = Math.abs((value - bounds.mean) / bounds.stddev);
        
        if (value < lowerBound || value > upperBound) {
          const confidence = Math.max(0, 1 - (zScore - tolerance) / tolerance);
          return {
            valid: false,
            reason: `Field '${field}' value ${value} is outside statistical bounds (${zScore.toFixed(2)} standard deviations from mean)`,
            confidence: parseFloat(confidence.toFixed(2)),
            failure_code: FailureTaxonomy.OUT_OF_SCOPE,
            remediation: FailureRemediation[FailureTaxonomy.OUT_OF_SCOPE],
            metadata: { field, value, bounds, zScore: parseFloat(zScore.toFixed(2)), lowerBound, upperBound },
          };
        }
        
        // Valid but include zScore in metadata
        return {
          valid: true,
          reason: `Field '${field}' value ${value} is within statistical bounds`,
          confidence: 1.0,
          metadata: { field, value, bounds, zScore: parseFloat(zScore.toFixed(2)), lowerBound, upperBound },
        };
      }

      return {
        valid: true,
        reason: `Field '${field}' value ${value} is within statistical bounds`,
        confidence: 1.0,
        metadata: { field, value, bounds },
      };
    };
  }

  /**
   * Validates that a numeric field value is not an anomaly using z-score detection
   * @param field - The field to validate
   * @param historicalData - Array of historical values for comparison
   * @param threshold - Z-score threshold (default: 3.0)
   */
  static anomalyDetection(
    field: string,
    historicalData: number[],
    threshold: number = 3.0
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
      
      if (!(field in data)) {
        return {
          valid: false,
          reason: `Field '${field}' is missing`,
          confidence: 1.0,
          failure_code: FailureTaxonomy.MISSING_DATA,
          remediation: FailureRemediation[FailureTaxonomy.MISSING_DATA],
          metadata: { field },
        };
      }

      const value = data[field];
      
      if (typeof value !== 'number' || isNaN(value)) {
        return {
          valid: false,
          reason: `Field '${field}' is not a valid number`,
          confidence: 1.0,
          failure_code: FailureTaxonomy.CONFLICT,
          remediation: FailureRemediation[FailureTaxonomy.CONFLICT],
          metadata: { field, value },
        };
      }

      // Need at least 2 data points for meaningful statistics
      if (historicalData.length < 2) {
        return {
          valid: true,
          reason: `Insufficient historical data for anomaly detection (${historicalData.length} points)`,
          confidence: 0.5,
          metadata: { field, value, historicalDataSize: historicalData.length },
        };
      }

      // Calculate mean and standard deviation using sample variance (Bessel's correction)
      const mean = historicalData.reduce((sum, val) => sum + val, 0) / historicalData.length;
      const variance = historicalData.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / (historicalData.length - 1);
      const stddev = Math.sqrt(variance);

      // Handle zero standard deviation case
      if (stddev === 0 || !isFinite(stddev)) {
        const isAnomaly = value !== mean;
        return {
          valid: !isAnomaly,
          reason: isAnomaly 
            ? `Field '${field}' value ${value} differs from constant historical values ${mean}`
            : `Field '${field}' value ${value} matches constant historical values`,
          confidence: 1.0,
          failure_code: isAnomaly ? FailureTaxonomy.OUT_OF_SCOPE : undefined,
          remediation: isAnomaly ? FailureRemediation[FailureTaxonomy.OUT_OF_SCOPE] : undefined,
          metadata: { field, value, mean, stddev: 0, zScore: 0 },
        };
      }

      // Calculate z-score
      const zScore = Math.abs((value - mean) / stddev);
      const isAnomaly = zScore > threshold;

      // Confidence decreases as z-score increases
      // For anomalies: confidence decreases linearly from 1.0 at threshold to 0 at 2*threshold
      // For normal values: confidence is high (0.7-1.0) based on proximity to mean
      const confidence = isAnomaly 
        ? Math.max(0, 1 - (zScore - threshold) / threshold)
        : Math.max(0.7, 1 - zScore / threshold);

      return {
        valid: !isAnomaly,
        reason: isAnomaly
          ? `Field '${field}' value ${value} is an anomaly (z-score: ${zScore.toFixed(2)}, threshold: ${threshold})`
          : `Field '${field}' value ${value} is not an anomaly (z-score: ${zScore.toFixed(2)})`,
        confidence: parseFloat(confidence.toFixed(2)),
        failure_code: isAnomaly ? FailureTaxonomy.OUT_OF_SCOPE : undefined,
        remediation: isAnomaly ? FailureRemediation[FailureTaxonomy.OUT_OF_SCOPE] : undefined,
        metadata: { field, value, mean, stddev, zScore: parseFloat(zScore.toFixed(2)), threshold, historicalDataSize: historicalData.length },
      };
    };
  }

  /**
   * Validates consistency between related fields
   * @param rules - Array of consistency rules to validate
   */
  static crossFieldConsistency(
    rules: Array<{
      name: string;
      fields: string[];
      predicate: (values: Record<string, unknown>) => boolean;
      message?: string;
    }>
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
      
      // Check if all required fields exist
      const allFields = new Set<string>();
      rules.forEach(rule => rule.fields.forEach(f => allFields.add(f)));
      
      const missingFields = Array.from(allFields).filter(field => !(field in data));
      if (missingFields.length > 0) {
        return {
          valid: false,
          reason: `Missing required fields for consistency check: ${missingFields.join(', ')}`,
          confidence: 1.0,
          failure_code: FailureTaxonomy.MISSING_DATA,
          remediation: FailureRemediation[FailureTaxonomy.MISSING_DATA],
          metadata: { missingFields },
        };
      }

      // Validate each rule
      for (const rule of rules) {
        const values: Record<string, unknown> = {};
        rule.fields.forEach(field => {
          values[field] = data[field];
        });

        try {
          const isValid = rule.predicate(values);
          
          if (!isValid) {
            return {
              valid: false,
              reason: rule.message || `Cross-field consistency rule '${rule.name}' failed`,
              confidence: 1.0,
              failure_code: FailureTaxonomy.CONFLICT,
              remediation: FailureRemediation[FailureTaxonomy.CONFLICT],
              metadata: { rule: rule.name, fields: rule.fields, values },
            };
          }
        } catch (error) {
          return {
            valid: false,
            reason: `Error evaluating consistency rule '${rule.name}': ${error instanceof Error ? error.message : String(error)}`,
            confidence: 0.5,
            failure_code: FailureTaxonomy.TOOL_ERROR,
            remediation: FailureRemediation[FailureTaxonomy.TOOL_ERROR],
            metadata: { rule: rule.name, fields: rule.fields, error: String(error) },
          };
        }
      }

      return {
        valid: true,
        reason: `All ${rules.length} cross-field consistency rules passed`,
        confidence: 1.0,
        metadata: { rulesChecked: rules.length },
      };
    };
  }

  /**
   * Enhanced monotonic validator with timestamp validation
   * @param options - Configuration for temporal monotonicity checks
   */
  static temporalMonotonic(options?: {
    timestampField?: string;
    versionField?: string;
    allowEqual?: boolean; // Allow equal timestamps/versions (non-strict monotonic)
    maxTimeDrift?: number; // Maximum allowed time drift in milliseconds
  }): Validator {
    return (commit: Commit): ValidationResult => {
      const opts = {
        timestampField: 'timestamp',
        versionField: 'version',
        allowEqual: false,
        maxTimeDrift: undefined,
        ...options,
      };

      if (!commit.previousState) {
        return {
          valid: true,
          reason: 'No previous state to compare',
          confidence: 1.0,
          metadata: { isFirstCommit: true },
        };
      }

      const prev = commit.previousState as Record<string, unknown>;
      const curr = commit.data as Record<string, unknown>;

      if (typeof curr !== 'object' || curr === null) {
        return {
          valid: false,
          reason: 'Current data is not an object',
          confidence: 1.0,
          failure_code: FailureTaxonomy.CONFLICT,
          remediation: FailureRemediation[FailureTaxonomy.CONFLICT],
        };
      }

      const violations: string[] = [];
      const metadata: Record<string, unknown> = {};

      // Check version field if present
      if (opts.versionField && opts.versionField in prev && opts.versionField in curr) {
        const prevVersion = prev[opts.versionField];
        const currVersion = curr[opts.versionField];
        
        if (typeof prevVersion === 'number' && typeof currVersion === 'number') {
          metadata.prevVersion = prevVersion;
          metadata.currVersion = currVersion;
          
          if (currVersion < prevVersion || (!opts.allowEqual && currVersion === prevVersion)) {
            violations.push(`Version field '${opts.versionField}' decreased or stayed same: ${prevVersion} -> ${currVersion}`);
          }
        }
      }

      // Check timestamp field if present
      if (opts.timestampField && opts.timestampField in prev && opts.timestampField in curr) {
        const prevTimestamp = prev[opts.timestampField];
        const currTimestamp = curr[opts.timestampField];
        
        let prevTime: number | null = null;
        let currTime: number | null = null;

        // Parse timestamps (support Date objects, ISO strings, or Unix timestamps)
        if (prevTimestamp instanceof Date) {
          const time = prevTimestamp.getTime();
          prevTime = isNaN(time) ? null : time;
        } else if (typeof prevTimestamp === 'string') {
          const time = new Date(prevTimestamp).getTime();
          prevTime = isNaN(time) ? null : time;
        } else if (typeof prevTimestamp === 'number') {
          prevTime = isNaN(prevTimestamp) ? null : prevTimestamp;
        }

        if (currTimestamp instanceof Date) {
          const time = currTimestamp.getTime();
          currTime = isNaN(time) ? null : time;
        } else if (typeof currTimestamp === 'string') {
          const time = new Date(currTimestamp).getTime();
          currTime = isNaN(time) ? null : time;
        } else if (typeof currTimestamp === 'number') {
          currTime = isNaN(currTimestamp) ? null : currTimestamp;
        }

        if (prevTime !== null && currTime !== null && isFinite(prevTime) && isFinite(currTime)) {
          metadata.prevTimestamp = prevTime;
          metadata.currTimestamp = currTime;
          metadata.timeDiff = currTime - prevTime;

          if (currTime < prevTime || (!opts.allowEqual && currTime === prevTime)) {
            violations.push(`Timestamp field '${opts.timestampField}' decreased or stayed same: ${new Date(prevTime).toISOString()} -> ${new Date(currTime).toISOString()}`);
          }

          // Check for time drift if maxTimeDrift is specified
          if (opts.maxTimeDrift !== undefined && currTime > prevTime) {
            const drift = currTime - prevTime;
            if (drift > opts.maxTimeDrift) {
              return {
                valid: false,
                reason: `Time drift of ${drift}ms exceeds maximum allowed drift of ${opts.maxTimeDrift}ms`,
                confidence: 0.8,
                failure_code: FailureTaxonomy.NON_DETERMINISM,
                remediation: FailureRemediation[FailureTaxonomy.NON_DETERMINISM],
                metadata: { ...metadata, drift, maxTimeDrift: opts.maxTimeDrift },
              };
            }
          }
        }
      }

      if (violations.length > 0) {
        return {
          valid: false,
          reason: `Temporal monotonicity violation: ${violations.join('; ')}`,
          confidence: 1.0,
          failure_code: FailureTaxonomy.CONFLICT,
          remediation: FailureRemediation[FailureTaxonomy.CONFLICT],
          metadata,
        };
      }

      return {
        valid: true,
        reason: 'Temporal monotonicity verified',
        confidence: 0.95,
        metadata,
      };
    };
  }
}
