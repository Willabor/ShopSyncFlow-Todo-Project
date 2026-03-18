import { Express, Request, Response } from "express";
import { storage } from "../storage.js";
import { shopifyService } from "../shopify.js";
import { shopifyPublishService } from "../services/shopify-publish.service.js";
import { shopifyImportService } from "../services/shopify-import.service.js";
import * as handleUtils from "../utils/handleGenerator.js";
import { safeErrorMessage } from "../utils/safe-error.js";

export function registerHandleRoutes(
  app: Express,
  requireAuth: any,
  requireRole: (roles: string[]) => any
) {
  function getTenantId(req: Request): string | null {
    return (req.user as any)?.tenantId || null;
  }

  // ============================================================
  // Shopify Integration Endpoints
  // MULTI-TENANT: All Shopify operations verify product belongs to tenant
  // ============================================================

  // Publish product to Shopify
  // MULTI-TENANT: Verify product belongs to tenant before publishing
  app.post("/api/products/:id/publish-to-shopify", requireAuth, requireRole(["SuperAdmin", "WarehouseManager", "Editor"]), async (req: Request, res: Response) => {
    try {
      // MULTI-TENANT: Verify product belongs to tenant
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      const { publishAsActive = false } = req.body;
      const productId = req.params.id;

      // Get local product - MULTI-TENANT: Filter by tenant
      const product = await storage.getProduct(tenantId, productId);
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }

      // Check if already published - if so, UPDATE instead of CREATE
      // Note: If product has shopifyProductId (even if status is "failed"), we should UPDATE not CREATE
      const isUpdate = !!(product.shopifyProductId);

      // Update status to "publishing" - MULTI-TENANT
      await storage.updateProduct(tenantId, productId, {
        publishStatus: "publishing",
        publishError: null,
      });

      try {
        let shopifyProductId: string;
        let shopifyAdminUrl: string;

        if (isUpdate) {
          // UPDATE existing Shopify product
          console.log(`Updating existing Shopify product: ${product.shopifyProductId}`);
          try {
            const updateResult = await shopifyPublishService.updateProduct(
              product,
              publishAsActive
            );
            shopifyProductId = updateResult.shopifyProductId;
            shopifyAdminUrl = updateResult.shopifyAdminUrl;
          } catch (updateError: any) {
            // If Shopify returns 404, product was deleted externally - clear IDs and create fresh
            if (updateError.message?.includes('404') || updateError.message?.includes('Not Found')) {
              console.log(`Shopify product not found (deleted externally). Clearing IDs and creating fresh.`);
              // Clear stale Shopify IDs
              await storage.updateProduct(tenantId, productId, {
                shopifyProductId: null,
                shopifyCategorySyncedAt: null,
              });
              // Clear variant Shopify IDs
              const variants = await storage.getProductVariants(productId);
              for (const v of variants) {
                if (v.shopifyVariantId) {
                  await storage.updateProductVariant(v.id, { shopifyVariantId: null });
                }
              }
              // Re-fetch product with cleared IDs and create fresh
              const freshProduct = await storage.getProduct(tenantId, productId);
              if (!freshProduct) throw new Error("Product not found after clearing Shopify IDs");
              const createResult = await shopifyPublishService.publishProduct(
                freshProduct,
                publishAsActive
              );
              shopifyProductId = createResult.shopifyProductId;
              shopifyAdminUrl = createResult.shopifyAdminUrl;
            } else {
              throw updateError;
            }
          }
        } else {
          // CREATE new Shopify product
          console.log(`Creating new Shopify product for: ${product.title}`);
          const createResult = await shopifyPublishService.publishProduct(
            product,
            publishAsActive
          );
          shopifyProductId = createResult.shopifyProductId;
          shopifyAdminUrl = createResult.shopifyAdminUrl;
        }

        // Update product with Shopify link - MULTI-TENANT
        const updatedProduct = await storage.updateProduct(tenantId, productId, {
          shopifyProductId,
          publishedAt: new Date(),
          publishStatus: "published",
          status: publishAsActive ? "active" : "draft",
        });

        res.json({
          success: true,
          product: updatedProduct,
          shopifyProductId,
          shopifyAdminUrl,
          message: isUpdate
            ? `Product updated on Shopify as ${publishAsActive ? 'active' : 'draft'}`
            : `Product published to Shopify as ${publishAsActive ? 'active' : 'draft'}`,
          isUpdate,
        });
      } catch (publishError: any) {
        // Update status to "failed" with error message - MULTI-TENANT
        await storage.updateProduct(tenantId, productId, {
          publishStatus: "failed",
          publishError: publishError.message,
        });

        throw publishError;
      }
    } catch (error: any) {
      console.error("Error publishing product to Shopify:", error);
      res.status(500).json({
        message: "Failed to publish product to Shopify",
        error: safeErrorMessage(error),
      });
    }
  });

  // Sync single variant to Shopify
  // MULTI-TENANT: Verify product belongs to tenant before syncing
  app.post("/api/products/:id/variants/:variantId/sync-to-shopify", requireAuth, requireRole(["SuperAdmin", "WarehouseManager", "Editor"]), async (req: Request, res: Response) => {
    try {
      // MULTI-TENANT: Verify product belongs to tenant
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      const { id: productId, variantId } = req.params;

      // Get product to verify it's published - MULTI-TENANT: Filter by tenant
      const product = await storage.getProduct(tenantId, productId);
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }

      if (!product.shopifyProductId) {
        return res.status(400).json({
          message: "Product not published to Shopify. Publish product first before syncing variants.",
        });
      }

      // Sync variant to Shopify
      const result = await shopifyPublishService.syncVariantToShopify(productId, variantId);

      if (result.success) {
        res.json({
          success: true,
          message: result.message,
        });
      } else {
        res.status(500).json({
          success: false,
          message: result.message,
        });
      }
    } catch (error: any) {
      console.error("Error syncing variant to Shopify:", error);
      res.status(500).json({
        message: "Failed to sync variant to Shopify",
        error: safeErrorMessage(error),
      });
    }
  });

  // Sync all variants for a product to Shopify
  // MULTI-TENANT: Verify product belongs to tenant before syncing
  app.post("/api/products/:id/variants/sync-to-shopify", requireAuth, requireRole(["SuperAdmin", "WarehouseManager", "Editor"]), async (req: Request, res: Response) => {
    try {
      // MULTI-TENANT: Verify product belongs to tenant
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      const { id: productId } = req.params;

      // Get product to verify it's published - MULTI-TENANT: Filter by tenant
      const product = await storage.getProduct(tenantId, productId);
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }

      if (!product.shopifyProductId) {
        return res.status(400).json({
          message: "Product not published to Shopify. Publish product first before syncing variants.",
        });
      }

      // Sync all variants to Shopify
      const result = await shopifyPublishService.syncAllVariantsToShopify(productId);

      res.json({
        success: result.success,
        synced: result.synced,
        failed: result.failed,
        errors: result.errors,
        message: result.success
          ? `Successfully synced ${result.synced} variant(s) to Shopify`
          : `Synced ${result.synced} variant(s), ${result.failed} failed`,
      });
    } catch (error: any) {
      console.error("Error syncing variants to Shopify:", error);
      res.status(500).json({
        message: "Failed to sync variants to Shopify",
        error: safeErrorMessage(error),
      });
    }
  });

  // ============================================================
  // Product Handle Management Routes
  // MULTI-TENANT: All handle operations verify product belongs to tenant
  // ============================================================

  // Generate handle from product title
  // MULTI-TENANT: Verify product belongs to tenant before generating
  app.post("/api/products/:id/handle/generate", requireAuth, requireRole(["SuperAdmin", "WarehouseManager", "Editor"]), async (req: Request, res: Response) => {
    try {
      // MULTI-TENANT: Verify product belongs to tenant
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      const productId = req.params.id;
      const product = await storage.getProduct(tenantId, productId);

      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }

      // Generate handle from title
      const baseHandle = handleUtils.generateHandleFromTitle(product.title);

      // Make it unique
      const uniqueHandle = await handleUtils.generateUniqueHandleFromDb(baseHandle, productId);

      // Calculate SEO score
      const seoScore = handleUtils.scoreHandleSEO(uniqueHandle);

      res.json({
        handle: uniqueHandle,
        baseHandle,
        seoScore: seoScore.score,
        grade: seoScore.grade,
        suggestions: seoScore.suggestions
      });
    } catch (error: any) {
      console.error("Error generating handle:", error);
      res.status(500).json({
        message: "Failed to generate handle",
        error: safeErrorMessage(error)
      });
    }
  });

  // Validate a handle
  app.post("/api/products/:id/handle/validate", requireAuth, async (req: Request, res: Response) => {
    try {
      const { handle } = req.body;
      const productId = req.params.id;

      if (!handle || typeof handle !== 'string') {
        return res.status(400).json({ message: "Handle is required" });
      }

      // Validate format
      const validation = handleUtils.validateHandleDetailed(handle);

      // Check uniqueness
      const isUnique = await storage.checkHandleUnique(handle, productId);

      if (!isUnique) {
        validation.errors.push("Handle is already in use by another product");
        validation.valid = false;
      }

      res.json({
        valid: validation.valid,
        errors: validation.errors,
        warnings: validation.warnings,
        unique: isUnique
      });
    } catch (error: any) {
      console.error("Error validating handle:", error);
      res.status(500).json({
        message: "Failed to validate handle",
        error: safeErrorMessage(error)
      });
    }
  });

  // Get SEO score for a handle
  app.post("/api/products/:id/handle/score", requireAuth, async (req: Request, res: Response) => {
    try {
      const { handle } = req.body;

      if (!handle || typeof handle !== 'string') {
        return res.status(400).json({ message: "Handle is required" });
      }

      const score = handleUtils.scoreHandleSEO(handle);

      res.json(score);
    } catch (error: any) {
      console.error("Error scoring handle:", error);
      res.status(500).json({
        message: "Failed to score handle",
        error: safeErrorMessage(error)
      });
    }
  });

  // Update product handle
  app.put("/api/products/:id/handle", requireAuth, requireRole(["SuperAdmin", "WarehouseManager", "Editor"]), async (req: Request, res: Response) => {
    try {
      const productId = req.params.id;
      const { handle } = req.body;

      if (!handle || typeof handle !== 'string') {
        return res.status(400).json({ message: "Handle is required" });
      }

      // Validate handle format
      const validation = handleUtils.validateHandleDetailed(handle);
      if (!validation.valid) {
        return res.status(400).json({
          message: "Invalid handle format",
          errors: validation.errors
        });
      }

      // Update handle (storage layer checks uniqueness)
      const updatedProduct = await storage.updateProductHandle(productId, handle);

      if (!updatedProduct) {
        return res.status(404).json({ message: "Product not found" });
      }

      res.json({
        success: true,
        product: updatedProduct,
        message: "Handle updated successfully"
      });
    } catch (error: any) {
      console.error("Error updating handle:", error);

      if (error.message.includes("already in use")) {
        return res.status(409).json({
          message: error.message,
          code: "HANDLE_NOT_UNIQUE"
        });
      }

      res.status(500).json({
        message: "Failed to update handle",
        error: safeErrorMessage(error)
      });
    }
  });

  // Check if handle is unique
  app.post("/api/products/handles/check-unique", requireAuth, async (req: Request, res: Response) => {
    try {
      const { handle, excludeProductId } = req.body;

      if (!handle || typeof handle !== 'string') {
        return res.status(400).json({ message: "Handle is required" });
      }

      const isUnique = await storage.checkHandleUnique(handle, excludeProductId);

      res.json({
        unique: isUnique,
        handle
      });
    } catch (error: any) {
      console.error("Error checking handle uniqueness:", error);
      res.status(500).json({
        message: "Failed to check handle uniqueness",
        error: safeErrorMessage(error)
      });
    }
  });

  // Batch generate handles from titles
  app.post("/api/products/handles/batch-generate", requireAuth, requireRole(["SuperAdmin", "WarehouseManager", "Editor"]), async (req: Request, res: Response) => {
    try {
      const { titles } = req.body;

      if (!Array.isArray(titles)) {
        return res.status(400).json({ message: "Titles must be an array" });
      }

      const handles = handleUtils.batchGenerateHandles(titles);

      res.json({
        handles,
        count: handles.length
      });
    } catch (error: any) {
      console.error("Error batch generating handles:", error);
      res.status(500).json({
        message: "Failed to batch generate handles",
        error: safeErrorMessage(error)
      });
    }
  });

  // Batch update product handles
  app.post("/api/products/handles/batch-update", requireAuth, requireRole(["SuperAdmin", "WarehouseManager"]), async (req: Request, res: Response) => {
    try {
      const { updates } = req.body;

      if (!Array.isArray(updates)) {
        return res.status(400).json({ message: "Updates must be an array" });
      }

      // Validate each update
      for (const update of updates) {
        if (!update.productId || !update.handle) {
          return res.status(400).json({
            message: "Each update must have productId and handle"
          });
        }
      }

      const results = await storage.batchUpdateHandles(updates);

      res.json({
        success: results.success,
        failures: results.failures,
        total: updates.length,
        message: `Updated ${results.success} of ${updates.length} product handles`
      });
    } catch (error: any) {
      console.error("Error batch updating handles:", error);
      res.status(500).json({
        message: "Failed to batch update handles",
        error: safeErrorMessage(error)
      });
    }
  });

  // ============================================================
  // Shopify Handle Sync Routes
  // MULTI-TENANT: All handle sync operations verify product belongs to tenant
  // ============================================================

  // Sync product handle to Shopify
  // MULTI-TENANT: Verify product belongs to tenant before syncing
  app.post("/api/products/:id/handle/sync-to-shopify", requireAuth, requireRole(["SuperAdmin", "WarehouseManager", "Editor"]), async (req: Request, res: Response) => {
    try {
      // MULTI-TENANT: Verify product belongs to tenant
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      const productId = req.params.id;
      const product = await storage.getProduct(tenantId, productId);

      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }

      if (!product.handle) {
        return res.status(400).json({ message: "Product has no handle to sync" });
      }

      // Check if product is published to Shopify
      const mapping = await storage.getShopifyProductMapping(tenantId, productId);
      if (!mapping) {
        return res.status(400).json({
          message: "Product not published to Shopify. Publish product first before syncing handle.",
          code: "NOT_PUBLISHED"
        });
      }

      // Sync handle to Shopify - MULTI-TENANT: tenantId already verified above
      const result = await shopifyService.updateProductHandle(tenantId, productId, product.handle);

      if (result.success) {
        res.json({
          success: true,
          handle: result.handle,
          message: "Handle synced to Shopify successfully"
        });
      } else {
        res.status(500).json({
          success: false,
          message: "Failed to sync handle to Shopify",
          error: result.error
        });
      }
    } catch (error: any) {
      console.error("Error syncing handle to Shopify:", error);
      res.status(500).json({
        message: "Failed to sync handle to Shopify",
        error: safeErrorMessage(error)
      });
    }
  });

  // Sync individual product from Shopify (pull latest data)
  // MULTI-TENANT: Verify product belongs to tenant before syncing
  app.post("/api/products/:id/sync-from-shopify", requireAuth, requireRole(["SuperAdmin", "WarehouseManager", "Editor"]), async (req: Request, res: Response) => {
    try {
      // MULTI-TENANT: Verify product belongs to tenant
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      const productId = req.params.id;

      // 1. Fetch product from database - MULTI-TENANT: Filter by tenant
      const product = await storage.getProduct(tenantId, productId);

      if (!product) {
        return res.status(404).json({
          message: "Product not found"
        });
      }

      // 2. Check if product has Shopify ID
      if (!product.shopifyProductId) {
        return res.status(400).json({
          message: "Product not linked to Shopify",
          code: "NOT_LINKED"
        });
      }

      // 3. Sync from Shopify
      console.log(`Syncing product ${productId} (Shopify ID: ${product.shopifyProductId}) from Shopify...`);
      const result = await shopifyImportService.syncSingleProduct(product.shopifyProductId);

      if (!result.success) {
        return res.status(500).json({
          success: false,
          message: result.error || "Failed to sync product from Shopify",
          error: result.error
        });
      }

      // 4. Return updated product and changes - MULTI-TENANT: Filter by tenant
      const updatedProduct = await storage.getProduct(tenantId, productId);

      res.json({
        success: true,
        message: result.updated
          ? "Product synced successfully - changes detected"
          : "Product already up to date",
        product: updatedProduct,
        changes: result.changes || [],
        updated: result.updated || false
      });

    } catch (error: any) {
      console.error("Error syncing product from Shopify:", error);

      // Provide user-friendly error messages
      let message = "Failed to sync product from Shopify";
      if (error.message) {
        if (error.message.includes("credentials")) {
          message = "Shopify credentials not configured";
        } else if (error.message.includes("network") || error.message.includes("fetch")) {
          message = "Network error - unable to connect to Shopify";
        } else if (error.message.includes("rate limit")) {
          message = "Shopify rate limit exceeded - please try again later";
        }
      }

      res.status(500).json({
        success: false,
        message,
        error: safeErrorMessage(error)
      });
    }
  });

  // Batch sync product handles to Shopify
  // MULTI-TENANT: Verify each product belongs to tenant before syncing
  app.post("/api/products/handles/batch-sync-to-shopify", requireAuth, requireRole(["SuperAdmin", "WarehouseManager"]), async (req: Request, res: Response) => {
    try {
      // MULTI-TENANT: Verify tenant context
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      const { productIds } = req.body;

      if (!Array.isArray(productIds)) {
        return res.status(400).json({ message: "productIds must be an array" });
      }

      if (productIds.length === 0) {
        return res.status(400).json({ message: "productIds array cannot be empty" });
      }

      // Get products and prepare updates - MULTI-TENANT: Filter by tenant
      const updates: Array<{ productId: string; handle: string }> = [];
      const notFound: string[] = [];
      const noHandle: string[] = [];
      const notPublished: string[] = [];

      for (const productId of productIds) {
        const product = await storage.getProduct(tenantId, productId);

        if (!product) {
          notFound.push(productId);
          continue;
        }

        if (!product.handle) {
          noHandle.push(productId);
          continue;
        }

        const mapping = await storage.getShopifyProductMapping(tenantId, productId);
        if (!mapping) {
          notPublished.push(productId);
          continue;
        }

        updates.push({ productId: product.id, handle: product.handle });
      }

      // Return validation errors if any
      if (updates.length === 0) {
        return res.status(400).json({
          message: "No valid products to sync",
          notFound,
          noHandle,
          notPublished
        });
      }

      // Perform batch sync with rate limiting - MULTI-TENANT: tenantId already verified above
      console.log(`🔄 Starting batch Shopify sync for ${updates.length} products...`);
      const results = await shopifyService.batchUpdateHandles(tenantId, updates);

      res.json({
        success: results.success,
        failed: results.failed,
        total: updates.length,
        results: results.results,
        skipped: {
          notFound,
          noHandle,
          notPublished
        },
        message: `Synced ${results.success} of ${updates.length} product handles to Shopify`
      });
    } catch (error: any) {
      console.error("Error batch syncing handles to Shopify:", error);
      res.status(500).json({
        message: "Failed to batch sync handles to Shopify",
        error: safeErrorMessage(error)
      });
    }
  });

  // Get Shopify sync status for a product
  // MULTI-TENANT: Verify product belongs to tenant
  app.get("/api/products/:id/shopify-sync-status", requireAuth, async (req: Request, res: Response) => {
    try {
      // MULTI-TENANT: Verify product belongs to tenant
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      const productId = req.params.id;
      const product = await storage.getProduct(tenantId, productId);

      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }

      const mapping = await storage.getShopifyProductMapping(tenantId, productId);

      // Check if product is published (either has mapping or shopifyProductId)
      const isPublished = !!mapping || !!product.shopifyProductId;
      const shopifyProductId = mapping?.shopifyProductId || product.shopifyProductId || null;

      res.json({
        productId: product.id,
        localHandle: product.handle,
        shopifyHandle: mapping?.shopifyHandle || null,
        isPublished,
        shopifyProductId,
        inSync: mapping ? (product.handle === mapping?.shopifyHandle) : null,
        status: mapping?.status || (product.shopifyProductId ? 'published' : null),
      });
    } catch (error: any) {
      console.error("Error getting Shopify sync status:", error);
      res.status(500).json({
        message: "Failed to get Shopify sync status",
        error: safeErrorMessage(error)
      });
    }
  });
}
