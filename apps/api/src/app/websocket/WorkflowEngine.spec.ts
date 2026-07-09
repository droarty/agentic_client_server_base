import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { WorkflowEngine, WorkflowEngineDeps, WorkflowContext } from './WorkflowEngine';
import { OutboundMessage } from '@agentic-client-server-base/shared-types';

let configDir: string;

const WORKFLOW_CONFIG = {
  name: 'test-workflow',
  version: '1.0',
  handlers: {
    'client-message': {
      steps: [{ route: 'client', transform: { type: 'response', text: '$message.text' } }],
    },
    'db-message': {
      steps: [{ route: 'database', transform: { type: 'update-state' } }],
    },
    'combined-message': {
      steps: [{ route: ['client', 'database'], transform: { type: 'update-state' } }],
    },
    'conditioned-message': {
      condition: '$message.enabled',
      steps: [{ route: 'client', transform: { type: 'response' } }],
    },
    'jsonata-cond-message': {
      condition: '~{ message.count > 5 }',
      steps: [{ route: 'client', transform: { type: 'response' } }],
    },
    'query-message': {
      steps: [{ route: 'database-query', query: { name: 'get-docs', responseType: 'query-result' } }],
    },
    'query-result': {
      steps: [{ route: 'client', transform: { type: 'result' } }],
    },
    'ai-message': {
      steps: [{
        route: 'ai',
        ai: { model: 'claude-haiku-4-5-20251001', maxTokens: 64, systemPrompt: 'Ctx: {{$message.context}}' },
      }],
    },
    'ai-message-with-max-turns': {
      steps: [{
        route: 'ai',
        ai: { model: 'claude-haiku-4-5-20251001', maxTokens: 64, maxTurns: 20, systemPrompt: 'Ctx: {{$message.context}}' },
      }],
    },
    'unknown-route-message': {
      steps: [{ route: 'bad-route' }],
    },
    'parent-route-message': {
      steps: [{ route: 'parent', transform: { clientMessageType: 'parent-notification', text: '$message.text' } }],
    },
    'parent-response-handler': {
      steps: [{ route: 'client', transform: { type: 'parent-notification', text: '$message.text' } }],
    },
    'groupid-message': {
      steps: [{ route: 'client', transform: { type: 'response', gid: '$groupId' } }],
    },
    'jsonata-message': {
      transformer: 'jsonata',
      steps: [{ route: 'client', transform: { type: 'jsonata-response', text: '$message.text' } }],
    },
    'rename-type-message': {
      steps: [{ route: 'client', transform: { clientMessageType: 'renamed', extra: 'val' } }],
    },
    'state-path-message': {
      steps: [{ route: 'client', transform: { type: 'response', ref: '$state.foo', tmp: '$temp.bar' } }],
    },
    'nested-transform-message': {
      steps: [{ route: 'client', transform: { type: 'response', meta: { key: '$message.key' } } }],
    },
    'array-transform-message': {
      steps: [{ route: 'client', transform: { type: 'response', items: ['$message.a', '$message.b'] } }],
    },
    'multi-step-message': {
      steps: [
        { route: 'client', transform: { type: 'first' } },
        { route: 'database', transform: { type: 'update-state' } },
      ],
    },
    'prompt-template-message': {
      steps: [{
        route: 'ai',
        ai: { model: 'claude-haiku-4-5-20251001', maxTokens: 64, systemPrompt: 'Hello {{$message.name}}, missing: {{$message.missing}}' },
      }],
    },
    'write-required-message': {
      requiredAccess: 'write',
      steps: [{ route: 'client', transform: { type: 'response' } }],
    },
    'admin-required-message': {
      requiredAccess: 'admin',
      steps: [{ route: 'client', transform: { type: 'response' } }],
    },
    'unrestricted-message': {
      steps: [{ route: 'client', transform: { type: 'response' } }],
    },
    'state-prompt-message': {
      steps: [{
        route: 'ai',
        ai: { model: 'claude-haiku-4-5-20251001', maxTokens: 64, systemPrompt: 'Draft: {{state.poemDraft}}' },
      }],
    },
  },
};

