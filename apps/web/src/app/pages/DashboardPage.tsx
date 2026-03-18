import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { User } from '@multiplayer-base/shared-types';
import { useAuth } from '../contexts/AuthContext';
import { apiGetUsers } from '../services/api';

export function DashboardPage() {
  const { user, logout } = useAuth();
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
      <header className="page-header">
        <h1>Dashboard</h1>
        <nav>
          <span>Welcome, {user?.email}</span>
          <Link to="/settings" className="btn-secondary">Settings</Link>
          <button onClick={logout} className="btn-secondary">Logout</button>
        </nav>
      </header>

      <main>
        <h2>Users</h2>
        {isLoading && <p>Loading users...</p>}
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
                  <td>{u.email}</td>
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
