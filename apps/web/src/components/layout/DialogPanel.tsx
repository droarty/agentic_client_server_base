import { ReactNode } from 'react';
import { Dialog } from '@/components/ui/dialog';

interface Props {
  open?: unknown;
  title?: string;
  children?: ReactNode;
  onClose?: (payload: Record<string, unknown>) => void;
  [key: string]: unknown;
}

export function DialogPanel({ open, title, children, onClose }: Props) {
  return (
    <Dialog open={Boolean(open)} onClose={() => onClose?.({})} title={title ?? ''}>
      {children}
    </Dialog>
  );
}
