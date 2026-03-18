/**
 * Query Shopify directly for a specific SKU and display all metafields
 *
 * Usage: tsx scripts/query-shopify-sku.ts <SKU>
 * Example: tsx scripts/query-shopify-sku.ts 107878
 */

import "dotenv/config";

const SKU = process.argv[2];

if (!SKU) {
  console.error("Usage: tsx scripts/query-shopify-sku.ts <SKU>");
  console.error("Example: tsx scripts/query-shopify-sku.ts 107878");
  process.exit(1);
}

const SHOPIFY_STORE_URL = process.env.SHOPIFY_STORE_URL;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_API_KEY;
const API_VERSION = "2024-01";

if (!SHOPIFY_STORE_URL || !SHOPIFY_ACCESS_TOKEN) {
  console.error("Error: SHOPIFY_STORE_URL and SHOPIFY_ACCESS_TOKEN must be set in environment");
  process.exit(1);
}

// GraphQL query to search products by variant SKU
const query = `
  query ($query: String!) {
    products(first: 5, query: $query) {
      edges {
        node {
          id
          title
          handle
          vendor
          productType
          status
          variants(first: 10) {
            edges {
              node {
                id
                title
                sku
                barcode
                price
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
        }
      }
    }
  }
`;

const variables = {
  query: `sku:${SKU}`, // Search by SKU
};

async function queryShopify() {
  const url = `https://${SHOPIFY_STORE_URL}/admin/api/${API_VERSION}/graphql.json`;

  console.log(`\n🔍 Querying Shopify for SKU: ${SKU}`);
  console.log(`📍 Store: ${SHOPIFY_STORE_URL}`);
  console.log(`🔗 URL: ${url}\n`);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      console.error(`❌ HTTP Error: ${response.status} ${response.statusText}`);
      const text = await response.text();
      console.error("Response:", text);
      process.exit(1);
    }

    const data = await response.json();

    if (data.errors && data.errors.length > 0) {
      console.error("❌ GraphQL Errors:");
      console.error(JSON.stringify(data.errors, null, 2));
      process.exit(1);
    }

    const products = data.data.products.edges;

    if (products.length === 0) {
      console.log(`❌ No products found with SKU: ${SKU}`);
      process.exit(0);
    }

    console.log(`✅ Found ${products.length} product(s) with SKU: ${SKU}\n`);

    products.forEach((edge: any, index: number) => {
      const product = edge.node;

      console.log(`${"=".repeat(80)}`);
      console.log(`PRODUCT ${index + 1}: ${product.title}`);
      console.log(`${"=".repeat(80)}`);
      console.log(`Shopify ID: ${product.id}`);
      console.log(`Handle: ${product.handle}`);
      console.log(`Vendor: ${product.vendor}`);
      console.log(`Product Type: ${product.productType}`);
      console.log(`Status: ${product.status}`);

      console.log(`\n📦 VARIANTS (${product.variants.edges.length}):`);
      product.variants.edges.forEach((variantEdge: any, vIdx: number) => {
        const variant = variantEdge.node;
        console.log(`  ${vIdx + 1}. SKU: ${variant.sku} | Title: ${variant.title} | Price: $${variant.price} | Barcode: ${variant.barcode || 'N/A'}`);
      });

      console.log(`\n🏷️  METAFIELDS (${product.metafields.edges.length}):`);

      if (product.metafields.edges.length === 0) {
        console.log("  ⚠️  No metafields found for this product");
      } else {
        // Group metafields by namespace
        const metafieldsByNamespace: Record<string, any[]> = {};
        product.metafields.edges.forEach((metafieldEdge: any) => {
          const metafield = metafieldEdge.node;
          if (!metafieldsByNamespace[metafield.namespace]) {
            metafieldsByNamespace[metafield.namespace] = [];
          }
          metafieldsByNamespace[metafield.namespace].push(metafield);
        });

        // Display grouped metafields
        Object.entries(metafieldsByNamespace).forEach(([namespace, metafields]) => {
          console.log(`\n  📂 Namespace: "${namespace}"`);
          metafields.forEach((metafield) => {
            console.log(`     • ${metafield.key}: "${metafield.value}" (${metafield.type})`);

            // Highlight if this is the style_number metafield
            if (namespace === "custom" && metafield.key === "style_number") {
              console.log(`       ⭐ THIS IS THE CUSTOM.STYLE_NUMBER METAFIELD!`);
            }
          });
        });

        // Check if custom.style_number exists
        const styleNumberMetafield = product.metafields.edges.find((edge: any) =>
          edge.node.namespace === "custom" && edge.node.key === "style_number"
        );

        console.log(`\n  🔍 STYLE NUMBER CHECK:`);
        if (styleNumberMetafield) {
          console.log(`     ✅ custom.style_number EXISTS`);
          console.log(`     Value: "${styleNumberMetafield.node.value}"`);
        } else {
          console.log(`     ❌ custom.style_number NOT FOUND`);
          console.log(`     Available namespaces: ${Object.keys(metafieldsByNamespace).join(", ")}`);
        }
      }

      console.log(`\n`);
    });

  } catch (error: any) {
    console.error("❌ Error querying Shopify:");
    console.error(error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

queryShopify();
