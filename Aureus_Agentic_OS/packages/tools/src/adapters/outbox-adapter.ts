import { OutboxServiceAdapter } from '../index';

/**
 * Minimal interface for outbox service to avoid circular dependencies
 */
interface OutboxServiceLike {
  execute(
    workflowId: string,
    taskId: string,
    toolId: string,
    params: Record<string, unknown>,
    idempotencyKey: string,
    executor: (params: Record<string, unknown>) => Promise<unknown>,
    maxAttempts: number
  ): Promise<unknown>;
  
  getByIdempotencyKey(idempotencyKey: string): Promise<any>;
}

/**
 * Default outbox adapter implementation
 * This can be used when you have an outbox service from the kernel
 */
export class DefaultOutboxAdapter implements OutboxServiceAdapter {
  private outboxService: OutboxServiceLike;

  constructor(outboxService: OutboxServiceLike) {
    this.outboxService = outboxService;
  }

  async execute(
    workflowId: string,
    taskId: string,
    toolId: string,
    params: Record<string, unknown>,
    idempotencyKey: string,
    executor: (params: Record<string, unknown>) => Promise<unknown>,
    maxAttempts: number = 3
  ): Promise<unknown> {
    return await this.outboxService.execute(
      workflowId,
      taskId,
      toolId,
      params,
      idempotencyKey,
      executor,
      maxAttempts
    );
  }

  async exists(idempotencyKey: string): Promise<{ 
    exists: boolean;
    result?: unknown;
    state?: string;
  }> {
    const entry = await this.outboxService.getByIdempotencyKey(idempotencyKey);
    
    if (!entry) {
      return { exists: false };
    }

    return {
      exists: true,
      result: entry.result,
      state: entry.state,
    };
  }
}

/**
 * Create an outbox adapter from an outbox service
 */
export function createOutboxAdapter(outboxService: OutboxServiceLike): OutboxServiceAdapter {
  return new DefaultOutboxAdapter(outboxService);
}
