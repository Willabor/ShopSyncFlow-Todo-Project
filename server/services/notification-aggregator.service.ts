/**
 * Notification Aggregator Service
 *
 * Aggregates alerts from multiple data sources into the notification system:
 * - Collection Health Issues
 * - Weight Discrepancies
 * - Quality Score
 * - Sync Errors
 * - Import Status
 */

import { storage } from "../storage";
import { db } from "../db";
import {
  collectionHealthIssues,
  weightDiscrepancies,
  productTypeWeightMappings,
  products,
  type Notification,
} from "@shared/schema";
import { eq, and, count, sql, isNull, isNotNull, ne } from "drizzle-orm";

// Thresholds for severity levels
const THRESHOLDS = {
  collectionIssues: { warning: 10, critical: 25 },
  weightDiscrepancies: { warning: 1000, critical: 2500 },
  qualityScore: { warning: 80, critical: 70 },
} as const;

// Source types for aggregated notifications
export const NOTIFICATION_SOURCES = {
  COLLECTION_HEALTH: "collection_health",
  WEIGHT_DISCREPANCY: "weight_discrepancy",
  QUALITY_SCORE: "quality_score",
  SYNC_ERROR: "sync_error",
  IMPORT_STATUS: "import",
} as const;

export interface AggregationResult {
  source: string;
  count: number;
  severity: "critical" | "warning" | "info";
  notification?: Notification;
}

/**
 * Aggregate all notification sources for a tenant
 */
export async function aggregateNotifications(tenantId: string): Promise<AggregationResult[]> {
  const results: AggregationResult[] = [];

  // Run all aggregations in parallel
  const [healthResult, weightResult, qualityResult] = await Promise.all([
    aggregateCollectionHealth(tenantId),
    aggregateWeightDiscrepancies(tenantId),
    aggregateQualityScore(tenantId),
  ]);

  if (healthResult) results.push(healthResult);
  if (weightResult) results.push(weightResult);
  if (qualityResult) results.push(qualityResult);

  return results;
}

/**
 * Aggregate collection health issues
 */
async function aggregateCollectionHealth(tenantId: string): Promise<AggregationResult | null> {
  // Count open collection health issues
  const result = await db
    .select({ count: count() })
    .from(collectionHealthIssues)
    .where(
      and(
        eq(collectionHealthIssues.tenantId, tenantId),
        isNull(collectionHealthIssues.resolvedAt)
      )
    );

  const issueCount = Number(result[0]?.count || 0);

  if (issueCount === 0) {
    // No issues - clear existing notification if any
    return null;
  }

  // Determine severity based on count
  let severity: "critical" | "warning" | "info" = "info";
  if (issueCount >= THRESHOLDS.collectionIssues.critical) {
    severity = "critical";
  } else if (issueCount >= THRESHOLDS.collectionIssues.warning) {
    severity = "warning";
  }

  // Create or update aggregated notification
  const notification = await storage.createOrUpdateAggregatedNotification(
    tenantId,
    NOTIFICATION_SOURCES.COLLECTION_HEALTH,
    {
      category: "health",
      severity,
      title: "Collection Health Issues",
      message: `${issueCount} collection ${issueCount === 1 ? "issue requires" : "issues require"} attention`,
      actionUrl: "/collection-health",
      metadata: { issueCount },
    }
  );

  return {
    source: NOTIFICATION_SOURCES.COLLECTION_HEALTH,
    count: issueCount,
    severity,
    notification,
  };
}

/**
 * Aggregate weight discrepancies
 */
async function aggregateWeightDiscrepancies(tenantId: string): Promise<AggregationResult | null> {
  // Count pending weight discrepancies
  const result = await db
    .select({ count: count() })
    .from(weightDiscrepancies)
    .where(
      and(
        eq(weightDiscrepancies.tenantId, tenantId),
        eq(weightDiscrepancies.status, "pending")
      )
    );

  const discrepancyCount = Number(result[0]?.count || 0);

  if (discrepancyCount === 0) {
    return null;
  }

  // Determine severity
  let severity: "critical" | "warning" | "info" = "info";
  if (discrepancyCount >= THRESHOLDS.weightDiscrepancies.critical) {
    severity = "critical";
  } else if (discrepancyCount >= THRESHOLDS.weightDiscrepancies.warning) {
    severity = "warning";
  }

  const notification = await storage.createOrUpdateAggregatedNotification(
    tenantId,
    NOTIFICATION_SOURCES.WEIGHT_DISCREPANCY,
    {
      category: "health",
      severity,
      title: "Weight Discrepancies",
      message: `${discrepancyCount.toLocaleString()} ${discrepancyCount === 1 ? "discrepancy" : "discrepancies"} detected`,
      actionUrl: "/weight-rules",
      metadata: { discrepancyCount },
    }
  );

  return {
    source: NOTIFICATION_SOURCES.WEIGHT_DISCREPANCY,
    count: discrepancyCount,
    severity,
    notification,
  };
}

