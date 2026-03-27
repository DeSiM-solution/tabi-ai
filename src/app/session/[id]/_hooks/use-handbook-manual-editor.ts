import { useCallback, useEffect, useMemo, useState } from 'react';

import { handbooksActions } from '@/stores/handbooks-store';

import { fetchHandbookHtml } from '../_lib/handbook-api';
import { sessionEditorActions } from '../_stores/session-editor-store';

type UseHandbookManualEditorArgs = {
  sessionId: string;
  activeHandbookId: string | null;
  handbookHtml: string | null;
};

export function useHandbookManualEditor({
  sessionId,
  activeHandbookId,
  handbookHtml,
}: UseHandbookManualEditorArgs) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoadingSource, setIsLoadingSource] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editorHandbookId, setEditorHandbookId] = useState<string | null>(null);
  const [persistedHtml, setPersistedHtml] = useState('');
  const [draftHtml, setDraftHtml] = useState('');
  const isDirty = useMemo(
    () => isOpen && draftHtml !== persistedHtml,
    [draftHtml, isOpen, persistedHtml],
  );

  useEffect(() => {
    if (!activeHandbookId) {
      setIsOpen(false);
      setIsLoadingSource(false);
      setIsSaving(false);
      setEditorHandbookId(null);
      setPersistedHtml('');
      setDraftHtml('');
      return;
    }

    const nextHtml = handbookHtml ?? '';
    if (editorHandbookId !== activeHandbookId) {
      setEditorHandbookId(activeHandbookId);
      setPersistedHtml(nextHtml);
      setDraftHtml(nextHtml);
      setIsOpen(true);
      return;
    }

    if (!isDirty && handbookHtml !== null && handbookHtml !== persistedHtml) {
      setPersistedHtml(handbookHtml);
      setDraftHtml(handbookHtml);
    }

    if (!isOpen) {
      setIsOpen(true);
    }
  }, [
    activeHandbookId,
    editorHandbookId,
    handbookHtml,
    isDirty,
    isOpen,
    persistedHtml,
  ]);

  const openEditor = useCallback(async () => {
    if (!activeHandbookId) return false;

    setIsLoadingSource(true);
    try {
      const sourceHtml =
        typeof handbookHtml === 'string' && handbookHtml.trim().length > 0
          ? handbookHtml
          : await fetchHandbookHtml(activeHandbookId);

      setEditorHandbookId(activeHandbookId);
      setPersistedHtml(sourceHtml);
      setDraftHtml(sourceHtml);
      sessionEditorActions.setHandbookHtml(sessionId, sourceHtml, activeHandbookId);
      setIsOpen(true);
      return true;
    } finally {
      setIsLoadingSource(false);
    }
  }, [activeHandbookId, handbookHtml, sessionId]);

  const changeDraftHtml = useCallback((nextHtml: string) => {
    setDraftHtml(nextHtml);
  }, []);

  const resetDraft = useCallback(() => {
    setDraftHtml(persistedHtml);
  }, [persistedHtml]);

  const discardDraft = useCallback(() => {
    setDraftHtml(persistedHtml);
    setIsOpen(false);
  }, [persistedHtml]);

  const closeEditor = useCallback(() => {
    if (isDirty || isSaving) return false;
    setIsOpen(false);
    return true;
  }, [isDirty, isSaving]);

  const saveDraft = useCallback(async () => {
    if (!sessionId || !editorHandbookId) return false;

    setIsSaving(true);
    try {
      await handbooksActions.updateHandbook(sessionId, editorHandbookId, {
        html: draftHtml,
        sourceContext: {
          manualEditApplied: true,
        },
      });
      const nextPreviewUrl = `/api/guide/${editorHandbookId}?v=${Date.now()}`;
      sessionEditorActions.setHandbookHtml(sessionId, draftHtml, editorHandbookId);
      sessionEditorActions.setHandbookPreviewUrl(
        sessionId,
        nextPreviewUrl,
        editorHandbookId,
      );
      sessionEditorActions.setHandbookStatus(sessionId, 'ready', editorHandbookId);
      sessionEditorActions.setHandbookError(sessionId, null, editorHandbookId);
      setPersistedHtml(draftHtml);
      return true;
    } finally {
      setIsSaving(false);
    }
  }, [draftHtml, editorHandbookId, sessionId]);

  return {
    draftHtml,
    isDirty,
    isLoadingSource,
    isOpen,
    isSaving,
    editorHandbookId,
    changeDraftHtml,
    closeEditor,
    discardDraft,
    openEditor,
    resetDraft,
    saveDraft,
  };
}
