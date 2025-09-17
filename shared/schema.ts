import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, boolean, jsonb, json, pgEnum } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Enums
export const roleEnum = pgEnum("role", ["SuperAdmin", "WarehouseManager", "Editor", "Auditor"]);
export const priorityEnum = pgEnum("priority", ["high", "medium", "low"]);
export const statusEnum = pgEnum("status", [
  "NEW", 
  "TRIAGE", 
  "ASSIGNED", 
  "IN_PROGRESS", 
  "READY_FOR_REVIEW", 
  "PUBLISHED", 
  "QA_APPROVED", 
  "DONE"
]);

// Users table
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  role: roleEnum("role").notNull().default("Editor"),
  firstName: text("first_name"),
  lastName: text("last_name"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Products table
export const products = pgTable("products", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  description: text("description"),
  vendor: text("vendor").notNull(),
  orderNumber: text("order_number"),
  sku: text("sku"),
  price: text("price"),
  category: text("category"),
  images: text("images").array(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Tasks table
export const tasks = pgTable("tasks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  productId: varchar("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  status: statusEnum("status").notNull().default("NEW"),
  priority: priorityEnum("priority").notNull().default("medium"),
  assignedTo: varchar("assigned_to").references(() => users.id),
  createdBy: varchar("created_by").notNull().references(() => users.id),
  receivedDate: timestamp("received_date").notNull(),
  assignedAt: timestamp("assigned_at"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  publishedAt: timestamp("published_at"),
  slaDeadline: timestamp("sla_deadline"),
  notes: text("notes"),
  checklist: jsonb("checklist").default({}),
  leadTimeMinutes: integer("lead_time_minutes"),
  cycleTimeMinutes: integer("cycle_time_minutes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Audit trail table
export const auditLog = pgTable("audit_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  taskId: varchar("task_id").references(() => tasks.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id),
  action: text("action").notNull(),
  fromStatus: statusEnum("from_status"),
  toStatus: statusEnum("to_status"),
  details: jsonb("details"),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

// Notifications table
export const notifications = pgTable("notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  taskId: varchar("task_id").references(() => tasks.id),
  title: text("title").notNull(),
  message: text("message").notNull(),
  read: boolean("read").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Shopify stores configuration table
export const shopifyStores = pgTable("shopify_stores", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  shopDomain: text("shop_domain").notNull().unique(),
  accessToken: text("access_token").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  webhookSecret: text("webhook_secret"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Session table (used by connect-pg-simple)
export const session = pgTable("session", {
  sid: varchar("sid").primaryKey(),
  sess: json("sess").notNull(),
  expire: timestamp("expire").notNull(),
});

// Shopify product mappings table
export const shopifyProductMappings = pgTable("shopify_product_mappings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  productId: varchar("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  shopifyStoreId: varchar("shopify_store_id").notNull().references(() => shopifyStores.id, { onDelete: "cascade" }),
  shopifyProductId: text("shopify_product_id").notNull(),
  shopifyHandle: text("shopify_handle"),
  publishedAt: timestamp("published_at").defaultNow().notNull(),
  status: text("status").notNull().default("published"), // published, draft, archived
  lastSyncAt: timestamp("last_sync_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  assignedTasks: many(tasks, { relationName: "assignedTo" }),
  createdTasks: many(tasks, { relationName: "createdBy" }),
  auditEntries: many(auditLog),
  notifications: many(notifications),
}));

export const productsRelations = relations(products, ({ many }) => ({
  tasks: many(tasks),
}));

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  product: one(products, {
    fields: [tasks.productId],
    references: [products.id],
  }),
  assignee: one(users, {
    fields: [tasks.assignedTo],
    references: [users.id],
    relationName: "assignedTo",
  }),
  creator: one(users, {
    fields: [tasks.createdBy],
    references: [users.id],
    relationName: "createdBy",
  }),
  auditEntries: many(auditLog),
}));

export const auditLogRelations = relations(auditLog, ({ one }) => ({
  task: one(tasks, {
    fields: [auditLog.taskId],
    references: [tasks.id],
  }),
  user: one(users, {
    fields: [auditLog.userId],
    references: [users.id],
  }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
  }),
  task: one(tasks, {
    fields: [notifications.taskId],
    references: [tasks.id],
  }),
}));

export const shopifyStoresRelations = relations(shopifyStores, ({ many }) => ({
  productMappings: many(shopifyProductMappings),
}));

export const shopifyProductMappingsRelations = relations(shopifyProductMappings, ({ one }) => ({
  product: one(products, {
    fields: [shopifyProductMappings.productId],
    references: [products.id],
  }),
  shopifyStore: one(shopifyStores, {
    fields: [shopifyProductMappings.shopifyStoreId],
    references: [shopifyStores.id],
  }),
}));

// Schemas for validation
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertProductSchema = createInsertSchema(products).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertTaskSchema = createInsertSchema(tasks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertAuditLogSchema = createInsertSchema(auditLog).omit({
  id: true,
  timestamp: true,
});

export const insertNotificationSchema = createInsertSchema(notifications).omit({
  id: true,
  createdAt: true,
});

export const insertShopifyStoreSchema = createInsertSchema(shopifyStores).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertShopifyProductMappingSchema = createInsertSchema(shopifyProductMappings).omit({
  id: true,
  publishedAt: true,
  lastSyncAt: true,
  createdAt: true,
});

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Product = typeof products.$inferSelect;
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Task = typeof tasks.$inferSelect;
export type InsertTask = z.infer<typeof insertTaskSchema>;
export type AuditLog = typeof auditLog.$inferSelect;
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type ShopifyStore = typeof shopifyStores.$inferSelect;
export type InsertShopifyStore = z.infer<typeof insertShopifyStoreSchema>;
export type ShopifyProductMapping = typeof shopifyProductMappings.$inferSelect;
export type InsertShopifyProductMapping = z.infer<typeof insertShopifyProductMappingSchema>;

// Task with relations
export type TaskWithDetails = Task & {
  product: Product;
  assignee?: User;
  creator: User;
};

// Dashboard stats type
export type DashboardStats = {
  totalTasks: number;
  pendingReview: number;
  overdueSLA: number;
  completedToday: number;
  kanbanCounts: Record<string, number>;
};
