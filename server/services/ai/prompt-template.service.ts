/**
 * Prompt Template Service
 *
 * Handles template resolution, variable substitution, and template management.
 * Implements the 3-level template hierarchy:
 * - Level 1: Platform defaults (immutable by tenants)
 * - Level 2: Tenant customizations (override or extend)
 * - Level 3: User favorites (personal shortcuts)
 *
 * Variable Syntax (Jinja2-style):
 * - {{variable_name}} - Simple variable
 * - {{variable | default("x")}} - With default value
 * - {{variable | upper}} - With filter (limited support)
 *
 * Related Files:
 * - shared/schema.ts - Template table schemas
 * - ./ai-client-factory.ts - Uses templates for content generation
 */

import { db } from '../../db.js';
import {
  platformPromptTemplates,
  tenantPromptTemplates,
  tenantPromptTemplateVersions,
  tenantFeatureTemplates,
  userSavedTemplates,
} from '@shared/schema';
import { eq, and, or, desc, sql, ilike } from 'drizzle-orm';
import type { AIFeature } from './ai-client-factory.js';

// ===================================================================
// Types
// ===================================================================

/**
 * Template variable definition
 */
export interface TemplateVariable {
  /** Variable name (without braces) */
  name: string;
  /** Variable type for UI */
  type: 'text' | 'textarea' | 'number' | 'select' | 'boolean';
  /** Whether the variable is required */
  required: boolean;
  /** Default value */
  default?: string;
  /** Human-readable description */
  description?: string;
  /** Options for select type */
  options?: string[];
}

/**
 * Resolved template with all metadata
 */
export interface ResolvedTemplate {
  /** Template ID */
  id: string;
  /** Template slug */
  slug: string;
  /** Template name */
  name: string;
  /** Template description */
  description: string | null;
  /** Template category */
  category: string;
  /** Template content (with variables) */
  templateContent: string;
  /** System prompt */
  systemPrompt: string | null;
  /** Variable definitions */
  variables: TemplateVariable[];
  /** Source type */
  source: 'platform' | 'tenant';
  /** Parent platform template ID (for tenant overrides) */
  parentTemplateId: string | null;
  /** AI settings */
  aiSettings: {
    preferredProvider?: string;
    preferredModel?: string;
    temperature?: number;
    maxTokens?: number;
    outputFormat?: string;
  };
  /** Template version */
  version: string;
  /** Usage count */
  usageCount: number;
  /** Whether the template is active */
  isActive: boolean;
}

/**
 * Options for template search
 */
export interface TemplateSearchOptions {
  /** Filter by category */
  category?: string;
  /** Filter by source */
  source?: 'platform' | 'tenant' | 'all';
  /** Search query (matches name, description, slug) */
  query?: string;
  /** Only active templates */
  activeOnly?: boolean;
  /** Maximum results */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
}

/**
 * Result of template variable substitution
 */
export interface SubstitutionResult {
  /** Rendered content with variables replaced */
  content: string;
  /** Variables that were missing (not provided and no default) */
  missingVariables: string[];
  /** Variables that were used */
  usedVariables: string[];
  /** Estimated token count */
  estimatedTokens: number;
}

/**
 * Error thrown for template-related issues
 */
export class TemplateError extends Error {
  constructor(
    message: string,
    public readonly code: 'NOT_FOUND' | 'INVALID' | 'MISSING_VARIABLES' | 'PARSE_ERROR'
  ) {
    super(message);
    this.name = 'TemplateError';
  }
}

// ===================================================================
// Template Resolution
// ===================================================================

/**
 * Gets the effective template for a tenant and feature/slug.
 *
 * Resolution order:
 * 1. Check tenant's feature-specific template assignment
 * 2. Check tenant's custom template by slug
 * 3. Fall back to platform default by slug
 *
 * @param tenantId - The tenant ID
 * @param featureOrSlug - Feature name (e.g., 'product_description') or template slug
 * @returns The resolved template or null if not found
 */
