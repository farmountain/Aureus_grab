/**
 * Graceful Degradation System
 * 
 * Provides fallback mechanisms when dependencies fail:
 * - Fallback strategies (cache, default values, reduced functionality)
 * - Service health tracking
 * - Automatic degradation mode activation
 * - Feature toggle based on dependency health
 * 
 * Week 9: Reliability & Error Handling
 */

const EventEmitter = require('events');

/**
 * Degradation modes
 */
const DegradationModes = {
  FULL: 'FULL',               // All features available
  PARTIAL: 'PARTIAL',         // Some features disabled
  MINIMAL: 'MINIMAL',         // Only critical features
  EMERGENCY: 'EMERGENCY'      // Survival mode
};

/**
 * Fallback strategies
 */
const FallbackStrategies = {
  CACHE: 'CACHE',           // Use cached data
  DEFAULT: 'DEFAULT',       // Use default/hardcoded values
  STUB: 'STUB',             // Use stub implementation
  SKIP: 'SKIP',             // Skip optional operation
  FAIL: 'FAIL'              // Fail fast (no fallback)
};

/**
 * Service health status
 */
class ServiceHealth {
  constructor(name) {
    this.name = name;
    this.isHealthy = true;
    this.lastCheckTime = Date.now();
    this.consecutiveFailures = 0;
    this.consecutiveSuccesses = 0;
    this.lastError = null;
    this.metadata = {};
  }

  markHealthy(metadata = {}) {
    this.isHealthy = true;
    this.lastCheckTime = Date.now();
    this.consecutiveSuccesses++;
    this.consecutiveFailures = 0;
    this.lastError = null;
    this.metadata = { ...this.metadata, ...metadata };
  }

  markUnhealthy(error, metadata = {}) {
    this.isHealthy = false;
    this.lastCheckTime = Date.now();
    this.consecutiveFailures++;
    this.consecutiveSuccesses = 0;
    this.lastError = error?.message || 'Unknown error';
    this.metadata = { ...this.metadata, ...metadata };
  }

  toJSON() {
    return {
      name: this.name,
      isHealthy: this.isHealthy,
      lastCheckTime: this.lastCheckTime,
      consecutiveFailures: this.consecutiveFailures,
      consecutiveSuccesses: this.consecutiveSuccesses,
      lastError: this.lastError,
      metadata: this.metadata
    };
  }
}

/**
 * Fallback configuration for a specific operation
 */
class FallbackConfig {
  constructor(options = {}) {
    this.strategy = options.strategy || FallbackStrategies.FAIL;
    this.cacheKey = options.cacheKey || null;
    this.cacheTTLSeconds = options.cacheTTLSeconds || 300;
    this.defaultValue = options.defaultValue || null;
    this.stubFunction = options.stubFunction || null;
    this.requiresService = options.requiresService || [];
    this.degradationMode = options.degradationMode || DegradationModes.FULL;
  }
}

/**
 * Main Graceful Degradation Manager
 */
class GracefulDegradationManager extends EventEmitter {
  constructor() {
    super();
    this.mode = DegradationModes.FULL;
    this.services = new Map();
    this.cache = new Map();
    this.fallbacks = new Map();
    
    // Configuration
    this.config = {
      healthCheckIntervalMs: 30000,
      unhealthyThreshold: 3,
      recoveryThreshold: 5,
      cacheEnabled: true
    };
    
    this._startHealthMonitoring();
  }

  /**
   * Register a service for health tracking
   */
  registerService(name, healthCheckFn = null) {
    if (!this.services.has(name)) {
      const health = new ServiceHealth(name);
      this.services.set(name, { health, healthCheckFn });
      console.log(`[Degradation] Registered service: ${name}`);
    }
  }

  /**
   * Register a fallback for an operation
   */
  registerFallback(operationName, config) {
    this.fallbacks.set(operationName, new FallbackConfig(config));
    console.log(`[Degradation] Registered fallback for: ${operationName} (strategy: ${config.strategy})`);
  }

