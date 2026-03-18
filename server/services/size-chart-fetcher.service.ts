/**
 * Size Chart Fetcher Service
 *
 * Implements a 4-layer cascade for extracting size charts from brand websites:
 * - Layer 1: Cheerio (Static HTML) - Fast scraping of /pages/size-chart
 * - Layer 2: Generic Scraper - SKIPPED (not applicable for size charts)
 * - Layer 3: AI Extraction (Gemini) - AI-powered extraction from HTML
 * - Layer 4: Puppeteer + AI - Headless browser for modal/dynamic content
 */

import { createHash } from 'crypto';

// ============================================================================
// Types
// ============================================================================

export interface SizeChartLayerResult {
  attempted: boolean;
  success: boolean;
  method: string;
}

export interface SizeChartLayerProgress {
  layer1: SizeChartLayerResult;
  layer2: SizeChartLayerResult;
  layer3: SizeChartLayerResult;
  layer4: SizeChartLayerResult;
}

export interface SizeChartFetchResult {
  success: boolean;
  successfulLayer: number;
  method: string;
  data?: {
    parsedTables: Record<string, string>;
    note?: string;
    sampleImageUrl?: string;
    sourceUrl?: string;
  };
  layerResults: SizeChartLayerProgress;
  error?: string;
}

// ============================================================================
// Main Fetch Function
// ============================================================================

/**
 * Fetch size chart using 4-layer cascade
 *
 * @param websiteUrl - Brand website URL
 * @param sizeChartType - 'table' or 'image'
 * @returns Size chart data with layer information
 */
export async function fetchSizeChartWithLayers(
  websiteUrl: string,
  sizeChartType: 'table' | 'image'
): Promise<SizeChartFetchResult> {

  // Initialize layer progress tracking
  const layerResults: SizeChartLayerProgress = {
    layer1: { attempted: false, success: false, method: 'Cheerio (Static HTML)' },
    layer2: { attempted: false, success: false, method: 'Generic Scraper' },
    layer3: { attempted: false, success: false, method: 'AI Extraction (Gemini)' },
    layer4: { attempted: false, success: false, method: 'Puppeteer + AI' }
  };

  if (sizeChartType === 'table') {
    return await fetchTableBasedSizeChart(websiteUrl, layerResults);
  } else if (sizeChartType === 'image') {
    return await fetchImageBasedSizeChart(websiteUrl, layerResults);
  } else {
    return {
      success: false,
      successfulLayer: 0,
      method: 'none',
      layerResults,
      error: 'Unknown size chart type'
    };
  }
}

// ============================================================================
// Layer 1: Cheerio (Static HTML)
// ============================================================================

async function attemptLayer1Cheerio(websiteUrl: string): Promise<{
  success: boolean;
  data?: any;
  error?: string;
}> {
  try {
    console.log('🌐 Layer 1: Attempting Cheerio scraping of /pages/size-chart...');

    const {
      scrapeShopifySizeChart,
      parseSizeChartHtml,
      extractSizeChartImagesFromHtml
    } = await import('./shopify-scraper.service');

    const sizeChartHtml = await scrapeShopifySizeChart(websiteUrl);

    if (!sizeChartHtml) {
      console.log('❌ Layer 1: Cheerio failed - no HTML returned');
      return { success: false, error: 'No HTML returned from size chart page' };
    }

    // Parse the HTML to extract tables
    const parsed = parseSizeChartHtml(sizeChartHtml);

    if (!parsed.parsedTables || Object.keys(parsed.parsedTables).length === 0) {
      console.log('❌ Layer 1: Cheerio failed - no tables found in HTML');
      return { success: false, error: 'No tables found in size chart HTML' };
    }

    // Extract images as well (some brands use images on dedicated pages)
    const imageUrls = extractSizeChartImagesFromHtml(sizeChartHtml, websiteUrl);
    const sampleImageUrl = imageUrls.length > 0 ? imageUrls[0] : undefined;

    console.log('✅ Layer 1: Cheerio succeeded');
    console.log(`   Found ${Object.keys(parsed.parsedTables).length} categories: ${Object.keys(parsed.parsedTables).join(', ')}`);

    return {
      success: true,
      data: {
        rawHtml: sizeChartHtml,
        parsedTables: parsed.parsedTables,
        note: parsed.note,
        sampleImageUrl,
        sourceUrl: `${websiteUrl}/pages/size-chart`
      }
    };

  } catch (error: any) {
    console.error('❌ Layer 1 error:', error.message);
    return { success: false, error: error.message };
  }
}

