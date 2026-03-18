import * as cheerio from 'cheerio';
import type { EnrichedProductData } from './shopify-scraper.service';
import { normalizeUrl } from './shopify-scraper.service';
import { extractCleanDescription } from './html-parser.service';
import { PoliteFetcher } from '../utils/polite-fetch.js';

type CheerioAPI = cheerio.CheerioAPI;

const politeFetcher = new PoliteFetcher({
  minDelayMs: Number(process.env.SCRAPER_GENERIC_MIN_DELAY_MS ?? process.env.SCRAPER_MIN_DELAY_MS ?? 2200),
  maxDelayMs: Number(process.env.SCRAPER_GENERIC_MAX_DELAY_MS ?? process.env.SCRAPER_MAX_DELAY_MS ?? 6000),
});

type SearchCriteria = {
  styleNumber: string;
  productName?: string;
  color?: string;
};

/**
 * Attempt to enrich a product from any brand website (Shopify or not) by
 * politely searching for the product page, fetching it, and extracting the
 * relevant metadata. This is a fallback when we cannot rely on Shopify's JSON
 * endpoints.
 */
/**
 * NEW: Find ALL potential matches for a product (for user selection)
 */
export async function findGenericProductMatches(
  websiteUrl: string,
  searchCriteria: SearchCriteria
): Promise<ProductLinkMatch[]> {
  const baseUrl = normalizeUrl(websiteUrl);
  const tokens = buildSearchTokens(searchCriteria);

  // Build smart search queries - hybrid approach for best results
  const queries: string[] = [];

  // Strategy 1: Try style number first (most specific)
  if (searchCriteria.styleNumber) {
    queries.push(searchCriteria.styleNumber);
  }

  // Strategy 2: Try key product words (proven to work on this site)
  // Extract important words from product name
  if (searchCriteria.productName) {
    const productWords = searchCriteria.productName.toLowerCase().split(/\s+/);

    // Look for high-value product type words
    const productTypes = ['crewneck', 'hoodie', 'tee', 'shirt', 'jacket', 'pants', 'shorts', 'fleece'];
    const foundType = productWords.find(word => productTypes.includes(word));

    // Search for brand/style words first (e.g., "Original")
    const firstWord = productWords[0];
    if (firstWord && firstWord.length > 3) {
      queries.push(firstWord);
    }

    // If we found a product type, search for it
    if (foundType) {
      queries.push(foundType);
    }
  }

  // Strategy 3: Try color as a fallback
  if (searchCriteria.color && queries.length < 3) {
    queries.push(searchCriteria.color);
  }

  console.log(`  🔍 Search queries (${queries.length}): [${queries.map(q => `"${q}"`).join(', ')}]`);

  const searchPatterns = [
    (term: string) => `/search?q=${encodeURIComponent(term)}`,
    (term: string) => `/search/${encodeURIComponent(term)}`,
    (term: string) => `/?s=${encodeURIComponent(term)}`,
    (term: string) => `/catalogsearch/result/?q=${encodeURIComponent(term)}`,
  ];

  const allMatches: ProductLinkMatch[] = [];
  const seenUrls = new Set<string>();

  // Try different search queries and patterns
  for (const term of queries.slice(0, 3)) { // Try up to 3 best queries
    for (const pattern of searchPatterns) {
      const url = `${baseUrl}${pattern(term)}`;
      const html = await fetchHtml(url);
      if (!html) continue;

      const matches = extractProductLinks(html, baseUrl, tokens);
      matches.forEach(match => {
        if (!seenUrls.has(match.url)) {
          seenUrls.add(match.url);
          allMatches.push(match);
        }
      });

      // Stop if we found good matches (increased to 20)
      if (allMatches.length >= 20) break;
    }
    if (allMatches.length >= 20) break;
  }

  // Re-sort all matches
  allMatches.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    if (a.isProductLink && !b.isProductLink) return -1;
    if (!a.isProductLink && b.isProductLink) return 1;
    return 0;
  });

  return allMatches.slice(0, 20); // Return top 20 matches
}

/**
 * NEW: Scrape a specific product URL (for after user selection)
 */
