-- ================================================================
-- ShopSyncFlow: Create GIN Trigram Indexes for Product Search
-- ================================================================
-- Date: 2025-11-07
-- Purpose: Improve ILIKE search performance by 10-50x
-- Impact: Makes searches like "WHERE title ILIKE '%jordan%'" fast
-- ================================================================

-- Enable the pg_trgm extension (required for trigram indexes)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create GIN trigram indexes for full-text search on text fields
-- CONCURRENTLY allows index creation without locking the table

-- Index for product titles (most common search field)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_title_gin
  ON products USING GIN (title gin_trgm_ops);

-- Index for vendor names (common search field)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_vendor_gin
  ON products USING GIN (vendor gin_trgm_ops);

-- Index for SKU codes (common search field)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_sku_gin
  ON products USING GIN (sku gin_trgm_ops);

-- Index for categories (less common but useful)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_category_gin
  ON products USING GIN (category gin_trgm_ops);

-- Create B-tree indexes for exact match filters
-- These are used for filtering by status, vendor_id, etc.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_status
  ON products(status);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_vendor_id
  ON products(vendor_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_publish_status
  ON products(publish_status);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_shopify_product_id
  ON products(shopify_product_id);

-- Create composite indexes for common query patterns
-- These speed up queries that filter by status AND sort by date

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_status_created
  ON products(status, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_vendor_created
  ON products(vendor_id, created_at DESC);

-- Update table statistics for query planner optimization
ANALYZE products;

-- ================================================================
-- Verification Queries
-- ================================================================

-- Check that all indexes were created
SELECT
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename = 'products'
ORDER BY indexname;

-- Test search performance (should show Bitmap Index Scan)
EXPLAIN ANALYZE
SELECT * FROM products
WHERE title ILIKE '%jordan craig%'
LIMIT 100;

-- ================================================================
-- Expected Performance Improvements
-- ================================================================
-- Before indexes:
--   - Search query: 500-1,000ms (full table scan)
--   - EXPLAIN shows: Seq Scan on products
--
-- After indexes:
--   - Search query: 50-100ms (10-20x faster)
--   - EXPLAIN shows: Bitmap Index Scan on idx_products_title_gin
-- ================================================================
