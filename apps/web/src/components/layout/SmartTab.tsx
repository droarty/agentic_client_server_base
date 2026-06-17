import { useContext, useLayoutEffect, useId, ReactNode } from 'react';
import { TabsContent } from '@/components/ui/tabs';
import { SmartTabsContext } from './SmartTabs';

interface SmartTabProps {
  id?: string;
  title?: string;
  onClose?: (payload: Record<string, unknown>) => void;
  children?: ReactNode;
}

export function SmartTab({ id: externalId, title = '', onClose, children }: SmartTabProps) {
  const generatedId = useId();
  const id = externalId ?? generatedId;
  const ctx = useContext(SmartTabsContext);

  useLayoutEffect(() => {
    const handleClose = onClose ? () => onClose({ _id: id }) : undefined;
    ctx?.registerTab(id, title, handleClose);
    return () => ctx?.unregisterTab(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, title, !!onClose, ctx]);

  return <TabsContent value={id}>{children}</TabsContent>;
}