  /**
   * Execute operation with graceful degradation
   */
  async execute(operationName, primaryFn, context = {}) {
    const fallback = this.fallbacks.get(operationName);
    
    if (!fallback) {
      // No fallback configured, execute normally
      return await primaryFn(context);
    }

    // Check if required services are healthy
    const servicesHealthy = this._checkRequiredServices(fallback.requiresService);
    
    // Check if operation is allowed in current degradation mode
    const allowed = this._isOperationAllowed(fallback.degradationMode);
    
    if (!servicesHealthy || !allowed) {
      // Use fallback
      return await this._executeFallback(operationName, fallback, context);
    }

    try {
      // Try primary operation
      const result = await primaryFn(context);
      
      // Cache successful result if configured
      if (this.config.cacheEnabled && fallback.cacheKey) {
        this._cacheSet(fallback.cacheKey, result, fallback.cacheTTLSeconds);
      }
      
      // Mark services as healthy
      for (const serviceName of fallback.requiresService) {
        this._updateServiceHealth(serviceName, true);
      }
      
      return result;
      
    } catch (error) {
      console.log(`[Degradation] Primary operation failed (${operationName}): ${error.message}`);
      
      // Mark services as unhealthy
      for (const serviceName of fallback.requiresService) {
        this._updateServiceHealth(serviceName, false, error);
      }
      
      // Try fallback
      return await this._executeFallback(operationName, fallback, context, error);
    }
  }

  /**
   * Execute fallback strategy
   */
  async _executeFallback(operationName, fallback, context, primaryError = null) {
    console.log(`[Degradation] Executing fallback for ${operationName} (strategy: ${fallback.strategy})`);
    
    this.emit('fallback', {
      operation: operationName,
      strategy: fallback.strategy,
      mode: this.mode,
      error: primaryError
    });

    switch (fallback.strategy) {
      case FallbackStrategies.CACHE:
        return this._fallbackCache(fallback.cacheKey, fallback.defaultValue);
        
      case FallbackStrategies.DEFAULT:
        return this._fallbackDefault(fallback.defaultValue);
        
      case FallbackStrategies.STUB:
        return this._fallbackStub(fallback.stubFunction, context);
        
      case FallbackStrategies.SKIP:
        return this._fallbackSkip();
        
      case FallbackStrategies.FAIL:
      default:
        throw primaryError || new Error(`Operation ${operationName} not available in degraded mode`);
    }
  }

  /**
   * Fallback: Use cached data
   */
  _fallbackCache(cacheKey, defaultValue) {
    if (!cacheKey) {
      throw new Error('Cache key not configured');
    }
    
    const cached = this._cacheGet(cacheKey);
    if (cached !== null) {
      console.log(`[Degradation] Using cached value for key: ${cacheKey}`);
      return { value: cached, source: 'cache' };
    }
    
    if (defaultValue !== null) {
      console.log(`[Degradation] Cache miss, using default value`);
      return { value: defaultValue, source: 'default' };
    }
    
    throw new Error('No cached value and no default value available');
  }

  /**
   * Fallback: Use default value
   */
  _fallbackDefault(defaultValue) {
    if (defaultValue === null) {
      throw new Error('No default value configured');
    }
    console.log(`[Degradation] Using default value`);
    return { value: defaultValue, source: 'default' };
  }

  /**
   * Fallback: Use stub function
   */
  async _fallbackStub(stubFunction, context) {
    if (!stubFunction) {
      throw new Error('No stub function configured');
    }
    console.log(`[Degradation] Using stub implementation`);
    const result = await stubFunction(context);
    return { value: result, source: 'stub' };
  }

  /**
   * Fallback: Skip operation
   */
  _fallbackSkip() {
    console.log(`[Degradation] Skipping optional operation`);
    return { skipped: true, source: 'skip' };
  }

  /**
   * Cache operations
   */
  _cacheSet(key, value, ttlSeconds) {
    const expiresAt = Date.now() + (ttlSeconds * 1000);
    this.cache.set(key, { value, expiresAt });
  }

