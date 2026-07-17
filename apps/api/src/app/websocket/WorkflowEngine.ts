import * as path from 'path';
import * as fs from 'fs';
import { randomUUID } from 'crypto';
import jsonata from 'jsonata';
import { OutboundMessage } from '@agentic-client-server-base/shared-types';
import { AccessLevel, ACCESS_RANK } from './access-level';

export interface AiStepConfig {
  model: string;
  maxTokens: number;
  maxTurns?: number;
  systemPrompt: string;
  responseTypes?: string[];
  responseSchema?: Record<string, Record<string, 'string' | 'number' | 'boolean' | 'object'>>;
  referenceDocs?: string[];
  historyPath?: string;
  tools?: string[];
  docType?: string;
  handlerName?: string;
}

export interface AiHistoryTurn {
  role: 'user' | 'assistant';
  content: string;
}

interface StepDefinition {
  route: string | string[];
  transform?: Record<string, unknown>;
  ai?: AiStepConfig;
  query?: { name: string; responseType: string };
  queries?: Array<{ name: string; key: string }>;
  responseType?: string;
}

interface HandlerDefinition {
  condition?: string;
  requiredAccess?: 'read' | 'write' | 'admin';
  steps: StepDefinition[];
}

interface WorkflowConfig {
  name: string;
  version: string;
  handlers: Record<string, HandlerDefinition>;
}

export interface WorkflowContext {
  message: Record<string, unknown>;
  user?: Record<string, unknown>;
  state?: Record<string, unknown>;
  permissionLevel?: AccessLevel;
  groupId?: string;
  parentChannel?: string;
  targetChannelId?: string;
}

export interface WorkflowLogEntry {
  createdAt: Date;
  channel: string;
  docType: string;
  handlerName: string;
  logType: 'handler' | 'route' | 'error' | 'tool';
  executionId?: string;
  parentExecutionId?: string;
  stepIndex?: number;
  message?: Record<string, unknown>;
  user?: Record<string, unknown>;
  handlerConfig?: unknown;
  route?: string | string[];
  resolvedMessage?: Record<string, unknown>;
  errorMessage?: string;
  errorDetail?: unknown;
}

export interface ChannelContext {
  workflowType: string;
  artifactId?: string;
  groupId?: string;
  userId?: string;
  parentChannelId?: string;
  responseHandler?: string;
  targetChannelId?: string;
}

export interface WorkflowEngineDeps {
  publishToClient: (msg: OutboundMessage) => Promise<void>;
  persistToDatabase: (msg: OutboundMessage, context: WorkflowContext) => Promise<void>;
  logWorkflowStep?: (entry: WorkflowLogEntry) => void;
  sendToAi: (
    channel: string,
    text: string,
    senderEmail: string | undefined,
    aiConfig: AiStepConfig,
    user?: Record<string, unknown>,
    correlationId?: string,
    history?: AiHistoryTurn[]
  ) => void;
  getChannelContext: (channel: string) => Promise<ChannelContext | null>;
  getArtifactState?: (artifactId: string) => Promise<Record<string, unknown> | null>;
  executeQuery?: (queryName: string, context: WorkflowContext) => Promise<Record<string, unknown>>;
  fetchCustomWorkflowConfig?: (docType: string) => Promise<WorkflowConfig | null>;
}

function resolveDotPath(obj: Record<string, unknown>, dotPath: string): unknown {
  return dotPath.split('.').reduce<unknown>((curr, key) => {
    if (curr == null || typeof curr !== 'object') return undefined;
    return (curr as Record<string, unknown>)[key];
  }, obj);
}

