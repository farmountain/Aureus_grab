# PostgreSQL Persistence for Aureus

This document describes the PostgreSQL-based persistence layer for Aureus Agentic OS, providing durable state storage for workflows, memory entries, and audit logs.

## Overview

Aureus supports both in-memory and persistent storage backends:

- **In-Memory** (default): Fast, suitable for development and testing
- **PostgreSQL**: Durable, ACID-compliant, suitable for production

## Components

### 1. PostgresStateStore (`packages/kernel/src/`)

Persistent storage for workflow and task state.

**Features:**
- Workflow state persistence with tenant isolation
- Task state tracking with retry counts and errors
- ACID guarantees for state transitions
- Automatic schema initialization

**Database Schema:**
- `workflow_states` table: Stores workflow metadata and state
- `task_states` table: Stores individual task execution state
- Indexes on tenant_id, status, and timestamps for efficient queries

### 2. PostgresMemoryStore (`packages/memory-hipcortex/src/`)

Persistent storage for memory entries with full provenance tracking.

**Features:**
- Memory entry storage with provenance (task_id, step_id, source_event_id)
- Tag-based queries using PostgreSQL GIN indexes
- Time-range queries with temporal indexing
- Type-based filtering (episodic_note, artifact, snapshot)

**Database Schema:**
- `memory_entries` table: Stores memory entries with content and metadata
- `temporal_indices` table: Efficient time-based lookups
- GIN indexes on tags for fast tag queries

### 3. PostgresAuditLog (`packages/memory-hipcortex/src/`)

Append-only audit log with cryptographic integrity verification.

**Features:**
- Immutable audit trail of all state changes
- SHA-256 content hashes for integrity verification
- Source event tracking for full traceability
- Provenance integration

**Database Schema:**
- `audit_log_entries` table: Append-only log of all actions
- Indexes on actor, action, timestamp, and provenance fields
- Content hash storage for integrity verification

## Configuration

### Environment Variables

```bash
# Option 1: Connection string (recommended)
export DATABASE_URL="postgresql://user:password@localhost:5432/aureus"
export STATE_STORE_TYPE="postgres"

# Option 2: Individual parameters
export DATABASE_HOST="localhost"
export DATABASE_PORT="5432"
export DATABASE_NAME="aureus"
export DATABASE_USER="aureus"
export DATABASE_PASSWORD="your-password"
export STATE_STORE_TYPE="postgres"

# Connection pool settings
export DATABASE_POOL_MAX="20"     # Maximum connections
export DATABASE_POOL_MIN="2"      # Minimum connections
export DATABASE_SSL="false"       # Enable SSL
export DATABASE_TIMEOUT="30000"   # Query timeout (ms)
export DATABASE_IDLE_TIMEOUT="10000"  # Idle connection timeout (ms)
```

### Using .env File

Create a `.env` file in your project root:

```env
DATABASE_URL=postgresql://aureus:password@localhost:5432/aureus
STATE_STORE_TYPE=postgres
DATABASE_POOL_MAX=20
DATABASE_SSL=false
```

## Database Setup

### 1. Install PostgreSQL

**macOS:**
```bash
brew install postgresql@15
brew services start postgresql@15
```

**Ubuntu/Debian:**
```bash
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
```

**Docker:**
```bash
docker run --name aureus-postgres \
  -e POSTGRES_PASSWORD=aureus \
  -e POSTGRES_USER=aureus \
  -e POSTGRES_DB=aureus \
  -p 5432:5432 \
  -d postgres:15
```

### 2. Create Database

```sql
CREATE DATABASE aureus;
CREATE USER aureus WITH PASSWORD 'your-password';
GRANT ALL PRIVILEGES ON DATABASE aureus TO aureus;
```

### 3. Run Migrations

Migrations are automatically run on first use, or manually:

```bash
# State store schema
psql -U aureus -d aureus -f packages/kernel/src/db-schema.sql

# Memory and audit log schema
psql -U aureus -d aureus -f packages/memory-hipcortex/src/db-schema.sql
```

## Usage

### CLI

```bash
# In-memory mode (default)
aureus run workflow.yaml

# PostgreSQL mode
export DATABASE_URL="postgresql://aureus:password@localhost:5432/aureus"
export STATE_STORE_TYPE="postgres"
aureus run workflow.yaml
```

### Programmatic Usage

#### State Store

```typescript
import { PostgresStateStore } from '@aureus/kernel';

// Create store
const stateStore = new PostgresStateStore({
  connectionString: 'postgresql://aureus:password@localhost:5432/aureus',
});

// Initialize schema (optional, auto-runs on first use)
await stateStore.initialize(schemaSQL);

// Save workflow state
await stateStore.saveWorkflowState({
  workflowId: 'workflow-1',
  status: 'running',
  taskStates: new Map(),
  tenantId: 'tenant-1',
});

// Load workflow state
const state = await stateStore.loadWorkflowState('workflow-1', 'tenant-1');

// Cleanup
await stateStore.close();
```

