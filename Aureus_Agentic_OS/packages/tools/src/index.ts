import { generateIdempotencyKey } from './idempotency';
import { ToolResultCache } from './tool-result-cache';
import { TelemetryCollector } from '@aureus/observability';
import { 
  ToolSchema, 
  IdempotencyStrategy, 
  CompensationCapability 
} from './types';
import { SchemaValidator } from './schema-validator';

/**
 * Tool specification following plugin contract
 */
export interface ToolSpec {
  id: string;
  name: string;
  description: string;
  parameters: ToolParameter[];
  execute: (params: Record<string, unknown>) => Promise<unknown>;
  
  // Schema validation
  inputSchema?: ToolSchema;
  outputSchema?: ToolSchema;
  
  // Side effects and idempotency
  hasSideEffects?: boolean; // Flag to indicate if tool has side effects (legacy)
  sideEffect?: boolean; // Preferred flag name
  idempotencyStrategy?: IdempotencyStrategy;
  
  // Compensation capability for saga pattern
  compensation?: CompensationCapability;
}

export interface ToolParameter {
  name: string;
  type: string;
  required: boolean;
  description?: string;
}

/**
 * Tool execution result
 */
export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Tool execution context for idempotency
 */
export interface ToolExecutionContext {
  taskId: string;
  stepId: string;
  workflowId: string; // Required for telemetry
  cache?: ToolResultCache;
  telemetry?: TelemetryCollector;
  outbox?: OutboxServiceAdapter; // Outbox service for durable side effects (preferred over cache)
}

/**
 * Adapter interface for outbox service
 * This allows tools package to use outbox without depending on kernel
 */
export interface OutboxServiceAdapter {
  /**
   * Execute a side effect through the outbox pattern
   */
  execute(
    workflowId: string,
    taskId: string,
    toolId: string,
    params: Record<string, unknown>,
    idempotencyKey: string,
    executor: (params: Record<string, unknown>) => Promise<unknown>,
    maxAttempts?: number
  ): Promise<unknown>;
  
  /**
   * Check if an entry already exists (replay protection)
   */
  exists(idempotencyKey: string): Promise<{ 
    exists: boolean;
    result?: unknown;
    state?: string;
  }>;
}

/**
 * Safety wrapper for tool execution with idempotency support
 */
export class SafeToolWrapper {
  private tool: ToolSpec;
  private timeoutMs: number;

  constructor(tool: ToolSpec, timeoutMs: number = 30000) {
    this.tool = tool;
    this.timeoutMs = timeoutMs;
  }

