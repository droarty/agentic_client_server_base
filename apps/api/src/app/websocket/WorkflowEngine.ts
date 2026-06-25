import * as path from 'path';
import * as fs from 'fs';
import { randomUUID } from 'crypto';
import jsonata from 'jsonata';
import { OutboundMessage } from '@agentic-client-server-base/shared-types';

export interface AiStepConfig {
  model: string;
  maxTokens: number;
  systemPrompt: string;
  responseTypes?: string[];
}

interface StepDefinition {
  route: string | string[];
  transform?: Record<string, unknown>;
  ai?: AiStepConfig;
  query?: { name: string; responseType: string };
}

interface HandlerDefinition {
  transformer?: 'simple' | 'jsonata';
  condition?: string;
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
}

export interface WorkflowLogEntry {
  createdAt: Date;
  channel: string;
  docType: string;
  handlerName: string;
  logType: 'handler' | 'route' | 'error';
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
    correlationId?: string
  ) => void;
  getDocumentType: (channel: string) => Promise<string | null>;
  executeQuery?: (queryName: string, context: WorkflowContext) => Promise<Record<string, unknown>>;
  fetchCustomWorkflowConfig?: (docType: string) => Promise<WorkflowConfig | null>;
}

function resolveDotPath(obj: Record<string, unknown>, dotPath: string): unknown {
  return dotPath.split('.').reduce<unknown>((curr, key) => {
    if (curr == null || typeof curr !== 'object') return undefined;
    return (curr as Record<string, unknown>)[key];
  }, obj);
}

function resolveSimpleValue(value: unknown, context: WorkflowContext): unknown {
  if (typeof value === 'string' && value.startsWith('$')) {
    if (value === '$uuid') {
      return randomUUID();
    }
    if (value.startsWith('$state.') || value.startsWith('$temp.') || value.startsWith('$item.')) {
      return value;
    }
    const [root, ...rest] = value.slice(1).split('.');
    const rootObj = (context as unknown as Record<string, unknown>)[root] as Record<string, unknown>;
    if (rootObj == null) return undefined;
    if (rest.length === 0) return rootObj;
    return resolveDotPath(rootObj, rest.join('.'));
  }
  if (Array.isArray(value)) {
    return (value as unknown[]).map((item) => resolveSimpleValue(item, context));
  }
  if (typeof value === 'object' && value !== null) {
    return resolveTransformSimple(value as Record<string, unknown>, context);
  }
  return value;
}

function resolveTransformSimple(
  template: Record<string, unknown>,
  context: WorkflowContext
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(template)) {
    result[key] = resolveSimpleValue(value, context);
  }
  return result;
}

async function resolveTransformJsonata(
  template: Record<string, unknown>,
  context: WorkflowContext
): Promise<Record<string, unknown>> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(template)) {
    if (typeof value === 'string' && value.startsWith('$')) {
      try {
        const expr = jsonata(value.slice(1));
        result[key] = await expr.evaluate(context);
      } catch {
        result[key] = undefined;
      }
    } else {
      result[key] = value;
    }
  }
  return result;
}

async function evaluateCondition(
  condition: string,
  context: WorkflowContext,
  transformer: 'simple' | 'jsonata'
): Promise<boolean> {
  if (transformer === 'simple') {
    return Boolean(resolveSimpleValue(condition, context));
  }
  try {
    const expr = jsonata(condition.startsWith('$') ? condition.slice(1) : condition);
    return Boolean(await expr.evaluate(context));
  } catch {
    return false;
  }
}

function substitutePromptTemplate(template: string, context: WorkflowContext): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_, expr: string) => {
    const trimmed = expr.trim();
    const value = resolveSimpleValue(trimmed, context);
    return value == null ? '' : String(value);
  });
}

export class WorkflowEngine {
  private configCache = new Map<string, WorkflowConfig>();
  private docTypeCache = new Map<string, string>();

  constructor(
    private deps: WorkflowEngineDeps,
    private configDir: string
  ) { }

  async execute(context: WorkflowContext, parentExecutionId?: string, parentStepIndex?: number): Promise<void> {
    const executionId = randomUUID();
    const channel = context.message['channel'] as string;
    const type = context.message['type'] as string;

    const docType = await this.resolveDocumentType(channel);
    if (!docType) {
      this.deps.logWorkflowStep?.({ createdAt: new Date(), channel, docType: '', handlerName: type, logType: 'error', executionId, parentExecutionId, stepIndex: parentStepIndex, errorMessage: `no document type found for channel "${channel}"` });
      return;
    }

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

    const transformer = handler.transformer ?? 'simple';

    if (handler.condition) {
      const passes = await evaluateCondition(handler.condition, context, transformer);
      if (!passes) return;
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
      message: context.message,
      user: context.user,
      handlerConfig: handler,
    });

    for (let i = 0; i < handler.steps.length; i++) {
      await this.executeStep(handler.steps[i], transformer, context, docType, type, executionId, i);
    }
  }

  private async resolveDocumentType(channel: string): Promise<string | null> {
    if (this.docTypeCache.has(channel)) return this.docTypeCache.get(channel)!;
    const docType = await this.deps.getDocumentType(channel);
    if (docType) this.docTypeCache.set(channel, docType);
    return docType;
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
    transformer: 'simple' | 'jsonata',
    context: WorkflowContext,
    docType = '',
    handlerName = '',
    executionId = '',
    stepIndex = 0
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
      }, executionId, stepIndex);
      return;
    }

    if (routes.includes('ai') && step.ai) {
      const text = context.message['text'] as string;
      const senderEmail = context.message['senderEmail'] as string | undefined;
      this.deps.logWorkflowStep?.({
        createdAt: new Date(),
        channel,
        docType,
        handlerName,
        logType: 'route',
        executionId,
        stepIndex,
        route: 'ai',
        resolvedMessage: { text, senderEmail },
      });
      const resolvedPrompt = substitutePromptTemplate(step.ai.systemPrompt, context);
      this.deps.sendToAi(channel, text, senderEmail, { ...step.ai, systemPrompt: resolvedPrompt }, context.user, `${executionId}:${stepIndex}`);
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

      const resolved =
        step.transform
          ? transformer === 'jsonata'
            ? await resolveTransformJsonata(step.transform, context)
            : resolveTransformSimple(step.transform, context)
          : {};

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
      if (routes.includes('database')) ops.push(this.deps.persistToDatabase(outbound, context));
      await Promise.all(ops);
      return;
    }

    this.deps.logWorkflowStep?.({ createdAt: new Date(), channel, docType, handlerName, logType: 'error', executionId, stepIndex, errorMessage: `unknown route(s): ${routes.join(', ')}` });
  }
}
