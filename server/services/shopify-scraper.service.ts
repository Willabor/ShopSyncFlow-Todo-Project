/**
 * Shopify Scraper Service
 *
 * Fetches product data from Shopify stores via their public JSON API.
 * Supports product search by style number, SKU, or product name.
 *
 * Rate limiting: 2 requests/second (Shopify limit)
 */

import * as cheerio from 'cheerio';
import { parseProductDescription, extractCleanDescription } from './html-parser.service';
import { GOOGLE_APPAREL_CATEGORIES } from '../../shared/google-categories';
import { PoliteFetcher } from '../utils/polite-fetch.js';

// Shopify product JSON structure
interface ShopifyProduct {
  id: number;
  title: string;
  handle: string;
  body_html: string | null;
  vendor: string;
  product_type: string;
  tags: string[];
  variants: ShopifyVariant[];
  images: ShopifyImage[];
  options: ShopifyOption[];
}

interface ShopifyVariant {
  id: number;
  title: string;
  option1: string | null;
  option2: string | null;
  option3: string | null;
  sku: string | null;
  price: string;
  compare_at_price: string | null;
  available: boolean;
  featured_image: ShopifyImage | null;
}

interface ShopifyImage {
  id: number;
  src: string;
  width: number;
  height: number;
  alt?: string;
  position: number;
}

interface ShopifyOption {
  name: string;
  position: number;
  values: string[];
}

interface ShopifyProductsResponse {
  products: ShopifyProduct[];
}

// Our enriched product data structure
export interface EnrichedProductData {
  // Identifiers
  styleNumber: string;
  productName: string;
  color?: string;

  // Scraped data
  brandProductUrl: string;
  brandProductTitle?: string; // NEW: The actual title from brand website
  brandDescription: string;
  materialComposition?: string;
  careInstructions?: string;
  features: string[];

  // Images
  images: Array<{
    url: string;
    width: number;
    height: number;
    alt?: string;
    isPrimary: boolean;
  }>;

  // Variants (for reference)
  variants: Array<{
    sku: string | null;
    size: string;
    price: string;
    available: boolean;
  }>;

  // Size chart (image-based)
  sizeChartImageUrl?: string; // NEW: URL to size chart image (if found on product page)
  sizeChartImageAnalysis?: {
    fitType?: string;
    material?: string;
    features?: string[];
    measurements?: Record<string, Record<string, string>>;
    rawAnalysis?: string;
  }; // NEW: AI-analyzed size chart data

  // Metadata
  scrapedAt: Date;
  scrapingSuccess: boolean;
  scrapingError?: string;
}

const politeFetcher = new PoliteFetcher({
  minDelayMs: 1500,
  maxDelayMs: 3500,
});

/**
 * Detect if a website is a Shopify store
 */
export async function detectShopifyStore(websiteUrl: string): Promise<boolean> {
  try {
    const testUrl = `${normalizeUrl(websiteUrl)}/products.json?limit=1`;
    const response = await politeFetcher.fetch(testUrl, {
      method: 'HEAD',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ShopSyncFlow/1.0)'
      }
    });

    return response.ok;
  } catch (error) {
    console.error('Shopify detection failed:', error);
    return false;
  }
}

/**
 * Search for products on a Shopify store using the predictive search API.
 * Much faster than fetching all products and less likely to be blocked.
 */
async function searchShopifyProducts(
  websiteUrl: string,
  query: string
): Promise<ShopifyProduct[]> {
  const baseUrl = normalizeUrl(websiteUrl);
  const products: ShopifyProduct[] = [];

  // Strategy 1: Predictive search API (most Shopify stores support this)
  try {
    const searchUrl = `${baseUrl}/search/suggest.json?q=${encodeURIComponent(query)}&resources[type]=product&resources[limit]=10`;
    console.log(`  🔍 Trying predictive search: "${query}"`);

    const response = await politeFetcher.fetch(searchUrl, {
      headers: {
        'Accept': 'application/json',
      }
    });

    if (response.ok) {
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const data = await response.json();
        const suggestions = data?.resources?.results?.products || [];

        if (suggestions.length > 0) {
          console.log(`  ✅ Predictive search found ${suggestions.length} result(s)`);

          // Fetch full product data for each result via /products/{handle}.json
          for (const suggestion of suggestions) {
            const handle = suggestion.handle || suggestion.url?.split('/products/')[1]?.split('?')[0];
            if (handle) {
              try {
                const productData = await fetchShopifyProductByHandle(baseUrl, handle);
                if (productData) {
                  products.push(productData);
                }
              } catch (e: any) {
                console.warn(`  ⚠️ Failed to fetch product "${handle}":`, e.message);
              }
            }
          }

          if (products.length > 0) {
            return products;
          }
        } else {
          console.log(`  ℹ️ Predictive search returned no results for "${query}"`);
        }
      }
    } else {
      console.log(`  ℹ️ Predictive search not available (${response.status})`);
    }
  } catch (error: any) {
    console.log(`  ℹ️ Predictive search failed:`, error.message);
  }

  // Strategy 2: Collection-based search
  try {
    const collectionUrl = `${baseUrl}/collections/all/products.json?limit=50`;
    console.log(`  🔍 Trying collection search...`);

    const response = await politeFetcher.fetch(collectionUrl, {
      headers: {
        'Accept': 'application/json',
      }
    });

    if (response.ok) {
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const data = await response.json();
        if (data?.products?.length > 0) {
          console.log(`  ✅ Collection search returned ${data.products.length} products`);
          return data.products;
        }
      }
    } else {
      console.log(`  ℹ️ Collection search not available (${response.status})`);
    }
  } catch (error: any) {
    console.log(`  ℹ️ Collection search failed:`, error.message);
  }

  // Strategy 3: HTML search page scraping (works even when JSON APIs are blocked)
  try {
    const searchPageUrl = `${baseUrl}/search?q=${encodeURIComponent(query)}&type=product`;
    console.log(`  🔍 Trying HTML search page: "${query}"`);

    const response = await politeFetcher.fetch(searchPageUrl, {
      headers: {
        'Accept': 'text/html,application/xhtml+xml',
      }
    });

    if (response.ok) {
      const html = await response.text();
      const $ = cheerio.load(html);

      // Extract product handles from search results (links to /products/...)
      const handles = new Set<string>();
      $('a[href*="/products/"]').each((_, el) => {
        const href = $(el).attr('href') || '';
        const match = href.match(/\/products\/([a-z0-9\-]+)/i);
        if (match && match[1] && !['', 'undefined'].includes(match[1])) {
          handles.add(match[1]);
        }
      });

      if (handles.size > 0) {
        console.log(`  ✅ HTML search found ${handles.size} product handle(s)`);
        for (const handle of Array.from(handles).slice(0, 10)) {
          try {
            const productData = await fetchShopifyProductByHandle(baseUrl, handle);
            if (productData) {
              products.push(productData);
            }
          } catch (e: any) {
            console.warn(`  ⚠️ Failed to fetch product "${handle}":`, e.message);
          }
        }

        if (products.length > 0) {
          return products;
        }
      } else {
        console.log(`  ℹ️ HTML search returned no product links`);
      }
    } else {
      console.log(`  ℹ️ HTML search page not available (${response.status})`);
    }
  } catch (error: any) {
    console.log(`  ℹ️ HTML search page failed:`, error.message);
  }

  return products;
}

