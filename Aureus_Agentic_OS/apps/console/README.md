# Aureus Console

Operator console for monitoring and controlling Aureus workflows.

## Features

- **Workflow Monitoring**: View running tasks, current step, and status
- **CRV Status**: Monitor Circuit Reasoning Validation gates
- **Policy Status**: Track Goal-Guard FSM decisions and approval requirements
- **Approval Actions**: Approve or deny gated high-risk actions
- **Rollback Controls**: Rollback workflows to verified snapshots
- **Timeline View**: View audit log entries and workflow events
- **Authentication**: Basic auth for operator actions
- **Monitoring Dashboard**: Real-time observability with metrics and reflexion insights
  - Live success rate, CRV failures, policy denials, and rollback tracking
  - Event timeline with filtering and time range controls
  - Reflexion postmortems with automated fix suggestions
  - Telemetry aggregation for production visibility
  - Self-healing insights through failure analysis
- **Deployment Management**: Promote validated workflows from staging to production
  - Version workflow specifications for tracking
  - Deploy to staging and production environments
  - Run smoke tests before promotion
  - Risk-based approval workflows for high-risk deployments
  - Complete audit trail of all deployment decisions
  - Rollback support with HipCortex snapshots
- **Visual DAG Studio**: Drag-and-drop workflow composer with real-time validation
  - Drag-drop task nodes from palette to canvas
  - Connect tasks to define dependencies
  - Configure task properties (retries, timeouts, risk tiers, idempotency)
  - Real-time DAG topology validation
  - Policy and CRV validation
  - Visual risk tier indicators (color-coded borders)
  - Export/import workflow specifications
  - Auto-layout for complex workflows
- **Agent Studio**: Visual agent builder with AI-assisted generation
  - Natural language goal → structured agent blueprint
  - Interactive tool and policy selection
  - Risk profile configuration
  - Agent validation and simulation
  - Deployment pipeline (stage → approve → promote)
  - Memory engine policy generation for HipCortex + MemoryAPI

For operational lifecycle guidance, see the [Agent DevOps Guide](../../docs/agent-devops.md).

## Installation

```bash
npm install
```

## Building

```bash
npm run build
```

## Running

### Start API Server

```bash
npm start
```

The API server will start on `http://localhost:3000` by default. You can change the port by setting the `PORT` environment variable:

```bash
PORT=8080 npm start
```

### Access DAG Studio UI

Open your browser and navigate to:
- **Monitoring Dashboard**: `http://localhost:3000/monitoring` - Live metrics and reflexion insights
- **DAG Studio**: `http://localhost:3000/studio` - Visual workflow composer
- **Workflow Wizard**: `http://localhost:3000/wizard` - Text-based workflow generator
- **Agent Studio**: `http://localhost:3000/agent-studio` - Visual agent builder
- **Deployment Manager**: `http://localhost:3000/deployment` - Deploy and promote workflows
- **Test & Validate**: `http://localhost:3000/test` - Test runner and policy simulator

### Use CLI Interface

```bash
# List all workflows
npx aureus-console list

# Show detailed workflow status
npx aureus-console status <workflow-id>

# Show workflow timeline
npx aureus-console timeline <workflow-id> [limit]

# Show available snapshots
npx aureus-console snapshots <workflow-id>

# Show help
npx aureus-console help
```

## API Endpoints

### Authentication

- `POST /api/auth/login` - Authenticate and get token
- `POST /api/auth/logout` - Logout and invalidate token

### Workflow Operations

- `GET /api/workflows` - List all workflows
- `GET /api/workflows/:id` - Get workflow details
- `GET /api/workflows/:id/events` - Get audit log entries
- `GET /api/workflows/:id/timeline` - Get timeline view
- `GET /api/workflows/:id/snapshots` - Get available snapshots

### Control Operations

- `POST /api/workflows/:id/approve` - Approve a gated action
- `POST /api/workflows/:id/deny` - Deny a gated action
- `POST /api/workflows/:id/rollback` - Rollback to a snapshot

### DAG Validation & Composition

- `POST /api/workflows/validate-dag` - Validate DAG topology (cycles, dependencies)
- `POST /api/workflows/validate-policy` - Validate policy and risk tiers
- `POST /api/workflows/validate-crv` - Validate CRV rules
- `GET /api/workflows/:id/dag` - Get DAG structure
- `POST /api/workflows/spec` - Save/update workflow specification

### Deployment Operations

- `POST /api/deployments/versions` - Register a new workflow version
- `POST /api/deployments` - Create a new deployment
- `GET /api/deployments` - List all deployments with summaries
- `GET /api/deployments/:id` - Get deployment details
- `GET /api/workflows/:workflowId/deployments` - Get deployments for a workflow
- `POST /api/deployments/:id/approve` - Approve a deployment
- `POST /api/deployments/:id/reject` - Reject a deployment
- `POST /api/deployments/:id/complete` - Complete (execute) an approved deployment
- `POST /api/deployments/:id/tests` - Run smoke tests on a deployment
- `POST /api/deployments/:id/promote` - Promote a staging deployment to production

