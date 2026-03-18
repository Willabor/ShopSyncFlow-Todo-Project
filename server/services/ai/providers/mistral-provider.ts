/**
 * Mistral AI Provider
 *
 * Implementation of the AI provider interface for Mistral AI.
 * Uses the @mistralai/mistralai SDK (must be installed: npm install @mistralai/mistralai)
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
 * Available Mistral models
 */
const MISTRAL_MODELS: AIModel[] = [
  {
    id: 'mistral-large-latest',
    name: 'Mistral Large',
    maxTokens: 128000,
    supportsVision: false,
    supportsFunctions: true,
    supportsJson: true,
    inputCostPer1k: 0.002,
    outputCostPer1k: 0.006,
    description: 'Most capable Mistral model for complex tasks',
  },
  {
    id: 'mistral-medium-latest',
    name: 'Mistral Medium',
    maxTokens: 32000,
    supportsVision: false,
    supportsFunctions: true,
    supportsJson: true,
    inputCostPer1k: 0.00275,
    outputCostPer1k: 0.0081,
    description: 'Balanced model for most tasks',
  },
  {
    id: 'mistral-small-latest',
    name: 'Mistral Small',
    maxTokens: 32000,
    supportsVision: false,
    supportsFunctions: true,
    supportsJson: true,
    inputCostPer1k: 0.0002,
    outputCostPer1k: 0.0006,
    description: 'Fast and affordable for simple tasks',
  },
  {
    id: 'open-mistral-nemo',
    name: 'Mistral Nemo',
    maxTokens: 128000,
    supportsVision: false,
    supportsFunctions: true,
    supportsJson: true,
    inputCostPer1k: 0.00015,
    outputCostPer1k: 0.00015,
    description: 'Open-weight model, very affordable',
  },
  {
    id: 'codestral-latest',
    name: 'Codestral',
    maxTokens: 32000,
    supportsVision: false,
    supportsFunctions: false,
    supportsJson: true,
    inputCostPer1k: 0.0002,
    outputCostPer1k: 0.0006,
    description: 'Specialized for code generation',
  },
  {
    id: 'pixtral-12b-2409',
    name: 'Pixtral 12B',
    maxTokens: 128000,
    supportsVision: true,
    supportsFunctions: false,
    supportsJson: true,
    inputCostPer1k: 0.00015,
    outputCostPer1k: 0.00015,
    description: 'Vision model with image understanding',
  },
  {
    id: 'mistral-embed',
    name: 'Mistral Embed',
    maxTokens: 8192,
    supportsVision: false,
    supportsFunctions: false,
    supportsJson: false,
    inputCostPer1k: 0.0001,
    outputCostPer1k: 0,
    description: 'Text embedding model',
  },
];

const DEFAULT_MODEL = 'mistral-small-latest';

/**
 * Mistral client type (dynamically imported)
 */
type MistralClient = any;

/**
 * Mistral AI Provider
 */
export class MistralProvider extends BaseAIProvider {
  readonly name = 'mistral';
  readonly displayName = 'Mistral AI';

  private client: MistralClient | null = null;
  private Mistral: any = null;

