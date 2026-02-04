#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';
import { ConsoleService } from './console-service';
import { ConsoleAPIServer } from './api-server';
import { AuthService } from './auth';
import { InMemoryStateStore, PostgresStateStore, StateStore, InMemoryEventLog } from '@aureus/kernel';
import { GoalGuardFSM } from '@aureus/policy';
import { SnapshotManager } from '@aureus/memory-hipcortex';

/**
 * Server entry point for the Aureus Console API
 */

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

async function main() {
  console.log('Starting Aureus Console API Server...');

  // Initialize services - use PostgreSQL if configured, otherwise in-memory
  let stateStore: StateStore;
  const usePostgres = process.env.STATE_STORE_TYPE === 'postgres' || process.env.DATABASE_URL;
  
  if (usePostgres) {
    console.log('Using PostgreSQL state store');
    const postgresStore = new PostgresStateStore();
    
    // Initialize schema if needed
    try {
      // Try multiple possible locations for the schema file
      const possiblePaths = [
        path.join(__dirname, '../../node_modules/@aureus/kernel/dist/db-schema.sql'),
        path.join(__dirname, '../../../packages/kernel/src/db-schema.sql'),
        path.join(process.cwd(), 'packages/kernel/src/db-schema.sql'),
      ];
      
      let schemaSQL: string | null = null;
      for (const schemaPath of possiblePaths) {
        if (fs.existsSync(schemaPath)) {
          schemaSQL = fs.readFileSync(schemaPath, 'utf-8');
          console.log(`Loaded schema from: ${schemaPath}`);
          break;
        }
      }
      
      if (schemaSQL) {
        await postgresStore.initialize(schemaSQL);
      } else {
        console.warn('Could not find database schema file - schema may need to be initialized manually');
      }
    } catch (error) {
      console.warn('Could not initialize database schema:', error);
    }
    
    stateStore = postgresStore;
  } else {
    console.log('Using in-memory state store');
    stateStore = new InMemoryStateStore();
  }
  
  const eventLog = new InMemoryEventLog();
  const policyGuard = new GoalGuardFSM();
  const snapshotManager = new SnapshotManager();

  const consoleService = new ConsoleService(
    stateStore,
    eventLog,
    policyGuard,
    snapshotManager
  );

  const authService = new AuthService();
  await authService.initialize();  // Initialize auth service
  
  const server = new ConsoleAPIServer(
    consoleService,
    authService,
    PORT
  );

  await server.start();

  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  Aureus Console API Server Running');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
  console.log(`  API Endpoint:  http://localhost:${PORT}`);
  console.log(`  Health Check:  http://localhost:${PORT}/health`);
  console.log('');
  console.log('  Default Credentials:');
  console.log('    Username: operator');
  console.log('    Password: operator123');
  console.log('');
  console.log('  Available Endpoints:');
  console.log('    POST   /api/auth/login');
  console.log('    POST   /api/auth/logout');
  console.log('    GET    /api/workflows');
  console.log('    GET    /api/workflows/:id');
  console.log('    GET    /api/workflows/:id/events');
  console.log('    GET    /api/workflows/:id/timeline');
  console.log('    GET    /api/workflows/:id/snapshots');
  console.log('    POST   /api/workflows/:id/approve');
  console.log('    POST   /api/workflows/:id/deny');
  console.log('    POST   /api/workflows/:id/rollback');
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
}

main().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
