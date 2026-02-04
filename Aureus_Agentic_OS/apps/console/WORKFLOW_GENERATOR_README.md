# Workflow Specification Generator

This module provides a multi-step wizard for generating structured workflow specifications from natural language descriptions.

## Features

- **Natural Language Input**: Describe your agent goal in plain English
- **Structured Output**: Automatically generate a validated workflow specification
- **LLM Orchestration**: Uses AI to extract tasks, tools, risk tiers, and dependencies
- **Schema Validation**: Zod-based validation for type safety and error detection
- **Audit Logging**: All LLM prompts and responses are logged for compliance
- **Interactive UI**: Multi-step wizard with preview and editing capabilities

## Architecture

### Components

1. **Zod Schema** (`packages/kernel/src/workflow-spec-schema.ts`)
   - Type-safe validation schemas
   - Defines WorkflowSpec, TaskSpec, and related types
   - Validates risk tiers, permissions, retry configs, etc.

2. **Workflow Generator** (`apps/console/src/workflow-generator.ts`)
   - LLM orchestration for spec generation
   - Prompt engineering to extract structured data
   - Mock LLM implementation (replace with real LLM API in production)
   - Audit logging via EventLog

3. **API Endpoints** (`apps/console/src/api-server.ts`)
   - `POST /api/workflows/generate` - Generate workflow from natural language
   - `POST /api/workflows/validate` - Validate workflow specification
   - Requires authentication and read permissions

4. **UI Wizard** (`apps/console/src/ui/workflow-wizard.html`)
   - Step 1: Goal + Constraints input
   - Step 2: Generated spec preview with editing
   - Step 3: Validation results and error handling

## Usage

### Via UI

1. Start the console server:
   ```bash
   cd apps/console
   npm run dev
   ```

2. Open your browser to `http://localhost:3000/wizard`

3. Follow the wizard steps:
   - Enter your agent goal and constraints
   - Review the generated specification
   - Validate and download the spec

### Via API

```typescript
import { WorkflowGenerator } from '@aureus/console';
import { InMemoryEventLog } from '@aureus/kernel';

// Create generator with event logging
const eventLog = new InMemoryEventLog();
const generator = new WorkflowGenerator(eventLog);

// Generate workflow
const result = await generator.generateWorkflow({
  goal: 'Reconcile bank transactions with internal ledger',
  constraints: ['Complete within 5 minutes', 'No external API calls'],
  preferredTools: ['database', 'email'],
  riskTolerance: 'MEDIUM',
});

console.log('Generated workflow:', result.spec);
console.log('LLM prompt:', result.metadata.prompt);
```

### Programmatic Validation

```typescript
import { validateWorkflowSpec, validateGenerationRequest } from '@aureus/kernel';

// Validate a generation request
const requestValidation = validateGenerationRequest({
  goal: 'Process customer orders',
  riskTolerance: 'HIGH',
});

if (!requestValidation.success) {
  console.error('Invalid request:', requestValidation.errors);
}

// Validate a workflow spec
const specValidation = validateWorkflowSpec({
  id: 'workflow-123',
  name: 'Order Processing',
  tasks: [...],
  dependencies: { 'task-2': ['task-1'] },
});

if (!specValidation.success) {
  console.error('Invalid spec:', specValidation.errors);
}
```

## Schema Structure

### WorkflowGenerationRequest

```typescript
{
  goal: string;                    // Required, min 10 chars
  constraints?: string[];          // Optional constraints
  preferredTools?: string[];       // Optional tool names
  riskTolerance?: RiskTier;       // LOW, MEDIUM, HIGH, CRITICAL
  additionalContext?: string;      // Optional context
}
```

### WorkflowSpec (Output)

```typescript
{
  id: string;
  name: string;
  tasks: TaskSpec[];
  dependencies: Map<string, string[]>;
  safetyPolicy?: SafetyPolicy;
}
```

### TaskSpec

```typescript
{
  id: string;
  name: string;
  type: 'action' | 'decision' | 'parallel';
  riskTier?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  toolName?: string;
  retry?: RetryConfig;
  requiredPermissions?: Permission[];
  sandboxConfig?: SandboxConfig;
  // ... more fields
}
```

## LLM Integration

The Workflow Generator now supports pluggable LLM providers through a standardized interface. The system includes built-in support for OpenAI and provides a flexible architecture for adding additional providers.

### LLM Provider Interface

All LLM providers implement the `LLMProvider` interface defined in `apps/console/src/llm-provider.ts`:

```typescript
interface LLMProvider {
  generateCompletion(prompt: string, config?: Partial<LLMConfig>): Promise<LLMResponse>;
  validateConfig(): boolean;
}
```

### Available Providers

1. **MockLLMProvider** (default) - For testing and development
2. **OpenAIProvider** - Production integration with OpenAI's GPT models

### Using OpenAI Provider

