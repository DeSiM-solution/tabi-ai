import { tool } from 'ai';
import { z } from 'zod';
import { runStructuredTask } from '@/lib/model-management';
import type { AgentToolContext } from '@/agent/context/types';
import { getDurationMs, toErrorMessage } from '@/agent/context/utils';
import { handbookSearchImagePlanPrompt } from '@/agent/prompts/image-query-planning';
import { handbookImageAssetSchema, handbookImagePlanSchema, MAX_HANDBOOK_IMAGES } from './types';
import {
  fetchUnsplashPhoto,
  generateHandbookImageByPrompt,
  getImageTargetBlocks,
  validateHandbookImagePlan,
} from './shared';

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

        const targetBlocks = getImageTargetBlocks(
          sourceBlocks,
          Math.min(count ?? MAX_HANDBOOK_IMAGES, MAX_HANDBOOK_IMAGES),
        );
        if (targetBlocks.length === 0) {
          throw new Error('No eligible blocks found for image search.');
        }

        const planned = await runStructuredTask({
          task: 'handbook_image_query_planning',
          schema: handbookImagePlanSchema,
          validateBusinessRules: output => validateHandbookImagePlan(targetBlocks, output),
          abortSignal: ctx.abortSignal,
          prompt: handbookSearchImagePlanPrompt({
            targetBlocks,
            videoContext: ctx.runtime.latestVideoContext,
          }),
        });
        const plan = planned.object;
        const plannerModel = `${planned.model.provider}:${planned.model.modelId} (attempts=${planned.attempts})`;
        const blockById = new Map(targetBlocks.map(block => [block.block_id, block]));

        console.log('[search_image] query-plan-json', JSON.stringify(plan, null, 2));

        const images = await Promise.all(
          plan.images.map(async item => {
            const matchedBlock = blockById.get(item.block_id);
            if (!matchedBlock) {
              throw new Error(`Unknown block_id in search_image plan: ${item.block_id}`);
            }
            try {
              const unsplash = await fetchUnsplashPhoto(item.query, ctx.abortSignal);
              return {
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
              };
            } catch (unsplashError) {
              console.warn('[search_image] unsplash-item-fallback-generate', {
                blockId: item.block_id,
                query: item.query,
                message: toErrorMessage(unsplashError),
              });
              const generated = await generateHandbookImageByPrompt(item.prompt, ctx.abortSignal);
              return {
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
              };
            }
          }),
        );

        ctx.runtime.latestHandbookImages = handbookImageAssetSchema.array().parse(images);
        ctx.runtime.latestImageMode = 'search_image';
        const fallbackGeneratedCount = images.filter(image => image.source === 'imagen').length;
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
          image_count: ctx.runtime.latestHandbookImages.length,
          fallback_generated_count: fallbackGeneratedCount,
          image_refs: imageRefs,
        };

        console.log('[search_image] success', {
          durationMs: getDurationMs(startedAt),
          imageCount: ctx.runtime.latestHandbookImages.length,
          fallbackGeneratedCount,
          plannerModel,
        });
        console.log('[search_image] output-json', JSON.stringify(output, null, 2));
        return output;
      }),
  });
}
