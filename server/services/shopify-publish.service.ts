/**
 * Shopify Publish Service
 *
 * Handles publishing products from local database to Shopify store.
 *
 * PREREQUISITES:
 * - Shopify app must have 'write_products' scope
 * - Environment variables must be set:
 *   - SHOPIFY_STORE_URL
 *   - SHOPIFY_ACCESS_TOKEN (or SHOPIFY_ADMIN_API_KEY for legacy)
 *
 * Current Status: read_products, read_product_listings, read_inventory
 * Required: write_products, write_inventory (ADD THESE SCOPES IN SHOPIFY APP SETTINGS)
 */

import type { Product, ProductOption, ProductVariant } from "@shared/schema";
import { items, itemLevels, ssfLocations, products } from "@shared/schema";
import { storage } from "../storage";
import { db } from "../db";
import { eq, and, inArray, sql, isNotNull } from "drizzle-orm";
import * as fs from "fs";
import * as path from "path";
import { SIZE_ORDER } from "../../shared/size-utils";

interface ShopifyProductInput {
  title: string;
  body_html: string;
  vendor: string;
  product_type?: string;
  tags?: string;
  status: "draft" | "active";
  options?: Array<{
    name: string;
    position: number;
  }>;
  variants?: Array<{
    sku?: string;
    price: string;
    compare_at_price?: string;
    barcode?: string;
    inventory_quantity?: number;
    inventory_management?: string;
    weight?: number;
    weight_unit?: "lb" | "oz" | "g" | "kg";
    option1?: string;
    option2?: string;
    option3?: string;
  }>;
  images?: Array<{
    src?: string;
    attachment?: string;
    alt?: string;
  }>;
  metafields?: Array<{
    namespace: string;
    key: string;
    value: string;
    type: string;
  }>;
}

interface ShopifyProductResponse {
  product: {
    id: number;
    title: string;
    handle: string;
    body_html: string;
    vendor: string;
    product_type: string;
    created_at: string;
    updated_at: string;
    published_at: string | null;
    status: string;
    admin_graphql_api_id: string;
    variants?: Array<{
      id: number;
      product_id: number;
      title: string;
      sku: string | null;
      price: string;
      option1: string | null;
      option2: string | null;
      option3: string | null;
      image_id?: number | null;
      inventory_item_id?: number;
    }>;
    images?: Array<{
      id: number;
      product_id: number;
      src: string;
      position: number;
    }>;
  };
}

interface ShopifyError {
  errors: Record<string, string[]> | string;
}

export class ShopifyPublishService {
  private storeUrl: string;
  private accessToken: string;
  private apiVersion: string = "2024-01";

  constructor() {
    this.storeUrl = process.env.SHOPIFY_STORE_URL || "";
    // Support both SHOPIFY_ACCESS_TOKEN (from .env) and SHOPIFY_ADMIN_API_KEY (legacy)
    this.accessToken = process.env.SHOPIFY_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_API_KEY || "";

    if (!this.storeUrl || !this.accessToken) {
      throw new Error(
        "Shopify credentials not configured. Set SHOPIFY_STORE_URL and SHOPIFY_ACCESS_TOKEN environment variables."
      );
    }
  }

