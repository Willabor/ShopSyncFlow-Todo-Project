/**
 * AI Templates API Routes (Tenant Level)
 *
 * Endpoints for managing prompt templates - both platform defaults and
 * tenant customizations. Supports template CRUD, testing with sample data,
 * and version history.
 *
 * Authentication: All endpoints require authentication
 * Authorization:
 * - SuperAdmin, WarehouseManager: Full access (create, edit, delete)
 * - Editor: View templates, test templates
 * - Auditor: View templates only
 */

import { safeErrorMessage } from "../utils/safe-error";
import type { Express, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import type { User } from '@shared/schema';
import { storage } from '../storage';
import {
  listTemplates,
  getEffectiveTemplate,
  substituteVariables,
  extractVariables,
  validateVariables,
  createTenantTemplate,
  updateTenantTemplate,
  deleteTenantTemplate,
  duplicateTemplate,
  getTemplateVersionHistory,
  getTemplateCategories,
  type TemplateVariable,
} from '../services/ai/index.js';

// ===================================================================
// Request Validation Schemas
// ===================================================================

const variableSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['text', 'textarea', 'number', 'select', 'boolean']),
  required: z.boolean(),
  default: z.string().optional(),
  description: z.string().optional(),
  options: z.array(z.string()).optional(),
});

const createTemplateSchema = z.object({
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-_]+$/, 'Slug must be lowercase alphanumeric with hyphens/underscores'),
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  category: z.string().min(1).max(100),
  templateContent: z.string().min(1),
  systemPrompt: z.string().optional(),
  variables: z.array(variableSchema).optional(),
  parentTemplateId: z.string().optional(),
  preferredProvider: z.enum(['gemini', 'openai', 'anthropic', 'mistral']).optional(),
  preferredModel: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().positive().optional(),
  outputFormat: z.enum(['text', 'json', 'markdown', 'html']).optional(),
});

const updateTemplateSchema = createTemplateSchema.partial().extend({
  isActive: z.boolean().optional(),
});

const testTemplateSchema = z.object({
  templateContent: z.string().min(1),
  variables: z.record(z.union([z.string(), z.number(), z.boolean()])),
  variableDefinitions: z.array(variableSchema).optional(),
});

const listTemplatesQuerySchema = z.object({
  category: z.string().optional(),
  source: z.enum(['platform', 'tenant', 'all']).optional(),
  query: z.string().optional(),
  activeOnly: z.string().transform(val => val === 'true').optional(),
  limit: z.string().transform(val => parseInt(val, 10) || 50).optional(),
  offset: z.string().transform(val => parseInt(val, 10) || 0).optional(),
});

// ===================================================================
// Helper Functions
// ===================================================================

function getTenantId(req: Request): string | null {
  const user = req.user as User | undefined;
  return user?.tenantId || null;
}

function getUserId(req: Request): string | null {
  const user = req.user as User | undefined;
  return user?.id || null;
}

// ===================================================================
// Route Registration
// ===================================================================

