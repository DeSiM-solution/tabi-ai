import { tool } from 'ai';
import { z } from 'zod';
import { runStructuredTask } from '@/lib/model-management';
import type { AgentToolContext } from '@/agent/context/types';
import { getDurationMs, toErrorMessage } from '@/agent/context/utils';
import { handbookSearchImagePlanPrompt } from '@/agent/prompts/image-query-planning';
import {
  handbookImageAssetSchema,
  handbookImagePlanSchema,
  MAX_HANDBOOK_IMAGES,
  type TravelBlock,
} from './types';
import {
  computeImageCoverageMetrics,
  fetchUnsplashPhoto,
  generateHandbookImageByPrompt,
  getImageTargetBlocks,
  getRequiredImageCount,
  resolveImageTargetLimit,
  type UnsplashFetchAttempt,
  UnsplashSearchError,
  validateHandbookImagePlan,
} from './shared';

type BlockAttemptRecord = {
  block_id: string;
  block_title: string;
  query: string;
  phase: 'plan' | 'coverage_backfill';
  status:
    | 'matched_unsplash'
    | 'fallback_generated'
    | 'coverage_backfill_unsplash'
    | 'coverage_backfill_generated';
  reason: string | null;
  selected_query: string | null;
  selected_score: number | null;
  attempts: UnsplashFetchAttempt[];
};

function compactText(value: string, maxLength: number): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function buildCoverageBackfillQuery(block: TravelBlock): string {
  const typeHint =
    block.type === 'spot'
      ? 'landmark travel'
      : block.type === 'food'
        ? 'local cuisine travel'
        : block.type === 'shopping'
          ? 'market shopping street'
          : block.type === 'transport'
            ? 'public transport station'
            : 'city travel scene';
  const tagHint = block.smart_tags
    .map(tag => compactText(tag, 24))
    .filter(Boolean)
    .slice(0, 3)
    .join(' ');

  return [compactText(block.title, 72), tagHint, typeHint].filter(Boolean).join(' ');
}

function buildCoverageBackfillPrompt(block: TravelBlock): string {
  const title = compactText(block.title, 80);
  const description = compactText(block.description, 220);
  const tags = block.smart_tags
    .map(tag => compactText(tag, 24))
    .filter(Boolean)
    .slice(0, 5)
    .join(', ');

  const keywords = tags ? ` Keywords: ${tags}.` : '';
  return `Realistic travel editorial photo in 16:9 landscape showing ${title}. ${description}.${keywords} Natural lighting, high detail, no text overlay, no heavy filters.`;
}

