import { handbooksActions, handbooksStore } from '@/stores/handbooks-store';

import { sessionEditorActions } from '../_stores/session-editor-store';

type ActivateHandbookVersionArgs = {
  sessionId: string;
  nextHandbookId: string;
  activeHandbookId: string | null;
};

export async function activateHandbookVersion({
  sessionId,
  nextHandbookId,
  activeHandbookId,
}: ActivateHandbookVersionArgs): Promise<void> {
  if (!sessionId || !nextHandbookId) return;
  if (nextHandbookId === activeHandbookId) return;

  const previousActiveHandbookId = activeHandbookId;
  sessionEditorActions.setActiveHandbookId(sessionId, nextHandbookId);
  try {
    await handbooksActions.setActiveHandbook(sessionId, nextHandbookId);
  } catch (error) {
    sessionEditorActions.setActiveHandbookId(
      sessionId,
      previousActiveHandbookId ?? null,
    );
    throw error;
  }
}

type DeleteHandbookVersionArgs = {
  sessionId: string;
  handbookId: string;
};

export async function deleteHandbookVersion({
  sessionId,
  handbookId,
}: DeleteHandbookVersionArgs): Promise<{
  removed: boolean;
  nextActiveHandbookId: string | null;
}> {
  const removed = await handbooksActions.removeHandbook(sessionId, handbookId);
  if (!removed) {
    return {
      removed: false,
      nextActiveHandbookId: handbooksStore.getState().bySessionId[sessionId]?.activeHandbookId ?? null,
    };
  }

  sessionEditorActions.removeHandbookState(sessionId, handbookId);
  const nextActiveHandbookId =
    handbooksStore.getState().bySessionId[sessionId]?.activeHandbookId ?? null;
  sessionEditorActions.setActiveHandbookId(sessionId, nextActiveHandbookId);
  if (!nextActiveHandbookId) {
    sessionEditorActions.setCenterViewMode(sessionId, 'blocks');
  }

  return {
    removed: true,
    nextActiveHandbookId,
  };
}
