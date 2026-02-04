import { describe, it, expect } from 'vitest';
import { generateIdempotencyKey, normalizeArgs } from '../src/idempotency';

describe('Idempotency', () => {
  describe('normalizeArgs', () => {
    it('should normalize object keys in sorted order', () => {
      const args1 = { b: 2, a: 1, c: 3 };
      const args2 = { c: 3, a: 1, b: 2 };
      
      const normalized1 = normalizeArgs(args1);
      const normalized2 = normalizeArgs(args2);
      
      expect(JSON.stringify(normalized1)).toBe(JSON.stringify(normalized2));
      expect(Object.keys(normalized1)).toEqual(['a', 'b', 'c']);
    });

    it('should normalize nested objects', () => {
      const args1 = { outer: { b: 2, a: 1 } };
      const args2 = { outer: { a: 1, b: 2 } };
      
      const normalized1 = normalizeArgs(args1);
      const normalized2 = normalizeArgs(args2);
      
      expect(JSON.stringify(normalized1)).toBe(JSON.stringify(normalized2));
    });

    it('should handle empty objects', () => {
      const normalized = normalizeArgs({});
      expect(normalized).toEqual({});
    });

    it('should handle null and undefined', () => {
      const normalized1 = normalizeArgs(null as any);
      const normalized2 = normalizeArgs(undefined as any);
      
      expect(normalized1).toEqual({});
      expect(normalized2).toEqual({});
    });

    it('should preserve arrays without sorting', () => {
      const args = { items: [3, 1, 2] };
      const normalized = normalizeArgs(args);
      
      expect((normalized as any).items).toEqual([3, 1, 2]);
    });
  });

  describe('generateIdempotencyKey', () => {
    it('should generate consistent keys for same inputs', () => {
      const key1 = generateIdempotencyKey('task1', 'step1', 'tool1', { a: 1, b: 2 });
      const key2 = generateIdempotencyKey('task1', 'step1', 'tool1', { a: 1, b: 2 });
      
      expect(key1).toBe(key2);
    });

    it('should generate same key regardless of arg order', () => {
      const key1 = generateIdempotencyKey('task1', 'step1', 'tool1', { b: 2, a: 1 });
      const key2 = generateIdempotencyKey('task1', 'step1', 'tool1', { a: 1, b: 2 });
      
      expect(key1).toBe(key2);
    });

    it('should generate different keys for different task IDs', () => {
      const key1 = generateIdempotencyKey('task1', 'step1', 'tool1', { a: 1 });
      const key2 = generateIdempotencyKey('task2', 'step1', 'tool1', { a: 1 });
      
      expect(key1).not.toBe(key2);
    });

    it('should generate different keys for different step IDs', () => {
      const key1 = generateIdempotencyKey('task1', 'step1', 'tool1', { a: 1 });
      const key2 = generateIdempotencyKey('task1', 'step2', 'tool1', { a: 1 });
      
      expect(key1).not.toBe(key2);
    });

    it('should generate different keys for different tools', () => {
      const key1 = generateIdempotencyKey('task1', 'step1', 'tool1', { a: 1 });
      const key2 = generateIdempotencyKey('task1', 'step1', 'tool2', { a: 1 });
      
      expect(key1).not.toBe(key2);
    });

    it('should generate different keys for different args', () => {
      const key1 = generateIdempotencyKey('task1', 'step1', 'tool1', { a: 1 });
      const key2 = generateIdempotencyKey('task1', 'step1', 'tool1', { a: 2 });
      
      expect(key1).not.toBe(key2);
    });

    it('should generate SHA-256 hash of 64 hex characters', () => {
      const key = generateIdempotencyKey('task1', 'step1', 'tool1', { a: 1 });
      
      expect(key).toMatch(/^[a-f0-9]{64}$/);
      expect(key.length).toBe(64);
    });
  });
});
