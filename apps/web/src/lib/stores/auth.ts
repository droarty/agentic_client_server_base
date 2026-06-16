import { writable } from 'svelte/store';
import type { User } from '@multiplayer-base/shared-types';
import { apiLogin, apiRegister, apiGetMe } from '$lib/services/api';
import { eventManager } from '$lib/services/EventManager';

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
}

function createAuthStore() {
  const { subscribe, set, update } = writable<AuthState>({
    user: null,
    token: null,
    isLoading: true,
  });

  return {
    subscribe,

    async init() {
      const storedToken = localStorage.getItem('token');
      if (!storedToken) {
        update((s) => ({ ...s, isLoading: false }));
        return;
      }
      update((s) => ({ ...s, token: storedToken }));
      try {
        const user = await apiGetMe();
        localStorage.setItem('user', JSON.stringify(user));
        update((s) => ({ ...s, user, isLoading: false }));
        eventManager.connect();
      } catch {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        update((s) => ({ ...s, token: null, isLoading: false }));
      }
    },

    async login(email: string, password: string) {
      const data = await apiLogin(email, password);
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      set({ user: data.user, token: data.token, isLoading: false });
      eventManager.connect();
    },

    async register(email: string, password: string, confirmPassword: string) {
      const data = await apiRegister(email, password, confirmPassword);
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      set({ user: data.user, token: data.token, isLoading: false });
      eventManager.connect();
    },

    logout() {
      eventManager.disconnect();
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      set({ user: null, token: null, isLoading: false });
    },

    setUser(user: User) {
      update((s) => ({ ...s, user }));
      localStorage.setItem('user', JSON.stringify(user));
    },

    setToken(token: string) {
      update((s) => ({ ...s, token }));
      localStorage.setItem('token', token);
    },
  };
}

export const authStore = createAuthStore();

export function initAuth() {
  authStore.init();
}
