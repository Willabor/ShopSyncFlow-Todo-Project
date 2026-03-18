/**
 * Google Ads Keyword Planner Service
 *
 * Provides REAL keyword search volume data using official Google Ads API
 * - Real monthly search volumes (not relative 0-100 scale)
 * - Keyword competition levels
 * - Suggested bid prices
 * - No rate limiting issues (10,000 requests/day)
 * - Official Google data
 *
 * Updated to use database-stored OAuth tokens from api_integrations table
 */

import { GoogleAdsApi, Customer } from 'google-ads-api';
import * as geminiService from './gemini-content.service';
import { storage } from '../storage';

// Client credentials from environment (these don't change)
const clientConfig = {
  client_id: process.env.GOOGLE_ADS_CLIENT_ID!,
  client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET!,
  developer_token: process.env.GOOGLE_ADS_DEVELOPER_TOKEN!,
};

// Check if client credentials are available
const isConfigured = Boolean(
  process.env.GOOGLE_ADS_CLIENT_ID &&
  process.env.GOOGLE_ADS_CLIENT_SECRET &&
  process.env.GOOGLE_ADS_DEVELOPER_TOKEN
);

if (isConfigured) {
  console.log('✓ Google Ads API configured');
} else {
  console.warn('⚠️  Google Ads API not configured - some credentials missing');
}

/**
 * Get Google Ads customer from database-stored integration
 * Dynamically initializes client with latest tokens from database
 * MULTI-TENANT: Requires tenantId for integration lookup
 */
async function getGoogleAdsCustomer(tenantId: string): Promise<Customer> {
  if (!isConfigured) {
    throw new Error('Google Ads API client credentials not configured in environment');
  }

  // Get integration from database - MULTI-TENANT filtered
  const integration = await storage.getApiIntegration(tenantId, 'google_ads');

  if (!integration || !integration.isActive) {
    throw new Error('Google Ads not connected. Please connect your Google Ads account in Settings > Integrations.');
  }

  if (!integration.refreshToken) {
    throw new Error('Google Ads integration missing refresh token. Please reconnect your account.');
  }

  // Get customer config from database
  const config = integration.config as any;
  const customerConfig = {
    customer_id: config?.customerId || process.env.GOOGLE_ADS_CUSTOMER_ID!,
    login_customer_id: config?.loginCustomerId || process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID,
    refresh_token: integration.refreshToken,
  };

  // Initialize client with database tokens
  const client = new GoogleAdsApi(clientConfig);
  const customer = client.Customer(customerConfig);

  // Update last used timestamp - MULTI-TENANT filtered
  await storage.updateApiIntegrationLastUsed(tenantId, 'google_ads');

  console.log(`✓ Google Ads client initialized from database (Customer: ${customerConfig.customer_id})`);

  return customer;
}

export interface KeywordMetrics {
  keyword: string;
  monthlySearches: number; // Actual monthly search volume
  competition: 'LOW' | 'MEDIUM' | 'HIGH' | 'UNSPECIFIED';
  competitionIndex: number; // 0-100
  lowTopPageBid: number; // In micros (1,000,000 = $1)
  highTopPageBid: number;
  keywordType?: 'short-tail' | 'long-tail' | 'ultra-long-tail'; // Keyword length classification
}

export interface KeywordSuggestion {
  original: string;
  variations: KeywordMetrics[];
  recommended: string;
  recommendedScore: number; // Monthly search volume
}

/**
 * Classify keyword by length for conversion optimization
 * Based on 2025 SEO research:
 * - Short-tail (1-2 words): High traffic, lower conversion
 * - Long-tail (3-4 words): OPTIMAL - 2.5x higher conversion rate
 * - Ultra long-tail (5+ words): Very specific, low search volume
 */
