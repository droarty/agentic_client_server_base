import { Button } from '@/components/ui/button';

interface Props {
  label: string;
  onClick?: (payload: Record<string, unknown>) => void;
  emit?: unknown;
  targetId?: string;
  channelId?: string;
  [key: string]: unknown;
}

export function ActionButton({ label, onClick, emit, targetId, channelId, ...payload }: Props) {
  return (
    <div className="action-button">
      <Button type="button" variant="default" onClick={() => onClick?.(payload)}>
        {label}
      </Button>
    </div>
  );
}
