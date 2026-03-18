/**
 * Handle Generator Utility
 *
 * Provides comprehensive utilities for generating, validating, and managing
 * SEO-friendly product URL handles (slugs) following best practices from
 * Google, Shopify, and industry standards.
 *
 * @see /volume1/docker/planning/05-shopsyncflow/URL-Management/RESEARCH.md
 */

import { db } from '../db';
import { products } from '@shared/schema';
import { eq, ne, and } from 'drizzle-orm';

/**
 * SEO scoring weights for handle quality assessment
 */
const SEO_WEIGHTS = {
  LENGTH_OPTIMAL: 30,      // 50-60 chars is optimal
  KEYWORD_RICH: 25,        // Contains meaningful keywords
  READABILITY: 20,         // Easy to read and remember
  NO_STOPWORDS: 15,        // Minimal filler words
  STRUCTURE: 10,           // Proper formatting
} as const;

/**
 * Common English stop words that add little SEO value
 */
const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for',
  'from', 'has', 'he', 'in', 'is', 'it', 'its', 'of', 'on',
  'that', 'the', 'to', 'was', 'will', 'with'
]);

/**
 * Characters that should be removed from handles
 */
const INVALID_CHARS_REGEX = /[^a-z0-9-]/g;

/**
 * Pattern for validating complete handles
 */
const VALID_HANDLE_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * Maximum recommended handle length for optimal SEO
 */
export const MAX_HANDLE_LENGTH = 60;

/**
 * Minimum handle length
 */
export const MIN_HANDLE_LENGTH = 1;

/**
 * Optimal handle length range for SEO
 */
export const OPTIMAL_HANDLE_LENGTH = { min: 40, max: 60 };

/**
 * Generates a SEO-friendly handle from a product title
 *
 * Transformation process:
 * 1. Convert to lowercase
 * 2. Replace spaces and underscores with hyphens
 * 3. Remove special characters
 * 4. Remove consecutive hyphens
 * 5. Trim leading/trailing hyphens
 * 6. Truncate to max length
 * 7. Ensure no trailing hyphen after truncation
 *
 * @param title - Product title to convert
 * @returns SEO-friendly handle
 *
 * @example
 * generateHandleFromTitle("Men's Leather Wallet (Black)")
 * // Returns: "mens-leather-wallet-black"
 *
 * @example
 * generateHandleFromTitle("Nike Air Jordan 1 - Retro High OG")
 * // Returns: "nike-air-jordan-1-retro-high-og"
 */
export function generateHandleFromTitle(title: string): string {
  if (!title || typeof title !== 'string') {
    throw new Error('Title must be a non-empty string');
  }

  let handle = title.toLowerCase();

  // Replace spaces, underscores, and other whitespace with hyphens
  handle = handle.replace(/[\s_]+/g, '-');

  // Remove special characters (keep only a-z, 0-9, hyphens)
  handle = handle.replace(INVALID_CHARS_REGEX, '');

  // Remove consecutive hyphens
  handle = handle.replace(/-+/g, '-');

  // Trim leading and trailing hyphens
  handle = handle.replace(/^-+|-+$/g, '');

  // Truncate to max length
  if (handle.length > MAX_HANDLE_LENGTH) {
    handle = handle.substring(0, MAX_HANDLE_LENGTH);
    // Remove trailing hyphen if truncation created one
    handle = handle.replace(/-+$/, '');
  }

  // Final validation - ensure we didn't create an empty handle
  if (!handle) {
    throw new Error('Generated handle is empty - title contains no valid characters');
  }

  return handle;
}

/**
 * Sanitizes a user-provided handle to ensure it meets format requirements
 * Similar to generateHandleFromTitle but preserves existing structure more
 *
 * @param handle - Handle to sanitize
 * @returns Sanitized handle
 *
 * @example
 * sanitizeHandle("My-Product--HANDLE!!")
 * // Returns: "my-product-handle"
 */
