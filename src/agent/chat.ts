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
import { isAbortError, toErrorMessage } from '@/agent/context/utils';
import type { AgentRuntimeState } from '@/agent/context/types';
import { ORCHESTRATION_SYSTEM_PROMPT } from '@/agent/prompts/orchestration-system';
import type { PersistedToolName } from '@/agent/tools/types';
import { buildAgentTools } from '@/agent/tools';

const NON_BLOCKING_TOOLS = new Set<PersistedToolName>(['resolve_spot_coordinates']);
const IMAGE_TOOLS = new Set<PersistedToolName>(['search_image', 'generate_image']);
const BLOCK_BUILD_TOOLS = new Set<PersistedToolName>([
  'parse_youtube_input',
  'crawl_youtube_videos',
  'build_travel_blocks',
]);
const TOOL_PRIORITY: PersistedToolName[] = [
  'generate_handbook_html',
  'build_travel_blocks',
  'crawl_youtube_videos',
  'parse_youtube_input',
  'search_image',
  'generate_image',
  'resolve_spot_coordinates',
];

function hasRenderableHtml(runtime: AgentRuntimeState): boolean {
  return typeof runtime.latestHandbookHtml === 'string' && runtime.latestHandbookHtml.trim().length > 0;
}

function pickPrimaryFailedTool(tools: PersistedToolName[]): PersistedToolName | null {
  for (const toolName of TOOL_PRIORITY) {
    if (tools.includes(toolName)) return toolName;
  }
  return tools[0] ?? null;
}

function getBlockingFailedTools(runtime: AgentRuntimeState): PersistedToolName[] {
  if (hasRenderableHtml(runtime)) return [];

  const failedTools = Object.entries(runtime.requestToolStatus)
    .filter((entry): entry is [PersistedToolName, 'error'] => entry[1] === 'error')
    .map(([toolName]) => toolName);
  if (failedTools.length === 0) return [];

  let blockingTools = failedTools.filter(toolName => !NON_BLOCKING_TOOLS.has(toolName));

  const hasImageFailures = blockingTools.some(toolName => IMAGE_TOOLS.has(toolName));
  if (hasImageFailures && runtime.latestHandbookImages.length > 0) {
    blockingTools = blockingTools.filter(toolName => !IMAGE_TOOLS.has(toolName));
  }

  const hasBuildPipelineFailures = blockingTools.some(toolName => BLOCK_BUILD_TOOLS.has(toolName));
  if (hasBuildPipelineFailures && runtime.latestBlocks.length > 0) {
    blockingTools = blockingTools.filter(toolName => !BLOCK_BUILD_TOOLS.has(toolName));
  }

  return blockingTools;
}

export async function executeChat(req: Request, userId: string): Promise<Response> {
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
    userId,
    sessionId,
    messageCount: messages.length,
    latestUserTextPreview: latestUserText.slice(0, 200),
  });

  if (sessionId) {
    await ensureSessionRunning({
      userId,
      id: sessionId,
      description: latestUserText || null,
    });
    await upsertChatMessages(sessionId, userId, messages);
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
    await hydrateRuntimeState(sessionId, userId, runtime);
  }

  const runToolStep = createRunToolStep({ sessionId, userId, runtime });
  const executionAbortSignal: AbortSignal | undefined = undefined;

  const streamOptions = {
    maxOutputTokens: chatTask.policy.maxOutputTokens,
    system: ORCHESTRATION_SYSTEM_PROMPT,
    stopWhen: stepCountIs(9),
    messages: modelMessages,
    tools: buildAgentTools({
      req,
      abortSignal: executionAbortSignal,
      sessionId,
      userId,
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
    // Keep original user messages in the stream state so persisted messages remain complete.
    originalMessages: messages,
    onFinish: async ({ messages: allMessages, isAborted, finishReason }) => {
      console.log('[chat_api] request-finish', {
        requestId,
        sessionId,
        isAborted,
        finishReason,
      });

      if (!sessionId) return;
      try {
        await upsertChatMessages(sessionId, userId, allMessages);
        await persistSessionSnapshot(sessionId, userId, runtime);

        if (runtime.requestAborted) {
          await markSessionCancelled(sessionId, userId);
          return;
        }

        const blockingFailedTools = getBlockingFailedTools(runtime);
        if (blockingFailedTools.length === 0) {
          await markSessionCompleted(sessionId, userId);
          return;
        }

        const failedTool = pickPrimaryFailedTool(blockingFailedTools);
        const fallbackMessage = failedTool
          ? `${failedTool} failed and blocked final handbook output.`
          : 'Session failed before final handbook output was ready.';
        const finalErrorMessage = failedTool
          ? runtime.requestToolErrors[failedTool] ?? fallbackMessage
          : fallbackMessage;
        await markSessionError(sessionId, userId, finalErrorMessage, {
          failedStep: failedTool ?? null,
        });
      } catch (error) {
        console.error('[chat_api] persist-on-finish-failed', {
          sessionId,
          requestId,
          message: toErrorMessage(error),
        });
      }
    },
    onError: error => {
      if (req.signal.aborted) {
        return toErrorMessage(error);
      }
      if (isAbortError(error)) {
        return toErrorMessage(error);
      }
      const message = toErrorMessage(error);
      if (sessionId) {
        const failedTool = pickPrimaryFailedTool(getBlockingFailedTools(runtime));
        void markSessionError(sessionId, userId, message, {
          failedStep: failedTool ?? null,
        });
      }
      return message;
    },
  });
}
