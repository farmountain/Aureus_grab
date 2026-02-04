# @aureus/tools

Production-grade tool adapters with comprehensive safety wrappers, sandbox execution, schema validation, policy enforcement, and CRV integration for the Aureus Agentic OS.

## Features

- **Tool Adapter Wizard**: Interactive CLI for scaffolding new tool adapters
- **Sandbox Execution Layer**: Run tools in constrained environments (containers/VMs) with explicit permissions
  - **Permission Enforcement**: Filesystem, network, and resource access controls
  - **Policy-Guarded Escalation**: Human approval for privilege elevation
  - **Audit Logging**: Complete audit trail of all tool access attempts
  - **Resource Limits**: CPU, memory, disk, and execution time constraints
- **Enhanced ToolSpec**: Extended tool specification with input/output schema validation
- **Idempotency Strategies**: Multiple strategies (CACHE_REPLAY, NATURAL, REQUEST_ID, NONE)
- **Compensation Capability**: Saga pattern support for rollback operations
- **Schema Validation**: JSON Schema-like validation for tool inputs and outputs
- **Policy Integration**: Goal-Guard FSM integration for action gating
- **CRV Integration**: Circuit Reasoning Validation for pre/post-execution checks
- **Tool Adapters**: Ready-to-use adapters for common operations:
  - **FileTool**: File read/write/delete with validation and compensation
  - **HTTPTool**: HTTP GET/POST with schema validation and timeout
  - **ShellTool**: Shell command execution with allowlist security
- **Safety Wrappers**: Automatic timeout, error handling, and telemetry

## Installation

```bash
npm install @aureus/tools
```

## Tool Adapter Wizard

The Tool Adapter Wizard is an interactive CLI tool that helps you scaffold new tool adapters with all the necessary boilerplate, schema validation, policy integration, and CRV configuration.

### Running the Wizard

```bash
# Using the console CLI (after building)
npx aureus-console create-tool

# Or use the alias
npx aureus-console tool-wizard
```

### What the Wizard Does

The wizard will interactively prompt you for:

1. **Tool Name**: Human-readable name for the tool (e.g., "Database Query")
2. **Description**: What the tool does
3. **Input Properties**: Define input parameters with:
   - Property name
   - Type (string, number, boolean, array, object)
   - Required flag
   - Optional description
4. **Output Properties**: Define output structure with the same fields
5. **Side Effects**: Whether the tool has side effects (write, delete, execute)
6. **Idempotency Strategy**: How to handle retries (CACHE_REPLAY, NATURAL, REQUEST_ID, NONE)
7. **Policy Risk Tier**: Risk classification (LOW, MEDIUM, HIGH, CRITICAL)
8. **Intent**: Operation type (READ, WRITE, DELETE, EXECUTE, ADMIN)
9. **Compensation**: Whether the tool supports rollback/compensation

### Generated Files

The wizard generates three files:

1. **Adapter File**: `packages/tools/src/adapters/<tool-name>.ts`
   - Complete ToolSpec implementation
   - Input/output schemas
   - Idempotency configuration
   - Compensation logic (if applicable)
   - TODO comments for implementation

2. **Test File**: `packages/tools/tests/<tool-name>.test.ts`
   - Basic test structure
   - Schema validation tests
   - Execution tests
   - Compensation tests (if applicable)

3. **Example File**: `packages/tools/examples/<tool-name>-example.ts`
   - Usage examples
   - SafeToolWrapper example
   - IntegratedToolWrapper example with policy and CRV

The wizard also updates `packages/tools/src/adapters/index.ts` to export your new adapter.

### Example Wizard Session