### Monitoring & Observability

- `GET /api/monitoring/metrics` - Get aggregated metrics (success rate, MTTR, human escalation rate, cost per success)
  - Query parameter: `timeRange` (milliseconds, optional) - Filter metrics to a specific time window
- `GET /api/monitoring/events` - Get telemetry events with optional filters
  - Query parameters:
    - `type` (optional) - Filter by event type (e.g., `step_end`, `crv_result`, `policy_check`, `rollback`)
    - `workflowId` (optional) - Filter by workflow ID
    - `startTime` (optional) - Filter events after timestamp (ISO 8601)
    - `endTime` (optional) - Filter events before timestamp (ISO 8601)

### Reflexion (Self-Healing)

- `GET /api/reflexion/postmortems/:workflowId` - Get all postmortems for a workflow
- `GET /api/reflexion/postmortem/:id` - Get a specific postmortem by ID
- `POST /api/reflexion/trigger` - Manually trigger reflexion analysis on a failure
  - Request body: `{ workflowId, taskId, error: { message, stack }, contextData }`
- `GET /api/reflexion/stats` - Get reflexion statistics (total postmortems, sandbox executions, promoted/rejected fixes)

### Agent Studio Operations

- `POST /api/agents/generate` - Generate agent blueprint from natural language goal
  - Request body: `{ goal, riskProfile, constraints, preferredTools, policyRequirements, additionalContext }`
  - Returns: `{ blueprint, metadata: { generatedAt, promptLength, responseLength } }`
- `POST /api/agents/validate` - Validate agent blueprint schema and policies
  - Request body: `{ blueprint }`
  - Returns: `{ valid, issues: [{ severity, message, field }], blueprint }`
- `POST /api/agents/simulate` - Run agent simulation in sandbox
  - Request body: `{ blueprint, testScenario: { description, inputs, expectedOutputs }, dryRun }`
  - Returns: `{ success, executionTime, outputs, logs, metrics }`
- `POST /api/agents/deploy` - Deploy agent through pipeline (register → stage → promote)
  - Request body: `{ blueprint, environment, autoPromote, approvalRequired }`
  - Returns: `{ deploymentId, agentId, status, stages: { register, stage, promote } }`

## Memory Engine Configs (Agent Studio)

Agent Studio generates memory engine configs during blueprint merge. The flow is:

1. Build a `MemoryPolicyConfig` using the blueprint risk profile and default memory goals.
2. Generate a `MemoryPolicy` via `MemoryEngineBuilder`.
3. Wrap the policy in a stable `MemoryEngineConfig` schema (versioned for runtime use).

The schema emitted by Agent Studio is:

```json
{
  "schemaVersion": "1.0",
  "policy": {
    "id": "policy-...",
    "name": "HIGH-optimize-for-performance-policy",
    "description": "Memory policy for high risk profile. Goals: optimize for performance, enable semantic search.",
    "retentionTiers": [
      { "tier": "hot", "maxAgeMs": 86400000, "accessThreshold": 10, "compressionEnabled": false, "summarizationEnabled": false }
    ],
    "summarizationSchedule": { "enabled": true, "intervalMs": 7200000, "batchSize": 50, "strategy": "extract_key" },
    "indexingStrategy": "semantic",
    "governanceThresholds": { "minRetentionMs": 86400000, "maxRetentionMs": 31536000000, "minSummarizationIntervalMs": 1800000, "requireAuditLog": true, "requireEncryption": true },
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  },
  "policyConfig": {
    "goals": ["optimize for performance", "enable semantic search"],
    "riskProfile": "high",
    "complianceRequirements": []
  },
  "generatedAt": "2024-01-01T00:00:00.000Z",
  "generatedBy": "agent-studio",
  "source": {
    "blueprintId": "agent-123",
    "blueprintName": "Demo Agent",
    "riskProfile": "HIGH"
  }
}
```

Runtime components use this schema to apply memory policies to `MemoryAPI` and HipCortex when agents initialize.

## Authentication

The console uses JWT-based authentication with basic username/password.

### Default Credentials

```
Username: operator
Password: operator123
```

### API Usage Example

```bash
# Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"operator","password":"operator123"}'

# Response: {"token":"<jwt-token>","expiresAt":"<timestamp>"}

# List workflows (requires authentication)
curl http://localhost:3000/api/workflows \
  -H "Authorization: Bearer <jwt-token>"

# Approve an action
curl -X POST http://localhost:3000/api/workflows/workflow-123/approve \
  -H "Authorization: Bearer <jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{"taskId":"task-1","approvalToken":"approval-token-xyz"}'

# Rollback to snapshot
curl -X POST http://localhost:3000/api/workflows/workflow-123/rollback \
  -H "Authorization: Bearer <jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{"snapshotId":"snapshot-456","reason":"Reverting failed deployment"}'
```

