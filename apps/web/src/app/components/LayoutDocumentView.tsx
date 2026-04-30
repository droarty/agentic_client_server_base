import { useState, useEffect, useRef, useCallback } from 'react';
import { LayoutNode, InitializeClientMessage, UpdateStateMessage, OutboundMessage, InboundMessage } from '@multiplayer-base/shared-types';
import { DocumentViewProps } from '../registry/documentRegistry';
import { eventManager } from '../services/EventManager';
import { LayoutRenderer } from '../../components/LayoutRenderer';

interface DocState {
  state: Record<string, unknown>;
  users: unknown[];
  temp: Record<string, unknown>;
}

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

function applyActions(prev: DocState, msg: UpdateStateMessage): DocState {
  let next = prev as unknown as Record<string, unknown>;

  if (msg.update) {
    for (const [path, value] of Object.entries(msg.update)) {
      next = setAtPath(next, path, value);
    }
  }

  if (msg.merge) {
    for (const [path, value] of Object.entries(msg.merge)) {
      const existing = (getAtPath(next, path) as Record<string, unknown>) ?? {};
      next = setAtPath(next, path, { ...existing, ...(value as Record<string, unknown>) });
    }
  }

  if (msg.append) {
    for (const [path, value] of Object.entries(msg.append)) {
      const existing = (getAtPath(next, path) as unknown[]) ?? [];
      const items = Array.isArray(value) ? value : [value];
      next = setAtPath(next, path, [...existing, ...items]);
    }
  }

  if (msg.prepend) {
    for (const [path, value] of Object.entries(msg.prepend)) {
      const existing = (getAtPath(next, path) as unknown[]) ?? [];
      const items = Array.isArray(value) ? value : [value];
      next = setAtPath(next, path, [...items, ...existing]);
    }
  }

  if (msg.upsert && msg.key) {
    const keyField = msg.key;
    for (const [path, item] of Object.entries(msg.upsert)) {
      const existing = (getAtPath(next, path) as unknown[]) ?? [];
      const keyValue = (item as Record<string, unknown>)[keyField];
      const idx = existing.findIndex((el) => (el as Record<string, unknown>)[keyField] === keyValue);
      const updated = [...existing];
      if (idx >= 0) updated[idx] = item; else updated.push(item);
      next = setAtPath(next, path, updated);
    }
  }

  if (msg.remove && msg.key) {
    const keyField = msg.key;
    for (const [path, matcher] of Object.entries(msg.remove)) {
      const existing = (getAtPath(next, path) as unknown[]) ?? [];
      const keyValue = (matcher as Record<string, unknown>)[keyField];
      next = setAtPath(next, path, existing.filter(
        (el) => (el as Record<string, unknown>)[keyField] !== keyValue
      ));
    }
  }

  return next as unknown as DocState;
}

export function LayoutDocumentView({ doc }: DocumentViewProps) {
  const [layoutConfig, setLayoutConfig] = useState<LayoutNode[]>([]);
  const [docState, setDocState] = useState<DocState>({ state: {}, users: [], temp: {} });
  const initialized = useRef(false);
  const channelRef = useRef(doc.currentChannelId);
  channelRef.current = doc.currentChannelId;

  const emit = useCallback((type: string, payload: Record<string, unknown> = {}) => {
    eventManager.publish(channelRef.current, {
      type,
      from: 'client' as const,
      to: 'server' as const,
      channel: channelRef.current,
      timestamp: new Date().toISOString(),
      ...payload,
    } as unknown as InboundMessage);
  }, []);

  useEffect(() => {
    const channelId = doc.currentChannelId;
    const unsubscribe = eventManager.subscribe(channelId, (msg: OutboundMessage) => {
      const m = msg as unknown as Record<string, unknown>;
      if (m['type'] === 'initialize-client') {
        const im = msg as unknown as InitializeClientMessage;
        setLayoutConfig(im.layoutConfig ?? []);
        setDocState({
          state: (im.initialState as Record<string, unknown>) ?? {},
          users: im.users ?? [],
          temp: {},
        });
      } else if (m['type'] === 'update-state') {
        const um = msg as unknown as UpdateStateMessage;
        setDocState((prev) => applyActions(prev, um));
      }
    });
    return unsubscribe;
  }, [doc.currentChannelId]);

  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      emit('initialize');
    }
  }, [emit]);

  if (layoutConfig.length === 0) {
    return <p className="doc-empty">Loading…</p>;
  }

  return <LayoutRenderer nodes={layoutConfig} state={docState as unknown as Record<string, unknown>} emit={emit} />;
}
