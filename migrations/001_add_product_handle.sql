-- Migration: Add handle field to products table
-- Date: 2025-11-09
-- Phase 1: Database Migration for Product URL Management System

-- Step 1: Add handle column (nullable initially to avoid breaking existing data)
ALTER TABLE products
ADD COLUMN IF NOT EXISTS handle TEXT;

-- Step 2: Add unique constraint on handle (allows NULL, but enforces uniqueness for non-NULL values)
ALTER TABLE products
ADD CONSTRAINT products_handle_unique UNIQUE (handle);

-- Step 3: Create index for performance (handles will be queried frequently)
CREATE INDEX IF NOT EXISTS products_handle_idx ON products(handle);

-- Step 4: Add comment for documentation
COMMENT ON COLUMN products.handle IS 'SEO-friendly URL slug (e.g., "mens-black-leather-wallet"). Must be lowercase, use hyphens, max 60 chars.';

-- Verification queries (run these after migration)
-- SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'handle';
-- SELECT COUNT(*) as total_products, COUNT(handle) as products_with_handles FROM products;
