# Aureus Operations (ops) Directory

This directory contains operational scripts and tools for deployment automation, health monitoring, and rollback procedures.

## Directory Structure

```
ops/
├── health-checks/          # Health check scripts
│   ├── console-health.sh
│   ├── state-store-health.sh
│   └── full-system-health.sh
├── verification/           # Pre/post-deployment verification
│   ├── pre-deployment.sh
│   └── post-deployment.sh
└── rollback/              # Rollback automation
    ├── automated-rollback.sh
    └── emergency-rollback.sh
```

## Health Checks

### Console Health Check

Verifies console application health and readiness.

```bash
# Basic usage
./ops/health-checks/console-health.sh

# With custom configuration
CONSOLE_URL=https://console.example.com \
TIMEOUT=15 \
MAX_RETRIES=5 \
./ops/health-checks/console-health.sh
```

**Environment Variables:**
- `CONSOLE_URL` - Console URL (default: `http://localhost:3000`)
- `TIMEOUT` - Request timeout in seconds (default: `10`)
- `MAX_RETRIES` - Maximum retry attempts (default: `3`)

**Checks:**
- Health endpoint (`/health`)
- Readiness endpoint (`/ready`)
- Liveness endpoint (`/live`)
- Detailed component health

### State Store Health Check

Verifies state store connectivity and performance.

```bash
# File-based state store
./ops/health-checks/state-store-health.sh

# PostgreSQL
STATE_STORE_TYPE=postgres \
DATABASE_URL=postgresql://user:pass@host/db \
./ops/health-checks/state-store-health.sh

# Redis
STATE_STORE_TYPE=redis \
REDIS_URL=redis://host:6379 \
./ops/health-checks/state-store-health.sh
```

**Environment Variables:**
- `STATE_STORE_TYPE` - Store type: `file`, `postgres`, `redis` (default: `file`)
- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_URL` - Redis connection string
- `LATENCY_THRESHOLD` - Maximum acceptable latency in ms (default: `1000`)

**Checks:**
- Connectivity
- Latency
- Disk/memory usage
- Basic operations

### Full System Health Check

Comprehensive health check for all components.

```bash
./ops/health-checks/full-system-health.sh
```

Runs all health checks in sequence and provides a summary.

## Verification Scripts

### Pre-Deployment Verification

Runs comprehensive checks before deployment.

```bash
# Basic usage
ENVIRONMENT=staging \
VERSION=v1.2.3 \
./ops/verification/pre-deployment.sh

# Skip specific checks
VERIFY_TESTS=false \
VERIFY_SECURITY=false \
./ops/verification/pre-deployment.sh
```

**Environment Variables:**
- `ENVIRONMENT` - Target environment: `staging`, `production` (default: `staging`)
- `VERSION` - Version to deploy (semantic versioning)
- `VERIFY_BUILD` - Verify build artifacts (default: `true`)
- `VERIFY_TESTS` - Run tests (default: `true`)
- `VERIFY_SECURITY` - Run security checks (default: `true`)

**Checks:**
- Version format validation
- Environment configuration
- Build artifacts
- Test suite
- Security vulnerabilities
- Code quality

### Post-Deployment Verification

Verifies deployment success and service health.

```bash
# Basic usage
ENVIRONMENT=staging \
VERSION=v1.2.3 \
CONSOLE_URL=https://staging.example.com \
./ops/verification/post-deployment.sh

# With custom wait time
WAIT_TIME=60 \
SMOKE_TESTS=true \
./ops/verification/post-deployment.sh
```

**Environment Variables:**
- `CONSOLE_URL` - Console URL (default: `http://localhost:3000`)
- `ENVIRONMENT` - Target environment (default: `staging`)
- `VERSION` - Expected version
- `SMOKE_TESTS` - Run smoke tests (default: `true`)
- `WAIT_TIME` - Max wait time for service ready in seconds (default: `30`)

**Checks:**
- Service readiness
- Version verification
- Smoke tests
- Database connectivity
- Error logs
- Metrics collection

## Rollback Automation

### Automated Rollback

Performs automated rollback to a previous version or snapshot.

```bash
# Rollback to specific version
ENVIRONMENT=production \
ROLLBACK_VERSION=v1.2.2 \
./ops/rollback/automated-rollback.sh

# Rollback to snapshot
ROLLBACK_SNAPSHOT=snapshot-abc123 \
./ops/rollback/automated-rollback.sh

# Dry run (preview changes)
DRY_RUN=true \
ROLLBACK_VERSION=v1.2.2 \
./ops/rollback/automated-rollback.sh
```

**Environment Variables:**
- `ENVIRONMENT` - Target environment (default: `staging`)
- `ROLLBACK_VERSION` - Version to rollback to
- `ROLLBACK_SNAPSHOT` - Snapshot ID to rollback to
- `CONSOLE_URL` - Console URL (default: `http://localhost:3000`)
- `BACKUP_DIR` - Backup directory (default: `/backups`)
- `DRY_RUN` - Preview changes without executing (default: `false`)
- `AUTH_TOKEN` - Authorization token for API calls

**Process:**
1. Create pre-rollback backup
2. Stop services
3. Restore version or snapshot
4. Start services
5. Verify rollback success
6. Send notifications

### Emergency Rollback

Fast rollback for critical issues with minimal checks.

```bash
# Emergency rollback to last backup
./ops/rollback/emergency-rollback.sh
```

**Environment Variables:**
- `BACKUP_DIR` - Backup directory (default: `/backups`)

