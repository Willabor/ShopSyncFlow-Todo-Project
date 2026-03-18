import {
  tenants,
  users,
  vendors,
  categories,
  tags,
  collections,
  navigationMenus,
  navigationItems,
  collectionHealthIssues,
  educationArticles,
  appEducationLibrary,
  tenantDetectedApps,
  productCollections,
  products,
  productOptions,
  productVariants,
  tasks,
  auditLog,
  notifications,
  taskSteps,
  stepTemplates,
  shopifyStores,
  shopifyProductMappings,
  loginAttempts,
  passwordResetTokens,
  dashboardStatsHistory,
  brandSizeCharts,
  brandProductCache,
  styleNumberMappings,
  apiIntegrations,
  productCategories,
  weightCategories,
  productTypeWeightMappings,
  weightDiscrepancies,
  // AI Integration tables
  platformAiDefaults,
  platformPromptTemplates,
  tenantAiConfig,
  tenantAiProviders,
  tenantPromptTemplates,
  tenantPromptTemplateVersions,
  tenantFeatureTemplates,
  userSavedTemplates,
  aiUsageLog,
  type User,
  type InsertUser,
  type Vendor,
  type InsertVendor,
  type Category,
  type InsertCategory,
  type Tag,
  type InsertTag,
  type Collection,
  type InsertCollection,
  type NavigationMenu,
  type InsertNavigationMenu,
  type NavigationItem,
  type InsertNavigationItem,
  type CollectionHealthIssue,
  type InsertCollectionHealthIssue,
  type EducationArticle,
  type InsertEducationArticle,
  type AppEducationLibrary,
  type InsertAppEducationLibrary,
  type TenantDetectedApp,
  type InsertTenantDetectedApp,
  type ProductCollection,
  type InsertProductCollection,
  type Product,
  type InsertProduct,
  type ProductOption,
  type InsertProductOption,
  type ProductVariant,
  type InsertProductVariant,
  type ProductWithVariants,
  type Task,
  type InsertTask,
  type TaskWithDetails,
  type AuditLog,
  type InsertAuditLog,
  type Notification,
  type InsertNotification,
  type TaskStep,
  type InsertTaskStep,
  type StepTemplate,
  type InsertStepTemplate,
  type DashboardStatsHistoryEntry,
  type InsertDashboardStatsHistory,
  type ShopifyStore,
  type InsertShopifyStore,
  type ShopifyProductMapping,
  type InsertShopifyProductMapping,
  type DashboardStats,
  type BrandSizeChart,
  type InsertBrandSizeChart,
  type BrandProductCache,
  type InsertBrandProductCache,
  type StyleNumberMapping,
  type InsertStyleNumberMapping,
  type ApiIntegration,
  type InsertApiIntegration,
  type Tenant,
  type WeightCategory,
  type InsertWeightCategory,
  type ProductTypeWeightMapping,
  type InsertProductTypeWeightMapping,
  type WeightDiscrepancy,
  type InsertWeightDiscrepancy
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, asc, and, or, count, sql, inArray, lt, isNull, aliasedTable, ilike, notExists } from "drizzle-orm";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { pool } from "./db";
import { encryptField, decryptField } from "./utils/field-encryption.js";

const PostgresSessionStore = connectPg(session);

export interface IStorage {
  // Tenant methods
  getDefaultTenant(): Promise<Tenant | undefined>;
  getTenantById(id: string): Promise<Tenant | undefined>;

  // User methods
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getAllUsers(tenantId: string): Promise<User[]>;  // MULTI-TENANT: Added tenantId
  createUser(user: InsertUser): Promise<User>;
  updateUser(tenantId: string, id: string, updates: Partial<User>): Promise<User | undefined>;  // MULTI-TENANT: Added tenantId

  // Login attempt tracking
  logLoginAttempt(attempt: {
    email: string;
    ipAddress: string;
    userAgent?: string;
    success: boolean;
    failureReason: string | null;
  }): Promise<void>;

  // Password reset token methods
  createPasswordResetToken(userId: string, tokenHash: string, expiresAt: Date): Promise<void>;
  getPasswordResetToken(tokenHash: string): Promise<{ userId: string; expiresAt: Date; used: boolean } | undefined>;
  markTokenAsUsed(tokenHash: string): Promise<void>;
  deleteExpiredTokens(): Promise<void>;

  // Vendor methods - MULTI-TENANT: All methods require tenantId as first parameter
  getAllVendors(tenantId: string): Promise<Vendor[]>;
  getVendorById(tenantId: string, id: string): Promise<Vendor | undefined>;
  getVendorByName(tenantId: string, name: string): Promise<Vendor | undefined>;
  createVendor(vendor: InsertVendor): Promise<Vendor>;
  updateVendor(tenantId: string, id: string, updates: Partial<Vendor>): Promise<Vendor | undefined>;
  deleteVendor(tenantId: string, id: string): Promise<boolean>;
  getVendorsWithStats(tenantId: string): Promise<Array<Vendor & { productCount: number }>>;

  // Category methods - MULTI-TENANT: Added tenantId to all methods
  getAllCategories(tenantId: string, filters?: { isActive?: boolean; search?: string }): Promise<Category[]>;
  getCategoryById(tenantId: string, id: string): Promise<Category | undefined>;
  getCategoryByName(tenantId: string, name: string): Promise<Category | undefined>;
  getCategoryBySlug(tenantId: string, slug: string): Promise<Category | undefined>;
  createCategory(category: InsertCategory): Promise<Category>;  // tenantId comes from InsertCategory
  updateCategory(tenantId: string, id: string, updates: Partial<Category>): Promise<Category | undefined>;
  deleteCategory(tenantId: string, id: string, options?: { reassignTo?: string; deleteProducts?: boolean }): Promise<boolean>;
  getCategoryStats(tenantId: string): Promise<{
    total: number;
    active: number;
    withProducts: number;
    uncategorizedProducts: number;
    shopifyCategoryStats: {
      totalProducts: number;
      withValidCategory: number;
      explicitlyUncategorized: number;
      nullCategory: number;
      coveragePercent: number;
    };
    autoMappableProducts: number;
  }>;
  getMappingInsights(): Promise<Array<{
    productType: string;
    totalProducts: number;
    withShopifyCategory: number;
    withoutShopifyCategory: number;
    coveragePercent: number;
    mostCommonCategory: string | null;
    mostCommonCategoryCount: number;
    hasMultipleCategories: boolean;
    confidence: 'high' | 'medium' | 'low' | 'none';
  }>>;
  bulkMapProductsByType(productType: string, shopifyCategoryId: string, shopifyCategoryPath: string): Promise<number>;
  getProductListByType(productType: string): Promise<Product[]>;
  updateCategoryShopifyMapping(categoryName: string, shopifyCategoryGid: string, shopifyCategoryPath: string): Promise<void>;
  searchProductCategories(query: string, limit?: number, mainCategory?: string): Promise<Array<{ id: string; gid: string; name: string; path: string; level: number }>>;
  updateCategoryProductCounts(): Promise<void>;

  // Tag methods - MULTI-TENANT: tenantId required for all tag queries
  getAllTags(tenantId: string, filters?: { search?: string; unused?: boolean; notSynced?: boolean }): Promise<Tag[]>;
  getTagById(tenantId: string, id: string): Promise<Tag | undefined>;
  getTagByName(tenantId: string, name: string): Promise<Tag | undefined>;
  createTag(tenantId: string, tag: InsertTag): Promise<Tag>;
  updateTag(tenantId: string, id: string, updates: Partial<Tag>): Promise<Tag | undefined>;
  deleteTag(tenantId: string, id: string): Promise<boolean>;
  refreshTagCounts(tenantId: string): Promise<void>;
  getTagStats(tenantId: string): Promise<{ total: number; used: number; unused: number; synced: number }>;

  // Collection methods - MULTI-TENANT: tenantId required for all collection queries
  getAllCollections(tenantId: string, filters?: { isActive?: boolean; search?: string; limit?: number; offset?: number; sortBy?: string; sortOrder?: 'asc' | 'desc' }): Promise<{ collections: Collection[]; total: number }>;
  getCollectionById(tenantId: string, id: string): Promise<Collection | undefined>;
  getCollectionByName(tenantId: string, name: string): Promise<Collection | undefined>;
  getCollectionBySlug(tenantId: string, slug: string): Promise<Collection | undefined>;
  getCollectionByShopifyId(tenantId: string, shopifyCollectionId: string): Promise<Collection | undefined>;
  createCollection(tenantId: string, collection: InsertCollection): Promise<Collection>;
  updateCollection(tenantId: string, id: string, updates: Partial<Collection>): Promise<Collection | undefined>;
  deleteCollection(tenantId: string, id: string): Promise<boolean>;
  getCollectionWithProducts(tenantId: string, id: string): Promise<(Collection & { products: Product[] }) | undefined>;
  getCollectionProductsPaginated(tenantId: string, id: string, options?: { limit?: number; offset?: number }): Promise<{ products: Product[]; total: number }>;
  addProductsToCollection(collectionId: string, productIds: string[]): Promise<void>;
  removeProductsFromCollection(collectionId: string, productIds: string[]): Promise<void>;
  getProductCollections(productId: string): Promise<Collection[]>;
  updateCollectionProductCounts(): Promise<void>;
  // Optimized batch operations for import - MULTI-TENANT: tenantId required
  getAllCollectionsMap(tenantId: string): Promise<Map<string, Collection>>;
  batchCreateCollections(tenantId: string, collections: InsertCollection[]): Promise<Collection[]>;
  batchCreateProductCollectionLinks(links: Array<{ collectionId: string; productId: string }>): Promise<void>;

