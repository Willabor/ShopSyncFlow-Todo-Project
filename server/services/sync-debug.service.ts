/**
 * Sync Debug Service
 *
 * Provides comprehensive debugging and error tracking for Shopify sync operations.
 * Logs errors to the database for persistent tracking and debugging.
 */

import { db } from "../db";
import { shopifySyncLog, shopifySyncErrors, productSyncChangelog } from "@shared/schema";
import type { InsertShopifySyncError, ShopifySyncError, ShopifySyncLog, ProductSyncChangelog } from "@shared/schema";
import { eq, desc, and, sql, gte, lte, inArray, isNull, or, like, ilike, count as drizzleCount } from "drizzle-orm";

// Error type classification
export type SyncErrorType =
  | "GRAPHQL_ERROR"      // Shopify GraphQL API error
  | "VALIDATION_ERROR"   // Data validation failed
  | "RATE_LIMIT"         // Shopify rate limit hit
  | "NETWORK_ERROR"      // Network/connection issues
  | "DATABASE_ERROR"     // Local database operation failed
  | "VARIANT_ERROR"      // Variant sync specific error
  | "COLLECTION_ERROR"   // Collection sync specific error
  | "IMAGE_ERROR"        // Image sync specific error
  | "UNKNOWN";           // Unclassified error

// Operation types
export type SyncOperation =
  | "CREATE"
  | "UPDATE"
  | "DELETE"
  | "SYNC_VARIANTS"
  | "SYNC_COLLECTIONS"
  | "SYNC_IMAGES"
  | "FETCH";

interface LogErrorParams {
  tenantId: string;  // MULTI-TENANT: Required tenant ID
  syncLogId?: string;
  shopifyProductId?: string;
  productTitle?: string;
  productHandle?: string;
  localProductId?: string;
  errorType: SyncErrorType;
  errorCode?: string;
  errorMessage: string;
  errorStack?: string;
  operation: SyncOperation;
  requestData?: any;
  responseData?: any;
}

interface ErrorFilters {
  syncLogId?: string;
  errorType?: SyncErrorType;
  status?: string;
  operation?: SyncOperation;
  startDate?: Date;
  endDate?: Date;
  shopifyProductId?: string;
  searchQuery?: string;
}

interface ErrorStats {
  total: number;
  unresolved: number;
  resolved: number;
  ignored: number;
  byType: Record<SyncErrorType, number>;
  byOperation: Record<SyncOperation, number>;
  recentErrors: ShopifySyncError[];
}

class SyncDebugService {
  /**
   * Classify an error into a specific type based on error message/code
   */
  classifyError(error: any, defaultType: SyncErrorType = "UNKNOWN"): SyncErrorType {
    const errorMessage = error?.message || String(error) || "";
    const errorCode = error?.code || "";

    // Rate limit errors
    if (
      errorMessage.toLowerCase().includes("rate limit") ||
      errorMessage.toLowerCase().includes("throttled") ||
      errorCode === "THROTTLED"
    ) {
      return "RATE_LIMIT";
    }

    // GraphQL errors
    if (
      errorMessage.includes("GraphQL") ||
      errorMessage.includes("userErrors") ||
      error?.graphQLErrors
    ) {
      return "GRAPHQL_ERROR";
    }

    // Network errors
    if (
      errorMessage.includes("ECONNREFUSED") ||
      errorMessage.includes("ETIMEDOUT") ||
      errorMessage.includes("ENOTFOUND") ||
      errorMessage.includes("network") ||
      errorMessage.includes("fetch failed")
    ) {
      return "NETWORK_ERROR";
    }

    // Database errors
    if (
      errorMessage.includes("database") ||
      errorMessage.includes("postgres") ||
      errorMessage.includes("UNIQUE constraint") ||
      errorMessage.includes("unique constraint") ||
      errorMessage.includes("duplicate key") ||
      errorMessage.includes("foreign key") ||
      errorMessage.includes("drizzle") ||
      errorMessage.includes("violates") ||
      error?.code === "23505" ||  // PostgreSQL unique violation
      error?.code === "23503"     // PostgreSQL foreign key violation
    ) {
      return "DATABASE_ERROR";
    }

    // Validation errors
    if (
      errorMessage.includes("validation") ||
      errorMessage.includes("invalid") ||
      errorMessage.includes("required field") ||
      errorMessage.includes("must be")
    ) {
      return "VALIDATION_ERROR";
    }

    // Variant-specific errors
    if (
      errorMessage.includes("variant") ||
      errorMessage.includes("option") ||
      errorMessage.includes("inventory")
    ) {
      return "VARIANT_ERROR";
    }

    // Collection-specific errors
    if (
      errorMessage.includes("collection") ||
      errorMessage.includes("ruleSet")
    ) {
      return "COLLECTION_ERROR";
    }

    // Image-specific errors
    if (
      errorMessage.includes("image") ||
      errorMessage.includes("media")
    ) {
      return "IMAGE_ERROR";
    }

    return defaultType;
  }