### Deployment Workflow Example

```bash
# 1. Register a new workflow version
curl -X POST http://localhost:3000/api/deployments/versions \
  -H "Authorization: Bearer <jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "workflowSpec": {
      "id": "payment-processor",
      "name": "Payment Processing Workflow",
      "tasks": [...],
      "dependencies": {}
    },
    "version": "2.0.0",
    "createdBy": "developer",
    "metadata": {"description": "New payment validation logic"}
  }'

# Response: {"id":"version-1-payment-processor","workflowId":"payment-processor","version":"2.0.0",...}

# 2. Create staging deployment
curl -X POST http://localhost:3000/api/deployments \
  -H "Authorization: Bearer <jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "versionId": "version-1-payment-processor",
    "environment": "staging",
    "deployedBy": "operator"
  }'

# Response: {"id":"deployment-1-staging","status":"pending",...}

# 3. Run smoke tests
curl -X POST http://localhost:3000/api/deployments/deployment-1-staging/tests \
  -H "Authorization: Bearer <jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "tests": [
      {"name": "Basic Connectivity", "workflowId": "test-connectivity"},
      {"name": "Payment Validation", "workflowId": "test-payment"}
    ]
  }'

# Response: [{"id":"test-1","testName":"Basic Connectivity","status":"passed"}]

# 4. Complete staging deployment
curl -X POST http://localhost:3000/api/deployments/deployment-1-staging/complete \
  -H "Authorization: Bearer <jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{"deployedBy":"operator"}'

# 5. Promote to production (requires approval for high-risk deployments)
curl -X POST http://localhost:3000/api/deployments/deployment-1-staging/promote \
  -H "Authorization: Bearer <jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{"promotedBy":"operator"}'

# Response: {"message":"Promoted to production","deployment":{"id":"deployment-2-production",...}}
```

### Agent Studio Workflow Example

```bash
# 1. Generate agent blueprint from natural language goal
curl -X POST http://localhost:3000/api/agents/generate \
  -H "Authorization: Bearer <jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "goal": "Monitor API health and alert on failures",
    "riskProfile": "MEDIUM",
    "preferredTools": ["http-client", "email-sender"],
    "constraints": ["Read-only access", "Max 10 requests/minute"],
    "policyRequirements": ["Rate limiting", "Timeout enforcement"]
  }'

# Response: {"blueprint":{"id":"agent-1","name":"Monitor API Health Agent",...},"metadata":{...}}

# 2. Validate agent blueprint
curl -X POST http://localhost:3000/api/agents/validate \
  -H "Authorization: Bearer <jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "blueprint": {
      "id": "agent-1",
      "name": "Monitor API Health Agent",
      "goal": "Monitor API health and alert on failures",
      "config": {"prompt": "...", "temperature": 0.7},
      "tools": [...],
      "policies": [...]
    }
  }'

# Response: {"valid":true,"issues":[{"severity":"info","message":"..."}],"blueprint":{...}}

# 3. Run simulation
curl -X POST http://localhost:3000/api/agents/simulate \
  -H "Authorization: Bearer <jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "blueprint": {...},
    "testScenario": {
      "description": "Test API monitoring workflow",
      "inputs": {"endpoints": ["https://api.example.com/health"]}
    },
    "dryRun": true
  }'

# Response: {"success":true,"executionTime":1250,"outputs":{...},"logs":[...],"metrics":{...}}

# 4. Deploy agent
curl -X POST http://localhost:3000/api/agents/deploy \
  -H "Authorization: Bearer <jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "blueprint": {...},
    "environment": "staging",
    "approvalRequired": true
  }'

# Response: {
#   "deploymentId": "deploy-1",
#   "agentId": "agent-1",
#   "status": "pending_approval",
#   "stages": {
#     "register": {"status": "completed", "message": "Agent registered"},
#     "stage": {"status": "pending", "message": "Waiting for approval"},
#     "promote": {"status": "pending"}
#   }
# }
```

## Testing

```bash
npm test
```

## Integration with Kernel

The console integrates with the Aureus kernel through:

1. **StateStore**: Reads workflow and task states
2. **EventLog**: Reads audit log entries and timeline events
3. **GoalGuardFSM**: Validates approval tokens for gated actions
4. **SnapshotManager**: Lists and triggers rollbacks to snapshots
5. **TelemetryCollector**: Records and aggregates observability metrics
6. **ReflexionEngine**: Analyzes failures and generates fix suggestions

To integrate the console with a running workflow orchestrator, register workflows with the console service:

