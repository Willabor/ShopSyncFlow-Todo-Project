/**
 * AI Provider Types and Interfaces
 *
 * Shared types for the multi-provider AI system.
 * Supports Gemini, OpenAI, Anthropic, and Mistral providers.
 */

/**
 * Options for AI content generation requests
 */
export interface AIGenerationOptions {
  /** Model identifier (provider-specific) */
  model?: string;
  /** Creativity control (0.0 = deterministic, 1.0+ = creative) */
  temperature?: number;
  /** Maximum tokens to generate */
  maxTokens?: number;
  /** System prompt for context/behavior */
  systemPrompt?: string;
  /** Stop sequences to end generation */
  stopSequences?: string[];
  /** Top-p nucleus sampling */
  topP?: number;
  /** Request timeout in milliseconds */
  timeoutMs?: number;
}

/**
 * Response from AI content generation
 */
export interface AIResponse {
  /** Generated text content */
  content: string;
  /** Token usage statistics */
  tokensUsed: {
    input: number;
    output: number;
    total?: number;
  };
  /** Model that was used */
  model: string;
  /** Generation duration in milliseconds */
  durationMs: number;
  /** Provider name */
  provider: string;
  /** Finish reason (stop, length, content_filter, etc.) */
  finishReason?: string;
}

/**
 * Result of a connection test
 */
export interface ConnectionTestResult {
  /** Whether the connection was successful */
  success: boolean;
  /** Human-readable message */
  message: string;
  /** Response time in milliseconds */
  responseTimeMs?: number;
  /** Model used for testing */
  model?: string;
  /** Provider name */
  provider?: string;
  /** Error details if failed */
  error?: string;
}

/**
 * AI model information
 */
export interface AIModel {
  /** Model identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Maximum context window (input + output tokens) */
  maxTokens: number;
  /** Whether the model supports vision/image input */
  supportsVision?: boolean;
  /** Whether the model supports function calling */
  supportsFunctions?: boolean;
  /** Whether the model supports JSON mode */
  supportsJson?: boolean;
  /** Cost per 1K input tokens (USD) */
  inputCostPer1k?: number;
  /** Cost per 1K output tokens (USD) */
  outputCostPer1k?: number;
  /** Description of the model */
  description?: string;
}

/**
 * Provider configuration
 */
export interface AIProviderConfig {
  /** API key for the provider */
  apiKey: string;
  /** Base URL override (for proxies or custom endpoints) */
  baseUrl?: string;
  /** Default model to use */
  defaultModel?: string;
  /** Default timeout in milliseconds */
  defaultTimeoutMs?: number;
  /** Organization ID (for OpenAI) */
  organizationId?: string;
  /** Project ID (for OpenAI) */
  projectId?: string;
}

/**
 * Interface that all AI providers must implement
 */
export interface AIProvider {
  /** Provider name identifier */
  readonly name: string;

  /** Human-readable display name */
  readonly displayName: string;

  /** Whether the provider is currently available (has valid config) */
  readonly isAvailable: boolean;

  /**
   * Generate content from a prompt
   * @param prompt - The input prompt
   * @param options - Generation options
   * @returns Promise resolving to the AI response
   */
  generateContent(prompt: string, options?: AIGenerationOptions): Promise<AIResponse>;

  /**
   * Test the connection to the provider
   * @returns Promise resolving to the test result
   */
  testConnection(): Promise<ConnectionTestResult>;

  /**
   * Get available models for this provider
   * @returns Array of available models
   */
  getModels(): AIModel[];

  /**
   * Get the default model for this provider
   * @returns The default model ID
   */
  getDefaultModel(): string;
}

/**
 * Error class for AI provider errors
 */
export class AIProviderError extends Error {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly code: AIErrorCode,
    public readonly statusCode?: number,
    public readonly originalError?: Error
  ) {
    super(message);
    this.name = 'AIProviderError';
  }
}

/**
 * Error codes for AI provider errors
 */
export enum AIErrorCode {
  /** API key is invalid or missing */
  AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR',
  /** Rate limit exceeded */
  RATE_LIMIT_ERROR = 'RATE_LIMIT_ERROR',
  /** Quota exceeded */
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',
  /** Content was blocked by safety filters */
  CONTENT_BLOCKED = 'CONTENT_BLOCKED',
  /** Request timed out */
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',
  /** Network or connection error */
  NETWORK_ERROR = 'NETWORK_ERROR',
  /** Invalid request parameters */
  INVALID_REQUEST = 'INVALID_REQUEST',
  /** Model not found or not available */
  MODEL_NOT_FOUND = 'MODEL_NOT_FOUND',
  /** Provider is not configured */
  NOT_CONFIGURED = 'NOT_CONFIGURED',
  /** Unknown error */
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

/**
 * Map of provider names to display names
 */
export const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
  gemini: 'Google Gemini',
  openai: 'OpenAI',
  anthropic: 'Anthropic Claude',
  mistral: 'Mistral AI',
  openrouter: 'OpenRouter',
};

/**
 * Default generation options
 */
export const DEFAULT_GENERATION_OPTIONS: AIGenerationOptions = {
  temperature: 0.7,
  maxTokens: 4096,
  timeoutMs: 60000,
};
