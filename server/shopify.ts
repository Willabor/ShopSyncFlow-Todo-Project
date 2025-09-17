import { shopifyApi, ApiVersion, LogSeverity } from "@shopify/shopify-api";
import { createAdminApiClient } from "@shopify/admin-api-client";
import { storage } from "./storage";
import type { Product, ShopifyStore } from "@shared/schema";

// Helper function to verify webhook HMAC (Shopify sends base64 digest only)
function verifyWebhookSignature(rawBody: string, signature: string, secret: string): boolean {
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
  verifyWebhookSignature(rawBody: string, signature: string, secret: string): boolean {
    return verifyWebhookSignature(rawBody, signature, secret);
  }
  private getAdminClient(store: ShopifyStore) {
    return createAdminApiClient({
      storeDomain: store.shopDomain,
      apiVersion: ApiVersion.October23,
      accessToken: store.accessToken,
    });
  }

  async publishProduct(product: Product): Promise<{ shopifyProductId: string; handle: string } | null> {
    try {
      // Get active Shopify store
      const store = await storage.getActiveShopifyStore();
      if (!store) {
        console.log("No active Shopify store configured, skipping product publishing");
        return null;
      }

      if (!store.accessToken) {
        console.error("Shopify store has no access token configured");
        return null;
      }

      // Check if product is already published
      const existingMapping = await storage.getShopifyProductMapping(product.id);
      if (existingMapping) {
        console.log(`Product ${product.id} already published to Shopify as ${existingMapping.shopifyProductId}`);
        return { 
          shopifyProductId: existingMapping.shopifyProductId, 
          handle: existingMapping.shopifyHandle || "" 
        };
      }

      const client = this.getAdminClient(store);
      
      // Prepare Shopify product data
      const shopifyProduct: ShopifyProductData = {
        title: product.title,
        body_html: product.description || "",
        vendor: product.vendor,
        product_type: product.category || "",
        status: "active",
        variants: [{
          title: "Default Title",
          price: product.price || "0.00",
          sku: product.sku || "",
          inventory_quantity: 100, // Default inventory
          inventory_management: "shopify",
          inventory_policy: "deny",
        }],
        tags: product.category || "",
      };

      // Add images if available
      if (product.images && product.images.length > 0) {
        shopifyProduct.images = product.images.map(img => ({
          src: img,
          alt: product.title,
        }));
      }

      // Add metadata if available
      if (product.metadata) {
        shopifyProduct.metafields = [
          {
            namespace: "workflow",
            key: "order_number",
            value: product.orderNumber || "",
            type: "single_line_text_field",
          },
          {
            namespace: "workflow",
            key: "internal_metadata",
            value: JSON.stringify(product.metadata),
            type: "json",
          },
        ];
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
            }
            userErrors {
              field
              message
            }
          }
        }
      `, {
        variables: {
          input: shopifyProduct,
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

      // Store mapping in database
      await storage.createShopifyProductMapping({
        productId: product.id,
        shopifyStoreId: store.id,
        shopifyProductId,
        shopifyHandle: shopifyProductData.handle,
        status: shopifyProductData.status,
      });

      console.log(`Successfully published product ${product.id} to Shopify as ${shopifyProductId}`);
      
      return {
        shopifyProductId,
        handle: shopifyProductData.handle,
      };

    } catch (error) {
      console.error("Error publishing product to Shopify:", error);
      return null;
    }
  }

  async syncProductStatus(productId: string): Promise<boolean> {
    try {
      const store = await storage.getActiveShopifyStore();
      const mapping = await storage.getShopifyProductMapping(productId);
      
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
          }
        }
      `, {
        variables: {
          id: `gid://shopify/Product/${mapping.shopifyProductId}`,
        },
      });

      const shopifyProduct = response.data?.product;
      if (shopifyProduct) {
        // Would update mapping with latest status - need update method
        console.log(`Product ${mapping.shopifyProductId} status: ${shopifyProduct.status}`);
        return true;
      }

      return false;
    } catch (error) {
      console.error("Error syncing product status:", error);
      return false;
    }
  }

  async handleWebhook(topic: string, shop: string, body: any): Promise<void> {
    console.log(`Received Shopify webhook: ${topic} from ${shop}`);
    
    try {
      switch (topic) {
        case "products/update":
          await this.handleProductUpdate(body);
          break;
        case "products/delete":
          await this.handleProductDelete(body);
          break;
        default:
          console.log(`Unhandled webhook topic: ${topic}`);
      }
    } catch (error) {
      console.error(`Error handling webhook ${topic}:`, error);
    }
  }

  private async handleProductUpdate(productData: any): Promise<void> {
    try {
      // Find mapping by Shopify product ID
      const mapping = await storage.getShopifyMappingByShopifyId(productData.id.toString());
      if (!mapping) {
        console.log(`No mapping found for Shopify product ${productData.id}`);
        return;
      }

      // Update mapping with latest status from Shopify
      const updatedMapping = {
        ...mapping,
        status: productData.status || 'active',
        shopifyHandle: productData.handle || mapping.shopifyHandle,
        lastSyncAt: new Date()
      };

      // Would need updateShopifyProductMapping method in storage
      console.log(`Updated mapping for product ${mapping.productId}:`, updatedMapping);
    } catch (error) {
      console.error("Error handling product update webhook:", error);
    }
  }

  private async handleProductDelete(productData: any): Promise<void> {
    // Handle product deletion
    console.log("Product delete webhook processed:", productData.id);
  }
}

export const shopifyService = new ShopifyService();