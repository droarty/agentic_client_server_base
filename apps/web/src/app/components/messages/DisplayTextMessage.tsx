import { DisplayTextMessage as DisplayTextMsg } from '@agentic-client-server-base/shared-types';
import { MessageViewProps } from '../../registry/messageRegistry';
import { TargetPortal } from '../TargetPortal';

export function DisplayTextMessage({ message }: MessageViewProps) {
  const msg = message as DisplayTextMsg;
  const content = (
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

  if (msg.targetId) {
    return <TargetPortal targetId={msg.targetId}>{content}</TargetPortal>;
  }
  return content;
}
