import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { SafeToolWrapper, ToolSpec, ToolExecutionContext, InMemoryToolResultCache } from '../src/index';

describe('SafeToolWrapper Integration', () => {
  let cache: InMemoryToolResultCache;
  const testDir = '/tmp/tool-wrapper-test';

  beforeEach(async () => {
    cache = new InMemoryToolResultCache();
    
    // Clean up test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
    fs.mkdirSync(testDir, { recursive: true });
  });

  describe('Idempotency with side effects', () => {
    it('should not execute file write tool twice on retry', async () => {
      let executionCount = 0;
      
      // Create a tool that writes to a file
      const writeFileTool: ToolSpec = {
        id: 'write-file',
        name: 'Write File',
        description: 'Writes content to a file',
        parameters: [
          { name: 'path', type: 'string', required: true },
          { name: 'content', type: 'string', required: true },
        ],
        hasSideEffects: true,
        execute: async (params) => {
          executionCount++;
          const filePath = params.path as string;
          const content = params.content as string;
          
          fs.writeFileSync(filePath, content + `\n[Execution ${executionCount}]`);
          
          return { written: true, path: filePath, executionCount };
        },
      };

      const wrapper = new SafeToolWrapper(writeFileTool);
      const testFile = path.join(testDir, 'test.txt');
      const params = { path: testFile, content: 'Hello World' };
      const context: ToolExecutionContext = {
        taskId: 'task-1',
        stepId: 'step-1',
        cache,
      };

      // First execution - should write to file
      const result1 = await wrapper.execute(params, context);
      expect(result1.success).toBe(true);
      expect(result1.metadata?.replayed).toBeUndefined();
      expect(executionCount).toBe(1);

      // Verify file was written
      expect(fs.existsSync(testFile)).toBe(true);
      const fileContent1 = fs.readFileSync(testFile, 'utf-8');
      expect(fileContent1).toContain('Hello World');
      expect(fileContent1).toContain('[Execution 1]');

      // Second execution with same params - should use cache
      const result2 = await wrapper.execute(params, context);
      expect(result2.success).toBe(true);
      expect(result2.metadata?.replayed).toBe(true);
      expect(executionCount).toBe(1); // Should not increment

      // File should not have been written again
      const fileContent2 = fs.readFileSync(testFile, 'utf-8');
      expect(fileContent2).toBe(fileContent1); // Same content
      expect(fileContent2).not.toContain('[Execution 2]'); // No second execution

      console.log('✅ File write tool was not executed twice on retry (idempotency preserved)');
    });

    it('should execute again with different parameters', async () => {
      let executionCount = 0;
      
      const writeFileTool: ToolSpec = {
        id: 'write-file',
        name: 'Write File',
        description: 'Writes content to a file',
        parameters: [
          { name: 'path', type: 'string', required: true },
          { name: 'content', type: 'string', required: true },
        ],
        hasSideEffects: true,
        execute: async (params) => {
          executionCount++;
          return { executionCount };
        },
      };

      const wrapper = new SafeToolWrapper(writeFileTool);
      const context: ToolExecutionContext = {
        taskId: 'task-1',
        stepId: 'step-1',
        cache,
      };

      // First execution
      await wrapper.execute({ path: 'file1.txt', content: 'content1' }, context);
      expect(executionCount).toBe(1);

      // Second execution with different params - should execute again
      await wrapper.execute({ path: 'file2.txt', content: 'content2' }, context);
      expect(executionCount).toBe(2);
    });

    it('should execute again in different step', async () => {
      let executionCount = 0;
      
      const writeFileTool: ToolSpec = {
        id: 'write-file',
        name: 'Write File',
        description: 'Writes content to a file',
        parameters: [
          { name: 'path', type: 'string', required: true },
          { name: 'content', type: 'string', required: true },
        ],
        hasSideEffects: true,
        execute: async (params) => {
          executionCount++;
          return { executionCount };
        },
      };

      const wrapper = new SafeToolWrapper(writeFileTool);
      const params = { path: 'file.txt', content: 'content' };

      // First execution in step 1
      const context1: ToolExecutionContext = {
        taskId: 'task-1',
        stepId: 'step-1',
        cache,
      };
      await wrapper.execute(params, context1);
      expect(executionCount).toBe(1);

      // Second execution in step 2 - should execute again
      const context2: ToolExecutionContext = {
        taskId: 'task-1',
        stepId: 'step-2',
        cache,
      };
      await wrapper.execute(params, context2);
      expect(executionCount).toBe(2);
    });

    it('should not cache failures', async () => {
      let executionCount = 0;
      
      const failingTool: ToolSpec = {
        id: 'failing-tool',
        name: 'Failing Tool',
        description: 'A tool that fails',
        parameters: [],
        hasSideEffects: true,
        execute: async () => {
          executionCount++;
          if (executionCount < 3) {
            throw new Error('Simulated failure');
          }
          return { success: true, executionCount };
        },
      };

      const wrapper = new SafeToolWrapper(failingTool);
      const context: ToolExecutionContext = {
        taskId: 'task-1',
        stepId: 'step-1',
        cache,
      };

      // First execution - fails
      const result1 = await wrapper.execute({}, context);
      expect(result1.success).toBe(false);
      expect(executionCount).toBe(1);

      // Second execution - should retry (not cached)
      const result2 = await wrapper.execute({}, context);
      expect(result2.success).toBe(false);
      expect(executionCount).toBe(2);

      // Third execution - succeeds
      const result3 = await wrapper.execute({}, context);
      expect(result3.success).toBe(true);
      expect(executionCount).toBe(3);

      // Fourth execution - uses cache
      const result4 = await wrapper.execute({}, context);
      expect(result4.success).toBe(true);
      expect(result4.metadata?.replayed).toBe(true);
      expect(executionCount).toBe(3); // No additional execution
    });

    it('should work without cache context', async () => {
      let executionCount = 0;
      
      const tool: ToolSpec = {
        id: 'simple-tool',
        name: 'Simple Tool',
        description: 'A simple tool',
        parameters: [],
        execute: async () => {
          executionCount++;
          return { executionCount };
        },
      };

      const wrapper = new SafeToolWrapper(tool);
      
      // Execute without cache context
      const result1 = await wrapper.execute({});
      expect(result1.success).toBe(true);
      expect(executionCount).toBe(1);

      // Execute again - should execute again (no caching)
      const result2 = await wrapper.execute({});
      expect(result2.success).toBe(true);
      expect(executionCount).toBe(2);
    });

    it('should respect hasSideEffects flag', async () => {
      let executionCount = 0;
      
      const pureTool: ToolSpec = {
        id: 'pure-tool',
        name: 'Pure Tool',
        description: 'A pure tool with no side effects',
        parameters: [],
        hasSideEffects: false,
        execute: async () => {
          executionCount++;
          return { executionCount };
        },
      };

      const wrapper = new SafeToolWrapper(pureTool);
      const context: ToolExecutionContext = {
        taskId: 'task-1',
        stepId: 'step-1',
        cache,
      };

      // First execution
      await wrapper.execute({}, context);
      expect(executionCount).toBe(1);

      // Second execution - should execute again (no caching for pure tools)
      await wrapper.execute({}, context);
      expect(executionCount).toBe(2);
    });
  });
});
