/**
 * OpenAI LLM Provider Implementation
 * 
 * Provides integration with OpenAI's API (GPT-4, GPT-3.5-turbo, etc.)
 * with built-in timeout, retry, and output validation.
 */

import OpenAI from 'openai';
import { BaseLLMProvider, LLMConfig, LLMResponse } from '../llm-provider';

/**
 * OpenAI-specific configuration
 */
export interface OpenAIConfig extends LLMConfig {
  /** OpenAI API base URL (optional, for custom endpoints) */
  baseURL?: string;
  /** OpenAI organization ID (optional) */
  organization?: string;
}

/**
 * OpenAI LLM Provider
 */
export class OpenAIProvider extends BaseLLMProvider {
  private client: OpenAI;
  private openaiConfig: OpenAIConfig;

  constructor(config: OpenAIConfig) {
    super(config);
    this.openaiConfig = config;

    // Initialize OpenAI client
    this.client = new OpenAI({
      apiKey: config.apiKey || process.env.OPENAI_API_KEY,
      baseURL: config.baseURL,
      organization: config.organization,
      timeout: config.timeoutMs || 30000,
      maxRetries: 0, // We handle retries ourselves
    });
  }

  validateConfig(): boolean {
    const hasApiKey = !!(this.openaiConfig.apiKey || process.env.OPENAI_API_KEY);
    const hasModel = !!this.config.model;
    return hasApiKey && hasModel;
  }

  async generateCompletion(prompt: string, configOverride?: Partial<LLMConfig>): Promise<LLMResponse> {
    // Merge config with overrides
    const effectiveConfig = {
      ...this.config,
      ...configOverride,
    };

    // Validate prompt
    if (!prompt || prompt.trim().length === 0) {
      throw new Error('Prompt cannot be empty');
    }

    // Execute with retry and timeout
    const response = await this.withRetry(
      () => this.withTimeout(
        () => this.callOpenAI(prompt, effectiveConfig),
        effectiveConfig.timeoutMs
      ),
      effectiveConfig.maxRetries,
      effectiveConfig.retryDelayMs
    );

    // Validate response
    this.validateResponse(response);

    return response;
  }

  /**
   * Make the actual OpenAI API call
   * Note: The response_format: json_object option requires:
   * - gpt-3.5-turbo-1106 or later
   * - gpt-4-1106-preview or later
   * Older models will not support this feature
   */
  private async callOpenAI(prompt: string, config: LLMConfig): Promise<LLMResponse> {
    try {
      const completion = await this.client.chat.completions.create({
        model: config.model,
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant that generates structured workflow specifications in JSON format.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: config.temperature || 0.7,
        max_tokens: config.maxTokens || 4096,
        response_format: { type: 'json_object' }, // Request JSON response
      });

      const choice = completion.choices[0];
      if (!choice || !choice.message || !choice.message.content) {
        throw new Error('OpenAI returned empty response');
      }

      // Parse and validate JSON response
      const content = choice.message.content;
      try {
        JSON.parse(content); // Validate it's valid JSON
      } catch (e) {
        throw new Error(`OpenAI response is not valid JSON: ${e instanceof Error ? e.message : 'Unknown error'}`);
      }

      return {
        content,
        model: completion.model,
        promptTokens: completion.usage?.prompt_tokens,
        completionTokens: completion.usage?.completion_tokens,
        totalTokens: completion.usage?.total_tokens,
        finishReason: choice.finish_reason || undefined,
      };
    } catch (error) {
      // Enhance error message
      if (error instanceof Error) {
        throw new Error(`OpenAI API error: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Override to handle OpenAI-specific error patterns
   */
  protected isRetryableError(error: unknown): boolean {
    // Check base retryable errors first
    if (super.isRetryableError(error)) {
      return true;
    }

    // OpenAI-specific error handling
    if (error && typeof error === 'object' && 'status' in error) {
      const status = (error as any).status;
      // Retry on specific HTTP status codes
      return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
    }

    return false;
  }
}

/**
 * Factory function to create an OpenAI provider from environment variables
 */
export function createOpenAIProviderFromEnv(): OpenAIProvider {
  const config: OpenAIConfig = {
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.LLM_MODEL || 'gpt-4',
    maxTokens: process.env.LLM_MAX_TOKENS ? parseInt(process.env.LLM_MAX_TOKENS) : 4096,
    temperature: process.env.LLM_TEMPERATURE ? parseFloat(process.env.LLM_TEMPERATURE) : 0.7,
    timeoutMs: process.env.LLM_TIMEOUT_MS ? parseInt(process.env.LLM_TIMEOUT_MS) : 30000,
    maxRetries: process.env.LLM_MAX_RETRIES ? parseInt(process.env.LLM_MAX_RETRIES) : 3,
    retryDelayMs: process.env.LLM_RETRY_DELAY_MS ? parseInt(process.env.LLM_RETRY_DELAY_MS) : 1000,
    baseURL: process.env.OPENAI_BASE_URL,
    organization: process.env.OPENAI_ORGANIZATION,
  };

  return new OpenAIProvider(config);
}
