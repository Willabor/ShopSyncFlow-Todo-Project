/**
 * Standalone script to publish test collections to Shopify
 * Uses direct API calls to avoid loading the full server
 */

import { createAdminApiClient } from '@shopify/admin-api-client';
import pg from 'pg';

// Load environment variables
const DATABASE_URL = process.env.DATABASE_URL;
const SHOPIFY_STORE_URL = process.env.SHOPIFY_STORE_URL;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

if (!DATABASE_URL) {
  console.error('DATABASE_URL environment variable is required');
  process.exit(1);
}

// Database connection
const pool = new pg.Pool({ connectionString: DATABASE_URL });

async function getActiveShopifyStore() {
  const result = await pool.query(
    'SELECT * FROM shopify_stores WHERE is_active = true LIMIT 1'
  );
  return result.rows[0];
}

async function getCollectionById(id) {
  const result = await pool.query(
    'SELECT * FROM collections WHERE id = $1',
    [id]
  );
  return result.rows[0];
}

async function updateCollection(id, updates) {
  const setClause = Object.keys(updates)
    .map((key, i) => `"${key}" = $${i + 2}`)
    .join(', ');
  const values = [id, ...Object.values(updates)];

  await pool.query(
    `UPDATE collections SET ${setClause} WHERE id = $1`,
    values
  );
}

async function publishCollectionToShopify(collectionId) {
  try {
    const store = await getActiveShopifyStore();
    if (!store) {
      return { success: false, error: 'No active Shopify store configured' };
    }

    const collection = await getCollectionById(collectionId);
    if (!collection) {
      return { success: false, error: 'Collection not found' };
    }

    if (collection.shopify_collection_id) {
      return {
        success: true,
        shopifyCollectionId: collection.shopify_collection_id,
        error: 'Collection already published to Shopify'
      };
    }

    const client = createAdminApiClient({
      storeDomain: store.shop_domain,
      apiVersion: '2025-01',
      accessToken: store.access_token,
    });

    const isSmartCollection = collection.shopify_type === 'smart';
    const rules = collection.rules;

    let collectionInput = {
      title: collection.name,
      descriptionHtml: collection.description || '',
      handle: collection.slug,
    };

    if (isSmartCollection && rules && rules.rules && rules.rules.length > 0) {
      collectionInput.ruleSet = {
        appliedDisjunctively: rules.disjunctive,
        rules: rules.rules.map(rule => ({
          column: rule.column.toUpperCase(),
          relation: rule.relation.toUpperCase(),
          condition: rule.condition,
        })),
      };
      console.log(`📦 Publishing SMART collection "${collection.name}" with ${rules.rules.length} rules`);
    } else {
      // Manual collection - DO NOT include ruleSet (Shopify doesn't allow empty rules)
      console.log(`📦 Publishing MANUAL collection "${collection.name}"`);
    }

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
      console.error(`❌ Error creating collection:`, userErrors);
      return {
        success: false,
        error: userErrors.map(e => `${e.field}: ${e.message}`).join(', ')
      };
    }

    const newCollection = createResponse.data?.collectionCreate?.collection;
    if (!newCollection) {
      return { success: false, error: 'Failed to create collection in Shopify' };
    }

    console.log(`✅ Created Shopify collection: ${newCollection.title} (${newCollection.id})`);

    // Update local collection
    await updateCollection(collectionId, {
      shopify_collection_id: newCollection.id,
      shopify_handle: newCollection.handle,
      synced_at: new Date(),
    });

    return {
      success: true,
      shopifyCollectionId: newCollection.id,
    };

  } catch (error) {
    console.error('❌ Error publishing collection:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

async function main() {
  console.log('🚀 Starting collection publish test...\n');

  const manualCollectionId = '0726ddf2-63ca-4875-a146-95dba1429e8d';
  const smartCollectionId = 'a9b9121f-85f2-45b3-ab76-a562b0a7fa8a';

  console.log('📦 Publishing MANUAL collection...');
  const manualResult = await publishCollectionToShopify(manualCollectionId);
  console.log('Manual collection result:', JSON.stringify(manualResult, null, 2));
  console.log();

  console.log('📦 Publishing SMART collection...');
  const smartResult = await publishCollectionToShopify(smartCollectionId);
  console.log('Smart collection result:', JSON.stringify(smartResult, null, 2));
  console.log();

  console.log('✅ Test complete!');

  await pool.end();
}

main().catch(err => {
  console.error(err);
  pool.end();
  process.exit(1);
});
