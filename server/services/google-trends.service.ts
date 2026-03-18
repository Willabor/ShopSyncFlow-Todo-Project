/**
 * Google Trends Service
 *
 * Provides keyword research and trend analysis for SEO optimization.
 * Uses google-trends-api to compare keyword variations and find optimal search terms.
 * Uses Gemini AI to intelligently generate keyword variations based on product context.
 */

import googleTrends from 'google-trends-api';
import * as geminiService from './gemini-content.service';

export interface KeywordComparison {
  keyword: string;
  relativeInterest: number; // 0-100 score
  isHighest: boolean;
}

export interface KeywordSuggestion {
  original: string;
  variations: KeywordComparison[];
  recommended: string;
  recommendedScore: number;
}

export interface TrendingSearches {
  category: string;
  searches: string[];
}

/**
 * Generate fallback keyword variations if Gemini AI is unavailable
 * Simple pattern-based approach with branded keywords
 */
function generateFallbackVariations(productName: string, brand?: string, category?: string): string[] {
  const variations: string[] = [];
  const categoryTerm = category || productName;

  if (!brand) {
    // No brand - generic fallback
    variations.push(`Men's ${categoryTerm}`);
    variations.push(`${categoryTerm} for Men`);
    variations.push(categoryTerm);
  } else {
    // Branded fallback variations
    variations.push(`${brand} ${categoryTerm}`);
    variations.push(`${brand} Men's ${categoryTerm}`);
    variations.push(`${brand} ${productName}`);
    variations.push(`Men's ${brand} ${categoryTerm}`);
    variations.push(`${brand} ${categoryTerm} for Men`);

    if (category) {
      variations.push(`${brand} ${productName} ${categoryTerm}`);
      variations.push(`Men's ${brand} ${productName}`);
    }

    variations.push(`${productName} ${brand}`);
    variations.push(`${brand} Mens ${categoryTerm}`);
    variations.push(`Mens ${brand} ${categoryTerm}`);
  }

  return variations.slice(0, 10);
}

/**
 * Compare keyword variations to find the one with highest search volume
 *
 * STRATEGY: AI-powered branded keywords for authorized retailers
 * - Uses Gemini AI to intelligently generate keyword variations
 * - All variations include the brand name (authorized retailer strategy)
 * - Considers product context: category, material, features, Google Shopping taxonomy
 * - Falls back to simple patterns if AI fails
 */
