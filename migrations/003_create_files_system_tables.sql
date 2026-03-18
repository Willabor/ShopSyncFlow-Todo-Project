-- ===================================================================
-- Migration: Create Files System Tables
-- ===================================================================
-- Date: 2025-11-10
-- Phase: Files System - Phase 1 (Database Schema)
-- Purpose: Create centralized media asset management tables inspired by
--          Shopify's Content → Files system
--
-- Related Documentation:
--   /volume1/docker/planning/05-shopsyncflow/File-system/DATABASE-SCHEMA.md
--
-- Tables Created:
--   1. files - Centralized file metadata storage
--   2. product_media - Product-to-file junction table
--   3. variant_media - Variant-to-file junction table
--   4. file_references - Generic file usage tracking
--
-- Note: Old columns (products.images, product_variants.image_url) are
--       KEPT temporarily for verification. Will be removed in Phase 4.
-- ===================================================================

BEGIN;

-- ===================================================================
-- TABLE 1: files
-- ===================================================================
-- Centralized storage for all uploaded file metadata
-- Stores images, documents, videos, etc.

CREATE TABLE IF NOT EXISTS files (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,

  -- File identification
  filename VARCHAR(255) NOT NULL,
  original_filename VARCHAR(255) NOT NULL,
  file_path TEXT NOT NULL,

  -- File metadata
  mime_type VARCHAR(100) NOT NULL,
  file_type VARCHAR(50) NOT NULL,
  file_size INTEGER NOT NULL,
  file_hash VARCHAR(64),

  -- Image-specific metadata (NULL for non-images)
  width INTEGER,
  height INTEGER,

  -- SEO & Accessibility
  alt_text TEXT,
  title VARCHAR(255),

  -- CDN & URLs
  cdn_url TEXT NOT NULL,
  thumbnail_url TEXT,

  -- Storage metadata
  storage_provider VARCHAR(50) DEFAULT 'local',
  storage_key TEXT,

  -- Tracking
  uploaded_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
  upload_source VARCHAR(50) DEFAULT 'manual',

  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create indexes for files table
CREATE INDEX IF NOT EXISTS idx_files_file_type ON files(file_type);
CREATE INDEX IF NOT EXISTS idx_files_created_at ON files(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_files_file_hash ON files(file_hash) WHERE file_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_files_uploaded_by ON files(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_files_storage_provider ON files(storage_provider);

-- Add comments for documentation
COMMENT ON TABLE files IS 'Centralized media asset management - stores all uploaded files (images, documents, videos)';
COMMENT ON COLUMN files.filename IS 'Sanitized filename (URL-safe, no spaces): "product-image-001.jpg"';
COMMENT ON COLUMN files.original_filename IS 'User''s original filename: "My Photo (1).jpg"';
COMMENT ON COLUMN files.file_path IS 'Storage path: "/uploads/2025/11/abc123.jpg"';
COMMENT ON COLUMN files.file_hash IS 'SHA-256 hash for deduplication - prevents duplicate uploads';
COMMENT ON COLUMN files.cdn_url IS 'Public URL to access file (local or CDN)';
COMMENT ON COLUMN files.storage_provider IS 'Storage backend: "local", "cloudinary", "s3"';

-- ===================================================================
-- TABLE 2: product_media
-- ===================================================================
-- Junction table for many-to-many relationship between products and files
-- Allows one file to be used by multiple products

CREATE TABLE IF NOT EXISTS product_media (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,

  -- Relationships
  product_id VARCHAR NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  file_id VARCHAR NOT NULL REFERENCES files(id) ON DELETE CASCADE,

  -- Display order
  position INTEGER NOT NULL DEFAULT 1 CHECK (position > 0),
  media_type VARCHAR(50) DEFAULT 'image',
  is_featured BOOLEAN DEFAULT FALSE,

  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),

  -- Constraints
  UNIQUE(product_id, file_id)
);

-- Create indexes for product_media
CREATE INDEX IF NOT EXISTS idx_product_media_product_position ON product_media(product_id, position);
CREATE INDEX IF NOT EXISTS idx_product_media_file_id ON product_media(file_id);
CREATE INDEX IF NOT EXISTS idx_product_media_is_featured ON product_media(is_featured) WHERE is_featured = TRUE;

-- Unique constraint: Only one featured image per product
CREATE UNIQUE INDEX IF NOT EXISTS idx_product_media_one_featured_per_product
  ON product_media(product_id) WHERE is_featured = TRUE;

-- Add comments
COMMENT ON TABLE product_media IS 'Junction table linking products to files (many-to-many)';
COMMENT ON COLUMN product_media.position IS 'Display order: 1 = featured/main image, 2+ = gallery';
COMMENT ON COLUMN product_media.is_featured IS 'TRUE for main product thumbnail (only one per product)';

-- ===================================================================
-- TABLE 3: variant_media
-- ===================================================================
-- Junction table for variant-specific images (e.g., color swatches)

CREATE TABLE IF NOT EXISTS variant_media (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,

  -- Relationships
  variant_id VARCHAR NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  file_id VARCHAR NOT NULL REFERENCES files(id) ON DELETE CASCADE,

  -- Display
  position INTEGER NOT NULL DEFAULT 1 CHECK (position > 0),
  is_featured BOOLEAN DEFAULT FALSE,

  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),

  -- Constraints
  UNIQUE(variant_id, file_id)
);

-- Create indexes for variant_media
CREATE INDEX IF NOT EXISTS idx_variant_media_variant_position ON variant_media(variant_id, position);
CREATE INDEX IF NOT EXISTS idx_variant_media_file_id ON variant_media(file_id);

-- Add comments
COMMENT ON TABLE variant_media IS 'Junction table linking variants to files (e.g., color-specific images)';
COMMENT ON COLUMN variant_media.position IS 'Display order for variant images';

-- ===================================================================
-- TABLE 4: file_references
-- ===================================================================
-- Generic tracking for file usage across all resource types
-- Future-proof: easily add file support to new resources (blog posts, pages, etc.)

CREATE TABLE IF NOT EXISTS file_references (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,

  -- Relationships
  file_id VARCHAR NOT NULL REFERENCES files(id) ON DELETE CASCADE,

  -- Resource (polymorphic)
  resource_type VARCHAR(50) NOT NULL,
  resource_id TEXT NOT NULL,

  -- Context
  context VARCHAR(100),

  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),

  -- Constraints
  UNIQUE(file_id, resource_type, resource_id, context)
);

