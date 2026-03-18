/**
 * Headless Browser Product Scraper
 *
 * Uses Puppeteer with stealth plugin to scrape JavaScript-heavy SPAs
 * and sites with bot detection. Serves as Layer 3 fallback in the
 * scraping cascade.
 */

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import type { Browser, Page } from 'puppeteer';
import type { EnrichedProductData } from './shopify-scraper.service';
import { normalizeUrl } from './shopify-scraper.service';
import { setTimeout as sleep } from 'node:timers/promises';

// Enable stealth mode to avoid bot detection
puppeteer.use(StealthPlugin());

/**
 * Product-specific CSS selectors for extraction
 */
export interface ProductSelectors {
  title?: string[];
  price?: string[];
  description?: string[];
  images?: string[];
  features?: string[];
  material?: string[];
  care?: string[];
  sizeChart?: string[];
}

/**
 * Search criteria for finding products
 */
interface SearchCriteria {
  styleNumber: string;
  productName?: string;
  color?: string;
}

/**
 * Options for headless scraping
 */
interface HeadlessOptions {
  selectors?: ProductSelectors;
  timeout?: number; // milliseconds
  headless?: boolean; // true = headless mode
  waitForSelectors?: string[]; // CSS selectors to wait for before extracting
}

/**
 * Generic CSS selectors to try when vendor-specific selectors aren't available
 */
const GENERIC_SELECTORS: ProductSelectors = {
  title: [
    'h1.product-title',
    'h1.product-name',
    'h1[data-product-title]',
    '[itemprop="name"]',
    'h1',
    '.product-title',
    '.product-name',
    '[data-product-name]',
  ],
  price: [
    '.price',
    '.product-price',
    '[data-product-price]',
    '[itemprop="price"]',
    '.price-sales',
    '.product-pricing .value',
    'span.money',
  ],
  description: [
    '.product-description',
    '#product-content',
    '[data-product-description]',
    '[itemprop="description"]',
    '.description',
    '.product-details',
    '.product-accordion__panel-inner',
  ],
  images: [
    '.product-images img[src]',
    '.product-gallery img[src]',
    '[data-product-image]',
    'img[itemprop="image"]',
    'main img[src]',
    '.product-image img',
    '[data-product-images] img',
  ],
  features: [
    '.features li',
    '.product-features li',
    '[data-features] li',
    '.specs li',
    '.product-details li',
    'ul.features li',
  ],
  material: [
    '.material',
    '.composition',
    '[data-material]',
    '.product-material',
    '.fabric-content',
  ],
  care: [
    '.care-instructions',
    '.care',
    '[data-care]',
    '.product-care',
    '.washing-instructions',
  ],
  sizeChart: [
    'img[alt*="size" i]',
    'img[alt*="chart" i]',
    '[data-size-chart] img',
    '.size-chart img',
  ],
};

// Browser resource management
let activeBrowsers = 0;
const MAX_CONCURRENT = parseInt(process.env.SCRAPER_MAX_CONCURRENT_BROWSERS || '3', 10);

/**
 * Acquire slot for browser instance (prevents memory overload)
 */
async function acquireBrowserSlot(): Promise<void> {
  while (activeBrowsers >= MAX_CONCURRENT) {
    console.log(`⏳ Waiting for browser slot (${activeBrowsers}/${MAX_CONCURRENT} active)...`);
    await sleep(1000);
  }
  activeBrowsers++;
  console.log(`✅ Browser slot acquired (${activeBrowsers}/${MAX_CONCURRENT} active)`);
}

/**
 * Release browser slot
 */
function releaseBrowserSlot(): void {
  activeBrowsers = Math.max(0, activeBrowsers - 1);
  console.log(`📉 Browser slot released (${activeBrowsers}/${MAX_CONCURRENT} active)`);
}

/**
 * Scrape product data using headless browser
 *
 * @param websiteUrl - Base URL of the website
 * @param searchCriteria - Product search criteria (style number, name, color)
 * @param options - Scraping options (selectors, timeout, etc.)
 * @returns Promise with enriched product data
 */
