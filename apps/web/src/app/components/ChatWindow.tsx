import { useState, useEffect, useRef, FormEvent, KeyboardEvent } from 'react';
import { ChatMessage } from '@multiplayer-base/shared-types';

interface ChatWindowProps {
  chatKey: string;
  messages: ChatMessage[];
  onSend: (text: string) => void;
  placeholder?: string;
}

export function ChatWindow({ chatKey, messages, onSend, placeholder = 'Type a message...' }: ChatWindowProps) {
  const [text, setText] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText('');
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const trimmed = text.trim();
      if (!trimmed) return;
      onSend(trimmed);
      setText('');
    }
  };

  return (
    <div className="chat-window">
      <div className="chat-header">{chatKey}</div>
      <div className="chat-messages">
        {messages.length === 0 && (
          <p className="chat-empty">No messages yet. Say hello!</p>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className="chat-message">
            <div className="chat-message-header">
              <span className="chat-from">{msg.from}</span>
              <span className="chat-time">
                {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <p className="chat-text">{msg.text}</p>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <form className="chat-form" onSubmit={handleSubmit}>
        <textarea
          className="chat-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={1}
        />
        <button type="submit" className="chat-send" disabled={!text.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}
