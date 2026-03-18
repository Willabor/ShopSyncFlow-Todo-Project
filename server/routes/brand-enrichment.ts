/**
 * Brand Enrichment API Routes
 *
 * Handles product data scraping from brand websites
 * and caching of enriched product information.
 */

import { safeErrorMessage } from "../utils/safe-error";
import type { Express, Request, Response } from "express";
import { storage } from "../storage";
import { createHash } from "crypto";
import multer from "multer";
import fs from "fs";
import path from "path";

/**
 * Validates that a URL is a safe external URL to prevent SSRF attacks.
 * Blocks localhost, loopback addresses, private IP ranges, and non-HTTP(S) protocols.
 */
function isValidExternalUrl(url: string): { valid: boolean; reason?: string } {
  try {
    const parsedUrl = new URL(url);

    // Only allow HTTP and HTTPS protocols
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return { valid: false, reason: 'Only HTTP and HTTPS URLs are allowed' };
    }

    // Block localhost and loopback addresses
    const hostname = parsedUrl.hostname.toLowerCase();
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '0.0.0.0' ||
      hostname === '::1' ||
      hostname.endsWith('.local')
    ) {
      return { valid: false, reason: 'Localhost URLs are not allowed' };
    }

    // Block private IP ranges (10.x.x.x, 172.16-31.x.x, 192.168.x.x)
    const ipParts = hostname.split('.').map(Number);
    if (ipParts.length === 4 && ipParts.every(p => !isNaN(p))) {
      if (ipParts[0] === 10) return { valid: false, reason: 'Private IP addresses are not allowed' };
      if (ipParts[0] === 172 && ipParts[1] >= 16 && ipParts[1] <= 31) return { valid: false, reason: 'Private IP addresses are not allowed' };
      if (ipParts[0] === 192 && ipParts[1] === 168) return { valid: false, reason: 'Private IP addresses are not allowed' };
      if (ipParts[0] === 169 && ipParts[1] === 254) return { valid: false, reason: 'Link-local addresses are not allowed' };
    }

    // Block cloud metadata endpoints
    if (hostname === '169.254.169.254' || hostname.includes('metadata')) {
      return { valid: false, reason: 'Cloud metadata endpoints are not allowed' };
    }

    return { valid: true };
  } catch {
    return { valid: false, reason: 'Invalid URL format' };
  }
}

/**
 * Register brand enrichment routes
 */
