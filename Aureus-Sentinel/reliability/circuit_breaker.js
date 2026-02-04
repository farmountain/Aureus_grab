/**
 * Circuit Breaker Pattern Implementation
 * 
 * Protects external dependencies from cascading failures:
 * - Three states: CLOSED (normal), OPEN (failing), HALF_OPEN (testing recovery)
 * - Failure threshold and timeout configuration
 * - Automatic recovery testing
 * - Health metrics and monitoring
 * 
 * Week 9: Reliability & Error Handling
 */

const EventEmitter = require('events');

/**
 * Circuit breaker states
 */
const States = {
  CLOSED: 'CLOSED',       // Operating normally
  OPEN: 'OPEN',           // Failing, rejecting requests
  HALF_OPEN: 'HALF_OPEN'  // Testing if service recovered
};

/**
 * Circuit breaker configuration
 */
class CircuitBreakerConfig {
  constructor(options = {}) {
    // Failure threshold: open circuit after this many consecutive failures
    this.failureThreshold = options.failureThreshold || 5;
    
    // Success threshold: close circuit after this many consecutive successes in HALF_OPEN
    this.successThreshold = options.successThreshold || 2;
    
    // Open timeout: how long to wait before testing recovery (ms)
    this.openTimeoutMs = options.openTimeoutMs || 60000;
    
    // Request timeout: max time to wait for operation (ms)
    this.requestTimeoutMs = options.requestTimeoutMs || 30000;
    
    // Rolling window size for monitoring
    this.rollingWindowSize = options.rollingWindowSize || 10;
    
    // Percentage threshold for opening (alternative to consecutive failures)
    this.errorThresholdPercentage = options.errorThresholdPercentage || 50;
    
    // Minimum calls before evaluating percentage threshold
    this.volumeThreshold = options.volumeThreshold || 10;
  }
}

/**
 * Circuit breaker statistics
 */
class CircuitBreakerStats {
  constructor(rollingWindowSize) {
    this.totalCalls = 0;
    this.successfulCalls = 0;
    this.failedCalls = 0;
    this.rejectedCalls = 0;
    this.consecutiveFailures = 0;
    this.consecutiveSuccesses = 0;
    this.lastFailureTime = null;
    this.lastSuccessTime = null;
    this.stateChanges = [];
    
    // Rolling window for recent calls
    this.rollingWindow = [];
    this.rollingWindowSize = rollingWindowSize;
  }

  recordSuccess() {
    this.totalCalls++;
    this.successfulCalls++;
    this.consecutiveSuccesses++;
    this.consecutiveFailures = 0;
    this.lastSuccessTime = Date.now();
    this._addToRollingWindow(true);
  }

  recordFailure() {
    this.totalCalls++;
    this.failedCalls++;
    this.consecutiveFailures++;
    this.consecutiveSuccesses = 0;
    this.lastFailureTime = Date.now();
    this._addToRollingWindow(false);
  }

  recordRejection() {
    this.rejectedCalls++;
  }

  recordStateChange(oldState, newState, reason) {
    this.stateChanges.push({
      from: oldState,
      to: newState,
      reason,
      timestamp: new Date().toISOString()
    });
  }

  _addToRollingWindow(success) {
    this.rollingWindow.push(success);
    if (this.rollingWindow.length > this.rollingWindowSize) {
      this.rollingWindow.shift();
    }
  }

  getErrorPercentage() {
    if (this.rollingWindow.length === 0) return 0;
    const failures = this.rollingWindow.filter(s => !s).length;
    return (failures / this.rollingWindow.length) * 100;
  }

  toJSON() {
    return {
      totalCalls: this.totalCalls,
      successfulCalls: this.successfulCalls,
      failedCalls: this.failedCalls,
      rejectedCalls: this.rejectedCalls,
      consecutiveFailures: this.consecutiveFailures,
      consecutiveSuccesses: this.consecutiveSuccesses,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      errorPercentage: this.getErrorPercentage(),
      stateChanges: this.stateChanges
    };
  }

  reset() {
    this.consecutiveFailures = 0;
    this.consecutiveSuccesses = 0;
  }
}

