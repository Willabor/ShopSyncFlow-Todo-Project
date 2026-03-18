-- ==================================================
-- Migration 003: Collection Health Schema
-- Date: 2025-11-29
-- Description: Add collection health tracking infrastructure
-- Phase: 1 of Combined Multi-Tenant + Collection Health
-- ==================================================

BEGIN;

-- ==================================================
-- Step 1: Modify collections table
-- ==================================================

-- 1a. Remove UNIQUE constraint on name (allows duplicate names from Shopify)
ALTER TABLE collections DROP CONSTRAINT IF EXISTS collections_name_key;

-- 1b. Add duplicate tracking columns
ALTER TABLE collections ADD COLUMN IF NOT EXISTS is_duplicate BOOLEAN DEFAULT FALSE;
ALTER TABLE collections ADD COLUMN IF NOT EXISTS duplicate_group_id TEXT;
ALTER TABLE collections ADD COLUMN IF NOT EXISTS created_by_type TEXT; -- 'staff', 'app', 'unknown'
ALTER TABLE collections ADD COLUMN IF NOT EXISTS created_by_name TEXT; -- e.g., 'Power Tools Filter Menu'

-- 1c. Create indexes for duplicate queries
CREATE INDEX IF NOT EXISTS idx_collections_duplicate ON collections(is_duplicate) WHERE is_duplicate = true;
CREATE INDEX IF NOT EXISTS idx_collections_duplicate_group ON collections(duplicate_group_id) WHERE duplicate_group_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_collections_name ON collections(name);

-- 1d. Add comments
COMMENT ON COLUMN collections.is_duplicate IS 'True if this collection has same name as another';
COMMENT ON COLUMN collections.duplicate_group_id IS 'Groups collections with same name together (UUID)';
COMMENT ON COLUMN collections.created_by_type IS 'Who created: staff, app, or unknown';
COMMENT ON COLUMN collections.created_by_name IS 'Name of app or staff member who created';

-- ==================================================
-- Step 2: Create navigation_menus table
-- ==================================================