export function registerAITemplatesRoutes(
  app: Express,
  requireAuth: (req: Request, res: Response, next: NextFunction) => void,
  requireRole: (roles: string[]) => (req: Request, res: Response, next: NextFunction) => void
) {
  // ===================================================================
  // Template Listing & Search
  // ===================================================================

  /**
   * GET /api/ai/templates
   * List all templates (platform + tenant)
   */
  app.get(
    '/api/ai/templates',
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const tenantId = getTenantId(req);
        if (!tenantId) {
          return res.status(401).json({ success: false, error: 'No tenant context' });
        }

        const parseResult = listTemplatesQuerySchema.safeParse(req.query);
        if (!parseResult.success) {
          return res.status(400).json({
            success: false,
            error: 'Invalid query parameters',
            details: parseResult.error.format(),
          });
        }

        const options = parseResult.data;
        const templates = await listTemplates(tenantId, {
          category: options.category,
          source: options.source as any,
          query: options.query,
          activeOnly: options.activeOnly ?? true,
          limit: options.limit,
          offset: options.offset,
        });

        return res.json({
          success: true,
          templates,
          total: templates.length,
        });
      } catch (error: any) {
        console.error('[AI Templates] Error listing templates:', error);
        return res.status(500).json({
          success: false,
          error: safeErrorMessage(error, 'Failed to list templates'),
        });
      }
    }
  );

  /**
   * GET /api/ai/templates/categories
   * Get all available template categories
   */
  app.get(
    '/api/ai/templates/categories',
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const categories = await getTemplateCategories();
        return res.json({
          success: true,
          categories,
        });
      } catch (error: any) {
        console.error('[AI Templates] Error getting categories:', error);
        return res.status(500).json({
          success: false,
          error: safeErrorMessage(error, 'Failed to get categories'),
        });
      }
    }
  );

  /**
   * GET /api/ai/templates/:slug
   * Get effective template for a slug/feature (resolved)
   */
  app.get(
    '/api/ai/templates/:slug',
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const tenantId = getTenantId(req);
        if (!tenantId) {
          return res.status(401).json({ success: false, error: 'No tenant context' });
        }

        const { slug } = req.params;
        const template = await getEffectiveTemplate(tenantId, slug);

        if (!template) {
          return res.status(404).json({
            success: false,
            error: `Template not found: ${slug}`,
          });
        }

        return res.json({
          success: true,
          template,
        });
      } catch (error: any) {
        console.error('[AI Templates] Error getting template:', error);
        return res.status(500).json({
          success: false,
          error: safeErrorMessage(error, 'Failed to get template'),
        });
      }
    }
  );

  // ===================================================================
  // Template CRUD
  // ===================================================================

  /**
   * POST /api/ai/templates
   * Create a new tenant template
   */
  app.post(
    '/api/ai/templates',
    requireAuth,
    requireRole(['SuperAdmin', 'WarehouseManager']),
    async (req: Request, res: Response) => {
      try {
        const tenantId = getTenantId(req);
        const userId = getUserId(req);
        if (!tenantId) {
          return res.status(401).json({ success: false, error: 'No tenant context' });
        }

        const parseResult = createTemplateSchema.safeParse(req.body);
        if (!parseResult.success) {
          return res.status(400).json({
            success: false,
            error: 'Invalid request body',
            details: parseResult.error.format(),
          });
        }

        const data = parseResult.data;

        // Extract variables from template if not provided
        let variables = data.variables as TemplateVariable[] | undefined;
        if (!variables || variables.length === 0) {
          const extractedVars = extractVariables(data.templateContent);
          variables = extractedVars.map(name => ({
            name,
            type: 'text' as const,
            required: false,
          }));
        }

        const template = await createTenantTemplate(tenantId, {
          slug: data.slug,
          name: data.name,
          description: data.description,
          category: data.category,
          templateContent: data.templateContent,
          systemPrompt: data.systemPrompt,
          variables,
          parentTemplateId: data.parentTemplateId,
          preferredProvider: data.preferredProvider,
          preferredModel: data.preferredModel,
          temperature: data.temperature,
          maxTokens: data.maxTokens,
          outputFormat: data.outputFormat,
          createdBy: userId || undefined,
        });

        return res.status(201).json({
          success: true,
          template,
        });
      } catch (error: any) {
        console.error('[AI Templates] Error creating template:', error);

        // Check for unique constraint violation
        if (error.code === '23505') {
          return res.status(409).json({
            success: false,
            error: 'A template with this slug already exists',
          });
        }

        return res.status(500).json({
          success: false,
          error: safeErrorMessage(error, 'Failed to create template'),
        });
      }
    }
  );

  /**
   * PUT /api/ai/templates/:id
   * Update a tenant template
   */
  app.put(
    '/api/ai/templates/:id',
    requireAuth,
    requireRole(['SuperAdmin', 'WarehouseManager']),
    async (req: Request, res: Response) => {
      try {
        const tenantId = getTenantId(req);
        const userId = getUserId(req);
        if (!tenantId) {
          return res.status(401).json({ success: false, error: 'No tenant context' });
        }

        const { id } = req.params;

        const parseResult = updateTemplateSchema.safeParse(req.body);
        if (!parseResult.success) {
          return res.status(400).json({
            success: false,
            error: 'Invalid request body',
            details: parseResult.error.format(),
          });
        }

        const data = parseResult.data;

        // Check if template content changed (requires version increment)
        const incrementVersion = !!data.templateContent;

        const template = await updateTenantTemplate(
          id,
          tenantId,
          {
            name: data.name,
            description: data.description,
            category: data.category,
            templateContent: data.templateContent,
            systemPrompt: data.systemPrompt,
            variables: data.variables as TemplateVariable[],
            preferredProvider: data.preferredProvider,
            preferredModel: data.preferredModel,
            temperature: data.temperature,
            maxTokens: data.maxTokens,
            outputFormat: data.outputFormat,
            isActive: data.isActive,
          },
          {
            incrementVersion,
            changeSummary: req.body.changeSummary,
            changedBy: userId || undefined,
          }
        );

        return res.json({
          success: true,
          template,
        });
      } catch (error: any) {
        console.error('[AI Templates] Error updating template:', error);

        if (error.code === 'NOT_FOUND') {
          return res.status(404).json({
            success: false,
            error: safeErrorMessage(error),
          });
        }

        return res.status(500).json({
          success: false,
          error: safeErrorMessage(error, 'Failed to update template'),
        });
      }
    }
  );

  /**
   * DELETE /api/ai/templates/:id
   * Delete a tenant template
   */
  app.delete(
    '/api/ai/templates/:id',
    requireAuth,
    requireRole(['SuperAdmin', 'WarehouseManager']),
    async (req: Request, res: Response) => {
      try {
        const tenantId = getTenantId(req);
        if (!tenantId) {
          return res.status(401).json({ success: false, error: 'No tenant context' });
        }

        const { id } = req.params;
        const deleted = await deleteTenantTemplate(id, tenantId);

        if (!deleted) {
          return res.status(404).json({
            success: false,
            error: 'Template not found or already deleted',
          });
        }

        return res.json({
          success: true,
          deleted: true,
        });
      } catch (error: any) {
        console.error('[AI Templates] Error deleting template:', error);
        return res.status(500).json({
          success: false,
          error: safeErrorMessage(error, 'Failed to delete template'),
        });
      }
    }
  );

  // ===================================================================
  // Template Operations
  // ===================================================================

  /**
   * POST /api/ai/templates/:id/duplicate
   * Duplicate a template (platform or tenant)
   */
  app.post(
    '/api/ai/templates/:id/duplicate',
    requireAuth,
    requireRole(['SuperAdmin', 'WarehouseManager']),
    async (req: Request, res: Response) => {
      try {
        const tenantId = getTenantId(req);
        const userId = getUserId(req);
        if (!tenantId) {
          return res.status(401).json({ success: false, error: 'No tenant context' });
        }

        const { id } = req.params;
        const { sourceType, newSlug, newName } = req.body;

        if (!sourceType || !['platform', 'tenant'].includes(sourceType)) {
          return res.status(400).json({
            success: false,
            error: 'sourceType must be "platform" or "tenant"',
          });
        }

        const template = await duplicateTemplate(
          id,
          sourceType as 'platform' | 'tenant',
          tenantId,
          {
            newSlug,
            newName,
            createdBy: userId || undefined,
          }
        );

        return res.status(201).json({
          success: true,
          template,
        });
      } catch (error: any) {
        console.error('[AI Templates] Error duplicating template:', error);

        if (error.code === 'NOT_FOUND') {
          return res.status(404).json({
            success: false,
            error: safeErrorMessage(error),
          });
        }

        return res.status(500).json({
          success: false,
          error: safeErrorMessage(error, 'Failed to duplicate template'),
        });
      }
    }
  );

  /**
   * POST /api/ai/templates/test
   * Test a template with sample data (preview)
   */
  app.post(
    '/api/ai/templates/test',
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const parseResult = testTemplateSchema.safeParse(req.body);
        if (!parseResult.success) {
          return res.status(400).json({
            success: false,
            error: 'Invalid request body',
            details: parseResult.error.format(),
          });
        }

        const { templateContent, variables, variableDefinitions } = parseResult.data;

        // Validate variables if definitions provided
        if (variableDefinitions && variableDefinitions.length > 0) {
          const validation = validateVariables(
            variables,
            variableDefinitions as TemplateVariable[]
          );
          if (!validation.valid) {
            return res.status(400).json({
              success: false,
              error: 'Variable validation failed',
              missing: validation.missing,
              errors: validation.errors,
            });
          }
        }

        // Substitute variables
        const result = substituteVariables(
          templateContent,
          variables,
          variableDefinitions as TemplateVariable[]
        );

        return res.json({
          success: true,
          result: {
            content: result.content,
            missingVariables: result.missingVariables,
            usedVariables: result.usedVariables,
            estimatedTokens: result.estimatedTokens,
          },
        });
      } catch (error: any) {
        console.error('[AI Templates] Error testing template:', error);
        return res.status(500).json({
          success: false,
          error: safeErrorMessage(error, 'Failed to test template'),
        });
      }
    }
  );

  /**
   * GET /api/ai/templates/:id/versions
   * Get version history for a template
   */
  app.get(
    '/api/ai/templates/:id/versions',
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        const versions = await getTemplateVersionHistory(id);

        return res.json({
          success: true,
          versions,
        });
      } catch (error: any) {
        console.error('[AI Templates] Error getting version history:', error);
        return res.status(500).json({
          success: false,
          error: safeErrorMessage(error, 'Failed to get version history'),
        });
      }
    }
  );

  /**
   * POST /api/ai/templates/extract-variables
   * Extract variables from template content
   */
  app.post(
    '/api/ai/templates/extract-variables',
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const { templateContent } = req.body;

        if (!templateContent || typeof templateContent !== 'string') {
          return res.status(400).json({
            success: false,
            error: 'templateContent is required',
          });
        }

        const variables = extractVariables(templateContent);

        return res.json({
          success: true,
          variables,
        });
      } catch (error: any) {
        console.error('[AI Templates] Error extracting variables:', error);
        return res.status(500).json({
          success: false,
          error: safeErrorMessage(error, 'Failed to extract variables'),
        });
      }
    }
  );
}
