import { useState, useEffect, useRef, FormEvent, KeyboardEvent } from 'react';
import { ChatMessage } from '@multiplayer-base/shared-types';
import { eventManager } from '../services/EventManager';
import { useAuth } from '../contexts/AuthContext';

interface ChatWindowProps {
  chatKey: string;
  targets?: string[];
  placeholder?: string;
}

export function ChatWindow({ chatKey, targets, placeholder = 'Type a message...' }: ChatWindowProps) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [selectedTarget, setSelectedTarget] = useState<string>(targets?.[0] ?? chatKey);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return eventManager.subscribe(chatKey, (msg) => {
      setMessages((prev) => [...prev, msg]);
    });
  }, [chatKey]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    const msg: ChatMessage = {
      id: crypto.randomUUID(),
      from: user?.email ?? 'Unknown',
      text: trimmed,
      timestamp: new Date().toISOString(),
    };
    eventManager.publish(selectedTarget, msg);
    setText('');
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const trimmed = text.trim();
      if (!trimmed) return;
      const msg: ChatMessage = {
        id: crypto.randomUUID(),
        from: user?.email ?? 'Unknown',
        text: trimmed,
        timestamp: new Date().toISOString(),
      };
      eventManager.publish(selectedTarget, msg);
      setText('');
    }
  };

  const targetList = targets ?? [chatKey];

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
        {targetList.length > 1 && (
          <select
            className="chat-target-select"
            value={selectedTarget}
            onChange={(e) => setSelectedTarget(e.target.value)}
            aria-label="Send to"
          >
            {targetList.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        )}
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
