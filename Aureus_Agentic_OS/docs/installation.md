# Installation Guide

This guide covers prerequisites, repository setup, workspace builds/tests, persistence configuration, and how to run the operator console and demo scenario.

## Prerequisites

- **Node.js**: version **18+** (required by the repo's `engines` field)
- **npm**: version **9+** recommended
- **PostgreSQL** (optional): version **12+** for persistent state storage
- **OS notes (optional)**:
  - macOS/Linux: works out of the box with Node 18+ and npm
  - Windows: use WSL2 for best compatibility with tooling

## Fresh Clone & Install

From a fresh clone, install dependencies at the repo root:

```bash
git clone <your-fork-or-repo-url>
cd Aureus_Agentic_OS
npm install
```

The root workspace install sets up all packages under `packages/*`. Apps under `apps/` have their own installs.

## Build the Workspace

Run the workspace build (all packages):

```bash
npm run build
```

## Test the Workspace

Run the workspace tests (all packages):

```bash
npm test
```

## PostgreSQL Setup (Optional but Recommended for Production)

Aureus supports both in-memory and persistent storage backends. For production deployments, PostgreSQL is recommended for durability and reliability.

**Important**: Development defaults use in-memory state and memory/audit stores, mock LLMs, and sandbox execution disabled. Production-grade durability, audit persistence, real LLM execution, and sandboxed tool execution require the production configuration outlined in the Production Profile section below.

### Installing PostgreSQL

#### macOS (using Homebrew)
```bash
brew install postgresql@15
brew services start postgresql@15
```

#### Ubuntu/Debian
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

#### Using Docker
```bash
docker run --name aureus-postgres \
  -e POSTGRES_PASSWORD=aureus \
  -e POSTGRES_USER=aureus \
  -e POSTGRES_DB=aureus \
  -p 5432:5432 \
  -d postgres:15
```

### Creating the Database

Connect to PostgreSQL and create a database for Aureus:

```bash
# Connect as postgres user
psql -U postgres

# Create database and user
CREATE DATABASE aureus;
CREATE USER aureus WITH PASSWORD 'your-secure-password';
GRANT ALL PRIVILEGES ON DATABASE aureus TO aureus;

# Exit psql
\q
```

### Running Database Migrations

The database schema is automatically initialized when you first run the application with PostgreSQL configured. The migrations are located in:
- `packages/kernel/src/db-schema.sql` - State store schema
- `packages/memory-hipcortex/src/db-schema.sql` - Memory and audit log schema

To manually run migrations:

```bash
# For state store
psql -U aureus -d aureus -f packages/kernel/src/db-schema.sql

# For memory/audit
psql -U aureus -d aureus -f packages/memory-hipcortex/src/db-schema.sql
```

### Configuration

Configure Aureus to use PostgreSQL by setting environment variables:

```bash
# Option 1: Connection string (recommended)
export DATABASE_URL="postgresql://aureus:your-password@localhost:5432/aureus"
export STATE_STORE_TYPE="postgres"

# Option 2: Individual parameters
export DATABASE_HOST="localhost"
export DATABASE_PORT="5432"
export DATABASE_NAME="aureus"
export DATABASE_USER="aureus"
export DATABASE_PASSWORD="your-password"
export STATE_STORE_TYPE="postgres"

# Optional: Connection pool configuration
export DATABASE_POOL_MAX="20"
export DATABASE_POOL_MIN="2"
export DATABASE_SSL="false"  # Set to "true" for production
export DATABASE_TIMEOUT="30000"
export DATABASE_IDLE_TIMEOUT="10000"
```

### Event Log Configuration

Aureus uses a persistent filesystem-based event log by default. You can configure the event log location and type using environment variables or CLI flags:

```bash
# Event log configuration (defaults shown)
export EVENT_LOG_TYPE="filesystem"  # Currently only "filesystem" is supported
export EVENT_LOG_DIR="./var/run"     # Directory for event logs

# Production recommendation: use a dedicated directory
export EVENT_LOG_DIR="/var/log/aureus/events"
```

When running workflows via CLI, you can also specify these options as command-line flags:

```bash
# Use custom event log directory
aureus run workflow.yaml --event-log-dir /var/log/aureus/events

# Combine with state store configuration
aureus run workflow.yaml --state-store-type postgres --event-log-dir /var/log/aureus/events
```

**Important Notes:**
- Event logs are stored in `<EVENT_LOG_DIR>/<workflow-id>/events.log`
- The event log directory must be writable by the Aureus process
- For production, ensure proper permissions and disk space monitoring
- Event logs are append-only and provide audit trails for compliance

Or create a `.env` file in your project root:

```bash
# .env
DATABASE_URL=postgresql://aureus:your-password@localhost:5432/aureus
STATE_STORE_TYPE=postgres
DATABASE_POOL_MAX=20
DATABASE_SSL=false

# Event log configuration
EVENT_LOG_TYPE=filesystem
EVENT_LOG_DIR=./var/run
```

## Production Profile

Use the following configuration to enable durable state, persistent memory/audit, real LLM execution, and sandboxed tool execution in production.

**CLI example (durable state + persistent event logs):**

```bash
aureus run workflow.yaml \
  --state-store-type postgres \
  --event-log-dir /var/log/aureus/events
```

**Environment example (durable state, persistent memory/audit, real LLM, sandbox):**

```bash
export NODE_ENV=production
export STATE_STORE_TYPE=postgres
export DATABASE_URL="postgresql://aureus:your-password@db.example.com:5432/aureus"
export EVENT_LOG_DIR="/var/log/aureus/events"

# Real LLM provider
export LLM_PROVIDER="openai"
export LLM_MODEL="gpt-4"
export OPENAI_API_KEY="sk-..."

# Sandbox execution
export ENABLE_SANDBOX="true"
```

**Memory & audit persistence**: configure `HipCortex` with `PostgresMemoryStore` and `PostgresAuditLog` so memory entries and audit trails persist in PostgreSQL. See [`docs/persistence.md`](./persistence.md) for wiring details.

**Console production module**: the console exports `createProductionConsoleConfig` to wire PostgreSQL state, filesystem event logs, sandbox integration, OpenAI LLM provider, and telemetry sinks. See [`examples/console-production-config.ts`](../examples/console-production-config.ts) and [`apps/console/README.md`](../apps/console/README.md) for usage.

### Verifying the Setup

Test your PostgreSQL connection:

```bash
psql -U aureus -d aureus -c "SELECT NOW();"
```

## Run the Operator Console

The operator console lives in `apps/console`. Follow the detailed instructions in
[`apps/console/README.md`](../apps/console/README.md). Quick start:

```bash
cd apps/console
npm install
npm run build
npm start
```

The API server defaults to `http://localhost:3000`.

## Run the Demo Scenario

The bank credit reconciliation demo is in `apps/demo-scenarios/bank-credit-recon`.
Follow the scenario README for more detail: [`apps/demo-scenarios/bank-credit-recon/README.md`](../apps/demo-scenarios/bank-credit-recon/README.md).

```bash
cd apps/demo-scenarios/bank-credit-recon
npm install
npm run build
npm start
```

Run the demo tests:

```bash
npm test
```

## End-to-End Agent Development Demo (SDK + LLM)

This walkthrough shows how to create a new agent application with the Aureus SDK and run it locally.

### 1) Build the workspace (includes the SDK)

From the repo root:

```bash
npm install
npm run build
```

### 2) Create a new agent app

Create a new directory for your agent app:

```bash
mkdir -p apps/agents/hello-agent
cd apps/agents/hello-agent
```

Create a `package.json` that references the local SDK package:

```json
{
  "name": "hello-agent",
  "private": true,
  "type": "commonjs",
  "scripts": {
    "start": "node index.js"
  },
  "dependencies": {
    "@aureus/sdk": "file:../../../packages/sdk"
  }
}
```

Install the dependency:

```bash
npm install
```

### 3) Implement the agent runtime

Create `index.js`:

```js
const { AureusSDK } = require('@aureus/sdk');

async function callLLM(prompt) {
  // Replace this stub with your preferred LLM provider.
  // Example: call OpenAI/Anthropic via their SDKs or REST APIs.
  return `LLM response to: ${prompt}`;
}

async function main() {
  const sdk = new AureusSDK({
    id: 'hello-agent',
    name: 'Hello Agent',
    description: 'Simple end-to-end agent demo',
    capabilities: ['summarize', 'answer-questions'],
  });

  const runtime = sdk.createRuntime();
  await runtime.initialize();

  const task = {
    prompt: 'Summarize how Aureus ensures reliable execution.',
  };

  const llmResponse = await callLLM(task.prompt);
  const result = await runtime.execute({ ...task, llmResponse });

  console.log('Task result:', result);
  await runtime.shutdown();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

### 4) Run the agent

```bash
npm start
```

You should see logs from the SDK runtime initialization, execution, and shutdown, along with the task result.

## Troubleshooting

Common setup issues and fixes:

- **Node version mismatch**
  - Symptom: install/build fails with engine or syntax errors.
  - Fix: ensure Node 18+ (`node -v`). Consider using `nvm` or `volta` to manage versions.

- **npm install failures**
  - Symptom: dependency resolution errors or incomplete installs.
  - Fix: remove `node_modules` and `package-lock.json`, then reinstall:
    ```bash
    rm -rf node_modules package-lock.json
    npm install
    ```

- **Build fails in a package**
  - Symptom: TypeScript build errors from a specific workspace.
  - Fix: run the build in that package directory for targeted output:
    ```bash
    cd packages/<package-name>
    npm run build
    ```

- **Permission or file lock errors (Windows)**
  - Symptom: `EPERM`/`EBUSY` on install.
  - Fix: close file watchers/IDEs and retry, or use WSL2.

## Related Documentation

- Observability: [`docs/monitoring-and-alerting.md`](./monitoring-and-alerting.md)
- Security: [`docs/security_model.md`](./security_model.md)
- Policy & governance: [`docs/policy-guide.md`](./policy-guide.md)
- Side-effect safety: [`docs/side-effect-safety.md`](./side-effect-safety.md)
