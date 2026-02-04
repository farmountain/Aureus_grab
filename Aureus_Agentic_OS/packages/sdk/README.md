# @aureus/sdk

Developer SDK for Aureus Agentic OS - providing unified interfaces for building agent applications and tool adapters.

## Features

- **Agent Runtime**: Simplified interface for creating agent applications
- **Tool Adapter SDK**: Helper functions and utilities for creating production-grade tool adapters
- **Type-Safe Schema Generation**: Builders for creating validated input/output schemas
- **Policy Integration**: Helpers for wiring tools with policy enforcement
- **CRV Integration**: Utilities for integrating Circuit Reasoning Validation

## Installation

```bash
npm install @aureus/sdk
```

## Tool Adapter SDK

The Tool Adapter SDK provides helper functions for creating ToolSpec adapters with proper schema validation, policy integration, and CRV validation.

### Quick Start

```typescript
import {
  createToolSpec,
  createToolAction,
  createToolCRVGate,
  SchemaBuilder,
  SchemaPatterns,
} from '@aureus/sdk';
import { RiskTier, Intent } from '@aureus/policy';
import { Validators } from '@aureus/crv';

// Create input schema using SchemaBuilder
const inputSchema = new SchemaBuilder()
  .addString('url', 'URL to fetch', true)
  .addNumber('timeout', 'Timeout in milliseconds', false)
  .build();

// Create output schema
const outputSchema = new SchemaBuilder()
  .addString('content', 'Response content', true)
  .addNumber('statusCode', 'HTTP status code', true)
  .build();

// Create the tool
const tool = createToolSpec({
  id: 'http-fetch',
  name: 'HTTP Fetch',
  description: 'Fetch data from HTTP endpoint',
  inputSchema,
  outputSchema,
  sideEffect: false,
  execute: async (params) => {
    const url = params.url as string;
    const timeout = (params.timeout as number) || 5000;
    
    // Implementation here
    return {
      content: 'response data',
      statusCode: 200,
    };
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
  validators: [
    Validators.notNull(),
    Validators.schema({ url: 'string' }),
  ],
  blockOnFailure: true,
});
```

### Schema Builders

#### SchemaBuilder

Build type-safe schemas with fluent API:

```typescript
import { SchemaBuilder } from '@aureus/sdk';

const schema = new SchemaBuilder()
  .addString('name', 'User name', true)
  .addNumber('age', 'User age', false)
  .addBoolean('active', 'Is active', true)
  .addArray('tags', 'string', 'Tags', false)
  .allowAdditionalProperties(false)
  .build();
```

#### SchemaPropertyBuilder

Create complex property definitions:

```typescript
import { SchemaPropertyBuilder } from '@aureus/sdk';

const emailProperty = new SchemaPropertyBuilder('string')
  .description('Email address')
  .pattern('^[a-z]+@[a-z]+\\.[a-z]+$')
  .build();

const ageProperty = new SchemaPropertyBuilder('number')
  .description('Age')
  .minimum(0)
  .maximum(150)
  .build();

const statusProperty = new SchemaPropertyBuilder('string')
  .enum('active', 'inactive', 'pending')
  .build();
```

#### SchemaPatterns

Pre-built schema patterns for common use cases:

```typescript
import { SchemaPatterns } from '@aureus/sdk';

// File path validation
const filePathProp = SchemaPatterns.filePath('Input file path');

// URL validation
const urlProp = SchemaPatterns.url('API endpoint');

// Email validation
const emailProp = SchemaPatterns.email('Contact email');

// Positive integers
const countProp = SchemaPatterns.positiveInteger('Item count');

// Non-negative integers
const indexProp = SchemaPatterns.nonNegativeInteger('Array index');

// Enum from array
const statusProp = SchemaPatterns.enumFromArray(
  ['pending', 'active', 'completed'],
  'Task status'
);
```

### Compensation Support

Add compensation/rollback capabilities to tools:

