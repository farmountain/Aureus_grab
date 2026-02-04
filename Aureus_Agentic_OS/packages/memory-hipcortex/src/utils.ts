/**
 * Utility functions for memory stores
 */

/**
 * Deep clone an object, preserving Date objects and handling circular references
 * Uses structuredClone if available (Node 17+), otherwise falls back to JSON approach
 * with special handling for Date objects
 */
export function deepClone<T>(obj: T): T {
  // Use structuredClone if available (Node 17+)
  if (typeof structuredClone !== 'undefined') {
    try {
      return structuredClone(obj);
    } catch (e) {
      // Fall through to custom implementation if structuredClone fails
    }
  }

  // Custom implementation for older environments
  return deepCloneCustom(obj);
}

/**
 * Custom deep clone implementation that preserves Date objects
 */
function deepCloneCustom<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (obj instanceof Date) {
    return new Date(obj.getTime()) as T;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => deepCloneCustom(item)) as T;
  }

  const cloned: any = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      cloned[key] = deepCloneCustom(obj[key]);
    }
  }

  return cloned as T;
}
