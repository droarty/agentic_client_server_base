import { LayoutDocumentView } from '@/app/components/LayoutDocumentView';

interface Props {
  channelId?: string;
  viewHandler?: string;
  [key: string]: unknown;
}

export function LayoutDocumentViewLayout({ channelId, viewHandler }: Props) {
  return (
    <LayoutDocumentView
      channelId={channelId as string | undefined}
      viewHandler={viewHandler as string | undefined}
    />
  );
}
