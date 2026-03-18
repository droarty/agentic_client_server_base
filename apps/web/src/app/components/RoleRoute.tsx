import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { Role } from '@multiplayer-base/shared-types';
import { useAuth } from '../contexts/AuthContext';

interface RoleRouteProps {
  role: Role;
  children: ReactNode;
}

export function RoleRoute({ role, children }: RoleRouteProps) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <div className="loading">Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!user.roles.includes(role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
