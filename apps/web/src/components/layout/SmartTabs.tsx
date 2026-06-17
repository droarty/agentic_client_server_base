import { useState, useLayoutEffect, useEffect, useCallback, useMemo, createContext, ReactNode } from 'react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface TabEntry {
  id: string;
  title: string;
  onClose?: () => void;
}

export interface SmartTabsContextValue {
  registerTab: (id: string, title: string, onClose?: () => void) => void;
  unregisterTab: (id: string) => void;
}

export const SmartTabsContext = createContext<SmartTabsContextValue | null>(null);

export function SmartTabs({ children, selectedId }: { children?: ReactNode; selectedId?: string }) {
  const [tabs, setTabs] = useState<TabEntry[]>([]);
  const [activeTab, setActiveTab] = useState('');

  useEffect(() => {
    if (selectedId && tabs.find(t => t.id === selectedId)) {
      setActiveTab(selectedId);
    }
  }, [selectedId, tabs]);

  const registerTab = useCallback((id: string, title: string, onClose?: () => void) => {
    setTabs(prev => {
      const existing = prev.find(t => t.id === id);
      if (existing && existing.title === title && (existing.onClose != null) === (onClose != null)) return prev;
      const filtered = prev.filter(t => t.id !== id);
      return [...filtered, { id, title, onClose }];
    });
  }, []);

  const unregisterTab = useCallback((id: string) => {
    setTabs(prev => prev.filter(t => t.id !== id));
  }, []);

  useLayoutEffect(() => {
    if (tabs.length > 0 && (!activeTab || !tabs.find(t => t.id === activeTab))) {
      setActiveTab(tabs[0].id);
    }
  }, [tabs, activeTab]);

  const ctx = useMemo<SmartTabsContextValue>(
    () => ({ registerTab, unregisterTab }),
    [registerTab, unregisterTab]
  );

  return (
    <SmartTabsContext.Provider value={ctx}>
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList variant="line">
          {tabs.map(tab => {
            const isActive = tab.id === activeTab;
            return (
              <div key={tab.id} className="inline-flex items-stretch border-r border-foreground/60">
                <TabsTrigger variant="line" value={tab.id} className={tab.onClose ? 'pr-1' : ''}>
                  {tab.title}
                </TabsTrigger>
                {tab.onClose && (
                  <button
                    type="button"
                    aria-label={`Close ${tab.title}`}
                    tabIndex={-1}
                    onClick={() => tab.onClose!()}
                    className={`pr-2 opacity-40 hover:opacity-100 border-b-2 ${isActive ? 'border-primary' : 'border-transparent'}`}
                  >
                    ×
                  </button>
                )}
              </div>
            );
          })}
        </TabsList>
        {children}
      </Tabs>
    </SmartTabsContext.Provider>
  );
}
