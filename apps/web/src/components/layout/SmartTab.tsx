import { useContext, useLayoutEffect, useEffect, useId, useState, ReactNode } from 'react';
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
  const isActive = ctx?.activeTab === id;

  // Deferred mount: children render only once this tab has been selected at least
  // once, so a tab holding e.g. a `namedView` doesn't fetch until the user clicks it.
  const [everActive, setEverActive] = useState(isActive);
  useEffect(() => {
    if (isActive) setEverActive(true);
  }, [isActive]);

  useLayoutEffect(() => {
    const handleClose = onClose ? () => onClose({ _id: id }) : undefined;
    ctx?.registerTab(id, title, handleClose);
    return () => ctx?.unregisterTab(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, title, !!onClose, ctx]);

  return <TabsContent value={id} className="smart-tab-content">{everActive ? children : null}</TabsContent>;
}
