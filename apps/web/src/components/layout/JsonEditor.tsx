import { useState, useEffect, ChangeEvent } from 'react';

interface Props {
  value: unknown;
  onChange?: (parsed: unknown, raw: string) => void;
}

export function JsonEditor({ value, onChange }: Props) {
  const [text, setText] = useState(() => JSON.stringify(value, null, 2));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setText(JSON.stringify(value, null, 2));
    setError(null);
  }, [value]);

  function handleChange(e: ChangeEvent<HTMLTextAreaElement>) {
    const next = e.target.value;
    setText(next);
    try {
      const parsed = JSON.parse(next);
      setError(null);
      onChange?.(parsed, next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid JSON');
    }
  }

  return (
    <div className="json-editor">
      <textarea
        className="json-editor__field"
        value={text}
        onChange={handleChange}
        spellCheck={false}
      />
      {error && <p className="json-editor__error">{error}</p>}
    </div>
  );
}
