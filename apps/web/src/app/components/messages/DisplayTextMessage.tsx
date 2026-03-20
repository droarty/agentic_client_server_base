import { DisplayTextMessage as DisplayTextMsg } from '@multiplayer-base/shared-types';
import { MessageViewProps } from '../../registry/messageRegistry';

export function DisplayTextMessage({ message }: MessageViewProps) {
  const msg = message as DisplayTextMsg;
  return (
    <div className="chat-message">
      <div className="chat-message-header">
        <span className="chat-from">{msg.authorEmail}</span>
        <span className="chat-time">
          {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
      <p className="chat-text">{msg.text}</p>
    </div>
  );
}
