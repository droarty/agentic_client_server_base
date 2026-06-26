import { ActionItem, InitializeStateMessage, InitializeViewMessage, LayoutNode, OutboundMessage, UpdateStateMessage } from '@agentic-client-server-base/shared-types';
import { eventManager } from './EventManager';
import { InboundMessage } from '@agentic-client-server-base/shared-types';

interface DocState {
  state: Record<string, unknown>;
  temp: Record<string, unknown>;
}

export interface DocModel {
  layoutConfig: LayoutNode[];
  docState: DocState;
}

interface ChannelData {
  docState: DocState;
  layouts: Map<string, LayoutNode[]>;
  snapshots: Map<string, DocModel>;
  stateInitialized: boolean;
}

const EMPTY_MODEL: DocModel = {
  layoutConfig: [],
  docState: { state: {}, temp: {} },
};

const channelData    = new Map<string, ChannelData>();
const listeners      = new Map<string, Set<() => void>>();  // key: "channelId:viewHandler"
const chSubscribed   = new Set<string>();
const vhEmitted      = new Set<string>();                   // key: "channelId:viewHandler"
const pendingUpdates = new Map<string, UpdateStateMessage[]>();

function getOrCreateChannelData(channelId: string): ChannelData {
  if (!channelData.has(channelId)) {
    channelData.set(channelId, {
      docState: { state: {}, temp: {} },
      layouts: new Map(),
      snapshots: new Map(),
      stateInitialized: false,
    });
  }
  return channelData.get(channelId)!;
}

function notifyAll(channelId: string): void {
  const prefix = `${channelId}:`;
  for (const [key, cbs] of listeners) {
    if (key.startsWith(prefix)) cbs.forEach((cb) => cb());
  }
}

export function subscribeToModel(channelId: string, viewHandler: string, cb: () => void): () => void {
  const key = `${channelId}:${viewHandler}`;
  if (!listeners.has(key)) listeners.set(key, new Set());
  listeners.get(key)!.add(cb);
  return () => listeners.get(key)?.delete(cb);
}

export function getModelSnapshot(channelId: string, viewHandler: string): DocModel {
  const data = channelData.get(channelId);
  if (!data?.stateInitialized || !data.layouts.has(viewHandler)) {
    return EMPTY_MODEL;
  }
  return data.snapshots.get(viewHandler) ?? EMPTY_MODEL;
}

// --- state mutation ---

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
    const child = curr[k];
    if (Array.isArray(child)) {
      const copy = [...child] as unknown[];
      curr[k] = copy;
      curr = copy as unknown as Record<string, unknown>;
    } else {
      curr[k] = typeof child === 'object' && child !== null ? { ...(child as Record<string, unknown>) } : {};
      curr = curr[k] as Record<string, unknown>;
    }
  }
  curr[keys[keys.length - 1]] = value;
  return result;
}

