/**
 * QuickBooks Import Helper Functions
 *
 * Utilities for parsing and processing QuickBooks POS inventory exports
 * for automated variant creation.
 */

import { sortSizesByOrder } from '../shared/size-utils.js';

/**
 * Extract color from product title
 *
 * Expected pattern: "Product Name - Color"
 * Example: "Premium Disaster Kids Stone Skinny Jeans - Ice Blue" → "Ice Blue"
 *
 * @param title - Product title
 * @returns Extracted color or null if pattern doesn't match
 */
export function extractColorFromTitle(title: string): string | null {
  if (!title) return null;

  // Pattern: " - Color" at end of title
  // Match everything after the last " - "
  const match = title.match(/\s-\s([^-]+)$/);
  return match ? match[1].trim() : null;
}

/**
 * Sum inventory quantities from all store locations
 *
 * QuickBooks POS exports have separate columns for each location:
 * - Qty 2 = GM (Glendale)
 * - Qty 4 = HM (Hollywood)
 * - Qty 6 = NM (Northridge)
 * - Qty 7 = LM (Los Angeles)
 *
 * @param row - QuickBooks export row
 * @returns Total inventory across all locations
 */
export function sumInventoryColumns(row: any): number {
  const qty2 = parseInt(row['Qty 2'] || '0', 10);
  const qty4 = parseInt(row['Qty 4'] || '0', 10);
  const qty6 = parseInt(row['Qty 6'] || '0', 10);
  const qty7 = parseInt(row['Qty 7'] || '0', 10);

  // Handle NaN from invalid inputs
  const safeQty2 = isNaN(qty2) ? 0 : qty2;
  const safeQty4 = isNaN(qty4) ? 0 : qty4;
  const safeQty6 = isNaN(qty6) ? 0 : qty6;
  const safeQty7 = isNaN(qty7) ? 0 : qty7;

  return safeQty2 + safeQty4 + safeQty6 + safeQty7;
}

/**
 * Sort sizes using predefined order (re-exported from shared utils)
 *
 * @param sizes - Array of size strings
 * @returns Sorted array following the predefined order
 */
export function sortSizes(sizes: string[]): string[] {
  return sortSizesByOrder(sizes);
}

/**
 * Validate QuickBooks row data
 *
 * Checks if required fields are present and valid
 *
 * @param row - QuickBooks export row
 * @returns Object with isValid flag and error message if invalid
 */
export function validateQBRow(row: any): { isValid: boolean; error?: string } {
  // Check SKU (Item Number)
  const sku = row['Item Number']?.toString().trim();
  if (!sku || sku.length === 0) {
    return { isValid: false, error: 'Missing Item Number (SKU)' };
  }

  // Check Size
  const size = row['Size']?.toString().trim();
  if (!size || size.length === 0) {
    return { isValid: false, error: 'Missing Size' };
  }

  // Check Price
  const price = parseFloat(row['Regular Price'] || '0');
  if (isNaN(price) || price <= 0) {
    return { isValid: false, error: 'Invalid or missing Regular Price' };
  }

  return { isValid: true };
}

/**
 * Parse QuickBooks row into variant data
 *
 * Extracts relevant fields from QB export and formats them for our system
 *
 * @param row - QuickBooks export row
 * @returns Formatted variant data object
 */
export interface QBVariantData {
  sku: string;
  size: string;
  price: string;
  cost: string;
  inventoryQuantity: number;
  barcode: string;
  styleNumber: string;
  color: string;
  weight: number | null;  // Weight in pounds from QB
}

export function parseQBRow(row: any): QBVariantData {
  const price = parseFloat(row['Regular Price'] || '0');
  const cost = parseFloat(row['Average Unit Cost'] || '0');
  const weight = parseFloat(row['Weight'] || '0');

  return {
    sku: row['Item Number']?.toString().trim() || '',
    size: row['Size']?.toString().trim() || '',
    price: price.toFixed(2),
    cost: cost.toFixed(2),
    inventoryQuantity: sumInventoryColumns(row),
    barcode: row['UPC']?.toString().trim() || '',
    styleNumber: row['Custom Field 1']?.toString().trim() || '',
    color: row['Attribute']?.toString().trim() || '',
    weight: !isNaN(weight) && weight > 0 ? weight : null
  };
}
