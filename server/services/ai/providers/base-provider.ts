/**
 * Base AI Provider Class
 *
 * Abstract base class that all AI providers extend.
 * Provides common functionality and error handling.
 */

import {
  AIProvider,
  AIProviderConfig,
  AIGenerationOptions,
  AIResponse,
  ConnectionTestResult,
  AIModel,
  AIProviderError,
  AIErrorCode,
  DEFAULT_GENERATION_OPTIONS,
} from '../types.js';

/**
 * Abstract base class for AI providers
 */
export abstract class BaseAIProvider implements AIProvider {
  abstract readonly name: string;
  abstract readonly displayName: string;

  protected config: AIProviderConfig | null = null;
  protected models: AIModel[] = [];

  /**
   * Initialize the provider with configuration
   * @param config - Provider configuration
   */
  constructor(config?: AIProviderConfig) {
    if (config) {
      this.config = config;
    }
  }

  /**
   * Check if the provider is available (has valid configuration)
   */
  get isAvailable(): boolean {
    return this.config !== null && !!this.config.apiKey;
  }

  /**
   * Generate content - must be implemented by subclasses
   */
  abstract generateContent(prompt: string, options?: AIGenerationOptions): Promise<AIResponse>;

  /**
   * Test connection - must be implemented by subclasses
   */
  abstract testConnection(): Promise<ConnectionTestResult>;

  /**
   * Get available models for this provider
   */
  getModels(): AIModel[] {
    return this.models;
  }

  /**
   * Get the default model for this provider
   */
  abstract getDefaultModel(): string;

  /**
   * Merge options with defaults
   */
  protected mergeOptions(options?: AIGenerationOptions): AIGenerationOptions {
    return {
      ...DEFAULT_GENERATION_OPTIONS,
      ...options,
      model: options?.model || this.config?.defaultModel || this.getDefaultModel(),
    };
  }

  /**
   * Validate that the provider is configured
   */
  protected validateConfig(): void {
    if (!this.isAvailable) {
      throw new AIProviderError(
        `${this.displayName} is not configured. Please provide an API key.`,
        this.name,
        AIErrorCode.NOT_CONFIGURED
      );
    }
  }

  /**
   * Create a standardized error from a provider-specific error
   */
  protected createError(
    message: string,
    code: AIErrorCode,
    statusCode?: number,
    originalError?: Error
  ): AIProviderError {
    return new AIProviderError(
      message,
      this.name,
      code,
      statusCode,
      originalError
    );
  }

  /**
   * Log an info message
   */
  protected log(message: string): void {
    console.log(`[${this.displayName}] ${message}`);
  }

  /**
   * Log a warning message
   */
  protected warn(message: string): void {
    console.warn(`[${this.displayName}] ${message}`);
  }

  /**
   * Log an error message
   */
  protected logError(message: string, error?: Error): void {
    console.error(`[${this.displayName}] ${message}`, error || '');
  }

  /**
   * Classify an error and return the appropriate error code
   */
  protected classifyError(error: any): {
    code: AIErrorCode;
    message: string;
    statusCode?: number;
  } {
    const errorMessage = error?.message || error?.toString() || 'Unknown error';
    const statusCode = error?.status || error?.statusCode;

    // Rate limiting
    if (
      statusCode === 429 ||
      errorMessage.includes('rate limit') ||
      errorMessage.includes('Rate limit') ||
      errorMessage.includes('too many requests')
    ) {
      return {
        code: AIErrorCode.RATE_LIMIT_ERROR,
        message: 'Rate limit exceeded. Please try again later.',
        statusCode: 429,
      };
    }

    // Quota exceeded
    if (
      errorMessage.includes('quota') ||
      errorMessage.includes('RESOURCE_EXHAUSTED') ||
      errorMessage.includes('Quota exceeded')
    ) {
      return {
        code: AIErrorCode.QUOTA_EXCEEDED,
        message: 'API quota exceeded. Please check your billing.',
        statusCode,
      };
    }

    // Authentication errors
    if (
      statusCode === 401 ||
      statusCode === 403 ||
      errorMessage.includes('API key') ||
      errorMessage.includes('api_key') ||
      errorMessage.includes('authentication') ||
      errorMessage.includes('unauthorized') ||
      errorMessage.includes('permission')
    ) {
      return {
        code: AIErrorCode.AUTHENTICATION_ERROR,
        message: 'Authentication failed. Please check your API key.',
        statusCode: statusCode || 401,
      };
    }

    // Content blocked
    if (
      errorMessage.includes('SAFETY') ||
      errorMessage.includes('blocked') ||
      errorMessage.includes('content policy') ||
      errorMessage.includes('content_filter')
    ) {
      return {
        code: AIErrorCode.CONTENT_BLOCKED,
        message: 'Content was blocked by safety filters.',
        statusCode,
      };
    }

    // Network/timeout errors
    if (
      errorMessage.includes('timeout') ||
      errorMessage.includes('ETIMEDOUT') ||
      errorMessage.includes('ECONNREFUSED') ||
      errorMessage.includes('network') ||
      errorMessage.includes('ENOTFOUND')
    ) {
      return {
        code: AIErrorCode.NETWORK_ERROR,
        message: 'Network error. Please check your connection.',
        statusCode,
      };
    }

    // Model not found
    if (
      statusCode === 404 ||
      errorMessage.includes('model not found') ||
      errorMessage.includes('does not exist')
    ) {
      return {
        code: AIErrorCode.MODEL_NOT_FOUND,
        message: 'Model not found. Please check the model ID.',
        statusCode: 404,
      };
    }

    // Invalid request
    if (statusCode === 400 || errorMessage.includes('invalid')) {
      return {
        code: AIErrorCode.INVALID_REQUEST,
        message: `Invalid request: ${errorMessage}`,
        statusCode: 400,
      };
    }

    // Unknown error
    return {
      code: AIErrorCode.UNKNOWN_ERROR,
      message: errorMessage,
      statusCode,
    };
  }

  /**
   * Handle an error from the provider API
   */
  protected handleError(error: any, context: string): never {
    const classified = this.classifyError(error);
    this.logError(`Error in ${context}: ${classified.message}`, error);

    throw this.createError(
      classified.message,
      classified.code,
      classified.statusCode,
      error instanceof Error ? error : undefined
    );
  }

  /**
   * Mask an API key for logging (show first 8 chars)
   */
  protected maskApiKey(apiKey: string): string {
    if (!apiKey || apiKey.length < 12) {
      return '***';
    }
    return `${apiKey.substring(0, 8)}...`;
  }
}
