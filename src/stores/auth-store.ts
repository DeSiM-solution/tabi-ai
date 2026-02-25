'use client';

import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { sessionsActions } from '@/stores/sessions-store';

export interface AuthUser {
  id: string;
  username: string | null;
  email: string | null;
  displayName: string | null;
  image: string | null;
  isGuest: boolean;
  createdAt: string | null;
  lastLoginAt: string | null;
}

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
  lastFetched: number | null;
}

interface AuthActions {
  hydrateFromServer: () => Promise<void>;
  login: (input: { identifier: string; password: string }) => Promise<AuthUser>;
  register: (input: {
    username: string;
    email?: string | null;
    password: string;
    displayName?: string | null;
  }) => Promise<AuthUser>;
  logout: () => Promise<void>;
  refreshIfNeeded: () => boolean;
}

type AuthStoreState = AuthState & AuthActions;

const AUTH_REFRESH_TTL_MS = 30_000;
let hydrateAuthInFlight: Promise<void> | null = null;

function parseApiError(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const error = (payload as { error?: unknown }).error;
  if (typeof error !== 'string') return null;
  const trimmed = error.trim();
  return trimmed || null;
}

async function parseApiUserResponse(response: Response): Promise<AuthUser> {
  const payload = (await response.json().catch(() => ({}))) as {
    user?: AuthUser;
    error?: string;
  };

  if (!response.ok) {
    throw new Error(payload.error || `Auth request failed (${response.status})`);
  }

  if (!payload.user) {
    throw new Error('Missing user payload from auth endpoint.');
  }

  return payload.user;
}

async function fetchCurrentUserFromApi(): Promise<AuthUser> {
  const response = await fetch('/api/auth/me', {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });

  const payload = (await response.json().catch(() => ({}))) as { user?: AuthUser };

  if (!response.ok || !payload.user) {
    throw new Error(`Failed to fetch current user (${response.status})`);
  }

  return payload.user;
}

const useAuthZustandStore = create<AuthStoreState>((set, get) => ({
  user: null,
  loading: false,
  error: null,
  lastFetched: null,

  async hydrateFromServer() {
    if (hydrateAuthInFlight) return hydrateAuthInFlight;

    const request = (async () => {
      set(previous => ({
        ...previous,
        loading: true,
        error: null,
      }));

      try {
        const user = await fetchCurrentUserFromApi();
        set(previous => ({
          ...previous,
          user,
          loading: false,
          error: null,
          lastFetched: Date.now(),
        }));
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to fetch current user';
        set(previous => ({
          ...previous,
          loading: false,
          error: message,
          lastFetched: Date.now(),
        }));
      }
    })();

    hydrateAuthInFlight = request.finally(() => {
      hydrateAuthInFlight = null;
    });

    return hydrateAuthInFlight;
  },

  async login(input) {
    const identifier = input.identifier.trim();
    const password = input.password;

    if (!identifier) {
      throw new Error('Please enter your username or email.');
    }
    if (!password) {
      throw new Error('Please enter your password.');
    }

    set(previous => ({
      ...previous,
      loading: true,
      error: null,
    }));

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password }),
      });

      const user = await parseApiUserResponse(response);

      set(previous => ({
        ...previous,
        user,
        loading: false,
        error: null,
        lastFetched: Date.now(),
      }));

      await sessionsActions.hydrateFromServer();
      return user;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to login';
      set(previous => ({
        ...previous,
        loading: false,
        error: message,
      }));
      throw error;
    }
  },

  async register(input) {
    const username = input.username.trim();
    const email = input.email?.trim() || null;
    const password = input.password;
    const displayName = input.displayName?.trim() || null;

    if (!username) {
      throw new Error('Please enter a username.');
    }
    if (!password) {
      throw new Error('Please enter a password.');
    }

    set(previous => ({
      ...previous,
      loading: true,
      error: null,
    }));

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          email,
          password,
          displayName,
        }),
      });

      const user = await parseApiUserResponse(response);

      set(previous => ({
        ...previous,
        user,
        loading: false,
        error: null,
        lastFetched: Date.now(),
      }));

      await sessionsActions.hydrateFromServer();
      return user;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to register';
      set(previous => ({
        ...previous,
        loading: false,
        error: message,
      }));
      throw error;
    }
  },

  async logout() {
    set(previous => ({
      ...previous,
      loading: true,
      error: null,
    }));

    try {
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        const apiError = parseApiError(payload);
        throw new Error(apiError || `Failed to logout (${response.status})`);
      }

      await get().hydrateFromServer();
      await sessionsActions.hydrateFromServer();
      set(previous => ({
        ...previous,
        loading: false,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to logout';
      set(previous => ({
        ...previous,
        loading: false,
        error: message,
      }));
      throw error;
    }
  },

  refreshIfNeeded() {
    const snapshot = get();
    if (snapshot.loading) return false;
    if (snapshot.lastFetched === null) return true;
    if (snapshot.error) return true;
    return Date.now() - snapshot.lastFetched > AUTH_REFRESH_TTL_MS;
  },
}));

export const authActions: AuthActions = {
  hydrateFromServer: () => useAuthZustandStore.getState().hydrateFromServer(),
  login: input => useAuthZustandStore.getState().login(input),
  register: input => useAuthZustandStore.getState().register(input),
  logout: () => useAuthZustandStore.getState().logout(),
  refreshIfNeeded: () => useAuthZustandStore.getState().refreshIfNeeded(),
};

export const authStore = {
  getState: useAuthZustandStore.getState,
  subscribe: useAuthZustandStore.subscribe,
  actions: authActions,
};

export function useAuthStore<T>(selector: (state: AuthState) => T): T {
  return useAuthZustandStore(useShallow(state => selector(state)));
}