/**
 * Aggregate quality score from product type weight mappings
 * Quality = % of unique product types that have weight mappings
 */
async function aggregateQualityScore(tenantId: string): Promise<AggregationResult | null> {
  // Get distinct product types in use from products table
  const productTypesResult = await db
    .select({
      count: sql<number>`COUNT(DISTINCT ${products.productType})`,
    })
    .from(products)
    .where(
      and(
        eq(products.tenantId, tenantId),
        isNotNull(products.productType),
        ne(products.productType, "")
      )
    );

  // Get count of mapped product types
  const mappedResult = await db
    .select({
      count: sql<number>`COUNT(DISTINCT ${productTypeWeightMappings.productType})`,
    })
    .from(productTypeWeightMappings)
    .where(
      and(
        eq(productTypeWeightMappings.tenantId, tenantId),
        eq(productTypeWeightMappings.isActive, true)
      )
    );

  const total = Number(productTypesResult[0]?.count || 0);
  const mapped = Number(mappedResult[0]?.count || 0);

  if (total === 0) {
    return null;
  }

  const qualityScore = Math.round((mapped / total) * 100 * 10) / 10; // One decimal place
  const unmapped = total - mapped;

  // Only create notification if quality score is below warning threshold
  if (qualityScore >= THRESHOLDS.qualityScore.warning) {
    return null;
  }

  // Determine severity
  let severity: "critical" | "warning" | "info" = "warning";
  if (qualityScore < THRESHOLDS.qualityScore.critical) {
    severity = "critical";
  }

  const notification = await storage.createOrUpdateAggregatedNotification(
    tenantId,
    NOTIFICATION_SOURCES.QUALITY_SCORE,
    {
      category: "quality",
      severity,
      title: "Product Quality Score",
      message: `Quality score at ${qualityScore}% - ${unmapped} product types need weight mapping`,
      actionUrl: "/weight-rules",
      metadata: { qualityScore, total, mapped, unmapped },
    }
  );

  return {
    source: NOTIFICATION_SOURCES.QUALITY_SCORE,
    count: unmapped,
    severity,
    notification,
  };
}

/**
 * Create a sync error notification
 */
export async function createSyncErrorNotification(
  tenantId: string,
  errorCount: number,
  details?: string
): Promise<Notification> {
  return await storage.createOrUpdateAggregatedNotification(
    tenantId,
    NOTIFICATION_SOURCES.SYNC_ERROR,
    {
      category: "sync",
      severity: "critical",
      title: "Sync Errors",
      message: `${errorCount} sync ${errorCount === 1 ? "error" : "errors"} occurred${details ? `: ${details}` : ""}`,
      actionUrl: "/sync-log",
      metadata: { errorCount, details },
    }
  );
}

/**
 * Create an import status notification
 */
export async function createImportNotification(
  tenantId: string,
  status: "success" | "partial" | "failed",
  details: { imported?: number; failed?: number; total?: number; message?: string }
): Promise<Notification> {
  let severity: "critical" | "warning" | "info" = "info";
  let title = "Import Complete";
  let message = "";

  switch (status) {
    case "success":
      severity = "info";
      title = "Import Successful";
      message = `Successfully imported ${details.imported || 0} items`;
      break;
    case "partial":
      severity = "warning";
      title = "Import Partially Complete";
      message = `Imported ${details.imported || 0} of ${details.total || 0} items (${details.failed || 0} failed)`;
      break;
    case "failed":
      severity = "critical";
      title = "Import Failed";
      message = details.message || "Import process failed";
      break;
  }

  return await storage.createOrUpdateAggregatedNotification(
    tenantId,
    NOTIFICATION_SOURCES.IMPORT_STATUS,
    {
      category: "sync",
      severity,
      title,
      message,
      actionUrl: "/import-history",
      metadata: details,
    }
  );
}

/**
 * Clear a specific aggregated notification when the issue is resolved
 */
export async function clearAggregatedNotification(
  tenantId: string,
  sourceType: string
): Promise<void> {
  // Dismiss the notification rather than deleting it
  // This preserves history while removing it from the active count
  const existing = await db
    .select()
    .from(
      sql`(SELECT * FROM notifications WHERE tenant_id = ${tenantId} AND source_type = ${sourceType} AND dismissed = false LIMIT 1)`
    );

  // If a notification exists for this source, dismiss it
  // We can't use the result directly since it's a raw query
  // Instead, let's use the storage method indirectly
  const notificationResult = await storage.getNotificationsByCategory(tenantId, undefined, 100);
  const targetNotification = notificationResult.find(
    (n) => n.sourceType === sourceType && !n.dismissed
  );

  if (targetNotification) {
    await storage.dismissNotification(tenantId, targetNotification.id);
  }
}