export async function scrapeGenericProductByUrl(
  productUrl: string,
  searchCriteria: SearchCriteria
): Promise<EnrichedProductData> {
  try {
    const html = await fetchHtml(productUrl);
    if (!html) {
      return buildFailedResponse(searchCriteria, 'Unable to fetch product page');
    }

    const parsed = parseProductPage(html, productUrl, searchCriteria);
    console.log(`  ✅ Parsed product: "${parsed.title}" from ${productUrl}`);

    return {
      styleNumber: searchCriteria.styleNumber,
      productName: parsed.title || searchCriteria.productName || '',
      color: searchCriteria.color,
      brandProductUrl: productUrl,
      brandProductTitle: parsed.title,
      brandDescription: parsed.description,
      materialComposition: parsed.material,
      careInstructions: parsed.care,
      features: parsed.features,
      images: parsed.images,
      variants: parsed.variants,
      sizeChartImageUrl: parsed.sizeChartImage,
      scrapedAt: new Date(),
      scrapingSuccess: true,
    };
  } catch (error) {
    console.error('❌ Generic scraper failed:', error);
    return buildFailedResponse(
      searchCriteria,
      error instanceof Error ? error.message : 'Unknown scraping error',
    );
  }
}

export async function scrapeGenericProduct(
  websiteUrl: string,
  searchCriteria: SearchCriteria,
): Promise<EnrichedProductData> {
  const baseUrl = normalizeUrl(websiteUrl);
  const tokens = buildSearchTokens(searchCriteria);

  try {
    let productUrl = extractDirectUrlFromCriteria(baseUrl, searchCriteria);

    if (!productUrl) {
      productUrl = await trySlugPaths(baseUrl, tokens);
    }

    if (!productUrl) {
      productUrl = await findProductUrl(baseUrl, tokens);
    }

    if (!productUrl) {
      console.warn('❌ Generic scraper: product link not found for', searchCriteria);
      return buildFailedResponse(searchCriteria, 'Product page not found on brand website');
    }

    const html = await fetchHtml(productUrl);
    if (!html) {
      return buildFailedResponse(searchCriteria, 'Unable to fetch product page');
    }

    const parsed = parseProductPage(html, productUrl, searchCriteria);
    console.log(`  ✅ Parsed product: "${parsed.title}" from ${productUrl}`);

    return {
      styleNumber: searchCriteria.styleNumber,
      productName: parsed.title || searchCriteria.productName || '',
      color: searchCriteria.color,
      brandProductUrl: productUrl,
      brandProductTitle: parsed.title,
      brandDescription: parsed.description,
      materialComposition: parsed.material,
      careInstructions: parsed.care,
      features: parsed.features,
      images: parsed.images,
      variants: parsed.variants,
      sizeChartImageUrl: parsed.sizeChartImage,
      scrapedAt: new Date(),
      scrapingSuccess: true,
    };
  } catch (error) {
    console.error('❌ Generic scraper failed:', error);
    return buildFailedResponse(
      searchCriteria,
      error instanceof Error ? error.message : 'Unknown scraping error',
    );
  }
}

function buildFailedResponse(searchCriteria: SearchCriteria, message: string): EnrichedProductData {
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
    scrapingError: message,
  };
}

export function buildSearchTokens(searchCriteria: SearchCriteria): string[] {
  const tokens = new Set<string>();

  // Style number (keep as-is, don't split)
  if (searchCriteria.styleNumber) {
    tokens.add(searchCriteria.styleNumber.toLowerCase());
  }

  // Product name - SPLIT into individual words for better matching
  if (searchCriteria.productName) {
    const words = searchCriteria.productName.toLowerCase().split(/\s+/);
    words.forEach(word => {
      if (word.length > 2) { // Skip very short words like "of", "in"
        tokens.add(word);
      }
    });
  }

  // Color - SPLIT into individual words
  if (searchCriteria.color) {
    const colorWords = searchCriteria.color.toLowerCase().split(/\s+/);
    colorWords.forEach(word => {
      if (word.length > 2) {
        tokens.add(word);
      }
    });
  }

  const tokenArray = Array.from(tokens).filter(token => token.length > 0);
  console.log(`  🔍 Built search tokens (${tokenArray.length}): [${tokenArray.join(', ')}]`);
  return tokenArray;
}

