import { MemoryEntry } from './types';

/**
 * Summarization strategy types
 */
export enum SummarizationStrategy {
  TRUNCATE = 'truncate',       // Simple truncation
  EXTRACT_KEY = 'extract_key', // Extract key information
  SEMANTIC = 'semantic',       // Semantic compression (would use LLM)
  AGGREGATE = 'aggregate'      // Aggregate similar entries
}

/**
 * Summarization result
 */
export interface SummarizationResult {
  entryId: string;
  originalContent: unknown;
  summarizedContent: unknown;
  strategy: SummarizationStrategy;
  compressionRatio: number;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Event compaction configuration
 */
export interface CompactionConfig {
  windowSize: number;         // Time window in milliseconds
  minEventsToCompact: number; // Minimum events before compaction
  strategy: SummarizationStrategy;
}

/**
 * MemorySummarizer handles compression and summarization of memory entries
 */
export class MemorySummarizer {
  /**
   * Summarize a memory entry using the specified strategy
   */
  summarize(
    entry: MemoryEntry,
    strategy: SummarizationStrategy,
    targetRatio?: number
  ): SummarizationResult {
    let summarizedContent: unknown;
    let compressionRatio: number;

    switch (strategy) {
      case SummarizationStrategy.TRUNCATE:
        ({ content: summarizedContent, ratio: compressionRatio } = 
          this.truncateContent(entry.content, targetRatio || 0.5));
        break;

      case SummarizationStrategy.EXTRACT_KEY:
        ({ content: summarizedContent, ratio: compressionRatio } = 
          this.extractKeyInformation(entry.content));
        break;

      case SummarizationStrategy.SEMANTIC:
        ({ content: summarizedContent, ratio: compressionRatio } = 
          this.semanticCompress(entry.content, targetRatio || 0.3));
        break;

      case SummarizationStrategy.AGGREGATE:
        ({ content: summarizedContent, ratio: compressionRatio } = 
          this.aggregateContent(entry.content));
        break;

      default:
        throw new Error(`Unknown summarization strategy: ${strategy}`);
    }

    return {
      entryId: entry.id,
      originalContent: entry.content,
      summarizedContent,
      strategy,
      compressionRatio,
      timestamp: new Date(),
      metadata: {
        originalType: entry.type,
        originalTags: entry.tags,
      },
    };
  }

