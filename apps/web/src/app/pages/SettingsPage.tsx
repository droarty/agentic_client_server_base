import { useState, FormEvent, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { apiUpdateMe, apiConnectGooglePhotos } from '../services/api';

export function SettingsPage() {
  const { user, setUser, logout } = useAuth();
  const [email, setEmail] = useState(user?.email || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [searchParams, setSearchParams] = useSearchParams();
  // Captured once, in state — not read live from searchParams, since the URL
  // param gets cleared right after mount (below) and the banner still needs
  // to render after that happens.
  const [googlePhotosConnected] = useState(() => searchParams.get('googlePhotosConnected'));
  const [gpError, setGpError] = useState('');

  useEffect(() => {
    if (googlePhotosConnected !== null) {
      setSearchParams({}, { replace: true });
    }
    // Only run once on mount to consume the query param.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleConnectGooglePhotos = async () => {
    setGpError('');
    try {
      const authUrl = await apiConnectGooglePhotos();
      window.location.href = authUrl;
    } catch {
      setGpError('Failed to start Google Photos connection');
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (newPassword && newPassword !== confirmNewPassword) {
      setError('New passwords do not match');
      return;
    }

    setIsSubmitting(true);

    try {
      const updates: { email?: string; currentPassword?: string; newPassword?: string } = {};
      if (email !== user?.email) updates.email = email;
      if (newPassword) {
        updates.currentPassword = currentPassword;
        updates.newPassword = newPassword;
      }

      const updated = await apiUpdateMe(updates);
      setUser(updated);
      setSuccess('Settings updated successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Failed to update settings';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="page">
      <header className="page-header">
        <h1>Settings</h1>
        <nav>
          <Link to="/dashboard" className="btn-secondary">Dashboard</Link>
          <Link to="/assets" className="btn-secondary">My Assets</Link>
          <button onClick={logout} className="btn-secondary">Logout</button>
        </nav>
      </header>

      <main>
        {googlePhotosConnected === '1' && <div className="success-message" role="status">Google Photos connected successfully.</div>}
        {googlePhotosConnected === '0' && <div className="error-message" role="alert">Failed to connect Google Photos.</div>}

        <div className="settings-card">
          <h2>Google Photos</h2>
          {gpError && <div className="error-message" role="alert">{gpError}</div>}
          <button onClick={handleConnectGooglePhotos} className="btn-primary">Connect Google Photos</button>
        </div>

        <div className="settings-card">
          <h2>Account Settings</h2>
          {error && <div className="error-message" role="alert">{error}</div>}
          {success && <div className="success-message" role="status">{success}</div>}
          <form onSubmit={handleSubmit} noValidate>
            <div className="form-group">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>

            <hr />
            <h3>Change Password</h3>
            <p className="hint">Leave blank to keep your current password.</p>

            <div className="form-group">
              <label htmlFor="currentPassword">Current Password</label>
              <input
                id="currentPassword"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
                placeholder="Required to change password"
              />
            </div>
            <div className="form-group">
              <label htmlFor="newPassword">New Password</label>
              <input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                placeholder="At least 6 characters"
              />
            </div>
            <div className="form-group">
              <label htmlFor="confirmNewPassword">Confirm New Password</label>
              <input
                id="confirmNewPassword"
                type="password"
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
                autoComplete="new-password"
                placeholder="Repeat new password"
              />
            </div>

            <button type="submit" className="btn-primary" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : 'Save Changes'}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
