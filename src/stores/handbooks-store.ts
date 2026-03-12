'use client';

import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import type { HandbookLifecycle } from '@/lib/handbook-lifecycle';
import { DEFAULT_HANDBOOK_LIFECYCLE } from '@/lib/handbook-lifecycle';
import { sessionsActions } from '@/stores/sessions-store';

export interface HandbookSummary {
  id: string;
  sessionId: string;
  title: string;
  lifecycle: HandbookLifecycle;
  previewPath: string | null;
  publishedAt: string | null;
  archivedAt: string | null;
  generatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SessionHandbooksPayload {
  sessionId: string;
  activeHandbookId: string | null;
  handbooks: HandbookSummary[];
}

interface SessionHandbooksState {
  sessionId: string;
  activeHandbookId: string | null;
  handbooks: HandbookSummary[];
  loading: boolean;
  error: string | null;
  lastFetched: number | null;
}

interface HandbooksState {
  bySessionId: Record<string, SessionHandbooksState>;
}

export interface HandbooksActions {
  ensureSession: (sessionId: string) => void;
  clearSession: (sessionId: string) => void;
  hydrateSession: (sessionId: string) => Promise<SessionHandbooksPayload | null>;
  upsertSessionPayload: (payload: SessionHandbooksPayload) => void;
  createHandbook: (
    sessionId: string,
    input: {
      title?: string;
      html: string;
      lifecycle?: HandbookLifecycle;
      previewPath?: string | null;
      sourceContext?: unknown;
      sourceBlocks?: unknown;
      sourceSpotBlocks?: unknown;
      sourceToolOutputs?: unknown;
      style?: string | null;
      thumbnailUrl?: string | null;
      setActive?: boolean;
    },
  ) => Promise<HandbookSummary | null>;
  updateHandbook: (
    sessionId: string,
    handbookId: string,
    patch: {
      title?: string;
      html?: string;
      previewPath?: string | null;
      sourceContext?: unknown;
      sourceBlocks?: unknown;
      sourceSpotBlocks?: unknown;
      sourceToolOutputs?: unknown;
      style?: string | null;
      thumbnailUrl?: string | null;
    },
  ) => Promise<HandbookSummary | null>;
  setActiveHandbook: (
    sessionId: string,
    handbookId: string,
  ) => Promise<boolean>;
  setHandbookLifecycle: (
    sessionId: string,
    handbookId: string,
    lifecycle: HandbookLifecycle,
  ) => Promise<HandbookSummary | null>;
  removeHandbook: (sessionId: string, handbookId: string) => Promise<boolean>;
}

interface HandbooksExtraActions {
  refreshIfNeeded: (sessionId: string) => boolean;
}

type HandbooksStoreState = HandbooksState & HandbooksActions & HandbooksExtraActions;

const HANDBOOKS_REFRESH_TTL_MS = 30_000;
const hydrateHandbooksInFlight = new Map<string, Promise<SessionHandbooksPayload | null>>();
const emptySessionHandbooksCache = new Map<string, SessionHandbooksState>();

function createEmptySessionHandbooks(sessionId: string): SessionHandbooksState {
  return {
    sessionId,
    activeHandbookId: null,
    handbooks: [],
    loading: false,
    error: null,
    lastFetched: null,
  };
}

function getEmptySessionHandbooks(sessionId: string): SessionHandbooksState {
  const cached = emptySessionHandbooksCache.get(sessionId);
  if (cached) return cached;
  const created = createEmptySessionHandbooks(sessionId);
  emptySessionHandbooksCache.set(sessionId, created);
  return created;
}

function normalizeLifecycle(lifecycle: unknown): HandbookLifecycle {
  if (lifecycle === 'PUBLIC' || lifecycle === 'ARCHIVED' || lifecycle === 'DRAFT') {
    return lifecycle;
  }
  return DEFAULT_HANDBOOK_LIFECYCLE;
}

function normalizeHandbook(input: HandbookSummary): HandbookSummary {
  return {
    ...input,
    lifecycle: normalizeLifecycle(input.lifecycle),
    previewPath: input.previewPath ?? null,
    publishedAt: input.publishedAt ?? null,
    archivedAt: input.archivedAt ?? null,
    generatedAt: input.generatedAt ?? null,
  };
}

function resolveActiveHandbookId(
  activeHandbookId: string | null,
  handbooks: HandbookSummary[],
): string | null {
  if (activeHandbookId && handbooks.some(handbook => handbook.id === activeHandbookId)) {
    return activeHandbookId;
  }
  return handbooks[0]?.id ?? null;
}

function syncSessionSummaryFromHandbooks(
  sessionId: string,
  activeHandbookId: string | null,
  handbooks: HandbookSummary[],
) {
  const resolvedActiveHandbookId = resolveActiveHandbookId(activeHandbookId, handbooks);
  const publicHandbookCount = handbooks.filter(
    handbook => handbook.lifecycle === 'PUBLIC',
  ).length;

  sessionsActions.updateSession(sessionId, {
    activeHandbookId: resolvedActiveHandbookId,
    handbookCount: handbooks.length,
    publicHandbookCount,
  });
}

async function fetchSessionHandbooks(
  sessionId: string,
): Promise<SessionHandbooksPayload | null> {
  const response = await fetch(`/api/sessions/${sessionId}/handbooks`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`Failed to fetch handbooks (${response.status})`);
  }

