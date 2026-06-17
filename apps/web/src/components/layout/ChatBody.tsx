import { useRef, useEffect } from 'react';
import { MultiFieldInput } from './MultiFieldInput';

interface FieldDef {
  name: string;
  label: string;
  placeholder?: string;
}

interface ChatMessage {
  messageType: string;
  text?: string;
  authorEmail?: string;
  color?: string;
  fields?: FieldDef[];
  submitLabel?: string;
  emits?: Record<string, string>;
}

interface Props {
  messages?: ChatMessage[];
  inputValues?: Record<string, string>;
  emit?: (type: string, payload: Record<string, unknown>) => void;
  [key: string]: unknown;
}

export function ChatBody({ messages = [], inputValues, emit }: Props) {
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
        msg.messageType === 'multi-field-input'
          ? (
            <MultiFieldInput
              key={i}
              fields={msg.fields}
              submitLabel={msg.submitLabel}
              values={inputValues}
              onSubmit={
                msg.emits?.submit && emit
                  ? (payload) => emit(msg.emits!['submit'], payload as Record<string, unknown>)
                  : undefined
              }
            />
          )
          : (
            <div
              key={i}
              className={`chat-message chat-message--${msg.messageType}`}
              style={msg.color ? { color: msg.color } : undefined}
            >
              <span className="chat-message__author">{msg.authorEmail}</span>
              <span className="chat-message__text">{msg.text}</span>
            </div>
          )
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
