import { ActionItem, InitializeClientMessage, LayoutNode, OutboundMessage, UpdateStateMessage } from '@multiplayer-base/shared-types';
import { eventManager } from './EventManager';
import { InboundMessage } from '@multiplayer-base/shared-types';

interface DocState {
  state: Record<string, unknown>;
  users: unknown[];
  temp: Record<string, unknown>;
}

export interface DocModel {
  layoutConfig: LayoutNode[];
  docState: DocState;
}

const EMPTY_MODEL: DocModel = {
  layoutConfig: [],
  docState: { state: {}, users: [], temp: {} },
};

const models     = new Map<string, DocModel>();
const listeners  = new Map<string, Set<() => void>>();
const initialized = new Set<string>();

function notifyListeners(channelId: string): void {
  listeners.get(channelId)?.forEach((cb) => cb());
}

export function subscribeToModel(channelId: string, cb: () => void): () => void {
  if (!listeners.has(channelId)) listeners.set(channelId, new Set());
  listeners.get(channelId)!.add(cb);
  return () => listeners.get(channelId)?.delete(cb);
}

export function getModelSnapshot(channelId: string): DocModel {
  return models.get(channelId) ?? EMPTY_MODEL;
}

// --- state mutation (moved verbatim from LayoutDocumentView) ---

function getAtPath(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((curr, key) => {
    if (curr == null || typeof curr !== 'object') return undefined;
    return (curr as Record<string, unknown>)[key];
  }, obj);
}

function setAtPath(obj: Record<string, unknown>, path: string, value: unknown): Record<string, unknown> {
  const keys = path.split('.');
  const result = { ...obj };
  let curr: Record<string, unknown> = result;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    curr[k] = typeof curr[k] === 'object' && curr[k] !== null ? { ...(curr[k] as Record<string, unknown>) } : {};
    curr = curr[k] as Record<string, unknown>;
  }
  curr[keys[keys.length - 1]] = value;
  return result;
}

function applyAction(next: Record<string, unknown>, action: ActionItem): Record<string, unknown> {
  const { actionType, path, value, keys } = action;
  switch (actionType) {
    case 'update':
      return setAtPath(next, path, value);
    case 'merge': {
      const existing = (getAtPath(next, path) as Record<string, unknown>) ?? {};
      return setAtPath(next, path, { ...existing, ...(value as Record<string, unknown>) });
    }
    case 'append': {
      const existing = (getAtPath(next, path) as unknown[]) ?? [];
      const items = Array.isArray(value) ? value : [value];
      return setAtPath(next, path, [...existing, ...items]);
    }
    case 'prepend': {
      const existing = (getAtPath(next, path) as unknown[]) ?? [];
      const items = Array.isArray(value) ? value : [value];
      return setAtPath(next, path, [...items, ...existing]);
    }
    case 'upsert': {
      if (!keys?.length) { console.error('applyAction: upsert missing keys', action); return next; }
      const item = value as Record<string, unknown>;
      const existing = (getAtPath(next, path) as unknown[]) ?? [];
      const idx = existing.findIndex((el) =>
        keys.every((k) => (el as Record<string, unknown>)[k] === item[k])
      );
      const updated = [...existing];
      if (idx >= 0) updated[idx] = item; else updated.push(item);
      return setAtPath(next, path, updated);
    }
    case 'remove': {
      if (!keys?.length) { console.error('applyAction: remove missing keys', action); return next; }
      const matcher = value as Record<string, unknown>;
      const existing = (getAtPath(next, path) as unknown[]) ?? [];
      return setAtPath(next, path, existing.filter(
        (el) => !keys.every((k) => (el as Record<string, unknown>)[k] === matcher[k])
      ));
    }
    default:
      return next;
  }
}

function applyActions(prev: DocState, msg: UpdateStateMessage): DocState {
  if (!msg.actions?.length) return prev;
  let next = prev as unknown as Record<string, unknown>;
  for (const action of msg.actions) {
    next = applyAction(next, action);
  }
  return next as unknown as DocState;
}

// --- channel lifecycle ---

function handleMessage(channelId: string, msg: OutboundMessage): void {
  const m = msg as unknown as Record<string, unknown>;
  if (m['type'] === 'initialize-client') {
    const im = msg as unknown as InitializeClientMessage;
    models.set(channelId, {
      layoutConfig: im.layoutConfig ?? [],
      docState: {
        state: (im.initialState as Record<string, unknown>) ?? {},
        users: im.users ?? [],
        temp: {},
      },
    });
  } else if (m['type'] === 'update-state') {
    const current = models.get(channelId);
    if (!current) return;
    const um = msg as unknown as UpdateStateMessage;
    models.set(channelId, { ...current, docState: applyActions(current.docState, um) });
  } else {
    return;
  }
  notifyListeners(channelId);
}

export function mountChannel(
  channelId: string,
  emit: (type: string, payload?: Record<string, unknown>) => void,
  viewHandler: string
): void {
  if (!channelId || initialized.has(channelId)) return;
  initialized.add(channelId);
  eventManager.subscribe(channelId, (msg) => handleMessage(channelId, msg));
  emit(viewHandler);
}
