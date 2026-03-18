/**
 * OpenAI AI Provider
 *
 * Implementation of the AI provider interface for OpenAI.
 * Uses the openai SDK (must be installed: npm install openai)
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
 * Available OpenAI models
 */
const OPENAI_MODELS: AIModel[] = [
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    maxTokens: 128000,
    supportsVision: true,
    supportsFunctions: true,
    supportsJson: true,
    inputCostPer1k: 0.005,
    outputCostPer1k: 0.015,
    description: 'Most capable model with vision support',
  },
  {
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini',
    maxTokens: 128000,
    supportsVision: true,
    supportsFunctions: true,
    supportsJson: true,
    inputCostPer1k: 0.00015,
    outputCostPer1k: 0.0006,
    description: 'Fast and affordable with vision support',
  },
  {
    id: 'gpt-4-turbo',
    name: 'GPT-4 Turbo',
    maxTokens: 128000,
    supportsVision: true,
    supportsFunctions: true,
    supportsJson: true,
    inputCostPer1k: 0.01,
    outputCostPer1k: 0.03,
    description: 'High capability model with vision',
  },
  {
    id: 'gpt-4',
    name: 'GPT-4',
    maxTokens: 8192,
    supportsVision: false,
    supportsFunctions: true,
    supportsJson: true,
    inputCostPer1k: 0.03,
    outputCostPer1k: 0.06,
    description: 'Original GPT-4 model',
  },
  {
    id: 'gpt-3.5-turbo',
    name: 'GPT-3.5 Turbo',
    maxTokens: 16385,
    supportsVision: false,
    supportsFunctions: true,
    supportsJson: true,
    inputCostPer1k: 0.0005,
    outputCostPer1k: 0.0015,
    description: 'Fast and affordable for simple tasks',
  },
  {
    id: 'o1',
    name: 'o1',
    maxTokens: 200000,
    supportsVision: true,
    supportsFunctions: false,
    supportsJson: true,
    inputCostPer1k: 0.015,
    outputCostPer1k: 0.06,
    description: 'Reasoning model for complex tasks',
  },
  {
    id: 'o1-mini',
    name: 'o1 Mini',
    maxTokens: 128000,
    supportsVision: false,
    supportsFunctions: false,
    supportsJson: true,
    inputCostPer1k: 0.003,
    outputCostPer1k: 0.012,
    description: 'Fast reasoning model',
  },
];

const DEFAULT_MODEL = 'gpt-4o-mini';

/**
 * OpenAI client type (dynamically imported)
 */
type OpenAIClient = any;

/**
 * OpenAI AI Provider
 */
export class OpenAIProvider extends BaseAIProvider {
  readonly name = 'openai';
  readonly displayName = 'OpenAI';

  private client: OpenAIClient | null = null;
  private OpenAI: any = null;

