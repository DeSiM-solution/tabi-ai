'use client';

import { create } from 'zustand';
import type { HandbookLifecycle } from '@/lib/handbook-lifecycle';
import type { EditorSession, EditedOutputs, UnknownRecord } from '../_lib/chat-utils';

export type HandbookStatus = 'idle' | 'generating' | 'ready' | 'error';
export type CenterViewMode = 'blocks' | 'html';
export type PreviewDevice = 'desktop' | 'mobile';

export interface HandbookPreviewState {
  handbookId: string;
  title: string | null;
  lifecycle: HandbookLifecycle | null;
  html: string | null;
  previewUrl: string | null;
  status: HandbookStatus;
  error: string | null;
}

export interface SessionEditorSnapshot {
  editedToolOutputs: EditedOutputs;
  editorSession: EditorSession | null;
  activeHandbookId: string | null;
  handbookStates: Record<string, HandbookPreviewState>;
  handbookHtml: string | null;
  handbookPreviewUrl: string | null;
  handbookStatus: HandbookStatus;
  handbookError: string | null;
  centerViewMode: CenterViewMode;
  previewDevice: PreviewDevice;
}

interface SessionEditorStoreState {
  bySessionId: Record<string, SessionEditorSnapshot>;
  ensureSession: (sessionId: string) => void;
  resetSession: (sessionId: string) => void;
  setEditorSession: (sessionId: string, session: EditorSession | null) => void;
  upsertEditedToolOutput: (sessionId: string, sourceKey: string, output: UnknownRecord) => void;
  setActiveHandbookId: (sessionId: string, handbookId: string | null) => void;
  hydrateHandbooks: (
    sessionId: string,
    payload: {
      activeHandbookId: string | null;
      handbooks: Array<{
        handbookId: string;
        title?: string | null;
        lifecycle?: HandbookLifecycle | null;
        html?: string | null;
        previewUrl?: string | null;
        status?: HandbookStatus;
        error?: string | null;
      }>;
    },
  ) => void;
  removeHandbookState: (sessionId: string, handbookId: string) => void;
  setHandbookHtml: (sessionId: string, html: string | null, handbookId?: string | null) => void;
  setHandbookPreviewUrl: (
    sessionId: string,
    previewUrl: string | null,
    handbookId?: string | null,
  ) => void;
  setHandbookStatus: (
    sessionId: string,
    status: HandbookStatus,
    handbookId?: string | null,
  ) => void;
  setHandbookError: (
    sessionId: string,
    error: string | null,
    handbookId?: string | null,
  ) => void;
  setCenterViewMode: (sessionId: string, mode: CenterViewMode) => void;
  setPreviewDevice: (sessionId: string, device: PreviewDevice) => void;
}

const EMPTY_SNAPSHOT: SessionEditorSnapshot = {
  editedToolOutputs: {},
  editorSession: null,
  activeHandbookId: null,
  handbookStates: {},
  handbookHtml: null,
  handbookPreviewUrl: null,
  handbookStatus: 'idle',
  handbookError: null,
  centerViewMode: 'blocks',
  previewDevice: 'desktop',
};

const LEGACY_HANDBOOK_ID = '__legacy_handbook__';

function createEmptySnapshot(): SessionEditorSnapshot {
  return {
    editedToolOutputs: {},
    editorSession: null,
    activeHandbookId: null,
    handbookStates: {},
    handbookHtml: null,
    handbookPreviewUrl: null,
    handbookStatus: 'idle',
    handbookError: null,
    centerViewMode: 'blocks',
    previewDevice: 'desktop',
  };
}

function getOrCreateSnapshot(
  state: SessionEditorStoreState,
  sessionId: string,
): SessionEditorSnapshot {
  return state.bySessionId[sessionId] ?? createEmptySnapshot();
}

function createEmptyHandbookState(handbookId: string): HandbookPreviewState {
  return {
    handbookId,
    title: null,
    lifecycle: null,
    html: null,
    previewUrl: null,
    status: 'idle',
    error: null,
  };
}