export async function getEffectiveTemplate(
  tenantId: string,
  featureOrSlug: string
): Promise<ResolvedTemplate | null> {
  // First check if there's a feature-specific assignment
  const featureAssignment = await db
    .select()
    .from(tenantFeatureTemplates)
    .where(
      and(
        eq(tenantFeatureTemplates.tenantId, tenantId),
        eq(tenantFeatureTemplates.feature, featureOrSlug)
      )
    )
    .limit(1);

  if (featureAssignment.length > 0) {
    const assignment = featureAssignment[0];

    // If using platform default, get platform template
    if (assignment.usePlatformDefault || !assignment.templateId) {
      return getPlatformTemplateBySlug(featureOrSlug);
    }

    // Get the assigned tenant template
    const tenantTemplate = await getTenantTemplateById(assignment.templateId);
    if (tenantTemplate) {
      return tenantTemplate;
    }
  }

  // Check for tenant's custom template by slug
  const tenantTemplate = await getTenantTemplateBySlug(tenantId, featureOrSlug);
  if (tenantTemplate) {
    return tenantTemplate;
  }

  // Fall back to platform default
  return getPlatformTemplateBySlug(featureOrSlug);
}

/**
 * Gets a platform template by slug
 */
export async function getPlatformTemplateBySlug(slug: string): Promise<ResolvedTemplate | null> {
  const templates = await db
    .select()
    .from(platformPromptTemplates)
    .where(
      and(
        eq(platformPromptTemplates.slug, slug),
        eq(platformPromptTemplates.isActive, true)
      )
    )
    .limit(1);

  if (templates.length === 0) {
    return null;
  }

  const t = templates[0];
  return {
    id: t.id,
    slug: t.slug,
    name: t.name,
    description: t.description,
    category: t.category,
    templateContent: t.templateContent,
    systemPrompt: t.systemPrompt,
    variables: (t.variables as TemplateVariable[]) || [],
    source: 'platform',
    parentTemplateId: null,
    aiSettings: {
      preferredModel: t.defaultModel || undefined,
      temperature: t.defaultTemperature ? parseFloat(t.defaultTemperature) : undefined,
      maxTokens: t.maxTokens || undefined,
      outputFormat: t.outputFormat || undefined,
    },
    version: t.version || '1.0.0',
    usageCount: 0, // Platform templates don't track usage
    isActive: t.isActive,
  };
}

/**
 * Gets a tenant template by slug
 */
export async function getTenantTemplateBySlug(
  tenantId: string,
  slug: string
): Promise<ResolvedTemplate | null> {
  const templates = await db
    .select()
    .from(tenantPromptTemplates)
    .where(
      and(
        eq(tenantPromptTemplates.tenantId, tenantId),
        eq(tenantPromptTemplates.slug, slug),
        eq(tenantPromptTemplates.isActive, true)
      )
    )
    .limit(1);

  if (templates.length === 0) {
    return null;
  }

  return mapTenantTemplate(templates[0]);
}

/**
 * Gets a tenant template by ID
 */
export async function getTenantTemplateById(
  templateId: string
): Promise<ResolvedTemplate | null> {
  const templates = await db
    .select()
    .from(tenantPromptTemplates)
    .where(eq(tenantPromptTemplates.id, templateId))
    .limit(1);

  if (templates.length === 0) {
    return null;
  }

  return mapTenantTemplate(templates[0]);
}

/**
 * Maps a database tenant template to ResolvedTemplate
 */
function mapTenantTemplate(t: typeof tenantPromptTemplates.$inferSelect): ResolvedTemplate {
  return {
    id: t.id,
    slug: t.slug,
    name: t.name,
    description: t.description,
    category: t.category,
    templateContent: t.templateContent,
    systemPrompt: t.systemPrompt,
    variables: (t.variables as TemplateVariable[]) || [],
    source: 'tenant',
    parentTemplateId: t.parentTemplateId,
    aiSettings: {
      preferredProvider: t.preferredProvider || undefined,
      preferredModel: t.preferredModel || undefined,
      temperature: t.temperature ? parseFloat(t.temperature) : undefined,
      maxTokens: t.maxTokens || undefined,
      outputFormat: t.outputFormat || undefined,
    },
    version: t.version || '1.0.0',
    usageCount: t.usageCount,
    isActive: t.isActive,
  };
}

// ===================================================================
// Template Search & Listing
// ===================================================================

/**
 * Lists all templates available to a tenant (platform + tenant templates)
 */
