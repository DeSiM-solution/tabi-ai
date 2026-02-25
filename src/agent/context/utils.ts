export function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function toErrorMessage(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  return 'An unexpected error occurred.';
}

export function withTimeoutSignal(
  timeoutMs: number,
  requestSignal?: AbortSignal,
): AbortSignal {
  if (!requestSignal) return AbortSignal.timeout(timeoutMs);
  return AbortSignal.any([requestSignal, AbortSignal.timeout(timeoutMs)]);
}

export function isAbortError(error: unknown): boolean {
  if (!error) return false;
  if (error instanceof DOMException && error.name === 'AbortError') return true;
  if (error instanceof Error && error.name === 'AbortError') return true;
  return false;
}

export function getDurationMs(startedAt: number): number {
  return Date.now() - startedAt;
}
