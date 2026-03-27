import {
  cancelSessionStep,
  completeSessionStep,
  createSessionStep,
  failSessionStep,
} from '@/server/events';
import { getSessionStatus } from '@/server/sessions';
import {
  LEGACY_SESSION_ANALYSIS_TOOL_NAME,
  SESSION_ANALYSIS_TOOL_NAME,
} from '@/lib/session-analysis-tool';
import type { SessionToolNameValue } from '@/lib/session-enums';
import type { AgentRuntimeState } from './types';
import { isAbortError, getDurationMs, toErrorMessage } from './utils';
import { persistSessionSnapshot } from './persistence';
import type { PersistedToolName } from '@/agent/tools/types';

export function createRunToolStep(options: {
  sessionId: string | null;
  userId: string | null;
  runtime: AgentRuntimeState;
}) {
  const { sessionId, userId, runtime } = options;

  const toPersistedSessionStepToolName = (
    toolName: PersistedToolName,
  ): SessionToolNameValue => {
    if (toolName === SESSION_ANALYSIS_TOOL_NAME) {
      return LEGACY_SESSION_ANALYSIS_TOOL_NAME;
    }
    return toolName as SessionToolNameValue;
  };

  return async function runToolStep<T>(
    toolName: PersistedToolName,
    input: unknown,
    execute: () => Promise<T>,
  ): Promise<T> {
    if (!sessionId || !userId) {
      const output = await execute();
      runtime.latestToolOutputs[toolName] = output;
      return output;
    }

    const status = await getSessionStatus(sessionId, userId);
    if (status === 'CANCELLED') {
      runtime.requestAborted = true;
      throw new Error('Session was cancelled.');
    }

    const startedAt = Date.now();
    runtime.requestToolStatus[toolName] = 'running';
    delete runtime.requestToolErrors[toolName];
    const persistedStepToolName = toPersistedSessionStepToolName(toolName);
    const stepId = await createSessionStep({
      sessionId,
      userId,
      toolName: persistedStepToolName,
      payload: input,
    });

    try {
      const output = await execute();
      runtime.latestToolOutputs[toolName] = output;
      runtime.requestToolStatus[toolName] = 'success';
      await completeSessionStep({
        stepId,
        sessionId,
        output,
        durationMs: getDurationMs(startedAt),
      });
      await persistSessionSnapshot(sessionId, userId, runtime);
      return output;
    } catch (error) {
      const errorMessage = toErrorMessage(error);
      if (isAbortError(error)) {
        runtime.requestAborted = true;
        runtime.requestToolStatus[toolName] = 'cancelled';
        try {
          await cancelSessionStep({
            stepId,
            sessionId,
            userId,
            durationMs: getDurationMs(startedAt),
          });
        } catch (persistError) {
          console.error('[step-runner] cancel-session-step-failed', {
            sessionId,
            stepId,
            toolName,
            message:
              persistError instanceof Error ? persistError.message : String(persistError),
          });
        }
        throw error;
      }
      runtime.requestToolStatus[toolName] = 'error';
      runtime.requestToolErrors[toolName] = errorMessage;
      try {
        await failSessionStep({
          stepId,
          sessionId,
          userId,
          toolName: persistedStepToolName,
          errorMessage,
          durationMs: getDurationMs(startedAt),
        });
      } catch (persistError) {
        console.error('[step-runner] fail-session-step-failed', {
          sessionId,
          stepId,
          toolName,
          message:
            persistError instanceof Error ? persistError.message : String(persistError),
        });
      }
      throw error;
    }
  };
}
