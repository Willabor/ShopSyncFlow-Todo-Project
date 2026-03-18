/**
 * E2E Test Configuration
 *
 * Centralizes test credentials and settings.
 * Override via environment variables for CI/CD pipelines.
 *
 * Usage:
 *   import { TEST_USERS, TEST_URL } from './test-config';
 *   await page.fill('input[name="username"]', TEST_USERS.editor.username);
 */

export const TEST_URL = process.env.E2E_BASE_URL || 'http://localhost:5000';

export const TEST_USERS = {
  superAdmin: {
    username: process.env.E2E_ADMIN_USERNAME || 'admin',
    password: process.env.E2E_ADMIN_PASSWORD || 'admin',
    role: 'SuperAdmin' as const,
  },
  editor: {
    username: process.env.E2E_EDITOR_USERNAME || 'editor1',
    password: process.env.E2E_EDITOR_PASSWORD || 'password',
    role: 'Editor' as const,
  },
};

/**
 * Helper to log in as a specific test user
 */
export async function loginAs(
  page: import('@playwright/test').Page,
  user: keyof typeof TEST_USERS
) {
  const { username, password } = TEST_USERS[user];
  await page.goto(`${TEST_URL}/auth`);
  await page.fill('[data-testid="input-login-username"], input[name="username"]', username);
  await page.fill('[data-testid="input-login-password"], input[name="password"]', password);
  await page.click('[data-testid="button-login"], button[type="submit"]');
  await page.waitForURL('**/dashboard', { timeout: 10000 });
}
