import { useEffect, useRef, type RefObject } from 'react';
import type { UIMessage } from 'ai';

import { handbooksActions } from '@/stores/handbooks-store';
import { sessionsActions } from '@/stores/sessions-store';

import {
  canEditBlocks,
  createEditorSession,
  isRecord,
  isToolPart,
  type EditedOutputs,
  type EditorSession,
} from '../_lib/chat-utils';
import { extractSessionTitleFromToolOutput } from '../_lib/session-output-utils';
import { sessionEditorActions } from '../_stores/session-editor-store';

type PendingGeneratingHandbookVersion = {
  handbookId: string;
  title: string;
  createdAt: string;
  previousActiveHandbookId: string | null;
  persisted: boolean;
};

type ClearPendingOptions = {
  nextActiveHandbookId?: string | null;
  restorePreviousActive?: boolean;
  removePersisted?: boolean;
};

type UseToolOutputListenerArgs = {
  sessionId: string;
  messages: UIMessage[];
  editedToolOutputs: EditedOutputs;
  currentSessionTitle?: string | null;
  activeHandbookId: string | null;
  isGuestUser: boolean;
  editorSession: EditorSession | null;
  pendingGeneratingHandbookVersionRef: RefObject<PendingGeneratingHandbookVersion | null>;
  clearPendingGeneratingHandbookVersion: (options?: ClearPendingOptions) => void;
  setIsGeneratingNewHandbook: (next: boolean) => void;
};

