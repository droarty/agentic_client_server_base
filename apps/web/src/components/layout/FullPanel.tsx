import { ReactNode } from 'react';

interface Props {
  targetId?: string;
  className?: string;
  children?: ReactNode;
  [key: string]: unknown;
}

export function FullPanel({ targetId, className, children }: Props) {
  return (
    <div id={targetId} className={['full-panel', className].filter(Boolean).join(' ')}>
      {children}
    </div>
  );
}
