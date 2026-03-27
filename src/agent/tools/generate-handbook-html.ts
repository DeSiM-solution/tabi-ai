import { tool } from 'ai';
import { runTextTask } from '@/lib/model-management';
import { buildLegacyBlockDataFromSessionAnalysis } from '@/lib/session-analysis';
import {
  getHandbookStyleInstruction,
  getHandbookStyleLabel,
  normalizeHandbookStyle,
} from '@/lib/handbook-style';
import {
  LEGACY_SESSION_ANALYSIS_TOOL_NAME,
  SESSION_ANALYSIS_TOOL_NAME,
} from '@/lib/session-analysis-tool';
import {
  createSessionHandbook,
  setActiveHandbook,
  updateSessionHandbook,
} from '@/server/sessions';
import { normalizeHandbookImagesToStorage } from '@/server/handbook-image-storage';
import { persistSessionSnapshot } from '@/agent/context/persistence';
import type { AgentToolContext } from '@/agent/context/types';
import { getDurationMs, isAbortError, isRecord, toErrorMessage } from '@/agent/context/utils';
import {
  handbookHtmlPrompt,
  handbookHtmlSystemPrompt,
  type HandbookPromptImageAsset,
} from '@/agent/prompts/handbook-html';
import { handbookImageAssetSchema, handbookInputSchema } from './types';
import {
  escapeHtmlAttribute,
  ensureCreatedByTabiFooter,
  ensureVideoThumbnailHeader,
  getSpotBlocks,
  normalizeHtmlDocument,
  normalizeOriginVideoUrl,
  normalizeThumbnailUrl,
  stripVideoEmbeds,
} from './shared';
import type { SessionAnalysis } from '@/lib/session-analysis';

function toKnownSpotIds(
  sessionAnalysis: SessionAnalysis | null,
  spotBlocks: Array<{ block_id: string }>,
): string[] {
  const ids = sessionAnalysis?.spots.length
    ? sessionAnalysis.spots.map(spot => spot.spot_id)
    : spotBlocks.map(spot => spot.block_id);
  return [...new Set(ids.map(id => id.trim()).filter(Boolean))];
}