/**
 * Fetch a single product by its handle from a Shopify store
 */
async function fetchShopifyProductByHandle(
  baseUrl: string,
  handle: string
): Promise<ShopifyProduct | null> {
  try {
    const url = `${baseUrl}/products/${handle}.json`;
    const response = await politeFetcher.fetch(url, {
      headers: {
        'Accept': 'application/json',
      }
    });

    if (!response.ok) {
      return null;
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return null;
    }

    const data = await response.json();
    return data?.product || null;
  } catch {
    return null;
  }
}

/**
 * Fetch all products from a Shopify store
 * Handles pagination (Shopify limit is 250 products per page)
 * NOTE: This is a fallback - prefer searchShopifyProducts() for targeted lookups
 */
export async function fetchAllShopifyProducts(websiteUrl: string): Promise<ShopifyProduct[]> {
  const baseUrl = normalizeUrl(websiteUrl);
  const allProducts: ShopifyProduct[] = [];
  let page = 1;
  const limit = 250; // Shopify max

  console.log(`🔄 Fetching products from ${baseUrl}...`);

  while (true) {
    try {
      const url = `${baseUrl}/products.json?limit=${limit}&page=${page}`;
      const response = await politeFetcher.fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; ShopSyncFlow/1.0)'
        }
      });

      if (!response.ok) {
        if (response.status === 404) {
          // No more pages
          break;
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Verify response is JSON before parsing (some sites return HTML auth walls/redirects)
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        throw new Error(
          `Expected JSON but got ${contentType || 'unknown content-type'} from ${url}`
        );
      }

      const data: ShopifyProductsResponse = await response.json();

      if (!data.products || data.products.length === 0) {
        // No more products
        break;
      }

      allProducts.push(...data.products);
      console.log(`  ✓ Fetched ${data.products.length} products (page ${page})`);

      if (data.products.length < limit) {
        // Last page (partial)
        break;
      }

      page++;
    } catch (error) {
      console.error(`❌ Error fetching page ${page}:`, error);
      throw error;
    }
  }

  console.log(`✅ Total products fetched: ${allProducts.length}`);
  return allProducts;
}

// Product match result with metadata
export interface ProductMatch {
  product: ShopifyProduct;
  matchedBy: 'SKU' | 'Style in Title' | 'Style Variation in Title' | 'Name + Color' | 'Name Only';
  matchedVariation?: string; // Which style number variation matched (if applicable)
  confidence: number; // 1.0 = SKU match, 0.9 = exact style, 0.7 = variation match, etc.
}

/**
 * Search for products using style number variations (multi-match)
 * Returns ALL matching products with match metadata
 */
