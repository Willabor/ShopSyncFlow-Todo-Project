/**
 * Shopify Import Service
 *
 * Fetches products from Shopify store and imports them into local database.
 *
 * Features:
 * - GraphQL API with pagination (50 products per request)
 * - Automatic vendor/brand creation
 * - Duplicate detection (by shopifyProductId)
 * - Progress tracking
 * - Comprehensive error handling
 *
 * Prerequisites:
 * - SHOPIFY_STORE_URL must be set
 * - SHOPIFY_ACCESS_TOKEN must be set with read_products scope
 */

import type { Product } from "@shared/schema";
import { syncDebugService } from "./sync-debug.service";

/**
 * Normalize Shopify weight unit to our short format
 * Shopify returns: POUNDS, KILOGRAMS, GRAMS, OUNCES
 * We store: lb, kg, g, oz
 */
function normalizeWeightUnit(shopifyUnit: string | null): string | null {
  if (!shopifyUnit) return null;
  const unitMap: Record<string, string> = {
    'POUNDS': 'lb',
    'KILOGRAMS': 'kg',
    'GRAMS': 'g',
    'OUNCES': 'oz',
    // Also handle if already in short format
    'lb': 'lb',
    'kg': 'kg',
    'g': 'g',
    'oz': 'oz',
  };
  return unitMap[shopifyUnit.toUpperCase()] || unitMap[shopifyUnit] || shopifyUnit.toLowerCase();
}

interface ShopifyProduct {
  id: string;
  title: string;
  description: string;
  descriptionHtml: string;
  vendor: string;
  productType: string;
  category?: {
    id: string;
    name: string;
    fullName: string;
  };
  handle: string;
  status: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  publishedAt: string;
  options?: Array<{
    id: string;
    name: string;
    position: number;
    values: string[];
  }>;
  variants: {
    edges: Array<{
      node: {
        id: string;
        title: string;
        sku: string;
        barcode?: string;
        price: string;
        compareAtPrice: string;
        inventoryQuantity: number;
        selectedOptions?: Array<{
          name: string;
          value: string;
        }>;
        inventoryItem?: {
          id: string;
          unitCost?: {
            amount: string;
          };
          measurement?: {
            weight?: {
              value: number;
              unit: string;
            };
          };
        };
        image?: {
          url: string;
        };
      };
    }>;
  };
  images: {
    edges: Array<{
      node: {
        url: string;
        altText: string;
      };
    }>;
  };
  metafields: {
    edges: Array<{
      node: {
        namespace: string;
        key: string;
        value: string;
        type: string;
      };
    }>;
  };
  collections: {
    edges: Array<{
      node: {
        id: string;
        title: string;
        handle: string;
        description: string | null;
        ruleSet: {
          appliedDisjunctively: boolean;
          rules: Array<{
            column: string;
            relation: string;
            condition: string;
          }>;
        } | null;
      };
    }>;
  };
}

interface ShopifyProductsResponse {
  data: {
    products: {
      edges: Array<{
        node: ShopifyProduct;
        cursor: string;
      }>;
      pageInfo: {
        hasNextPage: boolean;
        hasPreviousPage: boolean;
        startCursor: string;
        endCursor: string;
      };
    };
  };
}

interface ImportProgress {
  total: number;
  imported: number;
  updated: number;
  skipped: number;
  failed: number;
  currentBatch: number;
  vendorsCreated: number;
}

interface FieldChange {
  productId?: string;
  shopifyProductId?: string;
  productTitle: string;
  variantId?: string;
  shopifyVariantId?: string;
  variantTitle?: string;
  field: string;
  oldValue: any;
  newValue: any;
}

interface ImportResult {
  success: boolean;
  progress: ImportProgress;
  products: Product[];
  errors: Array<{ productId: string; title: string; error: string }>;
  changeLog: FieldChange[];
}

// Valid column types for smart collection rules
type SmartCollectionColumn = "title" | "type" | "vendor" | "variant_title" | "tag" |
  "variant_price" | "variant_compare_at_price" | "variant_weight" | "variant_inventory";

// Valid relation types for smart collection rules
type SmartCollectionRelation = "equals" | "not_equals" | "starts_with" | "ends_with" |
  "contains" | "not_contains" | "greater_than" | "less_than";

/**
 * Convert Shopify's ruleSet format to our internal rules format.
 * Shopify uses `appliedDisjunctively` but we use `disjunctive`.
 * Also validates column and relation values.
 */
function convertShopifyRuleSet(ruleSet: {
  appliedDisjunctively: boolean;
  rules: Array<{
    column: string;
    relation: string;
    condition: string;
  }>;
} | null | undefined): { rules: Array<{ column: SmartCollectionColumn; relation: SmartCollectionRelation; condition: string }>; disjunctive: boolean } | null {
  if (!ruleSet || !ruleSet.rules || ruleSet.rules.length === 0) {
    return null;
  }

  const validColumns: SmartCollectionColumn[] = [
    "title", "type", "vendor", "variant_title", "tag",
    "variant_price", "variant_compare_at_price", "variant_weight", "variant_inventory"
  ];

  const validRelations: SmartCollectionRelation[] = [
    "equals", "not_equals", "starts_with", "ends_with",
    "contains", "not_contains", "greater_than", "less_than"
  ];

  const convertedRules = ruleSet.rules
    .filter(rule =>
      validColumns.includes(rule.column as SmartCollectionColumn) &&
      validRelations.includes(rule.relation as SmartCollectionRelation)
    )
    .map(rule => ({
      column: rule.column as SmartCollectionColumn,
      relation: rule.relation as SmartCollectionRelation,
      condition: rule.condition,
    }));

  if (convertedRules.length === 0) {
    return null;
  }

  return {
    rules: convertedRules,
    disjunctive: ruleSet.appliedDisjunctively,
  };
}

export class ShopifyImportService {
  private storeUrl: string;
  private accessToken: string;
  private apiVersion: string = "2024-01";
  // MULTI-TENANT: Store current tenant context for use in private methods
  private currentTenantId: string | null = null;