// Resolves a single value against context.
// - `~{ expr }` → JSONata expression evaluated against { message, user, state }
// - `@state.x`, `@temp.x`, `@item.x` → passed through as-is for client-side resolution
// - `$message.x`, `$user.x`, `$uuid` → resolved immediately server-side
// - Everything else → returned as-is
async function resolveValue(value: unknown, context: WorkflowContext): Promise<unknown> {
  if (typeof value === 'string') {
    if (value.startsWith('~{') && value.endsWith('}')) {
      try {
        const expr = jsonata(value.slice(2, -1).trim());
        return await expr.evaluate(context);
      } catch {
        return undefined;
      }
    }
    if (value.startsWith('@')) {
      return value;
    }
    if (value.startsWith('$')) {
      if (value === '$uuid') return randomUUID();
      const [root, ...rest] = value.slice(1).split('.');
      if (root === 'state' || root === 'temp') return value; // action.path destinations — never server-resolved
      const rootObj = (context as unknown as Record<string, unknown>)[root] as Record<string, unknown>;
      if (rootObj == null) return value;
      if (rest.length === 0) return rootObj;
      return resolveDotPath(rootObj, rest.join('.'));
    }
  }
  if (Array.isArray(value)) {
    return Promise.all((value as unknown[]).map((item) => resolveValue(item, context)));
  }
  if (typeof value === 'object' && value !== null) {
    const obj = value as Record<string, unknown>;
    if ('$map' in obj) {
      const source = await resolveValue(obj['$map'], context);
      const entries: [unknown, unknown][] = Array.isArray(source)
        ? source.map((item, i) => [i, item])
        : source !== null && typeof source === 'object'
        ? Object.entries(source as Record<string, unknown>)
        : [];

      const kept: [unknown, unknown][] = [];
      for (const [key, item] of entries) {
        if ('$where' in obj) {
          const match = await resolveValue(obj['$where'], { ...context, item, key } as unknown as WorkflowContext);
          if (!match) continue;
        }
        kept.push([key, item]);
      }

      const mapped = await Promise.all(
        kept.map(([key, item]) =>
          resolveValue(obj['$using'], { ...context, item, key } as unknown as WorkflowContext)
        )
      );
      const head = Array.isArray(obj['$prepend'])
        ? await Promise.all(obj['$prepend'].map((entry) => resolveValue(entry, context)))
        : [];
      const tail = Array.isArray(obj['$append'])
        ? await Promise.all(obj['$append'].map((entry) => resolveValue(entry, context)))
        : [];
      return [...head, ...mapped, ...tail];
    }
    return resolveTransform(obj, context);
  }
  return value;
}

async function resolveTransform(
  template: Record<string, unknown>,
  context: WorkflowContext
): Promise<Record<string, unknown>> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(template)) {
    result[key] = await resolveValue(value, context);
  }
  return result;
}

async function evaluateCondition(condition: string, context: WorkflowContext): Promise<boolean> {
  return Boolean(await resolveValue(condition, context));
}

// Resolves `{{path.to.field}}` interpolations in AI system prompt strings.
// Uses simple dot-path resolution only (no JSONata, no client refs).
function substitutePromptTemplate(template: string, context: WorkflowContext): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_, expr: string) => {
    const path = expr.trim();
    const strippedPath = path.startsWith('$') ? path.slice(1) : path;
    const value = resolveDotPath(
      context as unknown as Record<string, unknown>,
      strippedPath
    );
    if (value == null) return '';
    return typeof value === 'object' ? JSON.stringify(value) : String(value);
  });
}

export class WorkflowEngine {
  private configCache = new Map<string, WorkflowConfig>();
  private channelContextCache = new Map<string, ChannelContext>();

  constructor(
    private deps: WorkflowEngineDeps,
    private configDir: string
  ) { }

  invalidateConfig(docType: string): void {
    this.configCache.delete(docType);
  }

