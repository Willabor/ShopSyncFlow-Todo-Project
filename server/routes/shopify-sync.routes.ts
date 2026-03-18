/**
 * Shopify Sync API Routes
 *
 * Endpoints for Shopify product/collection sync, sync progress tracking,
 * sync logs/sessions/insights, sync error management, Shopify store
 * management, webhook handling, and product mapping.
 *
 * Authentication: All endpoints require authentication except webhooks
 * Authorization:
 * - SuperAdmin: Full access (stores, sync, errors, cleanup)
 * - WarehouseManager: Sync operations, error management
 * - Editor: Trigger sync and import
 * - Auditor: Read-only (sync logs/insights)
 */

import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { db } from "../db";
import { storage } from "../storage";
import { shopifyService } from "../shopify";
import { shopifyImportService } from "../services/shopify-import.service";
import { syncDebugService } from "../services/sync-debug.service";
import { safeErrorMessage } from "../utils/safe-error";
import { desc, sql } from "drizzle-orm";
import { shopifySyncLog, productSyncChangelog, insertShopifyStoreSchema } from "@shared/schema";

export function registerShopifySyncRoutes(
  app: any,
  requireAuth: (req: Request, res: Response, next: NextFunction) => void,
  requireRole: (roles: string[]) => (req: Request, res: Response, next: NextFunction) => void
) {
  // MULTI-TENANT: Helper to get tenant ID from authenticated user
  const getTenantId = (req: Request): string | null => {
    const user = req.user as any;
    return user?.tenantId ?? null;
  };

  // ============================================================================
  // Sync Progress & Unified Sync
  // ============================================================================

  // Server-Sent Events (SSE) endpoint for real-time sync progress
  app.get("/api/sync-progress/:sessionId", requireAuth, (req: Request, res: Response) => {
    const { sessionId } = req.params;

    // Set headers for SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

    // Send initial connection message
    res.write(`data: ${JSON.stringify({ type: 'connected', sessionId })}\n\n`);

    // Import progress tracker
    import('../sync-progress').then(({ SyncProgressTracker }) => {
      // Register this SSE client (also starts heartbeat to prevent HTTP/2 timeout)
      SyncProgressTracker.addSSEClient(sessionId, res);

      // Send current progress immediately if session exists
      const currentProgress = SyncProgressTracker.getProgress(sessionId);
      if (currentProgress) {
        res.write(`data: ${JSON.stringify(currentProgress)}\n\n`);
      }

      // Handle client disconnect - clean up this specific client
      req.on('close', () => {
        SyncProgressTracker.removeSSEClient(sessionId, res);
        res.end();
      });
    });
  });

  // Check for active sync session for the current tenant
  // Used by other users to discover a sync in progress and auto-connect
  app.get("/api/sync/active", requireAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      const { SyncProgressTracker } = await import("../sync-progress");
      const activeSync = SyncProgressTracker.getActiveSyncForTenant(tenantId);

      if (activeSync) {
        return res.json({
          active: true,
          sessionId: activeSync.sessionId,
          status: activeSync.progress.status,
          overallProgress: Math.round(
            (activeSync.progress.currentStep === 'done' ? 100 : 0) // simplified
          ),
        });
      }

      return res.json({ active: false });
    } catch (error) {
      return res.status(500).json({ message: "Failed to check sync status" });
    }
  });

  // Unified sync: Pull ALL data from Shopify (Products, Vendors, Collections, etc.)
  app.post("/api/sync-all-from-shopify", requireAuth, requireRole(["SuperAdmin", "WarehouseManager", "Editor"]), async (req: Request, res: Response) => {
    try {
      // MULTI-TENANT: Get tenant from authenticated user
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      console.log("🔄 Starting unified Shopify sync...");

      // Import progress tracker
      const { SyncProgressTracker } = await import("../sync-progress");

      // Check for concurrent sync - prevent multiple syncs for the same tenant
      const activeSync = SyncProgressTracker.getActiveSyncForTenant(tenantId);
      if (activeSync) {
        return res.status(409).json({
          success: false,
          message: "A sync is already in progress. Please wait for it to complete.",
          sessionId: activeSync.sessionId,
        });
      }

      // Generate unique session ID
      const sessionId = `sync-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // Initialize progress tracking and register with tenant
      SyncProgressTracker.initSession(sessionId);
      SyncProgressTracker.registerTenantSync(tenantId, sessionId);

      // Return session ID immediately so frontend can connect to SSE
      res.json({
        success: true,
        sessionId,
        message: "Sync started. Connect to /api/sync-progress/:sessionId for real-time updates",
      });

      // Continue sync in background
      (async () => {
        const unifiedResult = {
          success: true,
          products: {
            imported: 0,
            updated: 0,
            skipped: 0,
            failed: 0,
            errors: [] as Array<{ productId: string; title: string; error: string }>,
          },
          vendors: {
            created: 0,
          },
          collections: {
            synced: 0,
            created: 0,
            updated: 0,
            deleted: 0,
            errors: [] as string[],
          },
          errors: [] as string[],
        };

      // Step 1: Sync Products (and auto-create Vendors)
      console.log("📦 Step 1/3: Syncing products from Shopify...");
      SyncProgressTracker.updateProgress(sessionId, { status: 'in_progress', currentStep: 'products' });
      SyncProgressTracker.updateStep(sessionId, 'products', { status: 'in_progress' });

      try {
        const { shopifyImportService } = await import("../services/shopify-import.service");

        const productResult = await shopifyImportService.importAllProducts(tenantId, (progress) => {
          // Update progress tracker after each batch
          SyncProgressTracker.updateStep(sessionId, 'products', {
            total: progress.total,
            processed: progress.imported + progress.updated + progress.skipped + progress.failed,
            imported: progress.imported,
            updated: progress.updated,
            skipped: progress.skipped,
            failed: progress.failed,
          });

          // Update vendor creation progress in real-time
          // Use updateStepData to avoid overwriting currentStep (we're still on 'products')
          SyncProgressTracker.updateStepData(sessionId, 'vendors', {
            created: progress.vendorsCreated,
          });
        });

        unifiedResult.products.imported = productResult.progress.imported;
        unifiedResult.products.updated = productResult.progress.updated;
        unifiedResult.products.skipped = productResult.progress.skipped;
        unifiedResult.products.failed = productResult.progress.failed;
        unifiedResult.products.errors = productResult.errors;
        unifiedResult.vendors.created = productResult.progress.vendorsCreated;

        // Update progress
        SyncProgressTracker.updateStep(sessionId, 'products', {
          status: productResult.success ? 'completed' : 'failed',
          total: productResult.progress.total,
          processed: productResult.progress.imported + productResult.progress.updated + productResult.progress.skipped + productResult.progress.failed,
          imported: productResult.progress.imported,
          updated: productResult.progress.updated,
          skipped: productResult.progress.skipped,
          failed: productResult.progress.failed,
        });

        SyncProgressTracker.updateStep(sessionId, 'vendors', {
          status: 'completed',
          created: unifiedResult.vendors.created,
        });

        if (!productResult.success) {
          unifiedResult.success = false;
          unifiedResult.errors.push("Product sync completed with errors");
          productResult.errors.forEach((err: any) => {
            SyncProgressTracker.addError(sessionId, `Product: ${err.title} - ${err.error}`);
          });
        }

        console.log(`✅ Products: ${productResult.progress.imported} imported, ${productResult.progress.updated} updated, ${productResult.progress.skipped} skipped, ${productResult.progress.failed} failed`);
        console.log(`✅ Vendors: ${unifiedResult.vendors.created} new vendors created`);
      } catch (error) {
        const errorMsg = `Failed to sync products: ${error instanceof Error ? error.message : String(error)}`;
        console.error("❌ " + errorMsg);
        unifiedResult.success = false;
        unifiedResult.errors.push(errorMsg);
        SyncProgressTracker.addError(sessionId, errorMsg);
        SyncProgressTracker.updateStep(sessionId, 'products', { status: 'failed' });
      }

      // Step 2: Sync Collections
      console.log("📁 Step 2/3: Syncing collections from Shopify...");
      SyncProgressTracker.updateProgress(sessionId, { currentStep: 'collections' });
      SyncProgressTracker.updateStep(sessionId, 'collections', { status: 'in_progress' });

      try {
        const { shopifyService } = await import("../shopify");
        const collectionResult = await shopifyService.pullCollectionsFromShopify(tenantId, {
          onProgress: (progress) => {
            // Update progress tracker after each collection
            SyncProgressTracker.updateStep(sessionId, 'collections', {
              total: progress.total,
              processed: progress.processed,
              synced: progress.synced,
              created: progress.created,
              updated: progress.updated,
            });
          },
          pruneOrphaned: true,  // Delete orphaned collections during unified sync
          dryRun: false,
        });

        unifiedResult.collections.synced = collectionResult.syncedCount;
        unifiedResult.collections.created = collectionResult.createdCount;
        unifiedResult.collections.updated = collectionResult.updatedCount;
        unifiedResult.collections.deleted = collectionResult.deletedCount;
        unifiedResult.collections.errors = collectionResult.errors;

        // Update final status
        SyncProgressTracker.updateStep(sessionId, 'collections', {
          status: collectionResult.success ? 'completed' : 'failed',
          total: collectionResult.syncedCount,
          processed: collectionResult.syncedCount,
          synced: collectionResult.syncedCount,
          created: collectionResult.createdCount,
          updated: collectionResult.updatedCount,
          deleted: collectionResult.deletedCount,
        });

        if (!collectionResult.success) {
          unifiedResult.success = false;
          unifiedResult.errors.push("Collection sync completed with errors");
          collectionResult.errors.forEach((err: string) => {
            SyncProgressTracker.addError(sessionId, err);
          });
        }

        console.log(`✅ Collections: ${collectionResult.syncedCount} synced (${collectionResult.createdCount} created, ${collectionResult.updatedCount} updated, ${collectionResult.deletedCount} deleted)`);
      } catch (error) {
        const errorMsg = `Failed to sync collections: ${error instanceof Error ? error.message : String(error)}`;
        console.error("❌ " + errorMsg);
        unifiedResult.success = false;
        unifiedResult.errors.push(errorMsg);
        SyncProgressTracker.addError(sessionId, errorMsg);
        SyncProgressTracker.updateStep(sessionId, 'collections', { status: 'failed' });
      }

      // ✅ No need for Step 3 - Shopify provides product counts directly during collection sync!
      console.log("✅ Collection product counts already set from Shopify data");

      // DEBUG: Check if we reach Step 3
      console.log("🔍 DEBUG: About to start Step 3 - File Sizes Backfill");
      console.log("🔍 DEBUG: sessionId =", sessionId);
      console.log("🔍 DEBUG: Current timestamp =", new Date().toISOString());

      // Step 3: Backfill File Sizes
      console.log("📏 Step 3/3: Backfilling file sizes from CDN...");
      SyncProgressTracker.updateProgress(sessionId, { currentStep: 'fileSizes' });
      SyncProgressTracker.updateStep(sessionId, 'fileSizes', { status: 'in_progress' });

      let fileSizesResult = {
        updated: 0,
        failed: 0,
        skipped: 0,
      };

      try {
        const { backfillFileSizes } = await import("../services/file-size-backfill.service");

        const backfillResult = await backfillFileSizes((progress) => {
          // Update progress tracker after each file
          SyncProgressTracker.updateStep(sessionId, 'fileSizes', {
            total: progress.total,
            processed: progress.processed,
            updated: progress.updated,
            failed: progress.failed,
            skipped: progress.skipped,
          });
        });

        fileSizesResult.updated = backfillResult.progress.updated;
        fileSizesResult.failed = backfillResult.progress.failed;
        fileSizesResult.skipped = backfillResult.progress.skipped;

        // Update final status
        SyncProgressTracker.updateStep(sessionId, 'fileSizes', {
          status: backfillResult.success ? 'completed' : 'failed',
          total: backfillResult.progress.total,
          processed: backfillResult.progress.processed,
          updated: backfillResult.progress.updated,
          failed: backfillResult.progress.failed,
          skipped: backfillResult.progress.skipped,
        });

        if (!backfillResult.success) {
          unifiedResult.success = false;
          unifiedResult.errors.push("File size backfill completed with errors");
          backfillResult.errors.forEach((err: string) => {
            SyncProgressTracker.addError(sessionId, err);
          });
        }

        console.log(`✅ File Sizes: ${backfillResult.progress.updated} updated, ${backfillResult.progress.failed} failed, ${backfillResult.progress.skipped} skipped`);
      } catch (error) {
        const errorMsg = `Failed to backfill file sizes: ${error instanceof Error ? error.message : String(error)}`;
        console.error("❌ " + errorMsg);
        unifiedResult.success = false;
        unifiedResult.errors.push(errorMsg);
        SyncProgressTracker.addError(sessionId, errorMsg);
        SyncProgressTracker.updateStep(sessionId, 'fileSizes', { status: 'failed' });
      }

      // Step 4: Sync Navigation Menus
      console.log("🧭 Step 4/5: Syncing navigation menus from Shopify...");
      SyncProgressTracker.updateProgress(sessionId, { currentStep: 'navigation' });
      SyncProgressTracker.updateStep(sessionId, 'navigation', { status: 'in_progress' });

      let navigationResult = {
        menus: 0,
        items: 0,
        collectionLinks: 0,
      };

      try {
        const { shopifyService } = await import("../shopify");
        // MULTI-TENANT: Using tenantId from route scope

        const navResult = await shopifyService.pullNavigationMenusFromShopify(tenantId, (progress) => {
          SyncProgressTracker.updateStep(sessionId, 'navigation', {
            menus: progress.processed,
          });
        });

        navigationResult.menus = navResult.menusCount;
        navigationResult.items = navResult.itemsCount;
        navigationResult.collectionLinks = navResult.collectionItemsCount;

        SyncProgressTracker.updateStep(sessionId, 'navigation', {
          status: navResult.success ? 'completed' : 'failed',
          menus: navResult.menusCount,
          items: navResult.itemsCount,
          collectionLinks: navResult.collectionItemsCount,
        });

        if (!navResult.success) {
          navResult.errors.forEach((err: string) => {
            SyncProgressTracker.addError(sessionId, `Navigation: ${err}`);
          });
        }

        console.log(`✅ Navigation: ${navResult.menusCount} menus, ${navResult.itemsCount} items, ${navResult.collectionItemsCount} collection links`);
      } catch (error) {
        const errorMsg = `Failed to sync navigation: ${error instanceof Error ? error.message : String(error)}`;
        console.error("❌ " + errorMsg);
        SyncProgressTracker.addError(sessionId, errorMsg);
        SyncProgressTracker.updateStep(sessionId, 'navigation', { status: 'failed' });
      }

      // Step 5: Run Health Check
      console.log("🏥 Step 5/5: Running collection health check...");
      SyncProgressTracker.updateProgress(sessionId, { currentStep: 'health' });
      SyncProgressTracker.updateStep(sessionId, 'health', { status: 'in_progress' });

      let healthResult = {
        issuesFound: 0,
        duplicates: 0,
        navConflicts: 0,
      };

      try {
        const { runHealthCheck } = await import("../health");
        // MULTI-TENANT: Using tenantId from route scope

        const checkResult = await runHealthCheck({ tenantId });

        healthResult.issuesFound = checkResult.issueCount;
        healthResult.duplicates = checkResult.summary.duplicateCount;
        healthResult.navConflicts = checkResult.summary.conflictCount;

        SyncProgressTracker.updateStep(sessionId, 'health', {
          status: 'completed',
          issuesFound: checkResult.issueCount,
          duplicates: checkResult.summary.duplicateCount,
          navConflicts: checkResult.summary.conflictCount,
        });

        console.log(`✅ Health Check: ${checkResult.issueCount} issues found (${checkResult.summary.duplicateCount} duplicates, ${checkResult.summary.conflictCount} nav conflicts)`);
      } catch (error) {
        const errorMsg = `Failed to run health check: ${error instanceof Error ? error.message : String(error)}`;
        console.error("❌ " + errorMsg);
        SyncProgressTracker.addError(sessionId, errorMsg);
        SyncProgressTracker.updateStep(sessionId, 'health', { status: 'failed' });
      }

      // Mark sync as complete
      const totalErrors = unifiedResult.products.errors.length + unifiedResult.collections.errors.length + unifiedResult.errors.length;

      console.log("🎉 Unified sync complete!");
      console.log(`   Products: ${unifiedResult.products.imported} imported, ${unifiedResult.products.updated} updated, ${unifiedResult.products.skipped} skipped, ${unifiedResult.products.failed} failed`);
      console.log(`   Vendors: ${unifiedResult.vendors.created} created`);
      console.log(`   Collections: ${unifiedResult.collections.synced} synced`);
      console.log(`   File Sizes: ${fileSizesResult.updated} updated, ${fileSizesResult.failed} failed, ${fileSizesResult.skipped} skipped`);
      console.log(`   Navigation: ${navigationResult.menus} menus, ${navigationResult.items} items, ${navigationResult.collectionLinks} collection links`);
      console.log(`   Health: ${healthResult.issuesFound} issues (${healthResult.duplicates} duplicates, ${healthResult.navConflicts} nav conflicts)`);
      console.log(`   Total errors: ${totalErrors}`);

      // Complete progress tracking and unregister tenant sync
      SyncProgressTracker.completeSync(sessionId, unifiedResult.success);
      SyncProgressTracker.unregisterTenantSync(tenantId);
      })(); // Close async IIFE

    } catch (error) {
      console.error("❌ Fatal error during unified sync:", error);
      res.status(500).json({
        success: false,
        message: safeErrorMessage(error),
      });
    }
  });

  // ============================================================================
  // Shopify Store Management
  // ============================================================================

  // Get Shopify stores (SuperAdmin only) - redact access tokens - MULTI-TENANT
  app.get("/api/shopify/stores", requireAuth, requireRole(["SuperAdmin"]), async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "Tenant context required" });
      }

      const stores = await storage.getShopifyStores(tenantId);
      const safeStores = stores.map(store => ({
        ...store,
        accessToken: "[REDACTED]"
      }));
      res.json(safeStores);
    } catch (error) {
      console.error("Error fetching Shopify stores:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Create Shopify store (SuperAdmin only) - redact access token - MULTI-TENANT
  app.post("/api/shopify/stores", requireAuth, requireRole(["SuperAdmin"]), async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "Tenant context required" });
      }

      const storeData = insertShopifyStoreSchema.parse(req.body);
      const store = await storage.createShopifyStore(tenantId, storeData);
      const safeStore = { ...store, accessToken: "[REDACTED]" };
      res.status(201).json(safeStore);
    } catch (error) {
      console.error("Error creating Shopify store:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Update Shopify store (SuperAdmin only) - redact access token - MULTI-TENANT
  app.patch("/api/shopify/stores/:id", requireAuth, requireRole(["SuperAdmin"]), async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "Tenant context required" });
      }

      const updates = z.object({
        name: z.string().optional(),
        isActive: z.boolean().optional(),
        webhookSecret: z.string().optional(),
      }).parse(req.body);

      const updatedStore = await storage.updateShopifyStore(tenantId, req.params.id, updates);
      if (!updatedStore) {
        return res.status(404).json({ message: "Shopify store not found" });
      }

      const safeStore = { ...updatedStore, accessToken: "[REDACTED]" };
      res.json(safeStore);
    } catch (error) {
      console.error("Error updating Shopify store:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ============================================================================
  // Shopify Product Import
  // ============================================================================

  // Import products from Shopify
  app.post("/api/shopify/import-products", requireAuth, requireRole(["SuperAdmin", "WarehouseManager", "Editor"]), async (req: Request, res: Response) => {
    try {
      // MULTI-TENANT: Get tenant from authenticated user
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      console.log("Starting Shopify product import...");

      // Run the import
      const result = await shopifyImportService.importAllProducts(tenantId);

      if (!result.success) {
        return res.status(500).json({
          success: false,
          message: "Import completed with errors",
          progress: result.progress,
          errors: result.errors,
        });
      }

      res.json({
        success: true,
        message: `Successfully imported ${result.progress.imported} products`,
        progress: result.progress,
        products: result.products,
        errors: result.errors,
      });
    } catch (error: any) {
      console.error("Error importing products from Shopify:", error);
      res.status(500).json({
        success: false,
        message: "Failed to import products from Shopify",
        error: safeErrorMessage(error),
      });
    }
  });

  // ============================================================================
  // Sync Changelog, Sessions & Insights
  // ============================================================================

  // Get sync changelog (field-level changes from syncs)
  app.get("/api/sync-changelog", requireAuth, requireRole(["SuperAdmin", "WarehouseManager"]), async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      const {
        dateFrom,
        dateTo,
        field,
        product,
        changeType,
        syncLogId,
        limit = "50",
        offset = "0",
      } = req.query;

      // Build filters
      const filters: any = {};
      if (dateFrom) filters.dateFrom = new Date(dateFrom as string);
      if (dateTo) filters.dateTo = new Date(dateTo as string);
      if (field && field !== "all") filters.field = field as string;
      if (product) filters.productSearch = product as string;
      if (changeType && changeType !== "all") filters.changeType = changeType as string;
      if (syncLogId) filters.syncLogId = syncLogId as string;

      const changelog = await syncDebugService.getChangelog(
        tenantId,
        filters,
        parseInt(limit as string),
        parseInt(offset as string)
      );

      const total = await syncDebugService.getChangelogCount(tenantId, filters);

      res.json({
        changelog,
        total,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
        hasMore: parseInt(offset as string) + changelog.length < total,
      });
    } catch (error: any) {
      console.error("Error fetching sync changelog:", error);
      res.status(500).json({ message: "Failed to fetch sync changelog", error: safeErrorMessage(error) });
    }
  });

  // Get sync sessions list with totals
  app.get("/api/sync-sessions", requireAuth, requireRole(["SuperAdmin", "WarehouseManager"]), async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      const { limit = "20", offset = "0" } = req.query;

      // Use raw SQL for UUID comparison (schema uses varchar but db uses uuid)
      const sessions = await db
        .select({
          id: shopifySyncLog.id,
          syncType: shopifySyncLog.syncType,
          status: shopifySyncLog.status,
          productsProcessed: shopifySyncLog.productsProcessed,
          productsCreated: shopifySyncLog.productsCreated,
          productsUpdated: shopifySyncLog.productsUpdated,
          errorCount: shopifySyncLog.errorCount,
          duration: shopifySyncLog.duration,
          startedAt: shopifySyncLog.startedAt,
          completedAt: shopifySyncLog.completedAt,
          createdAt: shopifySyncLog.createdAt,
        })
        .from(shopifySyncLog)
        .where(sql`${shopifySyncLog.tenantId}::text = ${tenantId}`)
        .orderBy(desc(shopifySyncLog.createdAt))
        .limit(parseInt(limit as string))
        .offset(parseInt(offset as string));

      // Get total count
      const countResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(shopifySyncLog)
        .where(sql`${shopifySyncLog.tenantId}::text = ${tenantId}`);

      const total = countResult[0]?.count || 0;

      res.json({
        sessions,
        total,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
        hasMore: parseInt(offset as string) + sessions.length < total,
      });
    } catch (error: any) {
      console.error("Error fetching sync sessions:", error);
      res.status(500).json({ message: "Failed to fetch sync sessions", error: safeErrorMessage(error) });
    }
  });

  // Get insights for a specific sync session (field breakdown)
  app.get("/api/sync-sessions/:id/insights", requireAuth, requireRole(["SuperAdmin", "WarehouseManager"]), async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      const { id } = req.params;

      // Get field breakdown for this sync session (use raw SQL for UUID comparison)
      const fieldBreakdown = await db
        .select({
          field: productSyncChangelog.field,
          count: sql<number>`count(*)`,
        })
        .from(productSyncChangelog)
        .where(sql`${productSyncChangelog.tenantId}::text = ${tenantId} AND ${productSyncChangelog.syncLogId} = ${id}`)
        .groupBy(productSyncChangelog.field)
        .orderBy(desc(sql`count(*)`));

      // Get total changes for this sync
      const totalResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(productSyncChangelog)
        .where(sql`${productSyncChangelog.tenantId}::text = ${tenantId} AND ${productSyncChangelog.syncLogId} = ${id}`);

      // Get unique products affected
      const productsResult = await db
        .select({ count: sql<number>`count(distinct product_id)` })
        .from(productSyncChangelog)
        .where(sql`${productSyncChangelog.tenantId}::text = ${tenantId} AND ${productSyncChangelog.syncLogId} = ${id}`);

      // Get the sync session details
      const session = await db
        .select()
        .from(shopifySyncLog)
        .where(sql`${shopifySyncLog.tenantId}::text = ${tenantId} AND ${shopifySyncLog.id} = ${id}`)
        .limit(1);

      res.json({
        session: session[0] || null,
        fieldBreakdown,
        totalChanges: totalResult[0]?.count || 0,
        productsAffected: productsResult[0]?.count || 0,
      });
    } catch (error: any) {
      console.error("Error fetching sync insights:", error);
      res.status(500).json({ message: "Failed to fetch sync insights", error: safeErrorMessage(error) });
    }
  });

  // Get aggregate sync insights (all-time or date-range)
  app.get("/api/sync-insights", requireAuth, requireRole(["SuperAdmin", "WarehouseManager"]), async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      const { days = "30" } = req.query;
      const daysNum = parseInt(days as string);
      const dateFrom = new Date();
      dateFrom.setDate(dateFrom.getDate() - daysNum);

      // Get aggregate field breakdown (use raw SQL for UUID comparison)
      const fieldBreakdown = await db
        .select({
          field: productSyncChangelog.field,
          count: sql<number>`count(*)`,
        })
        .from(productSyncChangelog)
        .where(sql`${productSyncChangelog.tenantId}::text = ${tenantId} AND ${productSyncChangelog.createdAt} >= ${dateFrom}`)
        .groupBy(productSyncChangelog.field)
        .orderBy(desc(sql`count(*)`));

      // Get total syncs in period
      const syncsResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(shopifySyncLog)
        .where(sql`${shopifySyncLog.tenantId}::text = ${tenantId} AND ${shopifySyncLog.createdAt} >= ${dateFrom}`);

      // Get total changes in period
      const changesResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(productSyncChangelog)
        .where(sql`${productSyncChangelog.tenantId}::text = ${tenantId} AND ${productSyncChangelog.createdAt} >= ${dateFrom}`);

      // Get average duration
      const avgDuration = await db
        .select({ avg: sql<number>`avg(duration)` })
        .from(shopifySyncLog)
        .where(sql`${shopifySyncLog.tenantId}::text = ${tenantId} AND ${shopifySyncLog.createdAt} >= ${dateFrom} AND ${shopifySyncLog.status} = 'SUCCESS'`);

      // Get latest sync
      const latestSync = await db
        .select()
        .from(shopifySyncLog)
        .where(sql`${shopifySyncLog.tenantId}::text = ${tenantId}`)
        .orderBy(desc(shopifySyncLog.createdAt))
        .limit(1);

      res.json({
        period: daysNum,
        fieldBreakdown,
        totalSyncs: syncsResult[0]?.count || 0,
        totalChanges: changesResult[0]?.count || 0,
        averageDuration: Math.round(avgDuration[0]?.avg || 0),
        latestSync: latestSync[0] || null,
      });
    } catch (error: any) {
      console.error("Error fetching sync insights:", error);
      res.status(500).json({ message: "Failed to fetch sync insights", error: safeErrorMessage(error) });
    }
  });

  // ============================================================================
  // Shopify Connection & Product Mapping
  // ============================================================================

  // Test Shopify connection
  app.get("/api/shopify/test-connection", requireAuth, requireRole(["SuperAdmin", "WarehouseManager"]), async (req: Request, res: Response) => {
    try {
      const connected = await shopifyImportService.testConnection();
      if (connected) {
        res.json({ success: true, message: "Shopify connection successful" });
      } else {
        res.status(500).json({ success: false, message: "Failed to connect to Shopify" });
      }
    } catch (error: any) {
      console.error("Error testing Shopify connection:", error);
      res.status(500).json({ success: false, message: safeErrorMessage(error) });
    }
  });

  // Get product Shopify mapping
  // MULTI-TENANT: Added tenant isolation
  app.get("/api/products/:id/shopify", requireAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      const mapping = await storage.getShopifyProductMapping(tenantId, req.params.id);
      if (!mapping) {
        return res.status(404).json({ message: "Product not published to Shopify" });
      }
      res.json(mapping);
    } catch (error) {
      console.error("Error fetching product Shopify mapping:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ============================================================================
  // Shopify Webhooks
  // ============================================================================

  // Shopify webhook handler with HMAC verification
  app.post("/api/shopify/webhooks", async (req: Request, res: Response) => {
    try {
      const topic = req.headers["x-shopify-topic"] as string;
      const shop = req.headers["x-shopify-shop-domain"] as string;
      const signature = req.headers["x-shopify-hmac-sha256"] as string;

      if (!topic || !shop) {
        return res.status(400).json({ message: "Missing required headers" });
      }

      // Get the store by domain to validate webhook secret
      const store = await storage.getShopifyStoreByDomain(shop);
      if (!store || !store.webhookSecret) {
        return res.status(401).json({ message: "Webhook secret not configured" });
      }

      // Verify webhook signature using raw body captured by verify middleware
      const rawBody = (req as any).rawBody;
      if (!rawBody || !shopifyService.verifyWebhookSignature(rawBody, signature, store.webhookSecret)) {
        return res.status(401).json({ message: "Invalid webhook signature" });
      }

      await shopifyService.handleWebhook(topic, shop, req.body);
      res.status(200).json({ message: "Webhook processed" });
    } catch (error) {
      console.error("Error processing Shopify webhook:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ============================================================================
  // Sync Debug Routes (Error Tracking and Debugging)
  // ============================================================================

  // Get sync logs with pagination
  app.get("/api/sync/logs", requireAuth, requireRole(["SuperAdmin", "WarehouseManager"]), async (req: Request, res: Response) => {
    try {
      const { syncDebugService } = await import("../services/sync-debug.service");
      const limit = parseInt(req.query.limit as string) || 20;
      const offset = parseInt(req.query.offset as string) || 0;

      const result = await syncDebugService.getSyncLogs(limit, offset);

      res.json({
        success: true,
        logs: result.logs,
        total: result.total,
        limit,
        offset,
      });
    } catch (error: any) {
      console.error("Error fetching sync logs:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch sync logs",
        error: safeErrorMessage(error),
      });
    }
  });

  // Get a specific sync log with its errors
  app.get("/api/sync/logs/:id", requireAuth, requireRole(["SuperAdmin", "WarehouseManager"]), async (req: Request, res: Response) => {
    try {
      const { syncDebugService } = await import("../services/sync-debug.service");
      const { id } = req.params;

      const result = await syncDebugService.getSyncLogWithErrors(id);

      if (!result.log) {
        return res.status(404).json({
          success: false,
          message: "Sync log not found",
        });
      }

      res.json({
        success: true,
        log: result.log,
        errors: result.errors,
      });
    } catch (error: any) {
      console.error("Error fetching sync log:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch sync log",
        error: safeErrorMessage(error),
      });
    }
  });

  // Get sync errors with filtering and pagination
  app.get("/api/sync/errors", requireAuth, requireRole(["SuperAdmin", "WarehouseManager"]), async (req: Request, res: Response) => {
    try {
      const { syncDebugService } = await import("../services/sync-debug.service");

      const filters: any = {};
      if (req.query.syncLogId) filters.syncLogId = req.query.syncLogId as string;
      if (req.query.errorType) filters.errorType = req.query.errorType as string;
      if (req.query.status) filters.status = req.query.status as string;
      if (req.query.operation) filters.operation = req.query.operation as string;
      if (req.query.shopifyProductId) filters.shopifyProductId = req.query.shopifyProductId as string;
      if (req.query.search) filters.searchQuery = req.query.search as string;
      if (req.query.startDate) filters.startDate = new Date(req.query.startDate as string);
      if (req.query.endDate) filters.endDate = new Date(req.query.endDate as string);

      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;

      const result = await syncDebugService.getErrors(filters, limit, offset);

      res.json({
        success: true,
        errors: result.errors,
        total: result.total,
        filters,
        limit,
        offset,
      });
    } catch (error: any) {
      console.error("Error fetching sync errors:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch sync errors",
        error: safeErrorMessage(error),
      });
    }
  });

  // Get sync error statistics
  app.get("/api/sync/errors/stats", requireAuth, requireRole(["SuperAdmin", "WarehouseManager"]), async (req: Request, res: Response) => {
    try {
      const { syncDebugService } = await import("../services/sync-debug.service");
      const syncLogId = req.query.syncLogId as string | undefined;

      const stats = await syncDebugService.getStats(syncLogId);

      res.json({
        success: true,
        stats,
      });
    } catch (error: any) {
      console.error("Error fetching sync error stats:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch sync error stats",
        error: safeErrorMessage(error),
      });
    }
  });

  // Get errors for a specific product
  app.get("/api/sync/errors/product/:shopifyProductId", requireAuth, requireRole(["SuperAdmin", "WarehouseManager"]), async (req: Request, res: Response) => {
    try {
      const { syncDebugService } = await import("../services/sync-debug.service");
      const { shopifyProductId } = req.params;
      const limit = parseInt(req.query.limit as string) || 20;

      const errors = await syncDebugService.getProductErrors(shopifyProductId, limit);

      res.json({
        success: true,
        shopifyProductId,
        errors,
      });
    } catch (error: any) {
      console.error("Error fetching product errors:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch product errors",
        error: safeErrorMessage(error),
      });
    }
  });

  // Resolve a sync error
  app.post("/api/sync/errors/:id/resolve", requireAuth, requireRole(["SuperAdmin", "WarehouseManager"]), async (req: Request, res: Response) => {
    try {
      const { syncDebugService } = await import("../services/sync-debug.service");
      const { id } = req.params;
      const { resolution } = req.body;

      if (!resolution) {
        return res.status(400).json({
          success: false,
          message: "Resolution is required",
        });
      }

      const user = req.user as any;
      const updated = await syncDebugService.resolveError(id, resolution, user?.username);

      if (!updated) {
        return res.status(404).json({
          success: false,
          message: "Error not found",
        });
      }

      res.json({
        success: true,
        message: "Error resolved",
        error: updated,
      });
    } catch (error: any) {
      console.error("Error resolving sync error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to resolve error",
        error: safeErrorMessage(error),
      });
    }
  });

  // Ignore a sync error
  app.post("/api/sync/errors/:id/ignore", requireAuth, requireRole(["SuperAdmin", "WarehouseManager"]), async (req: Request, res: Response) => {
    try {
      const { syncDebugService } = await import("../services/sync-debug.service");
      const { id } = req.params;
      const { resolution } = req.body;

      const user = req.user as any;
      const updated = await syncDebugService.ignoreError(id, resolution || "Manually ignored", user?.username);

      if (!updated) {
        return res.status(404).json({
          success: false,
          message: "Error not found",
        });
      }

      res.json({
        success: true,
        message: "Error ignored",
        error: updated,
      });
    } catch (error: any) {
      console.error("Error ignoring sync error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to ignore error",
        error: safeErrorMessage(error),
      });
    }
  });

  // Bulk resolve errors
  app.post("/api/sync/errors/bulk-resolve", requireAuth, requireRole(["SuperAdmin", "WarehouseManager"]), async (req: Request, res: Response) => {
    try {
      const { syncDebugService } = await import("../services/sync-debug.service");
      const { errorIds, resolution } = req.body;

      if (!errorIds || !Array.isArray(errorIds) || errorIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: "errorIds array is required",
        });
      }

      if (!resolution) {
        return res.status(400).json({
          success: false,
          message: "Resolution is required",
        });
      }

      const user = req.user as any;
      const count = await syncDebugService.bulkResolve(errorIds, resolution, user?.username);

      res.json({
        success: true,
        message: `Resolved ${count} errors`,
        count,
      });
    } catch (error: any) {
      console.error("Error bulk resolving sync errors:", error);
      res.status(500).json({
        success: false,
        message: "Failed to bulk resolve errors",
        error: safeErrorMessage(error),
      });
    }
  });

  // Cleanup old resolved/ignored errors
  app.post("/api/sync/errors/cleanup", requireAuth, requireRole(["SuperAdmin"]), async (req: Request, res: Response) => {
    try {
      const { syncDebugService } = await import("../services/sync-debug.service");
      const olderThanDays = parseInt(req.body.olderThanDays) || 30;

      const count = await syncDebugService.cleanupOldErrors(olderThanDays);

      res.json({
        success: true,
        message: `Cleaned up errors older than ${olderThanDays} days`,
        count,
      });
    } catch (error: any) {
      console.error("Error cleaning up sync errors:", error);
      res.status(500).json({
        success: false,
        message: "Failed to cleanup errors",
        error: safeErrorMessage(error),
      });
    }
  });

  // Get retryable errors for a sync log
  app.get("/api/sync/logs/:id/retryable", requireAuth, requireRole(["SuperAdmin", "WarehouseManager"]), async (req: Request, res: Response) => {
    try {
      const { syncDebugService } = await import("../services/sync-debug.service");
      const { id } = req.params;

      const errors = await syncDebugService.getRetryableErrors(id);

      res.json({
        success: true,
        syncLogId: id,
        retryableErrors: errors,
        count: errors.length,
      });
    } catch (error: any) {
      console.error("Error fetching retryable errors:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch retryable errors",
        error: safeErrorMessage(error),
      });
    }
  });
}
