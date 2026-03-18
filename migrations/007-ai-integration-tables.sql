-- ============================================================================
-- Migration: 007-ai-integration-tables.sql
-- Description: Create AI Integration tables for multi-tenant AI provider
--              management, prompt templates, and usage tracking.
-- Author: Claude Code
-- Date: 2025-12-09
-- ============================================================================

-- ============================================================================
-- ENUMS
-- ============================================================================

-- AI Provider types
DO $$ BEGIN
    CREATE TYPE ai_provider AS ENUM ('gemini', 'openai', 'anthropic', 'mistral', 'cohere', 'bedrock', 'azure_openai');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Subscription tier levels
DO $$ BEGIN
    CREATE TYPE ai_tier AS ENUM ('free', 'pro', 'enterprise');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Template source types
DO $$ BEGIN
    CREATE TYPE template_source AS ENUM ('platform', 'tenant');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AI feature types for usage tracking
DO $$ BEGIN
    CREATE TYPE ai_feature AS ENUM ('content_generation', 'bullet_points', 'size_chart_analysis', 'brand_scraping', 'category_recommendation');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ============================================================================
-- TABLE: platform_ai_defaults
-- SuperAdmin-managed platform-level API keys and rate limits
-- ============================================================================

CREATE TABLE IF NOT EXISTS platform_ai_defaults (
    id SERIAL PRIMARY KEY,
    provider ai_provider NOT NULL UNIQUE,
    api_key_encrypted TEXT,
    default_model TEXT,
    rate_limit_free INTEGER DEFAULT 50,
    rate_limit_pro INTEGER DEFAULT 500,
    is_enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_platform_ai_defaults_provider ON platform_ai_defaults(provider);

-- ============================================================================
-- TABLE: platform_prompt_templates
-- Immutable platform-level prompt templates (SuperAdmin managed)
-- ============================================================================

CREATE TABLE IF NOT EXISTS platform_prompt_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(100) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100) NOT NULL,
    template_content TEXT NOT NULL,
    system_prompt TEXT,
    variables JSONB DEFAULT '[]'::jsonb,
    default_model TEXT,
    default_temperature VARCHAR(10) DEFAULT '0.7',
    max_tokens INTEGER DEFAULT 2000,
    output_format VARCHAR(20) DEFAULT 'text',
    is_active BOOLEAN DEFAULT true,
    version VARCHAR(20) DEFAULT '1.0.0',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_platform_templates_slug ON platform_prompt_templates(slug);
CREATE INDEX IF NOT EXISTS idx_platform_templates_category ON platform_prompt_templates(category);
CREATE INDEX IF NOT EXISTS idx_platform_templates_active ON platform_prompt_templates(is_active);

-- ============================================================================
-- TABLE: tenant_ai_config
-- Tenant-level AI settings (tier, default provider, fallback)
-- ============================================================================

