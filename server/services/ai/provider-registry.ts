/**
 * AI Provider Registry
 *
 * Central registry for managing multiple AI providers.
 * Supports registering, retrieving, and selecting providers dynamically.
 */

import {
  AIProvider,
  AIProviderConfig,
  AIResponse,
  AIGenerationOptions,
  ConnectionTestResult,
  AIModel,
  AIProviderError,
  AIErrorCode,
} from './types.js';

import { GeminiProvider, createGeminiProvider } from './providers/gemini-provider.js';
import { OpenAIProvider, createOpenAIProvider } from './providers/openai-provider.js';
import { AnthropicProvider, createAnthropicProvider } from './providers/anthropic-provider.js';
import { MistralProvider, createMistralProvider } from './providers/mistral-provider.js';
import { OpenRouterProvider, createOpenRouterProvider } from './providers/openai-provider.js';

/**
 * Provider registry options
 */
export interface ProviderRegistryOptions {
  /** Whether to auto-register providers from environment */
  autoRegister?: boolean;
  /** Default provider to use if none specified */
  defaultProvider?: string;
}

/**
 * Provider status information
 */
export interface ProviderStatus {
  name: string;
  displayName: string;
  isAvailable: boolean;
  isDefault: boolean;
  models: AIModel[];
  defaultModel: string;
}

/**
 * AI Provider Registry
 *
 * Manages multiple AI providers and provides a unified interface for
 * generating content across different providers.
 */
export class ProviderRegistry {
  private providers: Map<string, AIProvider> = new Map();
  private defaultProviderName: string | null = null;

  constructor(options: ProviderRegistryOptions = {}) {
    if (options.autoRegister !== false) {
      this.autoRegisterProviders();
    }

    if (options.defaultProvider) {
      this.setDefaultProvider(options.defaultProvider);
    }
  }

  /**
   * Auto-register providers from environment variables
   */
  private autoRegisterProviders(): void {
    // Register Gemini if configured
    if (process.env.GEMINI_API_KEY) {
      const gemini = createGeminiProvider();
      this.register('gemini', gemini);
      console.log('[ProviderRegistry] Registered Gemini provider');

      // Set Gemini as default if no default is set
      if (!this.defaultProviderName && gemini.isAvailable) {
        this.defaultProviderName = 'gemini';
      }
    }

    // Register OpenAI if configured
    if (process.env.OPENAI_API_KEY) {
      const openai = createOpenAIProvider();
      this.register('openai', openai);
      console.log('[ProviderRegistry] Registered OpenAI provider');

      // Set OpenAI as default if no default is set and Gemini isn't available
      if (!this.defaultProviderName && openai.isAvailable) {
        this.defaultProviderName = 'openai';
      }
    }

    // Register Anthropic if configured
    if (process.env.ANTHROPIC_API_KEY) {
      const anthropic = createAnthropicProvider();
      this.register('anthropic', anthropic);
      console.log('[ProviderRegistry] Registered Anthropic provider');

      // Set Anthropic as default if no default is set
      if (!this.defaultProviderName && anthropic.isAvailable) {
        this.defaultProviderName = 'anthropic';
      }
    }

    // Register Mistral if configured
    if (process.env.MISTRAL_API_KEY) {
      const mistral = createMistralProvider();
      this.register('mistral', mistral);
      console.log('[ProviderRegistry] Registered Mistral provider');

      // Set Mistral as default if no default is set
      if (!this.defaultProviderName && mistral.isAvailable) {
        this.defaultProviderName = 'mistral';
      }
    }

    // Register OpenRouter if configured
    if (process.env.OPENROUTER_API_KEY) {
      const openrouter = createOpenRouterProvider();
      this.register('openrouter', openrouter);
      console.log('[ProviderRegistry] Registered OpenRouter provider');

      if (!this.defaultProviderName && openrouter.isAvailable) {
        this.defaultProviderName = 'openrouter';
      }
    }

    // Check for explicit default provider from environment
    const envDefault = process.env.AI_DEFAULT_PROVIDER;
    if (envDefault && this.providers.has(envDefault)) {
      this.defaultProviderName = envDefault;
      console.log(`[ProviderRegistry] Set default provider from env: ${envDefault}`);
    }

    console.log(`[ProviderRegistry] Initialized with ${this.providers.size} provider(s)`);
    if (this.defaultProviderName) {
      console.log(`[ProviderRegistry] Default provider: ${this.defaultProviderName}`);
    }
  }

  /**
   * Register a provider with the registry
   * @param name - Unique identifier for the provider
   * @param provider - Provider instance
   */
  register(name: string, provider: AIProvider): void {
    this.providers.set(name.toLowerCase(), provider);
  }

  /**
   * Unregister a provider from the registry
   * @param name - Provider name to remove
   */
  unregister(name: string): boolean {
    const normalizedName = name.toLowerCase();
    if (this.defaultProviderName === normalizedName) {
      this.defaultProviderName = null;
    }
    return this.providers.delete(normalizedName);
  }

  /**
   * Get a provider by name
   * @param name - Provider name
   * @returns Provider instance or undefined
   */
  get(name: string): AIProvider | undefined {
    return this.providers.get(name.toLowerCase());
  }

  /**
   * Get all registered providers
   * @returns Array of all registered providers
   */
  getAll(): AIProvider[] {
    return Array.from(this.providers.values());
  }

