import * as fs from 'fs';
import * as path from 'path';

const SCREENSHOT_DIR = path.join(__dirname, '../../../../.claude/skills/run-agentic-client-server-base/screenshots');

async function screenshot(name: string) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  await browser.saveScreenshot(path.join(SCREENSHOT_DIR, `${name}.png`));
}

describe('/dev component library', () => {
  it('renders the two-panel layout and first mock', async () => {
    await browser.url('http://localhost:4200/dev');
    await browser.pause(800);
    await screenshot('dev-page-initial');

    const nav = await $('nav');
    expect(await nav.isDisplayed()).toBe(true);

    const header = await $('nav p');
    expect(await header.getText()).toContain('Component Library');
  });

  it('switches to SidebarMenu collapsible and toggles children', async () => {
    const buttons = await $$('nav button');
    let collapsibleBtn: WebdriverIO.Element | null = null;
    for (const btn of buttons) {
      if ((await btn.getText()).includes('Collapsible groups')) {
        collapsibleBtn = btn;
        break;
      }
    }
    expect(collapsibleBtn).not.toBeNull();
    await collapsibleBtn!.click();
    await browser.pause(400);
    await screenshot('dev-page-sidebar-selected');

    const allSMenuLinks = await $$('.smenu-link');
    let projectsLink: WebdriverIO.Element | null = null;
    for (const link of allSMenuLinks) {
      if ((await link.getText()).includes('Projects')) {
        projectsLink = link;
        break;
      }
    }
    expect(projectsLink).not.toBeNull();
    await projectsLink!.click();
    await browser.pause(300);
    await screenshot('dev-page-sidebar-open');

    const openChildren = await $('.smenu-children--open');
    expect(await openChildren.isDisplayed()).toBe(true);
  });
});
