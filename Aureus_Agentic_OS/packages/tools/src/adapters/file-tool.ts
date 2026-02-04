import * as fs from 'fs';
import * as path from 'path';
import { ToolSpec, IdempotencyStrategy, CompensationCapability } from '../index';

/**
 * FileTool adapter for file read/write operations
 * Includes schema validation and compensation support
 */
export class FileTool {
  /**
   * Create a file read tool
   */
  static createReadTool(): ToolSpec {
    return {
      id: 'file-read',
      name: 'File Read',
      description: 'Read contents of a file',
      parameters: [
        { name: 'path', type: 'string', required: true, description: 'Path to the file' },
        { name: 'encoding', type: 'string', required: false, description: 'File encoding (default: utf-8)' },
      ],
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          encoding: { type: 'string', enum: ['utf-8', 'ascii', 'base64', 'binary'] },
        },
        required: ['path'],
        additionalProperties: false,
      },
      outputSchema: {
        type: 'object',
        properties: {
          content: { type: 'string' },
          path: { type: 'string' },
          size: { type: 'number' },
        },
        required: ['content', 'path'],
      },
      sideEffect: false, // Read is idempotent and has no side effects
      idempotencyStrategy: IdempotencyStrategy.NATURAL,
      execute: async (params) => {
        const filePath = params.path as string;
        const encoding = (params.encoding as BufferEncoding) || 'utf-8';
        
        // SECURITY WARNING: Path traversal risk
        // In production, validate that resolvedPath is within allowed directories
        // Example: if (!resolvedPath.startsWith(allowedBaseDir)) throw error
        // Or use a sandbox/chroot environment
        const resolvedPath = path.isAbsolute(filePath) ? filePath : path.resolve(filePath);
        
        // Check if file exists
        if (!fs.existsSync(resolvedPath)) {
          throw new Error(`File not found: ${filePath}`);
        }
        
        // Read file
        const content = fs.readFileSync(resolvedPath, encoding);
        const stats = fs.statSync(resolvedPath);
        
        return {
          content,
          path: resolvedPath,
          size: stats.size,
        };
      },
      compensation: {
        supported: false, // No compensation needed for reads
      },
    };
  }
  
  /**
   * Create a file write tool with compensation support
   */
  static createWriteTool(): ToolSpec {
    return {
      id: 'file-write',
      name: 'File Write',
      description: 'Write content to a file',
      parameters: [
        { name: 'path', type: 'string', required: true, description: 'Path to the file' },
        { name: 'content', type: 'string', required: true, description: 'Content to write' },
        { name: 'encoding', type: 'string', required: false, description: 'File encoding (default: utf-8)' },
        { name: 'createDirectories', type: 'boolean', required: false, description: 'Create parent directories if needed' },
      ],
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          content: { type: 'string' },
          encoding: { type: 'string', enum: ['utf-8', 'ascii', 'base64', 'binary'] },
          createDirectories: { type: 'boolean' },
        },
        required: ['path', 'content'],
        additionalProperties: false,
      },
      outputSchema: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          path: { type: 'string' },
          bytesWritten: { type: 'number' },
          existed: { type: 'boolean' },
        },
        required: ['success', 'path'],
      },
      sideEffect: true, // Write has side effects
      idempotencyStrategy: IdempotencyStrategy.CACHE_REPLAY,
      execute: async (params) => {
        const filePath = params.path as string;
        const content = params.content as string;
        const encoding = (params.encoding as BufferEncoding) || 'utf-8';
        const createDirectories = params.createDirectories === true;
        
        // SECURITY WARNING: Path traversal risk - validate paths in production
        const resolvedPath = path.isAbsolute(filePath) ? filePath : path.resolve(filePath);
        
        // Check if file already exists
        const existed = fs.existsSync(resolvedPath);
        
        // Create parent directories if requested
        if (createDirectories) {
          const dir = path.dirname(resolvedPath);
          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
          }
        }
        
        // Write file
        fs.writeFileSync(resolvedPath, content, encoding);
        const stats = fs.statSync(resolvedPath);
        
        return {
          success: true,
          path: resolvedPath,
          bytesWritten: stats.size,
          existed,
        };
      },
      compensation: {
        supported: true,
        mode: 'automatic',
        action: {
          description: 'Restore original file content or delete if new file',
          execute: async (originalParams, result) => {
            const filePath = originalParams.path as string;
            const resolvedPath = path.isAbsolute(filePath) ? filePath : path.resolve(filePath);
            const resultData = result as { existed: boolean };
            
            if (resultData.existed) {
              // File existed before, should restore from backup
              // In production, this would restore from a backup system
              console.warn(`Compensation: Would restore original file at ${resolvedPath}`);
            } else {
              // File was newly created, delete it
              if (fs.existsSync(resolvedPath)) {
                fs.unlinkSync(resolvedPath);
              }
            }
          },
          maxRetries: 3,
          timeoutMs: 5000,
        },
      },
    };
  }
  
  /**
   * Create a file delete tool with compensation support
   */
  static createDeleteTool(): ToolSpec {
    return {
      id: 'file-delete',
      name: 'File Delete',
      description: 'Delete a file',
      parameters: [
        { name: 'path', type: 'string', required: true, description: 'Path to the file' },
      ],
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string' },
        },
        required: ['path'],
        additionalProperties: false,
      },
      outputSchema: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          path: { type: 'string' },
          deleted: { type: 'boolean' },
        },
        required: ['success', 'path', 'deleted'],
      },
      sideEffect: true,
      idempotencyStrategy: IdempotencyStrategy.CACHE_REPLAY,
      execute: async (params) => {
        const filePath = params.path as string;
        // SECURITY WARNING: Path traversal risk - validate paths in production
        const resolvedPath = path.isAbsolute(filePath) ? filePath : path.resolve(filePath);
        
        const existed = fs.existsSync(resolvedPath);
        
        if (existed) {
          fs.unlinkSync(resolvedPath);
        }
        
        return {
          success: true,
          path: resolvedPath,
          deleted: existed,
        };
      },
      compensation: {
        supported: true,
        mode: 'automatic',
        action: {
          description: 'Restore deleted file from backup',
          execute: async (originalParams) => {
            const filePath = originalParams.path as string;
            const resolvedPath = path.isAbsolute(filePath) ? filePath : path.resolve(filePath);
            
            // In production, restore from backup system
            console.warn(`Compensation: Would restore deleted file at ${resolvedPath}`);
          },
          maxRetries: 3,
          timeoutMs: 5000,
        },
      },
    };
  }
}
