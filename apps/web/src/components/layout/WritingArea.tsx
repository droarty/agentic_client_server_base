import { useState, useRef, useEffect, ChangeEvent } from 'react';

const EMIT_THROTTLE_MS = 10000;

interface Props {
  value?: string;
  placeholder?: string;
  rows?: number;
  fixedHeight?: boolean;
  onChange?: (payload: { text: string }) => void;
  [key: string]: unknown;
}

export function WritingArea({ value, placeholder, rows = 10, fixedHeight = false, onChange }: Props) {
  const [text, setText] = useState(() => value ?? '');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingTextRef = useRef<string | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (fixedHeight) return;
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [text, fixedHeight]);

  // Flush any pending throttled change on unmount so late edits aren't lost.
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        if (pendingTextRef.current !== null) {
          onChangeRef.current?.({ text: pendingTextRef.current });
        }
      }
    };
  }, []);

  function handleChange(e: ChangeEvent<HTMLTextAreaElement>) {
    const next = e.target.value;
    setText(next);
    pendingTextRef.current = next;
    if (!timerRef.current) {
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        const pending = pendingTextRef.current;
        pendingTextRef.current = null;
        if (pending !== null) onChangeRef.current?.({ text: pending });
      }, EMIT_THROTTLE_MS);
    }
  }

  return (
    <textarea
      ref={textareaRef}
      className={`writing-area${fixedHeight ? ' writing-area--fixed' : ''}`}
      placeholder={placeholder}
      value={text}
      onChange={handleChange}
      rows={rows}
    />
  );
}
