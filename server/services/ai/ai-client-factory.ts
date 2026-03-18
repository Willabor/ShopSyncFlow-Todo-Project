/**
 * AI Client Factory Service
 *
 * Determines which AI provider and API key to use for a given tenant and feature.
 * Implements the hybrid tier system with BYOK (Bring Your Own Key) support.
 *
 * Key Resolution Logic:
 * 1. Check tenant's provider configuration (BYOK)
 * 2. Fall back to platform default with rate limiting
 * 3. Apply tier-based rate limits (Free: 50/day, Pro: 500/day, Enterprise: unlimited)
 *
 * Related Files:
 * - ./provider-registry.ts - Provider registration and selection
 * - ../encryption.service.ts - API key encryption/decryption
 * - shared/schema.ts - Database schema for tenant_ai_providers, ai_usage_log
 */

import { db } from '../../db.js';
import {
  tenantAiConfig,
  tenantAiProviders,
  platformAiDefaults,
  aiUsageLog,
  tenants,
} from '@shared/schema';
import { eq, and, gte, sql, count } from 'drizzle-orm';
import { decryptApiKey, isEncryptionConfigured } from '../encryption.service.js';
import {
  getProviderRegistry,
  type AIProvider,
  type AIResponse,
  type AIGenerationOptions,
  AIProviderError,
  AIErrorCode,
} from './index.js';
import { GeminiProvider } from './providers/gemini-provider.js';
import { OpenAIProvider } from './providers/openai-provider.js';
import { AnthropicProvider } from './providers/anthropic-provider.js';
import { MistralProvider } from './providers/mistral-provider.js';
import { OpenRouterProvider } from './providers/openai-provider.js';

// ===================================================================
// Types
// ===================================================================

/** Supported AI provider names */
export type AIProviderName = 'gemini' | 'openai' | 'anthropic' | 'mistral' | 'openrouter';

/** Supported tier levels */
export type AITier = 'free' | 'pro' | 'enterprise';

/** Supported AI features */
export type AIFeature =
  | 'product_description'
  | 'bullet_points'
  | 'meta_title'
  | 'meta_description'
  | 'size_chart_analysis'
  | 'brand_scraping'
  | 'category_recommendation'
  | 'keyword_generation';

/**
 * Result of key resolution
 */
export interface KeyResolutionResult {
  /** The resolved API key */
  apiKey: string;
  /** Provider name */
  provider: AIProviderName;
  /** Model to use */
  model?: string;
  /** Whether using platform default key */
  usingPlatformKey: boolean;
  /** Tenant tier */
  tier: AITier;
  /** Current usage count today */
  usageToday: number;
  /** Daily limit (null = unlimited) */
  dailyLimit: number | null;
}

/**
 * Options for AI client factory
 */
export interface AIClientOptions {
  /** Override provider selection */
  provider?: AIProviderName;
  /** Override model selection */
  model?: string;
  /** Skip rate limit check (use with caution) */
  skipRateLimitCheck?: boolean;
}

/**
 * Configuration for logging AI usage
 */
export interface AIUsageLogEntry {
  tenantId: string;
  userId?: number;
  provider: AIProviderName;
  model: string;
  feature: AIFeature;
  templateId?: number;
  tokensInput: number;
  tokensOutput: number;
  costEstimate?: number;
  durationMs: number;
  success: boolean;
  errorMessage?: string;
  usedPlatformKey: boolean;
}

// ===================================================================
// Constants
// ===================================================================

/** Rate limits by tier (requests per day) */
export const TIER_RATE_LIMITS: Record<AITier, number | null> = {
  free: 50,
  pro: 500,
  enterprise: null, // Unlimited
};

/** Friendly tier names for error messages */
const TIER_NAMES: Record<AITier, string> = {
  free: 'Free',
  pro: 'Pro',
  enterprise: 'Enterprise',
};

// ===================================================================
// Error Classes
// ===================================================================

/**
 * Error thrown when a tenant exceeds their rate limit
 */
export class RateLimitError extends Error {
  constructor(
    message: string,
    public readonly tier: AITier,
    public readonly usage: number,
    public readonly limit: number
  ) {
    super(message);
    this.name = 'RateLimitError';
  }
}