```
╔════════════════════════════════════════════════════════════╗
║         Tool Adapter Wizard - Aureus Agentic OS           ║
╚════════════════════════════════════════════════════════════╝

This wizard will help you create a new tool adapter.

Tool name (e.g., "Database Query"): API Request
Tool ID: api-request
Tool description: Make HTTP API requests to external services

=== Define input properties ===
Available types: string, number, boolean, array, object

input property name (or press Enter to finish): url
Property type:
  1. string
  2. number
  3. boolean
  4. array
  5. object
Enter choice (1-5) [1]: 1
Is this property required? (Y/n): Y
Property description (optional): API endpoint URL
✓ Added property: url (string, required)

input property name (or press Enter to finish): method
Property type:
  1. string
  2. number
  3. boolean
  4. array
  5. object
Enter choice (1-5) [1]: 1
Is this property required? (y/N): N
Property description (optional): HTTP method (GET, POST, etc.)
✓ Added property: method (string)

input property name (or press Enter to finish): 

=== Define output properties ===
Available types: string, number, boolean, array, object

output property name (or press Enter to finish): statusCode
Property type:
  1. string
  2. number
  3. boolean
  4. array
  5. object
Enter choice (1-5) [1]: 2
Is this property required? (Y/n): Y
Property description (optional): HTTP status code
✓ Added property: statusCode (number, required)

output property name (or press Enter to finish): body
Property type:
  1. string
  2. number
  3. boolean
  4. array
  5. object
Enter choice (1-5) [1]: 1
Is this property required? (Y/n): Y
Property description (optional): Response body
✓ Added property: body (string, required)

output property name (or press Enter to finish): 

Does this tool have side effects (write, delete, execute)? (y/N): N

Policy risk tier:
  1. LOW
  2. MEDIUM
  3. HIGH
  4. CRITICAL
Enter choice (1-4) [1]: 2

Intent:
  1. READ
  2. WRITE
  3. DELETE
  4. EXECUTE
  5. ADMIN
Enter choice (1-5) [1]: 1

=== Generating files ===

✓ Created adapter: /path/to/packages/tools/src/adapters/api-request.ts
✓ Created test: /path/to/packages/tools/tests/api-request.test.ts
✓ Created example: /path/to/packages/tools/examples/api-request-example.ts
✓ Updated adapters index

╔════════════════════════════════════════════════════════════╗
║                     Success!                               ║
╚════════════════════════════════════════════════════════════╝

Next steps:
1. Implement the execute function in the adapter
2. Implement compensation logic (if applicable)
3. Update the test file with proper test cases
4. Build the tools package: npm run build --workspace=@aureus/tools
5. Run tests: npm run test --workspace=@aureus/tools

Files created:
  - /path/to/packages/tools/src/adapters/api-request.ts
  - /path/to/packages/tools/tests/api-request.test.ts
  - /path/to/packages/tools/examples/api-request-example.ts
```

### After Running the Wizard

1. **Implement the `execute` function** in the generated adapter file
2. **Implement compensation logic** if your tool has side effects
3. **Update the tests** with actual test cases and assertions
4. **Build the package**:
   ```bash
   npm run build --workspace=@aureus/tools
   ```
5. **Run tests**:
   ```bash
   npm run test --workspace=@aureus/tools
   ```
6. **Use the Tool Adapter SDK** from `@aureus/sdk` for advanced features:
   ```bash
   npm install @aureus/sdk
   ```

### Web-Based Tool Adapter Wizard

In addition to the CLI wizard, you can use the web-based wizard through the Aureus Console:

1. **Start the Console Server**:
   ```bash
   npm run deploy:console
   ```

2. **Open the Wizard**:
   - Navigate to `http://localhost:3000/tool-adapter-wizard`
   - Or access it from the Agent Studio (`http://localhost:3000/agent-studio`)

3. **Fill in the Form**:
   - Provide tool name and description
   - Define input and output properties
   - Configure side effects, idempotency, and policies
   - Set risk tier and intent
   - Enable compensation if needed

4. **Generate**:
   - Click "Generate Tool Adapter"
   - The wizard will generate three files via the API:
     - Adapter implementation
     - Test file
     - Example usage
   - Copy the generated code to the appropriate files

5. **API Endpoint**:
   The web wizard uses the `/api/tool-adapters/generate` endpoint, which requires authentication. You can also call this endpoint programmatically:
   
   ```typescript
   const response = await fetch('http://localhost:3000/api/tool-adapters/generate', {
     method: 'POST',
     headers: {
       'Content-Type': 'application/json',
       'Authorization': `Bearer ${token}`
     },
     body: JSON.stringify({
       name: 'API Request',
       description: 'Make HTTP API requests',
       inputProperties: [
         { name: 'url', type: 'string', required: true, description: 'API endpoint' }
       ],
       outputProperties: [
         { name: 'data', type: 'object', required: true, description: 'Response data' }
       ],
       sideEffect: false,
       riskTier: 'LOW',
       intent: 'READ'
     })
   });
   
   const result = await response.json();
   // result.files contains the generated adapter, test, and example code
   ```