  /**
   * Compact multiple memory entries into a single summarized entry
   */
  compactEvents(
    entries: MemoryEntry[],
    config: CompactionConfig
  ): MemoryEntry | null {
    if (entries.length < config.minEventsToCompact) {
      return null;
    }

    // Group entries by time window
    const sortedEntries = entries.sort(
      (a, b) => a.provenance.timestamp.getTime() - b.provenance.timestamp.getTime()
    );

    // Extract common information
    const taskIds = new Set(sortedEntries.map(e => e.provenance.task_id));
    const types = new Set(sortedEntries.map(e => e.type));
    const allTags = new Set(sortedEntries.flatMap(e => e.tags || []));

    // Create compacted content
    const compactedContent = {
      type: 'compacted_events',
      count: entries.length,
      timeRange: {
        start: sortedEntries[0].provenance.timestamp,
        end: sortedEntries[sortedEntries.length - 1].provenance.timestamp,
      },
      summary: this.generateEventSummary(sortedEntries),
      originalEntryIds: sortedEntries.map(e => e.id),
    };

    // Create a new compacted entry
    const compactedEntry: MemoryEntry = {
      id: `compacted-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
      content: compactedContent,
      type: 'snapshot',
      provenance: {
        task_id: taskIds.size === 1 ? Array.from(taskIds)[0] : 'multiple',
        step_id: 'compaction',
        timestamp: new Date(),
      },
      tags: Array.from(allTags),
      metadata: {
        compacted: true,
        originalCount: entries.length,
        strategy: config.strategy,
      },
    };

    return compactedEntry;
  }

  /**
   * Truncate content to a target size
   */
  private truncateContent(
    content: unknown,
    targetRatio: number
  ): { content: unknown; ratio: number } {
    const contentStr = JSON.stringify(content);
    const targetLength = Math.floor(contentStr.length * targetRatio);
    
    if (contentStr.length <= targetLength) {
      return { content, ratio: 1.0 };
    }

    const truncated = contentStr.substring(0, targetLength) + '...';
    
    try {
      const parsed = JSON.parse(truncated.substring(0, truncated.length - 3));
      return {
        content: { ...parsed, _truncated: true },
        ratio: truncated.length / contentStr.length,
      };
    } catch {
      return {
        content: { summary: truncated, _truncated: true },
        ratio: truncated.length / contentStr.length,
      };
    }
  }

  /**
   * Extract key information from content
   */
  private extractKeyInformation(content: unknown): { content: unknown; ratio: number } {
    if (typeof content !== 'object' || content === null) {
      return { content, ratio: 1.0 };
    }

    const originalSize = JSON.stringify(content).length;
    
    // Extract keys that are likely important
    const keyFields = ['id', 'name', 'type', 'status', 'result', 'error', 'timestamp'];
    const extracted: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(content)) {
      if (keyFields.includes(key.toLowerCase())) {
        extracted[key] = value;
      }
    }

    // If nothing extracted, return a summary
    if (Object.keys(extracted).length === 0) {
      extracted._summary = 'Metadata only';
      extracted._keys = Object.keys(content);
    }

    const newSize = JSON.stringify(extracted).length;
    return {
      content: extracted,
      ratio: newSize / originalSize,
    };
  }

  /**
   * Semantic compression (simplified version - would use LLM in production)
   */
  private semanticCompress(
    content: unknown,
    targetRatio: number
  ): { content: unknown; ratio: number } {
    // This is a placeholder for semantic compression
    // In production, this would use an LLM to generate a semantic summary
    
    const contentStr = JSON.stringify(content);
    const summary = {
      _semanticSummary: `Compressed content (${contentStr.length} chars)`,
      _originalSize: contentStr.length,
      _type: typeof content,
      _compressed: true,
    };

    const summarySize = JSON.stringify(summary).length;
    return {
      content: summary,
      ratio: summarySize / contentStr.length,
    };
  }

  /**
   * Aggregate similar content
   */
  private aggregateContent(content: unknown): { content: unknown; ratio: number } {
    if (!Array.isArray(content)) {
      return { content, ratio: 1.0 };
    }

    const originalSize = JSON.stringify(content).length;
    
    // Group by type or similarity
    const grouped: Record<string, number> = {};
    for (const item of content) {
      const type = typeof item === 'object' && item !== null ? 
        (item as any).type || 'unknown' : typeof item;
      grouped[type] = (grouped[type] || 0) + 1;
    }

    const aggregated = {
      _aggregated: true,
      totalItems: content.length,
      byType: grouped,
      sample: content.slice(0, 2), // Keep first 2 as samples
    };

    const newSize = JSON.stringify(aggregated).length;
    return {
      content: aggregated,
      ratio: newSize / originalSize,
    };
  }

  /**
   * Generate a summary of events
   */
  private generateEventSummary(entries: MemoryEntry[]): string {
    const types = entries.map(e => e.type);
    const typeCounts: Record<string, number> = {};
    
    for (const type of types) {
      typeCounts[type] = (typeCounts[type] || 0) + 1;
    }

    const summaryParts: string[] = [];
    for (const [type, count] of Object.entries(typeCounts)) {
      summaryParts.push(`${count} ${type}${count > 1 ? 's' : ''}`);
    }

    return `Compacted ${entries.length} events: ${summaryParts.join(', ')}`;
  }

  /**
   * Estimate compression ratio for a given content
   */
  estimateCompressionRatio(content: unknown, strategy: SummarizationStrategy): number {
    const result = this.summarize(
      {
        id: 'test',
        content,
        type: 'episodic_note',
        provenance: {
          task_id: 'test',
          step_id: 'test',
          timestamp: new Date(),
        },
      },
      strategy
    );

    return result.compressionRatio;
  }
}