export async function findShopifyProductMultiMatch(
  websiteUrl: string,
  searchCriteria: {
    styleNumber?: string;
    productName?: string;
    color?: string;
  }
): Promise<ProductMatch[]> {
  console.log('🔍 Multi-match search for product:', searchCriteria);

  // Try search API first (faster, less likely to be blocked)
  let products: ShopifyProduct[] = [];
  const searchQuery = searchCriteria.styleNumber || searchCriteria.productName || '';

  if (searchQuery) {
    console.log('🔍 Trying Shopify search API first...');
    products = await searchShopifyProducts(websiteUrl, searchQuery);

    // If search by style number found nothing and we have a product name, try that too
    if (products.length === 0 && searchCriteria.styleNumber && searchCriteria.productName) {
      console.log('🔍 Style number search returned nothing, trying product name...');
      products = await searchShopifyProducts(websiteUrl, searchCriteria.productName);
    }
  }

  // Try direct handle fetch before expensive full product fetch
  if (products.length === 0 && searchCriteria.styleNumber) {
    console.log('🔍 Trying direct product handle fetch...');
    const baseUrl = normalizeUrl(websiteUrl);
    // Try common handle patterns: style number as-is, lowercased, with hyphens
    const styleLower = searchCriteria.styleNumber.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const handleGuesses = [styleLower];
    // If product name exists, try "product-name-style" pattern
    if (searchCriteria.productName) {
      const nameLower = searchCriteria.productName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      handleGuesses.push(nameLower, `${nameLower}-${styleLower}`);
    }
    for (const handle of handleGuesses) {
      try {
        const productData = await fetchShopifyProductByHandle(baseUrl, handle);
        if (productData) {
          console.log(`  ✅ Direct handle fetch found: "${productData.title}" via handle "${handle}"`);
          products.push(productData);
          break;
        }
      } catch (e: any) {
        // continue to next guess
      }
    }
  }

  // Fall back to full product fetch only if search found nothing
  if (products.length === 0) {
    console.log('🔄 Search API found nothing, falling back to full product fetch...');
    try {
      products = await fetchAllShopifyProducts(websiteUrl);
    } catch (error: any) {
      console.error('❌ Full product fetch also failed:', error.message);
      // Return empty matches instead of throwing
      return [];
    }
  }

  console.log(`📦 Working with ${products.length} products to match against`);
  const matches: ProductMatch[] = [];
  const seenProductIds = new Set<number>(); // Prevent duplicate products

  // Helper to add a match
  const addMatch = (
    product: ShopifyProduct,
    matchedBy: ProductMatch['matchedBy'],
    confidence: number,
    matchedVariation?: string
  ) => {
    if (!seenProductIds.has(product.id)) {
      seenProductIds.add(product.id);
      matches.push({ product, matchedBy, confidence, matchedVariation });
    }
  };

  // Priority 1: SKU match (most reliable, confidence: 1.0)
  if (searchCriteria.styleNumber) {
    console.log(`  🔍 Checking ${products.length} products for SKU containing: "${searchCriteria.styleNumber}"`);
    let checkedCount = 0;
    let skusChecked = 0;

    for (const product of products) {
      checkedCount++;
      const hasSKUMatch = product.variants.some(v => {
        skusChecked++;
        const match = v.sku?.toUpperCase().includes(searchCriteria.styleNumber!.toUpperCase());
        if (match) {
          console.log(`  ✅ SKU MATCH FOUND: "${v.sku}" in product "${product.title}"`);
        }
        return match;
      });
      if (hasSKUMatch) {
        addMatch(product, 'SKU', 1.0, searchCriteria.styleNumber);
      }
    }
    console.log(`  📊 Checked ${checkedCount} products with ${skusChecked} total variants`);
  }

  // Priority 2: Style number variations in title
  if (searchCriteria.styleNumber) {
    const { generateStyleNumberVariations } = await import('../utils/style-number-variations');
    const variations = generateStyleNumberVariations(searchCriteria.styleNumber);

    console.log(`  📋 Generated ${variations.length} style number variations to search`);

    for (const { variation, confidence: variationConfidence } of variations) {
      for (const product of products) {
        if (product.title.toUpperCase().includes(variation)) {
          const matchType = variation === searchCriteria.styleNumber!.toUpperCase()
            ? 'Style in Title'
            : 'Style Variation in Title';

          // Adjust confidence based on variation confidence
          const matchConfidence = matchType === 'Style in Title'
            ? 0.95
            : 0.7 + (variationConfidence * 0.2); // 0.7-0.9 range

          addMatch(product, matchType, matchConfidence, variation);
        }
      }
    }
  }

  // Priority 3: Product name + color match (confidence: 0.85)
  if (searchCriteria.productName && searchCriteria.color) {
    for (const product of products) {
      const titleLower = product.title.toLowerCase();
      const nameLower = searchCriteria.productName.toLowerCase();
      const colorLower = searchCriteria.color.toLowerCase();

      const nameMatch = titleLower.includes(nameLower);
      const colorMatch = titleLower.includes(colorLower) ||
        product.variants.some(v =>
          v.option1?.toLowerCase().includes(colorLower) ||
          v.title.toLowerCase().includes(colorLower)
        );

      if (nameMatch && colorMatch) {
        addMatch(product, 'Name + Color', 0.85);
      }
    }
  }

  // Priority 4: Product name only (fuzzy match, confidence: 0.75)
  if (searchCriteria.productName) {
    for (const product of products) {
      const titleLower = product.title.toLowerCase();
      const nameLower = searchCriteria.productName.toLowerCase();
      if (titleLower.includes(nameLower)) {
        addMatch(product, 'Name Only', 0.75);
      }
    }
  }

  // Sort by confidence (highest first)
  matches.sort((a, b) => b.confidence - a.confidence);

  console.log(`✅ Found ${matches.length} match(es)`);
  if (matches.length > 0) {
    matches.forEach((m, i) => {
      console.log(`  ${i + 1}. "${m.product.title}" (${m.matchedBy}, confidence: ${m.confidence.toFixed(2)}${m.matchedVariation ? `, matched: "${m.matchedVariation}"` : ''})`);
    });
  }

  return matches;
}

/**
 * Search for a product in Shopify store by style number, SKU, or name+color
 * Returns the FIRST (highest confidence) match, or null if no matches
 *
 * NOTE: This is the legacy single-match function. For multi-match with variations,
 * use findShopifyProductMultiMatch() instead.
 */
export async function findShopifyProduct(
  websiteUrl: string,
  searchCriteria: {
    styleNumber?: string;
    productName?: string;
    color?: string;
  }
): Promise<ShopifyProduct | null> {
  console.log('🔍 Searching for product (single match):', searchCriteria);

  const matches = await findShopifyProductMultiMatch(websiteUrl, searchCriteria);

  if (matches.length === 0) {
    console.log('❌ Product not found');
    return null;
  }

  const topMatch = matches[0];
  console.log(`✅ Returning top match: "${topMatch.product.title}" (${topMatch.matchedBy}, confidence: ${topMatch.confidence.toFixed(2)})`);
  return topMatch.product;
}

/**
 * Scrape and enrich product data from Shopify store
 *
 * @param analyzeSizeChart - If true, will analyze size chart images with Vision API (costs API credits)
 */
