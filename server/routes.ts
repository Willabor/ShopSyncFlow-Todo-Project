import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { storage } from "./storage";
import { db } from "./db";
import { safeErrorMessage } from "./utils/safe-error";
import { eq, and, isNotNull, ne, or, ilike, desc, sql, inArray } from "drizzle-orm";
import { productVariants } from "@shared/schema";
import { insertVendorSchema, User } from "@shared/schema";
import { shopifyService } from "./shopify";
import { getSystemInfo } from "./system";
import { z } from "zod";
import multer from "multer";
import path from "path";
import fs from "fs";
import { registerBrandEnrichmentRoutes } from "./routes/brand-enrichment";
import { registerFileRoutes } from "./routes/files.routes";
import { registerWeightRulesRoutes } from "./routes/weight-rules";
import { registerCollectionRoutes } from "./routes/collections.routes";
import { registerProductRoutes } from "./routes/products.routes";
import { registerVariantRoutes } from "./routes/variants.routes";
import integrationsRouter from "./routes/integrations";
import tenantRegisterRoutes from "./routes/register";
// Task management routes
import { registerTaskRoutes } from "./routes/tasks.routes";
// AI Integration routes
import { registerAISettingsRoutes } from "./routes/ai-settings.routes";
import { registerAITemplatesRoutes } from "./routes/ai-templates.routes";
import { registerAIAdminRoutes } from "./routes/ai-admin.routes";
import { registerAIUsageRoutes } from "./routes/ai-usage.routes";
import { registerTagsRoutes } from "./routes/tags.routes";
import { registerCategoriesRoutes } from "./routes/categories.routes";
import { registrationLimiter } from "./middleware/rateLimiter";
import { productInsightsService, clearInsightsCache } from "./services/product-insights.service";
import { registerAiContentRoutes } from "./routes/ai-content.routes.js";
import { registerShopifySyncRoutes } from "./routes/shopify-sync.routes.js";
import { registerQbImportRoutes } from "./routes/qb-import.routes.js";
import { registerHandleRoutes } from "./routes/handles.routes.js";

