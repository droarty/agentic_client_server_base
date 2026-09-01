import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';

interface Props {
  url?: string;
  label?: string;
  autoOpen?: boolean;
  disabled?: boolean;
  [key: string]: unknown;
}

function openInNewTab(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer');
}

// Generic — not Google-specific. For any URL that can't be embedded in an
// iframe (e.g. Google's Photos Picker session URI), auto-opens a new tab the
// moment `url` transitions to a fresh non-empty value, with a manual button
// as a fallback in case the browser's popup blocker kills the automatic open
// (window.open outside a direct click's call stack is commonly blocked).
export function OpenUrlButton({ url, label = 'Open', autoOpen = true, disabled }: Props) {
  const lastAutoOpenedUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (autoOpen && url && lastAutoOpenedUrlRef.current !== url) {
      lastAutoOpenedUrlRef.current = url;
      openInNewTab(url);
    }
  }, [url, autoOpen]);

  return (
    <div className="open-url-button">
      <Button type="button" variant="default" disabled={disabled || !url} onClick={() => url && openInNewTab(url)}>
        {label}
      </Button>
    </div>
  );
}