### Using the SDK Directly

If you prefer to write code instead of using the wizard, use the Tool Adapter SDK:

```typescript
import {
  createToolSpec,
  createToolAction,
  createToolCRVGate,
  SchemaBuilder,
} from '@aureus/sdk';
import { RiskTier, Intent } from '@aureus/policy';
import { Validators } from '@aureus/crv';

// Define schemas
const inputSchema = new SchemaBuilder()
  .addString('input', 'Input data', true)
  .build();

const outputSchema = new SchemaBuilder()
  .addString('output', 'Output data', true)
  .build();

// Create tool
const tool = createToolSpec({
  id: 'my-tool',
  name: 'My Tool',
  description: 'My custom tool',
  inputSchema,
  outputSchema,
  sideEffect: false,
  execute: async (params) => {
    // Implementation
    return { output: 'result' };
  },
});

// Create policy action
const action = createToolAction({
  toolId: tool.id,
  toolName: tool.name,
  riskTier: RiskTier.LOW,
  intent: Intent.READ,
});

// Create CRV gate
const crvGate = createToolCRVGate({
  toolName: tool.name,
  validators: [Validators.notNull()],
  blockOnFailure: true,
});
```

See the [@aureus/sdk README](../sdk/README.md) for complete SDK documentation.

## Core Concepts

### ToolSpec

The enhanced `ToolSpec` interface defines a tool with:

- **Basic info**: `id`, `name`, `description`, `parameters`
- **Schemas**: `inputSchema`, `outputSchema` for validation
- **Side effects**: `sideEffect` flag to indicate if tool has side effects
- **Idempotency**: `idempotencyStrategy` for retry behavior
- **Compensation**: `compensation` capability for saga pattern

### Idempotency Strategies

- **CACHE_REPLAY**: Cache and replay results (default for side-effect tools)
- **NATURAL**: Tool is naturally idempotent, safe to re-execute
- **REQUEST_ID**: Use unique request ID to detect duplicates
- **NONE**: No idempotency guarantee, always re-execute

## Quick Start

### Using Tool Adapters

```typescript
import { FileTool, HTTPTool, ShellTool, SafeToolWrapper } from '@aureus/tools';

// Create a file read tool
const readTool = FileTool.createReadTool();
const wrapper = new SafeToolWrapper(readTool);

// Execute the tool
const result = await wrapper.execute({
  path: '/path/to/file.txt'
});

if (result.success) {
  console.log('File content:', result.data);
} else {
  console.error('Error:', result.error);
}
```

### Using FileTool

```typescript
import { FileTool, SafeToolWrapper } from '@aureus/tools';

// File Read
const readTool = FileTool.createReadTool();
const readWrapper = new SafeToolWrapper(readTool);
const readResult = await readWrapper.execute({
  path: '/path/to/file.txt',
  encoding: 'utf-8'
});

// File Write with compensation
const writeTool = FileTool.createWriteTool();
const writeWrapper = new SafeToolWrapper(writeTool);
const writeResult = await writeWrapper.execute({
  path: '/path/to/output.txt',
  content: 'Hello, World!',
  createDirectories: true
});

// Compensation (rollback)
if (writeTool.compensation?.action) {
  await writeTool.compensation.action.execute(
    { path: '/path/to/output.txt', content: 'Hello, World!' },
    writeResult.data
  );
}
```

### Using HTTPTool

```typescript
import { HTTPTool, SafeToolWrapper } from '@aureus/tools';

// HTTP GET
const getTool = HTTPTool.createGetTool();
const getWrapper = new SafeToolWrapper(getTool);
const getResult = await getWrapper.execute({
  url: 'https://api.example.com/data',
  headers: { 'Authorization': 'Bearer token' },
  timeout: 5000
});

// HTTP POST
const postTool = HTTPTool.createPostTool();
const postWrapper = new SafeToolWrapper(postTool);
const postResult = await postWrapper.execute({
  url: 'https://api.example.com/data',
  body: { key: 'value' },
  headers: { 'Content-Type': 'application/json' }
});
```

