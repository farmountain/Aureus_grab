/**
 * Fault Injection & Chaos Engineering Framework
 * 
 * Tools for testing system resilience through controlled failures:
 * - Network failures (latency, packet loss, timeouts)
 * - Service failures (errors, crashes, unavailability)
 * - Resource exhaustion (memory, CPU, connections)
 * - Cascading failures
 * - Automated chaos experiments
 * 
 * Week 9: Reliability & Error Handling
 */

const EventEmitter = require('events');

/**
 * Fault types
 */
const FaultTypes = {
  LATENCY: 'LATENCY',           // Add artificial delay
  ERROR: 'ERROR',               // Throw error
  TIMEOUT: 'TIMEOUT',           // Simulate timeout
  CRASH: 'CRASH',               // Simulated crash
  THROTTLE: 'THROTTLE',         // Rate limiting
  PARTIAL: 'PARTIAL',           // Partial failure/corruption
  UNAVAILABLE: 'UNAVAILABLE'    // Service unavailable
};

/**
 * Fault injection configuration
 */
class FaultConfig {
  constructor(options = {}) {
    this.type = options.type || FaultTypes.ERROR;
    this.probability = options.probability !== undefined ? options.probability : 1.0;  // 0.0 to 1.0
    this.enabled = options.enabled !== false;
    
    // Type-specific config
    this.latencyMs = options.latencyMs || 1000;
    this.errorMessage = options.errorMessage || 'Injected fault';
    this.errorCode = options.errorCode || 'FAULT_INJECTION';
    this.statusCode = options.statusCode || 500;
    this.throttleRateMs = options.throttleRateMs || 1000;
    this.corruptionRate = options.corruptionRate || 0.5;
  }

  shouldInject() {
    return this.enabled && Math.random() < this.probability;
  }
}

/**
 * Fault injection point
 */
class FaultInjectionPoint {
  constructor(name, config = null) {
    this.name = name;
    this.config = config || new FaultConfig({ enabled: false });
    this.stats = {
      totalCalls: 0,
      faultsInjected: 0,
      lastInjectionTime: null
    };
  }

  /**
   * maybe inject a fault
   */
  async maybeInject() {
    this.stats.totalCalls++;

    if (this.config.shouldInject()) {
      this.stats.faultsInjected++;
      this.stats.lastInjectionTime = Date.now();
      
      console.log(`[FaultInjection:${this.name}] Injecting ${this.config.type} fault`);
      
      await this._injectFault();
    }
  }

  /**
   * Inject specific fault type
   */
  async _injectFault() {
    switch (this.config.type) {
      case FaultTypes.LATENCY:
        await this._injectLatency();
        break;
        
      case FaultTypes.ERROR:
        this._injectError();
        break;
        
      case FaultTypes.TIMEOUT:
        await this._injectTimeout();
        break;
        
      case FaultTypes.CRASH:
        this._injectCrash();
        break;
        
      case FaultTypes.THROTTLE:
        await this._injectThrottle();
        break;
        
      case FaultTypes.UNAVAILABLE:
        this._injectUnavailable();
        break;
        
      default:
        console.warn(`Unknown fault type: ${this.config.type}`);
    }
  }

  /**
   * Inject artificial latency
   */
  async _injectLatency() {
    const delay = this.config.latencyMs;
    console.log(`[FaultInjection:${this.name}] Adding ${delay}ms latency`);
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  /**
   * Throw an error
   */
  _injectError() {
    const error = new Error(this.config.errorMessage);
    error.code = this.config.errorCode;
    error.statusCode = this.config.statusCode;
    error.injected = true;
    throw error;
  }

  /**
   * Simulate timeout
   */
  async _injectTimeout() {
    const delay = this.config.latencyMs;
    await new Promise(resolve => setTimeout(resolve, delay));
    const error = new Error('Operation timeout');
    error.code = 'ETIMEDOUT';
    error.injected = true;
    throw error;
  }

  /**
   * Simulate crash
   */
  _injectCrash() {
    const error = new Error('Service crashed');
    error.code = 'SERVICE_CRASHED';
    error.fatal = true;
    error.injected = true;
    throw error;
  }

  /**
   * Simulate throttling
   */
  async _injectThrottle() {
    await new Promise(resolve => setTimeout(resolve, this.config.throttleRateMs));
    const error = new Error('Rate limit exceeded');
    error.code = 'RATE_LIMIT_EXCEEDED';
    error.statusCode = 429;
    error.injected = true;
    throw error;
  }

  /**
   * Simulate service unavailable
   */
  _injectUnavailable() {
    const error = new Error('Service unavailable');
    error.code = 'SERVICE_UNAVAILABLE';
    error.statusCode = 503;
    error.injected = true;
    throw error;
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      name: this.name,
      ...this.stats,
      injectionRate: this.stats.totalCalls > 0 
        ? (this.stats.faultsInjected / this.stats.totalCalls * 100).toFixed(2) + '%'
        : '0%'
    };
  }

  /**
   * Update configuration
   */
  setConfig(config) {
    this.config = new FaultConfig(config);
  }

  /**
   * Enable/disable fault injection
   */
  setEnabled(enabled) {
    this.config.enabled = enabled;
  }
}

/**
 * Chaos Experiment definition
 */
