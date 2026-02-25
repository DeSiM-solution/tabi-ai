import { convertToModelMessages, stepCountIs, streamText, type UIMessage } from 'ai';
import { resolveModelTask } from '@/lib/model-management';
import {
  markSessionCancelled,
  markSessionCompleted,
  markSessionError,
  upsertChatMessages,
} from '@/server/events';
import { ensureSessionRunning } from '@/server/sessions';
import { createRuntimeState } from '@/agent/context/runtime-state';
import { hydrateRuntimeState, persistSessionSnapshot } from '@/agent/context/persistence';
import { createRunToolStep } from '@/agent/context/step-runner';
import { toErrorMessage } from '@/agent/context/utils';
import { ORCHESTRATION_SYSTEM_PROMPT } from '@/agent/prompts/orchestration-system';
import { buildAgentTools } from '@/agent/tools';

export async function executeChat(req: Request): Promise<Response> {
  const payload = (await req.json()) as {
    messages?: UIMessage[];
    sessionId?: string;
  };
  const messages = Array.isArray(payload.messages) ? payload.messages : [];
  const sessionId =
    typeof payload.sessionId === 'string' && payload.sessionId.trim()
      ? payload.sessionId.trim()
      : null;
  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const latestUserText =
    messages
      .filter(message => message.role === 'user')
      .at(-1)
      ?.parts.filter(part => part.type === 'text')
      .map(part => part.text)
      .join(' ')
      .trim() ?? '';

  console.log('[chat_api] request-start', {
    requestId,
    sessionId,
    messageCount: messages.length,
    latestUserTextPreview: latestUserText.slice(0, 200),
  });

  if (sessionId) {
    await ensureSessionRunning({
      id: sessionId,
      description: latestUserText || null,
    });
    await upsertChatMessages(sessionId, messages);
  }

  const chatTask = resolveModelTask('chat_orchestration');
  const modelMessages = await convertToModelMessages(messages);
  console.log('[chat_api] orchestration-model', {
    requestId,
    primary: `${chatTask.primary.provider}:${chatTask.primary.modelId}`,
    fallback: chatTask.fallback
      ? `${chatTask.fallback.provider}:${chatTask.fallback.modelId}`
      : null,
    maxOutputTokens: chatTask.policy.maxOutputTokens,
  });

  const runtime = createRuntimeState();

  if (sessionId) {
    await hydrateRuntimeState(sessionId, runtime);
  }

  if (sessionId) {
    req.signal.addEventListener(
      'abort',
      () => {
        runtime.requestAborted = true;
        void markSessionCancelled(sessionId);
      },
      { once: true },
    );
  }

  const runToolStep = createRunToolStep({ sessionId, runtime });

  const streamOptions = {
    maxOutputTokens: chatTask.policy.maxOutputTokens,
    abortSignal: req.signal,
    system: ORCHESTRATION_SYSTEM_PROMPT,
    stopWhen: stepCountIs(9),
    messages: modelMessages,
    tools: buildAgentTools({
      req,
      sessionId,
      runtime,
      runToolStep,
    }),
  };

  const result = (() => {
    try {
      return streamText({
        ...streamOptions,
        model: chatTask.primary.model,
      });
    } catch (error) {
      if (!chatTask.fallback) {
        throw error;
      }

      console.warn('[chat_orchestration] fallback-to-secondary-model', {
        primary: `${chatTask.primary.provider}:${chatTask.primary.modelId}`,
        fallback: `${chatTask.fallback.provider}:${chatTask.fallback.modelId}`,
        message: toErrorMessage(error),
      });

      return streamText({
        ...streamOptions,
        model: chatTask.fallback.model,
      });
    }
  })();

  return result.toUIMessageStreamResponse({
    onFinish: async ({ messages: finalMessages, isAborted, finishReason }) => {
      console.log('[chat_api] request-finish', {
        requestId,
        sessionId,
        isAborted,
        finishReason,
      });

      if (!sessionId) return;
      try {
        await upsertChatMessages(sessionId, finalMessages);
        await persistSessionSnapshot(sessionId, runtime);

        if (isAborted || runtime.requestAborted) {
          await markSessionCancelled(sessionId);
          return;
        }

        await markSessionCompleted(sessionId);
      } catch (error) {
        console.error('[chat_api] persist-on-finish-failed', {
          sessionId,
          requestId,
          message: toErrorMessage(error),
        });
      }
    },
    onError: error => {
      const message = toErrorMessage(error);
      if (sessionId) {
        void markSessionError(sessionId, message);
      }
      return message;
    },
  });
}
