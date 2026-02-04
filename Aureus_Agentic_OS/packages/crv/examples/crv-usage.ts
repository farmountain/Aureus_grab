/**
 * Example demonstrating CRV (Circuit Reasoning Validation) usage
 * This shows how to build a validation pipeline with operators and recovery strategies
 */

import {
  CRVGate,
  Validators,
  VerificationPipeline,
  ExtractOperator,
  NormalizeOperator,
  VerifySchemaOperator,
  DecideOperator,
  VerifyConstraintsOperator,
  MockRecoveryExecutor,
  Commit,
  JSONSchema,
  GateChain,
  FailureTaxonomy,
  FailureRemediation,
} from '../src';

// Example 1: Basic CRV Gate with built-in validators
console.log('=== Example 1: Basic CRV Gate ===');

const basicGate = new CRVGate({
  name: 'Basic Validation Gate',
  validators: [
    Validators.notNull(),
    Validators.schema({ id: 'string', value: 'number' }),
    Validators.maxSize(1000),
  ],
  blockOnFailure: true,
});

const validCommit: Commit = {
  id: 'commit-1',
  data: { id: '123', value: 42 },
};

const invalidCommit: Commit = {
  id: 'commit-2',
  data: null,
};

(async () => {
  const validResult = await basicGate.validate(validCommit);
  console.log('Valid commit result:', {
    passed: validResult.passed,
    blocked: validResult.blockedCommit,
    crv_status: validResult.crv_status,
  });

  const invalidResult = await basicGate.validate(invalidCommit);
  console.log('Invalid commit result:', {
    passed: invalidResult.passed,
    blocked: invalidResult.blockedCommit,
    crv_status: invalidResult.crv_status,
    failure_code: invalidResult.failure_code,
    remediation: invalidResult.remediation,
    reasons: invalidResult.validationResults
      .filter(r => !r.valid)
      .map(r => r.reason),
  });
})();

// Example 2: Failure Taxonomy Usage
console.log('\n=== Example 2: Failure Taxonomy ===');

console.log('Available failure codes:');
Object.values(FailureTaxonomy).forEach(code => {
  console.log(`  - ${code}: ${FailureRemediation[code]}`);
});

// Example 3: Verification Pipeline with Operators
console.log('\n=== Example 3: Verification Pipeline ===');

const pipeline = new VerificationPipeline(
  {
    name: 'Tool Response Validation Pipeline',
    operators: [
      // Step 1: Extract relevant data from tool response
      new ExtractOperator((input: any) => {
        console.log('Extracting data from:', input);
        return input.tool_response.data;
      }),
      
      // Step 2: Normalize to standard format
      new NormalizeOperator((input: any) => {
        console.log('Normalizing:', input);
        return {
          id: String(input.id),
          value: Number(input.value),
          timestamp: new Date().toISOString(),
        };
      }),
    ],
    recoveryStrategy: {
      type: 'retry_alt_tool',
      toolName: 'backup-tool',
      maxRetries: 3,
    },
    stopOnFirstFailure: false,
  },
  new MockRecoveryExecutor()
);

const pipelineCommit: Commit = {
  id: 'pipeline-commit-1',
  data: {
    tool_response: {
      data: {
        id: 123,
        value: '42',
      },
    },
  },
};

(async () => {
  const pipelineResult = await pipeline.verify(pipelineCommit);
  console.log('Pipeline result:', {
    passed: pipelineResult.passed,
    operatorCount: pipelineResult.operatorResults.length,
    operators: pipelineResult.operatorResults.map(r => ({
      name: r.operatorName,
      passed: r.validation.valid,
    })),
  });
})();

// Example 4: Custom Validators with Failure Codes
console.log('\n=== Example 4: Custom Validators with Failure Codes ===');

const customGate = new CRVGate({
  name: 'Business Logic Gate',
  validators: [
    Validators.custom(
      'valid-user-id',
      (commit) => {
        const data = commit.data as any;
        return data.userId && data.userId.startsWith('user-');
      },
      'User ID must start with "user-"',
      FailureTaxonomy.POLICY_VIOLATION
    ),
    Validators.custom(
      'valid-amount',
      (commit) => {
        const data = commit.data as any;
        return data.amount >= 0 && data.amount <= 10000;
      },
      'Amount must be between 0 and 10000',
      FailureTaxonomy.OUT_OF_SCOPE
    ),
  ],
  blockOnFailure: true,
});

const businessCommit: Commit = {
  id: 'business-1',
  data: {
    userId: 'user-123',
    amount: 100,
  },
};

(async () => {
  const result = await customGate.validate(businessCommit);
  console.log('Business logic validation:', {
    passed: result.passed,
    gateName: result.gateName,
    crv_status: result.crv_status,
  });
})();

// Example 5: Gate Chain
console.log('\n=== Example 5: Gate Chain ===');

const gateChain = new GateChain();

gateChain.addGate(new CRVGate({
  name: 'Schema Gate',
  validators: [Validators.schema({ id: 'string', value: 'number' })],
  blockOnFailure: true,
}));

gateChain.addGate(new CRVGate({
  name: 'Business Rules Gate',
  validators: [
    Validators.custom('positive-value', (commit) => {
      return (commit.data as any).value > 0;
    }),
  ],
  blockOnFailure: true,
}));

const chainCommit: Commit = {
  id: 'chain-1',
  data: { id: 'test', value: 42 },
};

(async () => {
  const results = await gateChain.validate(chainCommit);
  console.log('Gate chain results:', {
    gates: results.map(r => ({
      name: r.gateName,
      passed: r.passed,
      blocked: r.blockedCommit,
      crv_status: r.crv_status,
      failure_code: r.failure_code,
    })),
    wouldBlock: gateChain.wouldBlock(results),
  });
})();

// Example 6: Recovery Strategies
console.log('\n=== Example 6: Recovery Strategies ===');

const strategies = [
  {
    type: 'retry_alt_tool' as const,
    toolName: 'backup-tool',
    maxRetries: 3,
  },
  {
    type: 'ask_user' as const,
    prompt: 'Validation failed. Please provide correct data.',
  },
  {
    type: 'escalate' as const,
    reason: 'Critical validation failure - human review required',
  },
  {
    type: 'ignore' as const,
    justification: 'Non-critical validation - proceeding anyway',
  },
];

strategies.forEach((strategy, i) => {
  console.log(`Strategy ${i + 1}:`, strategy);
});

console.log('\n=== All Examples Complete ===');
