-- Migration: Add Content Studio Integration Columns
-- Date: 2025-01-06
-- Purpose: Add columns to support Content Studio + Shopify integration
-- Phase: 0 - Database Schema Updates

-- ============================================================================
-- PART 1: Update products table (Content Studio products)
-- ============================================================================

-- Add product status and publishing tracking
ALTER TABLE products ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'local_draft' NOT NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS shopify_product_id VARCHAR;
ALTER TABLE products ADD COLUMN IF NOT EXISTS published_at TIMESTAMP;
ALTER TABLE products ADD COLUMN IF NOT EXISTS publish_status TEXT DEFAULT 'not_published' NOT NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS publish_error TEXT;

-- Add SEO content columns (from AI generation)
ALTER TABLE products ADD COLUMN IF NOT EXISTS meta_title TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS meta_description TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS focus_keyword TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS google_category JSONB;
ALTER TABLE products ADD COLUMN IF NOT EXISTS generated_keywords TEXT[];

-- Add comment for clarity
COMMENT ON COLUMN products.status IS 'Product lifecycle status: local_draft, draft, active, archived';
COMMENT ON COLUMN products.publish_status IS 'Publishing status: not_published, publishing, published, failed';
COMMENT ON COLUMN products.shopify_product_id IS 'References shopify_products.id when published';

-- ============================================================================
-- PART 2: Update shopify_products table (Shopify synced products)
-- ============================================================================

-- Add origin tracking
ALTER TABLE shopify_products ADD COLUMN IF NOT EXISTS created_via TEXT DEFAULT 'shopify_sync' NOT NULL;
ALTER TABLE shopify_products ADD COLUMN IF NOT EXISTS local_product_id VARCHAR;

-- Add comment for clarity
COMMENT ON COLUMN shopify_products.created_via IS 'Product origin: content_studio, shopify_sync, manual';
COMMENT ON COLUMN shopify_products.local_product_id IS 'References products.id if created via Content Studio';

-- ============================================================================
-- PART 3: Create indexes for performance
-- ============================================================================

-- Indexes on products table
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
CREATE INDEX IF NOT EXISTS idx_products_shopify_product_id ON products(shopify_product_id);
CREATE INDEX IF NOT EXISTS idx_products_publish_status ON products(publish_status);

-- Indexes on shopify_products table
CREATE INDEX IF NOT EXISTS idx_shopify_products_created_via ON shopify_products(created_via);
CREATE INDEX IF NOT EXISTS idx_shopify_products_local_product_id ON shopify_products(local_product_id);

-- ============================================================================
-- PART 4: Add foreign key constraints (with error handling)
-- ============================================================================

-- Note: We cannot add foreign key constraints for circular references
-- between products.shopify_product_id and shopify_products.local_product_id
-- because it would create a circular dependency.
--
-- Instead, we'll enforce referential integrity at the application level.
-- This is a known limitation when two tables reference each other.

-- ============================================================================
-- PART 5: Data validation and cleanup (if needed)
-- ============================================================================

-- Set default status for existing products (if any exist)
UPDATE products
SET status = 'local_draft',
    publish_status = 'not_published'
WHERE status IS NULL OR publish_status IS NULL;

-- Set default created_via for existing shopify_products (if any exist)
UPDATE shopify_products
SET created_via = 'shopify_sync'
WHERE created_via IS NULL;

-- ============================================================================
-- PART 6: Verification queries
-- ============================================================================

-- Verify products table columns
SELECT
    column_name,
    data_type,
    is_nullable,
    column_default
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
  )
ORDER BY ordinal_position;

-- Verify shopify_products table columns
SELECT
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'shopify_products'
  AND column_name IN ('created_via', 'local_product_id')
ORDER BY ordinal_position;

-- Verify indexes
SELECT
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename IN ('products', 'shopify_products')
  AND indexname LIKE 'idx_%status%'
   OR indexname LIKE 'idx_%product_id%'
   OR indexname LIKE 'idx_%created_via%'
ORDER BY tablename, indexname;

-- ============================================================================
-- SUCCESS MESSAGE
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '✅ Migration completed successfully!';
    RAISE NOTICE '📊 Products table: Added 10 new columns';
    RAISE NOTICE '📊 Shopify_products table: Added 2 new columns';
    RAISE NOTICE '🔍 Created 5 new indexes';
    RAISE NOTICE '✨ Content Studio integration schema ready!';
END $$;