function makeDeps(overrides: Partial<WorkflowEngineDeps> = {}): WorkflowEngineDeps {
  return {
    publishToClient: jest.fn().mockResolvedValue(undefined),
    persistToDatabase: jest.fn().mockResolvedValue(undefined),
    logWorkflowStep: jest.fn(),
    sendToAi: jest.fn(),
    getChannelContext: jest.fn().mockResolvedValue({ workflowType: 'test-workflow', artifactId: 'art-1' }),
    executeQuery: jest.fn().mockResolvedValue({ documents: [] }),
    ...overrides,
  };
}

function makeContext(type: string, extra: Record<string, unknown> = {}, permissionLevel?: WorkflowContext['permissionLevel']): WorkflowContext {
  return {
    message: { type, channel: 'ch-1', ...extra },
    user: { id: 'u-1', email: 'test@example.com' },
    permissionLevel,
  };
}

function makeEngine(deps: WorkflowEngineDeps) {
  return new WorkflowEngine(deps, configDir);
}

beforeAll(() => {
  configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'we-test-'));
  fs.writeFileSync(path.join(configDir, 'test-workflow.json'), JSON.stringify(WORKFLOW_CONFIG));
});

afterAll(() => {
  fs.rmSync(configDir, { recursive: true, force: true });
});

// ─── execute() guards ─────────────────────────────────────────────────────────

describe('execute() — guards', () => {
  test('logs error and does nothing when getChannelContext returns null', async () => {
    const deps = makeDeps({ getChannelContext: jest.fn().mockResolvedValue(null) });
    await makeEngine(deps).execute(makeContext('client-message'));
    expect(deps.logWorkflowStep).toHaveBeenCalledWith(expect.objectContaining({ logType: 'error' }));
    expect(deps.publishToClient).not.toHaveBeenCalled();
  });

  test('logs error when config file does not exist for the document type', async () => {
    const deps = makeDeps({ getChannelContext: jest.fn().mockResolvedValue({ workflowType: 'unknown-type' }) });
    await makeEngine(deps).execute(makeContext('client-message'));
    expect(deps.logWorkflowStep).toHaveBeenCalledWith(expect.objectContaining({ logType: 'error' }));
    expect(deps.publishToClient).not.toHaveBeenCalled();
  });

  test('logs error when no handler matches the message type', async () => {
    const deps = makeDeps();
    await makeEngine(deps).execute(makeContext('no-such-handler'));
    expect(deps.logWorkflowStep).toHaveBeenCalledWith(expect.objectContaining({ logType: 'error' }));
    expect(deps.publishToClient).not.toHaveBeenCalled();
  });
});

// ─── condition evaluation ─────────────────────────────────────────────────────

describe('condition evaluation', () => {
  test('simple condition false → steps skipped', async () => {
    const deps = makeDeps();
    await makeEngine(deps).execute(makeContext('conditioned-message', { enabled: false }));
    expect(deps.publishToClient).not.toHaveBeenCalled();
  });

  test('simple condition true → steps run', async () => {
    const deps = makeDeps();
    await makeEngine(deps).execute(makeContext('conditioned-message', { enabled: true }));
    expect(deps.publishToClient).toHaveBeenCalled();
  });

  test('JSONata condition false → steps skipped', async () => {
    const deps = makeDeps();
    await makeEngine(deps).execute(makeContext('jsonata-cond-message', { count: 3 }));
    expect(deps.publishToClient).not.toHaveBeenCalled();
  });

  test('JSONata condition true → steps run', async () => {
    const deps = makeDeps();
    await makeEngine(deps).execute(makeContext('jsonata-cond-message', { count: 10 }));
    expect(deps.publishToClient).toHaveBeenCalled();
  });
});

// ─── step routing ─────────────────────────────────────────────────────────────

describe('step routing — client', () => {
  test('publishToClient called with resolved outbound message', async () => {
    const deps = makeDeps();
    await makeEngine(deps).execute(makeContext('client-message', { text: 'hello' }));
    const outbound = (deps.publishToClient as jest.Mock).mock.calls[0][0] as Record<string, unknown>;
    expect(outbound['type']).toBe('response');
    expect(outbound['text']).toBe('hello');
    expect(outbound['channel']).toBe('ch-1');
  });

  test('persistToDatabase NOT called on client-only route', async () => {
    const deps = makeDeps();
    await makeEngine(deps).execute(makeContext('client-message', { text: 'hi' }));
    expect(deps.persistToDatabase).not.toHaveBeenCalled();
  });
});