export async function compareKeywordVariations(
  productName: string,
  brand?: string,
  category?: string,
  googleCategory?: { name: string; fullPath: string; gender: string },
  productContext?: {
    description?: string;
    material?: string;
    color?: string;
  }
): Promise<KeywordSuggestion> {

  let variations: string[] = [];

  // Use Gemini AI to generate intelligent keyword variations
  if (brand && geminiService.isGeminiAvailable()) {
    try {
      console.log(`🤖 Using Gemini AI to generate keyword variations for "${productName}"...`);

      variations = await geminiService.generateKeywordVariationsForTrends({
        productName,
        brand,
        category,
        googleCategory,
        description: productContext?.description,
        material: productContext?.material,
        color: productContext?.color
      });

      console.log(`✓ Gemini generated ${variations.length} keyword variations`);
      variations.forEach((v, i) => console.log(`  ${i + 1}. ${v}`));

    } catch (error: any) {
      console.error('❌ Gemini AI failed:', error.message);

      // Try OpenRouter fallback before falling back to patterns
      const { isGeminiQuotaError, callOpenRouterText } = await import('../utils/openrouter-fallback');
      if (isGeminiQuotaError(error) && process.env.OPENROUTER_API_KEY) {
        try {
          console.log('🔄 Trying OpenRouter for keyword variations...');
          const prompt = `Generate 8-10 SEO keyword variations for this product. Include brand name variations, generic terms, and long-tail keywords.

Product: ${productName}
Brand: ${brand || 'Not specified'}
Category: ${category || 'Not specified'}

Return ONLY the keywords, one per line. No numbering, no explanations.`;
          const text = await callOpenRouterText(prompt, 500);
          variations = text.split('\n').map(k => k.replace(/^[-•*\d.)\s]+/, '').trim()).filter(k => k.length > 2);
          if (variations.length > 0) {
            console.log(`✓ OpenRouter generated ${variations.length} keyword variations`);
          } else {
            variations = generateFallbackVariations(productName, brand, category);
          }
        } catch (orErr) {
          console.error('❌ OpenRouter also failed, using pattern-based variations');
          variations = generateFallbackVariations(productName, brand, category);
        }
      } else {
        console.log('Falling back to pattern-based variations');
        variations = generateFallbackVariations(productName, brand, category);
      }
    }
  } else {
    // No brand or Gemini not available - use fallback patterns
    if (!brand) {
      console.warn('⚠️  No brand provided - using generic fallback patterns');
    }
    variations = generateFallbackVariations(productName, brand, category);
  }

  try {
    // Google Trends API has a limit of 5 keywords per request
    // Batch the variations into groups of 5
    const BATCH_SIZE = 5;
    const batches: string[][] = [];

    for (let i = 0; i < variations.length; i += BATCH_SIZE) {
      batches.push(variations.slice(i, i + BATCH_SIZE));
    }

    console.log(`Testing ${variations.length} keywords in ${batches.length} batches of ${BATCH_SIZE}...`);

    // Process each batch and collect results
    const allComparisons: KeywordComparison[] = [];

    for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
      const batch = batches[batchIdx];

      try {
        console.log(`Batch ${batchIdx + 1}/${batches.length}: Testing ${batch.join(', ')}`);

        const response = await googleTrends.interestOverTime({
          keyword: batch,
          startTime: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), // Last 90 days
          geo: 'US',
        });

        const data = JSON.parse(response);

        // Calculate average interest for each keyword in this batch
        const batchComparisons = batch.map((keyword, idx) => {
          let totalInterest = 0;
          let count = 0;

          data.default.timelineData.forEach((point: any) => {
            if (point.value && point.value[idx] !== undefined) {
              totalInterest += point.value[idx];
              count++;
            }
          });

          const avgInterest = count > 0 ? Math.round(totalInterest / count) : 0;

          return {
            keyword,
            relativeInterest: avgInterest,
            isHighest: false
          };
        });

        // Log results for this batch
        batchComparisons.forEach(comp => {
          console.log(`  - "${comp.keyword}": ${comp.relativeInterest}% interest`);
        });

        allComparisons.push(...batchComparisons);

        // Add delay between batches to avoid rate limiting (3 seconds)
        if (batchIdx < batches.length - 1) {
          console.log(`Waiting 3 seconds before next batch to avoid rate limiting...`);
          await new Promise(resolve => setTimeout(resolve, 3000));
        }

      } catch (batchError: any) {
        // Check if it's a rate limit / CAPTCHA error
        const isRateLimited = batchError.requestBody &&
                              (batchError.requestBody.includes('google.com/sorry') ||
                               batchError.requestBody.includes('302 Moved'));

        if (isRateLimited) {
          console.error(`⚠️  Google Trends rate limit detected! Please wait a few minutes before trying again.`);
        } else {
          console.error(`Error in batch ${batchIdx + 1}:`, batchError.message || batchError);
        }

        // Add zero scores for this batch if it fails
        batch.forEach(keyword => {
          allComparisons.push({
            keyword,
            relativeInterest: 0,
            isHighest: false
          });
        });
      }
    }

    // Sort by interest and mark highest
    allComparisons.sort((a, b) => b.relativeInterest - a.relativeInterest);
    if (allComparisons.length > 0) {
      allComparisons[0].isHighest = true;
    }

    console.log(`Top keyword: "${allComparisons[0]?.keyword}" with ${allComparisons[0]?.relativeInterest}% interest`);

    return {
      original: category
        ? `${brand || ''} ${productName} (${category})`.trim()
        : brand
          ? `${brand} ${productName}`
          : productName,
      variations: allComparisons,
      recommended: allComparisons[0]?.keyword || variations[0],
      recommendedScore: allComparisons[0]?.relativeInterest || 0
    };

  } catch (error) {
    console.error('Error fetching Google Trends data:', error);

    // Return fallback suggestion if API fails
    // BRANDED fallback for authorized retailers
    const fallback = brand
      ? `${brand} ${category || productName}`
      : `Men's ${category || productName}`;

    return {
      original: category
        ? `${brand || ''} ${productName} (${category})`.trim()
        : brand
          ? `${brand} ${productName}`
          : productName,
      variations: variations.map(v => ({
        keyword: v,
        relativeInterest: 0,
        isHighest: v === fallback
      })),
      recommended: fallback,
      recommendedScore: 0
    };
  }
}

/**
 * Get related queries for a product to discover additional keywords
 */
