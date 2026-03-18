-- ===================================================================
-- Validation: Files System Migration
-- ===================================================================
-- Date: 2025-11-10
-- Phase: Files System - Phase 1 (Validation)
-- Purpose: Comprehensive validation of Files system migration
--
-- Run this AFTER:
--   1. 003_create_files_system_tables.sql
--   2. 004_migrate_existing_images.sql
--
-- This file contains READ-ONLY validation queries
-- ===================================================================

\echo '========================================='
\echo 'FILES SYSTEM MIGRATION VALIDATION'
\echo '========================================='
\echo ''

-- ===================================================================
-- SECTION 1: Table Structure Validation
-- ===================================================================
\echo '--- SECTION 1: Table Structure ---'
\echo ''

-- 1A: Verify all tables exist
\echo '1A. Tables Created:'
SELECT
  table_name,
  CASE
    WHEN table_name IN ('files', 'product_media', 'variant_media', 'file_references') THEN '✓ EXISTS'
    ELSE '✗ MISSING'
  END AS status
FROM information_schema.tables
WHERE table_name IN ('files', 'product_media', 'variant_media', 'file_references')
ORDER BY table_name;

\echo ''

-- 1B: Verify key indexes exist
\echo '1B. Key Indexes:'
SELECT
  tablename,
  indexname,
  '✓ OK' AS status
FROM pg_indexes
WHERE tablename IN ('files', 'product_media', 'variant_media', 'file_references')
  AND indexname LIKE '%idx%'
ORDER BY tablename, indexname;

\echo ''
\echo '--- END SECTION 1 ---'
\echo ''

-- ===================================================================
-- SECTION 2: Data Migration Validation
-- ===================================================================
\echo '--- SECTION 2: Data Migration ---'
\echo ''

-- 2A: Product images migration counts
\echo '2A. Product Images Migration:'
WITH old_count AS (
  SELECT COUNT(*) AS count
  FROM products
  WHERE images IS NOT NULL AND array_length(images, 1) > 0
),
new_count AS (
  SELECT COUNT(DISTINCT product_id) AS count
  FROM product_media
)
SELECT
  old_count.count AS products_with_old_images,
  new_count.count AS products_with_new_images,
  CASE
    WHEN new_count.count >= old_count.count THEN '✓ PASS'
    ELSE '✗ FAIL - Some products not migrated'
  END AS status
FROM old_count, new_count;

\echo ''

-- 2B: Variant images migration counts
\echo '2B. Variant Images Migration:'
WITH old_count AS (
  SELECT COUNT(*) AS count
  FROM product_variants
  WHERE image_url IS NOT NULL AND image_url != ''
),
new_count AS (
  SELECT COUNT(DISTINCT variant_id) AS count
  FROM variant_media
)
SELECT
  old_count.count AS variants_with_old_images,
  new_count.count AS variants_with_new_images,
  CASE
    WHEN new_count.count >= old_count.count THEN '✓ PASS'
    ELSE '✗ FAIL - Some variants not migrated'
  END AS status
FROM old_count, new_count;

\echo ''

-- 2C: Total unique files created
\echo '2C. Files Created:'
SELECT
  COUNT(*) AS total_files,
  COUNT(CASE WHEN file_type = 'image' THEN 1 END) AS image_files,
  COUNT(CASE WHEN storage_provider = 'shopify' THEN 1 END) AS shopify_files,
  COUNT(CASE WHEN upload_source = 'shopify_sync' THEN 1 END) AS from_sync
FROM files;

\echo ''
\echo '--- END SECTION 2 ---'
\echo ''

-- ===================================================================
-- SECTION 3: Data Integrity Validation
-- ===================================================================
\echo '--- SECTION 3: Data Integrity ---'
\echo ''

-- 3A: Check for orphaned product_media (should be 0)
\echo '3A. Orphaned product_media records (should be 0):'
SELECT
  COUNT(*) AS orphaned_count,
  CASE
    WHEN COUNT(*) = 0 THEN '✓ PASS'
    ELSE '✗ FAIL - Found orphaned records'
  END AS status
FROM product_media pm
  LEFT JOIN products p ON pm.product_id = p.id
  LEFT JOIN files f ON pm.file_id = f.id
WHERE p.id IS NULL OR f.id IS NULL;

\echo ''

-- 3B: Check for orphaned variant_media (should be 0)
\echo '3B. Orphaned variant_media records (should be 0):'
SELECT
  COUNT(*) AS orphaned_count,
  CASE
    WHEN COUNT(*) = 0 THEN '✓ PASS'
    ELSE '✗ FAIL - Found orphaned records'
  END AS status
FROM variant_media vm
  LEFT JOIN product_variants v ON vm.variant_id = v.id
  LEFT JOIN files f ON vm.file_id = f.id
WHERE v.id IS NULL OR f.id IS NULL;

\echo ''

-- 3C: Check featured image constraint (should have 0 or 1 per product)
\echo '3C. Products with multiple featured images (should be 0):'
SELECT
  COUNT(*) AS products_with_multiple_featured,
  CASE
    WHEN COUNT(*) = 0 THEN '✓ PASS'
    ELSE '✗ FAIL - Multiple featured images found'
  END AS status
FROM (
  SELECT product_id, COUNT(*) AS featured_count
  FROM product_media
  WHERE is_featured = TRUE
  GROUP BY product_id
  HAVING COUNT(*) > 1
) AS duplicates;

