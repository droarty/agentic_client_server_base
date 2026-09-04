import { useState, useEffect } from 'react';
import { PageHeader } from '../components/PageHeader';
import { LayoutDocumentView } from '../components/LayoutDocumentView';
import { apiGetOrCreateWorkflowSession } from '../services/api';

export function GlobalAdminDashboardPage() {
  const [sessionChannelId, setSessionChannelId] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    apiGetOrCreateWorkflowSession({ workflowType: 'global-admin-dashboard' })
      .then(({ channelId }) => setSessionChannelId(channelId))
      .catch(() => setError('Failed to load the dashboard. Try refreshing the page.'));
  }, []);

  return (
    <div className="page">
      <PageHeader title="Global Admin Dashboard" />
      <main>
        {error ? (
          <div className="error-message" role="alert">{error}</div>
        ) : sessionChannelId ? (
          <LayoutDocumentView channelId={sessionChannelId} />
        ) : (
          <p className="doc-empty">Loading…</p>
        )}
      </main>
    </div>
  );
}