class ChaosExperiment {
  constructor(options) {
    this.name = options.name;
    this.description = options.description || '';
    this.hypothesis = options.hypothesis || '';
    this.faults = options.faults || [];
    this.durationMs = options.durationMs || 60000;
    this.steadyStateCheck = options.steadyStateCheck || (() => true);
    this.abortOnSteadyStateFail = options.abortOnSteadyStateFail !== false;
  }

  /**
   * Run experiment
   */
  async run() {
    const results = {
      name: this.name,
      startTime: new Date().toISOString(),
      endTime: null,
      durationMs: 0,
      hypothesis: this.hypothesis,
      steadyStateBeforeExperiment: false,
      steadyStateAfterExperiment: false,
      faultsInjected: [],
      success: false,
      error: null
    };

    const startTime = Date.now();

    try {
      // Check steady state before experiment
      console.log(`[ChaosExperiment:${this.name}] Checking initial steady state...`);
      results.steadyStateBeforeExperiment = await this.steadyStateCheck();
      
      if (!results.steadyStateBeforeExperiment && this.abortOnSteadyStateFail) {
        throw new Error('System not in steady state before experiment');
      }

      // Enable fault injection
      console.log(`[ChaosExperiment:${this.name}] Injecting faults for ${this.durationMs}ms...`);
      for (const fault of this.faults) {
        fault.setEnabled(true);
        results.faultsInjected.push({
          name: fault.name,
          type: fault.config.type,
          probability: fault.config.probability
        });
      }

      // Wait for experiment duration
      await this._sleep(this.durationMs);

      // Disable fault injection
      for (const fault of this.faults) {
        fault.setEnabled(false);
      }

      // Check steady state after experiment
      console.log(`[ChaosExperiment:${this.name}] Checking final steady state...`);
      results.steadyStateAfterExperiment = await this.steadyStateCheck();

      results.success = results.steadyStateAfterExperiment;
      
    } catch (error) {
      results.error = error.message;
      results.success = false;
    } finally {
      // Ensure faults are disabled
      for (const fault of this.faults) {
        fault.setEnabled(false);
      }
    }

    results.endTime = new Date().toISOString();
    results.durationMs = Date.now() - startTime;

    return results;
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Main Chaos Engineering Framework
 */
class ChaosFramework extends EventEmitter {
  constructor() {
    super();
    this.injectionPoints = new Map();
    this.experiments = [];
  }

  /**
   * Register fault injection point
   */
  registerInjectionPoint(name, config = null) {
    if (!this.injectionPoints.has(name)) {
      const point = new FaultInjectionPoint(name, config);
      this.injectionPoints.set(name, point);
      console.log(`[ChaosFramework] Registered injection point: ${name}`);
    }
    return this.injectionPoints.get(name);
  }

  /**
   * Get injection point
   */
  getInjectionPoint(name) {
    return this.injectionPoints.get(name);
  }

  /**
   * Execute function with potential fault injection
   */
  async executeWithFaultInjection(injectionPointName, fn, context = {}) {
    const point = this.injectionPoints.get(injectionPointName);
    
    if (point) {
      // Check if we should inject a fault
      await point.maybeInject();
    }
    
    // Execute actual function
    return await fn(context);
  }

  /**
   * Register chaos experiment
   */
  registerExperiment(config) {
    const experiment = new ChaosExperiment(config);
    this.experiments.push(experiment);
    return experiment;
  }

  /**
   * Run specific experiment
   */
  async runExperiment(experimentName) {
    const experiment = this.experiments.find(e => e.name === experimentName);
    if (!experiment) {
      throw new Error(`Experiment not found: ${experimentName}`);
    }

    console.log(`[ChaosFramework] Running experiment: ${experimentName}`);
    const results = await experiment.run();
    
    this.emit('experimentComplete', results);
    
    return results;
  }

  /**
   * Run all experiments
   */
  async runAllExperiments() {
    const results = [];
    
    for (const experiment of this.experiments) {
      const result = await experiment.run();
      results.push(result);
      
      // Wait between experiments
      await this._sleep(5000);
    }
    
    return results;
  }

  /**
   * Get statistics for all injection points
   */
  getStats() {
    const stats = {
      injectionPoints: [],
      experiments: this.experiments.length
    };

    for (const [name, point] of this.injectionPoints) {
      stats.injectionPoints.push(point.getStats());
    }

    return stats;
  }

  /**
   * Configure injection point
   */
  configureInjectionPoint(name, config) {
    const point = this.injectionPoints.get(name);
    if (point) {
      point.setConfig(config);
    }
  }

  /**
   * Enable/disable all fault injection
   */
  setGlobalEnabled(enabled) {
    for (const point of this.injectionPoints.values()) {
      point.setEnabled(enabled);
    }
    console.log(`[ChaosFramework] Global fault injection ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Reset all statistics
   */
  resetStats() {
    for (const point of this.injectionPoints.values()) {
      point.stats = {
        totalCalls: 0,
        faultsInjected: 0,
        lastInjectionTime: null
      };
    }
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Helper: Create fault-injected wrapper for a function
 */
function withFaultInjection(framework, injectionPointName, fn) {
  return async function(...args) {
    return await framework.executeWithFaultInjection(
      injectionPointName,
      () => fn(...args)
    );
  };
}

// Global chaos framework instance
const globalChaosFramework = new ChaosFramework();

module.exports = {
  ChaosFramework,
  ChaosExperiment,
  FaultInjectionPoint,
  FaultConfig,
  FaultTypes,
  withFaultInjection,
  globalChaosFramework
};
