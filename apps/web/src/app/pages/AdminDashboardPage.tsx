import { useState, useEffect } from 'react';
import { User } from '@agentic-client-server-base/shared-types';
import { useAuth } from '../contexts/AuthContext';
import { apiGetUsers } from '../services/api';
import { PageHeader } from '../components/PageHeader';

export function AdminDashboardPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    apiGetUsers()
      .then(setUsers)
      .catch(() => setError('Failed to load users'))
      .finally(() => setIsLoading(false));
  }, []);

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
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </main>
    </div>
  );
}
