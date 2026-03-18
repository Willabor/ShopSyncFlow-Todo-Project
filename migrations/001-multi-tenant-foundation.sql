-- ==================================================
-- Migration 001: Multi-Tenant Foundation
-- Date: 2025-11-29
-- Description: Add tenant infrastructure for future SaaS capability
-- ==================================================

-- Step 1: Create tenants table
CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL,
  subdomain TEXT UNIQUE NOT NULL,
  shopify_store_url TEXT,
  shopify_access_token TEXT,
  shopify_api_version TEXT DEFAULT '2024-01',
  google_ads_customer_id TEXT,
  plan_tier TEXT DEFAULT 'free',
  max_products INTEGER DEFAULT 1000,
  max_users INTEGER DEFAULT 5,
  is_active BOOLEAN DEFAULT true NOT NULL,
  trial_ends_at TIMESTAMP,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL,
  created_by UUID,
  CONSTRAINT valid_subdomain CHECK (subdomain ~ '^[a-z0-9-]+$')
);

CREATE INDEX IF NOT EXISTS idx_tenants_subdomain ON tenants(subdomain);
CREATE INDEX IF NOT EXISTS idx_tenants_is_active ON tenants(is_active);

COMMENT ON TABLE tenants IS 'Multi-tenant organization/company information';

-- Step 2: Create metafield_definitions table (for future metafields feature)
CREATE TABLE IF NOT EXISTS metafield_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  namespace TEXT NOT NULL,
  key TEXT NOT NULL,
  shopify_type TEXT NOT NULL,
  display_name TEXT,
  description TEXT,
  is_synced BOOLEAN DEFAULT true NOT NULL,
  is_required BOOLEAN DEFAULT false,
  default_value TEXT,
  display_order INTEGER DEFAULT 0,
  field_group TEXT,
  validation_rules JSONB,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL,
  UNIQUE(tenant_id, namespace, key),
  CHECK (display_order >= 0)
);

CREATE INDEX IF NOT EXISTS idx_metafield_defs_tenant ON metafield_definitions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_metafield_defs_synced ON metafield_definitions(tenant_id, is_synced) WHERE is_synced = true;

COMMENT ON TABLE metafield_definitions IS 'Defines which Shopify metafields each tenant wants to sync';

-- Step 3: Add tenant_id to products
ALTER TABLE products ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS custom_metafields JSONB DEFAULT '{}';
CREATE INDEX IF NOT EXISTS idx_products_tenant ON products(tenant_id);
CREATE INDEX IF NOT EXISTS idx_products_custom_metafields ON products USING GIN (custom_metafields);

-- Step 4: Add tenant_id to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);

-- Step 5: Add tenant_id to vendors
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_vendors_tenant ON vendors(tenant_id);

-- Step 6: Add tenant_id to categories
ALTER TABLE categories ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_categories_tenant ON categories(tenant_id);

-- Step 7: Add tenant_id to collections
ALTER TABLE collections ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_collections_tenant ON collections(tenant_id);

-- Step 8: Add tenant_id to product_variants
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_product_variants_tenant ON product_variants(tenant_id);

-- Step 9: Add tenant_id to shopify_product_mappings
ALTER TABLE shopify_product_mappings ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_shopify_mappings_tenant ON shopify_product_mappings(tenant_id);

-- Step 10: Add tenant_id to audit_log
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_audit_log_tenant ON audit_log(tenant_id);

-- Step 11: Add tenant_id to files
ALTER TABLE files ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_files_tenant ON files(tenant_id);

-- Step 12: Add tenant_id to user_ui_preferences
ALTER TABLE user_ui_preferences ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_user_ui_prefs_tenant ON user_ui_preferences(tenant_id);

-- Step 13: Add tenant_id to api_integrations
ALTER TABLE api_integrations ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_api_integrations_tenant ON api_integrations(tenant_id);

-- Step 14: Add tenant_id to tasks
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_tasks_tenant ON tasks(tenant_id);

-- Step 15: Add tenant_id to notifications
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_notifications_tenant ON notifications(tenant_id);

-- Step 16: Add tenant_id to shopify_stores
ALTER TABLE shopify_stores ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_shopify_stores_tenant ON shopify_stores(tenant_id);

-- Step 17: Add tenant_id to shopify_sync_settings
ALTER TABLE shopify_sync_settings ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_shopify_sync_settings_tenant ON shopify_sync_settings(tenant_id);

-- ==================================================
-- Migration Complete
-- Next: Run bootstrap script to create default tenant
-- ==================================================
