/**
 * Collection Health System - Health Check Orchestrator
 *
 * Coordinates all health checks (duplicates, navigation conflicts, etc.)
 * and generates comprehensive health reports.
 */

import { storage } from "../storage";
import { detectDuplicates, calculateDuplicateSeverity } from "./duplicate-detector";
import { detectHandleMismatches } from "./handle-mismatch-detector";
import type {
  HealthCheckResult,
  HealthCheckOptions,
  HealthSummary,
  DuplicateGroup,
  NavigationConflict,
  HandleMismatch,
  HealthIssueCreateData,
  IssueType,
  IssueSeverity,
} from "./types";

// MULTI-TENANT: tenantId is now required in all functions (no default)

/**
 * Run a comprehensive health check on all collections
 */
export async function runHealthCheck(
  options: HealthCheckOptions
): Promise<HealthCheckResult> {
  // MULTI-TENANT: tenantId is now required
  if (!options.tenantId) {
    throw new Error('tenantId is required for health check');
  }

  const opts: HealthCheckOptions = {
    checkDuplicates: true,
    checkNavConflicts: true,
    checkHandleMismatches: true,
    checkOrphans: false, // Not implemented yet
    checkEmpty: false,   // Not implemented yet
    ...options,
  };

  const startTime = Date.now();

  // Fetch all collections (no limit to get all) - MULTI-TENANT: filter by tenant
  const { collections } = await storage.getAllCollections(opts.tenantId, { limit: 100000 });

  // Fetch navigation items (for conflict detection) with menu context
  const navMenus = await storage.getNavigationMenus(opts.tenantId);
  const navItems: any[] = [];
  for (const menu of navMenus) {
    const items = await storage.getNavigationItems(menu.id);
    // Enrich items with menu title for better conflict reporting
    const enrichedItems = items.map(item => ({
      ...item,
      menuTitle: menu.title,
    }));
    navItems.push(...enrichedItems);
  }

  // Initialize results
  let duplicateGroups: DuplicateGroup[] = [];
  let navigationConflicts: NavigationConflict[] = [];
  let handleMismatches: HandleMismatch[] = [];

  // Run duplicate detection
  if (opts.checkDuplicates) {
    duplicateGroups = await detectDuplicates(collections, navItems, {
      includeEmpty: true,
      checkNavigation: opts.checkNavConflicts,
      tenantId: opts.tenantId,
    });
  }

  // Detect navigation conflicts for collections marked for deletion
  if (opts.checkNavConflicts && duplicateGroups.length > 0) {
    navigationConflicts = detectNavigationConflicts(duplicateGroups, navItems);
  }

  // Detect orphan navigation links (pointing to non-existent collections)
  if (opts.checkNavConflicts) {
    const orphanConflicts = detectOrphanNavigationLinks(navItems, collections);
    navigationConflicts = [...navigationConflicts, ...orphanConflicts];
  }

  // Detect handle mismatches (name suggests different handle than actual)
  if (opts.checkHandleMismatches) {
    handleMismatches = detectHandleMismatches(collections);
    console.log(`Found ${handleMismatches.length} handle mismatches`);
  }

  // Calculate summary statistics
  const summary = calculateSummary(duplicateGroups, navigationConflicts, handleMismatches);

  // Calculate healthy collections
  const affectedCollectionIds = new Set<string>();
  for (const group of duplicateGroups) {
    for (const col of group.collections) {
      affectedCollectionIds.add(col.id);
    }
  }
  for (const mismatch of handleMismatches) {
    affectedCollectionIds.add(mismatch.collectionId);
  }
  const healthyCollections = collections.length - affectedCollectionIds.size;

  const result: HealthCheckResult = {
    scanDate: new Date(),
    totalCollections: collections.length,
    healthyCollections,
    duplicateGroups,
    navigationConflicts,
    handleMismatches,
    issueCount: summary.duplicateCount + summary.conflictCount + summary.mismatchCount,
    summary,
  };

  // Store health issues in database
  await storeHealthIssues(result, opts.tenantId);

  console.log(`Health check completed in ${Date.now() - startTime}ms`);
  console.log(`Found ${duplicateGroups.length} duplicate groups, ${navigationConflicts.length} nav conflicts`);

  return result;
}