export async function listTemplates(
  tenantId: string,
  options: TemplateSearchOptions = {}
): Promise<ResolvedTemplate[]> {
  const {
    category,
    source = 'all',
    query,
    activeOnly = true,
    limit = 50,
    offset = 0,
  } = options;

  const results: ResolvedTemplate[] = [];

  // Get platform templates
  if (source === 'all' || source === 'platform') {
    let platformQuery = db
      .select()
      .from(platformPromptTemplates);

    // Build conditions
    const platformConditions = [];
    if (activeOnly) {
      platformConditions.push(eq(platformPromptTemplates.isActive, true));
    }
    if (category) {
      platformConditions.push(eq(platformPromptTemplates.category, category));
    }
    if (query) {
      platformConditions.push(
        or(
          ilike(platformPromptTemplates.name, `%${query}%`),
          ilike(platformPromptTemplates.description, `%${query}%`),
          ilike(platformPromptTemplates.slug, `%${query}%`)
        )
      );
    }

    if (platformConditions.length > 0) {
      platformQuery = platformQuery.where(and(...platformConditions)) as any;
    }

    const platformTemplates = await platformQuery;

    for (const t of platformTemplates) {
      results.push({
        id: t.id,
        slug: t.slug,
        name: t.name,
        description: t.description,
        category: t.category,
        templateContent: t.templateContent,
        systemPrompt: t.systemPrompt,
        variables: (t.variables as TemplateVariable[]) || [],
        source: 'platform',
        parentTemplateId: null,
        aiSettings: {
          preferredModel: t.defaultModel || undefined,
          temperature: t.defaultTemperature ? parseFloat(t.defaultTemperature) : undefined,
          maxTokens: t.maxTokens || undefined,
          outputFormat: t.outputFormat || undefined,
        },
        version: t.version || '1.0.0',
        usageCount: 0,
        isActive: t.isActive,
      });
    }
  }

  // Get tenant templates
  if (source === 'all' || source === 'tenant') {
    const tenantConditions = [eq(tenantPromptTemplates.tenantId, tenantId)];
    if (activeOnly) {
      tenantConditions.push(eq(tenantPromptTemplates.isActive, true));
    }
    if (category) {
      tenantConditions.push(eq(tenantPromptTemplates.category, category));
    }
    if (query) {
      tenantConditions.push(
        or(
          ilike(tenantPromptTemplates.name, `%${query}%`),
          ilike(tenantPromptTemplates.description, `%${query}%`),
          ilike(tenantPromptTemplates.slug, `%${query}%`)
        )!
      );
    }

    const tenantTemplates = await db
      .select()
      .from(tenantPromptTemplates)
      .where(and(...tenantConditions));

    for (const t of tenantTemplates) {
      results.push(mapTenantTemplate(t));
    }
  }

  // Sort by name and apply pagination
  results.sort((a, b) => a.name.localeCompare(b.name));

  return results.slice(offset, offset + limit);
}

/**
 * Gets all available template categories
 */
export async function getTemplateCategories(): Promise<string[]> {
  const platformCategories = await db
    .selectDistinct({ category: platformPromptTemplates.category })
    .from(platformPromptTemplates)
    .where(eq(platformPromptTemplates.isActive, true));

  return platformCategories.map(c => c.category).sort();
}

// ===================================================================
// Variable Substitution
// ===================================================================

/**
 * Substitutes variables in a template with provided values.
 *
 * Supports Jinja2-style syntax:
 * - {{variable_name}} - Simple variable
 * - {{variable | default("x")}} - With default value
 *
 * @param templateContent - The template content with variables
 * @param variables - Map of variable names to values
 * @param variableDefinitions - Optional variable definitions for validation
 * @returns SubstitutionResult with rendered content
 */
export function substituteVariables(
  templateContent: string,
  variables: Record<string, string | number | boolean>,
  variableDefinitions: TemplateVariable[] = []
): SubstitutionResult {
  let content = templateContent;
  const missingVariables: string[] = [];
  const usedVariables: string[] = [];

  // Create a map of variable defaults from definitions
  const defaults = new Map<string, string>();
  for (const def of variableDefinitions) {
    if (def.default !== undefined) {
      defaults.set(def.name, def.default);
    }
  }

  // Pattern: {{variable_name}} or {{variable_name | filter("value")}}
  const variablePattern = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:\|\s*([a-zA-Z_]+)\s*(?:\(\s*["']([^"']*?)["']\s*\))?)?\s*\}\}/g;

  content = content.replace(variablePattern, (match, varName, filter, filterArg) => {
    // Check if variable was provided
    if (varName in variables) {
      usedVariables.push(varName);
      const value = String(variables[varName]);
      return applyFilter(value, filter);
    }

    // Check for default from filter
    if (filter === 'default' && filterArg !== undefined) {
      usedVariables.push(varName);
      return filterArg;
    }

    // Check for default from variable definition
    if (defaults.has(varName)) {
      usedVariables.push(varName);
      return applyFilter(defaults.get(varName)!, filter);
    }

    // Variable is missing
    missingVariables.push(varName);
    return match; // Keep original placeholder
  });

  // Estimate token count (rough approximation: ~4 chars per token)
  const estimatedTokens = Math.ceil(content.length / 4);

  return {
    content,
    missingVariables: [...new Set(missingVariables)],
    usedVariables: [...new Set(usedVariables)],
    estimatedTokens,
  };
}

