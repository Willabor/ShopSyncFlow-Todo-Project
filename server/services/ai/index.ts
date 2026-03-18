/**
 * AI Provider System - Barrel Export
 *
 * Multi-provider AI system supporting Gemini, OpenAI, Anthropic, and Mistral.
 *
 * @example
 * ```typescript
 * import { getProviderRegistry, generateContent } from './services/ai';
 *
 * // Use the default provider
 * const response = await generateContent('Write a product description');
 *
 * // Use a specific provider
 * const response = await generateContent('Write a product description', {}, 'openai');
 *
 * // Get the registry for more control
 * const registry = getProviderRegistry();
 * const providers = registry.getStatus();
 * ```
 */

// Types - use 'export type' for interfaces
export type {
  AIProvider,
  AIProviderConfig,
  AIGenerationOptions,
  AIResponse,
  ConnectionTestResult,
  AIModel,
} from './types.js';

// Values and classes from types
export {
  AIProviderError,
  AIErrorCode,
  PROVIDER_DISPLAY_NAMES,
  DEFAULT_GENERATION_OPTIONS,
} from './types.js';

// Base Provider
export { BaseAIProvider } from './providers/base-provider.js';

// Individual Providers
export { GeminiProvider, createGeminiProvider } from './providers/gemini-provider.js';
export { OpenAIProvider, createOpenAIProvider } from './providers/openai-provider.js';
export { AnthropicProvider, createAnthropicProvider } from './providers/anthropic-provider.js';
export { MistralProvider, createMistralProvider } from './providers/mistral-provider.js';
export { OpenRouterProvider, createOpenRouterProvider } from './providers/openai-provider.js';

// Registry - use 'export type' for interfaces
export type {
  ProviderRegistryOptions,
  ProviderStatus,
} from './provider-registry.js';

// Registry values and functions
export {
  ProviderRegistry,
  getProviderRegistry,
  resetProviderRegistry,
  generateContent,
  testAIConnections,
} from './provider-registry.js';

// AI Client Factory - Tenant-aware key resolution and rate limiting
export type {
  AIProviderName,
  AITier,
  AIFeature,
  KeyResolutionResult,
  AIClientOptions,
  AIUsageLogEntry,
} from './ai-client-factory.js';

export {
  TIER_RATE_LIMITS,
  RateLimitError,
  ProviderConfigurationError,
  resolveAIKey,
  getAIClient,
  generateForTenant,
  logAIUsage,
  getTenantUsageStatus,
  canMakeAIRequest,
} from './ai-client-factory.js';

// Prompt Template Service - Template resolution and variable substitution
export type {
  TemplateVariable,
  ResolvedTemplate,
  TemplateSearchOptions,
  SubstitutionResult,
} from './prompt-template.service.js';

export {
  TemplateError,
  getEffectiveTemplate,
  getPlatformTemplateBySlug,
  getTenantTemplateBySlug,
  getTenantTemplateById,
  listTemplates,
  getTemplateCategories,
  substituteVariables,
  extractVariables,
  validateVariables,
  createTenantTemplate,
  updateTenantTemplate,
  deleteTenantTemplate,
  incrementTemplateUsage,
  getTemplateVersionHistory,
  duplicateTemplate,
  renderTemplate,
} from './prompt-template.service.js';
