import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, boolean, jsonb, json, pgEnum, index, uniqueIndex, numeric, uuid, unique } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ============================================================================
// CORE MULTI-TENANT TABLES (PUBLIC SCHEMA)
// ============================================================================
// These tables are owned by SSF and define the multi-tenant foundation.
// Migrated from shared schema to public schema on December 18, 2025.
// Previously imported from @nexus/shared-schema package (now deleted).
// ============================================================================

// User roles for access control
export const roleEnum = pgEnum('role', [
  'SuperAdmin',
  'WarehouseManager',
  'Editor',
  'Auditor',
]);

// Account status for user lifecycle
export const accountStatusEnum = pgEnum('account_status', [
  'pending',
  'active',
  'suspended',
  'rejected',
]);

/**
 * Tenants table - Root table for multi-tenant architecture
 * All other tables reference this via tenantId
 */
export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyName: text('company_name').notNull(),
  subdomain: text('subdomain').unique(),
  shopifyStoreUrl: text('shopify_store_url'),
  shopifyAccessToken: text('shopify_access_token'),
  shopifyApiVersion: text('shopify_api_version'),
  googleAdsCustomerId: text('google_ads_customer_id'),
  planTier: text('plan_tier').default('basic'),
  maxProducts: integer('max_products').default(1000),
  maxUsers: integer('max_users').default(5),
  trialEndsAt: timestamp('trial_ends_at'),
  isActive: boolean('is_active').default(true),
  settings: jsonb('settings'),
  createdBy: uuid('created_by'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Type exports for tenants
export interface Tenant {
  id: string;
  companyName: string;
  subdomain: string | null;
  shopifyStoreUrl: string | null;
  shopifyAccessToken: string | null;
  shopifyApiVersion: string | null;
  googleAdsCustomerId: string | null;
  planTier: string | null;
  maxProducts: number | null;
  maxUsers: number | null;
  trialEndsAt: Date | null;
  isActive: boolean | null;
  settings: unknown | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface NewTenant {
  id?: string;
  companyName: string;
  subdomain?: string | null;
  shopifyStoreUrl?: string | null;
  shopifyAccessToken?: string | null;
  shopifyApiVersion?: string | null;
  googleAdsCustomerId?: string | null;
  planTier?: string | null;
  maxProducts?: number | null;
  maxUsers?: number | null;
  trialEndsAt?: Date | null;
  isActive?: boolean | null;
  settings?: unknown | null;
  createdBy?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Users table - User accounts with role-based access control
 * Includes email verification, profile completion tracking, and 2FA support
 */
export const users = pgTable('users', {
  id: varchar('id', { length: 255 }).primaryKey().default(sql`gen_random_uuid()`),
  username: text('username').notNull().unique(),
  email: text('email').notNull().unique(),
  password: text('password').notNull(),
  role: roleEnum('role').notNull().default('Editor'),
  accountStatus: accountStatusEnum('account_status').default('pending'),
  firstName: text('first_name'),
  lastName: text('last_name'),
  phoneNumber: text('phone_number'),
  profileCompleted: boolean('profile_completed').default(false),
  tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
  emailVerified: boolean('email_verified').default(false),
  emailVerificationToken: text('email_verification_token'),
  twoFactorEnabled: boolean('two_factor_enabled').default(false),
  twoFactorSecret: text('two_factor_secret'),
  twoFactorBackupCodes: jsonb('two_factor_backup_codes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Type exports for users
export interface User {
  id: string;
  username: string;
  email: string;
  password: string;
  role: 'SuperAdmin' | 'WarehouseManager' | 'Editor' | 'Auditor';
  accountStatus: 'pending' | 'active' | 'suspended' | 'rejected' | null;
  firstName: string | null;
  lastName: string | null;
  phoneNumber: string | null;
  profileCompleted: boolean | null;
  tenantId: string | null;
  emailVerified: boolean | null;
  emailVerificationToken: string | null;
  twoFactorEnabled: boolean | null;
  twoFactorSecret: string | null;
  twoFactorBackupCodes: unknown | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface NewUser {
  id?: string;
  username: string;
  email: string;
  password: string;
  role?: 'SuperAdmin' | 'WarehouseManager' | 'Editor' | 'Auditor';
  accountStatus?: 'pending' | 'active' | 'suspended' | 'rejected' | null;
  firstName?: string | null;
  lastName?: string | null;
  phoneNumber?: string | null;
  profileCompleted?: boolean | null;
  tenantId?: string | null;
  emailVerified?: boolean | null;
  emailVerificationToken?: string | null;
  twoFactorEnabled?: boolean | null;
  twoFactorSecret?: string | null;
  twoFactorBackupCodes?: unknown | null;
  createdAt?: Date;
  updatedAt?: Date;
}

// ============================================================================
// PUBLIC SCHEMA - SSF-OWNED TABLES
// ============================================================================
// These tables are owned by ShopSyncFlow and store synced data from tenant sources.
// They have tenant_id for multi-tenant isolation and are the primary data source.
// Created: December 17, 2025 as part of multi-tenant database restructure.
// ============================================================================

/**
 * Items table - Product catalog synced from tenant data sources
 * Replaces direct queries to shared.qb_inventory
 */
export const items = pgTable("items", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  externalId: varchar("external_id", { length: 100 }).notNull(),
  sourceSystem: varchar("source_system", { length: 50 }).notNull(),
  itemNumber: varchar("item_number", { length: 100 }),
  sku: varchar("sku", { length: 100 }),
  upc: varchar("upc", { length: 50 }),
  alu: varchar("alu", { length: 100 }),
  description: text("description"),
  style: varchar("style", { length: 100 }),
  attribute: varchar("attribute", { length: 100 }), // Color/variant attribute
  size: varchar("size", { length: 50 }),
  color: varchar("color", { length: 100 }),
  msrp: numeric("msrp", { precision: 18, scale: 2 }),
  retailPrice: numeric("retail_price", { precision: 18, scale: 2 }),
  costPrice: numeric("cost_price", { precision: 18, scale: 2 }),
  department: varchar("department", { length: 200 }),
  category: varchar("category", { length: 200 }),
  vendor: varchar("vendor", { length: 200 }),
  gender: varchar("gender", { length: 50 }),
  weight: numeric("weight", { precision: 18, scale: 4 }).default("0"),
  reorderPoint: numeric("reorder_point", { precision: 18, scale: 4 }),
  availableOnline: boolean("available_online").default(true),
  isActive: boolean("is_active").default(true),
  notes: text("notes"),
  sourceCreatedAt: timestamp("source_created_at"),
  sourceModifiedAt: timestamp("source_modified_at"),
  lastSyncedAt: timestamp("last_synced_at").defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  tenantIdx: index("idx_items_tenant").on(table.tenantId),
  tenantExternalIdx: uniqueIndex("idx_items_tenant_external").on(table.tenantId, table.sourceSystem, table.externalId),
  itemNumberIdx: index("idx_items_item_number").on(table.tenantId, table.itemNumber),
  skuIdx: index("idx_items_sku").on(table.tenantId, table.sku),
  upcIdx: index("idx_items_upc").on(table.tenantId, table.upc),
  aluIdx: index("idx_items_alu").on(table.tenantId, table.alu),
  vendorIdx: index("idx_items_vendor").on(table.tenantId, table.vendor),
  categoryIdx: index("idx_items_category").on(table.tenantId, table.category),
  lastSyncedIdx: index("idx_items_last_synced").on(table.lastSyncedAt),
}));

/**
 * Store locations table - Physical/virtual inventory locations
 * Replaces direct queries to shared.locations
 */
export const ssfLocations = pgTable("locations", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  code: varchar("code", { length: 50 }).notNull(),
  name: varchar("name", { length: 200 }).notNull(),
  type: varchar("type", { length: 50 }).notNull().default("retail"),
  address: text("address"),
  city: varchar("city", { length: 100 }),
  state: varchar("state", { length: 50 }),
  zip: varchar("zip", { length: 20 }),
  country: varchar("country", { length: 100 }).default("US"),
  phone: varchar("phone", { length: 50 }),
  isActive: boolean("is_active").default(true),
  isDefault: boolean("is_default").default(false),
  sellsOnline: boolean("sells_online").default(true),
  externalId: varchar("external_id", { length: 100 }),
  sourceSystem: varchar("source_system", { length: 50 }),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  tenantIdx: index("idx_locations_tenant").on(table.tenantId),
  tenantCodeIdx: uniqueIndex("idx_locations_tenant_code").on(table.tenantId, table.code),
  externalIdx: index("idx_locations_external").on(table.tenantId, table.sourceSystem, table.externalId),
  activeIdx: index("idx_locations_active").on(table.tenantId, table.isActive),
}));

/**
 * Item inventory levels table - Quantity per item per location
 * Replaces direct queries to shared.inventory_levels
 */
export const itemLevels = pgTable("item_levels", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  itemId: uuid("item_id").notNull().references(() => items.id, { onDelete: "cascade" }),
  locationId: uuid("location_id").notNull().references(() => ssfLocations.id, { onDelete: "cascade" }),
  quantity: numeric("quantity", { precision: 18, scale: 4 }).notNull().default("0"),
  reservedQty: numeric("reserved_qty", { precision: 18, scale: 4 }).default("0"),
  // availableQty is a generated column in PostgreSQL, not defined here
  reorderPoint: numeric("reorder_point", { precision: 18, scale: 4 }),
  lastCountedAt: timestamp("last_counted_at"),
  lastCountedBy: uuid("last_counted_by"),
  lastSyncedAt: timestamp("last_synced_at").defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  tenantIdx: index("idx_item_levels_tenant").on(table.tenantId),
  itemIdx: index("idx_item_levels_item").on(table.itemId),
  locationIdx: index("idx_item_levels_location").on(table.locationId),
  lookupIdx: index("idx_item_levels_lookup").on(table.tenantId, table.itemId),
  uniqueIdx: uniqueIndex("idx_item_levels_unique").on(table.tenantId, table.itemId, table.locationId),
}));

/**
 * Tenant integrations table - Configuration for data sync sources
 */
export const tenantIntegrations = pgTable("tenant_integrations", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  integrationType: varchar("integration_type", { length: 50 }).notNull(),
  name: varchar("name", { length: 200 }),
  connectionConfig: jsonb("connection_config").notNull(),
  fieldMappings: jsonb("field_mappings"),
  syncEnabled: boolean("sync_enabled").default(true),
  syncFrequency: varchar("sync_frequency", { length: 50 }).default("manual"),
  lastSyncAt: timestamp("last_sync_at"),
  lastSyncStatus: varchar("last_sync_status", { length: 50 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  tenantIdx: index("idx_tenant_integrations_tenant").on(table.tenantId),
}));

/**
 * Sync logs table - Audit trail for data synchronization operations
 */
export const syncLogs = pgTable("sync_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  integrationId: uuid("integration_id").references(() => tenantIntegrations.id, { onDelete: "set null" }),
  startedAt: timestamp("started_at").defaultNow(),
  completedAt: timestamp("completed_at"),
  status: varchar("status", { length: 20 }).default("running"),
  itemsSynced: integer("items_synced").default(0),
  itemsFailed: integer("items_failed").default(0),
  itemsCreated: integer("items_created").default(0),
  itemsUpdated: integer("items_updated").default(0),
  errorMessage: text("error_message"),
  details: jsonb("details"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  tenantIdx: index("idx_sync_logs_tenant").on(table.tenantId),
  integrationIdx: index("idx_sync_logs_integration").on(table.integrationId),
  statusIdx: index("idx_sync_logs_status").on(table.status),
}));

// Types for public schema tables
export type Item = typeof items.$inferSelect;
export type NewItem = typeof items.$inferInsert;
export type SsfLocation = typeof ssfLocations.$inferSelect;
export type NewSsfLocation = typeof ssfLocations.$inferInsert;
export type ItemLevel = typeof itemLevels.$inferSelect;
export type NewItemLevel = typeof itemLevels.$inferInsert;
export type TenantIntegration = typeof tenantIntegrations.$inferSelect;
export type NewTenantIntegration = typeof tenantIntegrations.$inferInsert;
export type SyncLog = typeof syncLogs.$inferSelect;
export type NewSyncLog = typeof syncLogs.$inferInsert;

// ============================================================================
// END PUBLIC SCHEMA TABLES
// ============================================================================

// Enums (roleEnum and accountStatusEnum defined at top of file with tenants/users)
export const priorityEnum = pgEnum("priority", ["high", "medium", "low"]);
export const statusEnum = pgEnum("status", [
  "NEW",
  "TRIAGE",
  "ASSIGNED",
  "IN_PROGRESS",
  "READY_FOR_REVIEW",
  "PUBLISHED",
  "QA_APPROVED",
  "DONE"
]);

// Notification enums for the global notification bell feature
export const notificationCategoryEnum = pgEnum("notification_category", [
  "health",   // Collection health issues
  "sync",     // Shopify sync status
  "quality",  // Quality score alerts
  "system"    // General system notifications
]);

export const notificationSeverityEnum = pgEnum("notification_severity", [
  "critical", // Requires immediate attention
  "warning",  // Should be addressed soon
  "info"      // Informational only
]);

// =============================================================================
// AI INTEGRATION ENUMS
// =============================================================================

// AI Provider enum (supported AI providers)
export const aiProviderEnum = pgEnum("ai_provider", [
  "gemini",   // Google Gemini (default)
  "openai",   // OpenAI GPT models
  "anthropic" // Anthropic Claude models
]);

// AI Tier enum (subscription tiers for rate limiting)
export const aiTierEnum = pgEnum("ai_tier", [
  "free",       // Free tier with limited requests
  "pro",        // Pro tier with higher limits
  "enterprise"  // Enterprise tier with custom limits
]);

// Template Source enum (where a template originates from)
export const templateSourceEnum = pgEnum("template_source", [
  "platform", // Platform-provided default template
  "tenant"    // Tenant-created custom template
]);

// AI Feature enum (features that use AI)
export const aiFeatureEnum = pgEnum("ai_feature", [
  "product_description",     // Product description generation
  "bullet_points",           // SEO bullet points
  "meta_description",        // SEO meta description
  "title_optimization",      // Product title optimization
  "category_suggestion",     // AI category recommendations
  "brand_extraction",        // Brand info extraction
  "size_chart_extraction",   // Size chart parsing
  "content_rewrite",         // Content rewriting/improvement
  "translation",             // Content translation
  "image_alt_text"           // Image alt text generation
]);

// AI Output Format enum
export const aiOutputFormatEnum = pgEnum("ai_output_format", [
  "text",     // Plain text output
  "json",     // JSON structured output
  "markdown", // Markdown formatted output
  "html"      // HTML formatted output
]);

// =============================================================================
// MULTI-TENANT TABLES
// =============================================================================
// NOTE: tenants and users tables are defined at the top of this file (public schema)

