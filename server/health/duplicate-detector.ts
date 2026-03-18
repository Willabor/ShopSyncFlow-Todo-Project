/**
 * Collection Health System - Duplicate Detector
 *
 * Detects collections with duplicate names and provides recommendations
 * for which ones to keep/delete.
 */

import { v4 as uuidv4 } from "uuid";
import type { Collection, NavigationItem } from "@shared/schema";
import type {
  DuplicateGroup,
  DuplicateCollection,
  DuplicateRecommendation,
  DuplicateDetectionOptions,
} from "./types";

// Navigation item with optional enriched menu title
type EnrichedNavigationItem = NavigationItem & { menuTitle?: string };

/**
 * Detect duplicate collections by name
 *
 * @param collections - All collections to check
 * @param navItems - Navigation items for conflict detection
 * @param options - Detection options
 * @returns Array of duplicate groups
 */
export async function detectDuplicates(
  collections: Collection[],
  navItems: EnrichedNavigationItem[],
  options: DuplicateDetectionOptions
): Promise<DuplicateGroup[]> {
  // 1. Group collections by normalized name
  const groupsByName = groupByNormalizedName(collections);

  // 2. Filter to only groups with multiple collections (actual duplicates)
  const duplicateGroups = Object.entries(groupsByName)
    .filter(([_, items]) => items.length > 1);

  if (duplicateGroups.length === 0) {
    return [];
  }

  // 3. Build navigation lookup for quick access
  const navLookup = buildNavigationLookup(navItems);

  // 4. Transform each group into DuplicateGroup with recommendations
  const result: DuplicateGroup[] = [];

  for (const [name, collectionList] of duplicateGroups) {
    // Skip empty collections if option not set
    if (!options.includeEmpty) {
      const hasNonEmpty = collectionList.some(c => (c.productCount || 0) > 0);
      if (!hasNonEmpty) continue;
    }

    // Enrich collections with navigation info
    const enrichedCollections = collectionList.map(c =>
      enrichCollectionWithNavInfo(c, navLookup)
    );

    // Generate recommendation
    const recommendation = determineRecommendation(enrichedCollections);

    result.push({
      id: uuidv4(),
      name,
      collections: enrichedCollections,
      recommendation,
    });
  }

  // 5. Sort by severity (groups with navigation conflicts first, then by count)
  result.sort((a, b) => {
    const aHasNavConflict = a.collections.some(c => c.inNavigation);
    const bHasNavConflict = b.collections.some(c => c.inNavigation);

    if (aHasNavConflict && !bHasNavConflict) return -1;
    if (!aHasNavConflict && bHasNavConflict) return 1;

    return b.collections.length - a.collections.length;
  });

  return result;
}

/**
 * Group collections by normalized name (lowercase, trimmed)
 */
function groupByNormalizedName(
  collections: Collection[]
): Record<string, Collection[]> {
  const groups: Record<string, Collection[]> = {};

  for (const collection of collections) {
    const normalizedName = collection.name.toLowerCase().trim();

    if (!groups[normalizedName]) {
      groups[normalizedName] = [];
    }
    groups[normalizedName].push(collection);
  }

  return groups;
}

/**
 * Build a lookup map for navigation items by shopifyCollectionId (targetId)
 */
function buildNavigationLookup(
  navItems: EnrichedNavigationItem[]
): Map<string, { menuTitle: string; itemTitle: string }[]> {
  const lookup = new Map<string, { menuTitle: string; itemTitle: string }[]>();

  for (const item of navItems) {
    // Check for COLLECTION type items with a targetId (Shopify GID)
    if (item.type !== 'COLLECTION' || !item.targetId) continue;

    // targetId is the Shopify GID like "gid://shopify/Collection/123456"
    const shopifyCollectionId = item.targetId;
    const entries = lookup.get(shopifyCollectionId) || [];

    entries.push({
      menuTitle: item.menuTitle || 'Navigation', // Use enriched menu title
      itemTitle: item.title,
    });

    lookup.set(shopifyCollectionId, entries);
  }

  return lookup;
}

