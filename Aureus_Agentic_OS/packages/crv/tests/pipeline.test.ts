import { describe, it, expect } from 'vitest';
import {
  VerificationPipeline,
  VerificationPipelineConfig,
  MockRecoveryExecutor,
} from '../src/pipeline';
import {
  ExtractOperator,
  NormalizeOperator,
  VerifySchemaOperator,
  VerifyConstraintsOperator,
  DecideOperator,
} from '../src/operators';
import { Commit } from '../src/types';

describe('Verification Pipeline', () => {
  it('should run operators in sequence', async () => {
    const pipeline = new VerificationPipeline({
      name: 'Test Pipeline',
      operators: [
        new ExtractOperator((input: any) => input.response),
        new NormalizeOperator((input: any) => ({
          id: String(input.id),
          value: Number(input.value),
        })),
      ],
    });

    const commit: Commit = {
      id: 'commit-1',
      data: { response: { id: 123, value: '42' } },
    };

    const result = await pipeline.verify(commit);

    expect(result.passed).toBe(true);
    expect(result.operatorResults).toHaveLength(2);
    expect(result.operatorResults[0].operatorName).toBe('Extract');
    expect(result.operatorResults[1].operatorName).toBe('Normalize');
  });

  it('should detect operator failures', async () => {
    const pipeline = new VerificationPipeline({
      name: 'Failing Pipeline',
      operators: [
        new VerifySchemaOperator(),
      ],
    });

    const commit: Commit = {
      id: 'commit-2',
      data: {
        // Missing schema property - will fail
        data: { value: 42 },
      },
    };

    const result = await pipeline.verify(commit);

    expect(result.passed).toBe(false);
    expect(result.operatorResults[0].validation.valid).toBe(false);
  });

  it('should validate invariants for each operator', async () => {
    const pipeline = new VerificationPipeline({
      name: 'Invariant Pipeline',
      operators: [
        new ExtractOperator((input: any) => input.data),
      ],
    });

    const commit: Commit = {
      id: 'commit-3',
      data: null, // Violates non-null-input invariant
    };

    const result = await pipeline.verify(commit);

    expect(result.passed).toBe(false);
    expect(result.operatorResults[0].validation.reason).toContain('error');
  });

  it('should run oracle checks', async () => {
    const pipeline = new VerificationPipeline({
      name: 'Oracle Pipeline',
      operators: [
        new ExtractOperator((input: any) => ({})), // Returns empty, fails oracle
      ],
    });

    const commit: Commit = {
      id: 'commit-4',
      data: { test: 'data' },
    };

    const result = await pipeline.verify(commit);

    expect(result.passed).toBe(false);
    expect(result.operatorResults[0].oracleChecks).toHaveLength(1);
    expect(result.operatorResults[0].oracleChecks[0].valid).toBe(false);
  });

  it('should stop on first failure when configured', async () => {
    const pipeline = new VerificationPipeline({
      name: 'Stop Pipeline',
      operators: [
        new ExtractOperator((input: any) => {
          throw new Error('Extraction failed');
        }),
        new NormalizeOperator((input: any) => input), // Should not run
      ],
      stopOnFirstFailure: true,
    });

    const commit: Commit = {
      id: 'commit-5',
      data: { test: 'data' },
    };

    const result = await pipeline.verify(commit);

    expect(result.passed).toBe(false);
    expect(result.operatorResults).toHaveLength(1); // Only first operator ran
  });

  it('should continue on failure when not configured to stop', async () => {
    const pipeline = new VerificationPipeline({
      name: 'Continue Pipeline',
      operators: [
        new ExtractOperator((input: any) => {
          throw new Error('First operator failed');
        }),
        new NormalizeOperator((input: any) => input),
      ],
      stopOnFirstFailure: false,
    });

    const commit: Commit = {
      id: 'commit-6',
      data: { test: 'data' },
    };

    const result = await pipeline.verify(commit);

    expect(result.passed).toBe(false);
    expect(result.operatorResults).toHaveLength(2); // Both operators ran
  });

  it('should apply retry_alt_tool recovery strategy', async () => {
    const recoveryExecutor = new MockRecoveryExecutor();
    const pipeline = new VerificationPipeline(
      {
        name: 'Recovery Pipeline',
        operators: [
          new ExtractOperator((input: any) => {
            throw new Error('Extraction failed');
          }),
        ],
        recoveryStrategy: {
          type: 'retry_alt_tool',
          toolName: 'alternative-tool',
          maxRetries: 3,
        },
      },
      recoveryExecutor
    );

    const commit: Commit = {
      id: 'commit-7',
      data: { test: 'data' },
    };

    const result = await pipeline.verify(commit);

    expect(result.passed).toBe(false);
    expect(result.recoveryApplied).toBeDefined();
    expect(result.recoveryApplied?.success).toBe(true);
    expect(result.recoveryApplied?.strategy.type).toBe('retry_alt_tool');
  });

  it('should apply ask_user recovery strategy', async () => {
    const recoveryExecutor = new MockRecoveryExecutor();
    const pipeline = new VerificationPipeline(
      {
        name: 'Ask User Pipeline',
        operators: [
          new ExtractOperator((input: any) => {
            throw new Error('Extraction failed');
          }),
        ],
        recoveryStrategy: {
          type: 'ask_user',
          prompt: 'Schema validation failed. Please provide correct data.',
        },
      },
      recoveryExecutor
    );

    const commit: Commit = {
      id: 'commit-8',
      data: { test: 'data' },
    };

    const result = await pipeline.verify(commit);

    expect(result.passed).toBe(false);
    expect(result.recoveryApplied).toBeDefined();
    expect(result.recoveryApplied?.strategy.type).toBe('ask_user');
  });

  it('should apply escalate recovery strategy', async () => {
    const recoveryExecutor = new MockRecoveryExecutor();
    const pipeline = new VerificationPipeline(
      {
        name: 'Escalate Pipeline',
        operators: [
          new ExtractOperator((input: any) => {
            throw new Error('Critical failure');
          }),
        ],
        recoveryStrategy: {
          type: 'escalate',
          reason: 'Critical constraint violation detected',
        },
      },
      recoveryExecutor
    );

    const commit: Commit = {
      id: 'commit-9',
      data: { test: 'data' },
    };

    const result = await pipeline.verify(commit);

    expect(result.passed).toBe(false);
    expect(result.recoveryApplied).toBeDefined();
    expect(result.recoveryApplied?.strategy.type).toBe('escalate');
  });

  it('should apply ignore recovery strategy', async () => {
    // Ignore strategy doesn't require an executor - it's self-contained
    const pipeline = new VerificationPipeline(
      {
        name: 'Ignore Pipeline',
        operators: [
          new ExtractOperator((input: any) => {
            throw new Error('Non-critical failure');
          }),
        ],
        recoveryStrategy: {
          type: 'ignore',
          justification: 'Non-critical validation - proceeding anyway',
        },
      },
      new MockRecoveryExecutor() // Provide executor even though ignore doesn't use it
    );

    const commit: Commit = {
      id: 'commit-10',
      data: { test: 'data' },
    };

    const result = await pipeline.verify(commit);

    expect(result.passed).toBe(false);
    expect(result.recoveryApplied).toBeDefined();
    expect(result.recoveryApplied?.success).toBe(true);
    expect(result.recoveryApplied?.strategy.type).toBe('ignore');
  });

  it('should handle missing recovery executor', async () => {
    const pipeline = new VerificationPipeline({
      name: 'No Executor Pipeline',
      operators: [
        new ExtractOperator((input: any) => {
          throw new Error('Failure');
        }),
      ],
      recoveryStrategy: {
        type: 'retry_alt_tool',
        toolName: 'alt-tool',
        maxRetries: 3,
      },
    });

    const commit: Commit = {
      id: 'commit-11',
      data: { test: 'data' },
    };

    const result = await pipeline.verify(commit);

    expect(result.passed).toBe(false);
    expect(result.recoveryApplied).toBeUndefined(); // No executor, no recovery
  });

  it('should pass data through operator chain', async () => {
    const executionLog: string[] = [];

    const pipeline = new VerificationPipeline({
      name: 'Chain Pipeline',
      operators: [
        new ExtractOperator((input: any) => {
          executionLog.push('extract');
          return input.nested;
        }),
        new NormalizeOperator((input: any) => {
          executionLog.push('normalize');
          return { normalized: input };
        }),
      ],
    });

    const commit: Commit = {
      id: 'commit-12',
      data: { nested: { value: 42 } },
    };

    const result = await pipeline.verify(commit);

    // Both operators should run and pass
    expect(result.operatorResults).toHaveLength(2);
    expect(executionLog[0]).toBe('extract');
    expect(executionLog[1]).toBe('normalize');
    
    // Check if all operators passed
    const allPassed = result.operatorResults.every(r => r.validation.valid && r.invariants.valid);
    expect(allPassed).toBe(result.passed);
  });
});