function extractDirectUrlFromCriteria(baseUrl: string, searchCriteria: SearchCriteria): string | null {
  const candidates = [
    searchCriteria.styleNumber,
    searchCriteria.productName,
    searchCriteria.color,
  ].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    if (/^https?:\/\//i.test(candidate)) {
      return candidate;
    }
    if (candidate.startsWith('/')) {
      return toAbsoluteUrl(baseUrl, candidate);
    }
  }

  return null;
}

async function findProductUrl(baseUrl: string, tokens: string[]): Promise<string | null> {
  const queries = [...tokens];
  const searchPatterns = [
    (term: string) => `/search?q=${encodeURIComponent(term)}`,
    (term: string) => `/search/${encodeURIComponent(term)}`,
    (term: string) => `/?s=${encodeURIComponent(term)}`,
    (term: string) => `/catalogsearch/result/?q=${encodeURIComponent(term)}`,
  ];

  for (const term of queries) {
    for (const pattern of searchPatterns) {
      const url = `${baseUrl}${pattern(term)}`;
      const html = await fetchHtml(url);
      if (!html) continue;

      const candidate = extractProductLink(html, baseUrl, tokens);
      if (candidate) {
        return candidate;
      }
    }
  }

  // As a last resort, try hitting the homepage and searching there
  const homepageHtml = await fetchHtml(baseUrl);
  if (homepageHtml) {
    const candidate = extractProductLink(homepageHtml, baseUrl, tokens);
    if (candidate) {
      return candidate;
    }
  }

  return null;
}

async function trySlugPaths(baseUrl: string, tokens: string[]): Promise<string | null> {
  const slugTokens = tokens
    .filter(token => /^[a-z0-9-]+$/i.test(token))
    .slice(0, 3);

  const prefixes = ['/products/', '/product/', '/collections/all/products/', '/'];

  for (const token of slugTokens) {
    for (const prefix of prefixes) {
      const url = `${baseUrl}${normalizePath(prefix)}${token}`.replace(/([^:]\/)\/+/g, '$1');
      const html = await fetchHtml(url);
      if (!html) continue;

      if (isLikelyProductPage(html)) {
        console.log(`  🎯 Slug match found: ${url} (token: "${token}", prefix: "${prefix}")`);
        return url;
      }
    }
  }

  return null;
}

function normalizePath(path: string): string {
  if (path.endsWith('/')) return path;
  return `${path}/`;
}

function isLikelyProductPage(html: string): boolean {
  const $ = cheerio.load(html);
  const title = $('title').text().trim();
  const hasPrice = /\$\s?\d/.test(html);
  const hasAddToCart = $('button').filter((_idx, el) => $(el as any).text().toLowerCase().includes('add to cart')).length > 0;
  const ogType = $('meta[property="og:type"]').attr('content')?.toLowerCase() ?? '';
  const hasStructuredData = $('script[type="application/ld+json"]').toArray().some(script => {
    try {
      const raw = $(script as any).contents().text();
      if (!raw) return false;
      const data = JSON.parse(raw);
      const types = Array.isArray(data) ? data : [data];
      return types.some(entry => {
        const type = entry['@type'];
        if (!type) return false;
        const typeValues = Array.isArray(type) ? type : [type];
        return typeValues.some((value: string) => typeof value === 'string' && value.toLowerCase().includes('product'));
      });
    } catch {
      return false;
    }
  });

  const isProductOg = ogType.includes('product');

  return title.length > 5 && (hasPrice || hasAddToCart || (hasStructuredData && isProductOg));
}