// Metafield definitions table (for future metafields feature)
export const metafieldDefinitions = pgTable("metafield_definitions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  namespace: text("namespace").notNull(),
  key: text("key").notNull(),
  shopifyType: text("shopify_type").notNull(),
  displayName: text("display_name"),
  description: text("description"),
  isSynced: boolean("is_synced").default(true).notNull(),
  isRequired: boolean("is_required").default(false),
  defaultValue: text("default_value"),
  displayOrder: integer("display_order").default(0),
  fieldGroup: text("field_group"),
  validationRules: jsonb("validation_rules"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// =============================================================================
// USER & AUTH TABLES
// =============================================================================
// NOTE: users table is defined at the top of this file (public schema)

// Vendors table
export const vendors = pgTable("vendors", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
  name: text("name").notNull().unique(),
  color: varchar("color", { length: 7 }), // Hex color code (e.g., #3b82f6)

  // Brand enrichment fields
  websiteUrl: text("website_url"),           // Brand's official website (e.g., "https://eptm.com")
  hasWebsite: boolean("has_website").default(true).notNull(), // User can mark "No Website" to skip enrichment
  websiteType: text("website_type"),         // "shopify", "woocommerce", "custom", null

  // Brand information (AI-generated or scraped)
  brandDescription: text("brand_description"),    // "About the Brand" section text
  foundedYear: text("founded_year"),
  specialty: text("specialty"),                   // e.g., "Contemporary streetwear"
  targetAudience: text("target_audience"),

  // Size chart approach detection
  sizeChartType: text("size_chart_type"),        // "table" (dedicated page with tables), "image" (product-page images), "none"
  sizeChartDetectedAt: timestamp("size_chart_detected_at"), // When we detected the type

  // Scraping metadata
  lastScrapedAt: timestamp("last_scraped_at"),
  scrapingEnabled: boolean("scraping_enabled").default(true).notNull(),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Categories table (product category management)
export const categories = pgTable("categories", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
  name: text("name").notNull().unique(),
  description: text("description"),
  slug: text("slug").notNull().unique(), // URL-friendly version of name
  color: varchar("color", { length: 7 }), // Hex color code (e.g., #3b82f6)

  // Organization
  isActive: boolean("is_active").default(true).notNull(),
  displayOrder: integer("display_order").default(0).notNull(),
  productCount: integer("product_count").default(0).notNull(), // Cached count

  // Shopify Standard Product Taxonomy Mapping
  shopifyCategoryGid: varchar("shopify_category_gid", { length: 200 }), // e.g., gid://shopify/TaxonomyCategory/aa-1-12-4
  shopifyCategoryPath: text("shopify_category_path"), // e.g., "Apparel & Accessories > Clothing > Pants > Jeans"

  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Tags table (product tag management)
export const tags = pgTable("tags", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  normalizedName: varchar("normalized_name", { length: 255 }).notNull(), // lowercase, trimmed
  color: varchar("color", { length: 7 }), // Hex color code for visual organization
  productCount: integer("product_count").default(0).notNull(), // Cached count
  shopifySynced: boolean("shopify_synced").default(false).notNull(),
  lastSyncedAt: timestamp("last_synced_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index("tags_tenant_idx").on(table.tenantId),
  normalizedIdx: index("tags_normalized_idx").on(table.tenantId, table.normalizedName),
  tenantNormalizedUnique: uniqueIndex("tags_tenant_normalized_unique").on(table.tenantId, table.normalizedName),
}));

// Collections table (product collections for organization and Shopify sync)
export const collections = pgTable("collections", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
  name: text("name").notNull(), // Note: UNIQUE constraint removed in DB to allow duplicates from Shopify
  slug: text("slug").notNull().unique(), // URL-friendly version of name
  description: text("description"),
  image: text("image"), // Collection hero/cover image

  // Organization
  isActive: boolean("is_active").default(true).notNull(),
  displayOrder: integer("display_order").default(0).notNull(),
  productCount: integer("product_count").default(0).notNull(), // Cached count

  // SEO fields
  metaTitle: text("meta_title"),
  metaDescription: text("meta_description"),
  focusKeyword: text("focus_keyword"),

  // Shopify sync
  shopifyCollectionId: text("shopify_collection_id").unique(), // Shopify GID (gid://shopify/Collection/...)
  shopifyHandle: text("shopify_handle"), // URL handle in Shopify
  shopifyType: text("shopify_type").default("manual"), // "manual" or "smart"
  syncedAt: timestamp("synced_at"), // Last sync with Shopify

  // Smart collection rules (only for smart collections)
  rules: jsonb("rules"), // { rules: [{ column, relation, condition }], appliedDisjunctively: boolean }

  // Duplicate tracking (Collection Health System)
  isDuplicate: boolean("is_duplicate").default(false),
  duplicateGroupId: text("duplicate_group_id"),
  createdByType: text("created_by_type"), // 'staff', 'app', 'unknown'
  createdByName: text("created_by_name"), // e.g., 'Power Tools Filter Menu'

  // Shopify timestamps (actual dates from Shopify)
  shopifyCreatedAt: timestamp("shopify_created_at"), // From Events API "created collection" event
  shopifyUpdatedAt: timestamp("shopify_updated_at"), // From Shopify GraphQL updatedAt

  // Sync tracking timestamps
  firstSyncedAt: timestamp("first_synced_at"), // When we first synced this collection

  // Timestamps (our local records)
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// =============================================================================
// COLLECTION HEALTH SYSTEM TABLES
// =============================================================================

// Navigation Menus table (synced from Shopify for conflict detection)
export const navigationMenus = pgTable("navigation_menus", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  shopifyMenuId: text("shopify_menu_id").notNull(),
  title: text("title").notNull(),
  handle: text("handle").notNull(),
  itemCount: integer("item_count").default(0),
  syncedAt: timestamp("synced_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Navigation Items table (items within navigation menus)
export const navigationItems = pgTable("navigation_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  menuId: varchar("menu_id").notNull().references(() => navigationMenus.id, { onDelete: "cascade" }),
  parentItemId: varchar("parent_item_id"),
  shopifyItemId: text("shopify_item_id"),
  title: text("title").notNull(),
  type: text("type").notNull(), // 'COLLECTION', 'PAGE', 'LINK', 'BLOG'
  targetId: text("target_id"),
  targetUrl: text("target_url"),
  position: integer("position").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Collection Health Issues table (detected problems with collections)
export const collectionHealthIssues = pgTable("collection_health_issues", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  issueType: text("issue_type").notNull(), // 'duplicate', 'nav_conflict', 'orphan', 'no_products'
  severity: text("severity").notNull(), // 'critical', 'high', 'medium', 'low'
  collectionId: varchar("collection_id").references(() => collections.id, { onDelete: "cascade" }),
  relatedCollectionId: varchar("related_collection_id"),
  menuId: varchar("menu_id").references(() => navigationMenus.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  description: text("description").notNull(),
  recommendation: text("recommendation"),
  recommendedAction: text("recommended_action"),
  metadata: jsonb("metadata").default({}),
  status: text("status").default("open").notNull(), // 'open', 'resolved', 'ignored'
  resolvedAt: timestamp("resolved_at"),
  resolvedBy: varchar("resolved_by").references(() => users.id),
  resolutionNotes: text("resolution_notes"),
  detectedAt: timestamp("detected_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// =============================================================================
// EDUCATION CENTER TABLES
// =============================================================================

// Education Articles table (global educational content about handles, slugs, best practices)
export const educationArticles = pgTable("education_articles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),

  // Article identification
  slug: text("slug").notNull().unique(), // URL-friendly identifier: "handle-rules", "preventing-duplicates"
  title: text("title").notNull(), // "Understanding Collection Handles"
  category: text("category").notNull(), // "handles", "collections", "best-practices", "troubleshooting"

  // Content
  summary: text("summary").notNull(), // Brief description for cards/lists
  content: text("content").notNull(), // Full article content (markdown supported)

  // Display
  icon: text("icon"), // Lucide icon name: "link", "alert-triangle", "book-open"
  displayOrder: integer("display_order").default(0).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  isPinned: boolean("is_pinned").default(false).notNull(), // Show at top of education center

  // Relevance tags (for contextual display)
  relevantIssueTypes: text("relevant_issue_types").array().default(sql`ARRAY[]::text[]`), // ['duplicate', 'nav_conflict', 'orphan_link']

  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// App Education Library table (global library of Shopify apps that affect collections)
export const appEducationLibrary = pgTable("app_education_library", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),

  // App identification
  appName: text("app_name").notNull().unique(), // "Power Tools Filter Menu"
  appVendor: text("app_vendor"), // "Jerasoft"
  shopifyAppId: text("shopify_app_id"), // Shopify's app ID if known

  // Detection patterns (for auto-detecting which tenant has this app)
  detectionPatterns: jsonb("detection_patterns").default({}), // { creatorNames: ["Power Tools"], handlePatterns: [] }

  // Behavior flags
  createsCollections: boolean("creates_collections").default(false).notNull(),
  modifiesCollections: boolean("modifies_collections").default(false).notNull(),
  usesHandles: boolean("uses_handles").default(true).notNull(), // vs Shopify IDs
  autoSyncs: boolean("auto_syncs").default(false).notNull(), // Creates collections automatically
  syncFrequency: text("sync_frequency"), // "Hourly", "On product change", "Manual"

  // Education content
  whatItDoes: text("what_it_does"), // Brief description
  howItCreatesCollections: text("how_it_creates_collections"), // Explanation
  whyDuplicatesHappen: text("why_duplicates_happen"), // Root cause explanation
  howToPrevent: text("how_to_prevent"), // Prevention steps
  whereToFind: text("where_to_find"), // "Shopify Admin → Apps → Power Tools"

  // Risk assessment
  riskLevel: text("risk_level").default("low"), // "high", "medium", "low"

  // Links
  documentationUrl: text("documentation_url"),
  supportUrl: text("support_url"),

  // Verification
  isVerified: boolean("is_verified").default(false).notNull(), // Reviewed by admin

  // Display
  icon: text("icon"), // Lucide icon name
  color: varchar("color", { length: 7 }), // Hex color for UI

  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Tenant Detected Apps table (apps detected/configured per tenant)
export const tenantDetectedApps = pgTable("tenant_detected_apps", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),

  // Link to global library (nullable for unknown apps)
  libraryAppId: varchar("library_app_id").references(() => appEducationLibrary.id, { onDelete: "set null" }),

  // Detection info
  detectedName: text("detected_name").notNull(), // Name as detected from Shopify events
  firstDetectedAt: timestamp("first_detected_at").defaultNow().notNull(),
  lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
  collectionsCreated: integer("collections_created").default(0).notNull(),

  // Tenant-specific settings
  customNotes: text("custom_notes"), // Tenant's own notes about this app
  isHidden: boolean("is_hidden").default(false).notNull(), // Hide from education center

  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// =============================================================================
// LEGACY TABLE (REMOVED)
// =============================================================================

// NOTE: shopifyCollectionDuplicates table has been replaced by collectionHealthIssues
// The table was dropped in migration 003-collection-health-schema.sql

/* REMOVED - Shopify Collection Duplicates table (track collections with duplicate names from Shopify)
export const shopifyCollectionDuplicates = pgTable("shopify_collection_duplicates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),

  // Shopify collection data (the one that couldn't be synced)
  shopifyCollectionId: text("shopify_collection_id").notNull(), // Shopify GID
  name: text("name").notNull(), // Duplicate name
  shopifyHandle: text("shopify_handle"),
  shopifyType: text("shopify_type"), // "manual" or "smart"
  description: text("description"),
  productsCount: integer("products_count").default(0),

  // Reference to existing local collection with the same name
  existingCollectionId: varchar("existing_collection_id").references(() => collections.id, { onDelete: "cascade" }),

  // Shopify metadata
  shopifyUpdatedAt: timestamp("shopify_updated_at"),

  // Status tracking
  status: text("status").default("duplicate").notNull(), // "duplicate", "resolved", "ignored"
  resolvedAt: timestamp("resolved_at"),
  resolvedBy: varchar("resolved_by").references(() => users.id),
  resolutionNotes: text("resolution_notes"),

  // Timestamps
  detectedAt: timestamp("detected_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
*/

// Products table
export const products = pgTable("products", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  handle: text("handle").unique(), // SEO-friendly URL slug (e.g., "mens-black-leather-wallet")
  description: text("description"),
  vendorId: varchar("vendor_id").references(() => vendors.id),
  vendor: text("vendor").notNull(), // Keep for backward compatibility
  orderNumber: text("order_number"),

  // Product identification
  styleNumber: text("style_number"), // Groups related products (same design, different colors/sizes)
  categoryId: varchar("category_id").references(() => categories.id, { onDelete: "set null" }),
  category: text("category"), // Keep for backward compatibility
  productType: text("product_type"), // Shopify product type (e.g., "Hoodies", "T-Shirts")
  categoryMigratedAt: timestamp("category_migrated_at"), // When product was migrated from hierarchical categories to clean types + tags

  // Shopify Standard Product Taxonomy
  shopifyCategoryId: varchar("shopify_category_id", { length: 50 }), // "aa-1-13-13" (references productCategories.id)
  shopifyCategoryPath: text("shopify_category_path"), // Denormalized path for display: "Apparel & Accessories > ... > Hoodies"
  shopifyCategorySyncedAt: timestamp("shopify_category_synced_at"), // When category was last synced to Shopify

  images: text("images").array(),
  metadata: jsonb("metadata"),

  // Product organization
  tags: text("tags"), // Comma-separated tags (e.g., "summer, sale, kids")
  collections: text("collections"), // Comma-separated collections (e.g., "Boys Collection, Pull Over Hoodies")

  // Content Studio Integration - Product Status & Publishing
  status: text("status").default("local_draft").notNull(), // 'local_draft', 'draft', 'active', 'archived'
  shopifyProductId: varchar("shopify_product_id"), // Links to shopify_products.id (nullable - not published yet)
  publishedAt: timestamp("published_at"), // When published to Shopify
  publishStatus: text("publish_status").default("not_published").notNull(), // 'not_published', 'publishing', 'published', 'failed'
  publishError: text("publish_error"), // Error message if publishing failed

  // Content Studio - Generated SEO Content
  metaTitle: text("meta_title"), // SEO meta title from AI generation
  metaDescription: text("meta_description"), // SEO meta description from AI generation
  focusKeyword: text("focus_keyword"), // Yoast SEO focus keyword
  googleCategory: jsonb("google_category"), // Google Shopping category object
  generatedKeywords: text("generated_keywords").array(), // Product tags/keywords from AI

  // AI Generation Tracking
  seoScore: integer("seo_score").default(0), // Yoast SEO score (0-100)
  aiGenerated: boolean("ai_generated").default(false), // Created/enhanced with AI
  aiGeneratedAt: timestamp("ai_generated_at"), // When AI generation occurred
  aiModel: text("ai_model"), // AI model used (e.g., "gemini-1.5-pro")

  // Custom Metafields (for future metafields feature)
  customMetafields: jsonb("custom_metafields").default({}),

  // Product Highlights / Sales Points (5 SEO bullet points)
  // Maps to Shopify metafields: custom.custom_sales_point_1 through custom_sales_point_5
  bulletPoints: jsonb("bullet_points").$type<string[]>().default([]),

  // Shopify timestamps (actual dates from Shopify)
  shopifyCreatedAt: timestamp("shopify_created_at"), // From Shopify GraphQL createdAt
  shopifyUpdatedAt: timestamp("shopify_updated_at"), // From Shopify GraphQL updatedAt

  // Sync tracking timestamps
  firstSyncedAt: timestamp("first_synced_at"), // When we first synced this product

  // Local timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Product Options table (variant system)
// Stores option definitions (e.g., "Size", "Color", "Material")
// Each product can have up to 3 options (Shopify limit)
export const productOptions = pgTable("product_options", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  productId: varchar("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),

  // Option definition
  name: text("name").notNull(), // "Size", "Color", "Material"
  position: integer("position").notNull(), // 1, 2, or 3 (Shopify max)
  values: text("values").array().notNull(), // ["Small", "Medium", "Large"]

  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Product Variants table (variant system)
// Stores individual variants with specific option combinations
// Each variant represents a unique combination (e.g., "Small / Red")
export const productVariants = pgTable("product_variants", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
  productId: varchar("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),

  // Variant identification
  title: text("title").notNull(), // "Small / Red"

  // Denormalized option values for fast queries
  option1: text("option1"), // Value from position 1 option (e.g., "Small")
  option2: text("option2"), // Value from position 2 option (e.g., "Red")
  option3: text("option3"), // Value from position 3 option (e.g., "Cotton")

  // Pricing
  price: text("price").notNull(), // Required
  compareAtPrice: text("compare_at_price"), // Original price (for discounts)
  cost: text("cost"), // Unit cost for profit calculations

  // Inventory
  inventoryQuantity: integer("inventory_quantity").default(0).notNull(),
  inventoryPolicy: text("inventory_policy").default("deny"), // "deny" or "continue"

  // SKU and identification
  sku: text("sku"),
  barcode: text("barcode"),

  // Physical properties
  weight: text("weight"),
  weightUnit: text("weight_unit"), // "g", "kg", "oz", "lb"
  requiresShipping: boolean("requires_shipping").default(true),

  // Fulfillment
  fulfillmentService: text("fulfillment_service").default("manual"),

  // Tax
  taxable: boolean("taxable").default(true),

  // Image association
  imageId: varchar("image_id"),
  imageUrl: text("image_url"), // Direct image URL for variant-specific images
  position: integer("position").default(1).notNull(), // Display order (1-indexed like Shopify)

  // Shopify sync
  shopifyVariantId: text("shopify_variant_id").unique(), // Shopify's variant ID
  availableForSale: boolean("available_for_sale").default(true),

  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  shopifyCreatedAt: timestamp("shopify_created_at"),
  shopifyUpdatedAt: timestamp("shopify_updated_at"),
});

// ===================================================================
// FILES SYSTEM TABLES
// ===================================================================
// Centralized media asset management (images, documents, etc.)
// Inspired by Shopify's Content → Files system
// See: /volume1/docker/planning/05-shopsyncflow/File-system/

// Files table - Centralized storage for all uploaded file metadata
export const files = pgTable("files", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),

  // File identification
  filename: varchar("filename", { length: 255 }).notNull(), // Sanitized filename: "product-image-001.jpg"
  originalFilename: varchar("original_filename", { length: 255 }).notNull(), // User's original: "My Photo (1).jpg"
  filePath: text("file_path").notNull(), // Storage path: "/uploads/2025/11/abc123.jpg"

  // File metadata
  mimeType: varchar("mime_type", { length: 100 }).notNull(), // "image/jpeg", "application/pdf"
  fileType: varchar("file_type", { length: 50 }).notNull(), // "image", "video", "document"
  fileSize: integer("file_size").notNull(), // Size in bytes
  fileHash: varchar("file_hash", { length: 64 }), // SHA-256 hash for deduplication

  // Image-specific metadata (NULL for non-images)
  width: integer("width"), // Image width in pixels
  height: integer("height"), // Image height in pixels

  // SEO & Accessibility
  altText: text("alt_text"), // Alt text for images
  title: varchar("title", { length: 255 }), // Optional title/caption

  // CDN & URLs
  cdnUrl: text("cdn_url").notNull(), // Public URL to access file
  thumbnailUrl: text("thumbnail_url"), // Thumbnail URL (for images)

  // Storage metadata
  storageProvider: varchar("storage_provider", { length: 50 }).default("local"), // "local", "cloudinary", "s3"
  storageKey: text("storage_key"), // Provider-specific ID (e.g., Cloudinary public_id)

  // Tracking
  uploadedBy: varchar("uploaded_by").references(() => users.id, { onDelete: "set null" }),
  uploadSource: varchar("upload_source", { length: 50 }).default("manual"), // "manual", "product_sync", "csv_import"

  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Product Media junction table - Many-to-many relationship between products and files
export const productMedia = pgTable("product_media", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),

  // Relationships
  productId: varchar("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  fileId: varchar("file_id")
    .notNull()
    .references(() => files.id, { onDelete: "cascade" }),

  // Display order
  position: integer("position").default(1).notNull(), // 1 = featured image, 2+ = gallery
  mediaType: varchar("media_type", { length: 50 }).default("image"), // "image", "video", "document"
  isFeatured: boolean("is_featured").default(false), // TRUE for main product image

  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Variant Media junction table - Many-to-many relationship between variants and files
export const variantMedia = pgTable("variant_media", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),

  // Relationships
  variantId: varchar("variant_id")
    .notNull()
    .references(() => productVariants.id, { onDelete: "cascade" }),
  fileId: varchar("file_id")
    .notNull()
    .references(() => files.id, { onDelete: "cascade" }),

  // Display
  position: integer("position").default(1).notNull(),
  isFeatured: boolean("is_featured").default(false),

  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// File References table - Generic tracking for file usage across all resource types
export const fileReferences = pgTable("file_references", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),

  // Relationships
  fileId: varchar("file_id")
    .notNull()
    .references(() => files.id, { onDelete: "cascade" }),

  // Resource (polymorphic)
  resourceType: varchar("resource_type", { length: 50 }).notNull(), // "product", "variant", "blog_post", "page"
  resourceId: text("resource_id").notNull(), // ID of the resource

  // Context
  context: varchar("context", { length: 100 }), // "featured_image", "gallery", "content"

  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Product Collections join table (many-to-many relationship between products and collections)
export const productCollections = pgTable("product_collections", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  productId: varchar("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  collectionId: varchar("collection_id")
    .notNull()
    .references(() => collections.id, { onDelete: "cascade" }),

  // Display order (for sorting products within a collection)
  position: integer("position").default(0).notNull(),

  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Product Status History table (track status changes over time)
export const productStatusHistory = pgTable("product_status_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  productId: varchar("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  shopifyProductId: varchar("shopify_product_id").references(() => shopifyProducts.id, { onDelete: "set null" }), // Optional: track Shopify product

  // Status change details
  oldStatus: text("old_status"), // Previous status (null for initial record)
  newStatus: text("new_status").notNull(), // New status
  changedAt: timestamp("changed_at").notNull().defaultNow(),

  // Change metadata
  changedBy: varchar("changed_by").references(() => users.id), // User who made change (optional)
  changeSource: text("change_source").notNull(), // 'import', 'manual', 'webhook', 'bulk_operation'
  notes: text("notes"), // Reason for change or additional context

  // Additional metadata
  metadata: jsonb("metadata"), // Store additional context (e.g., Shopify updatedAt, bulk operation ID)

  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Brand size charts table (CACHED - reused across all products from brand)
export const brandSizeCharts = pgTable("brand_size_charts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  vendorId: varchar("vendor_id").notNull().references(() => vendors.id, { onDelete: "cascade" }),

  category: text("category").notNull(),      // "Bottoms", "Tops", "Outerwear", etc.

  // Size chart data (JSON format)
  sizeChartData: jsonb("size_chart_data").notNull(),
  /* Example structure:
  {
    "sizes": ["S", "M", "L", "XL", "2XL"],
    "measurements": {
      "waist": ["30", "32", "34", "36", "38"],
      "inseam": ["30", "30", "32", "32", "34"],
      "rise": ["11", "11.5", "12", "12.5", "13"]
    },
    "unit": "inches"
  }
  */

  // If scraped from website
  sourceUrl: text("source_url"),             // URL where chart was found
  imageUrl: text("image_url"),               // Image of size chart (if available)

  // AI-friendly fit guidance (e.g., "True to size", "Runs small - size up")
  fitGuidance: text("fit_guidance"),

  // Versioning fields (for tracking size chart changes over time)
  usageCount: integer("usage_count").default(0).notNull(),     // How many times this version was used
  version: integer("version").default(1).notNull(),            // Version number for this category
  contentHash: text("content_hash"),                           // SHA256 hash of parsedTables to detect changes
  isActive: boolean("is_active").default(true).notNull(),      // Currently recommended version

  // Manual upload support (failsafe when auto-scraping fails)
  uploadMethod: text("upload_method").notNull().default("auto_scrape"), // "auto_scrape", "manual_upload", "ai_assisted_upload"
  uploadedByUserId: varchar("uploaded_by_user_id").references(() => users.id, { onDelete: "set null" }), // Track who uploaded manually
  originalFileName: text("original_file_name"),                // Store original filename for reference
  fileStoragePath: text("file_storage_path"),                  // Path to uploaded image: /attached_assets/size-charts/{vendorId}/{filename}
  aiAnalysisResult: jsonb("ai_analysis_result"),               // Store full AI analysis for transparency

  scrapedAt: timestamp("scraped_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Brand product cache (product-specific data from brand website)
export const brandProductCache = pgTable("brand_product_cache", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  vendorId: varchar("vendor_id").notNull().references(() => vendors.id, { onDelete: "cascade" }),

  // Product identifiers (for matching)
  styleNumber: text("style_number").notNull(),   // EP12429
  productName: text("product_name"),             // FREEWAY PANTS
  color: text("color"),                          // BLACK

  // Scraped product data
  brandProductUrl: text("brand_product_url"),    // https://eptm.com/products/freeway-pants-black
  brandProductTitle: text("brand_product_title"), // Official product title from brand website
  brandDescription: text("brand_description"),    // Description from brand website
  materialComposition: text("material_composition"), // "98% Cotton, 2% Elastane"
  careInstructions: text("care_instructions"),    // "Machine wash cold"
  features: jsonb("features"),                    // ["Adjustable waist", "Multiple pockets"]

  // Images from brand website
  images: jsonb("images"),                        // [{ url, alt, isPrimary }]

  // Size chart data (product-specific)
  sizeChartImageUrl: text("size_chart_image_url"),  // URL to size chart image on product page
  sizeChartImageAnalysis: jsonb("size_chart_image_analysis"), // AI-extracted data from image
  /* Example structure:
  {
    "fitType": "Regular Fit",
    "material": "Mid-weight 5.3 oz, 28-singles 100% combed cotton",
    "features": ["Preshrunk to minimize shrinkage"],
    "measurements": {
      "S": { "chest": "18", "length": "28" },
      "M": { "chest": "20", "length": "29" }
    }
  }
  */
  fitType: text("fit_type"),                       // Quick access: "Regular", "Oversized", "Slim", etc.

  // Metadata
  scrapedAt: timestamp("scraped_at").notNull(),
  expiresAt: timestamp("expires_at"),             // Optional cache expiry (7 days default)
  scrapingSuccess: boolean("scraping_success").default(true).notNull(),
  scrapingError: text("scraping_error"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Style Number Mappings table (for multi-match product enrichment)
export const styleNumberMappings = pgTable("style_number_mappings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  vendorId: varchar("vendor_id").notNull().references(() => vendors.id, { onDelete: "cascade" }),

  // Our internal style number (from Excel/CSV upload)
  ourStyleNumber: text("our_style_number").notNull(),      // "PD-T-003 3D TOPPER"

  // Brand's product identifiers (user-confirmed mapping)
  brandProductHandle: text("brand_product_handle").notNull(), // "pd-t-003"
  brandProductTitle: text("brand_product_title"),           // "MENS CLASSIC ULTRA STRETCH DENIM - JET BLACK 3D (PD-T-003)"
  brandProductUrl: text("brand_product_url"),               // Full URL for reference

  // Matching metadata
  matchedBy: text("matched_by"),                            // Which variation found it: "PD-T-003", "PDT003", etc.
  confidence: text("confidence").notNull().default("user_confirmed"), // "user_confirmed", "auto_exact_match", "auto_fuzzy_match"

  // Audit trail
  createdAt: timestamp("created_at").defaultNow().notNull(),
  createdBy: varchar("created_by").references(() => users.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),

  // Composite unique constraint: one mapping per vendor + style number
  // If user changes their mind, we update the existing mapping
});

// Tasks table
export const tasks = pgTable("tasks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),

  // Task content (NEW FIELDS)
  title: text("title").notNull(),
  description: text("description"),
  category: text("category"), // e.g., "Product Image Editing", "Content Writing", etc.

  // Optional product reference (NOW NULLABLE)
  productId: varchar("product_id").references(() => products.id, { onDelete: "cascade" }),
  productInfo: jsonb("product_info"), // Denormalized product data for tasks with products

  // Optional vendor reference (for supplier categorization)
  vendorId: varchar("vendor_id").references(() => vendors.id),

  // Workflow fields
  status: statusEnum("status").notNull().default("NEW"),
  priority: priorityEnum("priority").notNull().default("medium"),
  assignedTo: varchar("assigned_to").references(() => users.id),
  createdBy: varchar("created_by").notNull().references(() => users.id),

  // Timestamps
  receivedDate: timestamp("received_date").notNull(),
  assignedAt: timestamp("assigned_at"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  publishedAt: timestamp("published_at"),
  slaDeadline: timestamp("sla_deadline"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),

  // Metadata
  orderNumber: text("order_number"),
  orderLink: text("order_link"),
  notes: text("notes"),
  attachments: jsonb("attachments").default(sql`'[]'::jsonb`), // [{ name, url, type }]

  // Legacy checklist (kept for backward compatibility, use task_steps instead)
  checklist: jsonb("checklist").default({}),

  // Analytics
  leadTimeMinutes: integer("lead_time_minutes"),
  cycleTimeMinutes: integer("cycle_time_minutes"),
});

// Audit trail table
export const auditLog = pgTable("audit_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
  taskId: varchar("task_id").references(() => tasks.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id),
  action: text("action").notNull(),
  fromStatus: statusEnum("from_status"),
  toStatus: statusEnum("to_status"),
  details: jsonb("details"),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

// Notifications table (enhanced for global notification bell)
export const notifications = pgTable("notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
  userId: varchar("user_id").references(() => users.id), // Made optional for tenant-level notifications
  taskId: varchar("task_id").references(() => tasks.id),
  title: text("title").notNull(),
  message: text("message").notNull(),
  read: boolean("read").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  // New fields for global notification bell feature
  category: text("category").notNull().default("system"), // 'health', 'sync', 'quality', 'system'
  severity: text("severity").notNull().default("info"),   // 'critical', 'warning', 'info'
  sourceType: text("source_type"),    // 'collection_health', 'weight_discrepancy', 'sync_error', 'import', 'task'
  sourceId: varchar("source_id", { length: 255 }),       // Reference to source record
  actionUrl: text("action_url"),      // Deep link URL for navigation
  dismissed: boolean("dismissed").default(false).notNull(),
  expiresAt: timestamp("expires_at"), // Auto-cleanup for old notifications
  metadata: jsonb("metadata").default({}),
}, (table) => ({
  // Indexes for efficient querying
  tenantCategoryIdx: index("notifications_tenant_category_idx").on(table.tenantId, table.category),
  tenantSeverityIdx: index("notifications_tenant_severity_idx").on(table.tenantId, table.severity),
  tenantReadIdx: index("notifications_tenant_read_idx").on(table.tenantId, table.read),
  tenantDismissedIdx: index("notifications_tenant_dismissed_idx").on(table.tenantId, table.dismissed),
  expiresAtIdx: index("notifications_expires_at_idx").on(table.expiresAt),
}));

// Task Steps table (checklist items as separate entities)
export const taskSteps = pgTable("task_steps", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  taskId: varchar("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  completed: boolean("completed").default(false).notNull(),
  order: integer("order").notNull(),
  required: boolean("required").default(false).notNull(), // Must complete before marking task as done
  completedAt: timestamp("completed_at"),
  completedBy: varchar("completed_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Step Templates table (global reusable step definitions per category)
export const stepTemplates = pgTable("step_templates", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  category: text("category").notNull(), // e.g., "Product Image Editing", "Content Writing"
  title: text("title").notNull(),
  description: text("description"),
  order: integer("order").notNull(),
  required: boolean("required").default(false).notNull(),
  active: boolean("active").default(true).notNull(), // Can be disabled without deleting
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Shopify stores configuration table (DEPRECATED - kept for backward compatibility)
export const shopifyStores = pgTable("shopify_stores", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  shopDomain: text("shop_domain").notNull().unique(),
  accessToken: text("access_token").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  webhookSecret: text("webhook_secret"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Session table (used by connect-pg-simple)
export const session = pgTable("session", {
  sid: varchar("sid").primaryKey(),
  sess: json("sess").notNull(),
  expire: timestamp("expire").notNull(),
});

// Shopify product mappings table
export const shopifyProductMappings = pgTable("shopify_product_mappings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
  productId: varchar("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  shopifyStoreId: varchar("shopify_store_id").notNull().references(() => shopifyStores.id, { onDelete: "cascade" }),
  shopifyProductId: text("shopify_product_id").notNull(),
  shopifyHandle: text("shopify_handle"),
  publishedAt: timestamp("published_at").defaultNow().notNull(),
  status: text("status").notNull().default("published"), // published, draft, archived
  lastSyncAt: timestamp("last_sync_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Login attempts table (for rate limiting and security monitoring)
export const loginAttempts = pgTable("login_attempts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull(),
  ipAddress: text("ip_address").notNull(),
  userAgent: text("user_agent"),
  success: boolean("success").notNull(),
  failureReason: text("failure_reason"),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

// Password reset tokens table
export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(), // bcrypt hash of the actual token
  expiresAt: timestamp("expires_at").notNull(),
  used: boolean("used").default(false).notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Dashboard stats history table (for tracking metrics over time)
export const dashboardStatsHistory = pgTable("dashboard_stats_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  date: timestamp("date").notNull(), // Date this snapshot was taken
  totalTasks: integer("total_tasks").notNull().default(0),
  pendingReview: integer("pending_review").notNull().default(0),
  overdueSLA: integer("overdue_sla").notNull().default(0),
  completedToday: integer("completed_today").notNull().default(0),
  // Store kanban counts as JSONB for flexibility
  kanbanCounts: jsonb("kanban_counts").default(sql`'{}'::jsonb`).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ============================================================================
// SHOPIFY PRODUCT INTEGRATION TABLES
// ============================================================================

// Shopify Products (core product data from Shopify store)
export const shopifyProducts = pgTable("shopify_products", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  shopifyId: text("shopify_id").notNull().unique(), // Shopify GID (e.g., gid://shopify/Product/...)

  // Core product data
  title: text("title").notNull(),
  descriptionHtml: text("description_html"),
  handle: text("handle").notNull(), // URL-friendly slug

  // Relationships
  vendorId: varchar("vendor_id").references(() => vendors.id, { onDelete: "set null" }),

  // Categorization
  productType: text("product_type"), // e.g., "Apparel", "Headwear"
  tags: text("tags").array().default(sql`ARRAY[]::text[]`),

  // Status
  status: text("status").notNull().default("ACTIVE"), // "ACTIVE", "ARCHIVED", "DRAFT"
  publishedAt: timestamp("published_at"),

  // Timestamps from Shopify
  shopifyCreatedAt: timestamp("shopify_created_at").notNull(),
  shopifyUpdatedAt: timestamp("shopify_updated_at").notNull(),

  // Sync tracking timestamps
  firstSyncedAt: timestamp("first_synced_at"), // When we first synced this product
  lastSyncedAt: timestamp("last_synced_at").notNull().defaultNow(),

  // Metadata
  metafields: jsonb("metafields"), // Store custom Shopify metafields

  // Bi-directional sync support (for future write operations)
  locallyModified: boolean("locally_modified").default(false).notNull(),
  localModifiedAt: timestamp("local_modified_at"),
  pendingSync: boolean("pending_sync").default(false).notNull(),

  // Content Studio Integration - Origin Tracking
  createdVia: text("created_via").default("shopify_sync").notNull(), // 'content_studio', 'shopify_sync', 'manual'
  localProductId: varchar("local_product_id"), // Links to products.id (nullable - may not have local draft)

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Shopify Product Variants (sizes, colors, etc.)
export const shopifyProductVariants = pgTable("shopify_product_variants", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  shopifyId: text("shopify_id").notNull().unique(), // Shopify variant GID

  // Relationships
  productId: varchar("product_id").notNull().references(() => shopifyProducts.id, { onDelete: "cascade" }),

  // Variant data
  title: text("title").notNull(), // e.g., "Small / Red"
  sku: text("sku"),

  // Pricing
  price: text("price").notNull(),
  compareAtPrice: text("compare_at_price"), // Original price (for sales)

  // Inventory
  inventoryQuantity: integer("inventory_quantity").default(0),
  inventoryPolicy: text("inventory_policy"), // "DENY", "CONTINUE"

  // Physical properties
  weight: text("weight"),
  weightUnit: text("weight_unit"), // "lb", "kg", etc.

  // Options (size, color, material, etc.)
  option1: text("option1"), // e.g., "Small"
  option2: text("option2"), // e.g., "Red"
  option3: text("option3"), // e.g., "Cotton"

  // Image
  imageUrl: text("image_url"),
  imageAltText: text("image_alt_text"),

  // Status
  availableForSale: boolean("available_for_sale").default(true).notNull(),

  // Timestamps from Shopify
  shopifyCreatedAt: timestamp("shopify_created_at").notNull(),
  shopifyUpdatedAt: timestamp("shopify_updated_at").notNull(),
  lastSyncedAt: timestamp("last_synced_at").notNull().defaultNow(),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Shopify Product Images (media)
export const shopifyProductImages = pgTable("shopify_product_images", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  shopifyId: text("shopify_id"), // Shopify media GID (if available)

  // Relationships
  productId: varchar("product_id").notNull().references(() => shopifyProducts.id, { onDelete: "cascade" }),
  variantId: varchar("variant_id").references(() => shopifyProductVariants.id, { onDelete: "set null" }), // Optional: variant-specific image

  // Media data
  url: text("url").notNull(),
  altText: text("alt_text"),
  mediaContentType: text("media_content_type").notNull().default("IMAGE"), // "IMAGE", "VIDEO", "MODEL_3D"
  position: integer("position").default(0), // Display order

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Shopify Sync Log (track sync operations)
export const shopifySyncLog = pgTable("shopify_sync_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),

  // Sync details
  syncType: text("sync_type").notNull(), // "FULL", "INCREMENTAL", "SINGLE_PRODUCT"
  status: text("status").notNull(), // "IN_PROGRESS", "SUCCESS", "FAILED", "CANCELLED"

  // Statistics
  productsProcessed: integer("products_processed").default(0),
  productsCreated: integer("products_created").default(0),
  productsUpdated: integer("products_updated").default(0),
  errorCount: integer("error_count").default(0),

  // Timing
  startedAt: timestamp("started_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
  duration: integer("duration"), // Seconds

  // Error tracking
  errorMessage: text("error_message"),
  errorDetails: jsonb("error_details"),

  // Metadata
  metadata: jsonb("metadata"), // Store additional sync info

  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Shopify Sync Errors (product-level error tracking for debugging)
export const shopifySyncErrors = pgTable("shopify_sync_errors", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),

  // Link to parent sync session
  syncLogId: varchar("sync_log_id").references(() => shopifySyncLog.id, { onDelete: "cascade" }),

  // Product identification
  shopifyProductId: text("shopify_product_id"), // Shopify GID or numeric ID
  productTitle: text("product_title"),
  productHandle: text("product_handle"),
  localProductId: varchar("local_product_id").references(() => products.id, { onDelete: "set null" }),

  // Error categorization
  errorType: text("error_type").notNull(), // "GRAPHQL_ERROR", "VALIDATION_ERROR", "RATE_LIMIT", "NETWORK_ERROR", "DATABASE_ERROR", "VARIANT_ERROR", "COLLECTION_ERROR", "UNKNOWN"
  errorCode: text("error_code"), // Shopify error code if available
  errorMessage: text("error_message").notNull(),
  errorStack: text("error_stack"), // Full stack trace for debugging

  // Context for debugging
  operation: text("operation").notNull(), // "CREATE", "UPDATE", "DELETE", "SYNC_VARIANTS", "SYNC_COLLECTIONS", "FETCH"
  requestData: jsonb("request_data"), // What was sent to Shopify
  responseData: jsonb("response_data"), // What Shopify returned (if any)

  // Resolution tracking
  status: text("status").notNull().default("unresolved"), // "unresolved", "resolved", "ignored", "retry_pending"
  resolvedAt: timestamp("resolved_at"),
  resolvedBy: varchar("resolved_by"),
  resolution: text("resolution"), // How it was resolved
  retryCount: integer("retry_count").default(0),
  lastRetryAt: timestamp("last_retry_at"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  syncLogIdx: index("sync_errors_sync_log_idx").on(table.syncLogId),
  shopifyProductIdx: index("sync_errors_shopify_product_idx").on(table.shopifyProductId),
  errorTypeIdx: index("sync_errors_error_type_idx").on(table.errorType),
  statusIdx: index("sync_errors_status_idx").on(table.status),
  createdAtIdx: index("sync_errors_created_at_idx").on(table.createdAt),
}));

// Product Sync Changelog - tracks field-level changes during sync
// NOTE: Shopify API does NOT provide "who made changes" for product updates.
// This requires Shopify Plus (Audit Events Webhook). See planning docs for details.
// Currently tracks: WHAT changed, WHEN it changed - but NOT WHO changed it in Shopify.
export const productSyncChangelog = pgTable("product_sync_changelog", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  syncLogId: varchar("sync_log_id").references(() => shopifySyncLog.id, { onDelete: "cascade" }),
  productId: varchar("product_id").references(() => products.id, { onDelete: "cascade" }),
  shopifyProductId: text("shopify_product_id"),
  productTitle: text("product_title").notNull(),
  variantId: varchar("variant_id").references(() => productVariants.id, { onDelete: "cascade" }),
  shopifyVariantId: text("shopify_variant_id"),
  variantTitle: text("variant_title"),
  field: text("field").notNull(),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  changeType: text("change_type").notNull().default("update"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  syncLogIdx: index("sync_changelog_sync_log_idx").on(table.syncLogId),
  productIdx: index("sync_changelog_product_idx").on(table.productId),
  tenantIdx: index("sync_changelog_tenant_idx").on(table.tenantId),
  createdAtIdx: index("sync_changelog_created_at_idx").on(table.createdAt),
}));

// Collection Sync Changelog - tracks all collection changes during sync (creates, updates, deletes)
export const collectionSyncChangelog = pgTable("collection_sync_changelog", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  syncLogId: varchar("sync_log_id").references(() => shopifySyncLog.id, { onDelete: "cascade" }),
  collectionId: varchar("collection_id"), // Local collection ID (null if deleted)
  shopifyCollectionId: text("shopify_collection_id"),
  collectionName: text("collection_name").notNull(),
  collectionHandle: text("collection_handle"),
  collectionType: text("collection_type"), // "smart" or "manual"
  productCount: integer("product_count").default(0),
  changeType: text("change_type").notNull(), // "created", "updated", "deleted"
  changeDetails: jsonb("change_details"), // Additional details about what changed
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  syncLogIdx: index("coll_changelog_sync_log_idx").on(table.syncLogId),
  collectionIdx: index("coll_changelog_collection_idx").on(table.collectionId),
  tenantIdx: index("coll_changelog_tenant_idx").on(table.tenantId),
  createdAtIdx: index("coll_changelog_created_at_idx").on(table.createdAt),
  changeTypeIdx: index("coll_changelog_change_type_idx").on(table.changeType),
}));

// Shopify Sync Settings (user preferences for auto-sync)
export const shopifySyncSettings = pgTable("shopify_sync_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),

  // Auto sync settings
  autoSyncEnabled: boolean("auto_sync_enabled").default(false).notNull(),
  syncFrequency: text("sync_frequency").default("daily").notNull(), // "hourly", "daily", "weekly"
  lastAutoSync: timestamp("last_auto_sync"),
  nextAutoSync: timestamp("next_auto_sync"),

  // Sync preferences
  syncAllStatuses: boolean("sync_all_statuses").default(true).notNull(), // active, draft, archived

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Shopify Pending Updates (queue for bi-directional sync - future phase)
export const shopifyPendingUpdates = pgTable("shopify_pending_updates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),

  productId: varchar("product_id").notNull().references(() => shopifyProducts.id, { onDelete: "cascade" }),
  updateType: text("update_type").notNull(), // "product", "variant", "image"
  updateData: jsonb("update_data").notNull(),

  status: text("status").notNull().default("pending"), // "pending", "syncing", "success", "failed"
  retryCount: integer("retry_count").default(0),

  error: text("error"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Shopify Bulk Operations (for bulk edit - future phase)
export const shopifyBulkOperations = pgTable("shopify_bulk_operations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),

  // Operation details
  operationType: text("operation_type").notNull(), // "update_status", "update_vendor", "update_tags", "update_price"
  targetCount: integer("target_count").notNull(), // How many products to update

  // Status tracking
  status: text("status").notNull().default("pending"), // "pending", "in_progress", "completed", "failed", "cancelled"
  processedCount: integer("processed_count").default(0),
  successCount: integer("success_count").default(0),
  errorCount: integer("error_count").default(0),

  // Timing
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  duration: integer("duration"), // seconds

  // User context
  userId: varchar("user_id").notNull().references(() => users.id),

  // Change data
  changeData: jsonb("change_data").notNull(), // What changes to apply

  // Results
  errors: jsonb("errors"), // Array of { productId, error }

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Shopify Bulk Operation Items (individual products in a bulk operation)
export const shopifyBulkOperationItems = pgTable("shopify_bulk_operation_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),

  bulkOperationId: varchar("bulk_operation_id").notNull().references(() => shopifyBulkOperations.id, { onDelete: "cascade" }),
  productId: varchar("product_id").notNull().references(() => shopifyProducts.id),

  status: text("status").notNull().default("pending"), // "pending", "processing", "success", "failed"
  error: text("error"),

  // Before/after for audit trail
  dataBefore: jsonb("data_before"),
  dataAfter: jsonb("data_after"),

  processedAt: timestamp("processed_at"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Shopify Standard Product Taxonomy (11,771+ categories from Shopify)
// https://shopify.github.io/product-taxonomy/
export const productCategories = pgTable("product_categories", {
  id: varchar("id", { length: 50 }).primaryKey(), // "aa-1-13-13"
  gid: varchar("gid", { length: 200 }).notNull().unique(), // Full GID: gid://shopify/TaxonomyCategory/aa-1-13-13
  path: text("path").notNull(), // "Apparel & Accessories > Clothing > Clothing Tops > Hoodies"
  name: varchar("name", { length: 200 }).notNull(), // Just "Hoodies"
  parentId: varchar("parent_id", { length: 50 }), // "aa-1-13" (references parent category)
  level: integer("level").notNull(), // 4 (depth in hierarchy)

  // Google category mapping (auto-mapped by Shopify)
  googleCategoryId: varchar("google_category_id", { length: 50 }), // "212"
  googleCategoryPath: text("google_category_path"), // Google taxonomy path

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// User UI Preferences (save user's column preferences, view mode, etc.)
export const userUiPreferences = pgTable("user_ui_preferences", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),

  // Products page preferences
  productsViewMode: text("products_view_mode").default("table"), // "table", "grid"
  productsVisibleColumns: text("products_visible_columns").array().default(
    sql`ARRAY['title', 'status', 'inventory', 'productType', 'vendor']::text[]`
  ),
  productsColumnOrder: text("products_column_order").array(),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// API Integrations table (OAuth tokens for external services)
export const apiIntegrations = pgTable("api_integrations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),

  // Integration type and authentication
  provider: text("provider").notNull(), // "google_ads", "facebook_ads", etc.
  isActive: boolean("is_active").default(true).notNull(),

  // OAuth tokens (encrypted in production)
  // Note: refreshToken is nullable because API-key integrations (like Claude) don't use refresh tokens
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  tokenExpiresAt: timestamp("token_expires_at"),

  // Provider-specific config (stored as JSON)
  config: jsonb("config"), // { customerId, loginCustomerId, etc. }

  // Metadata
  connectedBy: varchar("connected_by").references(() => users.id),
  lastUsedAt: timestamp("last_used_at"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ============================================
// TENANT REGISTRATION TABLES
// ============================================

// Verification Codes - for email verification during registration
export const verificationCodes = pgTable('verification_codes', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  email: varchar('email', { length: 255 }).notNull(),
  code: varchar('code', { length: 6 }).notNull(),
  purpose: varchar('purpose', { length: 50 }).notNull().default('registration'),
  attempts: integer('attempts').default(0),
  maxAttempts: integer('max_attempts').default(5),
  expiresAt: timestamp('expires_at').notNull(),
  verifiedAt: timestamp('verified_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Invitations - for team member invitations
export const invitations = pgTable('invitations', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  email: varchar('email', { length: 255 }).notNull(),
  role: varchar('role', { length: 50 }).notNull().default('member'),
  token: varchar('token', { length: 64 }).unique().notNull(),
  invitedBy: varchar('invited_by').references(() => users.id, { onDelete: 'set null' }),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  expiresAt: timestamp('expires_at').notNull(),
  acceptedAt: timestamp('accepted_at'),
  acceptedBy: varchar('accepted_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Registration Audit Log - for compliance and debugging
export const registrationAuditLog = pgTable('registration_audit_log', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  eventType: varchar('event_type', { length: 50 }).notNull(),
  email: varchar('email', { length: 255 }),
  tenantId: varchar('tenant_id').references(() => tenants.id, { onDelete: 'set null' }),
  userId: varchar('user_id').references(() => users.id, { onDelete: 'set null' }),
  ipAddress: varchar('ip_address', { length: 45 }),
  userAgent: text('user_agent'),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// =============================================================================
// WEIGHT RULES SYSTEM TABLES
// =============================================================================

// Weight Categories table (defines weight values for product categories like "TOPS", "BOTTOMS")
export const weightCategories = pgTable("weight_categories", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  categoryName: varchar("category_name", { length: 255 }).notNull(),
  weightValue: text("weight_value").notNull(), // Using text for decimal precision
  weightUnit: varchar("weight_unit", { length: 20 }).notNull().default("POUNDS"),
  source: varchar("source", { length: 20 }).notNull().default("manual"), // 'excel_import' or 'manual'
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdBy: varchar("created_by").references(() => users.id),
}, (table) => ({
  tenantIdx: index("weight_categories_tenant_idx").on(table.tenantId),
  tenantCategoryUniqueIdx: index("weight_categories_tenant_category_unique_idx").on(table.tenantId, table.categoryName),
}));

// Product Type to Weight Category Mappings table
export const productTypeWeightMappings = pgTable("product_type_weight_mappings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  productType: varchar("product_type", { length: 255 }).notNull(),
  weightCategoryId: varchar("weight_category_id").notNull().references(() => weightCategories.id, { onDelete: "cascade" }),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdBy: varchar("created_by").references(() => users.id),
}, (table) => ({
  tenantActiveIdx: index("product_type_weight_mappings_tenant_active_idx").on(table.tenantId, table.isActive),
  productTypeIdx: index("product_type_weight_mappings_product_type_idx").on(table.productType),
  weightCategoryIdx: index("product_type_weight_mappings_weight_category_idx").on(table.weightCategoryId),
}));

// Weight Discrepancies table (tracks products with weight mismatches)
export const weightDiscrepancies = pgTable("weight_discrepancies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  productId: varchar("product_id").references(() => products.id, { onDelete: "set null" }),
  variantId: varchar("variant_id").references(() => productVariants.id, { onDelete: "set null" }),
  shopifyVariantId: text("shopify_variant_id"),
  productTitle: text("product_title").notNull(),
  variantTitle: text("variant_title"),
  sku: text("sku"),
  productType: text("product_type"),
  expectedWeight: text("expected_weight").notNull(),
  expectedUnit: varchar("expected_unit", { length: 20 }).notNull(),
  actualWeight: text("actual_weight").notNull(),
  actualUnit: varchar("actual_unit", { length: 20 }).notNull(),
  mappingId: varchar("mapping_id").references(() => productTypeWeightMappings.id, { onDelete: "set null" }),
  categoryId: varchar("category_id").references(() => weightCategories.id, { onDelete: "set null" }),
  status: varchar("status", { length: 30 }).default("pending").notNull(),
  resolvedAt: timestamp("resolved_at"),
  resolvedBy: varchar("resolved_by").references(() => users.id),
  resolutionNotes: text("resolution_notes"),
  detectedAt: timestamp("detected_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  tenantStatusIdx: index("weight_discrepancies_tenant_status_idx").on(table.tenantId, table.status),
  detectedAtIdx: index("weight_discrepancies_detected_at_idx").on(table.detectedAt),
}));

// =============================================================================
// SSF-OWNED INVENTORY TABLES (PUBLIC SCHEMA)
// =============================================================================
// These tables are defined above in this file:
// - items: Product catalog synced from tenant data sources (replaces qbInventory)
// - ssfLocations: Store locations (replaces locations)
// - itemLevels: Inventory quantities per item per location (replaces inventoryLevels)
// - tenantIntegrations: Data sync source configuration
// - syncLogs: Sync operation history
//
// Updated: December 18, 2025 - Restructured to SSF-owned tables in public schema
// =============================================================================

// =============================================================================
// AI INTEGRATION TABLES
// =============================================================================

// Platform-level AI defaults (SuperAdmin manages these)
// Stores default API keys and rate limits for each AI provider
export const platformAiDefaults = pgTable("platform_ai_defaults", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  provider: varchar("provider", { length: 50 }).notNull().unique(), // 'gemini', 'openai', 'anthropic'
  apiKeyEncrypted: text("api_key_encrypted").notNull(),
  defaultModel: varchar("default_model", { length: 100 }),
  rateLimitFree: integer("rate_limit_free").default(50),    // requests/day for free tier
  rateLimitPro: integer("rate_limit_pro").default(500),     // requests/day for pro tier
  rateLimitEnterprise: integer("rate_limit_enterprise").default(5000), // requests/day for enterprise
  isEnabled: boolean("is_enabled").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Platform-level prompt templates (global defaults)
// These are the default templates that all tenants can use
export const platformPromptTemplates = pgTable("platform_prompt_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  slug: varchar("slug", { length: 100 }).notNull().unique(),  // 'product-description', 'bullet-points'
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 100 }).notNull(),   // 'content', 'seo', 'extraction'
  templateContent: text("template_content").notNull(),
  systemPrompt: text("system_prompt"),
  variables: jsonb("variables").default([]),                   // [{name, type, required, default, description}]
  defaultModel: varchar("default_model", { length: 100 }),
  defaultTemperature: numeric("default_temperature", { precision: 3, scale: 2 }).default("0.7"),
  maxTokens: integer("max_tokens"),
  outputFormat: varchar("output_format", { length: 50 }).default("text"), // 'text', 'json', 'markdown', 'html'
  isActive: boolean("is_active").default(true).notNull(),
  version: varchar("version", { length: 20 }).default("1.0.0"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  categoryIdx: index("platform_prompt_templates_category_idx").on(table.category),
  slugIdx: index("platform_prompt_templates_slug_idx").on(table.slug),
}));

// Tenant AI configuration
// Each tenant has one config record for their AI settings
export const tenantAiConfig = pgTable("tenant_ai_config", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }).unique(),
  tier: aiTierEnum("tier").default("free").notNull(),         // 'free', 'pro', 'enterprise'
  defaultProvider: varchar("default_provider", { length: 50 }).default("gemini"),
  fallbackProvider: varchar("fallback_provider", { length: 50 }),
  monthlyTokenLimit: integer("monthly_token_limit"),          // Custom token limit (null = use tier default)
  tokensUsedThisMonth: integer("tokens_used_this_month").default(0),
  tokenResetDate: timestamp("token_reset_date"),              // When monthly tokens reset
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index("tenant_ai_config_tenant_idx").on(table.tenantId),
}));

// Tenant's configured AI providers (BYOK - Bring Your Own Key)
// Allows tenants to use their own API keys for AI providers
export const tenantAiProviders = pgTable("tenant_ai_providers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  provider: varchar("provider", { length: 50 }).notNull(),     // 'gemini', 'openai', 'anthropic'
  apiKeyEncrypted: text("api_key_encrypted"),                  // NULL = use platform default
  usePlatformDefault: boolean("use_platform_default").default(true).notNull(),
  additionalConfig: jsonb("additional_config"),                // org_id, endpoint, custom settings
  isEnabled: boolean("is_enabled").default(true).notNull(),
  isDefault: boolean("is_default").default(false).notNull(),
  lastTestedAt: timestamp("last_tested_at"),
  lastTestStatus: varchar("last_test_status", { length: 20 }), // 'success', 'error'
  lastTestError: text("last_test_error"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantProviderIdx: uniqueIndex("tenant_ai_providers_tenant_provider_idx").on(table.tenantId, table.provider),
  tenantIdx: index("tenant_ai_providers_tenant_idx").on(table.tenantId),
}));

// Tenant's custom prompt templates (overrides or new templates)
// Tenants can override platform templates or create their own
export const tenantPromptTemplates = pgTable("tenant_prompt_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),

  // Template identification
  slug: varchar("slug", { length: 100 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 100 }).notNull(),

  // Inheritance (NULL = standalone template, not an override)
  parentTemplateId: varchar("parent_template_id").references(() => platformPromptTemplates.id, { onDelete: "set null" }),

  // Template content
  templateContent: text("template_content").notNull(),
  systemPrompt: text("system_prompt"),
  variables: jsonb("variables").default([]),

  // AI settings
  preferredProvider: varchar("preferred_provider", { length: 50 }),
  preferredModel: varchar("preferred_model", { length: 100 }),
  temperature: numeric("temperature", { precision: 3, scale: 2 }),
  maxTokens: integer("max_tokens"),
  outputFormat: varchar("output_format", { length: 50 }),

  // Metadata
  isActive: boolean("is_active").default(true).notNull(),
  version: varchar("version", { length: 20 }).default("1.0.0"),
  usageCount: integer("usage_count").default(0).notNull(),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdBy: varchar("created_by").references(() => users.id, { onDelete: "set null" }),
}, (table) => ({
  tenantSlugIdx: uniqueIndex("tenant_prompt_templates_tenant_slug_idx").on(table.tenantId, table.slug),
  tenantIdx: index("tenant_prompt_templates_tenant_idx").on(table.tenantId),
  categoryIdx: index("tenant_prompt_templates_category_idx").on(table.category),
  parentIdx: index("tenant_prompt_templates_parent_idx").on(table.parentTemplateId),
}));

// Template version history (audit trail for template changes)
export const tenantPromptTemplateVersions = pgTable("tenant_prompt_template_versions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  templateId: varchar("template_id").notNull().references(() => tenantPromptTemplates.id, { onDelete: "cascade" }),
  version: varchar("version", { length: 20 }).notNull(),
  templateContent: text("template_content").notNull(),
  systemPrompt: text("system_prompt"),
  variables: jsonb("variables"),
  changeSummary: text("change_summary"),
  changedBy: varchar("changed_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  templateVersionIdx: uniqueIndex("tenant_template_versions_template_version_idx").on(table.templateId, table.version),
  templateIdx: index("tenant_template_versions_template_idx").on(table.templateId),
}));

// Feature-specific template assignments
// Maps features to specific templates (tenant override or platform default)
export const tenantFeatureTemplates = pgTable("tenant_feature_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  feature: varchar("feature", { length: 100 }).notNull(),      // 'product_description', 'bullet_points', etc.
  templateId: varchar("template_id").references(() => tenantPromptTemplates.id, { onDelete: "set null" }), // NULL = use platform default
  usePlatformDefault: boolean("use_platform_default").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantFeatureIdx: uniqueIndex("tenant_feature_templates_tenant_feature_idx").on(table.tenantId, table.feature),
  tenantIdx: index("tenant_feature_templates_tenant_idx").on(table.tenantId),
}));

// User's saved/favorited templates
// Allows users to save templates with custom default values
export const userSavedTemplates = pgTable("user_saved_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  templateId: varchar("template_id").notNull(),                // Can be platform or tenant template ID
  templateType: templateSourceEnum("template_type").notNull(), // 'platform' or 'tenant'
  customDefaults: jsonb("custom_defaults").default({}),        // User's preferred variable values
  isFavorite: boolean("is_favorite").default(false).notNull(),
  lastUsedAt: timestamp("last_used_at"),
  useCount: integer("use_count").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userTemplateTypeIdx: uniqueIndex("user_saved_templates_user_template_type_idx").on(table.userId, table.templateId, table.templateType),
  userIdx: index("user_saved_templates_user_idx").on(table.userId),
  favoriteIdx: index("user_saved_templates_favorite_idx").on(table.userId, table.isFavorite),
}));

// AI usage tracking log
// Records every AI API call for analytics, billing, and debugging
export const aiUsageLog = pgTable("ai_usage_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  userId: varchar("user_id").references(() => users.id, { onDelete: "set null" }),
  provider: varchar("provider", { length: 50 }).notNull(),
  model: varchar("model", { length: 100 }),
  feature: varchar("feature", { length: 100 }),                // 'product_description', 'bullet_points', etc.
  templateId: varchar("template_id"),                          // Template used (if any)
  tokensInput: integer("tokens_input"),
  tokensOutput: integer("tokens_output"),
  costEstimate: numeric("cost_estimate", { precision: 10, scale: 6 }),
  durationMs: integer("duration_ms"),
  success: boolean("success").notNull(),
  errorMessage: text("error_message"),
  usedPlatformKey: boolean("used_platform_key").default(true).notNull(), // Track if platform or BYOK
  requestMetadata: jsonb("request_metadata"),                  // Additional request context
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  tenantDateIdx: index("ai_usage_log_tenant_date_idx").on(table.tenantId, table.createdAt),
  featureIdx: index("ai_usage_log_feature_idx").on(table.feature),
  userIdx: index("ai_usage_log_user_idx").on(table.userId),
  providerIdx: index("ai_usage_log_provider_idx").on(table.provider),
}));

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  assignedTasks: many(tasks, { relationName: "assignedTo" }),
  createdTasks: many(tasks, { relationName: "createdBy" }),
  auditEntries: many(auditLog),
  notifications: many(notifications),
}));

export const vendorsRelations = relations(vendors, ({ many }) => ({
  products: many(products),
  tasks: many(tasks),
  sizeCharts: many(brandSizeCharts),      // Brand size charts
  productCache: many(brandProductCache),  // Cached product data from brand website
  styleNumberMappings: many(styleNumberMappings), // Style number to product mappings
}));

export const categoriesRelations = relations(categories, ({ many }) => ({
  products: many(products),
}));

export const collectionsRelations = relations(collections, ({ many }) => ({
  productCollections: many(productCollections),
  healthIssues: many(collectionHealthIssues),
}));

// Collection Health System relations
export const navigationMenusRelations = relations(navigationMenus, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [navigationMenus.tenantId],
    references: [tenants.id],
  }),
  items: many(navigationItems),
}));

export const navigationItemsRelations = relations(navigationItems, ({ one }) => ({
  tenant: one(tenants, {
    fields: [navigationItems.tenantId],
    references: [tenants.id],
  }),
  menu: one(navigationMenus, {
    fields: [navigationItems.menuId],
    references: [navigationMenus.id],
  }),
}));

export const collectionHealthIssuesRelations = relations(collectionHealthIssues, ({ one }) => ({
  tenant: one(tenants, {
    fields: [collectionHealthIssues.tenantId],
    references: [tenants.id],
  }),
  collection: one(collections, {
    fields: [collectionHealthIssues.collectionId],
    references: [collections.id],
  }),
  menu: one(navigationMenus, {
    fields: [collectionHealthIssues.menuId],
    references: [navigationMenus.id],
  }),
  resolvedByUser: one(users, {
    fields: [collectionHealthIssues.resolvedBy],
    references: [users.id],
  }),
}));

// Education Center relations
export const educationArticlesRelations = relations(educationArticles, () => ({}));

export const appEducationLibraryRelations = relations(appEducationLibrary, ({ many }) => ({
  tenantApps: many(tenantDetectedApps),
}));

export const tenantDetectedAppsRelations = relations(tenantDetectedApps, ({ one }) => ({
  tenant: one(tenants, {
    fields: [tenantDetectedApps.tenantId],
    references: [tenants.id],
  }),
  libraryApp: one(appEducationLibrary, {
    fields: [tenantDetectedApps.libraryAppId],
    references: [appEducationLibrary.id],
  }),
}));

export const productCollectionsRelations = relations(productCollections, ({ one }) => ({
  product: one(products, {
    fields: [productCollections.productId],
    references: [products.id],
  }),
  collection: one(collections, {
    fields: [productCollections.collectionId],
    references: [collections.id],
  }),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  vendor: one(vendors, {
    fields: [products.vendorId],
    references: [vendors.id],
  }),
  categoryRel: one(categories, {
    fields: [products.categoryId],
    references: [categories.id],
  }),
  tasks: many(tasks),
  statusHistory: many(productStatusHistory),
  options: many(productOptions), // NEW: Product options (Size, Color, etc.)
  variants: many(productVariants), // NEW: Product variants (Small/Red, Medium/Blue, etc.)
  productCollections: many(productCollections), // Product collections (many-to-many)
  media: many(productMedia), // NEW: Product media (images, videos, etc.)
}));

export const productStatusHistoryRelations = relations(productStatusHistory, ({ one }) => ({
  product: one(products, {
    fields: [productStatusHistory.productId],
    references: [products.id],
  }),
  shopifyProduct: one(shopifyProducts, {
    fields: [productStatusHistory.shopifyProductId],
    references: [shopifyProducts.id],
  }),
  changedByUser: one(users, {
    fields: [productStatusHistory.changedBy],
    references: [users.id],
  }),
}));

// NEW: Product Options Relations
export const productOptionsRelations = relations(productOptions, ({ one }) => ({
  product: one(products, {
    fields: [productOptions.productId],
    references: [products.id],
  }),
}));

// NEW: Product Variants Relations
export const productVariantsRelations = relations(productVariants, ({ one, many }) => ({
  product: one(products, {
    fields: [productVariants.productId],
    references: [products.id],
  }),
  media: many(variantMedia),
}));

// Files system relations
export const filesRelations = relations(files, ({ one, many }) => ({
  uploadedByUser: one(users, {
    fields: [files.uploadedBy],
    references: [users.id],
  }),
  productMedia: many(productMedia),
  variantMedia: many(variantMedia),
  references: many(fileReferences),
}));

export const productMediaRelations = relations(productMedia, ({ one }) => ({
  product: one(products, {
    fields: [productMedia.productId],
    references: [products.id],
  }),
  file: one(files, {
    fields: [productMedia.fileId],
    references: [files.id],
  }),
}));

export const variantMediaRelations = relations(variantMedia, ({ one }) => ({
  variant: one(productVariants, {
    fields: [variantMedia.variantId],
    references: [productVariants.id],
  }),
  file: one(files, {
    fields: [variantMedia.fileId],
    references: [files.id],
  }),
}));

export const fileReferencesRelations = relations(fileReferences, ({ one }) => ({
  file: one(files, {
    fields: [fileReferences.fileId],
    references: [files.id],
  }),
}));

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  product: one(products, {
    fields: [tasks.productId],
    references: [products.id],
  }),
  vendor: one(vendors, {
    fields: [tasks.vendorId],
    references: [vendors.id],
  }),
  assignee: one(users, {
    fields: [tasks.assignedTo],
    references: [users.id],
    relationName: "assignedTo",
  }),
  creator: one(users, {
    fields: [tasks.createdBy],
    references: [users.id],
    relationName: "createdBy",
  }),
  auditEntries: many(auditLog),
  steps: many(taskSteps), // Task steps (checklist items)
}));

export const auditLogRelations = relations(auditLog, ({ one }) => ({
  task: one(tasks, {
    fields: [auditLog.taskId],
    references: [tasks.id],
  }),
  user: one(users, {
    fields: [auditLog.userId],
    references: [users.id],
  }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
  }),
  task: one(tasks, {
    fields: [notifications.taskId],
    references: [tasks.id],
  }),
}));

export const taskStepsRelations = relations(taskSteps, ({ one }) => ({
  task: one(tasks, {
    fields: [taskSteps.taskId],
    references: [tasks.id],
  }),
  completedByUser: one(users, {
    fields: [taskSteps.completedBy],
    references: [users.id],
  }),
}));

// stepTemplates has no relations (standalone reference data)

export const shopifyStoresRelations = relations(shopifyStores, ({ many }) => ({
  productMappings: many(shopifyProductMappings),
}));

export const shopifyProductMappingsRelations = relations(shopifyProductMappings, ({ one }) => ({
  product: one(products, {
    fields: [shopifyProductMappings.productId],
    references: [products.id],
  }),
  shopifyStore: one(shopifyStores, {
    fields: [shopifyProductMappings.shopifyStoreId],
    references: [shopifyStores.id],
  }),
}));

export const brandSizeChartsRelations = relations(brandSizeCharts, ({ one }) => ({
  vendor: one(vendors, {
    fields: [brandSizeCharts.vendorId],
    references: [vendors.id],
  }),
}));

export const brandProductCacheRelations = relations(brandProductCache, ({ one }) => ({
  vendor: one(vendors, {
    fields: [brandProductCache.vendorId],
    references: [vendors.id],
  }),
}));

export const styleNumberMappingsRelations = relations(styleNumberMappings, ({ one }) => ({
  vendor: one(vendors, {
    fields: [styleNumberMappings.vendorId],
    references: [vendors.id],
  }),
  createdByUser: one(users, {
    fields: [styleNumberMappings.createdBy],
    references: [users.id],
  }),
}));

// Shopify Products Relations
export const shopifyProductsRelations = relations(shopifyProducts, ({ one, many }) => ({
  vendor: one(vendors, {
    fields: [shopifyProducts.vendorId],
    references: [vendors.id],
  }),
  variants: many(shopifyProductVariants),
  images: many(shopifyProductImages),
  pendingUpdates: many(shopifyPendingUpdates),
  bulkOperationItems: many(shopifyBulkOperationItems),
}));

export const shopifyProductVariantsRelations = relations(shopifyProductVariants, ({ one, many }) => ({
  product: one(shopifyProducts, {
    fields: [shopifyProductVariants.productId],
    references: [shopifyProducts.id],
  }),
  images: many(shopifyProductImages),
}));

export const shopifyProductImagesRelations = relations(shopifyProductImages, ({ one }) => ({
  product: one(shopifyProducts, {
    fields: [shopifyProductImages.productId],
    references: [shopifyProducts.id],
  }),
  variant: one(shopifyProductVariants, {
    fields: [shopifyProductImages.variantId],
    references: [shopifyProductVariants.id],
  }),
}));

export const shopifyPendingUpdatesRelations = relations(shopifyPendingUpdates, ({ one }) => ({
  product: one(shopifyProducts, {
    fields: [shopifyPendingUpdates.productId],
    references: [shopifyProducts.id],
  }),
}));

export const shopifyBulkOperationsRelations = relations(shopifyBulkOperations, ({ one, many }) => ({
  user: one(users, {
    fields: [shopifyBulkOperations.userId],
    references: [users.id],
  }),
  items: many(shopifyBulkOperationItems),
}));

export const shopifyBulkOperationItemsRelations = relations(shopifyBulkOperationItems, ({ one }) => ({
  bulkOperation: one(shopifyBulkOperations, {
    fields: [shopifyBulkOperationItems.bulkOperationId],
    references: [shopifyBulkOperations.id],
  }),
  product: one(shopifyProducts, {
    fields: [shopifyBulkOperationItems.productId],
    references: [shopifyProducts.id],
  }),
}));

export const userUiPreferencesRelations = relations(userUiPreferences, ({ one }) => ({
  user: one(users, {
    fields: [userUiPreferences.userId],
    references: [users.id],
  }),
}));

// Tenant Registration Relations
export const verificationCodesRelations = relations(verificationCodes, () => ({}));

export const invitationsRelations = relations(invitations, ({ one }) => ({
  tenant: one(tenants, {
    fields: [invitations.tenantId],
    references: [tenants.id],
  }),
  invitedByUser: one(users, {
    fields: [invitations.invitedBy],
    references: [users.id],
    relationName: "invitedBy",
  }),
  acceptedByUser: one(users, {
    fields: [invitations.acceptedBy],
    references: [users.id],
    relationName: "acceptedBy",
  }),
}));

export const registrationAuditLogRelations = relations(registrationAuditLog, ({ one }) => ({
  tenant: one(tenants, {
    fields: [registrationAuditLog.tenantId],
    references: [tenants.id],
  }),
  user: one(users, {
    fields: [registrationAuditLog.userId],
    references: [users.id],
  }),
}));

// Weight Rules System relations
export const weightCategoriesRelations = relations(weightCategories, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [weightCategories.tenantId],
    references: [tenants.id],
  }),
  createdByUser: one(users, {
    fields: [weightCategories.createdBy],
    references: [users.id],
  }),
  mappings: many(productTypeWeightMappings),
  discrepancies: many(weightDiscrepancies),
}));

export const productTypeWeightMappingsRelations = relations(productTypeWeightMappings, ({ one }) => ({
  tenant: one(tenants, {
    fields: [productTypeWeightMappings.tenantId],
    references: [tenants.id],
  }),
  weightCategory: one(weightCategories, {
    fields: [productTypeWeightMappings.weightCategoryId],
    references: [weightCategories.id],
  }),
  createdByUser: one(users, {
    fields: [productTypeWeightMappings.createdBy],
    references: [users.id],
  }),
}));

export const weightDiscrepanciesRelations = relations(weightDiscrepancies, ({ one }) => ({
  tenant: one(tenants, {
    fields: [weightDiscrepancies.tenantId],
    references: [tenants.id],
  }),
  product: one(products, {
    fields: [weightDiscrepancies.productId],
    references: [products.id],
  }),
  variant: one(productVariants, {
    fields: [weightDiscrepancies.variantId],
    references: [productVariants.id],
  }),
  mapping: one(productTypeWeightMappings, {
    fields: [weightDiscrepancies.mappingId],
    references: [productTypeWeightMappings.id],
  }),
  category: one(weightCategories, {
    fields: [weightDiscrepancies.categoryId],
    references: [weightCategories.id],
  }),
  resolvedByUser: one(users, {
    fields: [weightDiscrepancies.resolvedBy],
    references: [users.id],
  }),
}));

// AI Integration Relations
export const platformAiDefaultsRelations = relations(platformAiDefaults, () => ({}));

export const platformPromptTemplatesRelations = relations(platformPromptTemplates, ({ many }) => ({
  tenantOverrides: many(tenantPromptTemplates),
}));

export const tenantAiConfigRelations = relations(tenantAiConfig, ({ one }) => ({
  tenant: one(tenants, {
    fields: [tenantAiConfig.tenantId],
    references: [tenants.id],
  }),
}));

export const tenantAiProvidersRelations = relations(tenantAiProviders, ({ one }) => ({
  tenant: one(tenants, {
    fields: [tenantAiProviders.tenantId],
    references: [tenants.id],
  }),
}));

export const tenantPromptTemplatesRelations = relations(tenantPromptTemplates, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [tenantPromptTemplates.tenantId],
    references: [tenants.id],
  }),
  parentTemplate: one(platformPromptTemplates, {
    fields: [tenantPromptTemplates.parentTemplateId],
    references: [platformPromptTemplates.id],
  }),
  createdByUser: one(users, {
    fields: [tenantPromptTemplates.createdBy],
    references: [users.id],
  }),
  versions: many(tenantPromptTemplateVersions),
  featureAssignments: many(tenantFeatureTemplates),
}));

export const tenantPromptTemplateVersionsRelations = relations(tenantPromptTemplateVersions, ({ one }) => ({
  template: one(tenantPromptTemplates, {
    fields: [tenantPromptTemplateVersions.templateId],
    references: [tenantPromptTemplates.id],
  }),
  changedByUser: one(users, {
    fields: [tenantPromptTemplateVersions.changedBy],
    references: [users.id],
  }),
}));

export const tenantFeatureTemplatesRelations = relations(tenantFeatureTemplates, ({ one }) => ({
  tenant: one(tenants, {
    fields: [tenantFeatureTemplates.tenantId],
    references: [tenants.id],
  }),
  template: one(tenantPromptTemplates, {
    fields: [tenantFeatureTemplates.templateId],
    references: [tenantPromptTemplates.id],
  }),
}));

export const userSavedTemplatesRelations = relations(userSavedTemplates, ({ one }) => ({
  user: one(users, {
    fields: [userSavedTemplates.userId],
    references: [users.id],
  }),
}));

export const aiUsageLogRelations = relations(aiUsageLog, ({ one }) => ({
  tenant: one(tenants, {
    fields: [aiUsageLog.tenantId],
    references: [tenants.id],
  }),
  user: one(users, {
    fields: [aiUsageLog.userId],
    references: [users.id],
  }),
}));

// Schemas for validation
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertVendorSchema = createInsertSchema(vendors, {
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Color must be a valid hex color (e.g., #3b82f6)").optional().nullable(),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCategorySchema = createInsertSchema(categories, {
  name: z.string().min(1, "Name is required").max(100, "Name must be less than 100 characters"),
  description: z.string().max(500, "Description must be less than 500 characters").optional().nullable(),
  slug: z.string().min(1, "Slug is required").regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, and dashes only"),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Color must be a valid hex color (e.g., #3b82f6)").optional().nullable(),
}).omit({
  id: true,
  productCount: true,
  createdAt: true,
  updatedAt: true,
});

// Tag schema
export const insertTagSchema = createInsertSchema(tags, {
  name: z.string().min(1, "Name is required").max(255, "Name must be less than 255 characters"),
  normalizedName: z.string().min(1).max(255),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Color must be a valid hex color").optional().nullable(),
}).omit({
  id: true,
  productCount: true,
  shopifySynced: true,
  lastSyncedAt: true,
  createdAt: true,
  updatedAt: true,
});

// Smart Collection Rule Schema (matches Shopify SmartCollection API)
// Accepts both lowercase (our format) and uppercase (Shopify format) values
const columnValues = [
  "title", "TITLE",
  "type", "TYPE",
  "vendor", "VENDOR",
  "variant_title", "VARIANT_TITLE",
  "tag", "TAG",
  "variant_price", "VARIANT_PRICE",
  "variant_compare_at_price", "VARIANT_COMPARE_AT_PRICE",
  "variant_weight", "VARIANT_WEIGHT",
  "variant_inventory", "VARIANT_INVENTORY",
] as const;

const relationValues = [
  "equals", "EQUALS",
  "not_equals", "NOT_EQUALS",
  "starts_with", "STARTS_WITH",
  "ends_with", "ENDS_WITH",
  "contains", "CONTAINS",
  "not_contains", "NOT_CONTAINS",
  "greater_than", "GREATER_THAN",
  "less_than", "LESS_THAN",
] as const;

export const smartCollectionRuleSchema = z.object({
  column: z.enum(columnValues),
  relation: z.enum(relationValues),
  condition: z.string().min(1, "Condition value is required"),
});

export const smartCollectionRulesSchema = z.object({
  rules: z.array(smartCollectionRuleSchema).max(60, "Maximum 60 conditions allowed"),
  // Support both field names for backwards compatibility with Shopify data
  disjunctive: z.boolean().default(false).optional(),
  appliedDisjunctively: z.boolean().optional(),
}).transform((data) => ({
  rules: data.rules,
  // Normalize to disjunctive, preferring disjunctive if both are present
  disjunctive: data.disjunctive ?? data.appliedDisjunctively ?? false,
}));

export const insertCollectionSchema = createInsertSchema(collections, {
  name: z.string().min(1, "Name is required").max(200, "Name must be less than 200 characters"),
  description: z.string().max(5000, "Description must be less than 5000 characters").optional().nullable(),
  // SEO fields
  metaTitle: z.string().max(70, "Meta title must be less than 70 characters").optional().nullable(),
  metaDescription: z.string().max(170, "Meta description must be less than 170 characters").optional().nullable(),
  // Slug is optional in input - will be auto-generated from name if not provided
  // Note: Storage layer ensures slug is always set before database insert
  slug: z.string().regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, and dashes only").optional(),
  // Shopify type: manual or smart
  shopifyType: z.enum(["manual", "smart"]).default("manual").optional(),
  // Smart collection rules (only for smart collections)
  rules: smartCollectionRulesSchema.optional().nullable(),
}).omit({
  id: true,
  productCount: true,
  createdAt: true,
  updatedAt: true,
});

// Collection Health System insert schemas
export const insertNavigationMenuSchema = createInsertSchema(navigationMenus).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertNavigationItemSchema = createInsertSchema(navigationItems).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCollectionHealthIssueSchema = createInsertSchema(collectionHealthIssues).omit({
  id: true,
  detectedAt: true,
  createdAt: true,
  updatedAt: true,
});

// Education Center insert schemas
export const insertEducationArticleSchema = createInsertSchema(educationArticles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertAppEducationLibrarySchema = createInsertSchema(appEducationLibrary).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertTenantDetectedAppSchema = createInsertSchema(tenantDetectedApps).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertProductCollectionSchema = createInsertSchema(productCollections).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertProductSchema = createInsertSchema(products).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  handle: z.string()
    .min(1, "Handle is required")
    .max(60, "Handle should be under 60 characters for optimal SEO")
    .regex(
      /^[a-z0-9-]+$/,
      "Handle must contain only lowercase letters, numbers, and hyphens"
    )
    .refine(
      (val) => !val.startsWith('-') && !val.endsWith('-'),
      "Handle cannot start or end with a hyphen"
    )
    .optional(),
});

export const insertProductOptionSchema = createInsertSchema(productOptions, {
  values: z.array(z.string().min(1)).min(1).max(100),
  position: z.number().min(1).max(3),
  name: z.string().min(1).max(255),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateProductOptionSchema = insertProductOptionSchema.partial();

export const insertProductVariantSchema = createInsertSchema(productVariants).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Files system Zod schemas
export const insertFileSchema = createInsertSchema(files).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateFileSchema = insertFileSchema.partial();

export const insertProductMediaSchema = createInsertSchema(productMedia).omit({
  id: true,
  createdAt: true,
});

export const insertVariantMediaSchema = createInsertSchema(variantMedia).omit({
  id: true,
  createdAt: true,
});

export const insertFileReferenceSchema = createInsertSchema(fileReferences).omit({
  id: true,
  createdAt: true,
});

export const insertProductStatusHistorySchema = createInsertSchema(productStatusHistory).omit({
  id: true,
  createdAt: true,
});

export const insertTaskSchema = createInsertSchema(tasks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertAuditLogSchema = createInsertSchema(auditLog).omit({
  id: true,
  timestamp: true,
});

// Notification category and severity value constants for validation
export const NOTIFICATION_CATEGORIES = ["health", "sync", "quality", "system"] as const;
export const NOTIFICATION_SEVERITIES = ["critical", "warning", "info"] as const;
export const NOTIFICATION_SOURCE_TYPES = [
  "collection_health",
  "weight_discrepancy",
  "sync_error",
  "import",
  "task",
  "quality_score"
] as const;

// Insert schema for notifications
// New notification bell fields have database defaults, so they're optional in inserts
export const insertNotificationSchema = createInsertSchema(notifications, {
  // Override the new fields to be optional (they have DB defaults)
  category: z.enum(NOTIFICATION_CATEGORIES).optional(),
  severity: z.enum(NOTIFICATION_SEVERITIES).optional(),
  sourceType: z.enum(NOTIFICATION_SOURCE_TYPES).nullable().optional(),
  metadata: z.record(z.unknown()).optional(),
}).omit({
  id: true,
  createdAt: true,
});

export const insertTaskStepSchema = createInsertSchema(taskSteps, {
  // id is auto-generated, so exclude from inserts
}).omit({
  createdAt: true,
  updatedAt: true,
});

export const insertStepTemplateSchema = createInsertSchema(stepTemplates, {
  // id is auto-generated, so exclude from inserts
}).omit({
  createdAt: true,
  updatedAt: true,
});

export const insertShopifyStoreSchema = createInsertSchema(shopifyStores).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertShopifyProductMappingSchema = createInsertSchema(shopifyProductMappings).omit({
  id: true,
  publishedAt: true,
  lastSyncAt: true,
  createdAt: true,
});

export const insertDashboardStatsHistorySchema = createInsertSchema(dashboardStatsHistory).omit({
  id: true,
  createdAt: true,
});

export const insertBrandSizeChartSchema = createInsertSchema(brandSizeCharts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertBrandProductCacheSchema = createInsertSchema(brandProductCache).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertStyleNumberMappingSchema = createInsertSchema(styleNumberMappings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertShopifyProductSchema = createInsertSchema(shopifyProducts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertShopifyProductVariantSchema = createInsertSchema(shopifyProductVariants).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertShopifyProductImageSchema = createInsertSchema(shopifyProductImages).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertShopifySyncLogSchema = createInsertSchema(shopifySyncLog).omit({
  id: true,
  createdAt: true,
});

export const insertShopifySyncErrorSchema = createInsertSchema(shopifySyncErrors).omit({
  id: true,
  createdAt: true,
});

export const insertProductSyncChangelogSchema = createInsertSchema(productSyncChangelog).omit({
  id: true,
  createdAt: true,
});

export const insertCollectionSyncChangelogSchema = createInsertSchema(collectionSyncChangelog).omit({
  id: true,
  createdAt: true,
});

export const insertShopifySyncSettingsSchema = createInsertSchema(shopifySyncSettings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertShopifyPendingUpdateSchema = createInsertSchema(shopifyPendingUpdates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertShopifyBulkOperationSchema = createInsertSchema(shopifyBulkOperations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertShopifyBulkOperationItemSchema = createInsertSchema(shopifyBulkOperationItems).omit({
  id: true,
  createdAt: true,
});

export const insertUserUiPreferencesSchema = createInsertSchema(userUiPreferences).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertApiIntegrationSchema = createInsertSchema(apiIntegrations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Tenant Registration insert schemas
export const insertVerificationCodeSchema = createInsertSchema(verificationCodes).omit({
  id: true,
  createdAt: true,
});

export const insertInvitationSchema = createInsertSchema(invitations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertRegistrationAuditLogSchema = createInsertSchema(registrationAuditLog).omit({
  id: true,
  createdAt: true,
});

// Weight Rules System insert schemas
export const insertWeightCategorySchema = createInsertSchema(weightCategories).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertProductTypeWeightMappingSchema = createInsertSchema(productTypeWeightMappings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertWeightDiscrepancySchema = createInsertSchema(weightDiscrepancies).omit({
  id: true,
  createdAt: true,
});

// AI Integration insert schemas
export const insertPlatformAiDefaultSchema = createInsertSchema(platformAiDefaults, {
  provider: z.string().min(1, "Provider is required").max(50),
  apiKeyEncrypted: z.string().min(1, "Encrypted API key is required"),
  defaultModel: z.string().max(100).optional().nullable(),
  rateLimitFree: z.number().int().min(0).optional(),
  rateLimitPro: z.number().int().min(0).optional(),
  rateLimitEnterprise: z.number().int().min(0).optional(),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPlatformPromptTemplateSchema = createInsertSchema(platformPromptTemplates, {
  slug: z.string().min(1, "Slug is required").max(100).regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, and dashes only"),
  name: z.string().min(1, "Name is required").max(255),
  category: z.string().min(1, "Category is required").max(100),
  templateContent: z.string().min(1, "Template content is required"),
  systemPrompt: z.string().optional().nullable(),
  variables: z.array(z.object({
    name: z.string(),
    type: z.string(),
    required: z.boolean().optional(),
    default: z.string().optional(),
    description: z.string().optional(),
  })).optional(),
  defaultModel: z.string().max(100).optional().nullable(),
  defaultTemperature: z.string().optional(),
  maxTokens: z.number().int().min(1).optional().nullable(),
  outputFormat: z.enum(["text", "json", "markdown", "html"]).optional(),
  version: z.string().max(20).optional(),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertTenantAiConfigSchema = createInsertSchema(tenantAiConfig, {
  tenantId: z.string().min(1, "Tenant ID is required"),
  tier: z.enum(["free", "pro", "enterprise"]).optional(),
  defaultProvider: z.string().max(50).optional(),
  fallbackProvider: z.string().max(50).optional().nullable(),
  monthlyTokenLimit: z.number().int().min(0).optional().nullable(),
}).omit({
  id: true,
  tokensUsedThisMonth: true,
  tokenResetDate: true,
  createdAt: true,
  updatedAt: true,
});

export const insertTenantAiProviderSchema = createInsertSchema(tenantAiProviders, {
  tenantId: z.string().min(1, "Tenant ID is required"),
  provider: z.string().min(1, "Provider is required").max(50),
  apiKeyEncrypted: z.string().optional().nullable(),
  additionalConfig: z.record(z.unknown()).optional().nullable(),
}).omit({
  id: true,
  lastTestedAt: true,
  lastTestStatus: true,
  lastTestError: true,
  createdAt: true,
  updatedAt: true,
});

export const insertTenantPromptTemplateSchema = createInsertSchema(tenantPromptTemplates, {
  tenantId: z.string().min(1, "Tenant ID is required"),
  slug: z.string().min(1, "Slug is required").max(100).regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, and dashes only"),
  name: z.string().min(1, "Name is required").max(255),
  category: z.string().min(1, "Category is required").max(100),
  templateContent: z.string().min(1, "Template content is required"),
  parentTemplateId: z.string().optional().nullable(),
  systemPrompt: z.string().optional().nullable(),
  variables: z.array(z.object({
    name: z.string(),
    type: z.string(),
    required: z.boolean().optional(),
    default: z.string().optional(),
    description: z.string().optional(),
  })).optional(),
  preferredProvider: z.string().max(50).optional().nullable(),
  preferredModel: z.string().max(100).optional().nullable(),
  temperature: z.string().optional().nullable(),
  maxTokens: z.number().int().min(1).optional().nullable(),
  outputFormat: z.enum(["text", "json", "markdown", "html"]).optional().nullable(),
  version: z.string().max(20).optional(),
}).omit({
  id: true,
  usageCount: true,
  createdAt: true,
  updatedAt: true,
});

export const insertTenantPromptTemplateVersionSchema = createInsertSchema(tenantPromptTemplateVersions, {
  templateId: z.string().min(1, "Template ID is required"),
  version: z.string().min(1, "Version is required").max(20),
  templateContent: z.string().min(1, "Template content is required"),
  systemPrompt: z.string().optional().nullable(),
  variables: z.array(z.object({
    name: z.string(),
    type: z.string(),
    required: z.boolean().optional(),
    default: z.string().optional(),
    description: z.string().optional(),
  })).optional().nullable(),
  changeSummary: z.string().optional().nullable(),
}).omit({
  id: true,
  createdAt: true,
});

export const insertTenantFeatureTemplateSchema = createInsertSchema(tenantFeatureTemplates, {
  tenantId: z.string().min(1, "Tenant ID is required"),
  feature: z.string().min(1, "Feature is required").max(100),
  templateId: z.string().optional().nullable(),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertUserSavedTemplateSchema = createInsertSchema(userSavedTemplates, {
  userId: z.string().min(1, "User ID is required"),
  templateId: z.string().min(1, "Template ID is required"),
  templateType: z.enum(["platform", "tenant"]),
  customDefaults: z.record(z.unknown()).optional(),
}).omit({
  id: true,
  lastUsedAt: true,
  useCount: true,
  createdAt: true,
});

export const insertAiUsageLogSchema = createInsertSchema(aiUsageLog, {
  tenantId: z.string().min(1, "Tenant ID is required"),
  userId: z.string().optional().nullable(),
  provider: z.string().min(1, "Provider is required").max(50),
  model: z.string().max(100).optional().nullable(),
  feature: z.string().max(100).optional().nullable(),
  templateId: z.string().optional().nullable(),
  tokensInput: z.number().int().min(0).optional().nullable(),
  tokensOutput: z.number().int().min(0).optional().nullable(),
  costEstimate: z.string().optional().nullable(),
  durationMs: z.number().int().min(0).optional().nullable(),
  success: z.boolean(),
  errorMessage: z.string().optional().nullable(),
  requestMetadata: z.record(z.unknown()).optional().nullable(),
}).omit({
  id: true,
  createdAt: true,
});

// Registration API Schemas
export const sendCodeSchema = z.object({
  email: z.string().email('Invalid email address'),
});

export const verifyCodeSchema = z.object({
  email: z.string().email('Invalid email address'),
  code: z.string().length(6, 'Code must be 6 digits').regex(/^\d{6}$/, 'Code must be numeric'),
});

export const registerTenantSchema = z.object({
  tempToken: z.string().min(1, 'Token is required'),
  companyName: z.string().min(1, 'Company name is required').max(100),
  subdomain: z.string().min(3, 'Subdomain must be at least 3 characters').max(32).regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, 'Invalid subdomain format'),
  firstName: z.string().min(1, 'First name is required').max(50),
  lastName: z.string().min(1, 'Last name is required').max(50),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

// Types
// NOTE: User type is exported from the users table definition above
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Vendor = typeof vendors.$inferSelect;
export type InsertVendor = z.infer<typeof insertVendorSchema>;
export type Category = typeof categories.$inferSelect;
export type InsertCategory = z.infer<typeof insertCategorySchema>;
export type Tag = typeof tags.$inferSelect;
export type InsertTag = z.infer<typeof insertTagSchema>;
export type Collection = typeof collections.$inferSelect;
export type InsertCollection = z.infer<typeof insertCollectionSchema>;
// Smart Collection Rule types
export type SmartCollectionRule = z.infer<typeof smartCollectionRuleSchema>;
export type SmartCollectionRules = z.infer<typeof smartCollectionRulesSchema>;
// Collection Health System types
export type NavigationMenu = typeof navigationMenus.$inferSelect;
export type InsertNavigationMenu = z.infer<typeof insertNavigationMenuSchema>;
export type NavigationItem = typeof navigationItems.$inferSelect;
export type InsertNavigationItem = z.infer<typeof insertNavigationItemSchema>;
export type CollectionHealthIssue = typeof collectionHealthIssues.$inferSelect;
export type InsertCollectionHealthIssue = z.infer<typeof insertCollectionHealthIssueSchema>;
// Education Center types
export type EducationArticle = typeof educationArticles.$inferSelect;
export type InsertEducationArticle = z.infer<typeof insertEducationArticleSchema>;
export type AppEducationLibrary = typeof appEducationLibrary.$inferSelect;
export type InsertAppEducationLibrary = z.infer<typeof insertAppEducationLibrarySchema>;
export type TenantDetectedApp = typeof tenantDetectedApps.$inferSelect;
export type InsertTenantDetectedApp = z.infer<typeof insertTenantDetectedAppSchema>;
// NOTE: Tenant type is exported from the tenants table definition above
export type ProductCollection = typeof productCollections.$inferSelect;
export type InsertProductCollection = z.infer<typeof insertProductCollectionSchema>;
export type Product = typeof products.$inferSelect;
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type ProductOption = typeof productOptions.$inferSelect;
export type InsertProductOption = z.infer<typeof insertProductOptionSchema>;
export type ProductVariant = typeof productVariants.$inferSelect;
export type InsertProductVariant = z.infer<typeof insertProductVariantSchema>;

// Per-location inventory breakdown (read-only from QB source)
export interface LocationInventory {
  code: string;  // e.g., "GM", "HM", "HQ", "LM", "NM"
  name: string;  // e.g., "Greenbrier Mall"
  qty: number;   // quantity at this location
}
export type File = typeof files.$inferSelect;
export type InsertFile = z.infer<typeof insertFileSchema>;
export type UpdateFile = z.infer<typeof updateFileSchema>;
export type ProductMedia = typeof productMedia.$inferSelect;
export type InsertProductMedia = z.infer<typeof insertProductMediaSchema>;
export type VariantMedia = typeof variantMedia.$inferSelect;
export type InsertVariantMedia = z.infer<typeof insertVariantMediaSchema>;
export type FileReference = typeof fileReferences.$inferSelect;
export type InsertFileReference = z.infer<typeof insertFileReferenceSchema>;
export type ProductStatusHistory = typeof productStatusHistory.$inferSelect;
export type InsertProductStatusHistory = z.infer<typeof insertProductStatusHistorySchema>;
export type Task = typeof tasks.$inferSelect;
export type InsertTask = z.infer<typeof insertTaskSchema>;
export type AuditLog = typeof auditLog.$inferSelect;
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;

// Notification type aliases derived from constants
export type NotificationCategory = typeof NOTIFICATION_CATEGORIES[number];
export type NotificationSeverity = typeof NOTIFICATION_SEVERITIES[number];
export type NotificationSourceType = typeof NOTIFICATION_SOURCE_TYPES[number];

export type TaskStep = typeof taskSteps.$inferSelect;
export type InsertTaskStep = z.infer<typeof insertTaskStepSchema>;
export type StepTemplate = typeof stepTemplates.$inferSelect;
export type InsertStepTemplate = z.infer<typeof insertStepTemplateSchema>;
export type ShopifyStore = typeof shopifyStores.$inferSelect;
export type InsertShopifyStore = z.infer<typeof insertShopifyStoreSchema>;
export type ShopifyProductMapping = typeof shopifyProductMappings.$inferSelect;
export type InsertShopifyProductMapping = z.infer<typeof insertShopifyProductMappingSchema>;
export type DashboardStatsHistoryEntry = typeof dashboardStatsHistory.$inferSelect;
export type InsertDashboardStatsHistory = z.infer<typeof insertDashboardStatsHistorySchema>;
export type BrandSizeChart = typeof brandSizeCharts.$inferSelect;
export type InsertBrandSizeChart = z.infer<typeof insertBrandSizeChartSchema>;
export type BrandProductCache = typeof brandProductCache.$inferSelect;
export type InsertBrandProductCache = z.infer<typeof insertBrandProductCacheSchema>;
export type StyleNumberMapping = typeof styleNumberMappings.$inferSelect;
export type InsertStyleNumberMapping = z.infer<typeof insertStyleNumberMappingSchema>;
export type ShopifyProduct = typeof shopifyProducts.$inferSelect;
export type InsertShopifyProduct = z.infer<typeof insertShopifyProductSchema>;
export type ShopifyProductVariant = typeof shopifyProductVariants.$inferSelect;
export type InsertShopifyProductVariant = z.infer<typeof insertShopifyProductVariantSchema>;
export type ShopifyProductImage = typeof shopifyProductImages.$inferSelect;
export type InsertShopifyProductImage = z.infer<typeof insertShopifyProductImageSchema>;
export type ShopifySyncLog = typeof shopifySyncLog.$inferSelect;
export type InsertShopifySyncLog = z.infer<typeof insertShopifySyncLogSchema>;
export type ShopifySyncError = typeof shopifySyncErrors.$inferSelect;
export type InsertShopifySyncError = z.infer<typeof insertShopifySyncErrorSchema>;
export type ProductSyncChangelog = typeof productSyncChangelog.$inferSelect;
export type InsertProductSyncChangelog = z.infer<typeof insertProductSyncChangelogSchema>;
export type CollectionSyncChangelog = typeof collectionSyncChangelog.$inferSelect;
export type InsertCollectionSyncChangelog = z.infer<typeof insertCollectionSyncChangelogSchema>;
export type ShopifySyncSettings = typeof shopifySyncSettings.$inferSelect;
export type InsertShopifySyncSettings = z.infer<typeof insertShopifySyncSettingsSchema>;
export type ShopifyPendingUpdate = typeof shopifyPendingUpdates.$inferSelect;
export type InsertShopifyPendingUpdate = z.infer<typeof insertShopifyPendingUpdateSchema>;
export type ShopifyBulkOperation = typeof shopifyBulkOperations.$inferSelect;
export type InsertShopifyBulkOperation = z.infer<typeof insertShopifyBulkOperationSchema>;
export type ShopifyBulkOperationItem = typeof shopifyBulkOperationItems.$inferSelect;
export type InsertShopifyBulkOperationItem = z.infer<typeof insertShopifyBulkOperationItemSchema>;
export type UserUiPreferences = typeof userUiPreferences.$inferSelect;
export type InsertUserUiPreferences = z.infer<typeof insertUserUiPreferencesSchema>;
export type ApiIntegration = typeof apiIntegrations.$inferSelect;
export type InsertApiIntegration = z.infer<typeof insertApiIntegrationSchema>;

// Tenant Registration types
export type VerificationCode = typeof verificationCodes.$inferSelect;
export type InsertVerificationCode = z.infer<typeof insertVerificationCodeSchema>;
export type Invitation = typeof invitations.$inferSelect;
export type InsertInvitation = z.infer<typeof insertInvitationSchema>;
export type RegistrationAuditLog = typeof registrationAuditLog.$inferSelect;
export type InsertRegistrationAuditLog = z.infer<typeof insertRegistrationAuditLogSchema>;

// Weight Rules System types
export type WeightCategory = typeof weightCategories.$inferSelect;
export type InsertWeightCategory = z.infer<typeof insertWeightCategorySchema>;
export type ProductTypeWeightMapping = typeof productTypeWeightMappings.$inferSelect;
export type InsertProductTypeWeightMapping = z.infer<typeof insertProductTypeWeightMappingSchema>;
export type WeightDiscrepancy = typeof weightDiscrepancies.$inferSelect;
export type InsertWeightDiscrepancy = z.infer<typeof insertWeightDiscrepancySchema>;

// AI Integration types
export type PlatformAiDefault = typeof platformAiDefaults.$inferSelect;
export type InsertPlatformAiDefault = z.infer<typeof insertPlatformAiDefaultSchema>;
export type PlatformPromptTemplate = typeof platformPromptTemplates.$inferSelect;
export type InsertPlatformPromptTemplate = z.infer<typeof insertPlatformPromptTemplateSchema>;
export type TenantAiConfig = typeof tenantAiConfig.$inferSelect;
export type InsertTenantAiConfig = z.infer<typeof insertTenantAiConfigSchema>;
export type TenantAiProvider = typeof tenantAiProviders.$inferSelect;
export type InsertTenantAiProvider = z.infer<typeof insertTenantAiProviderSchema>;
export type TenantPromptTemplate = typeof tenantPromptTemplates.$inferSelect;
export type InsertTenantPromptTemplate = z.infer<typeof insertTenantPromptTemplateSchema>;
export type TenantPromptTemplateVersion = typeof tenantPromptTemplateVersions.$inferSelect;
export type InsertTenantPromptTemplateVersion = z.infer<typeof insertTenantPromptTemplateVersionSchema>;
export type TenantFeatureTemplate = typeof tenantFeatureTemplates.$inferSelect;
export type InsertTenantFeatureTemplate = z.infer<typeof insertTenantFeatureTemplateSchema>;
export type UserSavedTemplate = typeof userSavedTemplates.$inferSelect;
export type InsertUserSavedTemplate = z.infer<typeof insertUserSavedTemplateSchema>;
export type AiUsageLog = typeof aiUsageLog.$inferSelect;
export type InsertAiUsageLog = z.infer<typeof insertAiUsageLogSchema>;

// AI Integration enum value types
export type AiProvider = typeof aiProviderEnum.enumValues[number];
export type AiTier = typeof aiTierEnum.enumValues[number];
export type TemplateSource = typeof templateSourceEnum.enumValues[number];
export type AiFeature = typeof aiFeatureEnum.enumValues[number];
export type AiOutputFormat = typeof aiOutputFormatEnum.enumValues[number];

// AI Integration constants for validation
export const AI_PROVIDERS = ["gemini", "openai", "anthropic"] as const;
export const AI_TIERS = ["free", "pro", "enterprise"] as const;
export const TEMPLATE_SOURCES = ["platform", "tenant"] as const;
export const AI_FEATURES = [
  "product_description",
  "bullet_points",
  "meta_description",
  "title_optimization",
  "category_suggestion",
  "brand_extraction",
  "size_chart_extraction",
  "content_rewrite",
  "translation",
  "image_alt_text"
] as const;
export const AI_OUTPUT_FORMATS = ["text", "json", "markdown", "html"] as const;

// Template variable type for JSONB fields
export type TemplateVariable = {
  name: string;
  type: string;
  required?: boolean;
  default?: string;
  description?: string;
};

// Registration API Request types
export type SendCodeRequest = z.infer<typeof sendCodeSchema>;
export type VerifyCodeRequest = z.infer<typeof verifyCodeSchema>;
export type RegisterTenantRequest = z.infer<typeof registerTenantSchema>;

// Product with variants (for fetching products with their variants)
export type ProductWithVariants = Product & {
  variants: ProductVariant[];
};

// Product with optional variants (for queries that may or may not include variants)
export type ProductWithOptionalVariants = Product & {
  variants?: ProductVariant[];
};

// Variant display info (for UI rendering)
export type VariantDisplayInfo = {
  hasSingleVariant: boolean;
  hasMultipleVariants: boolean;
  hasNoVariants: boolean;
  firstVariantSku: string | null;
  firstVariantPrice: string | null;
  priceRange: { min: string; max: string } | null;
  variantCount: number;
};

// Task with relations
export type TaskWithDetails = Task & {
  product?: Product; // NOW OPTIONAL - tasks may not have products
  vendor?: Vendor; // OPTIONAL - task vendor for supplier categorization
  assignee?: User;
  creator: User;
  steps?: TaskStep[]; // Task steps (checklist items)
};

// Dashboard stats type
export type DashboardStats = {
  totalTasks: number;
  pendingReview: number;
  overdueSLA: number;
  completedToday: number;
  kanbanCounts: Record<string, number>;
  // Historical trend data (last 7 days)
  history?: {
    totalTasks: Array<{ date: string; value: number }>;
    pendingReview: Array<{ date: string; value: number }>;
    overdueSLA: Array<{ date: string; value: number }>;
    completedToday: Array<{ date: string; value: number }>;
  };
};

// Re-export variant helpers
export * from "./variant-helpers";
