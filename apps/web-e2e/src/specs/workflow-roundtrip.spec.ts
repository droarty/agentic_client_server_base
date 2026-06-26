import { documentPage } from '../pageobjects/document.page';

const EMAIL = `roundtrip-${Date.now()}@example.com`;
const PASSWORD = 'password123';
const DOC_NAME = `RoundTrip-${Date.now()}`;

describe('workflow config round-trip', () => {
  before(async () => {
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
    await browser.url('/dashboard/user');
    await browser.pause(2500);
  });

  it('dashboard layout renders from workflow config (defaultView + userManagementView handlers)', async () => {
    await documentPage.waitForLayout();

    const tabs = await documentPage.tabs;
    expect(tabs.length).toBeGreaterThan(0);

    const src = await browser.getPageSource();
    expect(src).toContain('Dashboard');
  });

  it('create-document workflow persists and emits update-state (document appears in list)', async () => {
    await documentPage.createDocument(DOC_NAME);

    const src = await browser.getPageSource();
    expect(src).toContain(DOC_NAME);

    const logs = await browser.getLogs('browser');
    const severeErrors = logs.filter((l: { level: string; message: string }) =>
      l.level === 'SEVERE' && !l.message.includes('favicon')
    );
    expect(severeErrors).toHaveLength(0);
  });

  it('select-document workflow adds a new tab (display-document-result handler)', async () => {
    const tabsBefore = (await documentPage.tabs).length;

    await documentPage.clickTab('Dashboard');
    await documentPage.openDocument();

    await documentPage.waitForTabCount(tabsBefore + 1);

    const src = await browser.getPageSource();
    expect(src).toContain(DOC_NAME);
  });

  it('close-tab workflow removes the tab (close-tab handler)', async () => {
    const tabsBefore = (await documentPage.tabs).length;

    await documentPage.closeTab(DOC_NAME);

    await browser.waitUntil(
      async () => (await $$('[role="tab"]')).length < tabsBefore,
      { timeout: 6000, timeoutMsg: 'tab count did not decrease after close-tab' }
    );

    const src = await browser.getPageSource();
    const tabTitles = await Promise.all((await documentPage.tabs).map((t) => t.getText()));
    expect(tabTitles).not.toContain(DOC_NAME);
  });
});