**Process:**
1. Find most recent backup
2. Stop all services immediately
3. Restore state and events
4. Restart services
5. Basic health check

**Warning:** This script prioritizes speed over safety. Use only in emergencies when the system is critically broken.

## Integration with CI/CD

### GitHub Actions Integration

The scripts can be integrated into GitHub Actions workflows:

```yaml
jobs:
  pre-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Pre-deployment verification
        run: |
          ENVIRONMENT=staging \
          VERSION=${{ github.event.inputs.version }} \
          ./ops/verification/pre-deployment.sh

  deploy:
    needs: pre-deploy
    runs-on: ubuntu-latest
    steps:
      # ... deployment steps ...
      
  post-deploy:
    needs: deploy
    runs-on: ubuntu-latest
    steps:
      - name: Post-deployment verification
        run: |
          CONSOLE_URL=${{ secrets.STAGING_URL }} \
          ENVIRONMENT=staging \
          VERSION=${{ github.event.inputs.version }} \
          ./ops/verification/post-deployment.sh

  rollback:
    if: failure()
    needs: post-deploy
    runs-on: ubuntu-latest
    steps:
      - name: Automated rollback
        run: |
          ROLLBACK_VERSION=${{ github.event.inputs.previous_version }} \
          ./ops/rollback/automated-rollback.sh
```

### Systemd Integration

Create systemd services for health monitoring:

```ini
# /etc/systemd/system/aureus-health-check.service
[Unit]
Description=Aureus Health Check
After=aureus-console.service

[Service]
Type=oneshot
User=aureus
WorkingDirectory=/opt/aureus
ExecStart=/opt/aureus/ops/health-checks/full-system-health.sh
StandardOutput=journal

[Install]
WantedBy=multi-user.target
```

```ini
# /etc/systemd/system/aureus-health-check.timer
[Unit]
Description=Aureus Health Check Timer

[Timer]
OnBootSec=5min
OnUnitActiveSec=5min
Persistent=true

[Install]
WantedBy=timers.target
```

### Cron Integration

Schedule regular health checks:

```bash
# Check health every 5 minutes
*/5 * * * * /opt/aureus/ops/health-checks/full-system-health.sh >> /var/log/aureus/health-check.log 2>&1
```

## Monitoring and Alerting

All scripts produce structured output suitable for log aggregation and monitoring:

- **Exit codes:** `0` = success, `1` = failure
- **Log levels:** INFO, WARN, ERROR
- **Color-coded output** for terminal viewing
- **Structured logging** for parsing

### Log Analysis

Extract metrics from health check logs:

```bash
# Count failures in last 24 hours
grep "Health Check: FAILED" /var/log/aureus/health-check.log | wc -l

# Get average response time
grep "latency:" /var/log/aureus/health-check.log | awk '{sum+=$NF; count++} END {print sum/count}'
```

### Prometheus Integration

Health check metrics can be exposed for Prometheus:

```bash
# Export health check status as Prometheus metric
echo "aureus_health_check_success $(./ops/health-checks/console-health.sh >/dev/null 2>&1 && echo 1 || echo 0)" > /var/lib/node_exporter/health_check.prom
```

## Troubleshooting

### Health Check Fails

1. **Check service status:**
   ```bash
   systemctl status aureus-console
   curl http://localhost:3000/health
   ```

2. **Review logs:**
   ```bash
   journalctl -u aureus-console -n 100
   tail -f /var/log/aureus/console.log
   ```

3. **Verify configuration:**
   ```bash
   cat /etc/aureus/config.json
   env | grep AUREUS
   ```

### Deployment Verification Fails

1. **Check deployment logs:**
   ```bash
   tail -f /var/log/aureus/deployment.log
   ```

2. **Verify version:**
   ```bash
   curl http://localhost:3000/api/version
   ```

3. **Check for errors:**
   ```bash
   grep ERROR /var/log/aureus/*.log
   ```

### Rollback Fails

1. **Check backup availability:**
   ```bash
   ls -lh /backups/state/
   ls -lh /backups/events/
   ```

2. **Verify permissions:**
   ```bash
   ls -la /opt/aureus/apps/console/dist
   ```

3. **Manual rollback:**
   ```bash
   # Stop services
   systemctl stop aureus-console
   
   # Restore manually
   ./scripts/restore-state.sh /backups/state/latest.tar.gz
   
   # Restart services
   systemctl start aureus-console
   ```

## Best Practices

1. **Regular Health Checks:** Run health checks every 5 minutes in production
2. **Pre-deployment Testing:** Always run pre-deployment verification before deploying
3. **Post-deployment Verification:** Verify deployments immediately after completion
4. **Backup Before Rollback:** Always create a backup before performing rollback
5. **Monitor Exit Codes:** Use exit codes to trigger alerts and automated actions
6. **Test Rollback Procedures:** Regularly test rollback in non-production environments
7. **Keep Backups:** Maintain multiple backup versions for rollback options
8. **Log Everything:** Ensure all operations are logged for audit and debugging
9. **Use Dry Run:** Test rollback procedures with `DRY_RUN=true` first
10. **Emergency Procedures:** Document and practice emergency rollback procedures

## See Also

- [Deployment Guide](../docs/deployment.md) - Complete deployment documentation
- [Backup Scripts](../scripts/README.md) - Backup and restore procedures
- [DEPLOYMENT_IMPLEMENTATION_SUMMARY.md](../DEPLOYMENT_IMPLEMENTATION_SUMMARY.md) - Implementation details
- [Production Readiness](../docs/production_readiness.md) - Production checklist
