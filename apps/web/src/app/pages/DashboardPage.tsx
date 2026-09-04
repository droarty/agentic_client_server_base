import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { PageHeader } from '../components/PageHeader';
import { apiGetIsGlobalAdmin } from '../services/api';

const DASHBOARD_CARDS = [
  { path: '/dashboard/user',   label: 'User Dashboard',   description: 'Your profile and account overview.' },
  { path: '/dashboard/author', label: 'Author Dashboard', description: 'Manage and publish your content.' },
  { path: '/dashboard/admin',  label: 'Admin Dashboard',  description: 'Manage users.' },
];

export function DashboardPage() {
  const { user } = useAuth();
  // Not part of the User DTO — checking this on every login/register/getMe
  // would run it on every auth for the sake of the rare account that's
  // actually a global admin, so it's fetched separately, once, only here.
  const [isGlobalAdmin, setIsGlobalAdmin] = useState(false);

  useEffect(() => {
    apiGetIsGlobalAdmin().then(setIsGlobalAdmin).catch(() => setIsGlobalAdmin(false));
  }, []);

  const cards = [
    ...DASHBOARD_CARDS,
    ...(isGlobalAdmin
      ? [{ path: '/dashboard/global-admin', label: 'Global Admin Dashboard', description: 'Manage global admins and root-level groups.' }]
      : []),
  ];

  return (
    <div className="page">
      <PageHeader title="Dashboard" />
      <main>
        <p className="dashboard-welcome">Welcome back, <strong>{user?.email}</strong></p>
        <div className="role-cards">
          {cards.map((card) => (
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