describe('step routing — database', () => {
  test('persistToDatabase called with outbound message and context', async () => {
    const deps = makeDeps();
    const ctx = makeContext('db-message');
    await makeEngine(deps).execute(ctx);
    expect(deps.persistToDatabase).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'update-state', channel: 'ch-1' }),
      expect.objectContaining({ user: ctx.user })
    );
  });

  test('publishToClient NOT called on database-only route', async () => {
    const deps = makeDeps();
    await makeEngine(deps).execute(makeContext('db-message'));
    expect(deps.publishToClient).not.toHaveBeenCalled();
  });

});

describe('step routing — combined client + database', () => {
  test('both publishToClient and persistToDatabase called', async () => {
    const deps = makeDeps();
    await makeEngine(deps).execute(makeContext('combined-message'));
    expect(deps.publishToClient).toHaveBeenCalled();
    expect(deps.persistToDatabase).toHaveBeenCalled();
  });
});

describe('step routing — database-query', () => {
  test('executeQuery called with the query name and context', async () => {
    const deps = makeDeps();
    const ctx = makeContext('query-message');
    await makeEngine(deps).execute(ctx);
    expect(deps.executeQuery).toHaveBeenCalledWith('get-docs', ctx);
  });

  test('query result triggers recursive handler execution', async () => {
    const deps = makeDeps({ executeQuery: jest.fn().mockResolvedValue({ total: 5 }) });
    await makeEngine(deps).execute(makeContext('query-message'));
    // query-result handler has a client route → publishToClient should fire
    expect(deps.publishToClient).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'result', channel: 'ch-1' })
    );
  });
});

describe('step routing — ai', () => {
  test('sendToAi called with channel, text, senderEmail, config, user, correlationId', async () => {
    const deps = makeDeps();
    await makeEngine(deps).execute(makeContext('ai-message', { text: 'hi', senderEmail: 's@test.com', context: 'ctx-val' }));
    const [channel, text, senderEmail, config, user, correlationId] = (deps.sendToAi as jest.Mock).mock.calls[0];
    expect(channel).toBe('ch-1');
    expect(text).toBe('hi');
    expect(senderEmail).toBe('s@test.com');
    expect(config.systemPrompt).toBe('Ctx: ctx-val');
    expect(user).toEqual({ id: 'u-1', email: 'test@example.com' });
    expect(typeof correlationId).toBe('string');
  });

  test('publishToClient NOT called on ai-only route', async () => {
    const deps = makeDeps();
    await makeEngine(deps).execute(makeContext('ai-message', { text: 'hi', context: 'c' }));
    expect(deps.publishToClient).not.toHaveBeenCalled();
  });

  test('maxTurns forwarded to sendToAi config when set on the step', async () => {
    const deps = makeDeps();
    await makeEngine(deps).execute(makeContext('ai-message-with-max-turns', { text: 'hi', context: 'c' }));
    const [, , , config] = (deps.sendToAi as jest.Mock).mock.calls[0];
    expect(config.maxTurns).toBe(20);
  });

  test('maxTurns is undefined in forwarded config when not set on the step', async () => {
    const deps = makeDeps();
    await makeEngine(deps).execute(makeContext('ai-message', { text: 'hi', context: 'c' }));
    const [, , , config] = (deps.sendToAi as jest.Mock).mock.calls[0];
    expect(config.maxTurns).toBeUndefined();
  });
});

describe('step routing — unknown route', () => {
  test('logWorkflowStep called with error', async () => {
    const deps = makeDeps();
    await makeEngine(deps).execute(makeContext('unknown-route-message'));
    expect(deps.logWorkflowStep).toHaveBeenCalledWith(expect.objectContaining({ logType: 'error' }));
  });
});

describe('multi-step handler', () => {
  test('all steps run in order', async () => {
    const calls: string[] = [];
    const deps = makeDeps({
      publishToClient: jest.fn().mockImplementation(() => { calls.push('publish'); return Promise.resolve(); }),
      persistToDatabase: jest.fn().mockImplementation(() => { calls.push('persist'); return Promise.resolve(); }),
    });
    await makeEngine(deps).execute(makeContext('multi-step-message'));
    expect(calls).toEqual(['publish', 'persist']);
  });
});

