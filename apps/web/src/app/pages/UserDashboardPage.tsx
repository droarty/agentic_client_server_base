import { useState, useEffect, FormEvent } from 'react';
import { ChatDocument } from '@multiplayer-base/shared-types';
import { useAuth } from '../contexts/AuthContext';
import { PageHeader } from '../components/PageHeader';
import { ChatWindow } from '../components/ChatWindow';
import { apiGetDocuments, apiCreateDocument, apiGetDocument } from '../services/api';

export function UserDashboardPage() {
  const { user } = useAuth();
  const [documents, setDocuments] = useState<ChatDocument[]>([]);
  const [activeDoc, setActiveDoc] = useState<ChatDocument | null>(null);
  const [newChatName, setNewChatName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    apiGetDocuments()
      .then(setDocuments)
      .finally(() => setIsLoading(false));
  }, []);

  const handleJoin = async (id: string) => {
    const doc = await apiGetDocument(id);
    setActiveDoc(doc);
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    const name = newChatName.trim();
    if (!name) return;
    setIsCreating(true);
    try {
      const doc = await apiCreateDocument(name);
      setDocuments((prev) => [doc, ...prev]);
      setActiveDoc(doc);
      setNewChatName('');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="page">
      <PageHeader title="User Dashboard" />
      <main>
        <div className="settings-card">
          <h2>Account Overview</h2>
          <dl className="profile-list">
            <dt>Email</dt>
            <dd>{user?.email}</dd>
            <dt>Password</dt>
            <dd>{user?.hasPassword ? 'Set' : 'Not set (SSO only)'}</dd>
            <dt>Roles</dt>
            <dd>{user?.roles.join(', ')}</dd>
            <dt>SSO Providers</dt>
            <dd>
              {user?.ssoProviders.length
                ? user.ssoProviders.map((p) => p.provider).join(', ')
                : 'None'}
            </dd>
            <dt>Member since</dt>
            <dd>{user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : '—'}</dd>
          </dl>
        </div>

        <div className="doc-section">
          <h2>Chats</h2>

          {isLoading ? (
            <p className="doc-empty">Loading…</p>
          ) : documents.length === 0 ? (
            <p className="doc-empty">No chats yet. Create one below.</p>
          ) : (
            <ul className="doc-list">
              {documents.map((doc) => (
                <li
                  key={doc._id}
                  className={`doc-item${activeDoc?._id === doc._id ? ' active' : ''}`}
                  onClick={() => handleJoin(doc._id)}
                >
                  <span className="doc-name">{doc.name}</span>
                  <span className="doc-meta">
                    {new Date(doc.createdAt).toLocaleDateString()}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <form className="doc-create-form" onSubmit={handleCreate}>
            <input
              className="doc-create-input"
              type="text"
              placeholder="Name a new chat…"
              value={newChatName}
              onChange={(e) => setNewChatName(e.target.value)}
            />
            <button
              type="submit"
              className="btn-primary doc-create-btn"
              disabled={!newChatName.trim() || isCreating}
            >
              {isCreating ? 'Creating…' : 'Create Chat'}
            </button>
          </form>
        </div>

        {activeDoc && (
          <div className="doc-chat-area">
            <ChatWindow
              chatKey={activeDoc.currentChannelId}
              title={activeDoc.name}
              initialMessages={activeDoc.messages}
            />
          </div>
        )}
      </main>
    </div>
  );
}
