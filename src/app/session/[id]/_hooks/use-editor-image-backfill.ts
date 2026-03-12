import { useEffect, useRef } from 'react';

import { applyEditorSession, type EditorSession } from '../_lib/chat-utils';
import { mergeEditorSessionImages } from '../_lib/handbook-image-utils';
import { fetchSessionHydrationPayload } from '../_lib/session-api';
import { toPersistedBlocksOutput } from '../_lib/session-output-utils';
import { sessionEditorActions } from '../_stores/session-editor-store';

type UseEditorImageBackfillArgs = {
  sessionId: string;
  centerViewMode: 'html' | 'blocks';
  editorSession: EditorSession | null;
  backfillSignal: number;
  markEditorSessionAsSaved: (session: EditorSession) => void;
};

export function useEditorImageBackfill({
  sessionId,
  centerViewMode,
  editorSession,
  backfillSignal,
  markEditorSessionAsSaved,
}: UseEditorImageBackfillArgs) {
  const imageBackfillAttemptKeyRef = useRef<string | null>(null);
  const MAX_FETCH_RETRIES = 4;
  const RETRY_DELAY_MS = 350;

  useEffect(() => {
    if (!sessionId || !editorSession) return;

    if (centerViewMode !== 'blocks') {
      imageBackfillAttemptKeyRef.current = null;
      return;
    }

    const missingImageCount = editorSession.blocks.filter(
      block => !block.imageUrl.trim(),
    ).length;
    if (missingImageCount === 0) {
      imageBackfillAttemptKeyRef.current = null;
      return;
    }

    const attemptKey = `${sessionId}:${editorSession.sourceKey}:${editorSession.blocks.length}:${backfillSignal}`;
    if (imageBackfillAttemptKeyRef.current === attemptKey) return;
    imageBackfillAttemptKeyRef.current = attemptKey;

    let cancelled = false;
    const hasOutputImageUrls = (output: unknown): boolean => {
      if (!output || typeof output !== 'object') return false;
      const candidate = output as { images?: unknown };
      if (!Array.isArray(candidate.images)) return false;
      return candidate.images.some(item => {
        if (!item || typeof item !== 'object') return false;
        const image = item as { image_url?: unknown };
        return typeof image.image_url === 'string' && image.image_url.trim().length > 0;
      });
    };
    const sleep = (ms: number) =>
      new Promise<void>(resolve => {
        window.setTimeout(resolve, ms);
      });

    const backfillEditorImages = async () => {
      try {
        for (let attempt = 0; attempt < MAX_FETCH_RETRIES; attempt += 1) {
          const payload = await fetchSessionHydrationPayload(sessionId);
          if (cancelled) return;
          const persistedEditable = toPersistedBlocksOutput(payload?.session?.state);
          if (persistedEditable) {
            const mergedSession = mergeEditorSessionImages(
              editorSession,
              persistedEditable.output,
            );
            if (mergedSession !== editorSession) {
              sessionEditorActions.setEditorSession(sessionId, mergedSession);
              sessionEditorActions.upsertEditedToolOutput(
                sessionId,
                mergedSession.sourceKey,
                applyEditorSession(mergedSession),
              );
              markEditorSessionAsSaved(mergedSession);
              return;
            }

            // Persisted state already has image URLs, but current editor didn't change.
            if (hasOutputImageUrls(persistedEditable.output)) return;
          }

          if (attempt < MAX_FETCH_RETRIES - 1) {
            await sleep(RETRY_DELAY_MS);
          }
        }
      } catch (error) {
        console.warn('[chat-ui] editor-image-backfill-failed', {
          sessionId,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    };

    void backfillEditorImages();

    return () => {
      cancelled = true;
    };
  }, [
    backfillSignal,
    centerViewMode,
    editorSession,
    markEditorSessionAsSaved,
    sessionId,
  ]);
}
