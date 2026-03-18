-- ================================================================
-- ShopSyncFlow: Create Variant System Tables
-- ================================================================
-- Date: 2025-11-07
-- Purpose: Add product_options and product_variants tables for multi-variant support
-- Impact: Enables storing multiple variants per product (option1/option2/option3)
-- Dependencies: Requires products table to exist
-- ================================================================

-- ================================================================
-- Table 1: product_options
-- ================================================================
-- Stores product option definitions (e.g., "Size", "Color", "Material")
-- Each product can have up to 3 options (Shopify limit)
-- ================================================================

CREATE TABLE IF NOT EXISTS product_options (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  product_id VARCHAR NOT NULL REFERENCES products(id) ON DELETE CASCADE,

  -- Option definition
  name TEXT NOT NULL,                    -- "Size", "Color", "Material", etc.
  position INTEGER NOT NULL CHECK (position BETWEEN 1 AND 3), -- Shopify max: 3 options
  values TEXT[] NOT NULL,                -- ["Small", "Medium", "Large"]

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL,

  -- Ensure unique position per product (can't have two "position 1" options)
  UNIQUE (product_id, position)
);

-- Index for querying options by product
CREATE INDEX IF NOT EXISTS idx_product_options_product_id ON product_options(product_id);

-- Comments for documentation
COMMENT ON TABLE product_options IS 'Product option definitions (Size, Color, etc.) - up to 3 per product';
COMMENT ON COLUMN product_options.name IS 'Option name displayed to users (e.g., "Size", "Color")';
COMMENT ON COLUMN product_options.position IS 'Option position (1-3), determines option1/option2/option3 mapping';
COMMENT ON COLUMN product_options.values IS 'Array of possible values for this option';

-- ================================================================
-- Table 2: product_variants
-- ================================================================
-- Stores individual product variants with option values
-- Each variant represents a specific combination of options
-- (e.g., "Small / Red", "Medium / Blue")
-- ================================================================

CREATE TABLE IF NOT EXISTS product_variants (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  product_id VARCHAR NOT NULL REFERENCES products(id) ON DELETE CASCADE,

  -- Variant identification
  title TEXT NOT NULL,                   -- "Small / Red" (generated from options)

  -- CRITICAL: Denormalized option values for fast queries
  option1 TEXT,                          -- Value from position 1 option (e.g., "Small")
  option2 TEXT,                          -- Value from position 2 option (e.g., "Red")
  option3 TEXT,                          -- Value from position 3 option (e.g., "Cotton")

  -- Pricing (required)
  price TEXT NOT NULL,                   -- Decimal stored as text for precision
  compare_at_price TEXT,                 -- Original price (for showing discounts)

  -- Inventory
  inventory_quantity INTEGER DEFAULT 0 NOT NULL,
  inventory_policy TEXT DEFAULT 'deny', -- "deny" = stop selling at 0, "continue" = oversell

  -- SKU and identification
  sku TEXT,                              -- Stock Keeping Unit (optional but recommended)
  barcode TEXT,                          -- Barcode/UPC (optional)

  -- Physical properties
  weight TEXT,                           -- Numeric as text (for decimal precision)
  weight_unit TEXT,                      -- "g", "kg", "oz", "lb"
  requires_shipping BOOLEAN DEFAULT true,

  -- Fulfillment
  fulfillment_service TEXT DEFAULT 'manual',

  -- Tax
  taxable BOOLEAN DEFAULT true,

  -- Image association (optional: link to specific product image)
  image_id VARCHAR,

  -- Shopify sync
  shopify_variant_id TEXT UNIQUE,        -- Shopify's variant ID (for synced products)
  available_for_sale BOOLEAN DEFAULT true,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL,
  shopify_created_at TIMESTAMP,          -- From Shopify
  shopify_updated_at TIMESTAMP,          -- From Shopify

  -- Ensure unique option combination per product
  -- (can't have two "Small / Red" variants for same product)
  UNIQUE (product_id, option1, option2, option3)
);

-- Indexes for fast variant queries
CREATE INDEX IF NOT EXISTS idx_product_variants_product_id ON product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_variant_option1 ON product_variants(option1);
CREATE INDEX IF NOT EXISTS idx_variant_option2 ON product_variants(option2);
CREATE INDEX IF NOT EXISTS idx_variant_option3 ON product_variants(option3);
CREATE INDEX IF NOT EXISTS idx_variant_sku ON product_variants(sku) WHERE sku IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_variant_shopify_id ON product_variants(shopify_variant_id) WHERE shopify_variant_id IS NOT NULL;

-- Comments for documentation
COMMENT ON TABLE product_variants IS 'Product variants with specific option combinations and pricing';
COMMENT ON COLUMN product_variants.option1 IS 'Denormalized value from position 1 option (enables fast WHERE queries)';
COMMENT ON COLUMN product_variants.option2 IS 'Denormalized value from position 2 option';
COMMENT ON COLUMN product_variants.option3 IS 'Denormalized value from position 3 option';
COMMENT ON COLUMN product_variants.price IS 'Variant price (stored as text for decimal precision)';
COMMENT ON COLUMN product_variants.inventory_quantity IS 'Current inventory count for this variant';
COMMENT ON COLUMN product_variants.sku IS 'Stock Keeping Unit (unique identifier for warehouse)';
COMMENT ON COLUMN product_variants.shopify_variant_id IS 'Shopify variant ID (null for unpublished variants)';

-- Update table statistics for query planner
ANALYZE product_options;
ANALYZE product_variants;

-- ================================================================
-- Verification Queries
-- ================================================================

-- Check product_options table was created
SELECT
  table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'product_options'
ORDER BY ordinal_position;

-- Check product_variants table was created
SELECT
  table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'product_variants'
ORDER BY ordinal_position;

-- Check indexes were created
SELECT
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename IN ('product_options', 'product_variants')
ORDER BY tablename, indexname;

-- Check constraints
SELECT
  tc.table_name,
  tc.constraint_name,
  tc.constraint_type,
  kcu.column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
WHERE tc.table_name IN ('product_options', 'product_variants')
ORDER BY tc.table_name, tc.constraint_type, kcu.column_name;

-- Current row counts (should be 0 initially)
SELECT
  'product_options' as table_name,
  COUNT(*) as row_count
FROM product_options
UNION ALL
SELECT
  'product_variants' as table_name,
  COUNT(*) as row_count
FROM product_variants;

-- ================================================================
-- Expected Output
-- ================================================================
-- product_options table: 8 columns
--   - id, product_id, name, position, values, created_at, updated_at
-- product_variants table: 23 columns
--   - id, product_id, title, option1/2/3, price, compare_at_price,
--     inventory_quantity, inventory_policy, sku, barcode, weight,
--     weight_unit, requires_shipping, fulfillment_service, taxable,
--     image_id, shopify_variant_id, available_for_sale,
--     created_at, updated_at, shopify_created_at, shopify_updated_at
--
-- Indexes created:
--   - idx_product_options_product_id
--   - idx_product_variants_product_id
--   - idx_variant_option1, idx_variant_option2, idx_variant_option3
--   - idx_variant_sku, idx_variant_shopify_id
--
-- Row counts: 0 for both tables (before data migration)
-- ================================================================
