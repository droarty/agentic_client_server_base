import { writable } from 'svelte/store';
import { eventManager } from '$lib/services/EventManager';

function createDashboardChannelIdStore() {
  const { subscribe, set } = writable<string | null>(null);

  const initial = eventManager.getDashboardChannelId();
  if (initial) set(initial);

  eventManager.onDashboardReady((id) => set(id));

  return { subscribe };
}

export const dashboardChannelId = createDashboardChannelIdStore();
