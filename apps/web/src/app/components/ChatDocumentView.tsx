import { AddTextMessage, AddColorfulTextMessage } from '@multiplayer-base/shared-types';
import { DocumentViewProps } from '../registry/documentRegistry';
import { useDocumentChannel } from '../hooks/useDocumentChannel';
import { MessageList } from './chat/MessageList';
import { ChatInput } from './chat/ChatInput';

export function ChatDocumentView({ doc }: DocumentViewProps) {
  const { messages, emit } = useDocumentChannel(doc.currentChannelId, doc.messages);

  const handleSend = ({ text, color }: { text: string; color?: string }) => {
    if (color) {
      emit('add-colorful-text', { text, color } satisfies Omit<AddColorfulTextMessage, 'type' | 'from' | 'to' | 'channel' | 'timestamp'>);
    } else {
      emit('add-text', { text } satisfies Omit<AddTextMessage, 'type' | 'from' | 'to' | 'channel' | 'timestamp'>);
    }
  };

  return (
    <div className="chat-window">
      <div className="chat-header">{doc.name}</div>
      <MessageList messages={messages} />
      <ChatInput onSend={handleSend} />
    </div>
  );
}
