import { lazy, ComponentType } from 'react';

export interface LayoutComponentProps {
  [key: string]: unknown;
}

type LazyLayoutComponent = ReturnType<typeof lazy<ComponentType<LayoutComponentProps>>>;

const registry: Partial<Record<string, LazyLayoutComponent>> = {
  fullPanel: lazy(() =>
    import('@/components/layout/FullPanel').then((m) => ({ default: m.FullPanel as ComponentType<LayoutComponentProps> }))
  ),
  inviteUsers: lazy(() =>
    import('@/components/layout/InviteUsers').then((m) => ({ default: m.InviteUsers as ComponentType<LayoutComponentProps> }))
  ),
  chatBody: lazy(() =>
    import('@/components/layout/ChatBody').then((m) => ({ default: m.ChatBody as ComponentType<LayoutComponentProps> }))
  ),
  chatInput: lazy(() =>
    import('@/components/layout/ChatInput').then((m) => ({ default: m.ChatInput as ComponentType<LayoutComponentProps> }))
  ),
};

export function getLayoutComponent(componentType: string): LazyLayoutComponent | null {
  return registry[componentType] ?? null;
}