  constructor(config?: AIProviderConfig) {
    super(config);
    this.models = MISTRAL_MODELS;

    // Try to initialize from environment if no config provided
    if (!config) {
      const apiKey = process.env.MISTRAL_API_KEY;
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
   * Lazily initialize the Mistral client
   */
  private async initializeClient(): Promise<void> {
    if (this.client) return;

    if (!this.config?.apiKey) {
      throw this.createError(
        'Mistral API key not configured',
        AIErrorCode.NOT_CONFIGURED
      );
    }

    try {
      // Dynamic import to handle cases where the package isn't installed
      const mistralModule = await import('@mistralai/mistralai');
      // Mistral SDK v1.x exports 'Mistral' class directly
      this.Mistral = (mistralModule as any).Mistral || (mistralModule as any).default;

      const options: any = {
        apiKey: this.config.apiKey,
      };

      if (this.config.baseUrl) {
        options.endpoint = this.config.baseUrl;
      }

      this.client = new this.Mistral(options);
      this.log('Client initialized successfully');
    } catch (error: any) {
      if (error.code === 'ERR_MODULE_NOT_FOUND') {
        throw this.createError(
          'Mistral SDK not installed. Run: npm install @mistralai/mistralai',
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
      const messages: any[] = [];

      // Add system prompt if provided
      if (mergedOptions.systemPrompt) {
        messages.push({
          role: 'system',
          content: mergedOptions.systemPrompt,
        });
      }

      // Add user prompt
      messages.push({
        role: 'user',
        content: prompt,
      });

      const requestOptions: any = {
        model: modelId,
        messages,
      };

      if (mergedOptions.temperature !== undefined) {
        requestOptions.temperature = mergedOptions.temperature;
      }

      if (mergedOptions.maxTokens !== undefined) {
        requestOptions.maxTokens = mergedOptions.maxTokens;
      }

      if (mergedOptions.topP !== undefined) {
        requestOptions.topP = mergedOptions.topP;
      }

      // Mistral uses 'stop' for stop sequences
      if (mergedOptions.stopSequences && mergedOptions.stopSequences.length > 0) {
        requestOptions.stop = mergedOptions.stopSequences;
      }

      const response = await this.client.chat.complete(requestOptions);
      const durationMs = Date.now() - startTime;

      // Extract content from response
      const choice = response.choices?.[0];
      const content = choice?.message?.content || '';
      const finishReason = choice?.finishReason || 'stop';

      const inputTokens = response.usage?.promptTokens || 0;
      const outputTokens = response.usage?.completionTokens || 0;

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
        message: 'Mistral provider is not configured. Please set MISTRAL_API_KEY.',
        provider: this.name,
      };
    }

    const startTime = Date.now();

    try {
      await this.initializeClient();

      const response = await this.client.chat.complete({
        model: this.getDefaultModel(),
        messages: [{ role: 'user', content: 'Say "hello" and nothing else.' }],
        maxTokens: 10,
      });

      const responseTimeMs = Date.now() - startTime;
      const text = response.choices?.[0]?.message?.content || '';

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
   * Classify Mistral-specific errors
   */
  protected classifyError(error: any): {
    code: AIErrorCode;
    message: string;
    statusCode?: number;
  } {
    const errorMessage = error?.message || error?.toString() || 'Unknown error';
    const statusCode = error?.status || error?.statusCode || error?.httpStatus;

    // Mistral-specific error handling
    if (statusCode === 401 || errorMessage.includes('Unauthorized')) {
      return {
        code: AIErrorCode.AUTHENTICATION_ERROR,
        message: 'Authentication failed. Please check your Mistral API key.',
        statusCode: 401,
      };
    }

    if (statusCode === 429 || errorMessage.includes('rate')) {
      return {
        code: AIErrorCode.RATE_LIMIT_ERROR,
        message: 'Rate limit exceeded. Please try again later.',
        statusCode: 429,
      };
    }

    if (statusCode === 422 || errorMessage.includes('validation')) {
      return {
        code: AIErrorCode.INVALID_REQUEST,
        message: `Invalid request: ${errorMessage}`,
        statusCode: 422,
      };
    }

    // Fall back to base classification
    return super.classifyError(error);
  }
}

/**
 * Create a Mistral provider from environment variables
 */
export function createMistralProvider(): MistralProvider {
  const apiKey = process.env.MISTRAL_API_KEY;
  const defaultModel = process.env.MISTRAL_DEFAULT_MODEL;
  const baseUrl = process.env.MISTRAL_BASE_URL;

  if (!apiKey) {
    console.warn('[Mistral] MISTRAL_API_KEY not found in environment');
    return new MistralProvider();
  }

  return new MistralProvider({
    apiKey,
    defaultModel: defaultModel || DEFAULT_MODEL,
    baseUrl,
  });
}
