import { DisplayColorfulTextMessage as DisplayColorfulTextMsg } from '@multiplayer-base/shared-types';
import { MessageViewProps } from '../../registry/messageRegistry';

export function DisplayColorfulTextMessage({ message }: MessageViewProps) {
  const msg = message as DisplayColorfulTextMsg;
  return (
    <div className="chat-message">
      <div className="chat-message-header">
        <span className="chat-from">{msg.authorEmail}</span>
        <span className="chat-time">
          {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
      <p className="chat-text" style={{ color: msg.color }}>{msg.text}</p>
    </div>
  );
}
