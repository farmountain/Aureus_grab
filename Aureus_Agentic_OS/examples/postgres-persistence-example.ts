#!/usr/bin/env node

/**
 * Example: Using PostgreSQL persistence in Aureus
 * 
 * This example demonstrates how to use the PostgreSQL-backed
 * state store, memory store, and audit log.
 * 
 * Prerequisites:
 * - PostgreSQL installed and running
 * - Database created (see docs/installation.md)
 * - Environment variables set (DATABASE_URL or DATABASE_*)
 */

import { PostgresStateStore, WorkflowState, TaskState } from '@aureus/kernel';
import { PostgresMemoryStore, PostgresAuditLog } from '@aureus/memory-hipcortex';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  console.log('=== PostgreSQL Persistence Example ===\n');

  // Check if database is configured
  if (!process.env.DATABASE_URL && !process.env.DATABASE_HOST) {
    console.error('Error: PostgreSQL not configured');
    console.error('Set DATABASE_URL or DATABASE_HOST/DATABASE_NAME/DATABASE_USER/DATABASE_PASSWORD');
    console.error('\nExample:');
    console.error('  export DATABASE_URL="postgresql://aureus:password@localhost:5432/aureus"');
    process.exit(1);
  }

  console.log('1. Initializing PostgreSQL connections...');
  
  // Initialize stores
  const stateStore = new PostgresStateStore();
  const memoryStore = new PostgresMemoryStore();
  const auditLog = new PostgresAuditLog();

  try {
    // Initialize schemas
    const stateSchemaPath = path.join(__dirname, '../packages/kernel/src/db-schema.sql');
    const memorySchemaPath = path.join(__dirname, '../packages/memory-hipcortex/src/db-schema.sql');

    if (fs.existsSync(stateSchemaPath)) {
      const stateSchemaSQL = fs.readFileSync(stateSchemaPath, 'utf-8');
      await stateStore.initialize(stateSchemaSQL);
      console.log('   ✓ State store schema initialized');
    }

    if (fs.existsSync(memorySchemaPath)) {
      const memorySchemaSQL = fs.readFileSync(memorySchemaPath, 'utf-8');
      await memoryStore.initialize(memorySchemaSQL);
      await auditLog.initialize(memorySchemaSQL);
      console.log('   ✓ Memory and audit log schemas initialized');
    }

    // Example 1: Store and retrieve workflow state
    console.log('\n2. Example: Workflow State Persistence');
    const workflowState: WorkflowState = {
      workflowId: 'example-workflow-1',
      tenantId: 'tenant-demo',
      status: 'running',
      taskStates: new Map([
        ['task-1', {
          taskId: 'task-1',
          status: 'completed',
          attempt: 1,
          result: { message: 'Task completed successfully' },
          startedAt: new Date(),
          completedAt: new Date(),
        }],
        ['task-2', {
          taskId: 'task-2',
          status: 'running',
          attempt: 1,
          startedAt: new Date(),
        }],
      ]),
      startedAt: new Date(),
    };

    await stateStore.saveWorkflowState(workflowState);
    console.log('   ✓ Saved workflow state');

    const loadedWorkflow = await stateStore.loadWorkflowState('example-workflow-1', 'tenant-demo');
    console.log(`   ✓ Loaded workflow: ${loadedWorkflow?.workflowId}`);
    console.log(`   ✓ Status: ${loadedWorkflow?.status}`);
    console.log(`   ✓ Tasks: ${loadedWorkflow?.taskStates.size}`);

    // Example 2: Store and query memory entries
    console.log('\n3. Example: Memory Entry Persistence');
    await memoryStore.storeEntry({
      id: 'memory-example-1',
      content: {
        text: 'User requested a report generation',
        timestamp: new Date().toISOString(),
      },
      type: 'episodic_note',
      provenance: {
        task_id: 'example-workflow-1',
        step_id: 'task-1',
        timestamp: new Date(),
      },
      tags: ['user-interaction', 'report'],
      metadata: {
        user: 'demo-user',
        priority: 'high',
      },
    });
    console.log('   ✓ Stored memory entry');

    const memoryEntries = await memoryStore.queryEntries({
      task_id: 'example-workflow-1',
    });
    console.log(`   ✓ Retrieved ${memoryEntries.length} memory entries`);
    console.log(`   ✓ Tags: ${memoryEntries[0]?.tags?.join(', ')}`);

    // Example 3: Audit log with integrity verification
    console.log('\n4. Example: Audit Log with Integrity Verification');
    const auditEntry = await auditLog.append(
      'system',
      'workflow_started',
      { status: 'pending' },
      { status: 'running' },
      {
        metadata: { reason: 'User initiated workflow' },
        provenance: {
          task_id: 'example-workflow-1',
          step_id: 'initialization',
          timestamp: new Date(),
        },
      }
    );
    console.log('   ✓ Created audit log entry');
    console.log(`   ✓ Entry ID: ${auditEntry.id}`);
    console.log(`   ✓ Content hash: ${auditEntry.contentHash?.substring(0, 16)}...`);

    const isValid = await auditLog.verifyEntry(auditEntry.id);
    console.log(`   ✓ Integrity verified: ${isValid}`);

    // Example 4: Query audit log
    const recentAudits = await auditLog.queryByTimeRange(
      new Date(Date.now() - 3600000), // Last hour
      new Date()
    );
    console.log(`   ✓ Found ${recentAudits.length} audit entries in the last hour`);

    // Example 5: Tenant isolation
    console.log('\n5. Example: Tenant Isolation');
    const tenant1Workflows = await stateStore.listWorkflowsByTenant('tenant-demo');
    console.log(`   ✓ Tenant 'tenant-demo' has ${tenant1Workflows.length} workflows`);

    // Try to access with wrong tenant (should return null)
    const wrongTenantAccess = await stateStore.loadWorkflowState('example-workflow-1', 'wrong-tenant');
    console.log(`   ✓ Access denied for wrong tenant: ${wrongTenantAccess === null ? 'YES' : 'NO'}`);

    console.log('\n=== Example completed successfully! ===\n');
    console.log('Summary:');
    console.log('- Workflow state persisted and retrieved');
    console.log('- Memory entries stored with provenance');
    console.log('- Audit log entries verified for integrity');
    console.log('- Tenant isolation enforced');
    console.log('\nAll data is now safely stored in PostgreSQL!');

  } catch (error) {
    console.error('\n❌ Error:', error);
    throw error;
  } finally {
    // Cleanup
    await stateStore.close();
    await memoryStore.close();
    await auditLog.close();
    console.log('\n✓ Database connections closed');
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