export async function scrapeShopifyProduct(
  websiteUrl: string,
  searchCriteria: {
    styleNumber: string;
    productName?: string;
    color?: string;
  },
  analyzeSizeChart: boolean = false // Default: don't auto-analyze (save API credits)
): Promise<EnrichedProductData> {
  try {
    const product = await findShopifyProduct(websiteUrl, searchCriteria);

    if (!product) {
      return {
        styleNumber: searchCriteria.styleNumber,
        productName: searchCriteria.productName || '',
        color: searchCriteria.color,
        brandProductUrl: '',
        brandDescription: '',
        features: [],
        images: [],
        variants: [],
        scrapedAt: new Date(),
        scrapingSuccess: false,
        scrapingError: 'Product not found on brand website'
      };
    }

    // Parse HTML description
    const parsedData = parseProductDescription(product.body_html || '');

    // Build product URL
    const productUrl = `${normalizeUrl(websiteUrl)}/products/${product.handle}`;

    // Extract clean description (for AI to use)
    const cleanDescription = extractCleanDescription(product.body_html || '');

    // Map images
    const images = product.images.map((img, index) => ({
      url: img.src,
      width: img.width,
      height: img.height,
      alt: img.alt,
      isPrimary: index === 0
    }));

    // Map variants
    const variants = product.variants.map(v => ({
      sku: v.sku,
      size: v.title,
      price: v.price,
      available: v.available
    }));

    // Check for size chart image on product page
    let sizeChartImageUrl: string | undefined;
    let sizeChartImageAnalysis: EnrichedProductData['sizeChartImageAnalysis'];

    try {
      sizeChartImageUrl = await scrapeSizeChartImageFromProductPage(productUrl) || undefined;

      // If image found and analysis requested, analyze it with Vision API
      if (sizeChartImageUrl && analyzeSizeChart) {
        console.log('🤖 Analyzing size chart image with Gemini Vision API...');
        const { analyzeSizeChartImage } = await import('./gemini-content.service');
        sizeChartImageAnalysis = await analyzeSizeChartImage(sizeChartImageUrl);
        console.log('✅ Size chart image analyzed');
      } else if (sizeChartImageUrl) {
        console.log('ℹ️  Size chart image found but not analyzed (save for later)');
      }
    } catch (sizeChartError) {
      console.warn('⚠️  Failed to detect/analyze size chart image (non-fatal):', sizeChartError);
      // Continue without size chart data
    }

    console.log('✅ Product scraped successfully');

    return {
      styleNumber: searchCriteria.styleNumber,
      productName: product.title,
      color: searchCriteria.color,
      brandProductUrl: productUrl,
      brandProductTitle: product.title, // NEW: Store brand's actual product title
      brandDescription: cleanDescription,
      materialComposition: parsedData.materialComposition,
      careInstructions: parsedData.careInstructions,
      features: parsedData.features,
      images,
      variants,
      sizeChartImageUrl, // NEW: Size chart image URL (if found)
      sizeChartImageAnalysis, // NEW: AI analysis (if requested)
      scrapedAt: new Date(),
      scrapingSuccess: true
    };
  } catch (error) {
    console.error('❌ Scraping failed:', error);

    return {
      styleNumber: searchCriteria.styleNumber,
      productName: searchCriteria.productName || '',
      color: searchCriteria.color,
      brandProductUrl: '',
      brandDescription: '',
      features: [],
      images: [],
      variants: [],
      scrapedAt: new Date(),
      scrapingSuccess: false,
      scrapingError: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Scrape size chart from Shopify store
 * Tries common size chart page URLs
 *
 * Returns both HTML and any size chart images found on the page
 */
export async function scrapeShopifySizeChart(websiteUrl: string): Promise<string | null> {
  const baseUrl = normalizeUrl(websiteUrl);
  const possibleUrls = [
    `${baseUrl}/pages/size-chart`,
    `${baseUrl}/pages/sizing`,
    `${baseUrl}/pages/size-guide`,
    `${baseUrl}/pages/sizing-guide`
  ];

  for (const url of possibleUrls) {
    try {
      const response = await politeFetcher.fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; ShopSyncFlow/1.0)'
        }
      });

      if (response.ok) {
        const html = await response.text();
        console.log(`✅ Size chart found at: ${url}`);
        return html;
      }
    } catch (error) {
      // Continue to next URL
    }
  }

  console.log('❌ No size chart page found');
  return null;
}

/**
 * Extract size chart images from dedicated size chart page HTML
 *
 * Some brands (like Hasta Muerte) use JavaScript apps to display size charts as images.
 * This function finds those images in the HTML.
 */
export function extractSizeChartImagesFromHtml(html: string, baseUrl: string): string[] {
  const $ = cheerio.load(html);
  const imageUrls: string[] = [];

  // Strategy 1: Look for images in size chart specific sections/divs
  $('[class*="size"], [id*="size"], [class*="chart"], [id*="chart"]').find('img').each((i, img) => {
    let src = $(img).attr('src') || $(img).attr('data-src');
    if (src) {
      // Handle relative URLs
      if (src.startsWith('//')) {
        src = 'https:' + src;
      } else if (src.startsWith('/')) {
        src = baseUrl + src;
      }

      // Remove Shopify resize parameters
      src = src.replace(/(_\d+x\d+|_\d+x|_x\d+|_small|_medium|_large|_grande|_compact|_thumb)(\.[a-z]+)$/i, '$2');

      // Exclude common non-size-chart images
      if (!src.includes('logo') && !src.includes('banner') && !src.includes('icon') && !src.includes('favicon')) {
        imageUrls.push(src);
      }
    }
  });

  // Strategy 2: Look for images with size-chart related alt text
  $('img[alt*="size" i], img[alt*="chart" i], img[alt*="fit" i], img[alt*="guide" i]').each((i, img) => {
    let src = $(img).attr('src') || $(img).attr('data-src');
    if (src) {
      if (src.startsWith('//')) {
        src = 'https:' + src;
      } else if (src.startsWith('/')) {
        src = baseUrl + src;
      }
      src = src.replace(/(_\d+x\d+|_\d+x|_x\d+|_small|_medium|_large|_grande|_compact|_thumb)(\.[a-z]+)$/i, '$2');
      if (!imageUrls.includes(src) && !src.includes('logo') && !src.includes('banner')) {
        imageUrls.push(src);
      }
    }
  });

  return imageUrls;
}

// Size chart parsing types
export interface ParsedSizeChart {
  parsedTables: Record<string, string>;
  note: string;
}

/**
 * Supported product categories for size chart detection
 * Derived from Google Shopping Product Taxonomy types
 */
const SUPPORTED_CATEGORIES = Array.from(
  new Set(GOOGLE_APPAREL_CATEGORIES.map(cat => cat.type))
).sort(); // ['Accessories', 'Activewear', 'Bottoms', 'Outerwear', 'Shoes', 'Suits', 'Swimwear', 'Tops', 'Underwear', 'Other']

/**
 * Detect product category from header text
 * Returns standardized category name or null
 * Uses Google Shopping Product Taxonomy types
 */
function detectCategoryFromHeader(headerText: string): string | null {
  const normalized = headerText.trim().toLowerCase();

  // Tops patterns (based on Google Shopping Product Taxonomy + common variants)
  if (
    /\b(tops?|top\s+size|shirts?|t-shirts?|tees?|dress\s*shirts?|polos?|button[\s-]*downs?|henleys?|henley\s*shirts?|tanks?|tank\s*tops?|camisoles?|blouses?|sweaters?|sweatshirts?|crewnecks?|pullovers?|hoodies?|cardigans?|crop\s*tops?|tunics?)\b/i.test(normalized)
  ) {
    return 'Tops';
  }

  // Bottoms patterns (including "BOTTM SIZE" or "BOTTOM SIZE" from EPTM)
  if (
    /\b(bottoms?|bottom\s+size|bottm\s+size|pants?|jeans?|shorts?|trousers?|joggers?)\b/i.test(normalized)
  ) {
    return 'Bottoms';
  }

  // Outerwear patterns
  if (
    /\b(outerwear|jackets?|coats?|blazers?|vests?|parkas?|windbreakers?)\b/i.test(normalized)
  ) {
    return 'Outerwear';
  }

  // Activewear patterns
  if (
    /\b(activewear|athletic|sportswear|workout|gym|performance|track\s*suits?)\b/i.test(normalized)
  ) {
    return 'Activewear';
  }

  // Underwear patterns
  if (
    /\b(underwear|boxers?|briefs?|undershirts?|intimates?)\b/i.test(normalized)
  ) {
    return 'Underwear';
  }

  // Swimwear patterns
  if (
    /\b(swimwear|swim|trunks?|boardshorts?|swim\s*suits?)\b/i.test(normalized)
  ) {
    return 'Swimwear';
  }

  // Suits patterns
  if (
    /\b(suits?|suit\s*jackets?|dress\s*suits?|tuxedos?)\b/i.test(normalized)
  ) {
    return 'Suits';
  }

  // Shoes patterns (replaces Footwear)
  if (
    /\b(shoes?|footwear|sneakers?|boots?|sandals?|slippers?)\b/i.test(normalized)
  ) {
    return 'Shoes';
  }

  // Accessories patterns
  if (
    /\b(accessories|belts?|bags?|wallets?|jewelry|hats?|caps?|beanies?|headwear)\b/i.test(normalized)
  ) {
    return 'Accessories';
  }

  return null;
}

