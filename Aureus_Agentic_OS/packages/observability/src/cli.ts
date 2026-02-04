#!/usr/bin/env node

import { TelemetryCollector, MetricsAggregator } from './index';

/**
 * Parse time range argument (e.g., "7d", "24h", "30m")
 */
function parseTimeRange(timeStr: string): number {
  const match = timeStr.match(/^(\d+)([dhm])$/);
  if (!match) {
    throw new Error(`Invalid time format: ${timeStr}. Use format like "7d", "24h", "30m"`);
  }
  
  const value = parseInt(match[1], 10);
  const unit = match[2];
  
  switch (unit) {
    case 'd':
      return value * 24 * 60 * 60 * 1000; // days to ms
    case 'h':
      return value * 60 * 60 * 1000; // hours to ms
    case 'm':
      return value * 60 * 1000; // minutes to ms
    default:
      throw new Error(`Invalid time unit: ${unit}`);
  }
}

/**
 * Format duration in human-readable format
 */
function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms.toFixed(0)}ms`;
  } else if (ms < 60000) {
    return `${(ms / 1000).toFixed(2)}s`;
  } else if (ms < 3600000) {
    return `${(ms / 60000).toFixed(2)}m`;
  } else {
    return `${(ms / 3600000).toFixed(2)}h`;
  }
}

/**
 * Format percentage
 */
function formatPercentage(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

/**
 * Display metrics dashboard
 */
function displayMetricsDashboard(collector: TelemetryCollector, timeRange?: string): void {
  const aggregator = new MetricsAggregator(collector);
  
  const timeRangeMs = timeRange ? parseTimeRange(timeRange) : undefined;
  const summary = aggregator.getMetricsSummary(timeRangeMs);
  
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║              AUREUS OBSERVABILITY DASHBOARD                  ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
  
  if (timeRange) {
    console.log(`📊 Time Range: Last ${timeRange}`);
  } else {
    console.log('📊 Time Range: All time');
  }
  console.log(`📅 Period: ${summary.timeRange.start.toISOString()} → ${summary.timeRange.end.toISOString()}`);
  console.log(`📈 Total Events: ${summary.totalEvents}\n`);
  
  console.log('─────────────────────────────────────────────────────────────');
  console.log('🎯 TASK SUCCESS RATE BY TYPE');
  console.log('─────────────────────────────────────────────────────────────');
  
  const successRates = summary.taskSuccessRateByType;
  if (Object.keys(successRates).length === 0) {
    console.log('  No data available');
  } else {
    for (const [taskType, rate] of Object.entries(successRates)) {
      const bar = '█'.repeat(Math.floor(rate * 20));
      const emptyBar = '░'.repeat(20 - Math.floor(rate * 20));
      console.log(`  ${taskType.padEnd(20)} ${bar}${emptyBar} ${formatPercentage(rate)}`);
    }
  }
  
  console.log('\n─────────────────────────────────────────────────────────────');
  console.log('⏱️  MEAN TIME TO RECOVERY (MTTR)');
  console.log('─────────────────────────────────────────────────────────────');
  console.log(`  ${formatDuration(summary.mttr)}`);
  
  console.log('\n─────────────────────────────────────────────────────────────');
  console.log('👤 HUMAN ESCALATION RATE');
  console.log('─────────────────────────────────────────────────────────────');
  const escalationBar = '█'.repeat(Math.floor(summary.humanEscalationRate * 20));
  const escalationEmptyBar = '░'.repeat(20 - Math.floor(summary.humanEscalationRate * 20));
  console.log(`  ${escalationBar}${escalationEmptyBar} ${formatPercentage(summary.humanEscalationRate)}`);
  
  console.log('\n─────────────────────────────────────────────────────────────');
  console.log('💰 COST PER SUCCESS (Time Proxy)');
  console.log('─────────────────────────────────────────────────────────────');
  console.log(`  ${formatDuration(summary.costPerSuccess)}`);
  
  console.log('\n');
}

/**
 * Main CLI entry point
 */
function main(): void {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args[0] !== 'metrics') {
    console.error('Usage: aureus metrics [--last <time>]');
    console.error('  Example: aureus metrics --last 7d');
    console.error('  Time format: <number><unit> where unit is d (days), h (hours), or m (minutes)');
    process.exit(1);
  }
  
  let timeRange: string | undefined;
  
  if (args.length >= 3 && args[1] === '--last') {
    timeRange = args[2];
  }
  
  // In a real implementation, this would load data from persistent storage
  // For now, we create a sample collector to demonstrate the CLI
  const collector = new TelemetryCollector();
  
  // Load events from a persistent store (e.g., file system, database)
  // This is a placeholder - in production, you'd load from event logs
  loadEventsFromStore(collector);
  
  try {
    displayMetricsDashboard(collector, timeRange);
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

/**
 * Load events from persistent storage
 * TODO: Implement event loading from persistent storage
 * This is a placeholder implementation.
 * 
 * In production, this should:
 * 1. Connect to event store (file system, database, etc.)
 * 2. Load events from the store
 * 3. Populate the collector with events
 * 
 * Example implementations:
 * - Read from JSON files in ./var/events/
 * - Query from database (PostgreSQL, MongoDB, etc.)
 * - Fetch from time-series database (InfluxDB, TimescaleDB)
 */
function loadEventsFromStore(collector: TelemetryCollector): void {
  console.log('ℹ️  Loading events from store...');
  console.log('⚠️  Warning: No event store configured. Displaying empty metrics.');
  console.log('ℹ️  To populate with real data:');
  console.log('   1. Implement event persistence in TelemetryCollector');
  console.log('   2. Load events from storage in this function');
  console.log('   3. See docs/monitoring-and-alerting.md for details\n');
}

// Run CLI if this file is executed directly
if (require.main === module) {
  main();
}

export { main, displayMetricsDashboard, parseTimeRange };
