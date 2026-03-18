/**
 * Task Management API Routes
 *
 * Endpoints for task CRUD, status transitions, task steps, step templates,
 * task attachments/links, and task publishing to Shopify.
 *
 * Authentication: All endpoints require authentication
 * Authorization: Role-based access varies by endpoint
 */

import type { Express, Request, Response, NextFunction } from "express";
import { z } from "zod";
import path from "path";
import fs from "fs";
import multer from "multer";
import { storage } from "../storage";
import { safeErrorMessage } from "../utils/safe-error";
import { shopifyService } from "../shopify";
import { insertTaskStepSchema, insertStepTemplateSchema, User } from "@shared/schema";

// ============================================================
// Helper Functions
// ============================================================

// Helper function to determine valid state transitions based on role
function getValidTransitions(currentStatus: string, role: string): string[] {
  const transitions: Record<string, Record<string, string[]>> = {
    NEW: {
      SuperAdmin: ["TRIAGE", "ASSIGNED", "DONE"],
      WarehouseManager: ["TRIAGE", "ASSIGNED"],
      Editor: [],
      Auditor: []
    },
    TRIAGE: {
      SuperAdmin: ["ASSIGNED", "NEW", "DONE"],
      WarehouseManager: ["ASSIGNED", "NEW"],
      Editor: ["ASSIGNED"],
      Auditor: []
    },
    ASSIGNED: {
      SuperAdmin: ["IN_PROGRESS", "TRIAGE", "DONE"],
      WarehouseManager: ["IN_PROGRESS", "TRIAGE"],
      Editor: ["IN_PROGRESS", "TRIAGE"],
      Auditor: []
    },
    IN_PROGRESS: {
      SuperAdmin: ["READY_FOR_REVIEW", "ASSIGNED", "DONE"],
      WarehouseManager: ["READY_FOR_REVIEW", "ASSIGNED"],
      Editor: ["READY_FOR_REVIEW", "ASSIGNED"],
      Auditor: []
    },
    READY_FOR_REVIEW: {
      SuperAdmin: ["PUBLISHED", "IN_PROGRESS", "QA_APPROVED"],
      WarehouseManager: ["PUBLISHED", "IN_PROGRESS"],
      Editor: [],
      Auditor: ["IN_PROGRESS"] // Can send back for changes
    },
    PUBLISHED: {
      SuperAdmin: ["QA_APPROVED", "READY_FOR_REVIEW", "DONE"],
      WarehouseManager: ["QA_APPROVED"],
      Editor: [],
      Auditor: ["QA_APPROVED", "READY_FOR_REVIEW"]
    },
    QA_APPROVED: {
      SuperAdmin: ["DONE", "PUBLISHED"],
      WarehouseManager: [],
      Editor: [],
      Auditor: ["DONE"]
    },
    DONE: {
      SuperAdmin: ["QA_APPROVED", "PUBLISHED", "IN_PROGRESS"], // Can reopen completed tasks
      WarehouseManager: ["QA_APPROVED", "PUBLISHED"], // Can reopen for QA review
      Editor: [],
      Auditor: []
    }
  };

  return transitions[currentStatus]?.[role] || [];
}

// Helper function to create notifications for status changes
async function createStatusChangeNotification(task: any, newStatus: string, userId: string) {
  try {
    let notificationUsers: string[] = [];
    let title = "";
    let message = "";

    switch (newStatus) {
      case "TRIAGE":
        // Notify warehouse managers
        title = "New Task in Triage";
        message = `Task "${task.title}" needs to be assigned`;
        // Would need to query for WarehouseManager users
        break;
      case "READY_FOR_REVIEW":
        // Notify auditors and admins
        title = "Task Ready for Review";
        message = `Task "${task.title}" is ready for quality review`;
        break;
      case "PUBLISHED":
        // Notify creator and assigned user
        title = "Task Published";
        message = `Task "${task.title}" has been published to Shopify`;
        if (task.assignedTo) notificationUsers.push(task.assignedTo);
        notificationUsers.push(task.createdBy);
        break;
    }

    // Create notifications for relevant users
    for (const recipientId of notificationUsers) {
      if (recipientId !== userId) { // Don't notify the user who made the change
        await storage.createNotification({
          userId: recipientId,
          taskId: task.id,
          title,
          message,
          category: "system",
          severity: "info",
          metadata: {},
        });
      }
    }
  } catch (error) {
    console.error("Error creating status change notification:", error);
  }
}

