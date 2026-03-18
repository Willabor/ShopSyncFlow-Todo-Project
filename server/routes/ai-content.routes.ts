import type { Express, Request, Response } from "express";
import { storage } from "../storage.js";
import { safeErrorMessage } from "../utils/safe-error.js";
import * as geminiService from "../services/gemini-content.service.js";
import * as googleTrendsService from "../services/google-trends.service.js";
import * as googleAdsService from "../services/google-ads-keyword.service.js";
import * as yoastAnalysisService from "../services/yoast-analysis.service.js";
import * as bulletPointGenerator from "../services/bullet-point-generator.service.js";

/**
 * Call OpenRouter API with a prompt (fallback when Gemini is unavailable)
 * Uses OpenAI-compatible API via OpenRouter with Kimi K2.5 model
 */
/**
 * Default model: google/gemini-2.0-flash-001 (fast, non-thinking).
 * Avoid "thinking" models (kimi-k2.5, deepseek-r1) - they consume all tokens
 * on internal reasoning and return empty content.
 */
const OPENROUTER_DEFAULT_MODEL = 'google/gemini-2.0-flash-001';
const OPENROUTER_TIMEOUT_MS = 30000; // 30-second timeout

async function callOpenRouter(prompt: string, maxTokens: number = 2000, modelOverride?: string): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OpenRouter fallback not configured. Set OPENROUTER_API_KEY in environment.');
  }

  const model = modelOverride || process.env.OPENROUTER_DEFAULT_MODEL || OPENROUTER_DEFAULT_MODEL;
  console.log(`[OpenRouter] Calling model=${model}, max_tokens=${maxTokens}`);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), OPENROUTER_TIMEOUT_MS);

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://tasks.nexusdenim.com',
        'X-Title': 'ShopSyncFlow',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`OpenRouter API error: ${errorData.error?.message || response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    if (!content) {
      console.warn('[OpenRouter] API returned empty content. finish_reason:', data.choices?.[0]?.finish_reason);
    }
    return content;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Check if an error is a Gemini quota/rate-limit/overload error
 */
function isGeminiQuotaError(error: any): boolean {
  const msg = error?.message || '';
  return msg.includes('429') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('Daily Limit') || msg.includes('503') || msg.includes('overloaded') ||
    msg === 'GEMINI_TIMEOUT';
}

/**
 * Verify OpenRouter is configured for fallback
 */
function verifyOpenRouterFallback(reason: string): void {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error(`${reason} and no OpenRouter fallback configured. Set OPENROUTER_API_KEY in environment.`);
  }
}

/**
 * Generate product titles using OpenRouter (fallback when Gemini is overloaded)
 */
async function generateTitlesWithOpenRouter(params: any): Promise<string[]> {
  const gender = params.googleCategory?.gender || params.gender || 'Unisex';
  const genderFormatted = gender === 'Men' ? "Men's" : gender === 'Women' ? "Women's" : "Unisex";

  const prompt = `You are an expert e-commerce SEO copywriter. Generate 5 SEO-optimized product titles for:

Product: ${params.productName}
Brand: ${params.brand || 'Not specified'}
Category: ${params.category}
Gender: ${genderFormatted}
Color: ${params.color || 'Not specified'}
Key Features: ${params.keyFeatures?.join(', ') || 'Not specified'}

Requirements:
1. Each title MUST be 55-60 characters (including spaces)
2. Start with brand name
3. Include gender (${genderFormatted})
4. Include complete product name
5. End with color
6. Use Title Case (not ALL CAPS)

Format: Return ONLY 5 titles, numbered 1-5, one per line. No explanations.`;

  const text = await callOpenRouter(prompt, 500);

  const titles = text
    .split('\n')
    .filter((line: string) => /^\d\./.test(line.trim()))
    .map((line: string) => line.replace(/^\d\.\s*/, '').trim())
    .slice(0, 5);

  if (titles.length === 0) {
    throw new Error('OpenRouter returned no valid titles');
  }

  return titles;
}

/**
 * Generate product description using OpenRouter
 */
async function generateDescriptionWithOpenRouter(params: any): Promise<string> {
  const prompt = `You are an expert e-commerce copywriter. Write a compelling product description in HTML format.

Product: ${params.productName || params.title || 'Unknown Product'}
Brand: ${params.brand || params.vendorName || 'Not specified'}
Category: ${params.category || params.googleCategory?.name || 'Not specified'}
Color: ${params.color || 'Not specified'}
Key Features: ${params.enrichedData?.features?.join(', ') || params.keyFeatures?.join(', ') || 'Not specified'}
Brand Description: ${params.enrichedData?.brandDescription || params.brandData?.description || 'Not available'}
Tone: ${params.tone || 'professional'}
Sizes Available: ${params.sizesAvailable || 'Not specified'}

