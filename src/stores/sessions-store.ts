'use client';

import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';

export interface SessionSummary {
  id: string;
  title: string;
  description?: string | null;
  meta: string;
  isError?: boolean;
  status?: 'idle' | 'loading' | 'error' | 'completed' | 'cancelled';
  lastStep?: string | null;
  startedAt?: number | null;
  createdAt?: number;
  updatedAt?: number;
}

interface SessionsState {
  sessions: SessionSummary[];
  loading: boolean;
  error: string | null;
  lastFetched: number | null;
}

export interface SessionsActions {
  setSessions: (sessions: SessionSummary[]) => void;
  addSession: (session: SessionSummary) => void;
  updateSession: (sessionId: string, updates: Partial<SessionSummary>) => void;
  removeSession: (sessionId: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setLastFetched: (timestamp: number) => void;
  refreshIfNeeded: () => boolean;
}

interface SessionsExtraActions {
  hydrateFromServer: () => Promise<void>;
}

type SessionsStoreState =
  & SessionsState
  & SessionsActions
  & SessionsExtraActions;

const SESSIONS_REFRESH_TTL_MS = 30_000;
let hydrateSessionsInFlight: Promise<void> | null = null;
const updateSessionInFlightByKey = new Map<string, Promise<void>>();

const initialState: SessionsState = {
  sessions: [],
  loading: false,
  error: null,
  lastFetched: null,
};

function normalizeAndSortSessions(
  sessions: SessionSummary[],
  fallbackNow: number,
): SessionSummary[] {
  const normalized = sessions.map(session => ({
    ...session,
    startedAt:
      typeof session.startedAt === 'number' ? session.startedAt : session.startedAt ?? null,
    createdAt: session.createdAt ?? fallbackNow,
    updatedAt: session.updatedAt ?? fallbackNow,
  }));

  normalized.sort((a, b) => {
    const updatedDiff = (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
    if (updatedDiff !== 0) return updatedDiff;

    return b.id.localeCompare(a.id);
  });

  return normalized;
}

async function readSessionsFromApi(): Promise<SessionSummary[]> {
  const response = await fetch('/api/sessions', {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch sessions (${response.status})`);
  }

  const payload = (await response.json()) as { sessions?: SessionSummary[] };
  return Array.isArray(payload.sessions) ? payload.sessions : [];
}

async function createSessionOnApi(session: SessionSummary): Promise<void> {
  const response = await fetch('/api/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: session.id,
      title: session.title,
      description: session.description ?? null,
    }),
  });
  if (!response.ok) {
    throw new Error(`Failed to create session (${response.status})`);
  }
}

async function updateSessionOnApi(
  sessionId: string,
  updates: Partial<SessionSummary>,
): Promise<void> {
  const patchPayload: Record<string, unknown> = {};

  if (typeof updates.title === 'string' && updates.title.trim()) {
    patchPayload.title = updates.title.trim();
  }
  if ('description' in updates) {
    patchPayload.description = updates.description ?? null;
  }
  if (updates.status) {
    if (updates.status === 'idle') patchPayload.status = 'IDLE';
    if (updates.status === 'loading') patchPayload.status = 'RUNNING';
    if (updates.status === 'completed') patchPayload.status = 'COMPLETED';
    if (updates.status === 'error') patchPayload.status = 'ERROR';
    if (updates.status === 'cancelled') patchPayload.status = 'CANCELLED';
  }
  if ('lastStep' in updates) {
    patchPayload.currentStep = updates.lastStep ?? null;
  }
  if ('isError' in updates) {
    patchPayload.lastError = updates.isError ? updates.meta ?? 'Error' : null;
  }

  if (Object.keys(patchPayload).length === 0) return;

  const requestKey = `${sessionId}:${JSON.stringify(patchPayload)}`;
  const pending = updateSessionInFlightByKey.get(requestKey);
  if (pending) return pending;

  const request = (async () => {
    const response = await fetch(`/api/sessions/${sessionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patchPayload),
    });
    if (!response.ok) {
      throw new Error(`Failed to update session (${response.status})`);
    }
  })();

  const wrapped = request.finally(() => {
    updateSessionInFlightByKey.delete(requestKey);
  });
  updateSessionInFlightByKey.set(requestKey, wrapped);
  return wrapped;
}