/**
 * Enrich a collection with navigation information
 */
function enrichCollectionWithNavInfo(
  collection: Collection,
  navLookup: Map<string, { menuTitle: string; itemTitle: string }[]>
): DuplicateCollection {
  // Look up by shopifyCollectionId (the Shopify GID)
  const shopifyId = collection.shopifyCollectionId;
  const navEntries = shopifyId ? navLookup.get(shopifyId) || [] : [];

  return {
    id: collection.id,
    name: collection.name,
    slug: collection.slug,
    shopifyCollectionId: collection.shopifyCollectionId,
    shopifyHandle: collection.shopifyHandle,
    productCount: collection.productCount || 0,
    createdByType: collection.createdByType,
    createdByName: collection.createdByName,
    createdAt: collection.createdAt,
    inNavigation: navEntries.length > 0,
    navigationMenus: navEntries.map(e => e.menuTitle),
  };
}

/**
 * Check if a handle appears to be app-generated (e.g., Power Tools Filter Menu)
 * App-generated handles often include words like "to", "and", etc. that would be
 * stripped in manually created handles.
 *
 * Examples:
 * - "20-to-40" (app) vs "20-40" (original) for "$20 to $40"
 * - "shirts-and-tops" (app) vs "shirts-tops" (original)
 */
function isAppGeneratedHandle(handle: string | null | undefined, name: string): boolean {
  if (!handle || !name) return false;

  // Common words that apps include in handles but humans typically omit
  const appPatterns = [
    /-to-/,      // "20-to-40" instead of "20-40"
    /-and-/,     // "shirts-and-tops" instead of "shirts-tops"
    /-or-/,      // rarely used but possible
    /-the-/,     // "the-summer-sale" instead of "summer-sale"
    /-a-/,       // similar pattern
    /-an-/,      // similar pattern
  ];

  // Check if handle contains these patterns AND the name contains the word
  // This ensures we're detecting app-generated patterns, not legitimate uses
  for (const pattern of appPatterns) {
    if (pattern.test(handle)) {
      // Extract the word from the pattern (e.g., "to" from /-to-/)
      const word = pattern.source.replace(/-/g, '').replace(/\\/g, '');
      // Check if the original name contains this word (case insensitive)
      if (name.toLowerCase().includes(` ${word} `) ||
          name.toLowerCase().includes(` ${word}`) ||
          name.toLowerCase().includes(`${word} `)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Determine which collection to keep and which to delete
 *
 * Priority rules:
 * 1. Keep the one with original handle (no -1, -2 suffix and not app-generated)
 * 2. Keep the one in navigation menus
 * 3. Keep the one with more products
 * 4. Keep the one created by staff (not app)
 * 5. Keep the older one (by Shopify ID numeric value, not local sync date)
 */
function determineRecommendation(
  collections: DuplicateCollection[]
): DuplicateRecommendation {
  const sorted = [...collections].sort((a, b) => {
    // 1a. Numeric suffix loses (e.g., -1, -2 at end)
    const aHasNumericSuffix = a.shopifyHandle?.match(/-\d+$/) !== null;
    const bHasNumericSuffix = b.shopifyHandle?.match(/-\d+$/) !== null;
    if (!aHasNumericSuffix && bHasNumericSuffix) return -1;
    if (aHasNumericSuffix && !bHasNumericSuffix) return 1;

    // 1b. App-generated handle loses (e.g., -to-, -and-)
    const aIsAppGenerated = isAppGeneratedHandle(a.shopifyHandle, a.name);
    const bIsAppGenerated = isAppGeneratedHandle(b.shopifyHandle, b.name);
    if (!aIsAppGenerated && bIsAppGenerated) return -1;
    if (aIsAppGenerated && !bIsAppGenerated) return 1;

    // 2. In navigation wins
    if (a.inNavigation && !b.inNavigation) return -1;
    if (!a.inNavigation && b.inNavigation) return 1;

    // 3. More products wins
    if (a.productCount > b.productCount) return -1;
    if (a.productCount < b.productCount) return 1;

    // 4. Staff-created wins over app-created
    if (a.createdByType === 'staff' && b.createdByType === 'app') return -1;
    if (a.createdByType === 'app' && b.createdByType === 'staff') return 1;

    // 5. Lower Shopify ID wins (older collection in Shopify, not local sync date)
    // Shopify IDs are sequential - lower number = created earlier
    const aShopifyNum = extractShopifyIdNumber(a.shopifyCollectionId);
    const bShopifyNum = extractShopifyIdNumber(b.shopifyCollectionId);
    if (aShopifyNum && bShopifyNum) {
      return aShopifyNum - bShopifyNum;
    }

    // Fallback: use local created_at if Shopify IDs not available
    const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return aTime - bTime;
  });

  const keep = sorted[0];
  const toDelete = sorted.slice(1);

  return {
    keepId: keep.id,
    deleteIds: toDelete.map(c => c.id),
    reason: generateRecommendationReason(keep, toDelete),
  };
}

/**
 * Extract numeric ID from Shopify GID
 * e.g., "gid://shopify/Collection/158892294216" -> 158892294216
 */
function extractShopifyIdNumber(gid: string | null | undefined): number | null {
  if (!gid) return null;
  const match = gid.match(/\/(\d+)$/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Generate a human-readable reason for the recommendation
 */
function generateRecommendationReason(
  keep: DuplicateCollection,
  toDelete: DuplicateCollection[]
): string {
  const reasons: string[] = [];

  // Check for handle suffix
  const hasSuffix = keep.shopifyHandle?.match(/-\d+$/);
  if (!hasSuffix) {
    // Check if any deleted collection has app-generated handle
    const deletedAppGenerated = toDelete.some(c =>
      isAppGeneratedHandle(c.shopifyHandle, c.name)
    );
    if (deletedAppGenerated) {
      reasons.push('has the original URL handle (duplicate appears app-generated)');
    } else {
      reasons.push('has the original URL handle');
    }
  }

  // Check for navigation presence
  if (keep.inNavigation) {
    reasons.push('is used in navigation menus');
  }

  // Check for products
  if (keep.productCount > 0) {
    const totalDeleteProducts = toDelete.reduce((sum, c) => sum + c.productCount, 0);
    if (keep.productCount > totalDeleteProducts) {
      reasons.push(`has the most products (${keep.productCount})`);
    }
  }

  // Check for creator type
  if (keep.createdByType === 'staff') {
    reasons.push('was created by staff');
  }

  // Check for Shopify ID (older = lower ID)
  const keepShopifyNum = extractShopifyIdNumber(keep.shopifyCollectionId);
  const deleteShopifyNums = toDelete
    .map(c => extractShopifyIdNumber(c.shopifyCollectionId))
    .filter((n): n is number => n !== null);

  if (keepShopifyNum && deleteShopifyNums.length > 0 && reasons.length === 0) {
    const isOldest = deleteShopifyNums.every(n => keepShopifyNum < n);
    if (isOldest) {
      reasons.push('was created first in Shopify (lower collection ID)');
    }
  }

  if (reasons.length === 0) {
    reasons.push('is the oldest collection');
  }

  return `Keep "${keep.name}" (${keep.shopifyHandle || keep.slug}) because it ${reasons.join(', ')}.`;
}

/**
 * Calculate the severity of a duplicate group
 */
export function calculateDuplicateSeverity(group: DuplicateGroup): 'critical' | 'high' | 'medium' | 'low' {
  // Critical: Collections recommended for deletion are in navigation
  const deleteInNav = group.collections.some(
    c => group.recommendation.deleteIds.includes(c.id) && c.inNavigation
  );
  if (deleteInNav) return 'critical';

  // High: Multiple collections with products
  const withProducts = group.collections.filter(c => c.productCount > 0);
  if (withProducts.length > 1) return 'high';

  // Medium: 3+ duplicates
  if (group.collections.length >= 3) return 'medium';

  // Low: Simple duplicate pair
  return 'low';
}
