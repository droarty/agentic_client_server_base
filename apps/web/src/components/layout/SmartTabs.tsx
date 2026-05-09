import { useState, useLayoutEffect, useCallback, createContext, ReactNode } from 'react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface TabEntry {
  id: string;
  title: string;
}

export interface SmartTabsContextValue {
  registerTab: (id: string, title: string) => void;
  unregisterTab: (id: string) => void;
}

export const SmartTabsContext = createContext<SmartTabsContextValue | null>(null);

export function SmartTabs({ children }: { children?: ReactNode }) {
  const [tabs, setTabs] = useState<TabEntry[]>([]);
  const [activeTab, setActiveTab] = useState('');

  const registerTab = useCallback((id: string, title: string) => {
    setTabs(prev => {
      if (prev.find(t => t.id === id && t.title === title)) return prev;
      const filtered = prev.filter(t => t.id !== id);
      return [...filtered, { id, title }];
    });
  }, []);

  const unregisterTab = useCallback((id: string) => {
    setTabs(prev => prev.filter(t => t.id !== id));
  }, []);

  useLayoutEffect(() => {
    if (tabs.length > 0 && !activeTab) setActiveTab(tabs[0].id);
  }, [tabs, activeTab]);

  return (
    <SmartTabsContext.Provider value={{ registerTab, unregisterTab }}>
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList variant="line">
          {tabs.map(tab => (
            <TabsTrigger key={tab.id} variant="line" value={tab.id}>
              {tab.title}
            </TabsTrigger>
          ))}
        </TabsList>
        {children}
      </Tabs>
    </SmartTabsContext.Provider>
  );
}
