// One-shot backfill: stamp custom.listing_owner='shopsyncflow' on every existing
// Shopify product that doesn't have a listing_owner metafield yet.
//
// Context (auto-listing plan, amendment #2): ShopSyncFlow and the Monalisa agent
// coexist on one store with exactly ONE listing-content owner per product. Monalisa
// is fail-closed (unset owner = not hers), so this backfill is for audit clarity,
// not safety. Going forward the publish path stamps the metafield automatically.
//
// Usage:
//   node scripts/one-shot-fixes/2026-07-03-backfill-listing-owner.mjs --dry-run
//   node scripts/one-shot-fixes/2026-07-03-backfill-listing-owner.mjs
//
// Env: SHOPIFY_STORE_URL (or SHOPIFY_STORE_DOMAIN), SHOPIFY_ACCESS_TOKEN
import "dotenv/config";

const API_VERSION = "2024-01";
const OWNER_VALUE = "shopsyncflow";
const DRY_RUN = process.argv.includes("--dry-run");

const rawStore = process.env.SHOPIFY_STORE_URL || process.env.SHOPIFY_STORE_DOMAIN;
const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
if (!rawStore || !TOKEN) {
  console.error("Missing SHOPIFY_STORE_URL / SHOPIFY_ACCESS_TOKEN in env");
  process.exit(1);
}
const STORE = rawStore.replace(/^https?:\/\//, "").replace(/\/$/, "");
const GQL = `https://${STORE}/admin/api/${API_VERSION}/graphql.json`;

async function gql(query, variables) {
  const res = await fetch(GQL, {
    method: "POST",
    headers: { "X-Shopify-Access-Token": TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const body = await res.json();
  if (body.errors) throw new Error(JSON.stringify(body.errors));
  return body.data;
}

// 1. Collect all products missing custom.listing_owner (any status — the whole
//    catalog belongs to ShopSyncFlow until Monalisa creates her own)
const PRODUCTS_QUERY = `
  query($cursor: String) {
    products(first: 250, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        title
        metafield(namespace: "custom", key: "listing_owner") { value }
      }
    }
  }`;

const toStamp = [];
let cursor = null;
let scanned = 0;
for (;;) {
  const data = await gql(PRODUCTS_QUERY, { cursor });
  const page = data.products;
  scanned += page.nodes.length;
  for (const p of page.nodes) {
    if (!p.metafield?.value) toStamp.push(p.id);
  }
  process.stdout.write(`\rScanned ${scanned} products, ${toStamp.length} need stamping...`);
  if (!page.pageInfo.hasNextPage) break;
  cursor = page.pageInfo.endCursor;
}
console.log(`\nTotal: ${scanned} products, ${toStamp.length} missing listing_owner`);

if (DRY_RUN) {
  console.log("Dry run — no writes performed.");
  process.exit(0);
}

// 2. Stamp in chunks of 25 (metafieldsSet limit per call)
const SET_MUTATION = `
  mutation($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields { id }
      userErrors { field message }
    }
  }`;

let stamped = 0;
for (let i = 0; i < toStamp.length; i += 25) {
  const chunk = toStamp.slice(i, i + 25).map((ownerId) => ({
    ownerId,
    namespace: "custom",
    key: "listing_owner",
    value: OWNER_VALUE,
    type: "single_line_text_field",
  }));
  const data = await gql(SET_MUTATION, { metafields: chunk });
  const errs = data.metafieldsSet.userErrors;
  if (errs?.length) {
    console.error(`\nuserErrors at batch ${i / 25}:`, JSON.stringify(errs));
    process.exit(1);
  }
  stamped += chunk.length;
  process.stdout.write(`\rStamped ${stamped}/${toStamp.length}...`);
  await new Promise((r) => setTimeout(r, 600)); // stay well under throttle budget
}
console.log(`\nDone. ${stamped} products stamped listing_owner='${OWNER_VALUE}'.`);
