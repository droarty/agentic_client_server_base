import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { PageHeader } from '../components/PageHeader';

interface RoleCard {
  role: 'user' | 'author' | 'admin';
  path: string;
  label: string;
  description: string;
}

const ROLE_CARDS: RoleCard[] = [
  { role: 'user',   path: '/dashboard/user',   label: 'User Dashboard',   description: 'Your profile and account overview.' },
  { role: 'author', path: '/dashboard/author', label: 'Author Dashboard', description: 'Manage and publish your content.' },
  { role: 'admin',  path: '/dashboard/admin',  label: 'Admin Dashboard',  description: 'Manage users and roles.' },
];

export function DashboardPage() {
  const { user } = useAuth();
  const accessibleCards = ROLE_CARDS.filter((c) => user?.roles.includes(c.role));

  return (
    <div className="page">
      <PageHeader title="Dashboard" />
      <main>
        <p className="dashboard-welcome">Welcome back, <strong>{user?.email}</strong></p>
        <div className="role-cards">
          {accessibleCards.map((card) => (
            <Link key={card.role} to={card.path} className="role-card">
              <h2>{card.label}</h2>
              <p>{card.description}</p>
            </Link>
          ))}
        </div>
        {accessibleCards.length === 0 && (
          <p className="hint">You have no role-specific dashboards assigned yet.</p>
        )}
      </main>
    </div>
  );
}