  const payload = (await response.json()) as SessionHandbooksPayload;
  const handbooks = Array.isArray(payload.handbooks)
    ? payload.handbooks.map(normalizeHandbook)
    : [];
  const activeHandbookId = resolveActiveHandbookId(payload.activeHandbookId ?? null, handbooks);
  return {
    sessionId: payload.sessionId,
    activeHandbookId,
    handbooks,
  };
}

function upsertHandbookInList(
  list: HandbookSummary[],
  handbook: HandbookSummary,
): HandbookSummary[] {
  const normalized = normalizeHandbook(handbook);
  const rest = list.filter(item => item.id !== normalized.id);
  return [normalized, ...rest].sort((a, b) => {
    const updatedDiff = new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    if (updatedDiff !== 0) return updatedDiff;
    return b.id.localeCompare(a.id);
  });
}

const useHandbooksZustandStore = create<HandbooksStoreState>((set, get) => ({
  bySessionId: {},

  ensureSession(sessionId) {
    if (!sessionId) return;
    const existing = get().bySessionId[sessionId];
    if (existing) return;
    set(state => ({
      ...state,
      bySessionId: {
        ...state.bySessionId,
        [sessionId]: createEmptySessionHandbooks(sessionId),
      },
    }));
  },

  clearSession(sessionId) {
    if (!sessionId) return;
    set(state => {
      if (!state.bySessionId[sessionId]) return state;
      const next = { ...state.bySessionId };
      delete next[sessionId];
      return {
        ...state,
        bySessionId: next,
      };
    });
  },

  refreshIfNeeded(sessionId) {
    const current = get().bySessionId[sessionId];
    if (!current) return true;
    if (current.loading) return false;
    if (current.error) return true;
    if (current.lastFetched === null) return true;
    return Date.now() - current.lastFetched > HANDBOOKS_REFRESH_TTL_MS;
  },

  upsertSessionPayload(payload) {
    const handbooks = payload.handbooks.map(normalizeHandbook);
    const activeHandbookId = resolveActiveHandbookId(payload.activeHandbookId, handbooks);
    const now = Date.now();
    set(state => ({
      ...state,
      bySessionId: {
        ...state.bySessionId,
        [payload.sessionId]: {
          sessionId: payload.sessionId,
          activeHandbookId,
          handbooks,
          loading: false,
          error: null,
          lastFetched: now,
        },
      },
    }));
    syncSessionSummaryFromHandbooks(payload.sessionId, activeHandbookId, handbooks);
  },

  async hydrateSession(sessionId) {
    if (!sessionId) return null;
    const pending = hydrateHandbooksInFlight.get(sessionId);
    if (pending) return pending;

    set(state => {
      const current = state.bySessionId[sessionId] ?? createEmptySessionHandbooks(sessionId);
      return {
        ...state,
        bySessionId: {
          ...state.bySessionId,
          [sessionId]: {
            ...current,
            loading: true,
            error: null,
          },
        },
      };
    });

    const request = (async () => {
      try {
        const payload = await fetchSessionHandbooks(sessionId);
        const now = Date.now();
        if (!payload) {
          set(state => ({
            ...state,
            bySessionId: {
              ...state.bySessionId,
              [sessionId]: {
                sessionId,
                activeHandbookId: null,
                handbooks: [],
                loading: false,
                error: null,
                lastFetched: now,
              },
            },
          }));
          syncSessionSummaryFromHandbooks(sessionId, null, []);
          return null;
        }

        set(state => ({
          ...state,
          bySessionId: {
            ...state.bySessionId,
            [sessionId]: {
              sessionId: payload.sessionId,
              activeHandbookId: payload.activeHandbookId,
              handbooks: payload.handbooks,
              loading: false,
              error: null,
              lastFetched: now,
            },
          },
        }));
        syncSessionSummaryFromHandbooks(
          payload.sessionId,
          payload.activeHandbookId,
          payload.handbooks,
        );
        return payload;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to fetch handbooks';
        set(state => {
          const current = state.bySessionId[sessionId] ?? createEmptySessionHandbooks(sessionId);
          return {
            ...state,
            bySessionId: {
              ...state.bySessionId,
              [sessionId]: {
                ...current,
                loading: false,
                error: message,
              },
            },
          };
        });
        return null;
      }
    })();

    const wrapped = request.finally(() => {
      hydrateHandbooksInFlight.delete(sessionId);
    });
    hydrateHandbooksInFlight.set(sessionId, wrapped);
    return wrapped;
  },

  async createHandbook(sessionId, input) {
    if (!sessionId) return null;
    const response = await fetch(`/api/sessions/${sessionId}/handbooks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!response.ok) {
      throw new Error(`Failed to create handbook (${response.status})`);
    }
    const payload = (await response.json()) as { handbook?: HandbookSummary };
    if (!payload.handbook) return null;
    const handbook = normalizeHandbook(payload.handbook);
    set(state => {
      const current = state.bySessionId[sessionId] ?? createEmptySessionHandbooks(sessionId);
      const handbooks = upsertHandbookInList(current.handbooks, handbook);
      const activeHandbookId = input.setActive === false
        ? resolveActiveHandbookId(current.activeHandbookId, handbooks)
        : handbook.id;
      return {
        ...state,
        bySessionId: {
          ...state.bySessionId,
          [sessionId]: {
            ...current,
            activeHandbookId,
            handbooks,
            error: null,
            lastFetched: Date.now(),
          },
        },
      };
    });
    const snapshot = get().bySessionId[sessionId];
    if (snapshot) {
      syncSessionSummaryFromHandbooks(sessionId, snapshot.activeHandbookId, snapshot.handbooks);
    }
    return handbook;
  },

  async updateHandbook(sessionId, handbookId, patch) {
    if (!sessionId || !handbookId) return null;
    const response = await fetch(`/api/sessions/${sessionId}/handbooks/${handbookId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!response.ok) {
      throw new Error(`Failed to update handbook (${response.status})`);
    }
    const payload = (await response.json()) as { handbook?: HandbookSummary };
    if (!payload.handbook) return null;
    const handbook = normalizeHandbook(payload.handbook);
    set(state => {
      const current = state.bySessionId[sessionId] ?? createEmptySessionHandbooks(sessionId);
      const handbooks = upsertHandbookInList(current.handbooks, handbook);
      return {
        ...state,
        bySessionId: {
          ...state.bySessionId,
          [sessionId]: {
            ...current,
            handbooks,
            error: null,
            lastFetched: Date.now(),
          },
        },
      };
    });
    const snapshot = get().bySessionId[sessionId];
    if (snapshot) {
      syncSessionSummaryFromHandbooks(sessionId, snapshot.activeHandbookId, snapshot.handbooks);
    }
    return handbook;
  },

  async setActiveHandbook(sessionId, handbookId) {
    if (!sessionId || !handbookId) return false;
    const previousActiveHandbookId =
      get().bySessionId[sessionId]?.activeHandbookId ?? null;
    set(state => {
      const current = state.bySessionId[sessionId] ?? createEmptySessionHandbooks(sessionId);
      return {
        ...state,
        bySessionId: {
          ...state.bySessionId,
          [sessionId]: {
            ...current,
            activeHandbookId: resolveActiveHandbookId(handbookId, current.handbooks),
            error: null,
          },
        },
      };
    });
    const optimisticSnapshot = get().bySessionId[sessionId];
    if (optimisticSnapshot) {
      syncSessionSummaryFromHandbooks(
        sessionId,
        optimisticSnapshot.activeHandbookId,
        optimisticSnapshot.handbooks,
      );
    }
    try {
      const response = await fetch(
        `/api/sessions/${sessionId}/handbooks/${handbookId}/activate`,
        {
          method: 'POST',
        },
      );
      if (!response.ok) {
        throw new Error(`Failed to activate handbook (${response.status})`);
      }
    } catch (error) {
      set(state => {
        const current = state.bySessionId[sessionId] ?? createEmptySessionHandbooks(sessionId);
        if (current.activeHandbookId !== handbookId) return state;
        return {
          ...state,
          bySessionId: {
            ...state.bySessionId,
            [sessionId]: {
              ...current,
              activeHandbookId: resolveActiveHandbookId(
                previousActiveHandbookId,
                current.handbooks,
              ),
              error: error instanceof Error ? error.message : String(error),
            },
          },
        };
      });
      const snapshot = get().bySessionId[sessionId];
      if (snapshot) {
        syncSessionSummaryFromHandbooks(
          sessionId,
          snapshot.activeHandbookId,
          snapshot.handbooks,
        );
      }
      throw error;
    }
    set(state => {
      const current = state.bySessionId[sessionId] ?? createEmptySessionHandbooks(sessionId);
      if (current.activeHandbookId !== handbookId) return state;
      return {
        ...state,
        bySessionId: {
          ...state.bySessionId,
          [sessionId]: {
            ...current,
            activeHandbookId: resolveActiveHandbookId(handbookId, current.handbooks),
            error: null,
            lastFetched: Date.now(),
          },
        },
      };
    });
    const snapshot = get().bySessionId[sessionId];
    if (snapshot) {
      syncSessionSummaryFromHandbooks(sessionId, snapshot.activeHandbookId, snapshot.handbooks);
    }
    return true;
  },

  async setHandbookLifecycle(sessionId, handbookId, lifecycle) {
    if (!sessionId || !handbookId) return null;
    const response = await fetch(
      `/api/sessions/${sessionId}/handbooks/${handbookId}/lifecycle`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lifecycle }),
      },
    );
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
      lifecycle?: {
        handbookId: string;
        lifecycle: HandbookLifecycle;
        publishedAt: string | null;
        archivedAt: string | null;
      };
    };
    if (!response.ok) {
      throw new Error(payload.error || `Failed to patch handbook lifecycle (${response.status})`);
    }
    const lifecycleUpdate = payload.lifecycle;
    if (!lifecycleUpdate) return null;

    let updatedHandbook: HandbookSummary | null = null;
    set(state => {
      const current = state.bySessionId[sessionId] ?? createEmptySessionHandbooks(sessionId);
      const handbooks = current.handbooks.map(handbook => {
        if (handbook.id !== handbookId) return handbook;
        updatedHandbook = {
          ...handbook,
          lifecycle: normalizeLifecycle(lifecycleUpdate.lifecycle),
          publishedAt: lifecycleUpdate.publishedAt,
          archivedAt: lifecycleUpdate.archivedAt,
          updatedAt: new Date().toISOString(),
        };
        return updatedHandbook;
      });
      return {
        ...state,
        bySessionId: {
          ...state.bySessionId,
          [sessionId]: {
            ...current,
            handbooks,
            error: null,
            lastFetched: Date.now(),
          },
        },
      };
    });
    const snapshot = get().bySessionId[sessionId];
    if (snapshot) {
      syncSessionSummaryFromHandbooks(sessionId, snapshot.activeHandbookId, snapshot.handbooks);
    }
    return updatedHandbook;
  },

  async removeHandbook(sessionId, handbookId) {
    if (!sessionId || !handbookId) return false;
    const response = await fetch(`/api/sessions/${sessionId}/handbooks/${handbookId}`, {
      method: 'DELETE',
    });
    if (response.status !== 404 && !response.ok) {
      throw new Error(`Failed to remove handbook (${response.status})`);
    }
    set(state => {
      const current = state.bySessionId[sessionId] ?? createEmptySessionHandbooks(sessionId);
      const handbooks = current.handbooks.filter(handbook => handbook.id !== handbookId);
      const activeHandbookId = resolveActiveHandbookId(current.activeHandbookId, handbooks);
      return {
        ...state,
        bySessionId: {
          ...state.bySessionId,
          [sessionId]: {
            ...current,
            activeHandbookId,
            handbooks,
            error: null,
            lastFetched: Date.now(),
          },
        },
      };
    });
    const snapshot = get().bySessionId[sessionId];
    if (snapshot) {
      syncSessionSummaryFromHandbooks(sessionId, snapshot.activeHandbookId, snapshot.handbooks);
    }
    return response.status !== 404;
  },
}));

