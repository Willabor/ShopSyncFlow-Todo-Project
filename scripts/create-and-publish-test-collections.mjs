/**
 * Create and publish new test collections to Shopify
 */

import { createAdminApiClient } from '@shopify/admin-api-client';
import pg from 'pg';
import { randomUUID } from 'crypto';

const DATABASE_URL = process.env.DATABASE_URL;
const pool = new pg.Pool({ connectionString: DATABASE_URL });

async function getActiveShopifyStore() {
  const result = await pool.query(
    'SELECT * FROM shopify_stores WHERE is_active = true LIMIT 1'
  );
  return result.rows[0];
}

async function createLocalCollection(collection) {
  console.log(`\n📝 Creating local collection: "${collection.name}"...`);

  // shopify_type: 'smart' for smart collections with rules, 'manual' for manual collections
  const shopifyType = collection.rules?.rules?.length > 0 ? 'smart' : 'manual';

  const result = await pool.query(`
    INSERT INTO collections (id, name, slug, description, shopify_type, rules, is_active, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, true, NOW(), NOW())
    RETURNING id, name, shopify_type
  `, [
    collection.id,
    collection.name,
    collection.slug,
    collection.description,
    shopifyType,
    collection.rules ? JSON.stringify(collection.rules) : null
  ]);

  console.log(`   ✅ Created in database: ${result.rows[0].name} (${result.rows[0].shopify_type})`);
  return result.rows[0];
}

async function publishToShopify(client, store, collection) {
  console.log(`\n🚀 Publishing "${collection.name}" to Shopify...`);

  const collectionInput = {
    title: collection.name,
    descriptionHtml: collection.description || '',
  };

  // Add ruleSet ONLY for smart collections (check rules, not type field)
  if (collection.rules?.rules?.length > 0) {
    collectionInput.ruleSet = {
      appliedDisjunctively: collection.rules.disjunctive || false,
      rules: collection.rules.rules.map(rule => ({
        column: rule.column.toUpperCase(),
        relation: rule.relation.toUpperCase(),
        condition: rule.condition,
      })),
    };
    console.log(`   Type: Smart Collection`);
    console.log(`   Logic: ${collectionInput.ruleSet.appliedDisjunctively ? 'ANY condition (OR)' : 'ALL conditions (AND)'}`);
    console.log(`   Rules: ${collection.rules.rules.map(r => `${r.column} ${r.relation} "${r.condition}"`).join(', ')}`);
  } else {
    console.log(`   Type: Manual Collection`);
  }

  try {
    const response = await client.request(`
      mutation createCollection($input: CollectionInput!) {
        collectionCreate(input: $input) {
          collection {
            id
            title
            handle
            productsCount {
              count
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

    const userErrors = response.data?.collectionCreate?.userErrors || [];
    if (userErrors.length > 0) {
      console.log(`   ❌ Shopify errors:`, userErrors);
      return null;
    }

    const shopifyCollection = response.data?.collectionCreate?.collection;
    if (shopifyCollection) {
      console.log(`   ✅ Published to Shopify!`);
      console.log(`   Shopify ID: ${shopifyCollection.id}`);
      console.log(`   Handle: ${shopifyCollection.handle}`);
      console.log(`   URL: https://${store.shop_domain}/collections/${shopifyCollection.handle}`);
      console.log(`   Products: ${shopifyCollection.productsCount?.count || 0}`);

      // Update local record with Shopify ID
      await pool.query(`
        UPDATE collections
        SET shopify_collection_id = $1, shopify_handle = $2, updated_at = NOW()
        WHERE id = $3
      `, [shopifyCollection.id, shopifyCollection.handle, collection.id]);
      console.log(`   ✅ Local database updated with Shopify ID`);

      return shopifyCollection;
    }
  } catch (error) {
    console.error(`   ❌ Error publishing to Shopify:`, error.message);
    return null;
  }
}

async function main() {
  console.log('🎯 Creating and publishing new test collections...\n');

  const store = await getActiveShopifyStore();
  if (!store) {
    console.error('❌ No active Shopify store found');
    process.exit(1);
  }

  console.log(`📦 Connected to store: ${store.shop_domain}`);

  const client = createAdminApiClient({
    storeDomain: store.shop_domain,
    apiVersion: '2025-01',
    accessToken: store.access_token,
  });

  // Define new test collections (completely different from previous ones)
  const newCollections = [
    {
      id: randomUUID(),
      name: 'Winter Clearance - Test',
      slug: 'winter-clearance-test',
      description: 'Test manual collection for winter clearance items',
      type: 'manual',
      rules: null,
    },
    {
      id: randomUUID(),
      name: 'Premium Products Over $50 - Test',
      slug: 'premium-products-over-50-test',
      description: 'Test smart collection for premium priced items',
      type: 'smart',
      rules: {
        disjunctive: false, // ALL conditions (AND)
        rules: [
          { column: 'variant_price', relation: 'greater_than', condition: '50' },
        ],
      },
    },
  ];

  let successCount = 0;

  for (const col of newCollections) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Processing: ${col.name}`);
    console.log(`${'='.repeat(60)}`);

    // Create in local database
    await createLocalCollection(col);

    // Publish to Shopify
    const shopifyResult = await publishToShopify(client, store, col);

    if (shopifyResult) {
      successCount++;
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`SUMMARY: ${successCount}/${newCollections.length} collections created and published`);
  console.log(`${'='.repeat(60)}\n`);

  await pool.end();
}

main().catch(console.error);