export function sanitizeHandle(handle: string): string {
  if (!handle || typeof handle !== 'string') {
    throw new Error('Handle must be a non-empty string');
  }

  let sanitized = handle.toLowerCase();
  sanitized = sanitized.replace(/[\s_]+/g, '-');
  sanitized = sanitized.replace(INVALID_CHARS_REGEX, '');
  sanitized = sanitized.replace(/-+/g, '-');
  sanitized = sanitized.replace(/^-+|-+$/g, '');

  if (sanitized.length > MAX_HANDLE_LENGTH) {
    sanitized = sanitized.substring(0, MAX_HANDLE_LENGTH);
    sanitized = sanitized.replace(/-+$/, '');
  }

  if (!sanitized) {
    throw new Error('Sanitized handle is empty - input contains no valid characters');
  }

  return sanitized;
}

/**
 * Validation result with detailed feedback
 */
export interface HandleValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validates a handle against all SEO and format requirements
 *
 * Checks:
 * - Length (1-60 characters)
 * - Format (lowercase, alphanumeric, hyphens only)
 * - No leading/trailing hyphens
 * - No consecutive hyphens
 * - Optimal length range
 *
 * @param handle - Handle to validate
 * @returns Validation result with errors and warnings
 *
 * @example
 * validateHandleDetailed("mens-leather-wallet")
 * // Returns: { valid: true, errors: [], warnings: [] }
 *
 * @example
 * validateHandleDetailed("product--123")
 * // Returns: { valid: false, errors: ["Contains consecutive hyphens"], warnings: [] }
 */
export function validateHandleDetailed(handle: string): HandleValidationResult {
  const result: HandleValidationResult = {
    valid: true,
    errors: [],
    warnings: []
  };

  if (!handle || typeof handle !== 'string') {
    result.valid = false;
    result.errors.push('Handle must be a non-empty string');
    return result;
  }

  // Check length
  if (handle.length < MIN_HANDLE_LENGTH) {
    result.valid = false;
    result.errors.push(`Handle must be at least ${MIN_HANDLE_LENGTH} character(s)`);
  }

  if (handle.length > MAX_HANDLE_LENGTH) {
    result.valid = false;
    result.errors.push(`Handle must be ${MAX_HANDLE_LENGTH} characters or less (current: ${handle.length})`);
  }

  // Check format
  if (!VALID_HANDLE_REGEX.test(handle)) {
    result.valid = false;

    if (/[A-Z]/.test(handle)) {
      result.errors.push('Handle must be lowercase');
    }

    if (/^-/.test(handle)) {
      result.errors.push('Handle cannot start with a hyphen');
    }

    if (/-$/.test(handle)) {
      result.errors.push('Handle cannot end with a hyphen');
    }

    if (/-{2,}/.test(handle)) {
      result.errors.push('Handle cannot contain consecutive hyphens');
    }

    if (INVALID_CHARS_REGEX.test(handle)) {
      const invalidChars = handle.match(/[^a-z0-9-]/g);
      result.errors.push(`Handle contains invalid characters: ${Array.from(new Set(invalidChars)).join(', ')}`);
    }
  }

  // Warnings for sub-optimal handles
  if (handle.length < OPTIMAL_HANDLE_LENGTH.min) {
    result.warnings.push(`Handle is shorter than optimal (${OPTIMAL_HANDLE_LENGTH.min}-${OPTIMAL_HANDLE_LENGTH.max} chars recommended)`);
  }

  // Check for numbers-only handle (poor SEO)
  if (/^[0-9-]+$/.test(handle)) {
    result.warnings.push('Handle contains only numbers - consider adding descriptive keywords');
  }

  // Check for very short segments
  const segments = handle.split('-');
  if (segments.some(seg => seg.length === 1 && /[a-z]/.test(seg))) {
    result.warnings.push('Handle contains single-letter words - may reduce readability');
  }

  return result;
}

/**
 * Simple boolean validation (backward compatible)
 *
 * @param handle - Handle to validate
 * @returns true if valid, false otherwise
 */
