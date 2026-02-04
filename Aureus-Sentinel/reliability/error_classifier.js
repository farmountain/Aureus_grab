/**
 * Error Classification Framework
 * 
 * Provides error taxonomy and classification:
 * - Error categories: Transient, Permanent, Recoverable
 * - Automated error classification
 * - Recovery strategy recommendations
 * - Error aggregation and analysis
 * 
 * Week 9: Reliability & Error Handling
 */

/**
 * Error categories
 */
const ErrorCategories = {
  TRANSIENT: 'TRANSIENT',         // Temporary, may succeed on retry
  PERMANENT: 'PERMANENT',         // Won't succeed without intervention
  RECOVERABLE: 'RECOVERABLE',     // Can recover with fallback
  FATAL: 'FATAL'                  // System cannot continue
};

/**
 * Error severity levels
 */
const ErrorSeverity = {
  LOW: 'LOW',           // Minor issue, no user impact
  MEDIUM: 'MEDIUM',     // Some degradation
  HIGH: 'HIGH',         // Significant impact
  CRITICAL: 'CRITICAL'  // System failure
};

/**
 * Recovery strategies
 */
const RecoveryStrategies = {
  RETRY: 'RETRY',
  FALLBACK: 'FALLBACK',
  DEGRADE: 'DEGRADE',
  FAIL_FAST: 'FAIL_FAST',
  ESCALATE: 'ESCALATE'
};

/**
 * Classified error with metadata
 */
class ClassifiedError extends Error {
  constructor(originalError, classification) {
    super(originalError.message);
    this.name = 'ClassifiedError';
    this.originalError = originalError;
    this.category = classification.category;
    this.severity = classification.severity;
    this.recoveryStrategy = classification.recoveryStrategy;
    this.metadata = classification.metadata || {};
    this.timestamp = new Date().toISOString();
    this.stack = originalError.stack;
  }

  toJSON() {
    return {
      message: this.message,
      category: this.category,
      severity: this.severity,
      recoveryStrategy: this.recoveryStrategy,
      metadata: this.metadata,
      timestamp: this.timestamp,
      originalError: {
        name: this.originalError.name,
        message: this.originalError.message,
        code: this.originalError.code,
        statusCode: this.originalError.statusCode
      }
    };
  }
}

/**
 * Error classification rules
 */
class ErrorClassificationRule {
  constructor(options) {
    this.name = options.name;
    this.matcher = options.matcher;  // Function to test if rule applies
    this.category = options.category;
    this.severity = options.severity;
    this.recoveryStrategy = options.recoveryStrategy;
    this.metadata = options.metadata || {};
  }

  matches(error) {
    try {
      return this.matcher(error);
    } catch (e) {
      return false;
    }
  }

  classify() {
    return {
      category: this.category,
      severity: this.severity,
      recoveryStrategy: this.recoveryStrategy,
      metadata: this.metadata
    };
  }
}

/**
 * Main Error Classification Engine
 */
class ErrorClassifier {
  constructor() {
    this.rules = [];
    this._registerDefaultRules();
  }