  /**
   * Make a GraphQL request to the Shopify Admin API.
   */
  private async makeGraphQLRequest<T = any>(query: string, variables: Record<string, any>): Promise<T> {
    const graphqlUrl = `https://${this.storeUrl}/admin/api/${this.apiVersion}/graphql.json`;
    const response = await fetch(graphqlUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': this.accessToken,
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Shopify GraphQL API ${response.status}: ${text}`);
    }

    const result = await response.json();
    if (result.errors) {
      throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
    }

    return result.data as T;
  }

  /**
   * Get per-location inventory for a list of SKUs.
   * Returns: { sku: { shopifyLocationId: quantity } }
   */
  private async getPerLocationInventory(
    tenantId: string,
    skus: string[]
  ): Promise<Record<string, Record<string, number>>> {
    if (skus.length === 0) return {};
    try {
      const rows = await db.select({
        itemNumber: items.itemNumber,
        locationExternalId: ssfLocations.externalId,
        quantity: itemLevels.quantity,
      })
      .from(itemLevels)
      .innerJoin(items, eq(itemLevels.itemId, items.id))
      .innerJoin(ssfLocations, eq(itemLevels.locationId, ssfLocations.id))
      .where(and(
        eq(items.tenantId, tenantId),
        inArray(items.itemNumber, skus),
        isNotNull(ssfLocations.externalId)
      ));

      const result: Record<string, Record<string, number>> = {};
      for (const row of rows) {
        if (row.itemNumber && row.locationExternalId) {
          if (!result[row.itemNumber]) result[row.itemNumber] = {};
          result[row.itemNumber][row.locationExternalId] = Math.max(0, parseFloat(row.quantity || "0"));
        }
      }
      return result;
    } catch (error) {
      console.error("Error fetching per-location inventory:", error);
      return {};
    }
  }

  /**
   * Get all Shopify location IDs for a tenant (from ssfLocations table).
   * Returns array of Shopify location external IDs.
   */
  private async getTenantShopifyLocations(tenantId: string): Promise<string[]> {
    try {
      const rows = await db.select({
        externalId: ssfLocations.externalId,
      })
      .from(ssfLocations)
      .where(and(
        eq(ssfLocations.tenantId, tenantId),
        eq(ssfLocations.isActive, true),
        isNotNull(ssfLocations.externalId)
      ));

      return rows
        .map(r => r.externalId)
        .filter((id): id is string => id !== null);
    } catch (error) {
      console.error("Error fetching tenant Shopify locations:", error);
      return [];
    }
  }

  /**
   * Activate inventory tracking at all tenant locations for a given inventory item.
   * Uses Shopify GraphQL inventoryBulkToggleActivation mutation.
   */
  private async activateInventoryAtLocations(
    inventoryItemId: number,
    locationIds: string[]
  ): Promise<void> {
    if (locationIds.length === 0) return;

    const mutation = `
      mutation inventoryBulkToggleActivation(
        $inventoryItemId: ID!,
        $inventoryItemUpdates: [InventoryBulkToggleActivationInput!]!
      ) {
        inventoryBulkToggleActivation(
          inventoryItemId: $inventoryItemId
          inventoryItemUpdates: $inventoryItemUpdates
        ) {
          inventoryItem { id }
          userErrors { field message }
        }
      }
    `;

    const variables = {
      inventoryItemId: `gid://shopify/InventoryItem/${inventoryItemId}`,
      inventoryItemUpdates: locationIds.map(locId => ({
        locationId: `gid://shopify/Location/${locId}`,
        activate: true,
      })),
    };

    try {
      const data = await this.makeGraphQLRequest<{
        inventoryBulkToggleActivation: {
          inventoryItem: { id: string } | null;
          userErrors: Array<{ field: string[]; message: string }>;
        };
      }>(mutation, variables);

      const userErrors = data.inventoryBulkToggleActivation?.userErrors;
      if (userErrors && userErrors.length > 0) {
        console.warn(`[Inventory] Activation warnings for item ${inventoryItemId}:`, userErrors);
      }
    } catch (error) {
      console.warn(`[Inventory] Failed to activate locations for item ${inventoryItemId}:`, error);
    }
  }

  /**
   * Set per-location inventory quantities for an inventory item.
   * Uses Shopify GraphQL inventorySetQuantities mutation.
   * Matches pattern from NexusSync shopify-pusher.mjs.
   */
  private async setPerLocationInventory(
    inventoryItemId: number,
    locationQuantities: Record<string, number>
  ): Promise<void> {
    const quantities = Object.entries(locationQuantities).map(([locationId, qty]) => ({
      inventoryItemId: `gid://shopify/InventoryItem/${inventoryItemId}`,
      locationId: `gid://shopify/Location/${locationId}`,
      quantity: Math.max(0, Math.floor(qty)),
    }));

    if (quantities.length === 0) return;

    const mutation = `
      mutation inventorySetQuantities($input: InventorySetQuantitiesInput!) {
        inventorySetQuantities(input: $input) {
          inventoryAdjustmentGroup { reason }
          userErrors { field message }
        }
      }
    `;

    const variables = {
      input: {
        reason: "correction",
        name: "on_hand",
        ignoreCompareQuantity: true,
        quantities,
      },
    };

    try {
      const data = await this.makeGraphQLRequest<{
        inventorySetQuantities: {
          inventoryAdjustmentGroup: { reason: string } | null;
          userErrors: Array<{ field: string[]; message: string }>;
        };
      }>(mutation, variables);

      const userErrors = data.inventorySetQuantities?.userErrors;
      if (userErrors && userErrors.length > 0) {
        const notStocked = userErrors.some(e => e.message?.includes('not stocked at the location'));
        if (notStocked) {
          console.warn(`[Inventory] Item ${inventoryItemId} not stocked at some locations — activation may have failed`);
        } else {
          console.warn(`[Inventory] Set quantities errors for item ${inventoryItemId}:`, userErrors);
        }
      }
    } catch (error) {
      console.warn(`[Inventory] Failed to set quantities for item ${inventoryItemId}:`, error);
    }
  }