-- Create indexes for file_references
CREATE INDEX IF NOT EXISTS idx_file_references_file_id ON file_references(file_id);
CREATE INDEX IF NOT EXISTS idx_file_references_resource ON file_references(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_file_references_resource_type ON file_references(resource_type);

-- Add comments
COMMENT ON TABLE file_references IS 'Generic file usage tracking across all resource types (products, blog posts, pages, etc.)';
COMMENT ON COLUMN file_references.resource_type IS 'Type of resource: "product", "variant", "blog_post", "page", etc.';
COMMENT ON COLUMN file_references.resource_id IS 'ID of the resource using this file';
COMMENT ON COLUMN file_references.context IS 'How file is used: "featured_image", "gallery", "content", etc.';

COMMIT;

-- ===================================================================
-- Verification Queries (run after migration)
-- ===================================================================
-- Verify tables created successfully:
-- SELECT table_name FROM information_schema.tables WHERE table_name IN ('files', 'product_media', 'variant_media', 'file_references');

-- Verify indexes created:
-- SELECT tablename, indexname FROM pg_indexes WHERE tablename IN ('files', 'product_media', 'variant_media', 'file_references') ORDER BY tablename, indexname;

-- Verify constraints:
-- SELECT con.conname, con.contype, rel.relname FROM pg_constraint con JOIN pg_class rel ON con.conrelid = rel.oid WHERE rel.relname IN ('files', 'product_media', 'variant_media', 'file_references') ORDER BY rel.relname, con.conname;

-- ===================================================================
-- Rollback Instructions (if needed)
-- ===================================================================
-- BEGIN;
-- DROP TABLE IF EXISTS file_references CASCADE;
-- DROP TABLE IF EXISTS variant_media CASCADE;
-- DROP TABLE IF EXISTS product_media CASCADE;
-- DROP TABLE IF EXISTS files CASCADE;
-- COMMIT;
-- ===================================================================
