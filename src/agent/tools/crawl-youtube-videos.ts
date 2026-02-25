import { tool } from 'ai';
import { z } from 'zod';
import type { AgentToolContext } from '@/agent/context/types';
import { getDurationMs } from '@/agent/context/utils';
import { YOUTUBE_CONFIG } from './types';
import {
  extractYoutubeUrls,
  fetchYoutubeVideoData,
  getBestDescription,
  getSubtitlePlaintext,
  getVideoThumbnailUrl,
  pickPrimaryVideoFromCrawl,
  syncSessionTitleWithVideo,
} from './shared';

export function createCrawlYoutubeVideosTool(ctx: AgentToolContext) {
  return tool({
    description:
      'Fetch YouTube video metadata and subtitle plaintext with Apify for one or more video URLs.',
    inputSchema: z.object({
      videoUrls: z
        .array(z.string().url())
        .optional()
        .describe('YouTube video URLs to crawl'),
      userText: z
        .string()
        .optional()
        .describe('Optional raw user text that may include YouTube URLs'),
    }),
    execute: async ({ videoUrls, userText }) =>
      ctx.runToolStep(
        'crawl_youtube_videos',
        { videoUrls: videoUrls ?? [], userText: userText ?? '' },
        async () => {
          const startedAt = Date.now();
          const extractedUrls = userText ? extractYoutubeUrls(userText) : [];
          const mergedVideoUrls = [...new Set([...(videoUrls ?? []), ...extractedUrls])];
          console.log('[crawl_youtube_videos] start', {
            providedUrlCount: videoUrls?.length ?? 0,
            extractedUrlCount: extractedUrls.length,
            mergedUrlCount: mergedVideoUrls.length,
            mergedUrls: mergedVideoUrls,
          });

          if (mergedVideoUrls.length === 0) {
            throw new Error(
              'No valid YouTube video URL found. Please provide at least one YouTube link.',
            );
          }

          const videos = await fetchYoutubeVideoData(mergedVideoUrls, ctx.abortSignal);
          ctx.runtime.latestApifyVideos = videos;

          for (const video of videos) {
            ctx.runtime.videoCache.set(video.id, video);
            ctx.runtime.videoCache.set(video.url, video);
          }

          const primaryVideo = pickPrimaryVideoFromCrawl(videos, mergedVideoUrls);
          if (primaryVideo) {
            ctx.runtime.latestVideoContext = {
              videoId: primaryVideo.id,
              videoUrl: primaryVideo.url,
              title: primaryVideo.title,
              thumbnailUrl: getVideoThumbnailUrl(primaryVideo),
              location: primaryVideo.location,
              hashtags: primaryVideo.hashtags ?? [],
            };
          }
          await syncSessionTitleWithVideo(ctx.sessionId, ctx.userId, primaryVideo);

          const crawlResult = {
            actorId: YOUTUBE_CONFIG.APIFY.ACTOR_ID,
            requestedUrls: mergedVideoUrls,
            count: videos.length,
            videos: videos.map(video => ({
              id: video.id,
              url: video.url,
              title: video.title,
              translatedTitle: video.translatedTitle,
              type: video.type,
              date: video.date,
              duration: video.duration,
              location: video.location,
              thumbnailUrl: getVideoThumbnailUrl(video),
              channelName: video.channelName || video.channel?.name || null,
              viewCount: video.viewCount,
              likes: video.likes,
              hashtags: video.hashtags ?? [],
              description: getBestDescription(video),
              subtitlePreview: getSubtitlePlaintext(video).slice(0, 800),
            })),
          };

          console.log('[crawl_youtube_videos] success', {
            durationMs: getDurationMs(startedAt),
            count: crawlResult.count,
            videoIds: crawlResult.videos.map(video => video.id),
          });
          console.log(
            '[crawl_youtube_videos] output-json',
            JSON.stringify(crawlResult, null, 2),
          );

          return crawlResult;
        },
      ),
  });
}