function extractProductLink(html: string, baseUrl: string, tokens: string[]): string | null {
  const $ = cheerio.load(html);
  let bestMatch: { href: string; score: number } | null = null;
  let bestProductMatch: { href: string; score: number } | null = null;

  $('a[href]').each((_idx: number, element: unknown) => {
    const href = $(element as any).attr('href') || '';
    const text = $(element as any).text().trim().toLowerCase();
    if (!href || href.startsWith('#')) return;

    // Skip obvious navigation/menu links
    const parentClasses = ($(element as any).parent().attr('class') || '').toLowerCase();
    if (parentClasses.includes('nav') || parentClasses.includes('menu')) {
      return;
    }

    const combined = `${text} ${href.toLowerCase()}`;
    let score = 0;
    tokens.forEach(token => {
      if (combined.includes(token)) {
        score += 1;
      }
    });

    const isProductLink = /\/(product|products)\//.test(href) || /\.html(\?|$)/.test(href);
    if (isProductLink) {
      score += 3;
    }
    if (href.includes('search')) {
      score -= 0.5;
    }

    if (score > 0) {
      if (isProductLink) {
        if (!bestProductMatch || score > bestProductMatch.score) {
          bestProductMatch = { href, score };
        }
      } else if (!bestMatch || score > bestMatch.score) {
        bestMatch = { href, score };
      }
    }
  });

  if (bestProductMatch) {
    const { href, score } = bestProductMatch;
    console.log(`  🎯 Best product match: ${href} (score: ${score}, tokens: [${tokens.join(', ')}])`);
    return toAbsoluteUrl(baseUrl, href);
  }

  if (bestMatch) {
    const { href, score } = bestMatch;
    console.log(`  🎯 Best match: ${href} (score: ${score}, tokens: [${tokens.join(', ')}])`);
    return toAbsoluteUrl(baseUrl, href);
  }

  // Try reading structured data (JSON-LD) from the page
  const $json = cheerio.load(html);
  const productFromJson = extractProductUrlFromJsonLd($json, baseUrl, tokens);
  return productFromJson;
}

function extractProductUrlFromJsonLd($: CheerioAPI, baseUrl: string, tokens: string[]): string | null {
  const scripts = $('script[type="application/ld+json"]').toArray();

  for (const script of scripts) {
    try {
      const raw = $(script).contents().text();
      if (!raw) continue;

      const data = JSON.parse(raw);
      const candidates = Array.isArray(data) ? data : [data];

      for (const candidate of candidates) {
        const type = Array.isArray(candidate['@type']) ? candidate['@type'] : [candidate['@type']];
        if (!type.some((t: string) => typeof t === 'string' && t.toLowerCase().includes('product'))) {
          continue;
        }

        const name = (candidate.name || '').toLowerCase();
        const url = candidate.url || candidate['@id'];
        if (!url) continue;

        const matches = tokens.every(token => name.includes(token) || url.toLowerCase().includes(token));
        if (matches) {
          return toAbsoluteUrl(baseUrl, url);
        }
      }
    } catch (_error) {
      // Ignore malformed JSON-LD
    }
  }

  return null;
}

/**
 * NEW: Extract ALL product links from search results page (not just best match)
 * Returns multiple candidates for user selection
 */
export interface ProductLinkMatch {
  url: string;
  title: string;
  score: number;
  matchedTokens: string[];
  imageUrl: string | null;
  isProductLink: boolean;
}

