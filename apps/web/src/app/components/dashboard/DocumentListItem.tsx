import { DocumentSummary } from '@multiplayer-base/shared-types';

interface Props {
  doc: DocumentSummary;
  isSelected: boolean;
  onSelect: () => void;
}

export function DocumentListItem({ doc, isSelected, onSelect }: Props) {
  return (
    <li
      className={`doc-item${isSelected ? ' active' : ''}`}
      onClick={onSelect}
    >
      <span className="doc-name">{doc.name}</span>
      <span className="doc-meta">{doc.type}</span>
    </li>
  );
}
