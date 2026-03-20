import { useState, useEffect, useRef, FormEvent, KeyboardEvent, Suspense } from 'react';
import {
  OutboundMessage,
  AddTextMessage,
  AddColorfulTextMessage,
} from '@multiplayer-base/shared-types';
import { eventManager } from '../services/EventManager';
import { getMessageComponent } from '../registry/messageRegistry';

const COLORS = ['#e74c3c', '#e67e22', '#27ae60', '#2980b9', '#8e44ad', '#e91e63'];

interface ChatWindowProps {
  chatKey: string;
  title?: string;
  initialMessages?: OutboundMessage[];
  targets?: string[];
  placeholder?: string;
}

export function ChatWindow({ chatKey, title, initialMessages, targets, placeholder = 'Type a message...' }: ChatWindowProps) {
  const [messages, setMessages] = useState<OutboundMessage[]>(initialMessages ?? []);
  const [text, setText] = useState('');
  const [selectedTarget, setSelectedTarget] = useState<string>(targets?.[0] ?? chatKey);
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return eventManager.subscribe(chatKey, (msg) => {
      setMessages((prev) => [...prev, msg as OutboundMessage]);
    });
  }, [chatKey]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const buildMessage = (trimmed: string): AddTextMessage | AddColorfulTextMessage => {
    const base = {
      from: 'client' as const,
      to: 'server' as const,
      channel: selectedTarget,
      timestamp: new Date().toISOString(),
    };
    if (selectedColor) {
      return { ...base, type: 'add-colorful-text', text: trimmed, color: selectedColor } satisfies AddColorfulTextMessage;
    }
    return { ...base, type: 'add-text', text: trimmed } satisfies AddTextMessage;
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    eventManager.publish(selectedTarget, buildMessage(trimmed));
    setText('');
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const trimmed = text.trim();
      if (!trimmed) return;
      eventManager.publish(selectedTarget, buildMessage(trimmed));
      setText('');
    }
  };

  const targetList = targets ?? [chatKey];

  return (
    <div className="chat-window">
      <div className="chat-header">{title ?? chatKey}</div>

      <div className="chat-messages">
        {messages.length === 0 && (
          <p className="chat-empty">No messages yet. Say hello!</p>
        )}
        {messages.map((msg) => {
          const MsgComponent = getMessageComponent(msg.type);
          if (!MsgComponent) return null;
          return (
            <Suspense key={msg.id} fallback={<div className="chat-message" />}>
              <MsgComponent message={msg} />
            </Suspense>
          );
        })}
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
        <div className="chat-input-area">
          <div className="chat-color-swatches">
            {COLORS.map((color) => (
              <button
                key={color}
                type="button"
                className={`chat-color-swatch${selectedColor === color ? ' active' : ''}`}
                style={{ backgroundColor: color }}
                onClick={() => setSelectedColor(selectedColor === color ? null : color)}
                aria-label={`Color ${color}`}
              />
            ))}
          </div>
          <textarea
            className="chat-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            style={selectedColor ? { color: selectedColor } : undefined}
            rows={1}
          />
        </div>
        <button type="submit" className="chat-send" disabled={!text.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}
