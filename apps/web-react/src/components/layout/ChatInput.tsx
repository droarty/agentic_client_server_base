import { useState, FormEvent, KeyboardEvent } from 'react';

interface Props {
  onAddText?: (payload: { text: string }) => void;
  [key: string]: unknown;
}

export function ChatInput({ onAddText }: Props) {
  const [text, setText] = useState('');

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed || !onAddText) return;
    onAddText({ text: trimmed });
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
    <form className="chat-input" onSubmit={handleSubmit}>
      <textarea
        className="chat-input__field"
        placeholder="Type a message…"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        rows={1}
      />
      <button type="submit" className="btn-primary" disabled={!text.trim()}>
        Send
      </button>
    </form>
  );
}
