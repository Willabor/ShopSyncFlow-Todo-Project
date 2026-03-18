/**
 * Test script to fetch ALL metafields from a Shopify product
 * This will help us see what custom metafields exist in the store
 */

import 'dotenv/config';

const SHOPIFY_STORE_URL = process.env.SHOPIFY_STORE_URL;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const API_VERSION = '2024-10';

// GraphQL query to fetch specific product by ID with ALL metafields
const query = `
query GetProductWithAllMetafields {
  product(id: "gid://shopify/Product/9259311399144") {
    id
    title
    handle
    metafields(first: 100) {
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
`;

async function testShopifyMetafields() {
  try {
    console.log('🔍 Fetching product with ALL metafields from Shopify...\n');

    const response = await fetch(
      `https://${SHOPIFY_STORE_URL}/admin/api/${API_VERSION}/graphql.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
        },
        body: JSON.stringify({ query }),
      }
    );

    const result = await response.json();

    if (result.errors) {
      console.error('❌ GraphQL Errors:', JSON.stringify(result.errors, null, 2));
      return;
    }

    if (!result.data || !result.data.product) {
      console.log('⚠️  Product not found');
      return;
    }

    const product = result.data.product;

    console.log('\n' + '═'.repeat(80));
    console.log(`📦 Product: ${product.title}`);
    console.log('🔗 Handle:', product.handle);
    console.log('🆔 ID:', product.id);
    console.log('\n📋 ALL METAFIELDS:\n');

    if (product.metafields.edges.length === 0) {
      console.log('⚠️  No metafields found for this product');
      return;
    }

    // Group metafields by namespace
    const metafieldsByNamespace = {};
    product.metafields.edges.forEach(({ node }) => {
      if (!metafieldsByNamespace[node.namespace]) {
        metafieldsByNamespace[node.namespace] = [];
      }
      metafieldsByNamespace[node.namespace].push(node);
    });

    // Display grouped by namespace
    Object.keys(metafieldsByNamespace).sort().forEach(namespace => {
      console.log(`\n📂 Namespace: "${namespace}"`);
      console.log('─'.repeat(80));

      metafieldsByNamespace[namespace].forEach(field => {
        console.log(`  🏷️  ${field.key}`);
        console.log(`     Type: ${field.type}`);

        // Truncate long values for readability
        const value = field.value.length > 200 ? field.value.substring(0, 200) + '...' : field.value;
        console.log(`     Value: ${value}`);
        console.log('');
      });
    });

    console.log('\n✅ Total metafields for this product:', product.metafields.edges.length);
    console.log('\n💡 Looking for these fields:');
    console.log('   - sales_point_1, sales_point_2, sales_point_3, sales_point_4, sales_point_5');
    console.log('   - available_in_other_colors');
    console.log('   - available_in_all');
    console.log('   - matches_with');
    console.log('   - match_1, match_2, match_3, match_4, match_5, etc.');

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testShopifyMetafields();
