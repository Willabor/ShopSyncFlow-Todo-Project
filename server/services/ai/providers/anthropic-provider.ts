/**
 * Anthropic Claude AI Provider
 *
 * Implementation of the AI provider interface for Anthropic Claude.
 * Uses the @anthropic-ai/sdk package (must be installed: npm install @anthropic-ai/sdk)
 */

import { BaseAIProvider } from './base-provider.js';
import {
  AIProviderConfig,
  AIGenerationOptions,
  AIResponse,
  ConnectionTestResult,
  AIModel,
  AIErrorCode,
} from '../types.js';

/**
 * Available Anthropic models
 */
const ANTHROPIC_MODELS: AIModel[] = [
  {
    id: 'claude-sonnet-4-20250514',
    name: 'Claude Sonnet 4',
    maxTokens: 200000,
    supportsVision: true,
    supportsFunctions: true,
    supportsJson: true,
    inputCostPer1k: 0.003,
    outputCostPer1k: 0.015,
    description: 'Latest balanced model with excellent performance',
  },
  {
    id: 'claude-3-5-sonnet-20241022',
    name: 'Claude 3.5 Sonnet',
    maxTokens: 200000,
    supportsVision: true,
    supportsFunctions: true,
    supportsJson: true,
    inputCostPer1k: 0.003,
    outputCostPer1k: 0.015,
    description: 'Excellent balance of intelligence and speed',
  },
  {
    id: 'claude-3-5-haiku-20241022',
    name: 'Claude 3.5 Haiku',
    maxTokens: 200000,
    supportsVision: true,
    supportsFunctions: true,
    supportsJson: true,
    inputCostPer1k: 0.0008,
    outputCostPer1k: 0.004,
    description: 'Fastest model for quick tasks',
  },
  {
    id: 'claude-3-opus-20240229',
    name: 'Claude 3 Opus',
    maxTokens: 200000,
    supportsVision: true,
    supportsFunctions: true,
    supportsJson: true,
    inputCostPer1k: 0.015,
    outputCostPer1k: 0.075,
    description: 'Most capable model for complex tasks',
  },
  {
    id: 'claude-3-sonnet-20240229',
    name: 'Claude 3 Sonnet',
    maxTokens: 200000,
    supportsVision: true,
    supportsFunctions: true,
    supportsJson: true,
    inputCostPer1k: 0.003,
    outputCostPer1k: 0.015,
    description: 'Balanced model (previous generation)',
  },
  {
    id: 'claude-3-haiku-20240307',
    name: 'Claude 3 Haiku',
    maxTokens: 200000,
    supportsVision: true,
    supportsFunctions: true,
    supportsJson: true,
    inputCostPer1k: 0.00025,
    outputCostPer1k: 0.00125,
    description: 'Fast and affordable (previous generation)',
  },
];

const DEFAULT_MODEL = 'claude-3-5-sonnet-20241022';

/**
 * Anthropic client type (dynamically imported)
 */
type AnthropicClient = any;

/**
 * Anthropic Claude AI Provider
 */
export class AnthropicProvider extends BaseAIProvider {
  readonly name = 'anthropic';
  readonly displayName = 'Anthropic Claude';

  private client: AnthropicClient | null = null;
  private Anthropic: any = null;

  constructor(config?: AIProviderConfig) {
    super(config);
    this.models = ANTHROPIC_MODELS;

    // Try to initialize from environment if no config provided
    if (!config) {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (apiKey) {
        this.config = { apiKey };
      }
    }

    // Defer client initialization until first use
    if (this.config?.apiKey) {
      this.log(`API key configured: ${this.maskApiKey(this.config.apiKey)}`);
    } else {
      this.warn('No API key provided. Provider will not be available.');
    }
  }

  /**
   * Lazily initialize the Anthropic client
   */
  private async initializeClient(): Promise<void> {
    if (this.client) return;

    if (!this.config?.apiKey) {
      throw this.createError(
        'Anthropic API key not configured',
        AIErrorCode.NOT_CONFIGURED
      );
    }

    try {
      // Dynamic import to handle cases where the package isn't installed
      const anthropicModule = await import('@anthropic-ai/sdk');
      this.Anthropic = anthropicModule.default || anthropicModule.Anthropic;

      const options: any = {
        apiKey: this.config.apiKey,
      };

      if (this.config.baseUrl) {
        options.baseURL = this.config.baseUrl;
      }

      this.client = new this.Anthropic(options);
      this.log('Client initialized successfully');
    } catch (error: any) {
      if (error.code === 'ERR_MODULE_NOT_FOUND') {
        throw this.createError(
          'Anthropic SDK not installed. Run: npm install @anthropic-ai/sdk',
          AIErrorCode.NOT_CONFIGURED
        );
      }
      throw error;
    }
  }

  get isAvailable(): boolean {
    return !!this.config?.apiKey;
  }

  getDefaultModel(): string {
    return this.config?.defaultModel || DEFAULT_MODEL;
  }

