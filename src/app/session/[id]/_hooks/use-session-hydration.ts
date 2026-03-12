import { useEffect, useRef, type RefObject } from 'react';
import type { UIMessage } from 'ai';

import type { HandbookStyleId } from '@/lib/handbook-style';
import { handbooksActions } from '@/stores/handbooks-store';

import {
  buildToolDurationMapFromSteps,
  createEditorSession,
  isRecord,
  isToolPart,
  type UnknownRecord,
} from '../_lib/chat-utils';
import { getPersistedHandbookStyle } from '../_lib/handbook-utils';
import { readCachedSessionMessages, resolveHydratedMessages } from '../_lib/message-cache';
import { compactChatMessagesForChatApi } from '../_lib/message-compact';
import { fetchSessionHydrationPayload } from '../_lib/session-api';
import { toPersistedBlocksOutput } from '../_lib/session-output-utils';
import { sessionEditorActions } from '../_stores/session-editor-store';

type UseSessionHydrationArgs = {
  sessionId: string;
  setMessages: (messages: UIMessage[]) => void;
  setHydratedToolDurations: (durations: Record<string, number>) => void;
  setHandbookStyle: (style: HandbookStyleId | null) => void;
  setIsSessionHydrating: (next: boolean) => void;
  persistedHandbookStyleRef: RefObject<string>;
};

function toMessageBlocksOutput(
  messages: UIMessage[],
): { sourceKey: string; toolName: string; output: UnknownRecord } | null {
  for (let messageIndex = messages.length - 1; messageIndex >= 0; messageIndex -= 1) {
    const message = messages[messageIndex];
    for (let partIndex = message.parts.length - 1; partIndex >= 0; partIndex -= 1) {
      const part = message.parts[partIndex];
      if (!isToolPart(part)) continue;
      if (part.state !== 'output-available') continue;

      const toolName = part.type.replace('tool-', '');
      if (
        toolName !== 'resolve_spot_coordinates'
        && toolName !== 'build_travel_blocks'
      ) {
        continue;
      }
      if (!isRecord(part.output) || !Array.isArray(part.output.blocks)) continue;
      if (part.output.blocks.length === 0) continue;

      return {
        sourceKey: `persisted:${message.id}:${partIndex}:${part.type}`,
        toolName,
        output: part.output as UnknownRecord,
      };
    }
  }
  return null;
}

function toStepBlocksOutput(
  steps: Array<{ id?: string; toolName?: string; output?: unknown }> | undefined,
): { sourceKey: string; toolName: string; output: UnknownRecord } | null {
  if (!Array.isArray(steps)) return null;
  for (let index = steps.length - 1; index >= 0; index -= 1) {
    const step = steps[index];
    if (!isRecord(step)) continue;

    const toolName = typeof step.toolName === 'string' ? step.toolName : '';
    if (
      toolName !== 'resolve_spot_coordinates'
      && toolName !== 'build_travel_blocks'
    ) {
      continue;
    }
    if (!isRecord(step.output) || !Array.isArray(step.output.blocks)) continue;
    if (step.output.blocks.length === 0) continue;

    const stepId = typeof step.id === 'string' && step.id.trim() ? step.id : `${index}`;
    return {
      sourceKey: `persisted-step:${stepId}:${toolName}`,
      toolName,
      output: step.output as UnknownRecord,
    };
  }
  return null;
}