/**
 * Slugify a collection name to get the expected handle
 * e.g., "Roku Studio" → "roku-studio", "Bleecker & Mercer" → "bleecker-mercer"
 */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/&/g, '') // Remove ampersands (Shopify converts & to nothing in handles)
    .replace(/[^\w\s-]/g, '') // Remove special characters
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single
    .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
}

/**
 * Check if a handle matches the expected slugified name
 */
function handleMatchesName(handle: string | null, name: string): boolean {
  if (!handle) return false;
  const expected = slugify(name);
  // Exact match
  if (handle === expected) return true;
  // Handle might have -N suffix added by Shopify
  const withoutSuffix = handle.replace(/-\d+$/, '');
  return withoutSuffix === expected;
}

/**
 * Detect navigation conflicts for collections that are recommended for deletion
 *
 * Conflict Types:
 * - switch_required: Navigation points to wrong duplicate, switch to the correct one
 * - remove_link: Both collections are empty, remove the navigation link entirely
 * - block_delete: Cannot delete because it's in navigation (fallback)
 */
function detectNavigationConflicts(
  duplicateGroups: DuplicateGroup[],
  navItems: any[]
): NavigationConflict[] {
  const conflicts: NavigationConflict[] = [];

  console.log(`[NavConflict] Processing ${duplicateGroups.length} duplicate groups`);

  for (const group of duplicateGroups) {
    // Get the collection we recommend to KEEP
    const keepCollection = group.collections.find(
      c => c.id === group.recommendation.keepId
    );

    // Get collections recommended for deletion
    const toDelete = group.collections.filter(
      c => group.recommendation.deleteIds.includes(c.id)
    );

    // Check if ALL collections in the group are empty
    const allEmpty = group.collections.every(c => c.productCount === 0);

    // Debug logging
    const keepInNav = keepCollection?.inNavigation;
    const deleteInNav = toDelete.filter(c => c.inNavigation).map(c => c.shopifyHandle);
    if (keepInNav || deleteInNav.length > 0) {
      console.log(`[NavConflict] Group "${group.name}": keepInNav=${keepInNav} (${keepCollection?.shopifyHandle}), deleteInNav=[${deleteInNav.join(', ')}]`);
    }

    // CASE 1: KEEP collection is in navigation but ALL are empty → remove_link
    if (keepCollection?.inNavigation && allEmpty) {
      conflicts.push({
        collectionId: keepCollection.id,
        collectionName: keepCollection.name,
        menuId: null,
        menuTitle: keepCollection.navigationMenus[0] || 'Navigation',
        itemTitle: keepCollection.name,
        severity: 'medium',
        message: `Navigation links to empty collection "${keepCollection.name}" (${keepCollection.shopifyHandle}). All ${group.collections.length} duplicates have 0 products.`,
        action: `Remove "${keepCollection.name}" from navigation and delete all duplicates`,
        conflictType: 'remove_link',
        currentInNav: {
          id: keepCollection.id,
          handle: keepCollection.shopifyHandle || keepCollection.slug,
          shopifyId: keepCollection.shopifyCollectionId,
          productCount: keepCollection.productCount,
        },
        switchTo: null,
      });
      continue;
    }

    // CASE 2: KEEP collection is in navigation but has WRONG handle
    // The DELETE collection has the CORRECT handle → switch_required
    if (keepCollection?.inNavigation && !allEmpty) {
      const keepHandle = keepCollection.shopifyHandle || keepCollection.slug;
      const keepMatchesName = handleMatchesName(keepHandle, group.name);

      // Find if any DELETE collection has a better (correct) handle
      const betterCollection = toDelete.find(c => {
        const deleteHandle = c.shopifyHandle || c.slug;
        return handleMatchesName(deleteHandle, group.name) && !keepMatchesName;
      });

      if (betterCollection && !keepMatchesName) {
        // The KEEP collection has wrong handle, DELETE collection has correct handle
        // This is a switch_required situation
        const betterHandle = betterCollection.shopifyHandle || betterCollection.slug;

        conflicts.push({
          collectionId: keepCollection.id,
          collectionName: keepCollection.name,
          menuId: null,
          menuTitle: keepCollection.navigationMenus[0] || 'Navigation',
          itemTitle: keepCollection.name,
          severity: 'critical',
          message: `Navigation links to "${keepHandle}" but correct handle is "${betterHandle}". ` +
                   `"${betterHandle}" has ${betterCollection.productCount} products vs ${keepCollection.productCount}.`,
          action: `Update navigation: switch from "${keepHandle}" to "${betterHandle}"`,
          conflictType: 'switch_required',
          currentInNav: {
            id: keepCollection.id,
            handle: keepHandle,
            shopifyId: keepCollection.shopifyCollectionId,
            productCount: keepCollection.productCount,
          },
          switchTo: {
            id: betterCollection.id,
            handle: betterHandle,
            shopifyId: betterCollection.shopifyCollectionId,
            productCount: betterCollection.productCount,
          },
        });
        // Don't continue - still process DELETE collections in case any are also in nav
      }
    }

    // CASE 3: Process collections marked for deletion that are in navigation
    for (const deleteCollection of toDelete) {
      // Only create conflicts for collections that are in navigation
      if (!deleteCollection.inNavigation) continue;

      console.log(`[NavConflict] CASE 3: "${deleteCollection.name}" (${deleteCollection.shopifyHandle}) is in navigation - creating conflict`);

      // Determine conflict type and action
      let conflictType: 'switch_required' | 'remove_link' | 'block_delete';
      let message: string;
      let action: string;
      let severity: 'critical' | 'high' | 'medium' | 'low' = 'critical';

      // Check if both collections are empty (remove link case)
      const bothEmpty = deleteCollection.productCount === 0 &&
                       (keepCollection?.productCount || 0) === 0;

      // Check if the keep collection has products (switch case)
      const keepHasProducts = (keepCollection?.productCount || 0) > 0;

      // Check if handle suggests wrong collection (has suffix like -1, -2)
      const deleteHasSuffix = deleteCollection.shopifyHandle?.match(/-\d+$/) !== null;

      if (bothEmpty) {
        // Both empty - recommend removing the link entirely
        conflictType = 'remove_link';
        message = `Navigation links to empty collection "${deleteCollection.name}" (${deleteCollection.shopifyHandle}). Both duplicates have 0 products.`;
        action = `Remove "${deleteCollection.name}" from navigation - both duplicates are empty`;
        severity = 'medium';
      } else if (keepCollection) {
        // Switch required - navigation points to wrong duplicate
        conflictType = 'switch_required';

        // Build detailed message
        const handleInfo = deleteHasSuffix
          ? ` (has -N suffix indicating duplicate)`
          : '';
        const productInfo = keepHasProducts
          ? ` with ${keepCollection.productCount} products`
          : '';

        message = `Navigation links to "${deleteCollection.shopifyHandle}"${handleInfo}. ` +
                  `Switch to "${keepCollection.shopifyHandle}"${productInfo}.`;

        action = `Update navigation: change link from "${deleteCollection.shopifyHandle}" to "${keepCollection.shopifyHandle}"`;
      } else {
        // Fallback - just block delete
        conflictType = 'block_delete';
        message = `Cannot delete "${deleteCollection.name}" - it's in navigation menu "${deleteCollection.navigationMenus[0] || 'Navigation'}"`;
        action = 'Update navigation menu before deleting this collection';
      }

      conflicts.push({
        collectionId: deleteCollection.id,
        collectionName: deleteCollection.name,
        menuId: null,
        menuTitle: deleteCollection.navigationMenus[0] || 'Navigation',
        itemTitle: deleteCollection.name,
        severity,
        message,
        action,
        conflictType,
        currentInNav: {
          id: deleteCollection.id,
          handle: deleteCollection.shopifyHandle || deleteCollection.slug,
          shopifyId: deleteCollection.shopifyCollectionId,
          productCount: deleteCollection.productCount,
        },
        switchTo: keepCollection ? {
          id: keepCollection.id,
          handle: keepCollection.shopifyHandle || keepCollection.slug,
          shopifyId: keepCollection.shopifyCollectionId,
          productCount: keepCollection.productCount,
        } : null,
      });
    }
  }

  console.log(`[NavConflict] Total conflicts detected: ${conflicts.length}`);
  conflicts.forEach(c => console.log(`  - ${c.collectionName} (${c.conflictType}): ${c.message.substring(0, 80)}...`));

  return conflicts;
}