  /**
   * Execute tool with safety checks, timeout, and idempotency
   */
  async execute(
    params: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    // Record telemetry: tool_call (sanitize sensitive parameters)
    if (context?.telemetry) {
      const sanitizedParams = this.sanitizeParams(params);
      context.telemetry.recordToolCall(
        context.workflowId,
        context.taskId,
        this.tool.name,
        sanitizedParams
      );
    }

    // Validate input schema if provided
    if (this.tool.inputSchema) {
      const validation = SchemaValidator.validate(params, this.tool.inputSchema);
      if (!validation.valid) {
        return {
          success: false,
          error: `Input validation failed: ${validation.errors?.map(e => e.message).join(', ')}`,
          metadata: { validationErrors: validation.errors },
        };
      }
    }

    // Validate required parameters (legacy support)
    for (const param of this.tool.parameters) {
      if (param.required && !(param.name in params)) {
        return {
          success: false,
          error: `Missing required parameter: ${param.name}`,
        };
      }
    }

    // Determine if tool has side effects
    const hasSideEffects = this.tool.sideEffect ?? this.tool.hasSideEffects ?? true;

    // Use outbox for side effects if available (preferred over cache)
    if (context && context.outbox && hasSideEffects) {
      const idempotencyKey = generateIdempotencyKey(
        context.taskId,
        context.stepId,
        this.tool.id,
        params
      );

      try {
        // Execute through outbox pattern
        const result = await context.outbox.execute(
          context.workflowId,
          context.taskId,
          this.tool.id,
          params,
          idempotencyKey,
          async (p) => {
            // Execute with timeout
            const execResult = await Promise.race([
              this.tool.execute(p),
              this.timeout(this.timeoutMs),
            ]);

            // Validate output schema if provided
            if (this.tool.outputSchema) {
              const validation = SchemaValidator.validate(execResult, this.tool.outputSchema);
              if (!validation.valid) {
                throw new Error(`Output validation failed: ${validation.errors?.map(e => e.message).join(', ')}`);
              }
            }

            return execResult;
          },
          3 // Default max attempts
        );

        return {
          success: true,
          data: result,
          metadata: { 
            idempotencyKey,
            outboxManaged: true,
          },
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          metadata: { idempotencyKey, outboxManaged: true },
        };
      }
    }

    // Fallback to cache-based idempotency if outbox not available
    if (context && context.cache && hasSideEffects) {
      const idempotencyKey = generateIdempotencyKey(
        context.taskId,
        context.stepId,
        this.tool.id,
        params
      );

      // Try to get cached result
      const cachedResult = await context.cache.get(idempotencyKey);
      if (cachedResult) {
        // Return cached result with metadata indicating it was replayed
        return {
          ...cachedResult,
          metadata: {
            ...cachedResult.metadata,
            replayed: true,
            idempotencyKey,
          },
        };
      }

      // Execute tool and cache result
      try {
        // Execute with timeout
        const result = await Promise.race([
          this.tool.execute(params),
          this.timeout(this.timeoutMs),
        ]);

        // Validate output schema if provided
        if (this.tool.outputSchema) {
          const validation = SchemaValidator.validate(result, this.tool.outputSchema);
          if (!validation.valid) {
            const toolResult: ToolResult = {
              success: false,
              error: `Output validation failed: ${validation.errors?.map(e => e.message).join(', ')}`,
              metadata: { 
                idempotencyKey,
                validationErrors: validation.errors 
              },
            };
            // Don't cache validation failures
            return toolResult;
          }
        }

        const toolResult: ToolResult = {
          success: true,
          data: result,
          metadata: { idempotencyKey },
        };

        // Cache successful result
        await context.cache.set(idempotencyKey, toolResult);
        return toolResult;
      } catch (error) {
        const toolResult: ToolResult = {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          metadata: { idempotencyKey },
        };
        // Don't cache failures - allow retry
        return toolResult;
      }
    }

    // Execute without caching
    try {
      // Execute with timeout
      const result = await Promise.race([
        this.tool.execute(params),
        this.timeout(this.timeoutMs),
      ]);

      // Validate output schema if provided
      if (this.tool.outputSchema) {
        const validation = SchemaValidator.validate(result, this.tool.outputSchema);
        if (!validation.valid) {
          return {
            success: false,
            error: `Output validation failed: ${validation.errors?.map(e => e.message).join(', ')}`,
            metadata: { validationErrors: validation.errors },
          };
        }
      }

      return {
        success: true,
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private timeout(ms: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Tool execution timeout after ${ms}ms`)), ms);
    });
  }

  /**
   * Sanitize parameters to remove sensitive data before logging
   * Redacts common sensitive parameter names
   */
  private sanitizeParams(params: Record<string, unknown>): Record<string, unknown> {
    const sensitiveKeys = [
      'password',
      'passwd',
      'pwd',
      'secret',
      'token',
      'api_key',
      'apikey',
      'apiKey',
      'access_token',
      'accessToken',
      'private_key',
      'privateKey',
      'credentials',
      'auth',
      'authorization',
    ];

    const sanitized: Record<string, unknown> = {};
    
    for (const [key, value] of Object.entries(params)) {
      const keyLower = key.toLowerCase();
      const isSensitive = sensitiveKeys.some(sensitive => keyLower.includes(sensitive));
      
      if (isSensitive) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        // Recursively sanitize nested objects
        sanitized[key] = this.sanitizeParams(value as Record<string, unknown>);
      } else {
        sanitized[key] = value;
      }
    }
    
    return sanitized;
  }

  getToolId(): string {
    return this.tool.id;
  }
}

/**
 * Tool registry for managing available tools
 */
export class ToolRegistry {
  private tools = new Map<string, ToolSpec>();

  register(tool: ToolSpec): void {
    this.tools.set(tool.id, tool);
  }

  get(toolId: string): ToolSpec | undefined {
    return this.tools.get(toolId);
  }

  list(): ToolSpec[] {
    return Array.from(this.tools.values());
  }

  /**
   * Create safe wrapper for a tool
   */
  createSafeWrapper(toolId: string, timeoutMs?: number): SafeToolWrapper | null {
    const tool = this.tools.get(toolId);
    if (!tool) return null;
    return new SafeToolWrapper(tool, timeoutMs);
  }
}

// Export additional modules
export * from './idempotency';
export * from './tool-result-cache';
export * from './types';
export * from './schema-validator';
export * from './adapters';
export * from './integrated-wrapper';
export * from './sandbox';
export * from './capability-matrix';