/**
 * Detect product category from product name/description
 * Used when generating product descriptions
 * Uses Google Shopping Product Taxonomy types
 */
export function detectProductCategory(productName: string, description: string = ''): string | null {
  const combined = `${productName} ${description}`.toLowerCase();

  // Try each category pattern (order matters - most specific first)

  // Suits (check before Outerwear since suits can include jackets)
  if (/\b(suit|tuxedo|suit\s*jacket|dress\s*suit)\b/i.test(combined)) {
    return 'Suits';
  }

  // Swimwear
  if (/\b(swim|swimwear|trunks?|boardshorts?|swim\s*suit)\b/i.test(combined)) {
    return 'Swimwear';
  }

  // Underwear
  if (/\b(underwear|boxers?|briefs?|undershirt)\b/i.test(combined)) {
    return 'Underwear';
  }

  // Activewear (check before Tops/Bottoms)
  if (/\b(activewear|athletic|sportswear|workout|gym|performance|track\s*suit)\b/i.test(combined)) {
    return 'Activewear';
  }

  // Bottoms (check BEFORE Tops to avoid "Uptown" matching "top")
  if (/\b(pants?|jeans?|shorts?|trousers?|joggers?|sweatpants?|chinos?|slacks?|leggings?)\b/i.test(combined)) {
    return 'Bottoms';
  }

  // Tops (based on Google Shopping Product Taxonomy + common variants)
  if (/\b(shirt|t-shirt|tee|dress\s*shirt|polo|button[\s-]*down|henley|tank|tank\s*top|camisole|blouse|sweater|sweatshirt|crewneck|pullover|hoodie|cardigan|crop\s*top|tunic|tube\s*top|halter\s*top)\b/i.test(combined)) {
    return 'Tops';
  }

  // Outerwear
  if (/\b(jacket|coat|blazer|vest|parka|windbreaker)\b/i.test(combined)) {
    return 'Outerwear';
  }

  // Shoes
  if (/\b(shoe|sneaker|boot|sandal|slipper|footwear)\b/i.test(combined)) {
    return 'Shoes';
  }

  // Accessories (most general, check last)
  if (/\b(belt|bag|wallet|accessory|hat|cap|beanie|snapback|headwear|jewelry)\b/i.test(combined)) {
    return 'Accessories';
  }

  return null;
}

/**
 * Parse size chart HTML and extract category-specific tables
 *
 * Strategy:
 * 1. Find headers (h2, h3, h4) containing category keywords
 * 2. For each category header, find the next table element
 * 3. Extract and store the table HTML
 * 4. Return structured data with category -> table HTML mapping
 *
 * @param html - Full HTML page from size chart URL
 * @returns Parsed size chart with category-specific tables
 */
