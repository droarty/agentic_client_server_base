import { ChatWindow } from './ChatWindow';
import { DocumentViewProps } from '../registry/documentRegistry';

export function ChatDocumentView({ doc }: DocumentViewProps) {
  return (
    <ChatWindow
      chatKey={doc.currentChannelId}
      title={doc.name}
      initialMessages={doc.messages}
    />
  );
}
