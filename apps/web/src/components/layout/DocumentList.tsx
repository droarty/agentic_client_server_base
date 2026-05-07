interface DocItem {
  _id: string;
  name: string;
  type: string;
}

interface Props {
  items?: DocItem[];
  onSelect?: (payload: { documentId: string }) => void;
  [key: string]: unknown;
}

export function DocumentList({ items = [], onSelect }: Props) {
  if ((items as DocItem[]).length === 0) {
    return <p className="doc-empty">No documents yet.</p>;
  }

  return (
    <ul className="doc-list">
      {(items as DocItem[]).map((doc) => (
        <li
          key={doc._id}
          className="doc-list-item"
          onClick={() => onSelect?.({ documentId: doc._id })}
        >
          <span className="doc-name">{doc.name}</span>
          <span className="doc-type">{doc.type}</span>
        </li>
      ))}
    </ul>
  );
}