#### Memory Store

```typescript
import { PostgresMemoryStore } from '@aureus/memory-hipcortex';

const memoryStore = new PostgresMemoryStore();
await memoryStore.initialize(schemaSQL);

// Store entry
await memoryStore.storeEntry({
  id: 'entry-1',
  content: { data: 'important information' },
  type: 'episodic_note',
  provenance: {
    task_id: 'task-1',
    step_id: 'step-1',
    timestamp: new Date(),
  },
  tags: ['important', 'user-interaction'],
});

// Query by task
const entries = await memoryStore.queryEntries({ task_id: 'task-1' });

// Query by tags
const tagged = await memoryStore.queryEntries({ tags: ['important'] });

await memoryStore.close();
```

#### Audit Log

```typescript
import { PostgresAuditLog } from '@aureus/memory-hipcortex';

const auditLog = new PostgresAuditLog();
await auditLog.initialize(schemaSQL);

// Append entry
const entry = await auditLog.append(
  'agent-1',
  'update_state',
  { count: 0 },
  { count: 1 },
  {
    metadata: { reason: 'user_request' },
    provenance: {
      task_id: 'task-1',
      step_id: 'step-1',
      timestamp: new Date(),
    },
  }
);

// Verify integrity
const isValid = await auditLog.verifyEntry(entry.id);

// Query by actor
const actorEntries = await auditLog.queryByActor('agent-1');

// Query by time range
const recentEntries = await auditLog.queryByTimeRange(
  new Date('2024-01-01'),
  new Date('2024-12-31')
);

await auditLog.close();
```

## Testing

Tests are automatically skipped if no database is configured.

```bash
# Run tests with database
export DATABASE_URL="postgresql://aureus:password@localhost:5432/aureus_test"
npm test

# Tests will skip if DATABASE_URL is not set
npm test
```

## Persistence Guarantees

### Atomicity
- Each state update is wrapped in a transaction
- Either all changes commit or none do
- No partial state updates

### Consistency
- Foreign key constraints ensure referential integrity
- Check constraints validate data types and values
- Workflow-task relationships always consistent

### Isolation
- Multi-tenant isolation via tenant_id
- Row-level queries filter by tenant
- No cross-tenant data leakage

### Durability
- All committed changes survive crashes
- Write-ahead logging (WAL) in PostgreSQL
- Point-in-time recovery possible

### Recoverability
- Workflows resume from last checkpoint
- Complete audit trail for debugging
- Snapshots enable rollback to verified states

## Performance Considerations

### Indexes
- All primary keys and foreign keys are indexed
- GIN indexes on array columns (tags, source_event_ids)
- Composite indexes on frequently queried columns

### Connection Pooling
- Configurable min/max pool size
- Automatic connection reuse
- Idle connection timeout

### Query Optimization
- Prepared statements for all queries
- JSONB for flexible schema evolution
- Efficient time-range queries with indexed timestamps

## Production Recommendations

1. **Enable SSL**: Set `DATABASE_SSL=true` for encrypted connections
2. **Connection Pooling**: Tune `DATABASE_POOL_MAX` based on load
3. **Backups**: Regular automated backups of the database
4. **Monitoring**: Track connection pool usage and query performance
5. **Replication**: Use PostgreSQL replication for high availability
6. **Vacuuming**: Regular VACUUM to reclaim storage and update statistics

## Troubleshooting

### Connection Issues

```bash
# Test connection
psql -U aureus -d aureus -c "SELECT NOW();"

# Check if PostgreSQL is running
sudo systemctl status postgresql

# View logs
tail -f /var/log/postgresql/postgresql-15-main.log
```

### Schema Issues

```bash
# Drop and recreate tables (development only)
psql -U aureus -d aureus -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"

# Re-run migrations
psql -U aureus -d aureus -f packages/kernel/src/db-schema.sql
psql -U aureus -d aureus -f packages/memory-hipcortex/src/db-schema.sql
```

### Performance Issues

```sql
-- Check slow queries
SELECT * FROM pg_stat_statements ORDER BY total_time DESC LIMIT 10;

-- Check connection pool usage
SELECT count(*) FROM pg_stat_activity WHERE datname = 'aureus';

-- Analyze table statistics
ANALYZE workflow_states;
ANALYZE task_states;
ANALYZE memory_entries;
ANALYZE audit_log_entries;
```

## Migration from In-Memory

To migrate from in-memory to PostgreSQL:

1. Set up PostgreSQL database
2. Configure environment variables
3. Run schema migrations
4. Restart application
5. Existing in-memory data is not migrated automatically

For data migration, export from in-memory and import to PostgreSQL programmatically.

## Additional Resources

- [Installation Guide](../../docs/installation.md)
- [Solution Documentation](../../solution.md)
- [Environment Variables](../../docs/environment-variables.md)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
