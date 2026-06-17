import { PageHeader } from '../components/PageHeader';
import { useDashboardChannelId } from '../hooks/useDashboardChannelId';
import { LayoutDocumentView } from '../components/LayoutDocumentView';

export function UserDashboardPage() {
  const channelId = useDashboardChannelId();

  return (
    <div className="page" style={{ height: '100vh', overflow: 'hidden' }}>
      <PageHeader title="User Dashboard" />
      <main style={{ flex: 1, overflow: 'hidden', padding: 0 }}>
        {channelId
          ? <LayoutDocumentView channelId={channelId} />
          : <p className="doc-empty">Loading…</p>
        }
      </main>
    </div>
  );
}
