import type { UIMessage } from 'ai';

export type SessionHydrationPayload = {
  session?: {
    status?: string;
    messages?: UIMessage[];
    steps?: Array<{
      id?: string;
      toolName?: string;
      status?: string;
      output?: unknown;
      durationMs?: number | null;
      startedAt?: string | null;
      finishedAt?: string | null;
    }>;
    state?: {
      context?: unknown;
      blocks?: unknown;
      spotBlocks?: unknown;
      toolOutputs?: unknown;
    } | null;
  };
};

export async function fetchSessionHydrationPayload(
  sessionId: string,
): Promise<SessionHydrationPayload | null> {
  const response = await fetch(`/api/sessions/${sessionId}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!response.ok) return null;
  return (await response.json()) as SessionHydrationPayload;
}

export async function patchSessionState(
  sessionId: string,
  patch: Record<string, unknown>,
): Promise<boolean> {
  if (!sessionId) return false;

  try {
    const response = await fetch(`/api/sessions/${sessionId}/state`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!response.ok) {
      console.warn('[chat-ui] patch-session-state-non-ok', {
        sessionId,
        status: response.status,
      });
      return false;
    }
    return true;
  } catch (error) {
    console.warn('[chat-ui] patch-session-state-failed', {
      sessionId,
      message: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}