/**
 * Error thrown when provider configuration is missing or invalid
 */
export class ProviderConfigurationError extends Error {
  constructor(
    message: string,
    public readonly provider?: AIProviderName
  ) {
    super(message);
    this.name = 'ProviderConfigurationError';
  }
}

// ===================================================================
// Core Functions
// ===================================================================

/**
 * Gets the tenant's current tier from the database
 */
async function getTenantTier(tenantId: string): Promise<AITier> {
  const config = await db
    .select({ tier: tenantAiConfig.tier })
    .from(tenantAiConfig)
    .where(eq(tenantAiConfig.tenantId, tenantId))
    .limit(1);

  if (config.length > 0 && config[0].tier) {
    return config[0].tier as AITier;
  }

  // Default to free tier if not configured
  return 'free';
}

/**
 * Gets the tenant's AI usage count for today (UTC)
 */
async function getTenantUsageToday(tenantId: string): Promise<number> {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const result = await db
    .select({ count: count() })
    .from(aiUsageLog)
    .where(
      and(
        eq(aiUsageLog.tenantId, tenantId),
        gte(aiUsageLog.createdAt, today)
      )
    );

  return result[0]?.count ?? 0;
}

/**
 * Gets the tenant's provider configuration (BYOK)
 */
async function getTenantProviderConfig(tenantId: string, provider: AIProviderName) {
  const config = await db
    .select()
    .from(tenantAiProviders)
    .where(
      and(
        eq(tenantAiProviders.tenantId, tenantId),
        eq(tenantAiProviders.provider, provider),
        eq(tenantAiProviders.isEnabled, true)
      )
    )
    .limit(1);

  return config[0] || null;
}

/**
 * Gets the platform default configuration for a provider
 */
async function getPlatformDefault(provider: AIProviderName) {
  const config = await db
    .select()
    .from(platformAiDefaults)
    .where(
      and(
        eq(platformAiDefaults.provider, provider),
        eq(platformAiDefaults.isEnabled, true)
      )
    )
    .limit(1);

  return config[0] || null;
}

/**
 * Gets the tenant's default provider from their AI config
 */
async function getTenantDefaultProvider(tenantId: string): Promise<AIProviderName | null> {
  const config = await db
    .select({ defaultProvider: tenantAiConfig.defaultProvider })
    .from(tenantAiConfig)
    .where(eq(tenantAiConfig.tenantId, tenantId))
    .limit(1);

  if (config.length > 0 && config[0].defaultProvider) {
    return config[0].defaultProvider as AIProviderName;
  }

  return null;
}

/**
 * Resolves the API key and provider for a tenant and feature.
 *
 * Key Resolution Logic:
 * 1. Check if tenant has a BYOK config for the preferred provider
 * 2. If BYOK configured and not using platform default, use tenant's key (no rate limits)
 * 3. Otherwise, use platform default key with tier-based rate limiting
 *
 * @param tenantId - The tenant ID
 * @param feature - The AI feature being used
 * @param options - Optional overrides
 * @returns KeyResolutionResult with resolved key and metadata
 * @throws RateLimitError if rate limit exceeded
 * @throws ProviderConfigurationError if no provider is configured
 */
