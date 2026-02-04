/**
 * Comprehensive example demonstrating OpenTelemetry and Prometheus exporters
 * with configurable sinks and correlation IDs
 */

import {
  TelemetryCollector,
  SinkManager,
  TelemetryEventType,
  MetricsAggregator,
} from '../src';

/**
 * Example 1: Basic OpenTelemetry Integration
 */
async function exampleOpenTelemetry() {
  console.log('\n=== Example 1: OpenTelemetry Integration ===\n');

  const sinkManager = new SinkManager();

  // Configure OpenTelemetry sink
  sinkManager.addSink('otlp', {
    type: 'opentelemetry',
    enabled: true,
    options: {
      endpoint: 'http://localhost:4318',
      protocol: 'http',
      serviceName: 'aureus-demo',
      serviceVersion: '1.0.0',
      headers: {
        // Optional: Add authentication
        // 'Authorization': 'Bearer YOUR_TOKEN',
      },
    },
  });

  // Create collector with correlation ID
  const telemetry = new TelemetryCollector(sinkManager, 'request-abc-123');

  // Record some events
  telemetry.recordStepStart('wf-demo-1', 'task-1', 'data-processing', {
    attempt: 1,
    riskTier: 'LOW',
  });

  // Simulate work
  await new Promise(resolve => setTimeout(resolve, 100));

  telemetry.recordStepEnd('wf-demo-1', 'task-1', 'data-processing', true, 100);

  telemetry.recordToolCall('wf-demo-1', 'task-1', 'database-query', {
    table: 'users',
    query: 'SELECT * FROM users',
  });

  console.log('✓ Events exported to OpenTelemetry');
  console.log('  View traces at: http://localhost:16686 (Jaeger UI)');

  await sinkManager.shutdown();
}

/**
 * Example 2: Prometheus Metrics Endpoint
 */
async function examplePrometheus() {
  console.log('\n=== Example 2: Prometheus Metrics ===\n');

  const sinkManager = new SinkManager();

  // Configure Prometheus sink
  sinkManager.addSink('prometheus', {
    type: 'prometheus',
    enabled: true,
    options: {
      port: 9090,
      path: '/metrics',
      prefix: 'aureus_demo',
      labels: {
        environment: 'development',
        service: 'example',
      },
    },
  });

  const telemetry = new TelemetryCollector(sinkManager);

  // Record various events
  for (let i = 0; i < 10; i++) {
    telemetry.recordStepStart(`wf-${i}`, `task-${i}`, 'processing');
    const duration = Math.random() * 200;
    const success = Math.random() > 0.2;

    await new Promise(resolve => setTimeout(resolve, 10));

    telemetry.recordStepEnd(`wf-${i}`, `task-${i}`, 'processing', success, duration);

    if (!success) {
      telemetry.recordRollback(`wf-${i}`, `task-${i}`, `snapshot-${i}`, 'Task failed');
    }

    // Record CRV check
    const passed = Math.random() > 0.3;
    telemetry.recordCRVResult(`wf-${i}`, `task-${i}`, 'data-validation', passed, !passed);

    // Record policy check
    const allowed = Math.random() > 0.2;
    const requiresApproval = !allowed || Math.random() > 0.7;
    telemetry.recordPolicyCheck(`wf-${i}`, `task-${i}`, allowed, requiresApproval);
  }

  console.log('✓ Metrics exported to Prometheus');
  console.log('  Metrics available at: http://localhost:9090/metrics');
  console.log('  Configure Prometheus to scrape this endpoint:');
  console.log(`
    scrape_configs:
      - job_name: 'aureus'
        static_configs:
          - targets: ['localhost:9090']
  `);

  // Keep server running for a moment
  await new Promise(resolve => setTimeout(resolve, 2000));

  await sinkManager.shutdown();
}

/**
 * Example 3: Multiple Sinks
 */