### Using ShellTool

```typescript
import { ShellTool, SafeToolWrapper } from '@aureus/tools';

// Standard shell tool with allowlist
const shellTool = ShellTool.createTool(['echo', 'ls', 'cat']);
const shellWrapper = new SafeToolWrapper(shellTool);
const result = await shellWrapper.execute({
  command: 'echo',
  args: ['Hello', 'World'],
  timeout: 5000
});

// Read-only shell tool
const readOnlyTool = ShellTool.createReadOnlyTool();
const readOnlyWrapper = new SafeToolWrapper(readOnlyTool);
const lsResult = await readOnlyWrapper.execute({
  command: 'ls',
  args: ['-la', '/tmp']
});

// Custom shell tool
const customTool = ShellTool.createCustomTool({
  id: 'git-tool',
  name: 'Git Tool',
  description: 'Execute git commands',
  allowlist: ['git'],
  hasSideEffects: true
});
```

## Integrated Tool Execution (Policy + CRV + Idempotency)

The `IntegratedToolWrapper` provides complete safety through policy validation, CRV gates, and idempotency:

```typescript
import {
  IntegratedToolWrapper,
  createActionForTool,
  createCRVConfigForTool,
  FileTool,
  InMemoryToolResultCache
} from '@aureus/tools';
import { GoalGuardFSM, Principal, RiskTier } from '@aureus/policy';
import { CRVGate, Validators } from '@aureus/crv';

// Setup
const tool = FileTool.createWriteTool();
const wrapper = new IntegratedToolWrapper(tool);
const cache = new InMemoryToolResultCache();

// Create principal (agent/user)
const principal: Principal = {
  id: 'agent-1',
  type: 'agent',
  permissions: [
    { action: 'write', resource: 'tool' }
  ]
};

// Create action for policy enforcement
const action = createActionForTool(tool, { 
  riskTier: RiskTier.LOW 
});

// Create CRV gate for validation
const crvConfig = createCRVConfigForTool(tool, {
  validators: [
    Validators.notNull(),
    Validators.schema({ path: 'string', content: 'string' })
  ],
  blockOnFailure: true
});
const crvGate = new CRVGate(crvConfig);

// Create policy guard
const policyGuard = new GoalGuardFSM();

// Execute with full safety
const result = await wrapper.execute(
  {
    path: '/tmp/test.txt',
    content: 'Test content'
  },
  {
    taskId: 'task-1',
    stepId: 'step-1',
    workflowId: 'workflow-1',
    cache,
    principal,
    action,
    policyGuard,
    crvGate
  }
);

// Result includes:
// - Policy decision
// - CRV validation status
// - Idempotency key (if cached)
// - Success/error status
console.log(result);
```

## Execution Flow

The integrated execution flow ensures all safety checks:

1. **Policy Validation** (Goal-Guard FSM):
   - Check principal permissions
   - Validate risk tier
   - Check allowed tools list
   - Generate approval token if needed

2. **Pre-execution CRV Validation**:
   - Validate input data against CRV gate
   - Block execution if validation fails

3. **Safe Tool Execution**:
   - Check idempotency cache
   - Validate input schema
   - Execute with timeout
   - Validate output schema
   - Cache successful results

4. **Post-execution CRV Validation**:
   - Validate output data against CRV gate
   - Mark result with CRV status

## Creating Custom Tools

```typescript
import { ToolSpec, IdempotencyStrategy } from '@aureus/tools';

const customTool: ToolSpec = {
  id: 'custom-tool',
  name: 'Custom Tool',
  description: 'A custom tool implementation',
  parameters: [
    { name: 'input', type: 'string', required: true }
  ],
  
  // Schema validation
  inputSchema: {
    type: 'object',
    properties: {
      input: { type: 'string', pattern: '^[a-z]+$' }
    },
    required: ['input'],
    additionalProperties: false
  },
  outputSchema: {
    type: 'object',
    properties: {
      result: { type: 'string' }
    },
    required: ['result']
  },
  
  // Side effects and idempotency
  sideEffect: true,
  idempotencyStrategy: IdempotencyStrategy.CACHE_REPLAY,
  
  // Compensation capability
  compensation: {
    supported: true,
    mode: 'automatic',
    action: {
      description: 'Undo the operation',
      execute: async (originalParams, result) => {
        // Implement compensation logic
        console.log('Compensating...', originalParams);
      },
      maxRetries: 3,
      timeoutMs: 5000
    }
  },
  
  // Execute function
  execute: async (params) => {
    const input = params.input as string;
    return { result: input.toUpperCase() };
  }
};
```