function classifyKeywordType(keyword: string): 'short-tail' | 'long-tail' | 'ultra-long-tail' {
  const wordCount = keyword.trim().split(/\s+/).length;

  if (wordCount <= 2) {
    return 'short-tail';
  } else if (wordCount <= 4) {
    return 'long-tail'; // OPTIMAL for conversion
  } else {
    return 'ultra-long-tail';
  }
}

/**
 * Get keyword metrics from Google Keyword Planner
 * Returns REAL monthly search volumes and competition data
 * Now uses database-stored tokens instead of environment variables
 * MULTI-TENANT: Requires tenantId for integration lookup
 */
export async function getKeywordMetrics(
  tenantId: string,
  keywords: string[]
): Promise<KeywordMetrics[]> {

  // Get customer dynamically from database - MULTI-TENANT
  const customer = await getGoogleAdsCustomer(tenantId);

  try {
    console.log(`📊 Fetching keyword metrics for ${keywords.length} keywords from Google Ads API...`);

    // Get customer ID from database integration - MULTI-TENANT filtered
    const integration = await storage.getApiIntegration(tenantId, 'google_ads');
    const config = integration?.config as any;
    const customerId = config?.customerId || process.env.GOOGLE_ADS_CUSTOMER_ID!;

    const response = await customer.keywordPlanIdeas.generateKeywordIdeas({
      customer_id: customerId,
      language: 'languageConstants/1000', // English (1000 = en)
      geo_target_constants: ['geoTargetConstants/2840'], // United States
      keyword_plan_network: 'GOOGLE_SEARCH', // Google Search only (not display network)
      keyword_seed: {
        keywords,
      },
    } as any);

    const metrics: KeywordMetrics[] = [];

    for (const idea of response as unknown as any[]) {
      const keyword = idea.text || '';
      const monthlySearches = idea.keyword_idea_metrics?.avg_monthly_searches || 0;
      const competition = idea.keyword_idea_metrics?.competition || 'UNSPECIFIED';
      const competitionIndex = idea.keyword_idea_metrics?.competition_index || 0;
      const lowTopPageBid = idea.keyword_idea_metrics?.low_top_of_page_bid_micros || 0;
      const highTopPageBid = idea.keyword_idea_metrics?.high_top_of_page_bid_micros || 0;

      metrics.push({
        keyword,
        monthlySearches: Number(monthlySearches),
        competition: competition as KeywordMetrics['competition'],
        competitionIndex: Number(competitionIndex),
        lowTopPageBid: Number(lowTopPageBid),
        highTopPageBid: Number(highTopPageBid),
        keywordType: classifyKeywordType(keyword), // Add keyword length classification
      });
    }

    console.log(`✓ Retrieved metrics for ${metrics.length} keywords`);
    metrics.forEach((m) => {
      console.log(`  - "${m.keyword}": ${m.monthlySearches.toLocaleString()} searches/month, Competition: ${m.competition}`);
    });

    return metrics;

  } catch (error: any) {
    console.error('❌ Google Ads API error:', error.message);

    // Provide helpful error message if token is invalid
    if (error.message?.includes('invalid_grant') || error.message?.includes('invalid_client')) {
      throw new Error('Google Ads authentication failed. Please reconnect your Google Ads account in Settings > Integrations.');
    }

    throw new Error(`Failed to fetch keyword metrics: ${error.message}`);
  }
}

/**
 * Compare keyword variations using Google Ads Keyword Planner
 * Uses Gemini AI to generate variations, then gets REAL search volumes
 * MULTI-TENANT: Requires tenantId for integration lookup
 */
