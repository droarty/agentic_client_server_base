import { DocumentSummary } from '@multiplayer-base/shared-types';
import { DocumentListItem } from './DocumentListItem';

interface Props {
  documents: DocumentSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRefresh: () => void;
}

export function DocumentListPanel({ documents, selectedId, onSelect, onRefresh }: Props) {
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
    </div>
  );
}
