-- ============================================================================
-- Rollback: 007-ai-integration-tables-ROLLBACK.sql
-- Description: Rollback AI Integration tables
-- WARNING: This will delete all AI-related data!
-- ============================================================================

-- Drop triggers first
DROP TRIGGER IF EXISTS update_platform_ai_defaults_updated_at ON platform_ai_defaults;
DROP TRIGGER IF EXISTS update_platform_prompt_templates_updated_at ON platform_prompt_templates;
DROP TRIGGER IF EXISTS update_tenant_ai_config_updated_at ON tenant_ai_config;
DROP TRIGGER IF EXISTS update_tenant_ai_providers_updated_at ON tenant_ai_providers;
DROP TRIGGER IF EXISTS update_tenant_prompt_templates_updated_at ON tenant_prompt_templates;

-- Drop tables (in reverse dependency order)
DROP TABLE IF EXISTS ai_usage_log CASCADE;
DROP TABLE IF EXISTS user_saved_templates CASCADE;
DROP TABLE IF EXISTS tenant_feature_templates CASCADE;
DROP TABLE IF EXISTS tenant_prompt_template_versions CASCADE;
DROP TABLE IF EXISTS tenant_prompt_templates CASCADE;
DROP TABLE IF EXISTS tenant_ai_providers CASCADE;
DROP TABLE IF EXISTS tenant_ai_config CASCADE;
DROP TABLE IF EXISTS platform_prompt_templates CASCADE;
DROP TABLE IF EXISTS platform_ai_defaults CASCADE;

-- Drop enums
DROP TYPE IF EXISTS ai_feature CASCADE;
DROP TYPE IF EXISTS template_source CASCADE;
DROP TYPE IF EXISTS ai_tier CASCADE;
DROP TYPE IF EXISTS ai_provider CASCADE;

SELECT 'AI Integration tables rolled back successfully' AS status;
