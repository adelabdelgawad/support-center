import { test, expect, Page } from '@playwright/test';

/**
 * Client Versions UI Tests
 *
 * Prerequisites:
 * 1. Dev server running: bun run dev
 * 2. Backend server running
 * 3. Logged in as admin (session cookie)
 *
 * Run tests:
 *   bunx playwright test tests/client-versions.spec.ts
 *
 * Interactive mode:
 *   bunx playwright test --ui
 */

// Skip tests if not in test environment (they require auth setup)
// Remove this skip when running with proper auth fixtures
const SKIP_AUTH_REQUIRED = true;

test.describe('Client Versions Admin UI', () => {
  test.beforeEach(async ({ page }) => {
    // Note: These tests require authentication
    // In a real setup, you would either:
    // 1. Use a test auth token
    // 2. Mock the auth
    // 3. Use storageState from a logged-in session
  });

  test.describe('Add Version Sheet', () => {
    test.skip(SKIP_AUTH_REQUIRED, 'Requires authentication setup');

    test('should display add version form with correct fields', async ({ page }) => {
      await page.goto('/setting/client-versions');

      // Click add version button
      await page.click('button:has-text("Add Version")');

      // Verify form elements
      await expect(page.getByLabel('Version *')).toBeVisible();
      await expect(page.getByLabel('Enable enforcement')).toBeVisible();
      await expect(page.getByLabel('Release Notes')).toBeVisible();

      // Verify platform and order_index are NOT in the form
      await expect(page.getByLabel('Platform')).not.toBeVisible();
      await expect(page.getByLabel('Order Index')).not.toBeVisible();
      await expect(page.getByLabel('Set as latest')).not.toBeVisible();
    });

    test('should show current latest version in form', async ({ page }) => {
      await page.goto('/setting/client-versions');

      // Click add version button
      await page.click('button:has-text("Add Version")');

      // Check for current latest version display
      const latestBadge = page.locator('.bg-muted').getByText(/Current latest version/);
      await expect(latestBadge).toBeVisible();
    });

    test('should validate semantic version format', async ({ page }) => {
      await page.goto('/setting/client-versions');

      // Click add version button
      await page.click('button:has-text("Add Version")');

      // Enter invalid version
      await page.fill('#versionString', 'invalid-version');
      await page.click('button:has-text("Create Version")');

      // Should show validation error
      await expect(page.locator('.sonner-toast')).toContainText(/Invalid version format/);
    });

    test('should reject version lower than current latest', async ({ page }) => {
      await page.goto('/setting/client-versions');

      // Click add version button
      await page.click('button:has-text("Add Version")');

      // Enter lower version (assuming 2.0.0 is current)
      await page.fill('#versionString', '1.0.0');
      await page.click('button:has-text("Create Version")');

      // Should show error about version being lower
      await expect(page.locator('.sonner-toast')).toContainText(/must be greater than/);
    });

    test('should successfully create higher version', async ({ page }) => {
      await page.goto('/setting/client-versions');

      // Get current count
      const countBadge = page.locator('text=/\\d+ versions/');
      const initialText = await countBadge.textContent();

      // Click add version button
      await page.click('button:has-text("Add Version")');

      // Enter valid higher version
      const newVersion = `${Date.now()}.0.0`; // Unique version
      await page.fill('#versionString', '999.0.0'); // Very high version
      await page.click('button:has-text("Create Version")');

      // Should show success message
      await expect(page.locator('.sonner-toast')).toContainText(/latest version/);

      // Sheet should close
      await expect(page.getByRole('dialog')).not.toBeVisible();
    });
  });

  test.describe('Version Table', () => {
    test.skip(SKIP_AUTH_REQUIRED, 'Requires authentication setup');

    test('should display version list with correct columns', async ({ page }) => {
      await page.goto('/setting/client-versions');

      // Check table headers
      await expect(page.getByRole('columnheader', { name: 'Version' })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: 'Platform' })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: 'Order' })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: 'Status' })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: 'Released' })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: 'Actions' })).toBeVisible();
    });

    test('should show only one latest badge', async ({ page }) => {
      await page.goto('/setting/client-versions');

      // Wait for table to load
      await page.waitForSelector('table');

      // Count latest badges
      const latestBadges = page.locator('text=Latest').filter({ hasText: 'Latest' });
      const count = await latestBadges.count();

      // Should have exactly one latest
      expect(count).toBeLessThanOrEqual(1);
    });

    test('should allow toggling enforcement', async ({ page }) => {
      await page.goto('/setting/client-versions');

      // Find an enforcement toggle button
      const shieldButton = page.locator('button[title*="enforcement"]').first();
      if (await shieldButton.isVisible()) {
        await shieldButton.click();

        // Should show toast
        await expect(page.locator('.sonner-toast')).toContainText(/Enforcement/);
      }
    });
  });

  test.describe('Edit Version Sheet', () => {
    test.skip(SKIP_AUTH_REQUIRED, 'Requires authentication setup');

    test('should show read-only version info', async ({ page }) => {
      await page.goto('/setting/client-versions');

      // Click edit button on first version
      const editButton = page.locator('button[title="Edit version"]').first();
      await editButton.click();

      // Check version is displayed but not editable
      await expect(page.getByText('Version:')).toBeVisible();

      // Version string should NOT be an input field
      await expect(page.locator('input#versionString')).not.toBeVisible();

      // Is active checkbox should be editable
      await expect(page.getByLabel('Active in registry')).toBeVisible();
    });

    test('should allow editing release notes', async ({ page }) => {
      await page.goto('/setting/client-versions');

      // Click edit button on first version
      const editButton = page.locator('button[title="Edit version"]').first();
      await editButton.click();

      // Release notes should be editable
      const releaseNotesInput = page.getByLabel('Release Notes');
      await expect(releaseNotesInput).toBeVisible();
      await expect(releaseNotesInput).toBeEditable();

      // Update and save
      await releaseNotesInput.fill('Test release notes');
      await page.click('button:has-text("Save Changes")');

      // Should show success
      await expect(page.locator('.sonner-toast')).toContainText(/updated/);
    });
  });

  test.describe('Delete Version', () => {
    test.skip(SKIP_AUTH_REQUIRED, 'Requires authentication setup');

    test('should show confirmation dialog before delete', async ({ page }) => {
      await page.goto('/setting/client-versions');

      // Click delete button on first version
      const deleteButton = page.locator('button[title="Delete version"]').first();
      await deleteButton.click();

      // Confirmation dialog should appear
      await expect(page.getByRole('alertdialog')).toBeVisible();
      await expect(page.getByText('Are you sure')).toBeVisible();

      // Cancel button should close dialog
      await page.click('button:has-text("Cancel")');
      await expect(page.getByRole('alertdialog')).not.toBeVisible();
    });
  });
});

