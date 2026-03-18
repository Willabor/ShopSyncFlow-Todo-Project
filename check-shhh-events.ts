import '@shopify/shopify-api/adapters/node';
import { createAdminApiClient } from '@shopify/admin-api-client';

const SHOPIFY_STORE = 'nexus-clothes.myshopify.com';
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

async function checkEvents() {
  const client = createAdminApiClient({
    storeDomain: SHOPIFY_STORE,
    apiVersion: '2024-07',
    accessToken: SHOPIFY_ACCESS_TOKEN!,
  });

  // Check shhh-brand-1 collection events
  const collectionId = 'gid://shopify/Collection/394798366952';

  const query = `
    query GetCollectionEvents($id: ID!) {
      collection(id: $id) {
        id
        title
        handle
        updatedAt
        events(first: 10, sortKey: CREATED_AT) {
          edges {
            node {
              message
              createdAt
            }
          }
        }
      }
    }
  `;

  const response = await client.request(query, { variables: { id: collectionId } });

  console.log('Collection:', response.data?.collection?.title);
  console.log('Handle:', response.data?.collection?.handle);
  console.log('UpdatedAt:', response.data?.collection?.updatedAt);
  console.log('\nEvents:');

  const events = response.data?.collection?.events?.edges || [];
  if (events.length === 0) {
    console.log('  NO EVENTS FOUND!');
  } else {
    for (let i = 0; i < events.length; i++) {
      const edge = events[i] as any;
      console.log('  ' + (i + 1) + '. [' + edge.node.createdAt + '] ' + edge.node.message);
    }
  }
}

checkEvents().catch(console.error);
