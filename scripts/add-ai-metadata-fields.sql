-- ================================================================
-- ShopSyncFlow: Add AI Metadata Fields to Products Table
-- ================================================================
-- Date: 2025-11-07
-- Purpose: Add Yoast SEO score and AI generation tracking fields
-- Impact: Enables tracking which products were AI-generated and their SEO quality
-- ================================================================

-- Add SEO score field (Yoast integration)
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS seo_score INTEGER DEFAULT 0 CHECK (seo_score >= 0 AND seo_score <= 100);

-- Add AI generation tracking fields
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS ai_generated BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_generated_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS ai_model TEXT;

-- Add comments for documentation
COMMENT ON COLUMN products.seo_score IS 'Yoast SEO score (0-100) calculated from content quality';
COMMENT ON COLUMN products.ai_generated IS 'Whether this product was created/enhanced with AI';
COMMENT ON COLUMN products.ai_generated_at IS 'When AI generation occurred';
COMMENT ON COLUMN products.ai_model IS 'AI model used for generation (e.g., gemini-1.5-pro)';

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_products_seo_score ON products(seo_score);
CREATE INDEX IF NOT EXISTS idx_products_ai_generated ON products(ai_generated) WHERE ai_generated = true;

-- Update table statistics for query planner
ANALYZE products;

-- ================================================================
-- Verification Queries
-- ================================================================

-- Check that all columns were added
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'products'
  AND column_name IN (
    'seo_score',
    'ai_generated',
    'ai_generated_at',
    'ai_model'
  )
ORDER BY column_name;

-- Check that indexes were created
SELECT
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'products'
  AND indexname IN ('idx_products_seo_score', 'idx_products_ai_generated')
ORDER BY indexname;

-- Count existing products (should show 0 AI-generated)
SELECT
  COUNT(*) as total_products,
  COUNT(*) FILTER (WHERE ai_generated = true) as ai_generated_count,
  AVG(seo_score) as avg_seo_score
FROM products;

-- ================================================================
-- Expected Output
-- ================================================================
-- 4 columns should be added:
--   - seo_score (integer, default 0, not null)
--   - ai_generated (boolean, default false)
--   - ai_generated_at (timestamp, nullable)
--   - ai_model (text, nullable)
--
-- 2 indexes should be created:
--   - idx_products_seo_score (on seo_score)
--   - idx_products_ai_generated (on ai_generated WHERE true)
-- ================================================================