export async function resolveAIKey(
  tenantId: string,
  feature: AIFeature,
  options: AIClientOptions = {}
): Promise<KeyResolutionResult> {
  // Get tenant's tier
  const tier = await getTenantTier(tenantId);

  // Get usage today
  const usageToday = await getTenantUsageToday(tenantId);

  // Determine which provider to use
  const provider: AIProviderName = options.provider ||
    await getTenantDefaultProvider(tenantId) ||
    'gemini';

  // Check for tenant's own API key (BYOK)
  const tenantProviderConfig = await getTenantProviderConfig(tenantId, provider);

  // If tenant has their own key and not using platform default
  if (
    tenantProviderConfig &&
    tenantProviderConfig.apiKeyEncrypted &&
    !tenantProviderConfig.usePlatformDefault
  ) {
    if (!isEncryptionConfigured()) {
      throw new ProviderConfigurationError(
        'Encryption not configured. Cannot decrypt stored API keys.',
        provider
      );
    }

    const apiKey = decryptApiKey(tenantProviderConfig.apiKeyEncrypted);

    // Extract default model from additional config if set
    const additionalConfig = tenantProviderConfig.additionalConfig as { defaultModel?: string } | null;

    return {
      apiKey,
      provider,
      model: options.model || additionalConfig?.defaultModel,
      usingPlatformKey: false,
      tier,
      usageToday,
      dailyLimit: null, // No limit for BYOK
    };
  }

  // Fall back to platform default
  const platformConfig = await getPlatformDefault(provider);

  if (!platformConfig || !platformConfig.apiKeyEncrypted) {
    // Check environment variable as fallback
    const envKey = getEnvApiKey(provider);
    if (envKey) {
      return {
        apiKey: envKey,
        provider,
        model: options.model,
        usingPlatformKey: true,
        tier,
        usageToday,
        dailyLimit: TIER_RATE_LIMITS[tier],
      };
    }

    throw new ProviderConfigurationError(
      `No API key configured for ${provider}. ` +
      'Please add your own API key in AI Settings or contact support.',
      provider
    );
  }

  // Check rate limits for platform key usage
  const dailyLimit = TIER_RATE_LIMITS[tier];

  if (!options.skipRateLimitCheck && dailyLimit !== null && usageToday >= dailyLimit) {
    throw new RateLimitError(
      `Daily AI limit reached (${usageToday}/${dailyLimit} requests). ` +
      (tier === 'free'
        ? 'Upgrade to Pro for 500 requests/day, or add your own API key for unlimited access.'
        : tier === 'pro'
          ? 'Add your own API key for unlimited access, or upgrade to Enterprise.'
          : 'Contact support to adjust your limits.'),
      tier,
      usageToday,
      dailyLimit
    );
  }

  if (!isEncryptionConfigured()) {
    throw new ProviderConfigurationError(
      'Encryption not configured. Cannot decrypt platform API keys.',
      provider
    );
  }

  const apiKey = decryptApiKey(platformConfig.apiKeyEncrypted);

  return {
    apiKey,
    provider,
    model: options.model || platformConfig.defaultModel || undefined,
    usingPlatformKey: true,
    tier,
    usageToday,
    dailyLimit,
  };
}

/**
 * Gets API key from environment variable as fallback
 */
function getEnvApiKey(provider: AIProviderName): string | undefined {
  const envVarMap: Record<AIProviderName, string> = {
    gemini: 'GEMINI_API_KEY',
    openai: 'OPENAI_API_KEY',
    anthropic: 'ANTHROPIC_API_KEY',
    mistral: 'MISTRAL_API_KEY',
    openrouter: 'OPENROUTER_API_KEY',
  };

  return process.env[envVarMap[provider]];
}

/** Provider constructor map — single source of truth for supported providers */
const PROVIDER_CONSTRUCTORS: Record<AIProviderName, new (config: { apiKey: string }) => AIProvider> = {
  gemini: GeminiProvider,
  openai: OpenAIProvider,
  anthropic: AnthropicProvider,
  mistral: MistralProvider,
  openrouter: OpenRouterProvider,
};

/**
 * Creates an AI provider instance with the resolved API key.
 * Uses the PROVIDER_CONSTRUCTORS map so adding a new provider only requires
 * updating AIProviderName, the map, and the env var map — no switch needed.
 */
function createProviderInstance(provider: AIProviderName, apiKey: string): AIProvider {
  const ProviderClass = PROVIDER_CONSTRUCTORS[provider];
  if (!ProviderClass) {
    throw new ProviderConfigurationError(
      `Provider "${provider}" is not supported yet.`,
      provider
    );
  }
  return new ProviderClass({ apiKey });
}

/**
 * Gets an AI client for a specific tenant and feature.
 *
 * This is the main entry point for getting an AI provider instance.
 * It handles key resolution, rate limiting, and provider instantiation.
 *
 * @param tenantId - The tenant ID
 * @param feature - The AI feature being used
 * @param options - Optional overrides
 * @returns Object containing the provider and resolution metadata
 *
 * @example
 * ```typescript
 * const { provider, keyInfo } = await getAIClient(1, 'product_description');
 * const response = await provider.generateContent('Write a description...');
 *
 * // Log usage after successful call
 * await logAIUsage({
 *   tenantId: 1,
 *   provider: keyInfo.provider,
 *   feature: 'product_description',
 *   ...response.tokensUsed,
 *   usedPlatformKey: keyInfo.usingPlatformKey,
 * });
 * ```
 */
