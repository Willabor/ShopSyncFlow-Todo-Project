/**
 * AI Admin API Routes (SuperAdmin Only)
 *
 * Platform-level AI management endpoints. Handles platform default providers,
 * platform-level prompt templates, and cross-tenant statistics.
 *
 * Authentication: All endpoints require authentication
 * Authorization: SuperAdmin only
 */

import { safeErrorMessage } from "../utils/safe-error";
import type { Express, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import type { User } from '@shared/schema';
import { storage } from '../storage';
import { encryptApiKey, decryptApiKey, maskApiKey, isEncryptionConfigured } from '../services/encryption.service';
import { getProviderRegistry } from '../services/ai/index.js';

// ===================================================================
// Request Validation Schemas
// ===================================================================

const upsertPlatformDefaultSchema = z.object({
  apiKey: z.string().min(1).optional(),
  defaultModel: z.string().optional(),
  rateLimitFree: z.number().int().positive().optional(),
  rateLimitPro: z.number().int().positive().optional(),
  isEnabled: z.boolean().optional(),
});

const variableSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['text', 'textarea', 'number', 'select', 'boolean']),
  required: z.boolean(),
  default: z.string().optional(),
  description: z.string().optional(),
  options: z.array(z.string()).optional(),
});

const createPlatformTemplateSchema = z.object({
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-_]+$/),
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  category: z.string().min(1).max(100),
  templateContent: z.string().min(1),
  systemPrompt: z.string().optional(),
  variables: z.array(variableSchema).optional(),
  defaultModel: z.string().optional(),
  defaultTemperature: z.string().optional(),
  maxTokens: z.number().int().positive().optional(),
  outputFormat: z.enum(['text', 'json', 'markdown', 'html']).optional(),
});

const updatePlatformTemplateSchema = createPlatformTemplateSchema.partial().extend({
  isActive: z.boolean().optional(),
  version: z.string().optional(),
});

// ===================================================================
// Helper Functions
// ===================================================================

function isSuperAdmin(req: Request): boolean {
  const user = req.user as User | undefined;
  return user?.role === 'SuperAdmin';
}

// ===================================================================
// Route Registration
// ===================================================================