function resolveHandbookId(
  snapshot: SessionEditorSnapshot,
  handbookId?: string | null,
): string {
  if (handbookId) return handbookId;
  if (snapshot.activeHandbookId) return snapshot.activeHandbookId;
  return LEGACY_HANDBOOK_ID;
}

function resolveActiveHandbookId(
  snapshot: SessionEditorSnapshot,
  preferred: string | null,
): string | null {
  if (preferred && snapshot.handbookStates[preferred]) return preferred;
  const handbookIds = Object.keys(snapshot.handbookStates);
  if (handbookIds.length === 0) return null;
  return handbookIds[0] ?? null;
}

function withProjectedActiveHandbook(snapshot: SessionEditorSnapshot): SessionEditorSnapshot {
  const activeId = resolveActiveHandbookId(snapshot, snapshot.activeHandbookId);
  const activeState = activeId ? snapshot.handbookStates[activeId] : null;
  return {
    ...snapshot,
    activeHandbookId: activeId,
    handbookHtml: activeState?.html ?? null,
    handbookPreviewUrl: activeState?.previewUrl ?? null,
    handbookStatus: activeState?.status ?? 'idle',
    handbookError: activeState?.error ?? null,
  };
}

function upsertHandbookField(
  snapshot: SessionEditorSnapshot,
  handbookId: string,
  patch: Partial<HandbookPreviewState>,
): SessionEditorSnapshot {
  const existing = snapshot.handbookStates[handbookId] ?? createEmptyHandbookState(handbookId);
  const nextSnapshot: SessionEditorSnapshot = {
    ...snapshot,
    activeHandbookId: snapshot.activeHandbookId ?? handbookId,
    handbookStates: {
      ...snapshot.handbookStates,
      [handbookId]: {
        ...existing,
        ...patch,
        handbookId,
      },
    },
  };
  return withProjectedActiveHandbook(nextSnapshot);
}

