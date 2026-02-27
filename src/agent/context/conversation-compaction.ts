import type { UIMessage } from 'ai';
import { runTextTask } from '@/lib/model-management';
import { toErrorMessage } from './utils';

type CompactionMode = 'standard' | 'aggressive';

interface CompactionPolicy {
  recentMessages: number;
  summaryMaxChars: number;
  digestMaxChars: number;
  triggerChars: number;
  maxMessageChars: number;
}

export interface ConversationCompactionResult {
  modelMessages: UIMessage[];
  conversationSummary: string | null;
  compacted: boolean;
  droppedMessageCount: number;
  inputCharEstimate: number;
}

function getPositiveIntEnv(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

function getCompactionPolicy(mode: CompactionMode): CompactionPolicy {
  if (mode === 'aggressive') {
    return {
      recentMessages: getPositiveIntEnv(
        process.env.CHAT_COMPACTION_AGGRESSIVE_RECENT_MESSAGES,
        12,
      ),
      summaryMaxChars: getPositiveIntEnv(
        process.env.CHAT_COMPACTION_AGGRESSIVE_SUMMARY_MAX_CHARS,
        2_000,
      ),
      digestMaxChars: getPositiveIntEnv(
        process.env.CHAT_COMPACTION_AGGRESSIVE_DIGEST_MAX_CHARS,
        10_000,
      ),
      triggerChars: getPositiveIntEnv(
        process.env.CHAT_COMPACTION_AGGRESSIVE_TRIGGER_CHARS,
        30_000,
      ),
      maxMessageChars: getPositiveIntEnv(
        process.env.CHAT_COMPACTION_AGGRESSIVE_MAX_MESSAGE_CHARS,
        800,
      ),
    };
  }

  return {
    recentMessages: getPositiveIntEnv(process.env.CHAT_COMPACTION_RECENT_MESSAGES, 28),
    summaryMaxChars: getPositiveIntEnv(process.env.CHAT_COMPACTION_SUMMARY_MAX_CHARS, 4_500),
    digestMaxChars: getPositiveIntEnv(process.env.CHAT_COMPACTION_DIGEST_MAX_CHARS, 24_000),
    triggerChars: getPositiveIntEnv(process.env.CHAT_COMPACTION_TRIGGER_CHARS, 80_000),
    maxMessageChars: getPositiveIntEnv(process.env.CHAT_COMPACTION_MAX_MESSAGE_CHARS, 1_600),
  };
}

function truncateText(input: string, maxChars: number): string {
  if (input.length <= maxChars) return input;
  return `${input.slice(0, Math.max(0, maxChars - 1))}…`;
}

function normalizeText(value: string, maxChars: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  return truncateText(normalized, maxChars);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function summarizeToolPayload(value: unknown, maxChars: number): string {
  if (value == null) return '';
  if (typeof value === 'string') return normalizeText(value, maxChars);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return `[array length=${value.length}]`;
  }
  if (!isRecord(value)) {
    return normalizeText(String(value), maxChars);
  }

  const preferredKeys = [
    'mode',
    'count',
    'image_count',
    'fallback_generated_count',
    'block_count',
    'spot_count',
    'matched_image_count',
    'title',
    'videoId',
    'preview_url',
    'html_length',
    'error',
    'errorMessage',
    'status',
    'resolved_count',
    'unresolved_count',
  ];

  const compactRecord: Record<string, unknown> = {};
  for (const key of preferredKeys) {
    const entry = value[key];
    if (entry === undefined) continue;
    if (typeof entry === 'string') {
      compactRecord[key] = truncateText(entry, 180);
      continue;
    }
    if (typeof entry === 'number' || typeof entry === 'boolean' || entry === null) {
      compactRecord[key] = entry;
      continue;
    }
    if (Array.isArray(entry)) {
      compactRecord[key] = `[array length=${entry.length}]`;
      continue;
    }
    if (isRecord(entry)) {
      compactRecord[key] = `[object keys=${Object.keys(entry).slice(0, 6).join(',')}]`;
    }
  }

  if (Object.keys(compactRecord).length === 0) {
    compactRecord.keys = Object.keys(value).slice(0, 10).join(',');
  }

  return truncateText(JSON.stringify(compactRecord), maxChars);
}

function summarizePart(part: UIMessage['parts'][number], maxChars: number): string[] {
  if (part.type === 'text') {
    const text = normalizeText(part.text, maxChars);
    return text ? [text] : [];
  }

  if (typeof part.type === 'string' && part.type.startsWith('tool-')) {
    const toolName = part.type.slice('tool-'.length);
    const state = 'state' in part && typeof part.state === 'string' ? part.state : 'unknown';
    const segments = [`[tool ${toolName} state=${state}]`];

    if ('output' in part) {
      const outputSummary = summarizeToolPayload(part.output, maxChars);
      if (outputSummary) segments.push(`output=${outputSummary}`);
    }
    if ('errorText' in part && typeof part.errorText === 'string' && part.errorText.trim()) {
      segments.push(`error=${normalizeText(part.errorText, maxChars)}`);
    }

    return [segments.join(' ')];
  }

  return [];
}

function summarizeMessage(message: UIMessage, maxChars: number): string {
  const snippets = message.parts.flatMap(part => summarizePart(part, maxChars));
  const merged = normalizeText(snippets.join(' '), maxChars);
  return merged ? `${message.role.toUpperCase()}: ${merged}` : '';
}

function estimateMessageChars(messages: UIMessage[]): number {
  let total = 0;
  for (const message of messages) {
    try {
      total += JSON.stringify(message.parts).length + message.role.length;
    } catch {
      total += summarizeMessage(message, 2_000).length;
    }
  }
  return total;
}

function toCompactedRecentMessages(messages: UIMessage[], maxMessageChars: number): UIMessage[] {
  const compacted = messages
    .map((message): UIMessage | null => {
      const summary = summarizeMessage(message, maxMessageChars);
      if (!summary) return null;
      return {
        id: message.id,
        role: message.role,
        parts: [{ type: 'text' as const, text: summary }],
      };
    })
    .filter((message): message is UIMessage => message !== null);

  return compacted;
}

function buildDigest(messages: UIMessage[], maxChars: number): string {
  if (messages.length === 0) return '';
  const lines: string[] = [];
  let usedChars = 0;

  for (const message of messages) {
    const line = summarizeMessage(message, 1_200);
    if (!line) continue;
    if (usedChars + line.length + 1 > maxChars) break;
    lines.push(line);
    usedChars += line.length + 1;
  }

  return lines.join('\n');
}

function sanitizeSummary(summary: string | null, maxChars: number): string | null {
  if (!summary) return null;
  const stripped = summary
    .replace(/^```[a-zA-Z]*\s*/g, '')
    .replace(/```$/g, '')
    .trim();
  if (!stripped) return null;
  return truncateText(stripped, maxChars);
}

function fallbackSummary(
  previousSummary: string | null,
  digest: string,
  summaryMaxChars: number,
): string | null {
  const lines: string[] = [];
  if (previousSummary?.trim()) {
    lines.push(`Previous summary: ${normalizeText(previousSummary, Math.floor(summaryMaxChars * 0.4))}`);
  }
  if (digest.trim()) {
    lines.push(`Recent context digest: ${normalizeText(digest, Math.floor(summaryMaxChars * 0.6))}`);
  }
  const merged = lines.join('\n');
  return sanitizeSummary(merged, summaryMaxChars);
}

async function buildUpdatedSummary(options: {
  previousSummary: string | null;
  digest: string;
  summaryMaxChars: number;
  abortSignal?: AbortSignal;
}): Promise<string | null> {
  const { previousSummary, digest, summaryMaxChars, abortSignal } = options;
  if (!digest.trim()) return sanitizeSummary(previousSummary, summaryMaxChars);

  const prompt = [
    'Create a compact memory summary for a tool-calling travel-agent conversation.',
    `Target maximum length: ${summaryMaxChars} characters.`,
    'Keep only facts needed for future tool selection and final handbook generation:',
    '- user goals and constraints',
    '- extracted video IDs/URLs and selected title/style preferences',
    '- generated artifacts (blocks/images/html), including counts',
    '- unresolved tasks/errors and current status',
    'Output plain text bullets. No markdown code fences.',
    '',
    'PREVIOUS_SUMMARY:',
    previousSummary ?? '(none)',
    '',
    'NEW_CONVERSATION_CHUNK:',
    digest,
  ].join('\n');

  try {
    const result = await runTextTask({
      task: 'conversation_compaction',
      prompt,
      abortSignal,
    });
    return sanitizeSummary(result.text, summaryMaxChars);
  } catch (error) {
    console.warn('[chat_api] conversation-compaction-fallback', {
      message: toErrorMessage(error),
    });
    return fallbackSummary(previousSummary, digest, summaryMaxChars);
  }
}

export async function compactConversationForModel(options: {
  messages: UIMessage[];
  previousSummary: string | null;
  mode: CompactionMode;
  abortSignal?: AbortSignal;
}): Promise<ConversationCompactionResult> {
  const policy = getCompactionPolicy(options.mode);
  const inputCharEstimate = estimateMessageChars(options.messages);
  const overflowByCount = options.messages.length > policy.recentMessages;
  const overflowBySize = inputCharEstimate > policy.triggerChars;

  if (!overflowByCount && !overflowBySize) {
    return {
      modelMessages: options.messages,
      conversationSummary: sanitizeSummary(options.previousSummary, policy.summaryMaxChars),
      compacted: false,
      droppedMessageCount: 0,
      inputCharEstimate,
    };
  }

  const splitIndex = Math.max(0, options.messages.length - policy.recentMessages);
  const olderMessages = options.messages.slice(0, splitIndex);
  const recentMessages = options.messages.slice(splitIndex);
  const digest = buildDigest(olderMessages, policy.digestMaxChars);
  const updatedSummary = await buildUpdatedSummary({
    previousSummary: options.previousSummary,
    digest,
    summaryMaxChars: policy.summaryMaxChars,
    abortSignal: options.abortSignal,
  });

  const compactedRecentMessages = toCompactedRecentMessages(
    recentMessages.length > 0 ? recentMessages : options.messages,
    policy.maxMessageChars,
  );

  return {
    modelMessages: compactedRecentMessages.length > 0 ? compactedRecentMessages : options.messages,
    conversationSummary: updatedSummary,
    compacted: true,
    droppedMessageCount: olderMessages.length,
    inputCharEstimate,
  };
}

export function buildSystemPromptWithConversationSummary(
  baseSystemPrompt: string,
  summary: string | null,
): string {
  if (!summary || !summary.trim()) return baseSystemPrompt;
  return [
    baseSystemPrompt,
    '',
    'Conversation memory summary (compacted):',
    summary,
    'Treat this summary as context. If recent user instructions conflict, follow the latest user request.',
  ].join('\n');
}

export function isContextLimitErrorMessage(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes('maximum context length') ||
    normalized.includes('context length') ||
    normalized.includes('token limit') ||
    normalized.includes('too many tokens') ||
    normalized.includes('request too large') ||
    normalized.includes('request entity too large') ||
    normalized.includes('input tokens')
  );
}