export async function scrapeHeadlessProduct(
  websiteUrl: string,
  searchCriteria: SearchCriteria,
  options?: HeadlessOptions
): Promise<EnrichedProductData> {
  const startTime = Date.now();
  let browser: Browser | null = null;

  try {
    // Wait for available browser slot
    await acquireBrowserSlot();

    const baseUrl = normalizeUrl(websiteUrl);
    const productUrl = await constructProductUrl(baseUrl, searchCriteria);

    console.log(`🌐 Starting headless scrape: ${productUrl}`);

    // Launch browser with stealth configuration
    browser = await puppeteer.launch({
      headless: options?.headless !== false,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
        '--window-size=1280,800',
      ],
      defaultViewport: {
        width: 1280,
        height: 800,
      },
    });

    const page = await browser.newPage();

    // Set realistic browser headers
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'Referer': 'https://www.google.com/',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
    });

    // Navigate to product page
    const timeout = options?.timeout || parseInt(process.env.SCRAPER_HEADLESS_TIMEOUT || '30000', 10);
    console.log(`⏱️  Navigating to page (timeout: ${timeout}ms)...`);

    await page.goto(productUrl, {
      waitUntil: 'networkidle2',
      timeout,
    });

    console.log(`✅ Page loaded: ${page.url()}`);

    // Wait for content to render (SPAs need time)
    await sleep(2000);

    // Wait for specific selectors if provided
    if (options?.waitForSelectors && options.waitForSelectors.length > 0) {
      for (const selector of options.waitForSelectors) {
        try {
          await page.waitForSelector(selector, { timeout: 5000 });
          console.log(`✅ Found selector: ${selector}`);
          break; // Found one, continue
        } catch {
          console.log(`⚠️  Selector not found: ${selector}`);
        }
      }
    }

    // Extract product data
    const selectors = mergeSelectors(options?.selectors);
    const extractedData = await extractProductData(page, selectors, searchCriteria);

    // Check if we got meaningful data
    if (!extractedData.brandProductTitle && extractedData.images.length === 0) {
      throw new Error('No product data found on page - possible blocking or wrong URL');
    }

    const duration = Date.now() - startTime;
    console.log(`✅ Headless scraping succeeded in ${duration}ms`);

    // Convert string URLs to image objects (required by EnrichedProductData interface)
    const imageObjects = extractedData.images.map(url => ({
      url,
      width: 0, // Unknown from headless scrape
      height: 0, // Unknown from headless scrape
      isPrimary: false,
    }));

    return {
      styleNumber: searchCriteria.styleNumber,
      productName: searchCriteria.productName || extractedData.brandProductTitle || '',
      color: searchCriteria.color,
      brandProductUrl: page.url(),
      brandProductTitle: extractedData.brandProductTitle,
      brandDescription: extractedData.brandDescription || '',
      materialComposition: extractedData.materialComposition,
      careInstructions: extractedData.careInstructions,
      features: extractedData.features,
      images: imageObjects,
      variants: [], // Not extracted by headless scraper yet
      sizeChartImageUrl: extractedData.sizeChartImageUrl,
      scrapedAt: new Date(),
      scrapingSuccess: true,
    };

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`❌ Headless scraping failed after ${duration}ms:`, error);

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
      scrapingError: error instanceof Error ? error.message : 'Unknown headless scraping error',
    };

  } finally {
    // CRITICAL: Always close browser to prevent memory leaks
    if (browser) {
      try {
        await browser.close();
        console.log('🔒 Browser closed successfully');
      } catch (closeError) {
        console.error('⚠️  Failed to close browser:', closeError);
      }
    }
    releaseBrowserSlot();
  }
}

/**
 * Extract product data from page using CSS selectors
 */
