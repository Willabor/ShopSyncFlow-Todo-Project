/**
 * Product CRUD API Routes
 *
 * Endpoints for product creation, retrieval, update, and deletion.
 * Includes Content Studio product creation, duplicate detection,
 * URL analytics, and product stats.
 *
 * Authentication: All endpoints require authentication
 * Authorization:
 * - SuperAdmin, WarehouseManager, Editor: Full CRUD access
 * - Auditor: Read-only access (GET endpoints only)
 *
 * Multi-Tenant: All operations are tenant-isolated via getTenantId()
 */

import type { Request, Response } from "express";
import { storage } from "../storage";
import { safeErrorMessage } from "../utils/safe-error";
import { z } from "zod";
import { insertProductSchema, insertTaskSchema, User } from "@shared/schema";
import * as handleUtils from "../utils/handleGenerator.js";

export function registerProductRoutes(
  app: any,
  requireAuth: any,
  requireRole: any
) {
  const getTenantId = (req: Request): string | null => {
    const user = req.user as any;
    return user?.tenantId ?? null;
  };

  // ============================================================================
  // PRODUCT CREATION
  // ============================================================================

  // Create new product and task
  app.post("/api/products", requireAuth, requireRole(["SuperAdmin", "WarehouseManager", "Editor"]), async (req: Request, res: Response) => {
    try {
      // MULTI-TENANT: Get tenant ID from authenticated user
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      const productData = insertProductSchema.parse(req.body.product);
      const user = req.user as User;


      // MULTI-TENANT: Find or create vendor within tenant scope
      let vendor = await storage.getVendorByName(tenantId, productData.vendor);
      if (!vendor) {
        vendor = await storage.createVendor({ name: productData.vendor, tenantId });
      }

      // Create product with vendor reference
      const product = await storage.createProduct({
        ...productData,
        tenantId, // Ensure tenant_id is set for multi-tenant isolation
        vendorId: vendor.id,
      });

      // Now create task data with the product info
      const cleanedTaskData = Object.fromEntries(
        Object.entries({
          ...req.body.task,
          productId: product.id,  // Set the product ID from created product
          title: productData.title,  // Set title from product
          createdBy: user.id,
          receivedDate: new Date(req.body.task.receivedDate || Date.now()),
        }).filter(([key, value]) => value !== undefined && value !== null)
      );

      const taskData = insertTaskSchema.parse(cleanedTaskData);

      // MULTI-TENANT: Create task linked to product with tenantId
      const task = await storage.createTask({ ...taskData, tenantId });

      // Set SLA deadline (default 48 hours)
      const slaDeadline = new Date(task.receivedDate);
      slaDeadline.setHours(slaDeadline.getHours() + 48);

      // MULTI-TENANT: Use tenantId for updateTask call
      await storage.updateTask(tenantId, task.id, { slaDeadline });

      res.status(201).json({ product, task });
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error("=== VALIDATION ERROR DETAILS ===");
        console.error("Raw request body:", JSON.stringify(req.body, null, 2));
        console.error("Validation errors:", JSON.stringify(error.errors, null, 2));
        console.error("=== END VALIDATION ERROR ===");

        // Build user-friendly error messages
        const friendlyMessages: string[] = [];
        for (const err of error.errors) {
          const field = err.path.join('.');

          if (field === 'handle' || field === 'product.handle') {
            if (err.code === 'too_big') {
              friendlyMessages.push(
                `Product URL (handle) is too long: Maximum ${(err as any).maximum} characters allowed. ` +
                `Please shorten the product title or manually edit the handle.`
              );
            } else {
              friendlyMessages.push(`Product URL: ${err.message}`);
            }
          } else {
            friendlyMessages.push(`${field}: ${err.message}`);
          }
        }

        return res.status(400).json({
          message: friendlyMessages.join('\n\n'),
          errors: error.errors,
          details: error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
        });
      }
      console.error("Error creating product/task:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // =============================================
  // CONTENT STUDIO PRODUCT ENDPOINTS
  // =============================================

  // Create product from Content Studio (without task)
  app.post("/api/products/content-studio", requireAuth, requireRole(["SuperAdmin", "WarehouseManager", "Editor", "Auditor"]), async (req: Request, res: Response) => {
    try {
      // MULTI-TENANT: Get tenant ID from authenticated user
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      console.log('[Content Studio] Creating product with data:', JSON.stringify(req.body, null, 2));
      const productData = insertProductSchema.parse(req.body);

      // AUTO-GENERATE HANDLE: If no handle provided, generate from title
      if (!productData.handle && productData.title) {
        try {
          const baseHandle = handleUtils.generateHandleFromTitle(productData.title);
          const uniqueHandle = await handleUtils.generateUniqueHandleFromDb(baseHandle);
          productData.handle = uniqueHandle;
          console.log(`[Content Studio] Auto-generated handle: "${productData.title}" -> "${uniqueHandle}"`);
        } catch (handleError) {
          console.warn('[Content Studio] Failed to auto-generate handle:', handleError);
        }
      }

      // MULTI-TENANT: Find or create vendor within tenant scope
      let vendor = await storage.getVendorByName(tenantId, productData.vendor);
      if (!vendor) {
        vendor = await storage.createVendor({ name: productData.vendor, tenantId });
      }

      // Create product with vendor reference and default Content Studio status
      const createData = {
        ...productData,
        tenantId, // Ensure tenant_id is set for multi-tenant isolation
        vendorId: vendor.id,
        status: productData.status || 'local_draft',
        publishStatus: productData.publishStatus || 'not_published',
        aiGenerated: true, // Mark as AI-generated (created via Content Studio)
        aiGeneratedAt: new Date(), // Track when AI content was generated
      };

      let product;
      try {
        product = await storage.createProduct(createData);
      } catch (createError: any) {
        // Handle duplicate handle constraint violation (PostgreSQL error code 23505)
        if (createError?.code === '23505' && createError?.constraint?.includes('handle')) {
          console.log(`[Content Studio] Handle "${createData.handle}" already exists, generating unique variant`);
          const baseHandle = createData.handle || handleUtils.generateHandleFromTitle(productData.title);
          createData.handle = await handleUtils.generateUniqueHandleFromDb(baseHandle);
          console.log(`[Content Studio] Retrying with unique handle: "${createData.handle}"`);
          product = await storage.createProduct(createData);
        } else {
          throw createError;
        }
      }

      res.status(201).json(product);
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error('[Content Studio] Validation error:', JSON.stringify(error.errors, null, 2));

        // Build user-friendly error messages
        const friendlyMessages: string[] = [];
        for (const err of error.errors) {
          const field = err.path.join('.');

          // Handle-specific error messages
          if (field === 'handle') {
            if (err.code === 'too_big') {
              friendlyMessages.push(
                `Product URL (handle) is too long: Maximum ${(err as any).maximum} characters allowed. ` +
                `Please shorten the product title or manually edit the handle to be more concise.`
              );
            } else if (err.code === 'invalid_string') {
              friendlyMessages.push(
                `Product URL (handle) format is invalid: ${err.message}. ` +
                `Handles can only contain lowercase letters (a-z), numbers (0-9), and hyphens (-).`
              );
            } else {
              friendlyMessages.push(`Product URL: ${err.message}`);
            }
          }
          // Title-specific error messages
          else if (field === 'title') {
            friendlyMessages.push(`Product title: ${err.message}`);
          }
          // Vendor-specific error messages
          else if (field === 'vendor') {
            friendlyMessages.push(`Vendor: ${err.message}`);
          }
          // Generic fallback
          else {
            friendlyMessages.push(`${field}: ${err.message}`);
          }
        }

        return res.status(400).json({
          message: friendlyMessages.join('\n\n'),
          errors: error.errors,
          details: error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
        });
      }
      console.error("Error creating product from Content Studio:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Check for duplicate products before creating
  app.post("/api/products/check-duplicates", requireAuth, requireRole(["SuperAdmin", "WarehouseManager", "Editor"]), async (req: Request, res: Response) => {
    try {
      const { vendor, styleNumber, productName, color, skus } = req.body;

      // Validate required fields
      if (!vendor) {
        return res.status(400).json({
          message: "Vendor is required for duplicate detection"
        });
      }

      // Call storage method to detect duplicates
      const result = await storage.detectProductDuplicates({
        vendor,
        styleNumber,
        productName,
        color,
        skus
      });

      res.json(result);
    } catch (error) {
      console.error("Error checking for duplicate products:", error);
      res.status(500).json({
        message: "Internal server error",
        error: safeErrorMessage(error)
      });
    }
  });

  // ============================================================================
  // PRODUCTS API
  // ============================================================================

  // Get product stats (counts by status) - used for dashboard cards
  // MULTI-TENANT: Stats are filtered by authenticated user's tenant
  // This endpoint is separate from /list to allow stats to be cached independently
  app.get("/api/products/stats", requireAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      // Get counts for each status using separate queries for accuracy
      const [total, localDraft, draft, active, archived, notPublished] = await Promise.all([
        storage.getProductsCount(tenantId, {}),
        storage.getProductsCount(tenantId, { status: 'local_draft' }),
        storage.getProductsCount(tenantId, { status: 'draft' }),
        storage.getProductsCount(tenantId, { status: 'active' }),
        storage.getProductsCount(tenantId, { status: 'archived' }),
        storage.getProductsCount(tenantId, { publishStatus: 'not_published' }),
      ]);

      console.log(`Product stats for tenant ${tenantId}: total=${total}, localDraft=${localDraft}, draft=${draft}, active=${active}, archived=${archived}, notPublished=${notPublished}`);

      res.json({
        total,
        localDraft,
        draft,
        active,
        archived,
        notPublished,
      });
    } catch (error) {
      console.error("Error fetching product stats:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get all products with filters, search, and pagination
  // MULTI-TENANT: Products are filtered by authenticated user's tenant
  app.get("/api/products/list", requireAuth, async (req: Request, res: Response) => {
    try {
      // MULTI-TENANT: Get tenant ID from authenticated user
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      const { status, vendorId, shopifyProductId, publishStatus, search, limit, offset } = req.query;

      // Build filters for products query
      const productFilters: any = {};
      if (status) productFilters.status = status as string;
      if (vendorId) productFilters.vendorId = vendorId as string;
      if (shopifyProductId) productFilters.shopifyProductId = shopifyProductId as string;
      if (publishStatus) productFilters.publishStatus = publishStatus as string;
      if (search) productFilters.search = search as string;
      if (limit) productFilters.limit = parseInt(limit as string, 10);
      if (offset) productFilters.offset = parseInt(offset as string, 10);

      // Build filters for count query (same filters, but no pagination)
      const countFilters: any = {};
      if (status) countFilters.status = status as string;
      if (vendorId) countFilters.vendorId = vendorId as string;
      if (shopifyProductId) countFilters.shopifyProductId = shopifyProductId as string;
      if (publishStatus) countFilters.publishStatus = publishStatus as string;
      if (search) countFilters.search = search as string;

      console.log(`Products query: tenant=${tenantId}, search="${search || ''}", limit=${limit || 'none'}, offset=${offset || 0}, status=${status || 'all'}`);

      // MULTI-TENANT: Fetch products and total count filtered by tenant
      const [products, totalCount] = await Promise.all([
        storage.getProducts(tenantId, productFilters),
        storage.getProductsCount(tenantId, countFilters)
      ]);

      const pageSize = productFilters.limit || 100;
      const currentOffset = productFilters.offset || 0;
      const currentPage = Math.floor(currentOffset / pageSize);

      console.log(`Returned ${products.length} of ${totalCount} total products (page ${currentPage + 1})`);

      res.json({
        products,
        total: totalCount,
        page: currentPage,
        pageSize,
        hasMore: (currentOffset + products.length) < totalCount
      });
    } catch (error) {
      console.error("Error fetching products:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get URL analytics (products missing handles, non-optimized URLs, etc.)
  // IMPORTANT: This route must come BEFORE /api/products/:id to avoid route collision
  // MULTI-TENANT: Analytics filtered by authenticated user's tenant
  app.get("/api/products/url-analytics", requireAuth, async (req: Request, res: Response) => {
    try {
      // MULTI-TENANT: Get tenant ID from authenticated user
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      const products = await storage.getProducts(tenantId, { limit: 10000 });

      const analytics = {
        total: products.length,
        withHandle: products.filter(p => p.handle).length,
        withoutHandle: products.filter(p => !p.handle).length,

        // URL quality issues
        tooLong: products.filter(p => p.handle && p.handle.length > 60).length,
        hasNumbers: products.filter(p => p.handle && /\d{4,}/.test(p.handle)).length,
        lowSEOScore: products.filter(p => {
          if (!p.handle) return false;
          const score = handleUtils.scoreHandleSEO(p.handle);
          return score.score < 50;
        }).length,

        // List of products needing attention (sample)
        needsAttention: products
          .filter(p => {
            if (!p.handle) return true;
            if (p.handle.length > 60) return true;
            const score = handleUtils.scoreHandleSEO(p.handle);
            return score.score < 50;
          })
          .slice(0, 20)
          .map(p => ({
            id: p.id,
            title: p.title,
            handle: p.handle,
            seoScore: p.handle ? handleUtils.scoreHandleSEO(p.handle).score : 0,
            issues: [
              ...(!p.handle ? ["Missing handle"] : []),
              ...(p.handle && p.handle.length > 60 ? ["Too long"] : []),
              ...(p.handle && handleUtils.scoreHandleSEO(p.handle).score < 50 ? ["Low SEO score"] : [])
            ]
          }))
      };

      res.json(analytics);

    } catch (error: any) {
      console.error("Error fetching URL analytics:", error);
      res.status(500).json({
        message: "Failed to get URL analytics",
        error: safeErrorMessage(error)
      });
    }
  });

  // Get single product by ID
  // MULTI-TENANT: Product filtered by authenticated user's tenant
  app.get("/api/products/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      // MULTI-TENANT: Get tenant ID from authenticated user
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      // Fetch product with variants and options (tenant-isolated)
      const product = await storage.getProductWithVariants(tenantId, req.params.id);
      if (!product) {
        // MULTI-TENANT: Return 404 without revealing if product exists in another tenant
        return res.status(404).json({ message: "Product not found" });
      }

      // Add variant count to response
      res.json({
        ...product,
        variantCount: product.variants?.length || 0,
      });
    } catch (error) {
      console.error("Error fetching product:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Update product from Content Studio
  // MULTI-TENANT: Product updates are tenant-isolated
  app.patch("/api/products/:id", requireAuth, requireRole(["SuperAdmin", "WarehouseManager", "Editor"]), async (req: Request, res: Response) => {
    try {
      // MULTI-TENANT: Get tenant ID from authenticated user
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      // Check product exists and belongs to tenant
      const product = await storage.getProduct(tenantId, req.params.id);
      if (!product) {
        // MULTI-TENANT: Return 404 without revealing if product exists in another tenant
        return res.status(404).json({ message: "Product not found" });
      }

      // Preprocess: Convert empty strings to undefined for optional fields
      // This prevents validation errors when frontend sends "" for unused optional fields
      // Also coerce ISO date strings to Date objects for timestamp columns
      const cleanedBody = Object.fromEntries(
        Object.entries(req.body).map(([key, value]) => [
          key,
          value === "" ? undefined
            : (key === "aiGeneratedAt" && typeof value === "string") ? new Date(value)
            : value
        ])
      );

      // Validate updates with insertProductSchema (partial)
      const updateSchema = insertProductSchema.partial();
      const updates = updateSchema.parse(cleanedBody);

      // AUTO-GENERATE HANDLE: If title is being changed and no explicit handle provided,
      // automatically generate a new SEO-friendly handle from the new title
      // This ensures URL handle stays in sync when Content Studio updates the title
      if (updates.title && updates.title !== product.title && !cleanedBody.handle) {
        try {
          const baseHandle = handleUtils.generateHandleFromTitle(updates.title);
          // Make it unique, excluding current product from uniqueness check
          const uniqueHandle = await handleUtils.generateUniqueHandleFromDb(baseHandle, req.params.id);
          updates.handle = uniqueHandle;
          console.log(`Auto-generated handle for title change: "${updates.title}" -> "${uniqueHandle}"`);
        } catch (handleError) {
          // Log but don't fail the update - handle generation is a nice-to-have
          console.warn('Failed to auto-generate handle:', handleError);
        }
      }

      // MULTI-TENANT: Update product with tenant isolation
      const updatedProduct = await storage.updateProduct(tenantId, req.params.id, updates);
      res.json(updatedProduct);
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error(`Product PATCH validation error for ${req.params.id}:`, error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; '));
        return res.status(400).json({
          message: "Validation error",
          errors: error.errors,
          details: error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
        });
      }
      console.error("Error updating product:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Delete product
  // MULTI-TENANT: Product deletion is tenant-isolated
  app.delete("/api/products/:id", requireAuth, requireRole(["SuperAdmin", "WarehouseManager", "Editor"]), async (req: Request, res: Response) => {
    try {
      // MULTI-TENANT: Get tenant ID from authenticated user
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      // Check product exists and belongs to tenant
      const product = await storage.getProduct(tenantId, req.params.id);
      if (!product) {
        // MULTI-TENANT: Return 404 without revealing if product exists in another tenant
        return res.status(404).json({ message: "Product not found" });
      }

      // MULTI-TENANT: Delete product with tenant isolation
      await storage.deleteProduct(tenantId, req.params.id);
      res.json({ message: "Product deleted successfully", id: req.params.id });
    } catch (error) {
      console.error("Error deleting product:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });
}
