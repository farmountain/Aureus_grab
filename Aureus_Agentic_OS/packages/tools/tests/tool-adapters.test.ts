import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { FileTool, HTTPTool, ShellTool } from '../src/adapters';
import { SafeToolWrapper, InMemoryToolResultCache } from '../src/index';

describe('Tool Adapters', () => {
  // Use os.tmpdir() for cross-platform compatibility
  const testDir = path.join(os.tmpdir(), 'tool-adapters-test');
  let cache: InMemoryToolResultCache;

  beforeEach(() => {
    cache = new InMemoryToolResultCache();
    
    // Clean and create test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    // Clean up test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  describe('FileTool', () => {
    describe('Read Tool', () => {
      it('should read file content successfully', async () => {
        const testFile = path.join(testDir, 'test.txt');
        fs.writeFileSync(testFile, 'Hello World');

        const readTool = FileTool.createReadTool();
        const wrapper = new SafeToolWrapper(readTool);

        const result = await wrapper.execute({ path: testFile });

        expect(result.success).toBe(true);
        expect(result.data).toMatchObject({
          content: 'Hello World',
          path: testFile,
          size: 11,
        });
      });

      it('should fail when file does not exist', async () => {
        const readTool = FileTool.createReadTool();
        const wrapper = new SafeToolWrapper(readTool);

        const result = await wrapper.execute({
          path: path.join(testDir, 'nonexistent.txt'),
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('File not found');
      });

      it('should validate input schema', async () => {
        const readTool = FileTool.createReadTool();
        const wrapper = new SafeToolWrapper(readTool);

        const result = await wrapper.execute({
          path: '/tmp/test.txt',
          encoding: 'invalid-encoding' as any,
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Input validation failed');
      });
    });

    describe('Write Tool', () => {
      it('should write file content successfully', async () => {
        const testFile = path.join(testDir, 'write-test.txt');
        
        const writeTool = FileTool.createWriteTool();
        const wrapper = new SafeToolWrapper(writeTool);

        const result = await wrapper.execute({
          path: testFile,
          content: 'Test content',
        });

        expect(result.success).toBe(true);
        expect(result.data).toMatchObject({
          success: true,
          path: testFile,
          existed: false,
        });

        // Verify file was written
        const content = fs.readFileSync(testFile, 'utf-8');
        expect(content).toBe('Test content');
      });

      it('should create parent directories when requested', async () => {
        const testFile = path.join(testDir, 'subdir', 'nested', 'test.txt');
        
        const writeTool = FileTool.createWriteTool();
        const wrapper = new SafeToolWrapper(writeTool);

        const result = await wrapper.execute({
          path: testFile,
          content: 'Nested content',
          createDirectories: true,
        });

        expect(result.success).toBe(true);
        expect(fs.existsSync(testFile)).toBe(true);
      });

      it('should be idempotent with cache', async () => {
        const testFile = path.join(testDir, 'idempotent-test.txt');
        
        const writeTool = FileTool.createWriteTool();
        const wrapper = new SafeToolWrapper(writeTool);

        const context = {
          taskId: 'task-1',
          stepId: 'step-1',
          workflowId: 'workflow-1',
          cache,
        };

        // First write
        const result1 = await wrapper.execute(
          { path: testFile, content: 'First write' },
          context
        );
        expect(result1.success).toBe(true);
        expect(result1.metadata?.replayed).toBeUndefined();

        // Modify file manually
        fs.writeFileSync(testFile, 'Modified content');

        // Second write with same params - should use cache
        const result2 = await wrapper.execute(
          { path: testFile, content: 'First write' },
          context
        );
        expect(result2.success).toBe(true);
        expect(result2.metadata?.replayed).toBe(true);

        // File should still have modified content (not rewritten)
        const content = fs.readFileSync(testFile, 'utf-8');
        expect(content).toBe('Modified content');
      });

      it('should support compensation', async () => {
        const testFile = path.join(testDir, 'compensation-test.txt');
        
        const writeTool = FileTool.createWriteTool();
        
        // Execute write
        const result = await writeTool.execute({
          path: testFile,
          content: 'Original content',
        }) as { existed: boolean };

        expect(fs.existsSync(testFile)).toBe(true);

        // Execute compensation
        if (writeTool.compensation?.action) {
          await writeTool.compensation.action.execute(
            { path: testFile, content: 'Original content' },
            result
          );
        }

        // File should be deleted (was new file)
        expect(fs.existsSync(testFile)).toBe(false);
      });
    });

    describe('Delete Tool', () => {
      it('should delete file successfully', async () => {
        const testFile = path.join(testDir, 'delete-test.txt');
        fs.writeFileSync(testFile, 'To be deleted');

        const deleteTool = FileTool.createDeleteTool();
        const wrapper = new SafeToolWrapper(deleteTool);

        const result = await wrapper.execute({ path: testFile });

        expect(result.success).toBe(true);
        expect(result.data).toMatchObject({
          success: true,
          path: testFile,
          deleted: true,
        });

        expect(fs.existsSync(testFile)).toBe(false);
      });

      it('should be idempotent when file does not exist', async () => {
        const testFile = path.join(testDir, 'nonexistent.txt');

        const deleteTool = FileTool.createDeleteTool();
        const wrapper = new SafeToolWrapper(deleteTool);

        const result = await wrapper.execute({ path: testFile });

        expect(result.success).toBe(true);
        expect(result.data).toMatchObject({
          success: true,
          deleted: false,
        });
      });
    });
  });

  describe('ShellTool', () => {
    describe('Standard Tool', () => {
      it('should execute allowed command successfully', async () => {
        const shellTool = ShellTool.createTool(['echo']);
        const wrapper = new SafeToolWrapper(shellTool);

        const result = await wrapper.execute({
          command: 'echo',
          args: ['Hello', 'World'],
        });

        expect(result.success).toBe(true);
        expect(result.data).toMatchObject({
          stdout: expect.stringContaining('Hello World'),
          exitCode: 0,
        });
      });

      it('should block disallowed command', async () => {
        const shellTool = ShellTool.createTool(['echo']);
        const wrapper = new SafeToolWrapper(shellTool);

        const result = await wrapper.execute({
          command: 'rm', // Not in allowlist
          args: ['-rf', '/'],
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('not allowed');
      });

      it('should validate input schema', async () => {
        const shellTool = ShellTool.createTool();
        const wrapper = new SafeToolWrapper(shellTool);

        const result = await wrapper.execute({
          command: 'echo',
          timeout: 999999999, // Exceeds maximum
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Input validation failed');
      });

      it('should handle command timeout', async () => {
        const shellTool = ShellTool.createTool(['sleep']);
        const wrapper = new SafeToolWrapper(shellTool, 1000); // 1 second wrapper timeout

        const result = await wrapper.execute({
          command: 'sleep',
          args: ['5'], // Sleep for 5 seconds
          timeout: 500, // But tool timeout is 500ms
        });

        // Should fail due to timeout
        expect(result.success).toBe(false);
        expect(result.error).toContain('timeout');
      });
    });

    describe('Read-Only Tool', () => {
      it('should create read-only tool with safe commands', async () => {
        const readOnlyTool = ShellTool.createReadOnlyTool();
        
        expect(readOnlyTool.sideEffect).toBe(false);
        expect(readOnlyTool.description).toContain('read-only');
      });

      it('should execute read-only commands', async () => {
        const readOnlyTool = ShellTool.createReadOnlyTool();
        const wrapper = new SafeToolWrapper(readOnlyTool);

        const result = await wrapper.execute({
          command: 'ls',
          args: [testDir],
        });

        expect(result.success).toBe(true);
        expect(result.data).toHaveProperty('stdout');
        expect(result.data).toHaveProperty('exitCode', 0);
      });
    });

    describe('Custom Tool', () => {
      it('should create custom tool with specific allowlist', async () => {
        const customTool = ShellTool.createCustomTool({
          id: 'git-tool',
          name: 'Git Tool',
          description: 'Execute git commands',
          allowlist: ['git'],
          hasSideEffects: true,
        });

        expect(customTool.id).toBe('git-tool');
        expect(customTool.sideEffect).toBe(true);
      });
    });
  });

  describe('HTTPTool', () => {
    describe('GET Tool', () => {
      it('should validate URL format', async () => {
        const getTool = HTTPTool.createGetTool();
        const wrapper = new SafeToolWrapper(getTool);

        const result = await wrapper.execute({
          url: 'invalid-url',
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Input validation failed');
      });

      it('should have correct properties', async () => {
        const getTool = HTTPTool.createGetTool();

        expect(getTool.sideEffect).toBe(false);
        expect(getTool.id).toBe('http-get');
        expect(getTool.inputSchema).toBeDefined();
        expect(getTool.outputSchema).toBeDefined();
      });
    });

    describe('POST Tool', () => {
      it('should validate URL format', async () => {
        const postTool = HTTPTool.createPostTool();
        const wrapper = new SafeToolWrapper(postTool);

        const result = await wrapper.execute({
          url: 'not-a-valid-url',
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Input validation failed');
      });

      it('should have correct properties', async () => {
        const postTool = HTTPTool.createPostTool();

        expect(postTool.sideEffect).toBe(true);
        expect(postTool.id).toBe('http-post');
        expect(postTool.inputSchema).toBeDefined();
        expect(postTool.outputSchema).toBeDefined();
      });
    });
  });

  describe('Mock Tools for Testing', () => {
    it('should create simple mock tool', async () => {
      const mockTool = {
        id: 'mock-tool',
        name: 'Mock Tool',
        description: 'A simple mock tool',
        parameters: [
          { name: 'input', type: 'string', required: true },
        ],
        sideEffect: false,
        execute: async (params: Record<string, unknown>) => {
          return { output: `Processed: ${params.input}` };
        },
      };

      const wrapper = new SafeToolWrapper(mockTool);
      const result = await wrapper.execute({ input: 'test' });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ output: 'Processed: test' });
    });

    it('should create mock tool with failure injection', async () => {
      let callCount = 0;
      
      const failingMockTool = {
        id: 'failing-mock',
        name: 'Failing Mock',
        description: 'A mock tool that fails on first call',
        parameters: [],
        sideEffect: true,
        execute: async () => {
          callCount++;
          if (callCount === 1) {
            throw new Error('Injected failure');
          }
          return { success: true, callCount };
        },
      };

      const wrapper = new SafeToolWrapper(failingMockTool);
      const context = {
        taskId: 'task-1',
        stepId: 'step-1',
        workflowId: 'workflow-1',
        cache,
      };

      // First call - should fail
      const result1 = await wrapper.execute({}, context);
      expect(result1.success).toBe(false);
      expect(result1.error).toContain('Injected failure');

      // Second call - should succeed
      const result2 = await wrapper.execute({}, context);
      expect(result2.success).toBe(true);
      expect(result2.data).toMatchObject({ success: true, callCount: 2 });
    });
  });
});
