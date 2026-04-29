import { lazy, ComponentType } from 'react';
import { ChatDocument } from '@multiplayer-base/shared-types';

export interface DocumentViewProps {
  doc: ChatDocument;
}

type LazyDocumentComponent = ReturnType<typeof lazy<ComponentType<DocumentViewProps>>>;

const registry: Partial<Record<string, LazyDocumentComponent>> = {
  chat: lazy(() =>
    import('../components/ChatDocumentView').then((m) => ({ default: m.ChatDocumentView }))
  ),
};

export function getDocumentComponent(type: string): LazyDocumentComponent | null {
  return registry[type] ?? null;
}

export function getDocumentTypes(): string[] {
  return Object.keys(registry);
}
