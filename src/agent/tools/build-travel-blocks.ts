import { tool } from 'ai';
import { z } from 'zod';
import { runStructuredTask } from '@/lib/model-management';
import { buildLegacyBlockDataFromSessionAnalysis, sessionAnalysisSchema } from '@/lib/session-analysis';
import type { AgentToolContext } from '@/agent/context/types';
import { getDurationMs, isAbortError, toErrorMessage } from '@/agent/context/utils';
import { buildTravelBlocksPrompt } from '@/agent/prompts/build-travel-blocks';
import {
  getUniqueCachedVideos,
  getVideoThumbnailUrl,
  normalizeSessionTitle,
  syncSessionTitleWithVideo,
} from './shared';

export function createBuildTravelBlocksTool(ctx: AgentToolContext) {
  return tool({
    description:
      'Analyze a crawled YouTube travel video into reusable session data for handbook generation, spots, and remix.',
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
        'analyze_session_data',
        { videoId: videoId ?? null },
        async () => {
          const startedAt = Date.now();
          console.log('[analyze_session_data] start', {
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

          const resolvedTitle =
            normalizeSessionTitle(targetVideo.title)
            ?? normalizeSessionTitle(targetVideo.translatedTitle)
            ?? normalizeSessionTitle(ctx.runtime.latestVideoContext?.title)
            ?? 'Untitled Guide';
          const resolvedVideoId =
            typeof targetVideo.id === 'string' && targetVideo.id.trim()
              ? targetVideo.id.trim()
              : ctx.runtime.latestVideoContext?.videoId ?? '';
          const resolvedVideoUrl =
            typeof targetVideo.url === 'string' && targetVideo.url.trim()
              ? targetVideo.url.trim()
              : ctx.runtime.latestVideoContext?.videoUrl ?? '';
          const resolvedThumbnailUrl =
            getVideoThumbnailUrl(targetVideo)
            ?? ctx.runtime.latestVideoContext?.thumbnailUrl
            ?? null;
          const resolvedHashtags = Array.isArray(targetVideo.hashtags)
            ? targetVideo.hashtags
            : ctx.runtime.latestVideoContext?.hashtags ?? [];

          console.log('[analyze_session_data] context-ready', {
            videoId: resolvedVideoId,
            title: resolvedTitle,
            thumbnailUrl: resolvedThumbnailUrl,
          });

          let object;
          let modelSummary: string | null = null;

          try {
            const result = await runStructuredTask({
              task: 'json_compilation_strict',
              schema: sessionAnalysisSchema,
              abortSignal: ctx.abortSignal,
              prompt: buildTravelBlocksPrompt(targetVideo),
            });

            object = result.object;
            modelSummary = `${result.model.provider}:${result.model.modelId} (attempts=${result.attempts})`;
            console.log(
              '[analyze_session_data] generated-json',
              JSON.stringify(object, null, 2),
            );
          } catch (error) {
            console.error('[analyze_session_data] failed', {
              durationMs: getDurationMs(startedAt),
              message: toErrorMessage(error),
            });
            if (isAbortError(error)) {
              throw new Error('Analyze Session Data aborted.');
            }
            throw new Error(
              `Analyze Session Data failed: ${toErrorMessage(error)}. Try a shorter video or run again.`,
            );
          }

          const sessionAnalysis = sessionAnalysisSchema.parse(object);
          const { blocks, spot_blocks: spotBlocks } =
            buildLegacyBlockDataFromSessionAnalysis(sessionAnalysis);

          console.log('[analyze_session_data] success', {
            durationMs: getDurationMs(startedAt),
            sectionCount: sessionAnalysis.sections.length,
            spotCandidateCount: sessionAnalysis.spots.length,
            blockCount: blocks.length,
            spotCount: spotBlocks.length,
            model: modelSummary,
          });

          ctx.runtime.latestSessionAnalysis = sessionAnalysis;
          ctx.runtime.latestBlocks = blocks;
          ctx.runtime.latestSpotBlocks = spotBlocks;
          ctx.runtime.spotCoordinatesResolved = false;
          ctx.runtime.latestHandbookImages = [];
          ctx.runtime.latestImageMode = null;
          ctx.runtime.latestVideoContext = {
            videoId: resolvedVideoId,
            videoUrl: resolvedVideoUrl,
            title: resolvedTitle,
            thumbnailUrl: resolvedThumbnailUrl,
            location: targetVideo.location,
            hashtags: resolvedHashtags,
          };
          await syncSessionTitleWithVideo(ctx.sessionId, ctx.userId, targetVideo);

          const buildResult = {
            videoId: resolvedVideoId,
            videoUrl: resolvedVideoUrl,
            title: resolvedTitle,
            thumbnailUrl: resolvedThumbnailUrl,
            guideTitle: resolvedTitle,
            coverImageUrl: resolvedThumbnailUrl,
            session_analysis: sessionAnalysis,
            analysisSummary: sessionAnalysis.summary,
            sectionCount: sessionAnalysis.sections.length,
            blockCount: blocks.length,
            blocks,
            spot_blocks: spotBlocks,
            spotCandidateCount: sessionAnalysis.spots.length,
            spotCount: spotBlocks.length,
          };
          console.log(
            '[analyze_session_data] output-json',
            JSON.stringify(buildResult, null, 2),
          );

          return buildResult;
        },
      ),
  });
}