  async execute(context: WorkflowContext, parentExecutionId?: string, parentStepIndex?: number): Promise<void> {
    const executionId = randomUUID();
    const channel = context.message['channel'] as string;
    const type = context.message['type'] as string;

    const channelCtx = await this.resolveChannelContext(channel);
    if (!channelCtx) {
      this.deps.logWorkflowStep?.({ createdAt: new Date(), channel, docType: '', handlerName: type, logType: 'error', executionId, parentExecutionId, stepIndex: parentStepIndex, errorMessage: `no channel context found for channel "${channel}"` });
      return;
    }
    const docType = channelCtx.workflowType;

    // Fetch live document state once per top-level execution chain — recursive
    // database-query/parallel-queries continuations already forward context.state
    // unchanged, so this only fires when the caller hasn't supplied one yet.
    const state = context.state ?? (channelCtx.artifactId && this.deps.getArtifactState
      ? (await this.deps.getArtifactState(channelCtx.artifactId)) ?? undefined
      : context.state);

    // Enrich context with channel-derived fields (caller's values take precedence)
    const enrichedContext: WorkflowContext = {
      ...context,
      state,
      groupId: context.groupId ?? channelCtx.groupId,
      parentChannel: context.parentChannel ?? channelCtx.parentChannelId,
      targetChannelId: context.targetChannelId ?? channelCtx.targetChannelId,
    };
    const hasArtifact = !!channelCtx.artifactId;

    const config = await this.loadConfig(docType);
    if (!config) {
      this.deps.logWorkflowStep?.({ createdAt: new Date(), channel, docType, handlerName: type, logType: 'error', executionId, parentExecutionId, stepIndex: parentStepIndex, errorMessage: `no config found for document type "${docType}"` });
      return;
    }

    const handler = config.handlers[type];
    if (!handler) {
      this.deps.logWorkflowStep?.({ createdAt: new Date(), channel, docType, handlerName: type, logType: 'error', executionId, parentExecutionId, stepIndex: parentStepIndex, errorMessage: `no handler for message type "${type}" in config "${docType}"` });
      return;
    }

    if (handler.condition) {
      const passes = await evaluateCondition(handler.condition, enrichedContext);
      if (!passes) return;
    }

    if (handler.requiredAccess) {
      const level = enrichedContext.permissionLevel ?? 'none';
      if (ACCESS_RANK[level] < ACCESS_RANK[handler.requiredAccess]) {
        const userId = enrichedContext.user?.['id'] as string | undefined;
        this.deps.logWorkflowStep?.({ createdAt: new Date(), channel, docType, handlerName: type, logType: 'error', executionId, parentExecutionId, stepIndex: parentStepIndex, errorMessage: `handler "${type}" requires access "${handler.requiredAccess}" — denied for user ${userId ?? '(unknown)'}` });
        return;
      }
    }

    this.deps.logWorkflowStep?.({
      createdAt: new Date(),
      channel,
      docType,
      handlerName: type,
      logType: 'handler',
      executionId,
      parentExecutionId,
      stepIndex: parentStepIndex,
      message: enrichedContext.message,
      user: enrichedContext.user,
      handlerConfig: handler,
    });

    for (let i = 0; i < handler.steps.length; i++) {
      await this.executeStep(handler.steps[i], enrichedContext, docType, type, executionId, i, hasArtifact);
    }
  }

  private async resolveChannelContext(channel: string): Promise<ChannelContext | null> {
    if (this.channelContextCache.has(channel)) return this.channelContextCache.get(channel)!;
    const ctx = await this.deps.getChannelContext(channel);
    if (ctx) this.channelContextCache.set(channel, ctx);
    return ctx;
  }

  private async loadConfig(docType: string): Promise<WorkflowConfig | null> {
    if (this.configCache.has(docType)) return this.configCache.get(docType)!;

    const configPath = path.join(this.configDir, `${docType}.json`);
    if (fs.existsSync(configPath)) {
      try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as WorkflowConfig;
        this.configCache.set(docType, config);
        return config;
      } catch (err) {
        this.deps.logWorkflowStep?.({ createdAt: new Date(), channel: '', docType, handlerName: '', logType: 'error', errorMessage: `failed to load config "${docType}.json"`, errorDetail: String(err) });
        return null;
      }
    }

    if (this.deps.fetchCustomWorkflowConfig) {
      const config = await this.deps.fetchCustomWorkflowConfig(docType);
      if (config) {
        this.configCache.set(docType, config);
        return config;
      }
    }

