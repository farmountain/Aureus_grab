/**
 * Reliability & Error Handling Test Suite
 * Week 9: Comprehensive testing of retry, circuit breaker, degradation, and fault injection
 */

const assert = require('assert');
const { RetryMiddleware, RetryPolicy, RetryPolicies } = require('../Aureus-Sentinel/reliability/retry_middleware.js');
const { CircuitBreaker, CircuitBreakerConfig, CircuitBreakerRegistry, States } = require('../Aureus-Sentinel/reliability/circuit_breaker.js');
const { GracefulDegradationManager, DegradationModes, FallbackStrategies } = require('../Aureus-Sentinel/reliability/graceful_degradation.js');
const { ErrorClassifier, ErrorCategories, ErrorSeverity, RecoveryStrategies } = require('../Aureus-Sentinel/reliability/error_classifier.js');
const { ChaosFramework, FaultTypes, FaultConfig } = require('../Aureus-Sentinel/reliability/chaos_engineering.js');

// Test tracking
let testsPassed = 0;
let testsFailed = 0;

async function asyncTest(description, fn) {
  try {
    await fn();
    console.log(`✅ ${description}`);
    testsPassed++;
  } catch (error) {
    console.log(`❌ ${description}`);
    console.log(`   Error: ${error.message}`);
    testsFailed++;
  }
}

// Helper: simulate transient failure
let failCount = 0;
async function transientFailure(maxFails) {
  failCount++;
  if (failCount <= maxFails) {
    const error = new Error('Transient failure');
    error.code = 'ETIMEDOUT';
    throw error;
  }
  return { success: true, value: 'operation completed' };
}

// Helper: always fail
async function permanentFailure() {
  const error = new Error('Permanent failure');
  error.code = 'VALIDATION_ERROR';
  throw error;
}

// Helper: slow operation
async function slowOperation(delayMs) {
  await new Promise(resolve => setTimeout(resolve, delayMs));
  return { success: true };
}

