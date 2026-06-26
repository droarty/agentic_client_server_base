import * as path from 'path';
import { WorkflowEngine, WorkflowEngineDeps } from '../../api/src/app/websocket/WorkflowEngine';
import { OutboundMessage } from '@agentic-client-server-base/shared-types';

const CONFIG_DIR = path.resolve(__dirname, '../../api/src/app/config/workflows');
const UD_CHANNEL = 'ud-ch-1';
const LR_CHANNEL = 'lr-ch-1';

function makeDeps(overrides: Partial<WorkflowEngineDeps> = {}): WorkflowEngineDeps {
  return {
    publishToClient: jest.fn().mockResolvedValue(undefined),
    persistToDatabase: jest.fn().mockResolvedValue(undefined),
    sendToAi: jest.fn(),
    getDocumentType: jest.fn().mockImplementation(async (ch: string) =>
      ch === LR_CHANNEL ? 'log-review' : 'user-dashboard'
    ),
    ...overrides,
  };
}

function getPublishedMessages(deps: WorkflowEngineDeps): OutboundMessage[] {
  return (deps.publishToClient as jest.Mock).mock.calls.map((c: [OutboundMessage]) => c[0]);
}

function findComponentTypes(nodes: unknown[]): string[] {
  const types: string[] = [];
  const walk = (list: unknown[]) => {
    for (const node of list) {
      const n = node as Record<string, unknown>;
      if (typeof n['componentType'] === 'string') types.push(n['componentType']);
      if (Array.isArray(n['children'])) walk(n['children'] as unknown[]);
    }
  };
  walk(nodes);
  return types;
}

// ─── user-dashboard ───────────────────────────────────────────────────────────

describe('user-dashboard / defaultView', () => {
  let deps: WorkflowEngineDeps;

  beforeEach(() => {
    deps = makeDeps();
  });

  test('emits initialize-view with viewHandler and smartTabs root', async () => {
    const engine = new WorkflowEngine(deps, CONFIG_DIR);
    await engine.execute({ message: { type: 'defaultView', channel: UD_CHANNEL } });

    const msgs = getPublishedMessages(deps);
    expect(msgs).toHaveLength(1);

    const msg = msgs[0] as unknown as Record<string, unknown>;
    expect(msg['type']).toBe('initialize-view');
    expect(msg['viewHandler']).toBe('defaultView');

    const layout = msg['layoutConfig'] as unknown[];
    expect(layout[0]).toMatchObject({ componentType: 'smartTabs' });
  });

  test('layoutConfig includes smartTab and forEach children inside smartTabs', async () => {
    const engine = new WorkflowEngine(deps, CONFIG_DIR);
    await engine.execute({ message: { type: 'defaultView', channel: UD_CHANNEL } });

    const msg = getPublishedMessages(deps)[0] as unknown as Record<string, unknown>;
    const layout = msg['layoutConfig'] as unknown[];
    const componentTypes = findComponentTypes(layout);

    expect(componentTypes).toContain('smartTab');
    expect(componentTypes).toContain('forEach');
    expect(componentTypes).toContain('layoutDocumentView');
  });
});

