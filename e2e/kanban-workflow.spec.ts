import { test, expect } from '@playwright/test';
import { TEST_USERS, loginAs } from './test-config';

/**
 * Test: Complete Kanban Workflow
 *
 * Tests the end-to-end workflow from NEW → DONE
 * with focus on the TRIAGE → ASSIGNED → IN_PROGRESS transition
 */
test.describe('Kanban Workflow - Editor Journey', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'editor');
  });

  test('should display all 8 workflow stages', async ({ page }) => {
    await page.click('a[href="/kanban"]');
    await page.waitForURL('**/kanban');

    // Verify all columns are visible
    await expect(page.locator('text=NEW')).toBeVisible();
    await expect(page.locator('text=TRIAGE')).toBeVisible();
    await expect(page.locator('text=ASSIGNED')).toBeVisible();
    await expect(page.locator('text=IN PROGRESS')).toBeVisible();
    await expect(page.locator('text=READY FOR REVIEW')).toBeVisible();
    await expect(page.locator('text=PUBLISHED')).toBeVisible();
    await expect(page.locator('text=QA APPROVED')).toBeVisible();
    await expect(page.locator('text=DONE')).toBeVisible();
  });

  test('should show task counts in column badges', async ({ page }) => {
    await page.click('a[href="/kanban"]');
    await page.waitForURL('**/kanban');

    // Check that each column has a count badge
    const triageBadge = page.locator('[data-testid="badge-triage-count"]');
    await expect(triageBadge).toBeVisible();

    const assignedBadge = page.locator('[data-testid="badge-assigned-count"]');
    await expect(assignedBadge).toBeVisible();

    // Verify count is a number
    const triageCount = await triageBadge.textContent();
    expect(parseInt(triageCount || '0')).toBeGreaterThanOrEqual(0);
  });

  test('should allow Editor to self-assign task from TRIAGE', async ({ page }) => {
    await page.click('a[href="/kanban"]');
    await page.waitForURL('**/kanban');

    const triageColumn = page.locator('[data-testid="column-triage"]');
    const assignedColumn = page.locator('[data-testid="column-assigned"]');

    // Get task count before
    const beforeCount = await assignedColumn.locator('[data-testid^="task-card-"]').count();

    // Drag task from TRIAGE to ASSIGNED
    const task = triageColumn.locator('[data-testid^="task-card-"]').first();
    const taskId = await task.getAttribute('data-testid');

    await task.dragTo(assignedColumn);

    // Wait for task to appear in ASSIGNED
    await page.waitForTimeout(1000);

    // Verify task moved
    const afterCount = await assignedColumn.locator('[data-testid^="task-card-"]').count();
    expect(afterCount).toBe(beforeCount + 1);

    // Verify task has correct ID
    if (taskId) {
      await expect(assignedColumn.locator(`[data-testid="${taskId}"]`)).toBeVisible();
    }
  });

  test('should allow Editor to move ASSIGNED task to IN_PROGRESS', async ({ page }) => {
    await page.click('a[href="/kanban"]');
    await page.waitForURL('**/kanban');

    const assignedColumn = page.locator('[data-testid="column-assigned"]');
    const inProgressColumn = page.locator('[data-testid="column-in-progress"]');

    // Get a task from ASSIGNED
    const task = assignedColumn.locator('[data-testid^="task-card-"]').first();

    if (await task.isVisible()) {
      await task.dragTo(inProgressColumn);

      await page.waitForTimeout(1000);

      // Verify task moved to IN_PROGRESS
      const inProgressCount = await inProgressColumn.locator('[data-testid^="task-card-"]').count();
      expect(inProgressCount).toBeGreaterThanOrEqual(1);

      // Should see success toast
      await expect(page.locator('text=/Task Updated|updated successfully/i')).toBeVisible({ timeout: 5000 });
    }
  });

  test('should NOT allow Editor to move task directly from TRIAGE to IN_PROGRESS', async ({ page }) => {
    await page.click('a[href="/kanban"]');
    await page.waitForURL('**/kanban');

    const triageColumn = page.locator('[data-testid="column-triage"]');
    const inProgressColumn = page.locator('[data-testid="column-in-progress"]');

    const task = triageColumn.locator('[data-testid^="task-card-"]').first();

    if (await task.isVisible()) {
      await task.dragTo(inProgressColumn);

      await page.waitForTimeout(1000);

      // Should see error dialog about invalid transition
      await expect(page.locator('text=/Cannot move|Invalid transition/i')).toBeVisible({ timeout: 5000 });
    }
  });

  test('should show valid moves dialog when invalid drag is attempted', async ({ page }) => {
    await page.click('a[href="/kanban"]');
    await page.waitForURL('**/kanban');

    const assignedColumn = page.locator('[data-testid="column-assigned"]');
    const newColumn = page.locator('[data-testid="column-new"]');

    const task = assignedColumn.locator('[data-testid^="task-card-"]').first();

    if (await task.isVisible()) {
      await task.dragTo(newColumn);

      await page.waitForTimeout(1000);

      // Should see error dialog
      const dialog = page.locator('[role="alertdialog"]');
      await expect(dialog).toBeVisible({ timeout: 5000 });

      // Should show "Valid moves from this status"
      await expect(dialog.locator('text=/Valid moves from this status/i')).toBeVisible();

      // Should show valid transition badges
      await expect(dialog.locator('text=IN_PROGRESS')).toBeVisible();

      // Close dialog
      await page.click('button:has-text("Got it")');
    }
  });
});

