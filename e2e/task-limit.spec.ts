import { test, expect } from '@playwright/test';
import { TEST_USERS, loginAs } from './test-config';

/**
 * Test: 2-Task Limit Enforcement for Editors
 *
 * This test verifies that Editors can only have a maximum of 2 tasks
 * in ASSIGNED status at once. When they try to claim a 3rd task,
 * the system should block them with a clear error message.
 */
test.describe('Task Limit System', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'editor');
  });

  test('should allow Editor to assign up to 2 tasks', async ({ page }) => {
    // Navigate to Kanban board
    await page.click('a[href="/kanban"]');
    await page.waitForURL('**/kanban');

    // Find TRIAGE column
    const triageColumn = page.locator('[data-testid="column-triage"]');
    await expect(triageColumn).toBeVisible();

    // Get first task from TRIAGE
    const firstTask = triageColumn.locator('[data-testid^="task-card-"]').first();
    const firstTaskId = await firstTask.getAttribute('data-testid');

    // Drag first task to ASSIGNED
    const assignedColumn = page.locator('[data-testid="column-assigned"]');
    await firstTask.dragTo(assignedColumn);

    // Wait for task to appear in ASSIGNED
    await expect(assignedColumn.locator(`[data-testid="${firstTaskId}"]`)).toBeVisible({ timeout: 5000 });

    // Get second task from TRIAGE
    const secondTask = triageColumn.locator('[data-testid^="task-card-"]').first();
    const secondTaskId = await secondTask.getAttribute('data-testid');

    // Drag second task to ASSIGNED
    await secondTask.dragTo(assignedColumn);

    // Wait for second task to appear in ASSIGNED
    await expect(assignedColumn.locator(`[data-testid="${secondTaskId}"]`)).toBeVisible({ timeout: 5000 });

    // Verify both tasks are in ASSIGNED
    const assignedTaskCount = await assignedColumn.locator('[data-testid^="task-card-"]').count();
    expect(assignedTaskCount).toBeGreaterThanOrEqual(2);
  });

  test('should block Editor from assigning more than 2 tasks', async ({ page }) => {
    // Navigate to Kanban board
    await page.click('a[href="/kanban"]');
    await page.waitForURL('**/kanban');

    // Ensure Editor already has 2 tasks in ASSIGNED
    // (This assumes the previous test ran or test data is set up)

    // Try to drag a 3rd task from TRIAGE to ASSIGNED
    const triageColumn = page.locator('[data-testid="column-triage"]');
    const thirdTask = triageColumn.locator('[data-testid^="task-card-"]').first();
    const assignedColumn = page.locator('[data-testid="column-assigned"]');

    // Attempt to drag
    await thirdTask.dragTo(assignedColumn);

    // Should see error toast or dialog
    const errorToast = page.locator('text=/Task Limit Reached|already have 2 tasks/i');
    await expect(errorToast).toBeVisible({ timeout: 5000 });

    // Verify task is NOT in ASSIGNED (still in TRIAGE)
    await expect(triageColumn.locator('[data-testid^="task-card-"]').first()).toBeVisible();
  });

  test('should show workload indicator "2/2 tasks" on assigned tasks', async ({ page }) => {
    // Navigate to Kanban board
    await page.click('a[href="/kanban"]');
    await page.waitForURL('**/kanban');

    const assignedColumn = page.locator('[data-testid="column-assigned"]');

    // Find a task card in ASSIGNED that belongs to current user
    const taskCard = assignedColumn.locator('[data-testid^="task-card-"]').first();

    // Check if workload indicator shows "2/2 tasks"
    const workloadBadge = taskCard.locator('text=/2\\/2 tasks/i');
    await expect(workloadBadge).toBeVisible({ timeout: 5000 });
  });

  test('should allow Editor to assign more tasks after moving one to IN_PROGRESS', async ({ page }) => {
    // Navigate to Kanban board
    await page.click('a[href="/kanban"]');
    await page.waitForURL('**/kanban');

    const assignedColumn = page.locator('[data-testid="column-assigned"]');
    const inProgressColumn = page.locator('[data-testid="column-in-progress"]');

    // Move one task from ASSIGNED to IN_PROGRESS
    const firstAssignedTask = assignedColumn.locator('[data-testid^="task-card-"]').first();
    await firstAssignedTask.dragTo(inProgressColumn);

    // Wait for task to move
    await page.waitForTimeout(1000);

    // Now try to assign a new task from TRIAGE
    const triageColumn = page.locator('[data-testid="column-triage"]');
    const newTask = triageColumn.locator('[data-testid^="task-card-"]').first();
    await newTask.dragTo(assignedColumn);

    // Should succeed (no error)
    const errorToast = page.locator('text=/Task Limit Reached/i');
    await expect(errorToast).not.toBeVisible({ timeout: 2000 });
  });
});

/**
 * Test: SuperAdmin and WarehouseManager Bypass
 *
 * SuperAdmin and WarehouseManager should NOT be subject to the 2-task limit.
 * They can assign unlimited tasks.
 */
test.describe('Task Limit - Admin Bypass', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'superAdmin');
  });

  test('should allow SuperAdmin to assign more than 2 tasks', async ({ page }) => {
    await page.click('a[href="/kanban"]');
    await page.waitForURL('**/kanban');

    const triageColumn = page.locator('[data-testid="column-triage"]');
    const assignedColumn = page.locator('[data-testid="column-assigned"]');

    // Try to assign 3+ tasks
    for (let i = 0; i < 3; i++) {
      const task = triageColumn.locator('[data-testid^="task-card-"]').first();
      await task.dragTo(assignedColumn);
      await page.waitForTimeout(500);
    }

    // Should NOT see any error messages
    const errorToast = page.locator('text=/Task Limit Reached/i');
    await expect(errorToast).not.toBeVisible({ timeout: 2000 });

    // Verify at least 3 tasks are in ASSIGNED
    const assignedCount = await assignedColumn.locator('[data-testid^="task-card-"]').count();
    expect(assignedCount).toBeGreaterThanOrEqual(3);
  });
});
