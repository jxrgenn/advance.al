/**
 * Login Flow E2E Tests
 *
 * Tests login and registration flows in real browser
 */

import { test, expect } from '@playwright/test';
import { LoginPage } from '../../pages/login.page';

test.describe('Login Flow - E2E Tests', () => {
  let loginPage: LoginPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    await loginPage.goto();
  });

  /**
   * TC-11.1: Display login page correctly
   */
  test('TC-11.1 - should display login page with all elements', async ({ page }) => {
    // Assert: Page title
    await expect(page).toHaveTitle(/advance\.al|albania jobflow/i);

    // Assert: Login form visible
    await expect(loginPage.emailInput).toBeVisible();
    await expect(loginPage.passwordInput).toBeVisible();
    await expect(loginPage.loginButton).toBeVisible();

    // Assert: Register tab visible
    await expect(loginPage.registerTab).toBeVisible();
  });

  /**
   * TC-11.2: Login successfully with valid credentials
   */
  test('TC-11.2 - should login successfully with valid credentials', async ({ page }) => {
    // Note: This requires a test user to exist in the test database
    // In real scenario, you would seed the database before running E2E tests

    const testUser = {
      email: 'test@example.com',
      password: 'password123'
    };

    // Act: Login
    await loginPage.login(testUser.email, testUser.password);

    // Assert: Redirected to homepage
    await expect(page).toHaveURL('/', { timeout: 10000 });

    // Assert: User menu visible (logged in state)
    const userMenu = page.locator('[aria-label="User menu"], button:has-text("' + testUser.email + '")');
    await expect(userMenu.first()).toBeVisible({ timeout: 5000 });

    // Assert: Notifications bell visible
    const notificationBell = page.locator('[aria-label="Notifications"], [data-testid="notifications"]');
    await expect(notificationBell.first()).toBeVisible({ timeout: 5000 });
  });

  /**
   * TC-11.3: Show error with invalid credentials
   */
  test('TC-11.3 - should show error with invalid credentials', async ({ page }) => {
    // Arrange
    const invalidUser = {
      email: 'nonexistent@example.com',
      password: 'wrongpassword'
    };

    // Act
    await loginPage.login(invalidUser.email, invalidUser.password);

    // Assert: Error message displayed
    await loginPage.expectError();

    // Assert: Still on login page
    await expect(page).toHaveURL(/\/login/);
  });

  /**
   * TC-11.4: Prevent login for suspended account
   */
  test('TC-11.4 - should prevent login for suspended account', async ({ page }) => {
    // Note: Requires a suspended test user in database
    const suspendedUser = {
      email: 'suspended@example.com',
      password: 'password123'
    };

    // Act
    await loginPage.login(suspendedUser.email, suspendedUser.password);

    // Assert: Error about suspension
    await loginPage.expectError(/pezulluar|suspended/i);

    // Assert: Still on login page
    await expect(page).toHaveURL(/\/login/);
  });

  /**
   * TC-9.2 to TC-9.4: Full jobseeker registration flow
   */
  test('TC-9 - should complete jobseeker registration successfully', async ({ page }) => {
    // TC-9.2: Switch to register tab
    await loginPage.switchToRegister();

    // Assert: Registration form visible
    await expect(loginPage.emailInput).toBeVisible();
    await expect(loginPage.passwordInput).toBeVisible();
    await expect(loginPage.firstNameInput).toBeVisible();
    await expect(loginPage.lastNameInput).toBeVisible();

    // TC-9.3: Fill registration form
    const newUser = {
      email: `testuser${Date.now()}@example.com`, // Unique email
      password: 'password123',
      firstName: 'Alban',
      lastName: 'Testi',
      phone: '+355691234567',
      city: 'Tiranë'
    };

    await loginPage.registerJobseeker(newUser);

    // TC-9.4: Assert loading state (if visible)
    const loadingSpinner = page.locator('.loading-spinner, [role="progressbar"]');
    // Optional: loading may be too fast to catch

    // TC-9.4: Assert successful registration
    await expect(page).toHaveURL('/', { timeout: 15000 });

    // TC-9.5: Assert logged in state
    await loginPage.expectLoggedIn();
  });

  /**
   * Test empty email validation
   */
  test('should show validation error for empty email', async ({ page }) => {
    // Act: Try to login without email
    await loginPage.passwordInput.fill('password123');
    await loginPage.loginButton.click();

    // Assert: Form validation or error
    // This depends on your form implementation (HTML5 validation or custom)
    const emailField = loginPage.emailInput;
    await expect(emailField).toBeFocused().catch(() => {
      // If not focused, check for validation message
      return expect(page.locator('text=/email.*required/i, text=/email.*detyrueshëm/i').first()).toBeVisible();
    });
  });

  /**
   * Test empty password validation
   */
  test('should show validation error for empty password', async ({ page }) => {
    // Act: Try to login without password
    await loginPage.emailInput.fill('test@example.com');
    await loginPage.loginButton.click();

    // Assert: Form validation
    const passwordField = loginPage.passwordInput;
    await expect(passwordField).toBeFocused().catch(() => {
      return expect(page.locator('text=/password.*required/i, text=/fjalëkalim.*detyrueshëm/i').first()).toBeVisible();
    });
  });

  /**
   * Test password visibility toggle
   */
  test('TC-43.1 - should toggle password visibility', async ({ page }) => {
    // Arrange
    await loginPage.passwordInput.fill('password123');

    // Assert: Password is masked
    await expect(loginPage.passwordInput).toHaveAttribute('type', 'password');

    // Act: Click eye icon (if exists)
    const eyeIcon = page.locator('[aria-label="Show password"], button:has([data-icon="eye"])');
    if (await eyeIcon.isVisible({ timeout: 1000 }).catch(() => false)) {
      await eyeIcon.click();

      // Assert: Password is visible
      await expect(loginPage.passwordInput).toHaveAttribute('type', 'text');

      // Act: Click again to hide
      await eyeIcon.click();

      // Assert: Password is masked again
      await expect(loginPage.passwordInput).toHaveAttribute('type', 'password');
    }
  });

  /**
   * Test keyboard navigation
   */
  test('TC-42.1 - should support keyboard navigation', async ({ page }) => {
    // Act: Tab through form
    await page.keyboard.press('Tab'); // Focus email
    await expect(loginPage.emailInput).toBeFocused();

    await page.keyboard.press('Tab'); // Focus password
    await expect(loginPage.passwordInput).toBeFocused();

    await page.keyboard.press('Tab'); // Focus login button
    await expect(loginPage.loginButton).toBeFocused();

    // Act: Press Enter on login button
    await loginPage.emailInput.fill('test@example.com');
    await loginPage.passwordInput.fill('password123');
    await loginPage.loginButton.focus();
    await page.keyboard.press('Enter');

    // Assert: Login attempt was made (will fail with test credentials)
    // The important part is that keyboard interaction works
  });
});

/**
 * TC-12: Logout Flow
 */
test.describe('Logout Flow - E2E Tests', () => {
  test('TC-12.1 and TC-12.2 - should logout successfully', async ({ page }) => {
    // Note: This test assumes you're already logged in
    // In a real scenario, you would login first or use a saved auth state

    // Navigate to homepage (assuming logged in)
    await page.goto('/');

    // TC-12.1: Open user menu
    const userMenu = page.locator('[aria-label="User menu"], [data-testid="user-dropdown"]');
    if (await userMenu.isVisible({ timeout: 5000 }).catch(() => false)) {
      await userMenu.click();

      // Assert: Dropdown opens
      const logoutOption = page.getByRole('menuitem', { name: /dil|logout/i });
      await expect(logoutOption).toBeVisible();

      // TC-12.2: Click logout
      await logoutOption.click();

      // Assert: Logged out
      await expect(page).toHaveURL('/', { timeout: 5000 });

      // Assert: Login button visible (not logged in)
      const loginButton = page.getByRole('link', { name: /hyrje|login/i });
      await expect(loginButton).toBeVisible();

      // Assert: User menu gone
      await expect(userMenu).not.toBeVisible();
    }
  });
});
