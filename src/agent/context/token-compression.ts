import type { UIMessage } from 'ai';

export interface CompressionResult {
  messages: UIMessage[];
  compressed: boolean;
}

export function compressMessages(messages: UIMessage[]): CompressionResult {
  return {
    messages,
    compressed: false,
  };
}