  // Product methods - MULTI-TENANT: All methods require tenantId for isolation
  createProduct(product: InsertProduct): Promise<Product>;
  getProduct(tenantId: string, id: string): Promise<Product | undefined>;
  getProducts(tenantId: string, filters?: {
    status?: string;
    vendorId?: string;
    shopifyProductId?: string;
    publishStatus?: string;
    categoryId?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<Product[]>;
  getProductsCount(tenantId: string, filters?: {
    status?: string;
    vendorId?: string;
    shopifyProductId?: string;
    publishStatus?: string;
    search?: string;
  }): Promise<number>;
  updateProduct(tenantId: string, id: string, updates: Partial<Product>): Promise<Product | undefined>;
  deleteProduct(tenantId: string, id: string): Promise<void>;

  // Product methods with variants (batch query optimization) - MULTI-TENANT
  getProductsWithVariants(tenantId: string, options?: {
    limit?: number;
    offset?: number;
    status?: string;
    vendorId?: string;
    categoryId?: string;
    collectionId?: string;
  }): Promise<ProductWithVariants[]>;

  // Product handle methods
  checkHandleUnique(handle: string, excludeProductId?: string): Promise<boolean>;
  updateProductHandle(productId: string, handle: string): Promise<Product | undefined>;
  getProductByHandle(handle: string): Promise<Product | undefined>;
  batchUpdateHandles(updates: Array<{ productId: string; handle: string }>): Promise<{ success: number; failures: Array<{ productId: string; error: string }> }>;

  // Internal product lookup (for Shopify sync - uses Shopify ID which is globally unique)
  // NOTE: This method does NOT filter by tenant as Shopify Product IDs are globally unique
  // It should only be used after tenant ownership has been verified in the route
  getProductByShopifyId(shopifyProductId: string): Promise<Product[]>;
  // Internal update for Shopify sync (operates on product already verified to belong to tenant)
  updateProductByShopifyId(shopifyProductId: string, updates: Partial<Product>): Promise<Product | undefined>;
  // Internal product lookup by internal ID (for webhooks and batch jobs without tenant context)
  getProductByInternalId(id: string): Promise<Product | undefined>;
  // Internal: Get products by category ID (for admin tools)
  getProductsByCategoryId(categoryId: string): Promise<Product[]>;
  // Internal: Update product by internal ID (for admin tools)
  updateProductByInternalId(id: string, updates: Partial<Product>): Promise<Product | undefined>;

  // Duplicate detection
  detectProductDuplicates(params: {
    vendor: string;
    styleNumber?: string;
    productName?: string;
    color?: string;
    skus?: string[];
  }): Promise<{
    level: 1 | 2 | 3 | 4 | 5;
    confidence: 'DEFINITE' | 'VERY_STRONG' | 'STRONG' | 'POSSIBLE' | 'NEW';
    matchedBy: 'SKU' | 'Vendor + Style + Title' | 'Vendor + Style + Color' | 'Vendor + Style' | 'None';
    matches: Product[];
    recommendation: 'UPDATE' | 'UPDATE_OR_CREATE' | 'ADD_VARIANT_OR_CREATE' | 'CREATE';
  }>;

  // Product variant methods - MULTI-TENANT: getProductWithVariants requires tenantId
  getProductWithVariants(tenantId: string, productId: string): Promise<(Product & {
    options: ProductOption[],
    variants: ProductVariant[]
  }) | undefined>;
  getProductVariants(productId: string): Promise<ProductVariant[]>;
  getProductVariantCount(productId: string): Promise<number>;
  getProductOptions(productId: string): Promise<ProductOption[]>;
  createProductOption(option: InsertProductOption): Promise<ProductOption>;
  updateProductOption(id: string, updates: Partial<ProductOption>): Promise<ProductOption | undefined>;
  deleteProductOption(id: string): Promise<boolean>;
  reorderProductOptions(productId: string, optionIds: string[]): Promise<void>;
  createProductVariant(variant: InsertProductVariant): Promise<ProductVariant>;
  updateProductVariant(variantId: string, updates: Partial<ProductVariant>): Promise<ProductVariant | undefined>;
  deleteProductVariant(variantId: string): Promise<boolean>;
  deleteProductVariants(productId: string): Promise<number>;
  deleteProductOptions(productId: string): Promise<number>;

  // Task methods - MULTI-TENANT: All methods require tenantId for data isolation
  createTask(task: InsertTask): Promise<Task>;
  getTask(tenantId: string, id: string): Promise<TaskWithDetails | undefined>;
  getTasks(tenantId: string, filters?: { status?: string; assignedTo?: string; createdBy?: string; vendorId?: string }): Promise<TaskWithDetails[]>;
  updateTask(tenantId: string, id: string, updates: Partial<Task>): Promise<Task | undefined>;
  updateTaskStatus(tenantId: string, id: string, status: string, userId: string): Promise<Task | undefined>;
  deleteTask(tenantId: string, id: string): Promise<boolean>;
  autoReturnStaleTasks(tenantId: string): Promise<number>;

  // Dashboard methods
  getDashboardStats(tenantId: string, userId?: string, role?: string): Promise<DashboardStats>;  // MULTI-TENANT: Added tenantId
  captureStatsSnapshot(tenantId: string): Promise<DashboardStatsHistoryEntry>;  // MULTI-TENANT: Added tenantId
  getStatsHistory(tenantId: string, days?: number): Promise<DashboardStatsHistoryEntry[]>;  // MULTI-TENANT: Added tenantId

  // Audit methods
  createAuditEntry(entry: InsertAuditLog): Promise<AuditLog>;
  getTaskAuditLog(tenantId: string, taskId: string): Promise<AuditLog[]>;
  getAllAuditLogs(tenantId: string): Promise<AuditLog[]>;
  
  // Notification methods
  createNotification(notification: InsertNotification): Promise<Notification>;
  getUserNotifications(userId: string, limit?: number): Promise<Notification[]>;
  markNotificationRead(id: string): Promise<void>;

  // Enhanced Notification Bell methods
  getNotificationCounts(tenantId: string): Promise<{
    total: number;
    byCategory: { health: number; sync: number; quality: number; system: number };
    criticalCount: number;
  }>;
  getNotificationsByCategory(tenantId: string, category?: string, limit?: number): Promise<Notification[]>;
  markAllNotificationsRead(tenantId: string, category?: string): Promise<number>;
  dismissNotification(tenantId: string, id: string): Promise<void>;
  markNotificationReadSecure(tenantId: string, id: string): Promise<void>;
  createOrUpdateAggregatedNotification(
    tenantId: string,
    sourceType: string,
    data: {
      category: string;
      severity: string;
      title: string;
      message: string;
      actionUrl?: string;
      metadata?: Record<string, unknown>;
    }
  ): Promise<Notification>;
  cleanupExpiredNotifications(tenantId: string): Promise<number>;

  // Task Steps methods
  getTaskSteps(taskId: string): Promise<TaskStep[]>;
  createTaskStep(step: InsertTaskStep): Promise<TaskStep>;
  updateTaskStep(stepId: number, updates: Partial<TaskStep>): Promise<TaskStep | undefined>;
  deleteTaskStep(stepId: number): Promise<boolean>;
  completeTaskStep(stepId: number, userId: string): Promise<TaskStep | undefined>;
  applyTemplateSteps(taskId: string, category: string): Promise<TaskStep[]>;

  // Step Templates methods
  getAllTemplates(): Promise<StepTemplate[]>;
  getTemplatesByCategory(category: string): Promise<StepTemplate[]>;
  getTemplateCategories(): Promise<string[]>;
  createTemplate(template: InsertStepTemplate): Promise<StepTemplate>;
  updateTemplate(id: number, updates: Partial<StepTemplate>): Promise<StepTemplate | undefined>;
  deleteTemplate(id: number): Promise<boolean>;
  reorderTemplate(id: number, newOrder: number, category: string): Promise<void>;

  // Shopify methods - MULTI-TENANT (tenantId required)
  createShopifyStore(tenantId: string, store: InsertShopifyStore): Promise<ShopifyStore>;
  getShopifyStores(tenantId: string): Promise<ShopifyStore[]>;
  getActiveShopifyStore(tenantId: string): Promise<ShopifyStore | undefined>;
  getShopifyStoreByDomain(shopDomain: string): Promise<ShopifyStore | undefined>;
  updateShopifyStore(tenantId: string, id: string, updates: Partial<ShopifyStore>): Promise<ShopifyStore | undefined>;
  createShopifyProductMapping(tenantId: string, mapping: InsertShopifyProductMapping): Promise<ShopifyProductMapping>;
  getShopifyProductMapping(tenantId: string, productId: string): Promise<ShopifyProductMapping | undefined>;
  getShopifyMappingByShopifyId(tenantId: string, shopifyProductId: string): Promise<ShopifyProductMapping | undefined>;
  updateShopifyProductMapping(tenantId: string, id: string, updates: Partial<ShopifyProductMapping>): Promise<ShopifyProductMapping | undefined>;

  // Brand enrichment methods
  getBrandProductCache(vendorId: string, styleNumber: string, color?: string): Promise<BrandProductCache | undefined>;
  createBrandProductCache(cache: InsertBrandProductCache): Promise<BrandProductCache>;
  updateBrandProductCache(id: string, updates: Partial<BrandProductCache>): Promise<BrandProductCache | undefined>;
  getBrandSizeCharts(vendorId: string): Promise<BrandSizeChart[]>;
  getBrandSizeChartByCategory(vendorId: string, category: string): Promise<BrandSizeChart | undefined>;
  getAllBrandSizeChartVersions(vendorId: string, category: string): Promise<BrandSizeChart[]>;
  getMostUsedSizeChart(vendorId: string, category: string): Promise<BrandSizeChart | undefined>;

  // Style number mapping methods (for multi-match product picker)
  getStyleNumberMapping(vendorId: string, ourStyleNumber: string): Promise<StyleNumberMapping | undefined>;
  createStyleNumberMapping(mapping: InsertStyleNumberMapping): Promise<StyleNumberMapping>;
  updateStyleNumberMapping(id: string, updates: Partial<StyleNumberMapping>): Promise<StyleNumberMapping | undefined>;
  deleteStyleNumberMapping(id: string): Promise<void>;
  getBrandSizeChartByHash(vendorId: string, category: string, contentHash: string): Promise<BrandSizeChart | undefined>;
  incrementSizeChartUsageCount(id: string): Promise<void>;
  createBrandSizeChart(chart: InsertBrandSizeChart): Promise<BrandSizeChart>;
  updateBrandSizeChart(id: string, updates: Partial<BrandSizeChart>): Promise<BrandSizeChart | undefined>;
  getBrandSizeChart(id: string): Promise<BrandSizeChart | undefined>;
  deleteBrandSizeChart(id: string): Promise<void>;

  // Weight Categories methods
  getWeightCategories(tenantId: string): Promise<WeightCategory[]>;
  getWeightCategory(tenantId: string, id: string): Promise<WeightCategory | null>;
  createWeightCategory(data: InsertWeightCategory): Promise<WeightCategory>;
  updateWeightCategory(tenantId: string, id: string, data: Partial<InsertWeightCategory>): Promise<WeightCategory | null>;
  deleteWeightCategory(tenantId: string, id: string): Promise<boolean>;
  importWeightCategories(tenantId: string, categories: Array<{categoryName: string, weightValue: string, weightUnit: string}>, createdBy: string): Promise<{created: number, updated: number}>;

  // Weight Mappings methods
  getWeightMappings(tenantId: string): Promise<(ProductTypeWeightMapping & {category: WeightCategory})[]>;
  getWeightMappingByProductType(tenantId: string, productType: string): Promise<ProductTypeWeightMapping | null>;
  createWeightMapping(data: InsertProductTypeWeightMapping): Promise<ProductTypeWeightMapping>;
  updateWeightMapping(tenantId: string, id: string, data: Partial<InsertProductTypeWeightMapping>): Promise<ProductTypeWeightMapping | null>;
  deleteWeightMapping(tenantId: string, id: string): Promise<boolean>;
  getUnmappedProductTypes(tenantId: string): Promise<string[]>;

  // Weight Discrepancies methods
  getWeightDiscrepancies(tenantId: string, filters?: {status?: string}): Promise<WeightDiscrepancy[]>;
  getWeightDiscrepanciesByIds(tenantId: string, ids: string[]): Promise<WeightDiscrepancy[]>;
  createWeightDiscrepancy(data: InsertWeightDiscrepancy): Promise<WeightDiscrepancy>;
  updateWeightDiscrepancyStatus(tenantId: string, id: string, status: string, resolvedBy: string, notes?: string): Promise<WeightDiscrepancy | null>;
  bulkUpdateDiscrepancyStatus(tenantId: string, ids: string[], status: string, resolvedBy: string): Promise<number>;
  getWeightDiscrepancyStats(tenantId: string): Promise<{pending: number, fixed: number, ignored: number, total: number}>;

  // Session store
  sessionStore: any;
}

export class DatabaseStorage implements IStorage {
  sessionStore: any;

  constructor() {
    this.sessionStore = new PostgresSessionStore({
      pool,
      createTableIfMissing: true
    });
  }

  // Tenant methods
  async getDefaultTenant(): Promise<Tenant | undefined> {
    // Get the first active tenant (for single-tenant mode) or by env variable
    const defaultTenantId = process.env.DEFAULT_TENANT_ID || "00000000-0000-0000-0000-000000000001";
    const [tenant] = await db
      .select()
      .from(tenants)
      .where(and(eq(tenants.id, defaultTenantId), eq(tenants.isActive, true)));
    return (tenant as Tenant) || undefined;
  }

  async getTenantById(id: string): Promise<Tenant | undefined> {
    const [tenant] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.id, id));
    return (tenant as Tenant) || undefined;
  }

  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return (user as User) || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return (user as User) || undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return (user as User) || undefined;
  }

  async getAllUsers(tenantId: string): Promise<User[]> {
    // MULTI-TENANT: Filter users by tenant_id
    const result = await db.select().from(users).where(eq(users.tenantId, tenantId)).orderBy(users.createdAt);
    return result as User[];
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const result = await db
      .insert(users)
      .values(insertUser as any)
      .returning() as any[];
    return result[0] as User;
  }

  async updateUser(tenantId: string, id: string, updates: Partial<User>): Promise<User | undefined> {
    // MULTI-TENANT: Only update user if they belong to the specified tenant
    const [user] = await db
      .update(users)
      .set({ ...updates, updatedAt: new Date() } as any)
      .where(and(eq(users.tenantId, tenantId), eq(users.id, id)))
      .returning();
    return (user as User) || undefined;
  }

  async completeUserProfile(id: string, phoneNumber: string): Promise<User | undefined> {
    // Update user with phone number and mark profile as completed
    const [user] = await db
      .update(users)
      .set({
        phoneNumber,
        profileCompleted: true,
        updatedAt: new Date()
      })
      .where(eq(users.id, id))
      .returning();
    return (user as User) || undefined;
  }

  async logLoginAttempt(attempt: {
    email: string;
    ipAddress: string;
    userAgent?: string;
    success: boolean;
    failureReason: string | null;
  }): Promise<void> {
    await db.insert(loginAttempts).values({
      email: attempt.email,
      ipAddress: attempt.ipAddress,
      userAgent: attempt.userAgent || null,
      success: attempt.success,
      failureReason: attempt.failureReason,
    });
  }

  async createPasswordResetToken(userId: string, tokenHash: string, expiresAt: Date): Promise<void> {
    await db.insert(passwordResetTokens).values({
      userId,
      tokenHash,
      expiresAt,
      used: false,
    });
  }

  async getPasswordResetToken(tokenHash: string): Promise<{ userId: string; expiresAt: Date; used: boolean } | undefined> {
    const [token] = await db.select()
      .from(passwordResetTokens)
      .where(and(
        eq(passwordResetTokens.tokenHash, tokenHash),
        eq(passwordResetTokens.used, false)
      ));
    return token ? {
      userId: token.userId,
      expiresAt: token.expiresAt,
      used: token.used
    } : undefined;
  }

  async markTokenAsUsed(tokenHash: string): Promise<void> {
    await db.update(passwordResetTokens)
      .set({ used: true, usedAt: new Date() })
      .where(eq(passwordResetTokens.tokenHash, tokenHash));
  }

  async deleteExpiredTokens(): Promise<void> {
    await db.delete(passwordResetTokens)
      .where(lt(passwordResetTokens.expiresAt, new Date()));
  }

  // MULTI-TENANT: Get all vendors filtered by tenant
  async getAllVendors(tenantId: string): Promise<Vendor[]> {
    return await db.select().from(vendors)
      .where(eq(vendors.tenantId, tenantId))
      .orderBy(vendors.name);
  }

  // MULTI-TENANT: Get vendor by ID filtered by tenant
  async getVendorById(tenantId: string, id: string): Promise<Vendor | undefined> {
    const [vendor] = await db.select().from(vendors)
      .where(and(eq(vendors.id, id), eq(vendors.tenantId, tenantId)));
    return vendor || undefined;
  }

  // MULTI-TENANT: Get vendor by name filtered by tenant
  async getVendorByName(tenantId: string, name: string): Promise<Vendor | undefined> {
    const [vendor] = await db.select().from(vendors)
      .where(and(eq(vendors.name, name), eq(vendors.tenantId, tenantId)));
    return vendor || undefined;
  }

  // MULTI-TENANT: createVendor uses tenantId from InsertVendor (set by caller)
  async createVendor(insertVendor: InsertVendor): Promise<Vendor> {
    const [vendor] = await db
      .insert(vendors)
      .values(insertVendor)
      .returning();
    return vendor;
  }

  // MULTI-TENANT: Update vendor only if it belongs to the tenant
  async updateVendor(tenantId: string, id: string, updates: Partial<Vendor>): Promise<Vendor | undefined> {
    const [vendor] = await db
      .update(vendors)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(vendors.id, id), eq(vendors.tenantId, tenantId)))
      .returning();
    return vendor || undefined;
  }

  // MULTI-TENANT: Delete vendor only if it belongs to the tenant
  async deleteVendor(tenantId: string, id: string): Promise<boolean> {
    const result = await db
      .delete(vendors)
      .where(and(eq(vendors.id, id), eq(vendors.tenantId, tenantId)));
    return (result.rowCount ?? 0) > 0;
  }

  // MULTI-TENANT: Get vendors with stats filtered by tenant
  async getVendorsWithStats(tenantId: string): Promise<Array<Vendor & { productCount: number }>> {
    const result = await db
      .select({
        id: vendors.id,
        tenantId: vendors.tenantId,
        name: vendors.name,
        color: vendors.color,
        websiteUrl: vendors.websiteUrl,
        hasWebsite: vendors.hasWebsite,
        websiteType: vendors.websiteType,
        brandDescription: vendors.brandDescription,
        foundedYear: vendors.foundedYear,
        specialty: vendors.specialty,
        targetAudience: vendors.targetAudience,
        lastScrapedAt: vendors.lastScrapedAt,
        scrapingEnabled: vendors.scrapingEnabled,
        sizeChartType: vendors.sizeChartType,
        sizeChartDetectedAt: vendors.sizeChartDetectedAt,
        createdAt: vendors.createdAt,
        updatedAt: vendors.updatedAt,
        productCount: count(products.id)
      })
      .from(vendors)
      .leftJoin(products, eq(vendors.id, products.vendorId))
      .where(eq(vendors.tenantId, tenantId))
      .groupBy(
        vendors.id,
        vendors.tenantId,
        vendors.name,
        vendors.color,
        vendors.websiteUrl,
        vendors.hasWebsite,
        vendors.websiteType,
        vendors.brandDescription,
        vendors.foundedYear,
        vendors.specialty,
        vendors.targetAudience,
        vendors.lastScrapedAt,
        vendors.scrapingEnabled,
        vendors.sizeChartType,
        vendors.sizeChartDetectedAt,
        vendors.createdAt,
        vendors.updatedAt
      )
      .orderBy(vendors.name);

    return result;
  }

  // ========================================
  // Category Methods
  // ========================================

  /**
   * Get all categories with optional filters
   * MULTI-TENANT: Added tenant isolation
   */
  async getAllCategories(tenantId: string, filters?: { isActive?: boolean; search?: string }): Promise<Category[]> {
    let query = db.select().from(categories);

    // MULTI-TENANT: Always filter by tenant
    const conditions = [eq(categories.tenantId, tenantId)];

    if (filters?.isActive !== undefined) {
      conditions.push(eq(categories.isActive, filters.isActive));
    }

    if (filters?.search) {
      const searchCondition = or(
        sql`${categories.name} ILIKE ${`%${filters.search}%`}`,
        sql`${categories.description} ILIKE ${`%${filters.search}%`}`
      );
      if (searchCondition) {
        conditions.push(searchCondition);
      }
    }

    query = query.where(and(...conditions)) as any;

    const categoriesList = await query.orderBy(desc(categories.displayOrder), categories.name);

    // Enrich categories with Shopify category info from products
    const enrichedCategories = await Promise.all(
      categoriesList.map(async (category) => {
        // If category already has a Shopify category path, return as-is
        if (category.shopifyCategoryPath) {
          return category;
        }

        // Check if products with matching product_type have Shopify categories
        const [productWithCategory] = await db
          .select({
            shopifyCategoryPath: products.shopifyCategoryPath,
          })
          .from(products)
          .where(
            and(
              eq(products.productType, category.name),
              sql`${products.shopifyCategoryPath} IS NOT NULL`
            )
          )
          .limit(1);

        // If found, add the Shopify category path to the category for display
        if (productWithCategory?.shopifyCategoryPath) {
          return {
            ...category,
            shopifyCategoryPath: productWithCategory.shopifyCategoryPath,
          };
        }

        return category;
      })
    );

    return enrichedCategories;
  }

  /**
   * Get category by ID
   * MULTI-TENANT: Added tenant isolation
   */
  async getCategoryById(tenantId: string, id: string): Promise<Category | undefined> {
    const [category] = await db.select().from(categories).where(
      and(eq(categories.tenantId, tenantId), eq(categories.id, id))
    );
    return category || undefined;
  }

  /**
   * Get category by name (exact match)
   * MULTI-TENANT: Added tenant isolation
   */
  async getCategoryByName(tenantId: string, name: string): Promise<Category | undefined> {
    const [category] = await db.select().from(categories).where(
      and(eq(categories.tenantId, tenantId), eq(categories.name, name))
    );
    return category || undefined;
  }

  /**
   * Get category by slug
   * MULTI-TENANT: Added tenant isolation
   */
  async getCategoryBySlug(tenantId: string, slug: string): Promise<Category | undefined> {
    const [category] = await db.select().from(categories).where(
      and(eq(categories.tenantId, tenantId), eq(categories.slug, slug))
    );
    return category || undefined;
  }

  /**
   * Create a new category
   * MULTI-TENANT: tenantId comes from InsertCategory
   */
  async createCategory(insertCategory: InsertCategory): Promise<Category> {
    const tenantId = insertCategory.tenantId!;

    // Check for duplicate name within tenant
    const existingByName = await this.getCategoryByName(tenantId, insertCategory.name);
    if (existingByName) {
      throw new Error(`Category with name "${insertCategory.name}" already exists`);
    }

    // Check for duplicate slug within tenant
    const existingBySlug = await this.getCategoryBySlug(tenantId, insertCategory.slug);
    if (existingBySlug) {
      throw new Error(`Category with slug "${insertCategory.slug}" already exists`);
    }

    const [category] = await db
      .insert(categories)
      .values(insertCategory)
      .returning();
    return category;
  }

  /**
   * Update a category
   * MULTI-TENANT: Added tenant isolation
   */
  async updateCategory(tenantId: string, id: string, updates: Partial<Category>): Promise<Category | undefined> {
    // If updating name or slug, check for duplicates within tenant
    if (updates.name) {
      const existing = await this.getCategoryByName(tenantId, updates.name);
      if (existing && existing.id !== id) {
        throw new Error(`Category with name "${updates.name}" already exists`);
      }
    }

    if (updates.slug) {
      const existing = await this.getCategoryBySlug(tenantId, updates.slug);
      if (existing && existing.id !== id) {
        throw new Error(`Category with slug "${updates.slug}" already exists`);
      }
    }

    // MULTI-TENANT: Only update if category belongs to tenant
    const [category] = await db
      .update(categories)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(categories.tenantId, tenantId), eq(categories.id, id)))
      .returning();
    return category || undefined;
  }

  /**
   * Delete a category
   * Options:
   * - reassignTo: Move products to another category
   * - deleteProducts: Delete all products in this category (dangerous!)
   * MULTI-TENANT: Added tenant isolation
   */
  async deleteCategory(tenantId: string, id: string, options?: { reassignTo?: string; deleteProducts?: boolean }): Promise<boolean> {
    // MULTI-TENANT: Handle products within this tenant only
    if (options?.deleteProducts) {
      // Delete all products with this category (filtered by category which is already tenant-scoped)
      await db.delete(products).where(and(eq(products.tenantId, tenantId), eq(products.categoryId, id)));
    } else if (options?.reassignTo) {
      // Move products to another category
      await db
        .update(products)
        .set({ categoryId: options.reassignTo })
        .where(and(eq(products.tenantId, tenantId), eq(products.categoryId, id)));
    } else {
      // Set category to null for all products
      await db
        .update(products)
        .set({ categoryId: null })
        .where(and(eq(products.tenantId, tenantId), eq(products.categoryId, id)));
    }

    // Delete the category (only if it belongs to tenant)
    const result = await db.delete(categories).where(and(eq(categories.tenantId, tenantId), eq(categories.id, id)));
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Get category statistics
   * MULTI-TENANT: Added tenant isolation
   */
  async getCategoryStats(tenantId: string): Promise<{
    total: number;
    active: number;
    withProducts: number;
    uncategorizedProducts: number;
    shopifyCategoryStats: {
      totalProducts: number;
      withValidCategory: number;
      explicitlyUncategorized: number;
      nullCategory: number;
      coveragePercent: number;
    };
    autoMappableProducts: number;
  }> {
    // MULTI-TENANT: All queries filtered by tenant
    const [totalResult] = await db
      .select({ count: count() })
      .from(categories)
      .where(eq(categories.tenantId, tenantId));

    const [activeResult] = await db
      .select({ count: count() })
      .from(categories)
      .where(and(eq(categories.tenantId, tenantId), eq(categories.isActive, true)));

    const [withProductsResult] = await db
      .select({ count: count() })
      .from(categories)
      .where(and(eq(categories.tenantId, tenantId), sql`${categories.productCount} > 0`));

    const [uncategorizedResult] = await db
      .select({ count: count() })
      .from(products)
      .where(and(eq(products.tenantId, tenantId), isNull(products.categoryId)));

    // Shopify category statistics
    const [totalProductsResult] = await db
      .select({ count: count() })
      .from(products)
      .where(eq(products.tenantId, tenantId));

    const [withValidCategoryResult] = await db
      .select({ count: count() })
      .from(products)
      .where(
        and(
          eq(products.tenantId, tenantId),
          sql`${products.shopifyCategoryId} IS NOT NULL`,
          sql`${products.shopifyCategoryId} != 'gid://shopify/TaxonomyCategory/na'`
        )
      );

    const [explicitlyUncategorizedResult] = await db
      .select({ count: count() })
      .from(products)
      .where(and(eq(products.tenantId, tenantId), eq(products.shopifyCategoryId, 'gid://shopify/TaxonomyCategory/na')));

    const [nullCategoryResult] = await db
      .select({ count: count() })
      .from(products)
      .where(and(eq(products.tenantId, tenantId), isNull(products.shopifyCategoryId)));

    // Auto-mappable products: have product_type but no Shopify category
    const [autoMappableResult] = await db
      .select({ count: count() })
      .from(products)
      .where(
        and(
          eq(products.tenantId, tenantId),
          sql`${products.productType} IS NOT NULL`,
          sql`${products.productType} != ''`,
          or(
            isNull(products.shopifyCategoryId),
            eq(products.shopifyCategoryId, 'gid://shopify/TaxonomyCategory/na')
          )
        )
      );

    const totalProducts = Number(totalProductsResult?.count || 0);
    const withValidCategory = Number(withValidCategoryResult?.count || 0);
    const coveragePercent = totalProducts > 0 ? Math.round((withValidCategory / totalProducts) * 1000) / 10 : 0;

    return {
      total: Number(totalResult?.count || 0),
      active: Number(activeResult?.count || 0),
      withProducts: Number(withProductsResult?.count || 0),
      uncategorizedProducts: Number(uncategorizedResult?.count || 0),
      shopifyCategoryStats: {
        totalProducts,
        withValidCategory,
        explicitlyUncategorized: Number(explicitlyUncategorizedResult?.count || 0),
        nullCategory: Number(nullCategoryResult?.count || 0),
        coveragePercent,
      },
      autoMappableProducts: Number(autoMappableResult?.count || 0),
    };
  }

  /**
   * Get mapping insights for product types to Shopify categories
   * Shows coverage, most common mappings, and confidence levels
   */
  async getMappingInsights(): Promise<Array<{
    productType: string;
    totalProducts: number;
    withShopifyCategory: number;
    withoutShopifyCategory: number;
    syncedToShopify: number;
    pendingSync: number;
    coveragePercent: number;
    syncPercent: number;
    mostCommonCategory: string | null;
    mostCommonCategoryCount: number;
    hasMultipleCategories: boolean;
    confidence: 'high' | 'medium' | 'low' | 'none';
    syncStatus: 'synced' | 'pending' | 'not_mapped';
  }>> {
    // Use raw SQL for complex aggregation
    const result = await db.execute(sql`
      WITH type_stats AS (
        SELECT
          product_type,
          COUNT(*) as total_products,
          COUNT(*) FILTER (
            WHERE shopify_category_id IS NOT NULL
            AND shopify_category_id != 'gid://shopify/TaxonomyCategory/na'
          ) as with_category,
          COUNT(*) FILTER (
            WHERE shopify_category_id IS NULL
            OR shopify_category_id = 'gid://shopify/TaxonomyCategory/na'
          ) as without_category,
          COUNT(*) FILTER (
            WHERE shopify_category_id IS NOT NULL
            AND shopify_category_id != 'gid://shopify/TaxonomyCategory/na'
            AND shopify_category_synced_at IS NOT NULL
          ) as synced_count,
          COUNT(*) FILTER (
            WHERE shopify_category_id IS NOT NULL
            AND shopify_category_id != 'gid://shopify/TaxonomyCategory/na'
            AND shopify_category_synced_at IS NULL
          ) as pending_sync_count
        FROM products
        WHERE product_type IS NOT NULL AND product_type != ''
        GROUP BY product_type
      ),
      category_modes AS (
        SELECT
          product_type,
          shopify_category_path,
          COUNT(*) as category_count,
          ROW_NUMBER() OVER (PARTITION BY product_type ORDER BY COUNT(*) DESC) as rn
        FROM products
        WHERE product_type IS NOT NULL
          AND product_type != ''
          AND shopify_category_id IS NOT NULL
          AND shopify_category_id != 'gid://shopify/TaxonomyCategory/na'
        GROUP BY product_type, shopify_category_path
      ),
      category_diversity AS (
        SELECT
          product_type,
          COUNT(DISTINCT shopify_category_path) as unique_categories
        FROM products
        WHERE product_type IS NOT NULL
          AND product_type != ''
          AND shopify_category_id IS NOT NULL
          AND shopify_category_id != 'gid://shopify/TaxonomyCategory/na'
        GROUP BY product_type
      )
      SELECT
        ts.product_type,
        ts.total_products,
        ts.with_category,
        ts.without_category,
        ts.synced_count,
        ts.pending_sync_count,
        ROUND((ts.with_category::numeric / ts.total_products::numeric) * 100, 1) as coverage_percent,
        ROUND((ts.synced_count::numeric / NULLIF(ts.with_category, 0)::numeric) * 100, 1) as sync_percent,
        cm.shopify_category_path as most_common_category,
        cm.category_count as most_common_count,
        COALESCE(cd.unique_categories, 0) as unique_categories
      FROM type_stats ts
      LEFT JOIN category_modes cm ON ts.product_type = cm.product_type AND cm.rn = 1
      LEFT JOIN category_diversity cd ON ts.product_type = cd.product_type
      ORDER BY ts.total_products DESC
    `);

    // Process results and calculate confidence
    return result.rows.map((row: any) => {
      const coveragePercent = Number(row.coverage_percent || 0);
      const syncPercent = Number(row.sync_percent || 0);
      const hasMultipleCategories = Number(row.unique_categories || 0) > 1;
      const totalProducts = Number(row.total_products);
      const mostCommonCount = Number(row.most_common_count || 0);
      const withCategory = Number(row.with_category);
      const syncedCount = Number(row.synced_count || 0);
      const pendingCount = Number(row.pending_sync_count || 0);

      // Confidence calculation:
      // - High: 80%+ coverage AND single dominant category (most common >= 80% of mapped)
      // - Medium: 50-79% coverage OR multiple categories
      // - Low: <50% coverage
      // - None: 0% coverage
      let confidence: 'high' | 'medium' | 'low' | 'none' = 'none';

      if (coveragePercent === 0) {
        confidence = 'none';
      } else if (coveragePercent >= 80) {
        const dominancePercent = (mostCommonCount / withCategory) * 100;
        confidence = dominancePercent >= 80 && !hasMultipleCategories ? 'high' : 'medium';
      } else if (coveragePercent >= 50) {
        confidence = 'medium';
      } else {
        confidence = 'low';
      }

      // Sync status calculation:
      // - 'synced': All mapped products are synced (100%)
      // - 'pending': Some mapped products are not synced yet
      // - 'not_mapped': No products have been mapped to Shopify categories
      let syncStatus: 'synced' | 'pending' | 'not_mapped' = 'not_mapped';

      if (withCategory === 0) {
        syncStatus = 'not_mapped';
      } else if (syncedCount === withCategory) {
        syncStatus = 'synced';
      } else {
        syncStatus = 'pending';
      }

      return {
        productType: String(row.product_type),
        totalProducts,
        withShopifyCategory: withCategory,
        withoutShopifyCategory: Number(row.without_category),
        syncedToShopify: syncedCount,
        pendingSync: pendingCount,
        coveragePercent,
        syncPercent,
        mostCommonCategory: row.most_common_category || null,
        mostCommonCategoryCount: mostCommonCount,
        hasMultipleCategories,
        confidence,
        syncStatus,
      };
    });
  }

  /**
   * Bulk update Shopify category for all products of a specific product type
   * @param productType - The product type to filter by
   * @param shopifyCategoryId - The Shopify category GID to set
   * @param shopifyCategoryPath - The human-readable category path
   * @returns Number of products updated
   */
  async bulkMapProductsByType(productType: string, shopifyCategoryId: string, shopifyCategoryPath: string): Promise<number> {
    const result = await db
      .update(products)
      .set({
        shopifyCategoryId,
        shopifyCategoryPath,
        updatedAt: new Date(),
      })
      .where(eq(products.productType, productType));

    return result.rowCount || 0;
  }

  /**
   * Get all products with a specific product_type
   * Used for batch category syncing to Shopify
   */
  async getProductListByType(productType: string): Promise<Product[]> {
    const result = await db
      .select()
      .from(products)
      .where(eq(products.productType, productType))
      .orderBy(products.title);

    return result as Product[];
  }

  /**
   * Update category's Shopify mapping
   * @param categoryName - Name of the category to update
   * @param shopifyCategoryGid - Shopify category GID
   * @param shopifyCategoryPath - Shopify category path
   */
  async updateCategoryShopifyMapping(categoryName: string, shopifyCategoryGid: string, shopifyCategoryPath: string): Promise<void> {
    await db
      .update(categories)
      .set({
        shopifyCategoryGid,
        shopifyCategoryPath,
        updatedAt: new Date(),
      })
      .where(eq(categories.name, categoryName));
  }

  /**
   * Search Shopify product categories by name or path
   * @param query - Search term (min 2 characters)
   * @param limit - Maximum results to return (default 50)
   * @returns Array of matching categories
   */
  async searchProductCategories(query: string, limit: number = 50, mainCategory?: string): Promise<Array<{ id: string; gid: string; name: string; path: string; level: number }>> {
    console.log(`🔍 Searching product categories for: "${query}"${mainCategory ? ` in main category: "${mainCategory}"` : ''}`);

    if (!query || query.length < 2) {
      console.log(`⚠️  Query too short (${query.length} characters)`);
      return [];
    }

    const searchPattern = `%${query.toLowerCase()}%`;
    console.log(`🔎 Search pattern: ${searchPattern}`);

    try {
      // Build where conditions
      const conditions = [
        or(
          ilike(productCategories.name, searchPattern),
          ilike(productCategories.path, searchPattern)
        )
      ];

      // Add main category filter if provided
      if (mainCategory) {
        conditions.push(ilike(productCategories.path, `${mainCategory}%`));
      }

      const results = await db
        .select({
          id: productCategories.id,
          gid: productCategories.gid,
          name: productCategories.name,
          path: productCategories.path,
          level: productCategories.level,
        })
        .from(productCategories)
        .where(and(...conditions))
        .orderBy(
          // Prioritize exact name matches, then level (prefer higher-level categories), then alphabetical
          sql`CASE WHEN LOWER(${productCategories.name}) = ${query.toLowerCase()} THEN 0 ELSE 1 END`,
          productCategories.level,
          productCategories.name
        )
        .limit(limit);

      console.log(`✅ Found ${results.length} categories`);
      if (results.length > 0) {
        console.log(`📊 First result from DB:`, JSON.stringify(results[0], null, 2));
        console.log(`📊 First result has gid?`, results[0].gid !== undefined, results[0].gid);
      }
      return results;
    } catch (error) {
      console.error(`❌ Error searching categories:`, error);
      throw error;
    }
  }

  /**
   * Update product counts for all categories
   * Should be called periodically or after bulk operations
   */
  async updateCategoryProductCounts(): Promise<void> {
    // Reset all counts to 0 first
    await db.update(categories).set({ productCount: 0 });

    // Get counts per category
    const counts = await db
      .select({
        categoryId: products.categoryId,
        count: count(),
      })
      .from(products)
      .where(sql`${products.categoryId} IS NOT NULL`)
      .groupBy(products.categoryId);

    // Update each category's count
    for (const { categoryId, count: productCount } of counts) {
      if (categoryId) {
        await db
          .update(categories)
          .set({ productCount: Number(productCount) })
          .where(eq(categories.id, categoryId));
      }
    }
  }

  // ========================================
  // Tag Methods
  // ========================================

  async getAllTags(tenantId: string, filters?: { search?: string; unused?: boolean; notSynced?: boolean }): Promise<Tag[]> {
    let query = db.select().from(tags);
    const conditions = [eq(tags.tenantId, tenantId)];

    if (filters?.search) {
      conditions.push(sql`${tags.name} ILIKE ${`%${filters.search}%`}`);
    }

    if (filters?.unused) {
      conditions.push(eq(tags.productCount, 0));
    }

    if (filters?.notSynced) {
      conditions.push(eq(tags.shopifySynced, false));
    }

    query = query.where(and(...conditions)).orderBy(desc(tags.productCount), asc(tags.name)) as any;
    return query;
  }

  async getTagById(tenantId: string, id: string): Promise<Tag | undefined> {
    const result = await db
      .select()
      .from(tags)
      .where(and(eq(tags.tenantId, tenantId), eq(tags.id, id)))
      .limit(1);
    return result[0];
  }

  async getTagByName(tenantId: string, name: string): Promise<Tag | undefined> {
    const normalizedName = name.toLowerCase().trim();
    const result = await db
      .select()
      .from(tags)
      .where(and(eq(tags.tenantId, tenantId), eq(tags.normalizedName, normalizedName)))
      .limit(1);
    return result[0];
  }

  async createTag(tenantId: string, tag: InsertTag): Promise<Tag> {
    const normalizedName = tag.name.toLowerCase().trim();
    const [newTag] = await db
      .insert(tags)
      .values({
        ...tag,
        tenantId,
        normalizedName,
      })
      .returning();
    return newTag;
  }

  async updateTag(tenantId: string, id: string, updates: Partial<Tag>): Promise<Tag | undefined> {
    // If name is being updated, also update normalizedName
    if (updates.name) {
      updates.normalizedName = updates.name.toLowerCase().trim();
    }
    const [updated] = await db
      .update(tags)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(tags.tenantId, tenantId), eq(tags.id, id)))
      .returning();
    return updated;
  }

  async deleteTag(tenantId: string, id: string): Promise<boolean> {
    const result = await db
      .delete(tags)
      .where(and(eq(tags.tenantId, tenantId), eq(tags.id, id)))
      .returning();
    return result.length > 0;
  }

  async refreshTagCounts(tenantId: string): Promise<void> {
    // Get all unique tags from products in this tenant
    const productTags = await db
      .select({ tags: products.tags })
      .from(products)
      .where(and(
        eq(products.tenantId, tenantId),
        sql`${products.tags} IS NOT NULL AND ${products.tags} != ''`
      ));

    // Count occurrences of each tag
    const tagCounts: Record<string, number> = {};
    for (const row of productTags) {
      if (row.tags) {
        const tagList = row.tags.split(',').map(t => t.trim().toLowerCase()).filter(t => t);
        for (const tag of tagList) {
          tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        }
      }
    }

    // Get existing tags
    const existingTags = await this.getAllTags(tenantId);
    const existingTagMap = new Map(existingTags.map(t => [t.normalizedName, t]));

    // Update counts for existing tags, create new tags if needed
    for (const [normalizedName, count] of Object.entries(tagCounts)) {
      const existingTag = existingTagMap.get(normalizedName);
      if (existingTag) {
        await this.updateTag(tenantId, existingTag.id, { productCount: count });
      } else {
        // Create new tag from product data
        await this.createTag(tenantId, {
          name: normalizedName,
          normalizedName,
          tenantId,
        });
        // Update the count
        const newTag = await this.getTagByName(tenantId, normalizedName);
        if (newTag) {
          await this.updateTag(tenantId, newTag.id, { productCount: count });
        }
      }
    }

    // Set count to 0 for tags no longer used
    for (const tag of existingTags) {
      if (!tagCounts[tag.normalizedName]) {
        await this.updateTag(tenantId, tag.id, { productCount: 0 });
      }
    }
  }

  async getTagStats(tenantId: string): Promise<{ total: number; used: number; unused: number; synced: number }> {
    const allTags = await this.getAllTags(tenantId);
    const total = allTags.length;
    const used = allTags.filter(t => t.productCount > 0).length;
    const unused = allTags.filter(t => t.productCount === 0).length;
    const synced = allTags.filter(t => t.shopifySynced).length;
    return { total, used, unused, synced };
  }

  // ========================================
  // Collection Methods
  // ========================================

  async getAllCollections(tenantId: string, filters?: { isActive?: boolean; search?: string; limit?: number; offset?: number; sortBy?: string; sortOrder?: 'asc' | 'desc' }): Promise<{ collections: Collection[]; total: number }> {
    // MULTI-TENANT: Always filter by tenant
    const conditions = [eq(collections.tenantId, tenantId)];

    if (filters?.isActive !== undefined) {
      conditions.push(eq(collections.isActive, filters.isActive));
    }

    if (filters?.search) {
      conditions.push(
        or(
          ilike(collections.name, `%${filters.search}%`),
          ilike(collections.description, `%${filters.search}%`)
        )!
      );
    }

    // MULTI-TENANT: conditions always has at least tenantId filter
    const whereClause = and(...conditions);

    // Get total count
    const totalResult = await db
      .select({ count: count() })
      .from(collections)
      .where(whereClause);

    const total = Number(totalResult[0]?.count || 0);

    // Determine sort column and direction
    const sortOrder = filters?.sortOrder || 'desc';
    const orderFn = sortOrder === 'asc' ? asc : desc;

    let orderByClause;
    switch (filters?.sortBy) {
      case 'name':
        orderByClause = orderFn(collections.name);
        break;
      case 'productCount':
        orderByClause = orderFn(collections.productCount);
        break;
      case 'isActive':
        orderByClause = orderFn(collections.isActive);
        break;
      case 'createdAt':
        orderByClause = orderFn(collections.createdAt);
        break;
      default:
        orderByClause = desc(collections.createdAt); // Default sort
    }

    // Get paginated results
    const results = await db
      .select()
      .from(collections)
      .where(whereClause)
      .orderBy(orderByClause)
      .limit(filters?.limit || 100)
      .offset(filters?.offset || 0);

    return { collections: results, total };
  }

  // MULTI-TENANT: All collection methods require tenantId
  async getCollectionById(tenantId: string, id: string): Promise<Collection | undefined> {
    const [collection] = await db
      .select()
      .from(collections)
      .where(and(eq(collections.tenantId, tenantId), eq(collections.id, id)));
    return collection;
  }

  async getCollectionByName(tenantId: string, name: string): Promise<Collection | undefined> {
    const [collection] = await db
      .select()
      .from(collections)
      .where(and(eq(collections.tenantId, tenantId), eq(collections.name, name)));
    return collection;
  }

  async getCollectionBySlug(tenantId: string, slug: string): Promise<Collection | undefined> {
    const [collection] = await db
      .select()
      .from(collections)
      .where(and(eq(collections.tenantId, tenantId), eq(collections.slug, slug)));
    return collection;
  }

  async getCollectionByShopifyId(tenantId: string, shopifyCollectionId: string): Promise<Collection | undefined> {
    const [collection] = await db
      .select()
      .from(collections)
      .where(and(eq(collections.tenantId, tenantId), eq(collections.shopifyCollectionId, shopifyCollectionId)));
    return collection;
  }

  // MULTI-TENANT: tenantId required for all collection operations
  async createCollection(tenantId: string, insertCollection: InsertCollection): Promise<Collection> {
    // Validate smart collection rules
    if (insertCollection.shopifyType === 'smart') {
      const rules = insertCollection.rules as { rules: unknown[]; disjunctive: boolean } | null | undefined;
      if (!rules || !rules.rules || rules.rules.length === 0) {
        throw new Error('Smart collections require at least one condition');
      }
      if (rules.rules.length > 60) {
        throw new Error('Smart collections can have a maximum of 60 conditions');
      }
    }

    // PRIORITY 1: Check by Shopify Collection ID first (most reliable identifier)
    if (insertCollection.shopifyCollectionId) {
      const existingByShopifyId = await this.getCollectionByShopifyId(tenantId, insertCollection.shopifyCollectionId);
      if (existingByShopifyId) {
        console.log(`[createCollection] Found existing collection by shopifyCollectionId: ${insertCollection.shopifyCollectionId}`);
        return existingByShopifyId;
      }
    }

    // PRIORITY 2: Check by slug (if provided - common during Shopify sync)
    if (insertCollection.slug) {
      const existingBySlug = await this.getCollectionBySlug(tenantId, insertCollection.slug);
      if (existingBySlug) {
        console.log(`[createCollection] Found existing collection by slug: ${insertCollection.slug}`);
        // Update with Shopify ID if we have one and existing doesn't
        if (insertCollection.shopifyCollectionId && !existingBySlug.shopifyCollectionId) {
          const [updated] = await db
            .update(collections)
            .set({
              shopifyCollectionId: insertCollection.shopifyCollectionId,
              updatedAt: new Date()
            })
            .where(and(eq(collections.tenantId, tenantId), eq(collections.id, existingBySlug.id)))
            .returning();
          return updated;
        }
        return existingBySlug;
      }
    }

    // PRIORITY 3: Check by name
    if (insertCollection.name) {
      const existingByName = await this.getCollectionByName(tenantId, insertCollection.name);
      if (existingByName) {
        console.log(`[createCollection] Found existing collection by name: ${insertCollection.name}`);
        // Update with Shopify ID if provided and different
        if (insertCollection.shopifyCollectionId &&
            existingByName.shopifyCollectionId !== insertCollection.shopifyCollectionId) {
          const [updated] = await db
            .update(collections)
            .set({
              shopifyCollectionId: insertCollection.shopifyCollectionId,
              updatedAt: new Date()
            })
            .where(and(eq(collections.tenantId, tenantId), eq(collections.id, existingByName.id)))
            .returning();
          return updated;
        }
        return existingByName;
      }
    }

    // Auto-generate slug from name if not provided
    let slug: string = insertCollection.slug || '';
    if (!slug && insertCollection.name) {
      slug = insertCollection.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

      // Ensure slug is unique within tenant
      let uniqueSlug = slug;
      let counter = 1;
      while (await this.getCollectionBySlug(tenantId, uniqueSlug)) {
        uniqueSlug = `${slug}-${counter}`;
        counter++;
      }
      slug = uniqueSlug;
    }

    // Ensure we have a slug (fallback to uuid if somehow still empty)
    if (!slug) {
      slug = `collection-${Date.now()}`;
    }

    // Try to insert, handle unique constraint violations gracefully - MULTI-TENANT
    try {
      const [collection] = await db
        .insert(collections)
        .values({ ...insertCollection, tenantId, slug: slug })
        .returning();
      console.log(`[createCollection] Created new collection: ${insertCollection.name} (slug: ${slug})`);
      return collection;
    } catch (error: any) {
      // Handle unique constraint violations by finding the existing record
      if (error.code === '23505') { // PostgreSQL unique violation
        console.log(`[createCollection] Unique constraint hit, looking up existing collection...`);
        // Try to find by slug first, then by name - MULTI-TENANT
        if (slug) {
          const existingBySlug = await this.getCollectionBySlug(tenantId, slug);
          if (existingBySlug) return existingBySlug;
        }
        if (insertCollection.name) {
          const existingByName = await this.getCollectionByName(tenantId, insertCollection.name);
          if (existingByName) return existingByName;
        }
        if (insertCollection.shopifyCollectionId) {
          const existingByShopifyId = await this.getCollectionByShopifyId(tenantId, insertCollection.shopifyCollectionId);
          if (existingByShopifyId) return existingByShopifyId;
        }
      }
      // Re-throw if we couldn't handle it
      throw error;
    }
  }

  // MULTI-TENANT: tenantId required for update validation and ownership check
  async updateCollection(tenantId: string, id: string, updates: Partial<Collection>): Promise<Collection | undefined> {
    // Create a filtered updates object to avoid conflicts with duplicates
    const filteredUpdates = { ...updates };

    // Check for duplicate name if name is being updated - MULTI-TENANT
    // If there's a conflict, skip updating the name but continue with other fields
    if (filteredUpdates.name) {
      const existing = await this.getCollectionByName(tenantId, filteredUpdates.name);
      if (existing && existing.id !== id) {
        // Log warning but don't throw - just skip the name update
        console.log(`[updateCollection] Skipping name update for collection ${id} - duplicate name "${filteredUpdates.name}" exists in collection ${existing.id}`);
        delete filteredUpdates.name;
      }
    }

    // Check for duplicate slug if slug is being updated - MULTI-TENANT
    // If there's a conflict, skip updating the slug but continue with other fields
    if (filteredUpdates.slug) {
      const existing = await this.getCollectionBySlug(tenantId, filteredUpdates.slug);
      if (existing && existing.id !== id) {
        console.log(`[updateCollection] Skipping slug update for collection ${id} - duplicate slug "${filteredUpdates.slug}" exists in collection ${existing.id}`);
        delete filteredUpdates.slug;
      }
    }

    // MULTI-TENANT: Include tenantId in WHERE clause for ownership validation
    const [collection] = await db
      .update(collections)
      .set({ ...filteredUpdates, updatedAt: new Date() })
      .where(and(eq(collections.tenantId, tenantId), eq(collections.id, id)))
      .returning();
    return collection;
  }

  // MULTI-TENANT: tenantId required for ownership validation
  async deleteCollection(tenantId: string, id: string): Promise<boolean> {
    // Delete will cascade to product_collections due to ON DELETE CASCADE
    // MULTI-TENANT: Include tenantId in WHERE clause
    const result = await db
      .delete(collections)
      .where(and(eq(collections.tenantId, tenantId), eq(collections.id, id)));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  // MULTI-TENANT: tenantId required for collection lookup
  async getCollectionWithProducts(tenantId: string, id: string): Promise<(Collection & { products: Product[] }) | undefined> {
    const collection = await this.getCollectionById(tenantId, id);
    if (!collection) return undefined;

    // Get products in this collection via join table
    const collectionProducts = await db
      .select({
        product: products,
      })
      .from(productCollections)
      .innerJoin(products, eq(productCollections.productId, products.id))
      .where(eq(productCollections.collectionId, id))
      .orderBy(productCollections.position);

    return {
      ...collection,
      products: collectionProducts.map(cp => cp.product),
    };
  }

  // MULTI-TENANT: tenantId required for collection ownership verification
  async getCollectionProductsPaginated(
    tenantId: string,
    id: string,
    options?: { limit?: number; offset?: number }
  ): Promise<{ products: Product[]; total: number }> {
    // First verify collection belongs to tenant
    const collection = await this.getCollectionById(tenantId, id);
    if (!collection) {
      return { products: [], total: 0 };
    }

    const limit = options?.limit ?? 25;
    const offset = options?.offset ?? 0;

    // Get total count
    const countResult = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(productCollections)
      .where(eq(productCollections.collectionId, id));

    const total = Number(countResult[0]?.count ?? 0);

    // Get paginated products
    const collectionProducts = await db
      .select({
        product: products,
      })
      .from(productCollections)
      .innerJoin(products, eq(productCollections.productId, products.id))
      .where(eq(productCollections.collectionId, id))
      .orderBy(productCollections.position)
      .limit(limit)
      .offset(offset);

    return {
      products: collectionProducts.map(cp => cp.product),
      total,
    };
  }

  async addProductsToCollection(collectionId: string, productIds: string[], skipCountUpdate = false): Promise<void> {
    // Get current max position for this collection
    const maxPositionResult = await db
      .select({ maxPosition: sql<number>`COALESCE(MAX(${productCollections.position}), -1)` })
      .from(productCollections)
      .where(eq(productCollections.collectionId, collectionId));

    let position = Number(maxPositionResult[0]?.maxPosition ?? -1) + 1;

    // Insert each product-collection relationship
    for (const productId of productIds) {
      // Check if already exists
      const existing = await db
        .select()
        .from(productCollections)
        .where(
          and(
            eq(productCollections.collectionId, collectionId),
            eq(productCollections.productId, productId)
          )
        );

      if (existing.length === 0) {
        await db.insert(productCollections).values({
          collectionId,
          productId,
          position,
        });
        position++;
      }
    }

    // Update collection product count (skip during bulk imports for performance)
    if (!skipCountUpdate) {
      await this.updateSingleCollectionProductCount(collectionId);
    }
  }

  // Update product count for a single collection (efficient for individual updates)
  async updateSingleCollectionProductCount(collectionId: string): Promise<void> {
    const countResult = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(productCollections)
      .where(eq(productCollections.collectionId, collectionId));

    const count = countResult[0]?.count ?? 0;
    await db.update(collections)
      .set({ productCount: count })
      .where(eq(collections.id, collectionId));
  }

  async removeProductsFromCollection(collectionId: string, productIds: string[]): Promise<void> {
    await db
      .delete(productCollections)
      .where(
        and(
          eq(productCollections.collectionId, collectionId),
          inArray(productCollections.productId, productIds)
        )
      );

    // Update collection product count
    await this.updateCollectionProductCounts();
  }

  async getProductCollections(productId: string): Promise<Collection[]> {
    const result = await db
      .select({
        collection: collections,
      })
      .from(productCollections)
      .innerJoin(collections, eq(productCollections.collectionId, collections.id))
      .where(eq(productCollections.productId, productId))
      .orderBy(collections.name);

    return result.map(r => r.collection);
  }

  async updateCollectionProductCounts(): Promise<void> {
    // Reset all counts to 0 first
    await db.update(collections).set({ productCount: 0 });

    // Get counts per collection
    const counts = await db
      .select({
        collectionId: productCollections.collectionId,
        count: count(),
      })
      .from(productCollections)
      .groupBy(productCollections.collectionId);

    // Update each collection's count
    for (const { collectionId, count: productCount } of counts) {
      await db
        .update(collections)
        .set({ productCount: Number(productCount) })
        .where(eq(collections.id, collectionId));
    }
  }

  // ============================================================================
  // Optimized Batch Collection Operations (for import performance)
  // ============================================================================

  async getAllCollectionsMap(tenantId: string): Promise<Map<string, Collection>> {
    // MULTI-TENANT: Always filter by tenant
    const allCollections = await db
      .select()
      .from(collections)
      .where(eq(collections.tenantId, tenantId));
    const map = new Map<string, Collection>();
    for (const collection of allCollections) {
      if (collection.shopifyCollectionId) {
        map.set(collection.shopifyCollectionId, collection);
      }
    }
    return map;
  }

  // MULTI-TENANT: tenantId required for batch collection creation
  async batchCreateCollections(tenantId: string, insertCollections: InsertCollection[]): Promise<Collection[]> {
    if (insertCollections.length === 0) {
      return [];
    }

    // Insert one-by-one to handle duplicates gracefully
    const created: Collection[] = [];
    for (const collectionData of insertCollections) {
      try {
        // Ensure slug is set (auto-generate from name if not provided)
        const slug = collectionData.slug || (collectionData.name
          ? collectionData.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
          : `collection-${Date.now()}`);

        // MULTI-TENANT: Include tenantId in insert
        const [newCollection] = await db.insert(collections).values({ ...collectionData, tenantId, slug }).returning();
        created.push(newCollection);
      } catch (error: any) {
        // Handle duplicate name/slug errors - collection already exists
        if (error.code === '23505') { // Unique constraint violation
          console.log(`Collection "${collectionData.name}" already exists, skipping creation`);

          // Try to find existing collection by name or slug - MULTI-TENANT
          let existing: Collection | undefined;
          if (collectionData.shopifyCollectionId) {
            existing = await this.getCollectionByShopifyId(tenantId, collectionData.shopifyCollectionId);
          }

          if (!existing && collectionData.name) {
            existing = await this.getCollectionByName(tenantId, collectionData.name);
          }

          if (!existing && collectionData.slug) {
            existing = await this.getCollectionBySlug(tenantId, collectionData.slug);
          }

          if (existing) {
            created.push(existing);
          }
        } else {
          // Re-throw non-duplicate errors
          throw error;
        }
      }
    }

    console.log(`Created ${created.length} collections (${insertCollections.length} requested)`);
    return created;
  }

  async batchCreateProductCollectionLinks(links: Array<{ collectionId: string; productId: string }>): Promise<void> {
    if (links.length === 0) {
      return;
    }

    // Get existing links to avoid duplicates
    const allProductIds = Array.from(new Set(links.map(l => l.productId)));
    const existingLinks = await db
      .select({
        collectionId: productCollections.collectionId,
        productId: productCollections.productId,
      })
      .from(productCollections)
      .where(inArray(productCollections.productId, allProductIds));

    // Create a Set of existing link keys for fast lookup
    const existingLinkKeys = new Set(
      existingLinks.map(link => `${link.collectionId}:${link.productId}`)
    );

    // Filter out existing links
    const newLinks = links.filter(
      link => !existingLinkKeys.has(`${link.collectionId}:${link.productId}`)
    );

    if (newLinks.length === 0) {
      console.log(`All ${links.length} collection-product links already exist, skipping insert`);
      return;
    }

    console.log(`Creating ${newLinks.length} new collection-product links (${existingLinks.length} already exist)`);

    // Insert in batches of 1000 to avoid query size limits
    const batchSize = 1000;
    for (let i = 0; i < newLinks.length; i += batchSize) {
      const batch = newLinks.slice(i, i + batchSize);
      const valuesToInsert = batch.map((link, index) => ({
        collectionId: link.collectionId,
        productId: link.productId,
        position: i + index, // Sequential position
      }));

      await db.insert(productCollections).values(valuesToInsert);
      console.log(`Inserted batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(newLinks.length / batchSize)} (${valuesToInsert.length} links)`);
    }

    // Update collection product counts after all links are created
    await this.updateCollectionProductCounts();
  }

  // ============================================================================
  // Collection Health System Methods
  // ============================================================================

  // --- Collection Health Issues ---
  async getCollectionHealthIssues(tenantId: string, filters?: { status?: string; issueType?: string }): Promise<CollectionHealthIssue[]> {
    const conditions = [eq(collectionHealthIssues.tenantId, tenantId)];

    if (filters?.status) {
      conditions.push(eq(collectionHealthIssues.status, filters.status));
    }
    if (filters?.issueType) {
      conditions.push(eq(collectionHealthIssues.issueType, filters.issueType));
    }

    return await db
      .select()
      .from(collectionHealthIssues)
      .where(and(...conditions))
      .orderBy(desc(collectionHealthIssues.detectedAt));
  }

  async getCollectionHealthIssueById(id: string): Promise<CollectionHealthIssue | undefined> {
    const [issue] = await db
      .select()
      .from(collectionHealthIssues)
      .where(eq(collectionHealthIssues.id, id));
    return issue;
  }

  async createCollectionHealthIssue(data: InsertCollectionHealthIssue): Promise<CollectionHealthIssue> {
    const [issue] = await db
      .insert(collectionHealthIssues)
      .values(data)
      .returning();
    return issue;
  }

  async updateCollectionHealthIssue(id: string, updates: Partial<CollectionHealthIssue>): Promise<CollectionHealthIssue | undefined> {
    const [issue] = await db
      .update(collectionHealthIssues)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(collectionHealthIssues.id, id))
      .returning();
    return issue;
  }

  async deleteCollectionHealthIssue(id: string): Promise<boolean> {
    const result = await db
      .delete(collectionHealthIssues)
      .where(eq(collectionHealthIssues.id, id));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  async getOpenHealthIssuesCount(tenantId: string): Promise<number> {
    const result = await db
      .select({ count: count() })
      .from(collectionHealthIssues)
      .where(and(
        eq(collectionHealthIssues.tenantId, tenantId),
        eq(collectionHealthIssues.status, 'open')
      ));

    return Number(result[0]?.count ?? 0);
  }

  // --- Navigation Menus ---
  async getNavigationMenus(tenantId: string): Promise<NavigationMenu[]> {
    return await db
      .select()
      .from(navigationMenus)
      .where(eq(navigationMenus.tenantId, tenantId))
      .orderBy(navigationMenus.title);
  }

  async getNavigationMenuById(id: string): Promise<NavigationMenu | undefined> {
    const [menu] = await db
      .select()
      .from(navigationMenus)
      .where(eq(navigationMenus.id, id));
    return menu;
  }

  async createNavigationMenu(data: InsertNavigationMenu): Promise<NavigationMenu> {
    const [menu] = await db
      .insert(navigationMenus)
      .values(data)
      .returning();
    return menu;
  }

  async upsertNavigationMenu(data: InsertNavigationMenu): Promise<NavigationMenu> {
    // Upsert by tenant_id + shopify_menu_id
    const [menu] = await db
      .insert(navigationMenus)
      .values(data)
      .onConflictDoUpdate({
        target: [navigationMenus.tenantId, navigationMenus.shopifyMenuId],
        set: {
          title: data.title,
          handle: data.handle,
          itemCount: data.itemCount,
          syncedAt: new Date(),
          updatedAt: new Date(),
        },
      })
      .returning();
    return menu;
  }

  async deleteNavigationMenu(id: string): Promise<boolean> {
    const result = await db
      .delete(navigationMenus)
      .where(eq(navigationMenus.id, id));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  // --- Navigation Items ---
  async getNavigationItems(menuId: string): Promise<NavigationItem[]> {
    return await db
      .select()
      .from(navigationItems)
      .where(eq(navigationItems.menuId, menuId))
      .orderBy(navigationItems.position);
  }

  async createNavigationItem(data: InsertNavigationItem): Promise<NavigationItem> {
    const [item] = await db
      .insert(navigationItems)
      .values(data)
      .returning();
    return item;
  }

  async deleteNavigationItemsByMenu(menuId: string): Promise<boolean> {
    const result = await db
      .delete(navigationItems)
      .where(eq(navigationItems.menuId, menuId));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  // ============================================================================
  // Education Center Methods
  // ============================================================================

  // --- Education Articles (Global) ---
  async getEducationArticles(options?: {
    category?: string;
    isActive?: boolean;
    isPinned?: boolean;
    relevantIssueType?: string;
  }): Promise<EducationArticle[]> {
    const conditions = [];

    if (options?.isActive !== undefined) {
      conditions.push(eq(educationArticles.isActive, options.isActive));
    }
    if (options?.isPinned !== undefined) {
      conditions.push(eq(educationArticles.isPinned, options.isPinned));
    }
    if (options?.category) {
      conditions.push(eq(educationArticles.category, options.category));
    }

    let query = db.select().from(educationArticles);

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    const results = await query.orderBy(
      desc(educationArticles.isPinned),
      asc(educationArticles.displayOrder)
    );

    // Filter by relevant issue type if specified (post-query since it's an array field)
    if (options?.relevantIssueType) {
      return results.filter(article =>
        article.relevantIssueTypes?.includes(options.relevantIssueType!)
      );
    }

    return results;
  }

  async getEducationArticleBySlug(slug: string): Promise<EducationArticle | undefined> {
    const [article] = await db
      .select()
      .from(educationArticles)
      .where(eq(educationArticles.slug, slug));
    return article;
  }

  async createEducationArticle(data: InsertEducationArticle): Promise<EducationArticle> {
    const [article] = await db
      .insert(educationArticles)
      .values(data)
      .returning();
    return article;
  }

  async updateEducationArticle(id: string, updates: Partial<EducationArticle>): Promise<EducationArticle | undefined> {
    const [article] = await db
      .update(educationArticles)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(educationArticles.id, id))
      .returning();
    return article;
  }

  // --- App Education Library (Global) ---
  async getAppEducationLibrary(options?: {
    isVerified?: boolean;
    createsCollections?: boolean;
    riskLevel?: string;
  }): Promise<AppEducationLibrary[]> {
    const conditions = [];

    if (options?.isVerified !== undefined) {
      conditions.push(eq(appEducationLibrary.isVerified, options.isVerified));
    }
    if (options?.createsCollections !== undefined) {
      conditions.push(eq(appEducationLibrary.createsCollections, options.createsCollections));
    }
    if (options?.riskLevel) {
      conditions.push(eq(appEducationLibrary.riskLevel, options.riskLevel));
    }

    let query = db.select().from(appEducationLibrary);

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    return await query.orderBy(asc(appEducationLibrary.appName));
  }

  async getAppEducationLibraryById(id: string): Promise<AppEducationLibrary | undefined> {
    const [app] = await db
      .select()
      .from(appEducationLibrary)
      .where(eq(appEducationLibrary.id, id));
    return app;
  }

  async getAppEducationLibraryByName(appName: string): Promise<AppEducationLibrary | undefined> {
    const [app] = await db
      .select()
      .from(appEducationLibrary)
      .where(eq(appEducationLibrary.appName, appName));
    return app;
  }

  async createAppEducationLibrary(data: InsertAppEducationLibrary): Promise<AppEducationLibrary> {
    const [app] = await db
      .insert(appEducationLibrary)
      .values(data)
      .returning();
    return app;
  }

  async updateAppEducationLibrary(id: string, updates: Partial<AppEducationLibrary>): Promise<AppEducationLibrary | undefined> {
    const [app] = await db
      .update(appEducationLibrary)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(appEducationLibrary.id, id))
      .returning();
    return app;
  }

  // --- Tenant Detected Apps ---
  async getTenantDetectedApps(tenantId: string, options?: {
    includeHidden?: boolean;
  }): Promise<(TenantDetectedApp & { libraryApp?: AppEducationLibrary })[]> {
    const conditions = [eq(tenantDetectedApps.tenantId, tenantId)];

    if (!options?.includeHidden) {
      conditions.push(eq(tenantDetectedApps.isHidden, false));
    }

    const results = await db
      .select()
      .from(tenantDetectedApps)
      .leftJoin(appEducationLibrary, eq(tenantDetectedApps.libraryAppId, appEducationLibrary.id))
      .where(and(...conditions))
      .orderBy(desc(tenantDetectedApps.collectionsCreated));

    return results.map(r => ({
      ...r.tenant_detected_apps,
      libraryApp: r.app_education_library || undefined,
    }));
  }

  async getTenantDetectedAppByName(tenantId: string, detectedName: string): Promise<TenantDetectedApp | undefined> {
    const [app] = await db
      .select()
      .from(tenantDetectedApps)
      .where(and(
        eq(tenantDetectedApps.tenantId, tenantId),
        eq(tenantDetectedApps.detectedName, detectedName)
      ));
    return app;
  }

  async createTenantDetectedApp(data: InsertTenantDetectedApp): Promise<TenantDetectedApp> {
    const [app] = await db
      .insert(tenantDetectedApps)
      .values(data)
      .returning();
    return app;
  }

  async updateTenantDetectedApp(id: string, updates: Partial<TenantDetectedApp>): Promise<TenantDetectedApp | undefined> {
    const [app] = await db
      .update(tenantDetectedApps)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(tenantDetectedApps.id, id))
      .returning();
    return app;
  }

  async upsertTenantDetectedApp(tenantId: string, detectedName: string, libraryAppId?: string): Promise<TenantDetectedApp> {
    // Check if already exists
    const existing = await this.getTenantDetectedAppByName(tenantId, detectedName);

    if (existing) {
      // Update last seen and increment count
      const [updated] = await db
        .update(tenantDetectedApps)
        .set({
          lastSeenAt: new Date(),
          collectionsCreated: sql`${tenantDetectedApps.collectionsCreated} + 1`,
          libraryAppId: libraryAppId || existing.libraryAppId,
          updatedAt: new Date(),
        })
        .where(eq(tenantDetectedApps.id, existing.id))
        .returning();
      return updated;
    }

    // Create new
    return this.createTenantDetectedApp({
      tenantId,
      detectedName,
      libraryAppId,
      collectionsCreated: 1,
    });
  }

  // --- App Detection Helper ---
  async findMatchingLibraryApp(creatorName: string): Promise<AppEducationLibrary | undefined> {
    // Get all library apps and check detection patterns
    const allApps = await this.getAppEducationLibrary();

    for (const app of allApps) {
      const patterns = app.detectionPatterns as { creatorNames?: string[] } | null;
      if (patterns?.creatorNames) {
        for (const pattern of patterns.creatorNames) {
          if (creatorName.toLowerCase().includes(pattern.toLowerCase())) {
            return app;
          }
        }
      }
    }

    return undefined;
  }

  async createProduct(insertProduct: InsertProduct): Promise<Product> {
    // Validate status enum
    const VALID_STATUSES = ['local_draft', 'draft', 'active', 'archived'] as const;
    if (insertProduct.status && !VALID_STATUSES.includes(insertProduct.status as any)) {
      throw new Error(`Invalid status: ${insertProduct.status}. Must be one of: ${VALID_STATUSES.join(', ')}`);
    }

    // Validate publish_status enum
    const VALID_PUBLISH_STATUSES = ['not_published', 'publishing', 'published', 'failed'] as const;
    if (insertProduct.publishStatus && !VALID_PUBLISH_STATUSES.includes(insertProduct.publishStatus as any)) {
      throw new Error(`Invalid publishStatus: ${insertProduct.publishStatus}. Must be one of: ${VALID_PUBLISH_STATUSES.join(', ')}`);
    }

    const [product] = await db
      .insert(products)
      .values(insertProduct)
      .returning();
    return product;
  }

  // MULTI-TENANT: Get product by ID with tenant isolation
  async getProduct(tenantId: string, id: string): Promise<Product | undefined> {
    const [product] = await db
      .select()
      .from(products)
      .where(and(eq(products.tenantId, tenantId), eq(products.id, id)));
    return product || undefined;
  }

  // MULTI-TENANT: Get products with tenant isolation
  async getProducts(tenantId: string, filters?: {
    status?: string;
    vendorId?: string;
    shopifyProductId?: string;
    publishStatus?: string;
    categoryId?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<Product[]> {
    let query = db
      .select()
      .from(products)
      .orderBy(desc(products.createdAt));

    // MULTI-TENANT: Always filter by tenantId first
    const conditions = [eq(products.tenantId, tenantId)];
    if (filters?.status) conditions.push(eq(products.status, filters.status as any));
    if (filters?.vendorId) conditions.push(eq(products.vendorId, filters.vendorId));
    if (filters?.shopifyProductId) conditions.push(eq(products.shopifyProductId, filters.shopifyProductId));
    if (filters?.publishStatus) conditions.push(eq(products.publishStatus, filters.publishStatus as any));
    if (filters?.categoryId) conditions.push(eq(products.categoryId, filters.categoryId));

    // Server-side search across multiple fields (case-insensitive)
    if (filters?.search && filters.search.trim()) {
      const searchTerm = `%${filters.search.trim()}%`;
      conditions.push(
        or(
          ilike(products.title, searchTerm),
          ilike(products.vendor, searchTerm),
          ilike(products.category, searchTerm),
          ilike(products.styleNumber, searchTerm),
          // Search by variant SKU using EXISTS subquery
          sql`EXISTS (SELECT 1 FROM ${productVariants} WHERE ${productVariants.productId} = ${products.id} AND ${productVariants.sku} ILIKE ${searchTerm})`
        )!
      );
    }

    // Always apply conditions (at minimum tenantId)
    query = query.where(and(...conditions)) as any;

    // Add pagination only if explicitly requested
    // If no limit is provided, load all matching products (backward compatible)
    if (filters?.limit !== undefined) {
      const limit = filters.limit;
      const offset = filters?.offset || 0;
      query = query.limit(limit).offset(offset) as any;
    }

    return await query;
  }

  // MULTI-TENANT: Get products count with tenant isolation
  async getProductsCount(tenantId: string, filters?: {
    status?: string;
    vendorId?: string;
    shopifyProductId?: string;
    publishStatus?: string;
    search?: string;
  }): Promise<number> {
    let query = db
      .select({ count: count() })
      .from(products);

    // MULTI-TENANT: Always filter by tenantId first
    const conditions = [eq(products.tenantId, tenantId)];
    if (filters?.status) conditions.push(eq(products.status, filters.status as any));
    if (filters?.vendorId) conditions.push(eq(products.vendorId, filters.vendorId));
    if (filters?.shopifyProductId) conditions.push(eq(products.shopifyProductId, filters.shopifyProductId));
    if (filters?.publishStatus) conditions.push(eq(products.publishStatus, filters.publishStatus as any));

    // Server-side search across multiple fields (case-insensitive)
    // Apply same search logic as getProducts for accurate count
    if (filters?.search && filters.search.trim()) {
      const searchTerm = `%${filters.search.trim()}%`;
      conditions.push(
        or(
          ilike(products.title, searchTerm),
          ilike(products.vendor, searchTerm),
          ilike(products.category, searchTerm),
          ilike(products.styleNumber, searchTerm),
          // Search by variant SKU using EXISTS subquery
          sql`EXISTS (SELECT 1 FROM ${productVariants} WHERE ${productVariants.productId} = ${products.id} AND ${productVariants.sku} ILIKE ${searchTerm})`
        )!
      );
    }

    // Always apply conditions (at minimum tenantId)
    query = query.where(and(...conditions)) as any;

    const result = await query;
    return result[0].count as number;
  }

  // MULTI-TENANT: Update product with tenant isolation
  async updateProduct(tenantId: string, id: string, updates: Partial<Product>): Promise<Product | undefined> {
    // Validate status enum if provided
    const VALID_STATUSES = ['local_draft', 'draft', 'active', 'archived'] as const;
    if (updates.status && !VALID_STATUSES.includes(updates.status as any)) {
      throw new Error(`Invalid status: ${updates.status}. Must be one of: ${VALID_STATUSES.join(', ')}`);
    }

    // Validate publish_status enum if provided
    const VALID_PUBLISH_STATUSES = ['not_published', 'publishing', 'published', 'failed'] as const;
    if (updates.publishStatus && !VALID_PUBLISH_STATUSES.includes(updates.publishStatus as any)) {
      throw new Error(`Invalid publishStatus: ${updates.publishStatus}. Must be one of: ${VALID_PUBLISH_STATUSES.join(', ')}`);
    }

    // MULTI-TENANT: Only update if product belongs to tenant
    const [product] = await db
      .update(products)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(products.tenantId, tenantId), eq(products.id, id)))
      .returning();
    return product || undefined;
  }

  // MULTI-TENANT: Delete product with tenant isolation
  async deleteProduct(tenantId: string, id: string): Promise<void> {
    // MULTI-TENANT: Only delete if product belongs to tenant
    await db
      .delete(products)
      .where(and(eq(products.tenantId, tenantId), eq(products.id, id)));
  }

  // ============================================================
  // Internal Product Lookup Methods (for Shopify sync services)
  // These use Shopify IDs which are globally unique across all tenants
  // Should only be called after tenant ownership is verified in routes
  // ============================================================

  /**
   * Get products by Shopify Product ID (for Shopify sync)
   * NOTE: Does NOT filter by tenant - Shopify Product IDs are globally unique
   * Only use after verifying product ownership in route handler
   *
   * Handles both ID formats for backwards compatibility:
   * - Numeric: "9266613027048"
   * - Full GID: "gid://shopify/Product/9266613027048"
   */
  async getProductByShopifyId(shopifyProductId: string): Promise<Product[]> {
    // Extract numeric ID if full GID format is provided
    const numericId = shopifyProductId.includes('/')
      ? shopifyProductId.split('/').pop()
      : shopifyProductId;
    const gidFormat = `gid://shopify/Product/${numericId}`;

    // Query for both formats to handle legacy data
    return await db
      .select()
      .from(products)
      .where(or(
        eq(products.shopifyProductId, numericId!),
        eq(products.shopifyProductId, gidFormat)
      ));
  }

  /**
   * Update product by Shopify Product ID (for Shopify sync)
   * NOTE: Does NOT filter by tenant - assumes ownership already verified
   * Only use after verifying product ownership in route handler
   *
   * Handles both ID formats for backwards compatibility:
   * - Numeric: "9266613027048"
   * - Full GID: "gid://shopify/Product/9266613027048"
   */
  async updateProductByShopifyId(shopifyProductId: string, updates: Partial<Product>): Promise<Product | undefined> {
    // Extract numeric ID if full GID format is provided
    const numericId = shopifyProductId.includes('/')
      ? shopifyProductId.split('/').pop()
      : shopifyProductId;
    const gidFormat = `gid://shopify/Product/${numericId}`;

    const [product] = await db
      .update(products)
      .set({ ...updates, updatedAt: new Date() })
      .where(or(
        eq(products.shopifyProductId, numericId!),
        eq(products.shopifyProductId, gidFormat)
      ))
      .returning();
    return product || undefined;
  }

  /**
   * Get product by internal ID (for internal services without tenant context)
   * NOTE: This is for internal use only (webhooks, batch jobs)
   * Does NOT filter by tenant - only use in trusted internal contexts
   */
  async getProductByInternalId(id: string): Promise<Product | undefined> {
    const [product] = await db
      .select()
      .from(products)
      .where(eq(products.id, id));
    return product || undefined;
  }

  /**
   * Get products by category ID (for internal admin tools)
   * NOTE: This is for internal admin tools like category migration
   * Does NOT filter by tenant - only use in trusted internal admin contexts
   */
  async getProductsByCategoryId(categoryId: string): Promise<Product[]> {
    return await db
      .select()
      .from(products)
      .where(eq(products.categoryId, categoryId));
  }

  /**
   * Update product by internal ID (for internal admin tools)
   * NOTE: This is for internal admin tools like category migration
   * Does NOT filter by tenant - only use in trusted internal admin contexts
   */
  async updateProductByInternalId(id: string, updates: Partial<Product>): Promise<Product | undefined> {
    const [product] = await db
      .update(products)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(products.id, id))
      .returning();
    return product || undefined;
  }

  // ============================================================
  // Product Variant Methods (Phase 1 Refactoring)
  // ============================================================

  /**
   * Get multiple products with their variants
   * Optimized to avoid N+1 queries by fetching all variants in a single query
   * More efficient than calling getProductWithVariants() in a loop
   * MULTI-TENANT: Requires tenantId for isolation
   */
  async getProductsWithVariants(tenantId: string, options?: {
    limit?: number;
    offset?: number;
    status?: string;
    vendorId?: string;
    categoryId?: string;
    collectionId?: string;
  }): Promise<ProductWithVariants[]> {
    const {
      limit = 50,
      offset = 0,
      status,
      vendorId,
      categoryId,
      // collectionId - TODO: implement collection filter with join
    } = options || {};

    // MULTI-TENANT: Always filter by tenantId first
    const conditions = [eq(products.tenantId, tenantId)];

    if (status) {
      conditions.push(eq(products.status, status));
    }

    if (vendorId) {
      conditions.push(eq(products.vendorId, vendorId));
    }

    if (categoryId) {
      conditions.push(eq(products.categoryId, categoryId));
    }

    // Fetch products - MULTI-TENANT: Always apply tenant filter
    const productsList = await db
      .select()
      .from(products)
      .where(and(...conditions))
      .limit(limit)
      .offset(offset)
      .orderBy(desc(products.updatedAt));

    // Extract product IDs
    const productIds = productsList.map(p => p.id);

    if (productIds.length === 0) {
      return [];
    }

    // Fetch all variants for these products in one query (efficient!)
    const allVariants = await db
      .select()
      .from(productVariants)
      .where(inArray(productVariants.productId, productIds))
      .orderBy(asc(productVariants.position));

    // Group variants by product ID
    const variantsByProductId = new Map<string, ProductVariant[]>();
    for (const variant of allVariants) {
      const existing = variantsByProductId.get(variant.productId) || [];
      existing.push(variant);
      variantsByProductId.set(variant.productId, existing);
    }

    // Combine products with their variants
    return productsList.map(product => ({
      ...product,
      variants: variantsByProductId.get(product.id) || [],
    }));
  }

  // ============================================================
  // Product Handle Methods
  // ============================================================

  async checkHandleUnique(handle: string, excludeProductId?: string): Promise<boolean> {
    const conditions = excludeProductId
      ? and(eq(products.handle, handle), sql`${products.id} != ${excludeProductId}`)
      : eq(products.handle, handle);

    const existing = await db
      .select({ id: products.id })
      .from(products)
      .where(conditions)
      .limit(1);

    return existing.length === 0;
  }

  async updateProductHandle(productId: string, handle: string): Promise<Product | undefined> {
    // Check if handle is unique (excluding this product)
    const isUnique = await this.checkHandleUnique(handle, productId);

    if (!isUnique) {
      throw new Error(`Handle "${handle}" is already in use by another product`);
    }

    // Update the product handle
    const [updated] = await db
      .update(products)
      .set({
        handle,
        updatedAt: new Date()
      })
      .where(eq(products.id, productId))
      .returning();

    return updated;
  }

  async getProductByHandle(handle: string): Promise<Product | undefined> {
    return await db.query.products.findFirst({
      where: eq(products.handle, handle)
    });
  }

  async detectProductDuplicates(params: {
    vendor: string;
    styleNumber?: string;
    productName?: string;
    color?: string;
    skus?: string[];
  }): Promise<{
    level: 1 | 2 | 3 | 4 | 5;
    confidence: 'DEFINITE' | 'VERY_STRONG' | 'STRONG' | 'POSSIBLE' | 'NEW';
    matchedBy: 'SKU' | 'Vendor + Style + Title' | 'Vendor + Style + Color' | 'Vendor + Style' | 'None';
    matches: Product[];
    recommendation: 'UPDATE' | 'UPDATE_OR_CREATE' | 'ADD_VARIANT_OR_CREATE' | 'CREATE';
  }> {
    try {
      // Level 1: SKU Match (99.9% confidence - DEFINITE)
      // Most reliable: If any SKU matches an existing variant, it's the same product
      if (params.skus && params.skus.length > 0) {
        const variantMatches = await db
          .select({
            productId: productVariants.productId,
          })
          .from(productVariants)
          .where(inArray(productVariants.sku, params.skus))
          .limit(1);

        if (variantMatches.length > 0) {
          const matchedProducts = await db.query.products.findMany({
            where: eq(products.id, variantMatches[0].productId),
            with: {
              variants: true,
              options: true
            }
          });

          if (matchedProducts.length > 0) {
            return {
              level: 1,
              confidence: 'DEFINITE',
              matchedBy: 'SKU',
              matches: matchedProducts,
              recommendation: 'UPDATE'
            };
          }
        }
      }

      // Level 2: Vendor + Style Number + Title Match (98% confidence - VERY_STRONG)
      // Handles cases where vendor changes SKU format but keeps style number
      // Example: "EP12429-M-BLK" → "EP12429BLK-M"
      if (params.vendor && params.styleNumber && params.productName) {
        const titleMatches = await db.query.products.findMany({
          where: and(
            eq(products.vendor, params.vendor),
            eq(products.styleNumber, params.styleNumber),
            ilike(products.title, `%${params.productName}%`)
          ),
          with: {
            variants: true,
            options: true
          }
        });

        if (titleMatches.length > 0) {
          return {
            level: 2,
            confidence: 'VERY_STRONG',
            matchedBy: 'Vendor + Style + Title',
            matches: titleMatches,
            recommendation: 'UPDATE_OR_CREATE'
          };
        }
      }

      // Level 3: Vendor + Style Number + Color Match (95% confidence - STRONG)
      // Same product, same color variant
      if (params.vendor && params.styleNumber && params.color) {
        const colorMatches = await db
          .select()
          .from(products)
          .where(
            and(
              eq(products.vendor, params.vendor),
              eq(products.styleNumber, params.styleNumber),
              sql`${products.metadata}->>'color' ILIKE ${`%${params.color}%`}`
            )
          );

        if (colorMatches.length > 0) {
          // Fetch full product with relations
          const fullProducts = await db.query.products.findMany({
            where: inArray(products.id, colorMatches.map(p => p.id)),
            with: {
              variants: true,
              options: true
            }
          });

          if (fullProducts.length > 0) {
            return {
              level: 3,
              confidence: 'STRONG',
              matchedBy: 'Vendor + Style + Color',
              matches: fullProducts,
              recommendation: 'UPDATE_OR_CREATE'
            };
          }
        }
      }

      // Level 4: Vendor + Style Number Match (85% confidence - POSSIBLE)
      // Same product design, possibly different color variant
      if (params.vendor && params.styleNumber) {
        const styleMatches = await db.query.products.findMany({
          where: and(
            eq(products.vendor, params.vendor),
            eq(products.styleNumber, params.styleNumber)
          ),
          with: {
            variants: true,
            options: true
          }
        });

        if (styleMatches.length > 0) {
          return {
            level: 4,
            confidence: 'POSSIBLE',
            matchedBy: 'Vendor + Style',
            matches: styleMatches,
            recommendation: 'ADD_VARIANT_OR_CREATE'
          };
        }
      }

      // Level 5: No Match - New Product
      return {
        level: 5,
        confidence: 'NEW',
        matchedBy: 'None',
        matches: [],
        recommendation: 'CREATE'
      };

    } catch (error) {
      console.error('Error detecting product duplicates:', error);
      // On error, default to creating new product (safest option)
      return {
        level: 5,
        confidence: 'NEW',
        matchedBy: 'None',
        matches: [],
        recommendation: 'CREATE'
      };
    }
  }

  async batchUpdateHandles(updates: Array<{ productId: string; handle: string }>): Promise<{
    success: number;
    failures: Array<{ productId: string; error: string }>
  }> {
    const results = {
      success: 0,
      failures: [] as Array<{ productId: string; error: string }>
    };

    // Process each update sequentially to ensure proper error handling
    // and uniqueness validation
    for (const update of updates) {
      try {
        await this.updateProductHandle(update.productId, update.handle);
        results.success++;
      } catch (error) {
        results.failures.push({
          productId: update.productId,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return results;
  }

  // ============================================================
  // Product Variant Methods
  // ============================================================

  // MULTI-TENANT: Get product with variants, filtered by tenant
  async getProductWithVariants(tenantId: string, productId: string): Promise<(Product & {
    options: ProductOption[],
    variants: ProductVariant[]
  }) | undefined> {
    // MULTI-TENANT: Filter by both tenantId and productId
    return await db.query.products.findFirst({
      where: and(eq(products.tenantId, tenantId), eq(products.id, productId)),
      with: {
        options: {
          orderBy: [productOptions.position],
        },
        variants: {
          orderBy: [
            productVariants.option1,
            productVariants.option2,
            productVariants.option3,
          ],
        },
      },
    });
  }

  async getProductVariants(productId: string): Promise<ProductVariant[]> {
    return await db
      .select()
      .from(productVariants)
      .where(eq(productVariants.productId, productId))
      .orderBy(
        productVariants.option1,
        productVariants.option2,
        productVariants.option3
      );
  }

  async getProductVariantCount(productId: string): Promise<number> {
    const result = await db
      .select({ count: count() })
      .from(productVariants)
      .where(eq(productVariants.productId, productId));
    return result[0]?.count || 0;
  }

  async getProductOptions(productId: string): Promise<ProductOption[]> {
    return await db
      .select()
      .from(productOptions)
      .where(eq(productOptions.productId, productId))
      .orderBy(productOptions.position);
  }

  async createProductOption(insertOption: InsertProductOption): Promise<ProductOption> {
    const [option] = await db
      .insert(productOptions)
      .values(insertOption)
      .returning();
    return option;
  }

  async updateProductOption(id: string, updates: Partial<ProductOption>): Promise<ProductOption | undefined> {
    const [option] = await db
      .update(productOptions)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(productOptions.id, id))
      .returning();
    return option;
  }

  async deleteProductOption(id: string): Promise<boolean> {
    // WARNING: Deleting an option requires deleting all variants for the product
    // because variants are defined by their option values. If we delete an option,
    // the existing variants become invalid.

    // Get the option to find which product it belongs to
    const [option] = await db
      .select()
      .from(productOptions)
      .where(eq(productOptions.id, id));

    if (!option) {
      return false; // Option not found
    }

    // Delete all variants for this product
    // This is necessary because deleting an option invalidates the variant structure
    await db
      .delete(productVariants)
      .where(eq(productVariants.productId, option.productId));

    // Now delete the option
    const result = await db
      .delete(productOptions)
      .where(eq(productOptions.id, id))
      .returning();

    return result.length > 0;
  }

  /**
   * Create or update a product option (for QuickBooks import)
   * If option with same name exists, updates its values
   * If not, creates a new option
   */
  async upsertProductOption(productId: string, name: string, values: string[]): Promise<ProductOption> {
    // Check if option already exists
    const existingOptions = await db
      .select()
      .from(productOptions)
      .where(
        and(
          eq(productOptions.productId, productId),
          eq(productOptions.name, name)
        )
      );

    if (existingOptions.length > 0) {
      // Update existing option
      const [updated] = await db
        .update(productOptions)
        .set({
          values,
          updatedAt: new Date()
        })
        .where(eq(productOptions.id, existingOptions[0].id))
        .returning();
      return updated;
    } else {
      // Create new option
      // Determine position: count existing options + 1
      const existingCount = await db
        .select({ count: sql<number>`count(*)` })
        .from(productOptions)
        .where(eq(productOptions.productId, productId));

      // Ensure count is a number (pg returns bigint as string)
      const count = Number(existingCount[0]?.count || 0);
      const position = count + 1;

      const [created] = await db
        .insert(productOptions)
        .values({
          productId,
          name,
          values,
          position
        })
        .returning();
      return created;
    }
  }

  async reorderProductOptions(productId: string, optionIds: string[]): Promise<void> {
    // Update each option's position based on array index
    for (let i = 0; i < optionIds.length; i++) {
      await db
        .update(productOptions)
        .set({ position: i + 1, updatedAt: new Date() })
        .where(eq(productOptions.id, optionIds[i]));
    }
  }

  async createProductVariant(insertVariant: InsertProductVariant): Promise<ProductVariant> {
    // Check for duplicate variant (same option combination)
    // Build WHERE conditions - use isNull() for null values, eq() for strings
    const conditions = [eq(productVariants.productId, insertVariant.productId)];

    // Handle option1
    if (insertVariant.option1 === null || insertVariant.option1 === undefined) {
      conditions.push(isNull(productVariants.option1));
    } else {
      conditions.push(eq(productVariants.option1, insertVariant.option1));
    }

    // Handle option2
    if (insertVariant.option2 === null || insertVariant.option2 === undefined) {
      conditions.push(isNull(productVariants.option2));
    } else {
      conditions.push(eq(productVariants.option2, insertVariant.option2));
    }

    // Handle option3
    if (insertVariant.option3 === null || insertVariant.option3 === undefined) {
      conditions.push(isNull(productVariants.option3));
    } else {
      conditions.push(eq(productVariants.option3, insertVariant.option3));
    }

    const existingVariant = await db
      .select()
      .from(productVariants)
      .where(and(...conditions))
      .limit(1);

    if (existingVariant.length > 0) {
      const optionStr = [
        insertVariant.option1,
        insertVariant.option2,
        insertVariant.option3
      ].filter(Boolean).join(" / ") || "Default";

      throw new Error(
        `A variant with options "${optionStr}" already exists for this product. ` +
        `Each variant must have a unique combination of option values.`
      );
    }

    const [variant] = await db
      .insert(productVariants)
      .values(insertVariant)
      .returning();
    return variant;
  }

  async updateProductVariant(variantId: string, updates: Partial<ProductVariant>): Promise<ProductVariant | undefined> {
    const [variant] = await db
      .update(productVariants)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(productVariants.id, variantId))
      .returning();
    return variant;
  }

  async deleteProductVariant(variantId: string): Promise<boolean> {
    const result = await db
      .delete(productVariants)
      .where(eq(productVariants.id, variantId))
      .returning();
    return result.length > 0;
  }

  /**
   * Delete all variants for a product (for QB import replace functionality)
   */
  async deleteProductVariants(productId: string): Promise<number> {
    const result = await db
      .delete(productVariants)
      .where(eq(productVariants.productId, productId))
      .returning();
    return result.length;
  }

  /**
   * Delete all options for a product (for QB import replace functionality)
   */
  async deleteProductOptions(productId: string): Promise<number> {
    const result = await db
      .delete(productOptions)
      .where(eq(productOptions.productId, productId))
      .returning();
    return result.length;
  }

  /**
   * Get a product variant by SKU (for QuickBooks import)
   * Used to check if SKU already exists and in which product
   */
  async getVariantBySku(sku: string): Promise<ProductVariant | null> {
    const [variant] = await db
      .select()
      .from(productVariants)
      .where(eq(productVariants.sku, sku))
      .limit(1);
    return variant || null;
  }

  // ============================================================
  // Task Methods
  // ============================================================

  async createTask(insertTask: InsertTask): Promise<Task> {
    const [task] = await db
      .insert(tasks)
      .values(insertTask)
      .returning();
    
    // Create audit entry for task creation
    await this.createAuditEntry({
      taskId: task.id,
      userId: task.createdBy,
      action: "TASK_CREATED",
      toStatus: task.status,
      details: { taskId: task.id, title: task.title }
    });

    return task;
  }

  // MULTI-TENANT: Added tenantId parameter for data isolation
  async getTask(tenantId: string, id: string): Promise<TaskWithDetails | undefined> {
    const [task] = await db
      .select()
      .from(tasks)
      .leftJoin(products, eq(tasks.productId, products.id))
      .leftJoin(vendors, eq(products.vendorId, vendors.id))
      .leftJoin(users, eq(tasks.assignedTo, users.id))
      .where(and(eq(tasks.id, id), eq(tasks.tenantId, tenantId)));

    if (!task) return undefined;

    const creator = await this.getUser(task.tasks.createdBy);

    // Include vendor color in product data
    const productWithColor = task.products ? {
      ...task.products,
      vendorColor: task.vendors?.color || null,
    } : task.products!;

    return {
      ...task.tasks,
      product: productWithColor,
      assignee: task.users || undefined,
      creator: creator!,
    };
  }

  // MULTI-TENANT: Added tenantId parameter for data isolation
  async getTasks(tenantId: string, filters?: { status?: string; assignedTo?: string; createdBy?: string; vendorId?: string }): Promise<TaskWithDetails[]> {
    // Create aliases for vendors to distinguish between product vendor and task vendor
    const productVendor = aliasedTable(vendors, 'product_vendor');
    const taskVendor = aliasedTable(vendors, 'task_vendor');

    let query = db
      .select()
      .from(tasks)
      .leftJoin(products, eq(tasks.productId, products.id))
      .leftJoin(productVendor, eq(products.vendorId, productVendor.id))
      .leftJoin(taskVendor, eq(tasks.vendorId, taskVendor.id))
      .leftJoin(users, eq(tasks.assignedTo, users.id))
      .orderBy(desc(tasks.createdAt));

    // MULTI-TENANT: Always filter by tenantId first
    const conditions = [eq(tasks.tenantId, tenantId)];
    if (filters?.status) conditions.push(eq(tasks.status, filters.status as any));
    if (filters?.assignedTo) conditions.push(eq(tasks.assignedTo, filters.assignedTo));
    if (filters?.createdBy) conditions.push(eq(tasks.createdBy, filters.createdBy));
    if (filters?.vendorId) conditions.push(eq(tasks.vendorId, filters.vendorId));

    query = query.where(and(...conditions)) as any;

    const results = await query;

    // Get creators for all tasks
    const creatorIds = Array.from(new Set(results.map(r => r.tasks.createdBy)));
    const creators = creatorIds.length > 0
      ? await db.select().from(users).where(inArray(users.id, creatorIds))
      : [];
    const creatorsMap = new Map(creators.map(c => [c.id, c]));

    return results.map(result => {
      // Type assertion for aliased tables
      const resultWithAliases = result as any;

      // Include vendor color in product data
      const productWithColor = result.products ? {
        ...result.products,
        vendorColor: resultWithAliases.product_vendor?.color || null,
      } : result.products!;

      return {
        ...result.tasks,
        product: productWithColor,
        vendor: resultWithAliases.task_vendor || undefined,
        assignee: result.users || undefined,
        creator: creatorsMap.get(result.tasks.createdBy)!,
      };
    });
  }

  // MULTI-TENANT: Added tenantId parameter for data isolation
  async updateTask(tenantId: string, id: string, updates: Partial<Task>): Promise<Task | undefined> {
    const [task] = await db
      .update(tasks)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(tasks.id, id), eq(tasks.tenantId, tenantId)))
      .returning();
    return task || undefined;
  }

  // MULTI-TENANT: Added tenantId parameter for data isolation
  async updateTaskStatus(tenantId: string, id: string, status: string, userId: string): Promise<Task | undefined> {
    // MULTI-TENANT: Include tenantId in the WHERE clause for security
    const currentTask = await db.select().from(tasks).where(and(eq(tasks.id, id), eq(tasks.tenantId, tenantId)));
    if (!currentTask[0]) return undefined;

    const updates: Partial<Task> = {
      status: status as any,
      updatedAt: new Date()
    };

    // Set timestamps based on status transitions
    const now = new Date();
    switch (status) {
      case "ASSIGNED":
        updates.assignedAt = now;
        break;
      case "IN_PROGRESS":
        updates.startedAt = now;
        break;
      case "PUBLISHED":
        updates.publishedAt = now;
        break;
      case "DONE":
        updates.completedAt = now;
        // Calculate lead and cycle times
        if (currentTask[0].assignedAt) {
          const leadTime = Math.floor((now.getTime() - currentTask[0].assignedAt.getTime()) / (1000 * 60));
          updates.leadTimeMinutes = leadTime;
        }
        if (currentTask[0].startedAt) {
          const cycleTime = Math.floor((now.getTime() - currentTask[0].startedAt.getTime()) / (1000 * 60));
          updates.cycleTimeMinutes = cycleTime;
        }
        break;
    }

    const [task] = await db
      .update(tasks)
      .set(updates)
      .where(and(eq(tasks.id, id), eq(tasks.tenantId, tenantId)))
      .returning();

    // Create audit entry
    await this.createAuditEntry({
      taskId: id,
      userId,
      action: "STATUS_CHANGED",
      fromStatus: currentTask[0].status,
      toStatus: status as any,
      details: { from: currentTask[0].status, to: status }
    });

    return task || undefined;
  }

  // MULTI-TENANT: New method to delete a task with tenant isolation
  async deleteTask(tenantId: string, id: string): Promise<boolean> {
    const result = await db
      .delete(tasks)
      .where(and(eq(tasks.id, id), eq(tasks.tenantId, tenantId)))
      .returning();
    return result.length > 0;
  }

  // MULTI-TENANT: Added tenantId parameter to only process this tenant's tasks
  async autoReturnStaleTasks(tenantId: string): Promise<number> {
    // Find tasks that have been in ASSIGNED for more than 2 days
    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

    // MULTI-TENANT: Only select stale tasks belonging to this tenant
    const staleTasks = await db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.tenantId, tenantId),
          eq(tasks.status, "ASSIGNED"),
          lt(tasks.assignedAt, twoDaysAgo)
        )
      );

    let returnedCount = 0;

    for (const task of staleTasks) {
      // Move task back to TRIAGE (task already verified to belong to tenant)
      await db
        .update(tasks)
        .set({
          status: "TRIAGE",
          assignedTo: null,
          assignedAt: null,
          updatedAt: new Date()
        })
        .where(eq(tasks.id, task.id));

      // Create audit entry
      await this.createAuditEntry({
        taskId: task.id,
        userId: "SYSTEM",
        action: "STATUS_CHANGED",
        fromStatus: "ASSIGNED",
        toStatus: "TRIAGE",
        details: {
          reason: "Auto-returned after 2 days in ASSIGNED",
          previouslyAssignedTo: task.assignedTo
        }
      });

      // Create notification for the editor whose task was returned
      if (task.assignedTo) {
        await this.createNotification({
          userId: task.assignedTo,
          title: "Task Returned to Pool",
          message: `Task "${task.title}" was automatically returned to TRIAGE after 2 days without progress.`,
          taskId: task.id,
          category: "system",
          severity: "warning",
          metadata: { reason: "auto_return", taskId: task.id },
        });
      }

      returnedCount++;
    }

    return returnedCount;
  }

  async getDashboardStats(tenantId: string, userId?: string, role?: string): Promise<DashboardStats> {
    // MULTI-TENANT: All queries filter by tenant_id

    // Total tasks
    const totalTasks = await db
      .select({ count: count() })
      .from(tasks)
      .where(eq(tasks.tenantId, tenantId));

    // Pending review
    const pendingReview = await db
      .select({ count: count() })
      .from(tasks)
      .where(and(eq(tasks.tenantId, tenantId), eq(tasks.status, "READY_FOR_REVIEW")));

    // Overdue SLA (tasks with slaDeadline in the past)
    const overdueSLA = await db
      .select({ count: count() })
      .from(tasks)
      .where(and(
        eq(tasks.tenantId, tenantId),
        sql`sla_deadline < NOW() AND status NOT IN ('DONE', 'QA_APPROVED')`
      ));

    // Completed today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const completedToday = await db
      .select({ count: count() })
      .from(tasks)
      .where(and(
        eq(tasks.tenantId, tenantId),
        sql`completed_at >= ${today} AND status IN ('DONE', 'QA_APPROVED')`
      ));

    // Kanban counts by status
    const statusCounts = await db
      .select({
        status: tasks.status,
        count: count()
      })
      .from(tasks)
      .where(eq(tasks.tenantId, tenantId))
      .groupBy(tasks.status);

    const kanbanCounts: Record<string, number> = {};
    statusCounts.forEach(({ status, count }) => {
      kanbanCounts[status] = count;
    });

    // Get historical data (last 7 days)
    const history = await this.getStatsHistory(tenantId, 7);

    // Transform history into the format expected by the frontend
    const historyData = {
      totalTasks: history.map(h => ({ date: h.date.toISOString(), value: h.totalTasks })),
      pendingReview: history.map(h => ({ date: h.date.toISOString(), value: h.pendingReview })),
      overdueSLA: history.map(h => ({ date: h.date.toISOString(), value: h.overdueSLA })),
      completedToday: history.map(h => ({ date: h.date.toISOString(), value: h.completedToday })),
    };

    return {
      totalTasks: totalTasks[0]?.count || 0,
      pendingReview: pendingReview[0]?.count || 0,
      overdueSLA: overdueSLA[0]?.count || 0,
      completedToday: completedToday[0]?.count || 0,
      kanbanCounts,
      history: historyData,
    };
  }

  async captureStatsSnapshot(tenantId: string): Promise<DashboardStatsHistoryEntry> {
    // MULTI-TENANT: Get current stats for this tenant
    const currentStats = await this.getDashboardStats(tenantId);

    // Insert snapshot
    // MULTI-TENANT: Include tenant ID
    const [snapshot] = await db
      .insert(dashboardStatsHistory)
      .values({
        tenantId,  // MULTI-TENANT: Include tenant ID
        date: new Date(),
        totalTasks: currentStats.totalTasks,
        pendingReview: currentStats.pendingReview,
        overdueSLA: currentStats.overdueSLA,
        completedToday: currentStats.completedToday,
        kanbanCounts: currentStats.kanbanCounts as any,
      })
      .returning();

    return snapshot;
  }

  async getStatsHistory(tenantId: string, days: number = 7): Promise<DashboardStatsHistoryEntry[]> {
    // MULTI-TENANT: Filter history by tenant_id
    const daysAgo = new Date();
    daysAgo.setDate(daysAgo.getDate() - days);

    const history = await db
      .select()
      .from(dashboardStatsHistory)
      .where(and(
        eq(dashboardStatsHistory.tenantId, tenantId),
        sql`date >= ${daysAgo}`
      ))
      .orderBy(dashboardStatsHistory.date);

    return history;
  }

  async createAuditEntry(entry: InsertAuditLog): Promise<AuditLog> {
    const [auditEntry] = await db
      .insert(auditLog)
      .values(entry)
      .returning();
    return auditEntry;
  }

  async getTaskAuditLog(tenantId: string, taskId: string): Promise<any[]> {
    const results = await db
      .select({
        auditLog: auditLog,
        user: users
      })
      .from(auditLog)
      .leftJoin(users, eq(auditLog.userId, users.id))
      .where(and(eq(auditLog.tenantId, tenantId), eq(auditLog.taskId, taskId)))
      .orderBy(desc(auditLog.timestamp));

    return results.map(r => ({
      ...r.auditLog,
      user: r.user
    }));
  }

  async getAllAuditLogs(tenantId: string): Promise<AuditLog[]> {
    // MULTI-TENANT: Filter audit logs by tenant
    return await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.tenantId, tenantId))
      .orderBy(desc(auditLog.timestamp))
      .limit(500); // Limit to recent 500 entries for performance
  }

  async createNotification(notification: InsertNotification): Promise<Notification> {
    const [notif] = await db
      .insert(notifications)
      .values(notification)
      .returning();
    return notif;
  }

  async getUserNotifications(userId: string, limit = 10): Promise<Notification[]> {
    return await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(limit);
  }

  async markNotificationRead(id: string): Promise<void> {
    await db
      .update(notifications)
      .set({ read: true })
      .where(eq(notifications.id, id));
  }

  // Enhanced Notification Bell methods implementation
  async getNotificationCounts(tenantId: string): Promise<{
    total: number;
    byCategory: { health: number; sync: number; quality: number; system: number };
    criticalCount: number;
  }> {
    // Get counts by category for unread, non-dismissed notifications
    const result = await db
      .select({
        category: notifications.category,
        severity: notifications.severity,
        count: count(),
      })
      .from(notifications)
      .where(
        and(
          eq(notifications.tenantId, tenantId),
          eq(notifications.read, false),
          eq(notifications.dismissed, false)
        )
      )
      .groupBy(notifications.category, notifications.severity);

    // Initialize counts
    const byCategory = { health: 0, sync: 0, quality: 0, system: 0 };
    let criticalCount = 0;
    let total = 0;

    // Process results
    for (const row of result) {
      const cat = row.category as keyof typeof byCategory;
      if (cat in byCategory) {
        byCategory[cat] += Number(row.count);
      }
      total += Number(row.count);
      if (row.severity === "critical") {
        criticalCount += Number(row.count);
      }
    }

    return { total, byCategory, criticalCount };
  }

  async getNotificationsByCategory(
    tenantId: string,
    category?: string,
    limit = 50
  ): Promise<Notification[]> {
    const conditions = [
      eq(notifications.tenantId, tenantId),
      eq(notifications.dismissed, false),
    ];

    if (category) {
      conditions.push(eq(notifications.category, category));
    }

    return await db
      .select()
      .from(notifications)
      .where(and(...conditions))
      .orderBy(
        // Critical first, then warning, then info
        sql`CASE WHEN ${notifications.severity} = 'critical' THEN 0 WHEN ${notifications.severity} = 'warning' THEN 1 ELSE 2 END`,
        desc(notifications.createdAt)
      )
      .limit(limit);
  }

  async markAllNotificationsRead(tenantId: string, category?: string): Promise<number> {
    const conditions = [
      eq(notifications.tenantId, tenantId),
      eq(notifications.read, false),
    ];

    if (category) {
      conditions.push(eq(notifications.category, category));
    }

    const result = await db
      .update(notifications)
      .set({ read: true })
      .where(and(...conditions))
      .returning({ id: notifications.id });

    return result.length;
  }

  // MULTI-TENANT: Requires tenantId to prevent cross-tenant access
  async dismissNotification(tenantId: string, id: string): Promise<void> {
    await db
      .update(notifications)
      .set({ dismissed: true })
      .where(and(eq(notifications.tenantId, tenantId), eq(notifications.id, id)));
  }

  // MULTI-TENANT: Secure version of markNotificationRead with tenant isolation
  async markNotificationReadSecure(tenantId: string, id: string): Promise<void> {
    await db
      .update(notifications)
      .set({ read: true })
      .where(and(eq(notifications.tenantId, tenantId), eq(notifications.id, id)));
  }

  async createOrUpdateAggregatedNotification(
    tenantId: string,
    sourceType: string,
    data: {
      category: string;
      severity: string;
      title: string;
      message: string;
      actionUrl?: string;
      metadata?: Record<string, unknown>;
    }
  ): Promise<Notification> {
    // Check if an aggregated notification already exists for this source type
    const existing = await db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.tenantId, tenantId),
          eq(notifications.sourceType, sourceType),
          eq(notifications.dismissed, false)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      // Update existing notification
      const [updated] = await db
        .update(notifications)
        .set({
          title: data.title,
          message: data.message,
          severity: data.severity,
          actionUrl: data.actionUrl,
          metadata: data.metadata || {},
          read: false, // Mark as unread when updated
        })
        .where(eq(notifications.id, existing[0].id))
        .returning();
      return updated;
    }

    // Create new aggregated notification
    // We need a system user ID for tenant-level notifications
    const tenantUsers = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.tenantId, tenantId))
      .limit(1);

    const userId = tenantUsers[0]?.id || "system";

    const [created] = await db
      .insert(notifications)
      .values({
        tenantId,
        userId,
        title: data.title,
        message: data.message,
        category: data.category,
        severity: data.severity,
        sourceType,
        actionUrl: data.actionUrl,
        metadata: data.metadata || {},
      })
      .returning();

    return created;
  }

  async cleanupExpiredNotifications(tenantId: string): Promise<number> {
    const result = await db
      .delete(notifications)
      .where(
        and(
          eq(notifications.tenantId, tenantId),
          lt(notifications.expiresAt, new Date())
        )
      )
      .returning({ id: notifications.id });

    return result.length;
  }

  // Task Steps methods implementation
  async getTaskSteps(taskId: string): Promise<TaskStep[]> {
    return await db
      .select()
      .from(taskSteps)
      .where(eq(taskSteps.taskId, taskId))
      .orderBy(taskSteps.order);
  }

  async createTaskStep(step: InsertTaskStep): Promise<TaskStep> {
    const [newStep] = await db
      .insert(taskSteps)
      .values(step)
      .returning();
    return newStep;
  }

  async updateTaskStep(stepId: number, updates: Partial<TaskStep>): Promise<TaskStep | undefined> {
    const [updated] = await db
      .update(taskSteps)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(taskSteps.id, stepId))
      .returning();
    return updated || undefined;
  }

  async deleteTaskStep(stepId: number): Promise<boolean> {
    const result = await db
      .delete(taskSteps)
      .where(eq(taskSteps.id, stepId))
      .returning();
    return result.length > 0;
  }

  async completeTaskStep(stepId: number, userId: string): Promise<TaskStep | undefined> {
    const [updated] = await db
      .update(taskSteps)
      .set({
        completed: true,
        completedAt: new Date(),
        completedBy: userId,
        updatedAt: new Date(),
      })
      .where(eq(taskSteps.id, stepId))
      .returning();
    return updated || undefined;
  }

  async applyTemplateSteps(taskId: string, category: string): Promise<TaskStep[]> {
    // Get templates for the category
    const templates = await db
      .select()
      .from(stepTemplates)
      .where(and(
        eq(stepTemplates.category, category),
        eq(stepTemplates.active, true)
      ))
      .orderBy(stepTemplates.order);

    // Create steps from templates
    const stepsToInsert = templates.map(template => ({
      taskId,
      title: template.title,
      description: template.description,
      order: template.order,
      required: template.required,
      completed: false,
    }));

    if (stepsToInsert.length === 0) {
      return [];
    }

    const createdSteps = await db
      .insert(taskSteps)
      .values(stepsToInsert)
      .returning();

    return createdSteps;
  }

  // Step Templates methods implementation
  async getAllTemplates(): Promise<StepTemplate[]> {
    return await db
      .select()
      .from(stepTemplates)
      .orderBy(stepTemplates.category, stepTemplates.order);
  }

  async getTemplatesByCategory(category: string): Promise<StepTemplate[]> {
    return await db
      .select()
      .from(stepTemplates)
      .where(eq(stepTemplates.category, category))
      .orderBy(stepTemplates.order);
  }

  async getTemplateCategories(): Promise<string[]> {
    const result = await db
      .selectDistinct({ category: stepTemplates.category })
      .from(stepTemplates)
      .where(eq(stepTemplates.active, true))
      .orderBy(stepTemplates.category);
    return result.map(r => r.category);
  }

  async createTemplate(template: InsertStepTemplate): Promise<StepTemplate> {
    const [newTemplate] = await db
      .insert(stepTemplates)
      .values(template)
      .returning();
    return newTemplate;
  }

  async updateTemplate(id: number, updates: Partial<StepTemplate>): Promise<StepTemplate | undefined> {
    const [updated] = await db
      .update(stepTemplates)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(stepTemplates.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteTemplate(id: number): Promise<boolean> {
    const result = await db
      .delete(stepTemplates)
      .where(eq(stepTemplates.id, id))
      .returning();
    return result.length > 0;
  }

  async reorderTemplate(id: number, newOrder: number, category: string): Promise<void> {
    // Get the template being moved
    const [template] = await db
      .select()
      .from(stepTemplates)
      .where(eq(stepTemplates.id, id));

    if (!template) {
      throw new Error("Template not found");
    }

    const oldOrder = template.order;

    // Update other templates in the same category
    if (newOrder > oldOrder) {
      // Moving down: shift templates between old and new position up
      await db
        .update(stepTemplates)
        .set({ order: sql`${stepTemplates.order} - 1` })
        .where(and(
          eq(stepTemplates.category, category),
          sql`${stepTemplates.order} > ${oldOrder}`,
          sql`${stepTemplates.order} <= ${newOrder}`
        ));
    } else if (newOrder < oldOrder) {
      // Moving up: shift templates between new and old position down
      await db
        .update(stepTemplates)
        .set({ order: sql`${stepTemplates.order} + 1` })
        .where(and(
          eq(stepTemplates.category, category),
          sql`${stepTemplates.order} >= ${newOrder}`,
          sql`${stepTemplates.order} < ${oldOrder}`
        ));
    }

    // Update the template itself
    await db
      .update(stepTemplates)
      .set({ order: newOrder, updatedAt: new Date() })
      .where(eq(stepTemplates.id, id));
  }

  // Shopify methods implementation - MULTI-TENANT
  async createShopifyStore(tenantId: string, store: InsertShopifyStore): Promise<ShopifyStore> {
    const [shopifyStore] = await db
      .insert(shopifyStores)
      .values({ ...store, tenantId })
      .returning();
    return shopifyStore;
  }

  async getShopifyStores(tenantId: string): Promise<ShopifyStore[]> {
    return await db
      .select()
      .from(shopifyStores)
      .where(eq(shopifyStores.tenantId, tenantId))
      .orderBy(desc(shopifyStores.createdAt));
  }

  async getActiveShopifyStore(tenantId: string): Promise<ShopifyStore | undefined> {
    const [store] = await db
      .select()
      .from(shopifyStores)
      .where(and(
        eq(shopifyStores.tenantId, tenantId),
        eq(shopifyStores.isActive, true)
      ))
      .limit(1);
    return store;
  }

  async getShopifyStoreByDomain(shopDomain: string): Promise<ShopifyStore | undefined> {
    const [store] = await db
      .select()
      .from(shopifyStores)
      .where(eq(shopifyStores.shopDomain, shopDomain))
      .limit(1);
    return store;
  }

  async updateShopifyStore(tenantId: string, id: string, updates: Partial<ShopifyStore>): Promise<ShopifyStore | undefined> {
    const [updated] = await db
      .update(shopifyStores)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(
        eq(shopifyStores.id, id),
        eq(shopifyStores.tenantId, tenantId)
      ))
      .returning();
    return updated;
  }

  async createShopifyProductMapping(tenantId: string, mapping: InsertShopifyProductMapping): Promise<ShopifyProductMapping> {
    const [productMapping] = await db
      .insert(shopifyProductMappings)
      .values({ ...mapping, tenantId })
      .returning();
    return productMapping;
  }

  async getShopifyProductMapping(tenantId: string, productId: string): Promise<ShopifyProductMapping | undefined> {
    const [mapping] = await db
      .select()
      .from(shopifyProductMappings)
      .where(and(
        eq(shopifyProductMappings.tenantId, tenantId),
        eq(shopifyProductMappings.productId, productId)
      ))
      .limit(1);
    return mapping;
  }

  async getShopifyMappingByShopifyId(tenantId: string, shopifyProductId: string): Promise<ShopifyProductMapping | undefined> {
    const [mapping] = await db
      .select()
      .from(shopifyProductMappings)
      .where(and(
        eq(shopifyProductMappings.tenantId, tenantId),
        eq(shopifyProductMappings.shopifyProductId, shopifyProductId)
      ))
      .limit(1);
    return mapping;
  }

  async updateShopifyProductMapping(tenantId: string, id: string, updates: Partial<ShopifyProductMapping>): Promise<ShopifyProductMapping | undefined> {
    const [updated] = await db
      .update(shopifyProductMappings)
      .set(updates)
      .where(and(
        eq(shopifyProductMappings.id, id),
        eq(shopifyProductMappings.tenantId, tenantId)
      ))
      .returning();
    return updated;
  }

  // Analytics methods
  async getEmployeePerformanceMetrics(tenantId?: string): Promise<any[]> {
    // Get employees (exclude SuperAdmin from performance tracking), filtered by tenant
    const conditions = [inArray(users.role, ['WarehouseManager', 'Editor', 'Auditor'])];
    if (tenantId) {
      conditions.push(eq(users.tenantId, tenantId));
    }
    const employees = await db
      .select()
      .from(users)
      .where(and(...conditions));

    const performanceData = await Promise.all(
      employees.map(async (employee) => {
        // Get all tasks assigned to this employee
        const allTasks = await db
          .select()
          .from(tasks)
          .where(eq(tasks.assignedTo, employee.id));

        // Count tasks by status
        const completedTasks = allTasks.filter(t => t.status === 'DONE').length;
        const inProgressTasks = allTasks.filter(t => t.status === 'IN_PROGRESS').length;
        const totalTasks = allTasks.length;

        // Calculate average cycle time and lead time (only for completed tasks)
        const completedWithMetrics = allTasks.filter(t => t.status === 'DONE' && t.cycleTimeMinutes);
        const avgCycleTime = completedWithMetrics.length > 0
          ? completedWithMetrics.reduce((sum, t) => sum + (t.cycleTimeMinutes || 0), 0) / completedWithMetrics.length
          : 0;

        const completedWithLeadTime = allTasks.filter(t => t.status === 'DONE' && t.leadTimeMinutes);
        const avgLeadTime = completedWithLeadTime.length > 0
          ? completedWithLeadTime.reduce((sum, t) => sum + (t.leadTimeMinutes || 0), 0) / completedWithLeadTime.length
          : 0;

        // Calculate completion rate
        const completionRate = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

        // Count tasks completed in last 30 days
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const recentCompletions = allTasks.filter(t =>
          t.status === 'DONE' &&
          t.completedAt &&
          new Date(t.completedAt) >= thirtyDaysAgo
        ).length;

        // Calculate on-time delivery (tasks with SLA that were completed before deadline)
        const tasksWithSLA = allTasks.filter(t => t.status === 'DONE' && t.slaDeadline && t.completedAt);
        const onTimeDeliveries = tasksWithSLA.filter(t => {
          const deadline = new Date(t.slaDeadline!);
          const completed = new Date(t.completedAt!);
          return completed <= deadline;
        }).length;
        const onTimeRate = tasksWithSLA.length > 0 ? (onTimeDeliveries / tasksWithSLA.length) * 100 : 0;

        // Calculate rework rate from audit logs (backward status transitions)
        const taskIds = allTasks.map(t => t.id);
        let reworkCount = 0;
        let totalTransitions = 0;

        if (taskIds.length > 0) {
          // Get all audit logs for this employee's tasks
          const auditLogs = await db
            .select()
            .from(auditLog)
            .where(inArray(auditLog.taskId, taskIds));

          // Count backward transitions (rework)
          const reworkTransitions = [
            { from: 'READY_FOR_REVIEW', to: 'IN_PROGRESS' },
            { from: 'PUBLISHED', to: 'READY_FOR_REVIEW' },
            { from: 'PUBLISHED', to: 'IN_PROGRESS' },
            { from: 'QA_APPROVED', to: 'PUBLISHED' },
            { from: 'QA_APPROVED', to: 'IN_PROGRESS' },
          ];

          auditLogs.forEach(log => {
            if (log.fromStatus && log.toStatus) {
              totalTransitions++;
              const isRework = reworkTransitions.some(
                r => r.from === log.fromStatus && r.to === log.toStatus
              );
              if (isRework) {
                reworkCount++;
              }
            }
          });
        }

        const reworkRate = totalTransitions > 0 ? (reworkCount / totalTransitions) * 100 : 0;
        const firstTimeSuccessRate = totalTransitions > 0 ? 100 - reworkRate : 100;

        // Calculate average SLA performance (hours before/after deadline)
        let avgSLAPerformanceHours = 0;
        if (tasksWithSLA.length > 0) {
          const slaPerformances = tasksWithSLA.map(t => {
            const deadline = new Date(t.slaDeadline!).getTime();
            const completed = new Date(t.completedAt!).getTime();
            const diffHours = (deadline - completed) / (1000 * 60 * 60); // Positive = early, negative = late
            return diffHours;
          });
          avgSLAPerformanceHours = slaPerformances.reduce((sum, p) => sum + p, 0) / slaPerformances.length;
        }

        return {
          employee: {
            id: employee.id,
            username: employee.username,
            firstName: employee.firstName,
            lastName: employee.lastName,
            email: employee.email,
            role: employee.role
          },
          metrics: {
            totalTasks,
            completedTasks,
            inProgressTasks,
            completionRate: Math.round(completionRate * 10) / 10,
            avgCycleTimeHours: Math.round((avgCycleTime / 60) * 10) / 10,
            avgLeadTimeHours: Math.round((avgLeadTime / 60) * 10) / 10,
            tasksLast30Days: recentCompletions,
            onTimeDeliveryRate: Math.round(onTimeRate * 10) / 10,
            // Phase 2: Quality metrics
            reworkRate: Math.round(reworkRate * 10) / 10,
            firstTimeSuccessRate: Math.round(firstTimeSuccessRate * 10) / 10,
            avgSLAPerformanceHours: Math.round(avgSLAPerformanceHours * 10) / 10
          }
        };
      })
    );

    return performanceData;
  }

  async getEmployeePerformanceDetail(tenantId: string, userId: string): Promise<any> {
    const employee = await this.getUser(userId);
    // MULTI-TENANT: Verify user belongs to the specified tenant
    if (!employee || employee.tenantId !== tenantId) return null;

    // Get all tasks for this employee
    const allTasks = await this.getTasks(tenantId, { assignedTo: userId });

    // Calculate detailed metrics
    const statusBreakdown = {
      NEW: allTasks.filter(t => t.status === 'NEW').length,
      TRIAGE: allTasks.filter(t => t.status === 'TRIAGE').length,
      ASSIGNED: allTasks.filter(t => t.status === 'ASSIGNED').length,
      IN_PROGRESS: allTasks.filter(t => t.status === 'IN_PROGRESS').length,
      READY_FOR_REVIEW: allTasks.filter(t => t.status === 'READY_FOR_REVIEW').length,
      PUBLISHED: allTasks.filter(t => t.status === 'PUBLISHED').length,
      QA_APPROVED: allTasks.filter(t => t.status === 'QA_APPROVED').length,
      DONE: allTasks.filter(t => t.status === 'DONE').length
    };

    // Get task completion trend (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const completionTrend = [];
    for (let i = 29; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];

      const completed = allTasks.filter(t =>
        t.status === 'DONE' &&
        t.completedAt &&
        t.completedAt.toString().startsWith(dateStr)
      ).length;

      completionTrend.push({
        date: dateStr,
        completed
      });
    }

    // Priority breakdown
    const priorityBreakdown = {
      high: allTasks.filter(t => t.priority === 'high').length,
      medium: allTasks.filter(t => t.priority === 'medium').length,
      low: allTasks.filter(t => t.priority === 'low').length
    };

    return {
      employee,
      statusBreakdown,
      completionTrend,
      priorityBreakdown,
      recentTasks: allTasks.slice(0, 10) // Last 10 tasks
    };
  }

  async getTeamAverages(tenantId?: string): Promise<any> {
    // Get performance data filtered by tenant
    const performanceData = await this.getEmployeePerformanceMetrics(tenantId);

    if (performanceData.length === 0) {
      return {
        avgCompletionRate: 0,
        avgCycleTimeHours: 0,
        avgLeadTimeHours: 0,
        avgOnTimeDeliveryRate: 0,
        avgReworkRate: 0,
        avgFirstTimeSuccessRate: 0,
        avgSLAPerformanceHours: 0,
        totalEmployees: 0
      };
    }

    const metrics = performanceData.map(d => d.metrics);

    return {
      avgCompletionRate: Math.round((metrics.reduce((sum, m) => sum + m.completionRate, 0) / metrics.length) * 10) / 10,
      avgCycleTimeHours: Math.round((metrics.reduce((sum, m) => sum + m.avgCycleTimeHours, 0) / metrics.length) * 10) / 10,
      avgLeadTimeHours: Math.round((metrics.reduce((sum, m) => sum + m.avgLeadTimeHours, 0) / metrics.length) * 10) / 10,
      avgOnTimeDeliveryRate: Math.round((metrics.reduce((sum, m) => sum + m.onTimeDeliveryRate, 0) / metrics.length) * 10) / 10,
      avgReworkRate: Math.round((metrics.reduce((sum, m) => sum + m.reworkRate, 0) / metrics.length) * 10) / 10,
      avgFirstTimeSuccessRate: Math.round((metrics.reduce((sum, m) => sum + m.firstTimeSuccessRate, 0) / metrics.length) * 10) / 10,
      avgSLAPerformanceHours: Math.round((metrics.reduce((sum, m) => sum + m.avgSLAPerformanceHours, 0) / metrics.length) * 10) / 10,
      totalEmployees: performanceData.length
    };
  }

  async getLeaderboard(tenantId: string, category: 'completion' | 'speed' | 'onTime' | 'quality'): Promise<any[]> {
    const performanceData = await this.getEmployeePerformanceMetrics(tenantId);

    // Sort based on category
    let sorted = [...performanceData];

    switch (category) {
      case 'completion':
        // Most tasks completed (last 30 days)
        sorted.sort((a, b) => b.metrics.tasksLast30Days - a.metrics.tasksLast30Days);
        break;
      case 'speed':
        // Fastest average cycle time (lower is better)
        sorted.sort((a, b) => a.metrics.avgCycleTimeHours - b.metrics.avgCycleTimeHours);
        break;
      case 'onTime':
        // Highest on-time delivery rate
        sorted.sort((a, b) => b.metrics.onTimeDeliveryRate - a.metrics.onTimeDeliveryRate);
        break;
      case 'quality':
        // Lowest rework rate (higher first-time success)
        sorted.sort((a, b) => a.metrics.reworkRate - b.metrics.reworkRate);
        break;
    }

    // Return top 5
    return sorted.slice(0, 5).map((d, index) => ({
      rank: index + 1,
      employee: d.employee,
      value: category === 'completion' ? d.metrics.tasksLast30Days :
             category === 'speed' ? d.metrics.avgCycleTimeHours :
             category === 'onTime' ? d.metrics.onTimeDeliveryRate :
             d.metrics.reworkRate
    }));
  }

  // ============================================================================
  // Brand Enrichment Methods
  // ============================================================================

  /**
   * Get cached product data from brand website
   */
  async getBrandProductCache(vendorId: string, styleNumber: string, color?: string): Promise<BrandProductCache | undefined> {
    const query = db
      .select()
      .from(brandProductCache)
      .where(
        and(
          eq(brandProductCache.vendorId, vendorId),
          eq(brandProductCache.styleNumber, styleNumber)
        )
      );

    // If color specified, match it too
    if (color) {
      const results = await query;
      return results.find(r => r.color?.toLowerCase() === color.toLowerCase());
    }

    const [cache] = await query;
    return cache;
  }

  /**
   * Create brand product cache entry
   */
  async createBrandProductCache(cache: InsertBrandProductCache): Promise<BrandProductCache> {
    const [created] = await db
      .insert(brandProductCache)
      .values(cache)
      .returning();
    return created;
  }

  /**
   * Update brand product cache entry
   */
  async updateBrandProductCache(id: string, updates: Partial<BrandProductCache>): Promise<BrandProductCache | undefined> {
    const [updated] = await db
      .update(brandProductCache)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(brandProductCache.id, id))
      .returning();
    return updated;
  }

  /**
   * Get all size charts for a brand
   */
  async getBrandSizeCharts(vendorId: string): Promise<BrandSizeChart[]> {
    return await db
      .select()
      .from(brandSizeCharts)
      .where(eq(brandSizeCharts.vendorId, vendorId))
      .orderBy(brandSizeCharts.category);
  }

  /**
   * Get size chart for specific brand and category
   */
  async getBrandSizeChartByCategory(vendorId: string, category: string): Promise<BrandSizeChart | undefined> {
    const [chart] = await db
      .select()
      .from(brandSizeCharts)
      .where(
        and(
          eq(brandSizeCharts.vendorId, vendorId),
          eq(brandSizeCharts.category, category)
        )
      );
    return chart;
  }

  /**
   * Create brand size chart
   */
  async createBrandSizeChart(chart: InsertBrandSizeChart): Promise<BrandSizeChart> {
    const [created] = await db
      .insert(brandSizeCharts)
      .values(chart)
      .returning();
    return created;
  }

  /**
   * Update brand size chart
   */
  async updateBrandSizeChart(id: string, updates: Partial<BrandSizeChart>): Promise<BrandSizeChart | undefined> {
    const [updated] = await db
      .update(brandSizeCharts)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(brandSizeCharts.id, id))
      .returning();
    return updated;
  }

  /**
   * Get ALL versions of size charts for a specific brand and category (ordered by version desc)
   */
  async getAllBrandSizeChartVersions(vendorId: string, category: string): Promise<BrandSizeChart[]> {
    const charts = await db
      .select()
      .from(brandSizeCharts)
      .where(
        and(
          eq(brandSizeCharts.vendorId, vendorId),
          eq(brandSizeCharts.category, category)
        )
      )
      .orderBy(desc(brandSizeCharts.version));
    return charts;
  }

  /**
   * Get the most-used size chart version for a specific brand and category
   */
  async getMostUsedSizeChart(vendorId: string, category: string): Promise<BrandSizeChart | undefined> {
    const [chart] = await db
      .select()
      .from(brandSizeCharts)
      .where(
        and(
          eq(brandSizeCharts.vendorId, vendorId),
          eq(brandSizeCharts.category, category)
        )
      )
      .orderBy(desc(brandSizeCharts.usageCount))
      .limit(1);
    return chart;
  }

  /**
   * Get size chart by content hash (to detect if chart already exists)
   */
  async getBrandSizeChartByHash(vendorId: string, category: string, contentHash: string): Promise<BrandSizeChart | undefined> {
    const [chart] = await db
      .select()
      .from(brandSizeCharts)
      .where(
        and(
          eq(brandSizeCharts.vendorId, vendorId),
          eq(brandSizeCharts.category, category),
          eq(brandSizeCharts.contentHash, contentHash)
        )
      );
    return chart;
  }

  /**
   * Increment usage count for a size chart
   */
  async incrementSizeChartUsageCount(id: string): Promise<void> {
    await db
      .update(brandSizeCharts)
      .set({
        usageCount: sql`${brandSizeCharts.usageCount} + 1`,
        updatedAt: new Date()
      })
      .where(eq(brandSizeCharts.id, id));
  }

  /**
   * Get a single size chart by ID
   */
  async getBrandSizeChart(id: string): Promise<BrandSizeChart | undefined> {
    const [chart] = await db
      .select()
      .from(brandSizeCharts)
      .where(eq(brandSizeCharts.id, id));
    return chart;
  }

  /**
   * Delete a size chart
   */
  async deleteBrandSizeChart(id: string): Promise<void> {
    await db
      .delete(brandSizeCharts)
      .where(eq(brandSizeCharts.id, id));
  }

  // ============================================================================
  // STYLE NUMBER MAPPING methods (for multi-match product picker)
  // ============================================================================

  /**
   * Get style number mapping for a vendor + style number
   * Used to check if user has already mapped this style number to a brand product
   */
  async getStyleNumberMapping(vendorId: string, ourStyleNumber: string): Promise<StyleNumberMapping | undefined> {
    const [mapping] = await db
      .select()
      .from(styleNumberMappings)
      .where(
        and(
          eq(styleNumberMappings.vendorId, vendorId),
          eq(styleNumberMappings.ourStyleNumber, ourStyleNumber)
        )
      );
    return mapping;
  }

  /**
   * Create style number mapping (user confirmed a match)
   */
  async createStyleNumberMapping(mapping: InsertStyleNumberMapping): Promise<StyleNumberMapping> {
    const [created] = await db
      .insert(styleNumberMappings)
      .values(mapping)
      .returning();
    return created;
  }

  /**
   * Update style number mapping (user changed their mind about the mapping)
   */
  async updateStyleNumberMapping(id: string, updates: Partial<StyleNumberMapping>): Promise<StyleNumberMapping | undefined> {
    const [updated] = await db
      .update(styleNumberMappings)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(styleNumberMappings.id, id))
      .returning();
    return updated;
  }

  /**
   * Delete style number mapping (user wants to remove the mapping)
   */
  async deleteStyleNumberMapping(id: string): Promise<void> {
    await db
      .delete(styleNumberMappings)
      .where(eq(styleNumberMappings.id, id));
  }

  // ============================================================================
  // PRODUCT CATEGORIES (Shopify Standard Product Taxonomy)
  // ============================================================================

  /**
   * Get product category by ID
   */
  async getProductCategoryById(id: string): Promise<any | undefined> {
    const result = await db.execute(sql`
      SELECT id, name, path, level, gid, parent_id, google_category_id, google_category_path
      FROM product_categories
      WHERE id = ${id}
      LIMIT 1
    `);
    return result.rows[0] as any;
  }

  // ============================================================================
  // API INTEGRATIONS (OAuth tokens for external services)
  // ============================================================================

  /**
   * Get active API integration by provider
   * MULTI-TENANT: Added tenantId for isolation
   */
  async getApiIntegration(tenantId: string, provider: string): Promise<ApiIntegration | undefined> {
    const [integration] = await db
      .select()
      .from(apiIntegrations)
      .where(and(
        eq(apiIntegrations.tenantId, tenantId),  // MULTI-TENANT
        eq(apiIntegrations.provider, provider),
        eq(apiIntegrations.isActive, true)
      ))
      .limit(1);
    if (!integration) return undefined;
    // Decrypt sensitive token fields
    return {
      ...integration,
      accessToken: decryptField(integration.accessToken),
      refreshToken: decryptField(integration.refreshToken),
    };
  }

  /**
   * Create or update API integration
   * MULTI-TENANT: Added tenantId for isolation
   */
  async upsertApiIntegration(tenantId: string, integration: InsertApiIntegration): Promise<ApiIntegration> {
    // Encrypt sensitive token fields before storage
    const encryptedIntegration = {
      ...integration,
      accessToken: encryptField(integration.accessToken),
      refreshToken: encryptField(integration.refreshToken),
    };

    // Check if integration exists for this tenant
    const existing = await this.getApiIntegration(tenantId, integration.provider);

    if (existing) {
      // Update existing integration
      const [updated] = await db
        .update(apiIntegrations)
        .set({
          ...encryptedIntegration,
          tenantId,  // MULTI-TENANT: Ensure tenantId is set
          updatedAt: new Date(),
        })
        .where(and(
          eq(apiIntegrations.id, existing.id),
          eq(apiIntegrations.tenantId, tenantId)  // MULTI-TENANT
        ))
        .returning();
      // Return with decrypted tokens
      return {
        ...updated,
        accessToken: decryptField(updated.accessToken),
        refreshToken: decryptField(updated.refreshToken),
      };
    } else {
      // Create new integration with tenantId
      const [created] = await db
        .insert(apiIntegrations)
        .values({
          ...encryptedIntegration,
          tenantId,  // MULTI-TENANT: Ensure tenantId is set
        })
        .returning();
      // Return with decrypted tokens
      return {
        ...created,
        accessToken: decryptField(created.accessToken),
        refreshToken: decryptField(created.refreshToken),
      };
    }
  }

  /**
   * Update last used timestamp for API integration
   * MULTI-TENANT: Added tenantId for isolation
   */
  async updateApiIntegrationLastUsed(tenantId: string, provider: string): Promise<void> {
    await db
      .update(apiIntegrations)
      .set({ lastUsedAt: new Date() })
      .where(and(
        eq(apiIntegrations.tenantId, tenantId),  // MULTI-TENANT
        eq(apiIntegrations.provider, provider)
      ));
  }

  /**
   * Disconnect API integration (soft delete - sets isActive to false)
   * MULTI-TENANT: Added tenantId for isolation
   */
  async disconnectApiIntegration(tenantId: string, provider: string): Promise<void> {
    await db
      .update(apiIntegrations)
      .set({
        isActive: false,
        updatedAt: new Date(),
      })
      .where(and(
        eq(apiIntegrations.tenantId, tenantId),  // MULTI-TENANT
        eq(apiIntegrations.provider, provider)
      ));
  }

  /**
   * Delete API integration (hard delete)
   * MULTI-TENANT: Added tenantId for isolation
   */
  async deleteApiIntegration(tenantId: string, provider: string): Promise<void> {
    await db
      .delete(apiIntegrations)
      .where(and(
        eq(apiIntegrations.tenantId, tenantId),  // MULTI-TENANT
        eq(apiIntegrations.provider, provider)
      ));
  }

  /**
   * Get all API integrations (for admin panel)
   * MULTI-TENANT: Added tenantId for isolation
   */
  async getAllApiIntegrations(tenantId: string): Promise<ApiIntegration[]> {
    const integrations = await db
      .select()
      .from(apiIntegrations)
      .where(eq(apiIntegrations.tenantId, tenantId))  // MULTI-TENANT
      .orderBy(apiIntegrations.createdAt);
    // Decrypt sensitive token fields
    return integrations.map(i => ({
      ...i,
      accessToken: decryptField(i.accessToken),
      refreshToken: decryptField(i.refreshToken),
    }));
  }

  // ========================================
  // Weight Categories Methods
  // ========================================

  /**
   * Get all weight categories for a tenant
   * MULTI-TENANT: Added tenantId for isolation
   */
  async getWeightCategories(tenantId: string): Promise<WeightCategory[]> {
    return await db
      .select()
      .from(weightCategories)
      .where(eq(weightCategories.tenantId, tenantId))
      .orderBy(weightCategories.categoryName);
  }

  /**
   * Get a single weight category by ID
   * MULTI-TENANT: Added tenantId for isolation
   */
  async getWeightCategory(tenantId: string, id: string): Promise<WeightCategory | null> {
    const [category] = await db
      .select()
      .from(weightCategories)
      .where(and(
        eq(weightCategories.tenantId, tenantId),
        eq(weightCategories.id, id)
      ));
    return category || null;
  }

  /**
   * Create a new weight category
   * MULTI-TENANT: tenantId comes from InsertWeightCategory
   */
  async createWeightCategory(data: InsertWeightCategory): Promise<WeightCategory> {
    const [category] = await db
      .insert(weightCategories)
      .values(data)
      .returning();
    return category;
  }

  /**
   * Update a weight category
   * MULTI-TENANT: Added tenantId for isolation
   */
  async updateWeightCategory(tenantId: string, id: string, data: Partial<InsertWeightCategory>): Promise<WeightCategory | null> {
    const [category] = await db
      .update(weightCategories)
      .set({ ...data, updatedAt: new Date() })
      .where(and(
        eq(weightCategories.tenantId, tenantId),
        eq(weightCategories.id, id)
      ))
      .returning();
    return category || null;
  }

  /**
   * Delete a weight category
   * MULTI-TENANT: Added tenantId for isolation
   */
  async deleteWeightCategory(tenantId: string, id: string): Promise<boolean> {
    const result = await db
      .delete(weightCategories)
      .where(and(
        eq(weightCategories.tenantId, tenantId),
        eq(weightCategories.id, id)
      ));
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Import weight categories from Excel - upsert by categoryName
   * MULTI-TENANT: Added tenantId for isolation
   */
  async importWeightCategories(
    tenantId: string,
    categories: Array<{categoryName: string, weightValue: string, weightUnit: string}>,
    createdBy: string
  ): Promise<{created: number, updated: number}> {
    let created = 0;
    let updated = 0;

    for (const cat of categories) {
      // Check if category exists by name
      const [existing] = await db
        .select()
        .from(weightCategories)
        .where(and(
          eq(weightCategories.tenantId, tenantId),
          eq(weightCategories.categoryName, cat.categoryName)
        ));

      if (existing) {
        // Update existing
        await db
          .update(weightCategories)
          .set({
            weightValue: cat.weightValue,
            weightUnit: cat.weightUnit,
            source: 'excel_import',
            updatedAt: new Date()
          })
          .where(eq(weightCategories.id, existing.id));
        updated++;
      } else {
        // Insert new
        await db
          .insert(weightCategories)
          .values({
            tenantId,
            categoryName: cat.categoryName,
            weightValue: cat.weightValue,
            weightUnit: cat.weightUnit,
            source: 'excel_import',
            createdBy
          });
        created++;
      }
    }

    return { created, updated };
  }

  // ========================================
  // Weight Mappings Methods
  // ========================================

  /**
   * Get all weight mappings with category details
   * MULTI-TENANT: Added tenantId for isolation
   */
  async getWeightMappings(tenantId: string): Promise<(ProductTypeWeightMapping & {category: WeightCategory})[]> {
    const results = await db
      .select({
        mapping: productTypeWeightMappings,
        category: weightCategories
      })
      .from(productTypeWeightMappings)
      .leftJoin(weightCategories, eq(productTypeWeightMappings.weightCategoryId, weightCategories.id))
      .where(eq(productTypeWeightMappings.tenantId, tenantId))
      .orderBy(productTypeWeightMappings.productType);

    return results.map(r => ({
      ...r.mapping,
      category: r.category!
    }));
  }

  /**
   * Get weight mapping by product type
   * MULTI-TENANT: Added tenantId for isolation
   */
  async getWeightMappingByProductType(tenantId: string, productType: string): Promise<ProductTypeWeightMapping | null> {
    const [mapping] = await db
      .select()
      .from(productTypeWeightMappings)
      .where(and(
        eq(productTypeWeightMappings.tenantId, tenantId),
        eq(productTypeWeightMappings.productType, productType)
      ));
    return mapping || null;
  }

  /**
   * Create a new weight mapping
   * MULTI-TENANT: tenantId comes from InsertProductTypeWeightMapping
   */
  async createWeightMapping(data: InsertProductTypeWeightMapping): Promise<ProductTypeWeightMapping> {
    const [mapping] = await db
      .insert(productTypeWeightMappings)
      .values(data)
      .returning();
    return mapping;
  }

  /**
   * Update a weight mapping
   * MULTI-TENANT: Added tenantId for isolation
   */
  async updateWeightMapping(tenantId: string, id: string, data: Partial<InsertProductTypeWeightMapping>): Promise<ProductTypeWeightMapping | null> {
    const [mapping] = await db
      .update(productTypeWeightMappings)
      .set({ ...data, updatedAt: new Date() })
      .where(and(
        eq(productTypeWeightMappings.tenantId, tenantId),
        eq(productTypeWeightMappings.id, id)
      ))
      .returning();
    return mapping || null;
  }

  /**
   * Delete a weight mapping
   * MULTI-TENANT: Added tenantId for isolation
   */
  async deleteWeightMapping(tenantId: string, id: string): Promise<boolean> {
    const result = await db
      .delete(productTypeWeightMappings)
      .where(and(
        eq(productTypeWeightMappings.tenantId, tenantId),
        eq(productTypeWeightMappings.id, id)
      ));
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Get product types that don't have weight mappings yet
   * MULTI-TENANT: Added tenantId for isolation
   */
  async getUnmappedProductTypes(tenantId: string): Promise<string[]> {
    // Use raw SQL for NOT EXISTS subquery
    const result = await db.execute(sql`
      SELECT DISTINCT product_type
      FROM products
      WHERE tenant_id = ${tenantId}
        AND product_type IS NOT NULL
        AND product_type != ''
        AND NOT EXISTS (
          SELECT 1 FROM product_type_weight_mappings
          WHERE product_type_weight_mappings.tenant_id = ${tenantId}
            AND product_type_weight_mappings.product_type = products.product_type
        )
      ORDER BY product_type
    `);

    return result.rows.map((row: any) => row.product_type);
  }

  // ========================================
  // Weight Discrepancies Methods
  // ========================================

  /**
   * Get weight discrepancies with optional status filter
   * MULTI-TENANT: Added tenantId for isolation
   */
  async getWeightDiscrepancies(tenantId: string, filters?: {status?: string}): Promise<WeightDiscrepancy[]> {
    const conditions = [eq(weightDiscrepancies.tenantId, tenantId)];

    if (filters?.status) {
      conditions.push(eq(weightDiscrepancies.status, filters.status));
    }

    return await db
      .select()
      .from(weightDiscrepancies)
      .where(and(...conditions))
      .orderBy(desc(weightDiscrepancies.detectedAt));
  }

  /**
   * Get weight discrepancies by specific IDs
   * MULTI-TENANT: Added tenantId for isolation
   */
  async getWeightDiscrepanciesByIds(tenantId: string, ids: string[]): Promise<WeightDiscrepancy[]> {
    if (ids.length === 0) return [];

    return await db
      .select()
      .from(weightDiscrepancies)
      .where(
        and(
          eq(weightDiscrepancies.tenantId, tenantId),
          inArray(weightDiscrepancies.id, ids)
        )
      );
  }

  /**
   * Create a new weight discrepancy record
   * MULTI-TENANT: tenantId comes from InsertWeightDiscrepancy
   */
  async createWeightDiscrepancy(data: InsertWeightDiscrepancy): Promise<WeightDiscrepancy> {
    const [discrepancy] = await db
      .insert(weightDiscrepancies)
      .values(data)
      .returning();
    return discrepancy;
  }

  /**
   * Update discrepancy status (e.g., mark as fixed or ignored)
   * MULTI-TENANT: Added tenantId for isolation
   */
  async updateWeightDiscrepancyStatus(
    tenantId: string,
    id: string,
    status: string,
    resolvedBy: string,
    notes?: string
  ): Promise<WeightDiscrepancy | null> {
    const updateData: Partial<WeightDiscrepancy> = {
      status,
      resolvedBy,
      resolutionNotes: notes || null
    };

    // Set resolvedAt only when status is not 'pending'
    if (status !== 'pending') {
      updateData.resolvedAt = new Date();
    } else {
      updateData.resolvedAt = null;
    }

    const [discrepancy] = await db
      .update(weightDiscrepancies)
      .set(updateData)
      .where(and(
        eq(weightDiscrepancies.tenantId, tenantId),
        eq(weightDiscrepancies.id, id)
      ))
      .returning();
    return discrepancy || null;
  }

  /**
   * Bulk update discrepancy statuses
   * MULTI-TENANT: Added tenantId for isolation
   */
  async bulkUpdateDiscrepancyStatus(
    tenantId: string,
    ids: string[],
    status: string,
    resolvedBy: string
  ): Promise<number> {
    if (ids.length === 0) return 0;

    const updateData: Partial<WeightDiscrepancy> = {
      status,
      resolvedBy
    };

    if (status !== 'pending') {
      updateData.resolvedAt = new Date();
    }

    const result = await db
      .update(weightDiscrepancies)
      .set(updateData)
      .where(and(
        eq(weightDiscrepancies.tenantId, tenantId),
        inArray(weightDiscrepancies.id, ids)
      ));

    return result.rowCount ?? 0;
  }

  /**
   * Get weight discrepancy statistics by status
   * MULTI-TENANT: Added tenantId for isolation
   */
  async getWeightDiscrepancyStats(tenantId: string): Promise<{pending: number, fixed: number, ignored: number, total: number}> {
    const result = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status = 'fixed') as fixed,
        COUNT(*) FILTER (WHERE status = 'ignored') as ignored,
        COUNT(*) as total
      FROM weight_discrepancies
      WHERE tenant_id = ${tenantId}
    `);

    const row = result.rows[0] as any;
    return {
      pending: Number(row?.pending || 0),
      fixed: Number(row?.fixed || 0),
      ignored: Number(row?.ignored || 0),
      total: Number(row?.total || 0)
    };
  }

  // ===================================================================
  // AI INTEGRATION STORAGE METHODS
  // ===================================================================

  // --- Platform AI Defaults (SuperAdmin Only) ---

  /**
   * Get all platform AI default configurations
   */
  async getPlatformAiDefaults(): Promise<typeof platformAiDefaults.$inferSelect[]> {
    return await db.select().from(platformAiDefaults);
  }

  /**
   * Get a specific platform AI default by provider
   */
  async getPlatformAiDefaultByProvider(provider: string): Promise<typeof platformAiDefaults.$inferSelect | null> {
    const [result] = await db
      .select()
      .from(platformAiDefaults)
      .where(eq(platformAiDefaults.provider, provider))
      .limit(1);
    return result || null;
  }

  /**
   * Create or update a platform AI default
   * For inserts, apiKeyEncrypted is required.
   * For updates, apiKeyEncrypted is optional (keeps existing key if not provided).
   */
  async upsertPlatformAiDefault(data: {
    provider: string;
    apiKeyEncrypted?: string;  // Optional - required only for new entries
    defaultModel?: string;
    rateLimitFree?: number;
    rateLimitPro?: number;
    isEnabled?: boolean;
  }): Promise<typeof platformAiDefaults.$inferSelect> {
    // Check if provider exists
    const existing = await db
      .select()
      .from(platformAiDefaults)
      .where(eq(platformAiDefaults.provider, data.provider))
      .limit(1);

    if (existing.length === 0) {
      // Insert requires apiKeyEncrypted
      if (!data.apiKeyEncrypted) {
        throw new Error('apiKeyEncrypted is required when creating a new platform AI default');
      }
      const [result] = await db
        .insert(platformAiDefaults)
        .values({
          provider: data.provider,
          apiKeyEncrypted: data.apiKeyEncrypted,
          defaultModel: data.defaultModel,
          rateLimitFree: data.rateLimitFree ?? 50,
          rateLimitPro: data.rateLimitPro ?? 500,
          isEnabled: data.isEnabled ?? true,
        })
        .returning();
      return result;
    }

    // Update - only set fields that are provided
    const setFields: Partial<typeof platformAiDefaults.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (data.apiKeyEncrypted !== undefined) setFields.apiKeyEncrypted = data.apiKeyEncrypted;
    if (data.defaultModel !== undefined) setFields.defaultModel = data.defaultModel;
    if (data.rateLimitFree !== undefined) setFields.rateLimitFree = data.rateLimitFree;
    if (data.rateLimitPro !== undefined) setFields.rateLimitPro = data.rateLimitPro;
    if (data.isEnabled !== undefined) setFields.isEnabled = data.isEnabled;

    const [result] = await db
      .update(platformAiDefaults)
      .set(setFields)
      .where(eq(platformAiDefaults.provider, data.provider))
      .returning();
    return result;
  }

  /**
   * Delete a platform AI default
   */
  async deletePlatformAiDefault(provider: string): Promise<boolean> {
    const result = await db
      .delete(platformAiDefaults)
      .where(eq(platformAiDefaults.provider, provider))
      .returning({ id: platformAiDefaults.id });
    return result.length > 0;
  }

  // --- Platform Prompt Templates (SuperAdmin Only) ---

  /**
   * Get all platform prompt templates
   */
  async getPlatformPromptTemplates(filters?: {
    category?: string;
    isActive?: boolean;
  }): Promise<typeof platformPromptTemplates.$inferSelect[]> {
    const conditions = [];
    if (filters?.category) {
      conditions.push(eq(platformPromptTemplates.category, filters.category));
    }
    if (filters?.isActive !== undefined) {
      conditions.push(eq(platformPromptTemplates.isActive, filters.isActive));
    }

    if (conditions.length > 0) {
      return await db
        .select()
        .from(platformPromptTemplates)
        .where(and(...conditions));
    }
    return await db.select().from(platformPromptTemplates);
  }

  /**
   * Get a platform prompt template by ID
   */
  async getPlatformPromptTemplateById(id: string): Promise<typeof platformPromptTemplates.$inferSelect | null> {
    const [result] = await db
      .select()
      .from(platformPromptTemplates)
      .where(eq(platformPromptTemplates.id, id))
      .limit(1);
    return result || null;
  }

  /**
   * Get a platform prompt template by slug
   */
  async getPlatformPromptTemplateBySlug(slug: string): Promise<typeof platformPromptTemplates.$inferSelect | null> {
    const [result] = await db
      .select()
      .from(platformPromptTemplates)
      .where(eq(platformPromptTemplates.slug, slug))
      .limit(1);
    return result || null;
  }

  /**
   * Create a platform prompt template
   */
  async createPlatformPromptTemplate(data: {
    slug: string;
    name: string;
    description?: string;
    category: string;
    templateContent: string;
    systemPrompt?: string;
    variables?: any[];
    defaultModel?: string;
    defaultTemperature?: string;
    maxTokens?: number;
    outputFormat?: string;
  }): Promise<typeof platformPromptTemplates.$inferSelect> {
    const [result] = await db
      .insert(platformPromptTemplates)
      .values(data)
      .returning();
    return result;
  }

  /**
   * Update a platform prompt template
   */
  async updatePlatformPromptTemplate(
    id: string,
    data: Partial<{
      name: string;
      description: string;
      category: string;
      templateContent: string;
      systemPrompt: string;
      variables: any[];
      defaultModel: string;
      defaultTemperature: string;
      maxTokens: number;
      outputFormat: string;
      isActive: boolean;
      version: string;
    }>
  ): Promise<typeof platformPromptTemplates.$inferSelect | null> {
    const [result] = await db
      .update(platformPromptTemplates)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(platformPromptTemplates.id, id))
      .returning();
    return result || null;
  }

  /**
   * Delete a platform prompt template
   */
  async deletePlatformPromptTemplate(id: string): Promise<boolean> {
    const result = await db
      .delete(platformPromptTemplates)
      .where(eq(platformPromptTemplates.id, id))
      .returning({ id: platformPromptTemplates.id });
    return result.length > 0;
  }

  // --- Tenant AI Config ---

  /**
   * Get tenant AI configuration
   * MULTI-TENANT: Requires tenantId
   */
  async getTenantAiConfig(tenantId: string): Promise<typeof tenantAiConfig.$inferSelect | null> {
    const [result] = await db
      .select()
      .from(tenantAiConfig)
      .where(eq(tenantAiConfig.tenantId, tenantId))
      .limit(1);
    return result || null;
  }

  /**
   * Create or update tenant AI configuration
   * MULTI-TENANT: Creates config if doesn't exist
   */
  async upsertTenantAiConfig(
    tenantId: string,
    data: Partial<{
      tier: string;
      defaultProvider: string;
      fallbackProvider: string;
      monthlyTokenLimit: number;
    }>
  ): Promise<typeof tenantAiConfig.$inferSelect> {
    const [result] = await db
      .insert(tenantAiConfig)
      .values({
        tenantId,
        tier: data.tier as any ?? 'free',
        defaultProvider: data.defaultProvider ?? 'gemini',
        fallbackProvider: data.fallbackProvider,
        monthlyTokenLimit: data.monthlyTokenLimit,
      })
      .onConflictDoUpdate({
        target: tenantAiConfig.tenantId,
        set: {
          tier: data.tier as any,
          defaultProvider: data.defaultProvider,
          fallbackProvider: data.fallbackProvider,
          monthlyTokenLimit: data.monthlyTokenLimit,
          updatedAt: new Date(),
        },
      })
      .returning();
    return result;
  }

  // --- Tenant AI Providers (BYOK) ---

  /**
   * Get all configured providers for a tenant
   * MULTI-TENANT: Requires tenantId
   */
  async getTenantAiProviders(tenantId: string): Promise<typeof tenantAiProviders.$inferSelect[]> {
    return await db
      .select()
      .from(tenantAiProviders)
      .where(eq(tenantAiProviders.tenantId, tenantId));
  }

  /**
   * Get a specific provider config for a tenant
   * MULTI-TENANT: Requires tenantId
   */
  async getTenantAiProviderByProvider(
    tenantId: string,
    provider: string
  ): Promise<typeof tenantAiProviders.$inferSelect | null> {
    const [result] = await db
      .select()
      .from(tenantAiProviders)
      .where(
        and(
          eq(tenantAiProviders.tenantId, tenantId),
          eq(tenantAiProviders.provider, provider)
        )
      )
      .limit(1);
    return result || null;
  }

  /**
   * Create or update a tenant provider configuration
   * MULTI-TENANT: Requires tenantId
   */
  async upsertTenantAiProvider(
    tenantId: string,
    provider: string,
    data: Partial<{
      apiKeyEncrypted: string;
      usePlatformDefault: boolean;
      additionalConfig: any;
      isEnabled: boolean;
      isDefault: boolean;
      lastTestedAt: Date;
      lastTestStatus: string;
      lastTestError: string;
    }>
  ): Promise<typeof tenantAiProviders.$inferSelect> {
    const [result] = await db
      .insert(tenantAiProviders)
      .values({
        tenantId,
        provider,
        apiKeyEncrypted: data.apiKeyEncrypted,
        usePlatformDefault: data.usePlatformDefault ?? true,
        additionalConfig: data.additionalConfig,
        isEnabled: data.isEnabled ?? true,
        isDefault: data.isDefault ?? false,
        lastTestedAt: data.lastTestedAt,
        lastTestStatus: data.lastTestStatus,
        lastTestError: data.lastTestError,
      })
      .onConflictDoUpdate({
        target: [tenantAiProviders.tenantId, tenantAiProviders.provider],
        set: {
          apiKeyEncrypted: data.apiKeyEncrypted,
          usePlatformDefault: data.usePlatformDefault,
          additionalConfig: data.additionalConfig,
          isEnabled: data.isEnabled,
          isDefault: data.isDefault,
          lastTestedAt: data.lastTestedAt,
          lastTestStatus: data.lastTestStatus,
          lastTestError: data.lastTestError,
          updatedAt: new Date(),
        },
      })
      .returning();
    return result;
  }

  /**
   * Update provider test results
   * MULTI-TENANT: Requires tenantId
   */
  async updateTenantAiProviderTestResult(
    tenantId: string,
    provider: string,
    success: boolean,
    error?: string
  ): Promise<void> {
    await db
      .update(tenantAiProviders)
      .set({
        lastTestedAt: new Date(),
        lastTestStatus: success ? 'success' : 'error',
        lastTestError: error || null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(tenantAiProviders.tenantId, tenantId),
          eq(tenantAiProviders.provider, provider)
        )
      );
  }

  /**
   * Delete a tenant provider configuration
   * MULTI-TENANT: Requires tenantId
   */
  async deleteTenantAiProvider(tenantId: string, provider: string): Promise<boolean> {
    const result = await db
      .delete(tenantAiProviders)
      .where(
        and(
          eq(tenantAiProviders.tenantId, tenantId),
          eq(tenantAiProviders.provider, provider)
        )
      )
      .returning({ id: tenantAiProviders.id });
    return result.length > 0;
  }

  // --- Tenant Prompt Templates ---

  /**
   * Get all tenant prompt templates
   * MULTI-TENANT: Requires tenantId
   */
  async getTenantPromptTemplates(
    tenantId: string,
    filters?: {
      category?: string;
      isActive?: boolean;
      search?: string;
    }
  ): Promise<typeof tenantPromptTemplates.$inferSelect[]> {
    const conditions = [eq(tenantPromptTemplates.tenantId, tenantId)];

    if (filters?.category) {
      conditions.push(eq(tenantPromptTemplates.category, filters.category));
    }
    if (filters?.isActive !== undefined) {
      conditions.push(eq(tenantPromptTemplates.isActive, filters.isActive));
    }
    if (filters?.search) {
      conditions.push(
        or(
          ilike(tenantPromptTemplates.name, `%${filters.search}%`),
          ilike(tenantPromptTemplates.description, `%${filters.search}%`)
        )!
      );
    }

    return await db
      .select()
      .from(tenantPromptTemplates)
      .where(and(...conditions))
      .orderBy(desc(tenantPromptTemplates.usageCount));
  }

  /**
   * Get a tenant prompt template by ID
   * MULTI-TENANT: Requires tenantId
   */
  async getTenantPromptTemplateById(
    tenantId: string,
    id: string
  ): Promise<typeof tenantPromptTemplates.$inferSelect | null> {
    const [result] = await db
      .select()
      .from(tenantPromptTemplates)
      .where(
        and(
          eq(tenantPromptTemplates.tenantId, tenantId),
          eq(tenantPromptTemplates.id, id)
        )
      )
      .limit(1);
    return result || null;
  }

  /**
   * Create a tenant prompt template
   * MULTI-TENANT: Requires tenantId in data
   */
  async createTenantPromptTemplate(data: {
    tenantId: string;
    slug: string;
    name: string;
    description?: string;
    category: string;
    parentTemplateId?: string;
    templateContent: string;
    systemPrompt?: string;
    variables?: any[];
    preferredProvider?: string;
    preferredModel?: string;
    temperature?: string;
    maxTokens?: number;
    outputFormat?: string;
    createdBy?: string;
  }): Promise<typeof tenantPromptTemplates.$inferSelect> {
    const [result] = await db
      .insert(tenantPromptTemplates)
      .values(data)
      .returning();
    return result;
  }

  /**
   * Update a tenant prompt template
   * MULTI-TENANT: Requires tenantId
   */
  async updateTenantPromptTemplate(
    tenantId: string,
    id: string,
    data: Partial<{
      name: string;
      description: string;
      category: string;
      templateContent: string;
      systemPrompt: string;
      variables: any[];
      preferredProvider: string;
      preferredModel: string;
      temperature: string;
      maxTokens: number;
      outputFormat: string;
      isActive: boolean;
      version: string;
    }>
  ): Promise<typeof tenantPromptTemplates.$inferSelect | null> {
    const [result] = await db
      .update(tenantPromptTemplates)
      .set({ ...data, updatedAt: new Date() })
      .where(
        and(
          eq(tenantPromptTemplates.tenantId, tenantId),
          eq(tenantPromptTemplates.id, id)
        )
      )
      .returning();
    return result || null;
  }

  /**
   * Increment template usage count
   * MULTI-TENANT: Requires tenantId
   */
  async incrementTenantTemplateUsage(tenantId: string, id: string): Promise<void> {
    await db
      .update(tenantPromptTemplates)
      .set({
        usageCount: sql`${tenantPromptTemplates.usageCount} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(tenantPromptTemplates.tenantId, tenantId),
          eq(tenantPromptTemplates.id, id)
        )
      );
  }

  /**
   * Delete a tenant prompt template
   * MULTI-TENANT: Requires tenantId
   */
  async deleteTenantPromptTemplate(tenantId: string, id: string): Promise<boolean> {
    const result = await db
      .delete(tenantPromptTemplates)
      .where(
        and(
          eq(tenantPromptTemplates.tenantId, tenantId),
          eq(tenantPromptTemplates.id, id)
        )
      )
      .returning({ id: tenantPromptTemplates.id });
    return result.length > 0;
  }

  // --- Template Version History ---

  /**
   * Get version history for a template
   */
  async getTenantTemplateVersionHistory(
    templateId: string
  ): Promise<typeof tenantPromptTemplateVersions.$inferSelect[]> {
    return await db
      .select()
      .from(tenantPromptTemplateVersions)
      .where(eq(tenantPromptTemplateVersions.templateId, templateId))
      .orderBy(desc(tenantPromptTemplateVersions.createdAt));
  }

  /**
   * Create a version history entry
   */
  async createTenantTemplateVersion(data: {
    templateId: string;
    version: string;
    templateContent: string;
    systemPrompt?: string;
    variables?: any;
    changeSummary?: string;
    changedBy?: string;
  }): Promise<typeof tenantPromptTemplateVersions.$inferSelect> {
    const [result] = await db
      .insert(tenantPromptTemplateVersions)
      .values(data)
      .returning();
    return result;
  }

  // --- Feature Template Assignments ---

  /**
   * Get all feature template assignments for a tenant
   * MULTI-TENANT: Requires tenantId
   */
  async getTenantFeatureTemplates(
    tenantId: string
  ): Promise<typeof tenantFeatureTemplates.$inferSelect[]> {
    return await db
      .select()
      .from(tenantFeatureTemplates)
      .where(eq(tenantFeatureTemplates.tenantId, tenantId));
  }

  /**
   * Get feature template assignment for a specific feature
   * MULTI-TENANT: Requires tenantId
   */
  async getTenantFeatureTemplate(
    tenantId: string,
    feature: string
  ): Promise<typeof tenantFeatureTemplates.$inferSelect | null> {
    const [result] = await db
      .select()
      .from(tenantFeatureTemplates)
      .where(
        and(
          eq(tenantFeatureTemplates.tenantId, tenantId),
          eq(tenantFeatureTemplates.feature, feature)
        )
      )
      .limit(1);
    return result || null;
  }

  /**
   * Set feature template assignment
   * MULTI-TENANT: Requires tenantId
   */
  async setTenantFeatureTemplate(
    tenantId: string,
    feature: string,
    templateId: string | null,
    usePlatformDefault: boolean
  ): Promise<typeof tenantFeatureTemplates.$inferSelect> {
    const [result] = await db
      .insert(tenantFeatureTemplates)
      .values({
        tenantId,
        feature,
        templateId,
        usePlatformDefault,
      })
      .onConflictDoUpdate({
        target: [tenantFeatureTemplates.tenantId, tenantFeatureTemplates.feature],
        set: {
          templateId,
          usePlatformDefault,
          updatedAt: new Date(),
        },
      })
      .returning();
    return result;
  }

  // --- AI Usage Logging ---

  /**
   * Log an AI usage entry
   * MULTI-TENANT: Requires tenantId in data
   */
  async logAiUsage(data: {
    tenantId: string;
    userId?: string;
    provider: string;
    model?: string;
    feature?: string;
    templateId?: string;
    tokensInput?: number;
    tokensOutput?: number;
    costEstimate?: string;
    durationMs?: number;
    success: boolean;
    errorMessage?: string;
    usedPlatformKey: boolean;
    requestMetadata?: any;
  }): Promise<typeof aiUsageLog.$inferSelect> {
    const [result] = await db.insert(aiUsageLog).values(data).returning();
    return result;
  }

  /**
   * Get tenant AI usage for today
   * MULTI-TENANT: Requires tenantId
   */
  async getTenantAiUsageToday(tenantId: string): Promise<number> {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const result = await db
      .select({ count: count() })
      .from(aiUsageLog)
      .where(
        and(
          eq(aiUsageLog.tenantId, tenantId),
          sql`${aiUsageLog.createdAt} >= ${today}`
        )
      );
    return result[0]?.count ?? 0;
  }

  /**
   * Get AI usage statistics for a tenant
   * MULTI-TENANT: Requires tenantId
   */
  async getTenantAiUsageStats(
    tenantId: string,
    options?: {
      startDate?: Date;
      endDate?: Date;
    }
  ): Promise<{
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    totalTokensInput: number;
    totalTokensOutput: number;
    totalCost: number;
    avgDurationMs: number;
    byProvider: Record<string, number>;
    byFeature: Record<string, number>;
  }> {
    const conditions = [eq(aiUsageLog.tenantId, tenantId)];

    if (options?.startDate) {
      conditions.push(sql`${aiUsageLog.createdAt} >= ${options.startDate}`);
    }
    if (options?.endDate) {
      conditions.push(sql`${aiUsageLog.createdAt} <= ${options.endDate}`);
    }

    const result = await db.execute(sql`
      SELECT
        COUNT(*) as total_requests,
        COUNT(*) FILTER (WHERE success = true) as successful_requests,
        COUNT(*) FILTER (WHERE success = false) as failed_requests,
        COALESCE(SUM(tokens_input), 0) as total_tokens_input,
        COALESCE(SUM(tokens_output), 0) as total_tokens_output,
        COALESCE(SUM(cost_estimate::numeric), 0) as total_cost,
        COALESCE(AVG(duration_ms), 0) as avg_duration_ms
      FROM ai_usage_log
      WHERE tenant_id = ${tenantId}
        ${options?.startDate ? sql`AND created_at >= ${options.startDate}` : sql``}
        ${options?.endDate ? sql`AND created_at <= ${options.endDate}` : sql``}
    `);

    const byProviderResult = await db.execute(sql`
      SELECT provider, COUNT(*) as count
      FROM ai_usage_log
      WHERE tenant_id = ${tenantId}
        ${options?.startDate ? sql`AND created_at >= ${options.startDate}` : sql``}
        ${options?.endDate ? sql`AND created_at <= ${options.endDate}` : sql``}
      GROUP BY provider
    `);

    const byFeatureResult = await db.execute(sql`
      SELECT feature, COUNT(*) as count
      FROM ai_usage_log
      WHERE tenant_id = ${tenantId}
        AND feature IS NOT NULL
        ${options?.startDate ? sql`AND created_at >= ${options.startDate}` : sql``}
        ${options?.endDate ? sql`AND created_at <= ${options.endDate}` : sql``}
      GROUP BY feature
    `);

    const row = result.rows[0] as any;
    const byProvider: Record<string, number> = {};
    const byFeature: Record<string, number> = {};

    for (const r of byProviderResult.rows as any[]) {
      byProvider[r.provider] = Number(r.count);
    }
    for (const r of byFeatureResult.rows as any[]) {
      if (r.feature) {
        byFeature[r.feature] = Number(r.count);
      }
    }

    return {
      totalRequests: Number(row?.total_requests || 0),
      successfulRequests: Number(row?.successful_requests || 0),
      failedRequests: Number(row?.failed_requests || 0),
      totalTokensInput: Number(row?.total_tokens_input || 0),
      totalTokensOutput: Number(row?.total_tokens_output || 0),
      totalCost: Number(row?.total_cost || 0),
      avgDurationMs: Number(row?.avg_duration_ms || 0),
      byProvider,
      byFeature,
    };
  }

  /**
   * Get effective template for a tenant and feature
   * Returns tenant override or platform default
   * MULTI-TENANT: Requires tenantId
   */
  async getEffectivePromptTemplate(
    tenantId: string,
    featureOrSlug: string
  ): Promise<{
    template: typeof platformPromptTemplates.$inferSelect | typeof tenantPromptTemplates.$inferSelect | null;
    source: 'platform' | 'tenant';
  }> {
    // Check feature assignment first
    const featureAssignment = await this.getTenantFeatureTemplate(tenantId, featureOrSlug);

    if (featureAssignment) {
      if (featureAssignment.usePlatformDefault || !featureAssignment.templateId) {
        // Use platform default
        const platformTemplate = await this.getPlatformPromptTemplateBySlug(featureOrSlug);
        return { template: platformTemplate, source: 'platform' };
      }
      // Use assigned tenant template
      const tenantTemplate = await this.getTenantPromptTemplateById(tenantId, featureAssignment.templateId);
      return { template: tenantTemplate, source: 'tenant' };
    }

    // Check for tenant template by slug
    const tenantTemplates = await db
      .select()
      .from(tenantPromptTemplates)
      .where(
        and(
          eq(tenantPromptTemplates.tenantId, tenantId),
          eq(tenantPromptTemplates.slug, featureOrSlug),
          eq(tenantPromptTemplates.isActive, true)
        )
      )
      .limit(1);

    if (tenantTemplates.length > 0) {
      return { template: tenantTemplates[0], source: 'tenant' };
    }

    // Fall back to platform template
    const platformTemplate = await this.getPlatformPromptTemplateBySlug(featureOrSlug);
    return { template: platformTemplate, source: 'platform' };
  }
}

export const storage = new DatabaseStorage();
