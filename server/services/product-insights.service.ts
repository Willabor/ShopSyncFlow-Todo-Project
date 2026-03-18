/**
 * Product Insights Service
 *
 * Calculates analytics and metrics for the Product Insights dashboard.
 *
 * Metrics:
 * - Status overview (active, draft, archived counts)
 * - Data quality (missing images, descriptions, duplicate SKUs)
 * - Vendor distribution (top vendors by product count)
 * - Archive trends (coming in future phases)
 * - Inventory health (coming in future phases)
 *
 * Performance:
 * - In-memory cache with 5-minute TTL
 * - Prevents slow queries on large datasets (5000+ products)
 *
 * MULTI-TENANT: All queries are filtered by tenantId.
 * Cache is scoped per-tenant to prevent data pollution.
 */

import { db } from "../db";
import { products, vendors, productVariants } from "@shared/schema";
import { sql, eq, isNull, or, and, desc } from "drizzle-orm";

// In-memory cache
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

// MULTI-TENANT: Tenant-scoped cache - tenantId -> (key -> entry)
const cache = new Map<string, Map<string, CacheEntry<any>>>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get cached data or compute if expired
 * MULTI-TENANT: Cache is scoped by tenantId
 */
function getCached<T>(tenantId: string, key: string, computeFn: () => Promise<T>): Promise<T> {
  let tenantCache = cache.get(tenantId);
  if (!tenantCache) {
    tenantCache = new Map();
    cache.set(tenantId, tenantCache);
  }
  const cached = tenantCache.get(key);
  const now = Date.now();

  if (cached && now - cached.timestamp < CACHE_TTL) {
    console.log(`[Cache HIT] tenant:${tenantId}:${key} (age: ${Math.round((now - cached.timestamp) / 1000)}s)`);
    return Promise.resolve(cached.data);
  }

  console.log(`[Cache MISS] tenant:${tenantId}:${key} - Computing...`);
  return computeFn().then((data) => {
    tenantCache!.set(key, { data, timestamp: now });
    return data;
  });
}

/**
 * Clear cache entries
 * MULTI-TENANT: Can clear for specific tenant or all tenants
 */
export function clearInsightsCache(tenantId?: string): void {
  if (tenantId) {
    cache.delete(tenantId);
    console.log(`[Cache] Cleared insights cache for tenant ${tenantId}`);
  } else {
    cache.clear();
    console.log("[Cache] Cleared all insights cache");
  }
}

interface StatusOverview {
  total: number;
  active: { count: number; percentage: number };
  draft: { count: number; percentage: number };
  archived: { count: number; percentage: number };
  localDraft: { count: number; percentage: number };
}

interface DataQuality {
  missingImages: number;
  missingDescriptions: number;
  missingVendors: number;
  duplicateSKUs: number;
  zeroPrice: number;
}

interface VendorStat {
  id: string;
  name: string;
  productCount: number;
  activeCount: number;
  draftCount: number;
  archivedCount: number;
  color: string | null;
}

interface ArchiveAgeMetrics {
  lessThan1Month: number;
  oneToThreeMonths: number;
  threeToSixMonths: number;
  sixToTwelveMonths: number;
  oneToTwoYears: number;   // Review candidates
  overTwoYears: number;    // Delete candidates
  totalArchived: number;
}

interface InsightsDashboardData {
  statusOverview: StatusOverview;
  dataQuality: DataQuality;
  topVendors: VendorStat[];
  archiveAge: ArchiveAgeMetrics;
  lastUpdated: Date;
}

export class ProductInsightsService {
  /**
   * Get complete dashboard data (cached)
   * MULTI-TENANT: Requires tenantId parameter
   */
  async getDashboardData(tenantId: string): Promise<InsightsDashboardData> {
    return getCached(tenantId, "dashboard", async () => {
      const [statusOverview, dataQuality, topVendors, archiveAge] = await Promise.all([
        this._computeStatusOverview(tenantId),
        this._computeDataQuality(tenantId),
        this._computeTopVendors(tenantId, 10),
        this._computeArchiveAge(tenantId),
      ]);

      return {
        statusOverview,
        dataQuality,
        topVendors,
        archiveAge,
        lastUpdated: new Date(),
      };
    });
  }

  /**
   * Calculate status distribution (cached)
   * MULTI-TENANT: Requires tenantId parameter
   */
  async getStatusOverview(tenantId: string): Promise<StatusOverview> {
    return getCached(tenantId, "statusOverview", async () => this._computeStatusOverview(tenantId));
  }