export async function getRelatedQueries(keyword: string): Promise<string[]> {
  const maxRetries = 3;
  const retryDelay = 2000; // 2 seconds

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🔍 Fetching related queries for "${keyword}" (attempt ${attempt}/${maxRetries})...`);

      const response = await googleTrends.relatedQueries({
        keyword,
        startTime: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
        geo: 'US',
      });

      // Check if response is valid JSON before parsing
      if (!response || typeof response !== 'string') {
        throw new Error('Invalid response from Google Trends');
      }

      // Check if response starts with HTML (error page)
      if (response.trim().startsWith('<')) {
        throw new Error('Google Trends returned HTML instead of JSON (rate limited or blocked)');
      }

      const data = JSON.parse(response);

      // Extract top related queries
      const related: string[] = [];

      if (data.default?.rankedList) {
        data.default.rankedList.forEach((list: any) => {
          if (list.rankedKeyword) {
            list.rankedKeyword.forEach((item: any) => {
              if (item.query && related.length < 10) {
                related.push(item.query);
              }
            });
          }
        });
      }

      console.log(`✅ Successfully fetched ${related.length} related queries`);
      return related;

    } catch (error: any) {
      const isLastAttempt = attempt === maxRetries;

      if (error.message?.includes('rate limited') || error.message?.includes('HTML instead of JSON')) {
        console.warn(`⚠️  Google Trends rate limit detected (attempt ${attempt}/${maxRetries})`);

        if (!isLastAttempt) {
          console.log(`   Retrying in ${retryDelay}ms...`);
          await new Promise(resolve => setTimeout(resolve, retryDelay * attempt)); // Exponential backoff
          continue;
        }
      }

      if (isLastAttempt) {
        console.error('❌ Error fetching related queries after all retries:', error.message || error);
        // Return empty array as fallback
        return [];
      }
    }
  }

  // Fallback if all retries fail
  return [];
}

/**
 * Get trending searches for a category (e.g., "men's pants", "men's apparel")
 */
export async function getTrendingSearches(category: string): Promise<string[]> {
  try {
    const response = await googleTrends.relatedTopics({
      keyword: category,
      startTime: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
      geo: 'US',
    });

    const data = JSON.parse(response);

    // Extract trending topics
    const trending: string[] = [];

    if (data.default?.rankedList) {
      data.default.rankedList.forEach((list: any) => {
        if (list.rankedKeyword) {
          list.rankedKeyword.forEach((item: any) => {
            if (item.topic?.title && trending.length < 10) {
              trending.push(item.topic.title);
            }
          });
        }
      });
    }

    return trending;

  } catch (error) {
    console.error('Error fetching trending searches:', error);
    return [];
  }
}

/**
 * Get daily trending searches (current hot topics)
 */
export async function getDailyTrends(): Promise<TrendingSearches[]> {
  try {
    const response = await googleTrends.dailyTrends({
      geo: 'US',
    });

    const data = JSON.parse(response);

    const trends: TrendingSearches[] = [];

    if (data.default?.trendingSearchesDays) {
      data.default.trendingSearchesDays.forEach((day: any) => {
        if (day.trendingSearches) {
          day.trendingSearches.forEach((trend: any) => {
            if (trend.title?.query && trends.length < 20) {
              trends.push({
                category: trend.title.query,
                searches: trend.relatedQueries?.map((q: any) => q.query).slice(0, 5) || []
              });
            }
          });
        }
      });
    }

    return trends;

  } catch (error) {
    console.error('Error fetching daily trends:', error);
    return [];
  }
}

/**
 * Suggest optimal focus keyword based on product data
 * Now with AI-powered keyword generation using Gemini
 */
export async function suggestFocusKeyword(
  productName: string,
  brand?: string,
  category?: string,
  googleCategory?: { name: string; fullPath: string; gender: string },
  productContext?: { description?: string; material?: string; color?: string }
): Promise<{ focusKeyword: string; confidence: 'high' | 'medium' | 'low'; reasoning: string }> {

  // Clean the product name
  const cleanProduct = productName
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

  // Clean the category if provided
  const cleanCategory = category
    ? category.toLowerCase().replace(/\s+/g, ' ').trim()
    : undefined;

  try {
    // Compare variations with AI-powered generation (uses Gemini + Google Trends)
    const comparison = await compareKeywordVariations(
      cleanProduct,
      brand,
      cleanCategory,
      googleCategory,
      productContext
    );

    // Determine confidence based on score
    let confidence: 'high' | 'medium' | 'low' = 'low';
    if (comparison.recommendedScore >= 50) {
      confidence = 'high';
    } else if (comparison.recommendedScore >= 25) {
      confidence = 'medium';
    }

    // Build reasoning
    let reasoning = '';
    if (comparison.recommendedScore > 0) {
      reasoning = `Based on Google Trends data from the last 90 days, "${comparison.recommended}" has ${comparison.recommendedScore}% relative search interest (highest among ${comparison.variations.length} branded variations tested). As an authorized retailer, branded keywords deliver higher conversion rates and lower competition than generic alternatives.`;
    } else {
      reasoning = `Based on industry best practices for authorized retailers. Branded keywords (Brand + Product/Category) drive higher purchase intent and better conversion rates. Google Trends data unavailable - using best practice format.`;
    }

    return {
      focusKeyword: comparison.recommended,
      confidence,
      reasoning
    };

  } catch (error) {
    console.error('Error suggesting focus keyword:', error);

    // Fallback to BRANDED format for authorized retailers
    const fallback = brand
      ? `${brand} ${cleanCategory || cleanProduct}`
      : `Men's ${cleanCategory || cleanProduct}`;

    return {
      focusKeyword: fallback,
      confidence: 'low',
      reasoning: brand
        ? `Using branded format (${brand} + Category/Product) for authorized retailer SEO. Branded keywords convert better and face less competition than generic alternatives.`
        : 'Brand name recommended for optimal results as an authorized retailer. Using fallback format.'
    };
  }
}