## Testing

The package includes comprehensive tests:

```bash
npm test
```

Tests cover:
- Schema validation
- Idempotency with cache
- Policy integration
- CRV integration
- Tool adapters (File, HTTP, Shell)
- Failure injection
- Compensation/rollback

## API Reference

### SafeToolWrapper

```typescript
class SafeToolWrapper {
  constructor(tool: ToolSpec, timeoutMs?: number);
  execute(params: Record<string, unknown>, context?: ToolExecutionContext): Promise<ToolResult>;
  getToolId(): string;
}
```

### IntegratedToolWrapper

```typescript
class IntegratedToolWrapper {
  constructor(tool: ToolSpec, timeoutMs?: number);
  execute(params: Record<string, unknown>, context?: IntegratedToolContext): Promise<ToolResult>;
  getToolSpec(): ToolSpec;
  getToolId(): string;
}
```

### Helper Functions

```typescript
// Create action for tool (policy)
function createActionForTool(tool: ToolSpec, options?: {
  riskTier?: RiskTier;
  allowedTools?: string[];
}): Action;

// Create CRV config for tool
function createCRVConfigForTool(tool: ToolSpec, gateConfig?: Partial<GateConfig>): GateConfig;
```

## Sandbox Execution Layer

The `@aureus/tools` package includes a comprehensive sandbox execution layer that runs tools in constrained environments (containers/VMs) with explicit filesystem, network, and resource permissions.

### Overview

The sandbox execution layer provides:
- **Isolated Execution**: Tools run in separate sandboxes (containers, VMs, or process isolation)
- **Permission Enforcement**: Explicit filesystem, network, and resource permissions
- **Policy-Guarded Escalation**: Human approval for privilege elevation
- **Audit Logging**: Complete audit trail of all tool access attempts
- **Resource Limits**: CPU, memory, disk, and execution time constraints

### Quick Start

```typescript
import {
  SandboxedToolWrapper,
  SandboxConfigFactory,
  SandboxExecutor,
  SandboxAuditLogger,
  EscalationManager,
  MockEscalationHandler,
  FileTool,
} from '@aureus/tools';

// Create sandbox components
const auditLogger = new SandboxAuditLogger();
const executor = new SandboxExecutor(auditLogger);
const escalationHandler = new MockEscalationHandler(false);
const escalationManager = new EscalationManager(
  escalationHandler,
  undefined,
  auditLogger
);

// Create sandbox configuration
const sandboxConfig = SandboxConfigFactory.createStandard('my-sandbox');

// Create tool with sandbox
const tool = FileTool.createReadTool();
const wrapper = new SandboxedToolWrapper(tool, sandboxConfig);

// Execute in sandbox
const result = await wrapper.execute(
  { path: '/tmp/test.txt' },
  {
    workflowId: 'workflow-1',
    taskId: 'task-1',
    stepId: 'step-1',
    sandboxExecutor: executor,
    sandboxAuditLogger: auditLogger,
    escalationManager,
    principal: {
      id: 'user-1',
      type: 'user',
      permissions: [],
    },
  }
);
```

### Sandbox Configuration

Three preset configurations are available:

#### Restrictive (High Security)

```typescript
const config = SandboxConfigFactory.createRestrictive('restrictive-sandbox');
// - Network: Disabled
// - Filesystem: Read-only /tmp only
// - CPU: 1 core max
// - Memory: 256 MB max
// - Execution time: 30 seconds max
```

#### Standard (Moderate Security)

