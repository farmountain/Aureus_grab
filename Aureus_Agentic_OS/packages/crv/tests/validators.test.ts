import { describe, it, expect } from 'vitest';
import { Validators, Commit, FailureTaxonomy } from '../src';

describe('Statistical Bounds Validator', () => {
  it('should validate value within min/max bounds', () => {
    const validator = Validators.statisticalBounds('temperature', {
      min: 0,
      max: 100,
    });

    const commit: Commit = {
      id: 'commit-1',
      data: { temperature: 50 },
    };

    const result = validator(commit);
    
    expect(result.valid).toBe(true);
    expect(result.confidence).toBe(1.0);
    expect(result.metadata).toMatchObject({ field: 'temperature', value: 50 });
  });

  it('should reject value below minimum', () => {
    const validator = Validators.statisticalBounds('temperature', {
      min: 0,
      max: 100,
    });

    const commit: Commit = {
      id: 'commit-2',
      data: { temperature: -10 },
    };

    const result = validator(commit);
    
    expect(result.valid).toBe(false);
    expect(result.confidence).toBe(1.0);
    expect(result.reason).toContain('below minimum');
    expect(result.failure_code).toBe(FailureTaxonomy.OUT_OF_SCOPE);
    expect(result.metadata).toMatchObject({ 
      field: 'temperature', 
      value: -10,
      violation: 'min',
    });
  });

  it('should reject value above maximum', () => {
    const validator = Validators.statisticalBounds('temperature', {
      min: 0,
      max: 100,
    });

    const commit: Commit = {
      id: 'commit-3',
      data: { temperature: 150 },
    };

    const result = validator(commit);
    
    expect(result.valid).toBe(false);
    expect(result.confidence).toBe(1.0);
    expect(result.reason).toContain('exceeds maximum');
    expect(result.failure_code).toBe(FailureTaxonomy.OUT_OF_SCOPE);
    expect(result.metadata).toMatchObject({ 
      field: 'temperature', 
      value: 150,
      violation: 'max',
    });
  });

  it('should validate value within statistical bounds (mean ± 3σ)', () => {
    const validator = Validators.statisticalBounds('value', {
      mean: 100,
      stddev: 10,
      tolerance: 3,
    });

    const commit: Commit = {
      id: 'commit-4',
      data: { value: 110 }, // Within 3 standard deviations
    };

    const result = validator(commit);
    
    expect(result.valid).toBe(true);
    expect(result.confidence).toBe(1.0);
    expect(result.metadata).toHaveProperty('zScore');
  });

  it('should reject value outside statistical bounds', () => {
    const validator = Validators.statisticalBounds('value', {
      mean: 100,
      stddev: 10,
      tolerance: 2,
    });

    const commit: Commit = {
      id: 'commit-5',
      data: { value: 130 }, // 3 standard deviations from mean (outside 2σ tolerance)
    };

    const result = validator(commit);
    
    expect(result.valid).toBe(false);
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThan(1);
    expect(result.reason).toContain('outside statistical bounds');
    expect(result.failure_code).toBe(FailureTaxonomy.OUT_OF_SCOPE);
    expect(result.metadata).toHaveProperty('zScore');
    expect(result.metadata?.zScore).toBeCloseTo(3, 1);
  });

  it('should reject missing field', () => {
    const validator = Validators.statisticalBounds('temperature', {
      min: 0,
      max: 100,
    });

    const commit: Commit = {
      id: 'commit-6',
      data: { pressure: 50 },
    };

    const result = validator(commit);
    
    expect(result.valid).toBe(false);
    expect(result.confidence).toBe(1.0);
    expect(result.reason).toContain('missing');
    expect(result.failure_code).toBe(FailureTaxonomy.MISSING_DATA);
  });

  it('should reject non-numeric field', () => {
    const validator = Validators.statisticalBounds('temperature', {
      min: 0,
      max: 100,
    });

    const commit: Commit = {
      id: 'commit-7',
      data: { temperature: 'hot' },
    };

    const result = validator(commit);
    
    expect(result.valid).toBe(false);
    expect(result.confidence).toBe(1.0);
    expect(result.reason).toContain('not a valid number');
    expect(result.failure_code).toBe(FailureTaxonomy.CONFLICT);
  });
});

