import type { UIMessage } from 'ai';

import { isToolPart } from './chat-utils';

export function countGenerateHandbookOutputs(messages: UIMessage[]): number {
  let count = 0;
  for (const message of messages) {
    for (const part of message.parts) {
      if (!isToolPart(part)) continue;
      if (part.type !== 'tool-generate_handbook_html') continue;
      if (part.state !== 'output-available') continue;
      count += 1;
    }
  }
  return count;
}