export async function getAIClient(
  tenantId: string,
  feature: AIFeature,
  options: AIClientOptions = {}
): Promise<{ provider: AIProvider; keyInfo: KeyResolutionResult }> {
  const keyInfo = await resolveAIKey(tenantId, feature, options);
  const provider = createProviderInstance(keyInfo.provider, keyInfo.apiKey);

  return { provider, keyInfo };
}

/**
 * Generates AI content for a tenant with automatic key resolution and usage logging.
 *
 * This is a convenience function that combines:
 * 1. Key resolution
 * 2. Content generation
 * 3. Usage logging
 *
 * @param tenantId - The tenant ID
 * @param feature - The AI feature being used
 * @param prompt - The prompt to send to the AI
 * @param options - Generation options and client options
 * @returns AI response with content and usage metrics
 *
 * @example
 * ```typescript
 * const response = await generateForTenant(
 *   1,
 *   'product_description',
 *   'Write a product description for...',
 *   { temperature: 0.7, maxTokens: 500 }
 * );
 * console.log(response.content);
 * ```
 */
export async function generateForTenant(
  tenantId: string,
  feature: AIFeature,
  prompt: string,
  options: AIGenerationOptions & AIClientOptions & { userId?: number; templateId?: number } = {}
): Promise<AIResponse & { keyInfo: KeyResolutionResult }> {
  const { userId, templateId, provider: preferredProvider, skipRateLimitCheck, ...generationOptions } = options;

  // Get AI client
  const { provider, keyInfo } = await getAIClient(tenantId, feature, {
    provider: preferredProvider,
    model: generationOptions.model,
    skipRateLimitCheck,
  });

  let response: AIResponse;
  let success = true;
  let errorMessage: string | undefined;

  try {
    // Generate content
    response = await provider.generateContent(prompt, generationOptions);
  } catch (error: any) {
    success = false;
    errorMessage = error.message || 'Unknown error';

    // Log failed request
    await logAIUsage({
      tenantId,
      userId,
      provider: keyInfo.provider,
      model: generationOptions.model || provider.getDefaultModel(),
      feature,
      templateId,
      tokensInput: 0,
      tokensOutput: 0,
      durationMs: 0,
      success: false,
      errorMessage,
      usedPlatformKey: keyInfo.usingPlatformKey,
    });

    throw error;
  }

  // Log successful request
  await logAIUsage({
    tenantId,
    userId,
    provider: keyInfo.provider,
    model: response.model,
    feature,
    templateId,
    tokensInput: response.tokensUsed.input,
    tokensOutput: response.tokensUsed.output,
    costEstimate: estimateCost(
      keyInfo.provider,
      response.model,
      response.tokensUsed.input,
      response.tokensUsed.output
    ),
    durationMs: response.durationMs,
    success: true,
    usedPlatformKey: keyInfo.usingPlatformKey,
  });

  return { ...response, keyInfo };
}

/**
 * Logs AI usage to the database
 */
export async function logAIUsage(entry: AIUsageLogEntry): Promise<void> {
  try {
    // Build the insert object with only defined values
    const insertData = {
      tenantId: entry.tenantId,
      provider: entry.provider,
      success: entry.success,
      usedPlatformKey: entry.usedPlatformKey ?? true,
      ...(entry.userId && { userId: entry.userId }),
      ...(entry.model && { model: entry.model }),
      ...(entry.feature && { feature: entry.feature }),
      ...(entry.templateId && { templateId: entry.templateId }),
      ...(entry.tokensInput !== undefined && { tokensInput: entry.tokensInput }),
      ...(entry.tokensOutput !== undefined && { tokensOutput: entry.tokensOutput }),
      ...(entry.costEstimate !== undefined && { costEstimate: entry.costEstimate.toString() }),
      ...(entry.durationMs !== undefined && { durationMs: entry.durationMs }),
      ...(entry.errorMessage && { errorMessage: entry.errorMessage }),
    };

    await db.insert(aiUsageLog).values(insertData as typeof aiUsageLog.$inferInsert);
  } catch (error) {
    // Don't fail the request if logging fails
    console.error('[AIClientFactory] Failed to log AI usage:', error);
  }
}