  async generateContent(prompt: string, options?: AIGenerationOptions): Promise<AIResponse> {
    this.validateConfig();
    await this.initializeClient();

    const mergedOptions = this.mergeOptions(options);
    const modelId = mergedOptions.model || this.getDefaultModel();

    const startTime = Date.now();

    try {
      const requestOptions: any = {
        model: modelId,
        max_tokens: mergedOptions.maxTokens || 4096,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      };

      // Add system prompt if provided
      if (mergedOptions.systemPrompt) {
        requestOptions.system = mergedOptions.systemPrompt;
      }

      if (mergedOptions.temperature !== undefined) {
        requestOptions.temperature = mergedOptions.temperature;
      }

      if (mergedOptions.topP !== undefined) {
        requestOptions.top_p = mergedOptions.topP;
      }

      if (mergedOptions.stopSequences && mergedOptions.stopSequences.length > 0) {
        requestOptions.stop_sequences = mergedOptions.stopSequences;
      }

      const response = await this.client.messages.create(requestOptions);
      const durationMs = Date.now() - startTime;

      // Extract content from response
      let content = '';
      if (response.content && response.content.length > 0) {
        // Claude returns content as an array of content blocks
        content = response.content
          .filter((block: any) => block.type === 'text')
          .map((block: any) => block.text)
          .join('');
      }

      const inputTokens = response.usage?.input_tokens || 0;
      const outputTokens = response.usage?.output_tokens || 0;
      const finishReason = response.stop_reason || 'end_turn';

      this.log(`Generated ${outputTokens} tokens in ${durationMs}ms (model: ${modelId})`);

      return {
        content,
        tokensUsed: {
          input: inputTokens,
          output: outputTokens,
          total: inputTokens + outputTokens,
        },
        model: modelId,
        durationMs,
        provider: this.name,
        finishReason,
      };
    } catch (error: any) {
      this.handleError(error, 'generateContent');
    }
  }

  async testConnection(): Promise<ConnectionTestResult> {
    if (!this.isAvailable) {
      return {
        success: false,
        message: 'Anthropic provider is not configured. Please set ANTHROPIC_API_KEY.',
        provider: this.name,
      };
    }

    const startTime = Date.now();

    try {
      await this.initializeClient();

      const response = await this.client.messages.create({
        model: this.getDefaultModel(),
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Say "hello" and nothing else.' }],
      });

      const responseTimeMs = Date.now() - startTime;

      let text = '';
      if (response.content && response.content.length > 0) {
        const textBlock = response.content.find((block: any) => block.type === 'text');
        text = textBlock?.text || '';
      }

      if (text && text.toLowerCase().includes('hello')) {
        return {
          success: true,
          message: 'Connection successful',
          responseTimeMs,
          model: this.getDefaultModel(),
          provider: this.name,
        };
      } else {
        return {
          success: false,
          message: `Unexpected response: ${text.substring(0, 100)}`,
          responseTimeMs,
          model: this.getDefaultModel(),
          provider: this.name,
        };
      }
    } catch (error: any) {
      const classified = this.classifyError(error);
      return {
        success: false,
        message: classified.message,
        error: error?.message || String(error),
        provider: this.name,
      };
    }
  }

  /**
   * Classify Anthropic-specific errors
   */
  protected classifyError(error: any): {
    code: AIErrorCode;
    message: string;
    statusCode?: number;
  } {
    const errorMessage = error?.message || error?.toString() || 'Unknown error';
    const statusCode = error?.status || error?.statusCode;
    const errorType = error?.error?.type;

    // Anthropic-specific error types
    if (errorType === 'authentication_error' || statusCode === 401) {
      return {
        code: AIErrorCode.AUTHENTICATION_ERROR,
        message: 'Authentication failed. Please check your Anthropic API key.',
        statusCode: 401,
      };
    }

    if (errorType === 'rate_limit_error' || statusCode === 429) {
      return {
        code: AIErrorCode.RATE_LIMIT_ERROR,
        message: 'Rate limit exceeded. Please try again later.',
        statusCode: 429,
      };
    }

    if (errorType === 'overloaded_error' || statusCode === 529) {
      return {
        code: AIErrorCode.RATE_LIMIT_ERROR,
        message: 'Anthropic API is overloaded. Please try again later.',
        statusCode: 529,
      };
    }

    if (errorType === 'invalid_request_error' || statusCode === 400) {
      return {
        code: AIErrorCode.INVALID_REQUEST,
        message: `Invalid request: ${errorMessage}`,
        statusCode: 400,
      };
    }

    // Fall back to base classification
    return super.classifyError(error);
  }
}

/**
 * Create an Anthropic provider from environment variables
 */
export function createAnthropicProvider(): AnthropicProvider {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const defaultModel = process.env.ANTHROPIC_DEFAULT_MODEL;
  const baseUrl = process.env.ANTHROPIC_BASE_URL;

  if (!apiKey) {
    console.warn('[Anthropic] ANTHROPIC_API_KEY not found in environment');
    return new AnthropicProvider();
  }

  return new AnthropicProvider({
    apiKey,
    defaultModel: defaultModel || DEFAULT_MODEL,
    baseUrl,
  });
}
