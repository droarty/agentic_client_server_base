import { lazy, ComponentType } from 'react';
import { Artifact } from '@agentic-client-server-base/shared-types';

export interface ArtifactViewProps {
  doc: Artifact;
}

type LazyDocumentComponent = ReturnType<typeof lazy<ComponentType<ArtifactViewProps>>>;

const layoutDocumentView = lazy(() =>
  import('../components/LayoutDocumentView').then((m) => ({ default: m.LayoutDocumentView }))
);

const registry: Partial<Record<string, LazyDocumentComponent>> = {
  'configged-chat': layoutDocumentView,
  'log-review': layoutDocumentView,
  'user-dashboard': layoutDocumentView,
};

export function getDocumentComponent(type: string): LazyDocumentComponent {
  return registry[type] ?? layoutDocumentView;
}

export function getDocumentTypes(): string[] {
  return Object.keys(registry);
}