  constructor(config?: AIProviderConfig) {
    super(config);
    this.models = OPENAI_MODELS;

    // Try to initialize from environment if no config provided
    if (!config) {
      const apiKey = process.env.OPENAI_API_KEY;
      if (apiKey) {
        this.config = {
          apiKey,
          organizationId: process.env.OPENAI_ORG_ID,
          projectId: process.env.OPENAI_PROJECT_ID,
        };
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
   * Lazily initialize the OpenAI client
   */
  private async initializeClient(): Promise<void> {
    if (this.client) return;

    if (!this.config?.apiKey) {
      throw this.createError(
        'OpenAI API key not configured',
        AIErrorCode.NOT_CONFIGURED
      );
    }

    try {
      // Dynamic import to handle cases where the package isn't installed
      const openaiModule = await import('openai');
      this.OpenAI = openaiModule.default || openaiModule.OpenAI;

      const options: any = {
        apiKey: this.config.apiKey,
      };

      if (this.config.baseUrl) {
        options.baseURL = this.config.baseUrl;
      }

      if (this.config.organizationId) {
        options.organization = this.config.organizationId;
      }

      if (this.config.projectId) {
        options.project = this.config.projectId;
      }

      this.client = new this.OpenAI(options);
      this.log('Client initialized successfully');
    } catch (error: any) {
      if (error.code === 'ERR_MODULE_NOT_FOUND') {
        throw this.createError(
          'OpenAI SDK not installed. Run: npm install openai',
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
        requestOptions.max_tokens = mergedOptions.maxTokens;
      }

      if (mergedOptions.topP !== undefined) {
        requestOptions.top_p = mergedOptions.topP;
      }

      if (mergedOptions.stopSequences && mergedOptions.stopSequences.length > 0) {
        requestOptions.stop = mergedOptions.stopSequences;
      }

      const response = await this.client.chat.completions.create(requestOptions);
      const durationMs = Date.now() - startTime;

      const choice = response.choices[0];
      const content = choice?.message?.content || '';
      const finishReason = choice?.finish_reason || 'stop';

      const usage = response.usage || {};
      const inputTokens = usage.prompt_tokens || 0;
      const outputTokens = usage.completion_tokens || 0;

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
        message: 'OpenAI provider is not configured. Please set OPENAI_API_KEY.',
        provider: this.name,
      };
    }

    const startTime = Date.now();

    try {
      await this.initializeClient();

      const response = await this.client.chat.completions.create({
        model: this.getDefaultModel(),
        messages: [{ role: 'user', content: 'Say "hello" and nothing else.' }],
        max_tokens: 10,
      });

      const responseTimeMs = Date.now() - startTime;
      const text = response.choices[0]?.message?.content || '';

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
}

/**
 * Create an OpenAI provider from environment variables
 */
export function createOpenAIProvider(): OpenAIProvider {
  const apiKey = process.env.OPENAI_API_KEY;
  const defaultModel = process.env.OPENAI_DEFAULT_MODEL;
  const baseUrl = process.env.OPENAI_BASE_URL;
  const orgId = process.env.OPENAI_ORG_ID;
  const projectId = process.env.OPENAI_PROJECT_ID;

  if (!apiKey) {
    console.warn('[OpenAI] OPENAI_API_KEY not found in environment');
    return new OpenAIProvider();
  }

  return new OpenAIProvider({
    apiKey,
    defaultModel: defaultModel || DEFAULT_MODEL,
    baseUrl,
    organizationId: orgId,
    projectId,
  });
}

// ===================================================================
// OpenRouter Provider (reuses OpenAI SDK with custom base URL)
// ===================================================================

/**
 * Kimi K2.5 model definition for OpenRouter
 */
const OPENROUTER_MODELS: AIModel[] = [
  {
    id: 'moonshotai/kimi-k2.5',
    name: 'Kimi K2.5',
    maxTokens: 262144,
    supportsVision: true,
    supportsFunctions: true,
    supportsJson: true,
    inputCostPer1k: 0.00045,
    outputCostPer1k: 0.0022,
    description: 'Moonshot Kimi K2.5 via OpenRouter - multimodal, fast, capable',
  },
  {
    id: 'moonshotai/kimi-k2',
    name: 'Kimi K2',
    maxTokens: 131072,
    supportsVision: false,
    supportsFunctions: true,
    supportsJson: true,
    inputCostPer1k: 0.0006,
    outputCostPer1k: 0.0024,
    description: 'Moonshot Kimi K2 via OpenRouter - 1T MoE model',
  },
];

/**
 * OpenRouter provider - reuses OpenAI SDK with custom base URL.
 * Extends OpenAIProvider to override name/displayName for tracking.
 */
export class OpenRouterProvider extends OpenAIProvider {
  override readonly name = 'openrouter' as any;
  override readonly displayName = 'OpenRouter' as any;

  constructor(config?: AIProviderConfig) {
    super({
      ...config,
      baseUrl: config?.baseUrl || 'https://openrouter.ai/api/v1',
    });
    this.models = OPENROUTER_MODELS;
  }

  override getDefaultModel(): string {
    return this.config?.defaultModel || 'moonshotai/kimi-k2.5';
  }
}

/**
 * Create an OpenRouter provider from environment variables
 */
export function createOpenRouterProvider(): OpenRouterProvider {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const defaultModel = process.env.OPENROUTER_DEFAULT_MODEL;

  if (!apiKey) {
    console.warn('[OpenRouter] OPENROUTER_API_KEY not found in environment');
    return new OpenRouterProvider();
  }

  return new OpenRouterProvider({
    apiKey,
    defaultModel: defaultModel || 'moonshotai/kimi-k2.5',
    baseUrl: 'https://openrouter.ai/api/v1',
  });
}
