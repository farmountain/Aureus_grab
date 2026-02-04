/**
 * Tool Adapter Wizard
 * Interactive CLI for scaffolding new tool adapters
 */

import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Tool configuration collected from user
 */
interface ToolConfig {
  name: string;
  id: string;
  description: string;
  inputProperties: Array<{ name: string; type: string; required: boolean; description?: string }>;
  outputProperties: Array<{ name: string; type: string; required: boolean; description?: string }>;
  sideEffect: boolean;
  idempotencyStrategy: string;
  riskTier: string;
  intent: string;
  hasCompensation: boolean;
  compensationDescription?: string;
}

/**
 * Create readline interface
 */
function createInterface(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

/**
 * Prompt user for input
 */
function prompt(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

/**
 * Prompt for yes/no
 */
async function promptYesNo(rl: readline.Interface, question: string, defaultValue: boolean = false): Promise<boolean> {
  const defaultStr = defaultValue ? 'Y/n' : 'y/N';
  const answer = await prompt(rl, `${question} (${defaultStr}): `);
  
  if (!answer) return defaultValue;
  return answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes';
}

/**
 * Prompt for choice from options
 */
async function promptChoice(rl: readline.Interface, question: string, options: string[], defaultIndex: number = 0): Promise<string> {
  console.log(`\n${question}`);
  options.forEach((opt, i) => {
    console.log(`  ${i + 1}. ${opt}`);
  });
  
  const answer = await prompt(rl, `Enter choice (1-${options.length}) [${defaultIndex + 1}]: `);
  
  if (!answer) return options[defaultIndex];
  
  const index = parseInt(answer) - 1;
  if (index >= 0 && index < options.length) {
    return options[index];
  }
  
  console.log('Invalid choice, using default.');
  return options[defaultIndex];
}

/**
 * Prompt for multiple properties
 */
async function promptProperties(rl: readline.Interface, propertyType: 'input' | 'output'): Promise<Array<{ name: string; type: string; required: boolean; description?: string }>> {
  const properties: Array<{ name: string; type: string; required: boolean; description?: string }> = [];
  
  console.log(`\n=== Define ${propertyType} properties ===`);
  console.log('Available types: string, number, boolean, array, object');
  
  while (true) {
    const name = await prompt(rl, `\n${propertyType} property name (or press Enter to finish): `);
    if (!name) break;
    
    const type = await promptChoice(rl, 'Property type:', ['string', 'number', 'boolean', 'array', 'object'], 0);
    const required = await promptYesNo(rl, 'Is this property required?', propertyType === 'input');
    const description = await prompt(rl, 'Property description (optional): ');
    
    properties.push({
      name,
      type,
      required,
      ...(description && { description }),
    });
    
    console.log(`✓ Added property: ${name} (${type}${required ? ', required' : ''})`);
  }
  
  return properties;
}

/**
 * Convert name to kebab-case for file names
 */
function toKebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase();
}

/**
 * Convert name to PascalCase for class names
 */
function toPascalCase(str: string): string {
  return str
    .split(/[\s-_]+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');
}

/**
 * Generate adapter file content
 */
function generateAdapterCode(config: ToolConfig): string {
  const className = toPascalCase(config.name) + 'Tool';
  const idempotencyImport = config.sideEffect ? ', IdempotencyStrategy' : '';
  const compensationImport = config.hasCompensation ? ', CompensationCapability' : '';
  
  // Generate input schema properties
  const inputProps = config.inputProperties.map(prop => {
    let propDef = `      ${prop.name}: { type: '${prop.type}'`;
    if (prop.description) {
      propDef += `, description: '${prop.description}'`;
    }
    propDef += ' }';
    return propDef;
  }).join(',\n');
  
  const inputRequired = config.inputProperties
    .filter(p => p.required)
    .map(p => `'${p.name}'`)
    .join(', ');
  
  // Generate output schema properties
  const outputProps = config.outputProperties.map(prop => {
    let propDef = `      ${prop.name}: { type: '${prop.type}'`;
    if (prop.description) {
      propDef += `, description: '${prop.description}'`;
    }
    propDef += ' }';
    return propDef;
  }).join(',\n');
  
  const outputRequired = config.outputProperties
    .filter(p => p.required)
    .map(p => `'${p.name}'`)
    .join(', ');
  
  // Generate parameters array
  const parameters = config.inputProperties.map(prop => {
    let paramDef = `    { name: '${prop.name}', type: '${prop.type}', required: ${prop.required}`;
    if (prop.description) {
      paramDef += `, description: '${prop.description}'`;
    }
    paramDef += ' }';
    return paramDef;
  }).join(',\n');
  
  // Generate compensation code
  const compensationCode = config.hasCompensation ? `
      compensation: {
        supported: true,
        mode: 'automatic',
        action: {
          description: '${config.compensationDescription || 'Undo the operation'}',
          execute: async (originalParams, result) => {
            // TODO: Implement compensation logic
            console.log('Compensating ${config.name}...', originalParams);
          },
          maxRetries: 3,
          timeoutMs: 5000,
        },
      },` : `
      compensation: {
        supported: false,
      },`;
  
  return `import { ToolSpec${idempotencyImport}${compensationImport} } from '../index';

/**
 * ${config.name} adapter
 * ${config.description}
 */
export class ${className} {
  /**
   * Create ${config.name} tool
   */
  static createTool(): ToolSpec {
    return {
      id: '${config.id}',
      name: '${config.name}',
      description: '${config.description}',
      parameters: [
${parameters}
      ],
      inputSchema: {
        type: 'object',
        properties: {
${inputProps}
        },
        required: [${inputRequired}],
        additionalProperties: false,
      },
      outputSchema: {
        type: 'object',
        properties: {
${outputProps}
        },
        required: [${outputRequired}],
      },
      sideEffect: ${config.sideEffect},
      idempotencyStrategy: ${config.sideEffect ? `IdempotencyStrategy.${config.idempotencyStrategy}` : 'undefined'},
      execute: async (params) => {
        // TODO: Implement tool execution logic
        ${config.inputProperties.map(p => `const ${p.name} = params.${p.name} as ${p.type === 'number' ? 'number' : p.type === 'boolean' ? 'boolean' : 'string'};`).join('\n        ')}
        
        // Your implementation here
        
        return {
          ${config.outputProperties.map(p => `${p.name}: undefined as any, // TODO: Implement`).join('\n          ')}
        };
      },${compensationCode}
    };
  }
}
`;
}

/**
 * Generate test file content
 */
function generateTestCode(config: ToolConfig): string {
  const className = toPascalCase(config.name) + 'Tool';
  const fileName = toKebabCase(config.name) + '-tool';
  
  return `import { describe, it, expect } from 'vitest';