/**
 * Applies a filter to a value (limited Jinja2 filter support)
 */
function applyFilter(value: string, filter?: string): string {
  if (!filter) return value;

  switch (filter.toLowerCase()) {
    case 'upper':
      return value.toUpperCase();
    case 'lower':
      return value.toLowerCase();
    case 'capitalize':
      return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
    case 'title':
      return value.replace(/\b\w/g, c => c.toUpperCase());
    case 'trim':
      return value.trim();
    case 'default':
      // Default filter is handled in the main substitution logic
      return value;
    default:
      // Unknown filter, return value unchanged
      return value;
  }
}

/**
 * Extracts variable names from a template
 */
export function extractVariables(templateContent: string): string[] {
  const variablePattern = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:\|[^}]*)?\s*\}\}/g;
  const variables: Set<string> = new Set();

  let match;
  while ((match = variablePattern.exec(templateContent)) !== null) {
    variables.add(match[1]);
  }

  return Array.from(variables);
}

/**
 * Validates that all required variables are provided
 */
export function validateVariables(
  variables: Record<string, string | number | boolean>,
  definitions: TemplateVariable[]
): { valid: boolean; missing: string[]; errors: string[] } {
  const missing: string[] = [];
  const errors: string[] = [];

  for (const def of definitions) {
    if (def.required && !(def.name in variables)) {
      // Check if there's a default
      if (def.default === undefined) {
        missing.push(def.name);
        errors.push(`Required variable "${def.name}" is missing`);
      }
    }

    // Type validation
    if (def.name in variables) {
      const value = variables[def.name];
      if (def.type === 'number' && typeof value !== 'number' && isNaN(Number(value))) {
        errors.push(`Variable "${def.name}" must be a number`);
      }
      if (def.type === 'boolean' && typeof value !== 'boolean') {
        errors.push(`Variable "${def.name}" must be a boolean`);
      }
      if (def.type === 'select' && def.options && !def.options.includes(String(value))) {
        errors.push(`Variable "${def.name}" must be one of: ${def.options.join(', ')}`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    missing,
    errors,
  };
}

// ===================================================================
// Template Management
// ===================================================================

/**
 * Creates a new tenant template
 */
export async function createTenantTemplate(
  tenantId: string,
  data: {
    slug: string;
    name: string;
    description?: string;
    category: string;
    templateContent: string;
    systemPrompt?: string;
    variables?: TemplateVariable[];
    parentTemplateId?: string;
    preferredProvider?: string;
    preferredModel?: string;
    temperature?: number;
    maxTokens?: number;
    outputFormat?: string;
    createdBy?: string;
  }
): Promise<ResolvedTemplate> {
  const result = await db
    .insert(tenantPromptTemplates)
    .values({
      tenantId,
      slug: data.slug,
      name: data.name,
      description: data.description,
      category: data.category,
      templateContent: data.templateContent,
      systemPrompt: data.systemPrompt,
      variables: data.variables || [],
      parentTemplateId: data.parentTemplateId,
      preferredProvider: data.preferredProvider,
      preferredModel: data.preferredModel,
      temperature: data.temperature?.toString(),
      maxTokens: data.maxTokens,
      outputFormat: data.outputFormat,
      createdBy: data.createdBy,
    })
    .returning();

  return mapTenantTemplate(result[0]);
}

/**
 * Updates a tenant template and creates a version history entry
 */
export async function updateTenantTemplate(
  templateId: string,
  tenantId: string,
  data: Partial<{
    name: string;
    description: string;
    category: string;
    templateContent: string;
    systemPrompt: string;
    variables: TemplateVariable[];
    preferredProvider: string;
    preferredModel: string;
    temperature: number;
    maxTokens: number;
    outputFormat: string;
    isActive: boolean;
  }>,
  options?: {
    changeSummary?: string;
    changedBy?: string;
    incrementVersion?: boolean;
  }
): Promise<ResolvedTemplate> {
  // Get current template
  const current = await db
    .select()
    .from(tenantPromptTemplates)
    .where(
      and(
        eq(tenantPromptTemplates.id, templateId),
        eq(tenantPromptTemplates.tenantId, tenantId)
      )
    )
    .limit(1);

  if (current.length === 0) {
    throw new TemplateError(`Template not found: ${templateId}`, 'NOT_FOUND');
  }

  const template = current[0];

  // Create version history entry if content changed
  if (options?.incrementVersion && data.templateContent) {
    const newVersion = incrementVersion(template.version || '1.0.0');

    await db.insert(tenantPromptTemplateVersions).values({
      templateId,
      version: template.version || '1.0.0',
      templateContent: template.templateContent,
      systemPrompt: template.systemPrompt,
      variables: template.variables,
      changeSummary: options?.changeSummary,
      changedBy: options?.changedBy,
    });

    data = { ...data } as any;
    (data as any).version = newVersion;
  }

  // Update template
  const updateData: Record<string, any> = {
    updatedAt: new Date(),
  };

  if (data.name !== undefined) updateData.name = data.name;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.category !== undefined) updateData.category = data.category;
  if (data.templateContent !== undefined) updateData.templateContent = data.templateContent;
  if (data.systemPrompt !== undefined) updateData.systemPrompt = data.systemPrompt;
  if (data.variables !== undefined) updateData.variables = data.variables;
  if (data.preferredProvider !== undefined) updateData.preferredProvider = data.preferredProvider;
  if (data.preferredModel !== undefined) updateData.preferredModel = data.preferredModel;
  if (data.temperature !== undefined) updateData.temperature = data.temperature.toString();
  if (data.maxTokens !== undefined) updateData.maxTokens = data.maxTokens;
  if (data.outputFormat !== undefined) updateData.outputFormat = data.outputFormat;
  if (data.isActive !== undefined) updateData.isActive = data.isActive;
  if ((data as any).version !== undefined) updateData.version = (data as any).version;

  const result = await db
    .update(tenantPromptTemplates)
    .set(updateData)
    .where(
      and(
        eq(tenantPromptTemplates.id, templateId),
        eq(tenantPromptTemplates.tenantId, tenantId)
      )
    )
    .returning();

  return mapTenantTemplate(result[0]);
}

/**
 * Deletes a tenant template
 */
export async function deleteTenantTemplate(
  templateId: string,
  tenantId: string
): Promise<boolean> {
  const result = await db
    .delete(tenantPromptTemplates)
    .where(
      and(
        eq(tenantPromptTemplates.id, templateId),
        eq(tenantPromptTemplates.tenantId, tenantId)
      )
    )
    .returning({ id: tenantPromptTemplates.id });

  return result.length > 0;
}

/**
 * Increments usage count for a template
 */
export async function incrementTemplateUsage(
  templateId: string,
  source: 'platform' | 'tenant'
): Promise<void> {
  if (source === 'tenant') {
    await db
      .update(tenantPromptTemplates)
      .set({
        usageCount: sql`${tenantPromptTemplates.usageCount} + 1`,
      })
      .where(eq(tenantPromptTemplates.id, templateId));
  }
  // Platform templates don't track usage count
}

/**
 * Gets version history for a template
 */
export async function getTemplateVersionHistory(
  templateId: string
): Promise<Array<{
  version: string;
  templateContent: string;
  systemPrompt: string | null;
  changeSummary: string | null;
  changedBy: string | null;
  createdAt: Date;
}>> {
  const versions = await db
    .select({
      version: tenantPromptTemplateVersions.version,
      templateContent: tenantPromptTemplateVersions.templateContent,
      systemPrompt: tenantPromptTemplateVersions.systemPrompt,
      changeSummary: tenantPromptTemplateVersions.changeSummary,
      changedBy: tenantPromptTemplateVersions.changedBy,
      createdAt: tenantPromptTemplateVersions.createdAt,
    })
    .from(tenantPromptTemplateVersions)
    .where(eq(tenantPromptTemplateVersions.templateId, templateId))
    .orderBy(desc(tenantPromptTemplateVersions.createdAt));

  return versions;
}

/**
 * Duplicates a template (platform or tenant) for a tenant
 */
export async function duplicateTemplate(
  sourceId: string,
  sourceType: 'platform' | 'tenant',
  tenantId: string,
  options?: {
    newSlug?: string;
    newName?: string;
    createdBy?: string;
  }
): Promise<ResolvedTemplate> {
  let sourceTemplate: ResolvedTemplate | null;

  if (sourceType === 'platform') {
    const templates = await db
      .select()
      .from(platformPromptTemplates)
      .where(eq(platformPromptTemplates.id, sourceId))
      .limit(1);

    if (templates.length === 0) {
      throw new TemplateError(`Platform template not found: ${sourceId}`, 'NOT_FOUND');
    }

    const t = templates[0];
    sourceTemplate = {
      id: t.id,
      slug: t.slug,
      name: t.name,
      description: t.description,
      category: t.category,
      templateContent: t.templateContent,
      systemPrompt: t.systemPrompt,
      variables: (t.variables as TemplateVariable[]) || [],
      source: 'platform',
      parentTemplateId: null,
      aiSettings: {
        preferredModel: t.defaultModel || undefined,
        temperature: t.defaultTemperature ? parseFloat(t.defaultTemperature) : undefined,
        maxTokens: t.maxTokens || undefined,
        outputFormat: t.outputFormat || undefined,
      },
      version: '1.0.0',
      usageCount: 0,
      isActive: true,
    };
  } else {
    sourceTemplate = await getTenantTemplateById(sourceId);
    if (!sourceTemplate) {
      throw new TemplateError(`Tenant template not found: ${sourceId}`, 'NOT_FOUND');
    }
  }

  // Create duplicate
  return createTenantTemplate(tenantId, {
    slug: options?.newSlug || `${sourceTemplate.slug}-copy`,
    name: options?.newName || `${sourceTemplate.name} (Copy)`,
    description: sourceTemplate.description || undefined,
    category: sourceTemplate.category,
    templateContent: sourceTemplate.templateContent,
    systemPrompt: sourceTemplate.systemPrompt || undefined,
    variables: sourceTemplate.variables,
    parentTemplateId: sourceType === 'platform' ? sourceId : sourceTemplate.parentTemplateId || undefined,
    preferredProvider: sourceTemplate.aiSettings.preferredProvider,
    preferredModel: sourceTemplate.aiSettings.preferredModel,
    temperature: sourceTemplate.aiSettings.temperature,
    maxTokens: sourceTemplate.aiSettings.maxTokens,
    outputFormat: sourceTemplate.aiSettings.outputFormat,
    createdBy: options?.createdBy,
  });
}

// ===================================================================
// Utility Functions
// ===================================================================

/**
 * Increments a semver version string
 */
function incrementVersion(version: string): string {
  const parts = version.split('.');
  if (parts.length !== 3) {
    return '1.0.1';
  }

  const patch = parseInt(parts[2], 10) || 0;
  return `${parts[0]}.${parts[1]}.${patch + 1}`;
}

/**
 * Renders a template with variables and returns ready-to-use prompt
 */
export async function renderTemplate(
  tenantId: string,
  featureOrSlug: string,
  variables: Record<string, string | number | boolean>
): Promise<{
  prompt: string;
  systemPrompt: string | null;
  template: ResolvedTemplate;
  substitutionResult: SubstitutionResult;
}> {
  const template = await getEffectiveTemplate(tenantId, featureOrSlug);

  if (!template) {
    throw new TemplateError(
      `No template found for feature/slug: ${featureOrSlug}`,
      'NOT_FOUND'
    );
  }

  // Validate required variables
  const validation = validateVariables(variables, template.variables);
  if (!validation.valid) {
    throw new TemplateError(
      `Invalid variables: ${validation.errors.join(', ')}`,
      'MISSING_VARIABLES'
    );
  }

  // Substitute variables
  const substitutionResult = substituteVariables(
    template.templateContent,
    variables,
    template.variables
  );

  // Increment usage count
  await incrementTemplateUsage(template.id, template.source);

  return {
    prompt: substitutionResult.content,
    systemPrompt: template.systemPrompt,
    template,
    substitutionResult,
  };
}
