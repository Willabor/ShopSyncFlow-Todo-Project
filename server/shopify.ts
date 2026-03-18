import { shopifyApi, ApiVersion, LogSeverity } from "@shopify/shopify-api";
import { createAdminApiClient } from "@shopify/admin-api-client";
import { storage } from "./storage";
import type { Product, ShopifyStore } from "@shared/schema";

// Helper function to verify webhook HMAC (Shopify sends base64 digest only)
function verifyWebhookSignature(rawBody: string | Buffer, signature: string, secret: string): boolean {
  if (!signature || !secret) return false;

  const crypto = require('crypto');
  const expectedHash = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature, 'utf8'),
    Buffer.from(expectedHash, 'utf8')
  );
}

export interface ShopifyProductData {
  title: string;
  body_html?: string;
  vendor: string;
  product_type?: string;
  handle?: string;
  status: "active" | "draft" | "archived";
  images?: Array<{
    src: string;
    alt?: string;
  }>;
  variants: Array<{
    title?: string;
    price: string;
    sku?: string;
    inventory_quantity?: number;
    inventory_management?: string;
    inventory_policy?: string;
  }>;
  tags?: string;
  metafields?: Array<{
    namespace: string;
    key: string;
    value: string;
    type: string;
  }>;
}

export class ShopifyService {
  verifyWebhookSignature(rawBody: string | Buffer, signature: string, secret: string): boolean {
    return verifyWebhookSignature(rawBody, signature, secret);
  }
  private getAdminClient(store: ShopifyStore) {
    return createAdminApiClient({
      storeDomain: store.shopDomain,
      apiVersion: ApiVersion.January25,
      accessToken: store.accessToken,
    });
  }

  /**
   * Find a collection by title, or create it if it doesn't exist
   * Returns the collection ID
   */
  private async findOrCreateCollection(client: any, collectionTitle: string): Promise<string | null> {
    try {
      // First, search for existing collection by title
      const searchResponse = await client.request(`
        query findCollection($query: String!) {
          collections(first: 1, query: $query) {
            edges {
              node {
                id
                title
              }
            }
          }
        }
      `, {
        variables: {
          query: `title:${collectionTitle}`
        }
      });

      const existingCollection = searchResponse.data?.collections?.edges?.[0]?.node;

      if (existingCollection) {
        console.log(`Found existing collection: ${existingCollection.title} (${existingCollection.id})`);
        return existingCollection.id;
      }

      // Collection doesn't exist, create it
      console.log(`Creating new collection: ${collectionTitle}`);
      const createResponse = await client.request(`
        mutation createCollection($input: CollectionInput!) {
          collectionCreate(input: $input) {
            collection {
              id
              title
            }
            userErrors {
              field
              message
            }
          }
        }
      `, {
        variables: {
          input: {
            title: collectionTitle,
            ruleSet: {
              appliedDisjunctively: false,
              rules: [] // Manual collection (no auto-rules)
            }
          }
        }
      });

      const userErrors = createResponse.data?.collectionCreate?.userErrors;
      if (userErrors && userErrors.length > 0) {
        console.error(`Error creating collection "${collectionTitle}":`, userErrors);
        return null;
      }

      const newCollection = createResponse.data?.collectionCreate?.collection;
      if (newCollection) {
        console.log(`Created collection: ${newCollection.title} (${newCollection.id})`);
        return newCollection.id;
      }

      return null;
    } catch (error) {
      console.error(`Error finding/creating collection "${collectionTitle}":`, error);
      return null;
    }
  }

  // MULTI-TENANT: Requires tenantId for store and mapping lookup
  async publishProduct(tenantId: string, product: Product): Promise<{ shopifyProductId: string; handle: string } | null> {
    try {
      // Get active Shopify store - MULTI-TENANT
      const store = await storage.getActiveShopifyStore(tenantId);
      if (!store) {
        console.log("No active Shopify store configured, skipping product publishing");
        return null;
      }

      if (!store.accessToken) {
        console.error("Shopify store has no access token configured");
        return null;
      }

      // Fetch product variants (needed for SKU and price)
      const productVariants = await storage.getProductVariants(product.id);
      const firstVariant = productVariants[0]; // Use first variant for single-variant products

      // Check if product is already published - MULTI-TENANT
      const existingMapping = await storage.getShopifyProductMapping(tenantId, product.id);
      if (existingMapping) {
        console.log(`Product ${product.id} already published to Shopify as ${existingMapping.shopifyProductId}`);
        return { 
          shopifyProductId: existingMapping.shopifyProductId, 
          handle: existingMapping.shopifyHandle || "" 
        };
      }

      const client = this.getAdminClient(store);

      // Prepare GraphQL ProductInput (using proper GraphQL structure, not REST API)
      const productInput: any = {
        title: product.title,
        descriptionHtml: product.description || "",
        vendor: product.vendor,
        productType: product.category || "", // Internal category as product_type
        status: "ACTIVE",
      };

      // Add custom handle if available (for SEO-optimized URLs)
      if (product.handle) {
        productInput.handle = product.handle;
        console.log(`📎 Using custom handle: ${product.handle}`);
      }

      // Add Google Shopping Category (Shopify Standard Product Taxonomy)
      if (product.shopifyCategoryId) {
        productInput.category = product.shopifyCategoryId;
      }

      // Add tags (convert from comma-separated string to array if needed)
      if (product.tags) {
        const tagsArray = typeof product.tags === 'string'
          ? product.tags.split(',').map(t => t.trim()).filter(t => t)
          : product.tags;
        productInput.tags = tagsArray;
      }

      // Add collections (if we have collections field in product)
      // Note: Collections require collection IDs, not just names
      // For now, we'll skip this as it requires looking up collection IDs

      // Add variants
      productInput.variants = [{
        price: firstVariant?.price || "0.00",
        sku: firstVariant?.sku || "",
        inventoryQuantities: {
          availableQuantity: 100, // Default inventory
          locationId: "gid://shopify/Location/default" // Would need actual location ID
        }
      }];

      // Add images if available
      if (product.images && product.images.length > 0) {
        productInput.images = product.images.map(img => ({
          src: img,
          altText: product.title,
        }));
      }

      // Add metadata if available
      if (product.metadata || product.orderNumber) {
        productInput.metafields = [];

        if (product.orderNumber) {
          productInput.metafields.push({
            namespace: "workflow",
            key: "order_number",
            value: product.orderNumber,
            type: "single_line_text_field",
          });
        }

        if (product.metadata) {
          productInput.metafields.push({
            namespace: "workflow",
            key: "internal_metadata",
            value: JSON.stringify(product.metadata),
            type: "json",
          });
        }
      }

      // Create product in Shopify
      const response = await client.request(`
        mutation productCreate($input: ProductInput!) {
          productCreate(input: $input) {
            product {
              id
              handle
              title
              status
              category {
                id
                name
                fullName
              }
            }
            userErrors {
              field
              message
            }
          }
        }
      `, {
        variables: {
          input: productInput,
        },
      });

      if (response.data?.productCreate?.userErrors?.length > 0) {
        console.error("Shopify product creation errors:", response.data.productCreate.userErrors);
        return null;
      }

      const shopifyProductData = response.data?.productCreate?.product;
      if (!shopifyProductData) {
        console.error("No product data returned from Shopify");
        return null;
      }

      // Extract numeric ID from Shopify GQL ID
      const shopifyProductId = shopifyProductData.id.split('/').pop() || shopifyProductData.id;

      // Add product to collections using join table
      const productCollections = await storage.getProductCollections(product.id);

      if (productCollections.length > 0) {
        console.log(`Adding product to ${productCollections.length} collections...`);

        const shopifyCollectionIds: string[] = [];
        const collectionsToUpdate: Array<{ collectionId: string; shopifyId: string; handle: string }> = [];

        // For each collection, find or create in Shopify
        for (const collection of productCollections) {
          let shopifyCollectionId = collection.shopifyCollectionId;

          // If collection doesn't have a Shopify ID yet, create it
          if (!shopifyCollectionId) {
            console.log(`Creating collection "${collection.name}" in Shopify...`);
            const createdId = await this.findOrCreateCollection(client, collection.name);

            if (createdId) {
              shopifyCollectionId = createdId;

              // Extract handle from Shopify response (we'll need to query for it)
              const collectionQuery = await client.request(`
                query getCollection($id: ID!) {
                  collection(id: $id) {
                    handle
                  }
                }
              `, {
                variables: { id: createdId }
              });

              const handle = collectionQuery.data?.collection?.handle || collection.slug;

              // Queue for database update
              collectionsToUpdate.push({
                collectionId: collection.id,
                shopifyId: createdId,
                handle
              });
            }
          }

          if (shopifyCollectionId) {
            shopifyCollectionIds.push(shopifyCollectionId);
          }
        }

        // Update local collections with Shopify IDs - MULTI-TENANT
        for (const update of collectionsToUpdate) {
          try {
            await storage.updateCollection(tenantId, update.collectionId, {
              shopifyCollectionId: update.shopifyId,
              shopifyHandle: update.handle,
              syncedAt: new Date()
            });
            console.log(`✅ Updated collection ${update.collectionId} with Shopify ID`);
          } catch (error) {
            console.error(`Error updating collection ${update.collectionId}:`, error);
          }
        }

        // Add product to all Shopify collections
        if (shopifyCollectionIds.length > 0) {
          try {
            for (const collectionId of shopifyCollectionIds) {
              await client.request(`
                mutation addProductToCollection($id: ID!, $productIds: [ID!]!) {
                  collectionAddProducts(id: $id, productIds: $productIds) {
                    userErrors {
                      field
                      message
                    }
                  }
                }
              `, {
                variables: {
                  id: collectionId,
                  productIds: [shopifyProductData.id]
                }
              });
            }

            console.log(`✅ Added product to ${shopifyCollectionIds.length} Shopify collections`);
          } catch (error) {
            console.error("Error adding product to Shopify collections:", error);
          }
        }
      }

      // Store mapping in database - MULTI-TENANT
      await storage.createShopifyProductMapping(tenantId, {
        productId: product.id,
        shopifyStoreId: store.id,
        shopifyProductId,
        shopifyHandle: shopifyProductData.handle,
        status: shopifyProductData.status,
      });

      // Log success with category info
      let successMessage = `Successfully published product ${product.id} to Shopify as ${shopifyProductId}`;
      if (shopifyProductData.category) {
        successMessage += ` | Category: ${shopifyProductData.category.fullName}`;
      }
      console.log(successMessage);

      return {
        shopifyProductId,
        handle: shopifyProductData.handle,
      };

    } catch (error) {
      console.error("Error publishing product to Shopify:", error);
      return null;
    }
  }

