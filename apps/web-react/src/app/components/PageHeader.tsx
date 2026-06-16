import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

interface PageHeaderProps {
  title: string;
}

export function PageHeader({ title }: PageHeaderProps) {
  const { user, logout } = useAuth();

  return (
    <header className="page-header">
      <h1>{title}</h1>
      <nav>
        <span>{user?.email}</span>
        <Link to="/dashboard" className="btn-secondary">Dashboard</Link>
        <Link to="/settings" className="btn-secondary">Settings</Link>
        <button onClick={logout} className="btn-secondary">Logout</button>
      </nav>
    </header>
  );
}
