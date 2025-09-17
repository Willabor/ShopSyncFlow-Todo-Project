import { 
  users, 
  products, 
  tasks, 
  auditLog, 
  notifications,
  type User, 
  type InsertUser,
  type Product,
  type InsertProduct,
  type Task,
  type InsertTask,
  type TaskWithDetails,
  type AuditLog,
  type InsertAuditLog,
  type Notification,
  type InsertNotification,
  type DashboardStats
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, count, sql, inArray } from "drizzle-orm";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { pool } from "./db";

const PostgresSessionStore = connectPg(session);

export interface IStorage {
  // User methods
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Product methods
  createProduct(product: InsertProduct): Promise<Product>;
  getProduct(id: string): Promise<Product | undefined>;
  updateProduct(id: string, updates: Partial<Product>): Promise<Product | undefined>;
  
  // Task methods
  createTask(task: InsertTask): Promise<Task>;
  getTask(id: string): Promise<TaskWithDetails | undefined>;
  getTasks(filters?: { status?: string; assignedTo?: string; createdBy?: string }): Promise<TaskWithDetails[]>;
  updateTask(id: string, updates: Partial<Task>): Promise<Task | undefined>;
  updateTaskStatus(id: string, status: string, userId: string): Promise<Task | undefined>;
  
  // Dashboard methods
  getDashboardStats(userId?: string, role?: string): Promise<DashboardStats>;
  
  // Audit methods
  createAuditEntry(entry: InsertAuditLog): Promise<AuditLog>;
  getTaskAuditLog(taskId: string): Promise<AuditLog[]>;
  getAllAuditLogs(): Promise<AuditLog[]>;
  
  // Notification methods
  createNotification(notification: InsertNotification): Promise<Notification>;
  getUserNotifications(userId: string, limit?: number): Promise<Notification[]>;
  markNotificationRead(id: string): Promise<void>;
  
  // Session store
  sessionStore: any;
}

export class DatabaseStorage implements IStorage {
  sessionStore: any;