// ─── simple transformer ───────────────────────────────────────────────────────

describe('simple transformer', () => {
  async function resolvedOutbound(type: string, extra: Record<string, unknown> = {}) {
    const deps = makeDeps();
    await makeEngine(deps).execute(makeContext(type, extra));
    return (deps.publishToClient as jest.Mock).mock.calls[0][0] as Record<string, unknown>;
  }

  test('$message.* resolves from context message', async () => {
    const out = await resolvedOutbound('client-message', { text: 'world' });
    expect(out['text']).toBe('world');
  });

  test('$state.* preserved as-is (not server-resolved)', async () => {
    const out = await resolvedOutbound('state-path-message');
    expect(out['ref']).toBe('$state.foo');
    expect(out['tmp']).toBe('$temp.bar');
  });

  test('$state.*/$temp.* stay literal even when context.state is populated (regression guard)', async () => {
    const deps = makeDeps({ getArtifactState: jest.fn().mockResolvedValue({ foo: 'should-not-leak' }) });
    await makeEngine(deps).execute(makeContext('state-path-message'));
    const out = (deps.publishToClient as jest.Mock).mock.calls[0][0] as Record<string, unknown>;
    expect(out['ref']).toBe('$state.foo');
    expect(out['tmp']).toBe('$temp.bar');
  });

  test('non-$ literal value passes through unchanged', async () => {
    const out = await resolvedOutbound('client-message', { text: 'hi' });
    expect(out['type']).toBe('response');
  });

  test('nested object resolved recursively', async () => {
    const out = await resolvedOutbound('nested-transform-message', { key: 'k-val' });
    expect((out['meta'] as Record<string, unknown>)['key']).toBe('k-val');
  });

  test('array values resolved element-wise', async () => {
    const out = await resolvedOutbound('array-transform-message', { a: 'x', b: 'y' });
    expect(out['items']).toEqual(['x', 'y']);
  });

  test('clientMessageType renamed to type in outbound', async () => {
    const out = await resolvedOutbound('rename-type-message');
    expect(out['type']).toBe('renamed');
    expect(out['clientMessageType']).toBeUndefined();
    expect(out['extra']).toBe('val');
  });
});

// ─── JSONata transformer ──────────────────────────────────────────────────────

describe('JSONata transformer', () => {
  test('evaluates expression and resolves value from context', async () => {
    const deps = makeDeps();
    await makeEngine(deps).execute(makeContext('jsonata-message', { text: 'jsonata-val' }));
    const out = (deps.publishToClient as jest.Mock).mock.calls[0][0] as Record<string, unknown>;
    expect(out['type']).toBe('jsonata-response');
    expect(out['text']).toBe('jsonata-val');
  });
});

// ─── prompt template ─────────────────────────────────────────────────────────

describe('prompt template substitution', () => {
  test('{{$message.name}} is interpolated into the AI system prompt', async () => {
    const deps = makeDeps();
    await makeEngine(deps).execute(makeContext('prompt-template-message', { name: 'Denis' }));
    const [, , , config] = (deps.sendToAi as jest.Mock).mock.calls[0];
    expect(config.systemPrompt).toContain('Denis');
  });

  test('missing key in template replaced with empty string', async () => {
    const deps = makeDeps();
    await makeEngine(deps).execute(makeContext('prompt-template-message', { name: 'Denis' }));
    const [, , , config] = (deps.sendToAi as jest.Mock).mock.calls[0];
    expect(config.systemPrompt).toContain('missing: ');
    expect(config.systemPrompt).not.toContain('{{');
  });
});

// ─── context.state population ────────────────────────────────────────────────

