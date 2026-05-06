import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { PageHeader } from '../components/PageHeader';

const DASHBOARD_CARDS = [
  { path: '/dashboard/user',   label: 'User Dashboard',   description: 'Your profile and account overview.' },
  { path: '/dashboard/author', label: 'Author Dashboard', description: 'Manage and publish your content.' },
  { path: '/dashboard/admin',  label: 'Admin Dashboard',  description: 'Manage users.' },
];

export function DashboardPage() {
  const { user } = useAuth();

  return (
    <div className="page">
      <PageHeader title="Dashboard" />
      <main>
        <p className="dashboard-welcome">Welcome back, <strong>{user?.email}</strong></p>
        <div className="role-cards">
          {DASHBOARD_CARDS.map((card) => (
            <Link key={card.path} to={card.path} className="role-card">
              <h2>{card.label}</h2>
              <p>{card.description}</p>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