async function exampleMultipleSinks() {
  console.log('\n=== Example 3: Multiple Sinks ===\n');

  const sinkManager = new SinkManager();

  // Console for development
  sinkManager.addSink('console', {
    type: 'console',
    enabled: true,
    options: {
      pretty: true,
      colors: true,
    },
  });

  // File for audit logs
  sinkManager.addSink('file', {
    type: 'file',
    enabled: true,
    options: {
      path: '/tmp/aureus-telemetry.log',
    },
  });

  // OpenTelemetry for distributed tracing
  // Note: Commented out to avoid connection errors in demo
  // sinkManager.addSink('otlp', {
  //   type: 'opentelemetry',
  //   enabled: true,
  //   options: {
  //     endpoint: 'http://localhost:4318',
  //   },
  // });

  const telemetry = new TelemetryCollector(sinkManager, 'multi-sink-demo');

  console.log('Recording events to multiple sinks...\n');

  telemetry.recordStepStart('wf-multi', 'task-1', 'api-call', {
    endpoint: '/api/users',
  });

  await new Promise(resolve => setTimeout(resolve, 50));

  telemetry.recordStepEnd('wf-multi', 'task-1', 'api-call', true, 50);

  console.log('\n✓ Events sent to all enabled sinks:');
  console.log('  - Console output (above)');
  console.log('  - File: /tmp/aureus-telemetry.log');

  await sinkManager.shutdown();
}

/**
 * Example 4: Correlation ID Propagation
 */
async function exampleCorrelationIds() {
  console.log('\n=== Example 4: Correlation ID Propagation ===\n');

  const sinkManager = new SinkManager();
  sinkManager.addSink('console', {
    type: 'console',
    enabled: true,
    options: { pretty: true },
  });

  // Create collector with initial correlation ID
  const telemetry = new TelemetryCollector(sinkManager, 'request-123');

  console.log('Recording events with correlation ID: request-123\n');

  telemetry.recordStepStart('wf-1', 'task-1', 'service-a');
  await new Promise(resolve => setTimeout(resolve, 20));
  telemetry.recordStepEnd('wf-1', 'task-1', 'service-a', true, 20);

  // Change correlation ID for new request
  telemetry.setCorrelationId('request-456');
  console.log('\nChanged correlation ID to: request-456\n');

  telemetry.recordStepStart('wf-2', 'task-2', 'service-b');
  await new Promise(resolve => setTimeout(resolve, 30));
  telemetry.recordStepEnd('wf-2', 'task-2', 'service-b', true, 30);

  // Query events by correlation ID
  const eventsForRequest123 = telemetry
    .getEvents()
    .filter(e => e.correlationId === 'request-123');

  const eventsForRequest456 = telemetry
    .getEvents()
    .filter(e => e.correlationId === 'request-456');

  console.log(`\n✓ Found ${eventsForRequest123.length} events for request-123`);
  console.log(`✓ Found ${eventsForRequest456.length} events for request-456`);

  await sinkManager.shutdown();
}

/**
 * Example 5: Metrics Aggregation with Exporters
 */
async function exampleMetricsAggregation() {
  console.log('\n=== Example 5: Metrics Aggregation ===\n');

  const sinkManager = new SinkManager();

  // Both Prometheus and console
  sinkManager.addSink('console', {
    type: 'console',
    enabled: true,
  });

  const telemetry = new TelemetryCollector(sinkManager);
  const aggregator = new MetricsAggregator(telemetry);

  // Simulate workflow executions
  console.log('Simulating workflow executions...\n');

  for (let i = 0; i < 20; i++) {
    const taskType = ['api-call', 'data-processing', 'validation'][i % 3];
    const success = Math.random() > 0.15;
    const duration = Math.random() * 300;

    telemetry.recordStepStart(`wf-${i}`, `task-${i}`, taskType);
    await new Promise(resolve => setTimeout(resolve, 5));
    telemetry.recordStepEnd(`wf-${i}`, `task-${i}`, taskType, success, duration);

    // Some require policy approval
    if (i % 5 === 0) {
      telemetry.recordPolicyCheck(`wf-${i}`, `task-${i}`, false, true, 'High-risk operation');
    }
  }

  // Calculate metrics
  const summary = aggregator.getMetricsSummary();

  console.log('\n📊 Metrics Summary:');
  console.log('═'.repeat(50));
  console.log('\nTask Success Rates by Type:');
  for (const [type, rate] of Object.entries(summary.taskSuccessRateByType)) {
    const percentage = (rate * 100).toFixed(1);
    const bar = '█'.repeat(Math.floor(rate * 20));
    console.log(`  ${type.padEnd(20)} ${bar} ${percentage}%`);
  }

  console.log(`\nMean Time To Recovery: ${summary.mttr.toFixed(2)}ms`);
  console.log(`Human Escalation Rate: ${(summary.humanEscalationRate * 100).toFixed(1)}%`);
  console.log(`Cost Per Success: ${summary.costPerSuccess.toFixed(2)}ms`);
  console.log(`Total Events: ${summary.totalEvents}`);

  await sinkManager.shutdown();
}