  _cacheGet(key) {
    const cached = this.cache.get(key);
    if (!cached) return null;
    
    if (Date.now() > cached.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    
    return cached.value;
  }

  /**
   * Check if required services are healthy
   */
  _checkRequiredServices(serviceNames) {
    for (const name of serviceNames) {
      const service = this.services.get(name);
      if (!service || !service.health.isHealthy) {
        return false;
      }
    }
    return true;
  }

  /**
   * Check if operation is allowed in current degradation mode
   */
  _isOperationAllowed(requiredMode) {
    const modeOrder = [
      DegradationModes.FULL,
      DegradationModes.PARTIAL,
      DegradationModes.MINIMAL,
      DegradationModes.EMERGENCY
    ];
    
    const currentModeIndex = modeOrder.indexOf(this.mode);
    const requiredModeIndex = modeOrder.indexOf(requiredMode);
    
    // Operation is allowed if current mode is equal or better than required mode
    return currentModeIndex <= requiredModeIndex;
  }

  /**
   * Update service health
   */
  _updateServiceHealth(serviceName, isHealthy, error = null) {
    const service = this.services.get(serviceName);
    if (!service) return;
    
    if (isHealthy) {
      service.health.markHealthy();
      
      // Check if we should improve degradation mode
      if (service.health.consecutiveSuccesses >= this.config.recoveryThreshold) {
        this._evaluateDegradationMode();
      }
    } else {
      service.health.markUnhealthy(error);
      
      // Check if we should worsen degradation mode
      if (service.health.consecutiveFailures >= this.config.unhealthyThreshold) {
        this._evaluateDegradationMode();
      }
    }
  }

  /**
   * Evaluate and update degradation mode based on service health
   */
  _evaluateDegradationMode() {
    const healthyServices = Array.from(this.services.values())
      .filter(s => s.health.isHealthy).length;
    const totalServices = this.services.size;
    
    if (totalServices === 0) {
      return;
    }
    
    const healthPercentage = (healthyServices / totalServices) * 100;
    let newMode = this.mode;
    
    if (healthPercentage >= 90) {
      newMode = DegradationModes.FULL;
    } else if (healthPercentage >= 70) {
      newMode = DegradationModes.PARTIAL;
    } else if (healthPercentage >= 40) {
      newMode = DegradationModes.MINIMAL;
    } else {
      newMode = DegradationModes.EMERGENCY;
    }
    
    if (newMode !== this.mode) {
      this._setDegradationMode(newMode, `Service health: ${healthPercentage.toFixed(1)}%`);
    }
  }

  /**
   * Set degradation mode
   */
  _setDegradationMode(mode, reason) {
    const oldMode = this.mode;
    this.mode = mode;
    
    console.log(`[Degradation] Mode change: ${oldMode} -> ${mode} (${reason})`);
    
    this.emit('modeChange', {
      oldMode,
      newMode: mode,
      reason,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Manual degradation mode override
   */
  setMode(mode, reason = 'Manual override') {
    if (!Object.values(DegradationModes).includes(mode)) {
      throw new Error(`Invalid degradation mode: ${mode}`);
    }
    this._setDegradationMode(mode, reason);
  }

  /**
   * Start health monitoring
   */
  _startHealthMonitoring() {
    setInterval(() => {
      this._performHealthChecks();
    }, this.config.healthCheckIntervalMs);
  }

  /**
   * Perform health checks on all services
   */
  async _performHealthChecks() {
    for (const [name, service] of this.services) {
      if (service.healthCheckFn) {
        try {
          await service.healthCheckFn();
          this._updateServiceHealth(name, true);
        } catch (error) {
          this._updateServiceHealth(name, false, error);
        }
      }
    }
  }

  /**
   * Get current status
   */
  getStatus() {
    const services = {};
    for (const [name, service] of this.services) {
      services[name] = service.health.toJSON();
    }
    
    return {
      mode: this.mode,
      services,
      cacheSize: this.cache.size,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Force service health status (for testing)
   */
  forceServiceHealth(serviceName, isHealthy, error = null) {
    this._updateServiceHealth(serviceName, isHealthy, error);
  }

  /**
   * Reset all services to healthy
   */
  reset() {
    for (const [name, service] of this.services) {
      service.health.markHealthy();
    }
    this.cache.clear();
    this._setDegradationMode(DegradationModes.FULL, 'Manual reset');
  }
}

module.exports = {
  GracefulDegradationManager,
  DegradationModes,
  FallbackStrategies,
  FallbackConfig,
  ServiceHealth
};
