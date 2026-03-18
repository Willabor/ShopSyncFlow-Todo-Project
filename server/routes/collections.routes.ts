/**
 * Collection Management API Routes
 *
 * Endpoints for collection CRUD, analytics, health monitoring,
 * product associations, and Shopify sync operations.
 *
 * Authentication: All endpoints require authentication
 * Authorization:
 * - SuperAdmin, WarehouseManager: Full access (create, update, delete, sync)
 * - Editor: Add/remove products from manual collections
 * - Auditor: Read-only access
 */

import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { shopifyService } from "../shopify";
import { insertCollectionSchema } from "@shared/schema";
import { safeErrorMessage } from "../utils/safe-error";

export function registerCollectionRoutes(
  app: any,
  requireAuth: (req: Request, res: Response, next: NextFunction) => void,
  requireRole: (roles: string[]) => (req: Request, res: Response, next: NextFunction) => void
) {
  // MULTI-TENANT: Helper to get tenant ID from authenticated user
  const getTenantId = (req: Request): string | null => {
    const user = req.user as any;
    return user?.tenantId ?? null;
  };

  // =============================================
  // COLLECTIONS MANAGEMENT ENDPOINTS
  // =============================================

  // Get all collections with pagination and filtering
  // MULTI-TENANT: Filter by tenant
  app.get("/api/collections", requireAuth, async (req: Request, res: Response) => {
    try {
      // MULTI-TENANT: Get tenant from authenticated user
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      const { isActive, search, limit, offset, sortBy, sortOrder } = req.query;
      const filters: any = {};

      if (isActive !== undefined) {
        filters.isActive = isActive === 'true';
      }
      if (search) {
        filters.search = search as string;
      }
      if (limit) {
        filters.limit = parseInt(limit as string, 10);
      }
      if (offset) {
        filters.offset = parseInt(offset as string, 10);
      }
      if (sortBy) {
        filters.sortBy = sortBy as string;
      }
      if (sortOrder) {
        filters.sortOrder = sortOrder as 'asc' | 'desc';
      }

      const result = await storage.getAllCollections(tenantId, filters);
      console.log(`📁 Collections query: search="${search || ''}", limit=${filters.limit || 100}, offset=${filters.offset || 0}, isActive=${filters.isActive ?? 'all'}, sortBy=${filters.sortBy || 'createdAt'}, sortOrder=${filters.sortOrder || 'desc'}`);
      console.log(`✅ Returned ${result.collections.length} of ${result.total} total collections`);
      res.json(result);
    } catch (error) {
      console.error("Error fetching collections:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get collections analytics/insights
  app.get("/api/collections/analytics", requireAuth, async (req: Request, res: Response) => {
    try {
      // MULTI-TENANT: Get tenant from authenticated user
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      const allCollections = await storage.getAllCollections(tenantId, { limit: 10000 });
      const collections = allCollections.collections;
      const now = new Date();

      // Helper function to calculate days since creation
      const daysSince = (date: Date) => Math.floor((now.getTime() - new Date(date).getTime()) / (1000 * 60 * 60 * 24));

      // Helper to create collection summary
      const toSummary = (c: any) => ({
        id: c.id,
        name: c.name,
        productCount: c.productCount,
        shopifyCollectionId: c.shopifyCollectionId,
      });

      // Calculate analytics
      const analytics = {
        total: collections.length,

        // Data quality issues
        missingImages: collections.filter(c => !c.image && c.productCount > 0).length,
        missingImagesList: collections
          .filter(c => !c.image && c.productCount > 0)
          .sort((a, b) => b.productCount - a.productCount) // Sort by product count DESC
          .slice(0, 20)
          .map(toSummary),

        missingSEO: collections.filter(c => !c.metaTitle && !c.metaDescription && c.shopifyCollectionId).length,
        missingSEOList: collections
          .filter(c => !c.metaTitle && !c.metaDescription && c.shopifyCollectionId)
          .filter(c => c.productCount > 0) // Only show if they have products
          .sort((a, b) => b.productCount - a.productCount) // Sort by product count DESC
          .slice(0, 20)
          .map(toSummary),

        // Product status
        withProducts: collections.filter(c => c.productCount > 0).length,
        withoutProducts: collections.filter(c => c.productCount === 0).length,
        withoutProductsList: collections
          .filter(c => c.productCount === 0)
          .slice(0, 20)
          .map(toSummary),

        // Source breakdown
        fromShopify: collections.filter(c => c.shopifyCollectionId).length,
        localOnly: collections.filter(c => !c.shopifyCollectionId).length,

        // Collection types (Shopify only)
        smartCollections: collections.filter(c => c.shopifyType === 'smart').length,
        manualCollections: collections.filter(c => c.shopifyType === 'manual').length,

        // Cleanup candidates (empty collections by age)
        emptyCollections: {
          total: collections.filter(c => c.productCount === 0).length,
          age30Days: collections.filter(c => c.productCount === 0 && daysSince(c.createdAt) >= 30).length,
          age60Days: collections.filter(c => c.productCount === 0 && daysSince(c.createdAt) >= 60).length,
          age90Days: collections.filter(c => c.productCount === 0 && daysSince(c.createdAt) >= 90).length,
          age180Days: collections.filter(c => c.productCount === 0 && daysSince(c.createdAt) >= 180).length,

          // Detailed list for 90+ days (for cleanup UI)
          age90DaysList: collections
            .filter(c => c.productCount === 0 && daysSince(c.createdAt) >= 90)
            .map(c => ({
              id: c.id,
              name: c.name,
              createdAt: c.createdAt,
              daysOld: daysSince(c.createdAt),
              shopifyCollectionId: c.shopifyCollectionId,
            })),
        },

        // Status breakdown
        active: collections.filter(c => c.isActive).length,
        inactive: collections.filter(c => !c.isActive).length,
      };

      res.json(analytics);
    } catch (error) {
      console.error("Error fetching collection analytics:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get collection health issues (replaces old duplicates endpoint)
  app.get("/api/collections/health-issues", requireAuth, async (req: Request, res: Response) => {
    try {
      const { status, issueType } = req.query;
      // MULTI-TENANT: Get tenant from authenticated user
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }
      const issues = await storage.getCollectionHealthIssues(tenantId, {
        status: status as string | undefined,
        issueType: issueType as string | undefined,
      });
      const count = await storage.getOpenHealthIssuesCount(tenantId);

      res.json({
        issues,
        openCount: count,
      });
    } catch (error) {
      console.error("Error fetching collection health issues:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Run health check and get results
  app.post("/api/collections/health/run", requireAuth, async (req: Request, res: Response) => {
    try {
      // MULTI-TENANT: Get tenant from authenticated user
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }
      const startTime = Date.now();

      // Import health check module
      const { runHealthCheck, markDuplicatesInDatabase } = await import("../health");

      // Run the health check
      const result = await runHealthCheck({ tenantId });

      // Mark duplicates in the collections table - MULTI-TENANT
      if (result.duplicateGroups.length > 0) {
        await markDuplicatesInDatabase(tenantId, result.duplicateGroups);
      }

      res.json({
        success: true,
        result,
        duration: Date.now() - startTime,
      });
    } catch (error) {
      console.error("Error running health check:", error);
      res.status(500).json({ message: "Internal server error", error: String(error) });
    }
  });

  // Get health check status (without running new scan)
  app.get("/api/collections/health", requireAuth, async (req: Request, res: Response) => {
    try {
      // MULTI-TENANT: Get tenant from authenticated user
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      const { getHealthStatus } = await import("../health");
      const status = await getHealthStatus(tenantId);

      res.json(status);
    } catch (error) {
      console.error("Error getting health status:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Legacy endpoint - redirect to new health-issues endpoint
  app.get("/api/collections/duplicates", requireAuth, async (req: Request, res: Response) => {
    try {
      // MULTI-TENANT: Get tenant from authenticated user
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }
      const issues = await storage.getCollectionHealthIssues(tenantId, {
        issueType: 'duplicate',
        status: req.query.status as string | undefined,
      });
      const count = await storage.getOpenHealthIssuesCount(tenantId);

      // Return in legacy format for backwards compatibility
      res.json({
        duplicates: issues,
        count,
      });
    } catch (error) {
      console.error("Error fetching duplicate collections:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Delete collection (from both Shopify and local database)
  app.delete("/api/collections/:id/delete-permanently", requireAuth, requireRole(["SuperAdmin"]), async (req: Request, res: Response) => {
    try {
      const collectionId = req.params.id;
      const { skipShopifyDelete } = req.query;
      // MULTI-TENANT: Get tenant from authenticated user
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      console.log(`🗑️ Delete request for collection: ${collectionId}`);

      // Get collection details - MULTI-TENANT
      const collection = await storage.getCollectionById(tenantId, collectionId);
      if (!collection) {
        return res.status(404).json({ message: "Collection not found" });
      }

      // Check if collection is in navigation
      const collectionsInNav = await shopifyService.getCollectionsInNavigation(tenantId);
      if (collection.shopifyCollectionId && collectionsInNav.has(collection.shopifyCollectionId)) {
        const navInfo = collectionsInNav.get(collection.shopifyCollectionId);
        return res.status(400).json({
          message: "Cannot delete collection that is in navigation",
          error: `Collection is referenced in menu "${navInfo?.menuTitle}" as "${navInfo?.itemTitle}". Remove it from navigation first.`,
          inNavigation: true,
          menuTitle: navInfo?.menuTitle,
        });
      }

      // Delete from Shopify first (unless skipShopifyDelete is true) - MULTI-TENANT
      if (collection.shopifyCollectionId && skipShopifyDelete !== 'true') {
        const shopifyResult = await shopifyService.deleteCollectionFromShopify(tenantId, collection.shopifyCollectionId);
        if (!shopifyResult.success) {
          return res.status(500).json({
            message: "Failed to delete from Shopify",
            error: shopifyResult.error,
          });
        }
        console.log(`✅ Deleted from Shopify: ${collection.shopifyCollectionId}`);
      }

      // Soft delete locally (mark as inactive) - MULTI-TENANT
      await storage.updateCollection(tenantId, collectionId, {
        isActive: false,
        syncedAt: new Date(),
      });

      // Update any health issues related to this collection
      const issues = await storage.getCollectionHealthIssues(tenantId, {
        status: 'open',
      });

      for (const issue of issues) {
        if (issue.collectionId === collectionId) {
          await storage.updateCollectionHealthIssue(issue.id, {
            status: 'resolved',
            resolvedAt: new Date(),
            resolvedBy: 'system',
          });
        }
      }

      console.log(`✅ Collection deleted: ${collection.name} (${collectionId})`);

      res.json({
        success: true,
        message: `Collection "${collection.name}" has been deleted`,
        deletedFromShopify: !!collection.shopifyCollectionId && skipShopifyDelete !== 'true',
      });
    } catch (error) {
      console.error("Error deleting collection:", error);
      res.status(500).json({ message: "Internal server error", error: String(error) });
    }
  });

  // Get single collection by ID with products
  // MULTI-TENANT: Filter by tenant
  app.get("/api/collections/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      // MULTI-TENANT: Get tenant from authenticated user
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      const collection = await storage.getCollectionWithProducts(tenantId, req.params.id);
      if (!collection) {
        return res.status(404).json({ message: "Collection not found" });
      }

      res.json(collection);
    } catch (error) {
      console.error("Error fetching collection:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Create new collection
  // MULTI-TENANT: Filter by tenant
  app.post("/api/collections", requireAuth, requireRole(["SuperAdmin", "WarehouseManager"]), async (req: Request, res: Response) => {
    try {
      // MULTI-TENANT: Get tenant from authenticated user
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      const collectionData = insertCollectionSchema.parse(req.body);

      const collection = await storage.createCollection(tenantId, collectionData);
      res.status(201).json(collection);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: "Validation error",
          errors: error.errors,
          details: error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
        });
      }
      if (error.message && (error.message.includes('already exists') || error.message.includes('duplicate'))) {
        return res.status(409).json({ message: error.message });
      }
      console.error("Error creating collection:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Update collection
  // MULTI-TENANT: Filter by tenant
  app.put("/api/collections/:id", requireAuth, requireRole(["SuperAdmin", "WarehouseManager"]), async (req: Request, res: Response) => {
    try {
      // MULTI-TENANT: Get tenant from authenticated user
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      const { id } = req.params;

      // Check if collection exists - MULTI-TENANT
      const existingCollection = await storage.getCollectionById(tenantId, id);
      if (!existingCollection) {
        return res.status(404).json({ message: "Collection not found" });
      }

      // Validate updates with insertCollectionSchema (partial)
      const updateSchema = insertCollectionSchema.partial();
      const updates = updateSchema.parse(req.body);

      const updatedCollection = await storage.updateCollection(tenantId, id, updates);
      if (!updatedCollection) {
        return res.status(404).json({ message: "Collection not found" });
      }

      res.json(updatedCollection);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: "Validation error",
          errors: error.errors,
          details: error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
        });
      }
      if (error.message && (error.message.includes('already exists') || error.message.includes('duplicate'))) {
        return res.status(409).json({ message: error.message });
      }
      console.error("Error updating collection:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // PATCH endpoint (alias to PUT for frontend compatibility)
  // MULTI-TENANT: Filter by tenant
  app.patch("/api/collections/:id", requireAuth, requireRole(["SuperAdmin", "WarehouseManager"]), async (req: Request, res: Response) => {
    try {
      // MULTI-TENANT: Get tenant from authenticated user
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      const { id } = req.params;

      // Debug: Log incoming request body
      console.log("[PATCH /api/collections/:id] Request body:", JSON.stringify(req.body, null, 2));

      // Check if collection exists - MULTI-TENANT
      const existingCollection = await storage.getCollectionById(tenantId, id);
      if (!existingCollection) {
        return res.status(404).json({ message: "Collection not found" });
      }

      // Validate updates with insertCollectionSchema (partial)
      const updateSchema = insertCollectionSchema.partial();
      const updates = updateSchema.parse(req.body);

      const updatedCollection = await storage.updateCollection(tenantId, id, updates);
      if (!updatedCollection) {
        return res.status(404).json({ message: "Collection not found" });
      }

      res.json(updatedCollection);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        console.error("[PATCH /api/collections/:id] Zod validation error:", JSON.stringify(error.errors, null, 2));
        return res.status(400).json({
          message: "Validation error",
          errors: error.errors,
          details: error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
        });
      }
      if (error.message && (error.message.includes('already exists') || error.message.includes('duplicate'))) {
        return res.status(409).json({ message: error.message });
      }
      console.error("Error updating collection:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Delete collection
  // MULTI-TENANT: Filter by tenant
  app.delete("/api/collections/:id", requireAuth, requireRole(["SuperAdmin", "WarehouseManager"]), async (req: Request, res: Response) => {
    try {
      // MULTI-TENANT: Get tenant from authenticated user
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      const { id } = req.params;

      // Check if collection exists - MULTI-TENANT
      const collection = await storage.getCollectionById(tenantId, id);
      if (!collection) {
        return res.status(404).json({ message: "Collection not found" });
      }

      const deleted = await storage.deleteCollection(tenantId, id);
      if (!deleted) {
        return res.status(404).json({ message: "Collection not found" });
      }

      res.json({ message: "Collection deleted successfully" });
    } catch (error) {
      console.error("Error deleting collection:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get products in a collection (with optional pagination)
  // MULTI-TENANT: Filter by tenant
  app.get("/api/collections/:id/products", requireAuth, async (req: Request, res: Response) => {
    try {
      // MULTI-TENANT: Get tenant from authenticated user
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      const { id } = req.params;
      const { limit, offset } = req.query;

      // Check if collection exists - MULTI-TENANT
      const collection = await storage.getCollectionById(tenantId, id);
      if (!collection) {
        return res.status(404).json({ message: "Collection not found" });
      }

      // If pagination params provided, use paginated method - MULTI-TENANT
      if (limit !== undefined || offset !== undefined) {
        const limitNum = limit ? parseInt(limit as string, 10) : 25;
        const offsetNum = offset ? parseInt(offset as string, 10) : 0;

        const result = await storage.getCollectionProductsPaginated(tenantId, id, {
          limit: limitNum,
          offset: offsetNum,
        });

        res.json(result);
      } else {
        // Backward compatibility: return all products if no pagination params - MULTI-TENANT
        const collectionWithProducts = await storage.getCollectionWithProducts(tenantId, id);
        if (!collectionWithProducts) {
          return res.status(404).json({ message: "Collection not found" });
        }

        res.json(collectionWithProducts.products || []);
      }
    } catch (error) {
      console.error("Error fetching collection products:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Preview products for a collection based on rules (estimates only!)
  // MULTI-TENANT: Preview uses tenant-filtered products
  app.post("/api/collections/:id/preview", requireAuth, async (req: Request, res: Response) => {
    try {
      // MULTI-TENANT: Verify tenant context
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      const { id } = req.params;
      const { rules, appliedDisjunctively } = req.body;

      // Validate input
      if (!rules || !Array.isArray(rules)) {
        return res.status(400).json({ message: "Invalid rules format" });
      }

      // Import rule evaluator
      const { previewProductsForRuleSet } = await import("../ruleEvaluator");

      // Get all products WITH variants from database (for preview evaluation) - MULTI-TENANT
      const allProducts = await storage.getProductsWithVariants(tenantId);

      // Evaluate rules against products
      const result = previewProductsForRuleSet(allProducts, {
        rules,
        appliedDisjunctively: appliedDisjunctively || false,
      });

      res.json({
        totalCount: result.totalCount,
        sampleProducts: result.matchingProducts.map(p => ({
          id: p.id,
          title: p.title,
          sku: p.variants?.[0]?.sku || null,
          vendor: p.vendor,
          price: p.variants?.[0]?.price || null,
          image: p.images?.[0] || null,
        })),
        isPreview: true,
        message: "This is an estimate. Actual results will come from Shopify after sync.",
      });
    } catch (error) {
      console.error("Error previewing collection products:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Add products to collection (manual collections only)
  // MULTI-TENANT: Filter by tenant
  app.post("/api/collections/:id/products", requireAuth, requireRole(["SuperAdmin", "WarehouseManager", "Editor"]), async (req: Request, res: Response) => {
    try {
      // MULTI-TENANT: Get tenant from authenticated user
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      const { id } = req.params;
      const { productIds } = req.body;

      if (!Array.isArray(productIds) || productIds.length === 0) {
        return res.status(400).json({ message: "productIds must be a non-empty array" });
      }

      // Check if collection exists - MULTI-TENANT
      const collection = await storage.getCollectionById(tenantId, id);
      if (!collection) {
        return res.status(404).json({ message: "Collection not found" });
      }

      // Verify it's a manual collection (smart collections manage products automatically)
      if (collection.shopifyType === "smart") {
        return res.status(400).json({
          message: "Cannot manually add products to smart collections. Smart collections use rules to automatically include products.",
        });
      }

      await storage.addProductsToCollection(id, productIds);

      // Update product count
      await storage.updateCollectionProductCounts();

      res.json({ message: "Products added to collection successfully" });
    } catch (error) {
      console.error("Error adding products to collection:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Remove products from collection (manual collections only)
  // MULTI-TENANT: Filter by tenant
  app.delete("/api/collections/:id/products", requireAuth, requireRole(["SuperAdmin", "WarehouseManager", "Editor"]), async (req: Request, res: Response) => {
    try {
      // MULTI-TENANT: Get tenant from authenticated user
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      const { id } = req.params;
      const { productIds } = req.body;

      if (!Array.isArray(productIds) || productIds.length === 0) {
        return res.status(400).json({ message: "productIds must be a non-empty array" });
      }

      // Check if collection exists - MULTI-TENANT
      const collection = await storage.getCollectionById(tenantId, id);
      if (!collection) {
        return res.status(404).json({ message: "Collection not found" });
      }

      // Verify it's a manual collection (smart collections manage products automatically)
      if (collection.shopifyType === "smart") {
        return res.status(400).json({
          message: "Cannot manually remove products from smart collections. Smart collections use rules to automatically include products.",
        });
      }

      await storage.removeProductsFromCollection(id, productIds);

      // Update product count
      await storage.updateCollectionProductCounts();

      res.json({ message: "Products removed from collection successfully" });
    } catch (error) {
      console.error("Error removing products from collection:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Sync collection rules to Shopify (push local rules to Shopify)
  // MULTI-TENANT: Filter by tenant
  app.post("/api/collections/:id/sync-to-shopify", requireAuth, requireRole(["SuperAdmin", "WarehouseManager"]), async (req: Request, res: Response) => {
    try {
      // MULTI-TENANT: Get tenant from authenticated user
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      const { id } = req.params;

      // Get collection from database - MULTI-TENANT
      const collection = await storage.getCollectionById(tenantId, id);
      if (!collection) {
        return res.status(404).json({ message: "Collection not found" });
      }

      // Verify collection is synced with Shopify
      if (!collection.shopifyCollectionId) {
        return res.status(400).json({
          message: "Collection is not synced with Shopify. Please sync collections from Shopify first.",
        });
      }

      // Verify collection is a smart collection
      if (collection.shopifyType !== "smart") {
        return res.status(400).json({
          message: "Only smart collections have rules. This is a manual collection.",
        });
      }

      // Verify collection has rules
      if (!collection.rules || typeof collection.rules !== 'object') {
        return res.status(400).json({
          message: "Collection has no rules to sync",
        });
      }

      const ruleSet = collection.rules as any;
      if (!ruleSet.rules || !Array.isArray(ruleSet.rules) || ruleSet.rules.length === 0) {
        return res.status(400).json({
          message: "Collection has no rules to sync",
        });
      }

      // Sync to Shopify - MULTI-TENANT
      const { shopifyService } = await import("../shopify");
      const result = await shopifyService.updateCollectionRules(
        tenantId,
        collection.shopifyCollectionId,
        ruleSet.rules,
        ruleSet.appliedDisjunctively || false
      );

      if (!result.success) {
        return res.status(500).json({
          message: result.error || "Failed to sync rules to Shopify",
        });
      }

      // Update syncedAt timestamp - MULTI-TENANT
      await storage.updateCollection(tenantId, id, {
        syncedAt: new Date(),
      });

      res.json({
        success: true,
        message: "Collection rules successfully synced to Shopify",
        collection: {
          id: collection.id,
          name: collection.name,
          shopifyCollectionId: collection.shopifyCollectionId,
        },
      });
    } catch (error: any) {
      console.error("Error syncing collection rules to Shopify:", error);
      res.status(500).json({
        message: "Internal server error",
        error: safeErrorMessage(error),
      });
    }
  });

  // Publish a local collection to Shopify (creates new collection)
  // MULTI-TENANT: Filter by tenant
  app.post("/api/collections/:id/publish-to-shopify", requireAuth, requireRole(["SuperAdmin", "WarehouseManager"]), async (req: Request, res: Response) => {
    try {
      // MULTI-TENANT: Get tenant from authenticated user
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      const { id } = req.params;

      // Get collection from database - MULTI-TENANT
      const collection = await storage.getCollectionById(tenantId, id);
      if (!collection) {
        return res.status(404).json({ message: "Collection not found" });
      }

      // Check if already published
      if (collection.shopifyCollectionId) {
        return res.status(400).json({
          message: "Collection is already published to Shopify",
          shopifyCollectionId: collection.shopifyCollectionId,
        });
      }

      // Publish to Shopify - MULTI-TENANT
      const { shopifyService } = await import("../shopify");
      const result = await shopifyService.publishCollectionToShopify(tenantId, id);

      if (!result.success) {
        return res.status(500).json({
          message: result.error || "Failed to publish collection to Shopify",
        });
      }

      // Refresh the collection data - MULTI-TENANT
      const updatedCollection = await storage.getCollectionById(tenantId, id);

      res.json({
        success: true,
        message: `Collection "${collection.name}" successfully published to Shopify`,
        collection: updatedCollection,
        shopifyCollectionId: result.shopifyCollectionId,
      });
    } catch (error: any) {
      console.error("Error publishing collection to Shopify:", error);
      res.status(500).json({
        message: "Internal server error",
        error: safeErrorMessage(error),
      });
    }
  });

  // Get product's collections
  app.get("/api/products/:productId/collections", requireAuth, async (req: Request, res: Response) => {
    try {
      const { productId } = req.params;

      const collections = await storage.getProductCollections(productId);
      res.json(collections);
    } catch (error) {
      console.error("Error fetching product collections:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Refresh collection product counts
  app.post("/api/collections/refresh-counts", requireAuth, requireRole(["SuperAdmin", "WarehouseManager"]), async (req: Request, res: Response) => {
    try {
      await storage.updateCollectionProductCounts();
      res.json({ message: "Collection product counts refreshed successfully" });
    } catch (error) {
      console.error("Error refreshing collection product counts:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Pull collections from Shopify and sync to local database
  app.post("/api/collections/sync-from-shopify", requireAuth, requireRole(["SuperAdmin", "WarehouseManager"]), async (req: Request, res: Response) => {
    try {
      // MULTI-TENANT: Get tenant from authenticated user
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      // Get options from request body
      const { pruneOrphaned = true, dryRun = false } = req.body || {};

      const { shopifyService } = await import("../shopify");
      const result = await shopifyService.pullCollectionsFromShopify(tenantId, {
        pruneOrphaned,
        dryRun,
      });

      // No need to update counts - Shopify provides them directly in sync!

      if (result.success) {
        res.json({
          success: true,
          message: `Successfully synced ${result.syncedCount} collections from Shopify${result.deletedCount > 0 ? `, ${dryRun ? 'would delete' : 'deleted'} ${result.deletedCount} orphaned` : ''}`,
          details: {
            synced: result.syncedCount,
            created: result.createdCount,
            updated: result.updatedCount,
            deleted: result.deletedCount,
            deletedCollections: result.deletedCollections,
            dryRun,
            errors: result.errors,
          }
        });
      } else {
        res.status(500).json({
          success: false,
          message: "Failed to sync collections from Shopify",
          details: {
            synced: result.syncedCount,
            created: result.createdCount,
            updated: result.updatedCount,
            deleted: result.deletedCount,
            deletedCollections: result.deletedCollections,
            dryRun,
            errors: result.errors,
          }
        });
      }
    } catch (error) {
      console.error("Error syncing collections from Shopify:", error);
      res.status(500).json({
        success: false,
        message: safeErrorMessage(error),
      });
    }
  });
}
