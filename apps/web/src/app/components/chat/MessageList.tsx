import { useRef, useEffect, Suspense } from 'react';
import { OutboundMessage } from '@multiplayer-base/shared-types';
import { getMessageComponent } from '../../registry/messageRegistry';

interface MessageListProps {
  messages: OutboundMessage[];
}

export function MessageList({ messages }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="chat-messages">
      {messages.length === 0 && (
        <p className="chat-empty">No messages yet. Say hello!</p>
      )}
      {messages.map((msg) => {
        const MsgComponent = getMessageComponent(msg.type);
        if (!MsgComponent) return null;
        return (
          <Suspense key={(msg as any).id ?? `${msg.type}-${msg.timestamp}`} fallback={<div className="chat-message" />}>
            <MsgComponent message={msg} />
          </Suspense>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
