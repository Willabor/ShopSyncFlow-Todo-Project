-- ===================================================================
-- CLEANUP SCRIPT: Remove Legacy "Default" Variants
-- ===================================================================
-- Purpose: Remove 5,444 "Default" variants that were created before
--          the proper variant system was implemented.
--
-- These variants:
--   - Have title = 'Default'
--   - Do NOT have shopify_variant_id (local-only, not from Shopify)
--   - Have NULL option1/option2/option3
--   - Were created before variant management was implemented
--
-- Date: 2025-11-10
-- ===================================================================

BEGIN;

-- Step 1: Create backup table
CREATE TABLE IF NOT EXISTS product_variants_backup_20251110 AS
SELECT * FROM product_variants WHERE 1=0;

-- Step 2: Backup the variants we're about to delete
INSERT INTO product_variants_backup_20251110
SELECT * FROM product_variants
WHERE title = 'Default'
  AND shopify_variant_id IS NULL
  AND (option1 IS NULL OR option1 = '')
  AND (option2 IS NULL OR option2 = '')
  AND (option3 IS NULL OR option3 = '');

-- Step 3: Show what we're about to delete
SELECT
  COUNT(*) as variants_to_delete,
  COUNT(DISTINCT product_id) as products_affected
FROM product_variants
WHERE title = 'Default'
  AND shopify_variant_id IS NULL
  AND (option1 IS NULL OR option1 = '')
  AND (option2 IS NULL OR option2 = '')
  AND (option3 IS NULL OR option3 = '');

-- Step 4: Delete the legacy "Default" variants
DELETE FROM product_variants
WHERE title = 'Default'
  AND shopify_variant_id IS NULL
  AND (option1 IS NULL OR option1 = '')
  AND (option2 IS NULL OR option2 = '')
  AND (option3 IS NULL OR option3 = '');

-- Step 5: Verify deletion
SELECT
  COUNT(*) as remaining_default_variants
FROM product_variants
WHERE title = 'Default'
  AND shopify_variant_id IS NULL;

-- Step 6: Show backup table stats
SELECT
  COUNT(*) as backed_up_variants
FROM product_variants_backup_20251110;

COMMIT;

-- ===================================================================
-- ROLLBACK INSTRUCTIONS (if needed):
-- ===================================================================
-- If you need to restore the deleted variants:
--
-- BEGIN;
-- INSERT INTO product_variants
-- SELECT * FROM product_variants_backup_20251110;
-- COMMIT;
--
-- To drop the backup table after confirming everything works:
-- DROP TABLE product_variants_backup_20251110;
-- ===================================================================
