import * as crypto from 'crypto';

/**
 * Generate an idempotency key from task context and tool invocation
 * Format: hash(task_id + step_id + tool_id + normalized_args)
 */
export function generateIdempotencyKey(
  taskId: string,
  stepId: string,
  toolId: string,
  args: Record<string, unknown>
): string {
  // Normalize args by sorting keys for consistent hashing
  const normalizedArgs = normalizeArgs(args);
  const input = `${taskId}:${stepId}:${toolId}:${JSON.stringify(normalizedArgs)}`;
  
  // Generate SHA-256 hash
  return crypto.createHash('sha256').update(input).digest('hex');
}

/**
 * Normalize arguments for consistent hashing
 * Sorts object keys recursively to ensure same object structure produces same hash
 */
export function normalizeArgs(args: Record<string, unknown>): Record<string, unknown> {
  if (args === null || args === undefined) {
    return {};
  }

  const normalized: Record<string, unknown> = {};
  const sortedKeys = Object.keys(args).sort();

  for (const key of sortedKeys) {
    const value = args[key];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      normalized[key] = normalizeArgs(value as Record<string, unknown>);
    } else {
      normalized[key] = value;
    }
  }

  return normalized;
}