```typescript
const config = SandboxConfigFactory.createStandard('standard-sandbox');
// - Network: Enabled with domain whitelist
// - Filesystem: Read /tmp, /var/tmp; Write /tmp/sandbox
// - CPU: 2 cores max
// - Memory: 512 MB max
// - Execution time: 60 seconds max
```

#### Permissive (Trusted Operations)

```typescript
const config = SandboxConfigFactory.createPermissive('permissive-sandbox');
// - Network: Enabled for all domains
// - Filesystem: Read all; Write /tmp, /var/tmp, /home
// - CPU: 4 cores max
// - Memory: 2 GB max
// - Execution time: 5 minutes max
```

### Custom Sandbox Configuration

```typescript
import { SandboxConfig, SandboxType } from '@aureus/tools';

const customConfig: SandboxConfig = {
  id: 'custom-sandbox',
  type: SandboxType.MOCK, // or CONTAINER, VM, PROCESS
  permissions: {
    filesystem: {
      readOnlyPaths: ['/data', '/config'],
      readWritePaths: ['/tmp/output'],
      deniedPaths: ['/etc/secrets'],
      maxDiskUsage: 1024 * 1024 * 1024, // 1 GB
      maxFileCount: 1000,
    },
    network: {
      enabled: true,
      allowedDomains: ['api.example.com', '*.trusted.com'],
      allowedPorts: [443, 8080],
      deniedDomains: ['malicious.com'],
      maxBandwidth: 10 * 1024 * 1024, // 10 MB/s
    },
    resources: {
      maxCpu: 2,
      maxMemory: 1024 * 1024 * 1024, // 1 GB
      maxExecutionTime: 120000, // 2 minutes
      maxProcesses: 50,
    },
    capabilities: ['NET_BIND_SERVICE'],
    allowedEnvVars: ['PATH', 'HOME', 'API_KEY'],
  },
};
```

### Permission Enforcement

The sandbox automatically checks permissions before tool execution:

```typescript
// Filesystem permissions
const fileResult = await wrapper.execute(
  { path: '/etc/passwd' }, // Denied - not in allowed paths
  context
);
// Returns: { success: false, error: "Permission denied: Path '/etc/passwd' is explicitly denied" }

// Network permissions
const networkResult = await wrapper.execute(
  { url: 'https://blocked.com' }, // Denied - not in allowed domains
  context
);
// Returns: { success: false, error: "Permission denied: Domain 'blocked.com' is not in allowed domains list" }
```

### Policy-Guarded Escalation

Request permission elevation with human approval:

```typescript
// Create escalation handler (or use mock for testing)
const escalationHandler = new HumanApprovalHandler();
const escalationManager = new EscalationManager(
  escalationHandler,
  policyGuard,
  auditLogger
);

// Tool execution with escalation support
const result = await wrapper.execute(
  { path: '/restricted/data.txt' },
  {
    ...context,
    escalationManager,
    principal: {
      id: 'user-1',
      type: 'user',
      permissions: [],
    },
  }
);

// If permission denied, escalation request is created
// Human approver receives notification and can approve/deny
// Approved requests grant temporary elevated permissions
```

### Audit Logging

All sandbox operations are logged:

```typescript
const auditLogger = new SandboxAuditLogger(telemetry);

// Get all audit logs
const allLogs = auditLogger.getAuditLog();

// Get logs by type
const permissionDenials = auditLogger.getAuditLogByType(
  SandboxAuditEventType.PERMISSION_DENIED
);

// Get logs by workflow
const workflowLogs = auditLogger.getAuditLogByWorkflow('workflow-1');

// Get logs by time range
const recentLogs = auditLogger.getAuditLogByTimeRange(
  new Date(Date.now() - 3600000), // Last hour
  new Date()
);

// Export to JSON
const jsonLogs = auditLogger.exportToJSON();
```

#### Audit Event Types

- `sandbox_created`: Sandbox initialization
- `sandbox_destroyed`: Sandbox cleanup
- `permission_check`: Permission validation
- `permission_denied`: Permission denial
- `escalation_requested`: Privilege escalation request
- `escalation_approved`: Escalation approved
- `escalation_denied`: Escalation denied
- `tool_execution_start`: Tool execution started
- `tool_execution_end`: Tool execution completed
- `resource_limit_exceeded`: Resource limit hit
- `security_violation`: Security policy violation

