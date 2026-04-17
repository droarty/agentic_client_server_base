import { useState, useEffect } from 'react';
import { eventManager } from '../services/EventManager';

export function useDashboardChannelId(): string | null {
  const [channelId, setChannelId] = useState<string | null>(eventManager.getDashboardChannelId());

  useEffect(() => {
    eventManager.connect();
    const current = eventManager.getDashboardChannelId();
    if (current) {
      setChannelId(current);
      return;
    }
    return eventManager.onDashboardReady((id) => setChannelId(id));
  }, []);

  return channelId;
}
