/**
 * OpenTelemetry Tracer
 * 
 * Distributed tracing integration for Aureus Sentinel bridge.
 * Provides trace context propagation, span creation, and metrics export.
 * 
 * Features:
 * - Automatic trace context propagation
 * - Instrumentation for HTTP, async operations
 * - Span attributes for security events
 * - OTLP export to Jaeger/Grafana Tempo
 * - Custom metrics for approval rates, risk distribution
 * 
 * Note: OpenTelemetry dependencies are optional. If not installed,
 * telemetry will be disabled gracefully.
 */

// Try to load OpenTelemetry dependencies (optional)
let NodeSDK, getNodeAutoInstrumentations, OTLPTraceExporter, OTLPMetricExporter;
let PeriodicExportingMetricReader, Resource, SemanticResourceAttributes, trace, context, SpanStatusCode;
let telemetryAvailable = false;

try {
  NodeSDK = require('@opentelemetry/sdk-node').NodeSDK;
  getNodeAutoInstrumentations = require('@opentelemetry/auto-instrumentations-node').getNodeAutoInstrumentations;
  OTLPTraceExporter = require('@opentelemetry/exporter-trace-otlp-http').OTLPTraceExporter;
  OTLPMetricExporter = require('@opentelemetry/exporter-metrics-otlp-http').OTLPMetricExporter;
  PeriodicExportingMetricReader = require('@opentelemetry/sdk-metrics').PeriodicExportingMetricReader;
  Resource = require('@opentelemetry/resources').Resource;
  SemanticResourceAttributes = require('@opentelemetry/semantic-conventions').SemanticResourceAttributes;
  const otelApi = require('@opentelemetry/api');
  trace = otelApi.trace;
  context = otelApi.context;
  SpanStatusCode = otelApi.SpanStatusCode;
  telemetryAvailable = true;
} catch (error) {
  console.warn('[Telemetry] OpenTelemetry dependencies not installed. Tracing disabled.');
  console.warn('[Telemetry] To enable, run: npm install --save @opentelemetry/sdk-node @opentelemetry/auto-instrumentations-node @opentelemetry/exporter-trace-otlp-http @opentelemetry/exporter-metrics-otlp-http @opentelemetry/sdk-metrics @opentelemetry/resources @opentelemetry/semantic-conventions @opentelemetry/api');
}

class TelemetryManager {
  constructor(config = {}) {
    this.serviceName = config.serviceName || 'aureus-sentinel-bridge';
    this.enabled = config.enabled !== false && telemetryAvailable;
    this.otlpEndpoint = config.otlpEndpoint || 'http://localhost:4318';
    this.sampleRate = config.sampleRate || 1.0; // 1.0 = 100%
    
    this.sdk = null;
    this.tracer = null;
    this.initialized = false;
    
    if (!telemetryAvailable && config.enabled !== false) {
      console.warn('[Telemetry] Cannot enable telemetry: OpenTelemetry dependencies not installed');
    }
  }

  /**
   * Initialize OpenTelemetry SDK
   */
  async init() {
    if (this.initialized || !this.enabled) return;
    
    const resource = new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: this.serviceName,
      [SemanticResourceAttributes.SERVICE_VERSION]: '1.0.0',
      [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV || 'development'
    });

    const traceExporter = new OTLPTraceExporter({
      url: `${this.otlpEndpoint}/v1/traces`,
      headers: {},
    });

