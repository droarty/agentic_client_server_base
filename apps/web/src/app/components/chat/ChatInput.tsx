import { useState, FormEvent, KeyboardEvent } from 'react';

const COLORS = ['#e74c3c', '#e67e22', '#27ae60', '#2980b9', '#8e44ad', '#e91e63'];

interface SendPayload {
  text: string;
  color?: string;
}

interface ChatInputProps {
  onSend: (payload: SendPayload) => void;
  placeholder?: string;
}

export function ChatInput({ onSend, placeholder = 'Type a message...' }: ChatInputProps) {
  const [text, setText] = useState('');
  const [selectedColor, setSelectedColor] = useState<string | null>(null);

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend({ text: trimmed, color: selectedColor ?? undefined });
    setText('');
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <form className="chat-form" onSubmit={handleSubmit}>
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
  );
}
