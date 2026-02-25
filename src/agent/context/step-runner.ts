import {
  cancelSessionStep,
  completeSessionStep,
  createSessionStep,
  failSessionStep,
} from '@/server/events';
import type { AgentRuntimeState } from './types';
import { isAbortError, getDurationMs, toErrorMessage } from './utils';
import { persistSessionSnapshot } from './persistence';
import type { PersistedToolName } from '@/agent/tools/types';

export function createRunToolStep(options: {
  sessionId: string | null;
  runtime: AgentRuntimeState;
}) {
  const { sessionId, runtime } = options;

  return async function runToolStep<T>(
    toolName: PersistedToolName,
    input: unknown,
    execute: () => Promise<T>,
  ): Promise<T> {
    if (!sessionId) {
      const output = await execute();
      runtime.latestToolOutputs[toolName] = output;
      return output;
    }

    const startedAt = Date.now();
    const stepId = await createSessionStep({
      sessionId,
      toolName,
      payload: input,
    });

    try {
      const output = await execute();
      runtime.latestToolOutputs[toolName] = output;
      await completeSessionStep({
        stepId,
        output,
        durationMs: getDurationMs(startedAt),
      });
      await persistSessionSnapshot(sessionId, runtime);
      return output;
    } catch (error) {
      const errorMessage = toErrorMessage(error);
      if (isAbortError(error)) {
        runtime.requestAborted = true;
        await cancelSessionStep({
          stepId,
          sessionId,
          durationMs: getDurationMs(startedAt),
        });
        throw error;
      }
      await failSessionStep({
        stepId,
        sessionId,
        toolName,
        errorMessage,
        durationMs: getDurationMs(startedAt),
      });
      throw error;
    }
  };
}
