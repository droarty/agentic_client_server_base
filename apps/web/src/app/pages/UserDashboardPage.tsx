import { useAuth } from '../contexts/AuthContext';
import { PageHeader } from '../components/PageHeader';
import { ChatWindow } from '../components/ChatWindow';

const CHAT_TARGETS = ['General', 'Support'];

export function UserDashboardPage() {
  const { user } = useAuth();

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
          <ChatWindow chatKey="General" targets={CHAT_TARGETS} />
          <ChatWindow chatKey="Support" targets={CHAT_TARGETS} />
        </div>
      </main>
    </div>
  );
}