  /**
   * Register default classification rules
   */
  _registerDefaultRules() {
    // Network timeout errors
    this.addRule({
      name: 'network_timeout',
      matcher: (err) => {
        return err.code === 'ETIMEDOUT' || 
               err.code === 'ESOCKETTIMEDOUT' ||
               err.message?.toLowerCase().includes('timeout');
      },
      category: ErrorCategories.TRANSIENT,
      severity: ErrorSeverity.MEDIUM,
      recoveryStrategy: RecoveryStrategies.RETRY,
      metadata: { retryable: true, maxRetries: 3 }
    });

    // Connection errors
    this.addRule({
      name: 'connection_error',
      matcher: (err) => {
        return err.code === 'ECONNRESET' || 
               err.code === 'ECONNREFUSED' ||
               err.code === 'ENOTFOUND' ||
               err.code === 'EAI_AGAIN';
      },
      category: ErrorCategories.TRANSIENT,
      severity: ErrorSeverity.HIGH,
      recoveryStrategy: RecoveryStrategies.RETRY,
      metadata: { retryable: true, maxRetries: 3, backoff: true }
    });

    // Rate limiting
    this.addRule({
      name: 'rate_limit',
      matcher: (err) => {
        return err.statusCode === 429 ||
               err.code === 'RATE_LIMIT_EXCEEDED' ||
               err.message?.toLowerCase().includes('rate limit');
      },
      category: ErrorCategories.TRANSIENT,
      severity: ErrorSeverity.MEDIUM,
      recoveryStrategy: RecoveryStrategies.RETRY,
      metadata: { retryable: true, maxRetries: 5, backoff: true, exponential: true }
    });

    // Server errors (5xx)
    this.addRule({
      name: 'server_error',
      matcher: (err) => {
        return err.statusCode >= 500 && err.statusCode < 600;
      },
      category: ErrorCategories.TRANSIENT,
      severity: ErrorSeverity.HIGH,
      recoveryStrategy: RecoveryStrategies.RETRY,
      metadata: { retryable: true, maxRetries: 3 }
    });

    // Authentication errors
    this.addRule({
      name: 'authentication_error',
      matcher: (err) => {
        return err.statusCode === 401 ||
               err.code === 'UNAUTHORIZED' ||
               err.message?.toLowerCase().includes('unauthorized') ||
               err.message?.toLowerCase().includes('authentication');
      },
      category: ErrorCategories.PERMANENT,
      severity: ErrorSeverity.CRITICAL,
      recoveryStrategy: RecoveryStrategies.ESCALATE,
      metadata: { retryable: false, requiresIntervention: true }
    });

    // Authorization errors
    this.addRule({
      name: 'authorization_error',
      matcher: (err) => {
        return err.statusCode === 403 ||
               err.code === 'FORBIDDEN' ||
               err.message?.toLowerCase().includes('forbidden') ||
               err.message?.toLowerCase().includes('permission denied');
      },
      category: ErrorCategories.PERMANENT,
      severity: ErrorSeverity.HIGH,
      recoveryStrategy: RecoveryStrategies.FAIL_FAST,
      metadata: { retryable: false, requiresIntervention: true }
    });

    // Validation errors
    this.addRule({
      name: 'validation_error',
      matcher: (err) => {
        return err.statusCode === 400 ||
               err.code === 'VALIDATION_ERROR' ||
               err.code === 'INVALID_INPUT' ||
               err.message?.toLowerCase().includes('validation') ||
               err.message?.toLowerCase().includes('invalid');
      },
      category: ErrorCategories.PERMANENT,
      severity: ErrorSeverity.LOW,
      recoveryStrategy: RecoveryStrategies.FAIL_FAST,
      metadata: { retryable: false, fixInput: true }
    });

    // Resource not found
    this.addRule({
      name: 'not_found',
      matcher: (err) => {
        return err.statusCode === 404 ||
               err.code === 'NOT_FOUND' ||
               err.code === 'ENOENT';
      },
      category: ErrorCategories.PERMANENT,
      severity: ErrorSeverity.MEDIUM,
      recoveryStrategy: RecoveryStrategies.FALLBACK,
      metadata: { retryable: false, useFallback: true }
    });

    // Circuit breaker open
    this.addRule({
      name: 'circuit_open',
      matcher: (err) => {
        return err.code === 'CIRCUIT_OPEN' ||
               err.message?.includes('circuit breaker');
      },
      category: ErrorCategories.RECOVERABLE,
      severity: ErrorSeverity.HIGH,
      recoveryStrategy: RecoveryStrategies.FALLBACK,
      metadata: { retryable: false, useFallback: true, waitForRecovery: true }
    });

    // Service unavailable
    this.addRule({
      name: 'service_unavailable',
      matcher: (err) => {
        return err.statusCode === 503 ||
               err.code === 'SERVICE_UNAVAILABLE' ||
               err.message?.toLowerCase().includes('service unavailable');
      },
      category: ErrorCategories.TRANSIENT,
      severity: ErrorSeverity.HIGH,
      recoveryStrategy: RecoveryStrategies.RETRY,
      metadata: { retryable: true, maxRetries: 5, backoff: true }
    });

    // KMS specific errors
    this.addRule({
      name: 'kms_throttling',
      matcher: (err) => {
        return err.code === 'ThrottlingException' ||
               err.code === 'TooManyRequestsException';
      },
      category: ErrorCategories.TRANSIENT,
      severity: ErrorSeverity.MEDIUM,
      recoveryStrategy: RecoveryStrategies.RETRY,
      metadata: { retryable: true, maxRetries: 5, backoff: true, exponential: true }
    });

    this.addRule({
      name: 'kms_key_unavailable',
      matcher: (err) => {
        return err.code === 'KeyUnavailableException' ||
               err.message?.includes('key is unavailable');
      },
      category: ErrorCategories.RECOVERABLE,
      severity: ErrorSeverity.CRITICAL,
      recoveryStrategy: RecoveryStrategies.FALLBACK,
      metadata: { retryable: false, useFallback: true, alert: true }
    });

    // Out of memory
    this.addRule({
      name: 'out_of_memory',
      matcher: (err) => {
        return err.code === 'ERR_OUT_OF_MEMORY' ||
               err.message?.toLowerCase().includes('out of memory');
      },
      category: ErrorCategories.FATAL,
      severity: ErrorSeverity.CRITICAL,
      recoveryStrategy: RecoveryStrategies.ESCALATE,
      metadata: { retryable: false, requiresRestart: true }
    });

    // Database errors
    this.addRule({
      name: 'database_connection',
      matcher: (err) => {
        return err.code === 'ECONNREFUSED' ||
               err.message?.toLowerCase().includes('database') ||
               err.message?.toLowerCase().includes('connection pool');
      },
      category: ErrorCategories.TRANSIENT,
      severity: ErrorSeverity.HIGH,
      recoveryStrategy: RecoveryStrategies.RETRY,
      metadata: { retryable: true, maxRetries: 3, backoff: true }
    });

    this.addRule({
      name: 'database_deadlock',
      matcher: (err) => {
        return err.code === 'DEADLOCK' ||
               err.message?.toLowerCase().includes('deadlock');
      },
      category: ErrorCategories.TRANSIENT,
      severity: ErrorSeverity.MEDIUM,
      recoveryStrategy: RecoveryStrategies.RETRY,
      metadata: { retryable: true, maxRetries: 3, immediate: true }
    });
  }