```typescript
import { createToolSpec, createCompensation } from '@aureus/sdk';

const tool = createToolSpec({
  id: 'file-write',
  name: 'File Write',
  description: 'Write data to file',
  sideEffect: true,
  compensation: createCompensation({
    description: 'Restore original file content',
    execute: async (originalParams, result) => {
      // Implement rollback logic
      const filePath = originalParams.path as string;
      // Restore from backup
    },
    maxRetries: 3,
    timeoutMs: 5000,
    mode: 'automatic',
  }),
  execute: async (params) => {
    // Write file implementation
    return { success: true };
  },
});
```

Or use `noCompensation()` for read-only tools:

```typescript
import { noCompensation } from '@aureus/sdk';

const tool = createToolSpec({
  id: 'file-read',
  name: 'File Read',
  description: 'Read file content',
  sideEffect: false,
  compensation: noCompensation(),
  execute: async (params) => {
    // Read implementation
  },
});
```

### Policy Integration

Create policy actions with different risk tiers:

```typescript
import { createToolAction } from '@aureus/sdk';
import { RiskTier, Intent, DataZone } from '@aureus/policy';

// Low risk read operation
const readAction = createToolAction({
  toolId: 'data-read',
  toolName: 'Data Read',
  riskTier: RiskTier.LOW,
  intent: Intent.READ,
  dataZone: DataZone.PUBLIC,
});

// High risk write operation
const writeAction = createToolAction({
  toolId: 'data-write',
  toolName: 'Data Write',
  riskTier: RiskTier.HIGH,
  intent: Intent.WRITE,
  dataZone: DataZone.CONFIDENTIAL,
});

// Critical operation requiring approval
const deleteAction = createToolAction({
  toolId: 'data-delete',
  toolName: 'Data Delete',
  riskTier: RiskTier.CRITICAL,
  intent: Intent.DELETE,
  dataZone: DataZone.RESTRICTED,
});
```

### CRV Integration

Create CRV gates with validators:

```typescript
import { createToolCRVGate } from '@aureus/sdk';
import { Validators } from '@aureus/crv';

const gate = createToolCRVGate({
  toolName: 'Database Query',
  validators: [
    Validators.notNull(),
    Validators.schema({ query: 'string', params: 'array' }),
    Validators.custom(async (commit) => ({
      valid: commit.data !== undefined,
      reason: 'Data must be provided',
    })),
  ],
  blockOnFailure: true,
  requiredConfidence: 0.9,
});
```

## Tool Adapter Wizard

