import { tool } from 'ai';
import { z } from 'zod';
import { runStructuredTask } from '@/lib/model-management';
import type { AgentToolContext } from '@/agent/context/types';
import { getDurationMs, isAbortError, toErrorMessage } from '@/agent/context/utils';
import { buildTravelBlocksPrompt } from '@/agent/prompts/build-travel-blocks';
import { travelBlocksOutputSchema } from './types';
import {
  getSpotBlocks,
  getUniqueCachedVideos,
  getVideoThumbnailUrl,
  sanitizeTravelBlocks,
  syncSessionTitleWithVideo,
  validateTravelBlocksOutput,
} from './shared';

export function createBuildTravelBlocksTool(ctx: AgentToolContext) {
  return tool({
    description:
      'Convert a crawled YouTube travel video into strict JSON itinerary blocks and output spot-only filtered array.',
    inputSchema: z.object({
      videoId: z
        .string()
        .optional()
        .describe(
          'Video id or video url from crawl_youtube_videos result. Optional when there is only one crawled video.',
        ),
    }),
    execute: async ({ videoId }) =>
      ctx.runToolStep(
        'build_travel_blocks',
        { videoId: videoId ?? null },
        async () => {
          const startedAt = Date.now();
          console.log('[build_travel_blocks] start', {
            videoId: videoId ?? null,
          });

          let targetVideo;

          if (videoId) {
            targetVideo = ctx.runtime.videoCache.get(videoId);
          }

          if (!targetVideo) {
            const uniqueVideos = getUniqueCachedVideos(ctx.runtime.videoCache);
            if (uniqueVideos.length === 1) {
              [targetVideo] = uniqueVideos;
            }
          }

          if (!targetVideo) {
            throw new Error(
              'No crawled video found for block conversion. Call crawl_youtube_videos first.',
            );
          }

          console.log('[build_travel_blocks] context-ready', {
            videoId: targetVideo.id,
          });

          let object;
          let modelSummary: string | null = null;

          try {
            const result = await runStructuredTask({
              task: 'json_compilation_strict',
              schema: travelBlocksOutputSchema,
              validateBusinessRules: validateTravelBlocksOutput,
              abortSignal: ctx.abortSignal,
              prompt: buildTravelBlocksPrompt(targetVideo),
            });

            object = result.object;
            modelSummary = `${result.model.provider}:${result.model.modelId} (attempts=${result.attempts})`;
            console.log(
              '[build_travel_blocks] generated-json',
              JSON.stringify(object, null, 2),
            );
          } catch (error) {
            console.error('[build_travel_blocks] failed', {
              durationMs: getDurationMs(startedAt),
              message: toErrorMessage(error),
            });
            if (isAbortError(error)) {
              throw new Error('build_travel_blocks aborted.');
            }
            throw new Error(
              `build_travel_blocks failed: ${toErrorMessage(error)}. Try a shorter video or run again.`,
            );
          }

          const blocks = sanitizeTravelBlocks(object.blocks);
          const spotBlocks = getSpotBlocks(blocks);

          console.log('[build_travel_blocks] success', {
            durationMs: getDurationMs(startedAt),
            blockCount: blocks.length,
            spotCount: spotBlocks.length,
            model: modelSummary,
          });

          ctx.runtime.latestBlocks = blocks;
          ctx.runtime.latestSpotBlocks = spotBlocks;
          ctx.runtime.spotCoordinatesResolved = false;
          ctx.runtime.latestHandbookImages = [];
          ctx.runtime.latestImageMode = null;
          ctx.runtime.latestVideoContext = {
            videoId: targetVideo.id,
            videoUrl: targetVideo.url,
            title: targetVideo.title,
            thumbnailUrl: getVideoThumbnailUrl(targetVideo),
            location: targetVideo.location,
            hashtags: targetVideo.hashtags ?? [],
          };
          await syncSessionTitleWithVideo(ctx.sessionId, ctx.userId, targetVideo);

          const buildResult = {
            videoId: targetVideo.id,
            videoUrl: targetVideo.url,
            title: targetVideo.title,
            thumbnailUrl: getVideoThumbnailUrl(targetVideo),
            blockCount: blocks.length,
            blocks,
            spot_blocks: spotBlocks,
            spotCount: spotBlocks.length,
          };
          console.log(
            '[build_travel_blocks] output-json',
            JSON.stringify(buildResult, null, 2),
          );

          return buildResult;
        },
      ),
  });
}