/**
 * Example 6: Production Configuration
 */
async function exampleProductionConfig() {
  console.log('\n=== Example 6: Production Configuration ===\n');

  const sinkManager = new SinkManager();

  // Production sinks configuration
  const productionConfig = [
    {
      name: 'otlp',
      config: {
        type: 'opentelemetry' as const,
        enabled: true,
        options: {
          endpoint: process.env.OTEL_ENDPOINT || 'http://otel-collector:4318',
          protocol: 'http' as const,
          serviceName: process.env.SERVICE_NAME || 'aureus-agentic-os',
          serviceVersion: process.env.SERVICE_VERSION || '0.1.0',
          headers: {
            'Authorization': `Bearer ${process.env.OTEL_TOKEN || ''}`,
          },
        },
      },
    },
    {
      name: 'prometheus',
      config: {
        type: 'prometheus' as const,
        enabled: true,
        options: {
          port: parseInt(process.env.PROMETHEUS_PORT || '9090'),
          path: '/metrics',
          prefix: 'aureus',
          labels: {
            environment: process.env.ENVIRONMENT || 'production',
            region: process.env.REGION || 'us-east-1',
            cluster: process.env.CLUSTER || 'main',
          },
        },
      },
    },
    {
      name: 'file',
      config: {
        type: 'file' as const,
        enabled: true,
        options: {
          path: process.env.TELEMETRY_LOG_PATH || '/var/log/aureus/telemetry.log',
        },
      },
    },
  ];

  // Add all sinks
  for (const { name, config } of productionConfig) {
    try {
      sinkManager.addSink(name, config);
      console.log(`✓ Configured ${name} sink`);
    } catch (error) {
      console.error(`✗ Failed to configure ${name} sink:`, error);
    }
  }

  console.log('\n✓ Production configuration complete');
  console.log('\nEnvironment Variables:');
  console.log('  OTEL_ENDPOINT - OpenTelemetry collector endpoint');
  console.log('  OTEL_TOKEN - Authentication token');
  console.log('  PROMETHEUS_PORT - Prometheus metrics port');
  console.log('  ENVIRONMENT - Deployment environment');
  console.log('  REGION - Cloud region');
  console.log('  CLUSTER - Cluster identifier');

  await sinkManager.shutdown();
}

/**
 * Main function to run all examples
 */
async function main() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║  Aureus Observability - Exporters Demo                   ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');

  try {
    // Run examples sequentially
    // await exampleOpenTelemetry();
    // await examplePrometheus();
    await exampleMultipleSinks();
    await exampleCorrelationIds();
    await exampleMetricsAggregation();
    await exampleProductionConfig();

    console.log('\n✓ All examples completed successfully!');
    console.log('\nNext Steps:');
    console.log('  1. Set up OpenTelemetry Collector for tracing');
    console.log('  2. Configure Prometheus to scrape metrics');
    console.log('  3. Set up Grafana dashboards for visualization');
    console.log('  4. Configure alerting rules in Prometheus/AlertManager');
    console.log('\nSee MONITORING_DASHBOARD_GUIDE.md for detailed setup instructions.');
  } catch (error) {
    console.error('\n✗ Error running examples:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch(console.error);
}

export {
  exampleOpenTelemetry,
  examplePrometheus,
  exampleMultipleSinks,
  exampleCorrelationIds,
  exampleMetricsAggregation,
  exampleProductionConfig,
};