```typescript
import { WorkflowGenerator } from '@aureus/console';
import { OpenAIProvider } from '@aureus/console/llm-providers/openai-provider';
import { InMemoryEventLog } from '@aureus/kernel';

// Create OpenAI provider with configuration
const provider = new OpenAIProvider({
  apiKey: process.env.OPENAI_API_KEY,
  model: 'gpt-4',
  maxTokens: 4096,
  temperature: 0.7,
  timeoutMs: 30000,
  maxRetries: 3,
  retryDelayMs: 1000,
});

// Create generator with OpenAI provider
const eventLog = new InMemoryEventLog();
const generator = new WorkflowGenerator(eventLog, provider);

// Generate workflow
const result = await generator.generateWorkflow({
  goal: 'Reconcile bank transactions with internal ledger',
  constraints: ['Complete within 5 minutes'],
  riskTolerance: 'MEDIUM',
});
```

### Environment-Based Configuration

The easiest way to configure LLM providers is through environment variables:

```typescript
import { createOpenAIProviderFromEnv } from '@aureus/console/llm-providers/openai-provider';

// Create provider from environment variables
const provider = createOpenAIProviderFromEnv();
const generator = new WorkflowGenerator(eventLog, provider);
```

Required environment variables:

```bash
# OpenAI Configuration
OPENAI_API_KEY=sk-your-api-key-here

# Optional: Model selection
LLM_MODEL=gpt-4

# Optional: Request configuration
LLM_MAX_TOKENS=4096
LLM_TEMPERATURE=0.7
LLM_TIMEOUT_MS=30000
LLM_MAX_RETRIES=3
LLM_RETRY_DELAY_MS=1000
```

See `.env.example` for the complete list of configuration options.

### Provider Features

All providers include:

- **Timeout handling**: Configurable request timeouts
- **Retry logic**: Automatic retries with exponential backoff
- **Output validation**: Ensures responses are valid JSON
- **Error handling**: Distinguishes between retryable and non-retryable errors

### Implementing Custom Providers

To add support for other LLM providers (Anthropic, Cohere, etc.), extend the `BaseLLMProvider` class:

```typescript
import { BaseLLMProvider, LLMConfig, LLMResponse } from '@aureus/console/llm-provider';

export class CustomProvider extends BaseLLMProvider {
  async generateCompletion(prompt: string, config?: Partial<LLMConfig>): Promise<LLMResponse> {
    // Merge config with overrides
    const effectiveConfig = { ...this.config, ...config };
    
    // Execute with retry and timeout
    return this.withRetry(
      () => this.withTimeout(
        () => this.callCustomAPI(prompt, effectiveConfig),
        effectiveConfig.timeoutMs
      ),
      effectiveConfig.maxRetries,
      effectiveConfig.retryDelayMs
    );
  }
  
  private async callCustomAPI(prompt: string, config: LLMConfig): Promise<LLMResponse> {
    // Implement your API call here
    // Return standardized LLMResponse
  }
}
```

## Security Considerations

1. **API Key Management**: 
   - Store API keys in environment variables, never in code
   - Use `.env` files locally (add to `.gitignore`)
   - Use secure secret management in production (e.g., AWS Secrets Manager, Azure Key Vault)
   - Rotate API keys regularly
2. **Audit Logging**: All LLM prompts and responses are logged to the event log
3. **Authentication**: API endpoints require valid auth tokens
4. **Permissions**: Requires 'read' permission to generate workflows
5. **Validation**: All generated specs are validated against Zod schemas
6. **Sanitization**: User inputs should be sanitized before LLM processing
7. **Timeout & Retry**: Configurable timeouts and retry limits prevent resource exhaustion
8. **Rate Limiting**: Consider implementing rate limiting for LLM API calls to control costs

## Testing

```bash
# Test schema validation
cd packages/kernel
npm test -- workflow-spec-schema.test.ts

# Test workflow generator
cd apps/console
npm test -- workflow-generator.test.ts
```

## Future Enhancements

- [x] Real LLM integration (OpenAI implemented, others can be added)
- [ ] Additional LLM providers (Anthropic Claude, Cohere, etc.)
- [ ] Workflow spec templates library
- [ ] Multi-language support for prompts
- [ ] Workflow visualization in UI
- [ ] Version control for workflow specs
- [ ] Import/export functionality
- [ ] Collaborative editing
- [ ] AI-powered optimization suggestions

## API Reference

### POST /api/workflows/generate

Generate a workflow specification from natural language.

**Request:**
```json
{
  "goal": "Reconcile bank transactions",
  "constraints": ["Complete within 5 minutes"],
  "preferredTools": ["database"],
  "riskTolerance": "MEDIUM"
}
```

**Response:**
```json
{
  "spec": {
    "id": "workflow-1234567890",
    "name": "Reconcile Bank Transactions",
    "tasks": [...],
    "dependencies": {...}
  },
  "metadata": {
    "generatedAt": "2024-01-01T00:00:00Z",
    "promptLength": 500,
    "responseLength": 2000
  }
}
```

### POST /api/workflows/validate

Validate a workflow specification.

**Request:**
```json
{
  "id": "workflow-123",
  "name": "Test Workflow",
  "tasks": [...],
  "dependencies": {...}
}
```

**Response:**
```json
{
  "valid": true,
  "spec": {...}
}
```

Or if invalid:
```json
{
  "valid": false,
  "errors": [
    "tasks.0.retry.maxAttempts: Number must be greater than or equal to 1",
    "dependencies: Required"
  ]
}
```

## License

Part of the Aureus Agentic OS project.
