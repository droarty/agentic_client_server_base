import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface Props {
  left: ReactNode;
  right: ReactNode;
  leftClassName?: string;
  rightClassName?: string;
}

export function TwoColumnPanel({ left, right, leftClassName, rightClassName }: Props) {
  return (
    <div className="flex h-full w-full overflow-hidden">
      <div className={cn('overflow-y-auto border-r border-border', leftClassName ?? 'w-1/3')}>
        {left}
      </div>
      <div className={cn('flex-1 overflow-y-auto', rightClassName)}>
        {right}
      </div>
    </div>
  );
}