CREATE TABLE IF NOT EXISTS tenant_ai_config (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    tier ai_tier DEFAULT 'free',
    default_provider ai_provider DEFAULT 'gemini',
    fallback_provider ai_provider,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_tenant_ai_config_tenant ON tenant_ai_config(tenant_id);

-- ============================================================================
-- TABLE: tenant_ai_providers
-- Tenant BYOK (Bring Your Own Key) configurations
-- ============================================================================

CREATE TABLE IF NOT EXISTS tenant_ai_providers (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    provider ai_provider NOT NULL,
    api_key_encrypted TEXT,
    use_platform_default BOOLEAN DEFAULT true,
    additional_config JSONB DEFAULT '{}'::jsonb,
    is_enabled BOOLEAN DEFAULT true,
    is_default BOOLEAN DEFAULT false,
    last_tested_at TIMESTAMPTZ,
    last_test_status VARCHAR(20),
    last_test_error TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_tenant_providers_tenant ON tenant_ai_providers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_providers_provider ON tenant_ai_providers(provider);

-- ============================================================================
-- TABLE: tenant_prompt_templates
-- Tenant customizations of platform templates or entirely new templates
-- ============================================================================

CREATE TABLE IF NOT EXISTS tenant_prompt_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    slug VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100) NOT NULL,
    parent_template_id UUID REFERENCES platform_prompt_templates(id) ON DELETE SET NULL,
    template_content TEXT NOT NULL,
    system_prompt TEXT,
    variables JSONB DEFAULT '[]'::jsonb,
    preferred_provider ai_provider,
    preferred_model TEXT,
    temperature VARCHAR(10) DEFAULT '0.7',
    max_tokens INTEGER DEFAULT 2000,
    output_format VARCHAR(20) DEFAULT 'text',
    is_active BOOLEAN DEFAULT true,
    version VARCHAR(20) DEFAULT '1.0.0',
    usage_count INTEGER DEFAULT 0,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_tenant_templates_tenant ON tenant_prompt_templates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_templates_slug ON tenant_prompt_templates(slug);
CREATE INDEX IF NOT EXISTS idx_tenant_templates_category ON tenant_prompt_templates(category);
CREATE INDEX IF NOT EXISTS idx_tenant_templates_parent ON tenant_prompt_templates(parent_template_id);

-- ============================================================================
-- TABLE: tenant_prompt_template_versions
-- Version history for tenant templates
-- ============================================================================

CREATE TABLE IF NOT EXISTS tenant_prompt_template_versions (
    id SERIAL PRIMARY KEY,
    template_id UUID NOT NULL REFERENCES tenant_prompt_templates(id) ON DELETE CASCADE,
    version VARCHAR(20) NOT NULL,
    template_content TEXT NOT NULL,
    system_prompt TEXT,
    variables JSONB,
    change_notes TEXT,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_template_versions_template ON tenant_prompt_template_versions(template_id);

-- ============================================================================
-- TABLE: tenant_feature_templates
-- Assigns which template to use for which feature
-- ============================================================================

CREATE TABLE IF NOT EXISTS tenant_feature_templates (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    feature ai_feature NOT NULL,
    template_id UUID NOT NULL REFERENCES tenant_prompt_templates(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, feature)
);

CREATE INDEX IF NOT EXISTS idx_feature_templates_tenant ON tenant_feature_templates(tenant_id);

-- ============================================================================
-- TABLE: user_saved_templates
-- User favorites/saved templates
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_saved_templates (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    template_id UUID NOT NULL REFERENCES tenant_prompt_templates(id) ON DELETE CASCADE,
    platform_template_id UUID REFERENCES platform_prompt_templates(id) ON DELETE CASCADE,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, template_id),
    UNIQUE(user_id, platform_template_id)
);

CREATE INDEX IF NOT EXISTS idx_saved_templates_user ON user_saved_templates(user_id);

-- ============================================================================
-- TABLE: ai_usage_log
-- Tracks all AI requests for billing and analytics
-- ============================================================================

CREATE TABLE IF NOT EXISTS ai_usage_log (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    provider ai_provider NOT NULL,
    model TEXT,
    feature ai_feature,
    template_id UUID,
    tokens_input INTEGER DEFAULT 0,
    tokens_output INTEGER DEFAULT 0,
    cost_estimate DECIMAL(10, 6) DEFAULT 0,
    duration_ms INTEGER DEFAULT 0,
    success BOOLEAN DEFAULT true,
    error_message TEXT,
    used_platform_key BOOLEAN DEFAULT false,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_usage_log_tenant_date ON ai_usage_log(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_log_feature ON ai_usage_log(feature);
CREATE INDEX IF NOT EXISTS idx_usage_log_provider ON ai_usage_log(provider);
CREATE INDEX IF NOT EXISTS idx_usage_log_success ON ai_usage_log(success);
CREATE INDEX IF NOT EXISTS idx_usage_log_created ON ai_usage_log(created_at DESC);

-- ============================================================================
-- TRIGGERS: Update timestamps
-- ============================================================================

-- Update timestamp trigger function (if not exists)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply triggers to tables with updated_at
DROP TRIGGER IF EXISTS update_platform_ai_defaults_updated_at ON platform_ai_defaults;
CREATE TRIGGER update_platform_ai_defaults_updated_at
    BEFORE UPDATE ON platform_ai_defaults
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_platform_prompt_templates_updated_at ON platform_prompt_templates;
CREATE TRIGGER update_platform_prompt_templates_updated_at
    BEFORE UPDATE ON platform_prompt_templates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_tenant_ai_config_updated_at ON tenant_ai_config;
CREATE TRIGGER update_tenant_ai_config_updated_at
    BEFORE UPDATE ON tenant_ai_config
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_tenant_ai_providers_updated_at ON tenant_ai_providers;
CREATE TRIGGER update_tenant_ai_providers_updated_at
    BEFORE UPDATE ON tenant_ai_providers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_tenant_prompt_templates_updated_at ON tenant_prompt_templates;
CREATE TRIGGER update_tenant_prompt_templates_updated_at
    BEFORE UPDATE ON tenant_prompt_templates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE platform_ai_defaults IS 'Platform-level AI provider configurations managed by SuperAdmin';
COMMENT ON TABLE platform_prompt_templates IS 'Immutable platform prompt templates available to all tenants';
COMMENT ON TABLE tenant_ai_config IS 'Tenant-level AI settings including tier and default provider';
COMMENT ON TABLE tenant_ai_providers IS 'Tenant BYOK configurations for AI providers';
COMMENT ON TABLE tenant_prompt_templates IS 'Tenant customizations of platform templates or custom templates';
COMMENT ON TABLE tenant_prompt_template_versions IS 'Version history for tenant prompt templates';
COMMENT ON TABLE tenant_feature_templates IS 'Maps AI features to specific templates per tenant';
COMMENT ON TABLE user_saved_templates IS 'User favorite/saved templates for quick access';
COMMENT ON TABLE ai_usage_log IS 'Tracks all AI API requests for billing and analytics';

-- ============================================================================
-- Grant permissions (for application user)
-- ============================================================================

-- Note: Adjust 'shopsyncflow_user' to your actual database user
DO $$
BEGIN
    -- Grant permissions if the user exists
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'shopsyncflow_user') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON platform_ai_defaults TO shopsyncflow_user;
        GRANT SELECT, INSERT, UPDATE, DELETE ON platform_prompt_templates TO shopsyncflow_user;
        GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_ai_config TO shopsyncflow_user;
        GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_ai_providers TO shopsyncflow_user;
        GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_prompt_templates TO shopsyncflow_user;
        GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_prompt_template_versions TO shopsyncflow_user;
        GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_feature_templates TO shopsyncflow_user;
        GRANT SELECT, INSERT, UPDATE, DELETE ON user_saved_templates TO shopsyncflow_user;
        GRANT SELECT, INSERT, UPDATE, DELETE ON ai_usage_log TO shopsyncflow_user;
        GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO shopsyncflow_user;
    END IF;
END $$;

-- ============================================================================
-- Migration complete
-- ============================================================================

SELECT 'AI Integration tables created successfully' AS status;
