import { registerPage } from '../pageobjects/register.page';

describe('Register Page', () => {
  it('should display the registration form', async () => {
    await registerPage.open();
    await expect(registerPage.emailInput).toBeDisplayed();
    await expect(registerPage.passwordInput).toBeDisplayed();
    await expect(registerPage.confirmPasswordInput).toBeDisplayed();
    await expect(registerPage.submitButton).toBeDisplayed();
  });

  it('should show error when passwords do not match', async () => {
    await registerPage.open();
    await registerPage.register('test@example.com', 'password123', 'differentpassword');
    await registerPage.errorMessage.waitForDisplayed({ timeout: 5000 });
    await expect(registerPage.errorMessage).toBeDisplayed();
    const text = await registerPage.errorMessage.getText();
    expect(text).toContain('Passwords do not match');
  });

  it('should redirect to dashboard on successful registration', async () => {
    const uniqueEmail = `e2e-reg-${Date.now()}@example.com`;
    await registerPage.open();
    await registerPage.register(uniqueEmail, 'password123', 'password123');
    await browser.waitUntil(
      async () => (await browser.getUrl()).includes('/dashboard'),
      { timeout: 10000, timeoutMsg: 'Expected redirect to dashboard after registration' }
    );
    expect(await browser.getUrl()).toContain('/dashboard');
    // Clean up
    await browser.execute(() => localStorage.clear());
  });

  it('should show error when email is already registered', async () => {
    const email = `e2e-dupe-${Date.now()}@example.com`;
    // Register once
    await registerPage.open();
    await registerPage.register(email, 'password123', 'password123');
    await browser.waitUntil(
      async () => (await browser.getUrl()).includes('/dashboard'),
      { timeout: 10000 }
    );
    await browser.execute(() => localStorage.clear());

    // Try to register again with same email
    await registerPage.open();
    await registerPage.register(email, 'password123', 'password123');
    await registerPage.errorMessage.waitForDisplayed({ timeout: 5000 });
    await expect(registerPage.errorMessage).toBeDisplayed();
  });

  it('should navigate to login page', async () => {
    await registerPage.open();
    const loginLink = await $('a[href="/login"]');
    await loginLink.click();
    await browser.waitUntil(
      async () => (await browser.getUrl()).includes('/login'),
      { timeout: 5000 }
    );
    expect(await browser.getUrl()).toContain('/login');
  });
});