function extractProductLinks(html: string, baseUrl: string, tokens: string[]): ProductLinkMatch[] {
  const $ = cheerio.load(html);

  // Use Map to track matches by normalized URL, allows updating titles
  const matchMap = new Map<string, ProductLinkMatch>();

  $('a[href]').each((_idx: number, element: unknown) => {
    const href = $(element as any).attr('href') || '';
    const text = $(element as any).text().trim();
    if (!href || href.startsWith('#')) return;

    // Skip obvious navigation/menu links
    const parentClasses = ($(element as any).parent().attr('class') || '').toLowerCase();
    if (parentClasses.includes('nav') || parentClasses.includes('menu')) {
      return;
    }

    const combined = `${text} ${href.toLowerCase()}`.toLowerCase();
    let score = 0;
    const matchedTokens: string[] = [];

    tokens.forEach(token => {
      if (combined.includes(token.toLowerCase())) {
        score += 1;
        matchedTokens.push(token);
      }
    });

    const isProductLink = /\/(product|products)\//.test(href) || /\.html(\?|$)/.test(href);
    if (isProductLink) {
      score += 3; // Bonus for product-like URLs
    }
    if (href.includes('search')) {
      score -= 0.5; // Penalty for search links
    }

    // Only include links with at least some match
    if (score > 0) {
      const absoluteUrl = toAbsoluteUrl(baseUrl, href);

      // Normalize URL for duplicate detection (remove query params and fragments)
      const normalizedUrl = absoluteUrl.split('?')[0].split('#')[0];

      // Check if we already have this URL
      const existing = matchMap.get(normalizedUrl);

      // Skip if we already have this URL with a better title
      if (existing && existing.title !== 'Untitled Product') return;

      // Try to find an image for this product
      const $parent = $(element as any).closest('div, article, li, .product-item, .product-card');
      let imageUrl: string | null = null;

      $parent.find('img').each((_i, img) => {
        if (!imageUrl) {
          const src = $(img).attr('src') || $(img).attr('data-src');
          if (src && !src.includes('placeholder') && !src.includes('logo')) {
            imageUrl = toAbsoluteUrl(baseUrl, src);
          }
        }
      });

      // Store or update match (prefer entries with actual titles)
      matchMap.set(normalizedUrl, {
        url: normalizedUrl, // Use normalized URL (no query params) to avoid duplicates
        title: text || 'Untitled Product',
        score,
        matchedTokens,
        imageUrl: imageUrl || (existing?.imageUrl ?? null), // Keep existing image if no new one
        isProductLink
      });
    }
  });

  // Convert map to array
  const matches = Array.from(matchMap.values());

  // Sort by score (highest first), then by isProductLink status
  matches.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    if (a.isProductLink && !b.isProductLink) return -1;
    if (!a.isProductLink && b.isProductLink) return 1;
    return 0;
  });

  console.log(`  🔍 Found ${matches.length} potential product links (tokens: [${tokens.join(', ')}])`);
  matches.slice(0, 5).forEach((m, i) => {
    console.log(`    ${i + 1}. "${m.title.substring(0, 50)}" (score: ${m.score}, ${m.isProductLink ? 'PRODUCT' : 'generic'} link)`);
  });

  return matches;
}

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const response = await politeFetcher.fetch(url);
    if (!response.ok) {
      console.warn(`⚠️  Request to ${url} returned ${response.status}`);
      return null;
    }

    return await response.text();
  } catch (error) {
    console.warn(`⚠️  Failed to fetch ${url}:`, error);
    return null;
  }
}

function parseProductPage(html: string, productUrl: string, searchCriteria: SearchCriteria) {
  const $ = cheerio.load(html);

  const title =
    $('meta[property="og:title"]').attr('content') ||
    $('meta[name="twitter:title"]').attr('content') ||
    $('h1').first().text().trim() ||
    searchCriteria.productName ||
    '';

  const descriptionHtml = findDescriptionHtml($);
  const metaDescription =
    $('meta[property="og:description"]').attr('content') ||
    $('meta[name="description"]').attr('content') ||
    '';

  const cleanDescription = extractCleanDescription(descriptionHtml || metaDescription || '');
  const fullText = `${cleanDescription} ${metaDescription}`.trim();

  const features = extractFeatureList($, descriptionHtml);
  const images = extractImages($, productUrl);
  const variants = extractVariantsFromJsonLd($);
  const sizeChartImage = findSizeChartImage($, productUrl);

  const material = extractPattern(fullText, /(material|fabric|composition)[^:]{0,40}:\s*([^\n\.]+)/i);
  const care = extractPattern(fullText, /(care|wash|cleaning)[^:]{0,40}:\s*([^\n\.]+)/i);

  return {
    title,
    description: cleanDescription || metaDescription,
    features,
    images,
    variants,
    material,
    care,
    sizeChartImage,
  };
}

function findDescriptionHtml($: CheerioAPI): string | undefined {
  const selectors = [
    '[data-product-description]',
    '.product-description',
    '.product__description',
    '#product-description',
    '#description',
    '.description',
    '.product-details',
    '.product-information',
    'article.product',
    'section.product__info-container',
  ];

  for (const selector of selectors) {
    const html = $(selector).first().html();
    if (html && html.trim().length > 40) {
      return html;
    }
  }

  return undefined;
}