// ============================================================
// Route Registration
// ============================================================

export function registerTaskRoutes(
  app: Express,
  requireAuth: (req: Request, res: Response, next: NextFunction) => void,
  requireRole: (roles: string[]) => (req: Request, res: Response, next: NextFunction) => void
) {
  const getTenantId = (req: Request): string | null => {
    const user = req.user as User | undefined;
    return user?.tenantId ?? null;
  };

  // ============================================================
  // Task CRUD Routes
  // ============================================================

  // Get all tasks
  // MULTI-TENANT: Added tenant isolation
  app.get("/api/tasks", requireAuth, async (req: Request, res: Response) => {
    try {
      // MULTI-TENANT: Extract and validate tenant context
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      // Auto-return stale tasks (tasks in ASSIGNED for > 2 days)
      const returned = await storage.autoReturnStaleTasks(tenantId);
      if (returned > 0) {
        console.log(`Auto-returned ${returned} stale task(s) from ASSIGNED to TRIAGE`);
      }

      const { status, assignedTo, vendorId } = req.query;
      const filters: any = {};

      if (status) filters.status = status as string;
      if (assignedTo) filters.assignedTo = assignedTo as string;
      if (vendorId) filters.vendorId = vendorId as string;

      // No role-based filtering - all users can see all tasks
      // Editors need to see tasks in TRIAGE to claim them

      const tasks = await storage.getTasks(tenantId, filters);
      res.json(tasks);
    } catch (error) {
      console.error("Error fetching tasks:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get single task
  // MULTI-TENANT: Added tenant isolation
  app.get("/api/tasks/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      // MULTI-TENANT: Extract and validate tenant context
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      const task = await storage.getTask(tenantId, req.params.id);
      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }

      // All authenticated users can view any task
      // Editors need to see task details to decide if they want to claim it

      res.json(task);
    } catch (error) {
      console.error("Error fetching task:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Create new task (without product)
  // MULTI-TENANT: Task is created with user's tenantId
  app.post("/api/tasks", requireAuth, requireRole(["SuperAdmin", "WarehouseManager", "Editor"]), async (req: Request, res: Response) => {
    try {
      const user = req.user as User;

      // MULTI-TENANT: Validate tenant context from authenticated user
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      console.log("=== POST /api/tasks HIT ===");
      console.log("Request body:", JSON.stringify(req.body, null, 2));

      // Create task schema for validation
      const taskDataSchema = z.object({
        title: z.string().min(1, "Title is required"),
        description: z.string().optional().nullable(),
        category: z.string().optional().nullable(),
        priority: z.enum(["high", "medium", "low"]).default("medium"),
        orderNumber: z.string().optional().nullable(),
        orderLink: z.string().optional().nullable(),
        notes: z.string().optional().nullable(),
        receivedDate: z.string().datetime().transform(val => new Date(val)),
        status: z.enum(["NEW", "TRIAGE", "ASSIGNED", "IN_PROGRESS", "READY_FOR_REVIEW", "PUBLISHED", "QA_APPROVED", "DONE"]).default("NEW"),
        createdBy: z.string(),
      });

      const taskData = taskDataSchema.parse(req.body);

      // MULTI-TENANT: Include tenantId when creating task
      const task = await storage.createTask({ ...taskData, tenantId });

      // Set SLA deadline (default 48 hours)
      const slaDeadline = new Date(task.receivedDate);
      slaDeadline.setHours(slaDeadline.getHours() + 48);

      // MULTI-TENANT: Use tenantId for updateTask call
      await storage.updateTask(tenantId, task.id, { slaDeadline });

      console.log("=== SENDING RESPONSE ===");
      console.log("Task created successfully, ID:", task.id);
      console.log("Sending 201 response with task data");
      res.status(201).json(task);
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error("=== VALIDATION ERROR DETAILS ===");
        console.error("Raw request body:", JSON.stringify(req.body, null, 2));
        console.error("Validation errors:", JSON.stringify(error.errors, null, 2));
        console.error("=== END VALIDATION ERROR ===");
        return res.status(400).json({
          message: "Validation error",
          errors: error.errors,
          details: error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
        });
      }
      console.error("Error creating task:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ============================================================
  // Task Routes
  // ============================================================

  // Update task
  // MULTI-TENANT: Added tenant isolation
  app.patch("/api/tasks/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      // MULTI-TENANT: Extract and validate tenant context
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      const task = await storage.getTask(tenantId, req.params.id);
      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }

      // Role-based permissions
      const user = req.user as User;
      const canEdit = user.role === "SuperAdmin" ||
                     (user.role === "WarehouseManager") ||
                     (user.role === "Editor" && (task.assignedTo === user.id || task.createdBy === user.id));

      if (!canEdit) {
        return res.status(403).json({ message: "Cannot edit this task" });
      }

      // Create allowed updates schema - exclude critical fields that must go through proper endpoints
      const baseUpdatesSchema = z.object({
        title: z.string().optional(),
        description: z.string().optional().nullable(),
        notes: z.string().optional(),
        priority: z.enum(["high", "medium", "low"]).optional(),
        slaDeadline: z.string().datetime().optional().transform(val => val ? new Date(val) : undefined),
        checklist: z.record(z.any()).optional(),
        product: z.object({
          title: z.string().optional(),
          description: z.string().optional(),
          price: z.coerce.number().optional(),
          compareAtPrice: z.coerce.number().optional(),
          sku: z.string().optional(),
          barcode: z.string().optional(),
          weight: z.coerce.number().optional(),
          weightUnit: z.string().optional(),
          inventoryQuantity: z.coerce.number().optional(),
          tags: z.array(z.string()).optional(),
          images: z.array(z.string()).optional(),
        }).optional(),
      });

      // Add assignedTo field for SuperAdmin and WarehouseManager only
      const allowedUpdatesSchema = (user.role === "SuperAdmin" || user.role === "WarehouseManager")
        ? baseUpdatesSchema.extend({ assignedTo: z.string().optional() }).strict()
        : baseUpdatesSchema.strict();

      const updates = allowedUpdatesSchema.parse(req.body);

      console.log("Update request body:", JSON.stringify(req.body, null, 2));
      console.log("Parsed updates:", JSON.stringify(updates, null, 2));

      // MULTI-TENANT: Use tenantId for updateTask call
      const updatedTask = await storage.updateTask(tenantId, req.params.id, updates);

      console.log("Updated task returned:", JSON.stringify(updatedTask, null, 2));

      res.json(updatedTask);
    } catch (error) {
      console.error("Error updating task:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Update task status (state machine transitions)
  // MULTI-TENANT: Added tenant isolation
  app.patch("/api/tasks/:id/status", requireAuth, async (req: Request, res: Response) => {
    try {
      // MULTI-TENANT: Extract and validate tenant context
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      const { status } = req.body;
      const task = await storage.getTask(tenantId, req.params.id);

      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }

      // Validate state transitions based on role
      const user = req.user as User;
      const validTransitions = getValidTransitions(task.status, user.role);
      if (!validTransitions.includes(status)) {
        return res.status(400).json({
          message: "Invalid status transition",
          currentStatus: task.status,
          attemptedStatus: status,
          validTransitions
        });
      }

      // Auto-assign task to user when moving from TRIAGE to ASSIGNED
      if (task.status === "TRIAGE" && status === "ASSIGNED") {
        // Automatically assign to the user who claimed the task
        // MULTI-TENANT: Use tenantId for updateTask call
        await storage.updateTask(tenantId, req.params.id, { assignedTo: user.id });
      }

      // Enforce 2-task limit for Editors moving tasks to ASSIGNED
      if (status === "ASSIGNED" && user.role === "Editor") {
        // Count tasks currently in ASSIGNED for this Editor
        // MULTI-TENANT: Use tenantId for getTasks call
        const assignedTasks = await storage.getTasks(tenantId, {
          status: "ASSIGNED",
          assignedTo: user.id
        });

        if (assignedTasks.length >= 2) {
          return res.status(400).json({
            message: "Task Limit Reached",
            detail: "You already have 2 tasks in ASSIGNED. Please start working on them (move to IN_PROGRESS) or complete your current tasks before claiming more.",
            currentAssignedCount: assignedTasks.length,
            limit: 2
          });
        }
      }

      // MULTI-TENANT: Use tenantId for updateTaskStatus call
      const updatedTask = await storage.updateTaskStatus(tenantId, req.params.id, status, user.id);

      // Trigger Shopify publishing when task reaches PUBLISHED status - MULTI-TENANT
      if (status === "PUBLISHED" && task.product) {
        console.log(`Task ${task.id} reached PUBLISHED status, publishing to Shopify...`);
        const publishResult = await shopifyService.publishProduct(tenantId, task.product);
        if (publishResult) {
          console.log(`Successfully published product to Shopify: ${publishResult.shopifyProductId}`);
        } else {
          console.error(`Failed to publish product to Shopify for task ${task.id}`);
        }
      }

      // Create notification for relevant users
      await createStatusChangeNotification(task, status, user.id);

      res.json(updatedTask);
    } catch (error) {
      console.error("Error updating task status:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get task audit log
  app.get("/api/tasks/:id/audit", requireAuth, async (req: Request, res: Response) => {
    try {
      // MULTI-TENANT: Extract and validate tenant context
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      const task = await storage.getTask(tenantId, req.params.id);
      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }

      // All authenticated users can view task history
      const auditLog = await storage.getTaskAuditLog(tenantId, req.params.id);
      res.json(auditLog);
    } catch (error) {
      console.error("Error fetching audit log:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // =============================================
  // TASK STEPS ENDPOINTS
  // =============================================

  // Get all steps for a task
  app.get("/api/tasks/:id/steps", requireAuth, async (req: Request, res: Response) => {
    try {
      // MULTI-TENANT: Extract and validate tenant context
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      const task = await storage.getTask(tenantId, req.params.id);
      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }

      const steps = await storage.getTaskSteps(req.params.id);
      res.json(steps);
    } catch (error) {
      console.error("Error fetching task steps:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Create a new step for a task
  app.post("/api/tasks/:id/steps", requireAuth, async (req: Request, res: Response) => {
    try {
      // MULTI-TENANT: Extract and validate tenant context
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      const task = await storage.getTask(tenantId, req.params.id);
      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }

      // Check permissions
      const user = req.user as User;
      const canEdit = user.role === "SuperAdmin" ||
                     user.role === "WarehouseManager" ||
                     (user.role === "Editor" && (task.assignedTo === user.id || task.createdBy === user.id));

      if (!canEdit) {
        return res.status(403).json({ message: "Cannot add steps to this task" });
      }

      const stepData = insertTaskStepSchema.parse({
        ...req.body,
        taskId: req.params.id
      });

      const newStep = await storage.createTaskStep(stepData);
      res.status(201).json(newStep);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      console.error("Error creating task step:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Update a task step (toggle completion, edit title)
  app.patch("/api/tasks/:id/steps/:stepId", requireAuth, async (req: Request, res: Response) => {
    try {
      // MULTI-TENANT: Extract and validate tenant context
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      const task = await storage.getTask(tenantId, req.params.id);
      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }

      // Check permissions
      const user = req.user as User;
      const canEdit = user.role === "SuperAdmin" ||
                     user.role === "WarehouseManager" ||
                     (user.role === "Editor" && (task.assignedTo === user.id || task.createdBy === user.id));

      if (!canEdit) {
        return res.status(403).json({ message: "Cannot edit steps for this task" });
      }

      const updateSchema = z.object({
        title: z.string().optional(),
        description: z.string().optional(),
        completed: z.boolean().optional(),
        order: z.number().optional(),
        required: z.boolean().optional(),
      });

      const updates = updateSchema.parse(req.body);
      const stepId = parseInt(req.params.stepId);

      if (isNaN(stepId)) {
        return res.status(400).json({ message: "Invalid step ID" });
      }

      // If marking as complete, use the special method to track who completed it
      if (updates.completed === true) {
        const updatedStep = await storage.completeTaskStep(stepId, user.id);
        if (!updatedStep) {
          return res.status(404).json({ message: "Step not found" });
        }
        return res.json(updatedStep);
      }

      const updatedStep = await storage.updateTaskStep(stepId, updates);
      if (!updatedStep) {
        return res.status(404).json({ message: "Step not found" });
      }

      res.json(updatedStep);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      console.error("Error updating task step:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Delete a task step
  app.delete("/api/tasks/:id/steps/:stepId", requireAuth, async (req: Request, res: Response) => {
    try {
      // MULTI-TENANT: Extract and validate tenant context
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      const task = await storage.getTask(tenantId, req.params.id);
      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }

      // Check permissions
      const user = req.user as User;
      const canEdit = user.role === "SuperAdmin" ||
                     user.role === "WarehouseManager" ||
                     (user.role === "Editor" && (task.assignedTo === user.id || task.createdBy === user.id));

      if (!canEdit) {
        return res.status(403).json({ message: "Cannot delete steps from this task" });
      }

      const stepId = parseInt(req.params.stepId);
      if (isNaN(stepId)) {
        return res.status(400).json({ message: "Invalid step ID" });
      }

      const deleted = await storage.deleteTaskStep(stepId);
      if (!deleted) {
        return res.status(404).json({ message: "Step not found" });
      }

      res.json({ message: "Step deleted successfully" });
    } catch (error) {
      console.error("Error deleting task step:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Apply template steps to a task
  app.post("/api/tasks/:id/steps/from-template", requireAuth, async (req: Request, res: Response) => {
    try {
      // MULTI-TENANT: Extract and validate tenant context
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      const task = await storage.getTask(tenantId, req.params.id);
      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }

      // Check permissions
      const user = req.user as User;
      const canEdit = user.role === "SuperAdmin" ||
                     user.role === "WarehouseManager" ||
                     (user.role === "Editor" && (task.assignedTo === user.id || task.createdBy === user.id || !task.assignedTo));

      if (!canEdit) {
        return res.status(403).json({ message: "Cannot add steps to this task" });
      }

      const { category } = z.object({
        category: z.string()
      }).parse(req.body);

      const createdSteps = await storage.applyTemplateSteps(req.params.id, category);
      res.status(201).json(createdSteps);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      console.error("Error applying template steps:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // =============================================
  // STEP TEMPLATES ENDPOINTS (SuperAdmin & WarehouseManager)
  // =============================================

  // Get all step templates
  app.get("/api/step-templates", requireAuth, requireRole(["SuperAdmin", "WarehouseManager"]), async (req: Request, res: Response) => {
    try {
      const templates = await storage.getAllTemplates();
      res.json(templates);
    } catch (error) {
      console.error("Error fetching step templates:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get all template categories
  app.get("/api/step-templates/categories", requireAuth, async (req: Request, res: Response) => {
    try {
      // All authenticated users can see categories (for task creation)
      const categories = await storage.getTemplateCategories();
      res.json(categories);
    } catch (error) {
      console.error("Error fetching template categories:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get templates for a specific category
  app.get("/api/step-templates/by-category/:category", requireAuth, async (req: Request, res: Response) => {
    try {
      // All authenticated users can view templates (for preview during task creation)
      const category = decodeURIComponent(req.params.category);
      const templates = await storage.getTemplatesByCategory(category);
      res.json(templates);
    } catch (error) {
      console.error("Error fetching templates by category:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Create a new step template
  app.post("/api/step-templates", requireAuth, requireRole(["SuperAdmin", "WarehouseManager"]), async (req: Request, res: Response) => {
    try {
      const templateData = insertStepTemplateSchema.parse(req.body);
      const newTemplate = await storage.createTemplate(templateData);
      res.status(201).json(newTemplate);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      console.error("Error creating step template:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Update a step template
  app.patch("/api/step-templates/:id", requireAuth, requireRole(["SuperAdmin", "WarehouseManager"]), async (req: Request, res: Response) => {
    try {
      const templateId = parseInt(req.params.id);
      if (isNaN(templateId)) {
        return res.status(400).json({ message: "Invalid template ID" });
      }

      const updateSchema = z.object({
        title: z.string().optional(),
        description: z.string().optional(),
        category: z.string().optional(),
        order: z.number().optional(),
        required: z.boolean().optional(),
        active: z.boolean().optional(),
      });

      const updates = updateSchema.parse(req.body);
      const updatedTemplate = await storage.updateTemplate(templateId, updates);

      if (!updatedTemplate) {
        return res.status(404).json({ message: "Template not found" });
      }

      res.json(updatedTemplate);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      console.error("Error updating step template:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Delete a step template
  app.delete("/api/step-templates/:id", requireAuth, requireRole(["SuperAdmin", "WarehouseManager"]), async (req: Request, res: Response) => {
    try {
      const templateId = parseInt(req.params.id);
      if (isNaN(templateId)) {
        return res.status(400).json({ message: "Invalid template ID" });
      }

      const deleted = await storage.deleteTemplate(templateId);
      if (!deleted) {
        return res.status(404).json({ message: "Template not found" });
      }

      res.json({ message: "Template deleted successfully" });
    } catch (error) {
      console.error("Error deleting step template:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Reorder a step template within its category
  app.patch("/api/step-templates/:id/reorder", requireAuth, requireRole(["SuperAdmin", "WarehouseManager"]), async (req: Request, res: Response) => {
    try {
      const templateId = parseInt(req.params.id);
      if (isNaN(templateId)) {
        return res.status(400).json({ message: "Invalid template ID" });
      }

      const { newOrder, category } = z.object({
        newOrder: z.number(),
        category: z.string()
      }).parse(req.body);

      await storage.reorderTemplate(templateId, newOrder, category);
      res.json({ message: "Template reordered successfully" });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      console.error("Error reordering step template:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // =============================================
  // TASK ATTACHMENTS & LINKS ENDPOINTS
  // =============================================

  // Configure multer for task file uploads
  const taskUploadDir = path.join(process.cwd(), 'server', 'uploads');
  if (!fs.existsSync(taskUploadDir)) {
    fs.mkdirSync(taskUploadDir, { recursive: true });
  }

  const taskUpload = multer({
    storage: multer.diskStorage({
      destination: taskUploadDir,
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

  // Upload file to task
  app.post("/api/tasks/:id/upload", requireAuth, taskUpload.single('file'), async (req: Request, res: Response) => {
    try {
      // MULTI-TENANT: Extract and validate tenant context
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      const task = await storage.getTask(tenantId, req.params.id);
      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }

      // Check permissions
      const user = req.user as User;
      const canEdit = user.role === "SuperAdmin" ||
                     user.role === "WarehouseManager" ||
                     (user.role === "Editor" && (task.assignedTo === user.id || task.createdBy === user.id));

      if (!canEdit) {
        return res.status(403).json({ message: "Cannot upload files to this task" });
      }

      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      // Get current attachments
      const currentAttachments = (task.attachments as any[]) || [];

      // Add new attachment
      const newAttachment = {
        id: Date.now().toString(),
        name: req.file.originalname,
        filename: req.file.filename,
        url: `/uploads/${req.file.filename}`,
        type: req.file.mimetype.startsWith('image/') ? 'image' : 'pdf',
        size: req.file.size,
        uploadedAt: new Date().toISOString(),
        uploadedBy: user.id,
      };

      currentAttachments.push(newAttachment);

      // Update task
      await storage.updateTask(tenantId, req.params.id, {
        attachments: currentAttachments as any
      });

      res.status(201).json(newAttachment);
    } catch (error: any) {
      console.error("Error uploading file:", error);
      res.status(500).json({ message: safeErrorMessage(error) });
    }
  });

  // Delete attachment from task
  app.delete("/api/tasks/:id/attachments/:attachmentId", requireAuth, async (req: Request, res: Response) => {
    try {
      // MULTI-TENANT: Extract and validate tenant context
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      const task = await storage.getTask(tenantId, req.params.id);
      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }

      // Check permissions
      const user = req.user as User;
      const canEdit = user.role === "SuperAdmin" ||
                     user.role === "WarehouseManager" ||
                     (user.role === "Editor" && (task.assignedTo === user.id || task.createdBy === user.id));

      if (!canEdit) {
        return res.status(403).json({ message: "Cannot delete attachments from this task" });
      }

      const currentAttachments = (task.attachments as any[]) || [];
      const attachmentToDelete = currentAttachments.find((a: any) => a.id === req.params.attachmentId);

      if (!attachmentToDelete) {
        return res.status(404).json({ message: "Attachment not found" });
      }

      // Delete file from filesystem if it's a file (not a link)
      if (attachmentToDelete.type !== 'link' && attachmentToDelete.filename) {
        const filePath = path.join(taskUploadDir, attachmentToDelete.filename);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }

      // Remove from attachments array
      const updatedAttachments = currentAttachments.filter((a: any) => a.id !== req.params.attachmentId);

      // Update task
      await storage.updateTask(tenantId, req.params.id, {
        attachments: updatedAttachments as any
      });

      res.json({ message: "Attachment deleted successfully" });
    } catch (error) {
      console.error("Error deleting attachment:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Add link attachment to task
  app.post("/api/tasks/:id/links", requireAuth, async (req: Request, res: Response) => {
    try {
      // MULTI-TENANT: Extract and validate tenant context
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      const task = await storage.getTask(tenantId, req.params.id);
      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }

      // Check permissions
      const user = req.user as User;
      const canEdit = user.role === "SuperAdmin" ||
                     user.role === "WarehouseManager" ||
                     (user.role === "Editor" && (task.assignedTo === user.id || task.createdBy === user.id));

      if (!canEdit) {
        return res.status(403).json({ message: "Cannot add links to this task" });
      }

      const { name, url } = z.object({
        name: z.string().min(1),
        url: z.string().url(),
      }).parse(req.body);

      // Get current attachments
      const currentAttachments = (task.attachments as any[]) || [];

      // Add new link
      const newLink = {
        id: Date.now().toString(),
        name,
        url,
        type: 'link',
        uploadedAt: new Date().toISOString(),
        uploadedBy: user.id,
      };

      currentAttachments.push(newLink);

      // Update task
      await storage.updateTask(tenantId, req.params.id, {
        attachments: currentAttachments as any
      });

      res.status(201).json(newLink);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      console.error("Error adding link:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // =============================================
  // TASK PUBLISHING ENDPOINT
  // =============================================

  // Manual task publishing to Shopify (task-centric)
  app.post("/api/tasks/:id/publish", requireAuth, requireRole(["SuperAdmin", "WarehouseManager"]), async (req: Request, res: Response) => {
    try {
      // MULTI-TENANT: Extract and validate tenant context
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      const task = await storage.getTask(tenantId, req.params.id);
      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }

      if (!task.product) {
        return res.status(400).json({ message: "Task has no associated product" });
      }

      // MULTI-TENANT: Pass tenantId to publishProduct
      const result = await shopifyService.publishProduct(tenantId, task.product);
      if (!result) {
        return res.status(400).json({ message: "Failed to publish product to Shopify" });
      }

      res.json({
        message: "Product published successfully",
        shopifyProductId: result.shopifyProductId,
        handle: result.handle
      });
    } catch (error) {
      console.error("Error publishing product:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });
}