```typescript
import { ConsoleService } from '@aureus/console';
import { WorkflowOrchestrator } from '@aureus/kernel';
import { TelemetryCollector } from '@aureus/observability';
import { ReflexionEngine } from '@aureus/reflexion';

// Create telemetry collector
const telemetry = new TelemetryCollector();

// Create reflexion engine
const reflexionEngine = new ReflexionEngine(
  policyGuard,
  crvGate,
  { enabled: true, minConfidence: 0.6 },
  chaosScenarios,
  telemetry
);

// Create console service
const consoleService = new ConsoleService(
  stateStore,
  eventLog,
  policyGuard,
  snapshotManager,
  deploymentService,
  telemetry,
  reflexionEngine
);

// Register workflow for monitoring
orchestrator.executeWorkflow(spec).then((state) => {
  consoleService.registerWorkflow(spec.id, state);
  
  // Record telemetry during execution
  telemetry.recordStepStart(spec.id, 'task-1', 'api-call');
  // ... execute task ...
  telemetry.recordStepEnd(spec.id, 'task-1', 'api-call', true, 150);
  
  // On failure, trigger reflexion
  if (taskFailed) {
    const result = await consoleService.triggerReflexion(
      spec.id,
      'task-1',
      error,
      contextData
    );
    
    if (result.fixPromoted) {
      // Apply the suggested fix
      console.log('Reflexion promoted a fix:', result.postmortem.proposedFix);
    }
  }
});
```

### Monitoring Dashboard Usage

The monitoring dashboard provides real-time visibility into:

1. **Live Metrics**:
   - Overall task success rate
   - CRV failures (blocked commits)
   - Policy denials (requires approval)
   - Rollback count

2. **Event Timeline**:
   - Step start/end events with success/failure indicators
   - CRV gate results with pass/fail status
   - Policy check results
   - Rollback events with reasons
   - Filterable by workflow ID and time range

3. **Reflexion Insights**:
   - Postmortems with failure taxonomy and root cause analysis
   - Proposed fixes with confidence scores
   - Fix types: alternate tool selection, CRV threshold modification, workflow reordering
   - Risk tier and estimated impact for each fix
   - Action buttons to apply or dismiss suggestions

Access the monitoring dashboard at `http://localhost:3000/monitoring` after starting the console server.

## Production Configuration Module

For production, use the shared config helper to wire durable StateStore/EventLog, OpenAI LLM provider,
sandbox integration, and telemetry sinks in one place:

```typescript
import { createProductionConsoleConfig } from '@aureus/console';
import { GoalGuardFSM } from '@aureus/policy';
import { SnapshotManager } from '@aureus/memory-hipcortex';
import { ConsoleService } from '@aureus/console';

const productionConfig = await createProductionConsoleConfig({
  eventLogDir: '/var/log/aureus/events',
});

const consoleService = new ConsoleService(
  productionConfig.stateStore,
  productionConfig.eventLog,
  new GoalGuardFSM(productionConfig.telemetry),
  new SnapshotManager(),
  undefined,
  productionConfig.telemetry
);
```

See [`examples/console-production-config.ts`](../examples/console-production-config.ts) for a
full production configuration including telemetry sinks and schema initialization.

## Security Considerations

**Production Deployment Checklist:**

1. **Change Default Credentials**
   - The default username/password (operator/operator123) MUST be changed in production
   - Use environment variables for credentials: `AUTH_USERNAME` and `AUTH_PASSWORD`
   - Consider integrating with an identity provider (OAuth, LDAP, etc.)

2. **Configure CORS Properly**
   - The default CORS configuration allows all origins (`*`)
   - In production, restrict to specific domains:
     ```typescript
     res.header('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || 'https://yourdomain.com');
     ```

3. **Use HTTPS**
   - Deploy behind a reverse proxy (nginx, Apache) with TLS/SSL
   - Use secure cookies for session management
   - Enable HSTS headers

4. **Secure JWT Secrets**
   - Use a cryptographically secure random secret
   - Store secrets in environment variables or secret management systems
   - Rotate secrets periodically

5. **Implement Rate Limiting**
   - Add rate limiting to prevent brute force attacks on login endpoint
   - Use libraries like `express-rate-limit`

6. **Audit All Actions**
   - All approval and denial actions are automatically logged
   - Regularly review audit logs for suspicious activity
   - Consider implementing alerting for critical actions

7. **Session Management**
   - Configure appropriate token expiry times
   - Implement token refresh mechanism for long-running sessions
   - Clear sessions on logout

8. **Input Validation**
   - All API inputs are validated by Express
   - Consider adding additional input sanitization for production

9. **Error Handling**
   - Avoid exposing internal error details in API responses
   - Log errors server-side for debugging
   - Return generic error messages to clients

10. **Network Security**
    - Deploy in a private network or VPC
    - Use firewall rules to restrict access
    - Consider implementing IP whitelisting
