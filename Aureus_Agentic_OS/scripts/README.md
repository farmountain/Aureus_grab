# Aureus Deployment Scripts

This directory contains helper scripts for deployment automation, backup, and disaster recovery.

## Scripts Overview

### Backup Scripts

#### `backup-events.sh`

Backs up event logs to local storage and optionally to S3.

**Usage:**
```bash
# Basic usage with defaults
./scripts/backup-events.sh

# Custom configuration
BACKUP_DIR=/backups/events \
EVENT_DIR=./var/run \
S3_BUCKET=my-bucket \
RETENTION_DAYS=90 \
./scripts/backup-events.sh
```

**Environment Variables:**
- `BACKUP_DIR` - Local backup directory (default: `/backups/events`)
- `EVENT_DIR` - Event logs directory (default: `./var/run`)
- `S3_BUCKET` - S3 bucket for remote backups (default: `aureus-backups`)
- `RETENTION_DAYS` - Days to keep local backups (default: `30`)

**Features:**
- Creates compressed tar.gz archive
- Verifies backup integrity
- Uploads to S3 (if configured)
- Automatic cleanup of old backups
- Color-coded output

#### `backup-state.sh`

Backs up state stores (PostgreSQL, Redis, or file-based) to local storage and optionally to S3.

**Usage:**
```bash
# File-based state store
./scripts/backup-state.sh

# PostgreSQL state store
DATABASE_URL=postgresql://user:pass@host/db ./scripts/backup-state.sh

# Redis state store
REDIS_URL=redis://host:6379 ./scripts/backup-state.sh

# With custom configuration
BACKUP_DIR=/backups/state \
STATE_DIR=./var/aureus/state \
S3_BUCKET=my-bucket \
./scripts/backup-state.sh
```

**Environment Variables:**
- `BACKUP_DIR` - Local backup directory (default: `/backups/state`)
- `STATE_DIR` - State directory for file-based stores (default: `./var/aureus/state`)
- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_URL` - Redis connection string
- `S3_BUCKET` - S3 bucket for remote backups (default: `aureus-backups`)
- `RETENTION_DAYS` - Days to keep local backups (default: `30`)

**Features:**
- Auto-detects store type (PostgreSQL, Redis, or file-based)
- Creates appropriate backup format (pg_dump, redis RDB, or tar.gz)
- Uploads to S3 (if configured)
- Automatic cleanup of old backups

### Restore Scripts

#### `restore-events.sh`

Restores event logs from backup.

**Usage:**
```bash
# From local file
./scripts/restore-events.sh events-backup-20240103-120000.tar.gz

# From S3
./scripts/restore-events.sh s3://aureus-backups/events/events-backup-20240103-120000.tar.gz

# Custom event directory
EVENT_DIR=./var/run ./scripts/restore-events.sh backup.tar.gz
```

**Environment Variables:**
- `EVENT_DIR` - Event logs directory (default: `./var/run`)

**Features:**
- Supports local and S3 backup files
- Verifies backup integrity before restoring
- Creates backup of current state before restore
- Automatic rollback on failure
- Sets proper file permissions

#### `restore-state.sh`

Restores state stores from backup.

**Usage:**
```bash
# File-based state store
./scripts/restore-state.sh state-backup-20240103-120000.tar.gz

# PostgreSQL state store
DATABASE_URL=postgresql://user:pass@host/db \
./scripts/restore-state.sh state-postgres-20240103-120000.dump

# Redis state store
REDIS_URL=redis://host:6379 \
./scripts/restore-state.sh state-redis-20240103-120000.rdb

# From S3
./scripts/restore-state.sh s3://aureus-backups/state/state-backup-20240103-120000.tar.gz
```

**Environment Variables:**
- `STATE_DIR` - State directory for file-based stores (default: `./var/aureus/state`)
- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_URL` - Redis connection string

**Features:**
- Auto-detects backup type from filename
- Supports PostgreSQL, Redis, and file-based restores
- Creates backup of current state before restore
- Automatic rollback on failure
- Handles Redis service restart (requires sudo for systemctl)

## Automated Backup Schedule

### Using Cron

Create a crontab entry for automated backups:

```bash
# Edit crontab
crontab -e

# Add these entries:

# Backup event logs every hour
0 * * * * /path/to/Aureus_Agentic_OS/scripts/backup-events.sh >> /var/log/aureus/backup-events.log 2>&1

# Backup state store every 6 hours
0 */6 * * * /path/to/Aureus_Agentic_OS/scripts/backup-state.sh >> /var/log/aureus/backup-state.log 2>&1

# Full backup daily at 2 AM
0 2 * * * /path/to/Aureus_Agentic_OS/scripts/backup-events.sh && /path/to/Aureus_Agentic_OS/scripts/backup-state.sh >> /var/log/aureus/backup-full.log 2>&1
```

### Using Systemd Timers

Create systemd timer units for more control:

