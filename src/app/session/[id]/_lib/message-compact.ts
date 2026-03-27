import type { UIMessage } from 'ai';
import { isHandbookRemixPromptText } from '@/lib/handbook-remix';

import {
  LEGACY_HANDBOOK_INPUT_JSON_MARKER,
  MANUAL_HANDBOOK_PROMPT_PREFIX,
} from './session-page-constants';

export function compactChatMessagesForChatApi(
  messages: UIMessage[],
): UIMessage[] {
  let changed = false;
  const nextMessages = messages.map(message => {
    if (message.role !== 'user') return message;
    let messageChanged = false;
    const nextParts = message.parts.map(part => {
      if (part.type !== 'text') return part;
      const raw = part.text;
      const trimmed = raw.trim();
      if (
        isHandbookRemixPromptText(trimmed)
        && trimmed.includes(LEGACY_HANDBOOK_INPUT_JSON_MARKER)
      ) {
        changed = true;
        messageChanged = true;
        return {
          ...part,
          text: `${MANUAL_HANDBOOK_PROMPT_PREFIX}\nUse latest session state.`,
        };
      }
      return part;
    });
    if (!messageChanged) return message;
    return {
      ...message,
      parts: nextParts,
    };
  });
  return changed ? nextMessages : messages;
}
