import { useState, Children, ReactNode } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

interface Props {
  tabTitles?: string[];
  dynamicChildren?: ReactNode[];
  dynamicTabIds?: string[];
  dynamicTabTitles?: string[];
  children?: ReactNode;
  [key: string]: unknown;
}

export function SmartTabs({
  tabTitles = [],
  dynamicChildren = [],
  dynamicTabIds = [],
  dynamicTabTitles = [],
  children,
}: Props) {
  const staticChildren = Children.toArray(children);
  const [activeTab, setActiveTab] = useState('static-0');

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab}>
      <TabsList variant="line">
        {staticChildren.map((_, i) => (
          <TabsTrigger key={`static-${i}`} variant="line" value={`static-${i}`}>
            {(tabTitles as string[])[i] ?? `Tab ${i + 1}`}
          </TabsTrigger>
        ))}
        {(dynamicTabIds as string[]).map((id, i) => (
          <TabsTrigger key={id} variant="line" value={id}>
            {(dynamicTabTitles as string[])[i] ?? id}
          </TabsTrigger>
        ))}
      </TabsList>

      {staticChildren.map((child, i) => (
        <TabsContent key={`static-${i}`} value={`static-${i}`}>
          {child}
        </TabsContent>
      ))}

      {(dynamicTabIds as string[]).map((id, i) => (
        <TabsContent key={id} value={id}>
          {(dynamicChildren as ReactNode[])[i]}
        </TabsContent>
      ))}
    </Tabs>
  );
}