\echo ''

-- 3D: Check for NULL cdn_url (should be 0)
\echo '3D. Files with NULL cdn_url (should be 0):'
SELECT
  COUNT(*) AS files_with_null_url,
  CASE
    WHEN COUNT(*) = 0 THEN '✓ PASS'
    ELSE '✗ FAIL - Files with NULL cdn_url found'
  END AS status
FROM files
WHERE cdn_url IS NULL;

\echo ''
\echo '--- END SECTION 3 ---'
\echo ''

-- ===================================================================
-- SECTION 4: Sample Data Validation
-- ===================================================================
\echo '--- SECTION 4: Sample Data ---'
\echo ''

-- 4A: Show sample product with old and new images
\echo '4A. Sample Product (Old vs New Images):'
SELECT
  p.id,
  p.title,
  ARRAY_LENGTH(p.images, 1) AS old_image_count,
  COUNT(pm.id) AS new_image_count,
  CASE
    WHEN ARRAY_LENGTH(p.images, 1) = COUNT(pm.id) THEN '✓ MATCH'
    ELSE '✗ MISMATCH'
  END AS status
FROM products p
  LEFT JOIN product_media pm ON p.id = pm.product_id
WHERE p.images IS NOT NULL AND ARRAY_LENGTH(p.images, 1) > 0
GROUP BY p.id, p.title, p.images
ORDER BY RANDOM()
LIMIT 5;

\echo ''

-- 4B: Show sample variant with old and new image
\echo '4B. Sample Variant (Old vs New Image):'
SELECT
  v.id,
  v.title,
  CASE WHEN v.image_url IS NOT NULL THEN 'HAS OLD' ELSE 'NO OLD' END AS old_status,
  CASE WHEN vm.id IS NOT NULL THEN 'HAS NEW' ELSE 'NO NEW' END AS new_status,
  CASE
    WHEN (v.image_url IS NOT NULL AND vm.id IS NOT NULL) OR (v.image_url IS NULL AND vm.id IS NULL) THEN '✓ MATCH'
    ELSE '✗ MISMATCH'
  END AS status
FROM product_variants v
  LEFT JOIN variant_media vm ON v.id = vm.variant_id
WHERE v.image_url IS NOT NULL AND v.image_url != ''
ORDER BY RANDOM()
LIMIT 5;

\echo ''
\echo '--- END SECTION 4 ---'
\echo ''

-- ===================================================================
-- SECTION 5: Summary Statistics
-- ===================================================================
\echo '--- SECTION 5: Summary Statistics ---'
\echo ''

\echo '5. Migration Summary:'
SELECT
  'Products' AS category,
  (SELECT COUNT(*) FROM products WHERE images IS NOT NULL AND ARRAY_LENGTH(images, 1) > 0) AS old_count,
  (SELECT COUNT(DISTINCT product_id) FROM product_media) AS new_count
UNION ALL
SELECT
  'Variants' AS category,
  (SELECT COUNT(*) FROM product_variants WHERE image_url IS NOT NULL AND image_url != '') AS old_count,
  (SELECT COUNT(DISTINCT variant_id) FROM variant_media) AS new_count
UNION ALL
SELECT
  'Total Files' AS category,
  0 AS old_count,
  (SELECT COUNT(*) FROM files) AS new_count;

\echo ''

-- ===================================================================
-- SECTION 6: Gap Analysis
-- ===================================================================
\echo '--- SECTION 6: Gap Analysis ---'
\echo ''

-- 6A: Products with old images but no new images (should investigate)
\echo '6A. Products with OLD images but NO NEW images (investigate):'
SELECT
  p.id,
  p.title,
  ARRAY_LENGTH(p.images, 1) AS image_count
FROM products p
  LEFT JOIN product_media pm ON p.id = pm.product_id
WHERE p.images IS NOT NULL
  AND ARRAY_LENGTH(p.images, 1) > 0
  AND pm.id IS NULL
LIMIT 10;

\echo ''

-- 6B: Variants with old image but no new image (should investigate)
\echo '6B. Variants with OLD image but NO NEW image (investigate):'
SELECT
  v.id,
  v.title,
  v.image_url
FROM product_variants v
  LEFT JOIN variant_media vm ON v.id = vm.variant_id
WHERE v.image_url IS NOT NULL
  AND v.image_url != ''
  AND vm.id IS NULL
LIMIT 10;

\echo ''
\echo '--- END SECTION 6 ---'
\echo ''

-- ===================================================================
-- FINAL VERDICT
-- ===================================================================
\echo '========================================='
\echo 'MIGRATION VALIDATION COMPLETE'
\echo '========================================='
\echo ''
\echo 'Review the results above to ensure:'
\echo '  1. All tables and indexes exist'
\echo '  2. Data counts match (old >= new)'
\echo '  3. No orphaned records'
\echo '  4. No constraint violations'
\echo '  5. Sample data looks correct'
\echo '  6. Gap analysis shows no unexpected issues'
\echo ''
\echo 'If all checks pass, migration is successful!'
\echo 'Keep old columns for 1-2 weeks before cleanup.'
\echo ''
\echo 'See: /volume1/docker/planning/05-shopsyncflow/File-system/CLEANUP-PLAN.md'
\echo '========================================='
