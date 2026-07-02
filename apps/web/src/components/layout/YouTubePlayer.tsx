import { useEffect, useRef } from 'react';

interface Props {
  videoId?: string;
  onVideoEnd?: (payload: Record<string, unknown>) => void;
}

declare global {
  interface Window {
    YT: { Player: new (el: HTMLElement, opts: Record<string, unknown>) => unknown };
    onYouTubeIframeAPIReady?: () => void;
  }
}

export function YouTubePlayer({ videoId = '', onVideoEnd }: Props) {
  const playerRef = useRef<HTMLDivElement>(null);
  const firedRef = useRef(false);

  useEffect(() => {
    if (!playerRef.current || !videoId) return;

    firedRef.current = false;

    function initPlayer() {
      if (!playerRef.current) return;
      new window.YT.Player(playerRef.current, {
        videoId,
        width: '100%',
        height: '100%',
        events: {
          onStateChange: ({ data }: { data: number }) => {
            if (data === 0 && !firedRef.current) {
              firedRef.current = true;
              onVideoEnd?.({});
            }
          },
        },
      });
    }

    if (window.YT?.Player) {
      initPlayer();
    } else {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        prev?.();
        initPlayer();
      };
      if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
        const script = document.createElement('script');
        script.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(script);
      }
    }
  }, [videoId]);

  return (
    <div className="yt-player">
      <div className="yt-player-video" ref={playerRef} />
    </div>
  );
}
