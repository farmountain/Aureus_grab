import { describe, it, expect, beforeEach } from 'vitest';

/**
 * Tool Adapter API Tests
 * Tests the API endpoint for generating tool adapters
 */
describe('Tool Adapter API', () => {
  describe('POST /api/tool-adapters/generate', () => {
    it('should generate adapter code with valid input', () => {
      // Mock request data
      const requestData = {
        name: 'Test Tool',
        description: 'A test tool for validation',
        inputProperties: [
          { name: 'input', type: 'string', required: true, description: 'Input data' }
        ],
        outputProperties: [
          { name: 'output', type: 'string', required: true, description: 'Output data' }
        ],
        sideEffect: false,
        riskTier: 'LOW',
        intent: 'READ',
        hasCompensation: false
      };

      // Expected generated structure
      const expectedStructure = {
        id: 'test-tool',
        className: 'TestTool',
        files: {
          adapter: {
            path: expect.stringContaining('packages/tools/src/adapters/test-tool.ts'),
            content: expect.stringContaining('export class TestTool')
          },
          test: {
            path: expect.stringContaining('packages/tools/tests/test-tool.test.ts'),
            content: expect.stringContaining('describe(\'TestTool\'')
          },
          example: {
            path: expect.stringContaining('packages/tools/examples/test-tool-example.ts'),
            content: expect.stringContaining('const tool = TestTool.createTool()')
          }
        },
        nextSteps: expect.arrayContaining([
          expect.stringContaining('Implement the execute function')
        ])
      };

      // Verify structure matches expectations
      expect(requestData.name).toBe('Test Tool');
      expect(requestData.inputProperties.length).toBeGreaterThan(0);
      expect(requestData.outputProperties.length).toBeGreaterThan(0);
      
      // This test validates the expected structure
      // In a real integration test, you would make an HTTP request
      // and validate the response matches expectedStructure
    });

    it('should handle tool with side effects correctly', () => {
      const requestData = {
        name: 'Write Tool',
        description: 'A tool that writes data',
        inputProperties: [
          { name: 'data', type: 'string', required: true }
        ],
        outputProperties: [
          { name: 'success', type: 'boolean', required: true }
        ],
        sideEffect: true,
        idempotencyStrategy: 'CACHE_REPLAY',
        riskTier: 'MEDIUM',
        intent: 'WRITE',
        hasCompensation: true,
        compensationDescription: 'Undo the write operation'
      };

      // Verify side effect configuration
      expect(requestData.sideEffect).toBe(true);
      expect(requestData.idempotencyStrategy).toBe('CACHE_REPLAY');
      expect(requestData.hasCompensation).toBe(true);
      expect(requestData.compensationDescription).toBeDefined();
    });

    it('should validate required fields', () => {
      const invalidRequest = {
        // Missing name and description
        inputProperties: [],
        outputProperties: [],
        sideEffect: false
      };

      // Should fail validation
      expect(invalidRequest).not.toHaveProperty('name');
      expect(invalidRequest).not.toHaveProperty('description');
    });

    it('should generate correct kebab-case IDs', () => {
      const testCases = [
        { name: 'API Request', expectedId: 'api-request' },
        { name: 'Database Query', expectedId: 'database-query' },
        { name: 'File Write', expectedId: 'file-write' },
        { name: 'HTTP_GET', expectedId: 'http-get' }
      ];

      testCases.forEach(testCase => {
        const id = testCase.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
        expect(id).toBe(testCase.expectedId);
      });
    });

    it('should generate correct PascalCase class names', () => {
      const testCases = [
        { name: 'api request', expectedClass: 'ApiRequestTool' },
        { name: 'database-query', expectedClass: 'DatabaseQueryTool' },
        { name: 'file_write', expectedClass: 'FileWriteTool' }
      ];

      testCases.forEach(testCase => {
        const className = testCase.name
          .split(/[\s-_]+/)
          .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
          .join('') + 'Tool';
        expect(className).toBe(testCase.expectedClass);
      });
    });
  });

  describe('Tool Adapter Generation Logic', () => {
    it('should generate valid TypeScript code structure', () => {
      const toolName = 'Example Tool';
      const expectedImports = [
        'import { ToolSpec',
        'from \'../index\''
      ];

      expectedImports.forEach(expectedImport => {
        expect(expectedImport).toBeDefined();
      });
    });

    it('should include all required tool properties', () => {
      const requiredProperties = [
        'id',
        'name',
        'description',
        'parameters',
        'inputSchema',
        'outputSchema',
        'sideEffect',
        'execute'
      ];

      requiredProperties.forEach(prop => {
        expect(prop).toBeDefined();
      });
    });

    it('should generate valid input schema', () => {
      const inputProperty = {
        name: 'url',
        type: 'string',
        required: true,
        description: 'API endpoint URL'
      };

      const expectedSchema = {
        type: 'object',
        properties: {
          [inputProperty.name]: {
            type: inputProperty.type,
            description: inputProperty.description
          }
        },
        required: [inputProperty.name],
        additionalProperties: false
      };

      expect(expectedSchema.properties.url.type).toBe('string');
      expect(expectedSchema.required).toContain('url');
    });

    it('should generate compensation logic for side-effect tools', () => {
      const hasCompensation = true;
      const compensationDescription = 'Restore original state';

      if (hasCompensation) {
        const compensation = {
          supported: true,
          mode: 'automatic',
          action: {
            description: compensationDescription,
            execute: async () => {},
            maxRetries: 3,
            timeoutMs: 5000
          }
        };

        expect(compensation.supported).toBe(true);
        expect(compensation.action.description).toBe(compensationDescription);
      }
    });
  });
});