async function runAllTests() {
  console.log('\n=== Test Suite 1: Retry Middleware ===\n');

  await asyncTest('Should succeed on first attempt', async () => {
    const retry = new RetryMiddleware();
    const result = await retry.execute(async () => {
      return { value: 'success' };
    });
    
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.attempts, 1);
    assert.strictEqual(result.result.value, 'success');
  });

  await asyncTest('Should retry and succeed after transient failures', async () => {
    failCount = 0;
    const retry = new RetryMiddleware(new RetryPolicy({ maxAttempts: 5, initialDelayMs: 10 }));
    
    const result = await retry.execute(async () => {
      return await transientFailure(2);
    });
    
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.attempts, 3);
    assert.strictEqual(result.result.value, 'operation completed');
  });

  await asyncTest('Should respect max attempts and fail', async () => {
    failCount = 0;
    const retry = new RetryMiddleware(new RetryPolicy({ maxAttempts: 2, initialDelayMs: 10 }));
    
    try {
      await retry.execute(async () => {
        return await transientFailure(5);
      });
      throw new Error('Should have thrown');
    } catch (error) {
      assert.strictEqual(error.code, 'RETRY_EXHAUSTED');
      assert.strictEqual(error.attempts, 2);
    }
  });

  await asyncTest('Should not retry non-retryable errors', async () => {
    const retry = new RetryMiddleware(new RetryPolicy({ maxAttempts: 5 }));
    
    try {
      await retry.execute(permanentFailure);
      throw new Error('Should have thrown');
    } catch (error) {
      assert.strictEqual(error.message.includes('Permanent failure'), true);
      assert.strictEqual(error.attempts, 1);
    }
  });

  await asyncTest('Should apply exponential backoff', async () => {
    const policy = new RetryPolicy({ initialDelayMs: 100, backoffMultiplier: 2.0 });
    
    const delay1 = policy.calculateDelay(1);
    const delay2 = policy.calculateDelay(2);
    const delay3 = policy.calculateDelay(3);
    
    assert.ok(delay1 >= 90 && delay1 <= 110, `Delay 1: ${delay1}`);
    assert.ok(delay2 >= 180 && delay2 <= 220, `Delay 2: ${delay2}`);
    assert.ok(delay3 >= 360 && delay3 <= 440, `Delay 3: ${delay3}`);
  });

  await asyncTest('Should timeout long operations', async () => {
    const retry = new RetryMiddleware(new RetryPolicy({ 
      maxAttempts: 1, 
      timeoutMs: 100 
    }));
    
    try {
      await retry.execute(() => slowOperation(500));
      throw new Error('Should have timed out');
    } catch (error) {
      assert.ok(error.message.includes('timeout'));
    }
  });

  console.log('\n=== Test Suite 2: Circuit Breaker ===\n');

  await asyncTest('Should start in CLOSED state', async () => {
    const breaker = new CircuitBreaker('test1', new CircuitBreakerConfig({ failureThreshold: 3 }));
    assert.strictEqual(breaker.getState(), States.CLOSED);
  });

  await asyncTest('Should open after failure threshold', async () => {
    const breaker = new CircuitBreaker('test2', new CircuitBreakerConfig({ 
      failureThreshold: 3,
      requestTimeoutMs: 1000
    }));
    
    for (let i = 0; i < 3; i++) {
      try {
        await breaker.execute(permanentFailure);
      } catch (e) { }
    }
    
    assert.strictEqual(breaker.getState(), States.OPEN);
  });

  await asyncTest('Should reject requests when OPEN', async () => {
    const breaker = new CircuitBreaker('test3', new CircuitBreakerConfig({ 
      failureThreshold: 2,
      openTimeoutMs: 5000
    }));
    
    breaker.forceState(States.OPEN);
    
    try {
      await breaker.execute(async () => ({ success: true }));
      throw new Error('Should have rejected');
    } catch (error) {
      assert.strictEqual(error.code, 'CIRCUIT_OPEN');
    }
  });

  await asyncTest('Should transition to HALF_OPEN after timeout', async () => {
    const breaker = new CircuitBreaker('test4', new CircuitBreakerConfig({ 
      failureThreshold: 2,
      openTimeoutMs: 100
    }));
    
    breaker.forceState(States.OPEN);
    await new Promise(resolve => setTimeout(resolve, 150));
    
    try {
      await breaker.execute(async () => ({ success: true }));
    } catch (e) {}
    
    assert.strictEqual(breaker.getState(), States.HALF_OPEN);
  });

  await asyncTest('Should close after successful recovery', async () => {
    const breaker = new CircuitBreaker('test5', new CircuitBreakerConfig({ 
      successThreshold: 2
    }));
    
    breaker.forceState(States.HALF_OPEN);
    await breaker.execute(async () => ({ success: true }));
    await breaker.execute(async () => ({ success: true }));
    
    assert.strictEqual(breaker.getState(), States.CLOSED);
  });

  await asyncTest('Circuit breaker registry should manage multiple breakers', async () => {
    const registry = new CircuitBreakerRegistry();
    
    const breaker1 = registry.getOrCreate('service1');
    const breaker2 = registry.getOrCreate('service2');
    const breaker1Again = registry.getOrCreate('service1');
    
    assert.strictEqual(breaker1, breaker1Again);
    assert.notStrictEqual(breaker1, breaker2);
    
    const all = registry.getAll();
    assert.strictEqual(all.length, 2);
  });

  console.log('\n=== Test Suite 3: Graceful Degradation ===\n');

  await asyncTest('Should start in FULL mode', async () => {
    const degradation = new GracefulDegradationManager();
    assert.strictEqual(degradation.mode, DegradationModes.FULL);
  });

  await asyncTest('Should use cache fallback when service fails', async () => {
    const degradation = new GracefulDegradationManager();
    
    degradation.registerService('testService');
    degradation.registerFallback('testOp', {
      strategy: FallbackStrategies.CACHE,
      cacheKey: 'test-key',
      defaultValue: { cached: true },
      requiresService: ['testService']
    });
    
    degradation._cacheSet('test-key', { value: 'cached data' }, 300);
    degradation.forceServiceHealth('testService', false);
    
    const result = await degradation.execute('testOp', async () => {
      throw new Error('Service down');
    });
    
    assert.strictEqual(result.value.value, 'cached data');
    assert.strictEqual(result.source, 'cache');
  });

  await asyncTest('Should use default fallback', async () => {
    const degradation = new GracefulDegradationManager();
    
    degradation.registerFallback('testOp', {
      strategy: FallbackStrategies.DEFAULT,
      defaultValue: { fallback: true }
    });
    
    const result = await degradation.execute('testOp', async () => {
      throw new Error('Failed');
    });
    
    assert.strictEqual(result.value.fallback, true);
    assert.strictEqual(result.source, 'default');
  });

  await asyncTest('Should use stub fallback', async () => {
    const degradation = new GracefulDegradationManager();
    
    degradation.registerFallback('testOp', {
      strategy: FallbackStrategies.STUB,
      stubFunction: async () => ({ stub: true })
    });
    
    const result = await degradation.execute('testOp', async () => {
      throw new Error('Failed');
    });
    
    assert.strictEqual(result.value.stub, true);
    assert.strictEqual(result.source, 'stub');
  });

  await asyncTest('Should skip optional operations', async () => {
    const degradation = new GracefulDegradationManager();
    
    degradation.registerFallback('testOp', {
      strategy: FallbackStrategies.SKIP
    });
    
    const result = await degradation.execute('testOp', async () => {
      throw new Error('Failed');
    });
    
    assert.strictEqual(result.skipped, true);
  });

  await asyncTest('Should degrade mode based on service health', async () => {
    const degradation = new GracefulDegradationManager();
    degradation.config.unhealthyThreshold = 2;
    
    degradation.registerService('service1');
    degradation.registerService('service2');
    
    degradation.forceServiceHealth('service1', false);
    degradation.forceServiceHealth('service1', false);
    degradation.forceServiceHealth('service2', false);
    degradation.forceServiceHealth('service2', false);
    
    const status = degradation.getStatus();
    assert.notStrictEqual(status.mode, DegradationModes.FULL);
  });

  console.log('\n=== Test Suite 4: Error Classification ===\n');

  await asyncTest('Should classify timeout as transient', async () => {
    const classifier = new ErrorClassifier();
    const error = new Error('Connection timeout');
    error.code = 'ETIMEDOUT';
    
    const classification = classifier.classify(error);
    assert.strictEqual(classification.category, ErrorCategories.TRANSIENT);
    assert.strictEqual(classification.recoveryStrategy, RecoveryStrategies.RETRY);
  });

  await asyncTest('Should classify validation error as permanent', async () => {
    const classifier = new ErrorClassifier();
    const error = new Error('Invalid input');
    error.code = 'VALIDATION_ERROR';
    
    const classification = classifier.classify(error);
    assert.strictEqual(classification.category, ErrorCategories.PERMANENT);
    assert.strictEqual(classification.recoveryStrategy, RecoveryStrategies.FAIL_FAST);
  });

  await asyncTest('Should classify authentication error as permanent', async () => {
    const classifier = new ErrorClassifier();
    const error = new Error('Unauthorized');
    error.statusCode = 401;
    
    const classification = classifier.classify(error);
    assert.strictEqual(classification.category, ErrorCategories.PERMANENT);
    assert.strictEqual(classification.severity, ErrorSeverity.CRITICAL);
  });

  await asyncTest('Should classify rate limit as transient', async () => {
    const classifier = new ErrorClassifier();
    const error = new Error('Rate limit exceeded');
    error.statusCode = 429;
    
    const classification = classifier.classify(error);
    assert.strictEqual(classification.category, ErrorCategories.TRANSIENT);
    assert.ok(classification.metadata.retryable);
  });

  await asyncTest('Should classify circuit open as recoverable', async () => {
    const classifier = new ErrorClassifier();
    const error = new Error('Circuit breaker open');
    error.code = 'CIRCUIT_OPEN';
    
    const classification = classifier.classify(error);
    assert.strictEqual(classification.category, ErrorCategories.RECOVERABLE);
    assert.strictEqual(classification.recoveryStrategy, RecoveryStrategies.FALLBACK);
  });

  await asyncTest('Should check if error is retryable', async () => {
    const classifier = new ErrorClassifier();
    
    const transientError = new Error('Timeout');
    transientError.code = 'ETIMEDOUT';
    assert.strictEqual(classifier.isRetryable(transientError), true);
    
    const permanentError = new Error('Invalid');
    permanentError.code = 'VALIDATION_ERROR';
    assert.strictEqual(classifier.isRetryable(permanentError), false);
  });

  await asyncTest('Should add custom classification rules', async () => {
    const classifier = new ErrorClassifier();
    
    classifier.addRule({
      name: 'custom_rule',
      matcher: (err) => err.message.includes('CUSTOM'),
      category: ErrorCategories.TRANSIENT,
      severity: ErrorSeverity.LOW,
      recoveryStrategy: RecoveryStrategies.RETRY,
      metadata: { custom: true }
    });
    
    const error = new Error('CUSTOM error');
    const classification = classifier.classify(error);
    
    assert.strictEqual(classification.matchedRule, 'custom_rule');
    assert.strictEqual(classification.metadata.custom, true);
  });

  console.log('\n=== Test Suite 5: Fault Injection & Chaos Engineering ===\n');

  await asyncTest('Should inject latency fault', async () => {
    const chaos = new ChaosFramework();
    
    const point = chaos.registerInjectionPoint('test_latency', new FaultConfig({
      type: FaultTypes.LATENCY,
      latencyMs: 100,
      enabled: true,
      probability: 1.0
    }));
    
    const startTime = Date.now();
    await point.maybeInject();
    const elapsed = Date.now() - startTime;
    
    assert.ok(elapsed >= 90, `Latency too short: ${elapsed}ms`);
  });

  await asyncTest('Should inject error fault', async () => {
    const chaos = new ChaosFramework();
    
    const point = chaos.registerInjectionPoint('test_error', new FaultConfig({
      type: FaultTypes.ERROR,
      errorMessage: 'Injected error',
      errorCode: 'TEST_ERROR',
      enabled: true,
      probability: 1.0
    }));
    
    try {
      await point.maybeInject();
      throw new Error('Should have thrown');
    } catch (error) {
      assert.strictEqual(error.message, 'Injected error');
      assert.strictEqual(error.code, 'TEST_ERROR');
      assert.strictEqual(error.injected, true);
    }
  });

  await asyncTest('Should respect fault probability', async () => {
    const chaos = new ChaosFramework();
    
    const point = chaos.registerInjectionPoint('test_probability', new FaultConfig({
      type: FaultTypes.ERROR,
      enabled: true,
      probability: 0.0
    }));
    
    let injected = false;
    for (let i = 0; i < 10; i++) {
      try {
        await point.maybeInject();
      } catch (e) {
        injected = true;
      }
    }
    
    assert.strictEqual(injected, false);
  });

  await asyncTest('Should track fault injection statistics', async () => {
    const chaos = new ChaosFramework();
    
    const point = chaos.registerInjectionPoint('test_stats', new FaultConfig({
      enabled: false
    }));
    
    await point.maybeInject();
    await point.maybeInject();
    await point.maybeInject();
    
    const stats = point.getStats();
    assert.strictEqual(stats.totalCalls, 3);
    assert.strictEqual(stats.faultsInjected, 0);
  });

  await asyncTest('Should execute wrapped function with fault injection', async () => {
    const chaos = new ChaosFramework();
    
    chaos.registerInjectionPoint('test_wrapper', new FaultConfig({
      enabled: false
    }));
    
    const result = await chaos.executeWithFaultInjection(
      'test_wrapper',
      async () => ({ value: 'success' })
    );
    
    assert.strictEqual(result.value, 'success');
  });

  await asyncTest('Should disable all fault injection globally', async () => {
    const chaos = new ChaosFramework();
    
    chaos.registerInjectionPoint('point1', new FaultConfig({ enabled: true }));
    chaos.registerInjectionPoint('point2', new FaultConfig({ enabled: true }));
    
    chaos.setGlobalEnabled(false);
    
    assert.strictEqual(chaos.getInjectionPoint('point1').config.enabled, false);
    assert.strictEqual(chaos.getInjectionPoint('point2').config.enabled, false);
  });

  console.log('\n=== Test Suite 6: Integration Tests ===\n');

  await asyncTest('Retry + Circuit Breaker integration', async () => {
    const breaker = new CircuitBreaker('integrated', new CircuitBreakerConfig({
      failureThreshold: 3,
      requestTimeoutMs: 5000
    }));
    
    const retry = new RetryMiddleware(new RetryPolicy({
      maxAttempts: 2,
      initialDelayMs: 10
    }));
    
    failCount = 0;
    const result = await retry.execute(async () => {
      return await breaker.execute(async () => {
        return await transientFailure(1);
      });
    });
    
    assert.strictEqual(result.success, true);
    assert.strictEqual(breaker.getState(), States.CLOSED);
  });

  await asyncTest('Error Classifier + Retry integration', async () => {
    const classifier = new ErrorClassifier();
    const retry = new RetryMiddleware(new RetryPolicy({
      maxAttempts: 3,
      initialDelayMs: 10
    }));
    
    retry.policy.isRetryable = (error) => classifier.isRetryable(error);
    
    failCount = 0;
    const result = await retry.execute(async () => {
      return await transientFailure(1);
    });
    assert.strictEqual(result.success, true);
  });

  await asyncTest('Degradation + Circuit Breaker integration', async () => {
    const degradation = new GracefulDegradationManager();
    const breaker = new CircuitBreaker('service', new CircuitBreakerConfig({
      failureThreshold: 2
    }));
    
    degradation.registerService('service');
    degradation.registerFallback('operation', {
      strategy: FallbackStrategies.DEFAULT,
      defaultValue: { fallback: true },
      requiresService: ['service']
    });
    
    breaker.forceState(States.OPEN);
    degradation.forceServiceHealth('service', false);
    
    const result = await degradation.execute('operation', async () => {
      return await breaker.execute(async () => {
        return { primary: true };
      });
    });
    
    assert.strictEqual(result.value.fallback, true);
  });

  console.log('\n' + '='.repeat(60));
  console.log('📊 Reliability Test Results');
  console.log('='.repeat(60));
  console.log(`Total Tests: ${testsPassed + testsFailed}`);
  console.log(`✅ Passed: ${testsPassed}`);
  console.log(`❌ Failed: ${testsFailed}`);
  console.log(`Success Rate: ${((testsPassed + testsFailed) > 0 ? ((testsPassed / (testsPassed + testsFailed)) * 100).toFixed(1) : 0)}%`);
  console.log('='.repeat(60) + '\n');

  process.exit(testsFailed > 0 ? 1 : 0);
}

runAllTests().catch(error => {
  console.error('Test execution error:', error);
  process.exit(1);
});
