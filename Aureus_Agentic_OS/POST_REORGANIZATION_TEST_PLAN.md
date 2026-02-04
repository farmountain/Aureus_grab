# Post-Reorganization End-to-End Testing Execution Plan

**Date**: February 1, 2026  
**Status**: Ready for Execution  
**Purpose**: Comprehensive testing strategy to validate system integrity after reorganization

## Executive Summary

This document provides a complete end-to-end testing strategy for Aureus Agentic OS following the January 31, 2026 reorganization. The reorganization primarily affected:
- Documentation structure (new docs/ hierarchy, beta/ subdirectory)
- Infrastructure additions (Kubernetes manifests)
- **No code changes to packages/ or apps/**

### Risk Assessment
- **Code Risk**: LOW (no functional code changes)
- **Integration Risk**: MEDIUM (import paths may be affected, configuration files moved)
- **Deployment Risk**: MEDIUM (new K8s configs need validation)
- **Documentation Risk**: LOW (documentation only, no functional impact)

---

## I. Testing Strategy Overview

### Testing Levels

```
┌─────────────────────────────────────────────────────────────┐
│                     L1: Unit Tests                          │
│                  (Package-level isolation)                  │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                L2: Integration Tests                        │
│              (Cross-package dependencies)                   │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│               L3: System Integration Tests                  │
│          (Full stack with database, Redis, etc.)            │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                 L4: End-to-End Scenarios                    │
│         (Complete workflows, agent lifecycles)              │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│              L5: Deployment Verification                    │
│         (Docker Compose, Kubernetes validation)             │
└─────────────────────────────────────────────────────────────┘
```

### Test Execution Priority

**P0 - Critical (Must Pass)**
- Core invariants (durability, idempotency, CRV, policy, audit, rollback)
- Package imports and exports
- Database connectivity and schema
- Basic workflow execution

**P1 - High Priority**
- Agent lifecycle management
- Memory/HipCortex operations
- Tool execution and safety wrappers
- Console API endpoints
- MCP server integrations

**P2 - Medium Priority**
- Workflow generation
- Test runner functionality
- Monitoring and observability
- Deployment automation scripts

**P3 - Low Priority**
- Demo scenarios
- UI responsiveness
- Documentation links

---

## II. Test Execution Phases

### Phase 1: Pre-Flight Checks (5-10 minutes)
**Goal**: Verify build and basic infrastructure

#### 1.1 Build Verification
```bash
# Execute in workspace root
npm run build:ordered
```

**Expected Outcome**: All packages build successfully without errors

**Validation Checklist**:
- [ ] All packages in packages/* compile
- [ ] No TypeScript errors
- [ ] dist/ directories created for all packages
- [ ] Console app builds successfully

#### 1.2 Dependency Verification
```bash
# Check for broken dependencies
npm ls --depth=0
npm audit
```

**Expected Outcome**: 
- No missing dependencies
- Known vulnerabilities (if any) are documented
- All @aureus/* packages resolve correctly

**Validation Checklist**:
- [ ] No unmet peer dependencies
- [ ] All workspace packages link correctly
- [ ] No circular dependency warnings

#### 1.3 Import Path Validation
```bash
# Run type checking
npm run lint
npx tsc --noEmit
```

**Expected Outcome**: No import resolution errors

**Critical Paths to Verify**:
- `@aureus/kernel` → all other packages
- `@aureus/console` → all package dependencies
- Cross-package imports (observability, memory, crv, policy)

---

### Phase 2: Unit Test Execution (15-20 minutes)
**Goal**: Validate individual package functionality

#### 2.1 Core Packages (P0)

**kernel Package**
```bash
cd packages/kernel
npm test
```
**Key Tests**:
- Orchestrator workflow execution
- State store persistence (in-memory & Postgres)
- Event log durability
- Retry and idempotency logic
- Compensation execution
- Multi-agent coordination
- Deadlock/livelock detection

**Expected**: 50+ tests passing

**crv Package**
```bash
cd packages/crv
npm test
```
**Key Tests**:
- Validator operators (notNull, schema, monotonic, maxSize)
- CRV gate blocking behavior
- Gate chains
- Confidence scoring

**Expected**: 30+ tests passing

**policy Package**
```bash
cd packages/policy
npm test
```
**Key Tests**:
- GoalGuard FSM state transitions
- Risk tier evaluation
- Permission checking
- Approval path determination
- Effort evaluation

**Expected**: 40+ tests passing

**memory-hipcortex Package**
```bash
cd packages/memory-hipcortex
npm test
```
**Key Tests**:
- Snapshot creation and restoration
- Temporal indexing
- Audit logging
- Rollback capability
- Postgres memory store
- Retention policies

**Expected**: 35+ tests passing

#### 2.2 Support Packages (P1)

**world-model Package**
```bash
cd packages/world-model
npm test
```
**Key Tests**:
- State store operations
- Do-graph tracking
- Constraint engine
- Constraint packs (Basel III, GDPR)
- Planning integration

**Expected**: 25+ tests passing

**tools Package**
```bash
cd packages/tools
npm test
```
**Key Tests**:
- Safe tool wrapper
- Sandbox executor
- Permission checker
- Idempotency keys
- Tool result cache
- Integrated wrapper
- Outbox integration

**Expected**: 45+ tests passing

**hypothesis Package**
```bash
cd packages/hypothesis
npm test
```
**Key Tests**:
- Hypothesis manager
- Branch evaluation
- Effort evaluator
- Hypothesis branching

**Expected**: 15+ tests passing

**perception Package**
```bash
cd packages/perception
npm test
```
**Key Tests**:
- Perception pipeline
- Input normalization
- Entity extraction
- Adapter integrations
- Capability matrix

**Expected**: 20+ tests passing

**observability Package**
```bash
cd packages/observability
npm test
```
**Key Tests**:
- Telemetry collection
- Metrics aggregation
- Trace spans
- Event logging

**Expected**: 20+ tests passing

**reflexion Package**
```bash
cd packages/reflexion
npm test
```
**Key Tests**:
- Reflexion engine
- Failure analyzer
- Sandbox executor
- Retry strategies

**Expected**: 15+ tests passing

**benchright Package**
```bash
cd packages/benchright
npm test
```
**Key Tests**:
- Trace collector
- Benchmark evaluator
- Counterfactual simulator
- Cost-value analysis

**Expected**: 20+ tests passing

**evaluation-harness Package**
```bash
cd packages/evaluation-harness
npm test
```
**Key Tests**:
- Evaluation harness
- Criteria evaluation
- Report generation
- Simulation sandbox

**Expected**: 15+ tests passing

**robotics Package**
```bash
cd packages/robotics
npm test
```
**Key Tests**:
- Safety envelope
- Emergency stop
- Watchdog
- ROS2 adapter
- Workflow integration

**Expected**: 25+ tests passing

**sdk Package**
```bash
cd packages/sdk
npm test
```
**Key Tests**:
- SDK initialization
- Agent runtime interface
- Tool adapter SDK
- Client operations

**Expected**: 10+ tests passing

#### 2.3 Console Application (P1)

```bash
cd apps/console
npm test
```

**Critical Test Suites**:
- Authentication (`auth.test.ts`)
- Console service (`console-service.test.ts`)
- Agent builder (`agent-builder.test.ts`)
- Workflow generator (`workflow-generator.test.ts`)
- Test runner (`test-runner.test.ts`)
- DAG validator (`dag-validator.test.ts`)
- MCP builder and API (`mcp-builder.test.ts`, `mcp-api.test.ts`)
- Monitoring (`monitoring.test.ts`)
- LLM assistant (`llm-assistant.test.ts`)
- DevOps audit (`devops-audit.test.ts`)

**Expected**: 100+ tests passing

---

### Phase 3: Integration Tests (10-15 minutes)
**Goal**: Verify cross-package interactions

#### 3.1 System Integration Tests

**All Invariants Test** (P0 - CRITICAL)
```bash
cd tests/integration
npx vitest run all-invariants.test.ts
```

**Validates**:
1. ✅ **Durability**: Workflows resume from persisted state
2. ✅ **Idempotency**: Retries don't duplicate side effects
3. ✅ **Verification**: CRV gates block invalid commits
4. ✅ **Governance**: Goal-Guard FSM gates risky actions
5. ✅ **Auditability**: All actions and state diffs logged
6. ✅ **Rollback**: Safe restore to last verified snapshot

**Expected**: All 6 invariants pass

**Rollback Integration Test** (P0)
```bash
npx vitest run rollback.test.ts
```

**Validates**:
- Memory snapshot integration
- Rollback orchestrator
- State restoration
- Compensation execution

**Safe Side Effects Test** (P0)
```bash
npx vitest run safe-side-effects.test.ts
```

**Validates**:
- Outbox pattern
- Tool safety wrappers
- Side effect isolation

#### 3.2 Chaos Engineering Tests (P1)

```bash
cd tests/chaos
npx vitest run
```

**Test Suites**:
- `invariants.test.ts`: Fault injection scenarios
- `conflicting-writes.test.ts`: Concurrent access patterns
- `tool-failures.test.ts`: Tool failure handling

**Expected**: System maintains invariants under chaos

#### 3.3 Package Integration Tests

**Tool Integration**
```bash
cd packages/tools/tests
npx vitest run telemetry-integration.test.ts
npx vitest run outbox-integration.test.ts
npx vitest run effort-evaluator-integration.test.ts
```

**Robotics Integration**
```bash
cd packages/robotics/tests
npx vitest run workflow-integration.test.ts
```

**Kernel Integration**
```bash
cd packages/kernel/tests
npx vitest run task-loader-integration.test.ts
```

---

### Phase 4: End-to-End Scenarios (20-30 minutes)
**Goal**: Complete workflow validation with real components

#### 4.1 Database Setup (P0)

**PostgreSQL Initialization**
```bash
# Start local Postgres (if not running)
docker run -d \
  --name aureus-test-db \
  -e POSTGRES_PASSWORD=testpass \
  -e POSTGRES_DB=aureus_test \
  -p 5432:5432 \
  postgres:15-alpine

# Wait for startup
sleep 5

# Initialize schema
export DATABASE_URL="postgresql://postgres:testpass@localhost:5432/aureus_test"
cd packages/kernel
psql $DATABASE_URL < src/db-schema.sql
```

**Validation**:
```bash
# Verify tables exist
psql $DATABASE_URL -c "\dt"
```

**Expected Tables**:
- workflow_states
- task_states
- workflow_events
- outbox_entries

#### 4.2 Console Server E2E (P0)

**Start Console Server**
```bash
cd apps/console
export STATE_STORE_TYPE=postgres
export DATABASE_URL="postgresql://postgres:testpass@localhost:5432/aureus_test"
export JWT_SECRET=test-secret
npm run build
npm start &

CONSOLE_PID=$!
sleep 10  # Wait for startup
```

**Test Suite**:

**Health Check**
```bash
curl -f http://localhost:3000/health
```
**Expected**: `200 OK` with status response

**Authentication Flow**
```bash
# Login
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"operator","password":"operator123"}' \
  | jq -r '.token')

echo "Token: $TOKEN"
```
**Expected**: Valid JWT token

**Agent Creation**
```bash
curl -X POST http://localhost:3000/api/agents \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Agent",
    "description": "E2E test agent",
    "goal": "Process test data",
    "deployment_target": "software",
    "reasoning_loop": {
      "enabled": true,
      "maxIterations": 5,
      "pattern": "plan_act_reflect"
    }
  }'
```
**Expected**: `201 Created` with agent ID

**Workflow Execution**
```bash
curl -X POST http://localhost:3000/api/workflows/execute \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "e2e-test-workflow",
    "name": "E2E Test Workflow",
    "tasks": [
      {
        "id": "task1",
        "name": "Initialize",
        "type": "action",
        "riskTier": "LOW"
      },
      {
        "id": "task2",
        "name": "Process",
        "type": "action",
        "riskTier": "MEDIUM"
      }
    ],
    "dependencies": {"task2": ["task1"]}
  }'
```
**Expected**: Workflow execution starts, returns execution ID

**Query Workflow State**
```bash
curl http://localhost:3000/api/workflows/e2e-test-workflow \
  -H "Authorization: Bearer $TOKEN"
```
**Expected**: Workflow status (completed/running/failed)

**Memory Query**
```bash
curl http://localhost:3000/api/memory/snapshots \
  -H "Authorization: Bearer $TOKEN"
```
**Expected**: List of snapshots

**Metrics Check**
```bash
curl http://localhost:3000/api/monitoring/metrics \
  -H "Authorization: Bearer $TOKEN"
```
**Expected**: System metrics (workflows, agents, success rate)

**Cleanup**
```bash
kill $CONSOLE_PID
```

#### 4.3 Demo Scenarios (P2)

**Bank Credit Reconciliation**
```bash
cd apps/demo-scenarios/bank-credit-recon
npm test
```
**Expected**: Reconciliation workflow passes with CRV validation

#### 4.4 Agent Lifecycle Test (P1)

**Complete Agent Workflow**:
1. Create agent blueprint
2. Deploy agent
3. Execute multi-step workflow
4. Trigger CRV validation
5. Require policy approval
6. Log to memory
7. Create snapshot
8. Simulate failure
9. Execute rollback
10. Verify state restoration

**Script**: Create dedicated E2E test script (see Section VI)

---

### Phase 5: Deployment Verification (15-20 minutes)
**Goal**: Validate deployment configurations

#### 5.1 Docker Compose Deployment (P1)

**Environment Setup**
```bash
cd demo-deployment
cp .env.example .env

# Edit .env with test values
cat > .env << EOF
NODE_ENV=production
DB_PASSWORD=testpass123
JWT_SECRET=test-jwt-secret-do-not-use-in-prod
OPENAI_API_KEY=${OPENAI_API_KEY:-mock}
LLM_PROVIDER=openai
LLM_MOCK_FALLBACK=true
DEMO_ENVIRONMENT=shared
EOF
```

**Start Services**
```bash
docker-compose up -d
```

**Wait for Health**
```bash
# Wait up to 60 seconds for services
timeout 60 bash -c '
  until curl -f http://localhost:3000/health 2>/dev/null; do
    echo "Waiting for console..."
    sleep 2
  done
'
```

**Validation Checks**:

```bash
# Check all containers running
docker-compose ps

# Expected services:
# - console (healthy)
# - postgres (healthy)
# - redis (healthy)
# - prometheus (optional)
# - grafana (optional)

# Test database connection
docker-compose exec postgres psql -U aureus -d aureus_demo -c "SELECT 1;"

# Test Redis
docker-compose exec redis redis-cli PING

# Test console API
curl http://localhost:3000/health

# View logs for errors
docker-compose logs console | grep -i error
```

**Functional Test**:
```bash
# Login and create workflow via API
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"operator","password":"operator123"}' \
  | jq -r '.token')

# Create test workflow
curl -X POST http://localhost:3000/api/workflows/execute \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "docker-test-wf",
    "name": "Docker Test",
    "tasks": [{"id": "t1", "name": "Test", "type": "action", "riskTier": "LOW"}],
    "dependencies": {}
  }'
```

**Cleanup**:
```bash
docker-compose down -v
```

#### 5.2 Kubernetes Deployment Validation (P2)

**Prerequisites**:
- Local Kubernetes cluster (minikube, kind, or Docker Desktop)
- kubectl configured

**Deploy to Kubernetes**:
```bash
cd infrastructure/kubernetes

# Create namespace
kubectl apply -f base/namespace.yaml

# Create secrets from template
cp base/secrets.yaml.template base/secrets.yaml
# Edit secrets.yaml with base64-encoded values

kubectl apply -f base/secrets.yaml

# Deploy base configuration
kubectl apply -k base/

# Wait for pods
kubectl wait --for=condition=ready pod -l app=aureus-console -n aureus-agentic-os --timeout=120s
kubectl wait --for=condition=ready pod -l app=postgres -n aureus-agentic-os --timeout=120s
```

**Validation**:
```bash
# Check pod status
kubectl get pods -n aureus-agentic-os

# Check services
kubectl get svc -n aureus-agentic-os

# Port forward console
kubectl port-forward -n aureus-agentic-os svc/console 3000:3000 &
sleep 5

# Test endpoint
curl http://localhost:3000/health

# Check logs
kubectl logs -n aureus-agentic-os -l app=aureus-console --tail=50
```

**Cleanup**:
```bash
kubectl delete namespace aureus-agentic-os
```

#### 5.3 Configuration File Validation (P1)

**Verify all config files are accessible and valid**:

```bash
# Check deployment configs exist
ls -la demo-deployment/docker-compose.yml
ls -la demo-deployment/docker-compose-services.yml
ls -la infrastructure/kubernetes/base/

# Validate YAML syntax
yamllint demo-deployment/docker-compose.yml
yamllint infrastructure/kubernetes/base/*.yaml

# Validate Kustomize
kubectl kustomize infrastructure/kubernetes/base/
kubectl kustomize infrastructure/kubernetes/overlays/production/
```

---

## III. Critical Test Scenarios

### Scenario 1: Core Invariants Validation (P0)

**Test**: All 6 invariants hold under normal operations

**Steps**:
1. Create workflow with multiple tasks
2. Execute with persistence (Postgres)
3. Inject failure mid-execution
4. Verify workflow resumes from checkpoint (Durability)
5. Re-execute completed workflow
6. Verify no duplicate side effects (Idempotency)
7. Submit invalid commit to CRV gate
8. Verify commit blocked (Verification)
9. Submit HIGH risk action
10. Verify human approval required (Governance)
11. Query audit log
12. Verify all actions logged (Auditability)
13. Create snapshot, modify state, rollback
14. Verify state restored (Rollback)

**Success Criteria**: All invariants pass, no exceptions

---

### Scenario 2: Multi-Agent Coordination (P1)

**Test**: Multiple agents with shared resources

**Steps**:
1. Initialize multi-agent coordinator
2. Register coordination policies (EXCLUSIVE, SHARED)
3. Start Agent A requesting exclusive lock on resource X
4. Start Agent B requesting same resource
5. Verify Agent B waits
6. Release Agent A's lock
7. Verify Agent B acquires lock
8. Create deadlock scenario (A waits for B, B waits for A)
9. Verify deadlock detected
10. Apply mitigation (REPLAN strategy)
11. Verify deadlock resolved

**Success Criteria**: 
- Coordination works correctly
- Deadlocks detected and mitigated
- No resource conflicts

---

### Scenario 3: Agent Lifecycle (P0)

**Test**: Complete agent creation to execution

**Steps**:
1. Create agent blueprint with full config
2. Validate blueprint schema
3. Deploy agent
4. Initialize agent runtime orchestrator
5. Execute multi-iteration reasoning loop
6. Agent plans tasks (PLAN phase)
7. Agent executes tasks (ACT phase)
8. Agent observes results (OBSERVE phase)
9. Agent reflects on outcomes (REFLECT phase)
10. Verify memory episodic notes created
11. Verify telemetry collected
12. Query agent state
13. Pause agent
14. Resume agent
15. Terminate agent cleanly

**Success Criteria**:
- Agent completes all phases
- Memory persisted
- Clean state transitions

---

### Scenario 4: Policy Enforcement (P0)

**Test**: Risk tier escalation and approval

**Steps**:
1. Create workflow with LOW, MEDIUM, HIGH, CRITICAL tasks
2. Execute LOW risk task
3. Verify auto-approved
4. Execute MEDIUM risk task
5. Verify auto-approved
6. Execute HIGH risk task
7. Verify human approval required
8. Approve action
9. Verify task executes
10. Execute CRITICAL risk task
11. Verify blocked without permissions
12. Add permissions to principal
13. Retry CRITICAL task
14. Verify human approval required
15. Deny action
16. Verify task blocked

**Success Criteria**:
- Risk tiers enforced correctly
- Approval flows work
- Permissions checked

---

### Scenario 5: CRV Validation Pipeline (P0)

**Test**: Multi-gate validation with blocking

**Steps**:
1. Create gate chain with 3 gates:
   - Gate 1: Not null validation
   - Gate 2: Schema validation
   - Gate 3: Monotonic version check
2. Submit valid commit
3. Verify passes all gates
4. Submit commit with null data
5. Verify blocked at Gate 1
6. Submit commit with invalid schema
7. Verify blocked at Gate 2
8. Submit commit with decreasing version
9. Verify blocked at Gate 3
10. Configure gate with blockOnFailure=false
11. Submit invalid commit
12. Verify warning logged but not blocked

**Success Criteria**:
- Gates validate correctly
- Blocking behavior works
- Confidence scores calculated

---

### Scenario 6: Memory & Rollback (P0)

**Test**: Snapshot management and rollback

**Steps**:
1. Initialize HipCortex memory
2. Create initial snapshot (verified=true)
3. Execute workflow, modify state
4. Create checkpoint snapshot
5. Continue execution
6. Create failure state
7. Trigger rollback to checkpoint
8. Verify state restored to checkpoint
9. Query audit log
10. Verify rollback event logged
11. Test retention policy
12. Create old snapshot
13. Run retention cleanup
14. Verify old snapshot purged

**Success Criteria**:
- Snapshots created correctly
- Rollback restores exact state
- Retention policies work

---

### Scenario 7: Tool Execution Safety (P1)

**Test**: Safe tool wrapper with sandbox

**Steps**:
1. Register tool with SafeToolWrapper
2. Configure permissions
3. Execute tool without permissions
4. Verify blocked
5. Add permissions to principal
6. Execute tool with valid input
7. Verify success
8. Execute tool with invalid input (schema violation)
9. Verify validation error
10. Execute tool with sandbox enabled
11. Verify isolated execution
12. Simulate tool timeout
13. Verify timeout handling
14. Test idempotency key
15. Re-execute with same key
16. Verify cached result returned

**Success Criteria**:
- Permissions enforced
- Schema validation works
- Sandbox isolation verified
- Idempotency works

---

### Scenario 8: Workflow Generation (P2)

**Test**: LLM-assisted workflow generation

**Steps**:
1. Initialize workflow generator with LLM provider
2. Submit natural language goal
3. Generate workflow spec
4. Validate against workflow schema
5. Verify DAG structure (no cycles)
6. Verify safety policy compliance
7. Verify risk tiers assigned
8. Execute generated workflow
9. Verify completes successfully

**Success Criteria**:
- Workflow generated from NL
- Valid structure
- Executable

---

### Scenario 9: Monitoring & Observability (P2)

**Test**: Telemetry collection and metrics

**Steps**:
1. Initialize TelemetryCollector
2. Execute workflow with telemetry
3. Verify events collected:
   - STEP_START
   - STEP_END
   - TOOL_CALL
   - CRV_RESULT
   - POLICY_CHECK
   - SNAPSHOT_COMMIT
4. Query metrics via console API
5. Verify correct counts
6. Test BenchRight integration
7. Collect traces
8. Evaluate quality scores
9. Generate report

**Success Criteria**:
- All events captured
- Metrics accurate
- BenchRight scores calculated

---

### Scenario 10: MCP Server Integration (P1)

**Test**: Model Context Protocol server

**Steps**:
1. Create MCP server spec
2. Deploy MCP server
3. Register tools with MCP
4. Call tool via MCP protocol
5. Verify response format
6. Test tool discovery
7. Test tool schema validation
8. Test error handling

**Success Criteria**:
- MCP server responds correctly
- Tools callable
- Protocol compliance

---

## IV. Test Data & Fixtures

### Standard Test Workflows

#### Simple Workflow (Low Risk)
```yaml
id: simple-test
name: Simple Test Workflow
tasks:
  - id: read
    name: Read Data
    type: action
    riskTier: LOW
  - id: process
    name: Process Data
    type: action
    riskTier: LOW
dependencies:
  process:
    - read
```

#### Multi-Tier Risk Workflow
```yaml
id: multi-risk-test
name: Multi-Risk Workflow
tasks:
  - id: fetch
    name: Fetch Data
    type: action
    riskTier: LOW
  - id: analyze
    name: Analyze Data
    type: action
    riskTier: MEDIUM
  - id: update
    name: Update Records
    type: action
    riskTier: HIGH
    requiredPermissions:
      - action: write
        resource: database
  - id: audit
    name: Audit Trail
    type: action
    riskTier: LOW
dependencies:
  analyze: [fetch]
  update: [analyze]
  audit: [update]
```

#### Critical Workflow (With Compensation)
```yaml
id: critical-test
name: Critical Workflow
tasks:
  - id: backup
    name: Create Backup
    type: action
    riskTier: LOW
  - id: drop-table
    name: Drop Database Table
    type: action
    riskTier: CRITICAL
    requiredPermissions:
      - action: admin
        resource: database
    compensation:
      onFailure: restore-backup
      onTimeout: restore-backup
  - id: restore-backup
    name: Restore from Backup
    type: compensation
    riskTier: MEDIUM
dependencies:
  drop-table: [backup]
```

### Test Agent Blueprints

#### Basic Agent
```json
{
  "name": "Test Agent Basic",
  "description": "Basic test agent",
  "goal": "Execute simple tasks",
  "deployment_target": "software",
  "reasoning_loop": {
    "enabled": true,
    "maxIterations": 3,
    "pattern": "plan_act_reflect",
    "reflectionEnabled": true,
    "planningStrategy": "sequential"
  },
  "memory_settings": {
    "enabled": true,
    "persistenceType": "episodic",
    "indexingStrategy": "temporal",
    "autoReflection": true,
    "reflectionInterval": "task_completion"
  },
  "governance_settings": {
    "crvValidation": {
      "enabled": true,
      "blockOnFailure": true,
      "validators": ["notNull", "schema"]
    },
    "policyEnforcement": {
      "enabled": true,
      "strictMode": true,
      "approvalThresholds": {
        "LOW": "auto_approve",
        "MEDIUM": "auto_approve",
        "HIGH": "human_approval_required",
        "CRITICAL": "multi_party_approval_required"
      },
      "approvalTimeout": 300000
    },
    "auditLevel": "standard",
    "rollbackEnabled": true
  }
}
```

### Test Principals

```typescript
// Low privilege principal
const basicPrincipal: Principal = {
  id: 'user-basic',
  type: 'user',
  permissions: [
    { action: 'read', resource: 'data' }
  ]
};

// Agent principal with moderate permissions
const agentPrincipal: Principal = {
  id: 'agent-1',
  type: 'agent',
  permissions: [
    { action: 'read', resource: 'data' },
    { action: 'write', resource: 'data' },
    { action: 'execute', resource: 'workflow' }
  ]
};

// Admin principal
const adminPrincipal: Principal = {
  id: 'admin',
  type: 'user',
  permissions: [
    { action: '*', resource: '*' }
  ]
};
```

---

## V. Failure Scenarios & Recovery

### Common Failure Patterns to Test

#### Database Connection Loss
**Scenario**: Postgres becomes unavailable mid-workflow

**Test**:
1. Start workflow execution
2. Stop Postgres container
3. Observe error handling
4. Restart Postgres
5. Verify workflow resumes

**Expected**: Graceful degradation, resume after reconnect

#### Redis Cache Failure
**Scenario**: Redis unavailable

**Test**:
1. Stop Redis
2. Execute workflow
3. Verify system continues without cache

**Expected**: System operates without Redis (degraded performance OK)

#### LLM Provider Timeout
**Scenario**: OpenAI API timeout

**Test**:
1. Configure LLM with low timeout
2. Simulate slow response
3. Verify timeout handling
4. Verify fallback to mock LLM

**Expected**: Graceful fallback, no crash

#### Concurrent Workflow Conflicts
**Scenario**: Two workflows modify same state

**Test**:
1. Start workflow A modifying resource X
2. Start workflow B modifying resource X
3. Verify conflict detection
4. Verify one workflow waits or fails safely

**Expected**: No data corruption, clear error

#### Disk Full / Event Log Write Failure
**Scenario**: Cannot write to event log

**Test**:
1. Fill disk / make event log read-only
2. Execute workflow
3. Verify failure mode

**Expected**: Workflow fails safe, no partial commits

---

## VI. Automated Test Execution Scripts

### Master Test Runner Script

Create: `scripts/run-full-test-suite.sh`

```bash
#!/bin/bash
set -e

echo "=========================================="
echo " Aureus Agentic OS - Full Test Suite"
echo "=========================================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Counters
PASSED=0
FAILED=0
SKIPPED=0

# Test result tracking
declare -a FAILED_TESTS

run_test() {
  local test_name=$1
  local test_command=$2
  local priority=$3
  
  echo ""
  echo "[$priority] Running: $test_name"
  echo "Command: $test_command"
  
  if eval "$test_command"; then
    echo -e "${GREEN}✓ PASSED${NC}: $test_name"
    ((PASSED++))
    return 0
  else
    echo -e "${RED}✗ FAILED${NC}: $test_name"
    ((FAILED++))
    FAILED_TESTS+=("$test_name")
    
    if [ "$priority" = "P0" ]; then
      echo -e "${RED}CRITICAL TEST FAILED - ABORTING${NC}"
      exit 1
    fi
    return 1
  fi
}

echo "Phase 1: Pre-Flight Checks"
echo "============================"

run_test "Build all packages" "npm run build:ordered" "P0"
run_test "Dependency check" "npm ls --depth=0" "P0"
run_test "Type checking" "npx tsc --noEmit" "P0"

echo ""
echo "Phase 2: Unit Tests"
echo "==================="

# Core packages
run_test "kernel unit tests" "cd packages/kernel && npm test" "P0"
run_test "crv unit tests" "cd packages/crv && npm test" "P0"
run_test "policy unit tests" "cd packages/policy && npm test" "P0"
run_test "memory-hipcortex unit tests" "cd packages/memory-hipcortex && npm test" "P0"

# Support packages
run_test "world-model unit tests" "cd packages/world-model && npm test" "P1"
run_test "tools unit tests" "cd packages/tools && npm test" "P1"
run_test "hypothesis unit tests" "cd packages/hypothesis && npm test" "P1"
run_test "perception unit tests" "cd packages/perception && npm test" "P1"
run_test "observability unit tests" "cd packages/observability && npm test" "P1"
run_test "reflexion unit tests" "cd packages/reflexion && npm test" "P1"
run_test "benchright unit tests" "cd packages/benchright && npm test" "P1"
run_test "evaluation-harness unit tests" "cd packages/evaluation-harness && npm test" "P1"
run_test "robotics unit tests" "cd packages/robotics && npm test" "P1"
run_test "sdk unit tests" "cd packages/sdk && npm test" "P1"

# Console
run_test "console unit tests" "cd apps/console && npm test" "P1"

echo ""
echo "Phase 3: Integration Tests"
echo "==========================="

run_test "All invariants integration test" "cd tests/integration && npx vitest run all-invariants.test.ts" "P0"
run_test "Rollback integration test" "cd tests/integration && npx vitest run rollback.test.ts" "P0"
run_test "Safe side effects test" "cd tests/integration && npx vitest run safe-side-effects.test.ts" "P0"

# Chaos tests
run_test "Chaos tests" "cd tests/chaos && npx vitest run" "P1"

echo ""
echo "Phase 4: End-to-End Tests"
echo "========================="

# Set up test database
if command -v docker &> /dev/null; then
  echo "Setting up test database..."
  docker run -d --name aureus-test-db \
    -e POSTGRES_PASSWORD=testpass \
    -e POSTGRES_DB=aureus_test \
    -p 5433:5432 \
    postgres:15-alpine || true
  
  sleep 5
  
  export TEST_DATABASE_URL="postgresql://postgres:testpass@localhost:5433/aureus_test"
  
  # Initialize schema
  psql $TEST_DATABASE_URL < packages/kernel/src/db-schema.sql || true
  
  run_test "Console E2E with database" "cd apps/console && TEST_DATABASE_URL=$TEST_DATABASE_URL npm run test:e2e" "P1"
  
  # Cleanup
  docker rm -f aureus-test-db || true
else
  echo -e "${YELLOW}⊘ SKIPPED${NC}: Docker not available for E2E tests"
  ((SKIPPED++))
fi

echo ""
echo "=========================================="
echo " Test Suite Summary"
echo "=========================================="
echo -e "${GREEN}Passed:  $PASSED${NC}"
echo -e "${RED}Failed:  $FAILED${NC}"
echo -e "${YELLOW}Skipped: $SKIPPED${NC}"
echo ""

if [ $FAILED -gt 0 ]; then
  echo -e "${RED}Failed Tests:${NC}"
  for test in "${FAILED_TESTS[@]}"; do
    echo "  - $test"
  done
  echo ""
  exit 1
else
  echo -e "${GREEN}✓ All tests passed!${NC}"
  exit 0
fi
```

### Quick Smoke Test Script

Create: `scripts/smoke-test.sh`

```bash
#!/bin/bash
# Quick smoke test for critical functionality

set -e

echo "Running smoke test..."

# Build
npm run build:ordered

# Core packages
cd packages/kernel && npm test -- --run
cd ../crv && npm test -- --run
cd ../policy && npm test -- --run
cd ../memory-hipcortex && npm test -- --run

# Critical integration
cd ../../tests/integration
npx vitest run all-invariants.test.ts

echo "✓ Smoke test passed"
```

---

## VII. Success Criteria & Exit Conditions

### Phase Gate Criteria

**Phase 1 - Pre-Flight**: MUST PASS
- ✅ All packages build without errors
- ✅ No missing dependencies
- ✅ Type checking passes
- ✅ No circular dependencies

**Phase 2 - Unit Tests**: MUST PASS for P0, 95% for P1
- ✅ kernel: 50+ tests passing
- ✅ crv: 30+ tests passing
- ✅ policy: 40+ tests passing
- ✅ memory-hipcortex: 35+ tests passing
- ⚠️ Other packages: 95%+ tests passing

**Phase 3 - Integration**: MUST PASS
- ✅ All 6 invariants pass
- ✅ Rollback integration passes
- ✅ Safe side effects passes
- ⚠️ Chaos tests: 90%+ passing

**Phase 4 - E2E**: MUST PASS for critical scenarios
- ✅ Scenario 1: Core Invariants
- ✅ Scenario 3: Agent Lifecycle
- ✅ Scenario 4: Policy Enforcement
- ✅ Scenario 5: CRV Validation
- ✅ Scenario 6: Memory & Rollback

**Phase 5 - Deployment**: MUST PASS
- ✅ Docker Compose deployment works
- ⚠️ Kubernetes deployment (if applicable)

### Overall Exit Criteria

**PASS Conditions**:
- All P0 tests pass
- 95%+ of P1 tests pass
- 85%+ of P2 tests pass
- All 6 core invariants verified
- No critical security vulnerabilities
- No data corruption scenarios
- Deployment configurations valid

**FAIL Conditions**:
- Any P0 test fails
- < 90% of P1 tests pass
- Any core invariant violated
- Data corruption detected
- Cannot deploy with provided configs

---

## VIII. Known Issues & Workarounds

### Issue 1: Database Schema Location
**Problem**: Schema file path varies by deployment method

**Workaround**: Server tries multiple paths, manually specify if needed:
```bash
export DB_SCHEMA_PATH=/path/to/db-schema.sql
```

### Issue 2: npm audit vulnerabilities
**Problem**: Some dependencies may have known vulnerabilities

**Workaround**: Document in security log, plan updates post-reorganization

### Issue 3: Test Timeouts in CI
**Problem**: Some integration tests may timeout in CI environments

**Workaround**: Increase timeouts for CI:
```typescript
// vitest.config.ts
testTimeout: process.env.CI ? 30000 : 10000
```

### Issue 4: Port Conflicts
**Problem**: Tests may conflict with running services

**Workaround**: Use alternate ports for tests:
```bash
export TEST_PORT=3001
export TEST_DB_PORT=5433
```

---

## IX. Test Environment Setup

### Local Development Environment

**Required**:
- Node.js 18+
- npm 9+
- PostgreSQL 15+ (optional for in-memory tests)
- Docker & Docker Compose (for deployment tests)

**Optional**:
- Redis 7+ (for cache tests)
- Kubernetes cluster (for K8s tests)
- OpenAI API key (for LLM tests, mock fallback available)

### Environment Variables

```bash
# Core
NODE_ENV=test
LOG_LEVEL=debug

# Database
DATABASE_URL=postgresql://postgres:testpass@localhost:5432/aureus_test
STATE_STORE_TYPE=postgres

# Authentication
JWT_SECRET=test-jwt-secret-do-not-use-in-production

# LLM
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-test-key-or-empty-for-mock
LLM_MOCK_FALLBACK=true

# Sandbox
ENABLE_SANDBOX=true

# Test-specific
TEST_PORT=3001
TEST_DB_PORT=5433
```

### CI/CD Environment

**GitHub Actions** (example `.github/workflows/test.yml`):

```yaml
name: Test Suite

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    services:
      postgres:
        image: postgres:15-alpine
        env:
          POSTGRES_PASSWORD: testpass
          POSTGRES_DB: aureus_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
      
      redis:
        image: redis:7-alpine
        ports:
          - 6379:6379
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Build packages
        run: npm run build:ordered
      
      - name: Initialize database
        run: psql postgresql://postgres:testpass@localhost:5432/aureus_test < packages/kernel/src/db-schema.sql
      
      - name: Run tests
        run: npm test
        env:
          DATABASE_URL: postgresql://postgres:testpass@localhost:5432/aureus_test
          STATE_STORE_TYPE: postgres
          JWT_SECRET: test-jwt-secret
          CI: true
      
      - name: Run integration tests
        run: cd tests/integration && npx vitest run
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
```

---

## X. Reporting & Documentation

### Test Execution Report Template

```markdown
# Test Execution Report

**Date**: [YYYY-MM-DD]
**Tester**: [Name]
**Environment**: [Local/CI/Staging]
**Commit**: [Git SHA]

## Summary

- **Total Tests**: XXX
- **Passed**: XXX
- **Failed**: XXX
- **Skipped**: XXX
- **Duration**: XX minutes

## Phase Results

### Phase 1: Pre-Flight Checks
- [ ] Build: PASS/FAIL
- [ ] Dependencies: PASS/FAIL
- [ ] Type Checking: PASS/FAIL

### Phase 2: Unit Tests
- [ ] kernel: PASS/FAIL (XX/XX tests)
- [ ] crv: PASS/FAIL (XX/XX tests)
- [ ] policy: PASS/FAIL (XX/XX tests)
[... continue for all packages]

### Phase 3: Integration Tests
- [ ] All Invariants: PASS/FAIL
- [ ] Rollback: PASS/FAIL
- [ ] Side Effects: PASS/FAIL
- [ ] Chaos: PASS/FAIL

### Phase 4: E2E Tests
- [ ] Core Invariants Scenario: PASS/FAIL
- [ ] Agent Lifecycle Scenario: PASS/FAIL
[... continue for all scenarios]

### Phase 5: Deployment
- [ ] Docker Compose: PASS/FAIL
- [ ] Kubernetes: PASS/FAIL/SKIP

## Failed Tests

[If any]
- Test Name: Reason for failure
- Test Name: Reason for failure

## Issues Found

[If any]
1. Issue description
   - Severity: Critical/High/Medium/Low
   - Steps to reproduce
   - Workaround (if any)

## Overall Assessment

**Status**: ✅ PASS / ❌ FAIL / ⚠️ CONDITIONAL

**Recommendation**: 
- [ ] Safe to proceed with deployment
- [ ] Requires fixes before deployment
- [ ] Requires further investigation

## Notes

[Any additional observations]
```

---

## XI. Next Steps After Testing

### If All Tests Pass ✅

1. **Tag Release**
   ```bash
   git tag -a v0.1.0-post-reorg -m "Post-reorganization validation"
   git push origin v0.1.0-post-reorg
   ```

2. **Update Documentation**
   - Mark reorganization as validated
   - Update deployment guides with tested configs

3. **Deploy to Staging**
   - Use Docker Compose config
   - Run smoke tests in staging

4. **Plan Production Migration**
   - Schedule deployment window
   - Prepare rollback plan

### If Tests Fail ❌

1. **Triage Failures**
   - Categorize by severity (P0/P1/P2)
   - Identify root causes
   - Determine if reorganization-related or pre-existing

2. **Fix Critical Issues (P0)**
   - Address data integrity issues
   - Fix build/import errors
   - Resolve invariant violations

3. **Document Known Issues**
   - Log in GitHub Issues
   - Update KNOWN_ISSUES.md
   - Create workaround documentation

4. **Re-run Tests**
   - After fixes, re-run full suite
   - Verify fixes don't break other tests

---

## XII. Appendix

### A. Package Dependency Graph

```
kernel (core)
├── observability
├── world-model
├── policy
├── memory-hipcortex
├── crv
├── hypothesis
├── tools
├── perception
└── reflexion

tools
├── observability
├── policy
└── crv

hypothesis
├── observability
└── world-model

memory-hipcortex
├── observability
└── world-model

benchright
├── observability
├── kernel
├── crv
├── policy
└── memory-hipcortex

evaluation-harness
└── observability

sdk
├── kernel
├── policy
├── tools
└── memory-hipcortex

console (app)
├── kernel
├── policy
├── crv
├── memory-hipcortex
├── tools
├── world-model
├── hypothesis
├── perception
├── observability
├── reflexion
├── benchright
└── sdk
```

### B. Test Coverage Targets

| Package | Target Coverage | Critical Paths |
|---------|----------------|----------------|
| kernel | 85%+ | Orchestrator, state store, event log |
| crv | 90%+ | Validators, gates, blocking logic |
| policy | 85%+ | FSM, risk evaluation, permissions |
| memory-hipcortex | 85%+ | Snapshots, audit log, rollback |
| tools | 80%+ | Safe wrapper, sandbox, permissions |
| world-model | 75%+ | State store, constraints |
| hypothesis | 75%+ | Branch management, evaluation |
| perception | 70%+ | Pipeline, adapters |
| observability | 80%+ | Telemetry collection, spans |
| reflexion | 75%+ | Failure analysis, retry |
| benchright | 75%+ | Evaluation, counterfactual |
| evaluation-harness | 70%+ | Criteria evaluation |
| robotics | 70%+ | Safety envelope, emergency stop |
| sdk | 80%+ | Runtime interface, adapters |
| console | 70%+ | API endpoints, auth, builders |

### C. Test Execution Time Estimates

| Phase | Estimated Time | Can Parallelize |
|-------|---------------|-----------------|
| Pre-Flight | 5-10 min | No |
| Unit Tests (all packages) | 15-20 min | Yes |
| Integration Tests | 10-15 min | Partial |
| E2E Scenarios | 20-30 min | No |
| Deployment Tests | 15-20 min | No |
| **Total Sequential** | 65-95 min | - |
| **Total Parallelized** | 35-50 min | With CI matrix |

### D. Contact & Escalation

**Test Issues**: Report to GitHub Issues with label `test-failure`

**Critical Failures**: 
- Immediate: Notify team lead
- Block deployment if P0 failures

**Questions**: 
- Documentation: See docs/README.md
- Technical: File GitHub Issue
- Urgent: Team Slack channel

---

## XIII. Conclusion

This comprehensive test plan ensures that the reorganization has not introduced any functional regressions. The layered approach validates the system from unit tests through to full deployment scenarios, with a strong focus on the 6 core invariants that define Aureus Agentic OS.

**Key Takeaways**:
1. **Reorganization was low-risk**: Primarily documentation and infrastructure
2. **Code unchanged**: No package source code modifications
3. **Testing is exhaustive**: 5 phases, 10+ critical scenarios
4. **Clear success criteria**: P0 tests must pass, 95%+ P1 pass rate
5. **Deployment validated**: Both Docker Compose and Kubernetes

Execute this plan methodically, starting with Phase 1 and progressing through each phase. Document results using the provided template. If all phases pass, the system is validated and ready for deployment.

**Estimated Total Execution Time**: 1.5 - 2 hours (manual) or 35-50 minutes (automated with parallelization)

---

**Document Version**: 1.0  
**Last Updated**: February 1, 2026  
**Next Review**: After test execution completion
