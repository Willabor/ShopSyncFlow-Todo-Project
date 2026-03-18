/**
 * AI Settings API Routes (Tenant Level)
 *
 * Endpoints for managing tenant AI configuration and provider settings.
 * Handles BYOK (Bring Your Own Key) provider configuration, connection testing,
 * and default provider management.
 *
 * Authentication: All endpoints require authentication
 * Authorization:
 * - SuperAdmin, WarehouseManager: Full access (view, edit, test)
 * - Editor: View configuration only
 * - Auditor: View configuration only
 */

import { safeErrorMessage } from "../utils/safe-error";
import type { Express, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import type { User } from '@shared/schema';
import { storage } from '../storage';
import { encryptApiKey, decryptApiKey, maskApiKey, isEncryptionConfigured } from '../services/encryption.service';
import {
  getProviderRegistry,
  createGeminiProvider,
  createOpenAIProvider,
  createAnthropicProvider,
  createMistralProvider,
  getTenantUsageStatus,
  type ConnectionTestResult,
} from '../services/ai/index.js';

// ===================================================================
// Request Validation Schemas
// ===================================================================

const updateTenantConfigSchema = z.object({
  defaultProvider: z.enum(['gemini', 'openai', 'anthropic', 'mistral']).optional(),
  fallbackProvider: z.enum(['gemini', 'openai', 'anthropic', 'mistral']).optional().nullable(),
});

const upsertProviderSchema = z.object({
  apiKey: z.string().min(1).optional(),
  usePlatformDefault: z.boolean().optional(),
  additionalConfig: z.object({
    organizationId: z.string().optional(),
    projectId: z.string().optional(),
    defaultModel: z.string().optional(),
    baseUrl: z.string().url().optional(),
  }).optional(),
  isEnabled: z.boolean().optional(),
  isDefault: z.boolean().optional(),
});

// ===================================================================
// Helper Functions
// ===================================================================

function getTenantId(req: Request): string | null {
  const user = req.user as User | undefined;
  return user?.tenantId || null;
}

/**
 * Create a provider instance for testing with an optional custom API key
 */
function createProviderInstanceForTest(
  provider: string,
  apiKey?: string,
  additionalConfig?: Record<string, unknown>
) {
  // If API key is provided, create provider with that key
  // Otherwise factory functions read from environment
  const config = apiKey ? { apiKey, ...additionalConfig } : undefined;

  switch (provider) {
    case 'gemini':
      // GeminiProvider accepts optional config in constructor
      return config
        ? new (require('../services/ai/providers/gemini-provider.js').GeminiProvider)(config)
        : createGeminiProvider();
    case 'openai':
      return config
        ? new (require('../services/ai/providers/openai-provider.js').OpenAIProvider)(config)
        : createOpenAIProvider();
    case 'anthropic':
      return config
        ? new (require('../services/ai/providers/anthropic-provider.js').AnthropicProvider)(config)
        : createAnthropicProvider();
    case 'mistral':
      return config
        ? new (require('../services/ai/providers/mistral-provider.js').MistralProvider)(config)
        : createMistralProvider();
    default:
      return null;
  }
}

// ===================================================================
// Route Registration
// ===================================================================

export function registerAISettingsRoutes(
  app: Express,
  requireAuth: (req: Request, res: Response, next: NextFunction) => void,
  requireRole: (roles: string[]) => (req: Request, res: Response, next: NextFunction) => void
) {
  // ===================================================================
  // Tenant AI Configuration
  // ===================================================================

  /**
   * GET /api/ai/config
   * Get tenant's AI configuration and usage status
   */
  app.get(
    '/api/ai/config',
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const tenantId = getTenantId(req);
        if (!tenantId) {
          return res.status(401).json({ success: false, error: 'No tenant context' });
        }

        // Get or create tenant AI config
        let config = await storage.getTenantAiConfig(tenantId);
        if (!config) {
          config = await storage.upsertTenantAiConfig(tenantId, {
            tier: 'free',
            defaultProvider: 'gemini',
          });
        }

        // Get usage status
        const usageStatus = await getTenantUsageStatus(tenantId);

        // Get available providers from platform defaults
        const platformDefaults = await storage.getPlatformAiDefaults();
        const availableProviders = platformDefaults
          .filter(p => p.isEnabled)
          .map(p => p.provider);

        return res.json({
          success: true,
          config: {
            tier: config.tier,
            defaultProvider: config.defaultProvider,
            fallbackProvider: config.fallbackProvider,
            monthlyTokenLimit: config.monthlyTokenLimit,
          },
          usage: usageStatus,
          availableProviders,
          encryptionConfigured: isEncryptionConfigured(),
        });
      } catch (error: any) {
        console.error('[AI Settings] Error getting config:', error);
        return res.status(500).json({
          success: false,
          error: safeErrorMessage(error, 'Failed to get AI configuration'),
        });
      }
    }
  );

  /**
   * PUT /api/ai/config
   * Update tenant's AI configuration
   */
  app.put(
    '/api/ai/config',
    requireAuth,
    requireRole(['SuperAdmin', 'WarehouseManager']),
    async (req: Request, res: Response) => {
      try {
        const tenantId = getTenantId(req);
        if (!tenantId) {
          return res.status(401).json({ success: false, error: 'No tenant context' });
        }

        const parseResult = updateTenantConfigSchema.safeParse(req.body);
        if (!parseResult.success) {
          return res.status(400).json({
            success: false,
            error: 'Invalid request body',
            details: parseResult.error.format(),
          });
        }

        // Convert null fallbackProvider to undefined for storage
        const updateData = {
          ...parseResult.data,
          fallbackProvider: parseResult.data.fallbackProvider ?? undefined,
        };
        const config = await storage.upsertTenantAiConfig(tenantId, updateData);

        return res.json({
          success: true,
          config: {
            tier: config.tier,
            defaultProvider: config.defaultProvider,
            fallbackProvider: config.fallbackProvider,
          },
        });
      } catch (error: any) {
        console.error('[AI Settings] Error updating config:', error);
        return res.status(500).json({
          success: false,
          error: safeErrorMessage(error, 'Failed to update AI configuration'),
        });
      }
    }
  );

  // ===================================================================
  // Provider Configuration (BYOK)
  // ===================================================================

  /**
   * GET /api/ai/providers
   * List tenant's configured providers
   */
  app.get(
    '/api/ai/providers',
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const tenantId = getTenantId(req);
        if (!tenantId) {
          return res.status(401).json({ success: false, error: 'No tenant context' });
        }

        // Get tenant's provider configs
        const tenantProviders = await storage.getTenantAiProviders(tenantId);

        // Get platform defaults for reference
        const platformDefaults = await storage.getPlatformAiDefaults();
        const platformMap = new Map(platformDefaults.map(p => [p.provider, p]));

        // Get the global provider registry for model info
        const registry = getProviderRegistry();

        // Build provider list with status
        const allProviders = ['gemini', 'openai', 'anthropic', 'mistral'];
        const providers = allProviders.map(providerName => {
          const tenantConfig = tenantProviders.find(p => p.provider === providerName);
          const platformConfig = platformMap.get(providerName);
          const registryProvider = registry.get(providerName);

          return {
            provider: providerName,
            displayName: registryProvider?.displayName || providerName,
            // Status
            isConfigured: !!tenantConfig,
            isEnabled: tenantConfig?.isEnabled ?? true,
            isDefault: tenantConfig?.isDefault ?? false,
            usePlatformDefault: tenantConfig?.usePlatformDefault ?? true,
            // Show if they have their own key (masked)
            hasOwnKey: !!(tenantConfig?.apiKeyEncrypted && !tenantConfig.usePlatformDefault),
            maskedKey: tenantConfig?.apiKeyEncrypted && !tenantConfig.usePlatformDefault
              ? maskApiKey(decryptApiKey(tenantConfig.apiKeyEncrypted))
              : null,
            // Additional config
            additionalConfig: tenantConfig?.additionalConfig,
            // Test status
            lastTestedAt: tenantConfig?.lastTestedAt,
            lastTestStatus: tenantConfig?.lastTestStatus,
            lastTestError: tenantConfig?.lastTestError,
            // Platform info
            platformEnabled: platformConfig?.isEnabled ?? false,
            platformRateLimitFree: platformConfig?.rateLimitFree,
            platformRateLimitPro: platformConfig?.rateLimitPro,
            // Models available
            models: registryProvider?.getModels() || [],
            defaultModel: registryProvider?.getDefaultModel() || platformConfig?.defaultModel,
          };
        });

        return res.json({
          success: true,
          providers,
        });
      } catch (error: any) {
        console.error('[AI Settings] Error getting providers:', error);
        return res.status(500).json({
          success: false,
          error: safeErrorMessage(error, 'Failed to get providers'),
        });
      }
    }
  );

  /**
   * POST /api/ai/providers/:provider
   * Add or update a provider configuration (BYOK)
   */
  app.post(
    '/api/ai/providers/:provider',
    requireAuth,
    requireRole(['SuperAdmin', 'WarehouseManager']),
    async (req: Request, res: Response) => {
      try {
        const tenantId = getTenantId(req);
        if (!tenantId) {
          return res.status(401).json({ success: false, error: 'No tenant context' });
        }

        const { provider } = req.params;
        const validProviders = ['gemini', 'openai', 'anthropic', 'mistral'];
        if (!validProviders.includes(provider)) {
          return res.status(400).json({
            success: false,
            error: `Invalid provider: ${provider}. Must be one of: ${validProviders.join(', ')}`,
          });
        }

        const parseResult = upsertProviderSchema.safeParse(req.body);
        if (!parseResult.success) {
          return res.status(400).json({
            success: false,
            error: 'Invalid request body',
            details: parseResult.error.format(),
          });
        }

        const data = parseResult.data;

        // Encrypt API key if provided
        let apiKeyEncrypted: string | undefined;
        if (data.apiKey) {
          if (!isEncryptionConfigured()) {
            return res.status(500).json({
              success: false,
              error: 'Encryption not configured. Cannot store API keys.',
            });
          }
          apiKeyEncrypted = encryptApiKey(data.apiKey);
        }

        // Upsert provider config
        const config = await storage.upsertTenantAiProvider(tenantId, provider, {
          apiKeyEncrypted,
          usePlatformDefault: data.usePlatformDefault,
          additionalConfig: data.additionalConfig,
          isEnabled: data.isEnabled,
          isDefault: data.isDefault,
        });

        // If setting as default, ensure only one is default
        if (data.isDefault) {
          const allProviders = await storage.getTenantAiProviders(tenantId);
          for (const p of allProviders) {
            if (p.provider !== provider && p.isDefault) {
              await storage.upsertTenantAiProvider(tenantId, p.provider, {
                isDefault: false,
              });
            }
          }
        }

        return res.json({
          success: true,
          provider: {
            provider: config.provider,
            isEnabled: config.isEnabled,
            isDefault: config.isDefault,
            usePlatformDefault: config.usePlatformDefault,
            hasOwnKey: !!config.apiKeyEncrypted && !config.usePlatformDefault,
          },
        });
      } catch (error: any) {
        console.error('[AI Settings] Error upserting provider:', error);
        return res.status(500).json({
          success: false,
          error: safeErrorMessage(error, 'Failed to update provider configuration'),
        });
      }
    }
  );

  /**
   * DELETE /api/ai/providers/:provider
   * Remove a provider configuration
   */
  app.delete(
    '/api/ai/providers/:provider',
    requireAuth,
    requireRole(['SuperAdmin', 'WarehouseManager']),
    async (req: Request, res: Response) => {
      try {
        const tenantId = getTenantId(req);
        if (!tenantId) {
          return res.status(401).json({ success: false, error: 'No tenant context' });
        }

        const { provider } = req.params;
        const deleted = await storage.deleteTenantAiProvider(tenantId, provider);

        return res.json({
          success: true,
          deleted,
        });
      } catch (error: any) {
        console.error('[AI Settings] Error deleting provider:', error);
        return res.status(500).json({
          success: false,
          error: safeErrorMessage(error, 'Failed to delete provider configuration'),
        });
      }
    }
  );

  /**
   * POST /api/ai/providers/:provider/test
   * Test connection to a provider
   */
  app.post(
    '/api/ai/providers/:provider/test',
    requireAuth,
    requireRole(['SuperAdmin', 'WarehouseManager']),
    async (req: Request, res: Response) => {
      try {
        const tenantId = getTenantId(req);
        if (!tenantId) {
          return res.status(401).json({ success: false, error: 'No tenant context' });
        }

        const { provider: providerName } = req.params;
        const validProviders = ['gemini', 'openai', 'anthropic', 'mistral'];
        if (!validProviders.includes(providerName)) {
          return res.status(400).json({
            success: false,
            error: `Invalid provider: ${providerName}`,
          });
        }

        // Get the API key to test
        // Priority: 1. Request body (for testing new keys) 2. Stored tenant key 3. Platform default
        let apiKey: string | undefined;
        let keySource: 'request' | 'tenant' | 'platform' = 'platform';

        if (req.body.apiKey) {
          apiKey = req.body.apiKey;
          keySource = 'request';
        } else {
          const tenantConfig = await storage.getTenantAiProviderByProvider(tenantId, providerName);
          if (tenantConfig?.apiKeyEncrypted && !tenantConfig.usePlatformDefault) {
            apiKey = decryptApiKey(tenantConfig.apiKeyEncrypted);
            keySource = 'tenant';
          } else {
            // Use platform default or environment variable
            const platformConfig = await storage.getPlatformAiDefaultByProvider(providerName);
            if (platformConfig?.apiKeyEncrypted) {
              apiKey = decryptApiKey(platformConfig.apiKeyEncrypted);
              keySource = 'platform';
            } else {
              // Check environment variable
              const envVarMap: Record<string, string> = {
                gemini: 'GEMINI_API_KEY',
                openai: 'OPENAI_API_KEY',
                anthropic: 'ANTHROPIC_API_KEY',
                mistral: 'MISTRAL_API_KEY',
              };
              apiKey = process.env[envVarMap[providerName]];
              keySource = 'platform';
            }
          }
        }

        if (!apiKey) {
          return res.status(400).json({
            success: false,
            error: `No API key configured for ${providerName}`,
          });
        }

        // Create provider instance and test
        const providerInstance = createProviderInstanceForTest(
          providerName,
          apiKey,
          req.body.additionalConfig
        );

        if (!providerInstance) {
          return res.status(400).json({
            success: false,
            error: `Provider ${providerName} not supported`,
          });
        }

        const result: ConnectionTestResult = await providerInstance.testConnection();

        // Update test results in database (only for stored configs)
        if (keySource !== 'request') {
          await storage.updateTenantAiProviderTestResult(
            tenantId,
            providerName,
            result.success,
            result.error
          );
        }

        return res.json({
          success: result.success,
          result: {
            message: result.message,
            responseTimeMs: result.responseTimeMs,
            model: result.model,
            provider: result.provider,
            error: result.error,
          },
          keySource,
        });
      } catch (error: any) {
        console.error('[AI Settings] Error testing provider:', error);

        // Update test failure in database
        const tenantId = getTenantId(req);
        if (tenantId) {
          await storage.updateTenantAiProviderTestResult(
            tenantId,
            req.params.provider,
            false,
            error.message
          );
        }

        return res.status(500).json({
          success: false,
          error: safeErrorMessage(error, 'Connection test failed'),
        });
      }
    }
  );

  /**
   * GET /api/ai/providers/:provider/models
   * Get available models for a provider
   */
  app.get(
    '/api/ai/providers/:provider/models',
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const { provider: providerName } = req.params;
        const registry = getProviderRegistry();
        const provider = registry.get(providerName);

        if (!provider) {
          // Return empty array for unconfigured providers
          return res.json({
            success: true,
            models: [],
            defaultModel: null,
          });
        }

        return res.json({
          success: true,
          models: provider.getModels(),
          defaultModel: provider.getDefaultModel(),
        });
      } catch (error: any) {
        console.error('[AI Settings] Error getting models:', error);
        return res.status(500).json({
          success: false,
          error: safeErrorMessage(error, 'Failed to get models'),
        });
      }
    }
  );
}
