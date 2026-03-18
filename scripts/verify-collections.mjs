/**
 * Verify collections in Shopify
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

async function main() {
  const store = await getActiveShopifyStore();
  if (!store) {
    console.error('No active Shopify store');
    process.exit(1);
  }

  const client = createAdminApiClient({
    storeDomain: store.shop_domain,
    apiVersion: '2025-01',
    accessToken: store.access_token,
  });

  // Collection IDs to verify
  const collections = [
    { name: 'Manual Collection', id: 'gid://shopify/Collection/440516935912' },
    { name: 'Smart Collection', id: 'gid://shopify/Collection/440516903144' },
  ];

  console.log('🔍 Verifying collections in Shopify...\n');

  for (const col of collections) {
    try {
      const response = await client.request(`
        query getCollection($id: ID!) {
          collection(id: $id) {
            id
            title
            handle
            description
            productsCount {
              count
            }
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
      `, {
        variables: { id: col.id }
      });

      const collection = response.data?.collection;
      if (collection) {
        console.log(`✅ ${col.name}:`);
        console.log(`   Title: ${collection.title}`);
        console.log(`   Handle: ${collection.handle}`);
        console.log(`   URL: https://${store.shop_domain}/collections/${collection.handle}`);
        console.log(`   Products: ${collection.productsCount?.count || 0}`);
        if (collection.ruleSet?.rules?.length > 0) {
          console.log(`   Type: Smart Collection`);
          console.log(`   Logic: ${collection.ruleSet.appliedDisjunctively ? 'ANY condition' : 'ALL conditions'}`);
          console.log(`   Rules:`);
          collection.ruleSet.rules.forEach((rule, i) => {
            console.log(`     ${i + 1}. ${rule.column} ${rule.relation} "${rule.condition}"`);
          });
        } else {
          console.log(`   Type: Manual Collection`);
        }
        console.log();
      } else {
        console.log(`❌ ${col.name}: Not found in Shopify\n`);
      }
    } catch (error) {
      console.error(`❌ Error fetching ${col.name}:`, error.message);
    }
  }

  await pool.end();
}

main().catch(console.error);
