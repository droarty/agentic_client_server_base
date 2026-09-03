import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

interface Props {
  children: ReactNode;
}

export function RequireGlobalAdmin({ children }: Props) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <div className="loading">Loading...</div>;
  }

  if (!user?.isGlobalAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