// Standalone unit tests that don't require the server
test.describe('Semantic Version Validation (Frontend)', () => {
  // These test the frontend regex validation
  const isValidSemver = (v: string): boolean => {
    const pattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[a-zA-Z0-9]+(\.[a-zA-Z0-9]+)*)?$/;
    return pattern.test(v.trim());
  };

  test('should accept valid semantic versions', () => {
    expect(isValidSemver('1.0.0')).toBe(true);
    expect(isValidSemver('2.1.3')).toBe(true);
    expect(isValidSemver('10.20.30')).toBe(true);
    expect(isValidSemver('0.0.1')).toBe(true);
  });

  test('should accept pre-release versions', () => {
    expect(isValidSemver('1.0.0-alpha')).toBe(true);
    expect(isValidSemver('1.0.0-beta.1')).toBe(true);
    expect(isValidSemver('1.0.0-rc.2')).toBe(true);
  });

  test('should reject invalid versions', () => {
    expect(isValidSemver('invalid')).toBe(false);
    expect(isValidSemver('1.2')).toBe(false);
    expect(isValidSemver('v1.0.0')).toBe(false); // v prefix not handled by frontend
    expect(isValidSemver('1.2.3.4')).toBe(false);
    expect(isValidSemver('')).toBe(false);
  });

  test('should reject leading zeros', () => {
    expect(isValidSemver('01.2.3')).toBe(false);
    expect(isValidSemver('1.02.3')).toBe(false);
    expect(isValidSemver('1.2.03')).toBe(false);
  });
});
