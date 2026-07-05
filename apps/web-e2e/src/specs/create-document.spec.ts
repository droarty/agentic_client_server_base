import * as fs from 'fs';
import * as path from 'path';

const SS_DIR = path.join(__dirname, '../../../../.claude/skills/run-agentic-client-server-base/screenshots');
const EMAIL = 'verify-group-1783184056@example.com';
const PASSWORD = 'password123';
const GROUP_ID = '6a493ab9a4e568c9909ca0b8';
const DOC_NAME = `Test Document ${Date.now()}`;

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

describe('create-new-document workflow', () => {
  before(async () => {
    await browser.url('/login');
    await browser.waitUntil(async () => (await $('#email').isDisplayed()), { timeout: 8000 });
    await $('#email').setValue(EMAIL);
    await $('#password').setValue(PASSWORD);
    await $('button[type="submit"]').click();
    await browser.waitUntil(
      async () => (await browser.getUrl()).includes('/user'),
      { timeout: 10000, timeoutMsg: 'expected redirect to /user after login' }
    );
  });

  it('group dashboard loads', async () => {
    await browser.url(`/group/${GROUP_ID}`);
    await waitForText('My Groups', 8000);
    await screenshot('01-group-dashboard-doc');
  });

  it('clicking Create New Document shows form in nested panel', async () => {
    await browser.waitUntil(
      async () => {
        const text = await browser.execute(() => document.body.innerText);
        return (text as string).includes('Create New Document');
      },
      { timeout: 8000, timeoutMsg: 'expected Create New Document in sidebar' }
    );

    const createDocEl = await $('button.smenu-link*=Create New Document');
    await createDocEl.waitForClickable({ timeout: 5000 });
    await createDocEl.click();
    await browser.pause(1500);
    await screenshot('02-after-click-create-new-document');

    await $('input.doc-create-input').waitForDisplayed({ timeout: 6000 });
    await screenshot('03-create-document-form-visible');
  });

  it('submitting a name creates the document and closes the form', async () => {
    const input = await $('input.doc-create-input');
    await input.waitForDisplayed({ timeout: 5000 });
    await input.setValue(DOC_NAME);

    const btn = await $('form.doc-create-form button[type="submit"]');
    await btn.click();
    await browser.pause(2000);
    await screenshot('04-after-submit-doc');

    // Form should close: the input field should no longer be displayed
    await browser.waitUntil(
      async () => {
        const inputs = await $$('input.doc-create-input');
        if (inputs.length === 0) return true;
        return !(await inputs[0].isDisplayed());
      },
      { timeout: 8000, timeoutMsg: 'expected form to close after document creation' }
    );
    await screenshot('05-form-closed-doc');
  });

  it('new document appears in sidebar after creation', async () => {
    await browser.waitUntil(
      async () => {
        const buttons = await $$('button.smenu-link');
        for (const btn of buttons) {
          const text = await btn.getText();
          if (text.includes(DOC_NAME)) return true;
        }
        return false;
      },
      { timeout: 8000, timeoutMsg: `expected "${DOC_NAME}" to appear in sidebar` }
    );
    await screenshot('06-document-in-sidebar');
  });
});