  /**
   * Log a sync error to the database
   */
  async logError(params: LogErrorParams): Promise<ShopifySyncError> {
    const [error] = await db
      .insert(shopifySyncErrors)
      .values({
        tenantId: params.tenantId,  // MULTI-TENANT: Include tenant ID
        syncLogId: params.syncLogId || null,
        shopifyProductId: params.shopifyProductId || null,
        productTitle: params.productTitle || null,
        productHandle: params.productHandle || null,
        localProductId: params.localProductId || null,
        errorType: params.errorType,
        errorCode: params.errorCode || null,
        errorMessage: params.errorMessage,
        errorStack: params.errorStack || null,
        operation: params.operation,
        requestData: params.requestData || null,
        responseData: params.responseData || null,
        status: "unresolved",
        retryCount: 0,
      })
      .returning();

    console.error(`[SyncDebug] ❌ Logged error: ${params.errorType} - ${params.productTitle || params.shopifyProductId || 'unknown'}`);
    console.error(`[SyncDebug]    Message: ${params.errorMessage}`);

    return error;
  }

  /**
   * Log error from a caught exception
   */
  async logException(
    error: any,
    context: {
      tenantId: string;  // MULTI-TENANT: Required tenant ID
      syncLogId?: string;
      shopifyProductId?: string;
      productTitle?: string;
      productHandle?: string;
      localProductId?: string;
      operation: SyncOperation;
      requestData?: any;
      responseData?: any;
    }
  ): Promise<ShopifySyncError> {
    const errorType = this.classifyError(error);
    const errorMessage = error?.message || String(error);
    const errorStack = error?.stack || undefined;

    // Extract error code from GraphQL errors
    let errorCode: string | undefined;
    if (error?.graphQLErrors?.[0]?.extensions?.code) {
      errorCode = error.graphQLErrors[0].extensions.code;
    } else if (error?.code) {
      errorCode = error.code;
    }

    return this.logError({
      tenantId: context.tenantId,  // MULTI-TENANT: Pass tenant ID
      syncLogId: context.syncLogId,
      shopifyProductId: context.shopifyProductId,
      productTitle: context.productTitle,
      productHandle: context.productHandle,
      localProductId: context.localProductId,
      errorType,
      errorCode,
      errorMessage,
      errorStack,
      operation: context.operation,
      requestData: context.requestData,
      responseData: context.responseData || error?.response?.data,
    });
  }