describe('context.state population', () => {
  test('{{state.x}} resolves via getArtifactState', async () => {
    const getArtifactState = jest.fn().mockResolvedValue({ poemDraft: 'hello world' });
    const deps = makeDeps({ getArtifactState });
    await makeEngine(deps).execute(makeContext('state-prompt-message'));
    const [, , , config] = (deps.sendToAi as jest.Mock).mock.calls[0];
    expect(config.systemPrompt).toContain('Draft: hello world');
    expect(getArtifactState).toHaveBeenCalledWith('art-1');
  });

  test('getArtifactState not called when channel has no artifact', async () => {
    const getArtifactState = jest.fn().mockResolvedValue({ poemDraft: 'hello world' });
    const deps = makeDeps({
      getChannelContext: jest.fn().mockResolvedValue({ workflowType: 'test-workflow' }),
      getArtifactState,
    });
    await makeEngine(deps).execute(makeContext('state-prompt-message'));
    const [, , , config] = (deps.sendToAi as jest.Mock).mock.calls[0];
    expect(config.systemPrompt).toContain('Draft: ');
    expect(getArtifactState).not.toHaveBeenCalled();
  });

  test('getArtifactState not called when context.state is already provided', async () => {
    const getArtifactState = jest.fn().mockResolvedValue({ poemDraft: 'hello world' });
    const deps = makeDeps({ getArtifactState });
    const ctx: WorkflowContext = { ...makeContext('state-prompt-message'), state: { poemDraft: 'existing' } };
    await makeEngine(deps).execute(ctx);
    const [, , , config] = (deps.sendToAi as jest.Mock).mock.calls[0];
    expect(config.systemPrompt).toContain('Draft: existing');
    expect(getArtifactState).not.toHaveBeenCalled();
  });
});

// ─── logWorkflowStep ─────────────────────────────────────────────────────────

describe('logWorkflowStep', () => {
  test('handler entry logged before steps run', async () => {
    const deps = makeDeps();
    await makeEngine(deps).execute(makeContext('client-message', { text: 'x' }));
    const calls = (deps.logWorkflowStep as jest.Mock).mock.calls.map((c) => c[0]);
    expect(calls.some((e) => e.logType === 'handler')).toBe(true);
  });

  test('route logged for each step', async () => {
    const deps = makeDeps();
    await makeEngine(deps).execute(makeContext('client-message', { text: 'x' }));
    const calls = (deps.logWorkflowStep as jest.Mock).mock.calls.map((c) => c[0]);
    expect(calls.some((e) => e.logType === 'route')).toBe(true);
  });

  test('parentExecutionId threaded through on recursive query call', async () => {
    const deps = makeDeps();
    await makeEngine(deps).execute(makeContext('query-message'));
    const calls = (deps.logWorkflowStep as jest.Mock).mock.calls.map((c) => c[0]);
    const handlerLogs = calls.filter((e) => e.logType === 'handler');
    // second handler log (query-result) should have a parentExecutionId set
    expect(handlerLogs.length).toBeGreaterThanOrEqual(2);
    expect(handlerLogs[1].parentExecutionId).toBeTruthy();
  });
});

// ─── requiredAccess guard ─────────────────────────────────────────────────────

describe('requiredAccess guard', () => {
  test('read level denied when handler requires write', async () => {
    const deps = makeDeps();
    await makeEngine(deps).execute(makeContext('write-required-message', {}, 'read'));
    expect(deps.publishToClient).not.toHaveBeenCalled();
    expect(deps.logWorkflowStep).toHaveBeenCalledWith(expect.objectContaining({ logType: 'error' }));
  });

  test('write level allowed when handler requires write', async () => {
    const deps = makeDeps();
    await makeEngine(deps).execute(makeContext('write-required-message', {}, 'write'));
    expect(deps.publishToClient).toHaveBeenCalled();
  });

  test('admin level allowed when handler requires write', async () => {
    const deps = makeDeps();
    await makeEngine(deps).execute(makeContext('write-required-message', {}, 'admin'));
    expect(deps.publishToClient).toHaveBeenCalled();
  });

  test('write level denied when handler requires admin', async () => {
    const deps = makeDeps();
    await makeEngine(deps).execute(makeContext('admin-required-message', {}, 'write'));
    expect(deps.publishToClient).not.toHaveBeenCalled();
    expect(deps.logWorkflowStep).toHaveBeenCalledWith(expect.objectContaining({ logType: 'error' }));
  });

  test('absent permissionLevel defaults to none and is denied when write is required', async () => {
    const deps = makeDeps();
    await makeEngine(deps).execute(makeContext('write-required-message'));
    expect(deps.publishToClient).not.toHaveBeenCalled();
    expect(deps.logWorkflowStep).toHaveBeenCalledWith(expect.objectContaining({ logType: 'error' }));
  });

  test('unrestricted handler executes regardless of permissionLevel', async () => {
    const deps = makeDeps();
    await makeEngine(deps).execute(makeContext('unrestricted-message', {}, 'none'));
    expect(deps.publishToClient).toHaveBeenCalled();
  });
});

