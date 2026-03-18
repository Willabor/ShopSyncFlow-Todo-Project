-- ============================================
-- ShopSyncFlow Database Migration
-- From: Product-centric workflow
-- To: General task management system
-- Date: 2025-10-26
-- Backup: /volume1/docker/backups/shopsyncflow-pre-pivot-20251026-*.sql
-- ============================================

-- IMPORTANT: This migration is designed to be run ONCE
-- If you need to rollback, use 001_pivot_to_general_tasks_ROLLBACK.sql

BEGIN;

-- ============================================
-- STEP 1: Add new columns to tasks table
-- ============================================

-- Add task-specific columns (nullable initially for backward compatibility)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'::jsonb;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS product_info JSONB;

-- ============================================
-- STEP 2: Migrate existing data
-- ============================================

-- Set category for existing tasks (they're all product-related)
UPDATE tasks
SET category = 'Product Upload to Shopify'
WHERE category IS NULL;

-- Populate product_info from products table for existing tasks
UPDATE tasks t
SET
  product_info = CASE
    WHEN p.id IS NOT NULL THEN jsonb_build_object(
      'sku', p.sku,
      'vendor', p.vendor,
      'title', p.title,
      'price', p.price,
      'description', p.description,
      'category', p.category,
      'order_number', p.order_number,
      'images', p.images
    )
    ELSE NULL
  END
FROM products p
WHERE t.product_id = p.id;

-- ============================================
-- STEP 3: Title already exists, no need to set NOT NULL
-- ============================================

-- (Title column already exists and is already NOT NULL)
-- description, category, attachments remain nullable (optional fields)

-- ============================================
-- STEP 4: Make product_id nullable (optional reference)
-- ============================================

ALTER TABLE tasks ALTER COLUMN product_id DROP NOT NULL;

-- ============================================
-- STEP 5: Create task_steps table
-- ============================================

CREATE TABLE IF NOT EXISTS task_steps (
  id SERIAL PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  completed BOOLEAN DEFAULT FALSE NOT NULL,
  "order" INTEGER NOT NULL,
  required BOOLEAN DEFAULT FALSE NOT NULL,
  completed_at TIMESTAMP,
  completed_by TEXT REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_task_steps_task_id ON task_steps(task_id);
CREATE INDEX IF NOT EXISTS idx_task_steps_completed ON task_steps(task_id, completed);
CREATE INDEX IF NOT EXISTS idx_task_steps_order ON task_steps(task_id, "order");

-- ============================================
-- STEP 6: Create step_templates table
-- ============================================

CREATE TABLE IF NOT EXISTS step_templates (
  id SERIAL PRIMARY KEY,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  "order" INTEGER NOT NULL,
  required BOOLEAN DEFAULT FALSE NOT NULL,
  active BOOLEAN DEFAULT TRUE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_step_templates_category ON step_templates(category);
CREATE INDEX IF NOT EXISTS idx_step_templates_active ON step_templates(category, active);
CREATE INDEX IF NOT EXISTS idx_step_templates_order ON step_templates(category, "order");

-- ============================================
-- STEP 7: Drop Shopify tables (not needed)
-- ============================================

DROP TABLE IF EXISTS shopify_product_mappings CASCADE;
DROP TABLE IF EXISTS shopify_stores CASCADE;

-- ============================================
-- STEP 8: Migrate existing checklist data to task_steps
-- ============================================

-- This will convert existing checklist JSON to task_steps rows
-- Note: Existing tasks have checklist as JSONB, structure varies
DO $$
DECLARE
  task_record RECORD;
  step_key TEXT;
  step_value JSONB;
  step_order INTEGER;
BEGIN
  FOR task_record IN SELECT id, checklist FROM tasks WHERE checklist IS NOT NULL
  LOOP
    step_order := 1;

    -- Iterate through checklist keys
    FOR step_key, step_value IN SELECT * FROM jsonb_each(task_record.checklist)
    LOOP
      INSERT INTO task_steps (task_id, title, completed, "order", required)
      VALUES (
        task_record.id,
        step_key,
        CASE
          WHEN jsonb_typeof(step_value) = 'boolean' THEN (step_value)::boolean
          ELSE FALSE
        END,
        step_order,
        FALSE  -- Existing steps not marked as required
      );

      step_order := step_order + 1;
    END LOOP;
  END LOOP;
END $$;

COMMIT;

-- ============================================
-- Migration Complete
-- ============================================
-- Next: Run 002_populate_step_templates.sql to add the 7 task categories
