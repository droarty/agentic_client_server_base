import { Button } from '@/components/ui/button';

interface Props {
  label: string;
  size?: 'default' | 'sm' | 'lg' | 'icon';
  onClick?: (payload: Record<string, unknown>) => void;
  emit?: unknown;
  targetId?: string;
  channelId?: string;
  [key: string]: unknown;
}

export function ActionButton({ label, size, onClick, emit, targetId, channelId, ...payload }: Props) {
  return (
    <div className="action-button">
      <Button type="button" variant="default" size={size} onClick={() => onClick?.(payload)}>
        {label}
      </Button>
    </div>
  );
}
