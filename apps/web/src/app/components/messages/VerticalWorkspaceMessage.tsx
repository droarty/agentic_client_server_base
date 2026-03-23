import { VerticalWorkspaceMessage as VerticalWorkspaceMsg } from '@multiplayer-base/shared-types';
import { MessageViewProps } from '../../registry/messageRegistry';
import { TargetPortal } from '../TargetPortal';

export function VerticalWorkspaceMessage({ message }: MessageViewProps) {
  const msg = message as VerticalWorkspaceMsg;
  const totalProportion = msg.panels.reduce((sum, p) => sum + p.widthProportion, 0);

  const content = (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}>
      {msg.panels.map((panel) => (
        <div
          key={panel.locationId}
          id={panel.locationId}
          style={{ flex: `${panel.widthProportion / totalProportion} 0 0`, width: '100%', overflowX: panel.overflowX ?? 'auto', overflowY: panel.overflowY ?? 'hidden' }}
        />
      ))}
    </div>
  );

  if (msg.targetId) {
    return <TargetPortal targetId={msg.targetId}>{content}</TargetPortal>;
  }
  return content;
}
