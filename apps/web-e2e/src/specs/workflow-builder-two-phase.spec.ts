import * as fs from 'fs';
import * as path from 'path';

const SS_DIR = path.join(__dirname, '../../../../.claude/skills/run-agentic-client-server-base/screenshots');
const EMAIL = `wfb-2phase-${Date.now()}@example.com`;
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

describe('workflow builder: chat -> planning -> config flow', () => {
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
    await waitForText('Plan', 4000);
    await screenshot('2ph-01-opened');
  });

  it('there is no Generate Workflow button anywhere in the panel', async () => {
    expect(await $$('button*=Generate Workflow')).toHaveLength(0);
  });

  it('a detailed description produces a persisted plan and a chat-agent summary reply', async function () {
    // The chat agent deciding to hand off to planning, the planning agent actually updating the
    // plan, and the chat agent summarizing that update are three sequential real Claude calls.
    this.timeout(280000);
    await sendChat(
      'I want to build a workflow called coin-flip-logger. It tracks a running count of heads and tails in state, ' +
        'has a button that flips a virtual coin and updates the count, and displays the current counts and flip ' +
        'history in a simple text display. That is the complete spec — please put together a plan for this now.'
    );

    await browser.waitUntil(async () => (await $$('.chat-message--ai-ack')).length >= 1, {
      timeout: 4000,
      timeoutMsg: 'expected an immediate ai-ack bubble to appear',
    });

    // The chat agent should decide to hand off to planning given a complete, explicit spec.
    // Nudge explicitly if it doesn't within the first reply cycle.
    const planStarted = await browser
      .waitUntil(async () => (await bodyText()).includes('Updating the plan'), { timeout: 60000 })
      .then(() => true)
      .catch(() => false);
    if (!planStarted) {
      await sendChat('Please put together a plan from what I described.');
      await waitForText('Updating the plan', 60000);
    }
    await screenshot('2ph-02-plan-started');

    // The plan panel should populate — placeholder text replaced by real content.
    await browser.waitUntil(
      async () => !(await bodyText()).includes("I'll build up a plan here as we chat"),
      { timeout: 60000, timeoutMsg: 'expected the plan panel placeholder to be replaced by a real plan' }
    );
    await screenshot('2ph-03-plan-populated');

    // The chat agent should follow up with its own summary once planning finishes.
    await browser.waitUntil(async () => (await aiReplyCount()) >= 2, {
      timeout: 60000,
      timeoutMsg: 'expected a chat-agent summary ai-reply after the plan was updated',
    });
    await screenshot('2ph-04-summary-reply');

    const text = await bodyText();
    expect(text.toLowerCase()).toContain('coin');
  });

  it('rejects a request for a non-existent feature instead of pretending it is possible', async function () {
    this.timeout(150000);
    const replyCountBefore = await aiReplyCount();
    await sendChat('Can you also make it text me an SMS every time I get 10 heads in a row?');

    await browser.waitUntil(async () => (await aiReplyCount()) > replyCountBefore, {
      timeout: 140000,
      timeoutMsg: 'expected a new ai-reply bubble responding to the SMS request',
    });
    await screenshot('2ph-05-sms-reply');

    const reply = (await latestAiReplyText()).toLowerCase();
    const declinePhrases = [
      "doesn't exist",
      'does not exist',
      'not currently possible',
      'not possible',
      'feature request',
      'site developers',
      "isn't currently supported",
      'is not currently supported',
      "can't currently",
      'cannot currently',
      'not something',
      'no sms',
      'not supported',
    ];
    const matched = declinePhrases.some((p) => reply.includes(p));
    // eslint-disable-next-line no-console
    console.log('[two-phase spec] SMS-request AI reply text:', reply);
    expect(matched).toBe(true);
  });

  it('asking to generate the config produces a draft and offers to publish, with no Generate Workflow button involved', async function () {
    // The chat agent handing off to config, the config agent's tool-use loop + draft generation,
    // and the chat agent summarizing the draft are three sequential real Claude calls.
    this.timeout(320000);

    const replyCountBefore = await aiReplyCount();
    await sendChat('That all looks right — please generate the workflow configuration now.');

    await waitForText('Drafting the configuration', 60000);
    await screenshot('2ph-06-drafting');

    await browser.waitUntil(
      async () => !(await bodyText()).includes("I'll draft a config here once we've worked out a plan together"),
      { timeout: 280000, timeoutMsg: 'expected a draft config to appear in the right panel' }
    );
    await screenshot('2ph-07-draft-appeared');

    const draftText = await (await $('.json-view')).getText();
    expect(draftText).toContain('"handlers"');

    // Both the hand-off acknowledgment and the post-draft chat-agent summary should have landed.
    await browser.waitUntil(async () => (await aiReplyCount()) > replyCountBefore + 1, {
      timeout: 60000,
      timeoutMsg: 'expected both the config hand-off ack and the chat-agent summary ai-reply to appear',
    });

    await browser.waitUntil(async () => (await $$('button*=Publish Workflow')).length >= 1, {
      timeout: 10000,
      timeoutMsg: 'expected the Publish Workflow button to appear once a draft exists',
    });
    await screenshot('2ph-08-publish-button-visible');

    expect(await $$('button*=Generate Workflow')).toHaveLength(0);
  });
});
