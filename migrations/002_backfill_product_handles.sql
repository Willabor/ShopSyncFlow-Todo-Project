-- Migration: Backfill product handles from titles
-- Date: 2025-11-09
-- Phase 1: Gap Analysis - Generate handles for existing products

-- Create a function to generate SEO-friendly handles from titles
CREATE OR REPLACE FUNCTION generate_handle_from_title(title TEXT)
RETURNS TEXT AS $$
DECLARE
  handle TEXT;
BEGIN
  -- Convert to lowercase
  handle := LOWER(title);

  -- Replace spaces and underscores with hyphens
  handle := REGEXP_REPLACE(handle, '[\s_]+', '-', 'g');

  -- Remove special characters (keep only a-z, 0-9, hyphens)
  handle := REGEXP_REPLACE(handle, '[^a-z0-9-]', '', 'g');

  -- Remove consecutive hyphens
  handle := REGEXP_REPLACE(handle, '-+', '-', 'g');

  -- Trim hyphens from start and end
  handle := TRIM(BOTH '-' FROM handle);

  -- Truncate to 60 characters for optimal SEO
  handle := SUBSTRING(handle FROM 1 FOR 60);

  -- Trim any trailing hyphen after truncation
  handle := REGEXP_REPLACE(handle, '-+$', '');

  RETURN handle;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Create a function to ensure handle uniqueness
CREATE OR REPLACE FUNCTION generate_unique_handle(base_handle TEXT, product_id TEXT)
RETURNS TEXT AS $$
DECLARE
  unique_handle TEXT;
  counter INTEGER := 1;
  max_attempts INTEGER := 1000;
BEGIN
  unique_handle := base_handle;

  -- Check if handle is available (or already belongs to this product)
  WHILE EXISTS (
    SELECT 1 FROM products
    WHERE handle = unique_handle
    AND id != product_id
  ) AND counter < max_attempts LOOP
    -- Append counter, ensuring we stay under 60 chars
    -- Format: base-handle-2, base-handle-3, etc.
    unique_handle := SUBSTRING(base_handle FROM 1 FOR 57 - LENGTH(counter::TEXT)) || '-' || counter;
    counter := counter + 1;
  END LOOP;

  IF counter >= max_attempts THEN
    -- Fallback: use product ID suffix
    unique_handle := SUBSTRING(base_handle FROM 1 FOR 50) || '-' || SUBSTRING(product_id FROM 1 FOR 8);
  END IF;

  RETURN unique_handle;
END;
$$ LANGUAGE plpgsql;

-- Backfill handles for all products
-- This uses a transaction to ensure atomicity
BEGIN;

-- Update products with generated handles
WITH handle_generation AS (
  SELECT
    id,
    title,
    generate_handle_from_title(title) as base_handle
  FROM products
  WHERE handle IS NULL AND title IS NOT NULL
)
UPDATE products p
SET handle = generate_unique_handle(hg.base_handle, hg.id)
FROM handle_generation hg
WHERE p.id = hg.id;

-- Verify the update
DO $$
DECLARE
  total_count INTEGER;
  updated_count INTEGER;
  duplicate_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_count FROM products;
  SELECT COUNT(*) INTO updated_count FROM products WHERE handle IS NOT NULL;
  SELECT COUNT(*) INTO duplicate_count FROM (
    SELECT handle, COUNT(*)
    FROM products
    WHERE handle IS NOT NULL
    GROUP BY handle
    HAVING COUNT(*) > 1
  ) duplicates;

  RAISE NOTICE 'Backfill Summary:';
  RAISE NOTICE '  Total products: %', total_count;
  RAISE NOTICE '  Products with handles: %', updated_count;
  RAISE NOTICE '  Duplicate handles: %', duplicate_count;

  IF duplicate_count > 0 THEN
    RAISE WARNING 'Found % duplicate handles! Rolling back transaction.', duplicate_count;
    RAISE EXCEPTION 'Duplicate handles detected';
  END IF;

  IF updated_count != total_count THEN
    RAISE WARNING 'Not all products were updated! Expected: %, Got: %', total_count, updated_count;
  END IF;
END $$;

COMMIT;

-- Display sample results
SELECT
  id,
  title,
  handle,
  LENGTH(handle) as handle_length
FROM products
WHERE handle IS NOT NULL
ORDER BY created_at DESC
LIMIT 20;

-- Statistics
SELECT
  COUNT(*) as total_products,
  COUNT(handle) as products_with_handles,
  MIN(LENGTH(handle)) as min_handle_length,
  MAX(LENGTH(handle)) as max_handle_length,
  AVG(LENGTH(handle))::NUMERIC(10,2) as avg_handle_length,
  COUNT(CASE WHEN LENGTH(handle) > 60 THEN 1 END) as handles_over_60_chars
FROM products;
