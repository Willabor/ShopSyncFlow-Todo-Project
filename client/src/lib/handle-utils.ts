/**
 * Handle Generation Utilities
 *
 * These functions match Shopify's handle generation algorithm.
 * Handles are permanent URL slugs that don't change when names change.
 */

/**
 * Maximum handle length for SEO best practices (matches backend schema)
 * Research shows 50-60 chars is optimal for SEO:
 * - Full display in Google search results (no truncation)
 * - Higher click-through rates
 * - Position #1 URLs average 9.2 chars shorter than position #10
 */
export const MAX_HANDLE_LENGTH = 60;

/**
 * Optimal handle length range for best SEO performance
 */
export const OPTIMAL_HANDLE_LENGTH = { min: 30, max: 60 };

/**
 * Generate a Shopify-compatible handle from a name.
 * This matches Shopify's algorithm for generating collection/product handles.
 *
 * NOTE: This does NOT auto-truncate. If the result exceeds MAX_HANDLE_LENGTH,
 * the user should be warned so they can manually craft a better short handle.
 *
 * @param name - The collection or product name
 * @returns A URL-safe handle (may exceed 60 characters - validate separately)
 */
export function generateHandle(name: string): string {
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
 * Check if a handle appears to be a Shopify-generated duplicate
 * (ends with -1, -2, etc.)
 *
 * @param handle - The handle to check
 * @returns True if the handle ends with a numeric suffix
 */
export function isDuplicateHandle(handle: string): boolean {
  return /-\d+$/.test(handle);
}

/**
 * Get the base handle without the duplicate suffix
 *
 * @param handle - The handle (possibly with suffix)
 * @returns The base handle without -1, -2, etc.
 */
export function getBaseHandle(handle: string): string {
  return handle.replace(/-\d+$/, "");
}

/**
 * Check if two handles are similar enough to cause confusion
 * (same base, different suffixes or small typo differences)
 *
 * @param handle1 - First handle
 * @param handle2 - Second handle
 * @returns True if handles are similar
 */
export function areSimilarHandles(handle1: string, handle2: string): boolean {
  // Same handle
  if (handle1 === handle2) return true;

  // Same base (e.g., "blue-shirts" and "blue-shirts-1")
  const base1 = getBaseHandle(handle1);
  const base2 = getBaseHandle(handle2);
  if (base1 === base2) return true;

  // Very similar (Levenshtein distance <= 2)
  if (levenshteinDistance(handle1, handle2) <= 2) return true;

  return false;
}

/**
 * Calculate Levenshtein distance between two strings
 * Used for detecting similar handles with small typos
 *
 * @param a - First string
 * @param b - Second string
 * @returns The edit distance between the strings
 */
export function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix: number[][] = [];

  // Initialize matrix
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  // Fill matrix
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Validate handle format (simple boolean check)
 *
 * @param handle - The handle to validate
 * @returns Object with isValid and optional error message
 */
export function validateHandle(handle: string): { isValid: boolean; error?: string } {
  if (!handle) {
    return { isValid: false, error: "Handle is required" };
  }

  if (handle.length > MAX_HANDLE_LENGTH) {
    return {
      isValid: false,
      error: `Handle must be ${MAX_HANDLE_LENGTH} characters or less (currently ${handle.length})`
    };
  }

  if (!/^[a-z0-9-]+$/.test(handle)) {
    return {
      isValid: false,
      error: "Handle can only contain lowercase letters, numbers, and hyphens"
    };
  }

  if (handle.startsWith("-") || handle.endsWith("-")) {
    return {
      isValid: false,
      error: "Handle cannot start or end with a hyphen"
    };
  }

  if (/--/.test(handle)) {
    return {
      isValid: false,
      error: "Handle cannot contain consecutive hyphens"
    };
  }

  return { isValid: true };
}

/**
 * Detailed handle validation result with SEO insights
 */
export interface HandleValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  suggestions: string[];
  seoScore: 'excellent' | 'good' | 'fair' | 'poor';
  characterCount: number;
  characterLimit: number;
  charactersOver: number;
}

/**
 * Generate a smart suggestion for shortening a handle
 * Removes less important words while keeping brand and product type
 */
export function suggestShorterHandle(handle: string): string {
  if (handle.length <= MAX_HANDLE_LENGTH) return handle;

  const words = handle.split('-');

  // Common words that can be removed to shorten handles
  const removableWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
    'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
    'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need',
    'mens', 'men', 'womens', 'women', 'unisex', 'adult', 'kids', 'youth',
    'new', 'style', 'design', 'edition', 'version', 'type', 'model',
    'premium', 'classic', 'modern', 'basic', 'standard', 'original'
  ]);

  // First pass: remove removable words from the middle (keep first and last 2 words)
  let shortened = words.filter((word, index) => {
    // Always keep first 2 and last 2 words
    if (index < 2 || index >= words.length - 2) return true;
    // Remove common filler words
    return !removableWords.has(word.toLowerCase());
  });

  let result = shortened.join('-');

  // If still too long, progressively remove more words from the middle
  while (result.length > MAX_HANDLE_LENGTH && shortened.length > 4) {
    // Remove the middle word
    const middleIndex = Math.floor(shortened.length / 2);
    shortened.splice(middleIndex, 1);
    result = shortened.join('-');
  }

  // Final truncation if still too long (at word boundary)
  if (result.length > MAX_HANDLE_LENGTH) {
    const words = result.split('-');
    let truncated = '';
    for (const word of words) {
      const potential = truncated ? `${truncated}-${word}` : word;
      if (potential.length <= MAX_HANDLE_LENGTH) {
        truncated = potential;
      } else {
        break;
      }
    }
    result = truncated || result.substring(0, MAX_HANDLE_LENGTH).replace(/-+$/, '');
  }

  return result;
}