export function registerRoutes(app: Express): Server {
  setupAuth(app);

  // Public health check endpoint (no authentication required)
  app.get("/health", (req: Request, res: Response) => {
    res.status(200).json({
      status: "ok",
      timestamp: new Date().toISOString(),
      service: "ShopSyncFlow"
    });
  });

  // Middleware to check authentication
  const requireAuth = (req: Request, res: Response, next: NextFunction) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Authentication required" });
    }
    next();
  };

  // Middleware to check role permissions
  const requireRole = (roles: string[]) => {
    return (req: Request, res: Response, next: NextFunction) => {
      if (!req.user || !roles.includes((req.user as User).role)) {
        return res.status(403).json({ message: "Insufficient permissions" });
      }
      next();
    };
  };

  // MULTI-TENANT: Helper to get tenant ID from authenticated user
  // Returns null if no tenant context (caller should return 401)
  const getTenantId = (req: Request): string | null => {
    const user = req.user as User | undefined;
    return user?.tenantId ?? null;
  };

  // Register brand enrichment routes
  registerBrandEnrichmentRoutes(app, requireAuth, requireRole);

  // Register file management routes
  registerFileRoutes(app, requireAuth, requireRole);

  // Register weight rules routes (weight categories, mappings, discrepancies)
  registerWeightRulesRoutes(app, requireAuth, requireRole);

  // Register product CRUD routes (create, read, update, delete, stats, analytics)
  registerProductRoutes(app, requireAuth, requireRole);

  // Register variant and option routes (variant/option CRUD for products)
  registerVariantRoutes(app, requireAuth, requireRole);

  // Register task management routes (tasks, steps, templates, attachments, publishing)
  registerTaskRoutes(app, requireAuth, requireRole);

  // Register collection management routes (CRUD, analytics, health, Shopify sync)
  registerCollectionRoutes(app, requireAuth, requireRole);

  // Register tags management routes (CRUD, stats, refresh, bulk cleanup)
  registerTagsRoutes(app, requireAuth, requireRole);

  // Register category management routes (CRUD, migration, Shopify taxonomy, Google categories)
  registerCategoriesRoutes(app, requireAuth, requireRole);

  // Register AI Integration routes
  registerAISettingsRoutes(app, requireAuth, requireRole);
  registerAITemplatesRoutes(app, requireAuth, requireRole);
  registerAIAdminRoutes(app, requireAuth, requireRole);
  registerAIUsageRoutes(app, requireAuth, requireRole);

  // Register AI content generation routes (Gemini, Claude fallback, keywords, SEO)
  registerAiContentRoutes(app, requireAuth, requireRole);

  // Register Shopify sync routes (sync progress, unified sync, stores, import, logs, errors, webhooks)
  registerShopifySyncRoutes(app, requireAuth, requireRole);

  // Register API integrations routes (OAuth, etc.)
  app.use("/api/integrations", integrationsRouter);

  // Register tenant registration routes (public - no auth required)
  // These enable the self-service tenant registration flow:
  // 1. /api/auth/register/send-code - Send verification code to email
  // 2. /api/auth/register/verify-code - Verify code and get temp token
  // 3. /api/tenants/check-subdomain/:subdomain - Check subdomain availability
  // 4. /api/tenants/register - Create tenant and owner user
  // Rate limited to prevent abuse (30 requests per 15 minutes per IP)
  app.use("/api/auth/register", registrationLimiter, tenantRegisterRoutes);
  app.use("/api/tenants", registrationLimiter, tenantRegisterRoutes);

  // System information (time, location, timezone)
  app.get("/api/system/info", requireAuth, async (req: Request, res: Response) => {
    try {
      const systemInfo = getSystemInfo();
      res.json(systemInfo);
    } catch (error) {
      console.error("Error fetching system info:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get current tenant info (for print reports, headers, etc.)
  // MULTI-TENANT: Returns tenant info for authenticated user
  app.get("/api/tenant/info", requireAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      const tenant = await storage.getTenantById(tenantId);
      if (!tenant) {
        return res.status(404).json({ message: "Tenant not found" });
      }

      // Return only safe, non-sensitive tenant info
      res.json({
        id: tenant.id,
        companyName: tenant.companyName,
        subdomain: tenant.subdomain,
        shopifyStoreUrl: tenant.shopifyStoreUrl,
        planTier: tenant.planTier,
      });
    } catch (error) {
      console.error("Error fetching tenant info:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Dashboard stats
  // MULTI-TENANT: Added tenant isolation
  app.get("/api/dashboard/stats", requireAuth, async (req: Request, res: Response) => {
    try {
      // MULTI-TENANT: Extract and validate tenant context
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      const user = req.user as User;
      const stats = await storage.getDashboardStats(tenantId, user.id, user.role);
      res.json(stats);
    } catch (error) {
      console.error("Error fetching dashboard stats:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Capture dashboard stats snapshot (for historical tracking)
  app.post("/api/dashboard/stats/snapshot", requireAuth, requireRole(["SuperAdmin"]), async (req: Request, res: Response) => {
    try {
      // MULTI-TENANT: Get tenant from authenticated user
      const tenantId = (req.user as any)?.tenantId as string | undefined;
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }
      const snapshot = await storage.captureStatsSnapshot(tenantId);
      res.json(snapshot);
    } catch (error) {
      console.error("Error capturing stats snapshot:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ============================================================================
  // PRODUCT CATEGORIES API (Shopify Standard Product Taxonomy)
  // ============================================================================

  // NOTE: Specific routes MUST come before parameterized routes like /:id
  // to avoid route conflicts (e.g., /stats would match /:id with id="stats")

  // Search product categories (for category selector autocomplete)
  app.get("/api/product-categories/search", requireAuth, async (req: Request, res: Response) => {
    try {
      const { q, limit = 50 } = req.query;

      if (!q || typeof q !== 'string' || q.trim().length < 2) {
        return res.json({ categories: [] });
      }

      const categories = await storage.searchProductCategories(q.trim(), parseInt(limit as string, 10));
      res.json({ categories });
    } catch (error) {
      console.error("Error searching product categories:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get single product category by ID
  app.get("/api/product-categories/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const category = await storage.getProductCategoryById(id);

      if (!category) {
        return res.status(404).json({ message: "Product category not found" });
      }

      res.json(category);
    } catch (error) {
      console.error("Error fetching product category:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // NOTE: Product CRUD routes (stats, list, get, create, update, delete) are in ./routes/products.routes.ts
  // NOTE: Variant/option CRUD routes are in ./routes/variants.routes.ts

  // Register QuickBooks import and inventory routes
  registerQbImportRoutes(app, requireAuth, requireRole);

  // Handle management and Shopify publishing routes
  registerHandleRoutes(app, requireAuth, requireRole);

  // Get system-wide audit logs (SuperAdmin and Auditor only)
  // MULTI-TENANT: Added tenant isolation
  app.get("/api/audit", requireAuth, async (req: Request, res: Response) => {
    try {
      // MULTI-TENANT: Extract and validate tenant context
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      // Only Super Admin and Auditor can view system-wide audit logs
      const user = req.user as User;
      if (!["SuperAdmin", "Auditor"].includes(user.role)) {
        return res.status(403).json({ message: "Access denied" });
      }

      const auditLogs = await storage.getAllAuditLogs(tenantId);
      res.json(auditLogs);
    } catch (error) {
      console.error("Error fetching system audit logs:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // =============================================
  // FILE UPLOAD & ATTACHMENTS ENDPOINTS
  // =============================================

  // Configure multer for file uploads
  // Use process.cwd() so the path resolves correctly in both dev (server/) and prod (dist/)
  const uploadDir = path.join(process.cwd(), 'server', 'uploads');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  const upload = multer({
    storage: multer.diskStorage({
      destination: uploadDir,
      filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + file.originalname);
      }
    }),
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB limit
    },
    fileFilter: (req, file, cb) => {
      // Allow images and PDFs
      const allowedTypes = /jpeg|jpg|png|gif|pdf/;
      const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
      const mimetype = allowedTypes.test(file.mimetype);

      if (extname && mimetype) {
        return cb(null, true);
      } else {
        cb(new Error('Only images (JPEG, PNG, GIF) and PDF files are allowed'));
      }
    }
  });

  // Get product images (from product.images array and variant images)
  // MULTI-TENANT: Verify product belongs to tenant
  app.get("/api/products/:id/images", requireAuth, async (req: Request, res: Response) => {
    try {
      // MULTI-TENANT: Verify product belongs to tenant
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      const { id: productId } = req.params;

      // Get product to access images array - MULTI-TENANT: Filter by tenant
      const product = await storage.getProduct(tenantId, productId);
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }

      // Get images from product.images array
      const productImageUrls = product.images || [];

      // Get unique variant images
      const variantImages = await db
        .selectDistinct({ url: productVariants.imageUrl })
        .from(productVariants)
        .where(
          and(
            eq(productVariants.productId, productId),
            isNotNull(productVariants.imageUrl)
          )
        );

      // Combine and deduplicate
      const allImageUrls = new Set([
        ...productImageUrls,
        ...variantImages.map((img) => img.url).filter((url): url is string => url !== null),
      ]);

      const images = Array.from(allImageUrls).map((url) => ({ url }));

      res.json(images);
    } catch (error) {
      console.error("Error fetching product images:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Upload variant image
  app.post("/api/products/:id/variants/:variantId/upload", requireAuth, requireRole(["SuperAdmin", "WarehouseManager", "Editor"]), upload.single('image'), async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No image file uploaded" });
      }

      const { variantId } = req.params;

      // Generate image URL
      const imageUrl = `/uploads/${req.file.filename}`;

      // Update variant with image URL
      const updated = await storage.updateProductVariant(variantId, { imageUrl });
      if (!updated) {
        return res.status(404).json({ message: "Variant not found" });
      }

      res.json({
        message: "Image uploaded successfully",
        imageUrl,
        variant: updated
      });
    } catch (error) {
      console.error("Error uploading variant image:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Serve uploaded files
  app.get('/uploads/:filename', requireAuth, (req, res) => {
    try {
      const filename = req.params.filename;

      // Security: Allow common filename characters (alphanumeric, dash, underscore, dot, space, ampersand, parentheses)
      if (!/^[\w\-. &()]+$/.test(filename)) {
        console.error('Invalid filename requested:', filename);
        return res.status(400).json({ message: "Invalid filename" });
      }

      const filePath = path.join(uploadDir, filename);
      console.log('Attempting to serve file:', filePath);

      if (fs.existsSync(filePath)) {
        // Set appropriate content type
        const ext = path.extname(filename).toLowerCase();
        const contentTypes: { [key: string]: string } = {
          '.pdf': 'application/pdf',
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.png': 'image/png',
          '.gif': 'image/gif'
        };

        const contentType = contentTypes[ext] || 'application/octet-stream';
        res.setHeader('Content-Type', contentType);
        res.sendFile(filePath);
      } else {
        console.error('File not found:', filePath);
        res.status(404).json({ message: "File not found" });
      }
    } catch (error) {
      console.error('Error serving file:', error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get user notifications (legacy endpoint)
  app.get("/api/notifications", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.user as User;
      const tenantId = getTenantId(req);
      const category = req.query.category as string | undefined;

      // If tenant context exists, use the new category-based method
      if (tenantId) {
        const notifications = await storage.getNotificationsByCategory(tenantId, category, 50);
        return res.json(notifications);
      }

      // Fallback to user-based notifications for backward compatibility
      const notifications = await storage.getUserNotifications(user.id);
      res.json(notifications);
    } catch (error) {
      console.error("Error fetching notifications:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get notification counts for badge
  app.get("/api/notifications/counts", requireAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      const counts = await storage.getNotificationCounts(tenantId);
      res.json(counts);
    } catch (error) {
      console.error("Error fetching notification counts:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Mark all notifications as read (optionally by category)
  app.post("/api/notifications/mark-all-read", requireAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      const category = req.query.category as string | undefined;
      const markedCount = await storage.markAllNotificationsRead(tenantId, category);
      res.json({ success: true, markedCount });
    } catch (error) {
      console.error("Error marking notifications as read:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Refresh aggregated notifications (trigger re-aggregation)
  app.post("/api/notifications/refresh", requireAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      // Dynamically import to avoid circular dependencies
      const { aggregateNotifications } = await import("./services/notification-aggregator.service");
      const results = await aggregateNotifications(tenantId);

      // Get fresh counts after aggregation
      const counts = await storage.getNotificationCounts(tenantId);

      res.json({
        success: true,
        aggregated: results.length,
        counts
      });
    } catch (error) {
      console.error("Error refreshing notifications:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Dismiss a notification - MULTI-TENANT: Requires tenant context for security
  app.post("/api/notifications/:id/dismiss", requireAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }
      await storage.dismissNotification(tenantId, req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error dismissing notification:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get all users (SuperAdmin and WarehouseManager)
  // MULTI-TENANT: Added tenant isolation
  app.get("/api/users", requireAuth, requireRole(["SuperAdmin", "WarehouseManager"]), async (req: Request, res: Response) => {
    try {
      // MULTI-TENANT: Extract and validate tenant context
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      const users = await storage.getAllUsers(tenantId);
      // Remove password field for security
      const safeUsers = users.map(({ password, ...user }) => user);
      res.json(safeUsers);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Update user by ID (SuperAdmin only)
  // MULTI-TENANT: Added tenant isolation
  app.put("/api/users/:userId", requireAuth, requireRole(["SuperAdmin"]), async (req: Request, res: Response) => {
    try {
      // MULTI-TENANT: Extract and validate tenant context
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      const { userId } = req.params;
      const updateSchema = z.object({
        email: z.string().email().optional(),
        firstName: z.string().optional(),
        lastName: z.string().optional(),
        role: z.enum(["SuperAdmin", "WarehouseManager", "Editor", "Auditor"]).optional(),
        accountStatus: z.enum(["pending", "active", "suspended", "rejected"]).optional(),
        password: z.string().min(8).optional(),
      });

      const updates = updateSchema.parse(req.body);

      // MULTI-TENANT: Check if user exists and belongs to this tenant
      const existingUser = await storage.getUser(userId);
      if (!existingUser || existingUser.tenantId !== tenantId) {
        return res.status(404).json({ message: "User not found" });
      }

      // Hash password if provided (use bcrypt, consistent with auth.ts)
      if (updates.password) {
        const bcrypt = await import("bcrypt");
        updates.password = await bcrypt.default.hash(updates.password, 10);
      }

      // Update user
      const updatedUser = await storage.updateUser(tenantId, userId, updates);

      if (!updatedUser) {
        return res.status(404).json({ message: "User not found" });
      }

      // Return updated user without password
      const { password, ...safeUser } = updatedUser;
      res.json(safeUser);
    } catch (error) {
      console.error("Error updating user:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid input", errors: error.errors });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Update user profile (authenticated users can update their own profile)
  app.put("/api/user/profile", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.user as User;
      const updateSchema = z.object({
        email: z.string().email().optional(),
        firstName: z.string().optional(),
        lastName: z.string().optional(),
        currentPassword: z.string().optional(),
        newPassword: z.string().min(6).optional(),
      });

      const updates = updateSchema.parse(req.body);

      // If changing password, verify current password first
      if (updates.newPassword) {
        if (!updates.currentPassword) {
          return res.status(400).json({ message: "Current password required to change password" });
        }

        const storedUser = await storage.getUser(user.id);
        if (!storedUser) {
          return res.status(404).json({ message: "User not found" });
        }

        // Import comparePasswords from auth.ts (we'll need to export it)
        const { scrypt, timingSafeEqual } = await import("crypto");
        const { promisify } = await import("util");
        const scryptAsync = promisify(scrypt);
        const [hashed, salt] = storedUser.password.split(".");
        const hashedBuf = Buffer.from(hashed, "hex");
        const suppliedBuf = (await scryptAsync(updates.currentPassword, salt, 64)) as Buffer;

        if (!timingSafeEqual(hashedBuf, suppliedBuf)) {
          return res.status(401).json({ message: "Current password is incorrect" });
        }

        // Hash new password
        const randomBytes = (await import("crypto")).randomBytes;
        const newSalt = randomBytes(16).toString("hex");
        const newHashedBuf = (await scryptAsync(updates.newPassword, newSalt, 64)) as Buffer;
        const hashedPassword = `${newHashedBuf.toString("hex")}.${newSalt}`;

        // MULTI-TENANT: Update with new password (user.tenantId is their own tenant)
        await storage.updateUser(user.tenantId!, user.id, {
          email: updates.email,
          firstName: updates.firstName,
          lastName: updates.lastName,
          password: hashedPassword,
        });
      } else {
        // MULTI-TENANT: Update without password change (user.tenantId is their own tenant)
        await storage.updateUser(user.tenantId!, user.id, {
          email: updates.email,
          firstName: updates.firstName,
          lastName: updates.lastName,
        });
      }

      // Return updated user without password
      const updatedUser = await storage.getUser(user.id);
      if (!updatedUser) {
        return res.status(404).json({ message: "User not found" });
      }

      const { password, ...safeUser } = updatedUser;
      res.json(safeUser);
    } catch (error) {
      console.error("Error updating profile:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid input", errors: error.errors });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Complete user profile (first-time login)
  app.post("/api/user/complete-profile", requireAuth, async (req: Request, res: Response) => {
    try {
      const sessionUser = req.user as User;
      console.log("=== COMPLETE PROFILE ENDPOINT ===");
      console.log("Session user:", sessionUser.username, sessionUser.id);
      console.log("Session user profileCompleted:", sessionUser.profileCompleted);
      console.log("Request body:", req.body);

      // Fetch fresh user data from database to avoid stale session data
      const freshUser = await storage.getUser(sessionUser.id);
      console.log("Fresh user from DB:", freshUser ? freshUser.username : "not found");
      console.log("Fresh user profileCompleted:", freshUser?.profileCompleted);

      if (!freshUser) {
        console.log("ERROR: User not found in database");
        return res.status(404).json({ message: "User not found" });
      }

      // Check if profile is already completed (using fresh data)
      if (freshUser.profileCompleted) {
        console.log("Profile already completed for user:", freshUser.username);
        return res.status(400).json({ message: "Profile already completed" });
      }

      // Validate input (international format: +1 555-123-4567)
      const profileSchema = z.object({
        phoneNumber: z.string()
          .min(10, "Phone number is too short")
          .max(30, "Phone number is too long"),
      });

      const { phoneNumber } = profileSchema.parse(req.body);
      console.log("Validated phone number:", phoneNumber);

      // Update user profile
      console.log("Calling storage.completeUserProfile...");
      const updatedUser = await storage.completeUserProfile(freshUser.id, phoneNumber);
      console.log("Update result:", updatedUser ? "Success" : "Failed");

      if (!updatedUser) {
        console.log("ERROR: Update returned undefined");
        return res.status(404).json({ message: "Failed to update profile" });
      }

      // Return updated user without password
      const { password, ...safeUser } = updatedUser;
      console.log("Returning user:", safeUser.username);
      console.log("Profile completed:", safeUser.profileCompleted);
      console.log("Phone number:", safeUser.phoneNumber);
      console.log("=== END COMPLETE PROFILE ===");

      return res.json(safeUser);
    } catch (error) {
      console.error("=== ERROR IN COMPLETE PROFILE ===");
      console.error("Error type:", error instanceof Error ? error.constructor.name : typeof error);
      console.error("Error message:", error instanceof Error ? error.message : error);
      console.error("Full error:", error);
      if (error instanceof z.ZodError) {
        console.log("Zod validation error:", error.errors);
        return res.status(400).json({ message: "Invalid input", errors: error.errors });
      }
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // Analytics endpoints (SuperAdmin only)
  app.get("/api/analytics/employee-performance", requireAuth, requireRole(["SuperAdmin"]), async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }
      const performanceData = await storage.getEmployeePerformanceMetrics(tenantId);
      res.json(performanceData);
    } catch (error) {
      console.error("Error fetching employee performance:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/analytics/employee/:userId", requireAuth, requireRole(["SuperAdmin"]), async (req: Request, res: Response) => {
    try {
      // MULTI-TENANT: Extract and validate tenant context
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      const { userId } = req.params;
      const detailedData = await storage.getEmployeePerformanceDetail(tenantId, userId);

      if (!detailedData) {
        return res.status(404).json({ message: "Employee not found" });
      }

      res.json(detailedData);
    } catch (error) {
      console.error("Error fetching employee detail:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get team averages
  app.get("/api/analytics/team-averages", requireAuth, requireRole(["SuperAdmin"]), async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }
      const averages = await storage.getTeamAverages(tenantId);
      res.json(averages);
    } catch (error) {
      console.error("Error fetching team averages:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get leaderboard by category
  app.get("/api/analytics/leaderboard/:category", requireAuth, requireRole(["SuperAdmin"]), async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }
      const category = req.params.category as 'completion' | 'speed' | 'onTime' | 'quality';

      if (!['completion', 'speed', 'onTime', 'quality'].includes(category)) {
        return res.status(400).json({ message: "Invalid leaderboard category" });
      }

      const leaderboard = await storage.getLeaderboard(tenantId, category);
      res.json(leaderboard);
    } catch (error) {
      console.error("Error fetching leaderboard:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Sync navigation menus from Shopify
  app.post("/api/navigation/sync", requireAuth, requireRole(["SuperAdmin", "WarehouseManager"]), async (req: Request, res: Response) => {
    try {
      // MULTI-TENANT: Get tenant from authenticated user
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      console.log("📡 Starting navigation menu sync...");
      const result = await shopifyService.pullNavigationMenusFromShopify(tenantId);

      res.json({
        success: result.success,
        menusCount: result.menusCount,
        itemsCount: result.itemsCount,
        collectionItemsCount: result.collectionItemsCount,
        errors: result.errors,
      });
    } catch (error) {
      console.error("Error syncing navigation menus:", error);
      res.status(500).json({ message: "Internal server error", error: String(error) });
    }
  });

  // Get collections that are in navigation menus
  app.get("/api/navigation/collections", requireAuth, async (req: Request, res: Response) => {
    try {
      // MULTI-TENANT: Get tenant from authenticated user
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      const collectionsInNav = await shopifyService.getCollectionsInNavigation(tenantId);

      // Convert Map to array of objects for JSON response
      const result: Array<{ shopifyCollectionId: string; menuTitle: string; itemTitle: string }> = [];
      collectionsInNav.forEach((info, collectionId) => {
        result.push({
          shopifyCollectionId: collectionId,
          menuTitle: info.menuTitle,
          itemTitle: info.itemTitle,
        });
      });

      res.json({ collectionsInNavigation: result });
    } catch (error) {
      console.error("Error getting collections in navigation:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Detect broken navigation links (menu items pointing to deleted collections)
  app.get("/api/navigation/broken-links", requireAuth, async (req: Request, res: Response) => {
    try {
      // MULTI-TENANT: Get tenant from authenticated user
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      // Get all navigation items that link to collections
      const { db } = await import("./db");
      const { navigationItems, navigationMenus, collections } = await import("@shared/schema");
      const { eq, and, isNotNull, sql } = await import("drizzle-orm");

      // Find all COLLECTION type nav items for this tenant
      const collectionNavItems = await db
        .select({
          itemId: navigationItems.id,
          itemTitle: navigationItems.title,
          targetId: navigationItems.targetId,
          targetUrl: navigationItems.targetUrl,
          menuId: navigationItems.menuId,
          menuTitle: navigationMenus.title,
          menuHandle: navigationMenus.handle,
        })
        .from(navigationItems)
        .innerJoin(navigationMenus, eq(navigationItems.menuId, navigationMenus.id))
        .where(
          and(
            eq(navigationItems.tenantId, tenantId),
            eq(navigationItems.type, "COLLECTION"),
            isNotNull(navigationItems.targetId)
          )
        );

      // Get all collection Shopify IDs
      const existingCollections = await db
        .select({ shopifyCollectionId: collections.shopifyCollectionId })
        .from(collections)
        .where(
          and(
            eq(collections.tenantId, tenantId),
            isNotNull(collections.shopifyCollectionId)
          )
        );

      const existingCollectionIds = new Set(
        existingCollections
          .map(c => c.shopifyCollectionId)
          .filter((id): id is string => id !== null)
      );

      // Find broken links (nav items pointing to non-existent collections)
      const brokenLinks = collectionNavItems.filter(item => {
        if (!item.targetId) return false;
        // Shopify collection IDs in navigation are in format "gid://shopify/Collection/123"
        // Collections table stores them the same way
        return !existingCollectionIds.has(item.targetId);
      });

      res.json({
        totalCollectionLinks: collectionNavItems.length,
        brokenLinksCount: brokenLinks.length,
        healthyLinksCount: collectionNavItems.length - brokenLinks.length,
        brokenLinks: brokenLinks.map(link => ({
          itemId: link.itemId,
          itemTitle: link.itemTitle,
          targetId: link.targetId,
          targetUrl: link.targetUrl,
          menuTitle: link.menuTitle,
          menuHandle: link.menuHandle,
        })),
      });
    } catch (error) {
      console.error("Error detecting broken navigation links:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get all navigation menus with their items (for Navigation page)
  app.get("/api/navigation/menus", requireAuth, async (req: Request, res: Response) => {
    try {
      // MULTI-TENANT: Get tenant from authenticated user
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      // Get all menus
      const menus = await storage.getNavigationMenus(tenantId);

      // For each menu, get its items and build tree structure
      const menusWithItems = await Promise.all(
        menus.map(async (menu) => {
          const items = await storage.getNavigationItems(menu.id);

          // Build tree structure from flat items list
          const itemMap = new Map<string, any>();
          const rootItems: any[] = [];

          // First pass: create all item objects
          items.forEach((item) => {
            itemMap.set(item.id, {
              id: item.id,
              shopifyItemId: item.shopifyItemId,
              title: item.title,
              type: item.type,
              targetId: item.targetId,
              targetUrl: item.targetUrl,
              position: item.position,
              children: [],
            });
          });

          // Second pass: build tree
          items.forEach((item) => {
            const itemObj = itemMap.get(item.id);
            if (item.parentItemId && itemMap.has(item.parentItemId)) {
              itemMap.get(item.parentItemId).children.push(itemObj);
            } else {
              rootItems.push(itemObj);
            }
          });

          // Sort by position
          rootItems.sort((a, b) => a.position - b.position);
          rootItems.forEach((item) => {
            item.children.sort((a: any, b: any) => a.position - b.position);
          });

          return {
            id: menu.id,
            shopifyMenuId: menu.shopifyMenuId,
            title: menu.title,
            handle: menu.handle,
            itemCount: menu.itemCount,
            syncedAt: menu.syncedAt,
            items: rootItems,
          };
        })
      );

      res.json({
        menus: menusWithItems,
        total: menusWithItems.length,
      });
    } catch (error) {
      console.error("Error getting navigation menus:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ============================================================================
  // EDUCATION CENTER ROUTES
  // ============================================================================

  // Get all education articles (global)
  app.get("/api/education/articles", requireAuth, async (req: Request, res: Response) => {
    try {
      const { category, issueType } = req.query;

      const articles = await storage.getEducationArticles({
        isActive: true,
        category: category as string | undefined,
        relevantIssueType: issueType as string | undefined,
      });

      res.json({
        articles,
        total: articles.length,
      });
    } catch (error) {
      console.error("Error getting education articles:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get single education article by slug
  app.get("/api/education/articles/:slug", requireAuth, async (req: Request, res: Response) => {
    try {
      const { slug } = req.params;

      const article = await storage.getEducationArticleBySlug(slug);

      if (!article) {
        return res.status(404).json({ message: "Article not found" });
      }

      if (!article.isActive) {
        return res.status(404).json({ message: "Article not found" });
      }

      res.json(article);
    } catch (error) {
      console.error("Error getting education article:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get global app education library
  app.get("/api/education/apps/library", requireAuth, async (req: Request, res: Response) => {
    try {
      const { verified, createsCollections, riskLevel } = req.query;

      const apps = await storage.getAppEducationLibrary({
        isVerified: verified === 'true' ? true : verified === 'false' ? false : undefined,
        createsCollections: createsCollections === 'true' ? true : createsCollections === 'false' ? false : undefined,
        riskLevel: riskLevel as string | undefined,
      });

      res.json({
        apps,
        total: apps.length,
      });
    } catch (error) {
      console.error("Error getting app education library:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get app education library entry by ID
  app.get("/api/education/apps/library/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const app = await storage.getAppEducationLibraryById(id);

      if (!app) {
        return res.status(404).json({ message: "App not found in education library" });
      }

      res.json(app);
    } catch (error) {
      console.error("Error getting app from education library:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get tenant's detected apps (with library info joined)
  app.get("/api/education/apps", requireAuth, async (req: Request, res: Response) => {
    try {
      // MULTI-TENANT: Get tenant from authenticated user
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }
      const { includeHidden } = req.query;

      const apps = await storage.getTenantDetectedApps(tenantId, {
        includeHidden: includeHidden === 'true',
      });

      // Also get the global library for apps not yet detected
      const libraryApps = await storage.getAppEducationLibrary({ isVerified: true });

      // Find library apps that haven't been detected yet
      const detectedAppIds = new Set(apps.map(a => a.libraryAppId).filter(Boolean));
      const undetectedApps = libraryApps.filter(la => !detectedAppIds.has(la.id));

      res.json({
        detectedApps: apps,
        libraryApps: undetectedApps, // Apps in library but not yet detected for this tenant
        totalDetected: apps.length,
        totalLibrary: libraryApps.length,
      });
    } catch (error) {
      console.error("Error getting tenant detected apps:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Update tenant detected app (e.g., hide it, add notes)
  app.patch("/api/education/apps/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { customNotes, isHidden } = req.body;

      const updated = await storage.updateTenantDetectedApp(id, {
        customNotes,
        isHidden,
      });

      if (!updated) {
        return res.status(404).json({ message: "Detected app not found" });
      }

      res.json(updated);
    } catch (error) {
      console.error("Error updating tenant detected app:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Detect apps from collection creators (run during sync or manually)
  app.post("/api/education/detect-apps", requireAuth, async (req: Request, res: Response) => {
    try {
      // MULTI-TENANT: Get tenant from authenticated user
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      // Get all collections with creator info
      const { collections } = await storage.getAllCollections(tenantId, { limit: 100000 });

      // Track which apps we've found
      const detectedApps = new Map<string, { count: number; libraryApp?: any }>();

      for (const collection of collections) {
        const creatorName = collection.createdByName;
        if (!creatorName || collection.createdByType !== 'app') continue;

        if (!detectedApps.has(creatorName)) {
          // Try to find matching library app
          const libraryApp = await storage.findMatchingLibraryApp(creatorName);
          detectedApps.set(creatorName, { count: 0, libraryApp });
        }

        const entry = detectedApps.get(creatorName)!;
        entry.count++;
      }

      // Upsert detected apps to database
      const results: any[] = [];
      for (const [appName, data] of detectedApps) {
        const result = await storage.upsertTenantDetectedApp(
          tenantId,
          appName,
          data.libraryApp?.id
        );
        results.push({
          detectedName: appName,
          collectionsCreated: data.count,
          hasLibraryMatch: !!data.libraryApp,
          libraryAppName: data.libraryApp?.appName,
        });
      }

      res.json({
        success: true,
        appsDetected: results.length,
        apps: results,
      });
    } catch (error) {
      console.error("Error detecting apps:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // NOTE: Sync progress, unified sync, and related routes moved to ./routes/shopify-sync.routes.ts
  // Get all vendors
  // MULTI-TENANT: Filter by authenticated user's tenant
  app.get("/api/vendors", requireAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      const vendors = await storage.getAllVendors(tenantId);
      res.json(vendors);
    } catch (error) {
      console.error("Error fetching vendors:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Create new vendor
  // MULTI-TENANT: Associate vendor with authenticated user's tenant
  app.post("/api/vendors", requireAuth, requireRole(["SuperAdmin", "WarehouseManager", "Editor"]), async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      const vendorData = insertVendorSchema.parse(req.body);

      // MULTI-TENANT: Check if vendor already exists within this tenant
      const existingVendor = await storage.getVendorByName(tenantId, vendorData.name);
      if (existingVendor) {
        return res.status(409).json({ message: "Vendor with this name already exists" });
      }

      // MULTI-TENANT: Set tenantId from authenticated user
      const vendor = await storage.createVendor({ ...vendorData, tenantId });
      res.status(201).json(vendor);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid vendor data", errors: error.errors });
      }
      console.error("Error creating vendor:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get vendors with statistics
  // MULTI-TENANT: Filter by authenticated user's tenant
  app.get("/api/vendors/stats", requireAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      const vendorsWithStats = await storage.getVendorsWithStats(tenantId);
      res.json(vendorsWithStats);
    } catch (error) {
      console.error("Error fetching vendor statistics:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Update vendor
  // MULTI-TENANT: Verify vendor belongs to authenticated user's tenant
  app.patch("/api/vendors/:id", requireAuth, requireRole(["SuperAdmin", "WarehouseManager", "Editor"]), async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      const { id } = req.params;
      const updateData = insertVendorSchema.partial().parse(req.body);

      // MULTI-TENANT: Check if new name already exists within this tenant (if name is being updated)
      if (updateData.name) {
        const existingVendor = await storage.getVendorByName(tenantId, updateData.name);
        if (existingVendor && existingVendor.id !== id) {
          return res.status(409).json({ message: "Vendor with this name already exists" });
        }
      }

      // MULTI-TENANT: Update only if vendor belongs to tenant (returns undefined if not found/not owned)
      const updatedVendor = await storage.updateVendor(tenantId, id, updateData);
      if (!updatedVendor) {
        // Return 404 to not reveal existence of vendors from other tenants
        return res.status(404).json({ message: "Vendor not found" });
      }

      res.json(updatedVendor);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid vendor data", errors: error.errors });
      }
      console.error("Error updating vendor:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Delete vendor
  // MULTI-TENANT: Verify vendor belongs to authenticated user's tenant
  app.delete("/api/vendors/:id", requireAuth, requireRole(["SuperAdmin", "WarehouseManager"]), async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      const { id } = req.params;

      // MULTI-TENANT: Check if vendor exists and has associated products (within tenant)
      const vendorsWithStats = await storage.getVendorsWithStats(tenantId);
      const vendor = vendorsWithStats.find(v => v.id === id);

      if (!vendor) {
        // Return 404 to not reveal existence of vendors from other tenants
        return res.status(404).json({ message: "Vendor not found" });
      }

      if (vendor.productCount > 0) {
        return res.status(409).json({
          message: `Cannot delete vendor. ${vendor.productCount} products are associated with this vendor.`
        });
      }

      // MULTI-TENANT: Delete only if vendor belongs to tenant
      const deleted = await storage.deleteVendor(tenantId, id);
      if (!deleted) {
        return res.status(404).json({ message: "Vendor not found" });
      }

      res.json({ message: "Vendor deleted successfully" });
    } catch (error) {
      console.error("Error deleting vendor:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Mark notification as read - MULTI-TENANT: Requires tenant context for security
  app.patch("/api/notifications/:id/read", requireAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }
      await storage.markNotificationReadSecure(tenantId, req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error marking notification as read:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ==================== Product Insights API ====================

  // Get complete insights dashboard data
  // MULTI-TENANT: Added tenantId filter
  app.get("/api/products/insights/dashboard", requireAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }
      const dashboardData = await productInsightsService.getDashboardData(tenantId);
      res.json(dashboardData);
    } catch (error: any) {
      console.error("Error fetching insights dashboard:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch insights data",
        error: safeErrorMessage(error),
      });
    }
  });

  // Get status overview only
  // MULTI-TENANT: Added tenantId filter
  app.get("/api/products/insights/status", requireAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }
      const statusOverview = await productInsightsService.getStatusOverview(tenantId);
      res.json(statusOverview);
    } catch (error: any) {
      console.error("Error fetching status overview:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch status overview",
        error: safeErrorMessage(error),
      });
    }
  });

  // Get data quality metrics only
  // MULTI-TENANT: Added tenantId filter
  app.get("/api/products/insights/quality", requireAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }
      const dataQuality = await productInsightsService.getDataQuality(tenantId);
      res.json(dataQuality);
    } catch (error: any) {
      console.error("Error fetching data quality metrics:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch data quality metrics",
        error: safeErrorMessage(error),
      });
    }
  });

  // Get top vendors
  // MULTI-TENANT: Added tenantId filter
  app.get("/api/products/insights/vendors", requireAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }
      const limit = parseInt(req.query.limit as string) || 10;
      const topVendors = await productInsightsService.getTopVendors(tenantId, limit);
      res.json(topVendors);
    } catch (error: any) {
      console.error("Error fetching top vendors:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch top vendors",
        error: safeErrorMessage(error),
      });
    }
  });

  // Get products with specific data quality issue
  // MULTI-TENANT: Added tenantId filter
  app.get("/api/products/insights/quality/:issue", requireAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }
      const issue = req.params.issue as 'missing-images' | 'missing-descriptions' | 'missing-vendors' | 'zero-price';
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;

      const result = await productInsightsService.getProductsByQualityIssue(tenantId, issue, limit, offset);
      res.json(result);
    } catch (error: any) {
      console.error("Error fetching products by quality issue:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch products",
        error: safeErrorMessage(error),
      });
    }
  });

  // Get duplicate SKUs
  // MULTI-TENANT: Added tenantId filter
  app.get("/api/products/insights/duplicate-skus", requireAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }
      const duplicates = await productInsightsService.getDuplicateSKUs(tenantId);
      res.json(duplicates);
    } catch (error: any) {
      console.error("Error fetching duplicate SKUs:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch duplicate SKUs",
        error: safeErrorMessage(error),
      });
    }
  });

  // Clear insights cache (for manual refresh)
  // MULTI-TENANT: Clears cache for the current tenant only
  app.post("/api/products/insights/clear-cache", requireAuth, requireRole(["SuperAdmin", "WarehouseManager"]), async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }
      clearInsightsCache(tenantId);
      res.json({
        success: true,
        message: "Insights cache cleared successfully",
      });
    } catch (error: any) {
      console.error("Error clearing insights cache:", error);
      res.status(500).json({
        success: false,
        message: "Failed to clear insights cache",
        error: safeErrorMessage(error),
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}

