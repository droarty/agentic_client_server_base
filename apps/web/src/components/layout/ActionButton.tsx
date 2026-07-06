import { Button } from '@/components/ui/button';

interface Props {
  label: string;
  onClick?: (payload: Record<string, unknown>) => void;
  [key: string]: unknown;
}

export function ActionButton({ label, onClick }: Props) {
  return (
    <div className="action-button">
      <Button type="button" variant="default" onClick={() => onClick?.({})}>
        {label}
      </Button>
    </div>
  );
}
