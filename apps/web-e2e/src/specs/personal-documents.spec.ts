import * as fs from 'fs';
import * as path from 'path';

const SS_DIR = path.join(__dirname, '../../../../.claude/skills/run-agentic-client-server-base/screenshots');
const EMAIL = `personal-docs-${Date.now()}@example.com`;
const PASSWORD = 'password123';
const PERSONAL_DOC_NAME = `Personal Doc ${Date.now()}`;
const GROUP_NAME = `Test Group ${Date.now()}`;
const GROUP_DOC_NAME = `Group Doc ${Date.now()}`;

async function screenshot(name: string) {
  fs.mkdirSync(SS_DIR, { recursive: true });
  await browser.saveScreenshot(path.join(SS_DIR, `${name}.png`));
}

async function waitForText(text: string, timeout = 8000) {
  await browser.waitUntil(
    async () => {
      const body = await browser.execute(() => document.body.innerText);
      return (body as string).includes(text);
    },
    { timeout, timeoutMsg: `expected "${text}" in page` }
  );
}

async function clickSidebarLink(text: string) {
  const el = await $(`button.smenu-link*=${text}`);
  await el.waitForClickable({ timeout: 8000 });
  await el.click();
}

describe('personal (no-group) documents on user-dashboard', () => {
  before(async () => {
    await browser.url('/register');
    await browser.waitUntil(async () => (await $('#email').isDisplayed()), { timeout: 8000 });
    await $('#email').setValue(EMAIL);
    await $('#password').setValue(PASSWORD);
    await $('#confirmPassword').setValue(PASSWORD);
    await $('button[type="submit"]').click();
    await browser.waitUntil(
      async () => (await browser.getUrl()).includes('/user') || (await browser.getUrl()).includes('/dashboard'),
      { timeout: 10000, timeoutMsg: 'expected redirect after register' }
    );
    await browser.url('/user');
    await browser.pause(1500);
  });

  it('sidebar shows a My Documents section with Browse All Documents and Create New Document', async () => {
    await waitForText('My Documents', 8000);
    await waitForText('Browse All Documents');
    await waitForText('Create New Document');
    await waitForText('Groups');
    await screenshot('01-user-dashboard-sidebar');
  });

  it('Create New Document creates a personal document and it appears under My Documents', async () => {
    await clickSidebarLink('Create New Document');
    await browser.pause(1000);
    await screenshot('02-after-click-create-new-document');

    const input = await $('input.doc-create-input');
    await input.waitForDisplayed({ timeout: 6000 });
    await input.setValue(PERSONAL_DOC_NAME);

    const btn = await $('form.doc-create-form button[type="submit"]');
    await btn.click();
    await browser.pause(2000);
    await screenshot('03-after-submit-personal-doc');

    await browser.waitUntil(
      async () => {
        const buttons = await $$('button.smenu-link');
        for (const b of buttons) {
          const text = await b.getText();
          if (text.includes(PERSONAL_DOC_NAME)) return true;
        }
        return false;
      },
      { timeout: 8000, timeoutMsg: `expected "${PERSONAL_DOC_NAME}" to appear under My Documents` }
    );
    await screenshot('04-personal-doc-in-sidebar');
  });

  it('Browse All Documents lists the personal document', async () => {
    await clickSidebarLink('Browse All Documents');
    await browser.pause(1500);
    await waitForText('Browse All Documents', 8000);
    await waitForText(PERSONAL_DOC_NAME, 8000);
    await screenshot('05-browse-all-documents-personal');
  });

  it('group-owned documents do NOT show up in My Documents / Browse All Documents', async () => {
    // Create a top-level group directly via the REST API (no UI path exists for this
    // from user-dashboard today — group-dashboard's "Create New Group" only creates subgroups).
    const token = await browser.execute(() => window.localStorage.getItem('token'));
    const groupId = await browser.executeAsync((name: string, authToken: string, done: (id: string) => void) => {
      fetch('http://localhost:3000/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ name }),
      })
        .then((r) => r.json())
        .then((body) => done(body._id));
    }, GROUP_NAME, token as string);
    await screenshot('06-group-created-via-api');

    // Open the new group
    await browser.url(`/group/${groupId}`);
    await browser.pause(1500);
    await screenshot('08-group-dashboard');

    // Create a document inside the group
    await clickSidebarLink('Create New Document');
    await browser.pause(1000);
    const groupDocInput = await $('input.doc-create-input');
    await groupDocInput.waitForDisplayed({ timeout: 6000 });
    await groupDocInput.setValue(GROUP_DOC_NAME);
    const groupDocBtn = await $('form.doc-create-form button[type="submit"]');
    await groupDocBtn.click();
    await browser.pause(2000);
    await screenshot('09-group-doc-created');

    await browser.waitUntil(
      async () => {
        const buttons = await $$('button.smenu-link');
        for (const b of buttons) {
          const text = await b.getText();
          if (text.includes(GROUP_DOC_NAME)) return true;
        }
        return false;
      },
      { timeout: 8000, timeoutMsg: `expected "${GROUP_DOC_NAME}" to appear in group dashboard sidebar` }
    );
    await screenshot('10-group-doc-in-group-sidebar');

    // Regression check: group-dashboard's own Browse All Documents still shows the group doc
    await clickSidebarLink('Browse All Documents');
    await browser.pause(1500);
    await waitForText(GROUP_DOC_NAME, 8000);
    await screenshot('11-group-browse-all-shows-group-doc');

    // Back to user-dashboard: My Documents / Browse All Documents should NOT show the group doc
    await browser.url('/user');
    await browser.pause(1500);
    await screenshot('12-back-on-user-dashboard');

    const sidebarSrc = await browser.getPageSource();
    expect(sidebarSrc).not.toContain(GROUP_DOC_NAME);

    await clickSidebarLink('Browse All Documents');
    await browser.pause(1500);
    await waitForText(PERSONAL_DOC_NAME, 8000);
    await screenshot('13-user-browse-all-only-personal');

    const browseSrc = await browser.getPageSource();
    expect(browseSrc).not.toContain(GROUP_DOC_NAME);
    expect(browseSrc).toContain(PERSONAL_DOC_NAME);
  });
});
