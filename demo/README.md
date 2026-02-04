# Aureus Sentinel - End-to-End Demo

This demo showcases the complete Aureus Sentinel ecosystem including:
- **Bridge** (Cryptographic signing service)
- **Aureus Agentic OS** (Policy engine & risk assessment)
- **OpenClaw** (Multi-channel AI agent platform - simulated)

## Architecture Flow

```
┌─────────────────┐
│   User Intent   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Aureus OS     │──► Policy Evaluation
│ (Risk Assessment│    Risk Score: 0-100
└────────┬────────┘
         │ Execution Plan
         ▼
┌─────────────────┐
│     Bridge      │──► Cryptographic Signing
│  (KMS-backed)   │    ed25519 + TTL
└────────┬────────┘
         │ Signed Approval
         ▼
┌─────────────────┐
│    Executor     │──► Signature Verification
│    Wrapper      │    Execute if Valid
└─────────────────┘
```

## Quick Start

### Prerequisites

- Docker and Docker Compose installed
- Node.js 18+ (for demo client)
- 8GB RAM recommended
- Ports available: 3000, 3001, 5000, 8080, 9090, 5432, 6379

### 1. Start the Complete Stack

```bash
# Clone repository (if not already)
git clone https://github.com/farmountain/Aureus-Sentinel.git
cd Aureus-Sentinel

# Start all services with monitoring
docker-compose -f docker-compose-full.yml up -d

# Wait for services to be healthy (30-60 seconds)
docker-compose -f docker-compose-full.yml ps

# Check logs if any service fails
docker-compose -f docker-compose-full.yml logs -f [service-name]
```

### 2. Build Aureus OS Service

```bash
# Build the Aureus OS Docker image
docker build -t aureus/agentic-os:latest ./Aureus_Agentic_OS

# Restart the stack to pick up the new image
docker-compose -f docker-compose-full.yml up -d aureus-os
```

### 3. Run the Demo Client

```bash
# Install demo dependencies
cd demo
npm install

# Run the interactive demo
npm run demo
```

## What the Demo Shows

The demo runs three scenarios:

### Scenario 1: Low Risk Action (Auto-Approved)
- **Action:** `read_document`
- **Risk Score:** ~10-20/100
- **Outcome:** ✅ Auto-approved and executed
- **Flow:** Intent → Policy Check → Sign → Verify → Execute

### Scenario 2: Medium Risk Action (Requires Approval)
- **Action:** `send_email`
- **Risk Score:** ~25-40/100
- **Outcome:** ⚠️ Requires approval but can proceed
- **Flow:** Intent → Policy Check → Sign → Verify → Execute (with audit)

### Scenario 3: High Risk Action (Blocked)
- **Action:** `delete_database`
- **Risk Score:** ~85-95/100
- **Outcome:** ❌ Blocked, requires manual administrative approval
- **Flow:** Intent → Policy Check → Sign → Verify → **Block** (pending approval)

## Demo Output

```bash
🚀 Aureus Sentinel End-to-End Demo

ℹ Checking service health...
✓ Bridge: HEALTHY (v1.0.0)
✓ Aureus OS: HEALTHY (v1.0.0-demo)

────────────────────────────────────────────────────────────────────────────────

📋 Scenario: Low Risk Action (Auto-Approved)

→ Step 1: Submitting intent to system
→ Step 2: Aureus OS evaluating policy...
ℹ Risk Assessment: LOW (score: 15/100)
ℹ Approval Required: NO
ℹ Execution Steps: 3

→ Step 3: Sending plan to Bridge for cryptographic signing...
✓ Signature generated: a1b2c3d4e5f6...
ℹ Expires at: 2026-02-04T10:15:00Z

→ Step 4: Verifying signature before execution...
✓ Signature verification: VALID ✓

→ Step 5: Executing action with verified approval...
✓ Action executed successfully
ℹ Execution result logged to audit trail

✓ Scenario completed successfully

[... additional scenarios ...]

────────────────────────────────────────────────────────────────────────────────

📊 Demo Summary

┌─────────┬────────────────────────────────────────┬─────────┬───────────┬───────────┬─────────────────┬────────────────┐
│ (index) │ scenario                               │ status  │ riskLevel │ riskScore │ approvalRequired│ signatureValid │
├─────────┼────────────────────────────────────────┼─────────┼───────────┼───────────┼─────────────────┼────────────────┤
│ 0       │ 'Low Risk Action (Auto-Approved)'      │ 'success'│ 'low'    │ 15        │ false           │ true           │
│ 1       │ 'Medium Risk Action (Requires Approval)'│'success'│ 'medium' │ 32        │ true            │ true           │
│ 2       │ 'High Risk Action (Blocked)'           │ 'success'│ 'high'   │ 92        │ true            │ true           │
└─────────┴────────────────────────────────────────┴─────────┴───────────┴───────────┴─────────────────┴────────────────┘

✓ Completed 3/3 scenarios successfully

✓ Demo completed!

Access Points:
  • Bridge API: http://localhost:3000
  • Aureus OS API: http://localhost:5000
  • Grafana Dashboards: http://localhost:3001 (admin/admin)
  • Prometheus Metrics: http://localhost:9090
```

## Access the System

Once running, access:

| Service | URL | Credentials |
|---------|-----|-------------|
| **Bridge API** | http://localhost:3000 | API Key: `dev_bridge_key_change_in_prod` |
| **Aureus OS API** | http://localhost:5000 | - |
| **Grafana** | http://localhost:3001 | admin / admin |
| **Prometheus** | http://localhost:9090 | - |
| **PostgreSQL** | localhost:5432 | aureus / aureus_dev_password |
| **Redis** | localhost:6379 | - |

### API Examples

**Test Bridge Health:**
```bash
curl http://localhost:3000/health
```

**Submit Intent to Aureus OS:**
```bash
curl -X POST http://localhost:5000/api/policy/evaluate \
  -H "Content-Type: application/json" \
  -d '{
    "intent": {
      "intent_id": "test-001",
      "action": "read_document",
      "parameters": {"document_id": "doc-123"},
      "user_id": "demo-user",
      "timestamp": "2026-02-04T10:00:00Z"
    }
  }'
```

**Sign a Plan:**
```bash
curl -X POST http://localhost:3000/sign \
  -H "Content-Type: application/json" \
  -H "x-api-key: dev_bridge_key_change_in_prod" \
  -d '{
    "plan": {...},
    "requester_id": "demo-user",
    "timestamp": "2026-02-04T10:00:00Z",
    "ttl_seconds": 300
  }'
```

## Monitoring & Observability

### Grafana Dashboards

Visit http://localhost:3001 (admin/admin) to view:

1. **System Overview** - All services health, request rates, latency
2. **Bridge Dashboard** - Signature rates, verification success, latency
3. **Aureus OS Dashboard** - Policy evaluations, risk scores, approval rates
4. **OpenClaw Dashboard** - Multi-channel metrics (when integrated)

### Prometheus Metrics

Visit http://localhost:9090 to query metrics:

- `bridge_signatures_total` - Total signatures generated
- `bridge_signature_latency_seconds` - Signing latency
- `aureus_os_policy_evaluations_total` - Total policy evaluations
- `aureus_os_risk_score` - Risk score distribution
- `aureus_os_approval_rate` - Percentage of auto-approved actions

### View Logs

```bash
# All services
docker-compose -f docker-compose-full.yml logs -f

# Specific service
docker-compose -f docker-compose-full.yml logs -f bridge
docker-compose -f docker-compose-full.yml logs -f aureus-os

# Last 100 lines
docker-compose -f docker-compose-full.yml logs --tail=100 bridge
```

## Customizing the Demo

### Add Your Own Scenarios

Edit `demo/demo-client.js` and add new scenarios:

```javascript
const DEMO_SCENARIOS = {
  customAction: {
    name: 'My Custom Action',
    intent: {
      intent_id: `intent_${Date.now()}_custom`,
      action: 'my_custom_action',
      parameters: {
        param1: 'value1',
        param2: 'value2'
      },
      user_id: 'demo-user',
      timestamp: new Date().toISOString()
    }
  }
};
```

### Configure Risk Scores

Edit `Aureus_Agentic_OS/app.py` to adjust risk scoring:

```python
ACTION_RISKS = {
    'read_document': 10,
    'send_email': 25,
    'my_custom_action': 50,  # Add your action
    # ...
}
```

## Troubleshooting

### Services Not Starting

```bash
# Check service status
docker-compose -f docker-compose-full.yml ps

# View logs for failed service
docker-compose -f docker-compose-full.yml logs [service-name]

# Restart specific service
docker-compose -f docker-compose-full.yml restart [service-name]

# Recreate all services
docker-compose -f docker-compose-full.yml down
docker-compose -f docker-compose-full.yml up -d
```

### Port Conflicts

If ports are already in use, edit `docker-compose-full.yml`:

```yaml
services:
  bridge:
    ports:
      - "3000:3000"  # Change left side: "3001:3000"
```

### Demo Client Connection Errors

Ensure services are healthy:
```bash
# Check Bridge
curl http://localhost:3000/health

# Check Aureus OS
curl http://localhost:5000/api/health

# If still failing, check Docker logs
docker-compose -f docker-compose-full.yml logs bridge aureus-os
```

### Signature Verification Fails

This usually means the signature format or TTL is incorrect. Check:
1. Plan hasn't been modified between signing and verification
2. TTL hasn't expired (default: 5 minutes)
3. Bridge service is using consistent keys

## Stopping the Demo

```bash
# Stop all services (keep data)
docker-compose -f docker-compose-full.yml down

# Stop and remove all data
docker-compose -f docker-compose-full.yml down -v

# Remove demo client dependencies
cd demo
rm -rf node_modules
```

## Next Steps

1. **Production Deployment:**
   - See [docs/DEPLOYMENT_GUIDE.md](../docs/DEPLOYMENT_GUIDE.md)
   - Use Kubernetes manifests in `k8s/`

2. **Integrate with Real OpenClaw:**
   - See [docs/week-04-session-pack.md](../docs/week-04-session-pack.md)
   - Connect Telegram, Discord, or Slack bots

3. **Enable KMS Signing:**
   - See [docs/key_management_and_kms.md](../docs/key_management_and_kms.md)
   - Configure AWS KMS for production keys

4. **Add Custom Policies:**
   - Extend Aureus OS policy engine
   - Add ML models for risk assessment

## Support

- **Documentation:** [docs/](../docs/)
- **Issues:** https://github.com/farmountain/Aureus-Sentinel/issues
- **Architecture:** [docs/architecture/overview.md](../docs/architecture/overview.md)

---

**Happy Demoing! 🚀**