    const metricReader = new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({
        url: `${this.otlpEndpoint}/v1/metrics`,
        headers: {},
      }),
      exportIntervalMillis: 60000, // 1 minute
    });

    this.sdk = new NodeSDK({
      resource,
      traceExporter,
      metricReader,
      instrumentations: [
        getNodeAutoInstrumentations({
          '@opentelemetry/instrumentation-fs': { enabled: false }, // Too noisy
        }),
      ],
    });

    await this.sdk.start();
    this.tracer = trace.getTracer(this.serviceName, '1.0.0');
    this.initialized = true;
    
    console.log(`[Telemetry] OpenTelemetry initialized, sending traces to ${this.otlpEndpoint}`);
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    if (this.sdk) {
      await this.sdk.shutdown();
      console.log('[Telemetry] OpenTelemetry shutdown complete');
    }
  }

  /**
   * Get active tracer
   */
  getTracer() {
    return this.tracer;
  }

  /**
   * Create a new span for an operation
   * @param {string} name - Span name
   * @param {object} attributes - Span attributes
   * @param {function} fn - Async function to execute in span
   * @returns {Promise<any>} Result of fn
   */
  async traceOperation(name, attributes, fn) {
    if (!this.initialized || !this.tracer) {
      // If telemetry disabled, just execute function
      return await fn(null);
    }

    return await this.tracer.startActiveSpan(name, { attributes }, async (span) => {
      try {
        const result = await fn(span);
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        span.recordException(error);
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error.message,
        });
        throw error;
      } finally {
        span.end();
      }
    });
  }

  /**
   * Convenience methods for common operations
   */

  async traceIntentReceival(intent, fn) {
    return this.traceOperation('intent.receive', {
      'intent.id': intent.id,
      'intent.userId': intent.userId,
      'intent.channel': intent.channel,
      'intent.tool': intent.tool,
    }, fn);
  }

  async traceContextEnrichment(intentId, fn) {
    return this.traceOperation('context.enrich', {
      'intent.id': intentId,
    }, fn);
  }

  async traceRiskAssessment(intentId, fn) {
    return this.traceOperation('risk.assess', {
      'intent.id': intentId,
    }, fn);
  }

  async tracePlanGeneration(intentId, fn) {
    return this.traceOperation('plan.generate', {
      'intent.id': intentId,
    }, fn);
  }

  async traceApprovalDecision(planId, riskLevel, fn) {
    return this.traceOperation('approval.decide', {
      'plan.id': planId,
      'risk.level': riskLevel,
    }, fn);
  }

  async traceSignatureVerification(approvalId, fn) {
    return this.traceOperation('signature.verify', {
      'approval.id': approvalId,
    }, fn);
  }

  async traceMemoryStore(operation, fn) {
    return this.traceOperation('memory.store', {
      'memory.operation': operation,
    }, fn);
  }

  /**
   * Add custom attributes to current span
   */
  addSpanAttributes(attributes) {
    const activeSpan = trace.getActiveSpan();
    if (activeSpan) {
      Object.entries(attributes).forEach(([key, value]) => {
        activeSpan.setAttribute(key, value);
      });
    }
  }

  /**
   * Add an event to current span
   */
  addSpanEvent(name, attributes = {}) {
    const activeSpan = trace.getActiveSpan();
    if (activeSpan) {
      activeSpan.addEvent(name, attributes);
    }
  }

  /**
   * Record an exception in current span
   */
  recordException(error) {
    const activeSpan = trace.getActiveSpan();
    if (activeSpan) {
      activeSpan.recordException(error);
      activeSpan.setStatus({
        code: SpanStatusCode.ERROR,
        message: error.message,
      });
    }
  }
}

// Singleton instance
let telemetryManager = null;

/**
 * Initialize telemetry (call once at startup)
 */
async function initTelemetry(config) {
  if (!telemetryManager) {
    telemetryManager = new TelemetryManager(config);
    await telemetryManager.init();
  }
  return telemetryManager;
}

/**
 * Get telemetry manager instance
 */
function getTelemetry() {
  if (!telemetryManager) {
    console.warn('[Telemetry] Not initialized, creating disabled instance');
    telemetryManager = new TelemetryManager({ enabled: false });
  }
  return telemetryManager;
}

/**
 * Shutdown telemetry (call on process exit)
 */
async function shutdownTelemetry() {
  if (telemetryManager) {
    await telemetryManager.shutdown();
  }
}

module.exports = {
  TelemetryManager,
  initTelemetry,
  getTelemetry,
  shutdownTelemetry,
};
