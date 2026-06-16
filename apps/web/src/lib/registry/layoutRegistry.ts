type SvelteImport = () => Promise<{ default: unknown }>;

const registry: Partial<Record<string, SvelteImport>> = {
  fullPanel: () => import('@/lib/components/layout/FullPanel.svelte'),
  chatBody: () => import('@/lib/components/layout/ChatBody.svelte'),
  chatInput: () => import('@/lib/components/layout/ChatInput.svelte'),
  smartAccordion: () => import('@/lib/components/layout/SmartAccordion.svelte'),
  logTreePanel: () => import('@/lib/components/layout/LogTreePanel.svelte'),
  smartTab: () => import('@/lib/components/layout/SmartTab.svelte'),
  smartTabs: () => import('@/lib/components/layout/SmartTabs.svelte'),
  documentList: () => import('@/lib/components/layout/DocumentList.svelte'),
  newDocument: () => import('@/lib/components/layout/NewDocument.svelte'),
  layoutDocumentView: () => import('@/lib/components/layout/LayoutDocumentViewLayout.svelte'),
};

export function getLayoutComponent(componentType: string): SvelteImport | null {
  return registry[componentType] ?? null;
}
