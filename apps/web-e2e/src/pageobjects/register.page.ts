import { BasePage } from './base.page';

class RegisterPage extends BasePage {
  get emailInput() {
    return $('#email');
  }

  get passwordInput() {
    return $('#password');
  }

  get confirmPasswordInput() {
    return $('#confirmPassword');
  }

  get submitButton() {
    return $('button[type="submit"]');
  }

  async open() {
    await super.open('/register');
    await this.waitForPageLoad('#email');
  }

  async register(email: string, password: string, confirmPassword: string) {
    await this.emailInput.setValue(email);
    await this.passwordInput.setValue(password);
    await this.confirmPasswordInput.setValue(confirmPassword);
    await this.submitButton.click();
  }
}

export const registerPage = new RegisterPage();
