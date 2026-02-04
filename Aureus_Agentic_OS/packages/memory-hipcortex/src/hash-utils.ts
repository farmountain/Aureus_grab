import * as crypto from 'crypto';
import { AuditLogEntry } from './types';

/**
 * Compute SHA-256 hash of audit log entry content for integrity verification
 * Used by both HipCortex and persistence implementations to ensure consistency
 */
export function computeAuditLogHash(entry: AuditLogEntry): string {
  const { contentHash, ...entryWithoutHash } = entry;
  const content = JSON.stringify(entryWithoutHash, sortKeys);
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Sort object keys for consistent hashing
 * Ensures that objects with the same content produce the same hash
 */
function sortKeys(key: string, value: unknown): unknown {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const sorted: Record<string, unknown> = {};
    Object.keys(value as Record<string, unknown>)
      .sort()
      .forEach(k => {
        sorted[k] = (value as Record<string, unknown>)[k];
      });
    return sorted;
  }
  return value;
}
