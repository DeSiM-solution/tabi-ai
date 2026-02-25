import { tool } from 'ai';
import { z } from 'zod';
import type { AgentToolContext } from '@/agent/context/types';
import { extractYoutubeUrls } from './shared';

export function createParseYoutubeInputTool(ctx: AgentToolContext) {
  return tool({
    description:
      'Extract and normalize YouTube video URLs from raw user text.',
    inputSchema: z.object({
      userText: z
        .string()
        .describe('Raw text from the user that may contain YouTube links'),
    }),
    execute: async ({ userText }) =>
      ctx.runToolStep('parse_youtube_input', { userText }, async () => {
        console.log('[parse_youtube_input] start', {
          userTextLength: userText.length,
          userTextPreview: userText.slice(0, 160),
        });
        const videoUrls = extractYoutubeUrls(userText);
        const parseResult = {
          videoUrls,
          count: videoUrls.length,
        };
        console.log(
          '[parse_youtube_input] output-json',
          JSON.stringify(parseResult, null, 2),
        );
        return parseResult;
      }),
  });
}
