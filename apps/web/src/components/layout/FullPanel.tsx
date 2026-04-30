import { ReactNode } from 'react';

interface Props {
  targetId?: string;
  children?: ReactNode;
  [key: string]: unknown;
}

export function FullPanel({ targetId, children }: Props) {
  return (
    <div id={targetId} className="full-panel">
      {children}
    </div>
  );
}
