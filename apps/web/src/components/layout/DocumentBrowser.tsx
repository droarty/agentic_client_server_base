import { useMemo, useState } from 'react';
import { ScrollText } from 'lucide-react';
import { ArtifactSummary } from '@agentic-client-server-base/shared-types';
import { Button } from '@/components/ui/button';

interface Props {
  items?: ArtifactSummary[];
  onOpen?: (payload: { documentId: string }) => void;
  onRename?: (payload: { _id: string; name: string }) => void;
  onDelete?: (payload: { _id: string }) => void;
  onViewLogs?: (payload: { documentId: string }) => void;
}

type SortKey = 'date' | 'name';

export function DocumentBrowser({ items = [], onOpen, onRename, onDelete, onViewLogs }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const sortedItems = useMemo(() => {
    const copy = [...items];
    if (sortKey === 'name') {
      copy.sort((a, b) => a.name.localeCompare(b.name));
    } else {
      copy.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
    return copy;
  }, [items, sortKey]);

  function startRename(doc: ArtifactSummary) {
    setEditingId(doc._id);
    setEditValue(doc.name);
  }

  function saveRename(id: string) {
    if (editValue.trim()) onRename?.({ _id: id, name: editValue.trim() });
    setEditingId(null);
  }

  function handleDelete(id: string, name: string) {
    if (window.confirm(`Delete "${name}"? This cannot be undone.`)) {
      onDelete?.({ _id: id });
    }
  }

  return (
    <div className="doc-browser">
      <div className="doc-browser-sort">
        <span>Sort by: </span>
        <Button onClick={() => setSortKey('date')} disabled={sortKey === 'date'}>Date</Button>
        {' '}
        <Button onClick={() => setSortKey('name')} disabled={sortKey === 'name'}>Name</Button>
      </div>
      {sortedItems.length === 0 ? (
        <p className="doc-empty">No documents yet.</p>
      ) : (
        <ul className="doc-list">
          {sortedItems.map((doc) => (
            <li key={doc._id} className="doc-list-item">
              {editingId === doc._id ? (
                <span className="doc-name">
                  <input value={editValue} onChange={(e) => setEditValue(e.target.value)} />
                  {' '}
                  <Button onClick={() => saveRename(doc._id)}>Save</Button>
                  {' '}
                  <Button onClick={() => setEditingId(null)}>Cancel</Button>
                </span>
              ) : (
                <span className="doc-name">
                  {doc.name} ({doc.type}, {new Date(doc.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })})
                  {' '}
                  <button className="doc-open-btn" onClick={() => onOpen?.({ documentId: doc._id })}>Open</button>
                  {' '}
                  <Button onClick={() => startRename(doc)}>Rename</Button>
                  {' '}
                  <Button onClick={() => handleDelete(doc._id, doc.name)}>Delete</Button>
                  {' '}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="View logs"
                    onClick={() => onViewLogs?.({ documentId: doc._id })}
                  >
                    <ScrollText size={14} />
                  </Button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
