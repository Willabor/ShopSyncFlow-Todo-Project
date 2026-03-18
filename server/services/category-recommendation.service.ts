/**
 * Intelligent Category Recommendation Service
 *
 * Two-tier system for recommending Google Product Categories:
 * - Tier 1: Database full-text search (fast, free)
 * - Tier 2: Gemini AI analysis (smart, context-aware)
 */

import { db } from "../db";
import { productCategories } from "../../shared/schema";
import { sql } from "drizzle-orm";
import { GoogleGenerativeAI } from '@google/generative-ai';

// Initialize Gemini AI
const apiKey = process.env.GEMINI_API_KEY;
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

// ============================================================================
// TYPES
// ============================================================================

export interface CategoryMatch {
  id: string;                    // e.g., "aa-2-17-5"
  gid: string;                   // Shopify GID
  path: string;                  // "Apparel & Accessories > Clothing Accessories > Hats > Bucket Hats"
  name: string;                  // "Bucket Hats"
  level: number;                 // Category depth (1-6)
  confidence: 'high' | 'medium' | 'low';
}

export interface CategoryRecommendation {
  // Recommended category
  categoryId: string | null;     // Google category ID
  categoryGid: string | null;    // Shopify GID
  categoryPath: string | null;   // Full path
  categoryName: string | null;   // Category name

  // For collection rules
  productType: string;           // Clean product type (e.g., "Bucket Hats")
  suggestedTags: string[];       // Tags from hierarchy (e.g., ["Headwear"])

  // Metadata
  confidence: 'high' | 'medium' | 'low' | 'none';
  source: 'database' | 'ai' | 'fallback';
  reasoning?: string;            // Explanation from AI
  alternativeMatches?: CategoryMatch[]; // Other possible matches
}

// ============================================================================
// TIER 1: DATABASE SEARCH
// ============================================================================

/**
 * Search Google Product Categories using database full-text search
 * Fast and free - handles most common cases
 */
async function searchCategoriesInDatabase(
  hierarchicalType: string
): Promise<CategoryMatch[]> {
  try {
    // Split hierarchical type into parts
    const parts = hierarchicalType.split('-').map(p => p.trim()).filter(p => p.length > 0);

    if (parts.length === 0) {
      return [];
    }

    // Get the most specific part (last one) as primary search term
    const primaryTerm = parts[parts.length - 1];

    // Use full-text search on category paths
    // Search for exact match on category name first
    const exactMatches = await db
      .select({
        id: productCategories.id,
        gid: productCategories.gid,
        path: productCategories.path,
        name: productCategories.name,
        level: productCategories.level,
      })
      .from(productCategories)
      .where(sql`LOWER(${productCategories.name}) = LOWER(${primaryTerm})`)
      .orderBy(sql`${productCategories.level} DESC`) // Prefer more specific categories
      .limit(5);

    if (exactMatches.length > 0) {
      console.log(`✓ Found ${exactMatches.length} exact matches for "${primaryTerm}"`);
      return exactMatches.map(m => ({
        ...m,
        confidence: 'high' as const
      }));
    }

    // If no exact match, try partial match with full-text search
    // Use | (OR) instead of & (AND) to be more flexible
    const searchQuery = parts.join(' | '); // "Bucket | Hat" for full-text search

    const partialMatches = await db
      .select({
        id: productCategories.id,
        gid: productCategories.gid,
        path: productCategories.path,
        name: productCategories.name,
        level: productCategories.level,
      })
      .from(productCategories)
      .where(sql`to_tsvector('english', ${productCategories.path}) @@ to_tsquery('english', ${searchQuery})`)
      .orderBy(sql`${productCategories.level} DESC`)
      .limit(5);

    if (partialMatches.length > 0) {
      console.log(`✓ Found ${partialMatches.length} partial matches for "${searchQuery}"`);
      return partialMatches.map(m => ({
        ...m,
        confidence: 'medium' as const
      }));
    }

    console.log(`ℹ️  No database matches found for "${hierarchicalType}"`);
    return [];

  } catch (error) {
    console.error('Error searching categories in database:', error);
    return [];
  }
}

