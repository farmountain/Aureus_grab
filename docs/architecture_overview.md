# Architecture Overview — Aureus + OpenClaw Integration

## System summary
Aureus provides governance, policy, signing, and evidence gating. OpenClaw provides channel ingress, session continuity, and execution nodes. The Bridge (gateway-adapter) mediates requests: OpenClaw -> Bridge -> Aureus decision engine -> signed plan -> OpenClaw executes after verifying signature.

## Components
- OpenClaw Gateway: channel adapters (telegram, discord, web), session manager, executor wrapper that enforces signed plans.
- Bridge/Adapter: reliable transport, schema validation, request enrichment, signer/verifier client to Aureus.
- Aureus Governance Core: policy FSM, CRV gates, signer service (ed25519), audit log, replay store.
- Storage & Ops: Postgres (state + memory), Redis (queues), object store for event logs, observability stack (Prometheus/Grafana).

## Interfaces & Contracts
- IntentEnvelope (OpenClaw -> Bridge)
- ContextSnapshot (current user/session/context)
- ProposedActionPlan (Aureus -> Bridge)
- ExecutionApproval (signed by Aureus)
- ExecutionReport (post-execution reporting)

All contracts are strict JSON Schema with `additionalProperties: false`, include a `version` field and a `type` discriminator.

## Data flow (happy path)
1. User sends command via channel to OpenClaw.
2. OpenClaw constructs `IntentEnvelope` and POSTs to Bridge `/intents`.
3. Bridge validates schema, enriches context, forwards to Aureus decision API.
4. Aureus evaluates policies, produces `ProposedActionPlan`, signs an `ExecutionApproval` (ed25519 + TTL).
5. Bridge returns signed approval to OpenClaw; OpenClaw verifies signature and executes allowed steps.
6. OpenClaw posts `ExecutionReport` back to Aureus for audit and replay.

## Security & Safety
- Signer keys loaded from env or secret store; key rotation documented.
- Deny-by-default tool profiles; high-risk actions require human approval.
- Tamper-evident audit log; all signed approvals and reports persisted.

## Deployment notes
- Staging uses Docker Compose; production should use Kubernetes with managed Postgres and Redis.
- Provide docker-compose for demo that wires Aureus and OpenClaw with the Bridge.

## Next artifacts to create
- Detailed sequence diagrams for each flow
- JSON Schema definitions under `aureus-openclaw-platform/contracts/v1/`
- Signer/verifier prototype and unit tests