  /**
   * Get all provider names
   * @returns Array of provider names
   */
  getProviderNames(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Get the status of all providers
   * @returns Array of provider status objects
   */
  getStatus(): ProviderStatus[] {
    return Array.from(this.providers.entries()).map(([name, provider]) => ({
      name,
      displayName: provider.displayName,
      isAvailable: provider.isAvailable,
      isDefault: name === this.defaultProviderName,
      models: provider.getModels(),
      defaultModel: provider.getDefaultModel(),
    }));
  }

  /**
   * Get all available providers (those with valid configuration)
   * @returns Array of available providers
   */
  getAvailable(): AIProvider[] {
    return this.getAll().filter((provider) => provider.isAvailable);
  }

  /**
   * Check if a provider is registered
   * @param name - Provider name
   * @returns Whether the provider is registered
   */
  has(name: string): boolean {
    return this.providers.has(name.toLowerCase());
  }

  /**
   * Set the default provider
   * @param name - Provider name to set as default
   */
  setDefaultProvider(name: string): void {
    const normalizedName = name.toLowerCase();
    if (!this.providers.has(normalizedName)) {
      throw new AIProviderError(
        `Provider "${name}" is not registered`,
        'registry',
        AIErrorCode.NOT_CONFIGURED
      );
    }
    this.defaultProviderName = normalizedName;
    console.log(`[ProviderRegistry] Default provider set to: ${normalizedName}`);
  }

  /**
   * Get the default provider
   * @returns The default provider or undefined
   */
  getDefault(): AIProvider | undefined {
    if (!this.defaultProviderName) {
      // Return first available provider
      const available = this.getAvailable();
      return available.length > 0 ? available[0] : undefined;
    }
    return this.providers.get(this.defaultProviderName);
  }

  /**
   * Get the default provider name
   * @returns The default provider name or null
   */
  getDefaultName(): string | null {
    return this.defaultProviderName;
  }

  /**
   * Generate content using a specific provider or the default
   * @param prompt - The input prompt
   * @param options - Generation options
   * @param providerName - Optional provider name (uses default if not specified)
   * @returns Promise resolving to the AI response
   */
  async generateContent(
    prompt: string,
    options?: AIGenerationOptions,
    providerName?: string
  ): Promise<AIResponse> {
    const provider = this.resolveProvider(providerName);
    return provider.generateContent(prompt, options);
  }

  /**
   * Test connection to a specific provider or all providers
   * @param providerName - Optional provider name (tests all if not specified)
   * @returns Promise resolving to test results
   */
  async testConnection(providerName?: string): Promise<ConnectionTestResult[]> {
    if (providerName) {
      const provider = this.resolveProvider(providerName);
      return [await provider.testConnection()];
    }

    // Test all available providers
    const results: ConnectionTestResult[] = [];
    for (const [name, provider] of this.providers) {
      if (provider.isAvailable) {
        try {
          const result = await provider.testConnection();
          results.push(result);
        } catch (error: any) {
          results.push({
            success: false,
            message: error.message || 'Connection test failed',
            provider: name,
            error: error.message,
          });
        }
      } else {
        results.push({
          success: false,
          message: 'Provider not configured',
          provider: name,
        });
      }
    }

    return results;
  }

  /**
   * Get all available models across all providers
   * @returns Map of provider names to their models
   */
  getAllModels(): Map<string, AIModel[]> {
    const models = new Map<string, AIModel[]>();
    for (const [name, provider] of this.providers) {
      models.set(name, provider.getModels());
    }
    return models;
  }

  /**
   * Resolve a provider by name or return the default
   */
  private resolveProvider(providerName?: string): AIProvider {
    if (providerName) {
      const provider = this.get(providerName);
      if (!provider) {
        throw new AIProviderError(
          `Provider "${providerName}" is not registered`,
          'registry',
          AIErrorCode.NOT_CONFIGURED
        );
      }
      if (!provider.isAvailable) {
        throw new AIProviderError(
          `Provider "${providerName}" is not configured`,
          'registry',
          AIErrorCode.NOT_CONFIGURED
        );
      }
      return provider;
    }

    const defaultProvider = this.getDefault();
    if (!defaultProvider) {
      throw new AIProviderError(
        'No AI providers are configured. Please set at least one API key (GEMINI_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY, or MISTRAL_API_KEY)',
        'registry',
        AIErrorCode.NOT_CONFIGURED
      );
    }

    return defaultProvider;
  }
}

// Singleton instance
let registryInstance: ProviderRegistry | null = null;

/**
 * Get the singleton provider registry instance
 */
export function getProviderRegistry(): ProviderRegistry {
  if (!registryInstance) {
    registryInstance = new ProviderRegistry({ autoRegister: true });
  }
  return registryInstance;
}

/**
 * Reset the singleton registry (useful for testing)
 */
export function resetProviderRegistry(): void {
  registryInstance = null;
}

/**
 * Convenience function to generate content using the default provider
 */
export async function generateContent(
  prompt: string,
  options?: AIGenerationOptions,
  providerName?: string
): Promise<AIResponse> {
  const registry = getProviderRegistry();
  return registry.generateContent(prompt, options, providerName);
}

/**
 * Convenience function to test AI provider connections
 */
export async function testAIConnections(providerName?: string): Promise<ConnectionTestResult[]> {
  const registry = getProviderRegistry();
  return registry.testConnection(providerName);
}
