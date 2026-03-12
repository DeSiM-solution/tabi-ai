import type { UIMessage } from 'ai';

const SESSION_MESSAGE_CACHE_KEY_PREFIX = 'session-message-cache:';
const SESSION_MESSAGE_CACHE_VERSION = 1;

type SessionMessageCacheRecord = {
  version: number;
  savedAt: number;
  messages: UIMessage[];
};

function getSessionMessageCacheKey(sessionId: string): string {
  return `${SESSION_MESSAGE_CACHE_KEY_PREFIX}${sessionId}`;
}

function isValidMessageRole(value: unknown): value is UIMessage['role'] {
  return value === 'user' || value === 'assistant' || value === 'system';
}

function isValidUIMessage(value: unknown): value is UIMessage {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === 'string'
    && isValidMessageRole(record.role)
    && Array.isArray(record.parts)
  );
}

export function readCachedSessionMessages(sessionId: string): UIMessage[] {
  if (typeof window === 'undefined') return [];
  const cacheKey = getSessionMessageCacheKey(sessionId);
  const raw = window.sessionStorage.getItem(cacheKey);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as SessionMessageCacheRecord;
    if (
      parsed?.version !== SESSION_MESSAGE_CACHE_VERSION
      || !Array.isArray(parsed.messages)
    ) {
      return [];
    }
    if (!parsed.messages.every(isValidUIMessage)) return [];
    return parsed.messages;
  } catch {
    return [];
  }
}

export function persistCachedSessionMessages(
  sessionId: string,
  messages: UIMessage[],
): void {
  if (typeof window === 'undefined') return;
  if (!sessionId || messages.length === 0) return;
  const cacheKey = getSessionMessageCacheKey(sessionId);
  const payload: SessionMessageCacheRecord = {
    version: SESSION_MESSAGE_CACHE_VERSION,
    savedAt: Date.now(),
    messages,
  };

  try {
    window.sessionStorage.setItem(cacheKey, JSON.stringify(payload));
  } catch {
    // Ignore cache write failures (quota/private mode); hydration can still use API payload.
  }
}

function isMessageSequencePrefix(
  prefix: UIMessage[],
  full: UIMessage[],
): boolean {
  if (prefix.length > full.length) return false;
  for (let index = 0; index < prefix.length; index += 1) {
    const prefixMessage = prefix[index];
    const fullMessage = full[index];
    if (!fullMessage) return false;
    if (prefixMessage.id !== fullMessage.id) return false;
    if (prefixMessage.role !== fullMessage.role) return false;
  }
  return true;
}

export function resolveHydratedMessages(
  persistedMessages: UIMessage[],
  cachedMessages: UIMessage[],
  sessionStatus: string | undefined,
): UIMessage[] {
  if (cachedMessages.length === 0) return persistedMessages;
  if (persistedMessages.length === 0) return cachedMessages;

  const persistedIsPrefixOfCache = isMessageSequencePrefix(
    persistedMessages,
    cachedMessages,
  );
  if (
    persistedIsPrefixOfCache
    && cachedMessages.length > persistedMessages.length
  ) {
    return cachedMessages;
  }

  const normalizedStatus = sessionStatus?.toUpperCase() ?? '';
  if (normalizedStatus !== 'RUNNING') return persistedMessages;

  return persistedMessages;
}
