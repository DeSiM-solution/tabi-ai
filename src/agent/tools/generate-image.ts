import { tool } from 'ai';
import { z } from 'zod';
import { runStructuredTask } from '@/lib/model-management';
import type { AgentToolContext } from '@/agent/context/types';
import { getDurationMs } from '@/agent/context/utils';
import { handbookGenerateImagePlanPrompt } from '@/agent/prompts/image-query-planning';
import { handbookImageAssetSchema, handbookImagePlanSchema, MAX_HANDBOOK_IMAGES } from './types';
import {
  generateHandbookImageByPrompt,
  getImageTargetBlocks,
  validateHandbookImagePlan,
} from './shared';

export function createGenerateImageTool(ctx: AgentToolContext) {
  return tool({
    description:
      'Generate new images for the guide using Gemini Imagen. Use to create visual enhancements beyond video frames.',
    inputSchema: z.object({
      count: z.number().int().min(1).max(MAX_HANDBOOK_IMAGES).optional(),
    }),
    execute: async ({ count }) =>
      ctx.runToolStep('generate_image', { count: count ?? null }, async () => {
        const startedAt = Date.now();
        const sourceBlocks = ctx.runtime.latestBlocks;
        if (!sourceBlocks || sourceBlocks.length === 0) {
          throw new Error(
            'No blocks available for image generation. Run build_travel_blocks first.',
          );
        }

        const targetBlocks = getImageTargetBlocks(
          sourceBlocks,
          Math.min(count ?? MAX_HANDBOOK_IMAGES, MAX_HANDBOOK_IMAGES),
        );
        if (targetBlocks.length === 0) {
          throw new Error('No eligible blocks found for image generation.');
        }

        const planned = await runStructuredTask({
          task: 'handbook_image_query_planning',
          schema: handbookImagePlanSchema,
          validateBusinessRules: output => validateHandbookImagePlan(targetBlocks, output),
          abortSignal: ctx.req.signal,
          prompt: handbookGenerateImagePlanPrompt({
            targetBlocks,
            videoContext: ctx.runtime.latestVideoContext,
          }),
        });
        const plan = planned.object;
        const plannerModel = `${planned.model.provider}:${planned.model.modelId} (attempts=${planned.attempts})`;
        const blockById = new Map(targetBlocks.map(block => [block.block_id, block]));
        const imageModelsUsed = new Set<string>();

        console.log('[generate_image] prompt-plan-json', JSON.stringify(plan, null, 2));

        const images = await Promise.all(
          plan.images.map(async item => {
            const matchedBlock = blockById.get(item.block_id);
            if (!matchedBlock) {
              throw new Error(`Unknown block_id in generate_image plan: ${item.block_id}`);
            }
            const generated = await generateHandbookImageByPrompt(item.prompt, ctx.req.signal);
            imageModelsUsed.add(generated.model_id);
            return {
              block_id: item.block_id,
              block_title: matchedBlock.title,
              query: item.query,
              alt: item.alt,
              image_url: generated.image_url,
              source: 'imagen' as const,
              source_page: null,
              credit: `Generated with ${generated.model_id}`,
              width: null,
              height: null,
            };
          }),
        );

        ctx.runtime.latestHandbookImages = handbookImageAssetSchema.array().parse(images);
        ctx.runtime.latestImageMode = 'generate_image';

        const output = {
          mode: 'generate_image' as const,
          planner_model: plannerModel,
          generation_models: [...imageModelsUsed],
          image_count: ctx.runtime.latestHandbookImages.length,
          images: ctx.runtime.latestHandbookImages,
        };

        console.log('[generate_image] success', {
          durationMs: getDurationMs(startedAt),
          imageCount: ctx.runtime.latestHandbookImages.length,
          plannerModel,
          generationModels: [...imageModelsUsed],
        });
        console.log('[generate_image] output-json', JSON.stringify(output, null, 2));
        return output;
      }),
  });
}
