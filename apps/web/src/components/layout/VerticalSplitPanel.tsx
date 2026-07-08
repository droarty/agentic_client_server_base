import { ReactNode, useCallback, useRef, useState } from 'react';

interface Props {
  top: ReactNode;
  bottom: ReactNode;
  initialTopPercent?: number;
}

const MIN_PERCENT = 15;
const MAX_PERCENT = 85;

export function VerticalSplitPanel({ top, bottom, initialTopPercent = 40 }: Props) {
  const [topPercent, setTopPercent] = useState(initialTopPercent);
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const percent = ((event.clientY - rect.top) / rect.height) * 100;
    setTopPercent(Math.min(MAX_PERCENT, Math.max(MIN_PERCENT, percent)));
  }, []);

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
  }, []);

  const handlePointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = false;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }, []);

  return (
    <div
      ref={containerRef}
      className="v-split"
      style={{ '--top-size': `${topPercent}fr`, '--bottom-size': `${100 - topPercent}fr` } as React.CSSProperties}
    >
      <div className="v-split-top">{top}</div>
      <div
        className="v-split-handle"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      />
      <div className="v-split-bottom">{bottom}</div>
    </div>
  );
}