describe('Anomaly Detection Validator', () => {
  it('should detect non-anomalous value', () => {
    const validator = Validators.anomalyDetection(
      'value',
      [95, 98, 100, 102, 105], // Historical data
      3.0
    );

    const commit: Commit = {
      id: 'commit-1',
      data: { value: 101 },
    };

    const result = validator(commit);
    
    expect(result.valid).toBe(true);
    expect(result.confidence).toBeGreaterThan(0.7);
    expect(result.reason).toContain('not an anomaly');
    expect(result.metadata).toMatchObject({
      field: 'value',
      value: 101,
    });
    expect(result.metadata).toHaveProperty('zScore');
    expect(result.metadata).toHaveProperty('mean');
    expect(result.metadata).toHaveProperty('stddev');
  });

  it('should detect anomalous value', () => {
    const validator = Validators.anomalyDetection(
      'value',
      [95, 98, 100, 102, 105], // Mean ≈ 100, stddev ≈ 3.6
      2.0
    );

    const commit: Commit = {
      id: 'commit-2',
      data: { value: 150 }, // Way outside normal range
    };

    const result = validator(commit);
    
    expect(result.valid).toBe(false);
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThan(1);
    expect(result.reason).toContain('anomaly');
    expect(result.failure_code).toBe(FailureTaxonomy.OUT_OF_SCOPE);
    expect(result.metadata?.zScore).toBeGreaterThan(2.0);
  });

  it('should handle insufficient historical data', () => {
    const validator = Validators.anomalyDetection(
      'value',
      [100], // Only 1 data point
      3.0
    );

    const commit: Commit = {
      id: 'commit-3',
      data: { value: 150 },
    };

    const result = validator(commit);
    
    expect(result.valid).toBe(true);
    expect(result.confidence).toBe(0.5);
    expect(result.reason).toContain('Insufficient historical data');
  });

  it('should handle constant historical data (zero stddev)', () => {
    const validator = Validators.anomalyDetection(
      'value',
      [100, 100, 100, 100], // All same value
      3.0
    );

    const commit: Commit = {
      id: 'commit-4',
      data: { value: 100 },
    };

    const result = validator(commit);
    
    expect(result.valid).toBe(true);
    expect(result.confidence).toBe(1.0);
    expect(result.metadata?.stddev).toBe(0);
  });

  it('should detect anomaly in constant historical data', () => {
    const validator = Validators.anomalyDetection(
      'value',
      [100, 100, 100, 100], // All same value
      3.0
    );

    const commit: Commit = {
      id: 'commit-5',
      data: { value: 150 },
    };

    const result = validator(commit);
    
    expect(result.valid).toBe(false);
    expect(result.confidence).toBe(1.0);
    expect(result.reason).toContain('differs from constant historical values');
    expect(result.failure_code).toBe(FailureTaxonomy.OUT_OF_SCOPE);
  });

  it('should reject missing field', () => {
    const validator = Validators.anomalyDetection(
      'value',
      [95, 98, 100, 102, 105],
      3.0
    );

    const commit: Commit = {
      id: 'commit-6',
      data: { other: 100 },
    };

    const result = validator(commit);
    
    expect(result.valid).toBe(false);
    expect(result.confidence).toBe(1.0);
    expect(result.reason).toContain('missing');
    expect(result.failure_code).toBe(FailureTaxonomy.MISSING_DATA);
  });

  it('should reject non-numeric field', () => {
    const validator = Validators.anomalyDetection(
      'value',
      [95, 98, 100, 102, 105],
      3.0
    );

    const commit: Commit = {
      id: 'commit-7',
      data: { value: 'invalid' },
    };

    const result = validator(commit);
    
    expect(result.valid).toBe(false);
    expect(result.confidence).toBe(1.0);
    expect(result.reason).toContain('not a valid number');
    expect(result.failure_code).toBe(FailureTaxonomy.CONFLICT);
  });
});

