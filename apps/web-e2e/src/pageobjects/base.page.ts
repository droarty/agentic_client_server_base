export class BasePage {
  get errorMessage() {
    return $('[role="alert"]');
  }

  async open(path: string) {
    await browser.url(path);
  }

  async waitForPageLoad(selector: string) {
    await $(selector).waitForDisplayed({ timeout: 10000 });
  }
}