/**
 * Detect orphan navigation links - nav items pointing to collections that don't exist
 */
function detectOrphanNavigationLinks(
  navItems: any[],
  collections: any[]
): NavigationConflict[] {
  const conflicts: NavigationConflict[] = [];

  // Build a set of all collection Shopify GIDs in our database
  const collectionGids = new Set(
    collections
      .filter(c => c.shopifyCollectionId)
      .map(c => c.shopifyCollectionId)
  );

  // Check each COLLECTION type nav item
  for (const item of navItems) {
    if (item.type !== 'COLLECTION' || !item.targetId) continue;

    // If the targetId doesn't exist in our collections, it's an orphan
    if (!collectionGids.has(item.targetId)) {
      console.log(`[OrphanLink] Found orphan: "${item.title}" points to ${item.targetId} which doesn't exist`);

      // Extract collection ID from GID for display
      const shopifyIdMatch = item.targetId.match(/Collection\/(\d+)/);
      const shopifyId = shopifyIdMatch ? shopifyIdMatch[1] : item.targetId;

      conflicts.push({
        collectionId: '', // No local collection ID - it doesn't exist
        collectionName: item.title,
        menuId: null,
        menuTitle: item.menuTitle || 'Navigation',
        itemTitle: item.title,
        severity: 'high',
        message: `Navigation links to deleted collection "${item.title}" (Shopify ID: ${shopifyId}). This collection no longer exists.`,
        action: `Remove "${item.title}" from navigation menu "${item.menuTitle || 'Navigation'}"`,
        conflictType: 'orphan_link',
        currentInNav: {
          id: '',
          handle: item.targetUrl?.replace('/collections/', '') || 'unknown',
          shopifyId: item.targetId,
          productCount: 0,
        },
        switchTo: null, // Nothing to switch to - collection is gone
      });
    }
  }

  console.log(`[OrphanLink] Found ${conflicts.length} orphan navigation links`);
  return conflicts;
}