async function extractProductData(
  page: Page,
  selectors: ProductSelectors,
  searchCriteria: SearchCriteria
): Promise<{
  brandProductTitle?: string;
  brandDescription?: string;
  materialComposition?: string;
  careInstructions?: string;
  features: string[];
  images: string[];
  sizeChartImageUrl?: string;
}> {
  console.log('🔍 Extracting product data...');

  // Helper: Try multiple selectors until one works
  const extractText = async (selectorList: string[] | undefined, label: string): Promise<string> => {
    if (!selectorList || selectorList.length === 0) return '';

    for (const selector of selectorList) {
      try {
        const text = await page.$eval(selector, el => el.textContent?.trim() || '');
        if (text) {
          console.log(`  ✅ ${label}: Found via "${selector}"`);
          return text;
        }
      } catch {
        // Selector not found, try next
      }
    }

    console.log(`  ⚠️  ${label}: No data found`);
    return '';
  };

  // Helper: Extract multiple list items
  const extractList = async (selectorList: string[] | undefined, label: string): Promise<string[]> => {
    if (!selectorList || selectorList.length === 0) return [];

    for (const selector of selectorList) {
      try {
        const items = await page.$$eval(selector, elements =>
          elements
            .map(el => el.textContent?.trim())
            .filter((text): text is string => !!text && text.length > 0)
        );
        if (items.length > 0) {
          console.log(`  ✅ ${label}: Found ${items.length} item(s) via "${selector}"`);
          return items;
        }
      } catch {
        // Selector not found, try next
      }
    }

    console.log(`  ⚠️  ${label}: No data found`);
    return [];
  };

  // Helper: Extract image URLs
  const extractImages = async (selectorList: string[] | undefined): Promise<string[]> => {
    if (!selectorList || selectorList.length === 0) return [];

    for (const selector of selectorList) {
      try {
        const images = await page.$$eval(selector, imgs =>
          imgs
            .map(img => (img as HTMLImageElement).src)
            .filter(src =>
              src &&
              src.startsWith('http') &&
              !src.includes('placeholder') &&
              !src.includes('data:image') &&
              !src.includes('loading') &&
              !src.includes('spinner')
            )
        );

        if (images.length > 0) {
          console.log(`  ✅ Images: Found ${images.length} image(s) via "${selector}"`);
          // Remove duplicates
          return Array.from(new Set(images));
        }
      } catch {
        // Selector not found, try next
      }
    }

    console.log(`  ⚠️  Images: No images found`);
    return [];
  };

  // Extract all data
  const title = await extractText(selectors.title, 'Title');
  const description = await extractText(selectors.description, 'Description');
  const material = await extractText(selectors.material, 'Material');
  const care = await extractText(selectors.care, 'Care');
  const features = await extractList(selectors.features, 'Features');
  const images = await extractImages(selectors.images);
  const sizeChartImages = await extractImages(selectors.sizeChart);

  // Try to find material and care in description if not found separately
  let materialComposition = material;
  let careInstructions = care;

  if (!materialComposition && description) {
    const materialMatch = description.match(/material[:\s]+([^.]+)/i);
    if (materialMatch) materialComposition = materialMatch[1].trim();
  }

  if (!careInstructions && description) {
    const careMatch = description.match(/care[:\s]+([^.]+)/i);
    if (careMatch) careInstructions = careMatch[1].trim();
  }

  return {
    brandProductTitle: title,
    brandDescription: description,
    materialComposition,
    careInstructions,
    features,
    images,
    sizeChartImageUrl: sizeChartImages.length > 0 ? sizeChartImages[0] : undefined,
  };
}

/**
 * Construct product URL from search criteria
 */
async function constructProductUrl(
  baseUrl: string,
  searchCriteria: SearchCriteria
): Promise<string> {
  // Try common URL patterns
  const slug = searchCriteria.styleNumber
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  // Common e-commerce URL patterns
  const patterns = [
    `${baseUrl}/products/${slug}`,
    `${baseUrl}/product/${slug}`,
    `${baseUrl}/p/${slug}`,
    `${baseUrl}/item/${slug}`,
    `${baseUrl}/${slug}`,
  ];

  // For now, return the most common pattern
  // In future, could HEAD request each to find valid one
  return patterns[0];
}

/**
 * Merge custom selectors with generic fallbacks
 */
