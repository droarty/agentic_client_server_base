import * as fs from 'fs';
import * as path from 'path';

const SS_DIR = '.claude/skills/run-agentic-client-server-base/screenshots';
const EMAIL = `smoke-${Date.now()}@example.com`;
const PASSWORD = 'password123';

async function screenshot(name: string) {
  fs.mkdirSync(SS_DIR, { recursive: true });
  await browser.saveScreenshot(path.join(SS_DIR, `${name}.png`));
}

describe('agentic-client-server-base smoke', () => {
  before(async () => {
    // Register a fresh user
    await browser.url('/register');
    await browser.waitUntil(async () => (await $('#email').isDisplayed()), { timeout: 8000 });
    await $('#email').setValue(EMAIL);
    await $('#password').setValue(PASSWORD);
    await $('#confirmPassword').setValue(PASSWORD);
    await $('button[type="submit"]').click();
    await browser.waitUntil(
      async () => (await browser.getUrl()).includes('/user'),
      { timeout: 10000, timeoutMsg: 'expected redirect to /user after register' }
    );
  });

  it('lands on /user after register', async () => {
    expect(await browser.getUrl()).toContain('/user');
    await screenshot('01-user-dash-after-register');
  });

  it('can logout and log back in', async () => {
    await browser.execute(() => localStorage.clear());
    await browser.url('/login');
    await browser.waitUntil(async () => (await $('#email').isDisplayed()), { timeout: 8000 });
    await $('#email').setValue(EMAIL);
    await $('#password').setValue(PASSWORD);
    await $('button[type="submit"]').click();
    await browser.waitUntil(
      async () => (await browser.getUrl()).includes('/user'),
      { timeout: 10000, timeoutMsg: 'expected redirect to /user after login' }
    );
    await screenshot('02-user-dash-after-login');
  });

  it('user dashboard loads welcome text', async () => {
    await browser.url('/user');
    await browser.waitUntil(
      async () => {
        const text = await browser.execute(() => document.body.innerText);
        return text.includes('Welcome to your dashboard.');
      },
      { timeout: 8000, timeoutMsg: 'expected user dashboard welcome text to load' }
    );
    await screenshot('03-user-dashboard');
  });
});
