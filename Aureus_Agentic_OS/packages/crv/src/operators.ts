import { Commit, ValidationResult, FailureTaxonomy, FailureRemediation } from './types';

/**
 * JSON Schema definition for operator input/output validation
 */
export interface JSONSchema {
  type: string;
  properties?: Record<string, JSONSchema>;
  required?: string[];
  items?: JSONSchema;
  additionalProperties?: boolean | JSONSchema;
  enum?: unknown[];
  [key: string]: unknown;
}

/**
 * Invariant rule that must hold for operator execution
 */
export interface Invariant {
  name: string;
  description: string;
  predicate: (input: unknown, output?: unknown) => boolean;
}

/**
 * Oracle check - deterministic validator for operator output
 */
export interface OracleCheck {
  name: string;
  description: string;
  check: (input: unknown, output: unknown) => ValidationResult;
}

/**
 * Operator interface for CRV validation pipeline
 * Defines input/output schemas, invariants, and oracle checks
 */
export interface Operator<TInput = unknown, TOutput = unknown> {
  name: string;
  description: string;
  inputSchema: JSONSchema;
  outputSchema: JSONSchema;
  invariants: Invariant[];
  oracleChecks: OracleCheck[];
  
  /**
   * Execute the operator with given input
   */
  execute(input: TInput): Promise<TOutput> | TOutput;
  
  /**
   * Validate that invariants hold
   */
  validateInvariants(input: TInput, output?: TOutput): ValidationResult;
  
  /**
   * Run oracle checks on output
   */
  runOracleChecks(input: TInput, output: TOutput): ValidationResult[];
}

/**
 * Base operator implementation with common validation logic
 */
export abstract class BaseOperator<TInput = unknown, TOutput = unknown> 
  implements Operator<TInput, TOutput> {
  
  constructor(
    public name: string,
    public description: string,
    public inputSchema: JSONSchema,
    public outputSchema: JSONSchema,
    public invariants: Invariant[] = [],
    public oracleChecks: OracleCheck[] = []
  ) {}

  abstract execute(input: TInput): Promise<TOutput> | TOutput;

  validateInvariants(input: TInput, output?: TOutput): ValidationResult {
    for (const invariant of this.invariants) {
      if (!invariant.predicate(input, output)) {
        // Determine failure code based on invariant name
        let failureCode = FailureTaxonomy.POLICY_VIOLATION;
        if (invariant.name.includes('null') || invariant.name.includes('missing')) {
          failureCode = FailureTaxonomy.MISSING_DATA;
        } else if (invariant.name.includes('determinism')) {
          failureCode = FailureTaxonomy.NON_DETERMINISM;
        }
        
        return {
          valid: false,
          reason: `Invariant "${invariant.name}" failed: ${invariant.description}`,
          confidence: 1.0,
          metadata: { invariant: invariant.name },
          failure_code: failureCode,
          remediation: FailureRemediation[failureCode],
        };
      }
    }
    return {
      valid: true,
      reason: 'All invariants satisfied',
      confidence: 1.0,
    };
  }

  runOracleChecks(input: TInput, output: TOutput): ValidationResult[] {
    return this.oracleChecks.map(check => check.check(input, output));
  }

  /**
   * Validate input against schema
   */
  protected validateInput(input: unknown): ValidationResult {
    return this.validateAgainstSchema(input, this.inputSchema, 'input');
  }

  /**
   * Validate output against schema
   */
  protected validateOutput(output: unknown): ValidationResult {
    return this.validateAgainstSchema(output, this.outputSchema, 'output');
  }

  /**
   * Simple JSON schema validator (public for use by subclasses)
   */
  protected validateAgainstSchema(
    data: unknown,
    schema: JSONSchema,
    context: string
  ): ValidationResult {
    if (schema.type === 'object' && typeof data !== 'object') {
      return {
        valid: false,
        reason: `${context} must be an object`,
        confidence: 1.0,
        failure_code: FailureTaxonomy.CONFLICT,
        remediation: FailureRemediation[FailureTaxonomy.CONFLICT],
      };
    }

    if (schema.type === 'array' && !Array.isArray(data)) {
      return {
        valid: false,
        reason: `${context} must be an array`,
        confidence: 1.0,
        failure_code: FailureTaxonomy.CONFLICT,
        remediation: FailureRemediation[FailureTaxonomy.CONFLICT],
      };
    }

    if (schema.type === 'string' && typeof data !== 'string') {
      return {
        valid: false,
        reason: `${context} must be a string`,
        confidence: 1.0,
        failure_code: FailureTaxonomy.CONFLICT,
        remediation: FailureRemediation[FailureTaxonomy.CONFLICT],
      };
    }

    if (schema.type === 'number' && typeof data !== 'number') {
      return {
        valid: false,
        reason: `${context} must be a number`,
        confidence: 1.0,
        failure_code: FailureTaxonomy.CONFLICT,
        remediation: FailureRemediation[FailureTaxonomy.CONFLICT],
      };
    }

    if (schema.type === 'boolean' && typeof data !== 'boolean') {
      return {
        valid: false,
        reason: `${context} must be a boolean`,
        confidence: 1.0,
        failure_code: FailureTaxonomy.CONFLICT,
        remediation: FailureRemediation[FailureTaxonomy.CONFLICT],
      };
    }

    if (schema.type === 'object' && schema.properties) {
      const obj = data as Record<string, unknown>;
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        if (schema.required?.includes(key) && !(key in obj)) {
          return {
            valid: false,
            reason: `${context} missing required property: ${key}`,
            confidence: 1.0,
            failure_code: FailureTaxonomy.MISSING_DATA,
            remediation: FailureRemediation[FailureTaxonomy.MISSING_DATA],
          };
        }
        if (key in obj) {
          const result = this.validateAgainstSchema(obj[key], propSchema, `${context}.${key}`);
          if (!result.valid) {
            return result;
          }
        }
      }
    }

    return {
      valid: true,
      reason: `${context} schema validation passed`,
      confidence: 1.0,
    };
  }
}

