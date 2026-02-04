# MCP Server Builder - Implementation Summary

## Overview
The MCP (Model Context Protocol) Server Builder enables automatic generation of MCP server definitions from tool descriptions, with integrated governance checks and risk classification.

## Key Features

### 1. Automatic Risk Classification
- **LOW**: Read-only operations (e.g., read_file, read_log)
- **MEDIUM**: Standard operations with external interactions (e.g., http_client, api_caller)
- **HIGH**: Operations involving sensitive data or write operations (e.g., write_file, database_query)
- **CRITICAL**: Destructive or system-level operations (e.g., delete_database, execute_command)

Risk tiers are inferred from:
- Tool capabilities
- Tool name patterns (delete, destroy, drop, write, update)
- Description keywords (irreversible, production, sensitive, financial)

### 2. Governance Rules

#### Required Permissions
- **HIGH** risk actions: Must have `elevated_operations` permission
- **CRITICAL** risk actions: Must have `admin` and `critical_operations` permissions
- Capability-based permissions (e.g., `database_access` for database operations)

#### Approval Requirements
- **HIGH** risk actions: Approval recommended
- **CRITICAL** risk actions: Approval required (blocked without it)

#### CRV Validation
- Automatically enabled for HIGH and CRITICAL risk actions
- Validates inputs and ensures policy compliance at runtime

### 3. API Endpoints

#### POST /api/mcp/generate
Generates an MCP server definition from tool descriptions.

**Request:**
```json
{
  "serverName": "my-tools-server",
  "serverVersion": "1.0.0",
  "serverDescription": "Description of the server",
  "tools": [
    {
      "name": "tool_name",
      "description": "Tool description",
      "parameters": [
        {
          "name": "param_name",
          "type": "string",
          "description": "Parameter description",
          "required": true
        }
      ],
      "returns": {
        "type": "string",
        "description": "Return value description"
      },
      "capabilities": ["capability1", "capability2"]
    }
  ],
  "defaultRiskTier": "MEDIUM",
  "enableCRVValidation": true,
  "inferRiskFromCapabilities": true
}
```

**Response:**
```json
{
  "server": {
    "name": "my-tools-server",
    "version": "1.0.0",
    "description": "Description of the server",
    "actions": [
      {
        "name": "tool_name",
        "description": "Tool description",
        "inputSchema": {
          "type": "object",
          "properties": {
            "param_name": {
              "type": "string",
              "description": "Parameter description"
            }
          },
          "required": ["param_name"]
        },
        "riskTier": "MEDIUM",
        "requiredPermissions": ["standard_operations"],
        "requiresApproval": false,
        "crvValidation": true
      }
    ],
    "metadata": {
      "generatedAt": "2024-01-11T00:00:00.000Z",
      "totalActions": 1,
      "riskDistribution": {
        "LOW": 0,
        "MEDIUM": 1,
        "HIGH": 0,
        "CRITICAL": 0
      }
    }
  },
  "validation": {
    "valid": true,
    "errors": [],
    "warnings": []
  }
}
```

#### POST /api/mcp/validate
Validates an MCP server definition or individual action.

**Request (Server):**
```json
{
  "server": {
    "name": "my-server",
    "version": "1.0.0",
    "description": "Server description",
    "actions": [...],
    "metadata": {...}
  }
}
```

**Request (Action):**
```json
{
  "action": {
    "name": "action_name",
    "description": "Action description",
    "inputSchema": {...},
    "riskTier": "HIGH",
    "requiredPermissions": ["elevated_operations"],
    "requiresApproval": false
  }
}
```

**Response:**
```json
{
  "type": "server" | "action",
  "schema": {
    "success": true,
    "data": {...},
    "warnings": []
  },
  "governance": {
    "valid": true,
    "errors": [],
    "warnings": [],
    "governance": {
      "highRiskActionsWithoutPermissions": [],
      "criticalActionsWithoutApproval": [],
      "blockedActions": []
    }
  }
}
```

### 4. UI Integration

