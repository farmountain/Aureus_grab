import { execFile } from 'child_process';
import { promisify } from 'util';
import { ToolSpec, IdempotencyStrategy } from '../index';

const execFileAsync = promisify(execFile);

/**
 * ShellTool adapter for executing shell commands with allowlist restrictions
 * Provides security through command allowlisting
 */
export class ShellTool {
  /**
   * Default safe commands allowlist
   */
  private static readonly DEFAULT_ALLOWLIST = [
    'echo',
    'ls',
    'pwd',
    'cat',
    'grep',
    'wc',
    'date',
    'whoami',
    'hostname',
    'uptime',
  ];
  
  /**
   * Create a shell execution tool with command allowlist
   */
  static createTool(allowlist?: string[]): ToolSpec {
    const commandAllowlist = allowlist || ShellTool.DEFAULT_ALLOWLIST;
    
    return {
      id: 'shell-exec',
      name: 'Shell Execute',
      description: `Execute shell commands (allowlist: ${commandAllowlist.join(', ')})`,
      parameters: [
        { name: 'command', type: 'string', required: true, description: 'Command to execute' },
        { name: 'args', type: 'array', required: false, description: 'Command arguments' },
        { name: 'timeout', type: 'number', required: false, description: 'Execution timeout in milliseconds' },
        { name: 'cwd', type: 'string', required: false, description: 'Working directory' },
      ],
      inputSchema: {
        type: 'object',
        properties: {
          command: { type: 'string' },
          args: { 
            type: 'array',
            items: { type: 'string' },
          },
          timeout: { 
            type: 'number',
            minimum: 0,
            maximum: 300000, // 5 minutes max
          },
          cwd: { type: 'string' },
        },
        required: ['command'],
        additionalProperties: false,
      },
      outputSchema: {
        type: 'object',
        properties: {
          stdout: { type: 'string' },
          stderr: { type: 'string' },
          exitCode: { type: 'number' },
          command: { type: 'string' },
        },
        required: ['stdout', 'stderr', 'exitCode', 'command'],
      },
      sideEffect: true, // Shell commands may have side effects
      idempotencyStrategy: IdempotencyStrategy.CACHE_REPLAY,
      execute: async (params) => {
        const command = params.command as string;
        const args = (params.args as string[]) || [];
        const timeout = (params.timeout as number) || 30000;
        const cwd = params.cwd as string | undefined;
        
        // Validate command is in allowlist
        if (!commandAllowlist.includes(command)) {
          throw new Error(
            `Command '${command}' not allowed. Allowlist: ${commandAllowlist.join(', ')}`
          );
        }
        
        // Use execFile to avoid shell parsing/quoting issues and to pass args safely
        const fullCommand = [command, ...args].join(' ');

        try {
          const { stdout, stderr } = await execFileAsync(command, args, {
            timeout,
            cwd,
            maxBuffer: 1024 * 1024 * 10, // 10MB buffer
          }) as { stdout: string; stderr: string };

          return {
            stdout,
            stderr,
            exitCode: 0,
            command: fullCommand,
          };
        } catch (error: any) {
          // Handle execution errors
          if (error.killed) {
            throw new Error(`Command timeout after ${timeout}ms`);
          }

          return {
            stdout: error.stdout || '',
            stderr: error.stderr || error.message,
            exitCode: error.code || 1,
            command: fullCommand,
          };
        }
      },
      compensation: {
        supported: false, // Compensation is command-specific
        mode: 'manual',
      },
    };
  }
  
  /**
   * Create a read-only shell tool (only read commands)
   */
  static createReadOnlyTool(): ToolSpec {
    const readOnlyAllowlist = [
      'ls',
      'cat',
      'grep',
      'find',
      'wc',
      'head',
      'tail',
      'stat',
      'file',
      'du',
      'df',
      'pwd',
      'whoami',
      'hostname',
      'date',
      'uptime',
    ];
    
    const tool = ShellTool.createTool(readOnlyAllowlist);
    
    return {
      ...tool,
      id: 'shell-exec-readonly',
      name: 'Shell Execute (Read-Only)',
      description: 'Execute read-only shell commands',
      sideEffect: false, // Read-only commands have no side effects
      idempotencyStrategy: IdempotencyStrategy.NATURAL,
    };
  }
  
  /**
   * Create a custom shell tool with specific allowlist
   */
  static createCustomTool(config: {
    id: string;
    name: string;
    description: string;
    allowlist: string[];
    hasSideEffects?: boolean;
  }): ToolSpec {
    const tool = ShellTool.createTool(config.allowlist);
    
    return {
      ...tool,
      id: config.id,
      name: config.name,
      description: config.description,
      sideEffect: config.hasSideEffects ?? true,
      idempotencyStrategy: config.hasSideEffects 
        ? IdempotencyStrategy.CACHE_REPLAY 
        : IdempotencyStrategy.NATURAL,
    };
  }
}
