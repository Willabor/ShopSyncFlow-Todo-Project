-- Shopify Product Integration Tables
-- Run this SQL to add all Shopify tables to the database

-- 1. Shopify Products (core product data from Shopify store)
CREATE TABLE IF NOT EXISTS shopify_products (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  shopify_id TEXT NOT NULL UNIQUE,

  -- Core product data
  title TEXT NOT NULL,
  description_html TEXT,
  handle TEXT NOT NULL,

  -- Relationships
  vendor_id VARCHAR REFERENCES vendors(id) ON DELETE SET NULL,

  -- Categorization
  product_type TEXT,
  tags TEXT[] DEFAULT ARRAY[]::TEXT[],

  -- Status
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  published_at TIMESTAMP,

  -- Timestamps from Shopify
  shopify_created_at TIMESTAMP NOT NULL,
  shopify_updated_at TIMESTAMP NOT NULL,
  last_synced_at TIMESTAMP NOT NULL DEFAULT NOW(),

  -- Metadata
  metafields JSONB,

  -- Bi-directional sync support
  locally_modified BOOLEAN NOT NULL DEFAULT FALSE,
  local_modified_at TIMESTAMP,
  pending_sync BOOLEAN NOT NULL DEFAULT FALSE,

  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 2. Shopify Product Variants (sizes, colors, etc.)
CREATE TABLE IF NOT EXISTS shopify_product_variants (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  shopify_id TEXT NOT NULL UNIQUE,

  -- Relationships
  product_id VARCHAR NOT NULL REFERENCES shopify_products(id) ON DELETE CASCADE,

  -- Variant data
  title TEXT NOT NULL,
  sku TEXT,

  -- Pricing
  price TEXT NOT NULL,
  compare_at_price TEXT,

  -- Inventory
  inventory_quantity INTEGER DEFAULT 0,
  inventory_policy TEXT,

  -- Physical properties
  weight TEXT,
  weight_unit TEXT,

  -- Options
  option1 TEXT,
  option2 TEXT,
  option3 TEXT,

  -- Image
  image_url TEXT,
  image_alt_text TEXT,

  -- Status
  available_for_sale BOOLEAN NOT NULL DEFAULT TRUE,

  -- Timestamps from Shopify
  shopify_created_at TIMESTAMP NOT NULL,
  shopify_updated_at TIMESTAMP NOT NULL,
  last_synced_at TIMESTAMP NOT NULL DEFAULT NOW(),

  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 3. Shopify Product Images (media)
CREATE TABLE IF NOT EXISTS shopify_product_images (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  shopify_id TEXT,

  -- Relationships
  product_id VARCHAR NOT NULL REFERENCES shopify_products(id) ON DELETE CASCADE,
  variant_id VARCHAR REFERENCES shopify_product_variants(id) ON DELETE SET NULL,

  -- Media data
  url TEXT NOT NULL,
  alt_text TEXT,
  media_content_type TEXT NOT NULL DEFAULT 'IMAGE',
  position INTEGER DEFAULT 0,

  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 4. Shopify Sync Log (track sync operations)
CREATE TABLE IF NOT EXISTS shopify_sync_log (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Sync details
  sync_type TEXT NOT NULL,
  status TEXT NOT NULL,

  -- Statistics
  products_processed INTEGER DEFAULT 0,
  products_created INTEGER DEFAULT 0,
  products_updated INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,

  -- Timing
  started_at TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP,
  duration INTEGER,

  -- Error tracking
  error_message TEXT,
  error_details JSONB,

  -- Metadata
  metadata JSONB,

  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 5. Shopify Sync Settings (user preferences for auto-sync)
CREATE TABLE IF NOT EXISTS shopify_sync_settings (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Auto sync settings
  auto_sync_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  sync_frequency TEXT NOT NULL DEFAULT 'daily',
  last_auto_sync TIMESTAMP,
  next_auto_sync TIMESTAMP,

  -- Sync preferences
  sync_all_statuses BOOLEAN NOT NULL DEFAULT TRUE,

  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 6. Shopify Pending Updates (queue for bi-directional sync - future phase)
CREATE TABLE IF NOT EXISTS shopify_pending_updates (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),

  product_id VARCHAR NOT NULL REFERENCES shopify_products(id) ON DELETE CASCADE,
  update_type TEXT NOT NULL,
  update_data JSONB NOT NULL,

  status TEXT NOT NULL DEFAULT 'pending',
  retry_count INTEGER DEFAULT 0,

  error TEXT,

  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 7. Shopify Bulk Operations (for bulk edit - future phase)
CREATE TABLE IF NOT EXISTS shopify_bulk_operations (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Operation details
  operation_type TEXT NOT NULL,
  target_count INTEGER NOT NULL,

  -- Status tracking
  status TEXT NOT NULL DEFAULT 'pending',
  processed_count INTEGER DEFAULT 0,
  success_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,

  -- Timing
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  duration INTEGER,

  -- User context
  user_id VARCHAR NOT NULL REFERENCES users(id),

  -- Change data
  change_data JSONB NOT NULL,

  -- Results
  errors JSONB,

  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 8. Shopify Bulk Operation Items (individual products in a bulk operation)
CREATE TABLE IF NOT EXISTS shopify_bulk_operation_items (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),

  bulk_operation_id VARCHAR NOT NULL REFERENCES shopify_bulk_operations(id) ON DELETE CASCADE,
  product_id VARCHAR NOT NULL REFERENCES shopify_products(id),

  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT,

  -- Before/after for audit trail
  data_before JSONB,
  data_after JSONB,

  processed_at TIMESTAMP,

  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 9. User UI Preferences (save user's column preferences, view mode, etc.)
CREATE TABLE IF NOT EXISTS user_ui_preferences (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Products page preferences
  products_view_mode TEXT DEFAULT 'table',
  products_visible_columns TEXT[] DEFAULT ARRAY['title', 'status', 'inventory', 'productType', 'vendor']::TEXT[],
  products_column_order TEXT[],

  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_shopify_products_vendor_id ON shopify_products(vendor_id);
CREATE INDEX IF NOT EXISTS idx_shopify_products_shopify_id ON shopify_products(shopify_id);
CREATE INDEX IF NOT EXISTS idx_shopify_products_product_type ON shopify_products(product_type);
CREATE INDEX IF NOT EXISTS idx_shopify_products_status ON shopify_products(status);
CREATE INDEX IF NOT EXISTS idx_shopify_variants_product_id ON shopify_product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_shopify_variants_sku ON shopify_product_variants(sku);
CREATE INDEX IF NOT EXISTS idx_shopify_images_product_id ON shopify_product_images(product_id);
CREATE INDEX IF NOT EXISTS idx_shopify_images_variant_id ON shopify_product_images(variant_id);
CREATE INDEX IF NOT EXISTS idx_shopify_sync_log_status ON shopify_sync_log(status);
CREATE INDEX IF NOT EXISTS idx_shopify_pending_updates_status ON shopify_pending_updates(status);
CREATE INDEX IF NOT EXISTS idx_user_ui_prefs_user_id ON user_ui_preferences(user_id);

-- Success message
SELECT 'Shopify tables created successfully!' AS result;