  /**
   * After creating/updating a product, activate all tenant locations and set per-location inventory.
   * This replaces the old approach of setting a single inventory_quantity on the REST API.
   */
  private async setupPerLocationInventory(
    tenantId: string,
    shopifyVariants: Array<{ sku: string | null; inventory_item_id?: number }>,
    localVariants: ProductVariant[]
  ): Promise<void> {
    try {
      const locationIds = await this.getTenantShopifyLocations(tenantId);
      if (locationIds.length === 0) {
        console.warn("[Inventory] No Shopify locations configured for tenant — skipping per-location inventory");
        return;
      }

      const skus = localVariants.map(v => v.sku).filter(Boolean) as string[];
      const perLocationInventory = await this.getPerLocationInventory(tenantId, skus);

      for (const shopifyVariant of shopifyVariants) {
        const inventoryItemId = shopifyVariant.inventory_item_id;
        if (!inventoryItemId) continue;

        // Activate inventory at all tenant locations
        await this.activateInventoryAtLocations(inventoryItemId, locationIds);

        // Set per-location quantities
        const sku = shopifyVariant.sku;
        if (sku && perLocationInventory[sku]) {
          await this.setPerLocationInventory(inventoryItemId, perLocationInventory[sku]);
        }
      }

      console.log(`[Inventory] Per-location inventory setup complete for ${shopifyVariants.length} variants`);
    } catch (error) {
      console.warn("[Inventory] Per-location inventory setup failed (non-blocking):", error);
    }
  }

  /**
   * Get summed inventory totals across all locations for a list of SKUs.
   * Returns a map of SKU → total quantity from itemLevels.
   */
  private async getInventoryTotals(tenantId: string, skus: string[]): Promise<Record<string, number>> {
    if (skus.length === 0) return {};
    try {
      const rows = await db.select({
        itemNumber: items.itemNumber,
        total: sql<string>`SUM(${itemLevels.quantity})`,
      })
      .from(itemLevels)
      .innerJoin(items, eq(itemLevels.itemId, items.id))
      .where(and(
        eq(items.tenantId, tenantId),
        inArray(items.itemNumber, skus)
      ))
      .groupBy(items.itemNumber);

      const totals: Record<string, number> = {};
      for (const row of rows) {
        if (row.itemNumber) {
          totals[row.itemNumber] = parseFloat(row.total || "0");
        }
      }
      return totals;
    } catch (error) {
      console.error("Error fetching inventory totals for Shopify publish:", error);
      return {};
    }
  }

  /**
   * Publish a local product to Shopify
   */
  async publishProduct(
    product: Product,
    publishAsActive: boolean = false
  ): Promise<{ shopifyProductId: string; shopifyAdminUrl: string }> {
    try {
      // Check if product already published
      if (product.shopifyProductId) {
        throw new Error(
          `Product already published to Shopify (ID: ${product.shopifyProductId})`
        );
      }

      // Validate required fields
      if (!product.title || !product.vendor) {
        throw new Error("Product title and vendor are required");
      }

      // Fetch product variants and options from database
      const variants = await storage.getProductVariants(product.id);
      const options = await storage.getProductOptions(product.id);

      if (variants.length === 0) {
        throw new Error("Product has no variants. All products must have at least one variant.");
      }

      // Check for duplicate SKU in Shopify (check first variant's SKU)
      if (variants[0]?.sku) {
        const duplicate = await this.checkDuplicateBySKU(variants[0].sku);
        if (duplicate) {
          throw new Error(
            `Product with SKU "${variants[0].sku}" already exists in Shopify (ID: ${duplicate.id})`
          );
        }
      }

      // Prepare Shopify product data (inventory_quantity set to 0 — per-location handled via GraphQL after create)
      const shopifyProduct: ShopifyProductInput = {
        title: product.title,
        body_html: product.description || "",
        vendor: product.vendor,
        product_type: product.productType || undefined,
        tags: this.mergeTags(product),
        status: publishAsActive ? "active" : "draft",
        options: this.buildOptionsFromDatabase(options),
        variants: this.buildVariantsFromDatabase(variants, options),
        images: this.buildImages(product),
        metafields: this.buildMetafields(product),
      };

      // Make API request to Shopify
      const response = await this.makeShopifyRequest<ShopifyProductResponse>(
        "POST",
        "/admin/api/{api_version}/products.json",
        { product: shopifyProduct }
      );

      const shopifyProductId = response.product.admin_graphql_api_id;
      const numericId = response.product.id;

      // Save Shopify variant IDs back to local database
      if (response.product.variants && Array.isArray(response.product.variants)) {
        await this.saveShopifyVariantIds(variants, response.product.variants);
      }

      // Assign variant images (non-blocking)
      if (response.product.images?.length && response.product.variants?.length) {
        await this.assignVariantImages(numericId, variants, response.product.variants, response.product.images, product);
      }

      // Activate all tenant locations and set per-location inventory (non-blocking)
      if (product.tenantId && response.product.variants?.length) {
        await this.setupPerLocationInventory(product.tenantId, response.product.variants, variants);
      }

      // Sync Shopify taxonomy category if set (non-blocking)
      if (product.shopifyCategoryId && product.tenantId) {
        await this.syncCategoryToShopify(product, shopifyProductId);
      }

      return {
        shopifyProductId,
        shopifyAdminUrl: `https://${this.storeUrl}/admin/products/${numericId}`,
      };
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error("Failed to publish product to Shopify");
    }
  }

