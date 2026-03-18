/**
 * Google Gemini AI Provider
 *
 * Implementation of the AI provider interface for Google Gemini.
 * Uses the @google/generative-ai SDK.
 */

import { GoogleGenerativeAI, GenerativeModel, GenerationConfig } from '@google/generative-ai';
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
 * Available Gemini models
 */
const GEMINI_MODELS: AIModel[] = [
  {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    maxTokens: 1048576,
    supportsVision: true,
    supportsFunctions: true,
    supportsJson: true,
    inputCostPer1k: 0.00,
    outputCostPer1k: 0.00,
    description: 'Fast and free model with vision capabilities',
  },
  {
    id: 'gemini-2.0-flash',
    name: 'Gemini 2.0 Flash',
    maxTokens: 1048576,
    supportsVision: true,
    supportsFunctions: true,
    supportsJson: true,
    inputCostPer1k: 0.00,
    outputCostPer1k: 0.00,
    description: 'Latest flash model with improved performance',
  },
  {
    id: 'gemini-1.5-pro',
    name: 'Gemini 1.5 Pro',
    maxTokens: 2097152,
    supportsVision: true,
    supportsFunctions: true,
    supportsJson: true,
    inputCostPer1k: 0.00125,
    outputCostPer1k: 0.005,
    description: 'Advanced model for complex tasks',
  },
  {
    id: 'gemini-1.5-flash',
    name: 'Gemini 1.5 Flash',
    maxTokens: 1048576,
    supportsVision: true,
    supportsFunctions: true,
    supportsJson: true,
    inputCostPer1k: 0.000075,
    outputCostPer1k: 0.0003,
    description: 'Fast and efficient model',
  },
  {
    id: 'gemini-1.0-pro',
    name: 'Gemini 1.0 Pro',
    maxTokens: 32768,
    supportsVision: false,
    supportsFunctions: true,
    supportsJson: true,
    inputCostPer1k: 0.0005,
    outputCostPer1k: 0.0015,
    description: 'Legacy model for basic tasks',
  },
];

const DEFAULT_MODEL = 'gemini-2.5-flash';

/**
 * Google Gemini AI Provider
 */
export class GeminiProvider extends BaseAIProvider {
  readonly name = 'gemini';
  readonly displayName = 'Google Gemini';

  private client: GoogleGenerativeAI | null = null;

  constructor(config?: AIProviderConfig) {
    super(config);
    this.models = GEMINI_MODELS;

    // Try to initialize from environment if no config provided
    if (!config) {
      const apiKey = process.env.GEMINI_API_KEY;
      if (apiKey) {
        this.config = { apiKey };
      }
    }

    // Initialize client if we have a config
    if (this.config?.apiKey) {
      this.client = new GoogleGenerativeAI(this.config.apiKey);
      this.log(`Initialized with API key: ${this.maskApiKey(this.config.apiKey)}`);
    } else {
      this.warn('No API key provided. Provider will not be available.');
    }
  }

  get isAvailable(): boolean {
    return this.client !== null;
  }

  getDefaultModel(): string {
    return this.config?.defaultModel || DEFAULT_MODEL;
  }

  /**
   * Get a Gemini model instance
   */
  private getModel(modelId: string, systemPrompt?: string): GenerativeModel {
    if (!this.client) {
      throw this.createError(
        'Gemini client not initialized',
        AIErrorCode.NOT_CONFIGURED
      );
    }

    const modelConfig: { model: string; systemInstruction?: string } = {
      model: modelId,
    };

    if (systemPrompt) {
      modelConfig.systemInstruction = systemPrompt;
    }

    return this.client.getGenerativeModel(modelConfig);
  }

  /**
   * Build generation config from options
   */
  private buildGenerationConfig(options: AIGenerationOptions): GenerationConfig {
    const config: GenerationConfig = {};

    if (options.temperature !== undefined) {
      config.temperature = options.temperature;
    }

    if (options.maxTokens !== undefined) {
      config.maxOutputTokens = options.maxTokens;
    }

    if (options.topP !== undefined) {
      config.topP = options.topP;
    }

    if (options.stopSequences && options.stopSequences.length > 0) {
      config.stopSequences = options.stopSequences;
    }

    return config;
  }

  async generateContent(prompt: string, options?: AIGenerationOptions): Promise<AIResponse> {
    this.validateConfig();

    const mergedOptions = this.mergeOptions(options);
    const modelId = mergedOptions.model || this.getDefaultModel();

    const startTime = Date.now();

    try {
      const model = this.getModel(modelId, mergedOptions.systemPrompt);
      const generationConfig = this.buildGenerationConfig(mergedOptions);

      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig,
      });

      const response = await result.response;
      const text = response.text();
      const durationMs = Date.now() - startTime;

      // Extract token counts from usage metadata
      const usageMetadata = response.usageMetadata;
      const inputTokens = usageMetadata?.promptTokenCount || 0;
      const outputTokens = usageMetadata?.candidatesTokenCount || 0;

      // Get finish reason
      const candidate = response.candidates?.[0];
      const finishReason = candidate?.finishReason || 'STOP';

      this.log(`Generated ${outputTokens} tokens in ${durationMs}ms (model: ${modelId})`);

      return {
        content: text,
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
        message: 'Gemini provider is not configured. Please set GEMINI_API_KEY.',
        provider: this.name,
      };
    }

    const startTime = Date.now();

    try {
      const model = this.getModel(this.getDefaultModel());
      const result = await model.generateContent('Say "hello" and nothing else.');
      const response = await result.response;
      const text = response.text();
      const responseTimeMs = Date.now() - startTime;

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
 * Create a Gemini provider from environment variables
 */
export function createGeminiProvider(): GeminiProvider {
  const apiKey = process.env.GEMINI_API_KEY;
  const defaultModel = process.env.GEMINI_DEFAULT_MODEL;

  if (!apiKey) {
    console.warn('[Gemini] GEMINI_API_KEY not found in environment');
    return new GeminiProvider();
  }

  return new GeminiProvider({
    apiKey,
    defaultModel: defaultModel || DEFAULT_MODEL,
  });
}
