/**
 * Category Management API Routes
 *
 * Endpoints for category CRUD, Shopify taxonomy mapping, Google Product
 * Category search/filtering, category migration, and collection analysis.
 *
 * Authentication: All endpoints require authentication
 * Authorization:
 * - SuperAdmin, WarehouseManager: Full access (create, update, delete, sync, migration)
 * - Editor, Auditor: Read-only access
 */

import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { sql, and } from "drizzle-orm";
import { storage } from "../storage";
import { db } from "../db";
import { shopifyService } from "../shopify";
import { insertCategorySchema, productCategories, User } from "@shared/schema";
import { safeErrorMessage } from "../utils/safe-error";

export function registerCategoriesRoutes(
  app: any,
  requireAuth: (req: Request, res: Response, next: NextFunction) => void,
  requireRole: (roles: string[]) => (req: Request, res: Response, next: NextFunction) => void
) {
  // MULTI-TENANT: Helper to get tenant ID from authenticated user
  const getTenantId = (req: Request): string | null => {
    const user = req.user as User | undefined;
    return user?.tenantId ?? null;
  };

  // =============================================
  // CATEGORY MANAGEMENT ENDPOINTS
  // =============================================

  // Get all categories with optional filters
  // MULTI-TENANT: Added tenant isolation
  app.get("/api/categories", requireAuth, async (req: Request, res: Response) => {
    try {
      // MULTI-TENANT: Extract and validate tenant context
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      const { isActive, search } = req.query;
      const filters: any = {};

      if (isActive !== undefined) {
        filters.isActive = isActive === 'true';
      }
      if (search) {
        filters.search = search as string;
      }

      const categories = await storage.getAllCategories(tenantId, filters);
      res.json(categories);
    } catch (error) {
      console.error("Error fetching categories:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get category statistics (MUST come before /:id route)
  // MULTI-TENANT: Added tenant isolation
  app.get("/api/categories/stats", requireAuth, async (req: Request, res: Response) => {
    try {
      // MULTI-TENANT: Extract and validate tenant context
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      const stats = await storage.getCategoryStats(tenantId);
      res.json(stats);
    } catch (error) {
      console.error("Error fetching category statistics:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get mapping insights (product type → Shopify category analysis)
  app.get("/api/categories/mapping-insights", requireAuth, async (req: Request, res: Response) => {
    try {
      const insights = await storage.getMappingInsights();
      res.json(insights);
    } catch (error) {
      console.error("Error fetching mapping insights:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Search Shopify product categories (from product_categories table)
  app.get("/api/categories/shopify/search", requireAuth, async (req: Request, res: Response) => {
    try {
      const { q, mainCategory } = req.query;

      if (!q || typeof q !== 'string') {
        return res.status(400).json({ message: "Query parameter 'q' is required" });
      }

      if (q.length < 2) {
        return res.json({ categories: [] });
      }

      const mainCategoryFilter = mainCategory && typeof mainCategory === 'string' ? mainCategory : undefined;
      const categories = await storage.searchProductCategories(q, 50, mainCategoryFilter);

      console.log(`📤 API returning ${categories.length} categories${mainCategoryFilter ? ` (filtered by: ${mainCategoryFilter})` : ''}`);
      if (categories.length > 0) {
        console.log(`📤 First category:`, JSON.stringify(categories[0], null, 2));
      }

      res.json({ categories });
    } catch (error) {
      console.error("Error searching Shopify categories:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Bulk map products by product type to Shopify category
  app.post("/api/categories/bulk-map-by-type", requireAuth, requireRole(["SuperAdmin", "WarehouseManager"]), async (req: Request, res: Response) => {
    try {
      const { productType, shopifyCategoryId, shopifyCategoryPath } = req.body;

      if (!productType || !shopifyCategoryId || !shopifyCategoryPath) {
        return res.status(400).json({ message: "Product type, category ID, and category path are required" });
      }

      console.log(`🗺️  Bulk mapping product type "${productType}" to Shopify category "${shopifyCategoryPath}"`);

      // Update products with this product type
      const updatedCount = await storage.bulkMapProductsByType(productType, shopifyCategoryId, shopifyCategoryPath);

      console.log(`✅ Successfully mapped ${updatedCount} products`);

      res.json({
        success: true,
        updatedCount,
        message: `Successfully mapped ${updatedCount} products to "${shopifyCategoryPath}"`
      });
    } catch (error) {
      console.error("Error bulk mapping products:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Sync categories to Shopify (updates only the category field for products with a specific product_type)
  // MULTI-TENANT: Uses tenant-filtered product lookup
  app.post("/api/categories/sync-to-shopify", requireAuth, requireRole(["SuperAdmin", "WarehouseManager"]), async (req: Request, res: Response) => {
    try {
      // MULTI-TENANT: Get tenant ID from authenticated user
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      const { productType } = req.body;

      if (!productType) {
        return res.status(400).json({ message: "Product type is required" });
      }

      console.log(`🔄 Starting Shopify category sync for product type: "${productType}"`);

      // Get all products with this product_type
      const products = await storage.getProductListByType(productType);

      if (!products || products.length === 0) {
        return res.json({
          success: true,
          total: 0,
          synced: 0,
          skipped: 0,
          failed: 0,
          message: `No products found with product type "${productType}"`
        });
      }

      // Extract product IDs
      const productIds = products.map(p => p.id);

      console.log(`📋 Found ${productIds.length} products with type "${productType}"`);

      // Sync categories to Shopify - MULTI-TENANT
      const result = await shopifyService.batchUpdateCategories(tenantId, productIds);

      res.json({
        success: true,
        total: productIds.length,
        synced: result.success,
        skipped: result.skipped,
        failed: result.failed,
        message: `Synced ${result.success} products, skipped ${result.skipped}, failed ${result.failed}`,
        details: result.results
      });
    } catch (error) {
      console.error("Error syncing categories to Shopify:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get single category by ID
  // MULTI-TENANT: Added tenant isolation
  app.get("/api/categories/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      // MULTI-TENANT: Extract and validate tenant context
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      const category = await storage.getCategoryById(tenantId, req.params.id);
      if (!category) {
        return res.status(404).json({ message: "Category not found" });
      }

      res.json(category);
    } catch (error) {
      console.error("Error fetching category:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Create new category
  // MULTI-TENANT: Added tenant isolation
  app.post("/api/categories", requireAuth, requireRole(["SuperAdmin", "WarehouseManager"]), async (req: Request, res: Response) => {
    try {
      // MULTI-TENANT: Extract and validate tenant context
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      const categoryData = insertCategorySchema.parse(req.body);

      // MULTI-TENANT: Ensure category is created for the current tenant
      const categoryWithTenant = { ...categoryData, tenantId };

      // Storage layer already checks for duplicates
      const category = await storage.createCategory(categoryWithTenant);
      res.status(201).json(category);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: "Validation error",
          errors: error.errors,
          details: error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
        });
      }
      // Check for duplicate errors from storage layer
      if (error.message && (error.message.includes('already exists'))) {
        return res.status(409).json({ message: error.message });
      }
      console.error("Error creating category:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Update category
  // MULTI-TENANT: Added tenant isolation
  app.put("/api/categories/:id", requireAuth, requireRole(["SuperAdmin", "WarehouseManager"]), async (req: Request, res: Response) => {
    try {
      // MULTI-TENANT: Extract and validate tenant context
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      const { id } = req.params;

      // MULTI-TENANT: Check if category exists in this tenant
      const existingCategory = await storage.getCategoryById(tenantId, id);
      if (!existingCategory) {
        return res.status(404).json({ message: "Category not found" });
      }

      // Validate updates with insertCategorySchema (partial)
      const updateSchema = insertCategorySchema.partial();
      const updates = updateSchema.parse(req.body);

      // Storage layer checks for duplicate conflicts
      const updatedCategory = await storage.updateCategory(tenantId, id, updates);
      if (!updatedCategory) {
        return res.status(404).json({ message: "Category not found" });
      }

      res.json(updatedCategory);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: "Validation error",
          errors: error.errors,
          details: error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
        });
      }
      // Check for duplicate errors from storage layer
      if (error.message && (error.message.includes('already exists'))) {
        return res.status(409).json({ message: error.message });
      }
      console.error("Error updating category:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Delete category with safe product handling
  // MULTI-TENANT: Added tenant isolation
  app.delete("/api/categories/:id", requireAuth, requireRole(["SuperAdmin", "WarehouseManager"]), async (req: Request, res: Response) => {
    try {
      // MULTI-TENANT: Extract and validate tenant context
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      const { id } = req.params;
      const { reassignTo, deleteProducts } = req.query;

      // MULTI-TENANT: Check if category exists in this tenant
      const category = await storage.getCategoryById(tenantId, id);
      if (!category) {
        return res.status(404).json({ message: "Category not found" });
      }

      // Build options object
      const options: any = {};
      if (reassignTo) {
        options.reassignTo = reassignTo as string;
      }
      if (deleteProducts === 'true') {
        options.deleteProducts = true;
      }

      const deleted = await storage.deleteCategory(tenantId, id, options);
      if (!deleted) {
        return res.status(404).json({ message: "Category not found" });
      }

      res.json({ message: "Category deleted successfully" });
    } catch (error) {
      console.error("Error deleting category:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Refresh category product counts
  app.post("/api/categories/refresh-counts", requireAuth, requireRole(["SuperAdmin", "WarehouseManager"]), async (req: Request, res: Response) => {
    try {
      await storage.updateCategoryProductCounts();
      res.json({ message: "Category product counts refreshed successfully" });
    } catch (error) {
      console.error("Error refreshing category product counts:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // =============================================
  // CATEGORY MIGRATION ENDPOINTS (Categories → Tags)
  // =============================================

  // Get migration status for all categories
  // MULTI-TENANT: Added tenant isolation
  app.get("/api/categories/migration/status", requireAuth, async (req: Request, res: Response) => {
    try {
      // MULTI-TENANT: Extract and validate tenant context
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      const { default: categoryMigrationService } = await import("../services/category-migration.service.js");
      const status = await categoryMigrationService.getMigrationStatus(tenantId);
      res.json(status);
    } catch (error) {
      console.error("Error fetching migration status:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Run dry-run migration for a category
  // MULTI-TENANT: Added tenant isolation
  app.post("/api/categories/migration/dry-run", requireAuth, requireRole(["SuperAdmin", "WarehouseManager"]), async (req: Request, res: Response) => {
    try {
      // MULTI-TENANT: Extract and validate tenant context
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      const { categoryName } = req.body;
      if (!categoryName) {
        return res.status(400).json({ message: "categoryName is required" });
      }

      const { default: categoryMigrationService } = await import("../services/category-migration.service.js");
      const result = await categoryMigrationService.runDryRun(tenantId, categoryName);
      res.json(result);
    } catch (error: any) {
      console.error("Error running dry-run migration:", error);
      res.status(500).json({
        message: "Internal server error",
        error: safeErrorMessage(error)
      });
    }
  });

  // Execute migration for a category
  // MULTI-TENANT: Added tenant isolation
  app.post("/api/categories/migration/execute", requireAuth, requireRole(["SuperAdmin", "WarehouseManager"]), async (req: Request, res: Response) => {
    try {
      // MULTI-TENANT: Extract and validate tenant context
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      const { categoryName } = req.body;
      if (!categoryName) {
        return res.status(400).json({ message: "categoryName is required" });
      }

      const { default: categoryMigrationService } = await import("../services/category-migration.service.js");
      const result = await categoryMigrationService.executeMigration(tenantId, categoryName);
      res.json(result);
    } catch (error: any) {
      console.error("Error executing migration:", error);
      res.status(500).json({
        message: "Internal server error",
        error: safeErrorMessage(error)
      });
    }
  });

  // Create backup before migration
  // MULTI-TENANT: Added tenant isolation
  app.post("/api/categories/migration/backup", requireAuth, requireRole(["SuperAdmin", "WarehouseManager"]), async (req: Request, res: Response) => {
    try {
      // MULTI-TENANT: Extract and validate tenant context
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      const { categoryName } = req.body;
      if (!categoryName) {
        return res.status(400).json({ message: "categoryName is required" });
      }

      const { default: categoryMigrationService } = await import("../services/category-migration.service.js");
      const result = await categoryMigrationService.createBackup(tenantId, categoryName);

      if (!result.success) {
        return res.status(400).json(result);
      }

      res.json(result);
    } catch (error: any) {
      console.error("Error creating backup:", error);
      res.status(500).json({
        message: "Internal server error",
        error: safeErrorMessage(error)
      });
    }
  });

  // Restore from backup
  app.post("/api/categories/migration/restore", requireAuth, requireRole(["SuperAdmin", "WarehouseManager"]), async (req: Request, res: Response) => {
    try {
      const { backupFilename } = req.body;
      if (!backupFilename) {
        return res.status(400).json({ message: "backupFilename is required" });
      }

      const { default: categoryMigrationService } = await import("../services/category-migration.service.js");
      const result = await categoryMigrationService.restoreFromBackup(backupFilename);

      if (!result.success) {
        return res.status(400).json(result);
      }

      res.json(result);
    } catch (error: any) {
      console.error("Error restoring from backup:", error);
      res.status(500).json({
        message: "Internal server error",
        error: safeErrorMessage(error)
      });
    }
  });

  // List available backups
  app.get("/api/categories/migration/backups", requireAuth, async (req: Request, res: Response) => {
    try {
      const { default: categoryMigrationService } = await import("../services/category-migration.service.js");
      const backups = await categoryMigrationService.listBackups();
      res.json(backups);
    } catch (error: any) {
      console.error("Error listing backups:", error);
      res.status(500).json({
        message: "Internal server error",
        error: safeErrorMessage(error)
      });
    }
  });

  // Collections Analyzer V2 - Analyzes collections using local database
  app.get("/api/categories/migration/analyze-collections", requireAuth, async (req: Request, res: Response) => {
    try {
      const { collectionsAnalyzerV2 } = await import("../services/collections-analyzer-v2.service");
      const report = await collectionsAnalyzerV2.analyzeCollections();
      res.json(report);
    } catch (error: any) {
      console.error("Error analyzing collections:", error);
      res.status(500).json({
        message: "Failed to analyze collections",
        error: safeErrorMessage(error)
      });
    }
  });

  // Fix collection rules (updates LOCAL database only - Shopify sync happens later)
  app.post("/api/categories/migration/fix-collection-rules", requireAuth, requireRole(["SuperAdmin", "WarehouseManager"]), async (req: Request, res: Response) => {
    try {
      const { collectionId, newRules, appliedDisjunctively } = req.body;

      if (!collectionId || !newRules) {
        return res.status(400).json({ message: "Missing required fields: collectionId, newRules" });
      }

      const { collectionsAnalyzerV2 } = await import("../services/collections-analyzer-v2.service");
      const result = await collectionsAnalyzerV2.fixCollectionRules(
        collectionId,
        newRules,
        appliedDisjunctively !== undefined ? appliedDisjunctively : false
      );

      if (!result.success) {
        return res.status(500).json({
          message: "Failed to fix collection rules",
          error: result.error
        });
      }

      res.json({ success: true, message: "Collection rules updated successfully" });
    } catch (error: any) {
      console.error("Error fixing collection rules:", error);
      res.status(500).json({
        message: "Failed to fix collection rules",
        error: safeErrorMessage(error)
      });
    }
  });

  // Migrate products in a collection (updates LOCAL database only - Shopify sync happens later)
  app.post("/api/categories/migration/migrate-collection-products/:id", requireAuth, requireRole(["SuperAdmin", "WarehouseManager"]), async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const { collectionsAnalyzerV2 } = await import("../services/collections-analyzer-v2.service");
      const result = await collectionsAnalyzerV2.migrateCollectionProducts(id);

      if (!result.success) {
        return res.status(500).json({
          message: "Failed to migrate products",
          error: result.error
        });
      }

      res.json({
        success: true,
        productsUpdated: result.productsUpdated,
        message: `Successfully migrated ${result.productsUpdated} products`
      });
    } catch (error: any) {
      console.error("Error migrating collection products:", error);
      res.status(500).json({
        message: "Failed to migrate products",
        error: safeErrorMessage(error)
      });
    }
  });

  // Get single collection analysis
  app.get("/api/categories/migration/analyze-collection/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const { collectionsAnalyzerV2 } = await import("../services/collections-analyzer-v2.service");
      const analysis = await collectionsAnalyzerV2.analyzeCollectionById(id);

      if (!analysis) {
        return res.status(404).json({ message: "Collection not found" });
      }

      res.json(analysis);
    } catch (error: any) {
      console.error("Error analyzing collection:", error);
      res.status(500).json({
        message: "Failed to analyze collection",
        error: safeErrorMessage(error)
      });
    }
  });

  // Get Google Product Category filters (main categories and genders)
  app.get("/api/google-categories/filters", requireAuth, async (req: Request, res: Response) => {
    try {
      console.log("⭐ Filters endpoint called!");

      // Get all categories and process in memory (simpler approach)
      const allCategories = await db.select({
        path: productCategories.path,
        level: productCategories.level,
      }).from(productCategories);

      console.log("✓ Fetched", allCategories.length, "categories from database");

      // Extract main categories (first part before " > ")
      const mainCategoryMap = new Map<string, number>();
      const genderMap = new Map<string, number>();

      for (const cat of allCategories) {
        // Main category is the first part of the path
        const mainCat = cat.path.split(' > ')[0];
        mainCategoryMap.set(mainCat, (mainCategoryMap.get(mainCat) || 0) + 1);

        // Detect gender from path
        const path = cat.path.toLowerCase();
        let gender = 'Unisex';
        if (path.includes("men's") || path.includes('men >') || path.includes(' men ')) {
          gender = 'Men';
        } else if (path.includes("women's") || path.includes('women >') || path.includes(' women ')) {
          gender = 'Women';
        } else if (path.includes('boys')) {
          gender = 'Boys';
        } else if (path.includes('girls')) {
          gender = 'Girls';
        } else if (path.includes('baby') || path.includes('infant') || path.includes('toddler')) {
          gender = 'Baby';
        } else if (path.includes('kids') || path.includes('children')) {
          gender = 'Kids';
        }
        genderMap.set(gender, (genderMap.get(gender) || 0) + 1);
      }

      // Convert maps to arrays
      const mainCategories = Array.from(mainCategoryMap.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => a.name.localeCompare(b.name));

      const genderOrder = ['Men', 'Women', 'Boys', 'Girls', 'Kids', 'Baby', 'Unisex'];
      const genders = Array.from(genderMap.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => genderOrder.indexOf(a.name) - genderOrder.indexOf(b.name));

      console.log("✓ Processed filters:", {
        mainCategories: mainCategories.length,
        genders: genders.length
      });

      res.json({
        mainCategories,
        genders,
        levels: [1, 2, 3, 4, 5, 6]
      });
    } catch (error: any) {
      console.error("❌ Error fetching category filters:", error);
      console.error("Error stack:", error.stack);
      res.status(500).json({
        message: "Failed to fetch filters",
        error: safeErrorMessage(error)
      });
    }
  });

  // Search Google Product Taxonomy Categories
  app.get("/api/google-categories/search", requireAuth, async (req: Request, res: Response) => {
    try {
      const { search, mainCategory, gender, level, limit = '100' } = req.query;

      const { productCategories } = await import("@shared/schema");
      const { sql, and } = await import("drizzle-orm");

      // Build WHERE conditions
      const conditions = [];

      // Filter by main category
      if (mainCategory && typeof mainCategory === 'string') {
        conditions.push(sql`${productCategories.path} LIKE ${mainCategory + ' >%'}`);
      }

      // Filter by gender
      if (gender && typeof gender === 'string') {
        if (gender === 'Men') {
          conditions.push(sql`(${productCategories.path} ILIKE '%Men''s%' OR ${productCategories.path} ILIKE '%Men >%' OR ${productCategories.path} ILIKE '% Men %')`);
        } else if (gender === 'Women') {
          conditions.push(sql`(${productCategories.path} ILIKE '%Women''s%' OR ${productCategories.path} ILIKE '%Women >%' OR ${productCategories.path} ILIKE '% Women %')`);
        } else if (gender === 'Boys') {
          conditions.push(sql`${productCategories.path} ILIKE '%Boys%'`);
        } else if (gender === 'Girls') {
          conditions.push(sql`${productCategories.path} ILIKE '%Girls%'`);
        } else if (gender === 'Baby') {
          conditions.push(sql`(${productCategories.path} ILIKE '%Baby%' OR ${productCategories.path} ILIKE '%Infant%' OR ${productCategories.path} ILIKE '%Toddler%')`);
        } else if (gender === 'Kids') {
          conditions.push(sql`(${productCategories.path} ILIKE '%Kids%' OR ${productCategories.path} ILIKE '%Children%')`);
        } else if (gender === 'Unisex') {
          // Unisex = doesn't match any of the above patterns
          conditions.push(sql`(
            ${productCategories.path} NOT ILIKE '%Men''s%' AND
            ${productCategories.path} NOT ILIKE '%Men >%' AND
            ${productCategories.path} NOT ILIKE '% Men %' AND
            ${productCategories.path} NOT ILIKE '%Women''s%' AND
            ${productCategories.path} NOT ILIKE '%Women >%' AND
            ${productCategories.path} NOT ILIKE '% Women %' AND
            ${productCategories.path} NOT ILIKE '%Boys%' AND
            ${productCategories.path} NOT ILIKE '%Girls%' AND
            ${productCategories.path} NOT ILIKE '%Baby%' AND
            ${productCategories.path} NOT ILIKE '%Infant%' AND
            ${productCategories.path} NOT ILIKE '%Toddler%' AND
            ${productCategories.path} NOT ILIKE '%Kids%' AND
            ${productCategories.path} NOT ILIKE '%Children%'
          )`);
        }
      }

      // Filter by level
      if (level && typeof level === 'string') {
        conditions.push(sql`${productCategories.level} = ${parseInt(level)}`);
      }

      // Apply search filter if provided
      if (search && typeof search === 'string' && search.trim()) {
        const searchQuery = search.trim();

        // Try exact name match first with filters
        const whereClause = conditions.length > 0
          ? and(
              sql`LOWER(${productCategories.name}) LIKE ${`%${searchQuery.toLowerCase()}%`}`,
              ...conditions
            )
          : sql`LOWER(${productCategories.name}) LIKE ${`%${searchQuery.toLowerCase()}%`}`;

        const exactMatches = await db
          .select({
            id: productCategories.id,
            gid: productCategories.gid,
            path: productCategories.path,
            name: productCategories.name,
            level: productCategories.level,
          })
          .from(productCategories)
          .where(whereClause)
          .orderBy(sql`${productCategories.level} DESC`)
          .limit(parseInt(limit as string, 10));

        if (exactMatches.length > 0) {
          return res.json(exactMatches);
        }

        // Fall back to full-text search on path with filters
        const searchTerms = searchQuery.split(/\s+/).filter(t => t.length > 0).join(' | ');
        const fullTextCondition = sql`to_tsvector('english', ${productCategories.path}) @@ to_tsquery('english', ${searchTerms})`;

        const fullTextWhere = conditions.length > 0
          ? and(fullTextCondition, ...conditions)
          : fullTextCondition;

        const fullTextMatches = await db
          .select({
            id: productCategories.id,
            gid: productCategories.gid,
            path: productCategories.path,
            name: productCategories.name,
            level: productCategories.level,
          })
          .from(productCategories)
          .where(fullTextWhere)
          .orderBy(sql`${productCategories.level} DESC`)
          .limit(parseInt(limit as string, 10));

        return res.json(fullTextMatches);
      }

      // No search - apply filters and return categories
      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      let query = db
        .select({
          id: productCategories.id,
          gid: productCategories.gid,
          path: productCategories.path,
          name: productCategories.name,
          level: productCategories.level,
        })
        .from(productCategories)
        .orderBy(sql`${productCategories.level} DESC`);

      if (whereClause) {
        query = query.where(whereClause) as any;
      }

      const categories = await query.limit(parseInt(limit as string, 10));
      res.json(categories);
    } catch (error: any) {
      console.error("Error searching Google Product Categories:", error);
      res.status(500).json({
        message: "Failed to search categories",
        error: safeErrorMessage(error)
      });
    }
  });

  // =============================================
  // END CATEGORY MANAGEMENT ENDPOINTS
  // =============================================
}