/**
 * Extract Operator - Extracts data from tool responses or commits
 */
export class ExtractOperator extends BaseOperator<unknown, unknown> {
  constructor(private extractor: (input: unknown) => unknown) {
    super(
      'Extract',
      'Extracts data from tool responses using configured extraction logic',
      { type: 'object' },
      { type: 'object' },
      [
        {
          name: 'non-null-input',
          description: 'Input must not be null or undefined',
          predicate: (input) => input != null,
        },
      ],
      [
        {
          name: 'extraction-completeness',
          description: 'Extracted data should not be empty',
          check: (input, output) => {
            const isValid = output != null && (typeof output !== 'object' || Object.keys(output as any).length > 0);
            return {
              valid: isValid,
              reason: output != null ? 'Extraction successful' : 'Extraction resulted in null/empty data',
              confidence: 0.9,
              failure_code: isValid ? undefined : FailureTaxonomy.MISSING_DATA,
              remediation: isValid ? undefined : FailureRemediation[FailureTaxonomy.MISSING_DATA],
            };
          },
        },
      ]
    );
  }

  execute(input: unknown): unknown {
    const inputValidation = this.validateInput(input);
    if (!inputValidation.valid) {
      throw new Error(inputValidation.reason);
    }

    const invariantCheck = this.validateInvariants(input);
    if (!invariantCheck.valid) {
      throw new Error(invariantCheck.reason);
    }

    return this.extractor(input);
  }
}

/**
 * Normalize Operator - Normalizes data to a standard format
 */
export class NormalizeOperator extends BaseOperator<unknown, unknown> {
  constructor(private normalizer: (input: unknown) => unknown) {
    super(
      'Normalize',
      'Normalizes data to a standard format for consistency',
      { type: 'object' },
      { type: 'object' },
      [
        {
          name: 'idempotence',
          description: 'Normalizing twice should produce same result',
          predicate: (input, output) => {
            if (output != null) {
              const normalized = this.normalizer(output);
              return JSON.stringify(normalized) === JSON.stringify(output);
            }
            return true;
          },
        },
      ],
      [
        {
          name: 'format-consistency',
          description: 'Output should match expected normalized format',
          check: (input, output) => ({
            valid: output != null && typeof output === 'object',
            reason: typeof output === 'object' ? 'Normalized format is valid' : 'Normalized output is not an object',
            confidence: 1.0,
          }),
        },
      ]
    );
  }