/**
 * Estimates cost for AI usage based on provider and model
 * Costs are in USD per 1K tokens
 */
function estimateCost(
  provider: AIProviderName,
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  // Approximate pricing per 1K tokens (as of late 2024)
  const pricing: Record<string, { input: number; output: number }> = {
    // Gemini
    'gemini-2.5-flash': { input: 0.000075, output: 0.0003 },
    'gemini-2.0-flash': { input: 0.000075, output: 0.0003 },
    'gemini-1.5-flash': { input: 0.000075, output: 0.0003 },
    'gemini-1.5-pro': { input: 0.00125, output: 0.005 },

    // OpenAI
    'gpt-4o': { input: 0.005, output: 0.015 },
    'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
    'gpt-4-turbo': { input: 0.01, output: 0.03 },
    'o1': { input: 0.015, output: 0.06 },
    'o1-mini': { input: 0.003, output: 0.012 },

    // Anthropic
    'claude-sonnet-4-20250514': { input: 0.003, output: 0.015 },
    'claude-3-5-sonnet-20241022': { input: 0.003, output: 0.015 },
    'claude-3-5-haiku-20241022': { input: 0.001, output: 0.005 },
    'claude-3-opus-20240229': { input: 0.015, output: 0.075 },

    // Mistral
    'mistral-large-latest': { input: 0.002, output: 0.006 },
    'mistral-medium-latest': { input: 0.0027, output: 0.0081 },
    'mistral-small-latest': { input: 0.001, output: 0.003 },

    // OpenRouter / Kimi
    'moonshotai/kimi-k2.5': { input: 0.00045, output: 0.0022 },
    'moonshotai/kimi-k2': { input: 0.0006, output: 0.0024 },
  };

  const modelPricing = pricing[model];
  if (!modelPricing) {
    // Default fallback pricing
    return (inputTokens * 0.001 + outputTokens * 0.003) / 1000;
  }

  return (inputTokens * modelPricing.input + outputTokens * modelPricing.output) / 1000;
}

/**
 * Gets the current usage status for a tenant
 */
export async function getTenantUsageStatus(tenantId: string): Promise<{
  tier: AITier;
  usageToday: number;
  dailyLimit: number | null;
  percentUsed: number;
  remainingRequests: number | null;
}> {
  const tier = await getTenantTier(tenantId);
  const usageToday = await getTenantUsageToday(tenantId);
  const dailyLimit = TIER_RATE_LIMITS[tier];

  return {
    tier,
    usageToday,
    dailyLimit,
    percentUsed: dailyLimit ? Math.round((usageToday / dailyLimit) * 100) : 0,
    remainingRequests: dailyLimit ? Math.max(0, dailyLimit - usageToday) : null,
  };
}

/**
 * Checks if a tenant can make an AI request (hasn't exceeded rate limit)
 */
export async function canMakeAIRequest(
  tenantId: string,
  feature: AIFeature,
  options: AIClientOptions = {}
): Promise<{ allowed: boolean; reason?: string; status: ReturnType<typeof getTenantUsageStatus> extends Promise<infer T> ? T : never }> {
  const status = await getTenantUsageStatus(tenantId);

  // If using BYOK, check if tenant has a key configured
  if (options.provider) {
    const tenantConfig = await getTenantProviderConfig(tenantId, options.provider);
    if (tenantConfig && tenantConfig.apiKeyEncrypted && !tenantConfig.usePlatformDefault) {
      return { allowed: true, status };
    }
  }

  // Check rate limit for platform key usage
  if (status.dailyLimit !== null && status.usageToday >= status.dailyLimit) {
    return {
      allowed: false,
      reason: `Daily limit reached (${status.usageToday}/${status.dailyLimit}). Add your own API key for unlimited access.`,
      status,
    };
  }

  return { allowed: true, status };
}
