import { useState, useEffect, useRef, ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface TargetPortalProps {
  targetId: string;
  children: ReactNode;
}

export function TargetPortal({ targetId, children }: TargetPortalProps) {
  const [target, setTarget] = useState<Element | null>(() => document.getElementById(targetId));
  const [notFound, setNotFound] = useState(false);
  const retried = useRef(false);

  useEffect(() => {
    if (target || notFound) return;
    const timer = setTimeout(() => {
      retried.current = true;
      const el = document.getElementById(targetId);
      if (el) setTarget(el);
      else setNotFound(true);
    }, 1000);
    return () => clearTimeout(timer);
  }, [targetId, target, notFound]);

  if (notFound) {
    return (
      <div style={{ color: '#fff', backgroundColor: '#c0392b', padding: '8px 12px', borderRadius: 4 }}>
        target id not found
      </div>
    );
  }

  if (!target) return null;

  return createPortal(children, target);
}