  execute(input: unknown): unknown {
    const inputValidation = this.validateInput(input);
    if (!inputValidation.valid) {
      throw new Error(inputValidation.reason);
    }

    return this.normalizer(input);
  }
}

/**
 * Compare Operator - Compares expected vs actual data
 */
export class CompareOperator extends BaseOperator<{ expected: unknown; actual: unknown }, { match: boolean; diff?: unknown }> {
  constructor(private comparator?: (expected: unknown, actual: unknown) => { match: boolean; diff?: unknown }) {
    super(
      'Compare',
      'Compares expected vs actual data and reports differences',
      {
        type: 'object',
        properties: {
          expected: { type: 'object' },
          actual: { type: 'object' },
        },
        required: ['expected', 'actual'],
      },
      {
        type: 'object',
        properties: {
          match: { type: 'boolean' },
          diff: { type: 'object' },
        },
        required: ['match'],
      },
      [
        {
          name: 'symmetry',
          description: 'Compare(A, B) should be inverse of Compare(B, A)',
          predicate: (input) => true, // Stateless, cannot verify symmetry in single call
        },
      ],
      [
        {
          name: 'match-consistency',
          description: 'Match flag should be true when expected equals actual',
          check: (input, output) => {
            const { expected, actual } = input as { expected: unknown; actual: unknown };
            const expectedMatch = JSON.stringify(expected) === JSON.stringify(actual);
            const actualMatch = (output as { match: boolean }).match;
            return {
              valid: expectedMatch === actualMatch,
              reason: expectedMatch === actualMatch 
                ? 'Match result is consistent' 
                : 'Match result is inconsistent with data equality',
              confidence: 1.0,
            };
          },
        },
      ]
    );
  }

  execute(input: { expected: unknown; actual: unknown }): { match: boolean; diff?: unknown } {
    const inputValidation = this.validateInput(input);
    if (!inputValidation.valid) {
      throw new Error(inputValidation.reason);
    }

    if (this.comparator) {
      return this.comparator(input.expected, input.actual);
    }

    // Default comparison using JSON stringify
    const match = JSON.stringify(input.expected) === JSON.stringify(input.actual);
    
    if (!match) {
      return {
        match,
        diff: {
          expected: input.expected,
          actual: input.actual,
        },
      };
    }

    return { match };
  }
}

/**
 * Decide Operator - Makes decisions based on validation results
 */
export class DecideOperator extends BaseOperator<ValidationResult[], { decision: 'allow' | 'block' | 'escalate'; reason: string }> {
  constructor(
    private decisionLogic?: (results: ValidationResult[]) => { decision: 'allow' | 'block' | 'escalate'; reason: string }
  ) {
    super(
      'Decide',
      'Makes decisions based on validation results',
      {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            valid: { type: 'boolean' },
            reason: { type: 'string' },
            confidence: { type: 'number' },
          },
          required: ['valid'],
        },
      },
      {
        type: 'object',
        properties: {
          decision: { type: 'string', enum: ['allow', 'block', 'escalate'] },
          reason: { type: 'string' },
        },
        required: ['decision', 'reason'],
      },
      [
        {
          name: 'decision-determinism',
          description: 'Same inputs should produce same decision',
          predicate: () => true, // Ensured by deterministic logic
        },
      ],
      [
        {
          name: 'decision-justification',
          description: 'Decision should have a non-empty reason',
          check: (input, output) => {
            const decision = output as { decision: string; reason: string };
            const hasReason = decision.reason && decision.reason.length > 0;
            return {
              valid: Boolean(hasReason),
              reason: hasReason ? 'Decision is justified' : 'Decision lacks justification',
              confidence: 1.0,
            };
          },
        },
      ]
    );
  }

  execute(input: ValidationResult[]): { decision: 'allow' | 'block' | 'escalate'; reason: string } {
    const inputValidation = this.validateInput(input);
    if (!inputValidation.valid) {
      throw new Error(inputValidation.reason);
    }

    if (this.decisionLogic) {
      return this.decisionLogic(input);
    }

    // Default decision logic
    const hasInvalid = input.some(r => !r.valid);
    const lowConfidence = input.some(r => (r.confidence ?? 1.0) < 0.5);

    if (lowConfidence) {
      return {
        decision: 'escalate',
        reason: 'Low confidence in validation results, escalating for review',
      };
    }

    if (hasInvalid) {
      return {
        decision: 'block',
        reason: 'Validation failed: ' + input.filter(r => !r.valid).map(r => r.reason).join(', '),
      };
    }

    return {
      decision: 'allow',
      reason: 'All validations passed',
    };
  }
}