  /**
   * Update product handle on Shopify
   * Updates an existing Shopify product's URL handle
   * MULTI-TENANT: Requires tenantId for product lookup
   */
  async updateProductHandle(
    tenantId: string,
    productId: string,
    newHandle: string
  ): Promise<{ success: boolean; handle?: string; error?: string }> {
    try {
      console.log("\n🔄 ===== UPDATE PRODUCT HANDLE START =====");
      console.log(`📝 Product ID: ${productId}`);
      console.log(`📝 New Handle: ${newHandle}`);

      // Get active Shopify store - MULTI-TENANT
      const store = await storage.getActiveShopifyStore(tenantId);
      if (!store) {
        console.log("❌ No active Shopify store configured");
        return { success: false, error: "No active Shopify store configured" };
      }
      console.log(`✅ Store: ${store.shopDomain}`);

      // Get product to check if it's published to Shopify - MULTI-TENANT
      const product = await storage.getProduct(tenantId, productId);
      if (!product || !product.shopifyProductId) {
        console.log("❌ Product not published to Shopify");
        return { success: false, error: "Product not published to Shopify" };
      }
      console.log(`✅ Shopify Product ID: ${product.shopifyProductId}`);

      const client = this.getAdminClient(store);

      // The shopifyProductId might already be a GID or just the numeric ID
      const shopifyGid = product.shopifyProductId.startsWith('gid://')
        ? product.shopifyProductId
        : `gid://shopify/Product/${product.shopifyProductId}`;
      console.log(`📝 Shopify GID: ${shopifyGid}`);

      // Update product handle using GraphQL mutation
      console.log("\n🚀 Sending GraphQL mutation to Shopify...");
      console.log("GraphQL Variables:", JSON.stringify({
        input: {
          id: shopifyGid,
          handle: newHandle,
        },
      }, null, 2));

      const response = await client.request(`
        mutation productUpdate($input: ProductInput!) {
          productUpdate(input: $input) {
            product {
              id
              handle
            }
            userErrors {
              field
              message
            }
          }
        }
      `, {
        variables: {
          input: {
            id: shopifyGid,
            handle: newHandle,
          },
        },
      });

      console.log("\n📥 Shopify Response:");
      console.log(JSON.stringify(response, null, 2));

      if (response.data?.productUpdate?.userErrors?.length > 0) {
        const errors = response.data.productUpdate.userErrors;
        console.error("❌ Shopify handle update errors:", errors);
        return {
          success: false,
          error: errors.map((e: any) => e.message).join(", "),
        };
      }

      const updatedHandle = response.data?.productUpdate?.product?.handle;
      console.log(`📝 Updated handle from response: ${updatedHandle}`);

      if (!updatedHandle) {
        console.error("❌ No handle returned from Shopify");
        return { success: false, error: "No handle returned from Shopify" };
      }

      // Update local mapping with new handle (if mapping exists) - MULTI-TENANT
      const mapping = await storage.getShopifyProductMapping(tenantId, productId);
      if (mapping) {
        console.log(`💾 Updating local mapping...`);
        await storage.updateShopifyProductMapping(tenantId, mapping.id, {
          shopifyHandle: updatedHandle,
        });
      } else {
        console.log(`ℹ️  No mapping found to update (product uses shopifyProductId field directly)`);
      }

      console.log(`✅ Updated Shopify product ${product.shopifyProductId} handle to: ${updatedHandle}`);
      console.log("===== UPDATE PRODUCT HANDLE END =====\n");

      return { success: true, handle: updatedHandle };
    } catch (error) {
      console.error("\n❌ ERROR updating product handle on Shopify:");
      console.error(error);
      console.log("===== UPDATE PRODUCT HANDLE END (ERROR) =====\n");
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Batch update product handles on Shopify with rate limiting
   * Updates multiple product handles with delays to avoid API rate limits
   * MULTI-TENANT: Requires tenantId for product lookup
   */
  async batchUpdateHandles(
    tenantId: string,
    updates: Array<{ productId: string; handle: string }>
  ): Promise<{
    success: number;
    failed: number;
    results: Array<{
      productId: string;
      success: boolean;
      handle?: string;
      error?: string;
    }>;
  }> {
    const results = {
      success: 0,
      failed: 0,
      results: [] as Array<{
        productId: string;
        success: boolean;
        handle?: string;
        error?: string;
      }>,
    };

    console.log(`🔄 Starting batch handle update for ${updates.length} products...`);

    // Shopify REST Admin API has rate limit of 2 requests/second (burst) or 40 requests/second (standard)
    // GraphQL has cost-based rate limiting (1000 points/second)
    // To be safe, we'll use 500ms delay between requests (2 requests/second)
    const RATE_LIMIT_DELAY_MS = 500;

    for (let i = 0; i < updates.length; i++) {
      const update = updates[i];

      try {
        console.log(`[${i + 1}/${updates.length}] Updating handle for product ${update.productId}...`);

        // MULTI-TENANT: Pass tenantId to updateProductHandle
        const result = await this.updateProductHandle(tenantId, update.productId, update.handle);

        if (result.success) {
          results.success++;
          results.results.push({
            productId: update.productId,
            success: true,
            handle: result.handle,
          });
          console.log(`  ✅ Success: ${result.handle}`);
        } else {
          results.failed++;
          results.results.push({
            productId: update.productId,
            success: false,
            error: result.error,
          });
          console.log(`  ❌ Failed: ${result.error}`);
        }

        // Rate limiting: Wait before next request (except for last item)
        if (i < updates.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_DELAY_MS));
        }
      } catch (error) {
        results.failed++;
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        results.results.push({
          productId: update.productId,
          success: false,
          error: errorMessage,
        });
        console.log(`  ❌ Exception: ${errorMessage}`);
      }
    }

    console.log(`✅ Batch update complete: ${results.success} success, ${results.failed} failed`);

    return results;
  }

