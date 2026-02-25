'use client';

import { create } from 'zustand';
import type { EditorSession, EditedOutputs, UnknownRecord } from '../_lib/chat-utils';

export type HandbookStatus = 'idle' | 'generating' | 'ready' | 'error';
export type CenterViewMode = 'blocks' | 'html';
export type PreviewDevice = 'desktop' | 'mobile';

export interface SessionEditorSnapshot {
  editedToolOutputs: EditedOutputs;
  editorSession: EditorSession | null;
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
  setHandbookHtml: (sessionId: string, html: string | null) => void;
  setHandbookPreviewUrl: (sessionId: string, previewUrl: string | null) => void;
  setHandbookStatus: (sessionId: string, status: HandbookStatus) => void;
  setHandbookError: (sessionId: string, error: string | null) => void;
  setCenterViewMode: (sessionId: string, mode: CenterViewMode) => void;
  setPreviewDevice: (sessionId: string, device: PreviewDevice) => void;
}

const EMPTY_SNAPSHOT: SessionEditorSnapshot = {
  editedToolOutputs: {},
  editorSession: null,
  handbookHtml: null,
  handbookPreviewUrl: null,
  handbookStatus: 'idle',
  handbookError: null,
  centerViewMode: 'blocks',
  previewDevice: 'desktop',
};

function createEmptySnapshot(): SessionEditorSnapshot {
  return {
    editedToolOutputs: {},
    editorSession: null,
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

  setHandbookHtml(sessionId, html) {
    if (!sessionId) return;
    set(state => {
      const current = getOrCreateSnapshot(state, sessionId);
      if (current.handbookHtml === html) return state;
      return {
        ...state,
        bySessionId: {
          ...state.bySessionId,
          [sessionId]: {
            ...current,
            handbookHtml: html,
          },
        },
      };
    });
  },

  setHandbookPreviewUrl(sessionId, previewUrl) {
    if (!sessionId) return;
    set(state => {
      const current = getOrCreateSnapshot(state, sessionId);
      if (current.handbookPreviewUrl === previewUrl) return state;
      return {
        ...state,
        bySessionId: {
          ...state.bySessionId,
          [sessionId]: {
            ...current,
            handbookPreviewUrl: previewUrl,
          },
        },
      };
    });
  },

  setHandbookStatus(sessionId, status) {
    if (!sessionId) return;
    set(state => {
      const current = getOrCreateSnapshot(state, sessionId);
      if (current.handbookStatus === status) return state;
      return {
        ...state,
        bySessionId: {
          ...state.bySessionId,
          [sessionId]: {
            ...current,
            handbookStatus: status,
          },
        },
      };
    });
  },

  setHandbookError(sessionId, error) {
    if (!sessionId) return;
    set(state => {
      const current = getOrCreateSnapshot(state, sessionId);
      if (current.handbookError === error) return state;
      return {
        ...state,
        bySessionId: {
          ...state.bySessionId,
          [sessionId]: {
            ...current,
            handbookError: error,
          },
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
  setHandbookHtml: (sessionId: string, html: string | null) =>
    useSessionEditorZustandStore.getState().setHandbookHtml(sessionId, html),
  setHandbookPreviewUrl: (sessionId: string, previewUrl: string | null) =>
    useSessionEditorZustandStore
      .getState()
      .setHandbookPreviewUrl(sessionId, previewUrl),
  setHandbookStatus: (sessionId: string, status: HandbookStatus) =>
    useSessionEditorZustandStore.getState().setHandbookStatus(sessionId, status),
  setHandbookError: (sessionId: string, error: string | null) =>
    useSessionEditorZustandStore.getState().setHandbookError(sessionId, error),
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
