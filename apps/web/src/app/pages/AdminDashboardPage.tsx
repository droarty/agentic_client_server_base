import { useState, useEffect } from 'react';
import { User, Role } from '@multiplayer-base/shared-types';
import { useAuth } from '../contexts/AuthContext';
import { apiGetUsers, apiUpdateUserRoles } from '../services/api';
import { PageHeader } from '../components/PageHeader';

const ALL_ROLES: Role[] = ['user', 'author', 'admin'];

export function AdminDashboardPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    apiGetUsers()
      .then(setUsers)
      .catch(() => setError('Failed to load users'))
      .finally(() => setIsLoading(false));
  }, []);

  const toggleRole = async (user: User, role: Role) => {
    const next: Role[] = user.roles.includes(role)
      ? (user.roles.filter((r) => r !== role) as Role[])
      : ([...user.roles, role] as Role[]);

    setSaving(user._id);
    try {
      const updated = await apiUpdateUserRoles(user._id, next);
      setUsers((prev) => prev.map((u) => (u._id === updated._id ? updated : u)));
    } catch {
      setError('Failed to update roles');
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="page">
      <PageHeader title="Admin Dashboard" />
      <main>
        <h2>User Management</h2>
        {isLoading && <p>Loading...</p>}
        {error && <div className="error-message" role="alert">{error}</div>}
        {!isLoading && !error && (
          <table className="users-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Joined</th>
                {ALL_ROLES.map((r) => (
                  <th key={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u._id}>
                  <td>
                    {u.email}
                    {u._id === currentUser?._id && (
                      <span className="badge">you</span>
                    )}
                  </td>
                  <td>{new Date(u.createdAt).toLocaleDateString()}</td>
                  {ALL_ROLES.map((role) => (
                    <td key={role} className="role-cell">
                      <input
                        type="checkbox"
                        checked={u.roles.includes(role)}
                        disabled={saving === u._id}
                        onChange={() => toggleRole(u, role)}
                        aria-label={`Toggle ${role} for ${u.email}`}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </main>
    </div>
  );
}
