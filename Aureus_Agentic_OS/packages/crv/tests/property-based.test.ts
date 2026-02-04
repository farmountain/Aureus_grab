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
import { ValidationResult, FailureTaxonomy } from '../src/types';

/**
 * Property-based testing utilities for CRV operators
 * These tests verify key invariants hold across random inputs
 */

/**
 * Generate random test data for property-based testing
 */
function generateRandomObject(depth: number = 0): Record<string, unknown> {
  if (depth > 2) return {}; // Limit recursion
  
  const obj: Record<string, unknown> = {};
  const numProps = Math.floor(Math.random() * 5) + 1;
  
  for (let i = 0; i < numProps; i++) {
    const key = `prop${i}`;
    const rand = Math.random();
    
    if (rand < 0.2) {
      obj[key] = Math.random() * 100;
    } else if (rand < 0.4) {
      obj[key] = `string${i}`;
    } else if (rand < 0.6) {
      obj[key] = Math.random() > 0.5;
    } else if (rand < 0.8 && depth < 2) {
      obj[key] = generateRandomObject(depth + 1);
    } else {
      obj[key] = null;
    }
  }
  
  return obj;
}

describe('Property-Based Tests for CRV Operators', () => {
  describe('ExtractOperator Invariants', () => {
    it('should satisfy non-null-input invariant for all non-null inputs', () => {
      const extractor = new ExtractOperator((input: any) => input);
      
      // Property: For all non-null inputs, invariant should hold
      for (let i = 0; i < 100; i++) {
        const input = generateRandomObject();
        const validation = extractor.validateInvariants(input);
        expect(validation.valid).toBe(true);
      }
    });

    it('should fail non-null-input invariant for null inputs', () => {
      const extractor = new ExtractOperator((input: any) => input);
      
      // Property: Null inputs always fail the invariant
      const validation1 = extractor.validateInvariants(null);
      expect(validation1.valid).toBe(false);
      expect(validation1.failure_code).toBe(FailureTaxonomy.MISSING_DATA);
      
      const validation2 = extractor.validateInvariants(undefined);
      expect(validation2.valid).toBe(false);
      expect(validation2.failure_code).toBe(FailureTaxonomy.MISSING_DATA);
    });

    it('should produce output for all valid inputs (completeness)', () => {
      const extractor = new ExtractOperator((input: any) => ({ extracted: true, ...input }));
      
      // Property: All valid inputs produce non-empty output
      for (let i = 0; i < 50; i++) {
        const input = generateRandomObject();
        const output = extractor.execute(input);
        expect(output).toBeDefined();
        expect(output).not.toBeNull();
      }
    });
  });

  describe('NormalizeOperator Invariants', () => {
    it('should satisfy idempotence for all inputs', () => {
      const normalizer = new NormalizeOperator((input: any) => {
        if (typeof input === 'object' && input !== null) {
          return Object.keys(input).reduce((acc, key) => {
            acc[key] = String(input[key]);
            return acc;
          }, {} as any);
        }
        return input;
      });
      
      // Property: normalize(normalize(x)) === normalize(x)
      for (let i = 0; i < 50; i++) {
        const input = generateRandomObject();
        const normalized1 = normalizer.execute(input);
        const normalized2 = normalizer.execute(normalized1);
        
        expect(JSON.stringify(normalized1)).toBe(JSON.stringify(normalized2));
      }
    });

    it('should validate idempotence invariant', () => {
      const normalizer = new NormalizeOperator((input: any) => {
        if (typeof input === 'object' && input !== null) {
          return Object.keys(input).reduce((acc, key) => {
            acc[key] = String(input[key]);
            return acc;
          }, {} as any);
        }
        return input;
      });
      
      // Property: Idempotence invariant should hold for all inputs
      for (let i = 0; i < 30; i++) {
        const input = generateRandomObject();
        const output = normalizer.execute(input);
        const validation = normalizer.validateInvariants(input, output);
        
        expect(validation.valid).toBe(true);
      }
    });
  });

  describe('CompareOperator Invariants', () => {
    it('should satisfy reflexivity: compare(x, x) always matches', () => {
      const comparator = new CompareOperator();
      
      // Property: For all x, compare(x, x) should match
      for (let i = 0; i < 50; i++) {
        const obj = generateRandomObject();
        const result = comparator.execute({ expected: obj, actual: obj });
        expect(result.match).toBe(true);
      }
    });

    it('should produce consistent match results', () => {
      const comparator = new CompareOperator();
      
      // Property: Oracle check validates match consistency
      for (let i = 0; i < 30; i++) {
        const obj1 = generateRandomObject();
        const obj2 = generateRandomObject();
        const result = comparator.execute({ expected: obj1, actual: obj2 });
        
        const checks = comparator.runOracleChecks({ expected: obj1, actual: obj2 }, result);
        expect(checks[0].valid).toBe(true);
      }
    });

    it('should detect differences when objects differ', () => {
      const comparator = new CompareOperator();
      
      // Property: Different objects should not match
      const obj1 = { a: 1, b: 2 };
      const obj2 = { a: 1, b: 3 };
      
      const result = comparator.execute({ expected: obj1, actual: obj2 });
      expect(result.match).toBe(false);
      expect(result.diff).toBeDefined();
    });
  });

  describe('DecideOperator Invariants', () => {
    it('should satisfy determinism: same inputs produce same decision', () => {
      const decider = new DecideOperator();
      
      // Property: Deterministic decision making
      const validationResults: ValidationResult[] = [
        { valid: true, confidence: 1.0 },
        { valid: false, reason: 'test failure', confidence: 1.0 },
      ];
      
      const decision1 = decider.execute(validationResults);
      const decision2 = decider.execute(validationResults);
      
      expect(decision1.decision).toBe(decision2.decision);
      expect(decision1.reason).toBe(decision2.reason);
    });

    it('should always provide justification', () => {
      const decider = new DecideOperator();
      
      // Property: All decisions must have non-empty reasons
      const testCases = [
        [{ valid: true, confidence: 1.0 }],
        [{ valid: false, reason: 'test', confidence: 1.0 }],
        [{ valid: true, confidence: 0.3 }],
        [{ valid: true, confidence: 0.8 }, { valid: false, reason: 'error', confidence: 0.9 }],
      ];
      
      for (const results of testCases) {
        const decision = decider.execute(results);
        expect(decision.reason).toBeDefined();
        expect(decision.reason.length).toBeGreaterThan(0);
        
        const checks = decider.runOracleChecks(results, decision);
        expect(checks[0].valid).toBe(true);
      }
    });

    it('should block on any invalid result', () => {
      const decider = new DecideOperator();
      
      // Property: Any invalid result should lead to block decision
      for (let i = 0; i < 20; i++) {
        const validCount = Math.floor(Math.random() * 3) + 1;
        const results: ValidationResult[] = [];
        
        for (let j = 0; j < validCount; j++) {
          results.push({ valid: true, confidence: 1.0 });
        }
        
        // Add one invalid result
        results.push({ valid: false, reason: 'test failure', confidence: 1.0 });
        
        const decision = decider.execute(results);
        expect(decision.decision).toBe('block');
      }
    });

    it('should escalate on low confidence', () => {
      const decider = new DecideOperator();
      
      // Property: Low confidence always escalates
      const lowConfidenceResults: ValidationResult[] = [
        { valid: true, confidence: 0.2 },
        { valid: true, confidence: 0.4 },
      ];
      
      const decision = decider.execute(lowConfidenceResults);
      expect(decision.decision).toBe('escalate');
      expect(decision.reason).toContain('Low confidence');
    });

    it('should allow when all valid with high confidence', () => {
      const decider = new DecideOperator();
      
      // Property: All valid with high confidence should allow
      for (let i = 1; i <= 10; i++) {
        const results: ValidationResult[] = [];
        for (let j = 0; j < i; j++) {
          results.push({ valid: true, confidence: 0.9 + Math.random() * 0.1 });
        }
        
        const decision = decider.execute(results);
        expect(decision.decision).toBe('allow');
      }
    });
  });

  describe('VerifySchemaOperator Invariants', () => {
    it('should validate correct data types consistently', () => {
      const verifier = new VerifySchemaOperator();
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          id: { type: 'string' },
          count: { type: 'number' },
          active: { type: 'boolean' },
        },
        required: ['id', 'count'],
      };
      
      // Property: Valid data always passes schema validation
      const validData = [
        { id: 'test1', count: 42, active: true },
        { id: 'test2', count: 0, active: false },
        { id: 'test3', count: 100 },
      ];
      
      for (const data of validData) {
        const result = verifier.execute({ data, schema });
        expect(result.valid).toBe(true);
      }
    });

    it('should detect missing required fields', () => {
      const verifier = new VerifySchemaOperator();
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          id: { type: 'string' },
          value: { type: 'number' },
        },
        required: ['id', 'value'],
      };
      
      // Property: Missing required fields always fail with MISSING_DATA
      const invalidData = [
        { id: 'test1' },
        { value: 42 },
        {},
      ];
      
      for (const data of invalidData) {
        const result = verifier.execute({ data, schema });
        expect(result.valid).toBe(false);
        expect(result.failure_code).toBe(FailureTaxonomy.MISSING_DATA);
        expect(result.remediation).toBeDefined();
      }
    });

    it('should detect type mismatches', () => {
      const verifier = new VerifySchemaOperator();
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          id: { type: 'string' },
          count: { type: 'number' },
        },
        required: ['id', 'count'],
      };
      
      // Property: Type mismatches always fail with CONFLICT
      const invalidData = [
        { id: 123, count: 42 },
        { id: 'test', count: '42' },
        { id: true, count: false },
      ];
      
      for (const data of invalidData) {
        const result = verifier.execute({ data, schema });
        expect(result.valid).toBe(false);
        expect(result.failure_code).toBe(FailureTaxonomy.CONFLICT);
        expect(result.remediation).toBeDefined();
      }
    });
  });

  describe('VerifyConstraintsOperator Invariants', () => {
    it('should evaluate all constraints until first failure', () => {
      const verifier = new VerifyConstraintsOperator();
      
      // Property: Constraint evaluation is sequential and stops at first failure
      let evaluationOrder: string[] = [];
      
      const result = verifier.execute({
        data: { value: -5 },
        constraints: [
          {
            name: 'positive',
            predicate: (data: any) => {
              evaluationOrder.push('positive');
              return data.value > 0;
            },
          },
          {
            name: 'less-than-100',
            predicate: (data: any) => {
              evaluationOrder.push('less-than-100');
              return data.value < 100;
            },
          },
        ],
      });
      
      expect(result.valid).toBe(false);
      expect(result.failure_code).toBe(FailureTaxonomy.POLICY_VIOLATION);
      expect(evaluationOrder).toContain('positive');
      // Second constraint should not be evaluated after first failure
      expect(evaluationOrder).not.toContain('less-than-100');
    });

    it('should handle constraint errors gracefully', () => {
      const verifier = new VerifyConstraintsOperator();
      
      // Property: Constraint errors produce TOOL_ERROR failures
      const result = verifier.execute({
        data: { value: 42 },
        constraints: [
          {
            name: 'throws-error',
            predicate: () => {
              throw new Error('Constraint evaluation failed');
            },
          },
        ],
      });
      
      expect(result.valid).toBe(false);
      expect(result.failure_code).toBe(FailureTaxonomy.TOOL_ERROR);
      expect(result.remediation).toBeDefined();
      expect(result.reason).toContain('threw error');
    });

    it('should pass when all constraints are satisfied', () => {
      const verifier = new VerifyConstraintsOperator();
      
      // Property: All satisfied constraints result in valid result
      for (let i = 0; i < 20; i++) {
        const value = Math.floor(Math.random() * 50) + 1; // 1-50
        const result = verifier.execute({
          data: { value },
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
        expect(result.failure_code).toBeUndefined();
      }
    });
  });

  describe('Failure Taxonomy Coverage', () => {
    it('should map all failure types to taxonomy codes', () => {
      // Property: All failure scenarios map to one of the taxonomy codes
      const taxonomyCodes = Object.values(FailureTaxonomy);
      
      // Test each failure type
      const failures: ValidationResult[] = [];
      
      // MISSING_DATA
      const extractor = new ExtractOperator(() => null);
      const checks = extractor.runOracleChecks({}, null);
      failures.push(checks[0]);
      
      // CONFLICT
      const verifier = new VerifySchemaOperator();
      const conflictResult = verifier.execute({
        data: { id: 123 },
        schema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      });
      failures.push(conflictResult);
      
      // POLICY_VIOLATION
      const constraintVerifier = new VerifyConstraintsOperator();
      const policyResult = constraintVerifier.execute({
        data: { value: -5 },
        constraints: [{ name: 'positive', predicate: (d: any) => d.value > 0 }],
      });
      failures.push(policyResult);
      
      // TOOL_ERROR
      const errorResult = constraintVerifier.execute({
        data: { value: 42 },
        constraints: [{ name: 'error', predicate: () => { throw new Error('test'); } }],
      });
      failures.push(errorResult);
      
      // Verify all failures have taxonomy codes
      for (const failure of failures) {
        if (!failure.valid) {
          expect(failure.failure_code).toBeDefined();
          expect(taxonomyCodes).toContain(failure.failure_code!);
          expect(failure.remediation).toBeDefined();
          expect(failure.remediation!.length).toBeGreaterThan(0);
        }
      }
    });
  });
});
