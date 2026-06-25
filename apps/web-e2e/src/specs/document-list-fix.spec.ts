import * as fs from 'fs';
import * as path from 'path';

const SS_DIR = '.claude/skills/run-agentic-client-server-base/screenshots';
const EMAIL = `doclist-${Date.now()}@example.com`;
const PASSWORD = 'password123';
const DOC_NAME = 'Verification Doc';

async function screenshot(name: string) {
  fs.mkdirSync(SS_DIR, { recursive: true });
  await browser.saveScreenshot(path.join(SS_DIR, `${name}.png`));
}

describe('document list _id fix', () => {
  before(async () => {
    // Register via UI
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

    // Navigate to user dashboard
    await browser.url('/dashboard/user');
    await browser.pause(2000); // let WebSocket stabilise

    // Create one document via the UI form
    await browser.waitUntil(
      async () => (await $('input.doc-create-input').isDisplayed()),
      { timeout: 8000, timeoutMsg: 'doc-create-input not visible' }
    );
    await $('input.doc-create-input').setValue(DOC_NAME);
    await $('button[type="submit"]').click();

    // Wait for the document name to appear anywhere on the page (list or opened tab)
    await browser.waitUntil(
      async () => (await browser.getPageSource()).includes(DOC_NAME),
      { timeout: 10000, timeoutMsg: `"${DOC_NAME}" never appeared after creation` }
    );
    await screenshot('00-after-create');
  });

  it('document list shows item without [object Object] key warning', async () => {
    // Navigate back to user dashboard to see the document list
    await browser.url('/dashboard/user');
    await browser.pause(2000);
    await screenshot('01-document-list');

    // The created doc should appear in the list
    const src = await browser.getPageSource();
    expect(src).toContain(DOC_NAME);

    // React duplicate-key warning fires as console.error — appears in browser logs
    const logs = await browser.getLogs('browser');
    const objectObjectWarnings = logs.filter(
      (l: { message: string }) => l.message.includes('[object Object]')
    );

    if (objectObjectWarnings.length > 0) {
      console.log('BAD LOGS:', JSON.stringify(objectObjectWarnings, null, 2));
    }

    expect(objectObjectWarnings).toHaveLength(0);
  });

  it('document list item has an Open button that works without [object Object] errors', async () => {
    // The doc opened automatically — click Dashboard tab to show the list
    const dashboardTab = await $('[role="tab"]=Dashboard');
    await dashboardTab.click();

    await browser.waitUntil(
      async () => (await $('.doc-open-btn').isExisting()),
      { timeout: 8000, timeoutMsg: '.doc-open-btn not found after switching to Dashboard tab' }
    );

    const openBtn = await $('.doc-open-btn');
    await openBtn.click();
    await browser.pause(2000);
    await screenshot('02-after-open');

    const logs = await browser.getLogs('browser');
    const badLogs = logs.filter(
      (l: { message: string }) => l.message.includes('[object Object]')
    );
    expect(badLogs).toHaveLength(0);
  });
});
