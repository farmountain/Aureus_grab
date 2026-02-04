# Chaos Test Suite

This directory contains chaos tests for the Aureus Agentic OS that verify system reliability under various failure conditions.

## Overview

The chaos test suite injects failures and validates that critical system invariants are maintained:

### Failure Modes Tested

1. **Tool Timeout** - Tools that exceed execution time limits
2. **Tool Error** - Tools that throw errors or fail unexpectedly
3. **Partial Response** - Tools that return incomplete data
4. **Corrupted Schema** - Tools that return data with invalid types or structure
5. **Conflicting Writes** - Concurrent operations that attempt to modify shared state

### Invariants Verified

1. **Idempotency** - No duplicate side effects occur on retry
2. **Rollback** - Complete restoration of prior state after failure
3. **Audit Log** - All operations are logged completely and immutably
4. **CRV Validation** - Invalid commits are blocked by Circuit Reasoning Validation gates

## Test Files

- **`tool-failures.test.ts`** - Tests tool timeout, error, partial response, and corrupted schema handling
- **`conflicting-writes.test.ts`** - Tests concurrent write detection, optimistic locking, and conflict resolution
- **`invariants.test.ts`** - Tests all system invariants under various failure scenarios

## Running Tests

### Run all chaos tests

```bash
npm run test -- tests/chaos
```

### Run a specific test file

```bash
npm run test -- tests/chaos/tool-failures.test.ts
```

### Generate reliability report

```bash
npx ts-node tests/chaos/run-chaos-tests.ts
```

This will:
- Run all chaos tests
- Generate a `reliability_report.md` file in the root directory
- Exit with code 0 if all tests pass, or code 1 if any fail

## CI/CD Integration

The chaos tests run automatically:

- **Nightly** at 2 AM UTC via GitHub Actions (`.github/workflows/chaos-tests.yml`)
- **On push** to main/develop branches when chaos test files change
- **Manual trigger** via GitHub Actions workflow dispatch

### Artifacts

Each test run produces:
- `reliability_report.md` - Detailed test results and analysis
- Uploaded as artifact in GitHub Actions with 90-day retention

### Notifications

- Failed tests on scheduled runs create or update a GitHub issue
- Failed tests on push events add a commit comment
- Results are published to GitHub Actions job summary

## Test Structure

Each test follows this pattern:

1. **Setup** - Initialize components (StateStore, HipCortex, ToolRegistry, etc.)
2. **Inject Failure** - Create tool or scenario that simulates a failure mode
3. **Execute** - Run workflow or operation that encounters the failure
4. **Verify Invariants** - Assert that all critical invariants are maintained
5. **Check Audit Log** - Verify complete logging of all operations

## Example Test

```typescript
it('should handle tool timeout gracefully and log in audit', async () => {
  // Create tool that times out
  const timeoutTool: ToolSpec = {
    id: 'timeout-tool',
    execute: async () => {
      await new Promise(resolve => setTimeout(resolve, 5000));
      return { result: 'should not reach here' };
    },
  };
  
  // Execute with timeout
  const result = await orchestrator.executeWorkflow(workflow);
  
  // Verify timeout was logged
  const auditLog = hipCortex.getAuditLog();
  expect(auditLog.find(e => e.action === 'tool-timeout')).toBeDefined();
  
  // Verify no side effects occurred
  expect(sideEffects.length).toBe(0);
});
```

## Adding New Tests

To add a new chaos test:

1. Create a new test file in `tests/chaos/` or add to existing file
2. Follow the existing test structure
3. Inject a specific failure mode
4. Verify all relevant invariants are maintained
5. Update `run-chaos-tests.ts` if needed to include the new file
6. Update this README with the new failure mode

## Best Practices

- **Isolation** - Each test should be independent and not rely on other tests
- **Cleanup** - Use `beforeEach` to clean up test directories and state
- **Deterministic** - Tests should produce consistent results (avoid random behavior where possible)
- **Fast** - Keep tests fast by using minimal timeouts and retry counts
- **Clear Assertions** - Each test should clearly state what invariant is being verified

## Debugging Failed Tests

When a test fails:

1. Check the `reliability_report.md` for detailed failure information
2. Run the specific test file locally with verbose output
3. Review the audit log entries to understand the sequence of events
4. Check event log for workflow/task state transitions
5. Verify the failure mode was injected correctly

## Maintenance

- Review and update tests when new features are added
- Add new failure modes as they're discovered in production
- Keep test execution time under 5 minutes total
- Archive old reliability reports periodically

## Related Documentation

- [Side-Effect Safety Model](../../docs/side-effect-safety.md)
- [CRV Implementation](../../CRV_IMPLEMENTATION_SUMMARY.md)
- [Architecture](../../architecture.md)