/**
 * Comprehensive handle validation with detailed feedback and SEO insights
 *
 * Use this for real-time form validation to give users clear, actionable feedback
 * about their product URL handle.
 *
 * @param handle - The handle to validate
 * @returns Detailed validation result with errors, warnings, and suggestions
 */
export function validateHandleDetailed(handle: string): HandleValidationResult {
  const result: HandleValidationResult = {
    isValid: true,
    errors: [],
    warnings: [],
    suggestions: [],
    seoScore: 'excellent',
    characterCount: handle?.length || 0,
    characterLimit: MAX_HANDLE_LENGTH,
    charactersOver: Math.max(0, (handle?.length || 0) - MAX_HANDLE_LENGTH)
  };

  // Empty handle check
  if (!handle) {
    result.isValid = false;
    result.errors.push("Handle is required for the product URL");
    result.seoScore = 'poor';
    return result;
  }

  // Length validation - this is the main issue we're solving
  if (handle.length > MAX_HANDLE_LENGTH) {
    result.isValid = false;
    result.seoScore = 'poor';
    result.errors.push(
      `Handle is too long: ${handle.length} characters (maximum: ${MAX_HANDLE_LENGTH})`
    );
    result.errors.push(
      `Your product URL would be: /products/${handle}`
    );
    result.errors.push(
      `This exceeds the ${MAX_HANDLE_LENGTH}-character limit by ${handle.length - MAX_HANDLE_LENGTH} characters`
    );

    // Provide actionable suggestions
    result.suggestions.push(
      "Shorten the product title to generate a shorter handle"
    );
    result.suggestions.push(
      "Or manually edit the handle to keep only the most important keywords"
    );

    // Generate a smart suggestion
    const suggested = suggestShorterHandle(handle);
    if (suggested !== handle && suggested.length <= MAX_HANDLE_LENGTH) {
      result.suggestions.push(
        `Suggested shorter handle: ${suggested} (${suggested.length} chars)`
      );
    }

    result.suggestions.push(
      "SEO tip: Shorter URLs rank better - position #1 results average 9 chars shorter than position #10"
    );
  }

  // Format validation
  if (!/^[a-z0-9-]+$/.test(handle)) {
    result.isValid = false;
    result.errors.push(
      "Handle contains invalid characters. Only lowercase letters (a-z), numbers (0-9), and hyphens (-) are allowed"
    );

    // Find the invalid characters
    const invalidChars = handle.match(/[^a-z0-9-]/g);
    if (invalidChars) {
      const unique = [...new Set(invalidChars)];
      result.errors.push(
        `Invalid characters found: ${unique.map(c => `"${c}"`).join(', ')}`
      );
    }
  }

  // Hyphen position validation
  if (handle.startsWith("-")) {
    result.isValid = false;
    result.errors.push("Handle cannot start with a hyphen");
  }

  if (handle.endsWith("-")) {
    result.isValid = false;
    result.errors.push("Handle cannot end with a hyphen");
  }

  // Consecutive hyphens
  if (/--/.test(handle)) {
    result.isValid = false;
    result.errors.push("Handle cannot contain consecutive hyphens (--)");
  }

  // SEO warnings (not errors, but helpful feedback)
  if (result.isValid) {
    // Very short handles
    if (handle.length < 10) {
      result.warnings.push(
        `Handle is very short (${handle.length} chars). Consider adding descriptive keywords for better SEO`
      );
      result.seoScore = 'fair';
    }
    // Short handles
    else if (handle.length < OPTIMAL_HANDLE_LENGTH.min) {
      result.warnings.push(
        `Handle could be more descriptive (${handle.length} chars). Optimal range: ${OPTIMAL_HANDLE_LENGTH.min}-${OPTIMAL_HANDLE_LENGTH.max} chars`
      );
      result.seoScore = 'good';
    }
    // Optimal range
    else if (handle.length <= OPTIMAL_HANDLE_LENGTH.max) {
      result.seoScore = 'excellent';
    }
    // Near limit
    else if (handle.length > 50 && handle.length <= MAX_HANDLE_LENGTH) {
      result.warnings.push(
        `Handle is near the maximum length (${handle.length}/${MAX_HANDLE_LENGTH})`
      );
      result.seoScore = 'good';
    }

    // Check for numbers-only (poor SEO)
    if (/^[0-9-]+$/.test(handle)) {
      result.warnings.push(
        "Handle contains only numbers. Adding descriptive keywords improves SEO"
      );
      result.seoScore = 'fair';
    }

    // Check for very long words (readability)
    const words = handle.split('-');
    const longWords = words.filter(w => w.length > 15);
    if (longWords.length > 0) {
      result.warnings.push(
        `Handle contains very long words: ${longWords.join(', ')}. Consider abbreviating for readability`
      );
    }
  }

  // Update seoScore if there are errors
  if (!result.isValid) {
    result.seoScore = 'poor';
  }

  return result;
}
