-- ===================================================================
-- Migration: Migrate Existing Images to Files System
-- ===================================================================
-- Date: 2025-11-10
-- Phase: Files System - Phase 1 (Data Migration)
-- Purpose: Migrate existing image data from old columns to new Files system
--
-- Source Data:
--   • products.images (text[]) - Array of Shopify CDN URLs
--   • product_variants.image_url (text) - Single URL per variant
--
-- Target Tables:
--   • files - Extract unique URLs, create file records
--   • product_media - Link products to files
--   • variant_media - Link variants to files
--
-- Note: Old columns are NOT removed - kept for verification
-- ===================================================================

BEGIN;

-- ===================================================================
-- STEP 1: Migrate Product Images (products.images[])
-- ===================================================================

-- 1A: Extract unique image URLs from products.images[] array
-- Create file records for each unique URL
INSERT INTO files (
  filename,
  original_filename,
  file_path,
  mime_type,
  file_type,
  file_size,
  cdn_url,
  storage_provider,
  upload_source,
  created_at,
  updated_at
)
SELECT DISTINCT
  -- Extract filename from URL (everything after last '/')
  REGEXP_REPLACE(url, '^.*/(.+)$', '\1') AS filename,
  REGEXP_REPLACE(url, '^.*/(.+)$', '\1') AS original_filename,
  url AS file_path, -- Shopify URLs don't have local paths
  'image/jpeg' AS mime_type, -- Assume JPEG (can be refined later)
  'image' AS file_type,
  0 AS file_size, -- Unknown, will fetch later if needed
  url AS cdn_url,
  'shopify' AS storage_provider,
  'shopify_sync' AS upload_source,
  NOW() AS created_at,
  NOW() AS updated_at
FROM (
  -- UNNEST converts array to rows, WITH ORDINALITY adds row number
  SELECT UNNEST(images) AS url
  FROM products
  WHERE images IS NOT NULL AND array_length(images, 1) > 0
) AS image_urls
WHERE url IS NOT NULL AND url != ''
ON CONFLICT DO NOTHING; -- Skip if URL already exists

-- 1B: Create product_media links
-- Link each product to its images in the correct order
INSERT INTO product_media (
  product_id,
  file_id,
  position,
  is_featured,
  created_at
)
SELECT
  p.id AS product_id,
  f.id AS file_id,
  (img.idx + 1) AS position, -- Array index starts at 0, position starts at 1
  (img.idx = 0) AS is_featured, -- First image is featured
  NOW() AS created_at
FROM products p
  -- UNNEST with ORDINALITY to maintain array order
  CROSS JOIN LATERAL UNNEST(p.images) WITH ORDINALITY AS img(url, idx)
  -- Join to files table to get file_id
  JOIN files f ON f.cdn_url = img.url
WHERE p.images IS NOT NULL
ON CONFLICT (product_id, file_id) DO NOTHING;

-- ===================================================================
-- STEP 2: Migrate Variant Images (product_variants.image_url)
-- ===================================================================

-- 2A: Extract unique image URLs from product_variants.image_url
-- Create file records for URLs not already in files table
INSERT INTO files (
  filename,
  original_filename,
  file_path,
  mime_type,
  file_type,
  file_size,
  cdn_url,
  storage_provider,
  upload_source,
  created_at,
  updated_at
)
SELECT DISTINCT
  REGEXP_REPLACE(image_url, '^.*/(.+)$', '\1') AS filename,
  REGEXP_REPLACE(image_url, '^.*/(.+)$', '\1') AS original_filename,
  image_url AS file_path,
  'image/jpeg' AS mime_type,
  'image' AS file_type,
  0 AS file_size,
  image_url AS cdn_url,
  'shopify' AS storage_provider,
  'shopify_sync' AS upload_source,
  NOW() AS created_at,
  NOW() AS updated_at
FROM product_variants
WHERE image_url IS NOT NULL AND image_url != ''
ON CONFLICT DO NOTHING; -- Skip if URL already exists

-- 2B: Create variant_media links
-- Link each variant to its image
INSERT INTO variant_media (
  variant_id,
  file_id,
  position,
  is_featured,
  created_at
)
SELECT
  v.id AS variant_id,
  f.id AS file_id,
  1 AS position, -- Variants only have one image currently
  TRUE AS is_featured,
  NOW() AS created_at
FROM product_variants v
  JOIN files f ON f.cdn_url = v.image_url
WHERE v.image_url IS NOT NULL AND v.image_url != ''
ON CONFLICT (variant_id, file_id) DO NOTHING;

COMMIT;

-- ===================================================================
-- Migration Summary
-- ===================================================================
-- This migration has:
-- 1. Created file records for all unique image URLs from products and variants
-- 2. Created product_media links preserving image order and featured status
-- 3. Created variant_media links for variant-specific images
-- 4. Used ON CONFLICT DO NOTHING to handle duplicates safely
-- 5. Kept old columns (products.images, product_variants.image_url) for verification
--
-- Next Steps:
-- 1. Run verification queries (see 005_validate_files_migration.sql)
-- 2. Verify data integrity for 1-2 weeks
-- 3. Update application code to use new system
-- 4. Remove old columns (see /volume1/docker/planning/05-shopsyncflow/File-system/CLEANUP-PLAN.md)
-- ===================================================================

-- ===================================================================
-- Verification Queries (run after migration)
-- ===================================================================

-- Count files created from products
-- SELECT COUNT(*) AS files_from_products FROM files WHERE upload_source = 'shopify_sync';

-- Count product_media links created
-- SELECT COUNT(*) AS product_media_links FROM product_media;

-- Count products with old images
-- SELECT COUNT(*) AS products_with_old_images FROM products WHERE images IS NOT NULL AND array_length(images, 1) > 0;

-- Count products with new images
-- SELECT COUNT(DISTINCT product_id) AS products_with_new_images FROM product_media;

-- Count variants with old images
-- SELECT COUNT(*) AS variants_with_old_images FROM product_variants WHERE image_url IS NOT NULL AND image_url != '';

-- Count variants with new images
-- SELECT COUNT(DISTINCT variant_id) AS variants_with_new_images FROM variant_media;

-- Sample: Show a product with old and new images side-by-side
-- SELECT
--   p.id,
--   p.title,
--   p.images AS old_images,
--   ARRAY_AGG(f.cdn_url ORDER BY pm.position) AS new_images
-- FROM products p
--   LEFT JOIN product_media pm ON p.id = pm.product_id
--   LEFT JOIN files f ON pm.file_id = f.id
-- WHERE p.images IS NOT NULL
-- GROUP BY p.id, p.title, p.images
-- LIMIT 5;

-- ===================================================================
-- Rollback Instructions (if issues found)
-- ===================================================================
-- BEGIN;
-- DELETE FROM variant_media WHERE created_at > '[migration_timestamp]';
-- DELETE FROM product_media WHERE created_at > '[migration_timestamp]';
-- DELETE FROM files WHERE upload_source = 'shopify_sync' AND created_at > '[migration_timestamp]';
-- COMMIT;
-- ===================================================================
