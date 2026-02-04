# Known Issues - Aureus Agentic OS Beta

**Last Updated**: February 1, 2026

This document tracks known issues in the current beta release. We're actively working on fixes and will update this list weekly.

## Critical Issues (P0)

> **P0 issues may block core workflows. Workarounds provided where available.**

Currently: **None** 🎉

## High Priority Issues (P1)

### 1. Agent Studio - Large Blueprint Generation

**Issue**: Agent Studio may timeout when generating blueprints with 20+ capabilities.

**Affected**: Agent Studio UI (`agent-studio.html`)

**Symptoms**:
- Spinner runs for 2+ minutes
- Browser console shows "Request timeout"
- Blueprint not generated

**Workaround**: Generate blueprints in batches of 15 capabilities or less.

**Status**: Fix scheduled for Week 2 of beta (targeting Feb 8, 2026)

**Tracking**: Issue #127

---

### 2. Memory Rollback - Snapshot List Performance

**Issue**: Listing snapshots for agents with 100+ snapshots takes 10+ seconds.

**Affected**: HipCortex Memory (`@aureus/memory-hipcortex`)

**Symptoms**:
- `listSnapshots()` slow response
- Console UI freeze when opening memory tab
- Pagination not working correctly

**Workaround**: Use CLI with filters: `aureus memory list --limit 20 --since="2026-01-01"`

**Status**: Pagination fix in progress, ETA Feb 5, 2026

**Tracking**: Issue #134

---

### 3. Kubernetes - PostgreSQL PVC Binding on GKE

**Issue**: PostgreSQL PersistentVolumeClaim may fail to bind on Google Kubernetes Engine (GKE) with default storage class.

**Affected**: Kubernetes deployment (`infrastructure/kubernetes/`)

**Symptoms**:
- PVC remains in "Pending" state
- PostgreSQL pod stuck in "ContainerCreating"
- Error: "no persistent volumes available"

**Workaround**: Explicitly specify storage class in `postgres-statefulset.yaml`:
```yaml
volumeClaimTemplates:
  - metadata:
      name: postgres-data
    spec:
      storageClassName: "standard-rwo"  # GKE: use "standard-rwo"
```

**Status**: Adding storage class auto-detection, ETA Feb 10, 2026

**Tracking**: Issue #142

---

## Medium Priority Issues (P2)

### 4. CRV Gate - Slow Schema Validation

**Issue**: JSON schema validation in CRV gates takes 500-1000ms for complex schemas (100+ fields).

**Impact**: Adds latency to workflow execution (not blocking, but noticeable).

**Workaround**: Cache validation results when possible, or simplify schemas.

**Status**: Investigating schema compilation caching, ETA Feb 15, 2026

**Tracking**: Issue #118

---

### 5. Console API - Rate Limiting Headers Missing

**Issue**: API responses don't include standard rate limit headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`).

**Impact**: Clients can't proactively handle rate limits, may get unexpected 429 errors.

**Workaround**: Implement exponential backoff on all API calls.

**Status**: Adding headers in next release, ETA Feb 12, 2026

**Tracking**: Issue #156

---

### 6. Monitoring Dashboard - Metrics Delay

**Issue**: Grafana dashboards show 2-3 minute delay for real-time metrics.

**Symptoms**:
- Workflow execution appears "stuck"
- Metrics update in bursts
- Real-time graphs not smooth

**Root Cause**: Prometheus scrape interval set to 60s + aggregation delay.

**Workaround**: Reduce scrape interval to 15s in `prometheus.yml`:
```yaml
scrape_configs:
  - job_name: 'aureus-console'
    scrape_interval: 15s  # Default is 60s
```

**Status**: Updating default configs, ETA Feb 8, 2026

**Tracking**: Issue #163

---

### 7. Policy FSM - State Transition Logs Verbose

**Issue**: Policy FSM logs every state transition at INFO level, creating excessive log volume.

**Impact**: Log storage fills up quickly (10GB+ per day for active tenants).

**Workaround**: Adjust log level to WARN for production:
```bash
LOG_LEVEL=warn docker-compose up -d
```

**Status**: Changing default to DEBUG, ETA Feb 6, 2026

**Tracking**: Issue #171

---

## Low Priority Issues (P3)

### 8. Agent Studio - Dark Mode Not Fully Applied

**Issue**: Some UI elements don't respect dark mode setting (input borders, dropdown menus).

**Impact**: Visual inconsistency only.

**Workaround**: Use light mode until fixed.

**Status**: Backlog, ETA Mar 2026

**Tracking**: Issue #89

---

### 9. Documentation - Code Examples Missing TypeScript Types

**Issue**: Some documentation examples omit TypeScript types, making it harder to implement correctly.

**Impact**: Minor - types can be inferred from SDK.

**Status**: Updating docs progressively throughout beta.

**Tracking**: Issue #145

---

### 10. CLI - Autocomplete Not Working on Windows PowerShell

**Issue**: Tab completion for Aureus CLI commands doesn't work in PowerShell.

**Impact**: Minor usability issue.

**Workaround**: Use Command Prompt or WSL, or type full command names.

**Status**: Investigating PowerShell integration, ETA Mar 2026

**Tracking**: Issue #178

---

## Resolved Issues

### ✅ World Model - Graph Query Performance (Fixed Jan 28, 2026)

**Was**: DoGraph queries with 1000+ nodes took 5+ seconds.

**Fixed**: Implemented graph indexing, now <500ms.

**Version**: Included in current beta release.

---

### ✅ Docker Compose - PostgreSQL Init Timing (Fixed Jan 25, 2026)

**Was**: Console service failed to connect to PostgreSQL on first startup.

**Fixed**: Added health check and depends_on with condition.

**Version**: Included in current beta release.

---

## Reporting New Issues

Found a bug not listed here? Please report it!

1. **Check this list first** - avoid duplicates
2. **Use the bug report template**: [feedback.md](./feedback.md#bug-reports)
3. **Include**:
   - Reproduction steps
   - Environment details (OS, deployment method, version)
   - Logs/screenshots
   - Impact on your workflow

**Reporting Channels**:
- GitHub Issues: [github.com/farmountain/Aureus_Agentic_OS/issues](https://github.com/farmountain/Aureus_Agentic_OS/issues)
- Email: beta@aureus.ai
- Slack: #aureus-beta-participants

## Issue Status Definitions

| Status | Meaning |
|--------|---------|
| **Investigating** | Reproducing and root cause analysis |
| **In Progress** | Fix under development |
| **Scheduled** | Planned for specific release |
| **Backlog** | Acknowledged, lower priority |
| **Resolved** | Fixed and deployed |

## Update Frequency

This document is updated:
- **Immediately** for new P0 issues
- **Weekly** for P1/P2 additions and status updates
- **Bi-weekly** for P3 and resolved issues
- **On release** when fixes are deployed

## Maintenance Windows

**No planned downtime** for Docker Compose deployments (you control updates).

**Kubernetes users**: We'll announce any breaking changes 1 week in advance via:
- Beta mailing list
- Slack #aureus-beta-participants
- GitHub release notes

## Workaround Repository

Community-contributed workarounds: [docs/beta/workarounds/](./workarounds/)

Share your solutions to help other beta participants!

---

**Questions about issues?**
- Office Hours: Tuesday/Thursday 3-4 PM EST
- Email: beta@aureus.ai
- Slack: #aureus-beta-participants

**Next Steps:**
- Review [Support Channels](./support.md)
- Check [Feedback Guidelines](./feedback.md)
- Read [Onboarding Guide](./onboarding.md)