  private async _computeStatusOverview(tenantId: string): Promise<StatusOverview> {
    // MULTI-TENANT: Added tenantId filter
    // Get total count
    const totalResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(products)
      .where(eq(products.tenantId, tenantId));

    const total = totalResult[0]?.count || 0;

    // MULTI-TENANT: Added tenantId filter
    // Get counts by status
    const statusCounts = await db
      .select({
        status: products.status,
        count: sql<number>`count(*)::int`,
      })
      .from(products)
      .where(eq(products.tenantId, tenantId))
      .groupBy(products.status);

    // Build status map
    const statusMap: Record<string, number> = {};
    for (const row of statusCounts) {
      statusMap[row.status || 'unknown'] = row.count;
    }

    const calculatePercentage = (count: number): number => {
      return total > 0 ? Math.round((count / total) * 100 * 100) / 100 : 0;
    };

    const activeCount = statusMap['active'] || 0;
    const draftCount = statusMap['draft'] || 0;
    const archivedCount = statusMap['archived'] || 0;
    const localDraftCount = statusMap['local_draft'] || 0;

    return {
      total,
      active: {
        count: activeCount,
        percentage: calculatePercentage(activeCount),
      },
      draft: {
        count: draftCount,
        percentage: calculatePercentage(draftCount),
      },
      archived: {
        count: archivedCount,
        percentage: calculatePercentage(archivedCount),
      },
      localDraft: {
        count: localDraftCount,
        percentage: calculatePercentage(localDraftCount),
      },
    };
  }

  /**
   * Calculate data quality metrics (cached)
   * MULTI-TENANT: Requires tenantId parameter
   */
  async getDataQuality(tenantId: string): Promise<DataQuality> {
    return getCached(tenantId, "dataQuality", async () => this._computeDataQuality(tenantId));
  }

  private async _computeDataQuality(tenantId: string): Promise<DataQuality> {
    try {
      // MULTI-TENANT: Added tenantId filter
      // Products without images (images is null or empty array)
      const missingImagesResult = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(products)
        .where(
          and(
            eq(products.tenantId, tenantId),
            or(
              isNull(products.images),
              sql`array_length(${products.images}, 1) IS NULL`,
              sql`array_length(${products.images}, 1) = 0`
            )
          )
        );

      // MULTI-TENANT: Added tenantId filter
      // Products with missing descriptions
      const missingDescriptionsResult = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(products)
        .where(
          and(
            eq(products.tenantId, tenantId),
            or(
              isNull(products.description),
              sql`trim(${products.description}) = ''`
            )
          )
        );

      // MULTI-TENANT: Added tenantId filter
      // Products without vendors
      const missingVendorsResult = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(products)
        .where(
          and(
            eq(products.tenantId, tenantId),
            isNull(products.vendorId)
          )
        );

      // MULTI-TENANT: Added tenantId filter via subquery join
      // Duplicate SKUs (SKUs that appear more than once in product_variants for this tenant)
      let duplicateSKUsResult = [];
      try {
        duplicateSKUsResult = await db
          .select({
            sku: productVariants.sku,
            count: sql<number>`count(*)::int`,
          })
          .from(productVariants)
          .innerJoin(products, eq(productVariants.productId, products.id))
          .where(
            and(
              eq(products.tenantId, tenantId),
              sql`${productVariants.sku} IS NOT NULL`,
              sql`trim(${productVariants.sku}) != ''`
            )
          )
          .groupBy(productVariants.sku)
          .having(sql`count(*) > 1`);
      } catch (dupError) {
        console.error("[Data Quality] Error querying duplicate SKUs:", dupError);
      }

      // MULTI-TENANT: Added tenantId filter via subquery join
      // Product variants with zero or null price
      const zeroPriceResult = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(productVariants)
        .innerJoin(products, eq(productVariants.productId, products.id))
        .where(
          and(
            eq(products.tenantId, tenantId),
            or(
              isNull(productVariants.price),
              sql`trim(${productVariants.price}) = ''`,
              sql`trim(${productVariants.price}) = '0'`,
              sql`trim(${productVariants.price}) = '0.00'`
            )
          )
        );

      return {
        missingImages: missingImagesResult[0]?.count || 0,
        missingDescriptions: missingDescriptionsResult[0]?.count || 0,
        missingVendors: missingVendorsResult[0]?.count || 0,
        duplicateSKUs: duplicateSKUsResult.length,
        zeroPrice: zeroPriceResult[0]?.count || 0,
      };
    } catch (error) {
      console.error("[Data Quality] Error computing data quality metrics:", error);
      // Return empty metrics if query fails
      return {
        missingImages: 0,
        missingDescriptions: 0,
        missingVendors: 0,
        duplicateSKUs: 0,
        zeroPrice: 0,
      };
    }
  }

