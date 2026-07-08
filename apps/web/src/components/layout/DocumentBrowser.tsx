import { useMemo, useState } from 'react';
import { ScrollText } from 'lucide-react';
import { ArtifactSummary } from '@agentic-client-server-base/shared-types';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';

interface Props {
  items?: ArtifactSummary[];
  onOpen?: (payload: { documentId: string }) => void;
  onRename?: (payload: { _id: string; name: string }) => void;
  onDelete?: (payload: { _id: string }) => void;
  onViewLogs?: (payload: { channelId: string }) => void;
}

type SortKey = 'date' | 'name';

export function DocumentBrowser({ items = [], onOpen, onRename, onDelete, onViewLogs }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [renameTarget, setRenameTarget] = useState<ArtifactSummary | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<ArtifactSummary | null>(null);

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
    setRenameTarget(doc);
    setRenameValue(doc.name);
  }

  function confirmRename() {
    if (renameTarget && renameValue.trim()) {
      onRename?.({ _id: renameTarget._id, name: renameValue.trim() });
    }
    setRenameTarget(null);
  }

  function confirmDelete() {
    if (deleteTarget) onDelete?.({ _id: deleteTarget._id });
    setDeleteTarget(null);
  }

  return (
    <div className="doc-browser">
      <div className="doc-browser-sort">
        <span>Sort by: </span>
        <Button size="sm" onClick={() => setSortKey('date')} disabled={sortKey === 'date'}>Date</Button>
        {' '}
        <Button size="sm" onClick={() => setSortKey('name')} disabled={sortKey === 'name'}>Name</Button>
      </div>
      {sortedItems.length === 0 ? (
        <p className="doc-empty">No documents yet.</p>
      ) : (
        <ul className="doc-list">
          {sortedItems.map((doc) => (
            <li key={doc._id} className="doc-list-item">
              <span className="doc-name">
                {doc.name} ({doc.type}, {new Date(doc.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })})
                {' '}
                <button className="doc-open-btn" onClick={() => onOpen?.({ documentId: doc._id })}>Open</button>
                {' '}
                <Button size="sm" variant="outline" onClick={() => startRename(doc)}>Rename</Button>
                {' '}
                <Button size="sm" variant="destructive" onClick={() => setDeleteTarget(doc)}>Delete</Button>
                {' '}
                {doc.currentChannelId && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="View logs"
                    onClick={() => onViewLogs?.({ channelId: doc.currentChannelId })}
                  >
                    <ScrollText size={14} />
                  </Button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={!!renameTarget} onClose={() => setRenameTarget(null)} title="Rename document">
        <input
          className="dialog-input"
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          autoFocus
        />
        <div className="dialog-actions">
          <Button size="sm" variant="outline" onClick={() => setRenameTarget(null)}>Cancel</Button>
          <Button size="sm" onClick={confirmRename}>Save</Button>
        </div>
      </Dialog>

      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete document">
        <p>Delete "{deleteTarget?.name}"? This cannot be undone.</p>
        <div className="dialog-actions">
          <Button size="sm" variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button size="sm" variant="destructive" onClick={confirmDelete}>Delete</Button>
        </div>
      </Dialog>
    </div>
  );
}
