-- ==================================================
-- Bootstrap Script: Create Default Tenant
-- Date: 2025-11-29
-- Run AFTER migration 001
-- ==================================================

-- Create default tenant (Nexus Clothing)
INSERT INTO tenants (
  id,
  company_name,
  subdomain,
  shopify_store_url,
  shopify_api_version,
  plan_tier,
  is_active,
  settings
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Nexus Clothing',
  'nexusclothing',
  'nexus-clothes.myshopify.com',
  '2024-01',
  'enterprise',
  true,
  '{"theme": "default", "locale": "en-US", "timezone": "America/Los_Angeles"}'
) ON CONFLICT (id) DO NOTHING;

-- Associate all existing data with default tenant
UPDATE users SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE products SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE vendors SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE categories SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE collections SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE product_variants SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE shopify_product_mappings SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE audit_log SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE files SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE user_ui_preferences SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE api_integrations SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE tasks SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE notifications SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE shopify_stores SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE shopify_sync_settings SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;

-- Create default metafield definitions (for future metafields feature)
INSERT INTO metafield_definitions (tenant_id, namespace, key, shopify_type, display_name, description, is_synced, display_order, field_group) VALUES
  -- Sales Points
  ('00000000-0000-0000-0000-000000000001', 'custom', 'custom_sales_point_1', 'single_line_text_field', 'Sales Point #1', 'First product selling point', true, 1, 'sales_points'),
  ('00000000-0000-0000-0000-000000000001', 'custom', 'custom_sales_point_2', 'single_line_text_field', 'Sales Point #2', 'Second product selling point', true, 2, 'sales_points'),
  ('00000000-0000-0000-0000-000000000001', 'custom', 'custom_sales_point_3', 'single_line_text_field', 'Sales Point #3', 'Third product selling point', true, 3, 'sales_points'),
  ('00000000-0000-0000-0000-000000000001', 'custom', 'custom_sales_point_4', 'single_line_text_field', 'Sales Point #4', 'Fourth product selling point', true, 4, 'sales_points'),
  ('00000000-0000-0000-0000-000000000001', 'custom', 'custom_sales_point_5', 'single_line_text_field', 'Sales Point #5', 'Fifth product selling point', true, 5, 'sales_points'),

  -- Product Availability & Links
  ('00000000-0000-0000-0000-000000000001', 'product', 'available', 'boolean', 'Available', 'Is product currently available', true, 10, 'availability'),
  ('00000000-0000-0000-0000-000000000001', 'product', 'matches', 'boolean', 'Has Matching Products', 'Product has matching/coordinating items', true, 11, 'product_links'),
  ('00000000-0000-0000-0000-000000000001', 'product', 'link_1', 'product_reference', 'Color Variant #1', 'Link to same product in different color', true, 20, 'product_links'),
  ('00000000-0000-0000-0000-000000000001', 'product', 'link_2', 'product_reference', 'Color Variant #2', 'Link to same product in different color', true, 21, 'product_links'),
  ('00000000-0000-0000-0000-000000000001', 'product', 'link_3', 'product_reference', 'Color Variant #3', 'Link to same product in different color', true, 22, 'product_links'),
  ('00000000-0000-0000-0000-000000000001', 'product', 'match_1', 'product_reference', 'Matching Product #1', 'Coordinating product recommendation', true, 30, 'product_links')
ON CONFLICT DO NOTHING;

-- ==================================================
-- Bootstrap Complete
-- ==================================================
SELECT 'Bootstrap complete! Default tenant ID: 00000000-0000-0000-0000-000000000001' AS status;