  /**
   * Update an existing Shopify product with local changes
   */
  async updateProduct(
    product: Product,
    publishAsActive: boolean = false
  ): Promise<{ shopifyProductId: string; shopifyAdminUrl: string }> {
    try {
      // Validate product is already published
      if (!product.shopifyProductId) {
        throw new Error("Product not published to Shopify. Use publishProduct() instead.");
      }

      // Validate required fields
      if (!product.title || !product.vendor) {
        throw new Error("Product title and vendor are required");
      }

      // Extract numeric ID from GraphQL ID (e.g., gid://shopify/Product/123 → 123)
      const numericId = product.shopifyProductId.split("/").pop() || product.shopifyProductId;

      // Fetch product variants and options from database
      const variants = await storage.getProductVariants(product.id);
      const options = await storage.getProductOptions(product.id);

      if (variants.length === 0) {
        throw new Error("Product has no variants. All products must have at least one variant.");
      }

      // Prepare Shopify update payload (inventory_quantity set to 0 — per-location handled via GraphQL)
      const shopifyProduct: ShopifyProductInput = {
        title: product.title,
        body_html: product.description || "",
        vendor: product.vendor,
        product_type: product.productType || undefined,
        tags: this.mergeTags(product),
        status: publishAsActive ? "active" : "draft",
        options: this.buildOptionsFromDatabase(options),
        variants: this.buildVariantsFromDatabase(variants, options),
        images: this.buildImages(product),
        metafields: this.buildMetafields(product),
      };

      console.log(`Updating Shopify product ${numericId} with:`, {
        title: shopifyProduct.title,
        vendor: shopifyProduct.vendor,
        status: shopifyProduct.status,
        variantsCount: shopifyProduct.variants?.length,
        imagesCount: shopifyProduct.images?.length,
      });

      // DEBUG: Log the options being sent to Shopify
      console.log('DEBUG - Options being sent to Shopify:', JSON.stringify(shopifyProduct.options, null, 2));

      // Make API request to UPDATE existing Shopify product
      const response = await this.makeShopifyRequest<ShopifyProductResponse>(
        "PUT",
        `/admin/api/{api_version}/products/${numericId}.json`,
        { product: shopifyProduct }
      );

      const shopifyProductId = response.product.admin_graphql_api_id;

      // Update Shopify variant IDs if they changed
      if (response.product.variants && Array.isArray(response.product.variants)) {
        await this.saveShopifyVariantIds(variants, response.product.variants);
      }

      // Assign variant images (re-apply after update since Shopify may reset them)
      if (response.product.images?.length && response.product.variants?.length) {
        await this.assignVariantImages(parseInt(numericId), variants, response.product.variants, response.product.images, product);
      }

      // Activate all tenant locations and set per-location inventory (non-blocking)
      if (product.tenantId && response.product.variants?.length) {
        await this.setupPerLocationInventory(product.tenantId, response.product.variants, variants);
      }

      // Sync Shopify taxonomy category if set (non-blocking)
      if (product.shopifyCategoryId && product.tenantId) {
        await this.syncCategoryToShopify(product, shopifyProductId);
      }

      console.log(`Successfully updated Shopify product ${numericId}`);

      return {
        shopifyProductId,
        shopifyAdminUrl: `https://${this.storeUrl}/admin/products/${numericId}`,
      };
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error("Failed to update product on Shopify");
    }
  }

