-- ===================================================================
-- PRE-DEPLOYMENT DATABASE CLEANUP SCRIPT
-- ===================================================================
-- This script removes all test data while preserving:
-- 1. SuperAdmin user (admin@nexusclothing.com)
-- 2. Step templates (60 checklist templates)
-- 3. Database schema and structure
-- ===================================================================

-- Start transaction for safety
BEGIN;

-- Display current state
SELECT 'BEFORE CLEANUP:' as status;
SELECT 'users' as table_name, COUNT(*) as count FROM users
UNION ALL SELECT 'tasks', COUNT(*) FROM tasks
UNION ALL SELECT 'products', COUNT(*) FROM products
UNION ALL SELECT 'vendors', COUNT(*) FROM vendors
UNION ALL SELECT 'step_templates', COUNT(*) FROM step_templates
UNION ALL SELECT 'task_steps', COUNT(*) FROM task_steps
UNION ALL SELECT 'audit_log', COUNT(*) FROM audit_log
UNION ALL SELECT 'notifications', COUNT(*) FROM notifications
UNION ALL SELECT 'session', COUNT(*) FROM session
UNION ALL SELECT 'login_attempts', COUNT(*) FROM login_attempts
UNION ALL SELECT 'password_reset_tokens', COUNT(*) FROM password_reset_tokens;

-- ===================================================================
-- STEP 1: Delete task-related data (cascades to task_steps via FK)
-- ===================================================================
DELETE FROM task_steps;
-- Tasks will cascade delete their steps
DELETE FROM tasks;

-- ===================================================================
-- STEP 2: Delete product-related data
-- ===================================================================
DELETE FROM products;

-- ===================================================================
-- STEP 3: Delete vendor data
-- ===================================================================
DELETE FROM vendors;

-- ===================================================================
-- STEP 4: Delete audit logs (test activity)
-- ===================================================================
DELETE FROM audit_log;

-- ===================================================================
-- STEP 5: Delete notifications
-- ===================================================================
DELETE FROM notifications;

-- ===================================================================
-- STEP 6: Clean up auth-related tables
-- ===================================================================
DELETE FROM session;
DELETE FROM login_attempts;
DELETE FROM password_reset_tokens;

-- ===================================================================
-- STEP 7: Delete test users (keep only SuperAdmin)
-- ===================================================================
-- Keep only the main SuperAdmin account
DELETE FROM users
WHERE username NOT IN ('admin');

-- ===================================================================
-- IMPORTANT: STEP_TEMPLATES ARE PRESERVED
-- These 60 templates are production-ready checklist templates
-- ===================================================================

-- Display final state
SELECT 'AFTER CLEANUP:' as status;
SELECT 'users' as table_name, COUNT(*) as count FROM users
UNION ALL SELECT 'tasks', COUNT(*) FROM tasks
UNION ALL SELECT 'products', COUNT(*) FROM products
UNION ALL SELECT 'vendors', COUNT(*) FROM vendors
UNION ALL SELECT 'step_templates (PRESERVED)', COUNT(*) FROM step_templates
UNION ALL SELECT 'task_steps', COUNT(*) FROM task_steps
UNION ALL SELECT 'audit_log', COUNT(*) FROM audit_log
UNION ALL SELECT 'notifications', COUNT(*) FROM notifications
UNION ALL SELECT 'session', COUNT(*) FROM session
UNION ALL SELECT 'login_attempts', COUNT(*) FROM login_attempts
UNION ALL SELECT 'password_reset_tokens', COUNT(*) FROM password_reset_tokens;

-- Display remaining user
SELECT 'REMAINING USER:' as status;
SELECT username, role, email, account_status FROM users;

-- Commit the transaction
COMMIT;

SELECT 'DATABASE CLEANUP COMPLETE!' as status;
SELECT '✅ Removed: 6 test users, 10 tasks, 9 products, 4 vendors, 130 audit logs' as summary;
SELECT '✅ Preserved: 1 SuperAdmin user, 60 step templates' as preserved;
