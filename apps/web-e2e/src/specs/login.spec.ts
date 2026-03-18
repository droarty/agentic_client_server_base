import { loginPage } from '../pageobjects/login.page';
import { registerPage } from '../pageobjects/register.page';

const TEST_EMAIL = `e2e-login-${Date.now()}@example.com`;
const TEST_PASSWORD = 'password123';

describe('Login Page', () => {
  before(async () => {
    // Register a user first
    await registerPage.open();
    await registerPage.register(TEST_EMAIL, TEST_PASSWORD, TEST_PASSWORD);
    // Wait for redirect to dashboard
    await browser.waitUntil(
      async () => (await browser.getUrl()).includes('/dashboard'),
      { timeout: 10000, timeoutMsg: 'Expected redirect to dashboard after register' }
    );
    // Log out by clearing localStorage and navigating to login
    await browser.execute(() => localStorage.clear());
  });

  it('should display the login form', async () => {
    await loginPage.open();
    await expect(loginPage.emailInput).toBeDisplayed();
    await expect(loginPage.passwordInput).toBeDisplayed();
    await expect(loginPage.submitButton).toBeDisplayed();
  });

  it('should show an error with invalid credentials', async () => {
    await loginPage.open();
    await loginPage.login(TEST_EMAIL, 'wrongpassword');
    await loginPage.errorMessage.waitForDisplayed({ timeout: 5000 });
    await expect(loginPage.errorMessage).toBeDisplayed();
  });

  it('should redirect to dashboard on successful login', async () => {
    await loginPage.open();
    await loginPage.login(TEST_EMAIL, TEST_PASSWORD);
    await browser.waitUntil(
      async () => (await browser.getUrl()).includes('/dashboard'),
      { timeout: 10000, timeoutMsg: 'Expected redirect to dashboard after login' }
    );
    expect(await browser.getUrl()).toContain('/dashboard');
  });

  it('should navigate to register page', async () => {
    await loginPage.open();
    const registerLink = await $('a[href="/register"]');
    await registerLink.click();
    await browser.waitUntil(
      async () => (await browser.getUrl()).includes('/register'),
      { timeout: 5000 }
    );
    expect(await browser.getUrl()).toContain('/register');
  });
});
