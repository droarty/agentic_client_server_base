import { BasePage } from './base.page';

class LoginPage extends BasePage {
  get emailInput() {
    return $('#email');
  }

  get passwordInput() {
    return $('#password');
  }

  get submitButton() {
    return $('button[type="submit"]');
  }

  async open() {
    await super.open('/login');
    await this.waitForPageLoad('#email');
  }

  async login(email: string, password: string) {
    await this.emailInput.setValue(email);
    await this.passwordInput.setValue(password);
    await this.submitButton.click();
  }
}

export const loginPage = new LoginPage();
