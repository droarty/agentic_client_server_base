import { useState, FormEvent } from 'react';
import { DocumentSummary } from '@multiplayer-base/shared-types';
import { DocumentListItem } from './DocumentListItem';

interface Props {
  documents: DocumentSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRefresh: () => void;
  onCreate: (name: string) => void;
}

export function DocumentListPanel({ documents, selectedId, onSelect, onRefresh, onCreate }: Props) {
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setCreating(true);
    onCreate(trimmed);
    setName('');
    setCreating(false);
  };

  return (
    <div className="doc-list-panel">
      <div className="doc-list-header">
        <h3>Documents</h3>
        <button onClick={onRefresh} className="btn-secondary">Refresh</button>
      </div>
      {documents.length === 0 ? (
        <p className="doc-empty">No documents yet.</p>
      ) : (
        <ul className="doc-list">
          {documents.map((doc) => (
            <DocumentListItem
              key={doc._id}
              doc={doc}
              isSelected={doc._id === selectedId}
              onSelect={() => onSelect(doc._id)}
            />
          ))}
        </ul>
      )}
      <form className="doc-create-form" onSubmit={handleSubmit}>
        <input
          className="doc-create-input"
          type="text"
          placeholder="Name a new chat…"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button
          type="submit"
          className="btn-primary doc-create-btn"
          disabled={!name.trim() || creating}
        >
          Create Chat
        </button>
      </form>
    </div>
  );
}
