-- ============================================
-- Populate Step Templates
-- 7 Task Categories with predefined steps
-- Date: 2025-10-26
-- ============================================

BEGIN;

-- Clear existing templates (in case of re-run)
DELETE FROM step_templates;

-- ============================================
-- CATEGORY 1: Product Image Editing 📸
-- ============================================

INSERT INTO step_templates (category, title, "order", required) VALUES
('Product Image Editing', 'Download/receive product images from vendor', 1, true),
('Product Image Editing', 'Remove background (make white)', 2, true),
('Product Image Editing', 'Add drop shadow (subtle, professional)', 3, true),
('Product Image Editing', 'Center product in frame', 4, true),
('Product Image Editing', 'Resize to 2000x2000 pixels', 5, true),
('Product Image Editing', 'Remove wrinkles (if clothing)', 6, false),
('Product Image Editing', 'Remove visible tags/labels', 7, true),
('Product Image Editing', 'Color correction (if needed)', 8, false),
('Product Image Editing', 'Save optimized files (web-ready)', 9, true),
('Product Image Editing', 'Upload to image library', 10, true);

-- ============================================
-- CATEGORY 2: Product Description Writing ✍️
-- ============================================

INSERT INTO step_templates (category, title, "order", required) VALUES
('Product Description Writing', 'Research product & competitors', 1, true),
('Product Description Writing', 'Write meta title (under 60 chars, keyword + brand)', 2, true),
('Product Description Writing', 'Write meta description (under 150 chars, USPs + CTA)', 3, true),
('Product Description Writing', 'Create H1 heading (one per page, keyword-focused)', 4, true),
('Product Description Writing', 'Write main description (300+ words minimum)', 5, true),
('Product Description Writing', 'Add bullet points (scannable features)', 6, true),
('Product Description Writing', 'Include internal links to related products', 7, false),
('Product Description Writing', 'Add keywords naturally (no stuffing)', 8, true),
('Product Description Writing', 'Write alt text for images (SEO)', 9, true),
('Product Description Writing', 'Proofread & check grammar', 10, true);

-- ============================================
-- CATEGORY 3: Product Upload to Shopify 🛒
-- ============================================

INSERT INTO step_templates (category, title, "order", required) VALUES
('Product Upload to Shopify', 'Verify images are ready (2000x2000, white BG)', 1, true),
('Product Upload to Shopify', 'Verify description is ready (SEO-optimized)', 2, true),
('Product Upload to Shopify', 'Enter product title', 3, true),
('Product Upload to Shopify', 'Enter product description', 4, true),
('Product Upload to Shopify', 'Upload images (first image = main)', 5, true),
('Product Upload to Shopify', 'Set pricing', 6, true),
('Product Upload to Shopify', 'Add SKU/barcode', 7, true),
('Product Upload to Shopify', 'Set inventory quantity', 8, true),
('Product Upload to Shopify', 'Add product tags/collections', 9, true),
('Product Upload to Shopify', 'Publish product', 10, true),
('Product Upload to Shopify', 'Verify product is live on site', 11, true);

-- ============================================
-- CATEGORY 4: SEO Optimization 🎯
-- ============================================

INSERT INTO step_templates (category, title, "order", required) VALUES
('SEO Optimization', 'Check page titles (under 60 chars)', 1, true),
('SEO Optimization', 'Check meta descriptions (under 150 chars)', 2, true),
('SEO Optimization', 'Verify H1 heading structure', 3, true),
('SEO Optimization', 'Check keyword usage', 4, true),
('SEO Optimization', 'Add internal links', 5, true),
('SEO Optimization', 'Add schema markup (if applicable)', 6, false),
('SEO Optimization', 'Check breadcrumbs', 7, false),
('SEO Optimization', 'Optimize images (alt text, file size)', 8, true),
('SEO Optimization', 'Test page speed', 9, true),
('SEO Optimization', 'Submit to Google Search Console', 10, false);

-- ============================================
-- CATEGORY 5: Content Writing 📝
-- ============================================

INSERT INTO step_templates (category, title, "order", required) VALUES
('Content Writing', 'Research topic', 1, true),
('Content Writing', 'Create outline', 2, true),
('Content Writing', 'Write draft (300+ words)', 3, true),
('Content Writing', 'Optimize for keywords', 4, true),
('Content Writing', 'Add headings (H2, H3, H4)', 5, true),
('Content Writing', 'Add internal links', 6, true),
('Content Writing', 'Add images', 7, false),
('Content Writing', 'Proofread', 8, true),
('Content Writing', 'Publish', 9, true),
('Content Writing', 'Share on social media (if applicable)', 10, false);

-- ============================================
-- CATEGORY 6: Quality Assurance ✅
-- ============================================

INSERT INTO step_templates (category, title, "order", required) VALUES
('Quality Assurance', 'Check product images (2000x2000, white BG)', 1, true),
('Quality Assurance', 'Check product description (SEO compliance)', 2, true),
('Quality Assurance', 'Verify pricing is correct', 3, true),
('Quality Assurance', 'Test product page loads properly', 4, true),
('Quality Assurance', 'Check mobile responsiveness', 5, true),
('Quality Assurance', 'Verify all links work', 6, true),
('Quality Assurance', 'Check for typos/errors', 7, true),
('Quality Assurance', 'Approve or request revisions', 8, true);

-- ============================================
-- CATEGORY 7: Other/General Tasks 📋
-- ============================================

-- Note: This category intentionally has no template steps
-- Tasks in this category will have custom steps added manually
INSERT INTO step_templates (category, title, "order", required) VALUES
('Other/General Tasks', 'Complete the task', 1, false);

COMMIT;

-- ============================================
-- Template Population Complete
-- Total: 79 predefined steps across 7 categories
-- ============================================
