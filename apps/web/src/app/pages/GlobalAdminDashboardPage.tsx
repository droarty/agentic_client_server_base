import { useState, useEffect } from 'react';
import { PageHeader } from '../components/PageHeader';
import { LayoutDocumentView } from '../components/LayoutDocumentView';
import { apiGetOrCreateWorkflowSession } from '../services/api';

export function GlobalAdminDashboardPage() {
  const [sessionChannelId, setSessionChannelId] = useState<string | null>(null);

  useEffect(() => {
    apiGetOrCreateWorkflowSession({ workflowType: 'global-admin-dashboard' }).then(({ channelId }) => setSessionChannelId(channelId));
  }, []);

  return (
    <div className="page" style={{ height: '100vh', overflow: 'hidden' }}>
      <PageHeader title="Global Admin Dashboard" />
      <main style={{ flex: 1, overflow: 'hidden', padding: 0 }}>
        {sessionChannelId ? <LayoutDocumentView channelId={sessionChannelId} /> : <p className="doc-empty">Loading…</p>}
      </main>
    </div>
  );
}