async function removeSessionOnApi(sessionId: string): Promise<void> {
  const response = await fetch(`/api/sessions/${sessionId}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    throw new Error(`Failed to remove session (${response.status})`);
  }
}

const useSessionsZustandStore = create<SessionsStoreState>((set, get) => ({
  ...initialState,

  setSessions(sessions) {
    const now = Date.now();
    set({
      sessions: normalizeAndSortSessions(sessions, now),
      loading: false,
      error: null,
      lastFetched: now,
    });
  },

  addSession(session) {
    const now = Date.now();
    set(previous => {
      const nextSession: SessionSummary = {
        ...session,
        startedAt:
          typeof session.startedAt === 'number' ? session.startedAt : session.startedAt ?? null,
        createdAt: session.createdAt ?? now,
        updatedAt: session.updatedAt ?? now,
      };
      const rest = previous.sessions.filter(item => item.id !== session.id);
      return {
        ...previous,
        sessions: [nextSession, ...rest],
      };
    });

    void createSessionOnApi(session).catch(error => {
      const message =
        error instanceof Error ? error.message : 'Failed to create session';
      set(previous => ({
        ...previous,
        error: message,
      }));
    });
  },

  updateSession(sessionId, updates) {
    if (!updates || Object.keys(updates).length === 0) return;
    const shouldRefreshSessionsAfterUpdate =
      (typeof updates.title === 'string' && updates.title.trim().length > 0) ||
      Object.prototype.hasOwnProperty.call(updates, 'description');
    let changed = false;

    set(previous => {
      const nextSessions = previous.sessions.map(session => {
        if (session.id !== sessionId) return session;

        const nextSession: SessionSummary = {
          ...session,
          ...updates,
          updatedAt: Date.now(),
        };

        const hasDiff =
          nextSession.title !== session.title ||
          nextSession.description !== session.description ||
          nextSession.meta !== session.meta ||
          nextSession.isError !== session.isError ||
          nextSession.status !== session.status ||
          nextSession.lastStep !== session.lastStep ||
          nextSession.startedAt !== session.startedAt ||
          nextSession.createdAt !== session.createdAt;

        if (hasDiff) {
          changed = true;
          return nextSession;
        }

        return session;
      });

      if (!changed) return previous;
      return {
        ...previous,
        sessions: nextSessions,
      };
    });

    if (!changed) return;

    void updateSessionOnApi(sessionId, updates)
      .then(() => {
        if (!shouldRefreshSessionsAfterUpdate) return;
        return get().hydrateFromServer();
      })
      .catch(error => {
        const message =
          error instanceof Error ? error.message : 'Failed to update session';
        set(previous => ({
          ...previous,
          error: message,
        }));
      });
  },

  removeSession(sessionId) {
    set(previous => ({
      ...previous,
      sessions: previous.sessions.filter(session => session.id !== sessionId),
    }));

    void removeSessionOnApi(sessionId)
      .then(() => get().hydrateFromServer())
      .catch(error => {
        const message =
          error instanceof Error ? error.message : 'Failed to delete session';
        set(previous => ({
          ...previous,
          error: message,
        }));
      });
  },

  setLoading(loading) {
    set(previous => {
      if (previous.loading === loading) return previous;
      return {
        ...previous,
        loading,
      };
    });
  },

  setError(error) {
    set(previous => {
      if (previous.error === error) return previous;
      return {
        ...previous,
        error,
      };
    });
  },

  setLastFetched(timestamp) {
    set(previous => {
      if (previous.lastFetched === timestamp) return previous;
      return {
        ...previous,
        lastFetched: timestamp,
      };
    });
  },

  refreshIfNeeded() {
    const snapshot = get();
    if (snapshot.loading) return false;
    if (snapshot.lastFetched === null) return true;
    if (snapshot.error) return true;
    return Date.now() - snapshot.lastFetched > SESSIONS_REFRESH_TTL_MS;
  },

  async hydrateFromServer() {
    if (hydrateSessionsInFlight) {
      return hydrateSessionsInFlight;
    }

    const request = (async () => {
      set(previous => ({
        ...previous,
        loading: true,
        error: null,
      }));

      try {
        const sessions = await readSessionsFromApi();
        const now = Date.now();
        set(previous => ({
          ...previous,
          sessions: normalizeAndSortSessions(sessions, now),
          loading: false,
          error: null,
          lastFetched: now,
        }));
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to fetch sessions';
        set(previous => ({
          ...previous,
          loading: false,
          error: message,
        }));
      }
    })();

    hydrateSessionsInFlight = request.finally(() => {
      hydrateSessionsInFlight = null;
    });

    return hydrateSessionsInFlight;
  },
}));

export const sessionsActions: SessionsActions & SessionsExtraActions = {
  setSessions: sessions => useSessionsZustandStore.getState().setSessions(sessions),
  addSession: session => useSessionsZustandStore.getState().addSession(session),
  updateSession: (sessionId, updates) =>
    useSessionsZustandStore.getState().updateSession(sessionId, updates),
  removeSession: sessionId => useSessionsZustandStore.getState().removeSession(sessionId),
  setLoading: loading => useSessionsZustandStore.getState().setLoading(loading),
  setError: error => useSessionsZustandStore.getState().setError(error),
  setLastFetched: timestamp => useSessionsZustandStore.getState().setLastFetched(timestamp),
  refreshIfNeeded: () => useSessionsZustandStore.getState().refreshIfNeeded(),
  hydrateFromServer: () => useSessionsZustandStore.getState().hydrateFromServer(),
};

export const sessionsStore = {
  getState: useSessionsZustandStore.getState,
  subscribe: useSessionsZustandStore.subscribe,
  actions: sessionsActions,
};

export function useSessionsStore<T>(selector: (state: SessionsState) => T): T {
  return useSessionsZustandStore(useShallow(state => selector(state)));
}
