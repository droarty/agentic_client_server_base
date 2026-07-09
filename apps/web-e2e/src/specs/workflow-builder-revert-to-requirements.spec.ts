import * as fs from 'fs';
import * as path from 'path';

const SS_DIR = path.join(__dirname, '../../../../.claude/skills/run-agentic-client-server-base/screenshots');
const EMAIL = `wfb-revert-${Date.now()}@example.com`;
const PASSWORD = 'password123';

async function screenshot(name: string) {
  fs.mkdirSync(SS_DIR, { recursive: true });
  await browser.saveScreenshot(path.join(SS_DIR, `${name}.png`));
}

async function bodyText(): Promise<string> {
  return (await browser.execute(() => document.body.innerText)) as string;
}

async function waitForText(text: string, timeout = 8000) {
  await browser.waitUntil(async () => (await bodyText()).includes(text), { timeout, timeoutMsg: `expected "${text}" in page` });
}

async function sendChat(text: string) {
  const textarea = await $('textarea.chat-input__field');
  await textarea.waitForDisplayed({ timeout: 8000 });
  await textarea.setValue(text);
  await browser.keys(['Enter']);
}

async function latestAiReplyText(): Promise<string> {
  const bubbles = await $$('.chat-message--ai-reply');
  const last = bubbles[bubbles.length - 1];
  return last.getText();
}

describe('workflow builder: config phase can send the user back to requirements', () => {
  before(async () => {
    await browser.url('/register');
    await browser.waitUntil(async () => (await $('#email').isDisplayed()), { timeout: 8000 });
    await $('#email').setValue(EMAIL);
    await $('#password').setValue(PASSWORD);
    await $('#confirmPassword').setValue(PASSWORD);
    await $('button[type="submit"]').click();
    await browser.waitUntil(async () => (await browser.getUrl()).includes('/user'), {
      timeout: 10000,
      timeoutMsg: 'expected redirect to /user after register',
    });
    await browser.pause(1000);

    const link = await $('button.smenu-link*=Build New Workflow');
    await link.waitForClickable({ timeout: 8000 });
    await link.click();
    await waitForText('Tell me what kind of workflow', 8000);
  });

  it('drives to a draft config, then asks for a scope change and confirms reverting to requirements', async function () {
    this.timeout(600000);

    // Phase 1: get to a ready summary and generate a draft.
    await sendChat(
      'I want to build a workflow called coin-flip-logger. It tracks a running count of heads and tails in state, ' +
        'has a button that flips a virtual coin and updates the count, and displays the current counts and flip ' +
        'history in a simple text display. That is the complete spec.'
    );
    await browser.waitUntil(async () => (await $$('.chat-message--ai-ack')).length >= 1, { timeout: 4000 });
    await browser.waitUntil(async () => (await $$('.chat-message--ai-reply')).length >= 1, {
      timeout: 140000,
      timeoutMsg: 'expected first requirements reply',
    });

    const generateButtonAppeared = await browser
      .waitUntil(async () => (await $$('button*=Generate Workflow')).length >= 1, { timeout: 10000 })
      .then(() => true)
      .catch(() => false);
    if (!generateButtonAppeared) {
      await sendChat('That covers everything — I am ready, please let me generate the workflow now.');
      await browser.waitUntil(async () => (await $$('button*=Generate Workflow')).length >= 1, {
        timeout: 140000,
        timeoutMsg: 'expected Generate Workflow button after nudge',
      });
    }
    await screenshot('revert-01-ready');

    await (await $('button*=Generate Workflow')).click();
    await waitForText('Generating your workflow configuration', 8000);
    await browser.waitUntil(async () => !(await bodyText()).includes('Once you click Generate Workflow, a draft will appear here'), {
      timeout: 280000,
      timeoutMsg: 'expected a draft config to appear',
    });
    await screenshot('revert-02-draft-appeared');
    const draftText = await (await $('.json-view')).getText();
    expect(draftText).toContain('"handlers"');

    // Phase 2: ask for something that is a genuine scope/requirements change.
    const replyCountBefore = (await $$('.chat-message--ai-reply')).length;
    await sendChat(
      'Actually, I also want to track a timestamp for each flip and show a separate history panel broken out by day — ' +
        'this is a new feature we have not discussed yet.'
    );
    await browser.waitUntil(async () => (await $$('.chat-message--ai-reply')).length > replyCountBefore, {
      timeout: 200000,
      timeoutMsg: 'expected the config AI to reply about the scope change',
    });
    await screenshot('revert-03-asked-about-switch');

    const askReply = (await latestAiReplyText()).toLowerCase();
    // eslint-disable-next-line no-console
    console.log('[revert spec] config AI reply to scope change:', askReply);
    const asksAboutRequirements = ['requirement', 'go back', 'switch back'].some((p) => askReply.includes(p));
    expect(asksAboutRequirements).toBe(true);

    // Confirm — should trigger chat-reply-revert-to-requirements.
    const replyCountBeforeConfirm = (await $$('.chat-message--ai-reply')).length;
    await sendChat('Yes, please update the requirements and go back.');
    await browser.waitUntil(async () => (await $$('.chat-message--ai-reply')).length > replyCountBeforeConfirm, {
      timeout: 200000,
      timeoutMsg: 'expected a reply confirming the revert',
    });

    await waitForText('Switching back to requirements gathering', 10000);
    await screenshot('revert-04-reverted');

    const text = await bodyText();
    expect(text).toContain('Once you click Generate Workflow, a draft will appear here');
    expect(await $$('button*=Publish Workflow')).toHaveLength(0);
  });
});
