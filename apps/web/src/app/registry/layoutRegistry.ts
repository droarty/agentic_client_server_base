import { lazy, ComponentType } from 'react';

export interface LayoutComponentProps {
  [key: string]: unknown;
}

type LazyLayoutComponent = ReturnType<typeof lazy<ComponentType<LayoutComponentProps>>>;

const registry: Partial<Record<string, LazyLayoutComponent>> = {
  fullPanel: lazy(() =>
    import('@/components/layout/FullPanel').then((m) => ({ default: m.FullPanel as ComponentType<LayoutComponentProps> }))
  ),
  chatBody: lazy(() =>
    import('@/components/layout/ChatBody').then((m) => ({ default: m.ChatBody as ComponentType<LayoutComponentProps> }))
  ),
  chatInput: lazy(() =>
    import('@/components/layout/ChatInput').then((m) => ({ default: m.ChatInput as ComponentType<LayoutComponentProps> }))
  ),
  smartAccordion: lazy(() =>
    import('@/components/layout/SmartAccordion').then((m) => ({ default: m.SmartAccordion as ComponentType<LayoutComponentProps> }))
  ),
  logTreePanel: lazy(() =>
    import('@/components/layout/LogTreePanel').then((m) => ({ default: m.LogTreePanel as ComponentType<LayoutComponentProps> }))
  ),
  smartTab: lazy(() =>
    import('@/components/layout/SmartTab').then((m) => ({ default: m.SmartTab as ComponentType<LayoutComponentProps> }))
  ),
  smartTabs: lazy(() =>
    import('@/components/layout/SmartTabs').then((m) => ({ default: m.SmartTabs as ComponentType<LayoutComponentProps> }))
  ),
  documentList: lazy(() =>
    import('@/components/layout/DocumentList').then((m) => ({ default: m.DocumentList as ComponentType<LayoutComponentProps> }))
  ),
  newDocument: lazy(() =>
    import('@/components/layout/NewDocument').then((m) => ({ default: m.NewDocument as ComponentType<LayoutComponentProps> }))
  ),
  layoutDocumentView: lazy(() =>
    import('@/components/layout/LayoutDocumentViewLayout').then((m) => ({ default: m.LayoutDocumentViewLayout as ComponentType<LayoutComponentProps> }))
  ),
  twoColumnLayout: lazy(() =>
    import('@/components/layout/TwoColumnLayout').then((m) => ({ default: m.TwoColumnLayout as ComponentType<LayoutComponentProps> }))
  ),
  multiFieldInput: lazy(() =>
    import('@/components/layout/MultiFieldInput').then((m) => ({ default: m.MultiFieldInput as ComponentType<LayoutComponentProps> }))
  ),
  textDisplay: lazy(() =>
    import('@/components/layout/TextDisplay').then((m) => ({ default: m.TextDisplay as ComponentType<LayoutComponentProps> }))
  ),
  youtubePlayer: lazy(() =>
    import('@/components/layout/YouTubePlayer').then((m) => ({ default: m.YouTubePlayer as ComponentType<LayoutComponentProps> }))
  ),
  groupNavItem: lazy(() =>
    import('@/components/layout/GroupNavItem').then((m) => ({ default: m.GroupNavItem as ComponentType<LayoutComponentProps> }))
  ),
  sidebarMenu: lazy(() =>
    import('@/components/layout/SidebarMenu').then((m) => ({ default: m.SidebarMenu as ComponentType<LayoutComponentProps> }))
  ),
};

export function getLayoutComponent(componentType: string): LazyLayoutComponent | null {
  return registry[componentType] ?? null;
}
