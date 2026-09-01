import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';
import { LayoutDocumentView } from '../components/LayoutDocumentView';
import { apiGetOrCreateWorkflowSession } from '../services/api';

// Deliberately extensible: adding a future asset source is just adding a row
// here, no new plumbing.
const ASSET_SOURCES = [{ path: '/assets/add/google-photos', label: 'Google Photos' }];

export function AssetBrowserPage() {
  const [sessionChannelId, setSessionChannelId] = useState<string | null>(null);

  useEffect(() => {
    apiGetOrCreateWorkflowSession({ workflowType: 'asset-browser' }).then(({ channelId }) => setSessionChannelId(channelId));
  }, []);

  return (
    <div className="page" style={{ height: '100vh', overflow: 'hidden' }}>
      <PageHeader title="My Assets" />
      <div className="asset-sources">
        <span>Add Asset:</span>
        {ASSET_SOURCES.map((source) => (
          <Link key={source.path} to={source.path} className="btn-secondary">
            {source.label}
          </Link>
        ))}
      </div>
      <main style={{ flex: 1, overflow: 'hidden', padding: 0 }}>
        {sessionChannelId ? <LayoutDocumentView channelId={sessionChannelId} /> : <p className="doc-empty">Loading…</p>}
      </main>
    </div>
  );
}
