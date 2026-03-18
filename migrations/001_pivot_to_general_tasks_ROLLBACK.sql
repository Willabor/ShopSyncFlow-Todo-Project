-- ============================================
-- ShopSyncFlow Database Migration ROLLBACK
-- This script reverses 001_pivot_to_general_tasks.sql
-- Date: 2025-10-26
-- ============================================

-- DANGER: This will UNDO the migration and LOSE new task data
-- Only run this if migration failed or you need to revert

BEGIN;

-- ============================================
-- STEP 1: Restore productId as NOT NULL
-- ============================================

-- First, ensure all tasks have a productId (critical!)
-- This will fail if tasks exist without products - which is expected after migration
-- DO NOT run this if you've created new non-product tasks!

-- Uncomment to force rollback (data loss warning):
-- UPDATE tasks SET "productId" = (SELECT id FROM products LIMIT 1) WHERE "productId" IS NULL;
-- ALTER TABLE tasks ALTER COLUMN "productId" SET NOT NULL;

-- ============================================
-- STEP 2: Drop new columns from tasks table
-- ============================================

ALTER TABLE tasks DROP COLUMN IF EXISTS title;
ALTER TABLE tasks DROP COLUMN IF EXISTS description;
ALTER TABLE tasks DROP COLUMN IF EXISTS category;
ALTER TABLE tasks DROP COLUMN IF EXISTS attachments;
ALTER TABLE tasks DROP COLUMN IF EXISTS product_info;

-- ============================================
-- STEP 3: Drop new tables
-- ============================================

DROP TABLE IF EXISTS task_steps CASCADE;
DROP TABLE IF EXISTS step_templates CASCADE;

-- ============================================
-- STEP 4: Recreate Shopify tables (optional)
-- ============================================

-- Uncomment if you need to restore Shopify tables:

/*
CREATE TABLE shopify_stores (
  id SERIAL PRIMARY KEY,
  shop_name TEXT NOT NULL,
  shopify_domain TEXT NOT NULL UNIQUE,
  access_token TEXT NOT NULL,
  active BOOLEAN DEFAULT TRUE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE shopify_product_mappings (
  id SERIAL PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  store_id INTEGER NOT NULL REFERENCES shopify_stores(id) ON DELETE CASCADE,
  shopify_product_id TEXT NOT NULL,
  synced_at TIMESTAMP DEFAULT NOW() NOT NULL,
  UNIQUE(product_id, store_id)
);
*/

COMMIT;

-- ============================================
-- Rollback Complete
-- ============================================
-- To restore data: pg_restore or psql < backup.sql