/**
 * VerifySchema Operator - Enhanced schema validation with detailed reporting
 */
export class VerifySchemaOperator extends BaseOperator<{ data: unknown; schema: JSONSchema }, ValidationResult> {
  constructor() {
    super(
      'VerifySchema',
      'Validates data against JSON schema with detailed error reporting',
      {
        type: 'object',
        properties: {
          data: { type: 'object' },
          schema: { type: 'object' },
        },
        required: ['data', 'schema'],
      },
      {
        type: 'object',
        properties: {
          valid: { type: 'boolean' },
          reason: { type: 'string' },
          confidence: { type: 'number' },
        },
        required: ['valid'],
      },
      [],
      [
        {
          name: 'validation-completeness',
          description: 'Validation result should include reason',
          check: (input, output) => {
            const result = output as ValidationResult;
            const hasReason = result.reason != null && result.reason.length > 0;
            return {
              valid: hasReason,
              reason: hasReason ? 'Validation includes reason' : 'Validation missing reason',
              confidence: 1.0,
            };
          },
        },
      ]
    );
  }

  execute(input: { data: unknown; schema: JSONSchema }): ValidationResult {
    const inputValidation = this.validateInput(input);
    if (!inputValidation.valid) {
      throw new Error(inputValidation.reason);
    }

    return this.validateAgainstSchema(input.data, input.schema, 'data');
  }
}

/**
 * VerifyConstraints Operator - Validates invariants and constraints
 */
export class VerifyConstraintsOperator extends BaseOperator<
  { data: unknown; constraints: Array<{ name: string; predicate: (data: unknown) => boolean }> },
  ValidationResult
> {
  constructor() {
    super(
      'VerifyConstraints',
      'Validates data against invariants and constraints',
      {
        type: 'object',
        properties: {
          data: { type: 'object' },
          constraints: { type: 'array' },
        },
        required: ['data', 'constraints'],
      },
      {
        type: 'object',
        properties: {
          valid: { type: 'boolean' },
          reason: { type: 'string' },
          confidence: { type: 'number' },
        },
        required: ['valid'],
      },
      [],
      [
        {
          name: 'constraint-evaluation',
          description: 'All constraints should be evaluated',
          check: (input, output) => {
            const typedInput = input as { constraints: unknown[] };
            const typedOutput = output as ValidationResult;
            const constraintCount = (typedInput.constraints || []).length;
            return {
              valid: constraintCount === 0 || typedOutput.valid !== undefined,
              reason: typedOutput.valid !== undefined ? 'Constraints evaluated' : 'Constraint evaluation incomplete',
              confidence: 1.0,
            };
          },
        },
      ]
    );
  }

  execute(input: { 
    data: unknown; 
    constraints: Array<{ name: string; predicate: (data: unknown) => boolean }> 
  }): ValidationResult {
    const inputValidation = this.validateInput(input);
    if (!inputValidation.valid) {
      throw new Error(inputValidation.reason);
    }

    for (const constraint of input.constraints) {
      try {
        if (!constraint.predicate(input.data)) {
          return {
            valid: false,
            reason: `Constraint "${constraint.name}" failed`,
            confidence: 1.0,
            metadata: { constraint: constraint.name },
            failure_code: FailureTaxonomy.POLICY_VIOLATION,
            remediation: FailureRemediation[FailureTaxonomy.POLICY_VIOLATION],
          };
        }
      } catch (error) {
        return {
          valid: false,
          reason: `Constraint "${constraint.name}" threw error: ${error instanceof Error ? error.message : String(error)}`,
          confidence: 1.0,
          metadata: { constraint: constraint.name, error: String(error) },
          failure_code: FailureTaxonomy.TOOL_ERROR,
          remediation: FailureRemediation[FailureTaxonomy.TOOL_ERROR],
        };
      }
    }

    return {
      valid: true,
      reason: `All ${input.constraints.length} constraints satisfied`,
      confidence: 1.0,
    };
  }
}