CREATE TABLE IF NOT EXISTS navigation_menus (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Tenant Association
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Shopify Data
  shopify_menu_id TEXT NOT NULL,
  title TEXT NOT NULL,                      -- "Main Menu", "Footer Menu"
  handle TEXT NOT NULL,                     -- "main-menu", "footer"

  -- Metrics
  item_count INTEGER DEFAULT 0,

  -- Sync Tracking
  synced_at TIMESTAMP,

  -- Audit
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL,

  -- Constraints
  UNIQUE(tenant_id, shopify_menu_id)        -- Unique per tenant
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_navigation_menus_tenant ON navigation_menus(tenant_id);
CREATE INDEX IF NOT EXISTS idx_navigation_menus_handle ON navigation_menus(tenant_id, handle);

-- Comments
COMMENT ON TABLE navigation_menus IS 'Shopify navigation menus synced for conflict detection';
COMMENT ON COLUMN navigation_menus.shopify_menu_id IS 'Shopify GID for the menu';

-- ==================================================
-- Step 3: Create navigation_items table
-- ==================================================

CREATE TABLE IF NOT EXISTS navigation_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Tenant Association
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Menu Association
  menu_id UUID NOT NULL REFERENCES navigation_menus(id) ON DELETE CASCADE,

  -- Hierarchy
  parent_item_id UUID REFERENCES navigation_items(id) ON DELETE CASCADE,

  -- Shopify Data
  shopify_item_id TEXT,
  title TEXT NOT NULL,                      -- "Dallas Cowboys"
  type TEXT NOT NULL,                       -- 'COLLECTION', 'PAGE', 'LINK', 'BLOG'

  -- Target Information
  target_id TEXT,                           -- Collection/Page GID if applicable
  target_url TEXT,                          -- /collections/dallas-cowboys

  -- Position
  position INTEGER DEFAULT 0,

  -- Audit
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_navigation_items_tenant ON navigation_items(tenant_id);
CREATE INDEX IF NOT EXISTS idx_navigation_items_menu ON navigation_items(menu_id);
CREATE INDEX IF NOT EXISTS idx_navigation_items_parent ON navigation_items(parent_item_id);
CREATE INDEX IF NOT EXISTS idx_navigation_items_type ON navigation_items(type) WHERE type = 'COLLECTION';
CREATE INDEX IF NOT EXISTS idx_navigation_items_target ON navigation_items(target_id) WHERE target_id IS NOT NULL;

-- Comments
COMMENT ON TABLE navigation_items IS 'Individual items within navigation menus';
COMMENT ON COLUMN navigation_items.type IS 'Item type: COLLECTION, PAGE, LINK, BLOG';
COMMENT ON COLUMN navigation_items.target_id IS 'Shopify GID of linked resource';

-- ==================================================
-- Step 4: Create collection_health_issues table
-- ==================================================

-- Note: collections.id and users.id are VARCHAR, not UUID
-- Using VARCHAR for compatibility with existing tables

CREATE TABLE IF NOT EXISTS collection_health_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Tenant Association
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Issue Classification
  issue_type TEXT NOT NULL,                 -- 'duplicate', 'nav_conflict', 'orphan', 'no_products'
  severity TEXT NOT NULL,                   -- 'critical', 'high', 'medium', 'low'

  -- Affected Resources (VARCHAR to match existing tables)
  collection_id VARCHAR REFERENCES collections(id) ON DELETE CASCADE,
  related_collection_id VARCHAR,            -- For duplicates: the other collection
  menu_id UUID REFERENCES navigation_menus(id) ON DELETE SET NULL,

  -- Issue Details
  title TEXT NOT NULL,                      -- Short title for the issue
  description TEXT NOT NULL,                -- Human-readable description
  recommendation TEXT,                      -- 'DELETE', 'KEEP', 'MERGE', 'UPDATE_NAV'
  recommended_action TEXT,                  -- Which specific action to take

  -- Metadata (for duplicate issues)
  metadata JSONB DEFAULT '{}',              -- { "shopify_handle": "...", "product_count": 0, etc. }

  -- Status
  status TEXT DEFAULT 'open' NOT NULL,      -- 'open', 'resolved', 'ignored'
  resolved_at TIMESTAMP,
  resolved_by VARCHAR REFERENCES users(id), -- VARCHAR to match users.id
  resolution_notes TEXT,

  -- Timing
  detected_at TIMESTAMP DEFAULT NOW() NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_health_issues_tenant ON collection_health_issues(tenant_id);
CREATE INDEX IF NOT EXISTS idx_health_issues_status ON collection_health_issues(tenant_id, status) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_health_issues_type ON collection_health_issues(tenant_id, issue_type);
CREATE INDEX IF NOT EXISTS idx_health_issues_collection ON collection_health_issues(collection_id);
CREATE INDEX IF NOT EXISTS idx_health_issues_severity ON collection_health_issues(severity);

-- Comments
COMMENT ON TABLE collection_health_issues IS 'Detected problems with collections';
COMMENT ON COLUMN collection_health_issues.issue_type IS 'duplicate=same name, nav_conflict=in menu, orphan=not in Shopify, no_products=empty';
COMMENT ON COLUMN collection_health_issues.severity IS 'critical=blocks operation, high=should fix, medium=optional, low=informational';

-- ==================================================
-- Step 5: Drop legacy shopify_collection_duplicates table
-- ==================================================

-- First, check if there's any data we should preserve (there shouldn't be based on our analysis)
-- The new collection_health_issues table replaces this functionality

DROP TABLE IF EXISTS shopify_collection_duplicates CASCADE;

COMMIT;

-- ==================================================
-- Migration Complete
-- ==================================================

SELECT 'Phase 1 Migration Complete!' as status,
       (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'collections' AND column_name = 'is_duplicate') as collections_has_is_duplicate,
       (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'navigation_menus') as navigation_menus_exists,
       (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'navigation_items') as navigation_items_exists,
       (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'collection_health_issues') as health_issues_exists;
