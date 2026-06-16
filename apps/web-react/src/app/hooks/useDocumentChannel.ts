import { useState, useEffect, useCallback, useRef } from 'react';
import { OutboundMessage, InboundMessage } from '@multiplayer-base/shared-types';
import { eventManager } from '../services/EventManager';

export function useDocumentChannel(channelId: string) {
  const [messages, setMessages] = useState<OutboundMessage[]>([]);
  const channelRef = useRef(channelId);
  channelRef.current = channelId;

  useEffect(() => {
    if (!channelId) return;
    const unsubscribe = eventManager.subscribe(channelId, (msg) => {
      setMessages((prev) => [...prev, msg]);
    });
    return unsubscribe;
  }, [channelId]);

  const emit = useCallback((type: string, payload: Record<string, unknown> = {}) => {
    const message = {
      type,
      from: 'client' as const,
      to: 'server' as const,
      channel: channelRef.current,
      timestamp: new Date().toISOString(),
      ...payload,
    } as unknown as InboundMessage;
    eventManager.publish(channelRef.current, message);
  }, []);

  return { messages, emit };
}