Requirements:
1. Write 250-300 words in HTML format (use <p>, <ul>, <li> tags)
2. Start with product title "${params.selectedTitle || params.productName || params.title}" in the first 5 words
3. Use a ${params.tone || 'professional'} tone
4. Include a compelling opening hook
5. Highlight key features and benefits
6. End with a clear call-to-action
7. Do NOT use markdown - only HTML tags
8. Do NOT include <h1> or heading tags

Write the description now:`;

  return await callOpenRouter(prompt, 2000);
}

/**
 * Generate keywords using OpenRouter
 */
async function generateKeywordsWithOpenRouter(params: any): Promise<string[]> {
  const prompt = `You are an SEO expert for e-commerce. Generate 5 optimal SEO keywords/tags for:

Product: ${params.productName || params.title}
Brand: ${params.brand || params.vendorName || 'Not specified'}
Category: ${params.category || 'Not specified'}
Color: ${params.color || 'Not specified'}

Return ONLY 5 keywords, one per line. No numbering, no explanations. Each keyword should be 1-3 words.`;

  const text = await callOpenRouter(prompt, 300);
  return text.split('\n').map((k: string) => k.trim()).filter((k: string) => k.length > 0).slice(0, 5);
}

/**
 * Generate meta tags using OpenRouter
 */
async function generateMetaWithOpenRouter(params: any): Promise<any> {
  const prompt = `You are an SEO expert. Generate meta tags for this product:

Product: ${params.productName || params.title}
Brand: ${params.brand || params.vendorName || 'Not specified'}
Category: ${params.category || 'Not specified'}
Focus Keyword: ${params.focusKeyword || params.productName || params.title}

Generate:
1. Five meta title variations (50-60 characters each)
2. One meta description (130-150 characters)

Format your response EXACTLY as:
TITLES:
1. [title]
2. [title]
3. [title]
4. [title]
5. [title]
DESCRIPTION: [description]`;

  const text = await callOpenRouter(prompt, 500);

  const titles = text.split('\n')
    .filter((line: string) => /^\d\./.test(line.trim()))
    .map((line: string) => line.replace(/^\d\.\s*/, '').trim())
    .slice(0, 5);

  const descMatch = text.match(/DESCRIPTION:\s*(.+)/i);
  const description = descMatch ? descMatch[1].trim() : '';

  return { metaTitles: titles, metaDescription: description };
}

/**
 * Generate bullet points using OpenRouter
 */
async function generateBulletPointsWithOpenRouter(params: any): Promise<string[]> {
  const count = params.count || 5;
  const prompt = `You are an e-commerce copywriter. Generate exactly ${count} SEO-optimized bullet points for:

Product: ${params.title}
Description: ${params.description || 'Not available'}
Focus Keyword: ${params.focusKeyword || 'Not specified'}
Vendor: ${params.vendor || 'Not specified'}

Requirements:
- Each bullet point should be 10-20 words
- Include the focus keyword naturally in at least 2 bullets
- Focus on benefits, not just features
- Start each with an action verb or benefit

Return ONLY the bullet points, one per line, starting with a dash (-). No numbering, no explanations.`;

  // kimi-k2.5 is a "thinking" model that uses internal reasoning tokens,
  // so we need a much higher max_tokens to ensure visible output is produced.
  // Use 4096 tokens to give the model enough room for thinking + output.
  const text = await callOpenRouter(prompt, 4096);
  console.log('[Bullet Points] OpenRouter raw response:', JSON.stringify(text.substring(0, 500)));

  const bulletPoints = text.split('\n')
    .map((b: string) => b.replace(/^[\d]+[.)]\s*/, '').replace(/^[-•*]\s*/, '').trim())
    .filter((b: string) => b.length > 5)
    .slice(0, count);

  if (bulletPoints.length === 0) {
    throw new Error('OpenRouter returned empty bullet points. Raw response was: ' + (text.substring(0, 200) || '(empty)'));
  }

  console.log(`[Bullet Points] OpenRouter generated ${bulletPoints.length} bullet points`);
  return bulletPoints;
}

/**
 * Generate collection description using OpenRouter
 */
async function generateCollectionDescriptionWithOpenRouter(params: any): Promise<any> {
  const prompt = `You are an SEO expert for e-commerce. Generate content for this product collection:

