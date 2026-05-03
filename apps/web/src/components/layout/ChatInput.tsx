import { useState, FormEvent } from 'react';

interface Props {
  onAddText?: (payload: { text: string }) => void;
  [key: string]: unknown;
}

export function ChatInput({ onAddText }: Props) {
  const [text, setText] = useState('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || !onAddText) return;
    onAddText({ text: trimmed });
    setText('');
  };

  return (
    <form className="chat-input" onSubmit={handleSubmit}>
      <input
        className="chat-input__field"
        type="text"
        placeholder="Type a message…"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <button type="submit" className="btn-primary" disabled={!text.trim()}>
        Send
      </button>
    </form>
  );
}
