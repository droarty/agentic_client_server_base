import { PageHeader } from '../components/PageHeader';
import { useDashboardChannelId } from '../hooks/useDashboardChannelId';
import { LayoutDocumentView } from '../components/LayoutDocumentView';

export function UserDashboardPage() {
  const channelId = useDashboardChannelId();

  return (
    <div className="page">
      <PageHeader title="User Dashboard" />
      <main>
        {channelId
          ? <LayoutDocumentView channelId={channelId} />
          : <p className="doc-empty">Loading…</p>
        }
      </main>
    </div>
  );
}