  /**
   * Update product category (productCategoryId) on Shopify for a specific product
   * This ONLY updates the category field, not any other product data
   * MULTI-TENANT: Requires tenantId for product lookup
   */
  async updateProductCategory(
    tenantId: string,
    productId: string,
    categoryGid: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      console.log(`\n🏷️  Updating product category for product ${productId} to ${categoryGid}`);

      // Get active Shopify store - MULTI-TENANT
      const store = await storage.getActiveShopifyStore(tenantId);
      if (!store) {
        return { success: false, error: "No active Shopify store configured" };
      }

      // Get product to check if it's published to Shopify - MULTI-TENANT
      const product = await storage.getProduct(tenantId, productId);
      if (!product || !product.shopifyProductId) {
        return { success: false, error: "Product not published to Shopify" };
      }

      const client = this.getAdminClient(store);

      // The shopifyProductId might already be a GID or just the numeric ID
      const shopifyGid = product.shopifyProductId.startsWith('gid://')
        ? product.shopifyProductId
        : `gid://shopify/Product/${product.shopifyProductId}`;

      // Update product category using GraphQL mutation
      const response = await client.request(`
        mutation productUpdate($input: ProductInput!) {
          productUpdate(input: $input) {
            product {
              id
              category {
                id
              }
            }
            userErrors {
              field
              message
            }
          }
        }
      `, {
        variables: {
          input: {
            id: shopifyGid,
            category: categoryGid
          },
        },
      });

      console.log("📥 Full Shopify response:", JSON.stringify(response, null, 2));

      if (response.data?.productUpdate?.userErrors?.length > 0) {
        const errors = response.data.productUpdate.userErrors;
        console.error("❌ Shopify category update errors:", errors);
        return {
          success: false,
          error: errors.map((e: any) => e.message).join(", "),
        };
      }

      const updatedCategory = response.data?.productUpdate?.product?.category;
      console.log(`📊 Updated category from response:`, JSON.stringify(updatedCategory, null, 2));
      console.log(`✅ Updated Shopify product ${product.shopifyProductId} category to: ${categoryGid}`);

      // Update the sync timestamp in our database - MULTI-TENANT
      await storage.updateProduct(tenantId, productId, {
        shopifyCategorySyncedAt: new Date(),
      });
      console.log(`⏰ Updated shopifyCategorySyncedAt timestamp for product ${productId}`);

      return { success: true };
    } catch (error) {
      console.error("❌ ERROR updating product category on Shopify:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Update variant weight on Shopify
   * MULTI-TENANT: Requires tenantId for store lookup
   */
  async updateVariantWeight(
    tenantId: string,
    shopifyVariantId: string,
    weight: number,
    weightUnit: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const stores = await storage.getShopifyStores(tenantId);
      if (!stores || stores.length === 0) {
        return { success: false, error: "No Shopify store connected" };
      }
      const store = stores[0]; // Use the first connected store

      const client = this.getAdminClient(store);

      // Convert weight unit to Shopify format
      const shopifyWeightUnit = this.convertToShopifyWeightUnit(weightUnit);

      // Ensure the variant ID is in GID format
      const variantGid = shopifyVariantId.startsWith("gid://")
        ? shopifyVariantId
        : `gid://shopify/ProductVariant/${shopifyVariantId}`;

      console.log(`📦 Updating variant ${variantGid} weight to ${weight} ${shopifyWeightUnit}`);

      // Step 1: Query the variant to get its product ID (required for productVariantsBulkUpdate in 2024-10+)
      const variantQuery = `
        query getVariant($id: ID!) {
          productVariant(id: $id) {
            id
            product {
              id
            }
          }
        }
      `;

      const variantResponse = await client.request(variantQuery, {
        variables: { id: variantGid },
      });

      const productId = variantResponse.data?.productVariant?.product?.id;
      if (!productId) {
        console.error(`❌ Could not find product ID for variant ${variantGid}`);
        return {
          success: false,
          error: `Could not find product ID for variant ${shopifyVariantId}`,
        };
      }

      console.log(`📋 Found product ID: ${productId} for variant ${variantGid}`);

      // Step 2: Use productVariantsBulkUpdate (the correct mutation for 2024-10+ API)
      const mutation = `
        mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
          productVariantsBulkUpdate(productId: $productId, variants: $variants) {
            product {
              id
            }
            productVariants {
              id
              inventoryItem {
                measurement {
                  weight {
                    value
                    unit
                  }
                }
              }
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      const response = await client.request(mutation, {
        variables: {
          productId: productId,
          variants: [
            {
              id: variantGid,
              inventoryItem: {
                measurement: {
                  weight: {
                    value: weight,
                    unit: shopifyWeightUnit,
                  },
                },
              },
            },
          ],
        },
      });

      // Log the full response for debugging
      console.log(`📋 Shopify response for ${shopifyVariantId}:`, JSON.stringify(response, null, 2));

      // Check for userErrors in the response
      const updateResult = response.data?.productVariantsBulkUpdate || (response as any).productVariantsBulkUpdate;

      if (updateResult?.userErrors?.length > 0) {
        const errors = updateResult.userErrors;
        console.error("❌ Shopify variant update errors:", errors);
        return {
          success: false,
          error: errors.map((e: any) => e.message).join(", "),
        };
      }

      // Log what Shopify actually returned for the variant
      const returnedVariants = updateResult?.productVariants;
      if (returnedVariants && returnedVariants.length > 0) {
        const v = returnedVariants[0];
        const weightInfo = v.inventoryItem?.measurement?.weight;
        console.log(`✅ Shopify confirmed: variant ${v.id} now has weight ${weightInfo?.value} ${weightInfo?.unit}`);
      } else {
        console.warn(`⚠️ No variant data returned from Shopify for ${shopifyVariantId}`);
      }

      console.log(`✅ Updated variant ${shopifyVariantId} weight to ${weight} ${weightUnit}`);
      return { success: true };
    } catch (error) {
      console.error("❌ ERROR updating variant weight on Shopify:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Convert weight unit to Shopify format
   */
  private convertToShopifyWeightUnit(unit: string): string {
    switch (unit.toLowerCase()) {
      case "lb":
      case "lbs":
      case "pound":
      case "pounds":
        return "POUNDS";
      case "oz":
      case "ounce":
      case "ounces":
        return "OUNCES";
      case "kg":
      case "kilogram":
      case "kilograms":
        return "KILOGRAMS";
      case "g":
      case "gram":
      case "grams":
        return "GRAMS";
      default:
        return "POUNDS"; // Default to pounds
    }
  }

  /**
   * Batch update product categories on Shopify with rate limiting
   * Updates only the category field for multiple products
   * MULTI-TENANT: Requires tenantId for product lookup
   */
  async batchUpdateCategories(
    tenantId: string,
    productIds: string[]
  ): Promise<{
    success: number;
    failed: number;
    skipped: number;
    results: Array<{
      productId: string;
      success: boolean;
      error?: string;
    }>;
  }> {
    const results = {
      success: 0,
      failed: 0,
      skipped: 0,
      results: [] as Array<{
        productId: string;
        success: boolean;
        error?: string;
      }>,
    };

    console.log(`🔄 Starting batch category sync for ${productIds.length} products...`);

    const RATE_LIMIT_DELAY_MS = 500; // 2 requests/second to be safe

    for (let i = 0; i < productIds.length; i++) {
      const productId = productIds[i];

      try {
        console.log(`[${i + 1}/${productIds.length}] Syncing category for product ${productId}...`);

        // Get product to check category - MULTI-TENANT
        const product = await storage.getProduct(tenantId, productId);

        if (!product) {
          results.skipped++;
          results.results.push({
            productId,
            success: false,
            error: "Product not found",
          });
          continue;
        }

        if (!product.shopifyProductId) {
          results.skipped++;
          results.results.push({
            productId,
            success: false,
            error: "Product not published to Shopify",
          });
          console.log(`  ⏭️  Skipped (not published to Shopify)`);
          continue;
        }

        if (!product.shopifyCategoryId) {
          results.skipped++;
          results.results.push({
            productId,
            success: false,
            error: "No Shopify category assigned",
          });
          console.log(`  ⏭️  Skipped (no category assigned)`);
          continue;
        }

        // MULTI-TENANT: Pass tenantId to updateProductCategory
        const result = await this.updateProductCategory(tenantId, productId, product.shopifyCategoryId);

        if (result.success) {
          results.success++;
          results.results.push({
            productId,
            success: true,
          });
          console.log(`  ✅ Success`);
        } else {
          results.failed++;
          results.results.push({
            productId,
            success: false,
            error: result.error,
          });
          console.log(`  ❌ Failed: ${result.error}`);
        }

        // Rate limiting: Wait before next request (except for last item)
        if (i < productIds.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_DELAY_MS));
        }
      } catch (error) {
        results.failed++;
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        results.results.push({
          productId,
          success: false,
          error: errorMessage,
        });
        console.log(`  ❌ Exception: ${errorMessage}`);
      }
    }

    console.log(`✅ Batch category sync complete: ${results.success} success, ${results.failed} failed, ${results.skipped} skipped`);

    return results;
  }

  /**
   * Sync product associations for a collection from Shopify
   * Fetches all products in the collection and updates local productCollections table
   */
  async syncCollectionProductsFromShopify(
    localCollectionId: string,
    shopifyCollectionId: string,
    shopifyClient: any
  ): Promise<{ synced: number; failed: number; errors: string[] }> {
    const result = {
      synced: 0,
      failed: 0,
      errors: [] as string[],
    };

    try {
      // Fetch all products in this collection from Shopify with pagination
      let hasNextPage = true;
      let cursor: string | null = null;
      const allProductIds: string[] = [];

      while (hasNextPage) {
        const query = `
          query getCollectionProducts($id: ID!, $first: Int!, $after: String) {
            collection(id: $id) {
              products(first: $first, after: $after) {
                edges {
                  node {
                    id
                  }
                  cursor
                }
                pageInfo {
                  hasNextPage
                }
              }
            }
          }
        `;

        const variables: any = { id: shopifyCollectionId, first: 250 };
        if (cursor) {
          variables.after = cursor;
        }

        const response = await shopifyClient.request(query, { variables });
        const edges = response.data?.collection?.products?.edges || [];

        // Extract product IDs (numeric part from gid://shopify/Product/123)
        for (const edge of edges) {
          const productId = edge.node.id.split('/').pop();
          if (productId) {
            allProductIds.push(productId);
          }
        }

        hasNextPage = response.data?.collection?.products?.pageInfo?.hasNextPage || false;
        if (edges.length > 0) {
          cursor = edges[edges.length - 1].cursor;
        }
      }

      console.log(`📥 Fetched ${allProductIds.length} products for collection from Shopify`);

      if (allProductIds.length === 0) {
        // Collection has no products, clear any existing associations
        const { db } = await import("./db");
        const { productCollections } = await import("@shared/schema");
        const { eq } = await import("drizzle-orm");

        await db
          .delete(productCollections)
          .where(eq(productCollections.collectionId, localCollectionId));

        console.log(`✅ Cleared products for empty collection`);
        return result;
      }

      // Match Shopify product IDs to local product IDs
      // MULTI-TENANT NOTE: Using getProductByShopifyId since Shopify IDs are globally unique
      const localProductIds: string[] = [];
      for (const shopifyProductId of allProductIds) {
        try {
          const localProducts = await storage.getProductByShopifyId(shopifyProductId);
          if (localProducts.length > 0) {
            localProductIds.push(localProducts[0].id);
            result.synced++;
          } else {
            result.failed++;
            result.errors.push(`Product ${shopifyProductId} not found in local database`);
          }
        } catch (error) {
          result.failed++;
          result.errors.push(`Error matching product ${shopifyProductId}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      if (localProductIds.length > 0) {
        // Clear existing associations for this collection
        const { db } = await import("./db");
        const { productCollections } = await import("@shared/schema");
        const { eq } = await import("drizzle-orm");

        await db
          .delete(productCollections)
          .where(eq(productCollections.collectionId, localCollectionId));

        // Add new associations (storage method handles position and deduplication)
        await storage.addProductsToCollection(localCollectionId, localProductIds);

        console.log(`✅ Synced ${localProductIds.length} products to collection`);
      }

      return result;
    } catch (error) {
      console.error("Error syncing collection products from Shopify:", error);
      result.errors.push(`Fatal error: ${error instanceof Error ? error.message : String(error)}`);
      return result;
    }
  }

  /**
   * Parse creator info from Shopify event message
   * Examples:
   * - "Power Tools Filter Menu created collection" -> { type: 'app', name: 'Power Tools Filter Menu' }
   * - "Will created collection Dallas Cowboys" -> { type: 'staff', name: 'Will' }
   * - "Nick Simpson (deleted) created a new collection: <a href=..." -> { type: 'staff', name: 'Nick Simpson' }
   * - "Mustafa AlaaElden - CRO (deleted) created a new collection: ..." -> { type: 'staff', name: 'Mustafa AlaaElden - CRO' }
   * - "Buddha Mega Menu &amp; Navigation created a new collection: ..." -> { type: 'app', name: 'Buddha Mega Menu & Navigation' }
   * - "Shopify created collection" -> { type: 'app', name: 'Shopify' }
   */
  private parseCreatorFromEvent(eventMessage: string | null | undefined): { type: 'staff' | 'app' | null, name: string | null } {
    if (!eventMessage) return { type: null, name: null };

    // Decode HTML entities (e.g., &amp; -> &)
    const decodedMessage = eventMessage
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");

    // Check for known app patterns (apps, plugins, integrations)
    const appPatterns = [
      /^(Power Tools[^)]*)\s+created/i,
      /^(Shopify)\s+created/i,
      /^(Matrixify)\s+created/i,
      /^(Excelify)\s+created/i,
      /^(Oberlo)\s+created/i,
      /^(Buddha[^)]*)\s+created/i,  // Buddha Mega Menu & Navigation
      /^(Collection)\s+was\s+/i,     // "Collection was published..." (system)
    ];

