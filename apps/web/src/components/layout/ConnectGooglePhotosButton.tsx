import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { apiConnectGooglePhotos } from '@/app/services/api';

interface Props {
  label?: string;
  disabled?: boolean;
  [key: string]: unknown;
}

// Self-contained, mirroring OpenUrlButton's shape — no server round trip
// through the workflow engine needed for the click itself: it makes its own
// authenticated request and navigates the browser directly.
export function ConnectGooglePhotosButton({ label = 'Connect Google Photos', disabled }: Props) {
  const [error, setError] = useState('');

  const handleClick = async () => {
    setError('');
    try {
      const authUrl = await apiConnectGooglePhotos();
      window.location.href = authUrl;
    } catch {
      setError('Failed to start Google Photos connection');
    }
  };

  return (
    <div className="connect-google-photos-button">
      <Button type="button" variant="default" disabled={disabled} onClick={handleClick}>
        {label}
      </Button>
      {error && <div className="error-message" role="alert">{error}</div>}
    </div>
  );
}
