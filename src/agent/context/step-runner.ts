import {
  cancelSessionStep,
  completeSessionStep,
  createSessionStep,
  failSessionStep,
} from '@/server/events';
import { getSessionStatus } from '@/server/sessions';
import { SessionStatus } from '@prisma/client';
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
    if (status === SessionStatus.CANCELLED) {
      runtime.requestAborted = true;
      throw new Error('Session was cancelled.');
    }

    const startedAt = Date.now();
    runtime.requestToolStatus[toolName] = 'running';
    delete runtime.requestToolErrors[toolName];
    const stepId = await createSessionStep({
      sessionId,
      userId,
      toolName,
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
        await cancelSessionStep({
          stepId,
          sessionId,
          userId,
          durationMs: getDurationMs(startedAt),
        });
        throw error;
      }
      runtime.requestToolStatus[toolName] = 'error';
      runtime.requestToolErrors[toolName] = errorMessage;
      await failSessionStep({
        stepId,
        sessionId,
        userId,
        toolName,
        errorMessage,
        durationMs: getDurationMs(startedAt),
      });
      throw error;
    }
  };
}
