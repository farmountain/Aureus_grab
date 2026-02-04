/**
 * Retry Middleware with Exponential Backoff
 * 
 * Implements configurable retry logic for handling transient failures:
 * - Exponential backoff with jitter to prevent thundering herd
 * - Configurable retry policies per error type
 * - Timeout handling
 * - Detailed retry metrics and logging
 * 
 * Week 9: Reliability & Error Handling
 */

const crypto = require('crypto');

/**
 * Retry policy configuration
 */
class RetryPolicy {
  constructor(options = {}) {
    this.maxAttempts = options.maxAttempts || 3;
    this.initialDelayMs = options.initialDelayMs || 100;
    this.maxDelayMs = options.maxDelayMs || 30000;
    this.backoffMultiplier = options.backoffMultiplier || 2.0;
    this.jitterFactor = options.jitterFactor || 0.1;
    this.timeoutMs = options.timeoutMs || 60000;
    this.retryableErrors = options.retryableErrors || [
      'ETIMEDOUT',
      'ECONNRESET',
      'ECONNREFUSED',
      'ENOTFOUND',
      'EAI_AGAIN',
      'TRANSIENT_ERROR',
      'SERVICE_UNAVAILABLE',
      'RATE_LIMIT_EXCEEDED'
    ];
  }

  /**
   * Check if error is retryable based on policy
   */
  isRetryable(error) {
    if (!error) return false;

    // Check error code
    if (error.code && this.retryableErrors.includes(error.code)) {
      return true;
    }

    // Check error message
    if (error.message) {
      const message = error.message.toLowerCase();
      return this.retryableErrors.some(retryableCode => 
        message.includes(retryableCode.toLowerCase())
      );
    }

    // Check HTTP status codes (if present)
    if (error.statusCode) {
      return error.statusCode >= 500 || error.statusCode === 429 || error.statusCode === 408;
    }

    return false;
  }

  /**
   * Calculate delay with exponential backoff and jitter
   */
  calculateDelay(attemptNumber) {
    // Exponential backoff: delay = initialDelay * (multiplier ^ attemptNumber)
    const exponentialDelay = this.initialDelayMs * Math.pow(this.backoffMultiplier, attemptNumber - 1);
    
    // Cap at max delay
    const cappedDelay = Math.min(exponentialDelay, this.maxDelayMs);
    
    // Add jitter: randomize delay by ±jitterFactor to prevent thundering herd
    const jitterRange = cappedDelay * this.jitterFactor;
    const jitter = (Math.random() * 2 - 1) * jitterRange;
    const finalDelay = Math.max(0, cappedDelay + jitter);
    
    return Math.floor(finalDelay);
  }
}

/**
 * Retry statistics tracker
 */
class RetryStats {
  constructor() {
    this.totalAttempts = 0;
    this.successfulRetries = 0;
    this.failedRetries = 0;
    this.totalDelayMs = 0;
    this.errors = [];
  }

  recordAttempt(attemptNumber, error = null) {
    this.totalAttempts++;
    if (error) {
      this.errors.push({
        attempt: attemptNumber,
        error: error.message || error.code || 'Unknown error',
        timestamp: new Date().toISOString()
      });
    }
  }

  recordSuccess(attemptNumber) {
    if (attemptNumber > 1) {
      this.successfulRetries++;
    }
  }

  recordFailure() {
    this.failedRetries++;
  }

  recordDelay(delayMs) {
    this.totalDelayMs += delayMs;
  }

  toJSON() {
    return {
      totalAttempts: this.totalAttempts,
      successfulRetries: this.successfulRetries,
      failedRetries: this.failedRetries,
      totalDelayMs: this.totalDelayMs,
      errors: this.errors
    };
  }
}

/**
 * Main retry middleware
 */
class RetryMiddleware {
  constructor(policy = null) {
    this.policy = policy || new RetryPolicy();
    this.stats = new RetryStats();
  }

  /**
   * Execute function with retry logic
   * 
   * @param {Function} fn - Async function to execute
   * @param {Object} options - Execution options
   * @returns {Promise} Result of function execution
   */
  async execute(fn, options = {}) {
    const operationId = options.operationId || this._generateOperationId();
    const policy = options.policy || this.policy;
    const context = options.context || {};

    let lastError;
    let attemptNumber = 0;

    const startTime = Date.now();

    while (attemptNumber < policy.maxAttempts) {
      attemptNumber++;

      try {
        // Check timeout
        const elapsed = Date.now() - startTime;
        if (elapsed > policy.timeoutMs) {
          throw new Error(`Operation timeout: ${elapsed}ms exceeds ${policy.timeoutMs}ms`);
        }

        // Log attempt
        this._logAttempt(operationId, attemptNumber, policy.maxAttempts);

        // Execute function with remaining timeout
        const remainingTimeout = policy.timeoutMs - elapsed;
        const result = await this._executeWithTimeout(fn, remainingTimeout, context);

        // Success!
        this.stats.recordAttempt(attemptNumber);
        this.stats.recordSuccess(attemptNumber);

        if (attemptNumber > 1) {
          this._logSuccess(operationId, attemptNumber);
        }

        return {
          success: true,
          result,
          attempts: attemptNumber,
          stats: this.stats.toJSON()
        };

      } catch (error) {
        lastError = error;
        this.stats.recordAttempt(attemptNumber, error);

        // Check if error is retryable
        if (!policy.isRetryable(error)) {
          this._logNonRetryable(operationId, error);
          this.stats.recordFailure();
          throw this._wrapError(error, attemptNumber, this.stats.toJSON());
        }

        // Check if we have more attempts
        if (attemptNumber >= policy.maxAttempts) {
          this._logMaxAttemptsReached(operationId, attemptNumber);
          this.stats.recordFailure();
          throw this._wrapError(lastError, attemptNumber, this.stats.toJSON());
        }

        // Calculate delay and wait
        const delayMs = policy.calculateDelay(attemptNumber);
        this.stats.recordDelay(delayMs);
        this._logRetry(operationId, attemptNumber, delayMs, error);

        await this._sleep(delayMs);
      }
    }

    // Should not reach here, but just in case
    this.stats.recordFailure();
    throw this._wrapError(lastError, attemptNumber, this.stats.toJSON());
  }

