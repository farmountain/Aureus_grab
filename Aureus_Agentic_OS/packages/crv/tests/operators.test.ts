import { describe, it, expect } from 'vitest';
import {
  ExtractOperator,
  NormalizeOperator,
  CompareOperator,
  DecideOperator,
  VerifySchemaOperator,
  VerifyConstraintsOperator,
  JSONSchema,
} from '../src/operators';
import { ValidationResult } from '../src/types';

describe('CRV Operators', () => {
  describe('ExtractOperator', () => {
    it('should extract data from input', () => {
      const extractor = new ExtractOperator((input: any) => ({
        id: input.response.id,
        value: input.response.value,
      }));

      const result = extractor.execute({
        response: { id: '123', value: 42, extra: 'ignored' },
      });

      expect(result).toEqual({ id: '123', value: 42 });
    });

    it('should fail when input is null', () => {
      const extractor = new ExtractOperator((input: any) => input);

      expect(() => extractor.execute(null)).toThrow('Input must not be null or undefined');
    });

    it('should validate invariants', () => {
      const extractor = new ExtractOperator((input: any) => input);
      const validation = extractor.validateInvariants({ data: 'test' });

      expect(validation.valid).toBe(true);
    });

    it('should run oracle checks', () => {
      const extractor = new ExtractOperator((input: any) => input);
      const checks = extractor.runOracleChecks({ input: 'test' }, { output: 'result' });

      expect(checks).toHaveLength(1);
      expect(checks[0].valid).toBe(true);
    });

    it('should detect empty extraction', () => {
      const extractor = new ExtractOperator(() => null); // Return null instead of empty object
      const checks = extractor.runOracleChecks({ input: 'test' }, null);

      expect(checks[0].valid).toBe(false);
      expect(checks[0].reason).toContain('null');
    });
  });

  describe('NormalizeOperator', () => {
    it('should normalize data to standard format', () => {
      const normalizer = new NormalizeOperator((input: any) => ({
        id: String(input.id),
        value: Number(input.value),
      }));

      const result = normalizer.execute({ id: 123, value: '42' });

      expect(result).toEqual({ id: '123', value: 42 });
    });

    it('should be idempotent', () => {
      const normalizer = new NormalizeOperator((input: any) => ({
        id: String(input.id || input.id),
      }));

      const result1 = normalizer.execute({ id: 123 });
      const result2 = normalizer.execute(result1);

      expect(result1).toEqual(result2);
    });

    it('should validate output format', () => {
      const normalizer = new NormalizeOperator((input: any) => input);
      const checks = normalizer.runOracleChecks({ input: 'test' }, { normalized: true });

      expect(checks[0].valid).toBe(true);
    });
  });

  describe('CompareOperator', () => {
    it('should detect matching data', () => {
      const comparator = new CompareOperator();
      const result = comparator.execute({
        expected: { id: '123', value: 42 },
        actual: { id: '123', value: 42 },
      });

      expect(result.match).toBe(true);
      expect(result.diff).toBeUndefined();
    });

    it('should detect differences', () => {
      const comparator = new CompareOperator();
      const result = comparator.execute({
        expected: { value: 42 },
        actual: { value: 99 },
      });

      expect(result.match).toBe(false);
      expect(result.diff).toBeDefined();
      expect(result.diff).toHaveProperty('expected');
      expect(result.diff).toHaveProperty('actual');
    });

    it('should support custom comparator', () => {
      const comparator = new CompareOperator((expected: any, actual: any) => ({
        match: expected.id === actual.id,
        diff: expected.id !== actual.id ? { expected, actual } : undefined,
      }));

      const result = comparator.execute({
        expected: { id: '123', value: 42 },
        actual: { id: '123', value: 99 },
      });

      expect(result.match).toBe(true); // Only compares IDs
    });

    it('should run oracle checks for match consistency', () => {
      const comparator = new CompareOperator();
      const input = {
        expected: { value: 42 },
        actual: { value: 42 },
      };
      const output = { match: true };
      
      const checks = comparator.runOracleChecks(input, output);
      expect(checks[0].valid).toBe(true);
    });

    it('should detect inconsistent match results', () => {
      const comparator = new CompareOperator();
      const input = {
        expected: { value: 42 },
        actual: { value: 99 },
      };
      const output = { match: true }; // Inconsistent with data
      
      const checks = comparator.runOracleChecks(input, output);
      expect(checks[0].valid).toBe(false);
    });
  });

  describe('DecideOperator', () => {
    it('should allow when all validations pass', () => {
      const decider = new DecideOperator();
      const result = decider.execute([
        { valid: true, reason: 'Schema valid', confidence: 1.0 },
        { valid: true, reason: 'Constraints valid', confidence: 1.0 },
      ]);

      expect(result.decision).toBe('allow');
      expect(result.reason).toContain('passed');
    });

    it('should block when validation fails', () => {
      const decider = new DecideOperator();
      const result = decider.execute([
        { valid: true, reason: 'Schema valid', confidence: 1.0 },
        { valid: false, reason: 'Constraint violated', confidence: 1.0 },
      ]);

      expect(result.decision).toBe('block');
      expect(result.reason).toContain('Constraint violated');
    });

    it('should escalate on low confidence', () => {
      const decider = new DecideOperator();
      const result = decider.execute([
        { valid: true, reason: 'Schema valid', confidence: 0.3 },
      ]);

      expect(result.decision).toBe('escalate');
      expect(result.reason).toContain('Low confidence');
    });

    it('should support custom decision logic', () => {
      const decider = new DecideOperator((results: ValidationResult[]) => {
        const allValid = results.every(r => r.valid);
        return {
          decision: allValid ? 'allow' : 'escalate',
          reason: allValid ? 'Custom: all valid' : 'Custom: escalating',
        };
      });

      const result = decider.execute([
        { valid: false, reason: 'Failed', confidence: 1.0 },
      ]);

      expect(result.decision).toBe('escalate');
      expect(result.reason).toContain('Custom');
    });

    it('should include justification', () => {
      const decider = new DecideOperator();
      const result = decider.execute([{ valid: true, confidence: 1.0 }]);

      const checks = decider.runOracleChecks([], result);
      expect(checks[0].valid).toBe(true);
      expect(result.reason.length).toBeGreaterThan(0);
    });
  });

  describe('VerifySchemaOperator', () => {
    it('should validate data against schema', () => {
      const verifier = new VerifySchemaOperator();
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          id: { type: 'string' },
          value: { type: 'number' },
        },
        required: ['id', 'value'],
      };

      const result = verifier.execute({
        data: { id: '123', value: 42 },
        schema,
      });

      expect(result.valid).toBe(true);
    });

    it('should fail on missing required field', () => {
      const verifier = new VerifySchemaOperator();
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          id: { type: 'string' },
          value: { type: 'number' },
        },
        required: ['id', 'value'],
      };

      const result = verifier.execute({
        data: { id: '123' },
        schema,
      });

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('missing required property: value');
    });

    it('should fail on wrong type', () => {
      const verifier = new VerifySchemaOperator();
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          value: { type: 'number' },
        },
        required: ['value'],
      };

      const result = verifier.execute({
        data: { value: 'not a number' },
        schema,
      });

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('must be a number');
    });

    it('should validate nested objects', () => {
      const verifier = new VerifySchemaOperator();
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          user: {
            type: 'object',
            properties: {
              name: { type: 'string' },
            },
            required: ['name'],
          },
        },
        required: ['user'],
      };

      const result = verifier.execute({
        data: { user: { name: 'John' } },
        schema,
      });

      expect(result.valid).toBe(true);
    });

    it('should fail on missing nested field', () => {
      const verifier = new VerifySchemaOperator();
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          user: {
            type: 'object',
            properties: {
              name: { type: 'string' },
            },
            required: ['name'],
          },
        },
        required: ['user'],
      };

      const result = verifier.execute({
        data: { user: {} },
        schema,
      });

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('missing required property: name');
    });
  });

  describe('VerifyConstraintsOperator', () => {
    it('should validate constraints', () => {
      const verifier = new VerifyConstraintsOperator();
      const result = verifier.execute({
        data: { value: 42 },
        constraints: [
          {
            name: 'positive',
            predicate: (data: any) => data.value > 0,
          },
          {
            name: 'less-than-100',
            predicate: (data: any) => data.value < 100,
          },
        ],
      });

      expect(result.valid).toBe(true);
      expect(result.reason).toContain('All 2 constraints satisfied');
    });

    it('should fail when constraint violated', () => {
      const verifier = new VerifyConstraintsOperator();
      const result = verifier.execute({
        data: { value: -5 },
        constraints: [
          {
            name: 'positive',
            predicate: (data: any) => data.value > 0,
          },
        ],
      });

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Constraint "positive" failed');
    });

    it('should handle constraint errors', () => {
      const verifier = new VerifyConstraintsOperator();
      const result = verifier.execute({
        data: { value: 42 },
        constraints: [
          {
            name: 'throws-error',
            predicate: () => {
              throw new Error('Test error');
            },
          },
        ],
      });

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('threw error');
      expect(result.reason).toContain('Test error');
    });

    it('should handle empty constraints', () => {
      const verifier = new VerifyConstraintsOperator();
      const result = verifier.execute({
        data: { value: 42 },
        constraints: [],
      });

      expect(result.valid).toBe(true);
      expect(result.reason).toContain('All 0 constraints satisfied');
    });

    it('should validate multiple constraints sequentially', () => {
      const verifier = new VerifyConstraintsOperator();
      const result = verifier.execute({
        data: { min: 10, max: 20 },
        constraints: [
          {
            name: 'min-less-than-max',
            predicate: (data: any) => data.min < data.max,
          },
          {
            name: 'positive-min',
            predicate: (data: any) => data.min > 0,
          },
        ],
      });

      expect(result.valid).toBe(true);
    });
  });
});
