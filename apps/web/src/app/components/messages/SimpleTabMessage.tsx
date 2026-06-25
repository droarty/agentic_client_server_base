import { useState } from 'react';
import { SimpleTabMessage as SimpleTabMsg } from '@agentic-client-server-base/shared-types';
import { MessageViewProps } from '../../registry/messageRegistry';
import { TargetPortal } from '../TargetPortal';

export function SimpleTabMessage({ message }: MessageViewProps) {
  const msg = message as SimpleTabMsg;
  const [activeTab, setActiveTab] = useState<string | null>(
    msg.tabs.length > 0 ? msg.tabs[0].locationId : null
  );

  const content = (
    <div className="simple-tab-message">
      <div className="simple-tab-bar">
        {msg.tabs.map((tab) => (
          <button
            key={tab.locationId}
            className={`simple-tab-button${activeTab === tab.locationId ? ' active' : ''}`}
            onClick={() => setActiveTab(activeTab === tab.locationId ? null : tab.locationId)}
          >
            {tab.title}
          </button>
        ))}
      </div>
      {msg.tabs.map((tab) => (
        <div
          key={tab.locationId}
          id={tab.locationId}
          style={{ display: activeTab === tab.locationId ? 'block' : 'none' }}
        />
      ))}
    </div>
  );

  if (msg.targetId) {
    return <TargetPortal targetId={msg.targetId}>{content}</TargetPortal>;
  }
  return content;
}