  /**
   * Calculate archive age metrics based on Shopify updatedAt (cached)
   * MULTI-TENANT: Requires tenantId parameter
   *
   * Uses Shopify's updatedAt timestamp as a proxy for "when archived".
   * This is not perfect (updatedAt changes for ANY edit), but gives us
   * a rough idea of how old archived products are.
   *
   * Age categories:
   * - < 1 month: Fresh archives (may return to active)
   * - 1-3 months: Recent archives
   * - 3-6 months: Older archives
   * - 6-12 months: Very old archives
   * - 1-2 years: Review candidates (flag for manual review)
   * - 2+ years: Delete candidates (likely dead products)
   */
  async getArchiveAgeMetrics(tenantId: string): Promise<ArchiveAgeMetrics> {
    return getCached(tenantId, "archiveAge", async () => this._computeArchiveAge(tenantId));
  }

  private async _computeArchiveAge(tenantId: string): Promise<ArchiveAgeMetrics> {
    try {
      // MULTI-TENANT: Added tenantId filter to subquery
      // Query archived products with age buckets
      // We use EXTRACT(EPOCH ...) to get seconds, then divide by 86400 for days
      const result = await db
        .select({
          lessThan1Month: sql<number>`COUNT(*) FILTER (WHERE days_old < 30)::int`,
          oneToThreeMonths: sql<number>`COUNT(*) FILTER (WHERE days_old >= 30 AND days_old < 90)::int`,
          threeToSixMonths: sql<number>`COUNT(*) FILTER (WHERE days_old >= 90 AND days_old < 180)::int`,
          sixToTwelveMonths: sql<number>`COUNT(*) FILTER (WHERE days_old >= 180 AND days_old < 365)::int`,
          oneToTwoYears: sql<number>`COUNT(*) FILTER (WHERE days_old >= 365 AND days_old < 730)::int`,
          overTwoYears: sql<number>`COUNT(*) FILTER (WHERE days_old >= 730)::int`,
          totalArchived: sql<number>`COUNT(*)::int`,
        })
        .from(sql`(
          SELECT EXTRACT(EPOCH FROM NOW() - (metadata->>'shopifyUpdatedAt')::timestamp) / 86400 as days_old
          FROM ${products}
          WHERE status = 'archived'
            AND tenant_id = ${tenantId}
            AND metadata->>'shopifyUpdatedAt' IS NOT NULL
            AND (metadata->>'shopifyUpdatedAt')::text != ''
            AND (metadata->>'shopifyUpdatedAt')::text ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
        ) sub`);

      return result[0] || {
        lessThan1Month: 0,
        oneToThreeMonths: 0,
        threeToSixMonths: 0,
        sixToTwelveMonths: 0,
        oneToTwoYears: 0,
        overTwoYears: 0,
        totalArchived: 0,
      };
    } catch (error) {
      console.error("[Archive Age Metrics] Error computing archive age:", error);
      // Return empty metrics if query fails
      return {
        lessThan1Month: 0,
        oneToThreeMonths: 0,
        threeToSixMonths: 0,
        sixToTwelveMonths: 0,
        oneToTwoYears: 0,
        overTwoYears: 0,
        totalArchived: 0,
      };
    }
  }

  /**
   * Get top vendors by product count (cached)
   * MULTI-TENANT: Requires tenantId parameter
   */
  async getTopVendors(tenantId: string, limit: number = 10): Promise<VendorStat[]> {
    return getCached(tenantId, `topVendors_${limit}`, async () => this._computeTopVendors(tenantId, limit));
  }

