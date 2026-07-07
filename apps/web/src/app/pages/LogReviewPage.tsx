import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';
import { LayoutDocumentView } from '../components/LayoutDocumentView';
import { apiGetOrCreateWorkflowSession } from '../services/api';

export function LogReviewPage() {
  const { documentId } = useParams<{ documentId: string }>();
  const [channelId, setChannelId] = useState<string | null>(null);

  useEffect(() => {
    if (documentId) {
      apiGetOrCreateWorkflowSession({ workflowType: 'log-review', targetArtifactId: documentId }).then(({ channelId }) => setChannelId(channelId));
    }
  }, [documentId]);

  return (
    <div className="page" style={{ height: '100vh', overflow: 'hidden' }}>
      <PageHeader title="Log Review" />
      <main style={{ flex: 1, overflow: 'hidden', padding: 0 }}>
        {channelId
          ? <LayoutDocumentView channelId={channelId} />
          : <p className="doc-empty">Loading…</p>
        }
      </main>
    </div>
  );
}
