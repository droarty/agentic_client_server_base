import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';
import { LayoutDocumentView } from '../components/LayoutDocumentView';
import { GroupBreadcrumbs } from '../components/GroupBreadcrumbs';
import { apiGetGroupDashboardChannel } from '../services/api';

export function GroupDashboardPage() {
  const { groupId } = useParams<{ groupId: string }>();
  const [channelId, setChannelId] = useState<string | null>(null);

  useEffect(() => {
    if (groupId) {
      apiGetGroupDashboardChannel(groupId, 'group-dashboard').then(({ channelId }) => setChannelId(channelId));
    }
  }, [groupId]);

  return (
    <div className="page" style={{ height: '100vh', overflow: 'hidden' }}>
      <PageHeader title="Group Dashboard" />
      {groupId && <GroupBreadcrumbs groupId={groupId} />}
      <main style={{ flex: 1, overflow: 'hidden', padding: 0 }}>
        {channelId
          ? <LayoutDocumentView channelId={channelId} />
          : <p className="doc-empty">Loading…</p>
        }
      </main>
    </div>
  );
}