function extractFeatureList($: CheerioAPI, descriptionHtml?: string): string[] {
  const features = new Set<string>();
  const addFeature = (value: string | undefined) => {
    const normalized = (value || '').replace(/\s+/g, ' ').trim();
    if (normalized.length > 0 && normalized.length < 180) {
      features.add(normalized);
    }
  };

  if (descriptionHtml) {
    const scoped = cheerio.load(descriptionHtml);
    scoped('li').each((_idx: number, el: unknown) => addFeature(scoped(el as any).text()));
  }

  const selectors = ['main li', '.product-description li', '#description li'];
  selectors.forEach(selector => {
    $(selector).each((_idx: number, el: unknown) => addFeature($(el as any).text()));
  });

  if (features.size === 0) {
    $('li').each((_idx: number, el: unknown) => addFeature($(el as any).text()));
  }

  return Array.from(features).slice(0, 10);
}

function extractImages($: CheerioAPI, productUrl: string) {
  const imageSet = new Set<string>();

  const pushImage = (url?: string) => {
    if (!url) return;
    imageSet.add(toAbsoluteUrl(productUrl, url));
  };

  pushImage($('meta[property="og:image"]').attr('content'));
  pushImage($('meta[name="twitter:image"]').attr('content'));

  $('img').each((_idx: number, img: unknown) => {
    const src =
      $(img as any).attr('src') ||
      $(img as any).attr('data-src') ||
      $(img as any).attr('data-srcset')?.split(' ')[0];
    if (!src) return;

    const alt = ($(img as any).attr('alt') || '').toLowerCase();
    if (alt.includes('logo') || alt.includes('icon')) {
      return;
    }

    pushImage(src);
  });

  const images = Array.from(imageSet).slice(0, 8);

  return images.map((url, index) => ({
    url,
    width: 0,
    height: 0,
    isPrimary: index === 0,
  }));
}

function extractVariantsFromJsonLd($: CheerioAPI) {
  const variants: EnrichedProductData['variants'] = [];

  $('script[type="application/ld+json"]').each((_idx: number, el: unknown) => {
    try {
      const raw = $(el as any).contents().text();
      if (!raw) return;
      const data = JSON.parse(raw);
      const candidates = Array.isArray(data) ? data : [data];

      candidates.forEach(candidate => {
        const type = Array.isArray(candidate['@type']) ? candidate['@type'] : [candidate['@type']];
        if (!type.some((t: string) => typeof t === 'string' && t.toLowerCase().includes('product'))) {
          return;
        }

        const offers = Array.isArray(candidate.offers)
          ? candidate.offers
          : candidate.offers
            ? [candidate.offers]
            : [];

        offers.forEach((offer: any) => {
          variants.push({
            sku: offer.sku || offer.skuId || null,
            size: (offer.size || offer.name || '').toString(),
            price: offer.price?.toString() || offer.priceSpecification?.price?.toString() || '',
            available: offer.availability ? !/outofstock/i.test(offer.availability) : true,
          });
        });
      });
    } catch (_error) {
      // Ignore malformed script blocks
    }
  });

  return variants;
}

function findSizeChartImage($: CheerioAPI, productUrl: string): string | undefined {
  const candidates = $('img')
    .filter((_idx: number, img: unknown) => {
      const src = ($(img as any).attr('src') || '').toLowerCase();
      const alt = ($(img as any).attr('alt') || '').toLowerCase();
      return (
        (src.includes('size') || alt.includes('size')) &&
        (src.includes('chart') || alt.includes('chart') || src.includes('guide') || alt.includes('guide'))
      );
    })
    .toArray();

  if (candidates.length === 0) return undefined;

  const src = $(candidates[0] as any).attr('src');
  return src ? toAbsoluteUrl(productUrl, src) : undefined;
}

function extractPattern(text: string, pattern: RegExp): string | undefined {
  const match = pattern.exec(text);
  if (match && match[2]) {
    return match[2].trim();
  }
  return undefined;
}

function toAbsoluteUrl(baseUrl: string, href: string): string {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return href;
  }
}