export function validateHandle(handle: string): boolean {
  const result = validateHandleDetailed(handle);
  return result.valid;
}

/**
 * Checks if a handle is unique in the database
 *
 * @param handle - Handle to check
 * @param excludeProductId - Product ID to exclude from uniqueness check (for updates)
 * @returns Promise resolving to true if unique, false if already exists
 *
 * @example
 * await isHandleUnique("mens-wallet")
 * // Returns: false (if already exists)
 *
 * @example
 * await isHandleUnique("mens-wallet", "product-123")
 * // Returns: true (if only "product-123" has this handle)
 */
export async function isHandleUnique(
  handle: string,
  excludeProductId?: string
): Promise<boolean> {
  if (!handle) {
    return false;
  }

  try {
    const conditions = excludeProductId
      ? and(eq(products.handle, handle), ne(products.id, excludeProductId))
      : eq(products.handle, handle);

    const existing = await db
      .select({ id: products.id })
      .from(products)
      .where(conditions)
      .limit(1);

    return existing.length === 0;
  } catch (error) {
    console.error('Error checking handle uniqueness:', error);
    throw new Error('Failed to check handle uniqueness');
  }
}

/**
 * Generates a unique handle by appending a numeric suffix if needed
 *
 * @param baseHandle - Base handle to make unique
 * @param existingHandles - Array of existing handles to check against
 * @returns Unique handle (may have numeric suffix like -2, -3)
 *
 * @example
 * generateUniqueHandle("mens-wallet", ["mens-wallet", "mens-wallet-2"])
 * // Returns: "mens-wallet-3"
 *
 * @example
 * generateUniqueHandle("unique-product", [])
 * // Returns: "unique-product"
 */
export function generateUniqueHandle(
  baseHandle: string,
  existingHandles: string[]
): string {
  if (!baseHandle) {
    throw new Error('Base handle cannot be empty');
  }

  // Create a Set for O(1) lookup performance
  const handleSet = new Set(existingHandles.map(h => h.toLowerCase()));

  // If base handle is unique, return it
  if (!handleSet.has(baseHandle.toLowerCase())) {
    return baseHandle;
  }

  // Try appending numbers until we find a unique one
  let counter = 2;
  const maxAttempts = 10000;

  while (counter < maxAttempts) {
    // Calculate how many digits the counter will add (e.g., "-2" = 2 chars)
    const suffix = `-${counter}`;
    const suffixLength = suffix.length;

    // Ensure total length doesn't exceed max
    let truncatedBase = baseHandle;
    if (baseHandle.length + suffixLength > MAX_HANDLE_LENGTH) {
      truncatedBase = baseHandle.substring(0, MAX_HANDLE_LENGTH - suffixLength);
      // Remove trailing hyphen if truncation created one
      truncatedBase = truncatedBase.replace(/-+$/, '');
    }

    const candidate = `${truncatedBase}${suffix}`;

    if (!handleSet.has(candidate.toLowerCase())) {
      return candidate;
    }

    counter++;
  }

  // Fallback: use timestamp-based suffix (very unlikely to reach here)
  const timestamp = Date.now().toString().slice(-6);
  const timestampSuffix = `-${timestamp}`;
  let truncatedBase = baseHandle;

  if (baseHandle.length + timestampSuffix.length > MAX_HANDLE_LENGTH) {
    truncatedBase = baseHandle.substring(0, MAX_HANDLE_LENGTH - timestampSuffix.length);
    truncatedBase = truncatedBase.replace(/-+$/, '');
  }

  return `${truncatedBase}${timestampSuffix}`;
}

/**
 * Async version that checks database for uniqueness
 *
 * @param baseHandle - Base handle to make unique
 * @param excludeProductId - Product ID to exclude from check (for updates)
 * @returns Promise resolving to unique handle
 */
