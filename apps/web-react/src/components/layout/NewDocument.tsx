import { useState, FormEvent } from 'react';
import { Button } from '@/components/ui/button';

interface Props {
  availableTypes?: string[];
  onCreate?: (payload: { name: string; documentType: string }) => void;
  [key: string]: unknown;
}

export function NewDocument({ availableTypes = [], onCreate }: Props) {
  const types = availableTypes as string[];
  const [name, setName] = useState('');
  const [documentType, setDocumentType] = useState(types[0] ?? 'configged-chat');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onCreate?.({ name: trimmed, documentType });
    setName('');
  };

  const label = documentType.charAt(0).toUpperCase() + documentType.slice(1);

  return (
    <form className="doc-create-form" onSubmit={handleSubmit}>
      <input
        className="doc-create-input"
        type="text"
        placeholder="Document name…"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      {types.length > 1 && (
        <select
          className="doc-create-type"
          value={documentType}
          onChange={(e) => setDocumentType(e.target.value)}
        >
          {types.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      )}
      <Button type="submit" variant="default" disabled={!name.trim()}>
        Create {label}
      </Button>
    </form>
  );
}