function mergeSelectors(customSelectors?: ProductSelectors): ProductSelectors {
  if (!customSelectors) return GENERIC_SELECTORS;

  return {
    title: [...(customSelectors.title || []), ...GENERIC_SELECTORS.title!],
    price: [...(customSelectors.price || []), ...GENERIC_SELECTORS.price!],
    description: [...(customSelectors.description || []), ...GENERIC_SELECTORS.description!],
    images: [...(customSelectors.images || []), ...GENERIC_SELECTORS.images!],
    features: [...(customSelectors.features || []), ...GENERIC_SELECTORS.features!],
    material: [...(customSelectors.material || []), ...GENERIC_SELECTORS.material!],
    care: [...(customSelectors.care || []), ...GENERIC_SELECTORS.care!],
    sizeChart: [...(customSelectors.sizeChart || []), ...GENERIC_SELECTORS.sizeChart!],
  };
}

/**
 * Get current browser pool status (for monitoring)
 */
export function getBrowserPoolStatus() {
  return {
    activeBrowsers,
    maxConcurrent: MAX_CONCURRENT,
    availableSlots: MAX_CONCURRENT - activeBrowsers,
  };
}

/**
 * Extract size chart from product page using Puppeteer + AI
 *
 * This function uses browser automation to:
 * 1. Load the product page
 * 2. Look for size chart buttons/links
 * 3. Click them to reveal modals/hidden content
 * 4. Extract size chart images from modals or separate pages
 * 5. Use AI to verify the image is actually a size chart (not a product image)
 *
 * @param productUrl - Full URL to product page
 * @returns URL to size chart image, or null if not found
 */
