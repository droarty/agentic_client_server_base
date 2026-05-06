import { lazy, ComponentType } from 'react';
import { Artifact } from '@multiplayer-base/shared-types';

export interface ArtifactViewProps {
  doc: Artifact;
}

type LazyDocumentComponent = ReturnType<typeof lazy<ComponentType<ArtifactViewProps>>>;

const registry: Partial<Record<string, LazyDocumentComponent>> = {
  'configged-chat': lazy(() =>
    import('../components/LayoutDocumentView').then((m) => ({ default: m.LayoutDocumentView }))
  ),
  'log-review': lazy(() =>
    import('../components/LayoutDocumentView').then((m) => ({ default: m.LayoutDocumentView }))
  ),
};

export function getDocumentComponent(type: string): LazyDocumentComponent | null {
  return registry[type] ?? null;
}

export function getDocumentTypes(): string[] {
  return Object.keys(registry);
}
