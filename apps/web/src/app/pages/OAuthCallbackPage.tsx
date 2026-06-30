import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { apiExchangeOAuthCode } from '../services/api';

export function OAuthCallbackPage() {
  const [searchParams] = useSearchParams();
  const didExchange = useRef(false);

  useEffect(() => {
    if (didExchange.current) return;
    didExchange.current = true;

    const code = searchParams.get('code');
    const error = searchParams.get('error');

    if (error || !code) {
      window.location.replace('/login?error=oauth_failed');
      return;
    }

    apiExchangeOAuthCode(code)
      .then((token) => {
        localStorage.setItem('token', token);
        window.location.replace('/user');
      })
      .catch(() => {
        window.location.replace('/login?error=oauth_failed');
      });
  }, []);

  return <div className="loading">Signing you in...</div>;
}
