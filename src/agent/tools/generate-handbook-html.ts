import { tool } from 'ai';
import { runTextTask } from '@/lib/model-management';
import {
  getHandbookStyleInstruction,
  getHandbookStyleLabel,
  normalizeHandbookStyle,
} from '@/lib/handbook-style';
import { persistSessionSnapshot } from '@/agent/context/persistence';
import type { AgentToolContext } from '@/agent/context/types';
import { getDurationMs, isAbortError, toErrorMessage } from '@/agent/context/utils';
import { handbookHtmlPrompt, handbookHtmlSystemPrompt } from '@/agent/prompts/handbook-html';
import { handbookInputSchema } from './types';
import {
  appendOriginVideoLink,
  ensureVideoThumbnailHeader,
  normalizeHtmlDocument,
  normalizeThumbnailUrl,
  stripVideoEmbeds,
} from './shared';

export function createGenerateHandbookHtmlTool(ctx: AgentToolContext) {
  return tool({
    description:
      'Generate a full single-file handbook HTML page from edited blocks with coordinates.',
    inputSchema: handbookInputSchema,
    execute: async input =>
      ctx.runToolStep('generate_handbook_html', input, async () => {
        const startedAt = Date.now();
        const spotBlocks =
          input.spot_blocks && input.spot_blocks.length > 0
            ? input.spot_blocks
            : input.blocks
                .filter(block => block.type === 'spot')
                .map(block => ({
                  block_id: block.block_id,
                  title: block.title,
                  description: block.description,
                  location: block.location,
                  smart_tags: block.smart_tags,
                }));
        const imagesFromInput =
          Array.isArray(input.images) && input.images.length > 0 ? input.images : [];
        const preparedImages =
          imagesFromInput.length > 0 ? imagesFromInput : ctx.runtime.latestHandbookImages;
        if (!preparedImages || preparedImages.length === 0) {
          throw new Error(
            'No prepared images found. Call search_image or generate_image before generate_handbook_html.',
          );
        }

        ctx.runtime.latestHandbookImages = preparedImages;
        if (!ctx.runtime.latestImageMode) {
          ctx.runtime.latestImageMode = preparedImages.some(image => image.source === 'imagen')
            ? 'generate_image'
            : 'search_image';
        }
        const imageByBlockId = new Map(preparedImages.map(image => [image.block_id, image]));
        const blocksWithImages = input.blocks.map(block => ({
          ...block,
          image: imageByBlockId.get(block.block_id) ?? null,
        }));
        const matchedImageCount = blocksWithImages.filter(block => block.image !== null).length;
        if (matchedImageCount === 0) {
          throw new Error(
            'Prepared images do not match current blocks. Run search_image or generate_image again.',
          );
        }

        ctx.runtime.latestBlocks = input.blocks;
        ctx.runtime.latestSpotBlocks = spotBlocks;
        const handbookStyle =
          normalizeHandbookStyle(input.handbookStyle) ??
          ctx.runtime.latestHandbookStyle ??
          'let-tabi-decide';
        ctx.runtime.latestHandbookStyle = handbookStyle;
        const handbookStyleLabel = getHandbookStyleLabel(handbookStyle);
        const handbookStyleInstruction = getHandbookStyleInstruction(handbookStyle);
        const hasThumbnailInput = typeof input.thumbnailUrl === 'string';
        const resolvedThumbnailUrl = hasThumbnailInput
          ? normalizeThumbnailUrl(input.thumbnailUrl)
          : ctx.runtime.latestVideoContext?.thumbnailUrl ?? null;

        if (input.videoId || input.videoUrl || input.title || hasThumbnailInput) {
          ctx.runtime.latestVideoContext = {
            videoId: input.videoId ?? ctx.runtime.latestVideoContext?.videoId ?? '',
            videoUrl: input.videoUrl ?? ctx.runtime.latestVideoContext?.videoUrl ?? '',
            title: input.title ?? ctx.runtime.latestVideoContext?.title ?? 'Travel Handbook',
            thumbnailUrl: resolvedThumbnailUrl,
            location: ctx.runtime.latestVideoContext?.location ?? null,
            hashtags: ctx.runtime.latestVideoContext?.hashtags ?? [],
          };
        }

        const resolvedTitle =
          input.title ?? ctx.runtime.latestVideoContext?.title ?? 'Travel Handbook';

        console.log('[generate_handbook_html] start', {
          title: input.title ?? null,
          blockCount: input.blocks.length,
          spotCount: spotBlocks.length,
          imageCount: preparedImages.length,
          matchedImageCount,
          imageMode: ctx.runtime.latestImageMode,
          handbookStyle,
          thumbnailUrl: resolvedThumbnailUrl,
        });

        let html = '';
        let modelSummary: string | null = null;
        try {
          const result = await runTextTask({
            task: 'handbook_html_generation',
            abortSignal: ctx.req.signal,
            system: handbookHtmlSystemPrompt({ handbookStyleInstruction }),
            prompt: handbookHtmlPrompt({
              title: resolvedTitle,
              videoContext: {
                videoId: input.videoId ?? ctx.runtime.latestVideoContext?.videoId ?? '',
                videoUrl: input.videoUrl ?? ctx.runtime.latestVideoContext?.videoUrl ?? '',
                title: resolvedTitle,
                thumbnailUrl: resolvedThumbnailUrl,
                location: ctx.runtime.latestVideoContext?.location ?? null,
                hashtags: ctx.runtime.latestVideoContext?.hashtags ?? [],
              },
              thumbnailUrl: resolvedThumbnailUrl,
              blocks: input.blocks,
              blocksWithImages,
              spotBlocks,
              images: preparedImages,
              imageMode: ctx.runtime.latestImageMode,
              handbookStyle,
              handbookStyleLabel,
              handbookStyleInstruction,
            }),
          });
          const originVideoUrl = input.videoUrl ?? ctx.runtime.latestVideoContext?.videoUrl ?? null;
          html = normalizeHtmlDocument(result.text);
          html = stripVideoEmbeds(html);
          html = ensureVideoThumbnailHeader(html, {
            thumbnailUrl: resolvedThumbnailUrl,
            title: resolvedTitle,
          });
          html = appendOriginVideoLink(html, originVideoUrl);
          modelSummary = `${result.model.provider}:${result.model.modelId} (attempts=${result.attempts})`;
        } catch (error) {
          console.error('[generate_handbook_html] failed', {
            durationMs: getDurationMs(startedAt),
            message: toErrorMessage(error),
          });
          if (isAbortError(error)) {
            throw new Error('generate_handbook_html aborted.');
          }
          throw new Error(`generate_handbook_html failed: ${toErrorMessage(error)}`);
        }

        ctx.runtime.latestHandbookHtml = html;
        if (ctx.sessionId) {
          await persistSessionSnapshot(ctx.sessionId, ctx.runtime, {
            incrementHandbookVersion: true,
          });
        }

        const handbookResult = {
          title: resolvedTitle,
          videoId: input.videoId ?? ctx.runtime.latestVideoContext?.videoId ?? '',
          videoUrl: input.videoUrl ?? ctx.runtime.latestVideoContext?.videoUrl ?? '',
          thumbnailUrl: resolvedThumbnailUrl,
          block_count: input.blocks.length,
          spot_count: spotBlocks.length,
          image_count: preparedImages.length,
          matched_image_count: matchedImageCount,
          image_mode: ctx.runtime.latestImageMode,
          handbook_style: handbookStyle,
          handbook_style_label: handbookStyleLabel,
          generated_at: new Date().toISOString(),
          html_length: html.length,
          preview_url: ctx.sessionId ? `/api/guide/${ctx.sessionId}` : null,
          html,
        };

        console.log('[generate_handbook_html] success', {
          durationMs: getDurationMs(startedAt),
          model: modelSummary,
          htmlLength: handbookResult.html_length,
        });
        console.log('[generate_handbook_html] output-meta', {
          title: handbookResult.title,
          generated_at: handbookResult.generated_at,
          block_count: handbookResult.block_count,
          spot_count: handbookResult.spot_count,
          image_count: handbookResult.image_count,
          matched_image_count: handbookResult.matched_image_count,
          image_mode: handbookResult.image_mode,
          handbook_style: handbookResult.handbook_style,
          html_length: handbookResult.html_length,
          preview_url: handbookResult.preview_url,
        });

        return handbookResult;
      }),
  });
}