/**
 * Main Circuit Breaker implementation
 */
class CircuitBreaker extends EventEmitter {
  constructor(name, config = null) {
    super();
    this.name = name;
    this.config = config || new CircuitBreakerConfig();
    this.state = States.CLOSED;
    this.stats = new CircuitBreakerStats(this.config.rollingWindowSize);
    this.openedAt = null;
    this.nextAttemptAt = null;
  }

  /**
   * Execute function with circuit breaker protection
   * 
   * @param {Function} fn - Async function to execute
   * @param {Object} context - Execution context
   * @returns {Promise} Result of function execution
   */
  async execute(fn, context = {}) {
    // Check if circuit is OPEN
    if (this.state === States.OPEN) {
      // Check if enough time has passed to attempt recovery
      const now = Date.now();
      if (now >= this.nextAttemptAt) {
        this._transitionTo(States.HALF_OPEN, 'Timeout expired, testing recovery');
      } else {
        this.stats.recordRejection();
        const waitTime = this.nextAttemptAt - now;
        const error = new Error(`Circuit breaker ${this.name} is OPEN. Retry in ${waitTime}ms`);
        error.code = 'CIRCUIT_OPEN';
        error.circuitState = this.state;
        error.stats = this.stats.toJSON();
        throw error;
      }
    }

    try {
      // Execute with timeout
      const result = await this._executeWithTimeout(fn, this.config.requestTimeoutMs, context);
      
      // Record success
      this._onSuccess();
      
      return {
        success: true,
        result,
        circuitBreaker: {
          name: this.name,
          state: this.state,
          stats: this.stats.toJSON()
        }
      };

    } catch (error) {
      // Record failure
      this._onFailure(error);
      throw error;
    }
  }

  /**
   * Handle successful execution
   */
  _onSuccess() {
    this.stats.recordSuccess();

    if (this.state === States.HALF_OPEN) {
      // In HALF_OPEN, check if we've had enough successes to close
      if (this.stats.consecutiveSuccesses >= this.config.successThreshold) {
        this._transitionTo(States.CLOSED, `${this.stats.consecutiveSuccesses} consecutive successes`);
        this.stats.reset();
      }
    }

    this.emit('success', { name: this.name, state: this.state });
  }

  /**
   * Handle failed execution
   */
  _onFailure(error) {
    this.stats.recordFailure();

    if (this.state === States.HALF_OPEN) {
      // In HALF_OPEN, any failure reopens the circuit
      this._transitionTo(States.OPEN, 'Failure during recovery test');
      this._scheduleNextAttempt();
    } else if (this.state === States.CLOSED) {
      // In CLOSED, check if we should open
      const shouldOpen = this._shouldOpen();
      if (shouldOpen.should) {
        this._transitionTo(States.OPEN, shouldOpen.reason);
        this._scheduleNextAttempt();
      }
    }

    this.emit('failure', { name: this.name, state: this.state, error });
  }

  /**
   * Determine if circuit should open based on failure criteria
   */
  _shouldOpen() {
    // Check consecutive failures threshold
    if (this.stats.consecutiveFailures >= this.config.failureThreshold) {
      return {
        should: true,
        reason: `${this.stats.consecutiveFailures} consecutive failures exceeded threshold ${this.config.failureThreshold}`
      };
    }

    // Check percentage threshold (if we have enough volume)
    if (this.stats.totalCalls >= this.config.volumeThreshold) {
      const errorPercentage = this.stats.getErrorPercentage();
      if (errorPercentage >= this.config.errorThresholdPercentage) {
        return {
          should: true,
          reason: `Error rate ${errorPercentage.toFixed(1)}% exceeded threshold ${this.config.errorThresholdPercentage}%`
        };
      }
    }

    return { should: false };
  }

  /**
   * Schedule next recovery attempt
   */
  _scheduleNextAttempt() {
    this.openedAt = Date.now();
    this.nextAttemptAt = this.openedAt + this.config.openTimeoutMs;
  }