describe('user-dashboard / userManagementView', () => {
  let deps: WorkflowEngineDeps;

  beforeEach(() => {
    deps = makeDeps();
  });

  test('emits initialize-view with fullPanel root', async () => {
    const engine = new WorkflowEngine(deps, CONFIG_DIR);
    await engine.execute({ message: { type: 'userManagementView', channel: UD_CHANNEL } });

    const msgs = getPublishedMessages(deps);
    expect(msgs.length).toBeGreaterThanOrEqual(1);

    const msg = msgs[0] as unknown as Record<string, unknown>;
    expect(msg['type']).toBe('initialize-view');
    expect(msg['viewHandler']).toBe('userManagementView');

    const layout = msg['layoutConfig'] as unknown[];
    expect(layout[0]).toMatchObject({ componentType: 'fullPanel' });
  });

  test('layoutConfig includes documentList and newDocument', async () => {
    const engine = new WorkflowEngine(deps, CONFIG_DIR);
    await engine.execute({ message: { type: 'userManagementView', channel: UD_CHANNEL } });

    const msgs = getPublishedMessages(deps);
    const layout = (msgs[0] as unknown as Record<string, unknown>)['layoutConfig'] as unknown[];
    const componentTypes = findComponentTypes(layout);

    expect(componentTypes).toContain('documentList');
    expect(componentTypes).toContain('newDocument');
    expect(componentTypes).toContain('smartAccordion');
  });

  test('layoutConfig defines save-documents-accordion and save-groups-accordion emits', async () => {
    const engine = new WorkflowEngine(deps, CONFIG_DIR);
    await engine.execute({ message: { type: 'userManagementView', channel: UD_CHANNEL } });

    const layout = (getPublishedMessages(deps)[0] as unknown as Record<string, unknown>)['layoutConfig'] as unknown[];
    const children = ((layout[0] as Record<string, unknown>)['children'] as unknown[]);
    const emitsSeen = children.map((c) => Object.values((c as Record<string, unknown>)['emits'] as Record<string, string> ?? {})).flat();

    expect(emitsSeen).toContain('save-documents-accordion');
    expect(emitsSeen).toContain('save-groups-accordion');
  });
});

describe('user-dashboard / initialize-state-document', () => {
  let deps: WorkflowEngineDeps;

  beforeEach(() => {
    deps = makeDeps();
  });

  test('first emitted message is initialize-state', async () => {
    const engine = new WorkflowEngine(deps, CONFIG_DIR);
    const docState = { openDocs: [], activeDocId: '', openAccordions: { documents: 'documents', groups: 'groups' } };
    await engine.execute({
      message: { type: 'initialize-state-document', channel: UD_CHANNEL, document: { state: docState, currentChannelId: 'some-chan' } },
    });

    const msgs = getPublishedMessages(deps);
    const first = msgs[0] as unknown as Record<string, unknown>;
    expect(first['type']).toBe('initialize-state');
    expect(first['initialState']).toEqual(docState);
  });

  test('second emitted message is update-state setting _channelId', async () => {
    const engine = new WorkflowEngine(deps, CONFIG_DIR);
    await engine.execute({
      message: { type: 'initialize-state-document', channel: UD_CHANNEL, document: { state: {}, currentChannelId: 'the-chan' } },
    });

    const msgs = getPublishedMessages(deps);
    const second = msgs[1] as unknown as Record<string, unknown>;
    expect(second['type']).toBe('update-state');
    const actions = second['actions'] as Array<Record<string, unknown>>;
    expect(actions[0]).toMatchObject({ path: '$temp._channelId', value: 'the-chan' });
  });
});

// ─── log-review ───────────────────────────────────────────────────────────────

describe('log-review / defaultView', () => {
  let deps: WorkflowEngineDeps;

  beforeEach(() => {
    deps = makeDeps();
  });

  test('emits initialize-view with viewHandler and fullPanel root', async () => {
    const engine = new WorkflowEngine(deps, CONFIG_DIR);
    await engine.execute({ message: { type: 'defaultView', channel: LR_CHANNEL } });

    const msgs = getPublishedMessages(deps);
    expect(msgs).toHaveLength(1);

    const msg = msgs[0] as unknown as Record<string, unknown>;
    expect(msg['type']).toBe('initialize-view');
    expect(msg['viewHandler']).toBe('defaultView');

    const layout = msg['layoutConfig'] as unknown[];
    expect(layout[0]).toMatchObject({ componentType: 'fullPanel' });
  });

  test('layoutConfig includes nested smartAccordion components', async () => {
    const engine = new WorkflowEngine(deps, CONFIG_DIR);
    await engine.execute({ message: { type: 'defaultView', channel: LR_CHANNEL } });

    const layout = (getPublishedMessages(deps)[0] as unknown as Record<string, unknown>)['layoutConfig'] as unknown[];
    const componentTypes = findComponentTypes(layout);

    expect(componentTypes.filter((t) => t === 'smartAccordion').length).toBeGreaterThanOrEqual(2);
  });
});