  /**
   * Add custom classification rule
   */
  addRule(options) {
    const rule = new ErrorClassificationRule(options);
    this.rules.push(rule);
    return rule;
  }

  /**
   * Classify an error
   */
  classify(error) {
    if (!error) {
      return {
        category: ErrorCategories.PERMANENT,
        severity: ErrorSeverity.LOW,
        recoveryStrategy: RecoveryStrategies.FAIL_FAST,
        metadata: { reason: 'null_error' }
      };
    }

    // Find first matching rule
    for (const rule of this.rules) {
      if (rule.matches(error)) {
        const classification = rule.classify();
        classification.matchedRule = rule.name;
        return classification;
      }
    }

    // Default classification for unmatched errors
    return {
      category: ErrorCategories.PERMANENT,
      severity: ErrorSeverity.MEDIUM,
      recoveryStrategy: RecoveryStrategies.FAIL_FAST,
      metadata: { 
        reason: 'no_rule_matched',
        errorCode: error.code,
        statusCode: error.statusCode
      }
    };
  }

  /**
   * Classify and wrap error
   */
  classifyError(error) {
    const classification = this.classify(error);
    return new ClassifiedError(error, classification);
  }

  /**
   * Check if error is retryable
   */
  isRetryable(error) {
    const classification = this.classify(error);
    return classification.category === ErrorCategories.TRANSIENT ||
           (classification.metadata.retryable === true);
  }

  /**
   * Get recommended retry count
   */
  getRecommendedRetries(error) {
    const classification = this.classify(error);
    return classification.metadata.maxRetries || 0;
  }

  /**
   * Get all rules
   */
  getRules() {
    return this.rules.map(rule => ({
      name: rule.name,
      category: rule.category,
      severity: rule.severity,
      recoveryStrategy: rule.recoveryStrategy
    }));
  }
}

/**
 * Error aggregation for analysis
 */
class ErrorAggregator {
  constructor() {
    this.errors = [];
    this.categories = new Map();
    this.severities = new Map();
    this.strategies = new Map();
  }

  /**
   * Record classified error
   */
  record(classifiedError) {
    this.errors.push({
      timestamp: classifiedError.timestamp,
      category: classifiedError.category,
      severity: classifiedError.severity,
      message: classifiedError.message
    });

    // Update category counts
    this.categories.set(
      classifiedError.category,
      (this.categories.get(classifiedError.category) || 0) + 1
    );

    // Update severity counts
    this.severities.set(
      classifiedError.severity,
      (this.severities.get(classifiedError.severity) || 0) + 1
    );

    // Update strategy counts
    this.strategies.set(
      classifiedError.recoveryStrategy,
      (this.strategies.get(classifiedError.recoveryStrategy) || 0) + 1
    );
  }

  /**
   * Get aggregated statistics
   */
  getStats() {
    return {
      totalErrors: this.errors.length,
      byCategory: Object.fromEntries(this.categories),
      bySeverity: Object.fromEntries(this.severities),
      byStrategy: Object.fromEntries(this.strategies),
      recentErrors: this.errors.slice(-10)
    };
  }

  /**
   * Clear statistics
   */
  clear() {
    this.errors = [];
    this.categories.clear();
    this.severities.clear();
    this.strategies.clear();
  }
}

// Global error classifier instance
const globalClassifier = new ErrorClassifier();

module.exports = {
  ErrorClassifier,
  ClassifiedError,
  ErrorAggregator,
  ErrorCategories,
  ErrorSeverity,
  RecoveryStrategies,
  globalClassifier
};
