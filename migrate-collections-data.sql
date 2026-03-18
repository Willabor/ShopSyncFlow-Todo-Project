-- Migration Script: Move product.collections text data to product_collections join table
-- Run this after collections table is ready

-- Step 1: Create collections from unique values in products.collections field
INSERT INTO collections (name, slug, is_active, product_count, created_at, updated_at)
SELECT DISTINCT
  TRIM(collection_name) as name,
  LOWER(REGEXP_REPLACE(REGEXP_REPLACE(TRIM(collection_name), '[^a-zA-Z0-9]+', '-', 'g'), '^-+|-+$', '', 'g')) as slug,
  true as is_active,
  0 as product_count,
  NOW() as created_at,
  NOW() as updated_at
FROM (
  SELECT UNNEST(STRING_TO_ARRAY(collections, ',')) as collection_name
  FROM products
  WHERE collections IS NOT NULL AND collections != ''
) unique_collections
WHERE TRIM(collection_name) != ''
ON CONFLICT (name) DO NOTHING;

-- Step 2: Insert product-collection relationships into join table
INSERT INTO product_collections (product_id, collection_id, position, created_at, updated_at)
SELECT 
  p.id as product_id,
  c.id as collection_id,
  0 as position,
  NOW() as created_at,
  NOW() as updated_at
FROM products p
CROSS JOIN LATERAL UNNEST(STRING_TO_ARRAY(p.collections, ',')) WITH ORDINALITY AS collection_names(name, position)
INNER JOIN collections c ON TRIM(collection_names.name) = c.name
WHERE p.collections IS NOT NULL AND p.collections != ''
ON CONFLICT DO NOTHING;

-- Step 3: Update product counts for each collection
UPDATE collections c
SET product_count = (
  SELECT COUNT(*)
  FROM product_collections pc
  WHERE pc.collection_id = c.id
);

-- Step 4: Report statistics
SELECT 
  'Collections created' as step,
  COUNT(*) as count
FROM collections
UNION ALL
SELECT 
  'Product-Collection relationships created' as step,
  COUNT(*) as count
FROM product_collections
UNION ALL
SELECT 
  'Products with collections' as step,
  COUNT(*) as count
FROM products
WHERE collections IS NOT NULL AND collections != '';
