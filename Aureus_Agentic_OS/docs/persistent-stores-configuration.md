# Persistent Stores Configuration Guide

This guide covers how to configure persistent state stores and event logs in Aureus for production deployments.

## Overview

Aureus provides two key storage components that can be configured for persistence:

1. **State Store**: Stores workflow and task state for durability and recovery
2. **Event Log**: Append-only log of all events for auditability and compliance

## State Store Configuration

### Available Implementations

Aureus provides two state store implementations:

- **InMemoryStateStore**: For development and testing (default for dev)
- **PostgresStateStore**: For production use with ACID guarantees

### Configuration Options

#### Environment Variables

```bash
# State store type: "in-memory" or "postgres"
export STATE_STORE_TYPE="postgres"

# PostgreSQL connection string (recommended)
export DATABASE_URL="postgresql://user:password@host:port/database"

# Alternative: Individual connection parameters
export DATABASE_HOST="localhost"
export DATABASE_PORT="5432"
export DATABASE_NAME="aureus"
export DATABASE_USER="aureus"
export DATABASE_PASSWORD="your-secure-password"

# Optional: Connection pool settings
export DATABASE_POOL_MAX="20"        # Maximum pool size (default: 20)
export DATABASE_POOL_MIN="2"         # Minimum pool size (default: 2)
export DATABASE_SSL="true"           # Enable SSL for production (default: false)
export DATABASE_TIMEOUT="30000"      # Connection timeout in ms (default: 30000)
export DATABASE_IDLE_TIMEOUT="10000" # Idle timeout in ms (default: 10000)
```

#### CLI Flags

```bash
# Specify state store type via command line
aureus run workflow.yaml --state-store-type postgres

# With other options
aureus run workflow.yaml --state-store-type postgres --event-log-dir /var/log/aureus
```

#### Programmatic Configuration

```typescript
import { WorkflowOrchestrator, PostgresStateStore, FileSystemEventLog } from '@aureus/kernel';

// Configure PostgreSQL state store
const stateStore = new PostgresStateStore({
  host: 'localhost',
  port: 5432,
  database: 'aureus',
  user: 'aureus',
  password: 'your-password',
  max: 20,
  min: 2,
  ssl: false,
});

// Initialize schema (run migrations)
await stateStore.initialize(schemaSQL);

// Create orchestrator with persistent stores
const orchestrator = new WorkflowOrchestrator(
  stateStore,
  executor,
  eventLog  // Optional, defaults to FileSystemEventLog
);

// Don't forget to close the pool when done
await stateStore.close();
```

### PostgreSQL Schema

The PostgreSQL state store schema is located in `packages/kernel/src/db-schema.sql` and includes:

- `workflow_states` table: Stores workflow metadata and status
- `task_states` table: Stores individual task state and results
- `deployments` table: Stores deployment metadata
- `workflow_versions` table: Stores versioned workflow definitions

The schema supports:
- Tenant isolation via `tenant_id` column
- Automatic timestamps (created_at, updated_at)
- JSONB columns for flexible data storage
- Proper indexes for query performance

### Production Recommendations

For production deployments using PostgreSQL:

1. **Use connection pooling**: Set appropriate `DATABASE_POOL_MAX` based on your load
2. **Enable SSL**: Set `DATABASE_SSL=true` for secure connections
3. **Configure backups**: Set up regular PostgreSQL backups
4. **Monitor connections**: Watch for connection pool exhaustion
5. **Use read replicas**: For read-heavy workloads, consider read replicas
6. **Set up monitoring**: Monitor database metrics (connections, query time, disk usage)

## Event Log Configuration

### Available Implementations

Aureus provides two event log implementations:

- **InMemoryEventLog**: For testing only (data lost on restart)
- **FileSystemEventLog**: For production use (default since v0.1.0)

### Configuration Options

#### Environment Variables

```bash
# Event log type: currently only "filesystem" is supported
export EVENT_LOG_TYPE="filesystem"

# Event log directory (default: ./var/run)
export EVENT_LOG_DIR="/var/log/aureus/events"
```

#### CLI Flags

```bash
# Specify event log directory via command line
aureus run workflow.yaml --event-log-dir /var/log/aureus/events

# Combine with state store configuration
aureus run workflow.yaml \
  --state-store-type postgres \
  --event-log-dir /var/log/aureus/events
```

#### Programmatic Configuration

```typescript
import { FileSystemEventLog } from '@aureus/kernel';

// Create event log with custom directory
const eventLog = new FileSystemEventLog('/var/log/aureus/events');

// Use with orchestrator
const orchestrator = new WorkflowOrchestrator(
  stateStore,
  executor,
  eventLog
);
```

### Event Log Structure

Event logs are stored in a hierarchical directory structure:

```
<EVENT_LOG_DIR>/
├── workflow-id-1/
│   └── events.log
├── workflow-id-2/
│   └── events.log
└── workflow-id-3/
    └── events.log
```

Each `events.log` file contains one JSON event per line (JSONL format):

```json
{"timestamp":"2026-01-13T00:00:00.000Z","type":"WORKFLOW_STARTED","workflowId":"workflow-1","data":{"name":"Example Workflow"}}
{"timestamp":"2026-01-13T00:00:01.000Z","type":"TASK_STARTED","workflowId":"workflow-1","taskId":"task-1","metadata":{"attempt":1}}
{"timestamp":"2026-01-13T00:00:02.000Z","type":"TASK_COMPLETED","workflowId":"workflow-1","taskId":"task-1","metadata":{"attempt":1,"duration":1000}}
```

