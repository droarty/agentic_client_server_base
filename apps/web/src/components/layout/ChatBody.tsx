import { useRef, useEffect } from 'react';

interface ChatMessage {
  messageType: string;
  text: string;
  authorEmail?: string;
  color?: string;
}

interface Props {
  messages?: ChatMessage[];
  [key: string]: unknown;
}

export function ChatBody({ messages = [] }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="chat-messages">
      {messages.length === 0 && (
        <p className="chat-empty">No messages yet. Say hello!</p>
      )}
      {messages.map((msg, i) => (
        <div
          key={i}
          className={`chat-message chat-message--${msg.messageType}`}
          style={msg.color ? { color: msg.color } : undefined}
        >
          <span className="chat-message__author">{msg.authorEmail}</span>
          <span className="chat-message__text">{msg.text}</span>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
