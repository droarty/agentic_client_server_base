import { useContext, useLayoutEffect, useId, ReactNode } from 'react';
import { TabsContent } from '@/components/ui/tabs';
import { SmartTabsContext } from './SmartTabs';

interface SmartTabProps {
  id?: string;
  title?: string;
  children?: ReactNode;
}

export function SmartTab({ id: externalId, title = '', children }: SmartTabProps) {
  const generatedId = useId();
  const id = externalId ?? generatedId;
  const ctx = useContext(SmartTabsContext);

  useLayoutEffect(() => {
    ctx?.registerTab(id, title);
    return () => ctx?.unregisterTab(id);
  }, [id, title, ctx]);

  return <TabsContent value={id}>{children}</TabsContent>;
}