  constructor() {
    this.storeUrl = process.env.SHOPIFY_STORE_URL || "";
    this.accessToken = process.env.SHOPIFY_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_API_KEY || "";
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Check if credentials are configured
   */
  private checkCredentials(): void {
    if (!this.storeUrl || !this.accessToken) {
      throw new Error(
        "Shopify credentials not configured. Set SHOPIFY_STORE_URL and SHOPIFY_ACCESS_TOKEN environment variables."
      );
    }
  }

  /**
   * Import all products from Shopify store
   */
  async importAllProducts(
    tenantId: string,  // MULTI-TENANT: Required tenant ID
    onProgress?: (progress: ImportProgress) => void
  ): Promise<ImportResult> {
    this.checkCredentials();
    // MULTI-TENANT: Store tenant context for use by private methods
    this.currentTenantId = tenantId;

    const result: ImportResult = {
      success: true,
      progress: {
        total: 0,
        imported: 0,
        updated: 0,
        skipped: 0,
        failed: 0,
        currentBatch: 0,
        vendorsCreated: 0,
      },
      products: [],
      errors: [],
      changeLog: [],
    };

    // Create a sync log entry for this import session
    // MULTI-TENANT: Pass tenant ID to sync log
    const syncLog = await syncDebugService.createSyncLog(tenantId, "PRODUCT_IMPORT");
    const syncLogId = syncLog?.id;

    try {
      // Import storage for database operations
      const { storage } = await import("../storage");

      let hasNextPage = true;
      let cursor: string | null = null;
      let batchNumber = 0;

      // Get total count first (for progress tracking)
      const countResponse = await this.getProductCount();
      result.progress.total = countResponse.count;

      console.log(`Starting Shopify import: ${result.progress.total} products to import`);

      // ⚡ OPTIMIZED: Fetch all collections once at start for fast lookup
      console.log('⚡ Fetching all collections for optimized syncing...');
      // MULTI-TENANT: Filter collections by tenant
      const collectionsMap = await storage.getAllCollectionsMap(tenantId);
      console.log(`✅ Loaded ${collectionsMap.size} collections into memory`);

      // ⚡ OPTIMIZED: Build product ID map for fast lookup (for skipped products)
      // MULTI-TENANT: Filter products by tenant
      console.log('⚡ Building product ID map...');
      const allProducts = await storage.getProducts(tenantId, {});
      const productIdMap = new Map<string, string>(); // shopifyProductId -> internal productId
      for (const product of allProducts) {
        if (product.shopifyProductId) {
          productIdMap.set(product.shopifyProductId, product.id);
        }
      }
      console.log(`✅ Loaded ${productIdMap.size} product IDs into memory`);

      // Data structures to collect collection info during import
      const newCollectionsToCreate: Map<string, { shopifyId: string; data: any }> = new Map();
      const collectionLinksToCreate: Array<{ collectionId: string; productId: string }> = [];
      const pendingProductCollectionPairs: Array<{ productId: string; shopifyCollectionGid: string }> = [];

      // Fetch products in batches of 50
      while (hasNextPage) {
        batchNumber++;
        result.progress.currentBatch = batchNumber;

        console.log(`Fetching batch ${batchNumber}...`);

        const batchResult = await this.fetchProductBatch(cursor);

        if (!batchResult.success) {
          result.success = false;
          result.errors.push({
            productId: "BATCH_ERROR",
            title: `Batch ${batchNumber}`,
            error: batchResult.error || "Failed to fetch batch",
          });
          break;
        }

        // Add delay between batches to avoid rate limits (500ms)
        await this.sleep(500);

        // Process each product in the batch
        for (const shopifyProduct of batchResult.products) {
          try {
            const imported = await this.importSingleProduct(shopifyProduct);
            if (imported.success) {
              if (imported.updated) {
                result.progress.updated++;
                if (imported.product) {
                  result.products.push(imported.product);
                }
              } else if (imported.skipped) {
                result.progress.skipped++;
              } else {
                result.progress.imported++;
                if (imported.product) {
                  result.products.push(imported.product);
                }
              }
              // Track vendor creation
              if (imported.vendorCreated) {
                result.progress.vendorsCreated++;
              }
              // Aggregate changeLogs
              if (imported.changeLog && imported.changeLog.length > 0) {
                result.changeLog.push(...imported.changeLog);
              }

              // ⚡ OPTIMIZED: Collect collection data for batch processing later
              // Note: We need to collect for ALL products (imported, updated, AND skipped)
              if (shopifyProduct.collections && shopifyProduct.collections.edges.length > 0) {
                // Get product ID - either from imported.product or look up from productIdMap
                let productId: string | undefined = imported.product?.id;

                if (!productId) {
                  // Product was skipped or we don't have it, look up from memory map
                  const shopifyProductId = shopifyProduct.id.split("/").pop() || shopifyProduct.id;
                  productId = productIdMap.get(shopifyProductId);
                }

                if (productId) {
                  for (const edge of shopifyProduct.collections.edges) {
                    const shopifyCollection = edge.node;
                    const shopifyCollectionGid = shopifyCollection.id;

                    // Check if collection already exists in memory
                    let localCollection = collectionsMap.get(shopifyCollectionGid);

                    if (!localCollection) {
                      // Check if we've already queued this collection for creation
                      if (!newCollectionsToCreate.has(shopifyCollectionGid)) {
                        const collectionType = shopifyCollection.ruleSet ? "smart" : "manual";
                        newCollectionsToCreate.set(shopifyCollectionGid, {
                          shopifyId: shopifyCollectionGid,
                          data: {
                            name: shopifyCollection.title,
                            description: shopifyCollection.description || undefined,
                            shopifyCollectionId: shopifyCollectionGid,
                            slug: shopifyCollection.handle,
                            shopifyType: collectionType as "manual" | "smart",
                            rules: convertShopifyRuleSet(shopifyCollection.ruleSet), // ✅ Store collection rules
                          },
                        });
                      }
                      // Track this product-collection pair for linking after collection is created
                      pendingProductCollectionPairs.push({
                        productId: productId,
                        shopifyCollectionGid: shopifyCollectionGid,
                      });
                    } else {
                      // Collection exists, queue link immediately
                      collectionLinksToCreate.push({
                        collectionId: localCollection.id,
                        productId: productId,
                      });
                    }
                  }
                }
              }
            } else {
              result.progress.failed++;
              const errorMessage = imported.error || "Unknown error";
              result.errors.push({
                productId: shopifyProduct.id,
                title: shopifyProduct.title,
                error: errorMessage,
              });
              // Log error to sync debug system
              // MULTI-TENANT: Pass tenant ID to error logging
              await syncDebugService.logError({
                tenantId,
                syncLogId,
                shopifyProductId: shopifyProduct.id,
                productTitle: shopifyProduct.title,
                productHandle: shopifyProduct.handle,
                errorType: syncDebugService.classifyError(errorMessage),
                errorMessage,
                operation: "CREATE",
                requestData: { shopifyProduct: { id: shopifyProduct.id, title: shopifyProduct.title, handle: shopifyProduct.handle } },
              });
            }
          } catch (error: any) {
            result.progress.failed++;
            const errorMessage = error.message || "Failed to import product";
            result.errors.push({
              productId: shopifyProduct.id,
              title: shopifyProduct.title,
              error: errorMessage,
            });
            // Log error to sync debug system with stack trace
            // MULTI-TENANT: Pass tenant ID to exception logging
            await syncDebugService.logException(error, {
              tenantId,
              syncLogId,
              shopifyProductId: shopifyProduct.id,
              productTitle: shopifyProduct.title,
              productHandle: shopifyProduct.handle,
              operation: "CREATE",
              requestData: { shopifyProduct: { id: shopifyProduct.id, title: shopifyProduct.title, handle: shopifyProduct.handle } },
            });
          }
        }

        hasNextPage = batchResult.hasNextPage;
        cursor = batchResult.endCursor;

        console.log(
          `Batch ${batchNumber} complete: ${result.progress.imported} imported, ${result.progress.updated} updated, ${result.progress.skipped} skipped, ${result.progress.failed} failed`
        );

        // Report progress after each batch
        if (onProgress) {
          onProgress(result.progress);
        }
      }

      console.log(`Import complete: ${result.progress.imported}/${result.progress.total} products imported`);

      // ⚡ OPTIMIZED: Batch process collections after all products are imported
      console.log('\n⚡ Starting optimized collection sync...');

      // Step 1: Create new collections in batch - MULTI-TENANT
      if (newCollectionsToCreate.size > 0) {
        console.log(`Creating ${newCollectionsToCreate.size} new collections...`);
        const collectionsToInsert = Array.from(newCollectionsToCreate.values()).map(c => c.data);
        const createdCollections = await storage.batchCreateCollections(tenantId, collectionsToInsert);
        console.log(`✅ Created ${createdCollections.length} collections`);

        // Add newly created collections to the map
        for (const createdCollection of createdCollections) {
          if (createdCollection.shopifyCollectionId) {
            collectionsMap.set(createdCollection.shopifyCollectionId, createdCollection);
          }
        }

        // Now queue links for newly created collections using our pending pairs
        console.log(`Processing ${pendingProductCollectionPairs.length} pending product-collection pairs...`);
        for (const pair of pendingProductCollectionPairs) {
          const collection = collectionsMap.get(pair.shopifyCollectionGid);
          if (collection) {
            collectionLinksToCreate.push({
              collectionId: collection.id,
              productId: pair.productId,
            });
          }
        }
      } else {
        console.log('No new collections to create');
      }

      // Step 2: Batch insert all collection-product links
      if (collectionLinksToCreate.length > 0) {
        console.log(`\nBatch inserting ${collectionLinksToCreate.length} collection-product links...`);
        await storage.batchCreateProductCollectionLinks(collectionLinksToCreate);
        console.log(`✅ Collection sync complete!`);
      } else {
        console.log('No collection-product links to create');
      }

      // Step 3: Update all collection product counts in bulk (efficient - done once at end)
      console.log(`\n⚡ Updating collection product counts...`);
      await storage.updateCollectionProductCounts();
      console.log(`✅ Collection counts updated!`);

      // Generate detailed change summary
      if (result.changeLog.length > 0) {
        console.log('\n========== DETAILED CHANGE REPORT ==========');

        // Group changes by field type
        const changesByField = result.changeLog.reduce((acc, change) => {
          if (!acc[change.field]) {
            acc[change.field] = [];
          }
          acc[change.field].push(change);
          return acc;
        }, {} as Record<string, FieldChange[]>);

        // Print summary by field
        console.log(`\nTotal field updates: ${result.changeLog.length}`);
        Object.entries(changesByField).forEach(([field, changes]) => {
          console.log(`  ${field}: ${changes.length} updates`);
        });

        // Print detailed changes (limit to first 20 for readability)
        console.log('\nDetailed changes (first 20):');
        result.changeLog.slice(0, 20).forEach((change, idx) => {
          console.log(`  ${idx + 1}. ${change.productTitle} - ${change.variantTitle}`);
          console.log(`     ${change.field}: "${change.oldValue}" → "${change.newValue}"`);
        });

        if (result.changeLog.length > 20) {
          console.log(`  ... and ${result.changeLog.length - 20} more changes`);
        }

        console.log('===========================================\n');
      } else {
        console.log('No field-level changes detected in this sync.');
      }

      // Persist changelog entries to database
      if (result.changeLog.length > 0 && syncLogId) {
        await syncDebugService.persistChangelog(tenantId, syncLogId, result.changeLog);
      }

      // Complete the sync log with success status
      if (syncLogId) {
        await syncDebugService.completeSyncLog(syncLogId, {
          status: "SUCCESS",
          productsProcessed: result.progress.imported + result.progress.updated + result.progress.skipped + result.progress.failed,
          productsCreated: result.progress.imported,
          productsUpdated: result.progress.updated,
          errorCount: result.progress.failed,
        });
        // Print error summary to console
        await syncDebugService.printErrorSummary(syncLogId);
      }

      return result;
    } catch (error: any) {
      console.error("Fatal error during import:", error);
      result.success = false;
      result.errors.push({
        productId: "FATAL_ERROR",
        title: "Import Process",
        error: error.message || "Fatal error during import",
      });
      // Log fatal error and complete sync log with failed status
      // MULTI-TENANT: Pass tenant ID to exception logging
      if (syncLogId) {
        await syncDebugService.logException(error, {
          tenantId,
          syncLogId,
          shopifyProductId: "FATAL_ERROR",
          productTitle: "Import Process",
          operation: "FETCH",
        });
        await syncDebugService.completeSyncLog(syncLogId, {
          status: "FAILED",
          productsProcessed: result.progress.imported + result.progress.updated + result.progress.skipped + result.progress.failed,
          productsCreated: result.progress.imported,
          productsUpdated: result.progress.updated,
          errorCount: result.progress.failed,
          errorMessage: error.message || "Fatal error during import",
        });
      }
      return result;
    }
  }

  /**
   * Get total product count from Shopify
   */
  private async getProductCount(): Promise<{ count: number }> {
    try {
      const query = `
        query {
          productsCount {
            count
          }
        }
      `;

      const response = await this.makeShopifyRequest<{ data: { productsCount: { count: number } } }>(query);
      return { count: response.data.productsCount.count };
    } catch (error) {
      console.warn("Failed to get product count, will proceed without total:", error);
      return { count: 0 };
    }
  }

  /**
   * Fetch a batch of products from Shopify (max 50)
   */
  private async fetchProductBatch(cursor: string | null): Promise<{
    success: boolean;
    products: ShopifyProduct[];
    hasNextPage: boolean;
    endCursor: string | null;
    error?: string;
  }> {
    try {
      const query = `
        query ($cursor: String) {
          products(first: 50, after: $cursor) {
            edges {
              node {
                id
                title
                description
                descriptionHtml
                vendor
                productType
                category {
                  id
                  name
                  fullName
                }
                handle
                status
                tags
                createdAt
                updatedAt
                publishedAt
                options {
                  id
                  name
                  position
                  values
                }
                variants(first: 100) {
                  edges {
                    node {
                      id
                      title
                      sku
                      barcode
                      price
                      compareAtPrice
                      inventoryQuantity
                      selectedOptions {
                        name
                        value
                      }
                      inventoryItem {
                        id
                        unitCost {
                          amount
                        }
                        measurement {
                          weight {
                            value
                            unit
                          }
                        }
                      }
                      image {
                        url
                      }
                    }
                  }
                }
                images(first: 10) {
                  edges {
                    node {
                      url
                      altText
                    }
                  }
                }
                metafields(first: 50) {
                  edges {
                    node {
                      namespace
                      key
                      value
                      type
                    }
                  }
                }
                collections(first: 250) {
                  edges {
                    node {
                      id
                      title
                      handle
                      description
                      ruleSet {
                        appliedDisjunctively
                        rules {
                          column
                          relation
                          condition
                        }
                      }
                    }
                  }
                }
              }
              cursor
            }
            pageInfo {
              hasNextPage
              hasPreviousPage
              startCursor
              endCursor
            }
          }
        }
      `;

      const variables = cursor ? { cursor } : {};
      const response = await this.makeShopifyRequest<ShopifyProductsResponse>(query, variables);

      const products = response.data.products.edges.map((edge) => edge.node);
      const pageInfo = response.data.products.pageInfo;

      return {
        success: true,
        products,
        hasNextPage: pageInfo.hasNextPage,
        endCursor: pageInfo.endCursor,
      };
    } catch (error: any) {
      console.error("Error fetching product batch:", error);
      return {
        success: false,
        products: [],
        hasNextPage: false,
        endCursor: null,
        error: error.message || "Failed to fetch products from Shopify",
      };
    }
  }

  /**
   * Sync product variants and options from Shopify data
   * This helper method is called for BOTH new and existing products
   * to ensure all variants and options are properly created/updated
   */
  private async syncProductVariantsAndOptions(
    productId: string,
    shopifyProduct: ShopifyProduct,
    shopifyProductId: string
  ): Promise<{
    variantsCreated: number;
    variantsUpdated: number;
    variantsSkipped: number;
    optionsCreated: number;
    errors: string[];
    changeLog: FieldChange[];
  }> {
    const { storage } = await import("../storage");

    let variantsCreated = 0;
    let variantsUpdated = 0;
    let variantsSkipped = 0;
    let optionsCreated = 0;
    const errors: string[] = [];
    const changeLog: FieldChange[] = [];

    try {
      // Step 1: Create product options if they don't exist
      const existingOptions = await storage.getProductOptions(productId);

      if (existingOptions.length === 0 && shopifyProduct.options && shopifyProduct.options.length > 0) {
        for (const option of shopifyProduct.options) {
          try {
            await storage.createProductOption({
              productId,
              name: option.name,
              position: option.position,
              values: option.values,
            });
            optionsCreated++;
          } catch (optionError: any) {
            const errorMsg = `Failed to create option ${option.name}: ${optionError.message}`;
            errors.push(errorMsg);
            console.warn(`Product ${shopifyProductId}: ${errorMsg}`);
          }
        }
      }

      // Step 2: Get existing variants to check for duplicates
      const existingVariants = await storage.getProductVariants(productId);
      const existingShopifyIds = new Set(
        existingVariants
          .map(v => v.shopifyVariantId)
          .filter(id => id !== null && id !== undefined)
      );

      // Step 3: Create or update variants
      for (const edge of shopifyProduct.variants.edges) {
        const variant = edge.node;
        const shopifyVariantId = variant.id.split("/").pop();

        // Map selectedOptions to option1/option2/option3
        const option1 = variant.selectedOptions?.[0]?.value || null;
        const option2 = variant.selectedOptions?.[1]?.value || null;
        const option3 = variant.selectedOptions?.[2]?.value || null;

        // Extract weight, cost, and image
        // Note: Use explicit null/undefined check to handle weight value of 0
        const rawWeight = variant.inventoryItem?.measurement?.weight?.value;
        const weightValue = rawWeight !== null && rawWeight !== undefined
          ? rawWeight.toString()
          : null;
        const weightUnit = normalizeWeightUnit(variant.inventoryItem?.measurement?.weight?.unit || null);
        const cost = variant.inventoryItem?.unitCost?.amount || null;
        const imageUrl = variant.image?.url || null;

        // Check if variant already exists
        if (shopifyVariantId && existingShopifyIds.has(shopifyVariantId)) {
          // Variant exists - check if it needs updates
          const existingVariant = existingVariants.find(v => v.shopifyVariantId === shopifyVariantId);

          if (existingVariant) {
            // Build updates object for fields that are NULL or missing OR need to be updated from Shopify
            const updates: Partial<any> = {};

            // Only update options if missing (don't overwrite)
            if (!existingVariant.option1 && option1) updates.option1 = option1;
            if (!existingVariant.option2 && option2) updates.option2 = option2;
            if (!existingVariant.option3 && option3) updates.option3 = option3;

            // ALWAYS update these fields from Shopify if Shopify has them (sync master data)
            if (variant.compareAtPrice !== null && variant.compareAtPrice !== undefined && existingVariant.compareAtPrice !== variant.compareAtPrice) {
              updates.compareAtPrice = variant.compareAtPrice;
              changeLog.push({
                productId,
                productTitle: shopifyProduct.title,
                variantTitle: variant.title || 'Default Title',
                field: 'compareAtPrice',
                oldValue: existingVariant.compareAtPrice,
                newValue: variant.compareAtPrice,
              });
            }
            if (cost && existingVariant.cost !== cost) {
              updates.cost = cost;
              changeLog.push({
                productId,
                productTitle: shopifyProduct.title,
                variantTitle: variant.title || 'Default Title',
                field: 'cost',
                oldValue: existingVariant.cost,
                newValue: cost,
              });
            }

            // Weight: Always update if Shopify has a value
            if (weightValue) {
              if (!existingVariant.weight || existingVariant.weight !== weightValue) {
                updates.weight = weightValue;
                changeLog.push({
                  productId,
                  productTitle: shopifyProduct.title,
                  variantTitle: variant.title || 'Default Title',
                  field: 'weight',
                  oldValue: existingVariant.weight,
                  newValue: weightValue,
                });
              }
            }
            if (weightUnit) {
              if (!existingVariant.weightUnit || existingVariant.weightUnit !== weightUnit) {
                updates.weightUnit = weightUnit;
                changeLog.push({
                  productId,
                  productTitle: shopifyProduct.title,
                  variantTitle: variant.title || 'Default Title',
                  field: 'weightUnit',
                  oldValue: existingVariant.weightUnit,
                  newValue: weightUnit,
                });
              }
            }

            if (variant.barcode && existingVariant.barcode !== variant.barcode) {
              updates.barcode = variant.barcode;
              changeLog.push({
                productId,
                productTitle: shopifyProduct.title,
                variantTitle: variant.title || 'Default Title',
                field: 'barcode',
                oldValue: existingVariant.barcode,
                newValue: variant.barcode,
              });
            }

            // Image: Always update if Shopify has a value
            if (imageUrl) {
              if (!existingVariant.imageUrl || existingVariant.imageUrl !== imageUrl) {
                updates.imageUrl = imageUrl;
                changeLog.push({
                  productId,
                  productTitle: shopifyProduct.title,
                  variantTitle: variant.title || 'Default Title',
                  field: 'imageUrl',
                  oldValue: existingVariant.imageUrl,
                  newValue: imageUrl,
                });
              }
            }

            // Update variant if there are any missing fields
            if (Object.keys(updates).length > 0) {
              try {
                await storage.updateProductVariant(existingVariant.id, updates);
                variantsUpdated++;
              } catch (updateError: any) {
                const errorMsg = `Failed to update variant ${variant.id}: ${updateError.message}`;
                errors.push(errorMsg);
                console.warn(`Product ${shopifyProductId}: ${errorMsg}`);
              }
            } else {
              variantsSkipped++;
            }
          } else {
            variantsSkipped++;
          }
        } else {
          // Variant doesn't exist - create it
          try {
            await storage.createProductVariant({
              productId,
              shopifyVariantId: shopifyVariantId || undefined,
              title: variant.title || "Default Title",
              sku: variant.sku || "",
              barcode: variant.barcode || null,
              price: variant.price || "0.00",
              compareAtPrice: variant.compareAtPrice || null,
              cost: cost || null,
              inventoryQuantity: variant.inventoryQuantity || 0,
              weight: weightValue || null,
              weightUnit: weightUnit || null,
              imageUrl: imageUrl || null,
              option1,
              option2,
              option3,
            });

            variantsCreated++;
          } catch (variantError: any) {
            const errorMsg = `Failed to create variant ${variant.id}: ${variantError.message}`;
            errors.push(errorMsg);
            console.warn(`Product ${shopifyProductId}: ${errorMsg}`);
          }
        }
      }
    } catch (error: any) {
      const errorMsg = `Fatal error in syncProductVariantsAndOptions: ${error.message}`;
      errors.push(errorMsg);
      console.error(`Product ${shopifyProductId}: ${errorMsg}`);
    }

    return { variantsCreated, variantsUpdated, variantsSkipped, optionsCreated, errors, changeLog };
  }

  /**
   * Import a single Shopify product into local database
   * Now with status change tracking!
   */
  private async importSingleProduct(shopifyProduct: ShopifyProduct): Promise<{
    success: boolean;
    skipped?: boolean;
    updated?: boolean;
    product?: Product;
    error?: string;
    vendorCreated?: boolean;
    changeLog?: FieldChange[];
  }> {
    try {
      // Import storage dynamically to avoid circular dependencies
      const { storage } = await import("../storage");
      const { db } = await import("../db");
      const { productStatusHistory } = await import("@shared/schema");

      // Keep full Shopify GraphQL ID format for database queries (e.g., gid://shopify/Product/123)
      // Database stores the full GID, so we need to query with the full format
      const shopifyProductGid = shopifyProduct.id; // Full GID format: gid://shopify/Product/123
      const shopifyProductId = shopifyProduct.id.split("/").pop() || shopifyProduct.id; // Numeric ID: 123
      const newStatus = this.mapShopifyStatus(shopifyProduct.status);

      // Check if product already exists (by NUMERIC ID - database stores numeric ID only!)
      // MULTI-TENANT NOTE: This function is called after the route has already verified
      // that the product belongs to the authenticated user's tenant. The Shopify product ID
      // is globally unique and the local product reference was validated in the route.
      // Use getProductByShopifyId which doesn't require tenant filter for this use case.
      const existingProducts = await storage.getProductByShopifyId(shopifyProductId);

      if (existingProducts.length > 0) {
        // Product exists - sync variants/options first, then check for status/handle changes
        const existingProduct = existingProducts[0];

        // ✅ PHASE B.9.2: Sync variants and options for existing product
        const syncResult = await this.syncProductVariantsAndOptions(
          existingProduct.id,
          shopifyProduct,
          shopifyProductId
        );

        // Track if product was updated
        const variantsOrOptionsUpdated = syncResult.variantsCreated > 0 || syncResult.variantsUpdated > 0 || syncResult.optionsCreated > 0;

        if (variantsOrOptionsUpdated) {
          console.log(
            `Product ${shopifyProductId}: Created ${syncResult.variantsCreated} variants, ` +
            `updated ${syncResult.variantsUpdated} variants, ` +
            `created ${syncResult.optionsCreated} options ` +
            `(${syncResult.variantsSkipped} skipped)` +
            (syncResult.errors.length > 0 ? ` - ${syncResult.errors.length} errors` : '')
          );
        }

        // Initialize changeLog from variant changes, will add product-level changes below
        const changeLog: FieldChange[] = [...syncResult.changeLog];

        const oldStatus = existingProduct.status;
        const oldHandle = existingProduct.handle;
        const oldStyleNumber = existingProduct.styleNumber;
        const oldTitle = existingProduct.title;
        const oldVendor = existingProduct.vendor;
        const oldImages = JSON.stringify(existingProduct.images || []);
        const oldDescription = existingProduct.description || "";
        const oldTags = existingProduct.tags || "";
        const oldProductType = existingProduct.productType || "";
        const oldShopifyCategoryId = existingProduct.shopifyCategoryId || "";
        const oldShopifyCategoryPath = existingProduct.shopifyCategoryPath || "";
        const oldBulletPoints = JSON.stringify(existingProduct.bulletPoints || []);

        const newHandle = shopifyProduct.handle;
        const newTitle = shopifyProduct.title;
        const newVendor = shopifyProduct.vendor;
        const newImages = shopifyProduct.images.edges.map((edge) => edge.node.url);
        const newImagesStr = JSON.stringify(newImages);
        const newDescription = shopifyProduct.descriptionHtml || shopifyProduct.description || "";
        const newTags = shopifyProduct.tags.join(', ');
        const newProductType = shopifyProduct.productType || "";
        const newShopifyCategoryId = shopifyProduct.category?.id || "";
        const newShopifyCategoryPath = shopifyProduct.category?.fullName || "";

        // Extract style_number from metafields for updates too
        const styleNumberMetafield = shopifyProduct.metafields.edges.find(
          (edge) => edge.node.namespace === "custom" && edge.node.key === "style_number"
        );
        const newStyleNumber = styleNumberMetafield?.node.value || null;

        // Extract sales points from metafields for updates too
        const newBulletPoints: string[] = [];
        for (let i = 1; i <= 5; i++) {
          const salesPointMetafield = shopifyProduct.metafields.edges.find(
            (edge) => edge.node.namespace === "custom" && edge.node.key === `custom_sales_point_${i}`
          );
          if (salesPointMetafield?.node.value) {
            newBulletPoints.push(salesPointMetafield.node.value);
          }
        }
        const newBulletPointsStr = JSON.stringify(newBulletPoints);

        // Check if anything changed
        const statusChanged = oldStatus !== newStatus;
        const handleChanged = oldHandle !== newHandle;
        const styleNumberChanged = oldStyleNumber !== newStyleNumber;
        const titleChanged = oldTitle !== newTitle;
        const vendorChanged = oldVendor !== newVendor;
        const imagesChanged = oldImages !== newImagesStr;
        const descriptionChanged = oldDescription !== newDescription;
        const tagsChanged = oldTags !== newTags;
        const productTypeChanged = oldProductType !== newProductType;
        const shopifyCategoryChanged = oldShopifyCategoryId !== newShopifyCategoryId || oldShopifyCategoryPath !== newShopifyCategoryPath;
        const bulletPointsChanged = oldBulletPoints !== newBulletPointsStr;

        // Log product-level changes to changeLog for sync history UI
        if (statusChanged) {
          changeLog.push({
            productId: existingProduct.id,
            productTitle: shopifyProduct.title,
            variantTitle: undefined,
            field: 'status',
            oldValue: oldStatus || null,
            newValue: newStatus,
          });
        }
        if (titleChanged) {
          changeLog.push({
            productId: existingProduct.id,
            productTitle: shopifyProduct.title,
            variantTitle: undefined,
            field: 'title',
            oldValue: oldTitle || null,
            newValue: newTitle,
          });
        }
        if (handleChanged) {
          changeLog.push({
            productId: existingProduct.id,
            productTitle: shopifyProduct.title,
            variantTitle: undefined,
            field: 'handle',
            oldValue: oldHandle || null,
            newValue: newHandle,
          });
        }
        if (descriptionChanged) {
          changeLog.push({
            productId: existingProduct.id,
            productTitle: shopifyProduct.title,
            variantTitle: undefined,
            field: 'description',
            oldValue: oldDescription || null,
            newValue: newDescription,
          });
        }
        if (vendorChanged) {
          changeLog.push({
            productId: existingProduct.id,
            productTitle: shopifyProduct.title,
            variantTitle: undefined,
            field: 'vendor',
            oldValue: oldVendor || null,
            newValue: newVendor,
          });
        }
        if (tagsChanged) {
          changeLog.push({
            productId: existingProduct.id,
            productTitle: shopifyProduct.title,
            variantTitle: undefined,
            field: 'tags',
            oldValue: oldTags || null,
            newValue: newTags,
          });
        }
        if (productTypeChanged) {
          changeLog.push({
            productId: existingProduct.id,
            productTitle: shopifyProduct.title,
            variantTitle: undefined,
            field: 'productType',
            oldValue: oldProductType || null,
            newValue: newProductType,
          });
        }
        if (shopifyCategoryChanged) {
          changeLog.push({
            productId: existingProduct.id,
            productTitle: shopifyProduct.title,
            variantTitle: undefined,
            field: 'shopifyCategoryPath',
            oldValue: oldShopifyCategoryPath || null,
            newValue: newShopifyCategoryPath,
          });
        }
        if (styleNumberChanged) {
          changeLog.push({
            productId: existingProduct.id,
            productTitle: shopifyProduct.title,
            variantTitle: undefined,
            field: 'styleNumber',
            oldValue: oldStyleNumber || null,
            newValue: newStyleNumber,
          });
        }
        if (imagesChanged) {
          // Format images as count change for readability
          const oldImageCount = (existingProduct.images || []).length;
          const newImageCount = newImages.length;
          changeLog.push({
            productId: existingProduct.id,
            productTitle: shopifyProduct.title,
            variantTitle: undefined,
            field: 'images',
            oldValue: `${oldImageCount} images`,
            newValue: `${newImageCount} images`,
          });
        }
        if (bulletPointsChanged) {
          const oldCount = (existingProduct.bulletPoints || []).length;
          const newCount = newBulletPoints.length;
          changeLog.push({
            productId: existingProduct.id,
            productTitle: shopifyProduct.title,
            variantTitle: undefined,
            field: 'bulletPoints',
            oldValue: `${oldCount} bullet points`,
            newValue: `${newCount} bullet points`,
          });
        }

        if (statusChanged || handleChanged || styleNumberChanged || titleChanged || vendorChanged || imagesChanged || descriptionChanged || tagsChanged || productTypeChanged || shopifyCategoryChanged || bulletPointsChanged) {
          if (statusChanged) {
            // Status changed! Log it to history
            await db.insert(productStatusHistory).values({
              productId: existingProduct.id,
              shopifyProductId: undefined, // We're tracking products table, not shopifyProducts
              oldStatus,
              newStatus,
              changedAt: new Date(),
              changedBy: undefined, // No user - it's from Shopify sync
              changeSource: 'import',
              notes: `Status changed from ${oldStatus} to ${newStatus} during Shopify import`,
              metadata: {
                shopifyUpdatedAt: shopifyProduct.updatedAt,
                shopifyHandle: shopifyProduct.handle,
              },
            });
          }

          // Update product with all changed fields
          const updateData: any = { updatedAt: new Date() };
          if (statusChanged) updateData.status = newStatus;
          if (handleChanged) updateData.handle = newHandle;
          if (styleNumberChanged) updateData.styleNumber = newStyleNumber;
          if (titleChanged) updateData.title = newTitle;
          if (vendorChanged) updateData.vendor = newVendor;
          if (imagesChanged) updateData.images = newImages;
          if (descriptionChanged) updateData.description = newDescription;
          if (tagsChanged) updateData.tags = newTags; // ✅ FIX: Sync tags on update
          if (productTypeChanged) updateData.productType = newProductType; // ✅ FIX: Sync productType on update
          if (shopifyCategoryChanged) {
            updateData.shopifyCategoryId = newShopifyCategoryId || null; // ✅ Sync Shopify category ID
            updateData.shopifyCategoryPath = newShopifyCategoryPath || null; // ✅ Sync Shopify category path
          }
          if (bulletPointsChanged) updateData.bulletPoints = newBulletPoints; // ✅ Sync bullet points on update
          // ✅ Always update Shopify's updatedAt timestamp on sync
          if (shopifyProduct.updatedAt) {
            updateData.shopifyUpdatedAt = new Date(shopifyProduct.updatedAt);
          }

          // MULTI-TENANT NOTE: Use updateProductByShopifyId since we already verified ownership in route
          await storage.updateProductByShopifyId(shopifyProductId, updateData);

          // ✅ Collections are now synced using optimized batch operations at the end of import

          const changes = [];
          if (statusChanged) changes.push(`status: ${oldStatus} → ${newStatus}`);
          if (handleChanged) changes.push(`handle: ${oldHandle || 'null'} → ${newHandle}`);
          if (styleNumberChanged) changes.push(`styleNumber: ${oldStyleNumber || 'null'} → ${newStyleNumber || 'null'}`);
          if (titleChanged) changes.push(`title updated`);
          if (vendorChanged) changes.push(`vendor: ${oldVendor} → ${newVendor}`);
          if (imagesChanged) changes.push(`images: ${(existingProduct.images || []).length} → ${newImages.length} images`);
          if (descriptionChanged) changes.push(`description updated`);
          if (tagsChanged) changes.push(`tags updated: ${oldTags.split(',').length} → ${newTags.split(',').length} tags`);
          if (productTypeChanged) changes.push(`productType: ${oldProductType || 'null'} → ${newProductType}`);
          if (shopifyCategoryChanged) changes.push(`shopifyCategory: ${oldShopifyCategoryPath || 'null'} → ${newShopifyCategoryPath || 'null'}`);
          if (bulletPointsChanged) changes.push(`bulletPoints: ${(existingProduct.bulletPoints || []).length} → ${newBulletPoints.length} points`);

          return { success: true, product: existingProduct, updated: true, changeLog };
        }

        // ✅ Collections are now synced using optimized batch operations at the end of import

        // If variants/options were updated but no product-level changes, still count as updated
        if (variantsOrOptionsUpdated) {
          return { success: true, product: existingProduct, updated: true, changeLog };
        }

        return { success: true, skipped: true, changeLog };
      }

      // MULTI-TENANT: Find or create vendor within tenant scope
      if (!this.currentTenantId) {
        return { success: false, error: "No tenant context available" };
      }
      let vendor = await storage.getVendorByName(this.currentTenantId, shopifyProduct.vendor);
      let vendorCreated = false;
      if (!vendor) {
        vendor = await storage.createVendor({ name: shopifyProduct.vendor, tenantId: this.currentTenantId });
        vendorCreated = true;
        console.log(`Created new vendor: ${shopifyProduct.vendor}`);
      }

      // Get first variant for pricing/SKU (we'll use first variant as primary)
      const firstVariant = shopifyProduct.variants.edges[0]?.node;
      if (!firstVariant) {
        return {
          success: false,
          error: "Product has no variants",
        };
      }

      // Extract style_number from metafields (namespace: "custom", key: "style_number")
      const styleNumberMetafield = shopifyProduct.metafields.edges.find(
        (edge) => edge.node.namespace === "custom" && edge.node.key === "style_number"
      );

      // Extract sales points from metafields (custom.custom_sales_point_1 through custom_sales_point_5)
      const bulletPoints: string[] = [];
      for (let i = 1; i <= 5; i++) {
        const salesPointMetafield = shopifyProduct.metafields.edges.find(
          (edge) => edge.node.namespace === "custom" && edge.node.key === `custom_sales_point_${i}`
        );
        if (salesPointMetafield?.node.value) {
          bulletPoints.push(salesPointMetafield.node.value);
        }
      }

      // Map Shopify product to our schema
      const productData: Partial<Product> = {
        tenantId: this.currentTenantId!, // ✅ FIX: Set tenant_id for multi-tenant isolation
        title: shopifyProduct.title,
        description: shopifyProduct.descriptionHtml || shopifyProduct.description || "",
        vendor: shopifyProduct.vendor,
        vendorId: vendor.id,
        category: shopifyProduct.productType || undefined,
        productType: shopifyProduct.productType || undefined, // ✅ FIX: Sync productType to productType field
        shopifyCategoryId: shopifyProduct.category?.id || undefined, // ✅ Sync Shopify category ID
        shopifyCategoryPath: shopifyProduct.category?.fullName || undefined, // ✅ Sync Shopify category path
        // Note: sku and price are stored in product_variants table, not in products
        // Variant data is preserved in metadata.variants below
        styleNumber: styleNumberMetafield?.node.value || undefined, // ✅ Extract style number from metafields
        bulletPoints: bulletPoints.length > 0 ? bulletPoints : [], // ✅ Extract sales points from metafields
        status: this.mapShopifyStatus(shopifyProduct.status),
        publishStatus: "published", // It's from Shopify, so it's published
        shopifyProductId,
        handle: shopifyProduct.handle, // ✅ Sync handle to products table
        publishedAt: shopifyProduct.publishedAt ? new Date(shopifyProduct.publishedAt) : new Date(),
        images: shopifyProduct.images.edges.map((edge) => edge.node.url),
        tags: shopifyProduct.tags.join(', '), // ✅ FIX: Sync tags as comma-separated string to tags field
        generatedKeywords: shopifyProduct.tags, // Keep for AI-generated keywords
        // ✅ Shopify timestamps (actual creation/update dates from Shopify)
        shopifyCreatedAt: shopifyProduct.createdAt ? new Date(shopifyProduct.createdAt) : undefined,
        shopifyUpdatedAt: shopifyProduct.updatedAt ? new Date(shopifyProduct.updatedAt) : undefined,
        // ✅ First sync date - only set for new products (existing products retain their firstSyncedAt)
        firstSyncedAt: new Date(),
        metadata: {
          shopifyHandle: shopifyProduct.handle,
          shopifyCreatedAt: shopifyProduct.createdAt,
          shopifyUpdatedAt: shopifyProduct.updatedAt,
          variants: shopifyProduct.variants.edges.map((edge) => ({
            id: edge.node.id.split("/").pop(),
            title: edge.node.title,
            sku: edge.node.sku,
            price: edge.node.price,
            compareAtPrice: edge.node.compareAtPrice,
            inventoryQuantity: edge.node.inventoryQuantity,
          })),
          metafields: shopifyProduct.metafields.edges.map((edge) => ({
            namespace: edge.node.namespace,
            key: edge.node.key,
            value: edge.node.value,
            type: edge.node.type,
          })),
        },
      };

      // Create product in database
      const createdProduct = await storage.createProduct(productData as any);

      // Log initial status to history (db and productStatusHistory already imported above)
      await db.insert(productStatusHistory).values({
        productId: createdProduct.id,
        shopifyProductId: undefined,
        oldStatus: null, // Initial import - no previous status
        newStatus: productData.status!,
        changedAt: new Date(),
        changedBy: undefined,
        changeSource: 'import',
        notes: 'Initial import from Shopify',
        metadata: {
          shopifyCreatedAt: shopifyProduct.createdAt,
          shopifyUpdatedAt: shopifyProduct.updatedAt,
          shopifyHandle: shopifyProduct.handle,
        },
      });

      // Sync product-collection relationships
      if (shopifyProduct.collections && shopifyProduct.collections.edges.length > 0) {
        // Process each collection
        for (const edge of shopifyProduct.collections.edges) {
          try {
            const shopifyCollection = edge.node;
            const shopifyCollectionGid = shopifyCollection.id; // Keep full GID format

            // Find or create local collection - MULTI-TENANT
            let localCollection = await storage.getCollectionByShopifyId(this.currentTenantId!, shopifyCollectionGid);

            if (!localCollection) {
              // Collection doesn't exist locally - create it - MULTI-TENANT
              const collectionType = shopifyCollection.ruleSet ? "smart" : "manual";
              console.log(`Creating new collection from Shopify: ${shopifyCollection.title} (${shopifyCollectionGid}) [${collectionType}]`);
              localCollection = await storage.createCollection(this.currentTenantId!, {
                name: shopifyCollection.title,
                description: shopifyCollection.description || undefined,
                shopifyCollectionId: shopifyCollectionGid,
                slug: shopifyCollection.handle, // Use Shopify handle as slug
                shopifyType: collectionType as "manual" | "smart",
                rules: convertShopifyRuleSet(shopifyCollection.ruleSet), // ✅ Store collection rules
              });
            }

            // Add product to collection (skip count update for performance - will update all counts at end)
            await storage.addProductsToCollection(localCollection.id, [createdProduct.id], true);
          } catch (collError) {
            // Log but don't fail the product import if collection sync fails
            console.warn(`Failed to sync collection for product ${shopifyProductId}:`, collError);
          }
        }
      }

      // ✅ PHASE B.9.1: Sync variants and options using helper method
      const syncResult = await this.syncProductVariantsAndOptions(
        createdProduct.id,
        shopifyProduct,
        shopifyProductId
      );

      console.log(
        `Imported product: ${createdProduct.title} (${shopifyProductId}) - ` +
        `Initial status: ${productData.status} - ` +
        `Created ${syncResult.variantsCreated} variants, ` +
        `updated ${syncResult.variantsUpdated} variants, ` +
        `created ${syncResult.optionsCreated} options ` +
        `(${syncResult.variantsSkipped} skipped)` +
        (syncResult.errors.length > 0 ? ` - ${syncResult.errors.length} errors` : '')
      );

      return {
        success: true,
        product: createdProduct,
        vendorCreated,
        changeLog: syncResult.changeLog,
      };
    } catch (error: any) {
      console.error(`Error importing product ${shopifyProduct.id}:`, error);
      return {
        success: false,
        error: error.message || "Failed to import product",
      };
    }
  }

  /**
   * Map Shopify status to our status enum
   */
  private mapShopifyStatus(shopifyStatus: string): "active" | "draft" | "archived" {
    switch (shopifyStatus.toLowerCase()) {
      case "active":
        return "active";
      case "draft":
        return "draft";
      case "archived":
        return "archived";
      default:
        return "active";
    }
  }

  /**
   * Make a GraphQL request to Shopify Admin API with retry logic
   */
  private async makeShopifyRequest<T>(query: string, variables?: any, retryCount: number = 0): Promise<T> {
    const maxRetries = 3;
    const baseDelay = 2000; // 2 seconds

    const url = `https://${this.storeUrl}/admin/api/${this.apiVersion}/graphql.json`;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": this.accessToken,
        },
        body: JSON.stringify({ query, variables }),
      });

      if (!response.ok) {
        if (response.status === 403) {
          throw new Error(
            "Permission denied. The Shopify app needs 'read_products' scope. " +
              "Please verify app permissions in Shopify admin settings."
          );
        }
        if (response.status === 429) {
          // HTTP 429 rate limit - retry with exponential backoff
          if (retryCount < maxRetries) {
            const delay = baseDelay * Math.pow(2, retryCount);
            console.warn(`Rate limit hit (429), retrying in ${delay}ms... (attempt ${retryCount + 1}/${maxRetries})`);
            await this.sleep(delay);
            return this.makeShopifyRequest<T>(query, variables, retryCount + 1);
          }
          throw new Error("Rate limit exceeded. Please try again later.");
        }
        throw new Error(`Shopify API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      // Check for GraphQL errors (including THROTTLED)
      if (data.errors && data.errors.length > 0) {
        // Check if it's a throttle error
        const isThrottled = data.errors.some((error: any) =>
          error.extensions?.code === "THROTTLED"
        );

        if (isThrottled && retryCount < maxRetries) {
          // Exponential backoff for throttle errors
          const delay = baseDelay * Math.pow(2, retryCount);
          console.warn(`GraphQL throttled, retrying in ${delay}ms... (attempt ${retryCount + 1}/${maxRetries})`);
          await this.sleep(delay);
          return this.makeShopifyRequest<T>(query, variables, retryCount + 1);
        }

        throw new Error(`Shopify GraphQL error: ${JSON.stringify(data.errors)}`);
      }

      return data as T;
    } catch (error) {
      // If it's a network error and we haven't exhausted retries, try again
      if (retryCount < maxRetries && error instanceof Error && error.message.includes("fetch")) {
        const delay = baseDelay * Math.pow(2, retryCount);
        console.warn(`Network error, retrying in ${delay}ms... (attempt ${retryCount + 1}/${maxRetries})`);
        await this.sleep(delay);
        return this.makeShopifyRequest<T>(query, variables, retryCount + 1);
      }
      throw error;
    }
  }

  /**
   * Sync a single product from Shopify by Shopify Product ID
   * Returns detailed information about what was synced/updated
   */
  async syncSingleProduct(shopifyProductId: string): Promise<{
    success: boolean;
    error?: string;
    product?: Product;
    changes?: string[];
    updated?: boolean;
  }> {
    this.checkCredentials();

    try {
      console.log(`Syncing single product from Shopify: ${shopifyProductId}`);

      // 1. Build GraphQL query to fetch single product
      const query = `
        query GetProduct($id: ID!) {
          product(id: $id) {
            id
            title
            description
            descriptionHtml
            vendor
            productType
            handle
            status
            tags
            createdAt
            updatedAt
            publishedAt
            options {
              id
              name
              position
              values
            }
            variants(first: 100) {
              edges {
                node {
                  id
                  title
                  sku
                  barcode
                  price
                  compareAtPrice
                  inventoryQuantity
                  selectedOptions {
                    name
                    value
                  }
                  inventoryItem {
                    id
                    unitCost {
                      amount
                    }
                    measurement {
                      weight {
                        value
                        unit
                      }
                    }
                  }
                  image {
                    url
                  }
                }
              }
            }
            images(first: 10) {
              edges {
                node {
                  url
                  altText
                }
              }
            }
            metafields(first: 50) {
              edges {
                node {
                  namespace
                  key
                  value
                  type
                }
              }
            }
            collections(first: 250) {
              edges {
                node {
                  id
                  title
                  handle
                  description
                  ruleSet {
                    appliedDisjunctively
                    rules {
                      column
                      relation
                      condition
                    }
                  }
                }
              }
            }
          }
        }
      `;

      // 2. Prepare Shopify GraphQL ID format (gid://shopify/Product/123)
      const shopifyGid = shopifyProductId.startsWith("gid://")
        ? shopifyProductId
        : `gid://shopify/Product/${shopifyProductId}`;

      const variables = { id: shopifyGid };

      // 3. Make request to Shopify
      console.log(`Fetching product from Shopify: ${shopifyGid}`);
      const response = await this.makeShopifyRequest<{
        data: { product: ShopifyProduct | null };
      }>(query, variables);

      // 4. Check if product exists on Shopify
      if (!response?.data?.product) {
        console.error(`Product not found on Shopify: ${shopifyProductId}`);
        return {
          success: false,
          error: "Product not found on Shopify. It may have been deleted."
        };
      }

      // 5. Import/update product using existing logic
      console.log(`Importing product: ${response.data.product.title}`);
      const importResult = await this.importSingleProduct(response.data.product);

      if (!importResult.success) {
        console.error(`Failed to import product: ${importResult.error}`);
        return {
          success: false,
          error: importResult.error || "Failed to sync product"
        };
      }

      // 6. Build detailed change log
      const changes: string[] = [];

      if (importResult.updated) {
        changes.push("Product data updated from Shopify");

        // Add specific field changes if available
        if (importResult.changeLog && importResult.changeLog.length > 0) {
          importResult.changeLog.forEach(change => {
            changes.push(`${change.field}: ${change.oldValue} → ${change.newValue}`);
          });
        }
      } else if (importResult.skipped) {
        changes.push("No changes detected - product is already up to date");
      } else {
        // New product was created
        changes.push("Product imported from Shopify for the first time");
      }

      console.log(`Product sync complete: ${changes.join(", ")}`);

      return {
        success: true,
        product: importResult.product,
        changes: changes.length > 0 ? changes : ["Product synced successfully"],
        updated: importResult.updated || false
      };

    } catch (error: any) {
      console.error("Error in syncSingleProduct:", error);

      // Provide more specific error messages
      let errorMessage = error.message || "Failed to sync product from Shopify";

      if (errorMessage.includes("fetch")) {
        errorMessage = "Network error - unable to connect to Shopify";
      } else if (errorMessage.includes("403")) {
        errorMessage = "Permission denied - check Shopify API credentials";
      } else if (errorMessage.includes("Rate limit")) {
        errorMessage = "Shopify rate limit exceeded - please try again in a few minutes";
      }

      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Test connection to Shopify API
   */
  async testConnection(): Promise<boolean> {
    this.checkCredentials();

    try {
      const query = `
        query {
          shop {
            name
            email
            myshopifyDomain
          }
        }
      `;

      const response = await this.makeShopifyRequest<{ data: { shop: any } }>(query);
      console.log("Shopify connection successful:", response.data.shop.name);
      return true;
    } catch (error: any) {
      console.error("Shopify connection failed:", error.message);
      return false;
    }
  }
}

// Export singleton instance
export const shopifyImportService = new ShopifyImportService();
