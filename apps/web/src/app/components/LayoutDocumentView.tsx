import { useState, useEffect, useRef, useCallback } from 'react';
import { LayoutNode, InitializeClientMessage, UpdateStateMessage, OutboundMessage, InboundMessage } from '@multiplayer-base/shared-types';
import { DocumentViewProps } from '../registry/documentRegistry';
import { eventManager } from '../services/EventManager';
import { LayoutRenderer } from '../../components/LayoutRenderer';

function hasId(item: unknown): boolean {
  return typeof item === 'object' && item !== null && ('id' in item || '_id' in item);
}

function getId(item: unknown): unknown {
  const obj = item as Record<string, unknown>;
  return obj['_id'] ?? obj['id'];
}

function mergeState(
  prev: Record<string, unknown>,
  diff: Record<string, unknown>
): Record<string, unknown> {
  const next = { ...prev };
  for (const [key, value] of Object.entries(diff)) {
    if (Array.isArray(value)) {
      const existing = Array.isArray(prev[key]) ? (prev[key] as unknown[]) : [];
      if (value.length > 0 && hasId(value[0])) {
        const map = new Map(existing.filter(hasId).map((item) => [getId(item), item]));
        for (const item of value) map.set(getId(item), item);
        next[key] = Array.from(map.values());
      } else {
        next[key] = [...existing, ...value];
      }
    } else {
      next[key] = value;
    }
  }
  return next;
}

export function LayoutDocumentView({ doc }: DocumentViewProps) {
  const [layoutConfig, setLayoutConfig] = useState<LayoutNode[]>([]);
  const [docState, setDocState] = useState<Record<string, unknown>>({});
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
          ...(im.initialState as Record<string, unknown> ?? {}),
          users: im.users ?? [],
        });
      } else if (m['type'] === 'update-state') {
        const um = msg as unknown as UpdateStateMessage;
        setDocState((prev) => {
          let next = prev;
          if (um.state) next = mergeState(next, um.state);
          if (um.users !== undefined) next = { ...next, users: um.users };
          if (um.temp) next = mergeState(next, um.temp);
          return next;
        });
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

  return <LayoutRenderer nodes={layoutConfig} state={docState} emit={emit} />;
}