const useSessionEditorZustandStore = create<SessionEditorStoreState>((set, get) => ({
  bySessionId: {},

  ensureSession(sessionId) {
    if (!sessionId) return;
    const existing = get().bySessionId[sessionId];
    if (existing) return;

    set(state => ({
      ...state,
      bySessionId: {
        ...state.bySessionId,
        [sessionId]: createEmptySnapshot(),
      },
    }));
  },

  resetSession(sessionId) {
    if (!sessionId) return;
    set(state => ({
      ...state,
      bySessionId: {
        ...state.bySessionId,
        [sessionId]: createEmptySnapshot(),
      },
    }));
  },

  setEditorSession(sessionId, session) {
    if (!sessionId) return;
    set(state => {
      const current = getOrCreateSnapshot(state, sessionId);
      if (current.editorSession === session) return state;
      return {
        ...state,
        bySessionId: {
          ...state.bySessionId,
          [sessionId]: {
            ...current,
            editorSession: session,
          },
        },
      };
    });
  },

  upsertEditedToolOutput(sessionId, sourceKey, output) {
    if (!sessionId || !sourceKey) return;
    set(state => {
      const current = getOrCreateSnapshot(state, sessionId);
      return {
        ...state,
        bySessionId: {
          ...state.bySessionId,
          [sessionId]: {
            ...current,
            editedToolOutputs: {
              ...current.editedToolOutputs,
              [sourceKey]: output,
            },
          },
        },
      };
    });
  },

  setActiveHandbookId(sessionId, handbookId) {
    if (!sessionId) return;
    set(state => {
      const current = getOrCreateSnapshot(state, sessionId);
      const nextSnapshot = withProjectedActiveHandbook({
        ...current,
        activeHandbookId: handbookId,
      });
      if (
        nextSnapshot.activeHandbookId === current.activeHandbookId
        && nextSnapshot.handbookHtml === current.handbookHtml
        && nextSnapshot.handbookPreviewUrl === current.handbookPreviewUrl
        && nextSnapshot.handbookStatus === current.handbookStatus
        && nextSnapshot.handbookError === current.handbookError
      ) {
        return state;
      }
      return {
        ...state,
        bySessionId: {
          ...state.bySessionId,
          [sessionId]: nextSnapshot,
        },
      };
    });
  },

  hydrateHandbooks(sessionId, payload) {
    if (!sessionId) return;
    set(state => {
      const current = getOrCreateSnapshot(state, sessionId);
      const nextStates: Record<string, HandbookPreviewState> = {
        ...current.handbookStates,
      };

      for (const handbook of payload.handbooks) {
        if (!handbook.handbookId) continue;
        const existing = nextStates[handbook.handbookId] ?? createEmptyHandbookState(handbook.handbookId);
        nextStates[handbook.handbookId] = {
          ...existing,
          handbookId: handbook.handbookId,
          title: handbook.title ?? existing.title,
          lifecycle: handbook.lifecycle ?? existing.lifecycle,
          html: handbook.html === undefined ? existing.html : handbook.html,
          previewUrl:
            handbook.previewUrl === undefined ? existing.previewUrl : handbook.previewUrl,
          status: handbook.status ?? existing.status,
          error: handbook.error === undefined ? existing.error : handbook.error,
        };
      }

      const nextSnapshot = withProjectedActiveHandbook({
        ...current,
        activeHandbookId: payload.activeHandbookId,
        handbookStates: nextStates,
      });

      return {
        ...state,
        bySessionId: {
          ...state.bySessionId,
          [sessionId]: nextSnapshot,
        },
      };
    });
  },

  removeHandbookState(sessionId, handbookId) {
    if (!sessionId || !handbookId) return;
    set(state => {
      const current = getOrCreateSnapshot(state, sessionId);
      if (!current.handbookStates[handbookId]) return state;
      const nextStates = { ...current.handbookStates };
      delete nextStates[handbookId];
      const nextSnapshot = withProjectedActiveHandbook({
        ...current,
        activeHandbookId:
          current.activeHandbookId === handbookId ? null : current.activeHandbookId,
        handbookStates: nextStates,
      });
      return {
        ...state,
        bySessionId: {
          ...state.bySessionId,
          [sessionId]: nextSnapshot,
        },
      };
    });
  },

  setHandbookHtml(sessionId, html, handbookId) {
    if (!sessionId) return;
    set(state => {
      const current = getOrCreateSnapshot(state, sessionId);
      const targetHandbookId = resolveHandbookId(current, handbookId);
      const existing = current.handbookStates[targetHandbookId] ?? createEmptyHandbookState(targetHandbookId);
      if (existing.html === html) return state;
      const nextSnapshot = upsertHandbookField(current, targetHandbookId, { html });
      return {
        ...state,
        bySessionId: {
          ...state.bySessionId,
          [sessionId]: nextSnapshot,
        },
      };
    });
  },

  setHandbookPreviewUrl(sessionId, previewUrl, handbookId) {
    if (!sessionId) return;
    set(state => {
      const current = getOrCreateSnapshot(state, sessionId);
      const targetHandbookId = resolveHandbookId(current, handbookId);
      const existing = current.handbookStates[targetHandbookId] ?? createEmptyHandbookState(targetHandbookId);
      if (existing.previewUrl === previewUrl) return state;
      const nextSnapshot = upsertHandbookField(current, targetHandbookId, {
        previewUrl,
      });
      return {
        ...state,
        bySessionId: {
          ...state.bySessionId,
          [sessionId]: nextSnapshot,
        },
      };
    });
  },

  setHandbookStatus(sessionId, status, handbookId) {
    if (!sessionId) return;
    set(state => {
      const current = getOrCreateSnapshot(state, sessionId);
      const targetHandbookId = resolveHandbookId(current, handbookId);
      const existing = current.handbookStates[targetHandbookId] ?? createEmptyHandbookState(targetHandbookId);
      if (existing.status === status) return state;
      const nextSnapshot = upsertHandbookField(current, targetHandbookId, {
        status,
      });
      return {
        ...state,
        bySessionId: {
          ...state.bySessionId,
          [sessionId]: nextSnapshot,
        },
      };
    });
  },

  setHandbookError(sessionId, error, handbookId) {
    if (!sessionId) return;
    set(state => {
      const current = getOrCreateSnapshot(state, sessionId);
      const targetHandbookId = resolveHandbookId(current, handbookId);
      const existing = current.handbookStates[targetHandbookId] ?? createEmptyHandbookState(targetHandbookId);
      if (existing.error === error) return state;
      const nextSnapshot = upsertHandbookField(current, targetHandbookId, {
        error,
      });
      return {
        ...state,
        bySessionId: {
          ...state.bySessionId,
          [sessionId]: nextSnapshot,
        },
      };
    });
  },

  setCenterViewMode(sessionId, mode) {
    if (!sessionId) return;
    set(state => {
      const current = getOrCreateSnapshot(state, sessionId);
      if (current.centerViewMode === mode) return state;
      return {
        ...state,
        bySessionId: {
          ...state.bySessionId,
          [sessionId]: {
            ...current,
            centerViewMode: mode,
          },
        },
      };
    });
  },

  setPreviewDevice(sessionId, device) {
    if (!sessionId) return;
    set(state => {
      const current = getOrCreateSnapshot(state, sessionId);
      if (current.previewDevice === device) return state;
      return {
        ...state,
        bySessionId: {
          ...state.bySessionId,
          [sessionId]: {
            ...current,
            previewDevice: device,
          },
        },
      };
    });
  },
}));

