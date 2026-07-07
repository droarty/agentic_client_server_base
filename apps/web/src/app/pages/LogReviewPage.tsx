import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';
import { LayoutDocumentView } from '../components/LayoutDocumentView';
import { apiGetOrCreateWorkflowSession } from '../services/api';

export function LogReviewPage() {
  const { channelId: targetChannelId } = useParams<{ channelId: string }>();
  const [sessionChannelId, setSessionChannelId] = useState<string | null>(null);

  useEffect(() => {
    if (targetChannelId) {
      apiGetOrCreateWorkflowSession({ workflowType: 'log-review', targetChannelId }).then(({ channelId }) => setSessionChannelId(channelId));
    }
  }, [targetChannelId]);

  return (
    <div className="page" style={{ height: '100vh', overflow: 'hidden' }}>
      <PageHeader title="Log Review" />
      <main style={{ flex: 1, overflow: 'hidden', padding: 0 }}>
        {sessionChannelId
          ? <LayoutDocumentView channelId={sessionChannelId} />
          : <p className="doc-empty">Loading…</p>
        }
      </main>
    </div>
  );
}
