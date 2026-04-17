import { ReactNode } from 'react';

export interface TabItem {
  id: string;
  title: string;
}

interface TabsProps {
  tabs: TabItem[];
  activeTabId: string | null;
  onTabSelect: (tabId: string) => void;
}

export function Tabs({ tabs, activeTabId, onTabSelect }: TabsProps) {
  return (
    <div className="tabs">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className={`tab-button${activeTabId === tab.id ? ' active' : ''}`}
          onClick={() => onTabSelect(tab.id)}
        >
          {tab.title}
        </button>
      ))}
    </div>
  );
}

interface TabPanelProps {
  tabId: string;
  activeTabId: string | null;
  children: ReactNode;
}

export function TabPanel({ tabId, activeTabId, children }: TabPanelProps) {
  if (tabId !== activeTabId) return null;
  return <>{children}</>;
}
