#!/usr/bin/env node

import * as path from 'path';
import * as fs from 'fs';
import { WorkflowOrchestrator, InMemoryStateStore, PostgresStateStore, StateStore, FileSystemEventLog, TaskExecutor, RollbackOrchestrator } from './index';
import { loadTaskSpec } from './task-loader';
import { InMemoryStateStore as WorldStateStore } from '@aureus/world-model';
import { SnapshotManager, MemoryAPI } from '@aureus/memory-hipcortex';
import { GoalGuardFSM, Principal, Permission } from '@aureus/policy';

/**
 * Simple executor that logs task execution
 * In a real implementation, this would call actual tool implementations
 */
class SimpleTaskExecutor implements TaskExecutor {
  async execute(task: any): Promise<unknown> {
    console.log(`Executing task: ${task.id} (${task.name})`);
    
    // Simulate some work
    await new Promise(resolve => setTimeout(resolve, 100));
    
    return {
      taskId: task.id,
      status: 'completed',
      timestamp: new Date().toISOString(),
    };
  }
}

async function runWorkflow(taskFile: string, options: {
  stateStoreType?: string;
  eventLogType?: string;
  eventLogDir?: string;
} = {}) {
  // Load task specification from YAML
  console.log(`Loading task specification from: ${taskFile}`);
  const spec = await loadTaskSpec(taskFile);
  console.log(`Loaded workflow: ${spec.name} (${spec.id})`);
  console.log(`Tasks: ${spec.tasks.length}`);

  // Setup state store - use configuration from CLI args, env vars, or default to in-memory
  let stateStore: StateStore;
  const stateStoreType = options.stateStoreType || process.env.STATE_STORE_TYPE || 'in-memory';
  
  if (stateStoreType === 'postgres' || process.env.DATABASE_URL) {
    console.log('Using PostgreSQL state store');
    const postgresStore = new PostgresStateStore();
    
    // Initialize schema if needed
    try {
      const schemaPath = path.join(__dirname, 'db-schema.sql');
      if (fs.existsSync(schemaPath)) {
        const schemaSQL = fs.readFileSync(schemaPath, 'utf-8');
        await postgresStore.initialize(schemaSQL);
      }
    } catch (error) {
      console.warn('Could not initialize database schema:', error);
    }
    
    stateStore = postgresStore;
  } else {
    console.log('Using in-memory state store');
    stateStore = new InMemoryStateStore();
  }
  
  // Setup event log - use configuration from CLI args, env vars, or default to filesystem
  const eventLogType = options.eventLogType || process.env.EVENT_LOG_TYPE || 'filesystem';
  const eventLogDir = options.eventLogDir || process.env.EVENT_LOG_DIR || './var/run';
  const eventLog = new FileSystemEventLog(eventLogDir);
  console.log(`Using ${eventLogType} event log at: ${eventLogDir}`);
  
  const executor = new SimpleTaskExecutor();
  const orchestrator = new WorkflowOrchestrator(stateStore, executor, eventLog);

  console.log(`\nStarting workflow execution...`);
  console.log(`Events will be logged to: ./var/run/${spec.id}/events.log\n`);

  // Execute workflow
  const startTime = Date.now();
  const result = await orchestrator.executeWorkflow(spec);
  const duration = Date.now() - startTime;

  console.log(`\nWorkflow completed successfully in ${duration}ms`);
  console.log(`Status: ${result.status}`);
  console.log(`Tasks executed: ${result.taskStates.size}`);

  // Show event log location
  const logPath = path.resolve(`./var/run/${spec.id}/events.log`);
  console.log(`\nEvent log written to: ${logPath}`);
  
  // Cleanup database connection if using PostgreSQL
  if (stateStore instanceof PostgresStateStore) {
    await stateStore.close();
  }
}