    return null;
  }

  private async executeStep(
    step: StepDefinition,
    context: WorkflowContext,
    docType = '',
    handlerName = '',
    executionId = '',
    stepIndex = 0,
    hasArtifact = true
  ): Promise<void> {
    const routes = Array.isArray(step.route) ? step.route : [step.route];
    const channel = context.message['channel'] as string;

    if (routes.includes('database-query') && step.query && this.deps.executeQuery) {
      this.deps.logWorkflowStep?.({
        createdAt: new Date(),
        channel,
        docType,
        handlerName,
        logType: 'route',
        executionId,
        stepIndex,
        route: 'database-query',
        resolvedMessage: { queryName: step.query.name, responseType: step.query.responseType },
      });
      const result = await this.deps.executeQuery(step.query.name, context);
      await this.execute({
        message: {
          type: step.query.responseType,
          channel: context.message['channel'],
          timestamp: new Date().toISOString(),
          ...result,
        },
        user: context.user,
        state: context.state,
        permissionLevel: context.permissionLevel,
        groupId: context.groupId,
        parentChannel: context.parentChannel,
      }, executionId, stepIndex);
      return;
    }

    if (routes.includes('parallel-queries') && step.queries && step.responseType && this.deps.executeQuery) {
      this.deps.logWorkflowStep?.({
        createdAt: new Date(),
        channel,
        docType,
        handlerName,
        logType: 'route',
        executionId,
        stepIndex,
        route: 'parallel-queries',
        resolvedMessage: { queries: step.queries, responseType: step.responseType },
      });
      const results = await Promise.all(
        step.queries.map(q => this.deps.executeQuery!(q.name, context))
      );
      const merged = Object.fromEntries(
        step.queries.map((q, i) => [q.key, results[i][q.key] ?? results[i]])
      );
      await this.execute(
        {
          message: {
            type: step.responseType,
            channel: context.message['channel'],
            timestamp: new Date().toISOString(),
            ...merged,
          },
          user: context.user,
          state: context.state,
          permissionLevel: context.permissionLevel,
          groupId: context.groupId,
          parentChannel: context.parentChannel,
        },
        executionId,
        stepIndex,
      );
      return;
    }

    if (routes.includes('ai') && step.ai) {
      const text = context.message['text'] as string;
      const senderEmail = context.message['senderEmail'] as string | undefined;
      const referenceContent = (step.ai.referenceDocs ?? [])
        .map((relPath) => {
          try {
            return fs.readFileSync(path.join(process.cwd(), relPath), 'utf-8');
          } catch {
            return '';
          }
        })
        .filter(Boolean)
        .join('\n\n');

      // Re-fetch fresh artifact state right before the AI call — context.state was
      // snapshotted once at the top of execute(), before any earlier steps in this
      // handler chain persisted their own $state.* mutations.
      let freshState = context.state;
      if (hasArtifact && this.deps.getArtifactState) {
        const channelCtx = await this.resolveChannelContext(channel);
        if (channelCtx?.artifactId) {
          freshState = (await this.deps.getArtifactState(channelCtx.artifactId)) ?? context.state;
        }
      }
      const aiContext: WorkflowContext = { ...context, state: freshState };

      const resolvedPrompt = substitutePromptTemplate(step.ai.systemPrompt, aiContext);
      const fullPrompt = referenceContent ? `${referenceContent}\n\n---\n\n${resolvedPrompt}` : resolvedPrompt;
      let history: AiHistoryTurn[] | undefined;
      if (step.ai.historyPath) {
        const strippedPath = step.ai.historyPath.startsWith('$') ? step.ai.historyPath.slice(1) : step.ai.historyPath;
        const raw = resolveDotPath(aiContext as unknown as Record<string, unknown>, strippedPath);
        if (Array.isArray(raw)) {
          history = [];
          for (const m of raw as Record<string, unknown>[]) {
            const role = m['messageType'] === 'user-text' ? 'user' : m['messageType'] === 'ai-reply' ? 'assistant' : null;
            if (!role) continue;
            const content = String(m['text'] ?? '');
            const last = history[history.length - 1];
            if (last && last.role === role) last.content += `\n${content}`;
            else history.push({ role, content });
          }
        }
        if (!history || history.length === 0) {
          this.deps.logWorkflowStep?.({
            createdAt: new Date(),
            channel,
            docType,
            handlerName,
            logType: 'error',
            executionId,
            stepIndex,
            errorMessage: `AI step "${handlerName}": historyPath "${step.ai.historyPath}" did not resolve to any messages`,
            errorDetail: `resolved "${step.ai.historyPath}" relative to { message, user, state } = ${JSON.stringify(raw)}`,
          });
        }
      }
      this.deps.logWorkflowStep?.({
        createdAt: new Date(),
        channel,
        docType,
        handlerName,
        logType: 'route',
        executionId,
        stepIndex,
        route: 'ai',
        resolvedMessage: {
          text,
          senderEmail,
          model: step.ai.model,
          maxTokens: step.ai.maxTokens,
          systemPrompt: fullPrompt,
          tools: step.ai.tools,
          responseTypes: step.ai.responseTypes,
          historyPath: step.ai.historyPath,
          history,
        },
      });
      if ((!history || history.length === 0) && !text?.trim()) {
        this.deps.logWorkflowStep?.({
          createdAt: new Date(),
          channel,
          docType,
          handlerName,
          logType: 'error',
          executionId,
          stepIndex,
          errorMessage: `AI step "${handlerName}": no text and no resolved history — nothing to send to AI`,
        });
        return;
      }
      this.deps.sendToAi(channel, text, senderEmail, { ...step.ai, systemPrompt: fullPrompt, docType, handlerName }, context.user, `${executionId}:${stepIndex}`, history);
      return;
    }

    if (routes.includes('parent')) {
      if (!context.parentChannel) {
        this.deps.logWorkflowStep?.({ createdAt: new Date(), channel, docType, handlerName, logType: 'error', executionId, stepIndex, errorMessage: 'parent route: no parentChannel in context, skipping' });
        return;
      }
      const childCtx = await this.resolveChannelContext(channel);
      const responseHandler = childCtx?.responseHandler;
      if (!responseHandler) {
        this.deps.logWorkflowStep?.({ createdAt: new Date(), channel, docType, handlerName, logType: 'error', executionId, stepIndex, errorMessage: 'parent route: no responseHandler on channel, skipping' });
        return;
      }
      const resolved = step.transform ? await resolveTransform(step.transform, context) : {};
      this.deps.logWorkflowStep?.({ createdAt: new Date(), channel, docType, handlerName, logType: 'route', executionId, stepIndex, route: 'parent', resolvedMessage: resolved });
      await this.execute({
        message: { type: responseHandler, channel: context.parentChannel, timestamp: new Date().toISOString(), ...resolved },
        user: context.user,
        permissionLevel: context.permissionLevel,
      }, executionId, stepIndex);
      return;
    }

    if (routes.includes('client') || routes.includes('database')) {
      const base: Record<string, unknown> = {
        id: randomUUID(),
        from: 'server',
        to: 'client',
        channel: context.message['channel'],
        timestamp: new Date().toISOString(),
      };

      const resolved = step.transform ? await resolveTransform(step.transform, context) : {};

      if ('clientMessageType' in resolved) {
        resolved['type'] = resolved['clientMessageType'];
        delete resolved['clientMessageType'];
      }

      this.deps.logWorkflowStep?.({
        createdAt: new Date(),
        channel,
        docType,
        handlerName,
        logType: 'route',
        executionId,
        stepIndex,
        route: routes,
        resolvedMessage: resolved,
      });

      const outbound = { ...base, ...resolved } as unknown as OutboundMessage;

      const ops: Promise<void>[] = [];
      if (routes.includes('client')) ops.push(this.deps.publishToClient(outbound));
      if (routes.includes('database') && hasArtifact) ops.push(this.deps.persistToDatabase(outbound, context));
      await Promise.all(ops);
      return;
    }

    this.deps.logWorkflowStep?.({ createdAt: new Date(), channel, docType, handlerName, logType: 'error', executionId, stepIndex, errorMessage: `unknown route(s): ${routes.join(', ')}` });
  }
}
