import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

export function OAuthCallbackPage() {
  const [searchParams] = useSearchParams();
  useEffect(() => {
    const token = searchParams.get('token');
    const error = searchParams.get('error');

    if (error || !token) {
      window.location.replace('/login?error=oauth_failed');
      return;
    }

    localStorage.setItem('token', token);
    window.location.replace('/dashboard');
  }, []);

  return <div className="loading">Signing you in...</div>;
}