  /**
   * Execute function with timeout
   */
  async _executeWithTimeout(fn, timeoutMs, context) {
    return new Promise(async (resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Execution timeout: ${timeoutMs}ms`));
      }, timeoutMs);

      try {
        const result = await fn(context);
        clearTimeout(timer);
        resolve(result);
      } catch (error) {
        clearTimeout(timer);
        reject(error);
      }
    });
  }

  /**
   * Helper: sleep for specified milliseconds
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Helper: generate unique operation ID
   */
  _generateOperationId() {
    return crypto.randomBytes(8).toString('hex');
  }

  /**
   * Helper: wrap error with retry metadata
   */
  _wrapError(originalError, attempts, stats) {
    const error = new Error(`Operation failed after ${attempts} attempts: ${originalError.message}`);
    error.code = 'RETRY_EXHAUSTED';
    error.originalError = originalError;
    error.attempts = attempts;
    error.stats = stats;
    return error;
  }

  /**
   * Logging helpers
   */
  _logAttempt(operationId, attemptNumber, maxAttempts) {
    console.log(`[RetryMiddleware] ${operationId} - Attempt ${attemptNumber}/${maxAttempts}`);
  }

  _logSuccess(operationId, attemptNumber) {
    console.log(`[RetryMiddleware] ${operationId} - Success after ${attemptNumber} attempts`);
  }

  _logRetry(operationId, attemptNumber, delayMs, error) {
    console.log(`[RetryMiddleware] ${operationId} - Retry after ${delayMs}ms (attempt ${attemptNumber} failed: ${error.message})`);
  }

  _logNonRetryable(operationId, error) {
    console.log(`[RetryMiddleware] ${operationId} - Non-retryable error: ${error.message}`);
  }

  _logMaxAttemptsReached(operationId, attempts) {
    console.log(`[RetryMiddleware] ${operationId} - Max attempts (${attempts}) reached`);
  }

  /**
   * Get current statistics
   */
  getStats() {
    return this.stats.toJSON();
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = new RetryStats();
  }
}

/**
 * Predefined retry policies for common scenarios
 */
const RetryPolicies = {
  // Aggressive retry for critical operations
  AGGRESSIVE: new RetryPolicy({
    maxAttempts: 5,
    initialDelayMs: 50,
    maxDelayMs: 10000,
    backoffMultiplier: 2.0,
    timeoutMs: 60000
  }),

  // Standard retry for normal operations
  STANDARD: new RetryPolicy({
    maxAttempts: 3,
    initialDelayMs: 100,
    maxDelayMs: 30000,
    backoffMultiplier: 2.0,
    timeoutMs: 60000
  }),

  // Conservative retry for expensive operations
  CONSERVATIVE: new RetryPolicy({
    maxAttempts: 2,
    initialDelayMs: 500,
    maxDelayMs: 60000,
    backoffMultiplier: 3.0,
    timeoutMs: 120000
  }),

  // Fast fail for user-facing operations
  FAST_FAIL: new RetryPolicy({
    maxAttempts: 2,
    initialDelayMs: 100,
    maxDelayMs: 1000,
    backoffMultiplier: 2.0,
    timeoutMs: 5000
  }),

  // KMS operations (external service)
  KMS: new RetryPolicy({
    maxAttempts: 4,
    initialDelayMs: 200,
    maxDelayMs: 20000,
    backoffMultiplier: 2.5,
    timeoutMs: 30000,
    retryableErrors: [
      'ETIMEDOUT',
      'ECONNRESET',
      'ThrottlingException',
      'ServiceUnavailableException',
      'InternalFailureException',
      'RATE_LIMIT_EXCEEDED'
    ]
  }),

  // Database operations
  DATABASE: new RetryPolicy({
    maxAttempts: 3,
    initialDelayMs: 100,
    maxDelayMs: 10000,
    backoffMultiplier: 2.0,
    timeoutMs: 30000,
    retryableErrors: [
      'ECONNRESET',
      'ECONNREFUSED',
      'ConnectionError',
      'TimeoutError',
      'TRANSIENT_ERROR'
    ]
  })
};

module.exports = {
  RetryMiddleware,
  RetryPolicy,
  RetryPolicies,
  RetryStats
};
