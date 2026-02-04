import { describe, it, expect, beforeEach } from 'vitest';
import { MemorySummarizer, SummarizationStrategy, MemoryEntry } from '../src';

describe('MemorySummarizer', () => {
  let summarizer: MemorySummarizer;

  beforeEach(() => {
    summarizer = new MemorySummarizer();
  });

  const createTestEntry = (content: unknown): MemoryEntry => ({
    id: 'test-entry',
    content,
    type: 'episodic_note',
    provenance: {
      task_id: 'task-1',
      step_id: 'step-1',
      timestamp: new Date(),
    },
  });

  describe('summarize', () => {
    it('should truncate content', () => {
      const entry = createTestEntry({ data: 'x'.repeat(1000) });
      const result = summarizer.summarize(entry, SummarizationStrategy.TRUNCATE, 0.5);

      expect(result.strategy).toBe(SummarizationStrategy.TRUNCATE);
      expect(result.compressionRatio).toBeLessThan(1);
      expect(result.entryId).toBe(entry.id);
    });

    it('should extract key information', () => {
      const entry = createTestEntry({
        id: '123',
        name: 'test',
        type: 'action',
        status: 'completed',
        extraData: 'this should be removed',
        moreExtraData: 'this too',
      });

      const result = summarizer.summarize(entry, SummarizationStrategy.EXTRACT_KEY);

      expect(result.strategy).toBe(SummarizationStrategy.EXTRACT_KEY);
      expect(result.compressionRatio).toBeLessThan(1);
      
      const summarized = result.summarizedContent as any;
      expect(summarized.id).toBe('123');
      expect(summarized.name).toBe('test');
      expect(summarized.type).toBe('action');
      expect(summarized.status).toBe('completed');
      expect(summarized.extraData).toBeUndefined();
    });

    it('should perform semantic compression', () => {
      const entry = createTestEntry({ 
        longText: 'This is a very long text that should be compressed'.repeat(10)
      });

      const result = summarizer.summarize(entry, SummarizationStrategy.SEMANTIC, 0.3);

      expect(result.strategy).toBe(SummarizationStrategy.SEMANTIC);
      expect(result.compressionRatio).toBeLessThan(1);
      
      const summarized = result.summarizedContent as any;
      expect(summarized._semanticSummary).toBeDefined();
      expect(summarized._compressed).toBe(true);
    });

    it('should aggregate array content', () => {
      const entry = createTestEntry([
        { type: 'event', data: 'a' },
        { type: 'event', data: 'b' },
        { type: 'error', data: 'c' },
        { type: 'event', data: 'd' },
      ]);

      const result = summarizer.summarize(entry, SummarizationStrategy.AGGREGATE);

      expect(result.strategy).toBe(SummarizationStrategy.AGGREGATE);
      
      const summarized = result.summarizedContent as any;
      expect(summarized._aggregated).toBe(true);
      expect(summarized.totalItems).toBe(4);
      expect(summarized.byType.event).toBe(3);
      expect(summarized.byType.error).toBe(1);
      expect(summarized.sample).toHaveLength(2); // First 2 items as sample
    });
  });

  describe('compactEvents', () => {
    it('should compact multiple entries into one', () => {
      const entries: MemoryEntry[] = [
        createTestEntry({ event: 'start' }),
        createTestEntry({ event: 'process' }),
        createTestEntry({ event: 'process' }),
        createTestEntry({ event: 'end' }),
      ];

      const result = summarizer.compactEvents(entries, {
        windowSize: 60000,
        minEventsToCompact: 3,
        strategy: SummarizationStrategy.AGGREGATE,
      });

      expect(result).toBeDefined();
      expect(result?.type).toBe('snapshot');
      expect(result?.metadata?.compacted).toBe(true);
      expect(result?.metadata?.originalCount).toBe(4);
      
      const content = result?.content as any;
      expect(content.type).toBe('compacted_events');
      expect(content.count).toBe(4);
      expect(content.originalEntryIds).toHaveLength(4);
    });

    it('should not compact if below minimum', () => {
      const entries: MemoryEntry[] = [
        createTestEntry({ event: 'start' }),
        createTestEntry({ event: 'end' }),
      ];

      const result = summarizer.compactEvents(entries, {
        windowSize: 60000,
        minEventsToCompact: 3,
        strategy: SummarizationStrategy.AGGREGATE,
      });

      expect(result).toBeNull();
    });

    it('should include time range in compacted content', () => {
      const now = new Date();
      const entries: MemoryEntry[] = [
        {
          ...createTestEntry({ event: 'start' }),
          provenance: {
            task_id: 'task-1',
            step_id: 'step-1',
            timestamp: new Date(now.getTime() - 10000),
          },
        },
        {
          ...createTestEntry({ event: 'middle' }),
          provenance: {
            task_id: 'task-1',
            step_id: 'step-1',
            timestamp: new Date(now.getTime() - 5000),
          },
        },
        {
          ...createTestEntry({ event: 'end' }),
          provenance: {
            task_id: 'task-1',
            step_id: 'step-1',
            timestamp: now,
          },
        },
      ];

      const result = summarizer.compactEvents(entries, {
        windowSize: 60000,
        minEventsToCompact: 3,
        strategy: SummarizationStrategy.AGGREGATE,
      });

      const content = result?.content as any;
      expect(content.timeRange).toBeDefined();
      expect(content.timeRange.start).toBeInstanceOf(Date);
      expect(content.timeRange.end).toBeInstanceOf(Date);
    });
  });

  describe('estimateCompressionRatio', () => {
    it('should estimate compression ratio', () => {
      const content = { data: 'x'.repeat(1000) };
      const ratio = summarizer.estimateCompressionRatio(
        content,
        SummarizationStrategy.TRUNCATE
      );

      expect(ratio).toBeGreaterThan(0);
      expect(ratio).toBeLessThanOrEqual(1);
    });
  });
});