export async function extractSizeChartWithPuppeteer(productUrl: string): Promise<{
  success: boolean;
  sizeChartUrl?: string;
  method?: string;
  error?: string;
}> {
  const startTime = Date.now();
  let browser: Browser | null = null;

  try {
    // Wait for available browser slot
    await acquireBrowserSlot();

    console.log(`🎭 Starting Puppeteer size chart extraction: ${productUrl}`);

    // Launch browser with stealth configuration
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
        '--window-size=1280,800',
      ],
      defaultViewport: {
        width: 1280,
        height: 800,
      },
    });

    const page = await browser.newPage();

    // Set realistic browser headers
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'Referer': 'https://www.google.com/',
    });

    // Navigate to product page
    console.log(`⏱️  Navigating to product page...`);
    await page.goto(productUrl, {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });

    console.log(`✅ Page loaded: ${page.url()}`);

    // Wait for page to fully render
    await sleep(2000);

    // Strategy 1: Look for size chart buttons/links and click them
    console.log('🔍 Looking for size chart buttons/links...');

    const sizeChartButton = await page.evaluate(() => {
      // Find all clickable elements (buttons, links, divs with onclick)
      const elements = Array.from(document.querySelectorAll('a, button, [onclick], [data-modal], [data-target]'));

      // Filter for elements that likely trigger size chart modals
      for (const elem of elements) {
        const text = elem.textContent?.toLowerCase() || '';
        const href = elem.getAttribute('href') || '';
        const className = elem.getAttribute('class') || '';
        const id = elem.getAttribute('id') || '';
        const ariaLabel = elem.getAttribute('aria-label') || '';
        const dataTarget = elem.getAttribute('data-target') || elem.getAttribute('data-bs-target') || '';

        const combined = `${text} ${href} ${className} ${id} ${ariaLabel} ${dataTarget}`.toLowerCase();

        if (
          (combined.includes('size') && (combined.includes('chart') || combined.includes('guide'))) ||
          combined.includes('sizing') ||
          combined.includes('measurements')
        ) {
          return {
            selector: elem.tagName.toLowerCase() +
                     (elem.id ? `#${elem.id}` : '') +
                     (elem.className ? `.${elem.className.split(' ')[0]}` : ''),
            text: text.trim(),
            href,
            dataTarget
          };
        }
      }
      return null;
    });

    if (sizeChartButton) {
      console.log(`✅ Found size chart button: "${sizeChartButton.text}"`);
      console.log(`   Selector: ${sizeChartButton.selector}`);

      // Click the button
      try {
        await page.click(sizeChartButton.selector);
        console.log(`✅ Clicked size chart button`);

        // Wait for modal to appear (wait for any new images to load)
        await sleep(2000);

        // Extract size chart image from modal
        const sizeChartImage = await page.evaluate(() => {
          // Look for recently revealed modals (visible but were hidden before)
          const modals = Array.from(document.querySelectorAll('[class*="modal"], [class*="popup"], [class*="overlay"], [role="dialog"]'));

          for (const modal of modals) {
            // Check if modal is visible
            const style = window.getComputedStyle(modal as Element);
            if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
              continue;
            }

            // Look for images within the modal
            const images = Array.from((modal as Element).querySelectorAll('img'));
            for (const img of images) {
              const src = img.getAttribute('src') || '';
              const alt = img.getAttribute('alt') || '';
              const className = img.getAttribute('class') || '';

              const combined = `${src} ${alt} ${className}`.toLowerCase();

              // Check if this is a size chart image
              if (
                combined.includes('size') ||
                combined.includes('chart') ||
                combined.includes('guide') ||
                combined.includes('fit') ||
                combined.includes('measurement') ||
                img.width > 400 // Size charts are usually large images
              ) {
                let imageUrl = src;

                // Handle relative URLs
                if (imageUrl.startsWith('//')) {
                  imageUrl = 'https:' + imageUrl;
                } else if (imageUrl.startsWith('/')) {
                  imageUrl = window.location.origin + imageUrl;
                }

                // Remove Shopify image resize parameters to get full size
                imageUrl = imageUrl.replace(/(_\d+x\d+|_\d+x|_x\d+|_small|_medium|_large|_grande|_compact|_thumb)(\.[a-z]+)$/i, '$2');

                return imageUrl;
              }
            }
          }

          return null;
        });

        if (sizeChartImage) {
          const duration = Date.now() - startTime;
          console.log(`✅ Size chart found in modal in ${duration}ms: ${sizeChartImage}`);

          return {
            success: true,
            sizeChartUrl: sizeChartImage,
            method: 'Button click → Modal extraction'
          };
        } else {
          console.log(`⚠️  Clicked button but no size chart image found in modal`);
        }

      } catch (clickError: any) {
        console.log(`⚠️  Failed to click size chart button: ${clickError.message}`);
      }
    } else {
      console.log(`ℹ️  No size chart button found on page`);
    }

    // Strategy 2: Look for size chart images already visible on the page
    console.log('🔍 Looking for visible size chart images...');

    const visibleSizeChart = await page.evaluate(() => {
      const images = Array.from(document.querySelectorAll('img'));

      for (const img of images) {
        const src = img.getAttribute('src') || '';
        const alt = img.getAttribute('alt') || '';
        const className = img.getAttribute('class') || '';

        const combined = `${src} ${alt} ${className}`.toLowerCase();

        // Check if this is a size chart image
        if (
          combined.includes('size') && (combined.includes('chart') || combined.includes('guide')) ||
          combined.includes('sizing') ||
          combined.includes('measurements')
        ) {
          let imageUrl = src;

          // Handle relative URLs
          if (imageUrl.startsWith('//')) {
            imageUrl = 'https:' + imageUrl;
          } else if (imageUrl.startsWith('/')) {
            imageUrl = window.location.origin + imageUrl;
          }

          // Remove Shopify image resize parameters
          imageUrl = imageUrl.replace(/(_\d+x\d+|_\d+x|_x\d+|_small|_medium|_large|_grande|_compact|_thumb)(\.[a-z]+)$/i, '$2');

          return imageUrl;
        }
      }

      return null;
    });

    if (visibleSizeChart) {
      const duration = Date.now() - startTime;
      console.log(`✅ Size chart found (visible on page) in ${duration}ms: ${visibleSizeChart}`);

      return {
        success: true,
        sizeChartUrl: visibleSizeChart,
        method: 'Visible image detection'
      };
    }

    // No size chart found
    const duration = Date.now() - startTime;
    console.log(`⚠️  No size chart found after ${duration}ms`);

    return {
      success: false,
      error: 'No size chart button or image found on product page'
    };

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`❌ Puppeteer size chart extraction failed after ${duration}ms:`, error);

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown Puppeteer error'
    };

  } finally {
    // CRITICAL: Always close browser to prevent memory leaks
    if (browser) {
      try {
        await browser.close();
        console.log('🔒 Browser closed successfully');
      } catch (closeError) {
        console.error('⚠️  Failed to close browser:', closeError);
      }
    }
    releaseBrowserSlot();
  }
}