**`/etc/systemd/system/aureus-backup-events.service`:**
```ini
[Unit]
Description=Aureus Event Log Backup
After=network.target

[Service]
Type=oneshot
User=aureus
WorkingDirectory=/opt/aureus
ExecStart=/opt/aureus/scripts/backup-events.sh
StandardOutput=journal
StandardError=journal
```

**`/etc/systemd/system/aureus-backup-events.timer`:**
```ini
[Unit]
Description=Aureus Event Log Backup Timer
Requires=aureus-backup-events.service

[Timer]
OnCalendar=hourly
Persistent=true

[Install]
WantedBy=timers.target
```

**Enable and start:**
```bash
sudo systemctl daemon-reload
sudo systemctl enable aureus-backup-events.timer
sudo systemctl start aureus-backup-events.timer
```

## Disaster Recovery Workflow

### Complete System Restore

```bash
# 1. Stop all services
systemctl stop aureus-console
systemctl stop postgresql
systemctl stop redis

# 2. Restore state store
./scripts/restore-state.sh s3://aureus-backups/state/state-backup-latest.tar.gz

# 3. Restore event logs
./scripts/restore-events.sh s3://aureus-backups/events/events-backup-latest.tar.gz

# 4. Verify data integrity
npm test

# 5. Start services
systemctl start postgresql
systemctl start redis
systemctl start aureus-console

# 6. Verify application health
curl http://localhost:3000/health
```

### Rollback to Previous State

```bash
# Find available backups
aws s3 ls s3://aureus-backups/state/ | grep state-backup

# Restore specific backup
./scripts/restore-state.sh s3://aureus-backups/state/state-backup-20240102-120000.tar.gz
./scripts/restore-events.sh s3://aureus-backups/events/events-backup-20240102-120000.tar.gz

# Restart services
systemctl restart aureus-console
```

## NPM Scripts Integration

These scripts are integrated with npm commands in the root `package.json`:

```bash
# Create backup
npm run backup:state

# Restore from backup
npm run restore:state <backup-file>
```

And in `apps/console/package.json`:

```bash
# Console-specific backup
cd apps/console
npm run backup
```

## S3 Configuration

To enable S3 backups, configure AWS credentials:

```bash
# Using AWS CLI configuration
aws configure

# Or using environment variables
export AWS_ACCESS_KEY_ID=your-key
export AWS_SECRET_ACCESS_KEY=your-secret
export AWS_DEFAULT_REGION=us-east-1

# Or using IAM role (recommended for EC2)
# Attach IAM role with S3 permissions to EC2 instance
```

**Required S3 permissions:**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:ListBucket",
        "s3:DeleteObject"
      ],
      "Resource": [
        "arn:aws:s3:::aureus-backups/*",
        "arn:aws:s3:::aureus-backups"
      ]
    }
  ]
}
```

## Troubleshooting

### Backup fails with "Permission denied"

```bash
# Ensure scripts are executable
chmod +x scripts/*.sh

# Check directory permissions
ls -la /backups/
sudo chown $USER:$USER /backups/
```

### S3 upload fails

```bash
# Verify AWS credentials
aws sts get-caller-identity

# Test S3 access
aws s3 ls s3://aureus-backups/

# Check bucket policy
aws s3api get-bucket-policy --bucket aureus-backups
```

### PostgreSQL restore fails

```bash
# Check database connectivity
psql $DATABASE_URL -c "SELECT 1;"

# Verify backup file
pg_restore --list backup.dump

# Try restore with verbose output
pg_restore -d $DATABASE_URL -v backup.dump
```

### Redis restore fails

```bash
# Check Redis connectivity
redis-cli PING

# Verify dump.rdb format
file dump.rdb

# Check Redis permissions
ls -la /var/lib/redis/dump.rdb
sudo chown redis:redis /var/lib/redis/dump.rdb
```

## Security Considerations

1. **Encrypt backups:** Use AWS S3 server-side encryption or client-side encryption
2. **Secure credentials:** Store database passwords in environment variables or secrets manager
3. **Restrict access:** Set appropriate file permissions (600) for backup files
4. **Audit logs:** Enable logging for backup and restore operations
5. **Test restores:** Regularly test restore procedures in non-production environment

## Best Practices

1. **Test backups regularly:** Perform test restores monthly
2. **Multiple backup locations:** Keep backups in multiple regions/providers
3. **Retention policy:** Follow 3-2-1 rule (3 copies, 2 media types, 1 offsite)
4. **Monitor backups:** Set up alerts for backup failures
5. **Document procedures:** Keep runbooks updated with recovery procedures
6. **Version backups:** Include timestamps and version information
7. **Verify integrity:** Always verify backup integrity after creation

## See Also

- [Deployment Guide](../docs/deployment.md) - Complete deployment documentation
- [DEPLOYMENT_IMPLEMENTATION_SUMMARY.md](../DEPLOYMENT_IMPLEMENTATION_SUMMARY.md) - Implementation details
- [Production Readiness](../docs/production_readiness.md) - Production checklist