import { ${className} } from '../src/adapters/${fileName}';
import { SafeToolWrapper } from '../src/index';

describe('${className}', () => {
  describe('createTool', () => {
    it('should create tool with correct specification', () => {
      const tool = ${className}.createTool();
      
      expect(tool.id).toBe('${config.id}');
      expect(tool.name).toBe('${config.name}');
      expect(tool.description).toBe('${config.description}');
      expect(tool.sideEffect).toBe(${config.sideEffect});
    });

    it('should validate input schema', async () => {
      const tool = ${className}.createTool();
      const wrapper = new SafeToolWrapper(tool);
      
      // Test with invalid input (missing required fields)
      const result = await wrapper.execute({});
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('validation failed');
    });

    it('should execute successfully with valid input', async () => {
      const tool = ${className}.createTool();
      const wrapper = new SafeToolWrapper(tool);
      
      // TODO: Provide valid test input
      const result = await wrapper.execute({
        ${config.inputProperties.map(p => `${p.name}: ${p.type === 'string' ? "'test-value'" : p.type === 'number' ? '123' : p.type === 'boolean' ? 'true' : '[]'}`).join(',\n        ')}
      });
      
      // TODO: Implement actual test logic
      // expect(result.success).toBe(true);
    });${config.hasCompensation ? `

    it('should support compensation', () => {
      const tool = ${className}.createTool();
      
      expect(tool.compensation?.supported).toBe(true);
      expect(tool.compensation?.action).toBeDefined();
    });` : ''}
  });
});
`;
}

/**
 * Generate example usage code
 */
function generateExampleCode(config: ToolConfig): string {
  const className = toPascalCase(config.name) + 'Tool';
  const fileName = toKebabCase(config.name) + '-tool';
  
  return `/**
 * Example usage of ${className}
 */

import { ${className} } from './adapters/${fileName}';
import { SafeToolWrapper, IntegratedToolWrapper } from '@aureus/tools';
import { createToolAction, createToolCRVGate } from '@aureus/sdk';
import { Validators } from '@aureus/crv';
import { RiskTier, Intent } from '@aureus/policy';

// Create the tool
const tool = ${className}.createTool();

// Simple usage with SafeToolWrapper
const safeWrapper = new SafeToolWrapper(tool);
const result = await safeWrapper.execute({
  ${config.inputProperties.map(p => `${p.name}: ${p.type === 'string' ? "'value'" : p.type === 'number' ? '123' : p.type === 'boolean' ? 'true' : '[]'}`).join(',\n  ')}
});

// Advanced usage with policy and CRV
const action = createToolAction({
  toolId: tool.id,
  toolName: tool.name,
  riskTier: RiskTier.${config.riskTier},
  intent: Intent.${config.intent},
});

const crvGate = createToolCRVGate({
  toolName: tool.name,
  validators: [
    Validators.notNull(),
    // Add more validators as needed
  ],
  blockOnFailure: true,
});