export function useSessionHydration({
  sessionId,
  setMessages,
  setHydratedToolDurations,
  setHandbookStyle,
  setIsSessionHydrating,
  persistedHandbookStyleRef,
}: UseSessionHydrationArgs) {
  const hydratedSessionRef = useRef<string | null>(null);
  const hydratingSessionRef = useRef<string | null>(null);
  const activeHydrationSessionRef = useRef<string | null>(null);

  useEffect(() => {
    hydratedSessionRef.current = null;
    hydratingSessionRef.current = null;
    activeHydrationSessionRef.current = null;
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) {
      setIsSessionHydrating(false);
      setHydratedToolDurations({});
      return;
    }
    if (hydratedSessionRef.current === sessionId) {
      setIsSessionHydrating(false);
      return;
    }
    if (hydratingSessionRef.current === sessionId) {
      activeHydrationSessionRef.current = sessionId;
      return;
    }

    activeHydrationSessionRef.current = sessionId;
    hydratingSessionRef.current = sessionId;
    setIsSessionHydrating(true);

    const hydrateSession = async () => {
      try {
        const payload = await fetchSessionHydrationPayload(sessionId);
        if (activeHydrationSessionRef.current !== sessionId) return;

        if (!payload?.session) {
          hydratedSessionRef.current = null;
          return;
        }
        if (activeHydrationSessionRef.current !== sessionId) return;

        hydratedSessionRef.current = sessionId;
        const persistedMessages = Array.isArray(payload.session?.messages)
          ? payload.session.messages
          : [];
        const cachedMessages = readCachedSessionMessages(sessionId);
        const hydratedMessages = resolveHydratedMessages(
          persistedMessages,
          cachedMessages,
          payload.session?.status,
        );
        const compactedHydratedMessages = compactChatMessagesForChatApi(hydratedMessages);
        if (compactedHydratedMessages.length > 0) {
          setMessages(compactedHydratedMessages);
        }
        setHydratedToolDurations(
          buildToolDurationMapFromSteps(
            compactedHydratedMessages,
            payload.session?.steps,
          ),
        );

        const handbookPayload = await handbooksActions.hydrateSession(sessionId);
        const persistedHandbookStyle = getPersistedHandbookStyle(
          payload.session?.state?.context,
        );

        if (persistedHandbookStyle) {
          persistedHandbookStyleRef.current = `${sessionId}:${persistedHandbookStyle}`;
          setHandbookStyle(persistedHandbookStyle);
        }

        const resolvedHandbooks = handbookPayload?.handbooks ?? [];
        if (resolvedHandbooks.length > 0) {
          const resolvedActiveHandbookId =
            handbookPayload?.activeHandbookId ?? resolvedHandbooks[0]?.id ?? null;
          sessionEditorActions.setActiveHandbookId(sessionId, resolvedActiveHandbookId);
          if (resolvedActiveHandbookId) {
            sessionEditorActions.setHandbookStatus(
              sessionId,
              'ready',
              resolvedActiveHandbookId,
            );
            sessionEditorActions.setHandbookError(
              sessionId,
              null,
              resolvedActiveHandbookId,
            );
          }
          sessionEditorActions.setCenterViewMode(sessionId, 'html');
        }

        const persistedEditable =
          toPersistedBlocksOutput(payload.session?.state)
          ?? toMessageBlocksOutput(persistedMessages)
          ?? toStepBlocksOutput(payload.session?.steps);
        if (persistedEditable) {
          sessionEditorActions.upsertEditedToolOutput(
            sessionId,
            persistedEditable.sourceKey,
            persistedEditable.output,
          );
          const restoredEditorSession = createEditorSession(
            persistedEditable.sourceKey,
            persistedEditable.toolName,
            persistedEditable.output,
          );
          if (restoredEditorSession && restoredEditorSession.blocks.length > 0) {
            sessionEditorActions.setEditorSession(sessionId, restoredEditorSession);
            if (resolvedHandbooks.length === 0) {
              sessionEditorActions.setCenterViewMode(sessionId, 'blocks');
            }
          }
        }
      } catch (error) {
        if (activeHydrationSessionRef.current === sessionId) {
          hydratedSessionRef.current = null;
        }
        setHydratedToolDurations({});
        console.error('[chat-ui] hydrate-session-failed', { sessionId, error });
      } finally {
        if (hydratingSessionRef.current === sessionId) {
          hydratingSessionRef.current = null;
        }
        if (activeHydrationSessionRef.current === sessionId) {
          setIsSessionHydrating(false);
        }
      }
    };

    void hydrateSession();

    return () => {
      if (activeHydrationSessionRef.current === sessionId) {
        activeHydrationSessionRef.current = null;
      }
    };
  }, [
    sessionId,
    setHydratedToolDurations,
    setHandbookStyle,
    setIsSessionHydrating,
    setMessages,
    persistedHandbookStyleRef,
  ]);
}