async function rollbackWorkflow(taskId: string, snapshotId: string, requestedBy: string = 'cli-user') {
  console.log(`\n=== Rollback Command ===`);
  console.log(`Task ID: ${taskId}`);
  console.log(`Snapshot ID: ${snapshotId}`);
  console.log(`Requested by: ${requestedBy}\n`);

  // Setup components
  const snapshotManager = new SnapshotManager();
  const worldStateStore = new WorldStateStore();
  const eventLog = new FileSystemEventLog('./var/run');
  const policyGuard = new GoalGuardFSM();

  // Setup memory API (optional but recommended)
  const memoryAPI = new MemoryAPI();

  // Create rollback orchestrator
  const rollbackOrchestrator = new RollbackOrchestrator(
    snapshotManager,
    worldStateStore,
    eventLog,
    memoryAPI,
    policyGuard
  );

  // Create principal for policy evaluation
  // Note: CLI permissions are granted based on operator trust
  // In production, these should be derived from identity/auth system
  const principal: Principal = {
    id: requestedBy,
    type: 'human', // CLI user is human
    permissions: [
      { action: 'rollback', resource: 'workflow' },
    ] as Permission[],
  };

  try {
    // Perform rollback
    const result = await rollbackOrchestrator.rollback(
      {
        taskId,
        snapshotId,
        requestedBy,
        reason: 'Manual rollback via CLI',
      },
      principal
    );

    console.log(`\n=== Rollback Completed ===`);
    console.log(`Success: ${result.success}`);
    console.log(`Snapshot: ${result.snapshotId}`);
    console.log(`Approval Required: ${result.approvalRequired}`);
    console.log(`Approved: ${result.approved}`);
    if (result.approvedBy) {
      console.log(`Approved By: ${result.approvedBy}`);
    }
    console.log(`Timestamp: ${result.timestamp.toISOString()}`);
    console.log(`\nWorld state entries restored: ${result.restoredState.worldState.entries.size}`);
    console.log(`Memory pointers restored: ${result.restoredState.memoryPointers.length}`);
  } catch (error) {
    console.error('\n=== Rollback Failed ===');
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

function printUsage() {
  console.log('Usage:');
  console.log('  aureus run <task.yaml> [options]          - Execute a workflow');
  console.log('  aureus rollback --task <id> --to <snapshot_id> [--user <name>]');
  console.log('                                            - Rollback to a snapshot');
  console.log('\nOptions for run command:');
  console.log('  --state-store-type <type>                 - State store type: "in-memory" or "postgres" (default: in-memory)');
  console.log('  --event-log-type <type>                   - Event log type: "filesystem" (default: filesystem)');
  console.log('  --event-log-dir <dir>                     - Event log directory (default: ./var/run)');
  console.log('\nEnvironment Variables:');
  console.log('  STATE_STORE_TYPE                          - State store type (in-memory or postgres)');
  console.log('  EVENT_LOG_TYPE                            - Event log type (filesystem)');
  console.log('  EVENT_LOG_DIR                             - Event log directory');
  console.log('  DATABASE_URL                              - PostgreSQL connection string (enables postgres state store)');
  console.log('\nExamples:');
  console.log('  aureus run workflow.yaml');
  console.log('  aureus run workflow.yaml --state-store-type postgres --event-log-dir /var/log/aureus');
  console.log('  STATE_STORE_TYPE=postgres aureus run workflow.yaml');
  console.log('  aureus rollback --task workflow-123 --to snapshot-1-workflow-123-step1');
  console.log('  aureus rollback --task workflow-123 --to snapshot-2 --user admin');
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    printUsage();
    process.exit(1);
  }

  const command = args[0];

  try {
    if (command === 'run') {
      const taskFile = args[1];
      if (!taskFile) {
        console.error('Error: Task file path required');
        console.error('Usage: aureus run <task.yaml> [options]');
        process.exit(1);
      }
      
      // Parse options for run command
      const options: {
        stateStoreType?: string;
        eventLogType?: string;
        eventLogDir?: string;
      } = {};
      
      for (let i = 2; i < args.length; i++) {
        if (args[i] === '--state-store-type' && i + 1 < args.length) {
          options.stateStoreType = args[i + 1];
          i++;
        } else if (args[i] === '--event-log-type' && i + 1 < args.length) {
          options.eventLogType = args[i + 1];
          i++;
        } else if (args[i] === '--event-log-dir' && i + 1 < args.length) {
          options.eventLogDir = args[i + 1];
          i++;
        }
      }
      
      await runWorkflow(taskFile, options);
    } else if (command === 'rollback') {
      // Parse rollback arguments
      let taskId: string | undefined;
      let snapshotId: string | undefined;
      let requestedBy: string = 'cli-user';

      for (let i = 1; i < args.length; i++) {
        if (args[i] === '--task' && i + 1 < args.length) {
          taskId = args[i + 1];
          i++;
        } else if (args[i] === '--to' && i + 1 < args.length) {
          snapshotId = args[i + 1];
          i++;
        } else if (args[i] === '--user' && i + 1 < args.length) {
          requestedBy = args[i + 1];
          i++;
        }
      }

      if (!taskId || !snapshotId) {
        console.error('Error: Both --task and --to arguments are required');
        console.error('Usage: aureus rollback --task <id> --to <snapshot_id> [--user <name>]');
        process.exit(1);
      }

      await rollbackWorkflow(taskId, snapshotId, requestedBy);
    } else {
      console.error(`Unknown command: ${command}`);
      printUsage();
      process.exit(1);
    }

    process.exit(0);
  } catch (error) {
    console.error('\nCommand failed:');
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