describe('Cross-Field Consistency Validator', () => {
  it('should validate consistent fields', () => {
    const validator = Validators.crossFieldConsistency([
      {
        name: 'start-before-end',
        fields: ['startDate', 'endDate'],
        predicate: (values) => {
          const start = new Date(values.startDate as string).getTime();
          const end = new Date(values.endDate as string).getTime();
          return start < end;
        },
        message: 'Start date must be before end date',
      },
    ]);

    const commit: Commit = {
      id: 'commit-1',
      data: {
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      },
    };

    const result = validator(commit);
    
    expect(result.valid).toBe(true);
    expect(result.confidence).toBe(1.0);
    expect(result.reason).toContain('consistency rules passed');
  });

  it('should detect field inconsistency', () => {
    const validator = Validators.crossFieldConsistency([
      {
        name: 'total-equals-sum',
        fields: ['item1', 'item2', 'total'],
        predicate: (values) => {
          return (values.item1 as number) + (values.item2 as number) === (values.total as number);
        },
        message: 'Total must equal sum of items',
      },
    ]);

    const commit: Commit = {
      id: 'commit-2',
      data: {
        item1: 100,
        item2: 50,
        total: 200, // Should be 150
      },
    };

    const result = validator(commit);
    
    expect(result.valid).toBe(false);
    expect(result.confidence).toBe(1.0);
    expect(result.reason).toContain('Total must equal sum of items');
    expect(result.failure_code).toBe(FailureTaxonomy.CONFLICT);
    expect(result.metadata).toHaveProperty('rule');
    expect(result.metadata).toHaveProperty('values');
  });

  it('should validate multiple consistency rules', () => {
    const validator = Validators.crossFieldConsistency([
      {
        name: 'min-less-than-max',
        fields: ['min', 'max'],
        predicate: (values) => (values.min as number) < (values.max as number),
      },
      {
        name: 'positive-values',
        fields: ['min', 'max'],
        predicate: (values) => (values.min as number) > 0 && (values.max as number) > 0,
      },
    ]);

    const commit: Commit = {
      id: 'commit-3',
      data: {
        min: 10,
        max: 100,
      },
    };

    const result = validator(commit);
    
    expect(result.valid).toBe(true);
    expect(result.confidence).toBe(1.0);
    expect(result.metadata?.rulesChecked).toBe(2);
  });

  it('should fail on first rule violation', () => {
    const validator = Validators.crossFieldConsistency([
      {
        name: 'min-less-than-max',
        fields: ['min', 'max'],
        predicate: (values) => (values.min as number) < (values.max as number),
        message: 'Min must be less than max',
      },
      {
        name: 'positive-values',
        fields: ['min', 'max'],
        predicate: (values) => (values.min as number) > 0 && (values.max as number) > 0,
      },
    ]);

    const commit: Commit = {
      id: 'commit-4',
      data: {
        min: 100,
        max: 10, // Violates first rule
      },
    };

    const result = validator(commit);
    
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Min must be less than max');
    expect(result.failure_code).toBe(FailureTaxonomy.CONFLICT);
  });

  it('should detect missing fields', () => {
    const validator = Validators.crossFieldConsistency([
      {
        name: 'check-fields',
        fields: ['field1', 'field2'],
        predicate: () => true,
      },
    ]);

    const commit: Commit = {
      id: 'commit-5',
      data: {
        field1: 100,
        // field2 is missing
      },
    };

    const result = validator(commit);
    
    expect(result.valid).toBe(false);
    expect(result.confidence).toBe(1.0);
    expect(result.reason).toContain('Missing required fields');
    expect(result.failure_code).toBe(FailureTaxonomy.MISSING_DATA);
    expect(result.metadata).toHaveProperty('missingFields');
  });

  it('should handle predicate errors gracefully', () => {
    const validator = Validators.crossFieldConsistency([
      {
        name: 'error-prone-rule',
        fields: ['value'],
        predicate: (values) => {
          throw new Error('Predicate evaluation failed');
        },
      },
    ]);

    const commit: Commit = {
      id: 'commit-6',
      data: {
        value: 100,
      },
    };

    const result = validator(commit);
    
    expect(result.valid).toBe(false);
    expect(result.confidence).toBe(0.5);
    expect(result.reason).toContain('Error evaluating consistency rule');
    expect(result.failure_code).toBe(FailureTaxonomy.TOOL_ERROR);
  });
});

