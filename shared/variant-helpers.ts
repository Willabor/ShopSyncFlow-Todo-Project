/**
 * Variant Helper Functions
 *
 * Utilities for accessing SKU, price, and variant data from products.
 * Handles products with 0, 1, or multiple variants gracefully.
 *
 * Usage:
 * - Use these helpers instead of accessing product.sku or product.price directly
 * - All functions handle null/undefined variants safely
 *
 * @module variant-helpers
 */

import type { Product, ProductVariant, ProductWithVariants, VariantDisplayInfo } from "./schema";

/**
 * Get the first variant's SKU (or null if no variants)
 *
 * @param product - Product with optional variants array
 * @returns First variant's SKU or null
 *
 * @example
 * const sku = getFirstVariantSku(product); // "ABC123" or null
 */
export function getFirstVariantSku(
  product: Product & { variants?: ProductVariant[] }
): string | null {
  return product.variants?.[0]?.sku || null;
}

/**
 * Get the first variant's price (or null if no variants)
 *
 * @param product - Product with optional variants array
 * @returns First variant's price or null
 *
 * @example
 * const price = getFirstVariantPrice(product); // "19.99" or null
 */
export function getFirstVariantPrice(
  product: Product & { variants?: ProductVariant[] }
): string | null {
  return product.variants?.[0]?.price || null;
}

/**
 * Get price range for products with multiple variants
 *
 * @param product - Product with optional variants array
 * @returns Object with min and max prices, or null if no variants
 *
 * @example
 * const range = getPriceRange(product);
 * if (range) {
 *   console.log(`$${range.min} - $${range.max}`);
 * }
 */
export function getPriceRange(
  product: Product & { variants?: ProductVariant[] }
): { min: string; max: string } | null {
  const variants = product.variants;

  if (!variants || variants.length === 0) {
    return null;
  }

  // Single variant - return same price for min and max
  if (variants.length === 1) {
    const price = variants[0].price;
    return { min: price, max: price };
  }

  // Multiple variants - find min and max
  const prices = variants
    .map(v => parseFloat(v.price))
    .filter(p => !isNaN(p))
    .sort((a, b) => a - b);

  if (prices.length === 0) {
    return null;
  }

  return {
    min: prices[0].toFixed(2),
    max: prices[prices.length - 1].toFixed(2)
  };
}

/**
 * Get variant count
 *
 * @param product - Product with optional variants array
 * @returns Number of variants (0 if no variants)
 *
 * @example
 * const count = getVariantCount(product); // 3
 */
export function getVariantCount(
  product: Product & { variants?: ProductVariant[] }
): number {
  return product.variants?.length || 0;
}

/**
 * Get display information for a product's variants
 * Consolidates all variant display logic in one function
 *
 * @param product - Product with optional variants array
 * @returns Object with display flags and formatted data
 *
 * @example
 * const info = getVariantDisplayInfo(product);
 * if (info.hasSingleVariant) {
 *   return <span>SKU: {info.firstVariantSku}</span>;
 * } else if (info.hasMultipleVariants && info.priceRange) {
 *   return <span>${info.priceRange.min} - ${info.priceRange.max}</span>;
 * }
 */
export function getVariantDisplayInfo(
  product: Product & { variants?: ProductVariant[] }
): VariantDisplayInfo {
  const variantCount = getVariantCount(product);
  const hasSingleVariant = variantCount === 1;
  const hasMultipleVariants = variantCount > 1;
  const hasNoVariants = variantCount === 0;

  return {
    hasSingleVariant,
    hasMultipleVariants,
    hasNoVariants,
    firstVariantSku: getFirstVariantSku(product),
    firstVariantPrice: getFirstVariantPrice(product),
    priceRange: getPriceRange(product),
    variantCount,
  };
}

/**
 * Format SKU for display in UI
 * Handles single variant, multiple variants, and no variants
 *
 * @param product - Product with optional variants array
 * @returns Formatted SKU string for display
 *
 * @example
 * formatSkuDisplay(product); // "ABC123" or "3 SKUs" or "N/A"
 */
export function formatSkuDisplay(
  product: Product & { variants?: ProductVariant[] }
): string {
  const info = getVariantDisplayInfo(product);

  if (info.hasNoVariants) {
    return "N/A";
  }

  if (info.hasSingleVariant) {
    return info.firstVariantSku || "N/A";
  }

  // Multiple variants
  return `${info.variantCount} SKUs`;
}

/**
 * Format price for display in UI
 * Handles single variant, multiple variants, and no variants
 *
 * @param product - Product with optional variants array
 * @returns Formatted price string for display
 *
 * @example
 * formatPriceDisplay(product); // "$19.99" or "$19.99 - $29.99" or "N/A"
 */
export function formatPriceDisplay(
  product: Product & { variants?: ProductVariant[] }
): string {
  const info = getVariantDisplayInfo(product);

  if (info.hasNoVariants) {
    return "N/A";
  }

  if (info.hasSingleVariant) {
    return info.firstVariantPrice ? `$${info.firstVariantPrice}` : "N/A";
  }

  // Multiple variants - show range
  if (info.priceRange) {
    const { min, max } = info.priceRange;

    // Same price for all variants
    if (min === max) {
      return `$${min}`;
    }

    // Price range
    return `$${min} - $${max}`;
  }

  return "N/A";
}
