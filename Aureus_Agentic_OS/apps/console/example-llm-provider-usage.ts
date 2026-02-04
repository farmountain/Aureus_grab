/**
 * Example: Using the Workflow Generator with LLM Providers
 * 
 * This example demonstrates how to use the WorkflowGenerator with different
 * LLM providers (Mock and OpenAI).
 */

import { WorkflowGenerator } from './src/workflow-generator';
import { MockLLMProvider } from './src/llm-provider';
import { OpenAIProvider, createOpenAIProviderFromEnv } from './src/llm-providers/openai-provider';
import { InMemoryEventLog } from '@aureus/kernel';

/**
 * Example 1: Using MockLLMProvider (for testing/development)
 */
async function exampleWithMockProvider() {
  console.log('\n=== Example 1: Using MockLLMProvider ===\n');

  const eventLog = new InMemoryEventLog();
  const mockProvider = new MockLLMProvider({ model: 'mock-model' });
  const generator = new WorkflowGenerator(eventLog, mockProvider);

  const result = await generator.generateWorkflow({
    goal: 'Reconcile bank transactions with internal ledger',
    constraints: ['Complete within 5 minutes', 'No external API calls'],
    preferredTools: ['database', 'email'],
    riskTolerance: 'MEDIUM',
  });

  console.log('Generated Workflow ID:', result.spec.id);
  console.log('Workflow Name:', result.spec.name);
  console.log('Number of Tasks:', result.spec.tasks.length);
  console.log('\nTasks:');
  result.spec.tasks.forEach(task => {
    console.log(`  - ${task.name} (${task.type}, ${task.riskTier})`);
  });
}

/**
 * Example 2: Using OpenAI Provider with explicit configuration
 */
async function exampleWithOpenAIProvider() {
  console.log('\n=== Example 2: Using OpenAI Provider ===\n');

  // Note: This requires OPENAI_API_KEY environment variable to be set
  if (!process.env.OPENAI_API_KEY) {
    console.log('Skipping - OPENAI_API_KEY not set');
    return;
  }

  const eventLog = new InMemoryEventLog();
  
  // Create OpenAI provider with explicit configuration
  const openaiProvider = new OpenAIProvider({
    apiKey: process.env.OPENAI_API_KEY,
    model: 'gpt-4',
    maxTokens: 4096,
    temperature: 0.7,
    timeoutMs: 30000,
    maxRetries: 3,
    retryDelayMs: 1000,
  });

  const generator = new WorkflowGenerator(eventLog, openaiProvider);

  const result = await generator.generateWorkflow({
    goal: 'Process customer orders and send confirmation emails',
    constraints: ['Must handle payment processing', 'Send email within 1 minute'],
    preferredTools: ['payment-gateway', 'email-service', 'database'],
    riskTolerance: 'HIGH',
  });

  console.log('Generated Workflow ID:', result.spec.id);
  console.log('Workflow Name:', result.spec.name);
  console.log('Number of Tasks:', result.spec.tasks.length);
  console.log('Model Used:', result.metadata.response.length, 'chars');
  console.log('\nTasks:');
  result.spec.tasks.forEach(task => {
    console.log(`  - ${task.name} (${task.type}, ${task.riskTier})`);
  });
}

/**
 * Example 3: Using OpenAI Provider with environment variables
 */
async function exampleWithOpenAIFromEnv() {
  console.log('\n=== Example 3: Using OpenAI Provider from Environment ===\n');

  // Note: This requires environment variables to be set (see .env.example)
  if (!process.env.OPENAI_API_KEY) {
    console.log('Skipping - OPENAI_API_KEY not set');
    return;
  }

  const eventLog = new InMemoryEventLog();
  
  // Create OpenAI provider from environment variables
  const openaiProvider = createOpenAIProviderFromEnv();

  // Validate configuration
  if (!openaiProvider.validateConfig()) {
    console.error('Invalid OpenAI provider configuration');
    return;
  }

  const generator = new WorkflowGenerator(eventLog, openaiProvider);

  const result = await generator.generateWorkflow({
    goal: 'Analyze sales data and generate weekly report',
    constraints: ['Include visualizations', 'Export to PDF'],
    preferredTools: ['analytics-engine', 'chart-generator', 'pdf-exporter'],
    riskTolerance: 'LOW',
    additionalContext: 'Focus on revenue trends and top-performing products',
  });

  console.log('Generated Workflow ID:', result.spec.id);
  console.log('Workflow Name:', result.spec.name);
  console.log('Number of Tasks:', result.spec.tasks.length);
  console.log('\nSafety Policy:');
  console.log('  Name:', result.spec.safetyPolicy?.name);
  console.log('  Fail Fast:', result.spec.safetyPolicy?.failFast);
  console.log('  Rules:', result.spec.safetyPolicy?.rules.length);
}

/**
 * Example 4: Error handling
 */
async function exampleErrorHandling() {
  console.log('\n=== Example 4: Error Handling ===\n');

  const eventLog = new InMemoryEventLog();
  
  // Create a provider with invalid configuration
  const invalidProvider = new OpenAIProvider({
    apiKey: 'invalid-key',
    model: 'gpt-4',
    timeoutMs: 5000, // Short timeout for demo
    maxRetries: 1, // Only 1 retry
  });

  const generator = new WorkflowGenerator(eventLog, invalidProvider);

  try {
    await generator.generateWorkflow({
      goal: 'Test error handling',
      riskTolerance: 'MEDIUM',
    });
  } catch (error) {
    console.log('Error caught (expected):', error instanceof Error ? error.message : String(error));
  }
}

/**
 * Example 5: Backward compatibility (no provider specified)
 */
async function exampleBackwardCompatibility() {
  console.log('\n=== Example 5: Backward Compatibility ===\n');

  const eventLog = new InMemoryEventLog();
  
  // Create generator without specifying provider (defaults to MockLLMProvider)
  const generator = new WorkflowGenerator(eventLog);

  const result = await generator.generateWorkflow({
    goal: 'Simple workflow without explicit provider',
    riskTolerance: 'LOW',
  });

  console.log('Generated Workflow ID:', result.spec.id);
  console.log('Workflow Name:', result.spec.name);
  console.log('Uses default MockLLMProvider internally');
}

// Run examples
async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║     Workflow Generator - LLM Provider Examples                ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');

  try {
    await exampleWithMockProvider();
    await exampleWithOpenAIProvider();
    await exampleWithOpenAIFromEnv();
    await exampleErrorHandling();
    await exampleBackwardCompatibility();

    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║     All examples completed                                     ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');
  } catch (error) {
    console.error('Error running examples:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}