describe('Temporal Monotonic Validator', () => {
  it('should validate increasing version', () => {
    const validator = Validators.temporalMonotonic();

    const commit: Commit = {
      id: 'commit-1',
      data: { version: 2, value: 'new' },
      previousState: { version: 1, value: 'old' },
    };

    const result = validator(commit);
    
    expect(result.valid).toBe(true);
    expect(result.confidence).toBe(0.95);
    expect(result.reason).toContain('Temporal monotonicity verified');
    expect(result.metadata).toMatchObject({
      prevVersion: 1,
      currVersion: 2,
    });
  });

  it('should reject decreasing version', () => {
    const validator = Validators.temporalMonotonic();

    const commit: Commit = {
      id: 'commit-2',
      data: { version: 1, value: 'new' },
      previousState: { version: 2, value: 'old' },
    };

    const result = validator(commit);
    
    expect(result.valid).toBe(false);
    expect(result.confidence).toBe(1.0);
    expect(result.reason).toContain('Version field');
    expect(result.reason).toContain('decreased');
    expect(result.failure_code).toBe(FailureTaxonomy.CONFLICT);
  });

  it('should validate increasing timestamp', () => {
    const validator = Validators.temporalMonotonic({
      timestampField: 'createdAt',
    });

    const commit: Commit = {
      id: 'commit-3',
      data: { createdAt: '2024-01-02T00:00:00Z', value: 'new' },
      previousState: { createdAt: '2024-01-01T00:00:00Z', value: 'old' },
    };

    const result = validator(commit);
    
    expect(result.valid).toBe(true);
    expect(result.confidence).toBe(0.95);
    expect(result.metadata).toHaveProperty('prevTimestamp');
    expect(result.metadata).toHaveProperty('currTimestamp');
    expect(result.metadata).toHaveProperty('timeDiff');
  });

  it('should reject decreasing timestamp', () => {
    const validator = Validators.temporalMonotonic({
      timestampField: 'createdAt',
    });

    const commit: Commit = {
      id: 'commit-4',
      data: { createdAt: '2024-01-01T00:00:00Z', value: 'new' },
      previousState: { createdAt: '2024-01-02T00:00:00Z', value: 'old' },
    };

    const result = validator(commit);
    
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Timestamp field');
    expect(result.reason).toContain('decreased');
    expect(result.failure_code).toBe(FailureTaxonomy.CONFLICT);
  });

  it('should allow equal timestamps when configured', () => {
    const validator = Validators.temporalMonotonic({
      timestampField: 'timestamp',
      allowEqual: true,
    });

    const timestamp = '2024-01-01T00:00:00Z';
    const commit: Commit = {
      id: 'commit-5',
      data: { timestamp, version: 2 },
      previousState: { timestamp, version: 1 },
    };

    const result = validator(commit);
    
    expect(result.valid).toBe(true);
    expect(result.confidence).toBe(0.95);
  });

  it('should reject equal timestamps when strict mode', () => {
    const validator = Validators.temporalMonotonic({
      timestampField: 'timestamp',
      allowEqual: false,
    });

    const timestamp = '2024-01-01T00:00:00Z';
    const commit: Commit = {
      id: 'commit-6',
      data: { timestamp },
      previousState: { timestamp },
    };

    const result = validator(commit);
    
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('stayed same');
    expect(result.failure_code).toBe(FailureTaxonomy.CONFLICT);
  });

  it('should detect excessive time drift', () => {
    const validator = Validators.temporalMonotonic({
      timestampField: 'timestamp',
      maxTimeDrift: 1000, // 1 second max drift
    });

    const commit: Commit = {
      id: 'commit-7',
      data: { timestamp: '2024-01-01T01:00:00Z' }, // 1 hour later
      previousState: { timestamp: '2024-01-01T00:00:00Z' },
    };

    const result = validator(commit);
    
    expect(result.valid).toBe(false);
    expect(result.confidence).toBe(0.8);
    expect(result.reason).toContain('Time drift');
    expect(result.reason).toContain('exceeds maximum');
    expect(result.failure_code).toBe(FailureTaxonomy.NON_DETERMINISM);
    expect(result.metadata).toHaveProperty('drift');
    expect(result.metadata).toHaveProperty('maxTimeDrift');
  });

  it('should handle Date objects', () => {
    const validator = Validators.temporalMonotonic({
      timestampField: 'timestamp',
    });

    const commit: Commit = {
      id: 'commit-8',
      data: { timestamp: new Date('2024-01-02') },
      previousState: { timestamp: new Date('2024-01-01') },
    };

    const result = validator(commit);
    
    expect(result.valid).toBe(true);
    expect(result.confidence).toBe(0.95);
  });

  it('should handle Unix timestamps', () => {
    const validator = Validators.temporalMonotonic({
      timestampField: 'timestamp',
    });

    const commit: Commit = {
      id: 'commit-9',
      data: { timestamp: 1609545600000 }, // 2021-01-02
      previousState: { timestamp: 1609459200000 }, // 2021-01-01
    };

    const result = validator(commit);
    
    expect(result.valid).toBe(true);
    expect(result.confidence).toBe(0.95);
  });

  it('should accept first commit without previous state', () => {
    const validator = Validators.temporalMonotonic();

    const commit: Commit = {
      id: 'commit-10',
      data: { version: 1, timestamp: '2024-01-01T00:00:00Z' },
    };

    const result = validator(commit);
    
    expect(result.valid).toBe(true);
    expect(result.confidence).toBe(1.0);
    expect(result.reason).toContain('No previous state');
    expect(result.metadata?.isFirstCommit).toBe(true);
  });

  it('should validate both version and timestamp together', () => {
    const validator = Validators.temporalMonotonic({
      versionField: 'version',
      timestampField: 'timestamp',
    });

    const commit: Commit = {
      id: 'commit-11',
      data: { version: 2, timestamp: '2024-01-02T00:00:00Z' },
      previousState: { version: 1, timestamp: '2024-01-01T00:00:00Z' },
    };

    const result = validator(commit);
    
    expect(result.valid).toBe(true);
    expect(result.confidence).toBe(0.95);
    expect(result.metadata).toMatchObject({
      prevVersion: 1,
      currVersion: 2,
    });
    expect(result.metadata).toHaveProperty('prevTimestamp');
    expect(result.metadata).toHaveProperty('currTimestamp');
  });
});
