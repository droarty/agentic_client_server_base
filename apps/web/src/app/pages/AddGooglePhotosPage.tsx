import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';
import { LayoutDocumentView } from '../components/LayoutDocumentView';
import { apiCreateDocument } from '../services/api';

// 24 hours is a starting default — easy to tune later, not load-bearing since
// no cleanup job reads expiresAt yet.
const PICKER_ARTIFACT_TTL_MS = 24 * 60 * 60 * 1000;

export function AddGooglePhotosPage() {
  const [channelId, setChannelId] = useState<string | null>(null);

  const [searchParams, setSearchParams] = useSearchParams();
  // Captured once, in state — the query param gets cleared right after mount
  // (below), but the banner still needs to render after that happens.
  const [googlePhotosConnected] = useState(() => searchParams.get('googlePhotosConnected'));

  useEffect(() => {
    if (googlePhotosConnected !== null) {
      setSearchParams({}, { replace: true });
    }
    // Only run once on mount to consume the query param.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    apiCreateDocument({
      name: 'Google Photos Import',
      workflowType: 'google-photos-picker',
      expiresAt: new Date(Date.now() + PICKER_ARTIFACT_TTL_MS).toISOString(),
    }).then((doc) => setChannelId(doc.currentChannelId));
  }, []);

  return (
    <div className="page" style={{ height: '100vh', overflow: 'hidden' }}>
      <PageHeader title="Add Google Photos" />
      {googlePhotosConnected === '1' && <div className="success-message" role="status">Google Photos connected successfully.</div>}
      {googlePhotosConnected === '0' && <div className="error-message" role="alert">Failed to connect Google Photos.</div>}
      <main style={{ flex: 1, overflow: 'hidden', padding: 0 }}>
        {channelId ? <LayoutDocumentView channelId={channelId} /> : <p className="doc-empty">Loading…</p>}
      </main>
      <Link to="/assets" className="btn-secondary">Back to My Assets</Link>
    </div>
  );
}
