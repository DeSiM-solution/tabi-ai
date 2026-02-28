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
import { handbookImageAssetSchema, handbookInputSchema } from './types';
import {
  appendOriginVideoLink,
  ensureVideoThumbnailHeader,
  getSpotBlocks,
  normalizeHtmlDocument,
  normalizeThumbnailUrl,
  stripVideoEmbeds,
} from './shared';

export function createGenerateHandbookHtmlTool(ctx: AgentToolContext) {
  return tool({
    description:
      'Generate a full single-file handbook HTML page. If blocks/images are omitted, the tool uses the latest runtime/session state.',
    inputSchema: handbookInputSchema,
    execute: async input =>
      ctx.runToolStep('generate_handbook_html', input, async () => {
        type NormalizedHandbookImage = {
          block_id: string;
          block_title: string;
          query: string;
          alt: string;
          image_url: string;
          source: 'unsplash' | 'imagen';
          source_page: string | null;
          credit: string | null;
          width: number | null;
          height: number | null;
        };

        const startedAt = Date.now();
        const effectiveBlocks =
          Array.isArray(input.blocks) && input.blocks.length > 0
            ? input.blocks
            : ctx.runtime.latestBlocks;
        if (!effectiveBlocks || effectiveBlocks.length === 0) {
          throw new Error(
            'No blocks available for handbook generation. Run build_travel_blocks first.',
          );
        }

        const spotBlocks =
          input.spot_blocks && input.spot_blocks.length > 0
            ? input.spot_blocks
            : ctx.runtime.latestSpotBlocks.length > 0
              ? ctx.runtime.latestSpotBlocks
              : getSpotBlocks(effectiveBlocks);

        const runtimeImageByBlockId = new Map(
          ctx.runtime.latestHandbookImages.map(image => [image.block_id, image]),
        );
        const normalizedInputImages = (Array.isArray(input.images) ? input.images : [])
          .map(image => {
            const runtimeImage = runtimeImageByBlockId.get(image.block_id);
            const resolvedImageUrl = image.image_url ?? runtimeImage?.image_url;
            if (!resolvedImageUrl) return null;

            const fallbackTitle = runtimeImage?.block_title ?? image.block_title ?? '';
            const fallbackQuery = runtimeImage?.query ?? image.query ?? '';
            const fallbackAlt =
              runtimeImage?.alt ?? image.alt ?? (fallbackTitle || 'Travel image');

            return {
              block_id: image.block_id,
              block_title: image.block_title ?? runtimeImage?.block_title ?? fallbackTitle,
              query: image.query ?? runtimeImage?.query ?? fallbackQuery,
              alt: image.alt ?? runtimeImage?.alt ?? fallbackAlt,
              image_url: resolvedImageUrl,
              source: image.source ?? runtimeImage?.source ?? 'unsplash',
              source_page: image.source_page ?? runtimeImage?.source_page ?? null,
              credit: image.credit ?? runtimeImage?.credit ?? null,
              width: image.width ?? runtimeImage?.width ?? null,
              height: image.height ?? runtimeImage?.height ?? null,
            } satisfies NormalizedHandbookImage;
          })
          .filter((image): image is NormalizedHandbookImage => image !== null);

        const preparedImages =
          normalizedInputImages.length > 0
            ? handbookImageAssetSchema.array().parse(normalizedInputImages)
            : ctx.runtime.latestHandbookImages;
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
        const blocksWithImages = effectiveBlocks.map(block => ({
          ...block,
          image: imageByBlockId.get(block.block_id) ?? null,
        }));
        const matchedImageCount = blocksWithImages.filter(block => block.image !== null).length;
        if (matchedImageCount === 0) {
          throw new Error(
            'Prepared images do not match current blocks. Run search_image or generate_image again.',
          );
        }
        const promptImageUrlReplacements = new Map<string, string>();
        const imagesForPrompt = preparedImages.map(image => {
          if (!image.image_url.startsWith('data:')) return image;
          const placeholderUrl = `https://tabi.invalid/generated/${encodeURIComponent(image.block_id)}.png`;
          promptImageUrlReplacements.set(placeholderUrl, image.image_url);
          return {
            ...image,
            image_url: placeholderUrl,
          };
        });
        const promptImageByBlockId = new Map(imagesForPrompt.map(image => [image.block_id, image]));
        const blocksWithImagesForPrompt = effectiveBlocks.map(block => ({
          ...block,
          image: promptImageByBlockId.get(block.block_id) ?? null,
        }));

        ctx.runtime.latestBlocks = effectiveBlocks;
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
          blockCount: effectiveBlocks.length,
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
            abortSignal: ctx.abortSignal,
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
              blocks: effectiveBlocks,
              blocksWithImages: blocksWithImagesForPrompt,
              spotBlocks,
              images: imagesForPrompt,
              imageMode: ctx.runtime.latestImageMode,
              handbookStyle,
              handbookStyleLabel,
              handbookStyleInstruction,
            }),
          });
          const originVideoUrl = input.videoUrl ?? ctx.runtime.latestVideoContext?.videoUrl ?? null;
          html = normalizeHtmlDocument(result.text);
          for (const [placeholderUrl, sourceUrl] of promptImageUrlReplacements) {
            html = html.split(placeholderUrl).join(sourceUrl);
          }
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
        ctx.runtime.requestHasGeneratedHandbook = true;
        if (ctx.sessionId && ctx.userId) {
          await persistSessionSnapshot(ctx.sessionId, ctx.userId, ctx.runtime, {
            incrementHandbookVersion: true,
          });
        }

        const inlineHtmlLimitRaw = Number(process.env.HANDBOOK_INLINE_HTML_MAX_CHARS ?? 180_000);
        const inlineHtmlMaxChars =
          Number.isFinite(inlineHtmlLimitRaw) && inlineHtmlLimitRaw > 0
            ? Math.floor(inlineHtmlLimitRaw)
            : 180_000;
        const hasEmbeddedDataImage = /data:image\//i.test(html);
        const includeInlineHtml =
          !ctx.sessionId || (!hasEmbeddedDataImage && html.length <= inlineHtmlMaxChars);

        const handbookResult = {
          title: resolvedTitle,
          videoId: input.videoId ?? ctx.runtime.latestVideoContext?.videoId ?? '',
          videoUrl: input.videoUrl ?? ctx.runtime.latestVideoContext?.videoUrl ?? '',
          thumbnailUrl: resolvedThumbnailUrl,
          block_count: effectiveBlocks.length,
          spot_count: spotBlocks.length,
          image_count: preparedImages.length,
          matched_image_count: matchedImageCount,
          image_mode: ctx.runtime.latestImageMode,
          handbook_style: handbookStyle,
          handbook_style_label: handbookStyleLabel,
          generated_at: new Date().toISOString(),
          html_length: html.length,
          html_included: includeInlineHtml,
          preview_url: ctx.sessionId ? `/api/guide/${ctx.sessionId}` : null,
          html: includeInlineHtml ? html : undefined,
        };

        console.log('[generate_handbook_html] success', {
          durationMs: getDurationMs(startedAt),
          model: modelSummary,
          htmlLength: handbookResult.html_length,
          htmlIncluded: handbookResult.html_included,
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