export const sessionEditorActions = {
  ensureSession: (sessionId: string) =>
    useSessionEditorZustandStore.getState().ensureSession(sessionId),
  resetSession: (sessionId: string) =>
    useSessionEditorZustandStore.getState().resetSession(sessionId),
  setEditorSession: (sessionId: string, session: EditorSession | null) =>
    useSessionEditorZustandStore.getState().setEditorSession(sessionId, session),
  upsertEditedToolOutput: (
    sessionId: string,
    sourceKey: string,
    output: UnknownRecord,
  ) =>
    useSessionEditorZustandStore
      .getState()
      .upsertEditedToolOutput(sessionId, sourceKey, output),
  setActiveHandbookId: (sessionId: string, handbookId: string | null) =>
    useSessionEditorZustandStore.getState().setActiveHandbookId(sessionId, handbookId),
  hydrateHandbooks: (
    sessionId: string,
    payload: {
      activeHandbookId: string | null;
      handbooks: Array<{
        handbookId: string;
        title?: string | null;
        lifecycle?: HandbookLifecycle | null;
        html?: string | null;
        previewUrl?: string | null;
        status?: HandbookStatus;
        error?: string | null;
      }>;
    },
  ) => useSessionEditorZustandStore.getState().hydrateHandbooks(sessionId, payload),
  removeHandbookState: (sessionId: string, handbookId: string) =>
    useSessionEditorZustandStore.getState().removeHandbookState(sessionId, handbookId),
  setHandbookHtml: (sessionId: string, html: string | null, handbookId?: string | null) =>
    useSessionEditorZustandStore.getState().setHandbookHtml(sessionId, html, handbookId),
  setHandbookPreviewUrl: (
    sessionId: string,
    previewUrl: string | null,
    handbookId?: string | null,
  ) =>
    useSessionEditorZustandStore
      .getState()
      .setHandbookPreviewUrl(sessionId, previewUrl, handbookId),
  setHandbookStatus: (
    sessionId: string,
    status: HandbookStatus,
    handbookId?: string | null,
  ) => useSessionEditorZustandStore.getState().setHandbookStatus(sessionId, status, handbookId),
  setHandbookError: (
    sessionId: string,
    error: string | null,
    handbookId?: string | null,
  ) => useSessionEditorZustandStore.getState().setHandbookError(sessionId, error, handbookId),
  setCenterViewMode: (sessionId: string, mode: CenterViewMode) =>
    useSessionEditorZustandStore.getState().setCenterViewMode(sessionId, mode),
  setPreviewDevice: (sessionId: string, device: PreviewDevice) =>
    useSessionEditorZustandStore.getState().setPreviewDevice(sessionId, device),
};

export function useSessionEditorSnapshot(sessionId: string): SessionEditorSnapshot {
  return useSessionEditorZustandStore(
    state => state.bySessionId[sessionId] ?? EMPTY_SNAPSHOT,
  );
}
