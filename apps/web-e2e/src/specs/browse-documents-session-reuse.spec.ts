import * as fs from 'fs';
import * as path from 'path';

const SS_DIR = path.join(__dirname, '../../../../.claude/skills/run-agentic-client-server-base/screenshots');
const EMAIL = `session-reuse-${Date.now()}@example.com`;
const PASSWORD = 'password123';
const GROUP_NAME = `Reuse Group ${Date.now()}`;
const GROUP_DOC_NAME = `Group Doc ${Date.now()}`;
const PERSONAL_DOC_NAME = `Personal Doc ${Date.now()}`;

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

// Reproduces the exact ordering that exposed the session-channel groupId
// scoping bug: a group-scoped "browse-documents-workflow" session channel is
// created FIRST (no groupless session channel exists yet), then the personal
// user-dashboard opens "Browse All Documents" second. Under the old buggy
// getOrCreateWorkflowSession query (`if (groupId) query.groupId = ...`), the
// personal lookup omitted the groupId key entirely and matched the group's
// session channel via findOne, silently reusing its (wrong) groupId scope.
describe('browse-documents-workflow session channel is not reused across group/personal contexts', () => {
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
  });

  it('group dashboard Browse All Documents creates the FIRST session channel (group-scoped)', async () => {
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

    await browser.url(`/group/${groupId}`);
    await browser.pause(1500);
    await screenshot('reuse-01-group-dashboard');

    await clickSidebarLink('Create New Document');
    await browser.pause(1000);
    const input = await $('input.doc-create-input');
    await input.waitForDisplayed({ timeout: 6000 });
    await input.setValue(GROUP_DOC_NAME);
    await $('form.doc-create-form button[type="submit"]').click();
    await browser.pause(2000);
    await browser.waitUntil(
      async () => (await browser.getPageSource()).includes(GROUP_DOC_NAME),
      { timeout: 8000, timeoutMsg: `expected "${GROUP_DOC_NAME}" to appear in group sidebar` }
    );
    await screenshot('reuse-02-group-doc-created');

    // First-ever open of Browse All Documents anywhere in this account —
    // creates the group-scoped session channel.
    await clickSidebarLink('Browse All Documents');
    await browser.pause(1500);
    await waitForText(GROUP_DOC_NAME, 8000);
    await screenshot('reuse-03-group-browse-shows-group-doc');
  });

  it('personal user-dashboard Browse All Documents (opened SECOND) must not reuse the group session', async () => {
    await browser.url('/user');
    await browser.pause(1500);
    await screenshot('reuse-04-user-dashboard');

    await clickSidebarLink('Create New Document');
    await browser.pause(1000);
    const input = await $('input.doc-create-input');
    await input.waitForDisplayed({ timeout: 6000 });
    await input.setValue(PERSONAL_DOC_NAME);
    await $('form.doc-create-form button[type="submit"]').click();
    await browser.pause(2000);
    await browser.waitUntil(
      async () => (await browser.getPageSource()).includes(PERSONAL_DOC_NAME),
      { timeout: 8000, timeoutMsg: `expected "${PERSONAL_DOC_NAME}" to appear in user sidebar` }
    );
    await screenshot('reuse-05-personal-doc-created');

    // This is the call that exercises the bug: the session-channel lookup
    // must scope to groupId-absent, not silently match the group's channel.
    await clickSidebarLink('Browse All Documents');
    await browser.pause(1500);
    await screenshot('reuse-06-personal-browse-result');

    await waitForText(PERSONAL_DOC_NAME, 8000);
    const src = await browser.getPageSource();
    expect(src).not.toContain(GROUP_DOC_NAME);
  });
});