export function useToolOutputListener({
  sessionId,
  messages,
  editedToolOutputs,
  currentSessionTitle,
  activeHandbookId,
  isGuestUser,
  editorSession,
  pendingGeneratingHandbookVersionRef,
  clearPendingGeneratingHandbookVersion,
  setIsGeneratingNewHandbook,
}: UseToolOutputListenerArgs) {
  const loggedToolEventsRef = useRef<Set<string>>(new Set());
  const autoOpenedEditableSourceRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    autoOpenedEditableSourceRef.current = new Set();
  }, [sessionId]);

  useEffect(() => {
    for (const message of messages) {
      message.parts.forEach((part, partIndex) => {
        if (!isToolPart(part)) return;

        const key = `${message.id}:${partIndex}:${part.type}:${part.state}`;
        if (loggedToolEventsRef.current.has(key)) return;
        loggedToolEventsRef.current.add(key);

        const toolName = part.type.replace('tool-', '');
        console.log('[chat-ui] tool-state', {
          messageId: message.id,
          toolName,
          state: part.state,
        });

        if (part.state === 'output-available') {
          const sourceKey = `${message.id}:${partIndex}:${part.type}`;
          const output = editedToolOutputs[sourceKey] ?? part.output;
          console.log(`[chat-ui] ${toolName} output-json`, output);

          const nextTitle = extractSessionTitleFromToolOutput(toolName, output);
          if (
            sessionId &&
            nextTitle &&
            nextTitle !== currentSessionTitle
          ) {
            sessionsActions.updateSession(sessionId, {
              title: nextTitle,
            });
          }

          if (toolName === 'generate_handbook_html') {
            if (!sessionId) return;
            if (!isRecord(output)) {
              const pending = pendingGeneratingHandbookVersionRef.current;
              const errorTargetHandbookId = pending?.previousActiveHandbookId ?? null;
              if (pending) {
                clearPendingGeneratingHandbookVersion({
                  restorePreviousActive: true,
                  removePersisted: true,
                });
              }
              sessionEditorActions.setHandbookStatus(sessionId, 'error');
              sessionEditorActions.setHandbookError(
                sessionId,
                'Handbook tool returned invalid HTML output.',
                errorTargetHandbookId,
              );
              sessionEditorActions.setCenterViewMode(sessionId, 'html');
              setIsGeneratingNewHandbook(false);
              return;
            }
            const handbookId =
              typeof output.handbook_id === 'string' && output.handbook_id.trim()
                ? output.handbook_id.trim()
                : null;
            const targetHandbookId = handbookId ?? activeHandbookId ?? null;
            if (handbookId) {
              const pending = pendingGeneratingHandbookVersionRef.current;
              clearPendingGeneratingHandbookVersion({
                nextActiveHandbookId: handbookId,
                removePersisted: Boolean(
                  pending
                  && pending.persisted
                  && pending.handbookId !== handbookId,
                ),
              });
              void handbooksActions.hydrateSession(sessionId);
            }
            const rawPreviewUrl =
              typeof output.preview_url === 'string' && output.preview_url
                ? output.preview_url
                : handbookId
                  ? `/api/guide/${handbookId}`
                  : null;
            const previewUrl =
              rawPreviewUrl
                ? `${rawPreviewUrl}?v=${
                    typeof output.generated_at === 'string'
                      ? encodeURIComponent(output.generated_at)
                      : Date.now()
                  }`
                : null;
            const inlineHtml =
              typeof output.html === 'string' && output.html.trim().length > 0
                ? output.html
                : null;
            if (!inlineHtml && !previewUrl) {
              const pending = pendingGeneratingHandbookVersionRef.current;
              if (pending) {
                clearPendingGeneratingHandbookVersion({
                  restorePreviousActive: true,
                  removePersisted: true,
                });
              }
              sessionEditorActions.setHandbookStatus(sessionId, 'error');
              sessionEditorActions.setHandbookError(
                sessionId,
                'Handbook tool did not return inline HTML or preview URL.',
                targetHandbookId,
              );
              sessionEditorActions.setCenterViewMode(sessionId, 'html');
              return;
            }
            sessionEditorActions.setHandbookHtml(sessionId, inlineHtml, targetHandbookId);
            sessionEditorActions.setHandbookPreviewUrl(sessionId, previewUrl, targetHandbookId);
            sessionEditorActions.setHandbookStatus(sessionId, 'ready', targetHandbookId);
            sessionEditorActions.setHandbookError(sessionId, null, targetHandbookId);
            setIsGeneratingNewHandbook(false);
            sessionEditorActions.setCenterViewMode(sessionId, 'html');
          }
        }

        if (part.state === 'output-error') {
          console.error(`[chat-ui] ${toolName} output-error`, {
            messageId: message.id,
            errorText: part.errorText,
          });

          if (toolName === 'generate_handbook_html') {
            if (!sessionId) return;
            const pending = pendingGeneratingHandbookVersionRef.current;
            const errorTargetHandbookId = pending?.previousActiveHandbookId ?? activeHandbookId;
            if (pending) {
              clearPendingGeneratingHandbookVersion({
                restorePreviousActive: true,
                removePersisted: true,
              });
            }
            sessionEditorActions.setHandbookStatus(sessionId, 'error', errorTargetHandbookId);
            sessionEditorActions.setHandbookPreviewUrl(sessionId, null, errorTargetHandbookId);
            sessionEditorActions.setHandbookError(
              sessionId,
              part.errorText || 'Failed to generate handbook HTML.',
              errorTargetHandbookId,
            );
            setIsGeneratingNewHandbook(false);
            sessionEditorActions.setCenterViewMode(sessionId, 'html');
          }
        }
      });
    }
  }, [
    activeHandbookId,
    clearPendingGeneratingHandbookVersion,
    currentSessionTitle,
    editedToolOutputs,
    messages,
    pendingGeneratingHandbookVersionRef,
    sessionId,
    setIsGeneratingNewHandbook,
  ]);

  useEffect(() => {
    if (!sessionId) return;
    if (isGuestUser) return;
    if (editorSession) return;

    for (let messageIndex = messages.length - 1; messageIndex >= 0; messageIndex -= 1) {
      const message = messages[messageIndex];
      for (let partIndex = message.parts.length - 1; partIndex >= 0; partIndex -= 1) {
        const part = message.parts[partIndex];
        if (!isToolPart(part)) continue;
        if (part.state !== 'output-available') continue;

        const toolName = part.type.replace('tool-', '');
        const sourceKey = `${message.id}:${partIndex}:${part.type}`;
        if (autoOpenedEditableSourceRef.current.has(sourceKey)) continue;

        const output = editedToolOutputs[sourceKey] ?? part.output;
        if (!canEditBlocks(toolName, part, output)) continue;

        const nextEditorSession = createEditorSession(sourceKey, toolName, output);
        if (!nextEditorSession) {
          autoOpenedEditableSourceRef.current.add(sourceKey);
          continue;
        }
        if (nextEditorSession.blocks.length === 0) {
          autoOpenedEditableSourceRef.current.add(sourceKey);
          continue;
        }

        sessionEditorActions.setEditorSession(sessionId, nextEditorSession);
        sessionEditorActions.setCenterViewMode(sessionId, 'blocks');
        autoOpenedEditableSourceRef.current.add(sourceKey);
        return;
      }
    }
  }, [editedToolOutputs, editorSession, isGuestUser, messages, sessionId]);
}