export function createSearchImageTool(ctx: AgentToolContext) {
  return tool({
    description:
      'Search for real stock photos from Unsplash. Best for well-known landmarks, cities, food, and architecture.',
    inputSchema: z.object({
      count: z.number().int().min(1).max(MAX_HANDBOOK_IMAGES).optional(),
    }),
    execute: async ({ count }) =>
      ctx.runToolStep('search_image', { count: count ?? null }, async () => {
        const startedAt = Date.now();
        const sourceBlocks = ctx.runtime.latestBlocks;
        if (!sourceBlocks || sourceBlocks.length === 0) {
          throw new Error(
            'No blocks available for image search. Run build_travel_blocks first.',
          );
        }

        const targetLimit = resolveImageTargetLimit({
          sourceBlockCount: sourceBlocks.length,
          requestedCount: count ?? null,
        });
        const targetBlocks = getImageTargetBlocks(sourceBlocks, targetLimit);
        if (targetBlocks.length === 0) {
          throw new Error('No eligible blocks found for image search.');
        }
        const requiredImageCount = getRequiredImageCount(targetBlocks.length);

        const planned = await runStructuredTask({
          task: 'handbook_image_query_planning',
          schema: handbookImagePlanSchema,
          validateBusinessRules: output =>
            validateHandbookImagePlan(targetBlocks, output, {
              minImageCount: requiredImageCount,
            }),
          abortSignal: ctx.abortSignal,
          prompt: handbookSearchImagePlanPrompt({
            targetBlocks,
            videoContext: ctx.runtime.latestVideoContext,
            requiredImageCount,
          }),
        });
        const plan = planned.object;
        const plannerModel = `${planned.model.provider}:${planned.model.modelId} (attempts=${planned.attempts})`;
        const blockById = new Map(targetBlocks.map(block => [block.block_id, block]));

        console.log('[search_image] query-plan-json', JSON.stringify(plan, null, 2));

        const resolvedItems = await Promise.all(
          plan.images.map(async item => {
            const matchedBlock = blockById.get(item.block_id);
            if (!matchedBlock) {
              throw new Error(`Unknown block_id in search_image plan: ${item.block_id}`);
            }
            try {
              const unsplash = await fetchUnsplashPhoto(item.query, ctx.abortSignal);
              return {
                image: {
                  block_id: item.block_id,
                  block_title: matchedBlock.title,
                  query: item.query,
                  alt: item.alt,
                  image_url: unsplash.image_url,
                  source: 'unsplash' as const,
                  source_page: unsplash.source_page,
                  credit: unsplash.credit,
                  width: unsplash.width,
                  height: unsplash.height,
                },
                attempt: {
                  block_id: item.block_id,
                  block_title: matchedBlock.title,
                  query: item.query,
                  phase: 'plan' as const,
                  status: 'matched_unsplash' as const,
                  reason: null as string | null,
                  selected_query: unsplash.debug.selected_query,
                  selected_score: unsplash.debug.selected_score,
                  attempts: unsplash.debug.attempts,
                },
              };
            } catch (unsplashError) {
              const unsplashAttempts =
                unsplashError instanceof UnsplashSearchError
                  ? unsplashError.debug.attempts
                  : [];
              const unsplashSelectedQuery =
                unsplashError instanceof UnsplashSearchError
                  ? unsplashError.debug.selected_query
                  : null;
              const unsplashSelectedScore =
                unsplashError instanceof UnsplashSearchError
                  ? unsplashError.debug.selected_score
                  : null;
              const unsplashMessage = toErrorMessage(unsplashError);
              console.warn('[search_image] unsplash-item-fallback-generate', {
                blockId: item.block_id,
                query: item.query,
                message: unsplashMessage,
              });
              const generated = await generateHandbookImageByPrompt(item.prompt, ctx.abortSignal);
              return {
                image: {
                  block_id: item.block_id,
                  block_title: matchedBlock.title,
                  query: item.query,
                  alt: item.alt,
                  image_url: generated.image_url,
                  source: 'imagen' as const,
                  source_page: null,
                  credit: `Generated with ${generated.model_id} (fallback from search_image)`,
                  width: null,
                  height: null,
                },
                attempt: {
                  block_id: item.block_id,
                  block_title: matchedBlock.title,
                  query: item.query,
                  phase: 'plan' as const,
                  status: 'fallback_generated' as const,
                  reason: unsplashMessage,
                  selected_query: unsplashSelectedQuery,
                  selected_score: unsplashSelectedScore,
                  attempts: unsplashAttempts as UnsplashFetchAttempt[],
                },
              };
            }
          }),
        );
        const initialImages = resolvedItems.map(item => item.image);
        const blockAttempts: BlockAttemptRecord[] = resolvedItems.map(item => item.attempt);
        const imageByBlockId = new Map(initialImages.map(image => [image.block_id, image]));
        const initialFullMatchedCount = sourceBlocks.filter(block =>
          imageByBlockId.has(block.block_id),
        ).length;
        const initialFullCoverageMetrics = computeImageCoverageMetrics(
          sourceBlocks.length,
          initialFullMatchedCount,
        );

        const unresolvedBlocks = sourceBlocks.filter(
          block => !imageByBlockId.has(block.block_id),
        );
        let backfillAddedCount = 0;
        let coverageGateTriggered = false;
        const coverageGap = Math.max(
          0,
          initialFullCoverageMetrics.required_image_count - initialFullMatchedCount,
        );

        if (coverageGap > 0 && unresolvedBlocks.length > 0) {
          coverageGateTriggered = true;
          const backfillBlocks = unresolvedBlocks.slice(0, coverageGap);
          const backfilledItems = await Promise.all(
            backfillBlocks.map(async block => {
              const query = buildCoverageBackfillQuery(block);
              try {
                const unsplash = await fetchUnsplashPhoto(query, ctx.abortSignal);
                return {
                  image: {
                    block_id: block.block_id,
                    block_title: block.title,
                    query,
                    alt: block.title || 'Travel image',
                    image_url: unsplash.image_url,
                    source: 'unsplash' as const,
                    source_page: unsplash.source_page,
                    credit: unsplash.credit,
                    width: unsplash.width,
                    height: unsplash.height,
                  },
                  attempt: {
                    block_id: block.block_id,
                    block_title: block.title,
                    query,
                    phase: 'coverage_backfill' as const,
                    status: 'coverage_backfill_unsplash' as const,
                    reason: null as string | null,
                    selected_query: unsplash.debug.selected_query,
                    selected_score: unsplash.debug.selected_score,
                    attempts: unsplash.debug.attempts,
                  },
                };
              } catch (unsplashError) {
                const unsplashAttempts =
                  unsplashError instanceof UnsplashSearchError
                    ? unsplashError.debug.attempts
                    : [];
                const unsplashSelectedQuery =
                  unsplashError instanceof UnsplashSearchError
                    ? unsplashError.debug.selected_query
                    : null;
                const unsplashSelectedScore =
                  unsplashError instanceof UnsplashSearchError
                    ? unsplashError.debug.selected_score
                    : null;
                const unsplashMessage = toErrorMessage(unsplashError);
                const prompt = buildCoverageBackfillPrompt(block);
                const generated = await generateHandbookImageByPrompt(prompt, ctx.abortSignal);
                return {
                  image: {
                    block_id: block.block_id,
                    block_title: block.title,
                    query,
                    alt: block.title || 'Travel image',
                    image_url: generated.image_url,
                    source: 'imagen' as const,
                    source_page: null,
                    credit: `Generated with ${generated.model_id} (coverage backfill)`,
                    width: null,
                    height: null,
                  },
                  attempt: {
                    block_id: block.block_id,
                    block_title: block.title,
                    query,
                    phase: 'coverage_backfill' as const,
                    status: 'coverage_backfill_generated' as const,
                    reason: unsplashMessage,
                    selected_query: unsplashSelectedQuery,
                    selected_score: unsplashSelectedScore,
                    attempts: unsplashAttempts as UnsplashFetchAttempt[],
                  },
                };
              }
            }),
          );

          for (const item of backfilledItems) {
            if (!imageByBlockId.has(item.image.block_id)) {
              imageByBlockId.set(item.image.block_id, item.image);
              backfillAddedCount += 1;
            }
            blockAttempts.push(item.attempt);
          }
        }

        const finalImages = sourceBlocks.flatMap(block => {
          const image = imageByBlockId.get(block.block_id);
          return image ? [image] : [];
        });

        ctx.runtime.latestHandbookImages = handbookImageAssetSchema.array().parse(finalImages);
        ctx.runtime.latestImageMode = 'search_image';
        const fallbackGeneratedCount = finalImages.filter(
          image => image.source === 'imagen',
        ).length;
        const unsplashMatchedCount = finalImages.filter(
          image => image.source === 'unsplash',
        ).length;
        const plannerCoverageRatio =
          targetBlocks.length === 0 ? 1 : Number((plan.images.length / targetBlocks.length).toFixed(4));
        const matchedTargetCount = targetBlocks.filter(block =>
          imageByBlockId.has(block.block_id),
        ).length;
        const coverageMetrics = computeImageCoverageMetrics(
          targetBlocks.length,
          matchedTargetCount,
        );
        const fullCoverageMetrics = computeImageCoverageMetrics(
          sourceBlocks.length,
          finalImages.length,
        );
        const imageRefs = ctx.runtime.latestHandbookImages.map(image => ({
          block_id: image.block_id,
          block_title: image.block_title,
          alt: image.alt,
          source: image.source,
          credit: image.credit ?? null,
        }));

        const output = {
          mode: 'search_image' as const,
          planner_model: plannerModel,
          plan_image_count: plan.images.length,
          planner_coverage_ratio: plannerCoverageRatio,
          image_count: ctx.runtime.latestHandbookImages.length,
          unsplash_matched_count: unsplashMatchedCount,
          fallback_generated_count: fallbackGeneratedCount,
          coverage_gate_triggered: coverageGateTriggered,
          coverage_backfill_gap: coverageGap,
          coverage_backfill_added_count: backfillAddedCount,
          full_block_count: sourceBlocks.length,
          full_required_image_count: fullCoverageMetrics.required_image_count,
          full_matched_image_count: finalImages.length,
          full_coverage_ratio: fullCoverageMetrics.coverage_ratio,
          full_pass_75:
            finalImages.length >= fullCoverageMetrics.required_image_count,
          ...coverageMetrics,
          block_attempts: blockAttempts,
          image_refs: imageRefs,
        };

        console.log('[search_image] success', {
          durationMs: getDurationMs(startedAt),
          imageCount: ctx.runtime.latestHandbookImages.length,
          fallbackGeneratedCount,
          unsplashMatchedCount,
          coverageGateTriggered,
          coverageBackfillGap: coverageGap,
          coverageBackfillAddedCount: backfillAddedCount,
          targetBlockCount: coverageMetrics.target_block_count,
          requiredImageCount: coverageMetrics.required_image_count,
          coverageRatio: coverageMetrics.coverage_ratio,
          fullBlockCount: fullCoverageMetrics.target_block_count,
          fullRequiredImageCount: fullCoverageMetrics.required_image_count,
          fullCoverageRatio: fullCoverageMetrics.coverage_ratio,
          plannerCoverageRatio,
          plannerModel,
        });
        console.log('[search_image] output-json', JSON.stringify(output, null, 2));
        return output;
      }),
  });
}