The SDK includes an interactive CLI wizard for scaffolding new tool adapters. See the [Tool Adapter Wizard Guide](../../apps/console/README.md#tool-adapter-wizard) for details.

### Running the Wizard

#### CLI Wizard

```bash
# Using the console CLI
npx aureus-console create-tool

# Or directly
node apps/console/dist/tool-adapter-wizard.js
```

#### Web-Based Wizard

The web-based wizard provides a visual interface for creating tool adapters:

1. **Start the Console Server**:
   ```bash
   npm run deploy:console
   ```

2. **Access the Wizard**:
   - Direct URL: `http://localhost:3000/tool-adapter-wizard`
   - From Agent Studio: `http://localhost:3000/agent-studio` (click "Create Tool Adapter" link)

3. **Benefits of Web Wizard**:
   - Visual form-based interface
   - Real-time validation
   - Preview generated code before saving
   - No need to install CLI tools locally
   - Access from any browser

#### Programmatic API

You can also generate tool adapters programmatically using the API endpoint:

```typescript
import fetch from 'node-fetch';

async function generateToolAdapter(token: string) {
  const response = await fetch('http://localhost:3000/api/tool-adapters/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      name: 'Database Query',
      description: 'Execute database queries with validation',
      inputProperties: [
        { 
          name: 'query', 
          type: 'string', 
          required: true, 
          description: 'SQL query to execute' 
        },
        { 
          name: 'params', 
          type: 'array', 
          required: false, 
          description: 'Query parameters' 
        }
      ],
      outputProperties: [
        { 
          name: 'rows', 
          type: 'array', 
          required: true, 
          description: 'Result rows' 
        },
        { 
          name: 'rowCount', 
          type: 'number', 
          required: true, 
          description: 'Number of rows' 
        }
      ],
      sideEffect: false,
      riskTier: 'MEDIUM',
      intent: 'READ',
      hasCompensation: false
    })
  });

  const result = await response.json();
  
  // Access generated files
  console.log('Adapter:', result.files.adapter.path);
  console.log('Test:', result.files.test.path);
  console.log('Example:', result.files.example.path);
  
  // Write files to disk or process as needed
  return result;
}
```

### What the Wizard Generates

The wizard will interactively prompt you for:
- Tool name and description
- Input/output properties and types
- Side-effect flags
- Idempotency strategy
- Policy risk tier and intent
- Compensation support

It will generate:
- Adapter file in `packages/tools/src/adapters/<tool-name>.ts`
- Unit tests in `packages/tools/tests/<tool-name>.test.ts`
- Example usage in `packages/tools/examples/<tool-name>-example.ts`

## Complete Example

Here's a complete example creating a database query tool:

```typescript
import {
  createToolSpec,
  createToolAction,
  createToolCRVGate,
  createCompensation,
  SchemaBuilder,
  SchemaPatterns,
} from '@aureus/sdk';
import { SafeToolWrapper, IntegratedToolWrapper } from '@aureus/tools';
import { RiskTier, Intent, DataZone } from '@aureus/policy';
import { Validators } from '@aureus/crv';

// Define schemas
const inputSchema = new SchemaBuilder()
  .addString('query', 'SQL query', true)
  .addArray('params', 'any', 'Query parameters', false)
  .addNumber('timeout', 'Query timeout in ms', false)
  .build();

const outputSchema = new SchemaBuilder()
  .addArray('rows', 'object', 'Result rows', true)
  .addNumber('rowCount', 'Number of rows', true)
  .build();

// Create tool
export const dbQueryTool = createToolSpec({
  id: 'db-query',
  name: 'Database Query',
  description: 'Execute database query',
  inputSchema,
  outputSchema,
  sideEffect: false,
  execute: async (params) => {
    const query = params.query as string;
    const queryParams = (params.params as any[]) || [];
    const timeout = (params.timeout as number) || 30000;
    
    // Execute query (implementation omitted)
    const rows = []; // Query result
    
    return {
      rows,
      rowCount: rows.length,
    };
  },
});

// Create policy action
export const dbQueryAction = createToolAction({
  toolId: dbQueryTool.id,
  toolName: dbQueryTool.name,
  riskTier: RiskTier.MEDIUM,
  intent: Intent.READ,
  dataZone: DataZone.INTERNAL,
});

// Create CRV gate
export const dbQueryCRVGate = createToolCRVGate({
  toolName: dbQueryTool.name,
  validators: [
    Validators.notNull(),
    Validators.schema({ query: 'string' }),
  ],
  blockOnFailure: true,
});

// Use with SafeToolWrapper
const wrapper = new SafeToolWrapper(dbQueryTool);
const result = await wrapper.execute({
  query: 'SELECT * FROM users WHERE id = ?',
  params: [123],
});

// Use with IntegratedToolWrapper (full safety)
const integratedWrapper = new IntegratedToolWrapper(dbQueryTool);
// See @aureus/tools documentation for full context setup
```

## API Reference

### Functions

- `createToolSpec(options)`: Create a ToolSpec with all required metadata
- `createToolAction(options)`: Create a policy action for a tool
- `createToolCRVGate(options)`: Create a CRV gate configuration
- `createCompensation(options)`: Create compensation capability
- `noCompensation()`: Create non-supported compensation

### Classes

- `SchemaBuilder`: Fluent builder for creating ToolSchema objects
- `SchemaPropertyBuilder`: Builder for individual schema properties
- `AureusSDK`: Main SDK class for agent applications

### Utilities

- `SchemaPatterns`: Pre-built schema patterns for common validations
- `ToolAdapterSDK`: Exported object with all tool adapter helpers

## Testing

```bash
npm test --workspace=@aureus/sdk
```

## License

MIT

