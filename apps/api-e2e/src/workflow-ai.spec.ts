import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { WorkflowEngine, WorkflowEngineDeps } from '../../api/src/app/websocket/WorkflowEngine';

const CHANNEL = 'ai-ch-1';
const USER = { id: 'u-ai-1', email: 'ai@example.com' };

const AI_WORKFLOW = {
  name: 'test-ai-workflow',
  version: '1.0.0',
  handlers: {
    'send-message': {
      steps: [
        {
          route: 'ai',
          ai: {
            model: 'claude-haiku-4-5-20251001',
            maxTokens: 64,
            systemPrompt: 'Moderate this text from {{$message.senderEmail}}: {{$message.text}}',
            responseTypes: ['valid-text', 'inappropriate-text'],
          },
        },
      ],
    },
    'valid-text': {
      steps: [
        {
          route: 'client',
          transform: { clientMessageType: 'text-approved', text: '$message.text' },
        },
      ],
    },
    'inappropriate-text': {
      steps: [],
    },
  },
};

let configDir: string;

beforeAll(() => {
  configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-e2e-test-'));
  fs.writeFileSync(path.join(configDir, 'test-ai-workflow.json'), JSON.stringify(AI_WORKFLOW));
});

afterAll(() => {
  fs.rmSync(configDir, { recursive: true, force: true });
});

function makeDeps(overrides: Partial<WorkflowEngineDeps> = {}): WorkflowEngineDeps {
  return {
    publishToClient: jest.fn().mockResolvedValue(undefined),
    persistToDatabase: jest.fn().mockResolvedValue(undefined),
    sendToAi: jest.fn(),
    getDocumentType: jest.fn().mockResolvedValue('test-ai-workflow'),
    ...overrides,
  };
}

// ─── ai route dispatch ────────────────────────────────────────────────────────

describe('ai step dispatch', () => {
  test('calls sendToAi with channel, text, and senderEmail', async () => {
    const deps = makeDeps();
    const engine = new WorkflowEngine(deps, configDir);

    await engine.execute({
      message: { type: 'send-message', channel: CHANNEL, text: 'Hello world', senderEmail: 'sender@example.com' },
      user: USER,
    });

    expect(deps.sendToAi).toHaveBeenCalledTimes(1);
    const [callChannel, callText, callSenderEmail] = (deps.sendToAi as jest.Mock).mock.calls[0];
    expect(callChannel).toBe(CHANNEL);
    expect(callText).toBe('Hello world');
    expect(callSenderEmail).toBe('sender@example.com');
  });

  test('interpolates senderEmail into systemPrompt', async () => {
    const deps = makeDeps();
    const engine = new WorkflowEngine(deps, configDir);

    await engine.execute({
      message: { type: 'send-message', channel: CHANNEL, text: 'Hello', senderEmail: 'alice@example.com' },
      user: USER,
    });

    const [, , , aiConfig] = (deps.sendToAi as jest.Mock).mock.calls[0];
    expect(aiConfig.systemPrompt).toContain('alice@example.com');
    expect(aiConfig.systemPrompt).toContain('Hello');
  });

  test('does not publish to client on the ai step itself', async () => {
    const deps = makeDeps();
    const engine = new WorkflowEngine(deps, configDir);

    await engine.execute({
      message: { type: 'send-message', channel: CHANNEL, text: 'Test', senderEmail: 'x@x.com' },
      user: USER,
    });

    expect(deps.publishToClient).not.toHaveBeenCalled();
  });

  test('correlationId passed to sendToAi has executionId:stepIndex format', async () => {
    const deps = makeDeps();
    const engine = new WorkflowEngine(deps, configDir);

    await engine.execute({
      message: { type: 'send-message', channel: CHANNEL, text: 'Test', senderEmail: 'x@x.com' },
      user: USER,
    });

    const correlationId = (deps.sendToAi as jest.Mock).mock.calls[0][5] as string;
    expect(correlationId).toMatch(/^[0-9a-f-]+:\d+$/);
  });
});

// ─── ai response routing ──────────────────────────────────────────────────────

describe('ai response routing', () => {
  test('valid-text response triggers follow-up handler and publishes to client', async () => {
    const deps = makeDeps();
    const engine = new WorkflowEngine(deps, configDir);

    await engine.execute({
      message: { type: 'valid-text', channel: CHANNEL, text: 'Approved text' },
      user: USER,
    });

    expect(deps.publishToClient).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'text-approved' })
    );
  });

  test('inappropriate-text response does not publish to client (empty handler)', async () => {
    const deps = makeDeps();
    const engine = new WorkflowEngine(deps, configDir);

    await engine.execute({
      message: { type: 'inappropriate-text', channel: CHANNEL },
      user: USER,
    });

    expect(deps.publishToClient).not.toHaveBeenCalled();
  });
});
