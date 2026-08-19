import * as fs from 'fs';
import * as path from 'path';

const SS_DIR = path.join(__dirname, '../../../../.claude/skills/run-agentic-client-server-base/screenshots');
const EMAIL = `wfb-scope-${Date.now()}@example.com`;
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

async function aiReplyCount(): Promise<number> {
  return (await $$('.chat-message--ai-reply')).length;
}

async function latestAiReplyText(): Promise<string> {
  const bubbles = await $$('.chat-message--ai-reply');
  const last = bubbles[bubbles.length - 1];
  return last.getText();
}

describe('workflow builder: config agent flags a scope change and the chat agent routes back to planning', () => {
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

  it('drives to a draft config, then asks for a scope change and confirms the chat agent routes back to planning', async function () {
    this.timeout(700000);

    // Phase 1: get to a plan and a draft config.
    await sendChat(
      'I want to build a workflow called coin-flip-logger. It tracks a running count of heads and tails in state, ' +
        'has a button that flips a virtual coin and updates the count, and displays the current counts and flip ' +
        'history in a simple text display. That is the complete spec — please put together a plan for this now.'
    );
    await browser.waitUntil(async () => (await $$('.chat-message--ai-ack')).length >= 1, { timeout: 4000 });

    const planStarted = await browser
      .waitUntil(async () => (await bodyText()).includes('Updating the plan'), { timeout: 60000 })
      .then(() => true)
      .catch(() => false);
    if (!planStarted) {
      await sendChat('Please put together a plan from what I described.');
      await waitForText('Updating the plan', 60000);
    }
    await browser.waitUntil(
      async () => !(await bodyText()).includes("I'll build up a plan here as we chat"),
      { timeout: 60000, timeoutMsg: 'expected the plan panel to populate' }
    );
    await screenshot('scope-01-plan-ready');

    await sendChat('That all looks right — please generate the workflow configuration now.');
    await waitForText('Drafting the configuration', 60000);
    await browser.waitUntil(
      async () => !(await bodyText()).includes("I'll draft a config here once we've worked out a plan together"),
      { timeout: 280000, timeoutMsg: 'expected a draft config to appear' }
    );
    await screenshot('scope-02-draft-appeared');
    const draftText = await (await $('.json-view')).getText();
    expect(draftText).toContain('"handlers"');

    // Phase 2: ask for something that is a genuine scope/plan change.
    const replyCountBefore = await aiReplyCount();
    await sendChat(
      'Actually, I also want to track a timestamp for each flip and show a separate history panel broken out by day — ' +
        'this is a new feature we have not discussed yet.'
    );
    await browser.waitUntil(async () => (await aiReplyCount()) > replyCountBefore, {
      timeout: 200000,
      timeoutMsg: 'expected the config agent to reply about the scope change',
    });
    await screenshot('scope-03-asked-about-switch');

    const askReply = (await latestAiReplyText()).toLowerCase();
    // eslint-disable-next-line no-console
    console.log('[scope-change spec] config agent reply to scope change:', askReply);
    const asksAboutPlan = ['plan', 'requirement', 'go back', 'switch back', 'revisit'].some((p) => askReply.includes(p));
    expect(asksAboutPlan).toBe(true);

    // Confirm — should cause the *chat agent's next turn* to invoke planning again, not an
    // immediate same-turn revert (there is no dedicated revert handler in this design).
    const replyCountBeforeConfirm = await aiReplyCount();
    await sendChat('Yes, please update the plan with that change and go back to planning.');

    await browser.waitUntil(async () => (await bodyText()).includes('Updating the plan'), {
      timeout: 60000,
      timeoutMsg: 'expected the chat agent to route this confirmation back to the planning step',
    });
    await screenshot('scope-04-planning-reinvoked');

    await browser.waitUntil(async () => (await aiReplyCount()) > replyCountBeforeConfirm, {
      timeout: 200000,
      timeoutMsg: 'expected a chat-agent summary reply after the plan was updated again',
    });
    await screenshot('scope-05-plan-updated');

    const text = await bodyText();
    expect(text.toLowerCase()).toContain('timestamp');
  });
});