// ============================================================================
// TIER 2: GEMINI AI FALLBACK
// ============================================================================

/**
 * Use Gemini AI to intelligently select the best category
 * Used when database search is ambiguous or returns no results
 */
async function recommendCategoryWithAI(
  hierarchicalType: string,
  databaseMatches: CategoryMatch[]
): Promise<CategoryRecommendation> {

  if (!genAI) {
    console.warn('⚠️  Gemini AI not available, using fallback');
    return createFallbackRecommendation(hierarchicalType, databaseMatches);
  }

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });

    // Build context for AI
    const matchesContext = databaseMatches.length > 0
      ? `\n\nPossible matches from Google Product Taxonomy:\n${databaseMatches.map((m, i) =>
          `${i + 1}. ${m.id}: ${m.path} (Level ${m.level})`
        ).join('\n')}`
      : '\n\nNo database matches found. Suggest the best general category.';

    const prompt = `You are a product categorization expert. Given a hierarchical product type, recommend the BEST Google Product Category.

Hierarchical Product Type: "${hierarchicalType}"
${matchesContext}

Task:
1. Analyze the input specificity: count the levels (e.g., "Accessories-Bags" = 2 levels, "Accessories-Bags-Crossbody bags" = 3 levels)
2. MATCH THE SPECIFICITY: If input is general (1-2 levels), choose a GENERAL category. If input is specific (3+ levels), choose a SPECIFIC category.
3. If matches are provided, select the one that BEST MATCHES the input's specificity level
4. Determine which parts should be tags vs product type

Example:
- "Accessories-Bags" (general, 2 levels) → Choose "Bags" or "Fashion Accessories", NOT "Musical Keyboard Soft Cases"
- "Accessories-Bags-Crossbody bags" (specific, 3 levels) → Choose "Crossbody Bags" (specific)

Respond in JSON format:
{
  "categoryId": "aa-2-17-5" (or null if no match),
  "categoryPath": "Full > Path > To > Category" (or null),
  "categoryName": "Category Name" (or clean product type),
  "productType": "The clean product type to use",
  "suggestedTags": ["tag1", "tag2"],
  "confidence": "high|medium|low",
  "reasoning": "Brief explanation of your choice"
}

Remember:
- MATCH INPUT SPECIFICITY: General input = General category, Specific input = Specific category
- Demographic/gender terms (Men, Women, Kids) are usually TAGS, not categories
- Style descriptors (Casual, Formal) are usually TAGS, not categories
- Avoid overly niche categories unless the input is equally niche`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/) ||
                      responseText.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      throw new Error('AI response did not contain valid JSON');
    }

    const aiResponse = JSON.parse(jsonMatch[1] || jsonMatch[0]);

    console.log(`✓ Gemini AI recommendation:`, {
      categoryId: aiResponse.categoryId,
      productType: aiResponse.productType,
      confidence: aiResponse.confidence
    });

    return {
      categoryId: aiResponse.categoryId || null,
      categoryGid: databaseMatches.find(m => m.id === aiResponse.categoryId)?.gid || null,
      categoryPath: aiResponse.categoryPath || null,
      categoryName: aiResponse.categoryName || null,
      productType: aiResponse.productType,
      suggestedTags: aiResponse.suggestedTags || [],
      confidence: aiResponse.confidence || 'medium',
      source: 'ai',
      reasoning: aiResponse.reasoning,
      alternativeMatches: databaseMatches.filter(m => m.id !== aiResponse.categoryId)
    };

  } catch (error: any) {
    console.error('Error getting AI recommendation:', error.message);

    // Try OpenRouter fallback before falling back to pattern-based
    try {
      const { isGeminiQuotaError, callOpenRouterText } = await import('../utils/openrouter-fallback');
      if (isGeminiQuotaError(error) && process.env.OPENROUTER_API_KEY) {
        console.log('🔄 Trying OpenRouter for category recommendation...');
        const text = await callOpenRouterText(prompt, 1000);
        const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const aiResponse = JSON.parse(jsonMatch[1] || jsonMatch[0]);
          console.log('✓ OpenRouter category recommendation:', aiResponse.productType);
          return {
            categoryId: aiResponse.categoryId || null,
            categoryGid: databaseMatches.find(m => m.id === aiResponse.categoryId)?.gid || null,
            categoryPath: aiResponse.categoryPath || null,
            categoryName: aiResponse.categoryName || null,
            productType: aiResponse.productType,
            suggestedTags: aiResponse.suggestedTags || [],
            confidence: aiResponse.confidence || 'medium',
            source: 'ai' as const,
            reasoning: aiResponse.reasoning,
            alternativeMatches: databaseMatches.filter(m => m.id !== aiResponse.categoryId)
          };
        }
      }
    } catch (orErr) {
      console.error('OpenRouter category fallback also failed:', orErr);
    }

    return createFallbackRecommendation(hierarchicalType, databaseMatches);
  }
}