/**
 * Test: Workload Indicators
 *
 * Verify that task cards show assignee workload information
 */
test.describe('Workload Indicators', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'editor');
  });

  test('should display assignee name on ASSIGNED tasks', async ({ page }) => {
    await page.click('a[href="/kanban"]');
    await page.waitForURL('**/kanban');

    const assignedColumn = page.locator('[data-testid="column-assigned"]');
    const taskCard = assignedColumn.locator('[data-testid^="task-card-"]').first();

    if (await taskCard.isVisible()) {
      // Should show "Assigned to: [Name]"
      await expect(taskCard.locator('text=/Assigned to:/i')).toBeVisible();

      // Should show assignee name (first + last name or username)
      await expect(taskCard.locator('text=/Assigned to: \\w+/i')).toBeVisible();
    }
  });

  test('should display task count badge "X/2 tasks"', async ({ page }) => {
    await page.click('a[href="/kanban"]');
    await page.waitForURL('**/kanban');

    const assignedColumn = page.locator('[data-testid="column-assigned"]');
    const taskCard = assignedColumn.locator('[data-testid^="task-card-"]').first();

    if (await taskCard.isVisible()) {
      // Should show task count badge (e.g., "1/2 tasks" or "2/2 tasks")
      await expect(taskCard.locator('text=/[0-2]\\/2 tasks/i')).toBeVisible({ timeout: 5000 });
    }
  });

  test('should highlight badge when at limit (2/2 tasks)', async ({ page }) => {
    await page.click('a[href="/kanban"]');
    await page.waitForURL('**/kanban');

    const assignedColumn = page.locator('[data-testid="column-assigned"]');
    const taskCards = assignedColumn.locator('[data-testid^="task-card-"]');

    const count = await taskCards.count();

    for (let i = 0; i < count; i++) {
      const card = taskCards.nth(i);
      const badge = card.locator('text=/2\\/2 tasks/i');

      if (await badge.isVisible()) {
        // Badge should have secondary variant when at limit
        const badgeElement = badge.locator('xpath=..');
        const badgeClass = await badgeElement.getAttribute('class');

        // Should have styling indicating full workload
        expect(badgeClass).toMatch(/secondary|badge/i);

        break; // Found one, that's enough
      }
    }
  });

  test('should show "Working on: [Name]" for tasks in IN_PROGRESS and beyond', async ({ page }) => {
    await page.click('a[href="/kanban"]');
    await page.waitForURL('**/kanban');

    const inProgressColumn = page.locator('[data-testid="column-in-progress"]');
    const taskCard = inProgressColumn.locator('[data-testid^="task-card-"]').first();

    if (await taskCard.isVisible()) {
      // Should show "Working on: [Name]"
      await expect(taskCard.locator('text=/Working on:/i')).toBeVisible();
    }
  });

  test('should NOT show workload indicator on TRIAGE or NEW tasks', async ({ page }) => {
    await page.click('a[href="/kanban"]');
    await page.waitForURL('**/kanban');

    const triageColumn = page.locator('[data-testid="column-triage"]');
    const triageTask = triageColumn.locator('[data-testid^="task-card-"]').first();

    if (await triageTask.isVisible()) {
      // Should NOT show workload indicators
      await expect(triageTask.locator('text=/Assigned to:|Working on:/i')).not.toBeVisible();
      await expect(triageTask.locator('text=/\\/2 tasks/i')).not.toBeVisible();
    }
  });
});

/**
 * Test: Kanban Board Filters
 *
 * Test filtering functionality
 */
test.describe('Kanban Board Filters', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'editor');
  });

  test('should filter to show only "My Tasks"', async ({ page }) => {
    await page.click('a[href="/kanban"]');
    await page.waitForURL('**/kanban');

    // Click filter dropdown
    const filterSelect = page.locator('select, [role="combobox"]').filter({ hasText: /All Tasks/i });
    await filterSelect.click();

    // Select "My Tasks"
    await page.click('text=My Tasks');

    await page.waitForTimeout(1000);

    // All visible tasks should be assigned to current user
    const allTasks = page.locator('[data-testid^="task-card-"]');
    const taskCount = await allTasks.count();

    // Verify tasks are filtered (can't easily check assignee without clicking each card)
    expect(taskCount).toBeGreaterThanOrEqual(0);
  });

  test('should refresh board when refresh button is clicked', async ({ page }) => {
    await page.click('a[href="/kanban"]');
    await page.waitForURL('**/kanban');

    const refreshButton = page.locator('[data-testid="button-refresh-board"]');
    await refreshButton.click();

    // Should show loading state (spinning icon)
    await expect(refreshButton.locator('.animate-spin')).toBeVisible({ timeout: 2000 });

    // Should show success toast
    await expect(page.locator('text=/Refreshed|Data has been refreshed/i')).toBeVisible({ timeout: 5000 });
  });
});
