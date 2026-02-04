#!/usr/bin/env node

// Demo script to showcase observability features with sample data
const { TelemetryCollector, MetricsAggregator, displayMetricsDashboard } = require('./dist/index');
const { displayMetricsDashboard: displayDashboard } = require('./dist/cli');

// Create a telemetry collector with sample data
const collector = new TelemetryCollector();

// Simulate a day of operations
const now = Date.now();
const oneHour = 3600000;

// Successful tasks
for (let i = 0; i < 50; i++) {
  const timestamp = new Date(now - Math.random() * 7 * 24 * oneHour);
  collector.recordEvent({
    type: 'step_end',
    timestamp,
    workflowId: `wf-${Math.floor(i / 10)}`,
    taskId: `task-${i}`,
    taskType: i % 3 === 0 ? 'action' : i % 3 === 1 ? 'query' : 'validation',
    data: { success: true, duration: 1000 + Math.random() * 3000 },
  });
}

// Failed tasks
for (let i = 0; i < 8; i++) {
  const timestamp = new Date(now - Math.random() * 7 * 24 * oneHour);
  collector.recordEvent({
    type: 'step_end',
    timestamp,
    workflowId: `wf-fail-${i}`,
    taskId: `task-fail-${i}`,
    taskType: 'action',
    data: { success: false, error: 'Simulated error' },
  });
}

// Policy checks
for (let i = 0; i < 30; i++) {
  const timestamp = new Date(now - Math.random() * 7 * 24 * oneHour);
  collector.recordEvent({
    type: 'policy_check',
    timestamp,
    workflowId: `wf-${i}`,
    taskId: `task-${i}`,
    data: {
      allowed: true,
      requiresHumanApproval: i % 7 === 0, // ~14% escalation rate
      reason: i % 7 === 0 ? 'HIGH risk tier requires approval' : 'Allowed',
    },
  });
}

// CRV results
for (let i = 0; i < 40; i++) {
  const timestamp = new Date(now - Math.random() * 7 * 24 * oneHour);
  collector.recordEvent({
    type: 'crv_result',
    timestamp,
    workflowId: `wf-${i}`,
    taskId: `task-${i}`,
    data: {
      gateName: 'validation-gate',
      passed: i % 10 !== 0, // 90% pass rate
      blocked: i % 10 === 0,
      failureCode: i % 10 === 0 ? 'SCHEMA_VIOLATION' : undefined,
    },
  });
}

// Tool calls
for (let i = 0; i < 60; i++) {
  const timestamp = new Date(now - Math.random() * 7 * 24 * oneHour);
  collector.recordEvent({
    type: 'tool_call',
    timestamp,
    workflowId: `wf-${i}`,
    taskId: `task-${i}`,
    data: {
      toolName: i % 3 === 0 ? 'http-get' : i % 3 === 1 ? 'database-query' : 'file-write',
      args: {},
    },
  });
}

// Simulate recovery scenarios for MTTR calculation
const recoveryScenarios = [
  { failTime: now - 5 * oneHour, recoverTime: now - 5 * oneHour + 180000 }, // 3 min
  { failTime: now - 10 * oneHour, recoverTime: now - 10 * oneHour + 240000 }, // 4 min
  { failTime: now - 15 * oneHour, recoverTime: now - 15 * oneHour + 300000 }, // 5 min
];

for (const scenario of recoveryScenarios) {
  collector.recordEvent({
    type: 'step_end',
    timestamp: new Date(scenario.failTime),
    workflowId: 'wf-recovery',
    taskId: 'task-recovery',
    taskType: 'action',
    data: { success: false, error: 'Temporary failure' },
  });
  
  collector.recordEvent({
    type: 'step_end',
    timestamp: new Date(scenario.recoverTime),
    workflowId: 'wf-recovery',
    taskId: 'task-recovery',
    taskType: 'action',
    data: { success: true, duration: 2000 },
  });
}

// Display the dashboard
console.log('\n🎨 AUREUS OBSERVABILITY DEMO - Sample Data Dashboard\n');
displayDashboard(collector, '7d');
