import * as path from 'path';
import * as fs from 'fs';
import { randomUUID } from 'crypto';
import jsonata from 'jsonata';
import { OutboundMessage } from '@multiplayer-base/shared-types';

export interface AiStepConfig {
  model: string;
  maxTokens: number;
  systemPrompt: string;
}

interface StepDefinition {
  route: string | string[];
  transform?: Record<string, unknown>;
  ai?: AiStepConfig;
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

export interface WorkflowEngineDeps {
  publishToClient: (msg: OutboundMessage) => Promise<void>;
  persistToDatabase: (msg: OutboundMessage) => Promise<void>;
  sendToAi: (
    channel: string,
    text: string,
    senderEmail: string | undefined,
    aiConfig: AiStepConfig
  ) => void;
  getDocumentType: (channel: string) => Promise<string | null>;
}

function resolveDotPath(obj: Record<string, unknown>, dotPath: string): unknown {
  return dotPath.split('.').reduce<unknown>((curr, key) => {
    if (curr == null || typeof curr !== 'object') return undefined;
    return (curr as Record<string, unknown>)[key];
  }, obj);
}

function resolveSimpleValue(value: unknown, context: WorkflowContext): unknown {
  if (typeof value !== 'string' || !value.startsWith('$')) return value;
  const [root, ...rest] = value.slice(1).split('.');
  const rootObj = (context as unknown as Record<string, unknown>)[root] as Record<string, unknown>;
  if (rootObj == null) return undefined;
  if (rest.length === 0) return rootObj;
  return resolveDotPath(rootObj, rest.join('.'));
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
  ) {}

  async execute(context: WorkflowContext): Promise<void> {
    const channel = context.message['channel'] as string;
    const type = context.message['type'] as string;

    const docType = await this.resolveDocumentType(channel);
    if (!docType) return;

    const config = this.loadConfig(docType);
    if (!config) return;

    const handler = config.handlers[type];
    if (!handler) return;

    const transformer = handler.transformer ?? 'simple';

    if (handler.condition) {
      const passes = await evaluateCondition(handler.condition, context, transformer);
      if (!passes) return;
    }

    for (const step of handler.steps) {
      await this.executeStep(step, transformer, context);
    }
  }

  private async resolveDocumentType(channel: string): Promise<string | null> {
    if (this.docTypeCache.has(channel)) return this.docTypeCache.get(channel)!;
    const docType = await this.deps.getDocumentType(channel);
    if (docType) this.docTypeCache.set(channel, docType);
    return docType;
  }

  private loadConfig(docType: string): WorkflowConfig | null {
    if (this.configCache.has(docType)) return this.configCache.get(docType)!;
    const configPath = path.join(this.configDir, `${docType}.json`);
    if (!fs.existsSync(configPath)) return null;
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as WorkflowConfig;
      this.configCache.set(docType, config);
      return config;
    } catch (err) {
      console.error(`WorkflowEngine: failed to load config "${docType}.json":`, err);
      return null;
    }
  }

  private async executeStep(
    step: StepDefinition,
    transformer: 'simple' | 'jsonata',
    context: WorkflowContext
  ): Promise<void> {
    const routes = Array.isArray(step.route) ? step.route : [step.route];

    if (routes.includes('ai') && step.ai) {
      const text = context.message['text'] as string;
      const channel = context.message['channel'] as string;
      const senderEmail = context.message['senderEmail'] as string | undefined;
      const resolvedPrompt = substitutePromptTemplate(step.ai.systemPrompt, context);
      this.deps.sendToAi(channel, text, senderEmail, { ...step.ai, systemPrompt: resolvedPrompt });
      return;
    }

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

    const outbound = { ...base, ...resolved } as unknown as OutboundMessage;

    const ops: Promise<void>[] = [];
    if (routes.includes('client')) ops.push(this.deps.publishToClient(outbound));
    if (routes.includes('database')) ops.push(this.deps.persistToDatabase(outbound));
    await Promise.all(ops);
  }
}