function extractUsedSpotIdsFromHtml(options: {
  html: string;
  knownSpotIds: string[];
  sessionAnalysis: SessionAnalysis | null;
}): string[] {
  const { html, knownSpotIds, sessionAnalysis } = options;
  if (knownSpotIds.length === 0) return [];

  const knownSpotIdSet = new Set(knownSpotIds);
  const idsByDataAttr = new Set<string>();
  const spotAttrRegex = /data-spot-id\s*=\s*["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;
  match = spotAttrRegex.exec(html);
  while (match) {
    const spotId = match[1]?.trim() ?? '';
    if (knownSpotIdSet.has(spotId)) {
      idsByDataAttr.add(spotId);
    }
    match = spotAttrRegex.exec(html);
  }
  if (idsByDataAttr.size > 0) {
    return knownSpotIds.filter(spotId => idsByDataAttr.has(spotId));
  }

  if (sessionAnalysis?.spots.length) {
    const htmlLower = html.toLowerCase();
    const idsByNameMention = new Set<string>();
    for (const spot of sessionAnalysis.spots) {
      const normalizedName = spot.name.trim().toLowerCase();
      if (!normalizedName) continue;
      if (htmlLower.includes(normalizedName)) {
        idsByNameMention.add(spot.spot_id);
      }
    }
    if (idsByNameMention.size > 0) {
      return knownSpotIds.filter(spotId => idsByNameMention.has(spotId));
    }
  }

  // Keep backward compatibility for old HTML generations that don't include data-spot-id yet.
  return knownSpotIds;
}

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
        const effectiveSessionAnalysis = ctx.runtime.latestSessionAnalysis;
        const effectiveBlocks =
          Array.isArray(input.blocks) && input.blocks.length > 0
            ? input.blocks
            : ctx.runtime.latestBlocks.length > 0
              ? ctx.runtime.latestBlocks
              : effectiveSessionAnalysis
                ? buildLegacyBlockDataFromSessionAnalysis(effectiveSessionAnalysis).blocks
                : [];
        if (!effectiveBlocks || effectiveBlocks.length === 0) {
          throw new Error(
            'No analyzed session data available for handbook generation. Run Analyze Session Data first.',
          );
        }

        const spotBlocks =
          input.spot_blocks && input.spot_blocks.length > 0
            ? input.spot_blocks
            : ctx.runtime.latestSpotBlocks.length > 0
              ? ctx.runtime.latestSpotBlocks
              : effectiveSessionAnalysis
                ? buildLegacyBlockDataFromSessionAnalysis(effectiveSessionAnalysis).spot_blocks
                : getSpotBlocks(effectiveBlocks);
        const fallbackThumbnailUrl = normalizeThumbnailUrl(input.thumbnailUrl)
          ?? ctx.runtime.latestVideoContext?.thumbnailUrl
          ?? null;

        // Keep latest editable blocks in runtime even if later image resolution fails.
        ctx.runtime.latestSessionAnalysis = effectiveSessionAnalysis;
        ctx.runtime.latestBlocks = effectiveBlocks;
        ctx.runtime.latestSpotBlocks = spotBlocks;

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

        let preparedImages =
          normalizedInputImages.length > 0
            ? handbookImageAssetSchema.array().parse(normalizedInputImages)
            : ctx.runtime.latestHandbookImages;
        if ((!preparedImages || preparedImages.length === 0) && fallbackThumbnailUrl) {
          preparedImages = handbookImageAssetSchema.array().parse(
            effectiveBlocks.map(block => ({
              block_id: block.block_id,
              block_title: block.title,
              query: `${block.title} travel`,
              alt: block.title || 'Travel image',
              image_url: fallbackThumbnailUrl,
              source: 'unsplash',
              source_page: null,
              credit: null,
              width: null,
              height: null,
            })),
          );
        }
        if (!preparedImages || preparedImages.length === 0) {
          throw new Error(
            'No prepared images found. Call search_image or generate_image before generate_handbook_html, or provide thumbnailUrl fallback.',
          );
        }

        // Defensive fallback: new image tool outputs should already be canonical Supabase URLs.
        const storageNormalization = await normalizeHandbookImagesToStorage({
          images: preparedImages,
          sessionId: ctx.sessionId,
          handbookId: input.handbookId ?? null,
          failureMode: 'skip-failed',
        });
        preparedImages = handbookImageAssetSchema.array().parse(storageNormalization.images);
        if (storageNormalization.failures.length > 0) {
          console.warn('[generate_handbook_html] image-upload-skip-failed', {
            skippedCount: storageNormalization.skippedCount,
            uploadedCount: storageNormalization.uploadedCount,
            reusedCount: storageNormalization.reusedCount,
            failures: storageNormalization.failures,
          });
        }
        if (preparedImages.length === 0) {
          throw new Error(
            'All prepared images failed to upload to storage. No images available for handbook generation.',
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
        const imagesForPrompt: HandbookPromptImageAsset[] = preparedImages.map(image => {
          let promptImageUrl = image.image_url;
          if (image.image_url.startsWith('data:')) {
            promptImageUrl =
              `https://tabi.invalid/generated/${encodeURIComponent(image.block_id)}.png`;
            promptImageUrlReplacements.set(promptImageUrl, image.image_url);
          }
          return {
            block_id: image.block_id,
            block_title: image.block_title,
            alt: image.alt,
            image_url: promptImageUrl,
            width: image.width ?? null,
            height: image.height ?? null,
          };
        });
        const promptImageByBlockId = new Map(imagesForPrompt.map(image => [image.block_id, image]));
        const blocksWithImagesForPrompt = effectiveBlocks.map(block => ({
          ...block,
          image: promptImageByBlockId.get(block.block_id) ?? null,
        }));

        const handbookStyle = 
          normalizeHandbookStyle(input.handbookStyle) ??
          ctx.runtime.latestHandbookStyle ??
          'let-tabi-decide';
        ctx.runtime.latestHandbookStyle = handbookStyle;
        const handbookStyleLabel = getHandbookStyleLabel(handbookStyle);
        const handbookStyleInstruction = getHandbookStyleInstruction(handbookStyle);
        const hasThumbnailInput = typeof input.thumbnailUrl === 'string';
        let resolvedThumbnailUrl = hasThumbnailInput
          ? normalizeThumbnailUrl(input.thumbnailUrl)
          : ctx.runtime.latestVideoContext?.thumbnailUrl ?? null;
        if (resolvedThumbnailUrl) {
          const thumbnailNormalization = await normalizeHandbookImagesToStorage({
            images: [
              {
                block_id: '__cover__',
                block_title: 'Cover image',
                query: 'cover image',
                alt: 'Cover image',
                image_url: resolvedThumbnailUrl,
                source: 'unsplash',
                source_page: null,
                credit: null,
                width: null,
                height: null,
              },
            ],
            sessionId: ctx.sessionId,
            handbookId: input.handbookId ?? null,
            failureMode: 'skip-failed',
          });
          resolvedThumbnailUrl =
            thumbnailNormalization.images[0]?.image_url ?? resolvedThumbnailUrl;
          if (thumbnailNormalization.failures.length > 0) {
            console.warn('[generate_handbook_html] cover-image-upload-skip-failed', {
              failures: thumbnailNormalization.failures,
            });
          }
        }

        for (const toolName of [
          SESSION_ANALYSIS_TOOL_NAME,
          LEGACY_SESSION_ANALYSIS_TOOL_NAME,
          'resolve_spot_coordinates',
        ] as const) {
          const toolOutput = ctx.runtime.latestToolOutputs[toolName];
          if (!isRecord(toolOutput)) continue;
          if ('thumbnailUrl' in toolOutput) {
            toolOutput.thumbnailUrl = resolvedThumbnailUrl;
          }
          if ('coverImageUrl' in toolOutput) {
            toolOutput.coverImageUrl = resolvedThumbnailUrl;
          }
          if ('cover_image_url' in toolOutput) {
            toolOutput.cover_image_url = resolvedThumbnailUrl;
          }
        }

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
        const originVideoUrl =
          input.videoUrl ?? ctx.runtime.latestVideoContext?.videoUrl ?? null;
        const normalizedOriginVideoUrl = normalizeOriginVideoUrl(originVideoUrl);
        const escapedOriginVideoUrl = normalizedOriginVideoUrl
          ? escapeHtmlAttribute(normalizedOriginVideoUrl)
          : null;

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
              sessionAnalysis: effectiveSessionAnalysis,
              blocks: effectiveBlocks,
              blocksWithImages: blocksWithImagesForPrompt,
              spotBlocks,
              images: imagesForPrompt,
              imageMode: ctx.runtime.latestImageMode,
              handbookStyle,
              handbookStyleLabel,
              handbookStyleInstruction,
              escapedUrl: escapedOriginVideoUrl,
            }),
          });
          html = normalizeHtmlDocument(result.text);
          for (const [placeholderUrl, sourceUrl] of promptImageUrlReplacements) {
            html = html.split(placeholderUrl).join(sourceUrl);
          }
          html = stripVideoEmbeds(html);
          html = ensureVideoThumbnailHeader(html, {
            thumbnailUrl: resolvedThumbnailUrl,
            title: resolvedTitle,
          });
          html = ensureCreatedByTabiFooter(html);
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
        const knownSpotIds = toKnownSpotIds(effectiveSessionAnalysis, spotBlocks);
        const usedSpotIds = extractUsedSpotIdsFromHtml({
          html,
          knownSpotIds,
          sessionAnalysis: effectiveSessionAnalysis,
        });

        ctx.runtime.latestHandbookHtml = html;
        ctx.runtime.requestHasGeneratedHandbook = true;
        const requestedHandbookId =
          typeof input.handbookId === 'string' && input.handbookId.trim()
            ? input.handbookId.trim()
            : null;
        const generationKind = requestedHandbookId ? 'remix' : 'initial';
        let handbookId: string | null = null;
        if (ctx.sessionId && ctx.userId) {
          const sourceContext = {
            video: ctx.runtime.latestVideoContext,
            apifyVideos: ctx.runtime.latestApifyVideos,
            sessionAnalysis: ctx.runtime.latestSessionAnalysis,
            handbookStyle,
            handbookStyleLabel,
              styleAtGeneration: handbookStyle,
              generationKind,
              handbookGenerationStatus: 'ready',
              usedSpotIds,
              used_spot_ids: usedSpotIds,
            };
            if (requestedHandbookId) {
            const updatedHandbook = await updateSessionHandbook(requestedHandbookId, ctx.userId, {
              title: resolvedTitle,
              html,
              previewPath: null,
              sourceContext,
              sourceBlocks: effectiveBlocks,
              sourceSpotBlocks: spotBlocks,
              sourceToolOutputs: ctx.runtime.latestToolOutputs,
              style: handbookStyle,
              thumbnailUrl: resolvedThumbnailUrl,
              generatedAt: new Date(),
            });
            if (updatedHandbook && updatedHandbook.sessionId === ctx.sessionId) {
              handbookId = updatedHandbook.id;
              await setActiveHandbook(ctx.sessionId, ctx.userId, updatedHandbook.id);
            }
          }
          if (!handbookId) {
            const createdHandbook = await createSessionHandbook(ctx.sessionId, ctx.userId, {
              title: resolvedTitle,
              html,
              lifecycle: 'DRAFT',
              previewPath: null,
              sourceContext,
              sourceBlocks: effectiveBlocks,
              sourceSpotBlocks: spotBlocks,
              sourceToolOutputs: ctx.runtime.latestToolOutputs,
              style: handbookStyle,
              thumbnailUrl: resolvedThumbnailUrl,
              generatedAt: new Date(),
              setActive: true,
            });
            handbookId = createdHandbook?.id ?? null;
          }

          await persistSessionSnapshot(ctx.sessionId, ctx.userId, ctx.runtime);
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
          used_spot_ids: usedSpotIds,
          used_spot_count: usedSpotIds.length,
          generation_kind: generationKind,
          generated_at: new Date().toISOString(),
          html_length: html.length,
          html_included: includeInlineHtml,
          handbook_id: handbookId,
          preview_url: handbookId
            ? `/api/guide/${handbookId}`
            : ctx.sessionId
              ? `/api/guide/${ctx.sessionId}`
              : null,
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
          used_spot_count: handbookResult.used_spot_count,
          html_length: handbookResult.html_length,
          handbook_id: handbookResult.handbook_id,
          preview_url: handbookResult.preview_url,
        });

        return handbookResult;
      }),
  });
}