    for (const pattern of appPatterns) {
      const match = decodedMessage.match(pattern);
      if (match) {
        // "Collection was published" is system-generated, not a named app
        if (match[1].toLowerCase() === 'collection') {
          return { type: null, name: null };
        }
        return { type: 'app', name: match[1].trim() };
      }
    }

    // Check for staff/person pattern: "Name (deleted)? created (a new)? collection..."
    // Allow letters, spaces, dashes, apostrophes, dots in names
    // Matches: "Nick Simpson created collection", "Mustafa AlaaElden - CRO (deleted) created a new collection: ..."
    const staffMatch = decodedMessage.match(/^([A-Za-z][A-Za-z\s\-'.]*?)(?:\s*\(deleted\))?\s+created\s+(?:a\s+new\s+)?collection/i);
    if (staffMatch) {
      const name = staffMatch[1].trim();
      // Exclude common non-person words and system-generated patterns
      if (!['the', 'a', 'an', 'this', 'collection'].includes(name.toLowerCase())) {
        return { type: 'staff', name };
      }
    }

    return { type: null, name: null };
  }

  /**
   * Sync a Shopify collection to local database
   * Creates or updates local collection based on Shopify data
   */
  // MULTI-TENANT: Requires tenantId for collection lookup and creation
  async syncCollectionFromShopify(tenantId: string, shopifyCollectionId: string, shopifyCollectionData: any): Promise<string | null> {
    try {
      // Check if collection already exists locally - MULTI-TENANT
      const existingCollection = await storage.getCollectionByShopifyId(tenantId, shopifyCollectionId);

      // Convert Shopify ruleSet to our internal format
      const convertedRules = shopifyCollectionData.ruleSet ? {
        rules: (shopifyCollectionData.ruleSet.rules || []).map((rule: { column: string; relation: string; condition: string }) => ({
          column: rule.column as "title" | "type" | "vendor" | "variant_title" | "tag" | "variant_price" | "variant_compare_at_price" | "variant_weight" | "variant_inventory",
          relation: rule.relation as "equals" | "not_equals" | "starts_with" | "ends_with" | "contains" | "not_contains" | "greater_than" | "less_than",
          condition: rule.condition,
        })),
        disjunctive: shopifyCollectionData.ruleSet.appliedDisjunctively || false,
      } : null;

      // Parse creator info from events - search through all events to find the "created collection" one
      // Also extract the creation date from that event (Shopify doesn't have direct createdAt for collections)
      // Sometimes the first event is "published" not "created", so we need to search
      let creatorInfo: { type: 'staff' | 'app' | null, name: string | null } = { type: null, name: null };
      let shopifyCreatedAt: Date | null = null;
      const events = shopifyCollectionData.events?.edges || [];
      for (const edge of events) {
        const eventMessage = edge?.node?.message;
        const eventCreatedAt = edge?.node?.createdAt;
        if (eventMessage && /created\s+(a\s+new\s+)?collection/i.test(eventMessage)) {
          creatorInfo = this.parseCreatorFromEvent(eventMessage);
          // Extract creation date from the "created collection" event
          if (eventCreatedAt) {
            shopifyCreatedAt = new Date(eventCreatedAt);
          }
          break;
        }
      }
      // If no "created collection" event found, try the first event anyway (fallback)
      if (!creatorInfo.name && events.length > 0) {
        creatorInfo = this.parseCreatorFromEvent(events[0]?.node?.message);
        // Also use first event's date as fallback for creation date
        if (!shopifyCreatedAt && events[0]?.node?.createdAt) {
          shopifyCreatedAt = new Date(events[0].node.createdAt);
        }
      }

      // Extract Shopify's updatedAt timestamp
      const shopifyUpdatedAt = shopifyCollectionData.updatedAt ? new Date(shopifyCollectionData.updatedAt) : null;

      // Determine if this is a new collection (for firstSyncedAt)
      const isNewCollection = !existingCollection;

      const collectionData = {
        name: shopifyCollectionData.title,
        slug: shopifyCollectionData.handle,
        description: shopifyCollectionData.description || "",
        image: shopifyCollectionData.image?.url || null,
        productCount: shopifyCollectionData.productsCount?.count || 0,  // ✅ USE SHOPIFY'S COUNT!
        metaTitle: shopifyCollectionData.seo?.title || null,
        metaDescription: shopifyCollectionData.seo?.description || null,
        shopifyCollectionId,
        shopifyHandle: shopifyCollectionData.handle,
        shopifyType: (shopifyCollectionData.ruleSet ? "smart" : "manual") as "manual" | "smart",
        syncedAt: new Date(),
        isActive: true,
        // ✅ Store rules from Shopify for smart collections
        rules: convertedRules,
        // ✅ Store creator info from Shopify events
        createdByType: creatorInfo.type,
        createdByName: creatorInfo.name,
        // ✅ Store Shopify timestamps
        shopifyCreatedAt: shopifyCreatedAt,
        shopifyUpdatedAt: shopifyUpdatedAt,
        // ✅ Set firstSyncedAt only for new collections
        ...(isNewCollection && { firstSyncedAt: new Date() }),
      };

      if (existingCollection) {
        // Update existing collection - MULTI-TENANT
        await storage.updateCollection(tenantId, existingCollection.id, collectionData);
        console.log(`✅ Updated local collection ${existingCollection.id} from Shopify`);
        return existingCollection.id;
      } else {
        // Create new collection - MULTI-TENANT
        const newCollection = await storage.createCollection(tenantId, collectionData);
        console.log(`✅ Created local collection ${newCollection.id} from Shopify`);
        return newCollection.id;
      }
    } catch (error) {
      console.error("Error syncing collection from Shopify:", error);
      return null;
    }
  }

  /**
   * Pull all collections from Shopify and sync to local database
   * Returns summary of sync operation
   */
  async pullCollectionsFromShopify(
    tenantId: string,  // MULTI-TENANT: Required tenant ID
    options?: {
      onProgress?: (progress: {
        total: number;
        processed: number;
        synced: number;
        created: number;
        updated: number;
      }) => void;
      pruneOrphaned?: boolean;  // Delete local collections not in Shopify (default: true)
      dryRun?: boolean;         // Preview deletions without executing (default: false)
    }
  ): Promise<{
    success: boolean;
    syncedCount: number;
    createdCount: number;
    updatedCount: number;
    deletedCount: number;
    deletedCollections: Array<{
      id: string;
      name: string;
      handle: string | null;
      shopifyCollectionId: string | null;
      productCount: number;
    }>;
    errors: string[];
  }> {
    const onProgress = options?.onProgress;
    const pruneOrphaned = options?.pruneOrphaned !== false; // Default: true
    const dryRun = options?.dryRun === true; // Default: false

    const result = {
      success: false,
      syncedCount: 0,
      createdCount: 0,
      updatedCount: 0,
      deletedCount: 0,
      deletedCollections: [] as Array<{
        id: string;
        name: string;
        handle: string | null;
        shopifyCollectionId: string | null;
        productCount: number;
      }>,
      errors: [] as string[],
    };

    try {
      console.log("🔄 pullCollectionsFromShopify called");

      // MULTI-TENANT: Use tenantId to get the correct store
      const store = await storage.getActiveShopifyStore(tenantId);
      if (!store) {
        console.error("❌ No active Shopify store configured");
        result.errors.push("No active Shopify store configured");
        return result;
      }

      console.log(`✅ Found active store: ${store.name} (${store.shopDomain})`);

      if (!store.accessToken) {
        console.error("❌ Shopify store has no access token");
        result.errors.push("Shopify store has no access token");
        return result;
      }

      console.log("✅ Access token present");

      const client = this.getAdminClient(store);
      console.log("✅ Admin client created");

      // Fetch collections from Shopify with pagination
      let hasNextPage = true;
      let cursor: string | null = null;
      const allCollections: any[] = [];

      console.log("🔄 Starting collection sync from Shopify...");

      while (hasNextPage) {
        const query = `
          query getCollections($first: Int!, $after: String) {
            collections(first: $first, after: $after) {
              edges {
                node {
                  id
                  title
                  handle
                  description
                  descriptionHtml
                  image {
                    url
                    altText
                    width
                    height
                  }
                  ruleSet {
                    appliedDisjunctively
                    rules {
                      column
                      condition
                      relation
                    }
                  }
                  sortOrder
                  productsCount {
                    count
                  }
                  updatedAt
                  seo {
                    title
                    description
                  }
                  templateSuffix
                  events(first: 5, sortKey: CREATED_AT) {
                    edges {
                      node {
                        message
                        createdAt
                      }
                    }
                  }
                }
                cursor
              }
              pageInfo {
                hasNextPage
              }
            }
          }
        `;

        const variables: any = { first: 50 };
        if (cursor) {
          variables.after = cursor;
        }

        console.log(`📡 Requesting collections page (cursor: ${cursor || "first page"})...`);

        const response = await client.request(query, { variables });

        if (response.errors) {
          console.error("❌ GraphQL Errors:", JSON.stringify(response.errors, null, 2));
        } else {
          console.log(`📡 Response received successfully`);
        }

        const edges = response.data?.collections?.edges || [];
        allCollections.push(...edges);

        hasNextPage = response.data?.collections?.pageInfo?.hasNextPage || false;
        if (edges.length > 0) {
          cursor = edges[edges.length - 1].cursor;
        }

        console.log(`📥 Fetched ${edges.length} collections (total: ${allCollections.length})`);
      }

      console.log(`✅ Fetched ${allCollections.length} total collections from Shopify`);

      // Log sample collection to verify events data is being received
      if (allCollections.length > 0 && allCollections[0].node.events?.edges?.[0]) {
        const sample = allCollections[0].node;
        const eventMsg = sample.events.edges[0].node.message;
        console.log(`🔍 Sample: "${sample.title}" created by: "${eventMsg?.substring(0, 60)}..."`);
      }

      // Track existing local collections before sync
      // MULTI-TENANT: Filter by tenant ID
      const existingCollections = await storage.getAllCollections(tenantId, { limit: 10000 });
      const existingShopifyIds = new Set(
        existingCollections.collections
          .filter(c => c.shopifyCollectionId)
          .map(c => c.shopifyCollectionId!)
      );

      const totalCollections = allCollections.length;

      // Sync each collection to local database
      for (const edge of allCollections) {
        const shopifyCollection = edge.node;
        const shopifyCollectionId = shopifyCollection.id;

        try {
          const wasExisting = existingShopifyIds.has(shopifyCollectionId);

          // MULTI-TENANT: Pass tenantId to syncCollectionFromShopify
          const localCollectionId = await this.syncCollectionFromShopify(
            tenantId,
            shopifyCollectionId,
            shopifyCollection
          );

          if (localCollectionId) {
            result.syncedCount++;
            if (wasExisting) {
              result.updatedCount++;
            } else {
              result.createdCount++;
            }
          } else {
            result.errors.push(`Failed to sync collection: ${shopifyCollection.title}`);
          }
        } catch (error) {
          const errorMsg = `Error syncing collection "${shopifyCollection.title}": ${error instanceof Error ? error.message : String(error)}`;
          console.error(errorMsg);
          result.errors.push(errorMsg);

          // If this is a duplicate name error, save it to the duplicates table
          if (error instanceof Error && error.message.includes('already exists')) {
            try {
              // Find the existing collection with this name - MULTI-TENANT
              const existingCollection = await storage.getCollectionByName(tenantId, shopifyCollection.title);

              if (existingCollection) {
                // Create a health issue for this duplicate (new Collection Health System)
                // MULTI-TENANT: Using tenantId from function parameter
                await storage.createCollectionHealthIssue({
                  tenantId,  // From function parameter
                  issueType: 'duplicate',
                  severity: 'medium',
                  collectionId: existingCollection.id,
                  title: `Duplicate collection: ${shopifyCollection.title}`,
                  description: `Shopify collection "${shopifyCollection.title}" (ID: ${shopifyCollectionId}) has the same name as an existing local collection.`,
                  recommendation: 'MERGE',
                  recommendedAction: 'Review both collections and merge or rename',
                  metadata: {
                    shopifyCollectionId,
                    shopifyHandle: shopifyCollection.handle,
                    shopifyType: shopifyCollection.ruleSet ? 'smart' : 'manual',
                    productsCount: shopifyCollection.productsCount?.count || 0,
                    shopifyUpdatedAt: shopifyCollection.updatedAt,
                  },
                  status: 'open',
                });
                console.log(`📝 Created health issue for duplicate collection "${shopifyCollection.title}"`);
              }
            } catch (dupError) {
              console.error(`Error creating collection health issue:`, dupError);
            }
          }
        }

        // Report progress after each collection
        if (onProgress) {
          onProgress({
            total: totalCollections,
            processed: result.syncedCount,
            synced: result.syncedCount,
            created: result.createdCount,
            updated: result.updatedCount,
          });
        }
      }

      result.success = result.syncedCount > 0;

      // ============================================================
      // PRUNE ORPHANED COLLECTIONS (delete local collections not in Shopify)
      // ============================================================
      if (pruneOrphaned) {
        console.log(`\n🧹 Checking for orphaned collections to prune...`);

        // Build set of Shopify collection IDs that exist in Shopify
        const shopifyCollectionIds = new Set(
          allCollections.map(edge => edge.node.id)
        );

        // Find local collections that have a Shopify ID but are NOT in Shopify anymore
        const orphanedCollections = existingCollections.collections.filter(
          c => c.shopifyCollectionId && !shopifyCollectionIds.has(c.shopifyCollectionId)
        );

        if (orphanedCollections.length > 0) {
          console.log(`🗑️ Found ${orphanedCollections.length} orphaned collections ${dryRun ? '(DRY RUN - will NOT delete)' : 'to delete'}:`);

          // Import changelog table for logging deletions
          const { db } = await import("./db");
          const { collectionSyncChangelog } = await import("@shared/schema");

          for (const orphan of orphanedCollections) {
            console.log(`   - "${orphan.name}" (${orphan.shopifyHandle || 'no-handle'}) - ${orphan.productCount} products`);

            // Add to result for visibility
            result.deletedCollections.push({
              id: orphan.id,
              name: orphan.name,
              handle: orphan.shopifyHandle || null,
              shopifyCollectionId: orphan.shopifyCollectionId,
              productCount: orphan.productCount,
            });

            // Log to changelog BEFORE deleting (for audit trail)
            try {
              await db.insert(collectionSyncChangelog).values({
                tenantId,
                collectionId: orphan.id,
                shopifyCollectionId: orphan.shopifyCollectionId,
                collectionName: orphan.name,
                collectionHandle: orphan.shopifyHandle,
                collectionType: orphan.shopifyType || 'unknown',
                productCount: orphan.productCount,
                changeType: 'deleted',
                changeDetails: {
                  reason: 'Collection no longer exists in Shopify',
                  dryRun,
                  deletedAt: new Date().toISOString(),
                },
              });
            } catch (logError) {
              console.error(`⚠️ Failed to log deletion for "${orphan.name}":`, logError);
            }

            // Actually delete (unless dry run)
            if (!dryRun) {
              try {
                await storage.deleteCollection(tenantId, orphan.id);
                result.deletedCount++;
              } catch (deleteError) {
                const errorMsg = `Failed to delete collection "${orphan.name}": ${deleteError instanceof Error ? deleteError.message : String(deleteError)}`;
                console.error(`❌ ${errorMsg}`);
                result.errors.push(errorMsg);
              }
            } else {
              result.deletedCount++; // Count for dry run preview
            }
          }

          console.log(`✅ ${dryRun ? 'Would delete' : 'Deleted'} ${result.deletedCount} orphaned collections`);
        } else {
          console.log(`✅ No orphaned collections found - all local collections exist in Shopify`);
        }
      }

      console.log(`\n✅ Collection sync complete:`);
      console.log(`   - Synced: ${result.syncedCount}`);
      console.log(`   - Created: ${result.createdCount}`);
      console.log(`   - Updated: ${result.updatedCount}`);
      console.log(`   - Deleted: ${result.deletedCount}${dryRun ? ' (dry run)' : ''}`);
      console.log(`   - Errors: ${result.errors.length}`);

      // Run health check after sync to detect duplicates
      try {
        console.log(`🔍 Running collection health check...`);
        const { runHealthCheck, markDuplicatesInDatabase } = await import("./health");
        // MULTI-TENANT: Using tenantId from function parameter
        const healthResult = await runHealthCheck({
          tenantId,  // From function parameter
          checkDuplicates: true,
          checkNavConflicts: false, // Skip nav conflicts for now
        });

        if (healthResult.duplicateGroups.length > 0) {
          await markDuplicatesInDatabase(tenantId, healthResult.duplicateGroups);
          console.log(`⚠️ Found ${healthResult.duplicateGroups.length} duplicate groups`);
        } else {
          console.log(`✅ No duplicate collections found`);
        }

        // Add health summary to result
        (result as any).healthSummary = {
          issueCount: healthResult.issueCount,
          duplicateCount: healthResult.duplicateGroups.length,
          dashboardUrl: '/collections/health',
        };
      } catch (healthError) {
        console.error(`⚠️ Health check failed (non-blocking):`, healthError);
      }

      return result;

    } catch (error) {
      const errorMsg = `Error pulling collections from Shopify: ${error instanceof Error ? error.message : String(error)}`;
      console.error("❌ SYNC ERROR:", errorMsg);
      console.error("❌ Full error object:", error);
      result.errors.push(errorMsg);
      return result;
    }
  }

  /**
   * Update collection rules in Shopify (push local rules to Shopify)
   * Only works for smart collections
   * MULTI-TENANT: Requires tenantId for store lookup
   */
  async updateCollectionRules(
    tenantId: string,
    shopifyCollectionId: string,
    rules: Array<{ column: string; relation: string; condition: string }>,
    appliedDisjunctively: boolean
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // MULTI-TENANT: Use tenantId to get the correct store
      const store = await storage.getActiveShopifyStore(tenantId);
      if (!store) {
        return { success: false, error: "No active Shopify store configured" };
      }

      const client = this.getAdminClient(store);

      console.log(`📤 Shopify API Request:`, {
        collectionId: shopifyCollectionId,
        rules: rules,
        appliedDisjunctively: appliedDisjunctively
      });

      // Shopify GraphQL mutation to update collection rules
      const response = await client.request(`
        mutation collectionUpdate($input: CollectionInput!) {
          collectionUpdate(input: $input) {
            collection {
              id
              title
              ruleSet {
                rules {
                  column
                  relation
                  condition
                }
                appliedDisjunctively
              }
            }
            userErrors {
              field
              message
            }
          }
        }
      `, {
        variables: {
          input: {
            id: shopifyCollectionId,
            ruleSet: {
              rules: rules.map(rule => ({
                column: rule.column,
                relation: rule.relation,
                condition: rule.condition,
              })),
              appliedDisjunctively: appliedDisjunctively,
            },
          },
        },
      });

      console.log(`📥 Shopify API Full Response:`, JSON.stringify(response, null, 2));

      // Check for errors
      if (response.data?.collectionUpdate?.userErrors?.length > 0) {
        const errors = response.data.collectionUpdate.userErrors.map((e: any) => e.message).join(', ');
        console.error("❌ Shopify collection update errors:", response.data.collectionUpdate.userErrors);
        return { success: false, error: errors };
      }

      // Verify the update was successful
      if (!response.data?.collectionUpdate?.collection) {
        console.error(`❌ No collection in response. Full response:`, response);
        console.error(`❌ response.data:`, response.data);
        console.error(`❌ response.data.collectionUpdate:`, response.data?.collectionUpdate);
        return { success: false, error: "No collection data returned from Shopify" };
      }

      console.log(`✅ Successfully updated collection rules in Shopify: ${shopifyCollectionId}`);
      return { success: true };

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error("❌ Error updating collection rules in Shopify:", errorMsg);
      return { success: false, error: errorMsg };
    }
  }

  // MULTI-TENANT: Requires tenantId for store and mapping lookup
  async syncProductStatus(tenantId: string, productId: string): Promise<boolean> {
    try {
      const store = await storage.getActiveShopifyStore(tenantId);
      const mapping = await storage.getShopifyProductMapping(tenantId, productId);

      if (!store || !mapping) {
        return false;
      }

      const client = this.getAdminClient(store);

      const response = await client.request(`
        query getProduct($id: ID!) {
          product(id: $id) {
            id
            status
            handle
            updatedAt
            tags
            category {
              id
              fullName
            }
            collections(first: 50) {
              edges {
                node {
                  id
                  title
                  handle
                  description
                  ruleSet {
                    appliedDisjunctively
                  }
                }
              }
            }
          }
        }
      `, {
        variables: {
          id: `gid://shopify/Product/${mapping.shopifyProductId}`,
        },
      });

      const shopifyProduct = response.data?.product;
      if (shopifyProduct) {
        console.log(`Product ${mapping.shopifyProductId} status: ${shopifyProduct.status}`);

        // Sync collections from Shopify
        if (shopifyProduct.collections?.edges?.length > 0) {
          const collectionTitles = shopifyProduct.collections.edges.map((edge: any) => edge.node.title);
          console.log(`  Collections: ${collectionTitles.join(', ')}`);

          // Get current local product collections
          const currentCollections = await storage.getProductCollections(productId);
          const currentShopifyIds = new Set(
            currentCollections
              .filter(c => c.shopifyCollectionId)
              .map(c => c.shopifyCollectionId!)
          );

          // Sync each Shopify collection to local database
          const syncedCollectionIds: string[] = [];

          for (const edge of shopifyProduct.collections.edges) {
            const shopifyCollectionId = edge.node.id;
            // MULTI-TENANT: Pass tenantId to syncCollectionFromShopify
            const localCollectionId = await this.syncCollectionFromShopify(tenantId, shopifyCollectionId, edge.node);

            if (localCollectionId) {
              syncedCollectionIds.push(localCollectionId);

              // If this collection isn't already associated with the product, add it
              if (!currentShopifyIds.has(shopifyCollectionId)) {
                try {
                  await storage.addProductsToCollection(localCollectionId, [productId]);
                  console.log(`✅ Added product to synced collection ${localCollectionId}`);
                } catch (error) {
                  console.error(`Error adding product to collection:`, error);
                }
              }
            }
          }

          console.log(`✅ Synced ${syncedCollectionIds.length} collections from Shopify`);
        }

        // Log tags if any
        if (shopifyProduct.tags?.length > 0) {
          console.log(`  Tags: ${shopifyProduct.tags.join(', ')}`);
        }

        // Log category if any
        if (shopifyProduct.category) {
          console.log(`  Category: ${shopifyProduct.category.fullName}`);
        }

        return true;
      }

      return false;
    } catch (error) {
      console.error("Error syncing product status:", error);
      return false;
    }
  }

  // MULTI-TENANT: Webhook handler resolves tenant from shop domain
  async handleWebhook(topic: string, shop: string, body: any): Promise<void> {
    console.log(`Received Shopify webhook: ${topic} from ${shop}`);

    try {
      // MULTI-TENANT: Look up store by domain to get tenantId
      const store = await storage.getShopifyStoreByDomain(shop);
      if (!store || !store.tenantId) {
        console.log(`No store found for shop domain: ${shop}`);
        return;
      }
      const tenantId = store.tenantId;
      console.log(`Resolved tenant from shop domain: ${tenantId}`);

      switch (topic) {
        case "products/update":
          await this.handleProductUpdate(tenantId, body);
          break;
        case "products/delete":
          await this.handleProductDelete(tenantId, body);
          break;
        case "collections/create":
          await this.handleCollectionCreate(tenantId, body);
          break;
        case "collections/update":
          await this.handleCollectionUpdate(tenantId, body);
          break;
        case "collections/delete":
          await this.handleCollectionDelete(tenantId, body);
          break;
        default:
          console.log(`Unhandled webhook topic: ${topic}`);
      }
    } catch (error) {
      console.error(`Error handling webhook ${topic}:`, error);
    }
  }

  // MULTI-TENANT: Requires tenantId for mapping lookup
  private async handleProductUpdate(tenantId: string, productData: any): Promise<void> {
    try {
      // Find mapping by Shopify product ID - MULTI-TENANT
      const mapping = await storage.getShopifyMappingByShopifyId(tenantId, productData.id.toString());
      if (!mapping) {
        console.log(`No mapping found for Shopify product ${productData.id}`);
        return;
      }

      // Update mapping with latest status and handle from Shopify - MULTI-TENANT
      await storage.updateShopifyProductMapping(tenantId, mapping.id, {
        status: productData.status || mapping.status,
        shopifyHandle: productData.handle || mapping.shopifyHandle,
      });

      console.log(`✅ Updated mapping for product ${mapping.productId}`);
      console.log(`   Status: ${productData.status || mapping.status}`);
      console.log(`   Handle: ${productData.handle || mapping.shopifyHandle}`);

      // If handle changed in Shopify, optionally sync back to local product
      // (Only if you want two-way sync - be careful of sync loops!)
      if (productData.handle && productData.handle !== mapping.shopifyHandle) {
        console.log(`⚠️ Handle changed in Shopify: ${mapping.shopifyHandle} → ${productData.handle}`);

        // Get local product to check if we should update it - MULTI-TENANT
        const localProduct = await storage.getProduct(tenantId, mapping.productId);
        if (localProduct && localProduct.handle !== productData.handle) {
          console.log(`   Local handle: ${localProduct.handle}`);
          console.log(`   Shopify handle change detected but not auto-syncing to local (manual review recommended)`);
        }
      }
    } catch (error) {
      console.error("Error handling product update webhook:", error);
    }
  }

  // MULTI-TENANT: Requires tenantId for webhook processing
  private async handleProductDelete(tenantId: string, productData: any): Promise<void> {
    // Handle product deletion
    console.log("Product delete webhook processed:", productData.id);
  }

  /**
   * Handle collections/create webhook
   * Syncs new collection from Shopify to local database
   * MULTI-TENANT: Requires tenantId for collection sync
   */
  private async handleCollectionCreate(tenantId: string, collectionData: any): Promise<void> {
    try {
      console.log(`📥 Processing collection create webhook for: ${collectionData.title || collectionData.id}`);

      // Extract Shopify collection ID (format: gid://shopify/Collection/123456789)
      const shopifyCollectionId = collectionData.admin_graphql_api_id || `gid://shopify/Collection/${collectionData.id}`;

      // Use existing sync method to create/update collection - MULTI-TENANT
      const localCollectionId = await this.syncCollectionFromShopify(tenantId, shopifyCollectionId, {
        id: shopifyCollectionId,
        title: collectionData.title,
        handle: collectionData.handle,
        description: collectionData.body_html || "",
        ruleSet: collectionData.rules ? { rules: collectionData.rules } : null,
        updatedAt: collectionData.updated_at,
      });

      if (localCollectionId) {
        console.log(`✅ Collection created via webhook: ${localCollectionId}`);
      } else {
        console.error(`❌ Failed to create collection via webhook: ${collectionData.title}`);
      }
    } catch (error) {
      console.error("Error handling collection create webhook:", error);
    }
  }

  /**
   * Handle collections/update webhook
   * Syncs updated collection from Shopify to local database
   * MULTI-TENANT: Requires tenantId for collection sync
   */
  private async handleCollectionUpdate(tenantId: string, collectionData: any): Promise<void> {
    try {
      console.log(`📥 Processing collection update webhook for: ${collectionData.title || collectionData.id}`);

      // Extract Shopify collection ID
      const shopifyCollectionId = collectionData.admin_graphql_api_id || `gid://shopify/Collection/${collectionData.id}`;

      // Use existing sync method to update collection - MULTI-TENANT
      const localCollectionId = await this.syncCollectionFromShopify(tenantId, shopifyCollectionId, {
        id: shopifyCollectionId,
        title: collectionData.title,
        handle: collectionData.handle,
        description: collectionData.body_html || "",
        ruleSet: collectionData.rules ? { rules: collectionData.rules } : null,
        updatedAt: collectionData.updated_at,
      });

      if (localCollectionId) {
        console.log(`✅ Collection updated via webhook: ${localCollectionId}`);
      } else {
        console.error(`❌ Failed to update collection via webhook: ${collectionData.title}`);
      }
    } catch (error) {
      console.error("Error handling collection update webhook:", error);
    }
  }

  /**
   * Handle collections/delete webhook
   * Marks collection as inactive in local database (soft delete)
   * MULTI-TENANT: Requires tenantId for collection lookup
   */
  private async handleCollectionDelete(tenantId: string, collectionData: any): Promise<void> {
    try {
      console.log(`🗑️ Processing collection delete webhook for: ${collectionData.id}`);

      // Extract Shopify collection ID
      const shopifyCollectionId = collectionData.admin_graphql_api_id || `gid://shopify/Collection/${collectionData.id}`;

      // Find local collection by Shopify ID - MULTI-TENANT
      const existingCollection = await storage.getCollectionByShopifyId(tenantId, shopifyCollectionId);

      if (existingCollection) {
        // Soft delete: mark as inactive instead of actually deleting - MULTI-TENANT
        await storage.updateCollection(tenantId, existingCollection.id, {
          isActive: false,
          syncedAt: new Date(),
        });

        console.log(`✅ Collection marked as inactive (deleted in Shopify): ${existingCollection.id}`);
      } else {
        console.log(`⚠️ Collection not found locally for delete webhook: ${shopifyCollectionId}`);
      }
    } catch (error) {
      console.error("Error handling collection delete webhook:", error);
    }
  }

  /**
   * Pull navigation menus from Shopify
   * Syncs menu structure and identifies collections in navigation
   */
  async pullNavigationMenusFromShopify(
    tenantId: string,
    onProgress?: (progress: { total: number; processed: number }) => void
  ): Promise<{
    success: boolean;
    menusCount: number;
    itemsCount: number;
    collectionItemsCount: number;
    errors: string[];
  }> {
    const result = {
      success: false,
      menusCount: 0,
      itemsCount: 0,
      collectionItemsCount: 0,
      errors: [] as string[],
    };

    try {
      console.log("🔄 pullNavigationMenusFromShopify called");

      // MULTI-TENANT: Use tenantId to get the correct store
      const store = await storage.getActiveShopifyStore(tenantId);
      if (!store) {
        console.error("❌ No active Shopify store configured");
        result.errors.push("No active Shopify store configured");
        return result;
      }

      if (!store.accessToken) {
        console.error("❌ Shopify store has no access token");
        result.errors.push("Shopify store has no access token");
        return result;
      }

      const client = this.getAdminClient(store);
      console.log("✅ Admin client created for navigation sync");

      // Fetch all menus from Shopify
      const menusQuery = `
        query getMenus {
          menus(first: 50) {
            edges {
              node {
                id
                title
                handle
                items {
                  id
                  title
                  type
                  url
                  resourceId
                  items {
                    id
                    title
                    type
                    url
                    resourceId
                    items {
                      id
                      title
                      type
                      url
                      resourceId
                    }
                  }
                }
              }
            }
          }
        }
      `;

      console.log("📡 Fetching menus from Shopify...");
      const response = await client.request(menusQuery);

      if (response.errors) {
        console.error("❌ GraphQL errors:", response.errors);
        const errors = Array.isArray(response.errors) ? response.errors : [response.errors];
        result.errors.push(...errors.map((e: any) => e.message || String(e)));
        return result;
      }

      const menus = response.data?.menus?.edges || [];
      console.log(`✅ Found ${menus.length} menus in Shopify`);

      // Process each menu
      for (const menuEdge of menus) {
        const menu = menuEdge.node;

        try {
          // Upsert menu
          const savedMenu = await storage.upsertNavigationMenu({
            tenantId,
            shopifyMenuId: menu.id,
            title: menu.title,
            handle: menu.handle,
            itemCount: menu.items?.length || 0,
            syncedAt: new Date(),
          });

          result.menusCount++;
          console.log(`📁 Synced menu: ${menu.title} (${menu.handle})`);

          // Delete existing items for this menu (will re-create)
          await storage.deleteNavigationItemsByMenu(savedMenu.id);

          // Process menu items recursively
          const processItems = async (
            items: any[],
            parentItemId: string | null,
            position: number
          ): Promise<number> => {
            let itemPosition = position;

            for (const item of items) {
              // Determine item type
              let itemType = item.type || 'LINK';
              let targetId: string | null = null;

              // Extract collection ID if this is a collection link
              if (item.resourceId && item.resourceId.includes('Collection')) {
                itemType = 'COLLECTION';
                targetId = item.resourceId;
                result.collectionItemsCount++;
              } else if (item.resourceId && item.resourceId.includes('Page')) {
                itemType = 'PAGE';
                targetId = item.resourceId;
              } else if (item.resourceId && item.resourceId.includes('Blog')) {
                itemType = 'BLOG';
                targetId = item.resourceId;
              }

              // Create navigation item and get the saved ID
              const savedItem = await storage.createNavigationItem({
                tenantId,
                menuId: savedMenu.id,
                parentItemId,
                shopifyItemId: item.id,
                title: item.title,
                type: itemType,
                targetId,
                targetUrl: item.url,
                position: itemPosition++,
              });

              result.itemsCount++;

              // Process nested items using the saved database ID as parent
              if (item.items && item.items.length > 0) {
                itemPosition = await processItems(item.items, savedItem.id, itemPosition);
              }
            }

            return itemPosition;
          };

          // Process top-level items
          if (menu.items && menu.items.length > 0) {
            await processItems(menu.items, null, 0);
          }

        } catch (menuError) {
          console.error(`❌ Error processing menu ${menu.title}:`, menuError);
          result.errors.push(`Failed to process menu: ${menu.title}`);
        }

        if (onProgress) {
          onProgress({ total: menus.length, processed: result.menusCount });
        }
      }

      result.success = true;
      console.log(`✅ Navigation sync complete: ${result.menusCount} menus, ${result.itemsCount} items, ${result.collectionItemsCount} collection links`);

    } catch (error) {
      console.error("❌ Error in pullNavigationMenusFromShopify:", error);
      result.errors.push(error instanceof Error ? error.message : "Unknown error");
    }

    return result;
  }

  /**
   * Get collections that are referenced in navigation menus
   * Returns a map of collectionId -> menu info
   */
  async getCollectionsInNavigation(tenantId: string): Promise<Map<string, { menuId: string; menuTitle: string; itemTitle: string }>> {
    const collectionsInNav = new Map<string, { menuId: string; menuTitle: string; itemTitle: string }>();

    try {
      const menus = await storage.getNavigationMenus(tenantId);

      for (const menu of menus) {
        const items = await storage.getNavigationItems(menu.id);

        for (const item of items) {
          if (item.type === 'COLLECTION' && item.targetId) {
            // targetId is the Shopify GID like "gid://shopify/Collection/123456"
            collectionsInNav.set(item.targetId, {
              menuId: menu.id,
              menuTitle: menu.title,
              itemTitle: item.title,
            });
          }
        }
      }
    } catch (error) {
      console.error("Error getting collections in navigation:", error);
    }

    return collectionsInNav;
  }

  /**
   * Delete a collection from Shopify
   * Returns success status and any errors
   * MULTI-TENANT: Requires tenantId for store lookup
   */
  async deleteCollectionFromShopify(tenantId: string, shopifyCollectionId: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      // MULTI-TENANT: Use tenantId to get the correct store
      const store = await storage.getActiveShopifyStore(tenantId);
      if (!store) {
        return { success: false, error: "No active Shopify store configured" };
      }

      if (!store.accessToken) {
        return { success: false, error: "Shopify store has no access token" };
      }

      const client = this.getAdminClient(store);

      const mutation = `
        mutation deleteCollection($id: ID!) {
          collectionDelete(input: { id: $id }) {
            deletedCollectionId
            userErrors {
              field
              message
            }
          }
        }
      `;

      console.log(`🗑️ Deleting collection from Shopify: ${shopifyCollectionId}`);

      const response = await client.request(mutation, {
        variables: { id: shopifyCollectionId }
      });

      if (response.errors) {
        console.error("❌ GraphQL errors:", response.errors);
        const errors = Array.isArray(response.errors) ? response.errors : [response.errors];
        return { success: false, error: (errors[0] as any)?.message || "GraphQL error" };
      }

      const userErrors = response.data?.collectionDelete?.userErrors || [];
      if (userErrors.length > 0) {
        console.error("❌ User errors:", userErrors);
        return { success: false, error: userErrors[0]?.message || "Delete failed" };
      }

      const deletedId = response.data?.collectionDelete?.deletedCollectionId;
      if (deletedId) {
        console.log(`✅ Collection deleted from Shopify: ${deletedId}`);
        return { success: true };
      }

      return { success: false, error: "No collection was deleted" };

    } catch (error) {
      console.error("❌ Error deleting collection from Shopify:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  }

  /**
   * Publish a local collection to Shopify
   * Supports both manual and smart collections
   * MULTI-TENANT: Requires tenantId for store and collection lookup
   */
  async publishCollectionToShopify(tenantId: string, collectionId: string): Promise<{
    success: boolean;
    shopifyCollectionId?: string;
    error?: string;
  }> {
    try {
      // Get active Shopify store - MULTI-TENANT
      const store = await storage.getActiveShopifyStore(tenantId);
      if (!store) {
        return { success: false, error: "No active Shopify store configured" };
      }

      if (!store.accessToken) {
        return { success: false, error: "Shopify store has no access token configured" };
      }

      // Get the collection from local database - MULTI-TENANT
      const collection = await storage.getCollectionById(tenantId, collectionId);
      if (!collection) {
        return { success: false, error: "Collection not found" };
      }

      // Check if already published
      if (collection.shopifyCollectionId) {
        return {
          success: true,
          shopifyCollectionId: collection.shopifyCollectionId,
          error: "Collection already published to Shopify"
        };
      }

      const client = this.getAdminClient(store);

      // Prepare collection input based on type
      const isSmartCollection = collection.shopifyType === "smart";
      const rules = collection.rules as { rules: Array<{ column: string; relation: string; condition: string }>; disjunctive: boolean } | null;

      let collectionInput: any = {
        title: collection.name,
        descriptionHtml: collection.description || "",
        handle: collection.slug,
      };

      // Add ruleSet ONLY for smart collections - manual collections must NOT have ruleSet
      if (isSmartCollection && rules && rules.rules.length > 0) {
        // Smart collection with rules
        collectionInput.ruleSet = {
          appliedDisjunctively: rules.disjunctive,
          rules: rules.rules.map(rule => ({
            column: rule.column.toUpperCase(), // Shopify expects uppercase
            relation: rule.relation.toUpperCase(),
            condition: rule.condition,
          })),
        };
        console.log(`📦 Publishing SMART collection "${collection.name}" with ${rules.rules.length} rules`);
      } else {
        // Manual collection - DO NOT include ruleSet (Shopify doesn't allow empty rules)
        console.log(`📦 Publishing MANUAL collection "${collection.name}"`);
      }

      // Create the collection in Shopify
      const createResponse = await client.request(`
        mutation createCollection($input: CollectionInput!) {
          collectionCreate(input: $input) {
            collection {
              id
              title
              handle
              ruleSet {
                appliedDisjunctively
                rules {
                  column
                  relation
                  condition
                }
              }
            }
            userErrors {
              field
              message
            }
          }
        }
      `, {
        variables: { input: collectionInput }
      });

      const userErrors = createResponse.data?.collectionCreate?.userErrors;
      if (userErrors && userErrors.length > 0) {
        console.error(`❌ Error creating collection "${collection.name}":`, userErrors);
        return {
          success: false,
          error: userErrors.map((e: any) => `${e.field}: ${e.message}`).join(", ")
        };
      }

      const newCollection = createResponse.data?.collectionCreate?.collection;
      if (!newCollection) {
        return { success: false, error: "Failed to create collection in Shopify" };
      }

      console.log(`✅ Created Shopify collection: ${newCollection.title} (${newCollection.id})`);

      // Update local collection with Shopify ID - MULTI-TENANT
      await storage.updateCollection(tenantId, collectionId, {
        shopifyCollectionId: newCollection.id,
        shopifyHandle: newCollection.handle,
        syncedAt: new Date(),
      });

      return {
        success: true,
        shopifyCollectionId: newCollection.id,
      };

    } catch (error) {
      console.error("❌ Error publishing collection to Shopify:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  }
}

export const shopifyService = new ShopifyService();