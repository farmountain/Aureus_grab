# 🚀 Aureus Sentinel - Quick Start Guide

**Complete end-to-end demo in 5 minutes!**

## Prerequisites

- Docker Desktop installed and running
- Node.js 18+ (for demo client)
- 8GB RAM minimum
- Ports available: 3000, 3001, 5000, 5432, 6379

## Option 1: Automated Setup (Recommended)

### Windows (PowerShell):
```powershell
cd d:\All_Projects\Aureus-Sentinel
.\demo\start-demo.ps1
```

### Linux/macOS:
```bash
cd /path/to/Aureus-Sentinel
chmod +x demo/start-demo.sh
./demo/start-demo.sh
```

## Option 2: Manual Setup

### Step 1: Build Images

```bash
cd d:\All_Projects\Aureus-Sentinel

# Build Aureus OS
docker build -t aureus/agentic-os:latest ./Aureus_Agentic_OS

# Build Bridge (if needed)
docker build -t aureus/bridge:latest .
```

### Step 2: Start Services

```bash
# Start all services
docker-compose -f docker-compose-full.yml up -d

# Wait 30-60 seconds for services to start

# Check status
docker-compose -f docker-compose-full.yml ps
```

### Step 3: Verify Services

```bash
# Test Bridge
curl http://localhost:3000/health

# Test Aureus OS
curl http://localhost:5000/api/health

# Both should return: {"status": "healthy", ...}
```

### Step 4: Run Demo Client

```bash
cd demo
npm install
npm run demo
```

## Quick Test (Without Demo Client)

```bash
# 1. Submit an intent to Aureus OS for policy evaluation
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

# Response will include risk_assessment, approval_required, and execution_plan
```

## Access Points

Once running, access:

| Service | URL | Credentials |
|---------|-----|-------------|
| **Bridge API** | http://localhost:3000 | API Key in headers |
| **Aureus OS** | http://localhost:5000 | None |
| **Grafana** | http://localhost:3001 | admin / admin |
| **Prometheus** | http://localhost:9090 | None |

## Troubleshooting

### Services won't start
```bash
# Stop everything
docker-compose -f docker-compose-full.yml down

# Remove volumes and restart fresh
docker-compose -f docker-compose-full.yml down -v
docker-compose -f docker-compose-full.yml up -d
```

### View logs
```bash
# All logs
docker-compose -f docker-compose-full.yml logs -f

# Specific service
docker-compose -f docker-compose-full.yml logs -f aureus-os
docker-compose -f docker-compose-full.yml logs -f bridge
```

### Port conflicts
Edit `docker-compose-full.yml` and change the left side of port mappings:
```yaml
ports:
  - "3001:3000"  # Changes Bridge from 3000 to 3001
```

## Stop Demo

```bash
# Stop but keep data
docker-compose -f docker-compose-full.yml down

# Stop and remove all data
docker-compose -f docker-compose-full.yml down -v
```

## What You'll See

The demo showcases three scenarios:

1. **Low Risk**: `read_document` → Auto-approved ✅
2. **Medium Risk**: `send_email` → Requires approval ⚠️
3. **High Risk**: `delete_database` → Blocked ❌

Each demonstrates the complete flow:
```
User Intent → Policy Evaluation → Cryptographic Signing → Verification → Execution
```

## Next Steps

- Open Grafana (http://localhost:3001) to see metrics
- View Prometheus (http://localhost:9090) to query metrics
- Read full docs in `demo/README.md`
- Integrate with real OpenClaw channels (Telegram, Discord, Slack)

---

**Need help?** See [demo/README.md](demo/README.md) for detailed documentation.
