import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { storage } from "./storage";
import { insertTaskSchema, insertProductSchema, User } from "@shared/schema";
import { z } from "zod";

// Type for authenticated requests
interface AuthenticatedRequest extends Request {
  user: User;
}

export function registerRoutes(app: Express): Server {
  setupAuth(app);

  // Middleware to check authentication
  const requireAuth = (req: AuthenticatedRequest, res: any, next: any) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Authentication required" });
    }
    next();
  };

  // Middleware to check role permissions
  const requireRole = (roles: string[]) => {
    return (req: AuthenticatedRequest, res: any, next: any) => {
      if (!req.user || !roles.includes(req.user.role)) {
        return res.status(403).json({ message: "Insufficient permissions" });
      }
      next();
    };
  };

  // Dashboard stats
  app.get("/api/dashboard/stats", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const stats = await storage.getDashboardStats(req.user.id, req.user.role);
      res.json(stats);
    } catch (error) {
      console.error("Error fetching dashboard stats:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get all tasks
  app.get("/api/tasks", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { status, assignedTo } = req.query;
      const filters: any = {};
      
      if (status) filters.status = status as string;
      if (assignedTo) filters.assignedTo = assignedTo as string;
      
      // Role-based filtering
      if (req.user.role === "Editor") {
        filters.assignedTo = req.user.id;
      }

      const tasks = await storage.getTasks(filters);
      res.json(tasks);
    } catch (error) {
      console.error("Error fetching tasks:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get single task
  app.get("/api/tasks/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const task = await storage.getTask(req.params.id);
      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }

      // Role-based access control
      if (req.user.role === "Editor" && task.assignedTo !== req.user.id) {
        return res.status(403).json({ message: "Access denied" });
      }

      res.json(task);
    } catch (error) {
      console.error("Error fetching task:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Create new product and task
  app.post("/api/products", requireAuth, requireRole(["SuperAdmin", "WarehouseManager", "Editor"]), async (req: AuthenticatedRequest, res) => {
    try {
      const productData = insertProductSchema.parse(req.body.product);
      const taskData = insertTaskSchema.parse({
        ...req.body.task,
        createdBy: req.user.id,
        receivedDate: new Date(req.body.task.receivedDate || Date.now()),
      });

      // Create product first
      const product = await storage.createProduct(productData);
      
      // Create task linked to product
      const task = await storage.createTask({
        ...taskData,
        productId: product.id,
        title: productData.title,
      });

      // Set SLA deadline (default 48 hours)
      const slaDeadline = new Date(task.receivedDate);
      slaDeadline.setHours(slaDeadline.getHours() + 48);
      
      await storage.updateTask(task.id, { slaDeadline });

      res.status(201).json({ product, task });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      console.error("Error creating product/task:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Update task
  app.patch("/api/tasks/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const task = await storage.getTask(req.params.id);
      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }

      // Role-based permissions
      const canEdit = req.user.role === "SuperAdmin" || 
                     (req.user.role === "WarehouseManager") ||
                     (req.user.role === "Editor" && task.assignedTo === req.user.id);
      
      if (!canEdit) {
        return res.status(403).json({ message: "Cannot edit this task" });
      }

      const updates = req.body;
      delete updates.id; // Don't allow ID updates
      
      const updatedTask = await storage.updateTask(req.params.id, updates);
      res.json(updatedTask);
    } catch (error) {
      console.error("Error updating task:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Update task status (state machine transitions)
  app.patch("/api/tasks/:id/status", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { status } = req.body;
      const task = await storage.getTask(req.params.id);
      
      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }

      // Validate state transitions based on role
      const validTransitions = getValidTransitions(task.status, req.user.role);
      if (!validTransitions.includes(status)) {
        return res.status(400).json({ 
          message: "Invalid status transition",
          currentStatus: task.status,
          attemptedStatus: status,
          validTransitions 
        });
      }

      const updatedTask = await storage.updateTaskStatus(req.params.id, status, req.user.id);
      
      // Create notification for relevant users
      await createStatusChangeNotification(task, status, req.user.id);
      
      res.json(updatedTask);
    } catch (error) {
      console.error("Error updating task status:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get task audit log
  app.get("/api/tasks/:id/audit", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const task = await storage.getTask(req.params.id);
      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }

      // Only Super Admin and Auditor can view full audit logs
      if (!["SuperAdmin", "Auditor"].includes(req.user.role)) {
        return res.status(403).json({ message: "Access denied" });
      }

      const auditLog = await storage.getTaskAuditLog(req.params.id);
      res.json(auditLog);
    } catch (error) {
      console.error("Error fetching audit log:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get user notifications
  app.get("/api/notifications", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const notifications = await storage.getUserNotifications(req.user.id);
      res.json(notifications);
    } catch (error) {
      console.error("Error fetching notifications:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Mark notification as read
  app.patch("/api/notifications/:id/read", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      await storage.markNotificationRead(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error marking notification as read:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}

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
      Editor: [],
      Auditor: []
    },
    ASSIGNED: {
      SuperAdmin: ["IN_PROGRESS", "TRIAGE", "DONE"],
      WarehouseManager: ["IN_PROGRESS", "TRIAGE"],
      Editor: ["IN_PROGRESS"],
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
      SuperAdmin: [], // Final state
      WarehouseManager: [],
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
        });
      }
    }
  } catch (error) {
    console.error("Error creating status change notification:", error);
  }
}