// ============================================================================
// FALLBACK LOGIC
// ============================================================================

/**
 * Fallback when both database and AI fail
 * Uses simple string splitting (original logic)
 */
function createFallbackRecommendation(
  hierarchicalType: string,
  databaseMatches: CategoryMatch[]
): CategoryRecommendation {
  const parts = hierarchicalType.split('-').map(p => p.trim()).filter(p => p.length > 0);

  // Use best database match if available
  if (databaseMatches.length > 0) {
    const best = databaseMatches[0]; // Sorted by specificity
    const suggestedTags = parts.slice(0, -1); // Everything except last part

    return {
      categoryId: best.id,
      categoryGid: best.gid,
      categoryPath: best.path,
      categoryName: best.name,
      productType: best.name,
      suggestedTags,
      confidence: best.confidence,
      source: 'database',
      alternativeMatches: databaseMatches.slice(1)
    };
  }

  // Pure fallback - simple string splitting
  const newTypeValue = parts[parts.length - 1];
  const suggestedTags = parts.slice(0, -1);

  return {
    categoryId: null,
    categoryGid: null,
    categoryPath: null,
    categoryName: null,
    productType: newTypeValue,
    suggestedTags,
    confidence: 'low',
    source: 'fallback',
    reasoning: 'No matches found in Google taxonomy. Using simple string split.'
  };
}

// ============================================================================
// MAIN ORCHESTRATION
// ============================================================================

/**
 * Main function: Get intelligent category recommendation
 * Orchestrates Tier 1 (database) and Tier 2 (AI) as needed
 */
export async function recommendCategory(
  hierarchicalType: string
): Promise<CategoryRecommendation> {
  console.log(`🔍 Recommending category for: "${hierarchicalType}"`);

  // Tier 1: Database search
  const databaseMatches = await searchCategoriesInDatabase(hierarchicalType);

  // If we have a single high-confidence match, use it immediately
  if (databaseMatches.length === 1 && databaseMatches[0].confidence === 'high') {
    const match = databaseMatches[0];
    const parts = hierarchicalType.split('-').map(p => p.trim()).filter(p => p.length > 0);
    const suggestedTags = parts.slice(0, -1);

    console.log(`✓ Single high-confidence match found: ${match.name}`);

    return {
      categoryId: match.id,
      categoryGid: match.gid,
      categoryPath: match.path,
      categoryName: match.name,
      productType: match.name,
      suggestedTags,
      confidence: 'high',
      source: 'database'
    };
  }

  // If multiple matches or ambiguous, use AI to decide
  if (databaseMatches.length > 1 || (databaseMatches.length === 1 && databaseMatches[0].confidence !== 'high')) {
    console.log(`⚡ Multiple/ambiguous matches found, consulting AI...`);
    return await recommendCategoryWithAI(hierarchicalType, databaseMatches);
  }

  // No database matches - use AI with broader context
  if (databaseMatches.length === 0) {
    console.log(`⚡ No database matches, consulting AI...`);
    return await recommendCategoryWithAI(hierarchicalType, []);
  }

  // Shouldn't reach here, but fallback just in case
  return createFallbackRecommendation(hierarchicalType, databaseMatches);
}

// ============================================================================
// EXPORTS
// ============================================================================

export const categoryRecommendationService = {
  recommendCategory,
  searchCategoriesInDatabase,
  recommendCategoryWithAI,
};