export function parseSizeChartHtml(html: string): ParsedSizeChart {
  const $ = cheerio.load(html);
  const parsedTables: Record<string, string> = {};

  console.log('🔍 Parsing size chart HTML...');

  // Strategy 1: Find tables with category headers
  $('h1, h2, h3, h4, h5, h6').each((i, header) => {
    const headerText = $(header).text().trim();
    console.log(`  Found header: "${headerText}"`);

    // Check if header contains a category name
    const category = detectCategoryFromHeader(headerText);
    if (category) {
      console.log(`    ✓ Detected category: ${category}`);

      // Find the next table element after this header
      // Try two strategies:
      // 1. Table as direct sibling
      let table = $(header).nextAll('table').first();

      // 2. Table nested inside following elements (for Hasta Muerte structure)
      if (table.length === 0) {
        table = $(header).nextAll().find('table.sizechart, table').first();
      }

      if (table.length > 0) {
        // Extract table HTML and clean it up
        let tableHtml = $.html(table);

        // Remove any inline styles that might break layout
        tableHtml = tableHtml.replace(/style="[^"]*"/g, '');

        // Add semantic class for styling
        tableHtml = tableHtml.replace('<table', '<table class="size-chart-table"');

        parsedTables[category] = tableHtml;
        console.log(`    ✓ Extracted table for ${category} (${tableHtml.length} chars)`);
      } else {
        console.log(`    ⚠️  No table found after header`);
      }
    }
  });

  // Strategy 2: Look for ANY element (p, strong, span, div) containing category keywords
  $('p, strong, span, div, b').each((i, elem) => {
    const elemText = $(elem).text().trim();

    // Check if this element contains size/category text
    const category = detectCategoryFromHeader(elemText);
    if (category && !parsedTables[category]) {
      // Find the next table after this element
      const table = $(elem).nextAll('table').first();
      if (table.length > 0) {
        let tableHtml = $.html(table);
        tableHtml = tableHtml.replace(/style="[^"]*"/g, '');
        tableHtml = tableHtml.replace('<table', '<table class="size-chart-table"');
        parsedTables[category] = tableHtml;
        console.log(`  ✓ Found ${category} table via ${$(elem).prop('tagName')} element: "${elemText.substring(0, 50)}"`);
      }
    }
  });

  // Strategy 3: Look for tables with data-category or id attributes
  $('table[data-category], table[id*="size"]').each((i, table) => {
    const categoryAttr = $(table).attr('data-category');
    const idAttr = $(table).attr('id');

    if (categoryAttr) {
      const category = detectCategoryFromHeader(categoryAttr);
      if (category && !parsedTables[category]) {
        let tableHtml = $.html(table);
        tableHtml = tableHtml.replace(/style="[^"]*"/g, '');
        tableHtml = tableHtml.replace('<table', '<table class="size-chart-table"');
        parsedTables[category] = tableHtml;
        console.log(`  ✓ Found table via data-category: ${category}`);
      }
    } else if (idAttr) {
      const category = detectCategoryFromHeader(idAttr);
      if (category && !parsedTables[category]) {
        let tableHtml = $.html(table);
        tableHtml = tableHtml.replace(/style="[^"]*"/g, '');
        tableHtml = tableHtml.replace('<table', '<table class="size-chart-table"');
        parsedTables[category] = tableHtml;
        console.log(`  ✓ Found table via id: ${category}`);
      }
    }
  });

  // Strategy 4: Find tables with class="sizechart" and work backwards to find category
  // (for Hasta Muerte where headers are in different table rows)
  if (Object.keys(parsedTables).length === 0) {
    console.log('  ℹ️  No tables found with previous strategies, trying reverse lookup...');

    $('table.sizechart, table').each((i, table) => {
      // Get all text content before this table (within 500 chars)
      const precedingText = $(table).prevAll().text().substring(0, 500);

      // Also check parent elements for headers
      const parentText = $(table).parent().prevAll().text().substring(0, 500);
      const grandparentText = $(table).parent().parent().prevAll().text().substring(0, 500);

      const combinedText = precedingText + ' ' + parentText + ' ' + grandparentText;

      // Look for category keywords in the combined text
      const category = detectCategoryFromHeader(combinedText);

      if (category && !parsedTables[category]) {
        let tableHtml = $.html(table);
        tableHtml = tableHtml.replace(/style="[^"]*"/g, '');
        tableHtml = tableHtml.replace('<table', '<table class="size-chart-table"');
        parsedTables[category] = tableHtml;
        console.log(`  ✓ Found ${category} table via reverse lookup from table content`);
      }
    });
  }

  // Add measurement descriptions to each table
  const parsedTablesWithDescriptions: Record<string, string> = {};
  for (const [category, tableHtml] of Object.entries(parsedTables)) {
    const description = getMeasurementDescription(category);
    parsedTablesWithDescriptions[category] = description + tableHtml;
  }

  const categoryCount = Object.keys(parsedTablesWithDescriptions).length;
  console.log(`✅ Parsing complete: ${categoryCount} category table(s) extracted`);

  return {
    parsedTables: parsedTablesWithDescriptions,
    note: `Parsed ${categoryCount} category table(s) on ${new Date().toISOString().split('T')[0]}`
  };
}

/**
 * Get measurement descriptions for size chart tables
 * Explains what A, B, etc. measurements represent for each category
 */
function getMeasurementDescription(category: string): string {
  const descriptions: Record<string, string> = {
    'Bottoms': `<div style="margin-bottom: 12px; padding: 8px; background-color: #f9fafb; border-left: 3px solid #9333ea; font-size: 0.875rem;">
  <strong>Measurement Guide:</strong><br>
  <strong>A</strong> = Waist (measured flat across at the top of the waistband)<br>
  <strong>B</strong> = Inseam (measured from crotch seam to bottom hem)
</div>`,
    'Tops': `<div style="margin-bottom: 12px; padding: 8px; background-color: #f9fafb; border-left: 3px solid #9333ea; font-size: 0.875rem;">
  <strong>Measurement Guide:</strong><br>
  <strong>A</strong> = Body Length (measured from high point shoulder to bottom hem)<br>
  <strong>B</strong> = Chest Width (measured flat across 1" below armhole)
</div>`,
    'Outerwear': `<div style="margin-bottom: 12px; padding: 8px; background-color: #f9fafb; border-left: 3px solid #9333ea; font-size: 0.875rem;">
  <strong>Measurement Guide:</strong><br>
  <strong>A</strong> = Body Length (measured from high point shoulder to bottom hem)<br>
  <strong>B</strong> = Chest Width (measured flat across 1" below armhole)
</div>`,
    'Headwear': `<div style="margin-bottom: 12px; padding: 8px; background-color: #f9fafb; border-left: 3px solid #9333ea; font-size: 0.875rem;">
  <strong>Measurement Guide:</strong><br>
  Measurements shown are for head circumference
</div>`,
    'Footwear': `<div style="margin-bottom: 12px; padding: 8px; background-color: #f9fafb; border-left: 3px solid #9333ea; font-size: 0.875rem;">
  <strong>Measurement Guide:</strong><br>
  Standard US sizing - refer to brand's conversion chart for international sizes
</div>`,
    'Accessories': `<div style="margin-bottom: 12px; padding: 8px; background-color: #f9fafb; border-left: 3px solid #9333ea; font-size: 0.875rem;">
  <strong>Measurement Guide:</strong><br>
  Measurements vary by accessory type - refer to table for specific dimensions
</div>`
  };

  return descriptions[category] || `<div style="margin-bottom: 12px; padding: 8px; background-color: #f9fafb; border-left: 3px solid #9333ea; font-size: 0.875rem;">
  <strong>Size Chart Measurements:</strong><br>
  All measurements shown in the table below
</div>`;
}

/**
 * Scrape product page for size chart image
 *
 * Some brands (like Hasta Muerte) don't have dedicated size chart pages.
 * Instead, they include size chart images on each product page.
 *
 * @param productUrl - Full URL to product page (e.g., https://brand.com/products/product-handle)
 * @returns URL to size chart image, or null if not found
 */
