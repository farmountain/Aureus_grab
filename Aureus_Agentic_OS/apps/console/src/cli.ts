#!/usr/bin/env node

import { ConsoleService } from './console-service';
import { ConsoleCLI } from './console-cli';
import { InMemoryStateStore, InMemoryEventLog } from '@aureus/kernel';
import { GoalGuardFSM } from '@aureus/policy';
import { SnapshotManager } from '@aureus/memory-hipcortex';
import { runToolAdapterWizard } from './tool-adapter-wizard';

/**
 * CLI entry point for the Aureus Console
 * Provides command-line interface for monitoring workflows
 */

const args = process.argv.slice(2);
const command = args[0];
const workflowId = args[1];

// Initialize services
const stateStore = new InMemoryStateStore();
const eventLog = new InMemoryEventLog();
const policyGuard = new GoalGuardFSM();
const snapshotManager = new SnapshotManager();

const consoleService = new ConsoleService(
  stateStore,
  eventLog,
  policyGuard,
  snapshotManager
);

const cli = new ConsoleCLI(consoleService);

async function main() {
  try {
    switch (command) {
      case 'list':
        await cli.displayWorkflows();
        break;

      case 'status':
        if (!workflowId) {
          console.error('Usage: aureus-console status <workflow-id>');
          process.exit(1);
        }
        await cli.displayWorkflowDetail(workflowId);
        break;

      case 'timeline':
        if (!workflowId) {
          console.error('Usage: aureus-console timeline <workflow-id> [limit]');
          process.exit(1);
        }
        const limit = args[2] ? parseInt(args[2]) : 20;
        await cli.displayTimeline(workflowId, limit);
        break;

      case 'snapshots':
        if (!workflowId) {
          console.error('Usage: aureus-console snapshots <workflow-id>');
          process.exit(1);
        }
        await cli.displaySnapshots(workflowId);
        break;

      case 'create-tool':
      case 'tool-wizard':
        await runToolAdapterWizard();
        break;

      case 'help':
      default:
        console.log(`
Aureus Console CLI

Usage:
  aureus-console list                           List all workflows
  aureus-console status <workflow-id>           Show detailed workflow status
  aureus-console timeline <workflow-id> [limit] Show workflow timeline
  aureus-console snapshots <workflow-id>        Show available snapshots
  aureus-console create-tool                    Create a new tool adapter (wizard)
  aureus-console help                           Show this help message

For API server, use:
  npm start                                     Start the API server

Default credentials:
  Username: operator
  Password: operator123
        `);
        break;
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
