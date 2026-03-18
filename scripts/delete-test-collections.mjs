/**
 * Delete test collections from Shopify and local database
 */

import { createAdminApiClient } from '@shopify/admin-api-client';
import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;
const pool = new pg.Pool({ connectionString: DATABASE_URL });

async function getActiveShopifyStore() {
  const result = await pool.query(
    'SELECT * FROM shopify_stores WHERE is_active = true LIMIT 1'
  );
  return result.rows[0];
}

async function deleteFromShopify(client, shopifyId, name) {
  console.log(`\n🗑️  Deleting "${name}" from Shopify...`);
  console.log(`   Shopify ID: ${shopifyId}`);

  try {
    const response = await client.request(`
      mutation deleteCollection($id: ID!) {
        collectionDelete(input: { id: $id }) {
          deletedCollectionId
          userErrors {
            field
            message
          }
        }
      }
    `, {
      variables: { id: shopifyId }
    });

    const userErrors = response.data?.collectionDelete?.userErrors || [];
    if (userErrors.length > 0) {
      console.log(`   ❌ Shopify errors:`, userErrors);
      return false;
    }

    const deletedId = response.data?.collectionDelete?.deletedCollectionId;
    if (deletedId) {
      console.log(`   ✅ Deleted from Shopify: ${deletedId}`);
      return true;
    } else {
      console.log(`   ⚠️  No deletedCollectionId returned (may already be deleted)`);
      return true; // Consider it deleted
    }
  } catch (error) {
    console.error(`   ❌ Error deleting from Shopify:`, error.message);
    return false;
  }
}

async function deleteFromDatabase(localId, name) {
  console.log(`\n🗑️  Deleting "${name}" from local database...`);
  console.log(`   Local ID: ${localId}`);

  try {
    const result = await pool.query(
      'DELETE FROM collections WHERE id = $1 RETURNING id, name',
      [localId]
    );

    if (result.rowCount > 0) {
      console.log(`   ✅ Deleted from database: ${result.rows[0].name}`);
      return true;
    } else {
      console.log(`   ⚠️  Not found in database (may already be deleted)`);
      return true;
    }
  } catch (error) {
    console.error(`   ❌ Error deleting from database:`, error.message);
    return false;
  }
}

async function main() {
  console.log('🧹 Starting cleanup of test collections...\n');

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

  // Test collections to delete
  const collectionsToDelete = [
    {
      name: 'Test Manual Collection - Claude',
      localId: '0726ddf2-63ca-4875-a146-95dba1429e8d',
      shopifyId: 'gid://shopify/Collection/440516935912',
    },
    {
      name: 'Test Smart Collection - Summer Sale',
      localId: 'a9b9121f-85f2-45b3-ab76-a562b0a7fa8a',
      shopifyId: 'gid://shopify/Collection/440516903144',
    },
  ];

  let successCount = 0;

  for (const col of collectionsToDelete) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Processing: ${col.name}`);
    console.log(`${'='.repeat(60)}`);

    // Delete from Shopify first
    const shopifyDeleted = await deleteFromShopify(client, col.shopifyId, col.name);

    // Then delete from local database
    const dbDeleted = await deleteFromDatabase(col.localId, col.name);

    if (shopifyDeleted && dbDeleted) {
      successCount++;
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`SUMMARY: ${successCount}/${collectionsToDelete.length} collections deleted successfully`);
  console.log(`${'='.repeat(60)}\n`);

  await pool.end();
}

main().catch(console.error);