### Resource Limits

Sandbox enforces resource constraints:

```typescript
// CPU limit exceeded
// Error: "CPU usage 3 exceeds limit 2"

// Memory limit exceeded
// Error: "Memory usage 1073741824 exceeds limit 536870912 bytes"

// Execution time exceeded
// Error: "Execution time 90000ms exceeds limit 60000ms"

// Process limit exceeded
// Error: "Process count 30 exceeds limit 20"
```

### Sandbox Providers

Multiple sandbox providers are supported:

#### MockSandboxProvider (Testing)

```typescript
import { MockSandboxProvider } from '@aureus/tools';

const provider = new MockSandboxProvider();
executor.registerProvider(provider);
// Simulates sandbox behavior without actual isolation
// Useful for testing and development
```

#### ContainerSandboxProvider (Production)

```typescript
import { ContainerSandboxProvider } from '@aureus/tools';

const provider = new ContainerSandboxProvider();
executor.registerProvider(provider);
// Requires Docker/Podman integration
// Full container-based isolation with cgroups
```

#### VMSandboxProvider (Maximum Isolation)

```typescript
import { VMSandboxProvider } from '@aureus/tools';

const provider = new VMSandboxProvider();
executor.registerProvider(provider);
// Requires VM orchestration (KVM, VirtualBox, etc.)
// Strongest isolation guarantees
```

### Integration with Policy and CRV

Sandbox execution integrates seamlessly with policy enforcement and CRV validation:

```typescript
import {
  SandboxedToolWrapper,
  SandboxConfigFactory,
} from '@aureus/tools';
import { GoalGuardFSM, Principal, RiskTier } from '@aureus/policy';
import { CRVGate, Validators } from '@aureus/crv';

const tool = FileTool.createWriteTool();
const sandboxConfig = SandboxConfigFactory.createStandard('sandbox-1');
const wrapper = new SandboxedToolWrapper(tool, sandboxConfig);

// Setup policy and CRV
const policyGuard = new GoalGuardFSM();
const crvGate = new CRVGate({
  name: 'File Write CRV',
  validators: [Validators.notNull(), Validators.schema({ path: 'string' })],
  blockOnFailure: true,
});

const result = await wrapper.execute(
  { path: '/tmp/sandbox/output.txt', content: 'data' },
  {
    workflowId: 'workflow-1',
    taskId: 'task-1',
    stepId: 'step-1',
    sandboxExecutor: executor,
    sandboxAuditLogger: auditLogger,
    escalationManager,
    principal,
    action,
    policyGuard,
    crvGate,
    cache,
  }
);

// Execution flow:
// 1. Policy validation (Goal-Guard FSM)
// 2. Pre-execution CRV validation (input)
// 3. Permission checks (sandbox)
// 4. Sandbox execution (isolated)
// 5. Post-execution CRV validation (output)
```

### Best Practices

1. **Use appropriate security levels**: Start with restrictive, escalate only when needed
2. **Enable audit logging**: Always create and monitor audit logs
3. **Implement escalation handlers**: Use human approval for production systems
4. **Set resource limits**: Prevent resource exhaustion attacks
5. **Whitelist, not blacklist**: Define allowed resources explicitly
6. **Clean up sandboxes**: Use non-persistent sandboxes when possible
7. **Monitor sandbox metrics**: Track resource usage and violations

### Security Considerations

- Sandbox isolation is only as strong as the provider implementation
- MockSandboxProvider is for testing only - use Container or VM providers in production
- Permission checks are enforced at the wrapper level - ensure all tool execution goes through wrappers
- Escalation requires secure authentication and authorization of approvers
- Audit logs should be stored in tamper-proof storage
- Resource limits prevent denial-of-service but may impact legitimate operations

## Architecture

- All tools pass through policy gates (Goal-Guard FSM)
- All tools pass through CRV validation gates
- Sandbox execution provides runtime isolation and permission enforcement
- Idempotency ensures safe retries
- Schema validation prevents invalid inputs/outputs
- Compensation enables rollback in saga patterns
- Telemetry integration for observability
- Audit logging for compliance and security

## License

MIT