  constructor() {
    this.sessionStore = new PostgresSessionStore({ 
      pool, 
      createTableIfMissing: true 
    });
  }

  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(insertUser)
      .returning();
    return user;
  }

  async createProduct(insertProduct: InsertProduct): Promise<Product> {
    const [product] = await db
      .insert(products)
      .values(insertProduct)
      .returning();
    return product;
  }

  async getProduct(id: string): Promise<Product | undefined> {
    const [product] = await db.select().from(products).where(eq(products.id, id));
    return product || undefined;
  }

  async updateProduct(id: string, updates: Partial<Product>): Promise<Product | undefined> {
    const [product] = await db
      .update(products)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(products.id, id))
      .returning();
    return product || undefined;
  }

  async createTask(insertTask: InsertTask): Promise<Task> {
    const [task] = await db
      .insert(tasks)
      .values(insertTask)
      .returning();
    
    // Create audit entry for task creation
    await this.createAuditEntry({
      taskId: task.id,
      userId: task.createdBy,
      action: "TASK_CREATED",
      toStatus: task.status,
      details: { taskId: task.id, title: task.title }
    });

    return task;
  }

  async getTask(id: string): Promise<TaskWithDetails | undefined> {
    const [task] = await db
      .select()
      .from(tasks)
      .leftJoin(products, eq(tasks.productId, products.id))
      .leftJoin(users, eq(tasks.assignedTo, users.id))
      .where(eq(tasks.id, id));

    if (!task) return undefined;

    const creator = await this.getUser(task.tasks.createdBy);
    
    return {
      ...task.tasks,
      product: task.products!,
      assignee: task.users || undefined,
      creator: creator!,
    };
  }

  async getTasks(filters?: { status?: string; assignedTo?: string; createdBy?: string }): Promise<TaskWithDetails[]> {
    let query = db
      .select()
      .from(tasks)
      .leftJoin(products, eq(tasks.productId, products.id))
      .leftJoin(users, eq(tasks.assignedTo, users.id))
      .orderBy(desc(tasks.createdAt));

    const conditions = [];
    if (filters?.status) conditions.push(eq(tasks.status, filters.status as any));
    if (filters?.assignedTo) conditions.push(eq(tasks.assignedTo, filters.assignedTo));
    if (filters?.createdBy) conditions.push(eq(tasks.createdBy, filters.createdBy));

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    const results = await query;
    
    // Get creators for all tasks
    const creatorIds = Array.from(new Set(results.map(r => r.tasks.createdBy)));
    const creators = await db.select().from(users).where(inArray(users.id, creatorIds));
    const creatorsMap = new Map(creators.map(c => [c.id, c]));

    return results.map(result => ({
      ...result.tasks,
      product: result.products!,
      assignee: result.users || undefined,
      creator: creatorsMap.get(result.tasks.createdBy)!,
    }));
  }

  async updateTask(id: string, updates: Partial<Task>): Promise<Task | undefined> {
    const [task] = await db
      .update(tasks)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(tasks.id, id))
      .returning();
    return task || undefined;
  }

  async updateTaskStatus(id: string, status: string, userId: string): Promise<Task | undefined> {
    const currentTask = await db.select().from(tasks).where(eq(tasks.id, id));
    if (!currentTask[0]) return undefined;

    const updates: Partial<Task> = { 
      status: status as any, 
      updatedAt: new Date() 
    };

    // Set timestamps based on status transitions
    const now = new Date();
    switch (status) {
      case "ASSIGNED":
        updates.assignedAt = now;
        break;
      case "IN_PROGRESS":
        updates.startedAt = now;
        break;
      case "PUBLISHED":
        updates.publishedAt = now;
        break;
      case "DONE":
        updates.completedAt = now;
        // Calculate lead and cycle times
        if (currentTask[0].assignedAt) {
          const leadTime = Math.floor((now.getTime() - currentTask[0].assignedAt.getTime()) / (1000 * 60));
          updates.leadTimeMinutes = leadTime;
        }
        if (currentTask[0].startedAt) {
          const cycleTime = Math.floor((now.getTime() - currentTask[0].startedAt.getTime()) / (1000 * 60));
          updates.cycleTimeMinutes = cycleTime;
        }
        break;
    }

    const [task] = await db
      .update(tasks)
      .set(updates)
      .where(eq(tasks.id, id))
      .returning();

    // Create audit entry
    await this.createAuditEntry({
      taskId: id,
      userId,
      action: "STATUS_CHANGED",
      fromStatus: currentTask[0].status,
      toStatus: status as any,
      details: { from: currentTask[0].status, to: status }
    });

    return task || undefined;
  }

  async getDashboardStats(userId?: string, role?: string): Promise<DashboardStats> {
    const baseQuery = db.select({ count: count() }).from(tasks);
    
    // Total tasks
    const totalTasks = await baseQuery;
    
    // Pending review
    const pendingReview = await db
      .select({ count: count() })
      .from(tasks)
      .where(eq(tasks.status, "READY_FOR_REVIEW"));
    
    // Overdue SLA (tasks with slaDeadline in the past)
    const overdueSLA = await db
      .select({ count: count() })
      .from(tasks)
      .where(sql`sla_deadline < NOW() AND status NOT IN ('DONE', 'QA_APPROVED')`);
    
    // Completed today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const completedToday = await db
      .select({ count: count() })
      .from(tasks)
      .where(sql`completed_at >= ${today} AND status IN ('DONE', 'QA_APPROVED')`);
    
    // Kanban counts by status
    const statusCounts = await db
      .select({
        status: tasks.status,
        count: count()
      })
      .from(tasks)
      .groupBy(tasks.status);
    
    const kanbanCounts: Record<string, number> = {};
    statusCounts.forEach(({ status, count }) => {
      kanbanCounts[status] = count;
    });

    return {
      totalTasks: totalTasks[0]?.count || 0,
      pendingReview: pendingReview[0]?.count || 0,
      overdueSLA: overdueSLA[0]?.count || 0,
      completedToday: completedToday[0]?.count || 0,
      kanbanCounts,
    };
  }

  async createAuditEntry(entry: InsertAuditLog): Promise<AuditLog> {
    const [auditEntry] = await db
      .insert(auditLog)
      .values(entry)
      .returning();
    return auditEntry;
  }

  async getTaskAuditLog(taskId: string): Promise<AuditLog[]> {
    return await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.taskId, taskId))
      .orderBy(desc(auditLog.timestamp));
  }

  async getAllAuditLogs(): Promise<AuditLog[]> {
    return await db
      .select()
      .from(auditLog)
      .orderBy(desc(auditLog.timestamp))
      .limit(500); // Limit to recent 500 entries for performance
  }

  async createNotification(notification: InsertNotification): Promise<Notification> {
    const [notif] = await db
      .insert(notifications)
      .values(notification)
      .returning();
    return notif;
  }

  async getUserNotifications(userId: string, limit = 10): Promise<Notification[]> {
    return await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(limit);
  }

  async markNotificationRead(id: string): Promise<void> {
    await db
      .update(notifications)
      .set({ read: true })
      .where(eq(notifications.id, id));
  }
}

export const storage = new DatabaseStorage();
