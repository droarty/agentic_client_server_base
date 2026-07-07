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

async function latestAiReplyText(): Promise<string> {
  const bubbles = await $$('.chat-message--ai-reply');
  const last = bubbles[bubbles.length - 1];
  return last.getText();
}

describe('workflow builder: two-phase requirements → config-building flow', () => {
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
    await waitForText('Requirements', 4000);
    await screenshot('2ph-01-opened');
  });

  it('requirements phase: a detailed description produces a persisted summary with no tool calls needed', async function () {
    this.timeout(150000);
    await sendChat(
      'I want to build a workflow called coin-flip-logger. It tracks a running count of heads and tails in state, ' +
        'has a button that flips a virtual coin and updates the count, and displays the current counts and flip ' +
        'history in a simple text display. That is the complete spec.'
    );

    await browser.waitUntil(async () => (await $$('.chat-message--ai-ack')).length >= 1, {
      timeout: 4000,
      timeoutMsg: 'expected an immediate ai-ack bubble to appear',
    });

    await browser.waitUntil(async () => (await $$('.chat-message--ai-reply')).length >= 1, {
      timeout: 140000,
      timeoutMsg: 'expected an ai-reply bubble to eventually appear',
    });
    await screenshot('2ph-02-first-reply');

    // The requirements summary panel should now hold real content, not the empty placeholder.
    await browser.waitUntil(
      async () => !(await bodyText()).includes('Describe the workflow you want — a requirements summary'),
      { timeout: 10000, timeoutMsg: 'expected the placeholder text to be replaced by a real requirements summary' }
    );
    const text = await bodyText();
    expect(text.toLowerCase()).toContain('coin');
    await screenshot('2ph-03-summary-populated');
  });

  it('rejects a request for a non-existent feature instead of pretending it is possible', async function () {
    this.timeout(150000);
    const replyCountBefore = (await $$('.chat-message--ai-reply')).length;
    await sendChat('Can you also make it text me an SMS every time I get 10 heads in a row?');

    await browser.waitUntil(async () => (await $$('.chat-message--ai-reply')).length > replyCountBefore, {
      timeout: 140000,
      timeoutMsg: 'expected a new ai-reply bubble responding to the SMS request',
    });
    await screenshot('2ph-04-sms-reply');

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

  it('shows a "Generate Workflow" button once requirements are ready, and clicking it produces a draft config', async function () {
    // Config-building legitimately makes several get_reference_section round trips
    // (confirmed via workflowlogs: distinct sections fetched sequentially, not a stuck loop)
    // before producing the final ~8K-token draft — give it real headroom.
    this.timeout(320000);

    const generateButtonAppeared = await browser
      .waitUntil(
        async () => (await $$('button*=Generate Workflow')).length >= 1,
        { timeout: 10000 }
      )
      .then(() => true)
      .catch(() => false);

    if (!generateButtonAppeared) {
      // Nudge explicitly if the model didn't mark itself ready from the first message alone.
      await sendChat('That covers everything — I am ready, please let me generate the workflow now.');
      await browser.waitUntil(async () => (await $$('button*=Generate Workflow')).length >= 1, {
        timeout: 140000,
        timeoutMsg: 'expected the Generate Workflow button to appear after nudging readiness',
      });
    }
    await screenshot('2ph-05-generate-button-visible');

    const generateButton = await $('button*=Generate Workflow');
    await generateButton.click();

    await waitForText('Generating your workflow configuration', 8000);
    await screenshot('2ph-06-generating');

    // Real Claude Sonnet 5 call with the full schema summary + get_reference_section tool loop
    // + full JSON draft generation — give it real headroom (matches existing workflow-builder timing).
    await browser.waitUntil(
      async () => !(await bodyText()).includes('Once you click Generate Workflow, a draft will appear here'),
      { timeout: 280000, timeoutMsg: 'expected a draft config to appear in the right panel' }
    );
    await screenshot('2ph-07-draft-appeared');

    const draftText = await (await $('.json-view')).getText();
    expect(draftText).toContain('"handlers"');

    await browser.waitUntil(async () => (await $$('button*=Publish Workflow')).length >= 1, {
      timeout: 10000,
      timeoutMsg: 'expected the Publish Workflow button to appear once a draft exists',
    });
    await screenshot('2ph-08-publish-button-visible');
  });
});