export function registerAIAdminRoutes(
  app: Express,
  requireAuth: (req: Request, res: Response, next: NextFunction) => void,
  requireRole: (roles: string[]) => (req: Request, res: Response, next: NextFunction) => void
) {
  // ===================================================================
  // Platform AI Defaults
  // ===================================================================

  /**
   * GET /api/admin/ai/defaults
   * List all platform default providers
   */
  app.get(
    '/api/admin/ai/defaults',
    requireAuth,
    requireRole(['SuperAdmin']),
    async (req: Request, res: Response) => {
      try {
        const defaults = await storage.getPlatformAiDefaults();

        // Mask API keys for security
        const safeDefaults = defaults.map(d => ({
          ...d,
          apiKeyEncrypted: undefined,
          maskedKey: d.apiKeyEncrypted ? maskApiKey(decryptApiKey(d.apiKeyEncrypted)) : null,
          hasKey: !!d.apiKeyEncrypted,
        }));

        return res.json({
          success: true,
          defaults: safeDefaults,
          encryptionConfigured: isEncryptionConfigured(),
        });
      } catch (error: any) {
        console.error('[AI Admin] Error getting platform defaults:', error);
        return res.status(500).json({
          success: false,
          error: safeErrorMessage(error, 'Failed to get platform defaults'),
        });
      }
    }
  );

  /**
   * POST /api/admin/ai/defaults/:provider
   * Add or update a platform default provider
   */
  app.post(
    '/api/admin/ai/defaults/:provider',
    requireAuth,
    requireRole(['SuperAdmin']),
    async (req: Request, res: Response) => {
      try {
        const { provider } = req.params;
        const validProviders = ['gemini', 'openai', 'anthropic', 'mistral', 'cohere', 'bedrock', 'azure_openai'];
        if (!validProviders.includes(provider)) {
          return res.status(400).json({
            success: false,
            error: `Invalid provider: ${provider}. Must be one of: ${validProviders.join(', ')}`,
          });
        }

        const parseResult = upsertPlatformDefaultSchema.safeParse(req.body);
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

        const result = await storage.upsertPlatformAiDefault({
          provider,
          apiKeyEncrypted,
          defaultModel: data.defaultModel,
          rateLimitFree: data.rateLimitFree,
          rateLimitPro: data.rateLimitPro,
          isEnabled: data.isEnabled,
        });

        return res.json({
          success: true,
          default: {
            id: result.id,
            provider: result.provider,
            defaultModel: result.defaultModel,
            rateLimitFree: result.rateLimitFree,
            rateLimitPro: result.rateLimitPro,
            isEnabled: result.isEnabled,
            hasKey: !!result.apiKeyEncrypted,
          },
        });
      } catch (error: any) {
        console.error('[AI Admin] Error upserting platform default:', error);
        return res.status(500).json({
          success: false,
          error: safeErrorMessage(error, 'Failed to update platform default'),
        });
      }
    }
  );

  /**
   * DELETE /api/admin/ai/defaults/:provider
   * Remove a platform default provider
   */
  app.delete(
    '/api/admin/ai/defaults/:provider',
    requireAuth,
    requireRole(['SuperAdmin']),
    async (req: Request, res: Response) => {
      try {
        const { provider } = req.params;
        const deleted = await storage.deletePlatformAiDefault(provider);

        return res.json({
          success: true,
          deleted,
        });
      } catch (error: any) {
        console.error('[AI Admin] Error deleting platform default:', error);
        return res.status(500).json({
          success: false,
          error: safeErrorMessage(error, 'Failed to delete platform default'),
        });
      }
    }
  );

  // ===================================================================
  // Platform Prompt Templates
  // ===================================================================

  /**
   * GET /api/admin/ai/templates
   * List all platform templates
   */
  app.get(
    '/api/admin/ai/templates',
    requireAuth,
    requireRole(['SuperAdmin']),
    async (req: Request, res: Response) => {
      try {
        const { category, isActive } = req.query;

        const templates = await storage.getPlatformPromptTemplates({
          category: category as string | undefined,
          isActive: isActive === 'true' ? true : isActive === 'false' ? false : undefined,
        });

        return res.json({
          success: true,
          templates,
        });
      } catch (error: any) {
        console.error('[AI Admin] Error getting platform templates:', error);
        return res.status(500).json({
          success: false,
          error: safeErrorMessage(error, 'Failed to get platform templates'),
        });
      }
    }
  );

  /**
   * GET /api/admin/ai/templates/:id
   * Get a platform template by ID
   */
  app.get(
    '/api/admin/ai/templates/:id',
    requireAuth,
    requireRole(['SuperAdmin']),
    async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        const template = await storage.getPlatformPromptTemplateById(id);

        if (!template) {
          return res.status(404).json({
            success: false,
            error: 'Template not found',
          });
        }

        return res.json({
          success: true,
          template,
        });
      } catch (error: any) {
        console.error('[AI Admin] Error getting platform template:', error);
        return res.status(500).json({
          success: false,
          error: safeErrorMessage(error, 'Failed to get platform template'),
        });
      }
    }
  );

  /**
   * POST /api/admin/ai/templates
   * Create a platform template
   */
  app.post(
    '/api/admin/ai/templates',
    requireAuth,
    requireRole(['SuperAdmin']),
    async (req: Request, res: Response) => {
      try {
        const parseResult = createPlatformTemplateSchema.safeParse(req.body);
        if (!parseResult.success) {
          return res.status(400).json({
            success: false,
            error: 'Invalid request body',
            details: parseResult.error.format(),
          });
        }

        const data = parseResult.data;

        const template = await storage.createPlatformPromptTemplate({
          slug: data.slug,
          name: data.name,
          description: data.description,
          category: data.category,
          templateContent: data.templateContent,
          systemPrompt: data.systemPrompt,
          variables: data.variables,
          defaultModel: data.defaultModel,
          defaultTemperature: data.defaultTemperature,
          maxTokens: data.maxTokens,
          outputFormat: data.outputFormat,
        });

        return res.status(201).json({
          success: true,
          template,
        });
      } catch (error: any) {
        console.error('[AI Admin] Error creating platform template:', error);

        // Check for unique constraint violation
        if (error.code === '23505') {
          return res.status(409).json({
            success: false,
            error: 'A template with this slug already exists',
          });
        }

        return res.status(500).json({
          success: false,
          error: safeErrorMessage(error, 'Failed to create platform template'),
        });
      }
    }
  );

  /**
   * PUT /api/admin/ai/templates/:id
   * Update a platform template
   */
  app.put(
    '/api/admin/ai/templates/:id',
    requireAuth,
    requireRole(['SuperAdmin']),
    async (req: Request, res: Response) => {
      try {
        const { id } = req.params;

        const parseResult = updatePlatformTemplateSchema.safeParse(req.body);
        if (!parseResult.success) {
          return res.status(400).json({
            success: false,
            error: 'Invalid request body',
            details: parseResult.error.format(),
          });
        }

        const template = await storage.updatePlatformPromptTemplate(id, parseResult.data);

        if (!template) {
          return res.status(404).json({
            success: false,
            error: 'Template not found',
          });
        }

        return res.json({
          success: true,
          template,
        });
      } catch (error: any) {
        console.error('[AI Admin] Error updating platform template:', error);
        return res.status(500).json({
          success: false,
          error: safeErrorMessage(error, 'Failed to update platform template'),
        });
      }
    }
  );

  /**
   * DELETE /api/admin/ai/templates/:id
   * Delete a platform template
   */
  app.delete(
    '/api/admin/ai/templates/:id',
    requireAuth,
    requireRole(['SuperAdmin']),
    async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        const deleted = await storage.deletePlatformPromptTemplate(id);

        if (!deleted) {
          return res.status(404).json({
            success: false,
            error: 'Template not found',
          });
        }

        return res.json({
          success: true,
          deleted: true,
        });
      } catch (error: any) {
        console.error('[AI Admin] Error deleting platform template:', error);
        return res.status(500).json({
          success: false,
          error: safeErrorMessage(error, 'Failed to delete platform template'),
        });
      }
    }
  );

  // ===================================================================
  // System Information
  // ===================================================================

  /**
   * GET /api/admin/ai/status
   * Get overall AI system status
   */
  app.get(
    '/api/admin/ai/status',
    requireAuth,
    requireRole(['SuperAdmin']),
    async (req: Request, res: Response) => {
      try {
        const registry = getProviderRegistry();
        const providerStatus = registry.getStatus();

        const platformDefaults = await storage.getPlatformAiDefaults();
        const platformTemplates = await storage.getPlatformPromptTemplates({ isActive: true });

        return res.json({
          success: true,
          status: {
            encryptionConfigured: isEncryptionConfigured(),
            providers: providerStatus.map(p => ({
              name: p.name,
              displayName: p.displayName,
              isAvailable: p.isAvailable,
              isDefault: p.isDefault,
              modelCount: p.models.length,
            })),
            platformDefaults: platformDefaults.map(d => ({
              provider: d.provider,
              hasKey: !!d.apiKeyEncrypted,
              isEnabled: d.isEnabled,
              rateLimits: {
                free: d.rateLimitFree,
                pro: d.rateLimitPro,
              },
            })),
            templateCount: platformTemplates.length,
            defaultProvider: registry.getDefaultName(),
          },
        });
      } catch (error: any) {
        console.error('[AI Admin] Error getting system status:', error);
        return res.status(500).json({
          success: false,
          error: safeErrorMessage(error, 'Failed to get system status'),
        });
      }
    }
  );
}
