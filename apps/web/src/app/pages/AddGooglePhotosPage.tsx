import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';
import { LayoutDocumentView } from '../components/LayoutDocumentView';
import { apiGetGooglePhotosPickerDocument } from '../services/api';

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
    // Find-or-create: reuses an in-progress (or just-completed, still
    // unexpired) picker document rather than always starting fresh — so a
    // page reload mid-session (e.g. a backgrounded tab getting discarded
    // while you're away in Google's picker) rejoins the same session
    // instead of silently abandoning it for an empty one.
    apiGetGooglePhotosPickerDocument().then(({ channelId }) => setChannelId(channelId));
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