export async function scrapeSizeChartImageFromProductPage(productUrl: string): Promise<string | null> {
  try {
    console.log(`🔍 Checking product page for size chart image: ${productUrl}`);

    const response = await politeFetcher.fetch(productUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ShopSyncFlow/1.0)'
      }
    });

    if (!response.ok) {
      console.log(`❌ Failed to fetch product page: ${response.status}`);
      return null;
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Strategy 0: ULTIMATE PRIORITY - Use Puppeteer + AI to intelligently find and extract size charts
    // This strategy can click buttons, open modals, navigate pages, and use AI to identify size charts
    if (process.env.SCRAPER_PUPPETEER_ENABLED === '1') {
      console.log('🎭 Strategy 0: Attempting Puppeteer + AI for size chart detection...');
      try {
        const { extractSizeChartWithPuppeteer } = await import('./headless-brand-scraper.service');
        const result = await extractSizeChartWithPuppeteer(productUrl);

        if (result.success && result.sizeChartUrl) {
          console.log(`✅ Strategy 0 (Puppeteer + AI) found size chart: ${result.sizeChartUrl}`);
          console.log(`   Method: ${result.method || 'Interactive detection'}`);
          return result.sizeChartUrl;
        } else {
          console.log(`ℹ️  Strategy 0 (Puppeteer + AI) did not find size chart: ${result.error || 'No size chart detected'}`);
        }
      } catch (headlessError: any) {
        console.log(`⚠️  Strategy 0 (Puppeteer + AI) error: ${headlessError.message}, falling back to Cheerio strategies`);
      }
    } else {
      console.log('ℹ️  Strategy 0 (Puppeteer + AI) disabled (SCRAPER_PUPPETEER_ENABLED != 1)');
    }

    // Strategy 1: PRIORITY - Look for size chart buttons/links and extract modal content
    console.log('🔍 Looking for size chart buttons/modals...');

    // Find buttons/links that might trigger size chart modals
    const sizeChartTriggers = $('a, button').filter((i, elem) => {
      const text = $(elem).text().toLowerCase();
      const href = $(elem).attr('href') || '';
      const className = $(elem).attr('class') || '';
      const id = $(elem).attr('id') || '';
      const ariaLabel = $(elem).attr('aria-label') || '';

      const combined = `${text} ${href} ${className} ${id} ${ariaLabel}`.toLowerCase();

      return (
        (combined.includes('size') && (combined.includes('chart') || combined.includes('guide'))) ||
        combined.includes('sizing') ||
        combined.includes('measurements')
      );
    });

    if (sizeChartTriggers.length > 0) {
      console.log(`✅ Found ${sizeChartTriggers.length} size chart trigger(s)`);

      // Check if trigger has data-target, href, or aria-controls pointing to modal content
      for (let i = 0; i < sizeChartTriggers.length; i++) {
        const trigger = sizeChartTriggers.eq(i);
        const dataTarget = trigger.attr('data-target') || trigger.attr('data-bs-target') || '';
        const ariaControls = trigger.attr('aria-controls') || '';
        const href = trigger.attr('href') || '';

        console.log(`  🔍 Trigger ${i + 1}: text="${trigger.text().trim()}", href="${href}", data-target="${dataTarget}", aria-controls="${ariaControls}"`);

        // Look for modal/popup content
        const modalSelectors = [
          dataTarget,
          ariaControls ? `#${ariaControls}` : '',
          href.startsWith('#') ? href : ''
        ].filter(s => s);

        for (const selector of modalSelectors) {
          const modal = $(selector);
          if (modal.length > 0) {
            console.log(`  ✅ Found modal content: ${selector}`);

            // Look for images within the modal
            const modalImg = modal.find('img').filter((j, img) => {
              const src = $(img).attr('src') || '';
              const alt = $(img).attr('alt') || '';
              const combined = `${src} ${alt}`.toLowerCase();
              const widthAttr = $(img).attr('width');
              const width = widthAttr ? parseInt(widthAttr, 10) : 0;

              return (
                combined.includes('size') ||
                combined.includes('chart') ||
                combined.includes('guide') ||
                combined.includes('fit') ||
                width > 400 // Size charts are usually large images
              );
            }).first();

            if (modalImg.length > 0) {
              let imageUrl = modalImg.attr('src') || '';

              // Handle relative URLs
              if (imageUrl.startsWith('//')) {
                imageUrl = 'https:' + imageUrl;
              } else if (imageUrl.startsWith('/')) {
                const baseUrl = new URL(productUrl);
                imageUrl = baseUrl.origin + imageUrl;
              }

              // Remove Shopify image resize parameters
              imageUrl = imageUrl.replace(/(_\d+x\d+|_\d+x|_x\d+|_small|_medium|_large|_grande|_compact|_thumb)(\.[a-z]+)$/i, '$2');

              console.log(`✅ Size chart image found in modal: ${imageUrl}`);
              return imageUrl;
            }

            // Also check for table-based size charts within modal
            const modalTable = modal.find('table').first();
            if (modalTable.length > 0) {
              console.log(`ℹ️  Found table-based size chart in modal (table extraction not yet implemented)`);
            }
          }
        }
      }
    } else {
      console.log('ℹ️  No size chart buttons/triggers found');
    }

    // Strategy 2: Look for images with "size" in alt text or filename
    let sizeChartImg = $('img').filter((i, img) => {
      const src = $(img).attr('src') || '';
      const alt = $(img).attr('alt') || '';
      const title = $(img).attr('title') || '';

      const combined = `${src} ${alt} ${title}`.toLowerCase();

      return (
        combined.includes('size') &&
        (combined.includes('chart') || combined.includes('guide') || combined.includes('fit'))
      );
    }).first();

    if (sizeChartImg.length > 0) {
      let imageUrl = sizeChartImg.attr('src') || '';

      // Handle relative URLs
      if (imageUrl.startsWith('//')) {
        imageUrl = 'https:' + imageUrl;
      } else if (imageUrl.startsWith('/')) {
        const baseUrl = new URL(productUrl);
        imageUrl = baseUrl.origin + imageUrl;
      }

      // Remove Shopify image resize parameters to get full resolution
      imageUrl = imageUrl.replace(/(_\d+x\d+|_\d+x|_x\d+|_small|_medium|_large|_grande|_compact|_thumb)(\.[a-z]+)$/i, '$2');

      console.log(`✅ Size chart image found: ${imageUrl}`);
      return imageUrl;
    }

    // Strategy 2: Look within "Size & Fit" or similar sections
    const sizeSection = $('div, section').filter((i, elem) => {
      const text = $(elem).text().toLowerCase();
      const className = $(elem).attr('class') || '';
      const id = $(elem).attr('id') || '';

      return (
        text.includes('size') &&
        (text.includes('fit') || text.includes('guide') || text.includes('chart')) &&
        $(elem).find('img').length > 0
      );
    }).first();

    if (sizeSection.length > 0) {
      const img = sizeSection.find('img').first();
      if (img.length > 0) {
        let imageUrl = img.attr('src') || '';

        // Handle relative URLs
        if (imageUrl.startsWith('//')) {
          imageUrl = 'https:' + imageUrl;
        } else if (imageUrl.startsWith('/')) {
          const baseUrl = new URL(productUrl);
          imageUrl = baseUrl.origin + imageUrl;
        }

        // Remove Shopify image resize parameters
        imageUrl = imageUrl.replace(/(_\d+x\d+|_\d+x|_x\d+|_small|_medium|_large|_grande|_compact|_thumb)(\.[a-z]+)$/i, '$2');

        console.log(`✅ Size chart image found in section: ${imageUrl}`);
        return imageUrl;
      }
    }

    // Strategy 3: Look for Shopify metafield images (some brands use these)
    const metafieldImg = $('[data-metafield*="size"], [data-metafield*="chart"]').find('img').first();
    if (metafieldImg.length > 0) {
      let imageUrl = metafieldImg.attr('src') || '';

      if (imageUrl.startsWith('//')) {
        imageUrl = 'https:' + imageUrl;
      } else if (imageUrl.startsWith('/')) {
        const baseUrl = new URL(productUrl);
        imageUrl = baseUrl.origin + imageUrl;
      }

      imageUrl = imageUrl.replace(/(_\d+x\d+|_\d+x|_x\d+|_small|_medium|_large|_grande|_compact|_thumb)(\.[a-z]+)$/i, '$2');

      console.log(`✅ Size chart image found via metafield: ${imageUrl}`);
      return imageUrl;
    }

    console.log('ℹ️  No size chart image found on product page');
    return null;

  } catch (error) {
    console.error('❌ Error scraping product page for size chart image:', error);
    return null;
  }
}

