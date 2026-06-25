import { DisplayJsonMessage as DisplayJsonMsg } from '@agentic-client-server-base/shared-types';
import { MessageViewProps } from '../../registry/messageRegistry';
import { TargetPortal } from '../TargetPortal';

export function DisplayJsonMessage({ message }: MessageViewProps) {
  const msg = message as DisplayJsonMsg;
  const content = (
    <div>
      <pre>{JSON.stringify(msg.json, null, 2)}</pre>
    </div>
  );

  if (msg.targetId) {
    return <TargetPortal targetId={msg.targetId}>{content}</TargetPortal>;
  }
  return content;
}
