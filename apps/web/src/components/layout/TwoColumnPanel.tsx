import { ReactNode } from 'react';

interface Props {
  left: ReactNode;
  right: ReactNode;
  leftClassName?: string;
  rightClassName?: string;
}

export function TwoColumnPanel({ left, right, leftClassName, rightClassName }: Props) {
  return (
    <div className="two-col-panel">
      <div className={['two-col-panel-left', leftClassName].filter(Boolean).join(' ')}>
        {left}
      </div>
      <div className={['two-col-panel-right', rightClassName].filter(Boolean).join(' ')}>
        {right}
      </div>
    </div>
  );
}
