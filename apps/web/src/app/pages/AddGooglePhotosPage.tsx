import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';
import { LayoutDocumentView } from '../components/LayoutDocumentView';
import { apiCreateDocument } from '../services/api';

// 24 hours is a starting default — easy to tune later, not load-bearing since
// no cleanup job reads expiresAt yet.
const PICKER_ARTIFACT_TTL_MS = 24 * 60 * 60 * 1000;

export function AddGooglePhotosPage() {
  const [channelId, setChannelId] = useState<string | null>(null);

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
      <main style={{ flex: 1, overflow: 'hidden', padding: 0 }}>
        {channelId ? <LayoutDocumentView channelId={channelId} /> : <p className="doc-empty">Loading…</p>}
      </main>
      <Link to="/assets" className="btn-secondary">Back to My Assets</Link>
    </div>
  );
}