  /**
   * Transition to new state
   */
  _transitionTo(newState, reason) {
    const oldState = this.state;
    this.state = newState;
    this.stats.recordStateChange(oldState, newState, reason);
    
    console.log(`[CircuitBreaker:${this.name}] ${oldState} -> ${newState}: ${reason}`);
    
    this.emit('stateChange', {
      name: this.name,
      oldState,
      newState,
      reason,
      stats: this.stats.toJSON()
    });
  }

  /**
   * Execute function with timeout
   */
  async _executeWithTimeout(fn, timeoutMs, context) {
    return new Promise(async (resolve, reject) => {
      const timer = setTimeout(() => {
        const error = new Error(`Circuit breaker timeout: ${timeoutMs}ms`);
        error.code = 'CIRCUIT_TIMEOUT';
        reject(error);
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
   * Get current state
   */
  getState() {
    return this.state;
  }

  /**
   * Get statistics
   */
  getStats() {
    return this.stats.toJSON();
  }

  /**
   * Force circuit to specific state (for testing)
   */
  forceState(state, reason = 'Manual override') {
    if (!Object.values(States).includes(state)) {
      throw new Error(`Invalid state: ${state}`);
    }
    this._transitionTo(state, reason);
    if (state === States.OPEN) {
      this._scheduleNextAttempt();
    }
  }

  /**
   * Reset circuit breaker
   */
  reset() {
    this._transitionTo(States.CLOSED, 'Manual reset');
    this.stats = new CircuitBreakerStats(this.config.rollingWindowSize);
    this.openedAt = null;
    this.nextAttemptAt = null;
  }
}

/**
 * Circuit Breaker Registry
 * Manages multiple circuit breakers for different services
 */
class CircuitBreakerRegistry {
  constructor() {
    this.breakers = new Map();
  }

  /**
   * Get or create circuit breaker for service
   */
  getOrCreate(name, config = null) {
    if (!this.breakers.has(name)) {
      const breaker = new CircuitBreaker(name, config);
      this.breakers.set(name, breaker);
    }
    return this.breakers.get(name);
  }

  /**
   * Get circuit breaker by name
   */
  get(name) {
    return this.breakers.get(name);
  }

  /**
   * Get all circuit breakers
   */
  getAll() {
    return Array.from(this.breakers.values());
  }

  /**
   * Get health summary of all circuit breakers
   */
  getHealthSummary() {
    const summary = {
      timestamp: new Date().toISOString(),
      breakers: []
    };

    for (const [name, breaker] of this.breakers) {
      summary.breakers.push({
        name,
        state: breaker.getState(),
        stats: breaker.getStats()
      });
    }

    return summary;
  }

  /**
   * Reset all circuit breakers
   */
  resetAll() {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
  }
}

/**
 * Predefined circuit breaker configurations
 */
const CircuitBreakerConfigs = {
  // KMS service - tolerate more failures, longer timeout
  KMS: new CircuitBreakerConfig({
    failureThreshold: 5,
    successThreshold: 2,
    openTimeoutMs: 60000,
    requestTimeoutMs: 30000,
    errorThresholdPercentage: 50,
    volumeThreshold: 10
  }),

  // Database - fast fail, short recovery time
  DATABASE: new CircuitBreakerConfig({
    failureThreshold: 3,
    successThreshold: 2,
    openTimeoutMs: 30000,
    requestTimeoutMs: 10000,
    errorThresholdPercentage: 40,
    volumeThreshold: 10
  }),

  // External API - conservative settings
  EXTERNAL_API: new CircuitBreakerConfig({
    failureThreshold: 5,
    successThreshold: 3,
    openTimeoutMs: 120000,
    requestTimeoutMs: 60000,
    errorThresholdPercentage: 60,
    volumeThreshold: 20
  }),

  // Critical service - aggressive protection
  CRITICAL: new CircuitBreakerConfig({
    failureThreshold: 2,
    successThreshold: 3,
    openTimeoutMs: 30000,
    requestTimeoutMs: 5000,
    errorThresholdPercentage: 30,
    volumeThreshold: 5
  })
};

module.exports = {
  CircuitBreaker,
  CircuitBreakerConfig,
  CircuitBreakerConfigs,
  CircuitBreakerRegistry,
  States
};
