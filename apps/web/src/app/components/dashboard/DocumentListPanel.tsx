import { useState, FormEvent } from 'react';
import { DocumentSummary } from '@multiplayer-base/shared-types';
import { DocumentListItem } from './DocumentListItem';

interface Props {
  documents: DocumentSummary[];
  selectedId: string | null;
  availableTypes: string[];
  onSelect: (id: string) => void;
  onRefresh: () => void;
  onCreate: (name: string, documentType: string) => void;
}

export function DocumentListPanel({ documents, selectedId, availableTypes, onSelect, onRefresh, onCreate }: Props) {
  const [name, setName] = useState('');
  const [documentType, setDocumentType] = useState(availableTypes[0] ?? 'chat');
  const [creating, setCreating] = useState(false);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setCreating(true);
    onCreate(trimmed, documentType);
    setName('');
    setCreating(false);
  };

  const label = documentType.charAt(0).toUpperCase() + documentType.slice(1);

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
          placeholder="Document name…"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        {availableTypes.length > 1 && (
          <select
            className="doc-create-type"
            value={documentType}
            onChange={(e) => setDocumentType(e.target.value)}
          >
            {availableTypes.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        )}
        <button
          type="submit"
          className="btn-primary doc-create-btn"
          disabled={!name.trim() || creating}
        >
          Create {label}
        </button>
      </form>
    </div>
  );
}
