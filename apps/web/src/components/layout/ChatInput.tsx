import { useState, useRef, useEffect, FormEvent, KeyboardEvent } from 'react';

interface Props {
  onAddText?: (payload: { text: string }) => void;
  [key: string]: unknown;
}

const MAX_TEXTAREA_HEIGHT_PX = 200;

export function ChatInput({ onAddText }: Props) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const next = Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT_PX);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > MAX_TEXTAREA_HEIGHT_PX ? 'auto' : 'hidden';
  }, [text]);

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
        ref={textareaRef}
        className="chat-input__field"
        placeholder="Type a message…"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        rows={1}
      />
      <button type="submit" className="chat-send" disabled={!text.trim()}>
        Send
      </button>
    </form>
  );
}