export async function generateUniqueHandleFromDb(
  baseHandle: string,
  excludeProductId?: string
): Promise<string> {
  if (!baseHandle) {
    throw new Error('Base handle cannot be empty');
  }

  // Check if base handle is already unique
  if (await isHandleUnique(baseHandle, excludeProductId)) {
    return baseHandle;
  }

  // Try appending numbers
  let counter = 2;
  const maxAttempts = 10000;

  while (counter < maxAttempts) {
    const suffix = `-${counter}`;
    const suffixLength = suffix.length;

    let truncatedBase = baseHandle;
    if (baseHandle.length + suffixLength > MAX_HANDLE_LENGTH) {
      truncatedBase = baseHandle.substring(0, MAX_HANDLE_LENGTH - suffixLength);
      truncatedBase = truncatedBase.replace(/-+$/, '');
    }

    const candidate = `${truncatedBase}${suffix}`;

    if (await isHandleUnique(candidate, excludeProductId)) {
      return candidate;
    }

    counter++;
  }

  // Fallback
  const timestamp = Date.now().toString().slice(-6);
  const timestampSuffix = `-${timestamp}`;
  let truncatedBase = baseHandle;

  if (baseHandle.length + timestampSuffix.length > MAX_HANDLE_LENGTH) {
    truncatedBase = baseHandle.substring(0, MAX_HANDLE_LENGTH - timestampSuffix.length);
    truncatedBase = truncatedBase.replace(/-+$/, '');
  }

  return `${truncatedBase}${timestampSuffix}`;
}

/**
 * SEO score result with detailed breakdown
 */
export interface SEOScoreResult {
  score: number;          // 0-100
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  breakdown: {
    length: number;
    keywords: number;
    readability: number;
    stopwords: number;
    structure: number;
  };
  suggestions: string[];
}

/**
 * Calculates an SEO quality score for a handle (0-100)
 *
 * Scoring criteria:
 * - Length (30 pts): Optimal is 40-60 chars
 * - Keywords (25 pts): Contains meaningful, non-stop words
 * - Readability (20 pts): Easy to read segments
 * - Stop words (15 pts): Minimal filler words
 * - Structure (10 pts): Proper formatting
 *
 * @param handle - Handle to score
 * @returns SEO score result with grade and suggestions
 *
 * @example
 * scoreHandleSEO("mens-leather-wallet-black")
 * // Returns: { score: 85, grade: 'B', ... }
 */
