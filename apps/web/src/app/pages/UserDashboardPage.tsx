import { useState } from 'react';
import { ChatMessage } from '@multiplayer-base/shared-types';
import { useAuth } from '../contexts/AuthContext';
import { PageHeader } from '../components/PageHeader';
import { ChatWindow } from '../components/ChatWindow';

function useChatMessages(from: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const send = (text: string) => {
    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), from, text, timestamp: new Date().toISOString() },
    ]);
  };
  return { messages, send };
}

export function UserDashboardPage() {
  const { user } = useAuth();
  const from = user?.email ?? 'Unknown';

  const general = useChatMessages(from);
  const support = useChatMessages(from);

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

        <div className="chat-grid">
          <ChatWindow chatKey="General" messages={general.messages} onSend={general.send} />
          <ChatWindow chatKey="Support" messages={support.messages} onSend={support.send} />
        </div>
      </main>
    </div>
  );
}