  /**
   * Update a single variant in Shopify with local changes
   */
  async syncVariantToShopify(
    productId: string,
    variantId: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      // Get variant from database
      const variants = await storage.getProductVariants(productId);
      const variant = variants.find((v) => v.id === variantId);

      if (!variant) {
        throw new Error("Variant not found in local database");
      }

      if (!variant.shopifyVariantId) {
        throw new Error(
          "Variant has no Shopify ID. Product must be published to Shopify first."
        );
      }

      // Extract numeric ID from GraphQL ID if needed
      const numericVariantId = variant.shopifyVariantId.includes("/")
        ? variant.shopifyVariantId.split("/").pop()
        : variant.shopifyVariantId;

      const [product] = await db.select().from(products).where(eq(products.id, productId)).limit(1);

      // Prepare variant update data (no inventory_quantity — handled per-location via GraphQL)
      const variantUpdate: any = {
        price: variant.price || "0.00",
      };

      // Add optional fields
      if (variant.compareAtPrice) {
        variantUpdate.compare_at_price = variant.compareAtPrice;
      }
      if (variant.sku) {
        variantUpdate.sku = variant.sku;
      }
      if (variant.barcode) {
        variantUpdate.barcode = variant.barcode;
      }

      // Add weight if it exists
      const weight = this.parseWeight(variant.weight);
      if (weight !== undefined) {
        variantUpdate.weight = weight;
        variantUpdate.weight_unit = this.convertWeightUnit(variant.weightUnit);
      }

      // Update variant in Shopify via REST API
      const variantResponse = await this.makeShopifyRequest<{ variant: any }>(
        "PUT",
        `/admin/api/{api_version}/variants/${numericVariantId}.json`,
        { variant: variantUpdate }
      );

      // Set per-location inventory via GraphQL
      if (product?.tenantId && variant.sku && variantResponse.variant?.inventory_item_id) {
        const perLocationInv = await this.getPerLocationInventory(product.tenantId, [variant.sku]);
        if (perLocationInv[variant.sku]) {
          const locationIds = await this.getTenantShopifyLocations(product.tenantId);
          await this.activateInventoryAtLocations(variantResponse.variant.inventory_item_id, locationIds);
          await this.setPerLocationInventory(variantResponse.variant.inventory_item_id, perLocationInv[variant.sku]);
        }
      }

      return {
        success: true,
        message: `Variant synced to Shopify successfully`,
      };
    } catch (error) {
      console.error("Error syncing variant to Shopify:", error);
      return {
        success: false,
        message: error instanceof Error ? error.message : "Failed to sync variant",
      };
    }
  }

  /**
   * Sync all variants for a product to Shopify
   */
  async syncAllVariantsToShopify(
    productId: string
  ): Promise<{ success: boolean; synced: number; failed: number; errors: string[] }> {
    try {
      const variants = await storage.getProductVariants(productId);

      if (variants.length === 0) {
        throw new Error("Product has no variants");
      }

      let synced = 0;
      let failed = 0;
      const errors: string[] = [];

      for (const variant of variants) {
        try {
          const result = await this.syncVariantToShopify(productId, variant.id);
          if (result.success) {
            synced++;
          } else {
            failed++;
            errors.push(`${variant.sku || variant.id}: ${result.message}`);
          }
        } catch (error) {
          failed++;
          const errorMsg = error instanceof Error ? error.message : "Unknown error";
          errors.push(`${variant.sku || variant.id}: ${errorMsg}`);
        }
      }

      return {
        success: failed === 0,
        synced,
        failed,
        errors,
      };
    } catch (error) {
      console.error("Error syncing variants to Shopify:", error);
      return {
        success: false,
        synced: 0,
        failed: 0,
        errors: [error instanceof Error ? error.message : "Failed to sync variants"],
      };
    }
  }

  /**
   * Check if a product with the given SKU already exists in Shopify
   */
  private async checkDuplicateBySKU(sku: string): Promise<{ id: number } | null> {
    try {
      // Search for products with matching SKU
      const response = await this.makeShopifyRequest<{
        products: Array<{ id: number; variants: Array<{ sku: string }> }>;
      }>("GET", `/admin/api/{api_version}/products.json?fields=id,variants&limit=250`);

      // Check if any variant has matching SKU
      for (const product of response.products) {
        for (const variant of product.variants) {
          if (variant.sku === sku) {
            return { id: product.id };
          }
        }
      }

      return null;
    } catch (error) {
      console.error("Error checking duplicate SKU:", error);
      // Don't fail publish if duplicate check fails
      return null;
    }
  }

  /**
   * Build variants array for Shopify from database records
   */
  private buildVariantsFromDatabase(
    variants: ProductVariant[],
    options: ProductOption[],
    inventoryTotals: Record<string, number> = {}
  ): ShopifyProductInput["variants"] {
    // Sort variants by option2 (Size) using predefined SIZE_ORDER
    // This ensures Shopify displays variants in the correct size order
    const sortedVariants = [...variants].sort((a, b) => {
      const sizeA = a.option2 || a.option1 || "";
      const sizeB = b.option2 || b.option1 || "";

      const indexA = SIZE_ORDER.indexOf(sizeA);
      const indexB = SIZE_ORDER.indexOf(sizeB);

      // Both sizes are in the predefined order
      if (indexA !== -1 && indexB !== -1) {
        return indexA - indexB;
      }

      // Only 'a' is in predefined order → 'a' comes first
      if (indexA !== -1) return -1;

      // Only 'b' is in predefined order → 'b' comes first
      if (indexB !== -1) return 1;

      // Neither is in predefined order → alphabetical fallback
      return sizeA.localeCompare(sizeB);
    });

    return sortedVariants.map((variant) => {
      // Set inventory_quantity to 0 on create — per-location quantities are set
      // separately via GraphQL inventorySetQuantities after product creation.
      // This prevents Shopify from dumping all stock at the default location (HQ).
      const variantData: NonNullable<ShopifyProductInput["variants"]>[0] = {
        sku: variant.sku || undefined,
        price: variant.price || "0.00",
        inventory_quantity: 0,
        inventory_management: "shopify",
        option1: variant.option1 || undefined,
        option2: variant.option2 || undefined,
        option3: variant.option3 || undefined,
      };

      // Add optional fields if they exist
      if (variant.compareAtPrice) {
        variantData.compare_at_price = variant.compareAtPrice;
      }

      if (variant.barcode) {
        variantData.barcode = variant.barcode;
      }

      // Add weight if it exists
      const weight = this.parseWeight(variant.weight);
      if (weight !== undefined) {
        variantData.weight = weight;
        variantData.weight_unit = this.convertWeightUnit(variant.weightUnit);
      }

      return variantData;
    });
  }

  /**
   * Convert weight unit from Shopify format to REST API format
   * Database: "POUNDS", "OUNCES", "GRAMS", "KILOGRAMS"
   * Shopify REST API: "lb", "oz", "g", "kg"
   */
  private convertWeightUnit(
    unit: string | null
  ): "lb" | "oz" | "g" | "kg" | undefined {
    if (!unit) return undefined;

    const unitMap: Record<string, "lb" | "oz" | "g" | "kg"> = {
      'POUNDS': 'lb',
      'OUNCES': 'oz',
      'GRAMS': 'g',
      'KILOGRAMS': 'kg',
    };

    return unitMap[unit.toUpperCase()] || 'lb';
  }

  /**
   * Parse weight value from string to number
   */
  private parseWeight(weight: string | null): number | undefined {
    if (!weight) return undefined;

    const parsed = parseFloat(weight);
    if (isNaN(parsed) || parsed < 0) {
      return undefined;
    }

    return parsed;
  }

  /**
   * Build product options array for Shopify from database records
   */
  private buildOptionsFromDatabase(
    options: ProductOption[]
  ): ShopifyProductInput["options"] {
    if (!options || options.length === 0) {
      return undefined;
    }

    // Sort by position to ensure correct order
    const sortedOptions = options.sort((a, b) => a.position - b.position);

    return sortedOptions.map((option) => {
      // For Size option, sort values using SIZE_ORDER
      let values = option.values;
      if (option.name === 'Size' && values && values.length > 0) {
        values = [...values].sort((a, b) => {
          const indexA = SIZE_ORDER.indexOf(a);
          const indexB = SIZE_ORDER.indexOf(b);

          // Both sizes are in the predefined order
          if (indexA !== -1 && indexB !== -1) {
            return indexA - indexB;
          }

          // Only 'a' is in predefined order → 'a' comes first
          if (indexA !== -1) return -1;

          // Only 'b' is in predefined order → 'b' comes first
          if (indexB !== -1) return 1;

          // Neither is in predefined order → alphabetical fallback
          return a.localeCompare(b);
        });
      }

      return {
        name: option.name,
        position: option.position,
        values: values,
      };
    });
  }

  /**
   * Save Shopify variant IDs back to local database
   */
  private async saveShopifyVariantIds(
    localVariants: ProductVariant[],
    shopifyVariants: Array<{ id: number; sku: string | null; option1: string | null; option2: string | null; option3: string | null }>
  ): Promise<void> {
    try {
      // Match local variants with Shopify variants by option values and SKU
      for (let i = 0; i < localVariants.length; i++) {
        const localVariant = localVariants[i];

        // Find matching Shopify variant by option values
        const shopifyVariant = shopifyVariants.find(sv =>
          sv.option1 === localVariant.option1 &&
          sv.option2 === localVariant.option2 &&
          sv.option3 === localVariant.option3
        );

        if (shopifyVariant) {
          // Save Shopify variant ID to local database
          await storage.updateProductVariant(localVariant.id, {
            shopifyVariantId: shopifyVariant.id.toString(),
          });
        }
      }
    } catch (error) {
      console.error("Error saving Shopify variant IDs:", error);
      // Don't fail the entire publish if saving variant IDs fails
    }
  }

  /**
   * Merge original tags and generated keywords for Shopify
   * Combines both fields and removes duplicates
   */
  private mergeTags(product: Product): string | undefined {
    const allTags: string[] = [];

    // Add original tags from product.tags field
    if (product.tags) {
      const originalTags = product.tags
        .split(',')
        .map(tag => tag.trim())
        .filter(tag => tag.length > 0);
      allTags.push(...originalTags);
    }

    // Add generated keywords from Content Studio
    if (product.generatedKeywords && Array.isArray(product.generatedKeywords)) {
      const generatedTags = product.generatedKeywords
        .map(tag => tag.trim())
        .filter(tag => tag.length > 0);
      allTags.push(...generatedTags);
    }

    // Remove duplicates (case-insensitive) while preserving original case
    const uniqueTags = Array.from(
      new Map(allTags.map(tag => [tag.toLowerCase(), tag])).values()
    );

    return uniqueTags.length > 0 ? uniqueTags.join(', ') : undefined;
  }

  /**
   * Build images array for Shopify
   * - External URLs (http/https): sent as src (Shopify fetches them)
   * - Local uploads (/uploads/...): read from disk and sent as base64 attachment
   */
  private buildImages(product: Product): ShopifyProductInput["images"] {
    if (!product.images || product.images.length === 0) {
      return undefined;
    }

    const images: ShopifyProductInput["images"] = [];

    for (const url of product.images) {
      if (url.startsWith("http://") || url.startsWith("https://")) {
        // External URL - ensure HTTPS for Shopify compatibility
        const secureUrl = url.replace(/^http:\/\//, "https://");
        images.push({ src: secureUrl, alt: product.title || "" });
      } else if (url.startsWith("/uploads/")) {
        // Local upload - read file from disk and send as base64
        try {
          const filePath = path.join(process.cwd(), "server", url);
          if (fs.existsSync(filePath)) {
            const fileData = fs.readFileSync(filePath);
            const base64 = fileData.toString("base64");
            images.push({ attachment: base64, alt: product.title || "" });
          } else {
            console.warn(`[Publish] Local image not found, skipping: ${filePath}`);
          }
        } catch (err) {
          console.warn(`[Publish] Failed to read local image ${url}:`, err);
        }
      } else {
        // Unknown format - try as src anyway
        images.push({ src: url, alt: product.title || "" });
      }
    }

    return images.length > 0 ? images : undefined;
  }

  /**
   * Assign variant images after product creation.
   * Matches local variant image URLs to Shopify product images and updates variants.
   */
  private async assignVariantImages(
    shopifyProductNumericId: number,
    localVariants: ProductVariant[],
    shopifyVariants: NonNullable<ShopifyProductResponse["product"]["variants"]>,
    shopifyImages: NonNullable<ShopifyProductResponse["product"]["images"]>,
    product: Product
  ): Promise<void> {
    try {
      // Build a map of local image URL -> Shopify image ID
      // Product images were uploaded in the same order as product.images
      const imageUrlToShopifyId = new Map<string, number>();
      if (product.images) {
        for (let i = 0; i < product.images.length && i < shopifyImages.length; i++) {
          imageUrlToShopifyId.set(product.images[i], shopifyImages[i].id);
        }
      }

      // Match local variants to Shopify variants by SKU
      for (const localVariant of localVariants) {
        if (!localVariant.imageUrl) continue;

        const shopifyImageId = imageUrlToShopifyId.get(localVariant.imageUrl);
        if (!shopifyImageId) continue;

        // Find matching Shopify variant by SKU
        const shopifyVariant = shopifyVariants.find(sv => sv.sku === localVariant.sku);
        if (!shopifyVariant) continue;

        // Update Shopify variant with image_id
        try {
          await this.makeShopifyRequest(
            "PUT",
            `/admin/api/{api_version}/variants/${shopifyVariant.id}.json`,
            { variant: { id: shopifyVariant.id, image_id: shopifyImageId } }
          );
          console.log(`[Publish] Assigned image ${shopifyImageId} to variant ${shopifyVariant.sku}`);
        } catch (err) {
          console.warn(`[Publish] Failed to assign image to variant ${shopifyVariant.sku}:`, err);
        }
      }
    } catch (err) {
      console.warn(`[Publish] Variant image assignment failed:`, err);
    }
  }

  /**
   * Build metafields array for Shopify (SEO data + style number + bullet points)
   */
  private buildMetafields(product: Product): ShopifyProductInput["metafields"] {
    const metafields: ShopifyProductInput["metafields"] = [];

    // Style number (custom metafield)
    if (product.styleNumber) {
      metafields.push({
        namespace: "custom",
        key: "style_number",
        value: product.styleNumber,
        type: "single_line_text_field",
      });
    }

    // Bullet Points / Sales Points (custom metafields: custom_sales_point_1 through custom_sales_point_5)
    if (product.bulletPoints && Array.isArray(product.bulletPoints)) {
      for (let i = 0; i < Math.min(product.bulletPoints.length, 5); i++) {
        const bulletPoint = product.bulletPoints[i];
        if (bulletPoint && bulletPoint.trim().length > 0) {
          metafields.push({
            namespace: "custom",
            key: `custom_sales_point_${i + 1}`,
            value: bulletPoint.trim(),
            type: "single_line_text_field",
          });
        }
      }
    }

    if (product.metaTitle) {
      metafields.push({
        namespace: "seo",
        key: "title_tag",
        value: product.metaTitle,
        type: "single_line_text_field",
      });
    }

    if (product.metaDescription) {
      metafields.push({
        namespace: "seo",
        key: "description_tag",
        value: product.metaDescription,
        type: "multi_line_text_field",
      });
    }

    if (product.focusKeyword) {
      metafields.push({
        namespace: "seo",
        key: "focus_keyword",
        value: product.focusKeyword,
        type: "single_line_text_field",
      });
    }

    if (product.googleCategory) {
      metafields.push({
        namespace: "product",
        key: "google_product_category",
        value: JSON.stringify(product.googleCategory),
        type: "json",
      });
    }

    return metafields.length > 0 ? metafields : undefined;
  }

  /**
   * Sync Shopify taxonomy category to Shopify using GraphQL API
   * This is called after REST API publish/update to set the product category
   * Non-blocking: failures are logged but don't fail the overall publish
   */
  private async syncCategoryToShopify(
    product: Product,
    shopifyProductId: string
  ): Promise<void> {
    const localProductId = product.id;
    const shopifyCategoryId = product.shopifyCategoryId;
    const tenantId = product.tenantId;

    if (!shopifyCategoryId || !tenantId) {
      console.warn(`Category sync skipped for product ${localProductId}: missing categoryId or tenantId`);
      return;
    }

    try {
      console.log(`Syncing Shopify category for product ${localProductId}: ${shopifyCategoryId}`);

      // Ensure shopifyProductId is in GID format
      const shopifyGid = shopifyProductId.startsWith('gid://')
        ? shopifyProductId
        : `gid://shopify/Product/${shopifyProductId}`;

      // Use category GID as-is if already in GID format, otherwise wrap it
      const categoryGid = shopifyCategoryId.startsWith('gid://')
        ? shopifyCategoryId
        : `gid://shopify/TaxonomyCategory/${shopifyCategoryId}`;

      // GraphQL mutation to update product category
      const mutation = `
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
      `;

      const variables = {
        input: {
          id: shopifyGid,
          category: categoryGid,
        },
      };

      console.log(`[CategorySync] Sending to Shopify - productGid: ${shopifyGid}, categoryGid: ${categoryGid}`);

      const result = await this.makeGraphQLRequest<{
        productUpdate: {
          product: { id: string; category: { id: string } | null } | null;
          userErrors: Array<{ field: string[]; message: string }>;
        };
      }>(mutation, variables);

      // Check for GraphQL user errors
      if (result.productUpdate?.userErrors?.length > 0) {
        const errors = result.productUpdate.userErrors;
        console.warn(`Category sync GraphQL errors for product ${localProductId}:`, errors);
        return;
      }

      // Update the sync timestamp in database
      try {
        await storage.updateProduct(tenantId, localProductId, {
          shopifyCategorySyncedAt: new Date(),
        });
        console.log(`Successfully synced category to Shopify for product ${localProductId}`);
      } catch (dbError) {
        console.warn(`Failed to update category sync timestamp for product ${localProductId}:`, dbError);
      }
    } catch (error) {
      // Non-blocking: log warning but don't throw
      console.warn(`Failed to sync category to Shopify for product ${localProductId}:`, error);
    }
  }

  /**
   * Make authenticated request to Shopify API
   */
  private async makeShopifyRequest<T>(
    method: "GET" | "POST" | "PUT" | "DELETE",
    path: string,
    body?: any
  ): Promise<T> {
    const url = `https://${this.storeUrl}${path.replace("{api_version}", this.apiVersion)}`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": this.accessToken,
    };

    const options: RequestInit = {
      method,
      headers,
    };

    if (body && (method === "POST" || method === "PUT")) {
      options.body = JSON.stringify(body);
    }

    try {
      const response = await fetch(url, options);

      if (!response.ok) {
        const errorData: ShopifyError = await response.json().catch(() => ({
          errors: "Unknown error",
        }));

        // Parse Shopify error format
        let errorMessage = "Shopify API error";
        if (typeof errorData.errors === "string") {
          errorMessage = errorData.errors;
        } else if (typeof errorData.errors === "object") {
          const errors = Object.entries(errorData.errors)
            .map(([key, messages]) => `${key}: ${messages.join(", ")}`)
            .join("; ");
          errorMessage = errors || "Validation failed";
        }

        // Special handling for common errors
        if (response.status === 403) {
          throw new Error(
            "Permission denied. The Shopify app needs 'write_products' scope. " +
            "Please update app permissions in Shopify admin settings."
          );
        }

        if (response.status === 422) {
          throw new Error(`Shopify validation error: ${errorMessage}`);
        }

        throw new Error(`Shopify API error (${response.status}): ${errorMessage}`);
      }

      return await response.json();
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error("Failed to communicate with Shopify API");
    }
  }

  /**
   * Test Shopify connection and credentials
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      const response = await this.makeShopifyRequest<{ shop: { name: string } }>(
        "GET",
        "/admin/api/{api_version}/shop.json"
      );

      return {
        success: true,
        message: `Connected to Shopify store: ${response.shop.name}`,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "Connection failed",
      };
    }
  }
}

export const shopifyPublishService = new ShopifyPublishService();