export function scoreHandleSEO(handle: string): SEOScoreResult {
  const result: SEOScoreResult = {
    score: 0,
    grade: 'F',
    breakdown: {
      length: 0,
      keywords: 0,
      readability: 0,
      stopwords: 0,
      structure: 0
    },
    suggestions: []
  };

  if (!handle || !validateHandle(handle)) {
    result.suggestions.push('Handle has validation errors - fix format first');
    return result;
  }

  // 1. Length score (30 points)
  const length = handle.length;
  if (length >= OPTIMAL_HANDLE_LENGTH.min && length <= OPTIMAL_HANDLE_LENGTH.max) {
    result.breakdown.length = SEO_WEIGHTS.LENGTH_OPTIMAL;
  } else if (length >= 30 && length < OPTIMAL_HANDLE_LENGTH.min) {
    result.breakdown.length = Math.round(SEO_WEIGHTS.LENGTH_OPTIMAL * 0.8);
  } else if (length > OPTIMAL_HANDLE_LENGTH.max) {
    result.breakdown.length = Math.round(SEO_WEIGHTS.LENGTH_OPTIMAL * 0.6);
    result.suggestions.push(`Handle is at max length (${MAX_HANDLE_LENGTH} chars) - consider shortening`);
  } else if (length >= 20 && length < 30) {
    // Handles 20-29 chars get moderate penalty
    result.breakdown.length = Math.round(SEO_WEIGHTS.LENGTH_OPTIMAL * 0.5);
    result.suggestions.push(`Handle is short (${length} chars) - consider adding descriptive keywords`);
  } else if (length >= 10 && length < 20) {
    // Handles 10-19 chars get larger penalty
    result.breakdown.length = Math.round(SEO_WEIGHTS.LENGTH_OPTIMAL * 0.3);
    result.suggestions.push(`Handle is very short (${length} chars) - add more descriptive keywords`);
  } else {
    // Handles under 10 chars get heavy penalty
    result.breakdown.length = Math.round(SEO_WEIGHTS.LENGTH_OPTIMAL * 0.1);
    result.suggestions.push(`Handle is extremely short (${length} chars) - must add descriptive keywords`);
  }

  // 2. Keywords score (25 points)
  const words = handle.split('-');
  const meaningfulWords = words.filter(w => !STOP_WORDS.has(w) && w.length > 1);
  const keywordRatio = meaningfulWords.length / Math.max(words.length, 1);

  if (keywordRatio >= 0.8) {
    result.breakdown.keywords = SEO_WEIGHTS.KEYWORD_RICH;
  } else if (keywordRatio >= 0.6) {
    result.breakdown.keywords = Math.round(SEO_WEIGHTS.KEYWORD_RICH * 0.8);
  } else {
    result.breakdown.keywords = Math.round(SEO_WEIGHTS.KEYWORD_RICH * 0.5);
    result.suggestions.push('Consider using more descriptive keywords');
  }

  // 3. Readability score (20 points)
  const avgWordLength = words.reduce((sum, w) => sum + w.length, 0) / words.length;
  const hasVeryLongWords = words.some(w => w.length > 15);
  const hasVeryShortWords = words.filter(w => w.length === 1).length > 1;

  if (avgWordLength >= 4 && avgWordLength <= 8 && !hasVeryLongWords && !hasVeryShortWords) {
    result.breakdown.readability = SEO_WEIGHTS.READABILITY;
  } else {
    result.breakdown.readability = Math.round(SEO_WEIGHTS.READABILITY * 0.7);
    if (hasVeryLongWords) {
      result.suggestions.push('Contains very long words - consider abbreviating');
    }
    if (hasVeryShortWords) {
      result.suggestions.push('Contains single-letter words - reduce for clarity');
    }
  }

  // 4. Stop words score (15 points)
  const stopWordCount = words.filter(w => STOP_WORDS.has(w)).length;
  const stopWordRatio = stopWordCount / Math.max(words.length, 1);

  if (stopWordRatio === 0) {
    result.breakdown.stopwords = SEO_WEIGHTS.NO_STOPWORDS;
  } else if (stopWordRatio <= 0.2) {
    result.breakdown.stopwords = Math.round(SEO_WEIGHTS.NO_STOPWORDS * 0.8);
  } else {
    result.breakdown.stopwords = Math.round(SEO_WEIGHTS.NO_STOPWORDS * 0.5);
    result.suggestions.push(`Remove stop words: ${words.filter(w => STOP_WORDS.has(w)).join(', ')}`);
  }

  // 5. Structure score (10 points)
  const hasNumbers = /\d/.test(handle);
  const numberOnlySegments = words.filter(w => /^\d+$/.test(w)).length;
  const properStructure = words.length >= 2 && words.length <= 8;

  if (properStructure && numberOnlySegments === 0) {
    result.breakdown.structure = SEO_WEIGHTS.STRUCTURE;
  } else if (properStructure) {
    result.breakdown.structure = Math.round(SEO_WEIGHTS.STRUCTURE * 0.8);
  } else {
    result.breakdown.structure = Math.round(SEO_WEIGHTS.STRUCTURE * 0.6);
    if (words.length === 1) {
      result.suggestions.push('Handle is a single word - add more descriptive keywords');
    } else if (words.length > 8) {
      result.suggestions.push('Handle has many segments - consider simplifying');
    }
  }

  // Calculate total score
  result.score = Object.values(result.breakdown).reduce((sum, val) => sum + val, 0);

  // Assign grade
  if (result.score >= 90) result.grade = 'A';
  else if (result.score >= 80) result.grade = 'B';
  else if (result.score >= 70) result.grade = 'C';
  else if (result.score >= 60) result.grade = 'D';
  else result.grade = 'F';

  return result;
}

