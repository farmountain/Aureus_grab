import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryToolResultCache, CachedToolResult } from '../src/tool-result-cache';
import { ToolResult } from '../src/index';

describe('ToolResultCache', () => {
  let cache: InMemoryToolResultCache;

  beforeEach(() => {
    cache = new InMemoryToolResultCache();
  });

  describe('InMemoryToolResultCache', () => {
    it('should store and retrieve results', async () => {
      const key = 'test-key-1';
      const result: ToolResult = {
        success: true,
        data: { value: 42 },
      };

      await cache.set(key, result);
      const retrieved = await cache.get(key);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.success).toBe(true);
      expect(retrieved?.data).toEqual({ value: 42 });
      expect(retrieved?.idempotencyKey).toBe(key);
    });

    it('should mark retrieved results as replayed', async () => {
      const key = 'test-key-2';
      const result: ToolResult = {
        success: true,
        data: 'test',
      };

      await cache.set(key, result);
      const retrieved = await cache.get(key);

      expect(retrieved?.replayed).toBe(true);
    });

    it('should return null for non-existent keys', async () => {
      const retrieved = await cache.get('non-existent');
      expect(retrieved).toBeNull();
    });

    it('should check if key exists', async () => {
      const key = 'test-key-3';
      
      expect(await cache.has(key)).toBe(false);
      
      await cache.set(key, { success: true });
      
      expect(await cache.has(key)).toBe(true);
    });

    it('should clear specific cached results', async () => {
      const key1 = 'test-key-4';
      const key2 = 'test-key-5';

      await cache.set(key1, { success: true, data: 1 });
      await cache.set(key2, { success: true, data: 2 });

      expect(await cache.has(key1)).toBe(true);
      expect(await cache.has(key2)).toBe(true);

      await cache.clear(key1);

      expect(await cache.has(key1)).toBe(false);
      expect(await cache.has(key2)).toBe(true);
    });

    it('should clear all cached results', async () => {
      await cache.set('key1', { success: true });
      await cache.set('key2', { success: true });
      await cache.set('key3', { success: true });

      expect(cache.size()).toBe(3);

      await cache.clearAll();

      expect(cache.size()).toBe(0);
      expect(await cache.has('key1')).toBe(false);
      expect(await cache.has('key2')).toBe(false);
      expect(await cache.has('key3')).toBe(false);
    });

    it('should store timestamp with cached results', async () => {
      const key = 'test-key-6';
      const beforeTime = new Date();

      await cache.set(key, { success: true });
      
      const retrieved = await cache.get(key);
      const afterTime = new Date();

      expect(retrieved?.timestamp).toBeInstanceOf(Date);
      expect(retrieved!.timestamp.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
      expect(retrieved!.timestamp.getTime()).toBeLessThanOrEqual(afterTime.getTime());
    });

    it('should store error results', async () => {
      const key = 'test-key-7';
      const result: ToolResult = {
        success: false,
        error: 'Something went wrong',
      };

      await cache.set(key, result);
      const retrieved = await cache.get(key);

      expect(retrieved?.success).toBe(false);
      expect(retrieved?.error).toBe('Something went wrong');
    });

    it('should store metadata with results', async () => {
      const key = 'test-key-8';
      const result: ToolResult = {
        success: true,
        data: 'test',
        metadata: { executionTime: 123, attempts: 2 },
      };

      await cache.set(key, result);
      const retrieved = await cache.get(key);

      expect(retrieved?.metadata).toEqual({ executionTime: 123, attempts: 2 });
    });
  });
});
