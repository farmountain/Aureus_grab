#!/usr/bin/env node

/**
 * Example: Production console configuration
 *
 * Wires persistent StateStore/EventLog, OpenAI LLM provider,
 * sandbox integration, and telemetry sinks for production usage.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  ConsoleService,
  createProductionConsoleConfig,
  NamedTelemetrySink,
} from '@aureus/console';
import { GoalGuardFSM } from '@aureus/policy';
import { SnapshotManager } from '@aureus/memory-hipcortex';

async function main() {
  const stateSchemaPath = path.join(__dirname, '../packages/kernel/src/db-schema.sql');
  const stateSchemaSQL = fs.existsSync(stateSchemaPath)
    ? fs.readFileSync(stateSchemaPath, 'utf-8')
    : undefined;

  const telemetrySinks: NamedTelemetrySink[] = [
    {
      name: 'opentelemetry',
      config: {
        type: 'opentelemetry',
        enabled: true,
        options: {
          endpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://otel-collector:4318',
          protocol: 'http',
          serviceName: 'aureus-console',
          serviceVersion: '0.1.0',
        },
      },
    },
    {
      name: 'file',
      config: {
        type: 'file',
        enabled: true,
        options: {
          path: process.env.TELEMETRY_LOG_PATH || '/var/log/aureus/telemetry.log',
        },
      },
    },
    {
      name: 'prometheus',
      config: {
        type: 'prometheus',
        enabled: true,
        options: {
          port: Number(process.env.METRICS_PORT || 9090),
          path: '/metrics',
        },
      },
    },
  ];

  const productionConfig = await createProductionConsoleConfig({
    eventLogDir: process.env.EVENT_LOG_DIR || '/var/log/aureus/events',
    telemetrySinks,
    stateStoreSchemaSQL: stateSchemaSQL,
    llmConfig: {
      model: process.env.LLM_MODEL || 'gpt-4',
    },
  });

  const policyGuard = new GoalGuardFSM(productionConfig.telemetry);
  const snapshotManager = new SnapshotManager();

  const consoleService = new ConsoleService(
    productionConfig.stateStore,
    productionConfig.eventLog,
    policyGuard,
    snapshotManager,
    undefined,
    productionConfig.telemetry
  );

  console.log('Console service configured for production:', {
    eventLogDir: process.env.EVENT_LOG_DIR || '/var/log/aureus/events',
    telemetrySinks: productionConfig.telemetrySinks.getSinkNames(),
    llmConfigured: productionConfig.llmProvider.validateConfig(),
  });

  // Use consoleService and productionConfig.sandboxIntegration as needed.
  void consoleService;
}

main().catch(error => {
  console.error('Failed to create production config:', error);
  process.exit(1);
});