export const handbooksActions: HandbooksActions & HandbooksExtraActions = {
  ensureSession: sessionId => useHandbooksZustandStore.getState().ensureSession(sessionId),
  clearSession: sessionId => useHandbooksZustandStore.getState().clearSession(sessionId),
  refreshIfNeeded: sessionId => useHandbooksZustandStore.getState().refreshIfNeeded(sessionId),
  hydrateSession: sessionId => useHandbooksZustandStore.getState().hydrateSession(sessionId),
  upsertSessionPayload: payload => useHandbooksZustandStore.getState().upsertSessionPayload(payload),
  createHandbook: (sessionId, input) =>
    useHandbooksZustandStore.getState().createHandbook(sessionId, input),
  updateHandbook: (sessionId, handbookId, patch) =>
    useHandbooksZustandStore.getState().updateHandbook(sessionId, handbookId, patch),
  setActiveHandbook: (sessionId, handbookId) =>
    useHandbooksZustandStore.getState().setActiveHandbook(sessionId, handbookId),
  setHandbookLifecycle: (sessionId, handbookId, lifecycle) =>
    useHandbooksZustandStore
      .getState()
      .setHandbookLifecycle(sessionId, handbookId, lifecycle),
  removeHandbook: (sessionId, handbookId) =>
    useHandbooksZustandStore.getState().removeHandbook(sessionId, handbookId),
};

export const handbooksStore = {
  getState: useHandbooksZustandStore.getState,
  subscribe: useHandbooksZustandStore.subscribe,
  actions: handbooksActions,
};

export function useSessionHandbooksState(sessionId: string): SessionHandbooksState {
  return useHandbooksZustandStore(
    useShallow(state => state.bySessionId[sessionId] ?? getEmptySessionHandbooks(sessionId)),
  );
}