// ─── composable context ───────────────────────────────────────────────────────

describe('composable context — groupId and parentChannel', () => {
  test('$groupId resolves from channelCtx.groupId when not set on context', async () => {
    const deps = makeDeps({
      getChannelContext: jest.fn().mockResolvedValue({ workflowType: 'test-workflow', artifactId: 'art-1', groupId: 'grp-42' }),
    });
    await makeEngine(deps).execute(makeContext('groupid-message'));
    const out = (deps.publishToClient as jest.Mock).mock.calls[0][0] as Record<string, unknown>;
    expect(out['gid']).toBe('grp-42');
  });

  test('$groupId from caller context takes precedence over channelCtx', async () => {
    const deps = makeDeps({
      getChannelContext: jest.fn().mockResolvedValue({ workflowType: 'test-workflow', artifactId: 'art-1', groupId: 'grp-from-channel' }),
    });
    const ctx: WorkflowContext = { ...makeContext('groupid-message'), groupId: 'grp-from-caller' };
    await makeEngine(deps).execute(ctx);
    const out = (deps.publishToClient as jest.Mock).mock.calls[0][0] as Record<string, unknown>;
    expect(out['gid']).toBe('grp-from-caller');
  });
});

describe('"parent" route', () => {
  test('invokes responseHandler on parentChannel instead of current channel', async () => {
    const deps = makeDeps({
      getChannelContext: jest.fn().mockResolvedValue({
        workflowType: 'test-workflow',
        artifactId: 'art-1',
        parentChannelId: 'parent-ch',
        responseHandler: 'parent-response-handler',
      }),
    });
    await makeEngine(deps).execute(makeContext('parent-route-message', { text: 'hello-up' }));
    const out = (deps.publishToClient as jest.Mock).mock.calls[0][0] as Record<string, unknown>;
    expect(out['channel']).toBe('parent-ch');
    expect(out['type']).toBe('parent-notification');
    expect(out['text']).toBe('hello-up');
  });

  test('logs error and skips when no parentChannel in context', async () => {
    const deps = makeDeps();
    await makeEngine(deps).execute(makeContext('parent-route-message', { text: 'hi' }));
    expect(deps.publishToClient).not.toHaveBeenCalled();
    expect(deps.logWorkflowStep).toHaveBeenCalledWith(expect.objectContaining({ logType: 'error' }));
  });

  test('logs error and skips when channel has no responseHandler', async () => {
    const deps = makeDeps({
      getChannelContext: jest.fn().mockResolvedValue({ workflowType: 'test-workflow', artifactId: 'art-1', parentChannelId: 'parent-ch' }),
    });
    await makeEngine(deps).execute(makeContext('parent-route-message', { text: 'hi' }));
    expect(deps.publishToClient).not.toHaveBeenCalled();
    expect(deps.logWorkflowStep).toHaveBeenCalledWith(expect.objectContaining({ logType: 'error' }));
  });
});

describe('stateless channel — database route skipped when no artifactId', () => {
  test('database route skipped for stateless channel', async () => {
    const deps = makeDeps({
      getChannelContext: jest.fn().mockResolvedValue({ workflowType: 'test-workflow' }),
    });
    await makeEngine(deps).execute(makeContext('db-message'));
    expect(deps.persistToDatabase).not.toHaveBeenCalled();
  });

  test('client route still fires for stateless channel', async () => {
    const deps = makeDeps({
      getChannelContext: jest.fn().mockResolvedValue({ workflowType: 'test-workflow' }),
    });
    await makeEngine(deps).execute(makeContext('combined-message'));
    expect(deps.publishToClient).toHaveBeenCalled();
    expect(deps.persistToDatabase).not.toHaveBeenCalled();
  });
});
