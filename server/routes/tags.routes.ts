/**
 * Tags Management API Routes
 *
 * Endpoints for tag CRUD, statistics, refresh counts, and bulk cleanup.
 *
 * Authentication: All endpoints require authentication
 * Authorization: Role-based access varies by endpoint
 */

import type { Express, Request, Response, NextFunction } from "express";
import { storage } from "../storage";
import { User } from "@shared/schema";

export function registerTagsRoutes(
  app: Express,
  requireAuth: (req: Request, res: Response, next: NextFunction) => void,
  requireRole: (roles: string[]) => (req: Request, res: Response, next: NextFunction) => void
) {
  const getTenantId = (req: Request): string | null => {
    const user = req.user as User | undefined;
    return user?.tenantId ?? null;
  };

  // =============================================
  // TAGS MANAGEMENT ENDPOINTS
  // =============================================

  // Get all tags
  app.get("/api/tags", requireAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      const { search, unused, notSynced } = req.query;
      const filters: { search?: string; unused?: boolean; notSynced?: boolean } = {};

      if (search) filters.search = search as string;
      if (unused === 'true') filters.unused = true;
      if (notSynced === 'true') filters.notSynced = true;

      const tags = await storage.getAllTags(tenantId, filters);
      res.json(tags);
    } catch (error) {
      console.error("Error fetching tags:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get tag statistics
  app.get("/api/tags/stats", requireAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      const stats = await storage.getTagStats(tenantId);
      res.json(stats);
    } catch (error) {
      console.error("Error fetching tag stats:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Refresh tag counts from products
  app.post("/api/tags/refresh", requireAuth, requireRole(["SuperAdmin", "WarehouseManager"]), async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      await storage.refreshTagCounts(tenantId);
      const stats = await storage.getTagStats(tenantId);
      res.json({ message: "Tag counts refreshed", stats });
    } catch (error) {
      console.error("Error refreshing tag counts:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Delete all unused tags (must be before /:id route)
  app.delete("/api/tags/unused/all", requireAuth, requireRole(["SuperAdmin", "WarehouseManager"]), async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      const unusedTags = await storage.getAllTags(tenantId, { unused: true });
      let deleted = 0;
      for (const tag of unusedTags) {
        const result = await storage.deleteTag(tenantId, tag.id);
        if (result) deleted++;
      }

      res.json({ message: `Deleted ${deleted} unused tags`, deleted });
    } catch (error) {
      console.error("Error deleting unused tags:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get single tag by ID
  app.get("/api/tags/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      const tag = await storage.getTagById(tenantId, req.params.id);
      if (!tag) {
        return res.status(404).json({ message: "Tag not found" });
      }
      res.json(tag);
    } catch (error) {
      console.error("Error fetching tag:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Create new tag
  app.post("/api/tags", requireAuth, requireRole(["SuperAdmin", "WarehouseManager", "Editor"]), async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      const { name, color } = req.body;
      if (!name || typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ message: "Tag name is required" });
      }

      const trimmedName = name.trim();

      // Validate tag name format (lowercase letters, numbers, hyphens only)
      if (!/^[a-z0-9-]+$/i.test(trimmedName)) {
        return res.status(400).json({ message: "Tag name must contain only letters, numbers, and hyphens" });
      }

      // Validate color format if provided
      if (color && !/^#[0-9A-Fa-f]{6}$/.test(color)) {
        return res.status(400).json({ message: "Invalid color format. Must be a hex color (e.g., #3b82f6)" });
      }

      const existing = await storage.getTagByName(tenantId, trimmedName);
      if (existing) {
        return res.status(409).json({ message: "Tag already exists", existing });
      }

      const tag = await storage.createTag(tenantId, {
        name: trimmedName,
        normalizedName: trimmedName.toLowerCase(),
        color: color || null,
        tenantId,
      });

      res.status(201).json(tag);
    } catch (error) {
      console.error("Error creating tag:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Update tag
  app.patch("/api/tags/:id", requireAuth, requireRole(["SuperAdmin", "WarehouseManager"]), async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      const { name, color, shopifySynced } = req.body;
      const updates: any = {};

      if (name !== undefined) {
        const trimmedName = name.trim();
        // Validate tag name format
        if (!/^[a-z0-9-]+$/i.test(trimmedName)) {
          return res.status(400).json({ message: "Tag name must contain only letters, numbers, and hyphens" });
        }
        updates.name = trimmedName;
        updates.normalizedName = trimmedName.toLowerCase();
      }
      if (color !== undefined) {
        // Validate color format if provided
        if (color && !/^#[0-9A-Fa-f]{6}$/.test(color)) {
          return res.status(400).json({ message: "Invalid color format. Must be a hex color (e.g., #3b82f6)" });
        }
        updates.color = color;
      }
      if (shopifySynced !== undefined) {
        updates.shopifySynced = shopifySynced;
        if (shopifySynced) updates.lastSyncedAt = new Date();
      }

      const tag = await storage.updateTag(tenantId, req.params.id, updates);
      if (!tag) {
        return res.status(404).json({ message: "Tag not found" });
      }
      res.json(tag);
    } catch (error) {
      console.error("Error updating tag:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Delete tag
  app.delete("/api/tags/:id", requireAuth, requireRole(["SuperAdmin", "WarehouseManager"]), async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      const deleted = await storage.deleteTag(tenantId, req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: "Tag not found" });
      }
      res.json({ message: "Tag deleted" });
    } catch (error) {
      console.error("Error deleting tag:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // END TAGS MANAGEMENT ENDPOINTS
  // =============================================
}
