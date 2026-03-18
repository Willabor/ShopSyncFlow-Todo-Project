/**
 * Handle Mismatch Detector
 *
 * Detects collections where the name suggests a different handle than what's actually stored.
 * This is a preventative measure to catch renamed collections that may cause duplicate issues.
 */

import type { Collection } from "@shared/schema";
import type { HandleMismatch, IssueSeverity } from "./types";

/**
 * Generate a Shopify-compatible handle from a name.
 * This matches Shopify's algorithm for generating collection/product handles.
 */
function generateHandle(name: string): string {
  if (!name) return "";

  return name
    .toLowerCase()
    // Normalize unicode (e.g., é → e)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    // Replace non-alphanumeric with dashes
    .replace(/[^a-z0-9]+/g, "-")
    // Remove leading/trailing dashes
    .replace(/^-+|-+$/g, "")
    // Collapse multiple dashes
    .replace(/-+/g, "-");
}

/**
 * Check if a handle is a Shopify-generated duplicate suffix (ends with -1, -2, etc.)
 */
function hasDuplicateSuffix(handle: string): boolean {
  return /-\d+$/.test(handle);
}

/**
 * Get the base handle without the numeric suffix
 */
function getBaseHandle(handle: string): string {
  return handle.replace(/-\d+$/, "");
}

/**
 * Detect handle mismatches in collections.
 *
 * A mismatch occurs when:
 * 1. The collection name, when converted to a handle, differs from the actual handle
 * 2. The actual handle has a duplicate suffix (-1, -2) but the name doesn't suggest it
 *
 * @param collections - Array of collections to check
 * @returns Array of handle mismatch issues
 */
export function detectHandleMismatches(collections: Collection[]): HandleMismatch[] {
  const mismatches: HandleMismatch[] = [];

  for (const collection of collections) {
    const actualHandle = collection.shopifyHandle || collection.slug;
    if (!actualHandle) continue;

    const expectedHandle = generateHandle(collection.name);
    if (!expectedHandle) continue;

    // Skip if handles match
    if (actualHandle === expectedHandle) continue;

    // Check for duplicate suffix scenario
    const hasNumericSuffix = hasDuplicateSuffix(actualHandle);
    const baseActualHandle = getBaseHandle(actualHandle);

    // If base matches expected, it might just be a Shopify-generated suffix
    // This is still worth noting but lower severity
    const isBaseMatch = baseActualHandle === expectedHandle;

    // Determine severity based on conditions
    let severity: IssueSeverity;
    let message: string;
    let recommendation: string;

    if (isBaseMatch && hasNumericSuffix) {
      // Handle was auto-suffixed by Shopify (e.g., "blue-shirts-1")
      severity = "medium";
      message = `Collection "${collection.name}" has handle "${actualHandle}" with a numeric suffix. ` +
        `This suggests a duplicate was detected when the collection was created in Shopify.`;
      recommendation = `Check if there's another collection with handle "${expectedHandle}". ` +
        `Consider merging these collections or making the names more distinct.`;
    } else if (collection.productCount > 0) {
      // Active collection with mismatched handle - high priority
      severity = "high";
      message = `Collection "${collection.name}" has handle "${actualHandle}" but the name suggests it should be "${expectedHandle}". ` +
        `Apps looking for "/${expectedHandle}" will not find this collection.`;
      recommendation = `Either rename the collection to match its handle ("${handleToName(actualHandle)}") ` +
        `or update the handle in Shopify to match the expected format.`;
    } else {
      // Empty collection with mismatch - lower priority
      severity = "low";
      message = `Collection "${collection.name}" has handle "${actualHandle}" but expected "${expectedHandle}". ` +
        `Since this collection has no products, the impact is minimal.`;
      recommendation = `Consider fixing the handle or deleting this empty collection.`;
    }

    mismatches.push({
      collectionId: collection.id,
      collectionName: collection.name,
      actualHandle,
      expectedHandle,
      productCount: collection.productCount,
      severity,
      message,
      recommendation,
    });
  }

  // Sort by severity (high first) then by product count (more products first)
  return mismatches.sort((a, b) => {
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
    if (severityDiff !== 0) return severityDiff;
    return b.productCount - a.productCount;
  });
}

/**
 * Convert a handle back to a readable name (for suggestions)
 * Capitalizes first letter of each word
 */
function handleToName(handle: string): string {
  return handle
    .split("-")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Calculate summary statistics for handle mismatches
 */
export function calculateMismatchSummary(mismatches: HandleMismatch[]): {
  total: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  affectedProducts: number;
} {
  const summary = {
    total: mismatches.length,
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    affectedProducts: 0,
  };

  for (const mismatch of mismatches) {
    summary[mismatch.severity]++;
    summary.affectedProducts += mismatch.productCount;
  }

  return summary;
}