/**
 * Suggests improvements for a handle based on SEO analysis
 *
 * @param handle - Handle to analyze
 * @returns Array of improvement suggestions
 *
 * @example
 * suggestHandleImprovements("prod-123")
 * // Returns: ["Add descriptive keywords", "Handle is very short", ...]
 */
export function suggestHandleImprovements(handle: string): string[] {
  const validation = validateHandleDetailed(handle);
  const seoScore = scoreHandleSEO(handle);

  const suggestions: string[] = [];

  // Add validation errors first
  suggestions.push(...validation.errors);

  // Add validation warnings
  suggestions.push(...validation.warnings);

  // Add SEO suggestions
  suggestions.push(...seoScore.suggestions);

  // Remove duplicates
  return Array.from(new Set(suggestions));
}

/**
 * Extracts handle from a full URL
 *
 * @param url - Full URL or path
 * @returns Handle extracted from URL
 *
 * @example
 * parseHandleFromUrl("https://shop.com/products/mens-wallet")
 * // Returns: "mens-wallet"
 *
 * @example
 * parseHandleFromUrl("/products/mens-wallet?ref=abc")
 * // Returns: "mens-wallet"
 */
export function parseHandleFromUrl(url: string): string {
  if (!url || typeof url !== 'string') {
    throw new Error('URL must be a non-empty string');
  }

  try {
    // Remove query parameters and hash
    const cleanUrl = url.split('?')[0].split('#')[0];

    // Extract path segments
    const segments = cleanUrl.split('/').filter(s => s.length > 0);

    // Get the last segment (assumes it's the handle)
    const lastSegment = segments[segments.length - 1] || '';

    // Decode URL encoding
    const decoded = decodeURIComponent(lastSegment);

    // Sanitize to ensure it's a valid handle
    return sanitizeHandle(decoded);
  } catch (error) {
    throw new Error(`Failed to parse handle from URL: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Generates a preview URL for a handle
 *
 * @param handle - Handle to preview
 * @param shopifyDomain - Optional Shopify domain (defaults to placeholder)
 * @returns Full preview URL
 *
 * @example
 * previewUrl("mens-wallet", "mystore.myshopify.com")
 * // Returns: "https://mystore.myshopify.com/products/mens-wallet"
 *
 * @example
 * previewUrl("mens-wallet")
 * // Returns: "https://your-store.myshopify.com/products/mens-wallet"
 */
export function previewUrl(handle: string, shopifyDomain?: string): string {
  if (!handle) {
    throw new Error('Handle is required for preview URL');
  }

  const domain = shopifyDomain || 'your-store.myshopify.com';
  const baseUrl = domain.startsWith('http') ? domain : `https://${domain}`;

  return `${baseUrl}/products/${handle}`;
}

/**
 * Batch generates unique handles from an array of titles
 *
 * @param titles - Array of product titles
 * @returns Array of unique handles
 *
 * @example
 * batchGenerateHandles(["Product A", "Product B", "Product A"])
 * // Returns: ["product-a", "product-b", "product-a-2"]
 */
export function batchGenerateHandles(titles: string[]): string[] {
  if (!Array.isArray(titles)) {
    throw new Error('Titles must be an array');
  }

  const handles: string[] = [];
  const usedHandles = new Set<string>();

  for (const title of titles) {
    try {
      const baseHandle = generateHandleFromTitle(title);
      const uniqueHandle = generateUniqueHandle(baseHandle, Array.from(usedHandles));
      handles.push(uniqueHandle);
      usedHandles.add(uniqueHandle);
    } catch (error) {
      // If handle generation fails, use a fallback
      console.error(`Failed to generate handle for "${title}":`, error);
      handles.push('product-' + handles.length);
    }
  }

  return handles;
}
