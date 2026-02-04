# MCP Servers in AgentBuilder

This guide explains how AgentBuilder defines MCP server configs, how those configs map to tool adapters, how MCP wiring works in the console/runtime, and provides concrete examples for generation and deployment.

## MCP server config schema (AgentBuilder + Kernel)

The MCP server definition used by AgentBuilder follows the kernel MCP schemas:

- **MCP Action Schema**
  - `name`, `description`, `inputSchema`, optional `outputSchema`
  - `riskTier`, `requiredPermissions`, `requiresApproval`, optional `crvValidation`
- **MCP Server Definition Schema**
  - `name`, `version`, `description`
  - `actions` (array of MCP actions)
  - `metadata.generatedAt`, `metadata.totalActions`, `metadata.riskDistribution`
- **MCP Generation Request Schema**
  - `serverName`, `serverVersion`, `serverDescription`
  - `tools[]` with `name`, `description`, `parameters`, optional `returns`, optional `capabilities`
  - `defaultRiskTier`, `enableCRVValidation`, `inferRiskFromCapabilities`

These are implemented in `packages/kernel/src/agent-spec-schema.ts` as `MCPActionSchema`, `MCPServerDefinitionSchema`, and `MCPGenerationRequestSchema`. The definitions enforce governance rules such as “HIGH/CRITICAL actions must specify permissions” and “CRITICAL must require approval.”【F:packages/kernel/src/agent-spec-schema.ts†L967-L1077】

AgentBuilder uses the MCP Builder to create a server definition from the agent’s selected tools. When generating a server config, it maps each blueprint tool into a minimal tool description and passes it to the MCP Builder with options derived from the blueprint’s risk profile (including enabling CRV for HIGH/CRITICAL).【F:apps/console/src/agent-builder.ts†L1442-L1464】

## How configs map to tool adapters

### 1) Tool capabilities → MCP action risk and permissions

The MCP Builder uses tool capabilities to infer a risk tier, and then assigns required permissions based on the risk tier and tool capabilities. This is the bridge from “what tools are selected” to “what MCP actions look like.”【F:apps/console/src/mcp-builder.ts†L101-L237】

In AgentBuilder, the capabilities passed into MCP generation come from each tool’s `permissions` (as provided in the blueprint).【F:apps/console/src/agent-builder.ts†L1446-L1451】

### 2) Capabilities → Tool adapter selection

Tool adapters in `@aureus/tools` define canonical capability sets. These capability enums and adapter category mappings are the reference for which adapters can satisfy a given MCP tool capability set (e.g., `http-client`, database, file system).【F:packages/tools/src/capability-matrix.ts†L10-L203】

Runtime adapters then use a **tool adapter configuration** (such as `availableTools`) to decide which concrete adapters are initialized, so MCP action capabilities should align with these configured tools to ensure runtime execution availability.【F:packages/kernel/src/runtime-adapters/mobile-desktop-runtime-adapter.ts†L52-L100】

## Runtime wiring in the console/runtime

### Console (Agent Studio + API)

- The console exposes MCP endpoints for **generation** and **validation**. Requests are validated against the kernel schemas, then passed into the MCP Builder for server creation and governance checks.【F:apps/console/src/api-server.ts†L3195-L3292】
- AgentBuilder can **merge** the generated MCP server config into the blueprint when `includeMCPServer: true` is requested, storing it in `mcpServerConfig` for later export/deployment.【F:apps/console/src/agent-builder.ts†L1468-L1519】

### Runtime adapters

Runtime adapters (e.g., mobile/desktop) accept a `toolAdapters` configuration and initialize tool adapters when enabled. This wiring is the runtime side that executes the MCP actions by ensuring the needed adapters are present and configured.【F:packages/kernel/src/runtime-adapters/mobile-desktop-runtime-adapter.ts†L52-L123】【F:packages/kernel/src/runtime-adapters/mobile-desktop-runtime-adapter.ts†L387-L395】

## Examples

### Example MCP generation request (console API)

```json
{
  "serverName": "travel-assistant-mcp",
  "serverVersion": "1.0.0",
  "serverDescription": "MCP server for travel assistant tools",
  "tools": [
    {
      "name": "http-client",
      "description": "Perform outbound HTTP requests",
      "parameters": [
        { "name": "url", "type": "string", "required": true },
        { "name": "method", "type": "string", "required": true }
      ],
      "returns": { "type": "object", "description": "HTTP response payload" },
      "capabilities": ["http-client", "rest-api"]
    }
  ],
  "defaultRiskTier": "MEDIUM",
  "enableCRVValidation": true,
  "inferRiskFromCapabilities": true
}
```

Fields and constraints match the kernel’s MCP generation request schema and the action/server schemas used by the builder at runtime.【F:packages/kernel/src/agent-spec-schema.ts†L1017-L1077】【F:apps/console/src/mcp-builder.ts†L50-L267】

### Example generated MCP server config (excerpt)

```json
{
  "name": "travel-assistant-mcp",
  "version": "1.0.0",
  "description": "MCP server for travel assistant tools",
  "actions": [
    {
      "name": "http-client",
      "description": "Perform outbound HTTP requests",
      "inputSchema": {
        "type": "object",
        "properties": {
          "url": { "type": "string" },
          "method": { "type": "string" }
        },
        "required": ["url", "method"]
      },
      "riskTier": "MEDIUM",
      "requiresApproval": false,
      "crvValidation": true
    }
  ],
  "metadata": {
    "generatedAt": "2024-01-11T00:00:00.000Z",
    "totalActions": 1,
    "riskDistribution": { "LOW": 0, "MEDIUM": 1, "HIGH": 0, "CRITICAL": 0 }
  }
}
```

This follows the MCP server definition schema, and aligns with how MCP Builder constructs `actions` and `metadata` fields.【F:packages/kernel/src/agent-spec-schema.ts†L1017-L1039】【F:apps/console/src/mcp-builder.ts†L240-L272】

### Deploy/register MCP-aware runtime

1. **Generate and export a blueprint** with `includeMCPServer: true` so the resulting `mcpServerConfig` is embedded in the blueprint artifact.【F:apps/console/src/agent-builder.ts†L1468-L1519】
2. **Configure runtime tool adapters** to match the MCP action capabilities (e.g., include `http-client`, `file-tool`, `database-client`). The runtime adapter configuration exposes `toolAdapters.availableTools` for this purpose.【F:packages/kernel/src/runtime-adapters/mobile-desktop-runtime-adapter.ts†L52-L100】
3. **Initialize and register** the runtime adapter with the global registry as part of deployment (example shown in `docs/deployment.md`).【F:docs/deployment.md†L320-L384】

```ts
const mobileAdapter = new MobileDesktopRuntimeAdapter(mobileConfig);
await mobileAdapter.initialize(context);

// Register with global registry
globalRuntimeAdapterRegistry.register(mobileAdapter);
```

The example above demonstrates the runtime registration flow used by deployments, and should be paired with MCP configs that reference tool capabilities supported by the configured adapter set.【F:docs/deployment.md†L320-L384】
