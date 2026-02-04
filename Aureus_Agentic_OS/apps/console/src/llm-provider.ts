/**
 * LLM Provider Interface
 * 
 * Defines a standard interface for LLM providers (OpenAI, Anthropic, etc.)
 * to enable pluggable LLM implementations with consistent error handling,
 * timeouts, retries, and output validation.
 */

/**
 * Configuration for LLM provider
 */
export interface LLMConfig {
  /** API key for the LLM provider */
  apiKey?: string;
  /** Model name to use (e.g., "gpt-4", "claude-3-opus") */
  model: string;
  /** Maximum tokens in the response */
  maxTokens?: number;
  /** Temperature for response generation (0-1) */
  temperature?: number;
  /** Timeout in milliseconds for API calls */
  timeoutMs?: number;
  /** Maximum number of retry attempts on failure */
  maxRetries?: number;
  /** Base delay in milliseconds for exponential backoff */
  retryDelayMs?: number;
}

/**
 * Standardized LLM response
 */
export interface LLMResponse {
  /** The generated text content */
  content: string;
  /** Model used for generation */
  model: string;
  /** Number of tokens used in the prompt */
  promptTokens?: number;
  /** Number of tokens in the response */
  completionTokens?: number;
  /** Total tokens used */
  totalTokens?: number;
  /** Finish reason (e.g., "stop", "length") */
  finishReason?: string;
}

/**
 * Abstract LLM provider interface
 */
export interface LLMProvider {
  /**
   * Generate a completion from the LLM
   * @param prompt - The prompt to send to the LLM
   * @param config - Optional configuration overrides
   * @returns The LLM response
   * @throws Error if the request fails after retries
   */
  generateCompletion(prompt: string, config?: Partial<LLMConfig>): Promise<LLMResponse>;

  /**
   * Validate the provider configuration
   * @returns true if configuration is valid
   */
  validateConfig(): boolean;
}

/**
 * Base implementation with retry and timeout logic
 */
export abstract class BaseLLMProvider implements LLMProvider {
  protected config: LLMConfig;

  constructor(config: LLMConfig) {
    this.config = {
      timeoutMs: 30000,
      maxRetries: 3,
      retryDelayMs: 1000,
      maxTokens: 4096,
      temperature: 0.7,
      ...config,
    };
  }

  abstract generateCompletion(prompt: string, config?: Partial<LLMConfig>): Promise<LLMResponse>;

  validateConfig(): boolean {
    return !!this.config.model;
  }

  /**
   * Execute a function with retry logic and exponential backoff
   */
  protected async withRetry<T>(
    fn: () => Promise<T>,
    maxRetries: number = this.config.maxRetries || 3,
    delayMs: number = this.config.retryDelayMs || 1000
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry on the last attempt
        if (attempt === maxRetries) {
          break;
        }

        // Check if error is retryable (e.g., rate limits, temporary failures)
        if (!this.isRetryableError(error)) {
          throw lastError;
        }

        // Exponential backoff with jitter
        const backoffMs = delayMs * Math.pow(2, attempt);
        const jitter = Math.random() * 1000;
        await this.sleep(backoffMs + jitter);
      }
    }

    throw new Error(
      `LLM request failed after ${maxRetries + 1} attempts: ${lastError?.message || 'Unknown error'}`
    );
  }

  /**
   * Execute a function with timeout
   */
  protected async withTimeout<T>(
    fn: () => Promise<T>,
    timeoutMs: number = this.config.timeoutMs || 30000
  ): Promise<T> {
    return Promise.race([
      fn(),
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`Request timed out after ${timeoutMs}ms`)), timeoutMs)
      ),
    ]);
  }

  /**
   * Determine if an error is retryable
   */
  protected isRetryableError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }

    const message = error.message.toLowerCase();
    const retryablePatterns = [
      'rate limit',
      'timeout',
      'econnreset',
      'econnrefused',
      'etimedout',
      'network error',
      'socket hang up',
      '429',
      '500',
      '502',
      '503',
      '504',
    ];

    return retryablePatterns.some(pattern => message.includes(pattern));
  }

  /**
   * Sleep for a specified duration
   */
  protected sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Validate LLM response format
   */
  protected validateResponse(response: unknown): void {
    if (!response || typeof response !== 'object') {
      throw new Error('Invalid LLM response: expected object');
    }

    const resp = response as any;
    if (!resp.content || typeof resp.content !== 'string') {
      throw new Error('Invalid LLM response: missing or invalid content field');
    }
  }
}

