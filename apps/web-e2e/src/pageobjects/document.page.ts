import { BasePage } from './base.page';

export class DocumentPage extends BasePage {
  get docCreateInput() { return $('input.doc-create-input'); }
  get createSubmitBtn() { return $('button[type="submit"]'); }
  get docEmpty() { return $('.doc-empty'); }
  get docListItems() { return $$('.doc-list-item'); }
  get tabs() { return $$('[role="tab"]'); }

  async waitForLayout(timeout = 12000) {
    await browser.waitUntil(
      async () => (await $$('[role="tab"]')).length > 0,
      { timeout, timeoutMsg: 'layout tabs never appeared' }
    );
  }

  async waitForText(text: string, timeout = 10000) {
    await browser.waitUntil(
      async () => (await browser.getPageSource()).includes(text),
      { timeout, timeoutMsg: `"${text}" never appeared on page` }
    );
  }

  async waitForTabCount(count: number, timeout = 8000) {
    await browser.waitUntil(
      async () => (await $$('[role="tab"]')).length >= count,
      { timeout, timeoutMsg: `expected at least ${count} tab(s)` }
    );
  }

  async createDocument(name: string) {
    await this.docCreateInput.waitForDisplayed({ timeout: 8000 });
    await this.docCreateInput.setValue(name);
    await this.createSubmitBtn.click();
    await this.waitForText(name);
  }

  async clickTab(title: string) {
    await $(`[role="tab"]=${title}`).waitForDisplayed({ timeout: 6000 });
    await $(`[role="tab"]=${title}`).click();
  }

  async openDocument() {
    await $('.doc-open-btn').waitForExist({ timeout: 8000 });
    await $('.doc-open-btn').click();
  }

  async closeTab(title: string) {
    await $(`button[aria-label="Close ${title}"]`).waitForExist({ timeout: 6000 });
    await $(`button[aria-label="Close ${title}"]`).click();
  }
}

export const documentPage = new DocumentPage();