const integratedWrapper = new IntegratedToolWrapper(tool);
// Execute with full safety (policy + CRV + idempotency)
// See packages/tools/README.md for full context setup
`;
}

/**
 * Main wizard function
 */
export async function runToolAdapterWizard(): Promise<void> {
  const rl = createInterface();
  
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║         Tool Adapter Wizard - Aureus Agentic OS           ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');
  console.log('This wizard will help you create a new tool adapter.\n');
  
  try {
    // Collect tool information
    const name = await prompt(rl, 'Tool name (e.g., "Database Query"): ');
    if (!name) {
      console.log('Error: Tool name is required');
      rl.close();
      return;
    }
    
    const id = toKebabCase(name);
    console.log(`Tool ID: ${id}`);
    
    const description = await prompt(rl, 'Tool description: ');
    if (!description) {
      console.log('Error: Tool description is required');
      rl.close();
      return;
    }
    
    // Input properties
    const inputProperties = await promptProperties(rl, 'input');
    
    if (inputProperties.length === 0) {
      console.log('Warning: No input properties defined');
    }
    
    // Output properties
    const outputProperties = await promptProperties(rl, 'output');
    
    if (outputProperties.length === 0) {
      console.log('Warning: No output properties defined');
    }
    
    // Side effects
    const sideEffect = await promptYesNo(rl, 'Does this tool have side effects (write, delete, execute)?', false);
    
    // Idempotency strategy (only if has side effects)
    let idempotencyStrategy = 'CACHE_REPLAY';
    if (sideEffect) {
      idempotencyStrategy = await promptChoice(
        rl,
        'Idempotency strategy:',
        ['CACHE_REPLAY', 'NATURAL', 'REQUEST_ID', 'NONE'],
        0
      );
    }
    
    // Risk tier
    const riskTier = await promptChoice(
      rl,
      'Policy risk tier:',
      ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
      sideEffect ? 1 : 0
    );
    
    // Intent
    const intent = await promptChoice(
      rl,
      'Intent:',
      ['READ', 'WRITE', 'DELETE', 'EXECUTE', 'ADMIN'],
      sideEffect ? 1 : 0
    );
    
    // Compensation
    const hasCompensation = sideEffect ? 
      await promptYesNo(rl, 'Does this tool support compensation/rollback?', false) : 
      false;
    
    let compensationDescription: string | undefined;
    if (hasCompensation) {
      compensationDescription = await prompt(rl, 'Compensation description: ');
    }
    
    const config: ToolConfig = {
      name,
      id,
      description,
      inputProperties,
      outputProperties,
      sideEffect,
      idempotencyStrategy,
      riskTier,
      intent,
      hasCompensation,
      compensationDescription,
    };
    
    // Generate files
    console.log('\n=== Generating files ===\n');
    
    const rootDir = path.resolve(__dirname, '../../..');
    const adapterFile = path.join(rootDir, 'packages/tools/src/adapters', `${id}.ts`);
    const testFile = path.join(rootDir, 'packages/tools/tests', `${id}.test.ts`);
    const exampleFile = path.join(rootDir, 'packages/tools/examples', `${id}-example.ts`);
    
    // Create examples directory if it doesn't exist
    const examplesDir = path.join(rootDir, 'packages/tools/examples');
    if (!fs.existsSync(examplesDir)) {
      fs.mkdirSync(examplesDir, { recursive: true });
    }
    
    // Write adapter file
    fs.writeFileSync(adapterFile, generateAdapterCode(config));
    console.log(`✓ Created adapter: ${adapterFile}`);
    
    // Write test file
    fs.writeFileSync(testFile, generateTestCode(config));
    console.log(`✓ Created test: ${testFile}`);
    
    // Write example file
    fs.writeFileSync(exampleFile, generateExampleCode(config));
    console.log(`✓ Created example: ${exampleFile}`);
    
    // Update adapters index
    const adaptersIndexPath = path.join(rootDir, 'packages/tools/src/adapters/index.ts');
    let adaptersIndex = fs.readFileSync(adaptersIndexPath, 'utf-8');
    const exportLine = `export * from './${id}';`;
    if (!adaptersIndex.includes(exportLine)) {
      adaptersIndex += `${exportLine}\n`;
      fs.writeFileSync(adaptersIndexPath, adaptersIndex);
      console.log(`✓ Updated adapters index`);
    }
    
    // Success message
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║                     Success!                               ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');
    console.log('Next steps:');
    console.log('1. Implement the execute function in the adapter');
    console.log('2. Implement compensation logic (if applicable)');
    console.log('3. Update the test file with proper test cases');
    console.log('4. Build the tools package: npm run build --workspace=@aureus/tools');
    console.log('5. Run tests: npm run test --workspace=@aureus/tools\n');
    console.log(`Files created:`);
    console.log(`  - ${adapterFile}`);
    console.log(`  - ${testFile}`);
    console.log(`  - ${exampleFile}\n`);
    
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error));
  } finally {
    rl.close();
  }
}

// Export for use in CLI
export { runToolAdapterWizard };