/**
 * Mock LLM provider for testing and development
 */
export class MockLLMProvider extends BaseLLMProvider {
  constructor(config: Partial<LLMConfig> = {}) {
    super({
      model: 'mock-model',
      ...config,
    });
  }

  async generateCompletion(prompt: string, config?: Partial<LLMConfig>): Promise<LLMResponse> {
    // Simulate API delay
    await this.sleep(100);

    // Parse prompt to extract goal and other information
    const goalMatch = prompt.match(/Goal:\s*(.+?)(?:\n|$)/i);
    const goal = goalMatch ? goalMatch[1].trim() : 'Mock workflow goal';
    
    const constraintsMatch = prompt.match(/Constraints:\s*([\s\S]+?)(?:\n\n|\nPreferred Tools:|$)/i);
    const constraints: string[] = [];
    if (constraintsMatch) {
      const constraintLines = constraintsMatch[1].trim().split('\n');
      constraintLines.forEach(line => {
        const match = line.match(/^\d+\.\s*(.+)$/);
        if (match) {
          constraints.push(match[1].trim());
        }
      });
    }

    const toolsMatch = prompt.match(/Preferred Tools:\s*(.+?)(?:\n|$)/i);
    const preferredTools = toolsMatch 
      ? toolsMatch[1].split(',').map(t => t.trim()) 
      : [];

    const riskMatch = prompt.match(/Risk Tolerance:\s*(\w+)/i);
    const riskTolerance = riskMatch ? riskMatch[1] : 'MEDIUM';

    // Generate mock response based on prompt content
    let content = '{}';
    if (prompt.includes('workflow') || prompt.includes('Goal')) {
      // Generate 3 tasks
      const tasks = [
        {
          id: 'task-1',
          name: 'Task 1: Initialize and validate inputs',
          type: 'action',
          riskTier: riskTolerance === 'LOW' ? 'LOW' : 'MEDIUM',
          toolName: preferredTools[0] || undefined,
        },
        {
          id: 'task-2',
          name: 'Task 2: Process step 1',
          type: 'action',
          riskTier: 'MEDIUM',
          toolName: preferredTools[1] || preferredTools[0] || undefined,
        },
        {
          id: 'task-3',
          name: 'Task 3: Verify completion and cleanup',
          type: 'decision',
          riskTier: riskTolerance === 'CRITICAL' || riskTolerance === 'HIGH' ? riskTolerance : 'MEDIUM',
          toolName: preferredTools[2] || undefined,
        },
      ];

      // Add retry config for high-risk tasks
      tasks.forEach(task => {
        if (task.riskTier === 'HIGH' || task.riskTier === 'CRITICAL') {
          (task as any).retry = {
            maxAttempts: 3,
            backoffMs: 1000,
          };
        }
      });

      content = JSON.stringify(
        {
          workflow: {
            name: goal.split(' ').slice(0, 5).map((w: string) => 
              w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
            ).join(' '),
            goal: goal,
            constraints: constraints.length > 0 ? constraints : undefined,
            tasks: tasks,
            dependencies: {
              'task-2': ['task-1'],
              'task-3': ['task-2'],
            },
            successCriteria: [
              'All tasks completed successfully',
              'No errors or exceptions encountered',
              'Goal objective achieved as specified',
              'All safety checks passed',
            ],
            safetyPolicy: {
              name: 'default-safety-policy',
              description: 'Default safety rules for generated workflow',
              rules: [
                { type: 'max_retries', description: 'Limit maximum retries to prevent infinite loops' },
                { type: 'timeout_enforcement', description: 'Enforce timeouts on all tasks' },
              ],
              failFast: riskTolerance === 'CRITICAL',
            },
          },
        },
        null,
        2
      );
    }

    return {
      content,
      model: this.config.model,
      promptTokens: Math.floor(prompt.length / 4),
      completionTokens: Math.floor(content.length / 4),
      totalTokens: Math.floor((prompt.length + content.length) / 4),
      finishReason: 'stop',
    };
  }

  validateConfig(): boolean {
    return true;
  }
}
