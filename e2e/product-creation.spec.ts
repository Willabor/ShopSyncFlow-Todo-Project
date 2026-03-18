import { test, expect } from '@playwright/test';

test('create new product flow', async ({ page }) => {
    // 1. Register a new test user (to ensure we have valid credentials)
    const username = `test_user_${Date.now()}`;
    const password = 'TestPassword123!';

    console.log(`Registering user: ${username}`);
    await page.goto('/auth');

    // Toggle to register mode if needed (assuming UI has a toggle)
    // Or try direct API registration first if UI is complex
    // Let's try UI interaction first

    // Check if we are on login or register
    const registerTab = page.getByRole('tab', { name: 'Register' });
    if (await registerTab.isVisible()) {
        await registerTab.click();
    }

    await page.fill('input[name="username"]', username);
    await page.fill('input[name="password"]', password);
    await page.click('button[type="submit"]');

    // Wait for navigation to dashboard or home
    await expect(page).toHaveURL('/');
    console.log('Login successful');

    // 2. Navigate to Product Creation
    // Assuming there's a "New Product" button or link
    // If not, we might need to go to /products/new or similar
    // Let's look for a "Products" link in navigation
    await page.click('a[href="/products"]');
    await expect(page).toHaveURL('/products');

    // Click "New Product" or similar button
    const newProductButton = page.getByRole('button', { name: /New Product|Add Product/i });
    await newProductButton.click();

    // 3. Fill Product Form
    const productTitle = `Test Product ${Date.now()}`;
    await page.fill('input[name="title"]', productTitle);
    await page.fill('textarea[name="description"]', 'This is a test product created by automation.');

    // Select vendor if dropdown exists
    // await page.selectOption('select[name="vendorId"]', { index: 0 });

    // 4. Submit
    await page.click('button[type="submit"]');

    // 5. Verify
    // Should redirect to product detail or show success message
    await expect(page.getByText('Product created successfully')).toBeVisible();
    console.log('Product creation verified');
});