function applyAction(next: Record<string, unknown>, action: ActionItem): Record<string, unknown> {
  const { actionType, path, value, keys } = action;
  const resolvedPath = path.startsWith('$') ? path.slice(1) : path;
  switch (actionType) {
    case 'update':
      return setAtPath(next, resolvedPath, value);
    case 'merge': {
      const existing = (getAtPath(next, resolvedPath) as Record<string, unknown>) ?? {};
      return setAtPath(next, resolvedPath, { ...existing, ...(value as Record<string, unknown>) });
    }
    case 'append': {
      const existing = (getAtPath(next, resolvedPath) as unknown[]) ?? [];
      const items = Array.isArray(value) ? value : [value];
      return setAtPath(next, resolvedPath, [...existing, ...items]);
    }
    case 'prepend': {
      const existing = (getAtPath(next, resolvedPath) as unknown[]) ?? [];
      const items = Array.isArray(value) ? value : [value];
      return setAtPath(next, resolvedPath, [...items, ...existing]);
    }
    case 'upsert': {
      if (!keys?.length) { console.error('applyAction: upsert missing keys', action); return next; }
      const item = value as Record<string, unknown>;
      const existing = (getAtPath(next, resolvedPath) as unknown[]) ?? [];
      const idx = existing.findIndex((el) =>
        keys.every((k) => (el as Record<string, unknown>)[k] === item[k])
      );
      const updated = [...existing];
      if (idx >= 0) updated[idx] = item; else updated.push(item);
      return setAtPath(next, resolvedPath, updated);
    }
    case 'remove': {
      if (!keys?.length) { console.error('applyAction: remove missing keys', action); return next; }
      const matcher = value as Record<string, unknown>;
      const existing = (getAtPath(next, resolvedPath) as unknown[]) ?? [];
      return setAtPath(next, resolvedPath, existing.filter(
        (el) => !keys.every((k) => (el as Record<string, unknown>)[k] === matcher[k])
      ));
    }
    case 'update-in': {
      const { findKey, findValue, subPath } = action;
      if (!findKey || !subPath) { console.error('applyAction: update-in missing findKey or subPath', action); return next; }
      const existing = (getAtPath(next, resolvedPath) as Record<string, unknown>[]) ?? [];
      const idx = existing.findIndex((el) => el[findKey] === findValue);
      if (idx < 0) return next;
      return setAtPath(next, `${resolvedPath}.${idx}.${subPath}`, value);
    }
    case 'slice': {
      const existing = (getAtPath(next, resolvedPath) as unknown[]) ?? [];
      return setAtPath(next, resolvedPath, existing.slice(action.start, action.end));
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

function rebuildAllSnapshots(data: ChannelData): void {
  for (const [vh, layout] of data.layouts) {
    data.snapshots.set(vh, { layoutConfig: layout, docState: data.docState });
  }
}

// --- channel lifecycle ---

function handleMessage(channelId: string, msg: OutboundMessage): void {
  const m = msg as unknown as Record<string, unknown>;

  if (m['type'] === 'initialize-state') {
    const im = msg as unknown as InitializeStateMessage;
    const data = getOrCreateChannelData(channelId);
    data.stateInitialized = true;
    data.docState = { state: im.initialState, temp: {} };
    const pending = pendingUpdates.get(channelId);
    if (pending?.length) {
      pendingUpdates.delete(channelId);
      for (const um of pending) {
        data.docState = applyActions(data.docState, um);
      }
    }
    rebuildAllSnapshots(data);
    notifyAll(channelId);
  } else if (m['type'] === 'initialize-view') {
    const im = msg as unknown as InitializeViewMessage;
    const vh = im.viewHandler;
    const data = getOrCreateChannelData(channelId);
    data.layouts.set(vh, im.layoutConfig);
    data.snapshots.set(vh, { layoutConfig: im.layoutConfig, docState: data.docState });
    const key = `${channelId}:${vh}`;
    listeners.get(key)?.forEach((cb) => cb());
  } else if (m['type'] === 'update-state') {
    const data = channelData.get(channelId);
    const um = msg as unknown as UpdateStateMessage;
    if (!data?.stateInitialized) {
      if (!pendingUpdates.has(channelId)) pendingUpdates.set(channelId, []);
      pendingUpdates.get(channelId)!.push(um);
      return;
    }
    data.docState = applyActions(data.docState, um);
    rebuildAllSnapshots(data);
    notifyAll(channelId);
  }
}

export function mountChannel(
  channelId: string,
  emit: (type: string, payload?: Record<string, unknown>) => void,
  viewHandler: string
): void {
  if (!channelId) return;

  if (!chSubscribed.has(channelId)) {
    chSubscribed.add(channelId);
    eventManager.subscribe(channelId, (msg) => handleMessage(channelId, msg));
  }

  const initKey = `${channelId}:initializeState`;
  if (!vhEmitted.has(initKey) && !channelData.get(channelId)?.stateInitialized) {
    vhEmitted.add(initKey);
    emit('initializeState');
  }

  const key = `${channelId}:${viewHandler}`;
  if (!vhEmitted.has(key)) {
    vhEmitted.add(key);
    emit(viewHandler);
  }
}