/**
 * Check if product pages have modal-based size charts with tables
 * This is important because modal tables should use Puppeteer extraction (table-based path)
 *
 * @param productUrl - Product URL to check
 * @returns true if modal with table found, false otherwise
 */
async function hasModalSizeChartTable(productUrl: string): Promise<boolean> {
  try {
    const response = await politeFetcher.fetch(productUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ShopSyncFlow/1.0; +https://shopsyncflow.com)',
      },
    });

    if (!response.ok) {
      return false;
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Look for size chart trigger buttons
    const sizeChartTriggers = $('a, button').filter((i, elem) => {
      const text = $(elem).text().toLowerCase();
      const className = $(elem).attr('class') || '';
      const id = $(elem).attr('id') || '';
      const combined = `${text} ${className} ${id}`.toLowerCase();

      return (
        combined.includes('size') &&
        (combined.includes('chart') || combined.includes('guide') || combined.includes('fit'))
      );
    });

    if (sizeChartTriggers.length === 0) {
      return false;
    }

    // Check if trigger has modal content with tables
    for (let i = 0; i < sizeChartTriggers.length; i++) {
      const trigger = sizeChartTriggers.eq(i);
      const dataTarget = trigger.attr('data-target') || trigger.attr('data-bs-target') || '';
      const ariaControls = trigger.attr('aria-controls') || '';
      const href = trigger.attr('href') || '';

      // Look for modal/popup content
      const modalSelectors = [
        dataTarget,
        ariaControls ? `#${ariaControls}` : '',
        href.startsWith('#') ? href : ''
      ].filter(s => s);

      for (const selector of modalSelectors) {
        const modal = $(selector);
        if (modal.length > 0) {
          // Check for table-based size charts within modal
          const modalTable = modal.find('table').first();
          if (modalTable.length > 0) {
            console.log(`✅ Found modal with table-based size chart: ${selector}`);
            return true;
          }
        }
      }
    }

    return false;
  } catch (error) {
    console.error('❌ Error checking for modal size chart table:', error);
    return false;
  }
}

/**
 * Detect whether a brand uses table-based or image-based size charts
 *
 * This function checks:
 * 1. If a dedicated size chart page exists (table-based)
 * 2. If product pages have modal tables (table-based - requires Puppeteer)
 * 3. If product pages have size chart images (image-based)
 *
 * @param websiteUrl - Brand website URL
 * @returns 'table', 'image', or 'none'
 */
export async function detectSizeChartType(websiteUrl: string): Promise<'table' | 'image' | 'none'> {
  console.log(`🔍 Detecting size chart type for: ${websiteUrl}`);

  // Step 1: Check for dedicated size chart page (table-based approach)
  const sizeChartHtml = await scrapeShopifySizeChart(websiteUrl);
  if (sizeChartHtml) {
    const parsedChart = parseSizeChartHtml(sizeChartHtml);
    if (Object.keys(parsedChart.parsedTables).length > 0) {
      console.log('✅ Detected: TABLE-BASED size charts (dedicated page)');
      return 'table';
    } else {
      console.log('❌ No size chart page found');
    }
  } else {
    console.log('❌ No size chart page found');
  }

  // Step 2: Check product pages for modal tables (requires Puppeteer)
  try {
    // Fetch a sample of products to check
    const products = await fetchAllShopifyProducts(websiteUrl);

    if (products.length === 0) {
      console.log('⚠️  No products found to check for size charts');
      return 'none';
    }

    // Check first 3 products for modal tables
    const samplesToCheck = products.slice(0, 3);
    const baseUrl = normalizeUrl(websiteUrl);

    for (const product of samplesToCheck) {
      const productUrl = `${baseUrl}/products/${product.handle}`;

      // Check for modal tables FIRST (before checking for images)
      const hasModalTable = await hasModalSizeChartTable(productUrl);
      if (hasModalTable) {
        console.log('✅ Detected: TABLE-BASED size charts (modal tables on product pages)');
        return 'table';
      }
    }

    // Step 3: Check for image-based size charts (only if no modal tables found)
    for (const product of samplesToCheck) {
      const productUrl = `${baseUrl}/products/${product.handle}`;
      const sizeChartImageUrl = await scrapeSizeChartImageFromProductPage(productUrl);

      if (sizeChartImageUrl) {
        console.log('✅ Detected: IMAGE-BASED size charts (on product pages)');
        return 'image';
      }
    }

    console.log('ℹ️  No size charts detected (neither table nor image)');
    return 'none';

  } catch (error) {
    console.error('❌ Error detecting size chart type:', error);
    return 'none';
  }
}

/**
 * Normalize website URL (remove trailing slash, ensure https)
 */
export function normalizeUrl(url: string): string {
  // Remove trailing slash
  let normalized = url.replace(/\/+$/, '');

  // Ensure https://
  if (!normalized.startsWith('http')) {
    normalized = 'https://' + normalized;
  }

  return normalized;
}