export function registerBrandEnrichmentRoutes(
  app: Express,
  requireAuth: any,
  requireRole: any
) {
  // ============================================================================
  // Brand Website Detection
  // ============================================================================

  // MULTI-TENANT: Helper to extract tenantId from authenticated user
  const getTenantId = (req: Request): string | null => {
    const user = req.user as any;
    return user?.tenantId ?? null;
  };

  /**
   * POST /api/vendors/:vendorId/detect-shopify
   * Detect if vendor website is a Shopify store
   */
  app.post("/api/vendors/:vendorId/detect-shopify", requireAuth, async (req: Request, res: Response) => {
    try {
      // MULTI-TENANT: Get tenant ID from authenticated user
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      const { vendorId } = req.params;
      // MULTI-TENANT: Get vendor within tenant scope
      const vendor = await storage.getVendorById(tenantId, vendorId);

      if (!vendor) {
        return res.status(404).json({ message: "Vendor not found" });
      }

      if (!vendor.websiteUrl) {
        return res.status(400).json({ message: "Vendor does not have a website URL" });
      }

      const { detectShopifyStore } = await import('../services/shopify-scraper.service');
      const isShopify = await detectShopifyStore(vendor.websiteUrl);

      // MULTI-TENANT: Update vendor within tenant scope
      await storage.updateVendor(tenantId, vendor.id, {
        websiteType: isShopify ? 'shopify' : 'custom'
      });

      res.json({ isShopify, websiteType: isShopify ? 'shopify' : 'custom' });
    } catch (error) {
      console.error("Error detecting Shopify store:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ============================================================================
  // Product Enrichment
  // ============================================================================

  /**
   * POST /api/products/enrich/stream
   * Enrich product with data from brand website (SSE stream)
   *
   * Request body:
   * {
   *   vendorId: string,
   *   styleNumber: string,
   *   productName?: string,
   *   color?: string
   * }
   */
  app.post("/api/products/enrich/stream", requireAuth, requireRole(["SuperAdmin", "WarehouseManager", "Editor"]), async (req: Request, res: Response) => {
    // Track whether we've sent a terminal event (complete or error) - declared outside try for catch access
    let terminalEventSent = false;
    try {
      // MULTI-TENANT: Get tenant from authenticated user
      const tenantId = (req.user as any)?.tenantId as string | undefined;
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      const { vendorId, styleNumber, productName, color, forceRefresh, productHandle } = req.body;

      console.log('🔍 Enrichment stream request:', { vendorId, styleNumber, productName, color, forceRefresh, productHandle });

      if (!vendorId || !styleNumber) {
        return res.status(400).json({ message: "vendorId and styleNumber are required" });
      }

      // Set headers for SSE
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no'); // Disable proxy buffering
      res.flushHeaders(); // Send headers immediately to establish SSE connection

      // Helper to send SSE events
      const sendEvent = (event: string, data: any) => {
        try {
          if (event === 'complete' || event === 'error') {
            terminalEventSent = true;
          }
          res.write(`event: ${event}\n`);
          // Stringify without pretty-printing to avoid newlines in the data
          const jsonData = JSON.stringify(data, null, 0);
          console.log(`[SSE] Sending ${event} event (${jsonData.length} bytes)`);
          // SSE requires data to be on a single line - replace any newlines
          const sseData = jsonData.replace(/\n/g, '');
          res.write(`data: ${sseData}\n\n`);
        } catch (error) {
          console.error(`[SSE] Error sending ${event} event:`, error);
        }
      };

      // Get vendor
      const vendors = await storage.getAllVendors(tenantId);
      const vendor = vendors.find(v => v.id === vendorId);

      if (!vendor) {
        sendEvent('error', { message: "Vendor not found" });
        return res.end();
      }

      if (!vendor.websiteUrl || !vendor.hasWebsite) {
        sendEvent('error', { message: "Vendor does not have a configured website" });
        return res.end();
      }

      // Check cache first - send cache status event
      const cached = await storage.getBrandProductCache(vendorId, styleNumber, color);
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      // Bypass cache if:
      // 1. forceRefresh is true (user clicked refresh)
      // 2. productHandle is provided (user selected a specific product from multi-match)
      const shouldBypassCache = forceRefresh || productHandle;

      if (shouldBypassCache) {
        if (forceRefresh) console.log('🔄 Force refresh requested - bypassing cache');
        if (productHandle) console.log('🎯 Product handle provided - bypassing cache to scrape selected product');
      }

      if (!shouldBypassCache && cached && cached.scrapingSuccess && cached.scrapedAt > sevenDaysAgo) {
        console.log('✅ Cache hit - returning cached data');
        sendEvent('layer-progress', {
          layer1: { attempted: false, success: false, method: 'Shopify JSON API' },
          layer2: { attempted: false, success: false, method: 'Generic HTML Scraper' },
          layer3: { attempted: false, success: false, method: 'AI Extraction (Gemini)' },
          layer4: { attempted: false, success: false, method: 'Headless Browser + AI' },
          successfulLayer: null
        });
        sendEvent('complete', { cached: true, data: cached });

        // Use setImmediate to ensure the complete event is sent before ending the connection
        setImmediate(() => {
          res.end();
        });
        return; // Stop execution after scheduling the end
      }

      // Initialize layer progress
      const layerProgress = {
        layer1: { attempted: false, success: false, method: 'Shopify JSON API' },
        layer2: { attempted: false, success: false, method: 'Generic HTML Scraper' },
        layer3: { attempted: false, success: false, method: 'AI Extraction (Gemini)' },
        layer4: { attempted: false, success: false, method: 'Headless Browser + AI' },
        successfulLayer: null as number | null
      };

      let enrichedData = {
        tenantId,  // MULTI-TENANT: Include tenant ID
        vendorId,
        styleNumber,
        productName: productName || '',
        color,
        brandProductUrl: '',
        brandProductTitle: '',
        brandDescription: '',
        images: [] as Array<{ url: string; width: number; height: number; alt?: string; isPrimary: boolean; }>,
        scrapingSuccess: false,
        scrapingError: undefined as string | undefined,
        scrapedAt: new Date(),
      };

      // ============================================================================
      // Layer 1: Shopify JSON API (fast, direct access)
      // ============================================================================
      if (vendor.websiteType === 'shopify') {
        console.log('🛍️ Layer 1: Attempting Shopify JSON API...');
        layerProgress.layer1.attempted = true;
        sendEvent('layer-progress', layerProgress);

        try {
          const { findShopifyProductMultiMatch, scrapeShopifyProduct } = await import('../services/shopify-scraper.service');

          // If productHandle is provided, filter matches to that specific product
          if (productHandle) {
            console.log(`✅ Layer 1: Filtering to specific product handle: ${productHandle}`);

            // Get all matches first
            const allMatches = await findShopifyProductMultiMatch(vendor.websiteUrl, {
              styleNumber,
              productName,
              color
            });

            // Filter to the selected product by handle
            const selectedMatch = allMatches.find(m => m.product.handle === productHandle);

            if (!selectedMatch) {
              console.log(`❌ Layer 1: Product with handle "${productHandle}" not found in matches`);
              enrichedData.scrapingError = `Product with handle "${productHandle}" not found`;
              sendEvent('layer-progress', layerProgress);
              sendEvent('complete', { cached: false, data: enrichedData });
              setImmediate(() => {
                res.end();
              });
              return;
            } else {
              console.log(`✅ Layer 1: Found selected product: "${selectedMatch.product.title}"`);

              // Use the product data we already have from the match instead of re-searching
              const shopifyData = {
                styleNumber,
                productName: selectedMatch.product.title,
                color,
                brandProductUrl: `${vendor.websiteUrl}/products/${selectedMatch.product.handle}`,
                brandProductTitle: selectedMatch.product.title,
                brandDescription: selectedMatch.product.body_html || '',
                features: [],
                images: selectedMatch.product.images.map((img: any) => ({
                  url: img.src,
                  width: img.width || 0,
                  height: img.height || 0,
                  alt: img.alt || selectedMatch.product.title,
                  isPrimary: img.position === 1,
                })),
                variants: selectedMatch.product.variants.map((v: any) => ({
                  sku: v.sku,
                  size: v.title,
                  price: v.price,
                  available: v.available,
                })),
                scrapedAt: new Date(),
                scrapingSuccess: true,
                scrapingError: undefined,
              };

              if (shopifyData.scrapingSuccess) {
                console.log('✅ Layer 1: Shopify JSON API succeeded');
                enrichedData = { ...enrichedData, ...shopifyData };
                layerProgress.layer1.success = true;
                layerProgress.successfulLayer = 1;
                sendEvent('layer-progress', layerProgress);
                try { await storage.createBrandProductCache(enrichedData); } catch (e: any) { console.error('Cache save error:', e.message); }
                console.log('📤 Sending complete event with data:', {
                  productName: enrichedData.productName,
                  hasImages: enrichedData.images?.length > 0,
                  imageCount: enrichedData.images?.length
                });
                sendEvent('complete', { cached: false, data: enrichedData });

                // Use setImmediate to ensure the complete event is sent before ending the connection
                setImmediate(() => {
                  res.end();
                });
                return; // Stop execution after scheduling the end
              } else {
                console.log('❌ Layer 1: Shopify JSON API failed');
                enrichedData.scrapingError = 'Shopify JSON API scraping failed for selected product';
                sendEvent('layer-progress', layerProgress);
                sendEvent('complete', { cached: false, data: enrichedData });
                setImmediate(() => {
                  res.end();
                });
                return;
              }
            }
          } else {
            // No specific handle provided - find all matching products
            const matches = await findShopifyProductMultiMatch(vendor.websiteUrl, {
              styleNumber,
              productName,
              color
            });

            if (matches.length === 0) {
              console.log('❌ Layer 1: No products found');
              sendEvent('layer-progress', layerProgress);
            } else if (matches.length === 1) {
              // Single match - proceed as normal
              console.log('✅ Layer 1: Single product match found');
              const shopifyData = await scrapeShopifyProduct(vendor.websiteUrl, {
                styleNumber,
                productName,
                color
              });

            if (shopifyData.scrapingSuccess) {
              console.log('✅ Layer 1: Shopify JSON API succeeded');
              enrichedData = { ...enrichedData, ...shopifyData };
              layerProgress.layer1.success = true;
              layerProgress.successfulLayer = 1;
              sendEvent('layer-progress', layerProgress);
              try { await storage.createBrandProductCache(enrichedData); } catch (e: any) { console.error('Cache save error:', e.message); }
              console.log('📤 Sending complete event with data:', {
                productName: enrichedData.productName,
                hasImages: enrichedData.images?.length > 0,
                imageCount: enrichedData.images?.length
              });
              sendEvent('complete', { cached: false, data: enrichedData });

              // Use setImmediate to ensure the complete event is sent before ending the connection
              setImmediate(() => {
                res.end();
              });
              return; // Stop execution after scheduling the end
            } else {
              console.log('❌ Layer 1: Shopify JSON API failed');
              sendEvent('layer-progress', layerProgress);
              // Fall through to Layer 2
            }
          } else {
            // Multiple matches found - send to frontend for user selection
            console.log(`🔀 Layer 1: Found ${matches.length} product matches - requesting user selection`);

            // Format matches for frontend display
            const matchOptions = matches.map((match, index) => ({
              index,
              title: match.product.title,
              matchedBy: match.matchedBy,
              confidence: match.confidence,
              matchedVariation: match.matchedVariation,
              imageUrl: match.product.images[0]?.src || null,
              handle: match.product.handle
            }));

            sendEvent('multiple-matches', {
              matches: matchOptions,
              message: `Found ${matches.length} products matching "${styleNumber}". Please select the correct one.`
            });

            // End here - user will make a new request with selected handle
            setImmediate(() => {
              res.end();
            });
            return;
            }
          }
        } catch (error: any) {
          console.error('❌ Layer 1 error:', error.message);
          sendEvent('layer-progress', layerProgress);
        }
      }

      // ============================================================================
      // Layer 2: Generic HTML Scraper (works for most static sites)
      // ============================================================================
      console.log('🌐 Layer 2: Attempting generic HTML scraper...');
      layerProgress.layer2.attempted = true;
      sendEvent('layer-progress', layerProgress);

      try {
        const { findGenericProductMatches, scrapeGenericProductByUrl, buildSearchTokens } = await import('../services/generic-brand-scraper.service');

        // Check if user already selected a specific product URL
        // For Layer 2, productHandle contains the full URL (not a Shopify handle)
        if (productHandle && productHandle.startsWith('http')) {
          console.log(`✅ Layer 2: Using pre-selected product URL: ${productHandle}`);
          const genericData = await scrapeGenericProductByUrl(productHandle, {
            styleNumber,
            productName,
            color
          });

          if (genericData.scrapingSuccess) {
            console.log('✅ Layer 2: Generic HTML scraper succeeded with selected URL');
            enrichedData = { ...enrichedData, ...genericData };
            layerProgress.layer2.success = true;
            layerProgress.successfulLayer = 2;
            sendEvent('layer-progress', layerProgress);
            try { await storage.createBrandProductCache(enrichedData); } catch (e: any) { console.error('Cache save error:', e.message); }
            sendEvent('complete', { cached: false, data: enrichedData });
            setImmediate(() => res.end());
            return;
          } else {
            console.log('❌ Layer 2: Generic HTML scraper failed with selected URL');
            enrichedData.scrapingError = 'Generic scraper failed for selected URL';
            sendEvent('layer-progress', layerProgress);
            sendEvent('complete', { cached: false, data: enrichedData });
            setImmediate(() => res.end());
            return;
          }
        }

        // No specific URL - find all matching products
        const matches = await findGenericProductMatches(vendor.websiteUrl, {
          styleNumber,
          productName,
          color
        });

        if (matches.length === 0) {
          console.log('❌ Layer 2: No product matches found');
          sendEvent('layer-progress', layerProgress);
        } else if (matches.length === 1) {
          // Single match - proceed automatically
          console.log('✅ Layer 2: Single product match found');
          const genericData = await scrapeGenericProductByUrl(matches[0].url, {
            styleNumber,
            productName,
            color
          });

          if (genericData.scrapingSuccess) {
            console.log('✅ Layer 2: Generic HTML scraper succeeded');
            enrichedData = { ...enrichedData, ...genericData };
            layerProgress.layer2.success = true;
            layerProgress.successfulLayer = 2;
            sendEvent('layer-progress', layerProgress);
            try { await storage.createBrandProductCache(enrichedData); } catch (e: any) { console.error('Cache save error:', e.message); }
            sendEvent('complete', { cached: false, data: enrichedData });
            setImmediate(() => res.end());
            return;
          } else {
            console.log('❌ Layer 2: Generic HTML scraper failed');
            enrichedData.brandProductUrl = genericData.brandProductUrl || '';
            sendEvent('layer-progress', layerProgress);
          }
        } else {
          // Multiple matches found - send to frontend for user selection
          console.log(`🔀 Layer 2: Found ${matches.length} product matches - requesting user selection`);

          // Calculate total tokens for accurate match display
          const totalTokens = buildSearchTokens({ styleNumber, productName, color });

          // Format matches for frontend display (similar to Layer 1)
          const matchOptions = matches.map((match, index) => ({
            index,
            title: match.title,
            matchedBy: `Matched ${match.matchedTokens.length}/${totalTokens.length} tokens: ${match.matchedTokens.join(', ')}`,
            confidence: Math.min(100, match.score * 20), // Convert score to percentage
            matchedVariation: match.isProductLink ? 'Product Page' : 'Generic Page',
            imageUrl: match.imageUrl,
            handle: match.url // Use URL as identifier
          }));

          sendEvent('multiple-matches', {
            matches: matchOptions,
            message: `Found ${matches.length} potential products. Please select the correct one.`,
            layer: 2 // Indicate this is from Layer 2
          });

          setImmediate(() => res.end());
          return;
        }
      } catch (error: any) {
        console.error('❌ Layer 2 error:', error.message);
        sendEvent('layer-progress', layerProgress);
      }

      // ============================================================================
      // Layer 3: AI Extraction (Gemini) - fallback for JavaScript-heavy sites
      // ============================================================================
      if (enrichedData.brandProductUrl) {
        console.log('🤖 Layer 3: Attempting AI extraction (Gemini)...');
        layerProgress.layer3.attempted = true;
        sendEvent('layer-progress', layerProgress);

        try {
          // Fetch HTML from the product URL
          const htmlResponse = await fetch(enrichedData.brandProductUrl);
          const html = await htmlResponse.text();

          const { extractProductDataWithAI } = await import('../services/gemini-content.service');
          const aiData = await extractProductDataWithAI(html, enrichedData.brandProductUrl, {
            styleNumber,
            productName,
            color
          });

          if (aiData.scrapingSuccess) {
            console.log('✅ Layer 3: AI extraction succeeded');
            enrichedData = { ...enrichedData, ...aiData };
            layerProgress.layer3.success = true;
            layerProgress.successfulLayer = 3;
            sendEvent('layer-progress', layerProgress);
            try { await storage.createBrandProductCache(enrichedData); } catch (e: any) { console.error('Cache save error:', e.message); }
            sendEvent('complete', { cached: false, data: enrichedData });
            return res.end();
          } else {
            console.log('❌ Layer 3: AI extraction failed');
            sendEvent('layer-progress', layerProgress);
          }
        } catch (error: any) {
          console.error('❌ Layer 3 error:', error.message);
          sendEvent('layer-progress', layerProgress);
        }
      }

      // ============================================================================
      // Layer 4: Puppeteer + AI (most powerful, slowest)
      // ============================================================================
      if (!enrichedData.scrapingSuccess && process.env.PUPPETEER_SERVICE_ENABLED === '1') {
        console.log('🎭 Layer 4: Attempting Puppeteer + AI...');
        layerProgress.layer4.attempted = true;
        layerProgress.layer4.method = 'Puppeteer + AI';
        sendEvent('layer-progress', layerProgress);

        try {
          const puppeteerServiceUrl = process.env.PUPPETEER_SERVICE_URL || 'http://localhost:7000';
          const useDirectUrl = enrichedData.brandProductUrl && enrichedData.brandProductUrl.includes(styleNumber);

          let html = '';
          let finalUrl = '';

          if (useDirectUrl) {
            console.log(`🌐 Using direct URL from earlier layers: ${enrichedData.brandProductUrl}`);
            const response = await fetch(`${puppeteerServiceUrl}/api/scrape`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                url: enrichedData.brandProductUrl
              })
            });

            const result = await response.json();
            if (result.success) {
              html = result.html;
              finalUrl = result.metadata?.finalUrl || enrichedData.brandProductUrl;
            } else {
              throw new Error(result.error || 'Puppeteer scraping failed');
            }
          } else {
            console.log(`🔍 Using Puppeteer search from homepage: ${vendor.websiteUrl}`);
            const response = await fetch(`${puppeteerServiceUrl}/api/search`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                siteUrl: vendor.websiteUrl,
                searchQuery: styleNumber
              })
            });

            const result = await response.json();
            if (result.success) {
              html = result.html;
              finalUrl = result.url;
            } else {
              const errorMsg = `Puppeteer search failed: ${result.error || 'Unknown error'}`;
              console.error(`❌ ${errorMsg}`);
              throw new Error(errorMsg);
            }
          }

          // Extract product data with AI
          if (process.env.SCRAPER_AI_ENABLED === '1') {
            const { extractProductDataWithAI } = await import('../services/gemini-content.service');
            const aiData = await extractProductDataWithAI(html, finalUrl, {
              styleNumber,
              productName,
              color
            });

            if (aiData.scrapingSuccess) {
              console.log('✅ Layer 4: Puppeteer + AI succeeded');
              enrichedData = { ...enrichedData, ...aiData };
              layerProgress.layer4.success = true;
              layerProgress.successfulLayer = 4;
              sendEvent('layer-progress', layerProgress);
              try { await storage.createBrandProductCache(enrichedData); } catch (e: any) { console.error('Cache save error:', e.message); }
              sendEvent('complete', { cached: false, data: enrichedData });
              return res.end();
            } else {
              console.log('❌ Layer 4: Puppeteer succeeded but AI extraction failed');
              sendEvent('layer-progress', layerProgress);
            }
          } else {
            console.log('⚠️  Puppeteer scraped HTML but AI extraction is disabled');
            enrichedData.scrapingError = 'Puppeteer succeeded but AI extraction is disabled';
            sendEvent('layer-progress', layerProgress);
          }
        } catch (error: any) {
          console.error('❌ Layer 4 error:', error.message);
          sendEvent('layer-progress', layerProgress);
        }
      }

      // All layers failed
      console.log('❌ All layers failed - no enrichment data available');
      enrichedData.scrapingError = enrichedData.scrapingError || 'All enrichment methods failed';
      try { await storage.createBrandProductCache(enrichedData); } catch (e: any) { console.error('Cache save error:', e.message); }
      sendEvent('layer-progress', layerProgress);
      sendEvent('complete', { cached: false, data: enrichedData });
      res.end();

    } catch (error: any) {
      console.error('❌ Enrichment stream error:', error);
      // Ensure we always send an error event even if headers were already sent
      if (!terminalEventSent) {
        try {
          res.write(`event: error\n`);
          res.write(`data: ${JSON.stringify({ message: safeErrorMessage(error) })}\n\n`);
        } catch (writeErr) {
          console.error('Failed to write error event:', writeErr);
        }
      }
      res.end();
    }
  });

  /**
   * POST /api/products/enrich
   * Enrich product with data from brand website
   *
   * Request body:
   * {
   *   vendorId: string,
   *   styleNumber: string,
   *   productName?: string,
   *   color?: string
   * }
   */
  app.post("/api/products/enrich", requireAuth, requireRole(["SuperAdmin", "WarehouseManager", "Editor"]), async (req: Request, res: Response) => {
    try {
      // MULTI-TENANT: Get tenant from authenticated user
      const tenantId = (req.user as any)?.tenantId as string | undefined;
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      const { vendorId, styleNumber, productName, color, forceRefresh } = req.body;

      console.log('🔍 Enrichment request:', { vendorId, styleNumber, productName, color, forceRefresh });

      if (!vendorId || !styleNumber) {
        return res.status(400).json({ message: "vendorId and styleNumber are required" });
      }

      // Get vendor
      const vendors = await storage.getAllVendors(tenantId);
      const vendor = vendors.find(v => v.id === vendorId);

      if (!vendor) {
        return res.status(404).json({ message: "Vendor not found" });
      }

      if (!vendor.websiteUrl || !vendor.hasWebsite) {
        return res.status(400).json({ message: "Vendor does not have a configured website" });
      }

      // Check cache first (7 day expiry) - UNLESS forceRefresh is true
      const cached = await storage.getBrandProductCache(vendorId, styleNumber, color);
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      if (!forceRefresh && cached && cached.scrapingSuccess && cached.scrapedAt > sevenDaysAgo) {
        console.log('✅ Using cached product data');

        // Serialize cached data to plain object (remove Drizzle metadata)
        const plainCached = {
          styleNumber: cached.styleNumber,
          productName: cached.productName,
          color: cached.color,
          brandProductUrl: cached.brandProductUrl,
          brandProductTitle: cached.brandProductTitle,
          brandDescription: cached.brandDescription,
          materialComposition: cached.materialComposition,
          careInstructions: cached.careInstructions,
          features: cached.features,
          images: cached.images,
          scrapedAt: cached.scrapedAt,
          scrapingSuccess: cached.scrapingSuccess,
          scrapingError: cached.scrapingError
        };

        // For cached results, we don't have layer progress tracking
        // But we include a minimal layerProgress to indicate data is from cache
        const cachedLayerProgress = {
          layer1: { attempted: false, success: false, method: 'Shopify JSON API' },
          layer2: { attempted: false, success: false, method: 'Generic HTML Scraper' },
          layer3: { attempted: false, success: false, method: 'AI Extraction (Gemini)' },
          layer4: { attempted: false, success: false, method: 'Headless Browser + AI' },
          successfulLayer: null
        };

        return res.json({
          cached: true,
          data: plainCached,
          layerProgress: cachedLayerProgress
        });
      }

      if (forceRefresh) {
        console.log('🔄 Force refresh requested - bypassing cache');
      }

      // NEW: Check robots.txt compliance before scraping
      const { isScrapingAllowed, getNexusUserAgent } = await import('../services/robots-txt-checker.service');
      const robotsCheck = await isScrapingAllowed(
        vendor.websiteUrl,
        getNexusUserAgent(process.env.SCRAPER_USER_AGENT_CONTACT || 'will@nexusclothing.com')
      );

      if (!robotsCheck.allowed) {
        console.error(`❌ Scraping blocked by robots.txt: ${robotsCheck.reason}`);
        return res.status(403).json({
          message: `Scraping not allowed: ${robotsCheck.reason}`,
          error: 'ROBOTS_TXT_DISALLOW',
          robotsTxtUrl: robotsCheck.robotsTxtUrl,
        });
      }

      // Honor crawl-delay if specified
      if (robotsCheck.crawlDelay && robotsCheck.crawlDelay > 0) {
        console.log(`⏱️  Honoring crawl-delay: ${robotsCheck.crawlDelay}s`);
        await new Promise(resolve => setTimeout(resolve, robotsCheck.crawlDelay! * 1000));
      }

      // Determine website type (shopify vs custom) so we pick the right scraper
      let websiteType = vendor.websiteType;
      if (!websiteType) {
        const { detectShopifyStore } = await import('../services/shopify-scraper.service');
        const isShopify = await detectShopifyStore(vendor.websiteUrl);
        websiteType = isShopify ? 'shopify' : 'custom';
        await storage.updateVendor(tenantId, vendor.id, { websiteType });
      }

      const searchInput = { styleNumber, productName, color };
      let enrichedData;

      // Track which layers were attempted and their results
      const layerProgress = {
        layer1: { attempted: false, success: false, method: 'Shopify JSON API' },
        layer2: { attempted: false, success: false, method: 'Generic HTML Scraper' },
        layer3: { attempted: false, success: false, method: 'AI Extraction (Gemini)' },
        layer4: { attempted: false, success: false, method: 'Headless Browser + AI' },
        successfulLayer: null as number | null
      };

      // Layer 1: Try Shopify scraper (if Shopify site)
      if (websiteType === 'shopify') {
        layerProgress.layer1.attempted = true;
        console.log(`🔄 Layer 1: Scraping Shopify product from ${vendor.websiteUrl}...`);
        const { scrapeShopifyProduct } = await import('../services/shopify-scraper.service');
        enrichedData = await scrapeShopifyProduct(vendor.websiteUrl, searchInput);

        if (enrichedData.scrapingSuccess) {
          layerProgress.layer1.success = true;
          layerProgress.successfulLayer = 1;
        }

        // Layer 2: If Shopify scraping fails, fall back to generic scraper
        if (!enrichedData.scrapingSuccess) {
          layerProgress.layer2.attempted = true;
          console.warn('⚠️  Layer 1 failed, attempting Layer 2 (generic HTML)...');
          const { scrapeGenericProduct } = await import('../services/generic-brand-scraper.service');
          enrichedData = await scrapeGenericProduct(vendor.websiteUrl, searchInput);

          if (enrichedData.scrapingSuccess) {
            layerProgress.layer2.success = true;
            layerProgress.successfulLayer = 2;
          }
        }
      } else {
        // Layer 2: Generic HTML scraper for custom sites
        layerProgress.layer2.attempted = true;
        console.log(`🔄 Layer 2: Scraping generic product from ${vendor.websiteUrl} (${websiteType})...`);
        const { scrapeGenericProduct } = await import('../services/generic-brand-scraper.service');
        enrichedData = await scrapeGenericProduct(vendor.websiteUrl, searchInput);

        if (enrichedData.scrapingSuccess) {
          layerProgress.layer2.success = true;
          layerProgress.successfulLayer = 2;
        }
      }

      // NEW Layer 3: Try AI extraction if previous layers failed (and enabled)
      // IMPORTANT: Only attempt if we have a valid product URL from Layer 2
      if (!enrichedData.scrapingSuccess && process.env.SCRAPER_AI_ENABLED === '1' && enrichedData.brandProductUrl) {
        layerProgress.layer3.attempted = true;
        console.log('🤖 Layer 2 failed, attempting Layer 3 (AI extraction)...');
        try {
          const { extractProductDataWithAI } = await import('../services/gemini-content.service');

          const productUrl = enrichedData.brandProductUrl;
          console.log(`   Fetching HTML from: ${productUrl}`);

          const response = await fetch(productUrl);
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }

          const html = await response.text();
          console.log(`   HTML fetched: ${html.length} characters`);

          // Use AI to extract product data
          enrichedData = await extractProductDataWithAI(html, productUrl, searchInput);

          if (enrichedData.scrapingSuccess) {
            layerProgress.layer3.success = true;
            layerProgress.successfulLayer = 3;
            console.log('✅ Layer 3 (AI extraction) succeeded');
          } else {
            console.warn('⚠️  Layer 3 (AI extraction) failed:', enrichedData.scrapingError);
          }
        } catch (aiError: any) {
          console.error('❌ Layer 3 (AI extraction) error:', aiError.message);
          // Keep the original enrichedData with failure status
        }
      } else if (!enrichedData.scrapingSuccess) {
        if (!enrichedData.brandProductUrl) {
          console.log('⚠️  Skipping Layer 3: No product URL found by Layer 2 (cannot fetch HTML without URL)');
        } else {
          console.log('⚠️  AI extraction disabled (SCRAPER_AI_ENABLED != 1)');
        }
      }

      // NEW Layer 4: Try headless browser with AI-guided search
      // This layer uses AI to intelligently navigate the website and find the product
      if (!enrichedData.scrapingSuccess && process.env.HEADLESS_SERVICE_ENABLED === '1') {
        layerProgress.layer4.attempted = true;
        console.log('🌐 Layer 3 failed, attempting Layer 4 (AI-guided headless browser)...');
        try {
          const headlessServiceUrl = process.env.HEADLESS_SERVICE_URL || 'http://localhost:3020';

          // If Layer 2 found a product URL, use it directly
          // Otherwise, use AI-guided search from the homepage
          const useDirectUrl = enrichedData.brandProductUrl && enrichedData.brandProductUrl.includes(styleNumber);

          if (useDirectUrl) {
            console.log(`   Using product URL from Layer 2: ${enrichedData.brandProductUrl}`);
            const response = await fetch(`${headlessServiceUrl}/api/scrape`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                url: enrichedData.brandProductUrl,
                timeout: 30000
              })
            });

            if (!response.ok) {
              throw new Error(`Headless service returned ${response.status}: ${response.statusText}`);
            }

            const scrapeResult = await response.json();

            if (scrapeResult.success && scrapeResult.html) {
              console.log(`   HTML fetched via headless: ${scrapeResult.html.length} characters`);

              // Use AI to extract product data from the rendered HTML
              if (process.env.SCRAPER_AI_ENABLED === '1') {
                const { extractProductDataWithAI } = await import('../services/gemini-content.service');
                enrichedData = await extractProductDataWithAI(
                  scrapeResult.html,
                  scrapeResult.url,
                  searchInput
                );

                if (enrichedData.scrapingSuccess) {
                  layerProgress.layer4.success = true;
                  layerProgress.successfulLayer = 4;
                  console.log('✅ Layer 4 (headless browser + direct URL) succeeded');
                }
              }
            }
          } else {
            // Use AI-guided search
            console.log(`   No valid product URL - using AI-guided search on: ${vendor.websiteUrl}`);
            console.log(`   Search query: ${styleNumber}`);

            const response = await fetch(`${headlessServiceUrl}/api/search`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                siteUrl: vendor.websiteUrl,
                searchQuery: styleNumber,
                timeout: 40000
              })
            });

            if (!response.ok) {
              throw new Error(`Headless search service returned ${response.status}: ${response.statusText}`);
            }

            const scrapeResult = await response.json();

            if (scrapeResult.success && scrapeResult.html) {
              console.log(`   Product found via AI-guided search!`);
              console.log(`   Product URL: ${scrapeResult.url}`);
              console.log(`   HTML length: ${scrapeResult.html.length} characters`);
              console.log(`   Load time: ${scrapeResult.metadata.loadTime}ms`);

              // Use AI to extract product data from the rendered HTML
              if (process.env.SCRAPER_AI_ENABLED === '1') {
                const { extractProductDataWithAI } = await import('../services/gemini-content.service');
                enrichedData = await extractProductDataWithAI(
                  scrapeResult.html,
                  scrapeResult.url,
                  searchInput
                );

                if (enrichedData.scrapingSuccess) {
                  layerProgress.layer4.success = true;
                  layerProgress.successfulLayer = 4;
                  console.log('✅ Layer 4 (AI-guided search + extraction) succeeded');
                } else {
                  console.warn('⚠️  Layer 4 AI extraction failed:', enrichedData.scrapingError);
                }
              } else {
                console.warn('⚠️  AI extraction disabled (SCRAPER_AI_ENABLED != 1)');
                enrichedData.scrapingError = 'Headless search found product but AI extraction is disabled';
              }
            } else {
              console.warn('⚠️  AI-guided search failed:', scrapeResult.error || 'Unknown error');
              enrichedData.scrapingError = scrapeResult.error || 'Product not found via AI-guided search';
            }
          }
        } catch (headlessError: any) {
          console.error('❌ Layer 4 (headless browser) error:', headlessError.message);
          enrichedData.scrapingError = `Layer 4 failed: ${headlessError.message}`;
        }
      } else if (!enrichedData.scrapingSuccess && process.env.HEADLESS_SERVICE_ENABLED !== '1') {
        console.log('⚠️  Headless browser disabled (HEADLESS_SERVICE_ENABLED != 1)');
      }

      console.log('✅ Scraping cascade complete:', {
        success: enrichedData.scrapingSuccess,
        hasTitle: !!enrichedData.brandProductTitle,
        hasImages: enrichedData.images?.length || 0
      });

      // Cache the result
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // 7 day cache

      try {
        if (cached) {
          // Update existing cache
          await storage.updateBrandProductCache(cached.id, {
            productName: enrichedData.productName,
            color: enrichedData.color,
            brandProductUrl: enrichedData.brandProductUrl,
            brandProductTitle: enrichedData.brandProductTitle,
            brandDescription: enrichedData.brandDescription,
            materialComposition: enrichedData.materialComposition,
            careInstructions: enrichedData.careInstructions,
            features: enrichedData.features as any,
            images: enrichedData.images as any,
            scrapedAt: enrichedData.scrapedAt,
            expiresAt,
            scrapingSuccess: enrichedData.scrapingSuccess,
            scrapingError: enrichedData.scrapingError
          });
          console.log('✅ Cache updated');
        } else {
          // Create new cache entry
          await storage.createBrandProductCache({
            tenantId,  // MULTI-TENANT: Include tenant ID
            vendorId,
            styleNumber: enrichedData.styleNumber,
            productName: enrichedData.productName,
            color: enrichedData.color,
            brandProductUrl: enrichedData.brandProductUrl,
            brandProductTitle: enrichedData.brandProductTitle,
            brandDescription: enrichedData.brandDescription,
            materialComposition: enrichedData.materialComposition,
            careInstructions: enrichedData.careInstructions,
            features: enrichedData.features as any,
            images: enrichedData.images as any,
            scrapedAt: enrichedData.scrapedAt,
            expiresAt,
            scrapingSuccess: enrichedData.scrapingSuccess,
            scrapingError: enrichedData.scrapingError
          });
          console.log('✅ Cache created');
        }
      } catch (cacheError) {
        console.error('⚠️ Cache operation failed (non-fatal):', cacheError);
        // Continue even if cache fails
      }

      // Return plain enriched data (no Drizzle metadata)
      const response = {
        cached: false,
        data: {
          styleNumber: enrichedData.styleNumber,
          productName: enrichedData.productName,
          color: enrichedData.color,
          brandProductUrl: enrichedData.brandProductUrl,
          brandProductTitle: enrichedData.brandProductTitle,
          brandDescription: enrichedData.brandDescription,
          materialComposition: enrichedData.materialComposition,
          careInstructions: enrichedData.careInstructions,
          features: enrichedData.features,
          images: enrichedData.images,
          scrapedAt: enrichedData.scrapedAt,
          scrapingSuccess: enrichedData.scrapingSuccess,
          scrapingError: enrichedData.scrapingError
        },
        layerProgress // Add layer progress to response
      };

      console.log('📤 Sending response with layer progress:', layerProgress);
      res.json(response);
    } catch (error) {
      console.error("❌ Error enriching product:", error);
      res.status(500).json({
        message: "Failed to enrich product",
        error: safeErrorMessage(error)
      });
    }
  });

  // ============================================================================
  // Size Charts
  // ============================================================================

  /**
   * GET /api/vendors/:vendorId/size-charts
   * Get all size charts for a brand
   */
  app.get("/api/vendors/:vendorId/size-charts", requireAuth, async (req: Request, res: Response) => {
    try {
      const { vendorId } = req.params;
      const charts = await storage.getBrandSizeCharts(vendorId);
      res.json(charts);
    } catch (error) {
      console.error("Error fetching size charts:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  /**
   * POST /api/vendors/:vendorId/scrape-size-chart
   * Scrape size chart from brand website
   *
   * Now supports both table-based and image-based size charts:
   * - Table-based: Dedicated size chart page with HTML tables (e.g., EPTM)
   * - Image-based: Size chart images on product pages (e.g., Hasta Muerte)
   *
   * Request body:
   * {
   *   category: string  // "Bottoms", "Tops", "Outerwear", etc.
   * }
   */
  app.post("/api/vendors/:vendorId/scrape-size-chart", requireAuth, requireRole(["SuperAdmin", "WarehouseManager", "Editor"]), async (req: Request, res: Response) => {
    console.log('🔥🔥🔥 ENDPOINT CALLED - VERSION 2.0 - CODE RELOAD CONFIRMED 🔥🔥🔥');
    try {
      // MULTI-TENANT: Get tenant from authenticated user
      const tenantId = (req.user as any)?.tenantId as string | undefined;
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      const { vendorId } = req.params;
      const { category, sourceUrl } = req.body;

      if (!category) {
        return res.status(400).json({ message: "category is required" });
      }

      // Validate sourceUrl if provided (SSRF protection)
      if (sourceUrl) {
        const urlValidation = isValidExternalUrl(sourceUrl);
        if (!urlValidation.valid) {
          return res.status(400).json({
            message: `Invalid alternative URL: ${urlValidation.reason}`
          });
        }
      }

      // Get vendor
      const vendors = await storage.getAllVendors(tenantId);
      const vendor = vendors.find(v => v.id === vendorId);

      if (!vendor) {
        return res.status(404).json({ message: "Vendor not found" });
      }

      if (!vendor.websiteUrl || !vendor.hasWebsite) {
        return res.status(400).json({ message: "Vendor does not have a configured website" });
      }

      // Check if chart already exists
      const existing = await storage.getBrandSizeChartByCategory(vendorId, category);

      // Step 1: Detect size chart type (table vs image)
      const { detectSizeChartType } = await import('../services/shopify-scraper.service');

      // Use alternative URL if provided, otherwise use vendor's website
      const targetUrl = sourceUrl || vendor.websiteUrl;
      console.log(`📍 Target URL: ${targetUrl}${sourceUrl ? ' (alternative URL provided)' : ''}`);

      console.log(`🔍 Detecting size chart type for: ${vendor.name}`);
      const sizeChartType = await detectSizeChartType(targetUrl);
      console.log(`✅ Detected size chart type: ${sizeChartType}`);

      // Update vendor with detected type
      await storage.updateVendor(tenantId, vendorId, {
        sizeChartType,
        sizeChartDetectedAt: new Date()
      });

      // If no size chart detected, return early
      if (sizeChartType === 'none') {
        return res.status(404).json({
          message: "No size chart found. This brand does not use table-based size charts on a dedicated page, nor image-based size charts on product pages.",
          sizeChartType: 'none'
        });
      }

      // Step 2: Fetch size chart using 4-layer cascade service
      const { fetchSizeChartWithLayers } = await import('../services/size-chart-fetcher.service');

      console.log(`📊 Fetching size chart using 4-layer cascade...`);
      const fetchResult = await fetchSizeChartWithLayers(targetUrl, sizeChartType);

      // Handle fetch result
      if (!fetchResult.success) {
        console.log(`❌ All layers failed for size chart fetching`);
        console.log(`Layer results:`, fetchResult.layerResults);
        return res.status(404).json({
          message: fetchResult.error || "No size chart found after trying all methods",
          sizeChartType,
          layerResults: fetchResult.layerResults,
          successfulLayer: 0
        });
      }

      // Success! Create database records from fetched data
      console.log(`✅ Size chart fetch succeeded via Layer ${fetchResult.successfulLayer} (${fetchResult.method})`);

      const sizeChartData = fetchResult.data!;
      const createdCharts = [];
      const categories = Object.keys(sizeChartData.parsedTables);

      console.log(`📊 Creating/updating size chart records for ${categories.length} categories: ${categories.join(', ')}`);

      for (const categoryKey of categories) {
        const categoryTable = sizeChartData.parsedTables[categoryKey];

        const categoryData = {
          rawHtml: categoryTable, // Store table data
          parsedTables: { [categoryKey]: categoryTable },
          note: sizeChartData.note,
          sampleImageUrl: sizeChartData.sampleImageUrl
        };

        const contentHash = createHash('sha256').update(categoryTable).digest('hex');
        const existingByHash = await storage.getBrandSizeChartByHash(vendorId, categoryKey, contentHash);

        if (existingByHash) {
          // Identical chart found - increment usage
          console.log(`  ✅ Identical chart found (version ${existingByHash.version}) - incrementing usage count`);
          await storage.incrementSizeChartUsageCount(existingByHash.id);
          await storage.updateBrandSizeChart(existingByHash.id, { scrapedAt: new Date() });
          createdCharts.push({ ...existingByHash, category: categoryKey, usageCount: (existingByHash.usageCount || 0) + 1 });
        } else {
          // New or different chart - create new version
          const allVersions = await storage.getAllBrandSizeChartVersions(vendorId, categoryKey);
          const maxVersion = allVersions.length > 0 ? Math.max(...allVersions.map(v => v.version || 1)) : 0;
          const newVersion = maxVersion + 1;

          console.log(`  🆕 Creating NEW version ${newVersion} for ${categoryKey}`);

          const created = await storage.createBrandSizeChart({
            tenantId,  // MULTI-TENANT: Include tenant ID
            vendorId,
            category: categoryKey,
            sizeChartData: categoryData as any,
            sourceUrl: sourceUrl || sizeChartData.sourceUrl || `${targetUrl}/pages/size-chart`,
            scrapedAt: new Date(),
            contentHash,
            version: newVersion,
            usageCount: 1,
            isActive: true
          });
          createdCharts.push({ ...created, category: categoryKey });
        }
      }

      // Return the chart matching the requested category (or first if not found)
      const matchingChart = createdCharts.find(c => c.category === category) || createdCharts[0];

      if (!matchingChart) {
        console.error('❌ No matching chart found in createdCharts:', createdCharts);
        return res.status(500).json({
          message: 'Size chart was fetched but failed to save to database',
          layerResults: fetchResult.layerResults
        });
      }

      const response = {
        ...matchingChart,
        sizeChartType,
        imageUrl: sizeChartData.sampleImageUrl,
        categoriesCreated: categories,
        totalCategories: categories.length,
        method: fetchResult.method,
        successfulLayer: fetchResult.successfulLayer,
        layerResults: fetchResult.layerResults
      };

      console.log('✅ Sending size chart response:', {
        id: response.id,
        category: response.category,
        version: response.version,
        method: response.method,
        successfulLayer: response.successfulLayer
      });

      return res.json(response);

    } catch (error) {
      console.error("Error scraping size chart:", error);
      res.status(500).json({
        message: "Failed to scrape size chart",
        error: safeErrorMessage(error)
      });
    }
  });

  /**
   * GET /api/vendors/:vendorId/size-chart-versions/:category
   * Get all versions of size charts for a category
   */
  app.get("/api/vendors/:vendorId/size-chart-versions/:category", requireAuth, async (req: Request, res: Response) => {
    try {
      const { vendorId, category } = req.params;

      console.log(`📋 Fetching all size chart versions for ${vendorId} / ${category}`);

      const versions = await storage.getAllBrandSizeChartVersions(vendorId, category);

      console.log(`✅ Found ${versions.length} version(s)`);

      res.json({
        versions: versions.map(v => ({
          id: v.id,
          version: v.version,
          usageCount: v.usageCount,
          scrapedAt: v.scrapedAt,
          createdAt: v.createdAt,
          isActive: v.isActive,
          contentHash: v.contentHash,
          sizeChartData: v.sizeChartData,
          sourceUrl: v.sourceUrl,
          fitGuidance: v.fitGuidance
        }))
      });
    } catch (error) {
      console.error('Error fetching size chart versions:', error);
      res.status(500).json({
        message: "Failed to fetch size chart versions",
        error: safeErrorMessage(error)
      });
    }
  });

  // ============================================================================
  // Manual Size Chart Upload (Failsafe)
  // ============================================================================

  /**
   * Configure multer for size chart image uploads
   */
  const UPLOAD_DIR = path.join(process.cwd(), 'attached_assets', 'size-charts');

  // Ensure upload directory exists
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }

  const upload = multer({
    dest: UPLOAD_DIR,
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB max
      files: 1 // Only 1 file at a time
    },
    fileFilter: (req, file, cb) => {
      // Validate file type
      const allowedMimeTypes = [
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/webp',
        'application/pdf'
      ];

      if (allowedMimeTypes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error('Invalid file type. Only JPG, PNG, WebP, and PDF are allowed.'));
      }
    }
  });

  /**
   * POST /api/vendors/:vendorId/size-chart/upload
   * Upload a size chart image manually (failsafe when auto-scraping fails)
   *
   * Request: multipart/form-data
   * - file: Image file (JPG, PNG, WebP, PDF)
   * - category: "Tops", "Bottoms", "Outerwear", etc.
   *
   * Response: Size chart data with AI-analyzed measurements
   */
  app.post("/api/vendors/:vendorId/size-chart/upload", requireAuth, requireRole(["SuperAdmin", "WarehouseManager", "Editor"]), upload.single('file'), async (req: Request, res: Response) => {
    console.log('📤 [Size Chart Upload] Endpoint called');

    try {
      // MULTI-TENANT: Get tenant from authenticated user
      const tenantId = (req.user as any)?.tenantId as string | undefined;
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      const { vendorId } = req.params;
      const { category } = req.body;
      const file = req.file;
      const userId = (req.user as any)?.id; // Get current user ID

      console.log(`📤 [Size Chart Upload] Vendor: ${vendorId}, Category: ${category}, File: ${file?.originalname}`);

      // Validation
      if (!file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      if (!category) {
        // Clean up uploaded file
        fs.unlinkSync(file.path);
        return res.status(400).json({ message: "Category is required" });
      }

      // Verify vendor exists
      const vendors = await storage.getAllVendors(tenantId);
      const vendor = vendors.find(v => v.id === vendorId);

      if (!vendor) {
        // Clean up uploaded file
        fs.unlinkSync(file.path);
        return res.status(404).json({ message: "Vendor not found" });
      }

      // Create vendor-specific directory
      const vendorDir = path.join(UPLOAD_DIR, vendorId);
      if (!fs.existsSync(vendorDir)) {
        fs.mkdirSync(vendorDir, { recursive: true });
      }

      // Generate unique filename
      const timestamp = Date.now();
      const ext = path.extname(file.originalname);
      const sanitizedCategory = category.toLowerCase().replace(/[^a-z0-9]/g, '_');
      const newFilename = `${vendorId}_${sanitizedCategory}_${timestamp}${ext}`;
      const finalPath = path.join(vendorDir, newFilename);

      // Move file to final location
      fs.renameSync(file.path, finalPath);

      console.log(`✅ [Size Chart Upload] File saved to: ${finalPath}`);

      // Analyze image with AI
      console.log('🤖 [Size Chart Upload] Starting AI analysis...');
      const { analyzeSizeChartImage } = await import('../services/size-chart-ai-analyzer.service');
      const analysisResult = await analyzeSizeChartImage(finalPath, category);

      if (!analysisResult.success) {
        console.error('❌ [Size Chart Upload] AI analysis failed:', analysisResult.error);

        // Keep the file for manual review but return error
        return res.status(422).json({
          message: analysisResult.error || "Failed to analyze size chart image",
          error: analysisResult.error,
          filePath: finalPath,
          suggestion: "The image may be too unclear or complex. Try uploading a clearer image with better lighting and resolution."
        });
      }

      console.log('✅ [Size Chart Upload] AI analysis succeeded');

      // Prepare size chart data
      const sizeChartData = {
        parsedTables: analysisResult.parsedTables,
        note: "Uploaded manually and analyzed by AI",
        rawHtml: Object.values(analysisResult.parsedTables!)[0], // First table as raw HTML
        uploadedVia: "manual_upload"
      };

      // Calculate content hash
      const contentHash = createHash('sha256')
        .update(JSON.stringify(analysisResult.parsedTables))
        .digest('hex');

      // Check if identical chart exists
      const existingByHash = await storage.getBrandSizeChartByHash(vendorId, category, contentHash);

      let sizeChart;

      if (existingByHash) {
        console.log(`✅ [Size Chart Upload] Identical chart found (version ${existingByHash.version}) - updating`);

        // Update existing with new upload metadata
        sizeChart = await storage.updateBrandSizeChart(existingByHash.id, {
          uploadMethod: "manual_upload",
          uploadedByUserId: userId,
          originalFileName: file.originalname,
          fileStoragePath: finalPath,
          aiAnalysisResult: analysisResult.rawAIResponse,
          fitGuidance: analysisResult.fitGuidance,
          scrapedAt: new Date(),
          usageCount: (existingByHash.usageCount || 0) + 1
        });

        sizeChart = { ...existingByHash, ...sizeChart };
      } else {
        console.log(`🆕 [Size Chart Upload] Creating new size chart entry`);

        // Get version number
        const allVersions = await storage.getAllBrandSizeChartVersions(vendorId, category);
        const maxVersion = allVersions.length > 0 ? Math.max(...allVersions.map(v => v.version || 1)) : 0;
        const newVersion = maxVersion + 1;

        // Create new size chart entry
        sizeChart = await storage.createBrandSizeChart({
          tenantId,  // MULTI-TENANT: Include tenant ID
          vendorId,
          category,
          sizeChartData: sizeChartData as any,
          sourceUrl: null, // No source URL for manual uploads
          fitGuidance: analysisResult.fitGuidance,
          contentHash,
          version: newVersion,
          usageCount: 1,
          isActive: true,
          uploadMethod: "manual_upload",
          uploadedByUserId: userId,
          originalFileName: file.originalname,
          fileStoragePath: finalPath,
          aiAnalysisResult: analysisResult.rawAIResponse,
          scrapedAt: new Date()
        });
      }

      console.log('✅ [Size Chart Upload] Size chart saved to database');

      // Return success response
      res.json({
        success: true,
        message: "Size chart uploaded and analyzed successfully",
        sizeChart: {
          id: sizeChart.id,
          category,
          sizeChartData: sizeChart.sizeChartData,
          fitGuidance: sizeChart.fitGuidance,
          version: sizeChart.version,
          uploadMethod: sizeChart.uploadMethod,
          originalFileName: file.originalname,
          confidence: analysisResult.confidence,
          warnings: analysisResult.warnings,
          createdAt: sizeChart.createdAt,
          imageUrl: null, // File is stored locally, not accessible via URL
          sizeChartType: 'manual_upload'
        }
      });

    } catch (error: any) {
      console.error('❌ [Size Chart Upload] Error:', error);

      // Clean up file if it exists
      if (req.file?.path && fs.existsSync(req.file.path)) {
        try {
          fs.unlinkSync(req.file.path);
        } catch (cleanupError) {
          console.error('Failed to clean up uploaded file:', cleanupError);
        }
      }

      res.status(500).json({
        message: "Failed to upload size chart",
        error: safeErrorMessage(error)
      });
    }
  });

  /**
   * DELETE /api/vendors/:vendorId/size-charts/:chartId
   * Delete a manually uploaded size chart
   *
   * Only allows deletion of manually uploaded charts (not auto-scraped ones)
   */
  app.delete("/api/vendors/:vendorId/size-charts/:chartId", requireAuth, requireRole(["SuperAdmin", "WarehouseManager", "Editor"]), async (req: Request, res: Response) => {
    try {
      const { vendorId, chartId } = req.params;
      const userId = (req.user as any)?.id;

      console.log(`🗑️  [Size Chart Delete] User ${userId} attempting to delete chart ${chartId}`);

      // Get the size chart
      const sizeChart = await storage.getBrandSizeChart(chartId);

      if (!sizeChart) {
        return res.status(404).json({ message: "Size chart not found" });
      }

      // Verify it belongs to the specified vendor
      if (sizeChart.vendorId !== vendorId) {
        return res.status(403).json({ message: "Size chart does not belong to this vendor" });
      }

      // Only allow deletion of manually uploaded charts
      if (sizeChart.uploadMethod !== 'manual_upload') {
        return res.status(403).json({
          message: "Only manually uploaded size charts can be deleted. Auto-scraped charts cannot be deleted.",
          uploadMethod: sizeChart.uploadMethod
        });
      }

      // Delete the file from file system if it exists
      if (sizeChart.fileStoragePath && fs.existsSync(sizeChart.fileStoragePath)) {
        try {
          fs.unlinkSync(sizeChart.fileStoragePath);
          console.log(`✅ [Size Chart Delete] File deleted: ${sizeChart.fileStoragePath}`);
        } catch (fileError) {
          console.error('Failed to delete file:', fileError);
          // Continue anyway - database deletion is more important
        }
      }

      // Delete from database
      await storage.deleteBrandSizeChart(chartId);

      console.log(`✅ [Size Chart Delete] Size chart ${chartId} deleted successfully`);

      res.json({
        success: true,
        message: "Size chart deleted successfully"
      });

    } catch (error: any) {
      console.error('❌ [Size Chart Delete] Error:', error);
      res.status(500).json({
        message: "Failed to delete size chart",
        error: safeErrorMessage(error)
      });
    }
  });
}