/**
 * Calculate summary statistics from health check results
 */
function calculateSummary(
  duplicateGroups: DuplicateGroup[],
  navigationConflicts: NavigationConflict[],
  handleMismatches: HandleMismatch[]
): HealthSummary {
  let criticalCount = 0;
  let highCount = 0;
  let mediumCount = 0;
  let lowCount = 0;

  // Count duplicates by severity
  for (const group of duplicateGroups) {
    const severity = calculateDuplicateSeverity(group);
    switch (severity) {
      case 'critical': criticalCount++; break;
      case 'high': highCount++; break;
      case 'medium': mediumCount++; break;
      case 'low': lowCount++; break;
    }
  }

  // Navigation conflicts are always critical
  criticalCount += navigationConflicts.length;

  // Count handle mismatches by severity
  for (const mismatch of handleMismatches) {
    switch (mismatch.severity) {
      case 'critical': criticalCount++; break;
      case 'high': highCount++; break;
      case 'medium': mediumCount++; break;
      case 'low': lowCount++; break;
    }
  }

  return {
    duplicateCount: duplicateGroups.length,
    conflictCount: navigationConflicts.length,
    mismatchCount: handleMismatches.length,
    orphanCount: 0, // Not implemented yet
    emptyCount: 0,  // Not implemented yet
    criticalCount,
    highCount,
    mediumCount,
    lowCount,
  };
}

/**
 * Store health issues in the database for persistence
 */