// ============================================================================
// Layer 2: Generic Scraper (SKIPPED for size charts)
// ============================================================================

async function attemptLayer2Generic(websiteUrl: string): Promise<{
  success: boolean;
  data?: any;
  error?: string;
}> {
  console.log('⏭️  Layer 2: Skipped (generic scraper not applicable for size charts)');
  return { success: false, error: 'Generic scraper not applicable for size charts' };
}

// ============================================================================
// Layer 3: AI Extraction (Gemini)
// ============================================================================

async function attemptLayer3AI(websiteUrl: string): Promise<{
  success: boolean;
  data?: any;
  error?: string;
}> {
  try {
    console.log('🤖 Layer 3: Attempting AI extraction (Gemini)...');

    // Check if AI extraction is enabled
    if (process.env.SCRAPER_AI_ENABLED !== '1') {
      console.log('⚠️  Layer 3: AI extraction disabled (SCRAPER_AI_ENABLED != 1)');
      return { success: false, error: 'AI extraction disabled' };
    }

    // Check if Gemini API key is available
    if (!process.env.GEMINI_API_KEY) {
      console.log('⚠️  Layer 3: GEMINI_API_KEY not found in environment');
      return { success: false, error: 'Gemini API key not configured' };
    }

    // Try to fetch the dedicated size chart page (same as Layer 1)
    const { scrapeShopifySizeChart } = await import('./shopify-scraper.service');
    let html = await scrapeShopifySizeChart(websiteUrl);
    let sourceUrl = `${websiteUrl}/pages/size-chart`;

    // If no dedicated size chart page, fall back to analyzing a product page
    if (!html) {
      console.log('⚠️  No dedicated size chart page found, trying product page...');
      const { fetchAllShopifyProducts } = await import('./shopify-scraper.service');
      const products = await fetchAllShopifyProducts(websiteUrl);

      if (products.length === 0) {
        console.log('❌ Layer 3: No sample products found for testing');
        return { success: false, error: 'No products found for AI analysis' };
      }

      const productUrl = `${websiteUrl}/products/${products[0].handle}`;
      console.log(`📄 Fetching HTML from product page: ${productUrl}`);
      sourceUrl = productUrl;

      // Fetch HTML from product page
      const htmlResponse = await fetch(productUrl);
      html = await htmlResponse.text();
    } else {
      console.log(`📄 Analyzing dedicated size chart page for AI extraction`);
    }

    console.log(`📏 HTML size: ${(html.length / 1024).toFixed(1)}KB`);

    // ============================================================================
    // NEW: AI-powered size chart extraction from HTML
    // ============================================================================

    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    // Clean and truncate HTML to reduce tokens
    let cleanedHtml = html
      // Remove script tags
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      // Remove style tags
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      // Remove comments
      .replace(/<!--[\s\S]*?-->/g, '')
      // Collapse whitespace
      .replace(/\s+/g, ' ')
      .trim();

    // Limit to 50KB to avoid token limits
    if (cleanedHtml.length > 50000) {
      cleanedHtml = cleanedHtml.substring(0, 50000) + '...[content truncated]';
    }

    console.log(`📏 Cleaned HTML size: ${(cleanedHtml.length / 1024).toFixed(1)}KB`);

    const prompt = `You are an expert at analyzing e-commerce size guide pages and extracting size chart data.

TASK: Analyze this HTML from a clothing brand's size guide page and extract ALL size chart tables.

IMPORTANT CONTEXT:
- This HTML is from a dedicated size guide page (e.g., /pages/size-guide)
- The page may contain MULTIPLE size chart tables for different categories (Jeans, Sweatpants, Tops, etc.)
- Each category typically has a heading (h1/h2/h3/h4) followed by a table
- **YOU MUST EXTRACT ALL CATEGORIES**, not just one

WHAT TO LOOK FOR:
1. **Category headings** - Look for h1/h2/h3/h4 headers like "Jeans", "Denim", "Sweatpants", "Tops", "Bottoms", "Outerwear"
2. **Size chart tables** - Look for <table> elements with size measurements (Size, Waist, Inseam, Chest, Length, Hip)
3. **Table relationships** - Match each table to the heading that precedes it
4. **Measurement notes** - Look for asterisks (*), disclaimers, or measurement instructions

HTML CONTENT:
${cleanedHtml}

CRITICAL INSTRUCTIONS:
- **EXTRACT ALL TABLES** - If you see 5 different size charts (Jeans, Sweatpants, Tops, Shorts, Outerwear), extract all 5
- **PRESERVE CATEGORY NAMES** - Use the heading text as the category key (e.g., "Jeans", "Sweatpants", "Bottoms")
- **MAINTAIN ORDER** - Return categories in the order they appear on the page (Jeans first if it appears first)
- **KEEP TABLE HTML** - Preserve the full table HTML structure including headers and all rows
- **EXTRACT FIT GUIDANCE** - If there's text like "True to size" or "Runs small", include it
- **EXTRACT MEASUREMENT NOTES** - Include any notes about how to measure (e.g., "Waist measured flat across")

Return ONLY valid JSON (no markdown, no code fences):
{
  "found": true,
  "parsedTables": {
    "Jeans": "<table>full table HTML here</table>",
    "Sweatpants": "<table>full table HTML here</table>",
    "Tops": "<table>full table HTML here</table>"
  },
  "fitGuidance": "True to size, Runs small, etc. or null",
  "note": "Measurement instructions or null",
  "confidence": 0.0 to 1.0
}

If no size charts found, return:
{
  "found": false,
  "confidence": 0.0,
  "error": "No size chart tables found in HTML"
}`;

    console.log('🤖 Sending HTML to AI for size chart extraction...');

    let aiText: string;

    try {
      const result = await model.generateContent(prompt);
      aiText = result.response.text().trim();
      console.log(`🤖 Gemini response received: ${aiText.length} characters`);
    } catch (geminiErr: any) {
      // Check if Gemini quota exhausted - try OpenRouter fallback
      const { isGeminiQuotaError, callOpenRouterText } = await import('../utils/openrouter-fallback');
      if (isGeminiQuotaError(geminiErr) && process.env.OPENROUTER_API_KEY) {
        console.log('🔄 Gemini quota exceeded, using OpenRouter for Layer 3 AI extraction...');
        aiText = await callOpenRouterText(prompt, 8192);
        if (!aiText) throw new Error('OpenRouter returned empty response for size chart extraction');
        aiText = aiText.trim();
        console.log(`🤖 OpenRouter response received: ${aiText.length} characters`);
      } else {
        throw geminiErr;
      }
    }

    // Remove markdown code fences
    aiText = aiText.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/\s*```$/g, '');

    // Parse AI response
    let aiData: any;
    try {
      aiData = JSON.parse(aiText);
    } catch (parseError) {
      console.error('❌ Layer 3: Failed to parse AI response as JSON');
      console.error('Response preview:', aiText.substring(0, 200));
      return { success: false, error: 'AI returned invalid JSON format' };
    }

    // Check if size chart was found
    if (!aiData.found || !aiData.parsedTables || Object.keys(aiData.parsedTables).length === 0) {
      console.log('❌ Layer 3: AI did not find size chart data in HTML');
      console.log(`   Confidence: ${aiData.confidence || 0}, Error: ${aiData.error || 'Unknown'}`);
      return {
        success: false,
        error: aiData.error || 'No size chart data found by AI'
      };
    }

    console.log('✅ Layer 3: AI successfully extracted size chart data');
    console.log(`   Categories found: ${Object.keys(aiData.parsedTables).join(', ')}`);
    console.log(`   Confidence: ${aiData.confidence || 'N/A'}`);

    return {
      success: true,
      data: {
        parsedTables: aiData.parsedTables,
        note: aiData.note || aiData.fitGuidance,
        sourceUrl: sourceUrl,
        confidence: aiData.confidence
      }
    };

  } catch (error: any) {
    console.error('❌ Layer 3 error:', error.message);
    return { success: false, error: error.message };
  }
}

// ============================================================================
// Layer 4: Puppeteer + AI
// ============================================================================

async function attemptLayer4Puppeteer(websiteUrl: string): Promise<{
  success: boolean;
  data?: any;
  error?: string;
}> {
  try {
    console.log('🎭 Layer 4: Attempting Puppeteer + AI...');

    // Check if Puppeteer is enabled
    if (process.env.PUPPETEER_SERVICE_ENABLED !== '1') {
      console.log('⚠️  Layer 4: Puppeteer disabled (PUPPETEER_SERVICE_ENABLED != 1)');
      return { success: false, error: 'Puppeteer service disabled' };
    }

    // Get a sample product page URL for testing
    const { fetchAllShopifyProducts } = await import('./shopify-scraper.service');
    const products = await fetchAllShopifyProducts(websiteUrl);

    const testUrl = products.length > 0
      ? `${websiteUrl}/products/${products[0].handle}`
      : websiteUrl;

    console.log(`🌐 Testing with URL: ${testUrl}`);

    // Call Puppeteer service
    const { extractSizeChartViaPuppeteer, formatSizeChartForShopSync } = await import('./puppeteer-client.service');
    const puppeteerResult = await extractSizeChartViaPuppeteer(testUrl);

    if (!puppeteerResult.success || !puppeteerResult.sizeChart) {
      console.log('❌ Layer 4: Puppeteer + AI failed');
      return { success: false, error: puppeteerResult.error || 'Puppeteer extraction failed' };
    }

    console.log('✅ Layer 4: Puppeteer + AI succeeded');

    // Format the result for ShopSyncFlow
    const formatted = formatSizeChartForShopSync(puppeteerResult);

    console.log(`📊 Extracted ${Object.keys(formatted.parsedTables || {}).length} categories: ${Object.keys(formatted.parsedTables || {}).join(', ')}`);

    return {
      success: true,
      data: {
        parsedTables: formatted.parsedTables || {},
        note: formatted.note,
        sampleImageUrl: formatted.sampleImageUrl,
        sourceUrl: formatted.sourceUrl || `${websiteUrl}/pages/size-chart`
      }
    };

  } catch (error: any) {
    console.error('❌ Layer 4 error:', error.message);
    return { success: false, error: error.message };
  }
}

// ============================================================================
// TABLE-BASED Size Chart Fetching (4-layer cascade)
// ============================================================================

async function fetchTableBasedSizeChart(
  websiteUrl: string,
  layerResults: SizeChartLayerProgress
): Promise<SizeChartFetchResult> {

  // ============================================================================
  // Layer 1: Cheerio
  // ============================================================================
  layerResults.layer1.attempted = true;
  const layer1Result = await attemptLayer1Cheerio(websiteUrl);

  if (layer1Result.success) {
    layerResults.layer1.success = true;
    return {
      success: true,
      successfulLayer: 1,
      method: 'cheerio',
      data: layer1Result.data,
      layerResults
    };
  }

  // ============================================================================
  // Layer 2: Generic Scraper (SKIP)
  // ============================================================================
  layerResults.layer2.attempted = false; // Explicitly not attempted
  // Skip this layer - not applicable for size charts

  // ============================================================================
  // Layer 3: AI Extraction (Gemini)
  // ============================================================================
  layerResults.layer3.attempted = true;
  const layer3Result = await attemptLayer3AI(websiteUrl);

  if (layer3Result.success) {
    layerResults.layer3.success = true;
    return {
      success: true,
      successfulLayer: 3,
      method: 'ai-gemini',
      data: layer3Result.data,
      layerResults
    };
  }

  // ============================================================================
  // Layer 4: Puppeteer + AI
  // ============================================================================
  layerResults.layer4.attempted = true;
  const layer4Result = await attemptLayer4Puppeteer(websiteUrl);

  if (layer4Result.success) {
    layerResults.layer4.success = true;
    return {
      success: true,
      successfulLayer: 4,
      method: 'puppeteer',
      data: layer4Result.data,
      layerResults
    };
  }

  // ============================================================================
  // All layers failed
  // ============================================================================
  console.log('❌ All layers failed - no size chart data available');
  return {
    success: false,
    successfulLayer: 0,
    method: 'none',
    layerResults,
    error: 'All extraction methods failed'
  };
}

// ============================================================================
// IMAGE-BASED Size Chart Fetching (simplified for now)
// ============================================================================

async function fetchImageBasedSizeChart(
  websiteUrl: string,
  layerResults: SizeChartLayerProgress
): Promise<SizeChartFetchResult> {

  console.log('📸 Fetching image-based size chart (simplified flow)');

  // For image-based, we primarily use Puppeteer + AI Vision
  layerResults.layer4.attempted = true;
  const result = await attemptLayer4Puppeteer(websiteUrl);

  if (result.success) {
    layerResults.layer4.success = true;
    return {
      success: true,
      successfulLayer: 4,
      method: 'puppeteer',
      data: result.data,
      layerResults
    };
  }

  return {
    success: false,
    successfulLayer: 0,
    method: 'none',
    layerResults,
    error: 'Image-based size chart extraction failed'
  };
}
