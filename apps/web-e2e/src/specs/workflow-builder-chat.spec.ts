import * as fs from 'fs';
import * as path from 'path';
import { MongoClient } from 'mongodb';

const SS_DIR = path.join(__dirname, '../../../../.claude/skills/run-agentic-client-server-base/screenshots');
const EMAIL = `wfb-chat-${Date.now()}@example.com`;
const PASSWORD = 'password123';
const MONGODB_URI = 'mongodb://localhost:27017/agentic_client_server_base';

async function screenshot(name: string) {
  fs.mkdirSync(SS_DIR, { recursive: true });
  await browser.saveScreenshot(path.join(SS_DIR, `${name}.png`));
}

async function waitForText(text: string, timeout = 8000) {
  await browser.waitUntil(
    async () => {
      const body = await browser.execute(() => document.body.innerText);
      return (body as string).includes(text);
    },
    { timeout, timeoutMsg: `expected "${text}" in page` }
  );
}

async function countBubbles(selector: string): Promise<number> {
  return (await $$(selector)).length;
}

describe('workflow builder chat: ack, history, bubbles, auto-grow', () => {
  before(async () => {
    await browser.url('/register');
    await browser.waitUntil(async () => (await $('#email').isDisplayed()), { timeout: 8000 });
    await $('#email').setValue(EMAIL);
    await $('#password').setValue(PASSWORD);
    await $('#confirmPassword').setValue(PASSWORD);
    await $('button[type="submit"]').click();
    await browser.waitUntil(
      async () => (await browser.getUrl()).includes('/user'),
      { timeout: 10000, timeoutMsg: 'expected redirect to /user after register' }
    );
    await browser.pause(1000);
  });

  it('opens the workflow builder', async () => {
    const link = await $('button.smenu-link*=Build New Workflow');
    await link.waitForClickable({ timeout: 8000 });
    await link.click();
    await waitForText('Tell me what kind of workflow', 8000);
    await screenshot('wfb-01-opened');
  });

  it('sending a message immediately shows an ack bubble, then the AI reply arrives separately', async function () {
    // Real Claude Sonnet 5 call with a ~51KB reference doc + extended thinking + full JSON
    // draft generation empirically takes up to ~90s — give it real headroom.
    this.timeout(150000);
    const textarea = await $('textarea.chat-input__field');
    await textarea.waitForDisplayed({ timeout: 8000 });
    await textarea.setValue('I want to build a simple coin flip logger workflow called coin-flip-logger.');
    await browser.keys(['Enter']);

    // Response 1: immediate ack bubble (ai-ack), should appear almost instantly
    await browser.waitUntil(
      async () => (await countBubbles('.chat-message--ai-ack')) >= 1,
      { timeout: 4000, timeoutMsg: 'expected an immediate ai-ack bubble to appear' }
    );
    await screenshot('wfb-02-ack-appeared');

    // Response 2: the real AI reply arrives later (ai-reply bubble)
    await browser.waitUntil(
      async () => (await countBubbles('.chat-message--ai-reply')) >= 1,
      { timeout: 140000, timeoutMsg: 'expected an ai-reply bubble to eventually appear' }
    );
    await screenshot('wfb-03-ai-replied');
  });

  it('user bubble is right-aligned (blue), assistant bubble is left-aligned', async () => {
    const userBubble = await $('.chat-message--user-text');
    const aiBubble = await $('.chat-message--ai-reply');
    const userAlign = await userBubble.getCSSProperty('align-self');
    const aiAlign = await aiBubble.getCSSProperty('align-self');
    expect(userAlign.value).toBe('flex-end');
    expect(aiAlign.value).toBe('flex-start');
    const userBg = await userBubble.getCSSProperty('background-color');
    expect(userBg.value).toContain('0,112,243'); // #0070f3
    await screenshot('wfb-04-bubble-styles');
  });

  it('ack bubble is never persisted to MongoDB (client-only)', async () => {
    const ackCountInUi = await countBubbles('.chat-message--ai-ack');
    expect(ackCountInUi).toBeGreaterThanOrEqual(1);

    const token = await browser.execute(() => window.localStorage.getItem('token'));
    const me = await browser.executeAsync((authToken: string, done: (id: string) => void) => {
      fetch('http://localhost:3000/api/users/me', { headers: { Authorization: `Bearer ${authToken}` } })
        .then((r) => r.json())
        .then((body) => done(body._id));
    }, token as string);

    const client = new MongoClient(MONGODB_URI);
    await client.connect();
    try {
      const artifact = await client
        .db()
        .collection('artifacts')
        .findOne({ userId: me, type: 'workflow-builder' });
      const chatMessages = (artifact?.['state']?.['chatMessages'] ?? []) as Array<{ messageType: string }>;
      expect(chatMessages.length).toBeGreaterThan(0);
      const persistedAckMessages = chatMessages.filter((m) => m.messageType === 'ai-ack');
      expect(persistedAckMessages).toHaveLength(0);
    } finally {
      await client.close();
    }
  });

  it('AI remembers earlier conversation context across turns (multi-turn history)', async function () {
    this.timeout(150000);
    const textarea = await $('textarea.chat-input__field');
    await textarea.waitForDisplayed({ timeout: 8000 });
    await textarea.setValue('What did I say I wanted to call this workflow, a moment ago?');
    await browser.keys(['Enter']);

    await browser.waitUntil(
      async () => (await countBubbles('.chat-message--ai-ack')) >= 1,
      { timeout: 4000, timeoutMsg: 'expected an immediate ai-ack bubble for the second message' }
    );

    const replyCountBefore = await countBubbles('.chat-message--ai-reply');
    await browser.waitUntil(
      async () => (await countBubbles('.chat-message--ai-reply')) > replyCountBefore,
      { timeout: 140000, timeoutMsg: 'expected a new ai-reply bubble after the follow-up question' }
    );
    await screenshot('wfb-06-followup-reply');

    const bodyText = await browser.execute(() => document.body.innerText);
    expect((bodyText as string).toLowerCase()).toContain('coin-flip-logger');
  });

  it('textarea auto-grows with multi-line content', async () => {
    const textarea = await $('textarea.chat-input__field');
    const initialHeight = (await textarea.getSize()).height;
    const longText = Array.from({ length: 8 }, (_, i) => `line ${i}`).join('\n');
    await browser.execute((el: unknown, val: string) => {
      const textareaEl = el as HTMLTextAreaElement;
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')!.set!;
      nativeSetter.call(textareaEl, val);
      textareaEl.dispatchEvent(new Event('input', { bubbles: true }));
    }, textarea as unknown as Element, longText);
    await browser.pause(300);
    const grownHeight = (await textarea.getSize()).height;
    expect(grownHeight).toBeGreaterThan(initialHeight);
    await screenshot('wfb-07-textarea-grown');
  });
});