async function storeHealthIssues(
  result: HealthCheckResult,
  tenantId: string
): Promise<void> {
  // Clear existing open issues (they will be re-detected if still present)
  // Note: We don't delete resolved/ignored issues
  const existingIssues = await storage.getCollectionHealthIssues(tenantId, { status: 'open' });

  for (const issue of existingIssues) {
    await storage.deleteCollectionHealthIssue(issue.id);
  }

  // Create new issues for duplicates
  for (const group of result.duplicateGroups) {
    const severity = calculateDuplicateSeverity(group);
    const keepCollection = group.collections.find(
      c => c.id === group.recommendation.keepId
    );

    for (const collection of group.collections) {
      // Skip the one we're keeping - it's not an issue
      if (collection.id === group.recommendation.keepId) continue;

      const issueData: HealthIssueCreateData = {
        tenantId,
        issueType: 'duplicate',
        severity,
        collectionId: collection.id,
        relatedCollectionId: keepCollection?.id,
        title: `Duplicate: ${collection.name}`,
        description: `Collection "${collection.name}" (handle: ${collection.shopifyHandle || collection.slug}) has the same name as another collection. ${group.recommendation.reason}`,
        recommendation: 'DELETE',
        recommendedAction: `Delete this collection and keep "${keepCollection?.name}" (${keepCollection?.shopifyHandle || keepCollection?.slug})`,
        metadata: {
          groupId: group.id,
          productCount: collection.productCount,
          inNavigation: collection.inNavigation,
          navigationMenus: collection.navigationMenus,
        },
      };

      await storage.createCollectionHealthIssue(issueData);
    }
  }

  // Create issues for navigation conflicts
  for (const conflict of result.navigationConflicts) {
    // Map conflict type to recommendation
    const recommendation = conflict.conflictType === 'switch_required'
      ? 'SWITCH_NAV'
      : conflict.conflictType === 'remove_link' || conflict.conflictType === 'orphan_link'
        ? 'REMOVE_NAV'
        : 'UPDATE_NAV';

    const issueData: HealthIssueCreateData = {
      tenantId,
      issueType: 'nav_conflict',
      severity: conflict.severity,
      collectionId: conflict.collectionId || undefined, // Empty string becomes undefined for orphan links
      menuId: conflict.menuId ?? undefined, // Convert null to undefined
      title: `Navigation Conflict: ${conflict.collectionName}`,
      description: conflict.message,
      recommendation,
      recommendedAction: conflict.action,
      metadata: {
        menuTitle: conflict.menuTitle,
        itemTitle: conflict.itemTitle,
        conflictType: conflict.conflictType,
        currentInNav: conflict.currentInNav,
        switchTo: conflict.switchTo,
        collectionName: conflict.collectionName, // For orphan links where collection doesn't exist
      },
    };

    await storage.createCollectionHealthIssue(issueData);
  }

  // Create issues for handle mismatches
  for (const mismatch of result.handleMismatches) {
    const issueData: HealthIssueCreateData = {
      tenantId,
      issueType: 'handle_mismatch',
      severity: mismatch.severity,
      collectionId: mismatch.collectionId,
      title: `Handle Mismatch: ${mismatch.collectionName}`,
      description: mismatch.message,
      recommendation: 'FIX_HANDLE',
      recommendedAction: mismatch.recommendation,
      metadata: {
        actualHandle: mismatch.actualHandle,
        expectedHandle: mismatch.expectedHandle,
        productCount: mismatch.productCount,
      },
    };

    await storage.createCollectionHealthIssue(issueData);
  }
}

/**
 * Get the current health status without running a new scan
 */
export async function getHealthStatus(
  tenantId: string
): Promise<{ issues: any[]; summary: HealthSummary }> {
  // MULTI-TENANT: tenantId is now required
  if (!tenantId) {
    throw new Error('tenantId is required for getHealthStatus');
  }
  const issues = await storage.getCollectionHealthIssues(tenantId);

  // Calculate summary from stored issues
  let criticalCount = 0;
  let highCount = 0;
  let mediumCount = 0;
  let lowCount = 0;
  let duplicateCount = 0;
  let conflictCount = 0;
  let mismatchCount = 0;

  for (const issue of issues) {
    if (issue.status !== 'open') continue;

    switch (issue.severity) {
      case 'critical': criticalCount++; break;
      case 'high': highCount++; break;
      case 'medium': mediumCount++; break;
      case 'low': lowCount++; break;
    }

    if (issue.issueType === 'duplicate') duplicateCount++;
    if (issue.issueType === 'nav_conflict') conflictCount++;
    if (issue.issueType === 'handle_mismatch') mismatchCount++;
  }

  return {
    issues,
    summary: {
      duplicateCount,
      conflictCount,
      mismatchCount,
      orphanCount: 0,
      emptyCount: 0,
      criticalCount,
      highCount,
      mediumCount,
      lowCount,
    },
  };
}

/**
 * Mark collections as duplicates in the database
 * MULTI-TENANT: Requires tenantId for collection updates
 */
export async function markDuplicatesInDatabase(
  tenantId: string,
  duplicateGroups: DuplicateGroup[]
): Promise<void> {
  for (const group of duplicateGroups) {
    for (const collection of group.collections) {
      // Mark all collections in the group as duplicates - MULTI-TENANT
      // The duplicate_group_id links them together
      await storage.updateCollection(tenantId, collection.id, {
        isDuplicate: true,
        duplicateGroupId: group.id,
      });
    }
  }
}

// Export types for external use
export * from "./types";
export { detectDuplicates, calculateDuplicateSeverity } from "./duplicate-detector";
export { detectHandleMismatches } from "./handle-mismatch-detector";