### Production Recommendations

For production deployments using FileSystemEventLog:

1. **Use dedicated disk**: Mount a dedicated volume for event logs
2. **Monitor disk space**: Set up alerts for disk usage thresholds
3. **Implement log rotation**: Archive old event logs to prevent disk exhaustion
4. **Set proper permissions**: Ensure the Aureus process has write permissions
5. **Configure backups**: Include event logs in your backup strategy
6. **Consider log aggregation**: Ship logs to a centralized logging system (ELK, Splunk, etc.)
7. **Enable compression**: Use filesystem-level compression for log directories

## Default Behavior

As of Aureus v0.1.0, the default behavior is:

- **State Store**: In-memory (unless `STATE_STORE_TYPE=postgres` or `DATABASE_URL` is set)
- **Event Log**: Persistent filesystem-based (`FileSystemEventLog`) at `./var/run`

### Why FileSystemEventLog is the Default

The `FileSystemEventLog` is used as the default (instead of `InMemoryEventLog`) because:

1. **Auditability**: Event logs must persist across restarts for compliance
2. **Debugging**: Persistent logs enable post-mortem debugging
3. **Recovery**: Event logs can be used to reconstruct workflow history
4. **Production-ready**: Filesystem logs work well for most production scenarios

For applications that need in-memory event logs (e.g., testing), explicitly pass `InMemoryEventLog`:

```typescript
import { InMemoryEventLog } from '@aureus/kernel';

const eventLog = new InMemoryEventLog();
const orchestrator = new WorkflowOrchestrator(stateStore, executor, eventLog);
```

## Configuration Examples

### Development Setup

```bash
# .env.development
STATE_STORE_TYPE=in-memory
EVENT_LOG_TYPE=filesystem
EVENT_LOG_DIR=./var/run
```

### Staging Setup

```bash
# .env.staging
STATE_STORE_TYPE=postgres
DATABASE_URL=postgresql://aureus:password@staging-db:5432/aureus
DATABASE_POOL_MAX=10
DATABASE_SSL=true
EVENT_LOG_TYPE=filesystem
EVENT_LOG_DIR=/var/log/aureus/staging/events
```

### Production Setup

```bash
# .env.production
STATE_STORE_TYPE=postgres
DATABASE_URL=postgresql://aureus:password@prod-db:5432/aureus
DATABASE_POOL_MAX=20
DATABASE_POOL_MIN=5
DATABASE_SSL=true
DATABASE_TIMEOUT=30000
EVENT_LOG_TYPE=filesystem
EVENT_LOG_DIR=/var/log/aureus/production/events
```

## Migration Guide

### From In-Memory to PostgreSQL

To migrate from in-memory state store to PostgreSQL:

1. Set up PostgreSQL database (see [installation.md](./installation.md))
2. Run database migrations:
   ```bash
   psql -U aureus -d aureus -f packages/kernel/src/db-schema.sql
   ```
3. Update environment variables:
   ```bash
   export STATE_STORE_TYPE=postgres
   export DATABASE_URL=postgresql://aureus:password@localhost:5432/aureus
   ```
4. Restart your application
5. Verify state persistence by interrupting and resuming workflows

### Testing Persistence

To verify that state persistence is working:

```bash
# Start a long-running workflow
aureus run long-workflow.yaml &
PID=$!

# Wait a few seconds for some tasks to complete
sleep 5

# Kill the process
kill $PID

# Resume the workflow - it should continue from where it left off
aureus run long-workflow.yaml
```

## Monitoring and Maintenance

### State Store Monitoring

Monitor these metrics for PostgreSQL state store:

- Active connections (`pg_stat_activity`)
- Query execution time
- Table sizes and growth rate
- Index usage
- Replication lag (if using replicas)

### Event Log Monitoring

Monitor these metrics for filesystem event logs:

- Disk space usage in `EVENT_LOG_DIR`
- Number of event log files
- Average event log file size
- Write throughput and latency
- Inode usage (many small files)

### Backup Strategy

1. **State Store (PostgreSQL)**:
   - Use `pg_dump` for regular backups
   - Configure WAL archiving for point-in-time recovery
   - Test restore procedures regularly

2. **Event Logs**:
   - Use filesystem snapshots or rsync for backups
   - Archive old logs to object storage (S3, etc.)
   - Implement retention policies based on compliance requirements

## Troubleshooting

### Common Issues

1. **"Could not initialize database schema"**
   - Check database connection parameters
   - Verify user has CREATE TABLE permissions
   - Check PostgreSQL logs for detailed errors

2. **"ENOENT: no such file or directory"**
   - Ensure `EVENT_LOG_DIR` exists or can be created
   - Check filesystem permissions
   - Verify disk space availability

3. **"too many clients already"**
   - Reduce `DATABASE_POOL_MAX`
   - Increase PostgreSQL `max_connections`
   - Check for connection leaks

4. **Event logs growing too large**
   - Implement log rotation
   - Archive old logs
   - Consider log aggregation system

## Related Documentation

- [Installation Guide](./installation.md)
- [Production Readiness Checklist](./production_readiness.md)
- [Deployment Guide](./deployment.md)
- [Security Model](./security_model.md)
