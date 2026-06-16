import { lazy, ComponentType } from 'react';
import { OutboundMessage } from '@multiplayer-base/shared-types';

export interface MessageViewProps {
  message: OutboundMessage;
}

type LazyMessageComponent = ReturnType<typeof lazy<ComponentType<MessageViewProps>>>;

const registry: Partial<Record<string, LazyMessageComponent>> = {
  'display-text': lazy(() =>
    import('../components/messages/DisplayTextMessage').then((m) => ({ default: m.DisplayTextMessage }))
  ),
  'display-colorful-text': lazy(() =>
    import('../components/messages/DisplayColorfulTextMessage').then((m) => ({ default: m.DisplayColorfulTextMessage }))
  ),
  'simple-tab': lazy(() =>
    import('../components/messages/SimpleTabMessage').then((m) => ({ default: m.SimpleTabMessage }))
  ),
  'horizontal-workspace': lazy(() =>
    import('../components/messages/HorizontalWorkspaceMessage').then((m) => ({ default: m.HorizontalWorkspaceMessage }))
  ),
  'vertical-workspace': lazy(() =>
    import('../components/messages/VerticalWorkspaceMessage').then((m) => ({ default: m.VerticalWorkspaceMessage }))
  ),
  'display-json': lazy(() =>
    import('../components/messages/DisplayJsonMessage').then((m) => ({ default: m.DisplayJsonMessage }))
  ),
};

export function getMessageComponent(type: string): LazyMessageComponent | null {
  return registry[type] ?? null;
}
