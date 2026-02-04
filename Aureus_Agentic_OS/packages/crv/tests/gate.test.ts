import { describe, it, expect, beforeEach } from 'vitest';
import { CRVGate, GateChain, Validators, Commit } from '../src';

describe('CRV Gate', () => {
  it('should block invalid commits (invariant 3)', async () => {
    const gate = new CRVGate({
      name: 'NotNull Gate',
      validators: [Validators.notNull()],
      blockOnFailure: true,
    });

    const invalidCommit: Commit = {
      id: 'commit-1',
      data: null,
    };

    const result = await gate.validate(invalidCommit);
    
    expect(result.passed).toBe(false);
    expect(result.blockedCommit).toBe(true);
  });

  it('should allow valid commits', async () => {
    const gate = new CRVGate({
      name: 'NotNull Gate',
      validators: [Validators.notNull()],
      blockOnFailure: true,
    });

    const validCommit: Commit = {
      id: 'commit-2',
      data: { value: 42 },
    };

    const result = await gate.validate(validCommit);
    
    expect(result.passed).toBe(true);
    expect(result.blockedCommit).toBe(false);
  });

  it('should validate schema', async () => {
    const gate = new CRVGate({
      name: 'Schema Gate',
      validators: [
        Validators.schema({
          id: 'string',
          value: 'number',
        }),
      ],
      blockOnFailure: true,
    });

    const validCommit: Commit = {
      id: 'commit-3',
      data: { id: 'test', value: 42 },
    };

    const invalidCommit: Commit = {
      id: 'commit-4',
      data: { id: 'test', value: 'wrong-type' },
    };

    const validResult = await gate.validate(validCommit);
    expect(validResult.passed).toBe(true);

    const invalidResult = await gate.validate(invalidCommit);
    expect(invalidResult.passed).toBe(false);
    expect(invalidResult.blockedCommit).toBe(true);
  });

  it('should enforce monotonic changes', async () => {
    const gate = new CRVGate({
      name: 'Monotonic Gate',
      validators: [Validators.monotonic()],
      blockOnFailure: true,
    });

    const nonMonotonicCommit: Commit = {
      id: 'commit-5',
      data: { version: 1 },
      previousState: { version: 2 },
    };

    const result = await gate.validate(nonMonotonicCommit);
    
    expect(result.passed).toBe(false);
    expect(result.blockedCommit).toBe(true);
  });

  it('should enforce max size', async () => {
    const gate = new CRVGate({
      name: 'Size Gate',
      validators: [Validators.maxSize(100)],
      blockOnFailure: true,
    });

    const largeCommit: Commit = {
      id: 'commit-6',
      data: { data: 'x'.repeat(1000) },
    };

    const result = await gate.validate(largeCommit);
    
    expect(result.passed).toBe(false);
    expect(result.blockedCommit).toBe(true);
  });

  it('should support custom validators', async () => {
    const gate = new CRVGate({
      name: 'Custom Gate',
      validators: [
        Validators.custom('positive-value', (commit) => {
          const data = commit.data as any;
          return data.value > 0;
        }),
      ],
      blockOnFailure: true,
    });

    const validCommit: Commit = {
      id: 'commit-7',
      data: { value: 10 },
    };

    const invalidCommit: Commit = {
      id: 'commit-8',
      data: { value: -5 },
    };

    const validResult = await gate.validate(validCommit);
    expect(validResult.passed).toBe(true);

    const invalidResult = await gate.validate(invalidCommit);
    expect(invalidResult.passed).toBe(false);
  });

  it('should support confidence thresholds', async () => {
    const lowConfidenceValidator = async (commit: Commit) => ({
      valid: true,
      confidence: 0.5,
    });

    const gate = new CRVGate({
      name: 'Confidence Gate',
      validators: [lowConfidenceValidator],
      blockOnFailure: true,
      requiredConfidence: 0.8,
    });

    const commit: Commit = {
      id: 'commit-9',
      data: { value: 42 },
    };

    const result = await gate.validate(commit);
    
    expect(result.passed).toBe(false);
    expect(result.blockedCommit).toBe(true);
  });
});

describe('GateChain', () => {
  it('should validate through multiple gates', async () => {
    const chain = new GateChain();
    
    chain.addGate(new CRVGate({
      name: 'NotNull',
      validators: [Validators.notNull()],
      blockOnFailure: true,
    }));
    
    chain.addGate(new CRVGate({
      name: 'Schema',
      validators: [Validators.schema({ value: 'number' })],
      blockOnFailure: true,
    }));

    const validCommit: Commit = {
      id: 'commit-10',
      data: { value: 42 },
    };

    const results = await chain.validate(validCommit);
    
    expect(results).toHaveLength(2);
    expect(results.every(r => r.passed)).toBe(true);
    expect(chain.wouldBlock(results)).toBe(false);
  });

  it('should stop at first blocking gate', async () => {
    const chain = new GateChain();
    
    chain.addGate(new CRVGate({
      name: 'NotNull',
      validators: [Validators.notNull()],
      blockOnFailure: true,
    }));
    
    chain.addGate(new CRVGate({
      name: 'Schema',
      validators: [Validators.schema({ value: 'number' })],
      blockOnFailure: true,
    }));

    const invalidCommit: Commit = {
      id: 'commit-11',
      data: null,
    };

    const results = await chain.validate(invalidCommit);
    
    // Should only have one result since first gate blocks
    expect(results).toHaveLength(1);
    expect(results[0].blockedCommit).toBe(true);
    expect(chain.wouldBlock(results)).toBe(true);
  });
});
