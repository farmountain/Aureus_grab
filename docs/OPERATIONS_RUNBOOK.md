# Aureus Sentinel - Operations Runbook

Comprehensive operational procedures for day-to-day management of the Aureus Sentinel platform.

## Table of Contents

- [Daily Operations](#daily-operations)
- [Deployment Procedures](#deployment-procedures)
- [Scaling Operations](#scaling-operations)
- [Backup & Restore](#backup--restore)
- [Monitoring & Alerting](#monitoring--alerting)
- [Troubleshooting](#troubleshooting)
- [Maintenance Windows](#maintenance-windows)
- [On-Call Procedures](#on-call-procedures)

---

## Daily Operations

### Morning Checklist (Business Hours Start)

```bash
# 1. Check overall system health
kubectl get pods -n aureus
docker-compose -f docker-compose-full.yml ps

# 2. Review overnight alerts
# Check Slack #aureus-alerts channel
# Check PagerDuty dashboard

# 3. Check Grafana dashboards
# Open http://localhost:3001 (or prod grafana URL)
# Review "System Overview" dashboard

# 4. Verify metrics are normal
# - All services UP
# - Error rate < 1%
# - Latency within normal ranges
# - No active critical alerts

# 5. Review logs for anomalies
# Query Loki for ERROR level logs
{job=~"bridge|aureus-os|openclaw"} |= "ERROR"

# 6. Check backup status
# Verify last night's backup completed
kubectl get cronjobs -n aureus
```

### Evening Checklist (Business Hours End)

```bash
# 1. Review day's metrics
# - Total requests processed
# - Peak latency times
# - Any incidents occurred

# 2. Check resource utilization trends
# - CPU usage trending
# - Memory usage trending
# - Disk space status

# 3. Verify monitoring is operational
# - Prometheus scraping
# - Grafana accessible
# - Alerts firing test (if implemented)

# 4. Update on-call handoff
# - Document any ongoing issues
# - Note any follow-up tasks
# - Update team Slack channel
```

---

## Deployment Procedures

### Standard Deployment (Non-Critical Hours)

**Prerequisites:**
- Code reviewed and approved
- Tests passing (CI/CD green)
- Change request approved (if required)
- Rollback plan identified

**Procedure:**

```bash
# 1. Backup current state
kubectl get deployment -n aureus -o yaml > backup-$(date +%Y%m%d-%H%M%S).yaml

# 2. Deploy to staging first
kubectl apply -f k8s/ -n aureus-staging
./scripts/deploy.sh staging kubernetes

# 3. Validate staging deployment
# Run smoke tests
curl https://staging.aureus-sentinel.com/health
# Check metrics for 15 minutes

# 4. Deploy to production
kubectl apply -f k8s/ -n aureus
./scripts/deploy.sh production kubernetes

# 5. Monitor deployment
kubectl rollout status deployment/bridge -n aureus
kubectl rollout status deployment/aureus-os -n aureus
kubectl rollout status deployment/openclaw -n aureus

# 6. Validate production
# Run automated tests
# Check Grafana for anomalies
# Monitor error rates for 30 minutes

# 7. Document deployment
# Update change log
# Notify team in Slack
```

**Rollback Procedure:**

```bash
# If issues detected within 30 minutes of deployment
kubectl rollout undo deployment/bridge -n aureus
kubectl rollout undo deployment/aureus-os -n aureus
kubectl rollout undo deployment/openclaw -n aureus

# Verify rollback
kubectl rollout status deployment/bridge -n aureus

# Notify team of rollback
# Post in #aureus-alerts with reason
```

### Emergency Hotfix Deployment

For critical security or stability fixes:

```bash
# 1. Fast-track approval (verbal OK from Engineering Manager + On-Call Lead)

# 2. Deploy directly to production (skip staging if P0)
kubectl apply -f k8s/hotfix/ -n aureus

# 3. Monitor closely for 1 hour
# Watch error rates, latency, logs

# 4. Follow-up: deploy to staging afterward for consistency
kubectl apply -f k8s/hotfix/ -n aureus-staging

# 5. Document in post-mortem
# Why hotfix was needed
# What was changed
# Impact and resolution
```

---

## Scaling Operations

### Manual Scaling

**Scale Up (Increased Traffic):**

```bash
# Bridge
kubectl scale deployment/bridge --replicas=5 -n aureus

# Aureus OS
kubectl scale deployment/aureus-os --replicas=7 -n aureus

# OpenClaw
kubectl scale deployment/openclaw --replicas=5 -n aureus

# Verify scaling
kubectl get pods -n aureus -w
```

**Scale Down (Resource Optimization):**

```bash
# Return to baseline (3 replicas)
kubectl scale deployment/bridge --replicas=3 -n aureus
kubectl scale deployment/aureus-os --replicas=3 -n aureus
kubectl scale deployment/openclaw --replicas=3 -n aureus
```

### Horizontal Pod Autoscaler (HPA)

**Enable HPA:**

```bash
# Already configured for Aureus OS in k8s/aureus-os-deployment.yaml
# Monitor HPA status
kubectl get hpa -n aureus

# View HPA events
kubectl describe hpa aureus-os-hpa -n aureus
```

**Adjust HPA Thresholds:**

```bash
# Edit HPA configuration
kubectl edit hpa aureus-os-hpa -n aureus

# Modify target CPU utilization
# spec.metrics[0].resource.target.averageUtilization: 70
```

### Database Scaling

**PostgreSQL:**

```bash
# Vertical scaling (increase instance size)
# If using RDS:
aws rds modify-db-instance \
  --db-instance-identifier aureus-postgres \
  --db-instance-class db.r5.xlarge \
  --apply-immediately

# Connection pool tuning
kubectl exec -it postgres-0 -n aureus -- psql -U aureus
ALTER SYSTEM SET max_connections = 200;
SELECT pg_reload_conf();
```

**Redis:**

```bash
# Vertical scaling (increase cache size)
# If using ElastiCache:
aws elasticache modify-cache-cluster \
  --cache-cluster-id aureus-redis \
  --cache-node-type cache.r5.large \
  --apply-immediately
```

---

## Backup & Restore

### Automated Backups

**Configure Backup CronJob:**

```yaml
# k8s/backup-cronjob.yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: postgres-backup
spec:
  schedule: "0 2 * * *"  # 2 AM daily
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: backup
            image: postgres:15
            command:
            - /bin/bash
            - -c
            - |
              pg_dumpall -h postgres -U aureus | gzip > /backups/backup-$(date +\%Y\%m\%d).sql.gz
              # Upload to S3
              aws s3 cp /backups/backup-$(date +\%Y\%m\%d).sql.gz s3://aureus-backups/
          restartPolicy: OnFailure
```

```bash
# Apply backup CronJob
kubectl apply -f k8s/backup-cronjob.yaml -n aureus

# Verify backup completed
kubectl get cronjobs -n aureus
kubectl logs -n aureus -l job-name=postgres-backup
```

### Manual Backup

```bash
# PostgreSQL full backup
kubectl exec postgres-0 -n aureus -- pg_dumpall -U aureus | gzip > backup-$(date +%Y%m%d).sql.gz

# Upload to S3
aws s3 cp backup-$(date +%Y%m%d).sql.gz s3://aureus-backups/manual/

# Verify upload
aws s3 ls s3://aureus-backups/manual/
```

### Restore from Backup

```bash
# 1. Download backup from S3
aws s3 cp s3://aureus-backups/backup-20260204.sql.gz ./

# 2. Stop applications (prevent writes during restore)
kubectl scale deployment/bridge --replicas=0 -n aureus
kubectl scale deployment/aureus-os --replicas=0 -n aureus
kubectl scale deployment/openclaw --replicas=0 -n aureus

# 3. Restore database
gunzip < backup-20260204.sql.gz | kubectl exec -i postgres-0 -n aureus -- psql -U aureus

# 4. Verify restoration
kubectl exec postgres-0 -n aureus -- psql -U aureus -c "SELECT count(*) FROM signatures;"

# 5. Restart applications
kubectl scale deployment/bridge --replicas=3 -n aureus
kubectl scale deployment/aureus-os --replicas=3 -n aureus
kubectl scale deployment/openclaw --replicas=3 -n aureus

# 6. Validate functionality
curl https://api.aureus-sentinel.com/health
```

**Restore Testing Schedule:** Quarterly (every 3 months)

---

## Monitoring & Alerting

### Access Monitoring Tools

**Prometheus:**
```bash
# Port forward (if not exposed publicly)
kubectl port-forward -n aureus svc/prometheus 9090:9090

# Open in browser
open http://localhost:9090
```

**Grafana:**
```bash
# Port forward
kubectl port-forward -n aureus svc/grafana 3001:3000

# Open in browser
open http://localhost:3001
# Login: admin / (password from secret)
```

**Loki (Logs):**
```bash
# Query logs via Grafana Explore
# Or use LogCLI
logcli query '{job="bridge"}' --limit=50 --since=1h
```

### Alert Configuration

**Add New Alert Rule:**

```yaml
# monitoring/alerts.yml
groups:
  - name: custom_alerts
    rules:
      - alert: CustomMetricHigh
        expr: custom_metric > 100
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Custom metric is high"
          description: "Custom metric value is {{ $value }}"
```

```bash
# Reload Prometheus configuration
kubectl exec -n aureus prometheus-0 -- kill -HUP 1

# Or restart Prometheus
kubectl rollout restart statefulset/prometheus -n aureus
```

**Test Alert:**

```bash
# Trigger test alert manually
kubectl exec -n aureus prometheus-0 -- curl -X POST http://localhost:9090/api/v1/alerts
```

### Silence Alerts

During maintenance windows:

```bash
# Via Alertmanager UI
# Navigate to http://alertmanager-url/
# Click "Silences" → "New Silence"
# Match alerts by label (e.g., alertname="HighLatency")
# Set duration (e.g., 2 hours)
# Add comment: "Planned maintenance - [TICKET-123]"
```

---

## Troubleshooting

### Common Issues

**Service Won't Start:**
```bash
# Check pod events
kubectl describe pod <pod-name> -n aureus

# Check logs
kubectl logs <pod-name> -n aureus

# Common causes:
# - Image pull error (check image name/tag)
# - Config error (check environment variables)
# - Resource limits (check CPU/memory requests)
# - Dependency not ready (check database, Redis)
```

**High Latency:**
```bash
# Check resource usage
kubectl top pods -n aureus

# Check database connections
kubectl exec postgres-0 -n aureus -- psql -U aureus -c "SELECT count(*) FROM pg_stat_activity;"

# Check slow queries
kubectl exec postgres-0 -n aureus -- psql -U aureus -c "SELECT * FROM pg_stat_statements ORDER BY total_time DESC LIMIT 10;"

# Scale if needed
kubectl scale deployment/<service> --replicas=5 -n aureus
```

**Database Connection Errors:**
```bash
# Check PostgreSQL status
kubectl get pods -n aureus postgres-0

# Check connection pool
kubectl exec postgres-0 -n aureus -- psql -U aureus -c "SELECT count(*), state FROM pg_stat_activity GROUP BY state;"

# Restart services if connection leak
kubectl rollout restart deployment/bridge -n aureus
```

### Log Analysis

**Search for Errors:**
```bash
# Via Loki in Grafana
{job="bridge"} |= "ERROR"

# Or kubectl
kubectl logs -n aureus -l app=bridge --since=1h | grep ERROR
```

**Trace Request Flow:**
```bash
# Find request by ID in logs
kubectl logs -n aureus -l app=openclaw | grep "request_id=abc123"
kubectl logs -n aureus -l app=aureus-os | grep "request_id=abc123"
kubectl logs -n aureus -l app=bridge | grep "request_id=abc123"
```

### Performance Profiling

**CPU Profiling:**
```bash
# If pprof endpoint enabled
kubectl port-forward <pod> 6060:6060
curl http://localhost:6060/debug/pprof/profile?seconds=30 > cpu.prof
go tool pprof cpu.prof
```

**Memory Profiling:**
```bash
curl http://localhost:6060/debug/pprof/heap > heap.prof
go tool pprof heap.prof
```

---

## Maintenance Windows

### Scheduling Maintenance

**Notification Template:**

```
TO: all-eng@company.com, on-call@company.com
SUBJECT: [MAINTENANCE] Aureus Sentinel - [DATE] [TIME]

Scheduled maintenance window for Aureus Sentinel platform.

Date: [YYYY-MM-DD]
Time: [HH:MM - HH:MM] [TIMEZONE]
Duration: [X hours]
Impact: [Expected downtime / degraded performance]

Activities:
- [Activity 1]
- [Activity 2]

Rollback Plan:
- [Rollback procedure if issues occur]

Contact: [On-call engineer name/email]
```

**Pre-Maintenance Checklist:**
- [ ] Notification sent 48 hours in advance
- [ ] Backup completed and verified
- [ ] Rollback plan prepared
- [ ] On-call engineer identified
- [ ] Monitoring silences configured
- [ ] Change request approved

**Maintenance Procedure:**

```bash
# 1. Enable maintenance mode (if applicable)
kubectl set env deployment/openclaw MAINTENANCE_MODE=true -n aureus

# 2. Scale down non-critical services
kubectl scale deployment/openclaw --replicas=1 -n aureus

# 3. Perform maintenance activities
# [Specific maintenance steps]

# 4. Verify services after changes
kubectl get pods -n aureus
curl https://api.aureus-sentinel.com/health

# 5. Scale back up
kubectl scale deployment/openclaw --replicas=3 -n aureus

# 6. Disable maintenance mode
kubectl set env deployment/openclaw MAINTENANCE_MODE=false -n aureus

# 7. Monitor for 1 hour post-maintenance
# Check error rates, latency, logs

# 8. Send completion notification
```

---

## On-Call Procedures

### On-Call Rotation

**On-Call Schedule:**
- Primary: Week rotation (Mon 9am - Mon 9am)
- Secondary: Week rotation (backup if primary unavailable)
- Escalation: Engineering Manager (after 30 minutes)

**On-Call Tools:**
- PagerDuty app installed and notifications enabled
- Slack #aureus-on-call channel monitored
- VPN access configured
- AWS console access
- kubectl configured for production cluster

### Alert Response

**When Alert Fires:**

1. **Acknowledge** within 5 minutes
   ```
   # In PagerDuty: Click "Acknowledge"
   # In Slack: React with ✅ emoji
   ```

2. **Assess Severity**
   - P0 (Critical): Service down, data loss
   - P1 (High): Degraded performance, high error rate
   - P2 (Medium): Single component issue
   - P3 (Low): Warning, no user impact

3. **Investigate**
   ```bash
   # Check Grafana dashboards
   # Review logs in Loki
   # Check service status
   kubectl get pods -n aureus
   ```

4. **Mitigate**
   - Follow runbook for specific alert (see monitoring/RUNBOOKS.md)
   - If no runbook, use best judgment
   - Document steps taken

5. **Escalate if Needed**
   - P0: Escalate immediately to Engineering Manager
   - P1: Escalate if not resolved in 30 minutes
   - P2/P3: Handle during business hours

6. **Resolve**
   - Implement fix
   - Verify metrics return to normal
   - Mark incident as resolved in PagerDuty

7. **Follow-up**
   - Document incident (use template in RUNBOOKS.md)
   - Schedule post-mortem for P0/P1 incidents
   - Update runbooks if needed

### Handoff Procedure

**End of On-Call Week:**

```
TO: next-oncall@company.com
SUBJECT: On-Call Handoff - Week of [DATE]

Summary of this on-call week:

Incidents:
- [Incident 1 summary, resolution]
- [Incident 2 summary, resolution]

Ongoing Issues:
- [Issue 1 - needs follow-up]
  Action: [What needs to be done]
  ETA: [When it should be done]

Changes This Week:
- [Deployment 1]
- [Configuration change 1]

Upcoming Maintenance:
- [Scheduled maintenance on DATE]

Notes:
- [Any other important information]

System Health:
- Overall: [Good / Fair / Concerning]
- Error Rate: [X%]
- Latency: [Xms p95]

Contact me if you have questions: [yourname@company.com / phone]
```

---

## Access Management

### Granting Access

**New Engineer Onboarding:**

```bash
# 1. AWS IAM access
aws iam attach-user-policy --user-name newuser --policy-arn arn:aws:iam::aws:policy/ReadOnlyAccess

# 2. Kubernetes access
kubectl create rolebinding newuser-view \
  --clusterrole=view \
  --user=newuser@company.com \
  -n aureus

# 3. Grafana access
# Add user in Grafana UI: Admin → Users → Invite

# 4. PagerDuty access
# Add to on-call schedule if applicable

# 5. Documentation access
# Grant GitHub repo read access
```

### Revoking Access

**When Engineer Leaves:**

```bash
# 1. Revoke AWS access
aws iam detach-user-policy --user-name olduser --policy-arn arn:aws:iam::aws:policy/ReadOnlyAccess

# 2. Revoke Kubernetes access
kubectl delete rolebinding olduser-view -n aureus

# 3. Remove from Grafana
# Deactivate user in Grafana UI

# 4. Remove from PagerDuty
# Remove from schedules and teams

# 5. Rotate any shared credentials the user had access to
```

---

## Change Management

### Change Request Process

**For Production Changes:**

1. **Create Change Request Ticket**
   - Jira/ServiceNow ticket with details
   - Impact assessment
   - Rollback plan

2. **Approval Required From:**
   - Engineering Manager (all changes)
   - CISO (security-related changes)
   - CTO (infrastructure changes)

3. **Communication:**
   - Notify in #aureus-changes Slack channel
   - Email stakeholders if customer-impacting

4. **Execution:**
   - Follow deployment procedures
   - Document actual vs. planned changes
   - Update ticket with outcome

5. **Post-Change Review:**
   - Verify success criteria met
   - Document lessons learned
   - Update procedures if needed

---

**Document Version:** 1.0  
**Last Updated:** Week 14  
**Owner:** DevOps Team  
**Next Review:** Quarterly