export async function compareKeywordVariations(
  tenantId: string,
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

    } catch (error) {
      console.error('❌ Gemini AI failed, using fallback variations:', error);
      variations = generateFallbackVariations(productName, brand, category);
    }
  } else {
    variations = generateFallbackVariations(productName, brand, category);
  }

  // Get real search volumes from Google Ads API - MULTI-TENANT
  const metrics = await getKeywordMetrics(tenantId, variations);

  // Sort by monthly searches (highest first)
  const sortedMetrics = metrics.sort((a, b) => b.monthlySearches - a.monthlySearches);

  const recommended = sortedMetrics[0]?.keyword || variations[0];
  const recommendedScore = sortedMetrics[0]?.monthlySearches || 0;

  console.log(`✓ Top keyword: "${recommended}" with ${recommendedScore.toLocaleString()} monthly searches`);

  return {
    original: category
      ? `${brand || ''} ${productName} (${category})`.trim()
      : brand
        ? `${brand} ${productName}`
        : productName,
    variations: sortedMetrics,
    recommended,
    recommendedScore,
  };
}

/**
 * Generate fallback keyword variations if Gemini AI is unavailable
 */
function generateFallbackVariations(productName: string, brand?: string, category?: string): string[] {
  const variations: string[] = [];
  const categoryTerm = category || productName;

  if (!brand) {
    variations.push(`Men's ${categoryTerm}`);
    variations.push(`${categoryTerm} for Men`);
    variations.push(categoryTerm);
  } else {
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
 * Suggest optimal focus keyword based on Google Ads data
 */
export async function suggestFocusKeyword(
  tenantId: string,
  productName: string,
  brand?: string,
  category?: string,
  googleCategory?: { name: string; fullPath: string; gender: string },
  productContext?: { description?: string; material?: string; color?: string }
): Promise<{ focusKeyword: string; confidence: 'high' | 'medium' | 'low'; reasoning: string }> {

  try {
    // Get keyword comparison with real search volumes - MULTI-TENANT
    const comparison = await compareKeywordVariations(
      tenantId,
      productName,
      brand,
      category,
      googleCategory,
      productContext
    );

    // Determine confidence based on search volume
    let confidence: 'high' | 'medium' | 'low' = 'low';
    if (comparison.recommendedScore >= 10000) {
      confidence = 'high';
    } else if (comparison.recommendedScore >= 1000) {
      confidence = 'medium';
    }

    // Build reasoning
    let reasoning = '';
    if (comparison.recommendedScore > 0) {
      const topKeyword = comparison.variations[0];
      reasoning = `Based on Google Keyword Planner data, "${comparison.recommended}" has ${comparison.recommendedScore.toLocaleString()} monthly searches (highest among ${comparison.variations.length} branded variations tested). Competition level: ${topKeyword.competition}. As an authorized retailer, branded keywords deliver higher conversion rates and better ROI.`;
    } else {
      reasoning = `Based on industry best practices for authorized retailers. Branded keywords (Brand + Product/Category) drive higher purchase intent and better conversion rates. Search volume data unavailable.`;
    }

    return {
      focusKeyword: comparison.recommended,
      confidence,
      reasoning
    };

  } catch (error: any) {
    console.error('Error suggesting focus keyword:', error);

    // Fallback
    const fallback = brand
      ? `${brand} ${category || productName}`
      : `Men's ${category || productName}`;

    return {
      focusKeyword: fallback,
      confidence: 'low',
      reasoning: brand
        ? `Using branded format (${brand} + Category/Product) for authorized retailer SEO. Google Ads API unavailable: ${error.message}`
        : 'Brand name recommended for optimal results as an authorized retailer.'
    };
  }
}

/**
 * Check if Google Ads API is available
 * Now checks database for active integration instead of static initialization
 * MULTI-TENANT: Requires tenantId for integration lookup
 */
export async function isGoogleAdsAvailable(tenantId: string): Promise<boolean> {
  if (!isConfigured) {
    return false;
  }

  try {
    // MULTI-TENANT: Check integration for this tenant
    const integration = await storage.getApiIntegration(tenantId, 'google_ads');
    return integration !== undefined && integration.isActive && integration.refreshToken !== null;
  } catch (error) {
    console.error('Error checking Google Ads availability:', error);
    return false;
  }
}