  /**
   * Get errors with filtering and pagination
   */
  async getErrors(
    filters: ErrorFilters = {},
    limit: number = 50,
    offset: number = 0
  ): Promise<{ errors: ShopifySyncError[]; total: number }> {
    const conditions: any[] = [];

    if (filters.syncLogId) {
      conditions.push(eq(shopifySyncErrors.syncLogId, filters.syncLogId));
    }
    if (filters.errorType) {
      conditions.push(eq(shopifySyncErrors.errorType, filters.errorType));
    }
    if (filters.status) {
      conditions.push(eq(shopifySyncErrors.status, filters.status));
    }
    if (filters.operation) {
      conditions.push(eq(shopifySyncErrors.operation, filters.operation));
    }
    if (filters.startDate) {
      conditions.push(gte(shopifySyncErrors.createdAt, filters.startDate));
    }
    if (filters.endDate) {
      conditions.push(lte(shopifySyncErrors.createdAt, filters.endDate));
    }
    if (filters.shopifyProductId) {
      conditions.push(eq(shopifySyncErrors.shopifyProductId, filters.shopifyProductId));
    }
    if (filters.searchQuery) {
      conditions.push(
        or(
          like(shopifySyncErrors.productTitle, `%${filters.searchQuery}%`),
          like(shopifySyncErrors.errorMessage, `%${filters.searchQuery}%`),
          like(shopifySyncErrors.shopifyProductId, `%${filters.searchQuery}%`)
        )
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [errors, countResult] = await Promise.all([
      db
        .select()
        .from(shopifySyncErrors)
        .where(whereClause)
        .orderBy(desc(shopifySyncErrors.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ count: drizzleCount() })
        .from(shopifySyncErrors)
        .where(whereClause),
    ]);

    return {
      errors,
      total: countResult[0]?.count || 0,
    };
  }

  /**
   * Get error statistics
   */
  async getStats(syncLogId?: string): Promise<ErrorStats> {
    const baseCondition = syncLogId
      ? eq(shopifySyncErrors.syncLogId, syncLogId)
      : undefined;

    // Get counts by status
    const statusCounts = await db
      .select({
        status: shopifySyncErrors.status,
        count: drizzleCount(),
      })
      .from(shopifySyncErrors)
      .where(baseCondition)
      .groupBy(shopifySyncErrors.status);

    // Get counts by error type
    const typeCounts = await db
      .select({
        errorType: shopifySyncErrors.errorType,
        count: drizzleCount(),
      })
      .from(shopifySyncErrors)
      .where(baseCondition)
      .groupBy(shopifySyncErrors.errorType);

    // Get counts by operation
    const operationCounts = await db
      .select({
        operation: shopifySyncErrors.operation,
        count: drizzleCount(),
      })
      .from(shopifySyncErrors)
      .where(baseCondition)
      .groupBy(shopifySyncErrors.operation);

    // Get recent errors
    const recentErrors = await db
      .select()
      .from(shopifySyncErrors)
      .where(baseCondition)
      .orderBy(desc(shopifySyncErrors.createdAt))
      .limit(10);

    // Build stats object
    const byStatus: Record<string, number> = {};
    for (const row of statusCounts) {
      byStatus[row.status] = Number(row.count);
    }

    const byType: Record<SyncErrorType, number> = {} as Record<SyncErrorType, number>;
    for (const row of typeCounts) {
      byType[row.errorType as SyncErrorType] = Number(row.count);
    }

    const byOperation: Record<SyncOperation, number> = {} as Record<SyncOperation, number>;
    for (const row of operationCounts) {
      byOperation[row.operation as SyncOperation] = Number(row.count);
    }

    return {
      total: Object.values(byStatus).reduce((a, b) => a + b, 0),
      unresolved: byStatus["unresolved"] || 0,
      resolved: byStatus["resolved"] || 0,
      ignored: byStatus["ignored"] || 0,
      byType,
      byOperation,
      recentErrors,
    };
  }

  /**
   * Mark an error as resolved
   */
  async resolveError(
    errorId: string,
    resolution: string,
    resolvedBy?: string
  ): Promise<ShopifySyncError | undefined> {
    const [updated] = await db
      .update(shopifySyncErrors)
      .set({
        status: "resolved",
        resolution,
        resolvedBy,
        resolvedAt: new Date(),
      })
      .where(eq(shopifySyncErrors.id, errorId))
      .returning();

    return updated;
  }

  /**
   * Mark an error as ignored
   */
  async ignoreError(
    errorId: string,
    resolution: string,
    resolvedBy?: string
  ): Promise<ShopifySyncError | undefined> {
    const [updated] = await db
      .update(shopifySyncErrors)
      .set({
        status: "ignored",
        resolution,
        resolvedBy,
        resolvedAt: new Date(),
      })
      .where(eq(shopifySyncErrors.id, errorId))
      .returning();

    return updated;
  }

  /**
   * Bulk resolve errors
   */
  async bulkResolve(
    errorIds: string[],
    resolution: string,
    resolvedBy?: string
  ): Promise<number> {
    const result = await db
      .update(shopifySyncErrors)
      .set({
        status: "resolved",
        resolution,
        resolvedBy,
        resolvedAt: new Date(),
      })
      .where(inArray(shopifySyncErrors.id, errorIds));

    return errorIds.length;
  }

  /**
   * Delete old resolved/ignored errors (cleanup)
   */
  async cleanupOldErrors(olderThanDays: number = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const result = await db
      .delete(shopifySyncErrors)
      .where(
        and(
          lte(shopifySyncErrors.createdAt, cutoffDate),
          or(
            eq(shopifySyncErrors.status, "resolved"),
            eq(shopifySyncErrors.status, "ignored")
          )
        )
      );

    // Drizzle doesn't return count directly, return 0 for now
    return 0;
  }

  /**
   * Get errors for a specific product
   */
  async getProductErrors(
    shopifyProductId: string,
    limit: number = 20
  ): Promise<ShopifySyncError[]> {
    return db
      .select()
      .from(shopifySyncErrors)
      .where(eq(shopifySyncErrors.shopifyProductId, shopifyProductId))
      .orderBy(desc(shopifySyncErrors.createdAt))
      .limit(limit);
  }

  /**
   * Create a sync log entry
   */
  async createSyncLog(
    tenantId: string,  // MULTI-TENANT: Required tenant ID
    syncType: string,
    metadata?: any
  ): Promise<ShopifySyncLog> {
    const [log] = await db
      .insert(shopifySyncLog)
      .values({
        tenantId,  // MULTI-TENANT: Include tenant ID
        syncType,
        status: "IN_PROGRESS",
        productsProcessed: 0,
        productsCreated: 0,
        productsUpdated: 0,
        errorCount: 0,
        metadata,
      })
      .returning();

    return log;
  }

  /**
   * Update sync log with final results
   */
  async completeSyncLog(
    syncLogId: string,
    results: {
      status: "SUCCESS" | "FAILED" | "CANCELLED";
      productsProcessed: number;
      productsCreated: number;
      productsUpdated: number;
      errorCount: number;
      errorMessage?: string;
      errorDetails?: any;
    }
  ): Promise<ShopifySyncLog | undefined> {
    const startedAt = await db
      .select({ startedAt: shopifySyncLog.startedAt })
      .from(shopifySyncLog)
      .where(eq(shopifySyncLog.id, syncLogId))
      .limit(1);

    const duration = startedAt[0]
      ? Math.floor((Date.now() - new Date(startedAt[0].startedAt).getTime()) / 1000)
      : 0;

    const [updated] = await db
      .update(shopifySyncLog)
      .set({
        status: results.status,
        productsProcessed: results.productsProcessed,
        productsCreated: results.productsCreated,
        productsUpdated: results.productsUpdated,
        errorCount: results.errorCount,
        completedAt: new Date(),
        duration,
        errorMessage: results.errorMessage,
        errorDetails: results.errorDetails,
      })
      .where(eq(shopifySyncLog.id, syncLogId))
      .returning();

    return updated;
  }

  /**
   * Get sync logs with pagination
   */
  async getSyncLogs(
    limit: number = 20,
    offset: number = 0
  ): Promise<{ logs: ShopifySyncLog[]; total: number }> {
    const [logs, countResult] = await Promise.all([
      db
        .select()
        .from(shopifySyncLog)
        .orderBy(desc(shopifySyncLog.startedAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ count: drizzleCount() })
        .from(shopifySyncLog),
    ]);

    return {
      logs,
      total: countResult[0]?.count || 0,
    };
  }

  /**
   * Get a specific sync log with its errors
   */
  async getSyncLogWithErrors(
    syncLogId: string
  ): Promise<{ log: ShopifySyncLog | null; errors: ShopifySyncError[] }> {
    const [logResult, errors] = await Promise.all([
      db
        .select()
        .from(shopifySyncLog)
        .where(eq(shopifySyncLog.id, syncLogId))
        .limit(1),
      db
        .select()
        .from(shopifySyncErrors)
        .where(eq(shopifySyncErrors.syncLogId, syncLogId))
        .orderBy(desc(shopifySyncErrors.createdAt)),
    ]);

    return {
      log: logResult[0] || null,
      errors,
    };
  }

  /**
   * Retry failed products from a sync log
   */
  async getRetryableErrors(syncLogId: string): Promise<ShopifySyncError[]> {
    return db
      .select()
      .from(shopifySyncErrors)
      .where(
        and(
          eq(shopifySyncErrors.syncLogId, syncLogId),
          eq(shopifySyncErrors.status, "unresolved"),
          // Only retry certain error types
          or(
            eq(shopifySyncErrors.errorType, "RATE_LIMIT"),
            eq(shopifySyncErrors.errorType, "NETWORK_ERROR"),
            eq(shopifySyncErrors.errorType, "DATABASE_ERROR")
          )
        )
      );
  }

  /**
   * Increment retry count for an error
   */
  async incrementRetryCount(errorId: string): Promise<void> {
    await db
      .update(shopifySyncErrors)
      .set({
        retryCount: sql`${shopifySyncErrors.retryCount} + 1`,
        lastRetryAt: new Date(),
        status: "retry_pending",
      })
      .where(eq(shopifySyncErrors.id, errorId));
  }

  /**
   * Debug helper: Print current error summary to console
   */
  async printErrorSummary(syncLogId?: string): Promise<void> {
    const stats = await this.getStats(syncLogId);

    console.log("\n========== SYNC ERROR SUMMARY ==========");
    console.log(`Total Errors: ${stats.total}`);
    console.log(`  - Unresolved: ${stats.unresolved}`);
    console.log(`  - Resolved: ${stats.resolved}`);
    console.log(`  - Ignored: ${stats.ignored}`);

    if (Object.keys(stats.byType).length > 0) {
      console.log("\nBy Error Type:");
      for (const [type, count] of Object.entries(stats.byType)) {
        console.log(`  - ${type}: ${count}`);
      }
    }

    if (Object.keys(stats.byOperation).length > 0) {
      console.log("\nBy Operation:");
      for (const [op, count] of Object.entries(stats.byOperation)) {
        console.log(`  - ${op}: ${count}`);
      }
    }

    if (stats.recentErrors.length > 0) {
      console.log("\nRecent Errors:");
      for (const error of stats.recentErrors.slice(0, 5)) {
        console.log(`  - [${error.errorType}] ${error.productTitle || error.shopifyProductId || 'unknown'}`);
        console.log(`    ${error.errorMessage.substring(0, 100)}${error.errorMessage.length > 100 ? '...' : ''}`);
      }
    }

    console.log("==========================================\n");
  }

  // =============================================================================
  // PRODUCT SYNC CHANGELOG METHODS
  // =============================================================================

  /**
   * Persist changelog entries to database
   * Called after sync completes to save all field-level changes
   */
  async persistChangelog(
    tenantId: string,
    syncLogId: string,
    changes: Array<{
      productId?: string;
      shopifyProductId?: string;
      productTitle: string;
      variantId?: string;
      shopifyVariantId?: string;
      variantTitle?: string;
      field: string;
      oldValue: any;
      newValue: any;
      changeType?: string;
    }>
  ): Promise<void> {
    if (changes.length === 0) return;

    try {
      const changelogEntries = changes.map(change => ({
        tenantId,
        syncLogId,
        productId: change.productId || null,
        shopifyProductId: change.shopifyProductId || null,
        productTitle: change.productTitle,
        variantId: change.variantId || null,
        shopifyVariantId: change.shopifyVariantId || null,
        variantTitle: change.variantTitle || null,
        field: change.field,
        oldValue: change.oldValue != null ? String(change.oldValue) : null,
        newValue: change.newValue != null ? String(change.newValue) : null,
        changeType: change.changeType || "update",
      }));

      await db.insert(productSyncChangelog).values(changelogEntries);
      console.log(`[SyncDebug] Persisted ${changes.length} changelog entries for sync ${syncLogId}`);
    } catch (error) {
      console.error('[SyncDebug] Failed to persist changelog:', error);
      // Don't throw - changelog failure shouldn't fail the sync
    }
  }

  /**
   * Get changelog entries for a specific sync log session
   */
  async getChangelogBySyncLog(
    tenantId: string,
    syncLogId: string,
    limit = 100,
    offset = 0
  ): Promise<ProductSyncChangelog[]> {
    return db
      .select()
      .from(productSyncChangelog)
      .where(and(
        eq(productSyncChangelog.tenantId, tenantId),
        eq(productSyncChangelog.syncLogId, syncLogId)
      ))
      .orderBy(desc(productSyncChangelog.createdAt))
      .limit(limit)
      .offset(offset);
  }

  /**
   * Get changelog entries for a specific product (all syncs)
   */
  async getProductChangelog(
    tenantId: string,
    productId: string,
    limit = 50
  ): Promise<ProductSyncChangelog[]> {
    return db
      .select()
      .from(productSyncChangelog)
      .where(and(
        eq(productSyncChangelog.tenantId, tenantId),
        eq(productSyncChangelog.productId, productId)
      ))
      .orderBy(desc(productSyncChangelog.createdAt))
      .limit(limit);
  }

  /**
   * Get changelog entries with filters for UI display
   */
  async getChangelog(
    tenantId: string,
    filters: {
      dateFrom?: Date;
      dateTo?: Date;
      field?: string;
      productSearch?: string;
      changeType?: string;
      syncLogId?: string;
    },
    limit = 50,
    offset = 0
  ): Promise<ProductSyncChangelog[]> {
    const conditions = [eq(productSyncChangelog.tenantId, tenantId)];

    if (filters.dateFrom) {
      conditions.push(gte(productSyncChangelog.createdAt, filters.dateFrom));
    }
    if (filters.dateTo) {
      conditions.push(lte(productSyncChangelog.createdAt, filters.dateTo));
    }
    if (filters.field) {
      conditions.push(eq(productSyncChangelog.field, filters.field));
    }
    if (filters.productSearch) {
      conditions.push(ilike(productSyncChangelog.productTitle, `%${filters.productSearch}%`));
    }
    if (filters.changeType) {
      conditions.push(eq(productSyncChangelog.changeType, filters.changeType));
    }
    if (filters.syncLogId) {
      conditions.push(eq(productSyncChangelog.syncLogId, filters.syncLogId));
    }

    return db
      .select()
      .from(productSyncChangelog)
      .where(and(...conditions))
      .orderBy(desc(productSyncChangelog.createdAt))
      .limit(limit)
      .offset(offset);
  }

  /**
   * Get total count of changelog entries matching filters
   */
  async getChangelogCount(
    tenantId: string,
    filters: {
      dateFrom?: Date;
      dateTo?: Date;
      field?: string;
      productSearch?: string;
      changeType?: string;
      syncLogId?: string;
    }
  ): Promise<number> {
    const conditions = [eq(productSyncChangelog.tenantId, tenantId)];

    if (filters.dateFrom) {
      conditions.push(gte(productSyncChangelog.createdAt, filters.dateFrom));
    }
    if (filters.dateTo) {
      conditions.push(lte(productSyncChangelog.createdAt, filters.dateTo));
    }
    if (filters.field) {
      conditions.push(eq(productSyncChangelog.field, filters.field));
    }
    if (filters.productSearch) {
      conditions.push(ilike(productSyncChangelog.productTitle, `%${filters.productSearch}%`));
    }
    if (filters.changeType) {
      conditions.push(eq(productSyncChangelog.changeType, filters.changeType));
    }
    if (filters.syncLogId) {
      conditions.push(eq(productSyncChangelog.syncLogId, filters.syncLogId));
    }

    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(productSyncChangelog)
      .where(and(...conditions));

    return Number(result[0]?.count || 0);
  }
}

export const syncDebugService = new SyncDebugService();
