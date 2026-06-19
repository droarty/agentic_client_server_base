import * as fs from 'fs';
import * as path from 'path';

const SS_DIR = '.claude/skills/run-multiplayer-base/screenshots';
const EMAIL = `smoke-${Date.now()}@example.com`;
const PASSWORD = 'password123';

async function screenshot(name: string) {
  fs.mkdirSync(SS_DIR, { recursive: true });
  await browser.saveScreenshot(path.join(SS_DIR, `${name}.png`));
}

describe('multiplayer-base smoke', () => {
  before(async () => {
    // Register a fresh user
    await browser.url('/register');
    await browser.waitUntil(async () => (await $('#email').isDisplayed()), { timeout: 8000 });
    await $('#email').setValue(EMAIL);
    await $('#password').setValue(PASSWORD);
    await $('#confirmPassword').setValue(PASSWORD);
    await $('button[type="submit"]').click();
    await browser.waitUntil(
      async () => (await browser.getUrl()).includes('/dashboard'),
      { timeout: 10000, timeoutMsg: 'expected redirect to /dashboard after register' }
    );
  });

  it('lands on dashboard after register', async () => {
    expect(await browser.getUrl()).toContain('/dashboard');
    await screenshot('01-dashboard-after-register');
  });

  it('can logout and log back in', async () => {
    await browser.execute(() => localStorage.clear());
    await browser.url('/login');
    await browser.waitUntil(async () => (await $('#email').isDisplayed()), { timeout: 8000 });
    await $('#email').setValue(EMAIL);
    await $('#password').setValue(PASSWORD);
    await $('button[type="submit"]').click();
    await browser.waitUntil(
      async () => (await browser.getUrl()).includes('/dashboard'),
      { timeout: 10000, timeoutMsg: 'expected redirect to /dashboard after login' }
    );
    await screenshot('02-dashboard-after-login');
  });

  it('user dashboard loads with tabs', async () => {
    await browser.url('/dashboard/user');
    await browser.waitUntil(
      async () => {
        const tabs = await $$('[role="tab"]');
        return tabs.length > 0;
      },
      { timeout: 8000, timeoutMsg: 'expected user dashboard tabs to load' }
    );
    await screenshot('03-user-dashboard');
  });
});