Collection: ${params.collectionName}
Product Count: ${params.productCount || 'Unknown'}
Sample Products: ${params.sampleProductTitles?.slice(0, 5).join(', ') || 'Not available'}
Sample Brands: ${params.sampleBrands?.join(', ') || 'Not specified'}
Focus Keyword: ${params.focusKeyword || params.collectionName}

Generate:
1. A collection description (150-250 characters, HTML format with <p> tags)
2. A meta title (50-60 characters)
3. A meta description (130-150 characters)

Format your response EXACTLY as:
DESCRIPTION: [description in HTML]
META_TITLE: [meta title]
META_DESCRIPTION: [meta description]`;

  const text = await callOpenRouter(prompt, 500);

  const descMatch = text.match(/DESCRIPTION:\s*(.+?)(?=META_TITLE:|$)/is);
  const titleMatch = text.match(/META_TITLE:\s*(.+)/i);
  const metaMatch = text.match(/META_DESCRIPTION:\s*(.+)/i);

  return {
    description: descMatch ? descMatch[1].trim() : '',
    metaTitle: titleMatch ? titleMatch[1].trim() : '',
    metaDescription: metaMatch ? metaMatch[1].trim() : '',
  };
}

export function registerAiContentRoutes(
  app: Express,
  requireAuth: any,
  requireRole: (roles: string[]) => any
) {
  function getTenantId(req: Request): string | null {
    return (req.user as any)?.tenantId || null;
  }

  // ============================================================================
  // AI Content Generation Routes (Gemini API)
  // ============================================================================

  // Check if Gemini API is available
  app.get("/api/ai/status", requireAuth, (req: Request, res: Response) => {
    res.json({
      available: geminiService.isGeminiAvailable(),
      model: "gemini-2.5-flash",
      provider: "Google Gemini"
    });
  });

  // Generate product titles (5 variations) - with OpenRouter fallback and timeout
  app.post("/api/ai/generate-titles", requireAuth, requireRole(["SuperAdmin", "WarehouseManager", "Editor"]), async (req: Request, res: Response) => {
    const tenantId = getTenantId(req);
    const GEMINI_TIMEOUT_MS = 45000;

    try {
      // Try Gemini first with a 30-second timeout
      const geminiPromise = geminiService.generateProductTitles(req.body);
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('GEMINI_TIMEOUT')), GEMINI_TIMEOUT_MS);
      });

      const titles = await Promise.race([geminiPromise, timeoutPromise]);
      console.log('🎯 SERVER: Generated titles (Gemini):', { count: titles?.length });
      res.json({ titles, provider: 'gemini' });
    } catch (error: any) {
      console.error('Gemini title generation failed:', error.message);

      if (isGeminiQuotaError(error)) {
        try {
          const reason = error.message === 'GEMINI_TIMEOUT' ? 'Gemini timed out (>45s)' : 'Gemini quota exceeded';
          console.log(`🔄 ${reason}, attempting OpenRouter fallback for titles...`);
          verifyOpenRouterFallback(reason);
          const titles = await generateTitlesWithOpenRouter(req.body);
          return res.json({ titles, provider: 'openrouter', fallback: true });
        } catch (fallbackErr: any) {
          console.error('OpenRouter fallback also failed:', fallbackErr.message);
          return res.status(500).json({ message: fallbackErr.message || 'Both Gemini and OpenRouter failed' });
        }
      }

      res.status(500).json({ message: safeErrorMessage(error, 'Failed to generate titles') });
    }
  });

  // Generate product description (single, customizable tone)
  app.post("/api/ai/generate-description", requireAuth, requireRole(["SuperAdmin", "WarehouseManager", "Editor"]), async (req: Request, res: Response) => {
    const tenantId = getTenantId(req);
    let brandData: any = null;
    let sizeData: any = null;
    try {
      // MULTI-TENANT: Get tenant ID from authenticated user
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      if (req.body.vendorId) {
        try {
          // MULTI-TENANT: Fetch vendor within tenant scope using getVendorById
          const vendor = await storage.getVendorById(tenantId, req.body.vendorId);

          if (vendor) {
            // Prioritize database values, fallback to enriched data from brand website scraping
            const enrichedBrandDesc = req.body.enrichedData?.brandDescription;

            brandData = {
              name: vendor.name,
              description: vendor.brandDescription || enrichedBrandDesc || null,
              foundedYear: vendor.foundedYear || null,
              specialty: vendor.specialty || null,
              targetAudience: vendor.targetAudience || null,
              websiteUrl: vendor.websiteUrl || null
            };
            console.log('🏷️  Brand data included:', {
              name: brandData.name,
              hasDescription: !!brandData.description,
              descriptionSource: vendor.brandDescription ? 'database' : enrichedBrandDesc ? 'enriched scrape' : 'none',
              hasSpecialty: !!brandData.specialty
            });
          }
        } catch (brandError) {
          console.warn('⚠️  Failed to fetch brand data (non-fatal):', brandError);
        }

        // Fetch size chart data using Google Category mapping
        try {
          // Import category mapping utilities
          const { getProductTypeFromGoogleCategory, productTypeHasSizeChart, getSizeChartLookupKeys, logCategoryMapping } = await import('../utils/category-mapping');

          // Get Google category from request (user-selected in Content Studio)
          const googleCategoryName = req.body.googleCategory?.name || req.body.category || null;

          // Map Google category to Product Type
          const productType = getProductTypeFromGoogleCategory(googleCategoryName);
          logCategoryMapping(googleCategoryName);

          // Skip size chart lookup for Accessories (no size chart needed)
          if (!productTypeHasSizeChart(productType)) {
            console.log(`⏭️  Skipping size chart lookup - Product type "${productType}" doesn't need size charts`);
          } else {
            // Get lookup keys for this product type
            const lookupKeys = getSizeChartLookupKeys(productType);
            console.log(`📏 Size chart lookup - Product Type: ${productType}, Lookup Keys: [${lookupKeys.join(', ')}]`);

            // Fetch size chart for this vendor (try any category since vendor may have one chart)
            let sizeChart = await storage.getBrandSizeChartByCategory(req.body.vendorId, productType);

            // FALLBACK: If no chart found with product type, try lookup keys
            if (!sizeChart && lookupKeys.length > 0) {
              for (const lookupKey of lookupKeys) {
                sizeChart = await storage.getBrandSizeChartByCategory(req.body.vendorId, lookupKey);
                if (sizeChart) {
                  console.log(`✅ Found size chart using lookup key: "${lookupKey}"`);
                  break;
                }
              }
            }

            // FALLBACK: Try most-used version
            if (!sizeChart) {
              console.log(`⚠️  No active size chart found, checking for most-used version...`);
              for (const lookupKey of [productType, ...lookupKeys]) {
                sizeChart = await storage.getMostUsedSizeChart(req.body.vendorId, lookupKey);
                if (sizeChart) {
                  console.log(`✅ Using most-used fallback: version ${sizeChart.version} (used ${sizeChart.usageCount} times)`);
                  await storage.incrementSizeChartUsageCount(sizeChart.id);
                  break;
                }
              }
            } else {
              console.log(`✅ Found active size chart: version ${sizeChart.version} (used ${sizeChart.usageCount} times)`);
              await storage.incrementSizeChartUsageCount(sizeChart.id);
            }

            if (sizeChart) {
              sizeData = {
                sizesAvailable: req.body.sizesAvailable || null,
                fitGuidance: sizeChart.fitGuidance || null
              } as any;

              // Extract category-specific table from parsedTables
              let hasTable = false;
              if (sizeChart.sizeChartData && typeof sizeChart.sizeChartData === 'object') {
                const chartData = sizeChart.sizeChartData as any;
                const availableKeys = chartData.parsedTables ? Object.keys(chartData.parsedTables) : [];

                console.log(`🔍 Size chart data structure:`, {
                  hasParsedTables: !!chartData.parsedTables,
                  availableCategories: availableKeys,
                  productType: productType,
                  lookupKeys: lookupKeys
                });

                // Try each lookup key to find a matching table
                for (const lookupKey of [productType, ...lookupKeys]) {
                  // Try exact match
                  if (chartData.parsedTables && chartData.parsedTables[lookupKey]) {
                    sizeData.sizeChartTable = chartData.parsedTables[lookupKey];
                    hasTable = true;
                    console.log(`✅ Size chart table found for "${lookupKey}" (${sizeData.sizeChartTable.length} chars)`);
                    break;
                  }

                  // Try partial/fuzzy match
                  const partialMatch = availableKeys.find(key =>
                    key.toLowerCase().includes(lookupKey.toLowerCase()) ||
                    lookupKey.toLowerCase().includes(key.toLowerCase())
                  );
                  if (partialMatch) {
                    sizeData.sizeChartTable = chartData.parsedTables[partialMatch];
                    hasTable = true;
                    console.log(`✅ Size chart table found via partial match: "${lookupKey}" → "${partialMatch}" (${sizeData.sizeChartTable.length} chars)`);
                    break;
                  }
                }

                if (!hasTable) {
                  console.log(`⚠️  No matching table found. Available: [${availableKeys.join(', ')}]`);
                }
              }

              // Only include URL if we DON'T have a table (fallback)
              if (!hasTable && sizeChart.sourceUrl) {
                sizeData.sizeChartUrl = sizeChart.sourceUrl;
                console.log('⚠️  No table available, providing URL as fallback');
              }

              console.log('📏 Size chart data included in description generation:', {
                ...sizeData,
                sizeChartTable: sizeData.sizeChartTable ? `<table>(${sizeData.sizeChartTable.length} chars)</table>` : undefined
              });
            } else {
              console.log(`⚠️  No size chart found for vendor ${req.body.vendorId} with product type ${productType}`);
            }
          }
        } catch (sizeChartError) {
          console.warn('⚠️  Failed to fetch size chart (non-fatal):', sizeChartError);
          // Continue without size data
        }
      }

      // Add size data and brand data to params
      const params = {
        ...req.body,
        sizeData,
        brandData
      };

      console.log(`🎨 Description generation params:`, {
        tone: params.tone || 'NOT SET (will default to professional)',
        hasEnrichedData: !!params.enrichedData,
        enrichedFeatures: params.enrichedData?.features?.length || 0,
        hasSizeData: !!sizeData,
        hasSizeChartTable: !!sizeData?.sizeChartTable,
        sizeChartTableLength: sizeData?.sizeChartTable?.length || 0,
        hasBrandData: !!brandData,
        hasImageUrl: !!params.imageUrl
      });

      const descriptions = await geminiService.generateProductDescriptions(params);
      res.json({ description: descriptions[0], provider: 'gemini' });
    } catch (error: any) {
      console.error('Error generating description:', error.message);

      if (isGeminiQuotaError(error)) {
        try {
          const reason = error.message?.includes('429') || error.message?.includes('quota') ? 'Gemini quota exceeded' : 'Gemini unavailable';
          console.log(`🔄 ${reason}, attempting OpenRouter fallback for description...`);
          verifyOpenRouterFallback(reason);
          const description = await generateDescriptionWithOpenRouter({ ...req.body, brandData, sizeData });
          return res.json({ description, provider: 'openrouter', fallback: true });
        } catch (fallbackErr: any) {
          console.error('OpenRouter description fallback failed:', fallbackErr.message);
          return res.status(500).json({ message: fallbackErr.message || 'Both Gemini and OpenRouter failed' });
        }
      }

      res.status(500).json({ message: safeErrorMessage(error, 'Failed to generate description') });
    }
  });

  // Generate collection description with AI (SEO-optimized, 100-250 words)
  app.post("/api/ai/generate-collection-description", requireAuth, requireRole(["SuperAdmin", "WarehouseManager", "Editor"]), async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      const { collectionName, collectionHandle, existingDescription, productCount,
              collectionType, sampleProductTitles, sampleBrands, focusKeyword } = req.body;

      if (!collectionName) {
        return res.status(400).json({ message: "collectionName is required" });
      }

      const result = await geminiService.generateCollectionDescription({
        collectionName,
        collectionHandle: collectionHandle || '',
        existingDescription: existingDescription || undefined,
        productCount,
        collectionType,
        sampleProductTitles: sampleProductTitles || [],
        sampleBrands: sampleBrands || [],
        focusKeyword: focusKeyword || collectionName,
        tone: 'professional',
      });

      res.json({ ...result, provider: 'gemini' });
    } catch (error: any) {
      console.error('Error generating collection description:', error.message);

      if (isGeminiQuotaError(error)) {
        try {
          verifyOpenRouterFallback('Gemini quota exceeded');
          console.log('🔄 Gemini quota exceeded, using OpenRouter for collection description...');
          const result = await generateCollectionDescriptionWithOpenRouter(req.body);
          return res.json({ ...result, provider: 'openrouter', fallback: true });
        } catch (fallbackErr: any) {
          return res.status(500).json({ message: fallbackErr.message || 'Both Gemini and OpenRouter failed' });
        }
      }

      res.status(500).json({ message: safeErrorMessage(error, 'Failed to generate collection description') });
    }
  });

  // Generate product keywords (10 keywords)
  app.post("/api/ai/generate-keywords", requireAuth, requireRole(["SuperAdmin", "WarehouseManager", "Editor"]), async (req: Request, res: Response) => {
    const tenantId = getTenantId(req);
    try {
      const keywords = await geminiService.generateProductKeywords(req.body);
      res.json({ keywords, provider: 'gemini' });
    } catch (error: any) {
      console.error('Error generating keywords:', error.message);

      if (isGeminiQuotaError(error)) {
        try {
          verifyOpenRouterFallback('Gemini quota exceeded');
          console.log('🔄 Gemini quota exceeded, using OpenRouter for keywords...');
          const keywords = await generateKeywordsWithOpenRouter(req.body);
          return res.json({ keywords, provider: 'openrouter', fallback: true });
        } catch (fallbackErr: any) {
          return res.status(500).json({ message: fallbackErr.message || 'Both Gemini and OpenRouter failed' });
        }
      }

      res.status(500).json({ message: safeErrorMessage(error, 'Failed to generate keywords') });
    }
  });

  // Generate meta tags (title + description for SEO)
  app.post("/api/ai/generate-meta", requireAuth, requireRole(["SuperAdmin", "WarehouseManager", "Editor"]), async (req: Request, res: Response) => {
    const tenantId = getTenantId(req);
    try {
      const metaTags = await geminiService.generateMetaTags(req.body);
      res.json({ ...metaTags, provider: 'gemini' });
    } catch (error: any) {
      console.error('Error generating meta tags:', error.message);

      if (isGeminiQuotaError(error)) {
        try {
          verifyOpenRouterFallback('Gemini quota exceeded');
          console.log('🔄 Gemini quota exceeded, using OpenRouter for meta tags...');
          const metaTags = await generateMetaWithOpenRouter(req.body);
          return res.json({ ...metaTags, provider: 'openrouter', fallback: true });
        } catch (fallbackErr: any) {
          return res.status(500).json({ message: fallbackErr.message || 'Both Gemini and OpenRouter failed' });
        }
      }

      res.status(500).json({ message: safeErrorMessage(error, 'Failed to generate meta tags') });
    }
  });

  // Generate image alt text (SEO + accessibility)
  app.post("/api/ai/generate-alt-text", requireAuth, requireRole(["SuperAdmin", "WarehouseManager", "Editor"]), async (req: Request, res: Response) => {
    const tenantId = getTenantId(req);
    try {
      const altText = await geminiService.generateImageAltText(req.body);
      res.json({ altText, provider: 'gemini' });
    } catch (error: any) {
      console.error('Error generating alt text:', error.message);

      if (isGeminiQuotaError(error)) {
        try {
          verifyOpenRouterFallback('Gemini quota exceeded');
          console.log('🔄 Gemini quota exceeded, using OpenRouter for alt text...');
          const prompt = `Generate SEO-optimized image alt text (100-125 characters) for: ${req.body.productName || req.body.title}, Brand: ${req.body.brand || 'Not specified'}, Category: ${req.body.category || 'Not specified'}. Return ONLY the alt text, nothing else.`;
          const altText = await callOpenRouter(prompt, 200);
          await storage.updateApiIntegrationLastUsed(tenantId!, 'claude');
          return res.json({ altText: altText.trim(), provider: 'openrouter', fallback: true });
        } catch (claudeErr: any) {
          return res.status(500).json({ message: claudeErr.message || 'Both Gemini and Claude failed' });
        }
      }

      res.status(500).json({ message: safeErrorMessage(error, 'Failed to generate alt text') });
    }
  });

  // Generate image alt text using Gemini Vision (analyzes actual image content)
  app.post("/api/products/:productId/images/generate-alt-text",
    requireAuth,
    requireRole(["SuperAdmin", "WarehouseManager", "Editor"]),
    async (req: Request, res: Response) => {
      try {
        const { imageUrl, productTitle, brandName, category, imagePosition } = req.body;

        if (!imageUrl || !productTitle) {
          return res.status(400).json({
            error: "imageUrl and productTitle are required"
          });
        }

        const altText = await geminiService.generateAltTextWithVision({
          imageUrl,
          productTitle,
          brandName,
          category,
          imagePosition: imagePosition || 1,
        });

        res.json({
          altText,
          characterCount: altText.length
        });
      } catch (error: any) {
        console.error('Error generating alt text with vision:', error);

        if (isGeminiQuotaError(error)) {
          try {
            verifyOpenRouterFallback('Gemini quota exceeded');
            console.log('🔄 Gemini quota exceeded, using OpenRouter for vision alt text...');

            // Fetch image and convert to base64 for OpenRouter vision
            const imageResponse = await fetch(req.body.imageUrl);
            if (!imageResponse.ok) throw new Error('Failed to fetch image for fallback');
            const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
            const imageBase64 = imageBuffer.toString('base64');
            const contentType = imageResponse.headers.get('content-type') || 'image/jpeg';

            const { callOpenRouterVision } = await import('../utils/openrouter-fallback');
            const prompt = `Generate SEO-optimized image alt text (100-125 characters) for this product image.
Product: ${req.body.productTitle}
Brand: ${req.body.brandName || 'Not specified'}
Category: ${req.body.category || 'Not specified'}
Image position: ${req.body.imagePosition || 1}

Return ONLY the alt text, nothing else. Make it descriptive and include the product name.`;

            const altText = await callOpenRouterVision(imageBase64, contentType, prompt, 500);
            return res.json({
              altText: altText.trim(),
              characterCount: altText.trim().length,
              provider: 'openrouter',
              fallback: true
            });
          } catch (fallbackErr: any) {
            console.error('OpenRouter vision fallback failed:', fallbackErr.message);
            return res.status(500).json({ error: fallbackErr.message || 'Both Gemini and OpenRouter failed' });
          }
        }

        res.status(500).json({
          error: safeErrorMessage(error, 'Failed to generate alt text')
        });
      }
    }
  );

  // Generate SEO-optimized bullet points (Sales Points / Product Highlights)
  app.post("/api/ai/generate-bullet-points", requireAuth, requireRole(["SuperAdmin", "WarehouseManager", "Editor"]), async (req: Request, res: Response) => {
    const tenantId = getTenantId(req);
    try {
      const { title, description, focusKeyword, productType, vendor, tags, existingBulletPoints, count } = req.body;

      if (!title) {
        return res.status(400).json({ message: 'Product title is required' });
      }

      const result = await bulletPointGenerator.generateBulletPoints({
        title,
        description,
        focusKeyword,
        productType,
        vendor,
        tags,
        existingBulletPoints,
        count: count || 5
      });

      if (result.success) {
        res.json({ bulletPoints: result.bulletPoints, provider: 'gemini' });
      } else {
        throw new Error(result.error || 'Failed to generate bullet points');
      }
    } catch (error: any) {
      console.error('Error generating bullet points:', error.message);

      if (isGeminiQuotaError(error)) {
        try {
          verifyOpenRouterFallback('Gemini quota exceeded');
          console.log('🔄 Gemini quota exceeded, using OpenRouter for bullet points...');
          const bulletPoints = await generateBulletPointsWithOpenRouter(req.body);
          return res.json({ bulletPoints, provider: 'openrouter', fallback: true });
        } catch (fallbackErr: any) {
          return res.status(500).json({ message: fallbackErr.message || 'Both Gemini and OpenRouter failed' });
        }
      }

      res.status(500).json({ message: safeErrorMessage(error, 'Failed to generate bullet points') });
    }
  });

  // Analyze content with Yoast SEO
  app.post("/api/ai/analyze-content", requireAuth, requireRole(["SuperAdmin", "WarehouseManager", "Editor"]), async (req: Request, res: Response) => {
    try {
      const { html, keyword, title, metaDescription } = req.body;

      if (!html || !keyword) {
        return res.status(400).json({ message: 'HTML content and keyword are required' });
      }

      const analysis = await yoastAnalysisService.analyzeContent(html, keyword, title || '', metaDescription || '');
      res.json(analysis);
    } catch (error: any) {
      console.error('Error analyzing content:', error);
      res.status(500).json({ message: safeErrorMessage(error, 'Failed to analyze content') });
    }
  });

  // ============================================================================
  // Keyword Research Routes (Google Trends API)
  // ============================================================================

  // Suggest optimal focus keyword (AI-powered with Gemini + Google Ads API)
  app.post("/api/keywords/suggest", requireAuth, requireRole(["SuperAdmin", "WarehouseManager", "Editor"]), async (req: Request, res: Response) => {
    try {
      // MULTI-TENANT: Get tenant context
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      const { productName, brand, category, googleCategory, description, material, color } = req.body;

      if (!productName) {
        return res.status(400).json({ message: 'Product name is required' });
      }

      // Try Google Ads API first (official, REAL search volumes) - MULTI-TENANT
      const isGoogleAdsAvailable = await googleAdsService.isGoogleAdsAvailable(tenantId);
      if (isGoogleAdsAvailable) {
        try {
          console.log('🎯 Using Google Ads API for keyword research (database tokens)');
          const suggestion = await googleAdsService.suggestFocusKeyword(
            tenantId,
            productName,
            brand,
            category,
            googleCategory,
            { description, material, color }
          );
          return res.json(suggestion);
        } catch (googleAdsError: any) {
          // Google Ads failed (expired token, rate limit, etc.) - fallback to Google Trends
          console.warn('⚠️  Google Ads API failed, falling back to Google Trends:', googleAdsError.message);
        }
      }

      // Fallback to Google Trends (unofficial scraper)
      console.log('📊 Using Google Trends for keyword suggestion');
      const suggestion = await googleTrendsService.suggestFocusKeyword(
        productName,
        brand,
        category,
        googleCategory,
        { description, material, color }
      );
      res.json(suggestion);
    } catch (error: any) {
      console.error('Error suggesting focus keyword:', error);
      res.status(500).json({ message: safeErrorMessage(error, 'Failed to suggest focus keyword') });
    }
  });

  // Compare keyword variations to find highest search volume (AI-powered with Gemini + Google Ads API)
  app.post("/api/keywords/compare", requireAuth, requireRole(["SuperAdmin", "WarehouseManager", "Editor"]), async (req: Request, res: Response) => {
    try {
      // MULTI-TENANT: Get tenant context
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      const { productName, brand, category, googleCategory, description, material, color } = req.body;

      if (!productName) {
        return res.status(400).json({ message: 'Product name is required' });
      }

      // Try Google Ads API first (official, REAL search volumes) - MULTI-TENANT
      const isGoogleAdsAvailable = await googleAdsService.isGoogleAdsAvailable(tenantId);
      if (isGoogleAdsAvailable) {
        try {
          console.log('🎯 Using Google Ads API for keyword comparison (database tokens)');
          const comparison = await googleAdsService.compareKeywordVariations(
            tenantId,
            productName,
            brand,
            category,
            googleCategory,
            { description, material, color }
          );

          // Transform Google Ads data to frontend format
          const maxSearches = Math.max(...comparison.variations.map(v => v.monthlySearches), 1);
          const transformedVariations = comparison.variations.map(v => ({
            keyword: v.keyword,
            monthlySearches: v.monthlySearches,
            competition: v.competition,
            competitionIndex: v.competitionIndex,
            relativeInterest: Math.round((v.monthlySearches / maxSearches) * 100),
            isHighest: v.keyword === comparison.recommended
          }));

          return res.json({
            ...comparison,
            variations: transformedVariations
          });
        } catch (googleAdsError: any) {
          // Google Ads failed (expired token, rate limit, etc.) - fallback to Google Trends
          console.warn('⚠️  Google Ads API failed, falling back to Google Trends:', googleAdsError.message);
        }
      }

      // Fallback to Google Trends (unofficial scraper)
      console.log('📊 Using Google Trends for keyword comparison');
      const comparison = await googleTrendsService.compareKeywordVariations(
        productName,
        brand,
        category,
        googleCategory,
        { description, material, color }
      );
      res.json(comparison);
    } catch (error: any) {
      console.error('Error comparing keywords:', error);
      res.status(500).json({ message: safeErrorMessage(error, 'Failed to compare keywords') });
    }
  });

  // Get related queries for a keyword
  app.get("/api/keywords/related/:keyword", requireAuth, requireRole(["SuperAdmin", "WarehouseManager", "Editor"]), async (req: Request, res: Response) => {
    try {
      const keyword = decodeURIComponent(req.params.keyword);
      const related = await googleTrendsService.getRelatedQueries(keyword);
      res.json({ keyword, related });
    } catch (error: any) {
      console.error('Error fetching related queries:', error);
      res.status(500).json({ message: safeErrorMessage(error, 'Failed to fetch related queries') });
    }
  });

  // Get trending searches for a category
  app.get("/api/keywords/trending/:category", requireAuth, requireRole(["SuperAdmin", "WarehouseManager", "Editor"]), async (req: Request, res: Response) => {
    try {
      const category = decodeURIComponent(req.params.category);
      const trending = await googleTrendsService.getTrendingSearches(category);
      res.json({ category, trending });
    } catch (error: any) {
      console.error('Error fetching trending searches:', error);
      res.status(500).json({ message: safeErrorMessage(error, 'Failed to fetch trending searches') });
    }
  });

  // Get daily trending searches (hot topics)
  app.get("/api/keywords/daily-trends", requireAuth, requireRole(["SuperAdmin", "WarehouseManager", "Editor"]), async (req: Request, res: Response) => {
    try {
      const trends = await googleTrendsService.getDailyTrends();
      res.json({ trends });
    } catch (error: any) {
      console.error('Error fetching daily trends:', error);
      res.status(500).json({ message: safeErrorMessage(error, 'Failed to fetch daily trends') });
    }
  });

  // ============================================================================
  // End Keyword Research Routes
  // ============================================================================

  // ============================================================================
  // End AI Content Generation Routes
  // ============================================================================
}
