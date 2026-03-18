/**
 * Product Variant and Option API Routes
 *
 * Endpoints for managing product variants (SKUs with pricing/inventory)
 * and product options (Size, Color, Material - max 3 per product).
 *
 * Authentication: All endpoints require authentication
 * Authorization:
 * - SuperAdmin, WarehouseManager, Editor: Full CRUD access
 * - Auditor: Read-only access (GET endpoints only)
 *
 * Multi-Tenant: All operations verify parent product belongs to tenant
 */

import type { Request, Response } from "express";
import { storage } from "../storage";
import { z } from "zod";
import {
  insertProductOptionSchema,
  updateProductOptionSchema,
  insertProductVariantSchema,
} from "@shared/schema";

export function registerVariantRoutes(
  app: any,
  requireAuth: any,
  requireRole: any
) {
  const getTenantId = (req: Request): string | null => {
    const user = req.user as any;
    return user?.tenantId ?? null;
  };

  // ============================================================
  // Product Variant Endpoints
  // MULTI-TENANT: All variant/option endpoints verify parent product belongs to tenant
  // ============================================================

  // Get all variants for a product
  // MULTI-TENANT: Verify product belongs to tenant before returning variants
  app.get("/api/products/:id/variants", requireAuth, async (req: Request, res: Response) => {
    try {
      // MULTI-TENANT: Verify product belongs to tenant
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      // Verify product exists and belongs to tenant
      const product = await storage.getProduct(tenantId, req.params.id);
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }

      const variants = await storage.getProductVariants(req.params.id);
      res.json(variants);
    } catch (error) {
      console.error("Error fetching product variants:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get variant count for a product
  // MULTI-TENANT: Verify product belongs to tenant before returning count
  app.get("/api/products/:id/variants/count", requireAuth, async (req: Request, res: Response) => {
    try {
      // MULTI-TENANT: Verify product belongs to tenant
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      // Verify product exists and belongs to tenant
      const product = await storage.getProduct(tenantId, req.params.id);
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }

      const count = await storage.getProductVariantCount(req.params.id);
      res.json({ count });
    } catch (error) {
      console.error("Error fetching product variant count:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ============================================================
  // Product Option Endpoints
  // ============================================================

  // Get all options for a product
  // MULTI-TENANT: Verify product belongs to tenant before returning options
  app.get("/api/products/:id/options", requireAuth, async (req: Request, res: Response) => {
    try {
      // MULTI-TENANT: Verify product belongs to tenant
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      // Verify product exists and belongs to tenant
      const product = await storage.getProduct(tenantId, req.params.id);
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }

      const options = await storage.getProductOptions(req.params.id);
      res.json(options);
    } catch (error) {
      console.error("Error fetching product options:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Create a new product option
  // MULTI-TENANT: Verify product belongs to tenant before creating option
  app.post("/api/products/:id/options", requireAuth, requireRole(["SuperAdmin", "WarehouseManager", "Editor"]), async (req: Request, res: Response) => {
    try {
      // MULTI-TENANT: Verify product belongs to tenant
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      // Verify product exists and belongs to tenant
      const product = await storage.getProduct(tenantId, req.params.id);
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }

      // Validate request body
      const optionData = insertProductOptionSchema.parse({
        ...req.body,
        productId: req.params.id,
      });

      const option = await storage.createProductOption(optionData);
      res.status(201).json(option);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: "Validation error",
          errors: error.errors,
        });
      }
      console.error("Error creating product option:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Reorder product options
  // MULTI-TENANT: Verify product belongs to tenant before reordering
  app.put("/api/products/:id/options/reorder", requireAuth, requireRole(["SuperAdmin", "WarehouseManager", "Editor"]), async (req: Request, res: Response) => {
    try {
      // MULTI-TENANT: Verify product belongs to tenant
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      // Verify product exists and belongs to tenant
      const product = await storage.getProduct(tenantId, req.params.id);
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }

      const { optionIds } = req.body;

      if (!Array.isArray(optionIds) || optionIds.length === 0) {
        return res.status(400).json({ message: "optionIds must be a non-empty array" });
      }

      await storage.reorderProductOptions(req.params.id, optionIds);
      res.json({ success: true });
    } catch (error) {
      console.error("Error reordering product options:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Update a product option
  // MULTI-TENANT: Verify product belongs to tenant before updating option
  app.patch("/api/products/:id/options/:optionId", requireAuth, requireRole(["SuperAdmin", "WarehouseManager", "Editor"]), async (req: Request, res: Response) => {
    try {
      // MULTI-TENANT: Verify product belongs to tenant
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      // Verify product exists and belongs to tenant
      const product = await storage.getProduct(tenantId, req.params.id);
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }

      const updates = updateProductOptionSchema.parse(req.body);

      const option = await storage.updateProductOption(req.params.optionId, updates);
      if (!option) {
        return res.status(404).json({ message: "Option not found" });
      }

      res.json(option);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: "Validation error",
          errors: error.errors,
        });
      }
      console.error("Error updating product option:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Delete a product option
  // MULTI-TENANT: Verify product belongs to tenant before deleting option
  app.delete("/api/products/:id/options/:optionId", requireAuth, requireRole(["SuperAdmin", "WarehouseManager", "Editor"]), async (req: Request, res: Response) => {
    try {
      // MULTI-TENANT: Verify product belongs to tenant
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      // Verify product exists and belongs to tenant
      const product = await storage.getProduct(tenantId, req.params.id);
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }

      const deleted = await storage.deleteProductOption(req.params.optionId);
      if (!deleted) {
        return res.status(404).json({ message: "Option not found" });
      }

      res.json({ message: "Option deleted successfully", id: req.params.optionId });
    } catch (error) {
      console.error("Error deleting product option:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ============================================================
  // Variant CRUD Endpoints
  // ============================================================

  // Create a new product variant
  // MULTI-TENANT: Verify product belongs to tenant before creating variant
  app.post("/api/products/:id/variants", requireAuth, requireRole(["SuperAdmin", "WarehouseManager", "Editor"]), async (req: Request, res: Response) => {
    try {
      // MULTI-TENANT: Verify product belongs to tenant
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      // Verify product exists and belongs to tenant
      const product = await storage.getProduct(tenantId, req.params.id);
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }

      // Validate request body
      const variantData = insertProductVariantSchema.parse({
        ...req.body,
        productId: req.params.id,
      });

      const variant = await storage.createProductVariant(variantData);
      res.status(201).json(variant);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: "Validation error",
          errors: error.errors,
        });
      }
      console.error("Error creating product variant:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Update a product variant
  // MULTI-TENANT: Verify product belongs to tenant before updating variant
  app.patch("/api/products/:id/variants/:variantId", requireAuth, requireRole(["SuperAdmin", "WarehouseManager", "Editor"]), async (req: Request, res: Response) => {
    try {
      // MULTI-TENANT: Verify product belongs to tenant
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      // Verify product exists and belongs to tenant
      const product = await storage.getProduct(tenantId, req.params.id);
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }

      const updateSchema = insertProductVariantSchema.partial();
      const updates = updateSchema.parse(req.body);

      const variant = await storage.updateProductVariant(req.params.variantId, updates);
      if (!variant) {
        return res.status(404).json({ message: "Variant not found" });
      }

      res.json(variant);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: "Validation error",
          errors: error.errors,
        });
      }
      console.error("Error updating product variant:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Delete a product variant
  // MULTI-TENANT: Verify product belongs to tenant before deleting variant
  app.delete("/api/products/:id/variants/:variantId", requireAuth, requireRole(["SuperAdmin", "WarehouseManager", "Editor"]), async (req: Request, res: Response) => {
    try {
      // MULTI-TENANT: Verify product belongs to tenant
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      // Verify product exists and belongs to tenant
      const product = await storage.getProduct(tenantId, req.params.id);
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }

      const deleted = await storage.deleteProductVariant(req.params.variantId);
      if (!deleted) {
        return res.status(404).json({ message: "Variant not found" });
      }

      res.json({ message: "Variant deleted successfully", id: req.params.variantId });
    } catch (error) {
      console.error("Error deleting product variant:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });
}
