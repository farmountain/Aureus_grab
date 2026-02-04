# Aureus Sentinel - Incident Response Runbooks

Quick reference guide for responding to common alerts and incidents.

## Table of Contents

- [General Response Flow](#general-response-flow)
- [ServiceDown](#servicedown)
- [HighLatency](#highlatency)
- [HighErrorRate](#higherrorrate)
- [DatabaseFailure](#databasefailure)
- [SignatureFailures](#signaturefailures)
- [HighCPUUsage](#highcpuusage)
- [HighMemoryUsage](#highmemoryusage)
- [PolicyViolationSpike](#policyviolationspike)
- [ConnectionOverload](#connectionoverload)

---

## General Response Flow

### Severity Levels

- **Critical**: Immediate action required, service degradation or outage
- **Warning**: Potential issue, requires attention within business hours

### Response Steps

1. **Acknowledge** the alert in PagerDuty/Slack
2. **Assess** the situation using Grafana dashboards
3. **Investigate** using logs (Loki) and metrics (Prometheus)
4. **Mitigate** the immediate issue
5. **Resolve** the root cause
6. **Document** in incident report
7. **Post-mortem** for critical incidents

---

## ServiceDown

**Alert:** Service is not responding to health checks for >1 minute

**Severity:** Critical

### Symptoms
- Health endpoint returning non-200 status
- `up{job="<service>"}` metric = 0
- Service pods not in Ready state (Kubernetes)

### Investigation

```bash
# Check service status
kubectl get pods -n aureus -l app=<service>

# Check logs
kubectl logs -n aureus -l app=<service> --tail=100

# Docker Compose
docker-compose -f docker-compose-full.yml ps <service>
docker-compose -f docker-compose-full.yml logs --tail=100 <service>

# Check health endpoint
curl http://localhost:<port>/health
```

### Resolution

**Kubernetes:**
```bash
# Restart pods
kubectl rollout restart deployment/<service> -n aureus

# Check rollout status
kubectl rollout status deployment/<service> -n aureus

# If persistent, scale down and up
kubectl scale deployment/<service> --replicas=0 -n aureus
kubectl scale deployment/<service> --replicas=3 -n aureus
```

**Docker Compose:**
```bash
# Restart service
docker-compose -f docker-compose-full.yml restart <service>

# If persistent, recreate
docker-compose -f docker-compose-full.yml up -d --force-recreate <service>
```

### Root Causes
- OOM (Out of Memory) kill
- Unhandled exception causing crash
- Database connection timeout
- Network partition

### Prevention
- Implement proper error handling
- Add memory limits and requests
- Add readiness/liveness probes
- Implement circuit breakers

---

## HighLatency

**Alert:** p95 latency > threshold for >5 minutes

**Thresholds:**
- Bridge: >500ms
- Aureus OS: >2s
- OpenClaw: >1s

**Severity:** Warning (>threshold), Critical (>2x threshold)

### Investigation

```bash
# Check latency metrics in Prometheus
histogram_quantile(0.95, rate(<service>_request_duration_seconds_bucket[5m]))

# Check for resource constraints
kubectl top pods -n aureus

# Check database performance
# Connect to PostgreSQL
kubectl exec -it postgres-0 -n aureus -- psql -U aureus

# Run slow query analysis
SELECT * FROM pg_stat_activity WHERE state = 'active';
SELECT * FROM pg_stat_statements ORDER BY total_time DESC LIMIT 10;
```

### Resolution

**If CPU-bound:**
```bash
# Scale up replicas
kubectl scale deployment/<service> --replicas=5 -n aureus

# Or increase resource limits
# Edit deployment, increase CPU limits
kubectl edit deployment/<service> -n aureus
```

**If database-bound:**
```sql
-- Add missing indexes
CREATE INDEX CONCURRENTLY idx_<table>_<column> ON <table>(<column>);

-- Analyze tables
ANALYZE <table>;

-- Check connection pool
SELECT count(*) FROM pg_stat_activity;
```

**If external API-bound:**
- Check external service status
- Implement caching
- Increase timeout limits
- Add circuit breaker

### Root Causes
- Increased traffic
- Database slow queries
- External API slowdown
- Resource exhaustion

### Prevention
- Add caching layer (Redis)
- Optimize database queries
- Implement HPA (Horizontal Pod Autoscaler)
- Add request rate limiting

---

## HighErrorRate

**Alert:** Error rate >5% for >5 minutes

**Severity:** Critical

### Investigation

```bash
# Check error metrics
rate(<service>_errors_total[5m]) / rate(<service>_requests_total[5m])

# Filter logs for errors
# Loki query: {job="<service>"} |= "ERROR"

# Check specific error types
kubectl logs -n aureus -l app=<service> | grep ERROR | tail -50
```

### Resolution

**If validation errors:**
- Check for malformed requests
- Review recent schema changes
- Validate input sanitization

**If 500 errors:**
- Check service logs for exceptions
- Review recent deployments
- Check database connectivity

**If timeout errors:**
- See [HighLatency](#highlatency) runbook
- Check external service status

**Rollback deployment:**
```bash
# Kubernetes
kubectl rollout undo deployment/<service> -n aureus

# Docker Compose
git checkout <previous-commit>
docker-compose -f docker-compose-full.yml up -d --force-recreate <service>
```

### Root Causes
- Bug in recent deployment
- Invalid input data
- External service failure
- Database connection pool exhausted

### Prevention
- Comprehensive testing before deployment
- Gradual rollout (canary deployment)
- Input validation
- Circuit breakers for external services

---

## DatabaseFailure

**Alert:** Database not responding or high connection pool usage

**Severity:** Critical

### Investigation

```bash
# Check PostgreSQL status
kubectl get pods -n aureus postgres-0

# Check logs
kubectl logs -n aureus postgres-0 --tail=100

# Docker Compose
docker-compose -f docker-compose-full.yml logs postgres

# Connect and check
kubectl exec -it postgres-0 -n aureus -- psql -U aureus

# Check connections
SELECT count(*) FROM pg_stat_activity;
SELECT max_conn FROM pg_settings WHERE name = 'max_connections';
```

### Resolution

**If connection pool exhausted:**
```sql
-- Kill idle connections
SELECT pg_terminate_backend(pid) 
FROM pg_stat_activity 
WHERE state = 'idle' 
AND state_changed < NOW() - INTERVAL '10 minutes';

-- Increase max_connections (requires restart)
ALTER SYSTEM SET max_connections = 200;
```

**If disk full:**
```bash
# Check disk usage
kubectl exec -it postgres-0 -n aureus -- df -h

# Clean up old data
VACUUM FULL;

# Or increase PVC size
kubectl edit pvc postgres-data -n aureus
```

**If PostgreSQL crashed:**
```bash
# Restart PostgreSQL
kubectl rollout restart statefulset/postgres -n aureus

# Check data integrity after restart
kubectl exec -it postgres-0 -n aureus -- pg_checksums -D /var/lib/postgresql/data
```

### Root Causes
- Connection leak
- Slow queries blocking
- Disk space exhausted
- Memory pressure

### Prevention
- Implement connection pooling
- Add query timeouts
- Monitor disk usage
- Regular VACUUM

---

## SignatureFailures

**Alert:** Signature verification failures detected

**Severity:** Critical (security issue)

### Investigation

```bash
# Check Bridge logs for signature errors
kubectl logs -n aureus -l app=bridge | grep "signature_verification_failed"

# Check recent signature attempts
# Query audit log table
kubectl exec -it postgres-0 -n aureus -- psql -U aureus -d bridge
SELECT * FROM audit_log WHERE action = 'verify' AND result = 'failed' ORDER BY timestamp DESC LIMIT 20;

# Check key rotation events
kubectl logs -n aureus -l app=bridge | grep "key_rotation"
```

### Resolution

**If key mismatch:**
- Check if key rotation occurred
- Verify public key distribution
- Restart Bridge service to reload keys

**If TTL expired:**
- Normal behavior, no action needed
- Review TTL settings if too short

**If tampering detected:**
```bash
# SECURITY INCIDENT - Follow security protocol
# 1. Isolate affected service
kubectl scale deployment/bridge --replicas=0 -n aureus

# 2. Rotate keys immediately
# Trigger KMS key rotation
aws kms create-key --description "Emergency rotation"

# 3. Review audit logs
kubectl exec -it postgres-0 -n aureus -- psql -U aureus -d bridge
SELECT * FROM audit_log WHERE timestamp > NOW() - INTERVAL '1 hour';

# 4. Notify security team
# Send to security@your-org.com

# 5. Restore service with new keys
kubectl set env deployment/bridge KMS_KEY_ID=<new-key-id> -n aureus
kubectl scale deployment/bridge --replicas=3 -n aureus
```

### Root Causes
- Key rotation not propagated
- Clock skew between services
- Malicious activity (rare)
- Bug in signature code

### Prevention
- Automated key distribution
- NTP time synchronization
- Regular security audits
- Comprehensive integration tests

---

## HighCPUUsage

**Alert:** CPU > 80% for >10 minutes

**Severity:** Warning (>80%), Critical (>95%)

### Investigation

```bash
# Check CPU usage
kubectl top pods -n aureus

# Check CPU metrics
rate(process_cpu_seconds_total{job="<service>"}[5m])

# Profile application (if available)
kubectl exec -it <pod> -n aureus -- curl http://localhost:<port>/debug/pprof/profile?seconds=30 > cpu.prof
```

### Resolution

**Scale horizontally:**
```bash
# Increase replicas
kubectl scale deployment/<service> --replicas=5 -n aureus

# Or enable HPA
kubectl autoscale deployment/<service> --cpu-percent=70 --min=3 --max=10 -n aureus
```

**Scale vertically:**
```bash
# Increase CPU limits
kubectl patch deployment/<service> -n aureus -p '
spec:
  template:
    spec:
      containers:
      - name: <service>
        resources:
          limits:
            cpu: "4000m"
'
```

### Root Causes
- Traffic spike
- Inefficient algorithm
- Infinite loop
- Resource leak

### Prevention
- Implement HPA
- Optimize hot code paths
- Add request rate limiting
- Performance testing

---

## HighMemoryUsage

**Alert:** Memory >90% for >10 minutes

**Severity:** Warning (>90%), Critical (>95%)

### Investigation

```bash
# Check memory usage
kubectl top pods -n aureus

# Check memory metrics
process_resident_memory_bytes{job="<service>"}

# Check for memory leaks
kubectl logs -n aureus <pod> | grep "OutOfMemory"
```

### Resolution

**Immediate (if OOM imminent):**
```bash
# Restart pod to free memory
kubectl delete pod <pod> -n aureus

# Or restart deployment
kubectl rollout restart deployment/<service> -n aureus
```

**Long-term:**
```bash
# Increase memory limits
kubectl patch deployment/<service> -n aureus -p '
spec:
  template:
    spec:
      containers:
      - name: <service>
        resources:
          limits:
            memory: "4Gi"
'
```

**For Aureus OS (ML models):**
```bash
# ML models require more memory
# Ensure limits are appropriate: 4-8Gi for production
kubectl edit deployment/aureus-os -n aureus
```

### Root Causes
- Memory leak
- Insufficient limits
- Large data processing
- ML model memory (Aureus OS)

### Prevention
- Regular memory profiling
- Proper garbage collection
- Streaming large datasets
- Appropriate resource limits

---

## PolicyViolationSpike

**Alert:** >10 policy violations per minute

**Severity:** Warning

### Investigation

```bash
# Check violation rate
rate(aureus_os_policy_violations_total[5m])

# Check violation types
kubectl logs -n aureus -l app=aureus-os | grep "policy_violation"

# Query violation details
kubectl exec -it postgres-0 -n aureus -- psql -U aureus -d aureus_os
SELECT policy_id, COUNT(*) FROM policy_violations 
WHERE created_at > NOW() - INTERVAL '10 minutes'
GROUP BY policy_id 
ORDER BY COUNT(*) DESC;
```

### Resolution

**If legitimate spike:**
- Expected behavior during certain operations
- Monitor and document pattern

**If policy too restrictive:**
- Review policy rules with policy team
- Adjust threshold or rules
- Update policy configuration

**If attack attempt:**
```bash
# Identify source
kubectl exec -it postgres-0 -n aureus -- psql -U aureus -d aureus_os
SELECT source_user, source_channel, COUNT(*) 
FROM policy_violations 
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY source_user, source_channel 
ORDER BY COUNT(*) DESC;

# Block malicious actor
# Add to blocklist in OpenClaw
kubectl exec -it <openclaw-pod> -n aureus -- curl -X POST \
  http://localhost:8080/api/admin/blocklist \
  -d '{"user_id":"<user>","reason":"policy_violation_spike"}'
```

### Root Causes
- Policy misconfiguration
- Legitimate activity spike
- Malicious actor testing limits
- Bug in policy engine

### Prevention
- Regular policy review
- Rate limiting per user
- Anomaly detection
- Clear policy documentation

---

## ConnectionOverload

**Alert:** >1000 active WebSocket connections (OpenClaw)

**Severity:** Warning (>1000), Critical (>2000)

### Investigation

```bash
# Check active connections
openclaw_active_connections

# Check connection distribution by channel
openclaw_active_connections{channel="telegram"}
openclaw_active_connections{channel="discord"}

# Check connection churn rate
rate(openclaw_connections_opened_total[5m])
rate(openclaw_connections_closed_total[5m])
```

### Resolution

**Scale OpenClaw:**
```bash
# Add more replicas
kubectl scale deployment/openclaw --replicas=5 -n aureus

# Verify load balancer distributing connections
kubectl get svc openclaw-service -n aureus
```

**If connection leak:**
```bash
# Check for connections not being closed
kubectl logs -n aureus -l app=openclaw | grep "connection_timeout"

# Restart service to close stale connections
kubectl rollout restart deployment/openclaw -n aureus
```

**Add connection limits:**
```bash
# Configure max connections per channel
kubectl set env deployment/openclaw \
  MAX_CONNECTIONS_PER_CHANNEL=500 \
  -n aureus
```

### Root Causes
- Viral message spike
- Connection not being closed properly
- DDoS attack attempt
- Client reconnection storm

### Prevention
- Connection rate limiting
- Proper connection cleanup
- Load balancing
- DDoS protection (Cloudflare)

---

## Escalation

### Severity Levels

**P0 - Critical (Immediate)**
- Complete service outage
- Data loss or corruption
- Security breach
- Escalate to: On-call engineer + Engineering Manager

**P1 - High (Within 1 hour)**
- Partial service degradation
- Persistent high error rate
- Escalate to: On-call engineer

**P2 - Medium (Within 4 hours)**
- Performance degradation
- Non-critical feature broken
- Escalate to: Team lead during business hours

**P3 - Low (Within 24 hours)**
- Minor issues
- Cosmetic problems
- Handle during business hours

### Escalation Contacts

- **On-Call Engineer:** Via PagerDuty
- **Engineering Manager:** manager@your-org.com
- **Security Team:** security@your-org.com (for security incidents)
- **DevOps Team:** devops@your-org.com (for infrastructure issues)

---

## Post-Incident

### Incident Report Template

```markdown
# Incident Report - [YYYY-MM-DD] [Alert Name]

## Summary
Brief description of the incident

## Timeline
- HH:MM - Alert fired
- HH:MM - Engineer acknowledged
- HH:MM - Root cause identified
- HH:MM - Mitigation applied
- HH:MM - Incident resolved

## Impact
- Affected services: [list]
- Duration: X minutes
- Users affected: ~X
- Error rate: X%

## Root Cause
Detailed explanation of what went wrong

## Resolution
Steps taken to resolve the incident

## Action Items
- [ ] Action item 1 (Owner: Name, Due: Date)
- [ ] Action item 2 (Owner: Name, Due: Date)

## Lessons Learned
What we learned and how to prevent similar incidents
```

---

**Document Version:** 1.0  
**Last Updated:** Week 14  
**Next Review:** Quarterly