The Agent Studio now includes an MCP Server Builder in Step 3 (Select Tools):

1. **Select tools** from the available list
2. **Click "Generate MCP Server Definition"** button
3. **Review auto-classified actions** with inferred risk tiers
4. **Manually adjust risk tiers** if needed using dropdown selectors
5. **Enable CRV validation** for HIGH/CRITICAL actions
6. **Validate** the server definition to check governance compliance
7. **Generate** the final MCP server definition
8. **Copy to clipboard** the generated JSON

#### UI Features:
- Visual risk tier badges (LOW, MEDIUM, HIGH, CRITICAL)
- Permission display for each action
- Approval requirement indicators
- Real-time validation feedback
- Governance issue highlighting
- JSON output with syntax highlighting

### 5. Testing

#### Unit Tests (`mcp-builder.test.ts`)
- ✅ Risk tier inference from capabilities
- ✅ Permission determination
- ✅ Action validation rules
- ✅ Server validation rules
- ✅ Policy guard enforcement
- ✅ Risk distribution calculation

#### Integration Tests (`mcp-api.test.ts`)
- ✅ API endpoint functionality
- ✅ Authentication and authorization
- ✅ Governance rule enforcement
- ✅ Error handling
- ✅ Validation feedback

### 6. Schema Validation

Added to `packages/kernel/src/agent-spec-schema.ts`:

#### `MCPActionSchema`
Validates individual MCP actions with refinements:
- Risk tier is required
- HIGH/CRITICAL must have required permissions
- CRITICAL must require approval

#### `MCPServerDefinitionSchema`
Validates complete MCP server definitions:
- Server name and version required
- At least one action required
- Metadata tracking (risk distribution, generation timestamp)

### 7. Security & Governance

#### Policy Guards
- Block CRITICAL actions without approval
- Enforce permission requirements based on risk tier
- Validate user permissions before action execution

#### CRV Integration
- Runtime validation for HIGH/CRITICAL actions
- Commit-based validation pattern
- Configurable per-action

## Usage Examples

### Example 1: Generate MCP Server
```typescript
import { MCPBuilder } from './mcp-builder';

const builder = new MCPBuilder();

const server = builder.generateMCPServer(
  [
    {
      name: 'read_file',
      description: 'Read file contents',
      parameters: [{ name: 'path', type: 'string', required: true }],
      capabilities: ['file-system'],
    },
  ],
  {
    serverName: 'file-server',
    inferRiskFromCapabilities: true,
  }
);

console.log(server);
```

### Example 2: Validate Action
```typescript
const action = {
  name: 'delete_user',
  description: 'Delete user account',
  inputSchema: { type: 'object', properties: {} },
  riskTier: 'CRITICAL',
  requiredPermissions: ['admin'],
  requiresApproval: true,
};

const validation = builder.validateMCPAction(action);
if (!validation.valid) {
  console.error('Validation errors:', validation.errors);
}
```

### Example 3: Apply Policy Guard
```typescript
const result = builder.applyPolicyGuard(action, ['admin', 'critical_operations']);

if (!result.allowed) {
  console.log('Action blocked:', result.reason);
}
```

## Files Modified/Created

### Created:
- `apps/console/src/mcp-builder.ts` - MCP builder implementation
- `apps/console/tests/mcp-builder.test.ts` - Unit tests
- `apps/console/tests/mcp-api.test.ts` - Integration tests

### Modified:
- `packages/kernel/src/agent-spec-schema.ts` - Added MCP schemas
- `apps/console/src/api-server.ts` - Added MCP endpoints
- `apps/console/src/ui/agent-studio.html` - Added UI integration
- `apps/console/package.json` - Added supertest dependency

## Next Steps

1. **Runtime Integration**: Connect MCP server to actual tool execution
2. **Approval Workflow**: Implement approval process for HIGH/CRITICAL actions
3. **Audit Logging**: Track MCP action executions and governance decisions
4. **Metrics**: Monitor MCP usage, risk distribution, and policy violations
5. **Templates**: Provide pre-built MCP server templates for common use cases
