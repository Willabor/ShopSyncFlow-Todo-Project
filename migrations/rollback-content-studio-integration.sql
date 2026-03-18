-- Rollback Migration: Content Studio Integration
-- Date: 2025-01-06
-- Purpose: Rollback Content Studio integration schema changes if needed

-- ============================================================================
-- WARNING: This will remove all Content Studio integration columns
-- Only run this if you need to completely rollback Phase 0
-- ============================================================================

BEGIN;

-- ============================================================================
-- PART 1: Drop indexes first (to avoid dependency issues)
-- ============================================================================

DROP INDEX IF EXISTS idx_products_status;
DROP INDEX IF EXISTS idx_products_shopify_product_id;
DROP INDEX IF EXISTS idx_products_publish_status;
DROP INDEX IF EXISTS idx_shopify_products_created_via;
DROP INDEX IF EXISTS idx_shopify_products_local_product_id;

-- ============================================================================
-- PART 2: Remove columns from products table
-- ============================================================================

ALTER TABLE products DROP COLUMN IF EXISTS status;
ALTER TABLE products DROP COLUMN IF EXISTS shopify_product_id;
ALTER TABLE products DROP COLUMN IF EXISTS published_at;
ALTER TABLE products DROP COLUMN IF EXISTS publish_status;
ALTER TABLE products DROP COLUMN IF EXISTS publish_error;
ALTER TABLE products DROP COLUMN IF EXISTS meta_title;
ALTER TABLE products DROP COLUMN IF EXISTS meta_description;
ALTER TABLE products DROP COLUMN IF EXISTS focus_keyword;
ALTER TABLE products DROP COLUMN IF EXISTS google_category;
ALTER TABLE products DROP COLUMN IF EXISTS generated_keywords;

-- ============================================================================
-- PART 3: Remove columns from shopify_products table
-- ============================================================================

ALTER TABLE shopify_products DROP COLUMN IF EXISTS created_via;
ALTER TABLE shopify_products DROP COLUMN IF EXISTS local_product_id;

-- ============================================================================
-- PART 4: Verification
-- ============================================================================

-- Verify products table columns removed
SELECT
    column_name,
    data_type
FROM information_schema.columns
WHERE table_name = 'products'
  AND column_name IN (
    'status',
    'shopify_product_id',
    'published_at',
    'publish_status',
    'publish_error',
    'meta_title',
    'meta_description',
    'focus_keyword',
    'google_category',
    'generated_keywords'
  );
-- Expected: 0 rows

-- Verify shopify_products table columns removed
SELECT
    column_name,
    data_type
FROM information_schema.columns
WHERE table_name = 'shopify_products'
  AND column_name IN ('created_via', 'local_product_id');
-- Expected: 0 rows

-- Verify indexes removed
SELECT indexname
FROM pg_indexes
WHERE tablename IN ('products', 'shopify_products')
  AND (
    indexname LIKE 'idx_%status%'
    OR indexname LIKE 'idx_%product_id%'
    OR indexname LIKE 'idx_%created_via%'
    OR indexname LIKE 'idx_%publish%'
  );
-- Expected: 0 rows (only Shopify indexes should remain)

COMMIT;

-- ============================================================================
-- SUCCESS MESSAGE
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '✅ Rollback completed successfully!';
    RAISE NOTICE '📊 Removed 10 columns from products table';
    RAISE NOTICE '📊 Removed 2 columns from shopify_products table';
    RAISE NOTICE '🔍 Dropped 5 indexes';
    RAISE NOTICE '⚠️  Content Studio integration has been rolled back';
END $$;
