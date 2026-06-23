import { ArtifactSummary } from '@multiplayer-base/shared-types';

interface Props {
  items?: ArtifactSummary[];
  onSelect?: (payload: { documentId: string }) => void;
  [key: string]: unknown;
}

export function DocumentList({ items = [], onSelect }: Props) {
  if (items.length === 0) {
    return <p className="doc-empty">No documents yet.</p>;
  }

  return (
    <ul className="doc-list">
      {items.map((doc) => (
        <li key={String(doc._id)} className="doc-list-item">
          <span className="doc-name">
            {doc.name} ({doc.type}, {new Date(doc.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })})
            {' '}
            <button
              className="doc-open-btn"
              onClick={() => onSelect?.({ documentId: doc._id })}
            >
              Open
            </button>
          </span>
        </li>
      ))}
    </ul>
  );
}
