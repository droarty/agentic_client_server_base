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
};

export function getMessageComponent(type: string): LazyMessageComponent | null {
  return registry[type] ?? null;
}