  private async _computeTopVendors(tenantId: string, limit: number = 10): Promise<VendorStat[]> {
    // MULTI-TENANT: Added tenantId filter to both vendors and products
    const vendorStats = await db
      .select({
        id: vendors.id,
        name: vendors.name,
        color: vendors.color,
        productCount: sql<number>`count(${products.id})::int`,
        activeCount: sql<number>`sum(case when ${products.status} = 'active' then 1 else 0 end)::int`,
        draftCount: sql<number>`sum(case when ${products.status} = 'draft' then 1 else 0 end)::int`,
        archivedCount: sql<number>`sum(case when ${products.status} = 'archived' then 1 else 0 end)::int`,
      })
      .from(vendors)
      .leftJoin(products, and(
        eq(products.vendorId, vendors.id),
        eq(products.tenantId, tenantId)
      ))
      .where(eq(vendors.tenantId, tenantId))
      .groupBy(vendors.id, vendors.name, vendors.color)
      .orderBy(desc(sql`count(${products.id})`))
      .limit(limit);

    return vendorStats;
  }

  /**
   * Get products with specific data quality issue
   * MULTI-TENANT: Requires tenantId parameter
   */
  async getProductsByQualityIssue(
    tenantId: string,
    issue: 'missing-images' | 'missing-descriptions' | 'missing-vendors' | 'zero-price',
    limit: number = 50,
    offset: number = 0
  ) {
    let whereCondition;

    // MULTI-TENANT: Added tenantId filter to all conditions
    switch (issue) {
      case 'missing-images':
        whereCondition = and(
          eq(products.tenantId, tenantId),
          or(
            isNull(products.images),
            sql`array_length(${products.images}, 1) IS NULL`,
            sql`array_length(${products.images}, 1) = 0`
          )
        );
        break;
      case 'missing-descriptions':
        whereCondition = and(
          eq(products.tenantId, tenantId),
          or(
            isNull(products.description),
            sql`trim(${products.description}) = ''`
          )
        );
        break;
      case 'missing-vendors':
        whereCondition = and(
          eq(products.tenantId, tenantId),
          isNull(products.vendorId)
        );
        break;
      case 'zero-price':
        // MULTI-TENANT: Added tenantId filter
        // Products that have variants with zero or null price
        whereCondition = and(
          eq(products.tenantId, tenantId),
          sql`EXISTS (
            SELECT 1 FROM ${productVariants}
            WHERE ${productVariants.productId} = ${products.id}
            AND (
              ${productVariants.price} IS NULL
              OR trim(${productVariants.price}) = ''
              OR trim(${productVariants.price}) = '0'
              OR trim(${productVariants.price}) = '0.00'
            )
          )`
        );
        break;
      default:
        throw new Error(`Unknown quality issue: ${issue}`);
    }

    const affectedProducts = await db
      .select()
      .from(products)
      .where(whereCondition)
      .limit(limit)
      .offset(offset);

    const totalResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(products)
      .where(whereCondition);

    return {
      products: affectedProducts,
      total: totalResult[0]?.count || 0,
      issue,
    };
  }

  /**
   * Get duplicate SKUs with affected products
   * MULTI-TENANT: Requires tenantId parameter
   */
  async getDuplicateSKUs(tenantId: string) {
    // MULTI-TENANT: Added tenantId filter via join
    // Find SKUs that appear more than once in product_variants for this tenant
    const duplicateSKUs = await db
      .select({
        sku: productVariants.sku,
        count: sql<number>`count(*)::int`,
      })
      .from(productVariants)
      .innerJoin(products, eq(productVariants.productId, products.id))
      .where(
        and(
          eq(products.tenantId, tenantId),
          sql`${productVariants.sku} IS NOT NULL`,
          sql`trim(${productVariants.sku}) != ''`
        )
      )
      .groupBy(productVariants.sku)
      .having(sql`count(*) > 1`);

    // For each duplicate SKU, get the affected products
    const duplicateDetails = await Promise.all(
      duplicateSKUs.map(async (dup) => {
        // MULTI-TENANT: Added tenantId filter
        // Find products that have variants with this SKU
        const affectedProducts = await db
          .select({
            id: products.id,
            title: products.title,
            vendor: products.vendor,
            status: products.status,
            sku: productVariants.sku,
          })
          .from(products)
          .innerJoin(productVariants, eq(productVariants.productId, products.id))
          .where(
            and(
              eq(products.tenantId, tenantId),
              eq(productVariants.sku, dup.sku!)
            )
          );

        return {
          sku: dup.sku,
          count: dup.count,
          products: affectedProducts,
        };
      })
    );

    const totalAffectedProducts = duplicateDetails.reduce(
      (sum, dup) => sum + dup.count,
      0
    );

    return {
      duplicates: duplicateDetails,
      totalDuplicates: duplicateSKUs.length,
      affectedProducts: totalAffectedProducts,
    };
  }
}

// Export singleton instance
export const productInsightsService = new ProductInsightsService();
