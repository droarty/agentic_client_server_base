import * as React from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';

const Tabs = TabsPrimitive.Root;

type TabsVariant = 'default' | 'line';

interface TabsListProps extends React.ComponentPropsWithRef<typeof TabsPrimitive.List> {
  variant?: TabsVariant;
}

function TabsList({ ref, className, variant = 'default', ...props }: TabsListProps) {
  const variantClass = variant === 'line' ? 'tabs-list tabs-list--line' : 'tabs-list';
  return (
    <TabsPrimitive.List
      ref={ref}
      className={[variantClass, className].filter(Boolean).join(' ')}
      data-variant={variant}
      {...props}
    />
  );
}
TabsList.displayName = TabsPrimitive.List.displayName;

interface TabsTriggerProps extends React.ComponentPropsWithRef<typeof TabsPrimitive.Trigger> {
  variant?: TabsVariant;
}

function TabsTrigger({ ref, className, variant = 'default', ...props }: TabsTriggerProps) {
  const variantClass = variant === 'line' ? 'tabs-trigger tabs-trigger--line' : 'tabs-trigger';
  return (
    <TabsPrimitive.Trigger
      ref={ref}
      className={[variantClass, className].filter(Boolean).join(' ')}
      {...props}
    />
  );
}
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

function TabsContent({ ref, className, ...props }: React.ComponentPropsWithRef<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      ref={ref}
      className={['tabs-content', className].filter(Boolean).join(' ')}
      {...props}
    />
  );
}
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };
export type { TabsVariant };
