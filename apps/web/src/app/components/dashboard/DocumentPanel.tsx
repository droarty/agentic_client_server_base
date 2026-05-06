import { Suspense } from 'react';
import { Artifact } from '@multiplayer-base/shared-types';
import { getDocumentComponent } from '../../registry/documentRegistry';

interface Props {
  doc: Artifact;
}

export function DocumentPanel({ doc }: Props) {
  const DocComponent = getDocumentComponent(doc.type);
  if (!DocComponent) return <p className="doc-empty">Unknown document type: {doc.type}</p>;
  return (
    <div className="doc-panel">
      <Suspense fallback={<p className="doc-empty">Loading…</p>}>
        <DocComponent key={doc._id} doc={doc} />
      </Suspense>
    </div>
  );
}
