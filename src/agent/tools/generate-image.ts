import { tool } from 'ai';
import { z } from 'zod';
import { runStructuredTask } from '@/lib/model-management';
import { buildLegacyBlockDataFromSessionAnalysis } from '@/lib/session-analysis';
import type { AgentToolContext } from '@/agent/context/types';
import { getDurationMs } from '@/agent/context/utils';
import { handbookGenerateImagePlanPrompt } from '@/agent/prompts/image-query-planning';
import { normalizeHandbookImagesToStorage } from '@/server/handbook-image-storage';
import { handbookImageAssetSchema, handbookImagePlanSchema, MAX_HANDBOOK_IMAGES } from './types';
import {
  computeImageCoverageMetrics,
  generateHandbookImageByPrompt,
  getImageTargetBlocks,
  resolveImageTargetLimit,
  validateHandbookImagePlan,
} from './shared';

export function createGenerateImageTool(ctx: AgentToolContext) {
  return tool({
    description:
      'Generate new images for the guide using Gemini Imagen. Generated assets are stored in runtime/session state; tool output returns lightweight references.',
    inputSchema: z.object({
      count: z.number().int().min(1).max(MAX_HANDBOOK_IMAGES).optional(),
    }),
    execute: async ({ count }) =>
      ctx.runToolStep('generate_image', { count: count ?? null }, async () => {
        const startedAt = Date.now();
        const sourceBlocks =
          ctx.runtime.latestBlocks.length > 0
            ? ctx.runtime.latestBlocks
            : ctx.runtime.latestSessionAnalysis
              ? buildLegacyBlockDataFromSessionAnalysis(ctx.runtime.latestSessionAnalysis).blocks
              : [];
        if (!sourceBlocks || sourceBlocks.length === 0) {
          throw new Error(
            'No analyzed session sections available for image generation. Run Analyze Session Data first.',
          );
        }

        const targetLimit = resolveImageTargetLimit({
          sourceBlockCount: sourceBlocks.length,
          requestedCount: count ?? null,
        });
        const targetBlocks = getImageTargetBlocks(sourceBlocks, targetLimit);
        if (targetBlocks.length === 0) {
          throw new Error('No eligible blocks found for image generation.');
        }

        const planned = await runStructuredTask({
          task: 'handbook_image_query_planning',
          schema: handbookImagePlanSchema,
          validateBusinessRules: output => validateHandbookImagePlan(targetBlocks, output),
          abortSignal: ctx.abortSignal,
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
            const generated = await generateHandbookImageByPrompt(item.prompt, ctx.abortSignal);
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

        const storageNormalization = await normalizeHandbookImagesToStorage({
          images: handbookImageAssetSchema.array().parse(images),
          sessionId: ctx.sessionId,
          handbookId: null,
          storageSegment: 'generate-image',
          failureMode: 'drop-failed',
        });
        const normalizedImages = handbookImageAssetSchema.array().parse(
          storageNormalization.images,
        );
        if (normalizedImages.length === 0) {
          throw new Error(
            'All generate_image results failed to upload to storage. No usable handbook images remain.',
          );
        }

        ctx.runtime.latestHandbookImages = normalizedImages;
        ctx.runtime.latestImageMode = 'generate_image';
        const coverageMetrics = computeImageCoverageMetrics(
          targetBlocks.length,
          normalizedImages.length,
        );
        const fullCoverageMetrics = computeImageCoverageMetrics(
          sourceBlocks.length,
          normalizedImages.length,
        );

        const imageRefs = ctx.runtime.latestHandbookImages.map(image => ({
          block_id: image.block_id,
          block_title: image.block_title,
          alt: image.alt,
          source: image.source,
          credit: image.credit ?? null,
        }));

        const output = {
          mode: 'generate_image' as const,
          planner_model: plannerModel,
          generation_models: [...imageModelsUsed],
          image_count: normalizedImages.length,
          storage_uploaded_count: storageNormalization.uploadedCount,
          storage_reused_count: storageNormalization.reusedCount,
          storage_skipped_count: storageNormalization.skippedCount,
          storage_failure_count: storageNormalization.failures.length,
          full_block_count: sourceBlocks.length,
          full_required_image_count: fullCoverageMetrics.required_image_count,
          full_matched_image_count: normalizedImages.length,
          full_coverage_ratio: fullCoverageMetrics.coverage_ratio,
          full_pass_75:
            normalizedImages.length >=
            fullCoverageMetrics.required_image_count,
          ...coverageMetrics,
          image_refs: imageRefs,
        };

        console.log('[generate_image] success', {
          durationMs: getDurationMs(startedAt),
          imageCount: ctx.runtime.latestHandbookImages.length,
          targetBlockCount: coverageMetrics.target_block_count,
          requiredImageCount: coverageMetrics.required_image_count,
          coverageRatio: coverageMetrics.coverage_ratio,
          fullBlockCount: fullCoverageMetrics.target_block_count,
          fullRequiredImageCount: fullCoverageMetrics.required_image_count,
          fullCoverageRatio: fullCoverageMetrics.coverage_ratio,
          storageUploadedCount: storageNormalization.uploadedCount,
          storageReusedCount: storageNormalization.reusedCount,
          storageSkippedCount: storageNormalization.skippedCount,
          storageFailureCount: storageNormalization.failures.length,
          plannerModel,
          generationModels: [...imageModelsUsed],
        });
        console.log('[generate_image] output-json', JSON.stringify(output, null, 2));
        return output;
      }),
  });
}
