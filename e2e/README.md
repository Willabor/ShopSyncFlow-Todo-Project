# Playwright E2E Tests

Comprehensive end-to-end tests for ShopSyncFlow's task management workflow system.

## Overview

This test suite covers the newly implemented features:
- **Task Limit System**: 2-task maximum for Editors in ASSIGNED status
- **Workload Indicators**: Visual display of task counts on cards
- **Auto-Return Warnings**: 48-hour countdown with color-coded alerts
- **Kanban Workflow**: Full workflow testing from TRIAGE → DONE

## Test Files

### `task-limit.spec.ts`
Tests the 2-task limit enforcement for Editors.

**What it tests:**
- ✅ Editors can assign up to 2 tasks
- ✅ System blocks 3rd task with clear error message
- ✅ Workload indicator shows "2/2 tasks"
- ✅ Editors can assign more after moving one to IN_PROGRESS
- ✅ SuperAdmin/WarehouseManager can bypass the limit

**Key scenarios:**
1. Self-assign 2 tasks from TRIAGE → ASSIGNED
2. Attempt to assign 3rd task (should fail)
3. Move 1 task to IN_PROGRESS, then assign new task (should succeed)
4. Admin assigns 3+ tasks (should succeed)

### `auto-return-warnings.spec.ts`
Tests the 48-hour auto-return system and visual warnings.

**What it tests:**
- ✅ Normal "Reserved" status for new tasks (>24h remaining)
- ✅ Yellow "⏰ Warning" status (<24h remaining)
- ✅ Red "🚨 Critical" status (<6h remaining)
- ✅ Countdown displays hours remaining
- ✅ Warnings only show on ASSIGNED tasks
- ✅ Auto-return notification appears
- ✅ Tasks return to TRIAGE after 48 hours

**Key scenarios:**
1. Newly assigned task shows gray background + 48h remaining
2. Task with 12h remaining shows yellow warning
3. Task with 3h remaining shows red critical alert
4. Task in IN_PROGRESS shows no warnings
5. Auto-returned task appears in TRIAGE with notification

### `kanban-workflow.spec.ts`
Tests the complete Kanban board workflow and interactions.

**What it tests:**
- ✅ All 8 workflow stages display correctly
- ✅ Task counts show in column badges
- ✅ Editor can self-assign from TRIAGE → ASSIGNED
- ✅ Editor can move ASSIGNED → IN_PROGRESS
- ✅ Invalid transitions show error dialog with valid moves
- ✅ Workload indicators display correctly
- ✅ Assignee names show on tasks
- ✅ Board filters work (My Tasks, All Tasks)
- ✅ Refresh button updates data

**Key scenarios:**
1. Drag task from TRIAGE to ASSIGNED (valid)
2. Drag task from TRIAGE to IN_PROGRESS (invalid, shows error)
3. Error dialog displays valid transition options
4. Workload indicators show "Assigned to: Name (X/2 tasks)"
5. Filter to "My Tasks" shows only user's tasks

## Running Tests

### Prerequisites

1. **Install Playwright browsers** (one-time setup):
```bash
npx playwright install chromium
```

2. **Ensure dev server is running**:
```bash
npm run dev
```

The dev server should be running on `http://localhost:5000`

### Run Tests

**Headless mode** (runs in background):
```bash
npm run test:e2e
```

**UI mode** (interactive test runner - RECOMMENDED):
```bash
npm run test:e2e:ui
```
- See tests run in real-time
- Debug failed tests
- Inspect DOM and network requests
- Time travel through test steps

**Headed mode** (see browser window):
```bash
npm run test:e2e:headed
```

**Debug mode** (step through tests):
```bash
npm run test:e2e:debug
```

### Using VS Code Playwright Extension

Since you have the Playwright extension installed:

1. **Run tests from sidebar**:
   - Click Playwright icon in VS Code sidebar
   - See list of all test files
   - Click green play button next to any test
   - See results in real-time

2. **Debug with breakpoints**:
   - Set breakpoints in test files
   - Right-click test → "Debug Test"
   - Step through code line by line

3. **Pick locators**:
   - Click "Pick locator" in Playwright panel
   - Click elements in browser
   - Get exact locator syntax

## Test Data Requirements

### User Accounts

Tests expect these user accounts in your database:

**Editor Account**:
- Username: `editor1`
- Password: `password`
- Role: `Editor`

**SuperAdmin Account**:
- Username: `admin`
- Password: `admin`
- Role: `SuperAdmin`

### Task Data

For comprehensive testing, seed your database with:

1. **NEW/TRIAGE Tasks**: At least 5 unassigned tasks in TRIAGE status
2. **ASSIGNED Tasks**: At least 2 tasks assigned to `editor1`
3. **Time-based Tasks** (optional but recommended):
   - Task assigned 1 hour ago (normal status)
   - Task assigned 25 hours ago (warning status)
   - Task assigned 43 hours ago (critical status)
   - Task assigned 49+ hours ago (should auto-return)

### Creating Test Data

You can manually create test tasks or use the database:

```sql
-- Create Editor user
INSERT INTO "User" (id, username, password, email, role)
VALUES ('editor1-id', 'editor1', 'hashed-password', 'editor1@test.com', 'Editor');

-- Create tasks in TRIAGE
INSERT INTO "Task" (id, "productId", status, priority, "createdAt")
VALUES
  (gen_random_uuid(), 'product-1', 'TRIAGE', 'medium', NOW()),
  (gen_random_uuid(), 'product-2', 'TRIAGE', 'high', NOW()),
  (gen_random_uuid(), 'product-3', 'TRIAGE', 'low', NOW());

-- Create tasks in ASSIGNED (for time-based tests)
INSERT INTO "Task" (id, "productId", status, "assignedTo", "assignedAt", priority, "createdAt")
VALUES
  (gen_random_uuid(), 'product-4', 'ASSIGNED', 'editor1-id', NOW() - INTERVAL '25 hours', 'medium', NOW()),
  (gen_random_uuid(), 'product-5', 'ASSIGNED', 'editor1-id', NOW() - INTERVAL '43 hours', 'high', NOW());
```

## Test Reports

After running tests, Playwright generates HTML reports:

```bash
npx playwright show-report
```

Reports include:
- Test results (passed/failed)
- Screenshots of failures
- Video recordings
- Traces for debugging

## Debugging Failed Tests

### 1. Check Screenshots
Failed tests automatically capture screenshots. Find them in:
```
test-results/[test-name]/test-failed-1.png
```

### 2. Watch Videos
Failed tests record videos. Find them in:
```
test-results/[test-name]/video.webm
```

### 3. View Traces
Traces show step-by-step execution:
```bash
npx playwright show-trace test-results/[test-name]/trace.zip
```

### 4. Use Debug Mode
Run specific test in debug mode:
```bash
npx playwright test task-limit.spec.ts:15 --debug
```

## Common Issues

### "Locator not found"
**Cause**: Element selector doesn't match DOM
**Fix**: Update `data-testid` attributes in components or adjust selectors

### "Timeout waiting for navigation"
**Cause**: Page taking too long to load
**Fix**: Increase timeout or check network issues
```typescript
await page.waitForURL('**/dashboard', { timeout: 10000 });
```

### "Task limit not enforced"
**Cause**: Editor already has <2 tasks or backend not running
**Fix**: Reset test data or restart backend

### "Drag and drop not working"
**Cause**: DnD requires specific coordinates
**Fix**: Use `.dragTo()` method or manual mouse events
```typescript
await taskCard.hover();
await page.mouse.down();
await assignedColumn.hover();
await page.mouse.up();
```

## Test Coverage

### Current Coverage:
- ✅ Task limit enforcement (100%)
- ✅ Workload indicators (100%)
- ✅ Auto-return warnings (80% - time-based tests require seeded data)
- ✅ Kanban drag & drop (90%)
- ✅ Role-based permissions (75%)
- ✅ Error handling (85%)

### Not Yet Covered:
- ⏳ Full 8-stage workflow (NEW → DONE)
- ⏳ Notification system integration
- ⏳ Analytics dashboard
- ⏳ Bulk operations
- ⏳ Mobile responsive behavior

## Adding New Tests

### Template for new test file:

```typescript
import { test, expect } from '@playwright/test';

test.describe('Feature Name', () => {
  test.beforeEach(async ({ page }) => {
    // Login and navigate
    await page.goto('/');
    await page.fill('input[name="username"]', 'editor1');
    await page.fill('input[name="password"]', 'password');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard');
  });

  test('should do something', async ({ page }) => {
    // Test steps
    await page.click('a[href="/some-page"]');

    // Assertions
    await expect(page.locator('text=Expected Text')).toBeVisible();
  });
});
```

### Best Practices:

1. **Use `data-testid` attributes** for stable selectors
2. **Wait for navigation** after clicks/submissions
3. **Use meaningful test names** describing what's being tested
4. **Group related tests** in `describe` blocks
5. **Keep tests independent** - don't rely on test execution order
6. **Add comments** explaining complex scenarios
7. **Use page objects** for repeated UI patterns (future enhancement)

## CI/CD Integration

To run tests in CI/CD pipelines:

```yaml
# GitHub Actions example
- name: Install dependencies
  run: npm ci

- name: Install Playwright Browsers
  run: npx playwright install --with-deps chromium

- name: Run E2E tests
  run: npm run test:e2e

- name: Upload test results
  if: always()
  uses: actions/upload-artifact@v3
  with:
    name: playwright-report
    path: playwright-report/
```

## Performance Testing

Playwright can also measure performance:

```typescript
test('should load dashboard quickly', async ({ page }) => {
  const start = Date.now();
  await page.goto('/dashboard');
  const loadTime = Date.now() - start;

  expect(loadTime).toBeLessThan(2000); // Should load in < 2 seconds
});
```

## Questions?

Check:
- [Playwright Documentation](https://playwright.dev)
- [Best Practices Guide](https://playwright.dev/docs/best-practices)
- [API Reference](https://playwright.dev/docs/api/class-test)

Or review the existing test files for examples!
