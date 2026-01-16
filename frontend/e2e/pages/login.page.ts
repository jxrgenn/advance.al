/**
 * Login Page Object Model
 *
 * Encapsulates login page elements and interactions
 */

import { Page, Locator, expect } from '@playwright/test';

export class LoginPage {
  readonly page: Page;

  // Locators
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly loginButton: Locator;
  readonly registerTab: Locator;
  readonly errorToast: Locator;
  readonly successToast: Locator;

  // Registration form locators
  readonly firstNameInput: Locator;
  readonly lastNameInput: Locator;
  readonly phoneInput: Locator;
  readonly citySelect: Locator;
  readonly registerButton: Locator;
  readonly userTypeJobseeker: Locator;
  readonly userTypeEmployer: Locator;

  constructor(page: Page) {
    this.page = page;

    // Login form
    this.emailInput = page.locator('input[name="email"], input[type="email"]');
    this.passwordInput = page.locator('input[name="password"], input[type="password"]');
    this.loginButton = page.getByRole('button', { name: /hyr|login/i });

    // Tabs
    this.registerTab = page.getByRole('tab', { name: /regjistrohu|register/i });

    // Toasts/Notifications
    this.errorToast = page.locator('.error-toast, [role="alert"]');
    this.successToast = page.locator('.success-toast, [role="status"]');

    // Registration form
    this.firstNameInput = page.locator('input[name="firstName"]');
    this.lastNameInput = page.locator('input[name="lastName"]');
    this.phoneInput = page.locator('input[name="phone"]');
    this.citySelect = page.locator('select[name="city"], [name="city"]');
    this.registerButton = page.getByRole('button', { name: /regjistrohu|register/i });
    this.userTypeJobseeker = page.locator('[value="jobseeker"], input[type="radio"][value="jobseeker"]');
    this.userTypeEmployer = page.locator('[value="employer"], input[type="radio"][value="employer"]');
  }

  /**
   * Navigate to login page
   */
  async goto() {
    await this.page.goto('/login');
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Perform login
   */
  async login(email: string, password: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.loginButton.click();
  }

  /**
   * Switch to registration tab
   */
  async switchToRegister() {
    await this.registerTab.click();
    await this.page.waitForTimeout(500); // Wait for tab animation
  }

  /**
   * Register as jobseeker
   */
  async registerJobseeker(data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    phone: string;
    city: string;
  }) {
    // Select jobseeker type if radio buttons exist
    if (await this.userTypeJobseeker.isVisible({ timeout: 1000 }).catch(() => false)) {
      await this.userTypeJobseeker.check();
    }

    await this.emailInput.fill(data.email);
    await this.passwordInput.fill(data.password);
    await this.firstNameInput.fill(data.firstName);
    await this.lastNameInput.fill(data.lastName);
    await this.phoneInput.fill(data.phone);
    await this.citySelect.selectOption(data.city);

    await this.registerButton.click();
  }

  /**
   * Wait for successful login (redirect)
   */
  async waitForLoginSuccess() {
    await this.page.waitForURL('/', { timeout: 10000 });
  }

  /**
   * Check if error message is displayed
   */
  async expectError(message?: string) {
    await expect(this.errorToast).toBeVisible({ timeout: 5000 });
    if (message) {
      await expect(this.errorToast).toContainText(message);
    }
  }

  /**
   * Check if success message is displayed
   */
  async expectSuccess(message?: string) {
    await expect(this.successToast).toBeVisible({ timeout: 5000 });
    if (message) {
      await expect(this.successToast).toContainText(message);
    }
  }

  /**
   * Check if user menu is visible (logged in state)
   */
  async expectLoggedIn() {
    await expect(this.page.locator('[aria-label="User menu"], [data-testid="user-menu"]')).toBeVisible({
      timeout: 5000
    });
  }

  /**
   * Check if still on login page
   */
  async expectOnLoginPage() {
    await expect(this.page).toHaveURL(/\/login/);
  }
}
