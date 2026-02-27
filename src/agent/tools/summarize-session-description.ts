import { tool } from 'ai';
import { z } from 'zod';
import { runTextTask } from '@/lib/model-management';
import { buildSessionDescriptionSummaryPrompt } from '@/agent/prompts/session-description-summary';
import type { AgentToolContext } from '@/agent/context/types';
import { toErrorMessage } from '@/agent/context/utils';
import { updateSessionPartial } from '@/server/sessions';
import type { ApifyVideoResult } from './types';
import { getBestDescription, getSubtitlePlaintext, getUniqueCachedVideos } from './shared';

const DEFAULT_SOURCE_MAX_CHARS = 12_000;
const DEFAULT_DESCRIPTION_MAX_CHARS = 170;

function getPositiveIntEnv(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, Math.max(0, maxChars - 3))}...`;
}

function compactWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function stripUrlsAndTimestamps(value: string): string {
  return value
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeSummaryCandidate(value: string, maxChars: number): string | null {
  const cleaned = stripUrlsAndTimestamps(
    value
      .replace(/^```[a-zA-Z]*\s*/g, '')
      .replace(/```$/g, '')
      .replace(/^[\s\-*>\d.]+/, '')
      .replace(/^["'\u201C\u201D]+|["'\u201C\u201D]+$/g, ''),
  );
  const normalized = compactWhitespace(cleaned);
  if (!normalized) return null;
  return truncate(normalized, maxChars);
}

function buildFallbackDescription(video: ApifyVideoResult, maxChars: number): string {
  const location = compactWhitespace(video.location ?? '');
  const title = compactWhitespace(video.title);
  const fallback = location
    ? `${location} travel guide covering key neighborhoods, local food highlights, and practical itinerary tips from this video.`
    : `${title} travel guide summary with key stops, local food highlights, and practical itinerary tips.`;
  return truncate(fallback, maxChars);
}

function buildVideoSourceText(video: ApifyVideoResult): string {
  const chunks = [
    getBestDescription(video),
    getSubtitlePlaintext(video),
  ]
    .map(chunk => chunk.trim())
    .filter(Boolean);
  return chunks.join('\n\n');
}

function resolveTargetVideo(
  ctx: AgentToolContext,
  requestedVideoId?: string,
): ApifyVideoResult | null {
  if (requestedVideoId) {
    const cached = ctx.runtime.videoCache.get(requestedVideoId);
    if (cached) return cached;
  }

  if (ctx.runtime.latestApifyVideos.length > 0) {
    return ctx.runtime.latestApifyVideos[0] ?? null;
  }

  const uniqueVideos = getUniqueCachedVideos(ctx.runtime.videoCache);
  if (uniqueVideos.length === 0) return null;
  return uniqueVideos[0] ?? null;
}

export function createSummarizeSessionDescriptionTool(ctx: AgentToolContext) {
  return tool({
    description:
      'Optionally summarize crawled YouTube text into a concise session description and persist it.',
    inputSchema: z.object({
      videoId: z
        .string()
        .optional()
        .describe(
          'Optional video id or video url from crawl_youtube_videos result. Omit when only one crawled video exists.',
        ),
    }),
    execute: async ({ videoId }) => {
      const sourceMaxChars = getPositiveIntEnv(
        process.env.SESSION_DESCRIPTION_SOURCE_MAX_CHARS,
        DEFAULT_SOURCE_MAX_CHARS,
      );
      const descriptionMaxChars = getPositiveIntEnv(
        process.env.SESSION_DESCRIPTION_MAX_CHARS,
        DEFAULT_DESCRIPTION_MAX_CHARS,
      );
      const targetVideo = resolveTargetVideo(ctx, videoId);

      if (!targetVideo) {
        const output = {
          status: 'skipped' as const,
          reason: 'No crawled video available. Run crawl_youtube_videos first.',
          description: null,
          videoId: null,
          persisted: false,
        };
        ctx.runtime.latestToolOutputs.summarize_description = output;
        return output;
      }

      const previousOutput = ctx.runtime.latestToolOutputs.summarize_description;
      const previousVideoId =
        isRecord(previousOutput) && typeof previousOutput.videoId === 'string'
          ? previousOutput.videoId
          : null;
      const previousDescription =
        isRecord(previousOutput) && typeof previousOutput.description === 'string'
          ? previousOutput.description
          : null;
      if (
        previousVideoId === targetVideo.id &&
        previousDescription &&
        previousDescription.trim()
      ) {
        const output = {
          status: 'skipped' as const,
          reason: 'Description is already summarized for this video in current runtime.',
          description: previousDescription.trim(),
          videoId: targetVideo.id,
          persisted: false,
        };
        ctx.runtime.latestToolOutputs.summarize_description = output;
        return output;
      }

      const sourceText = truncate(buildVideoSourceText(targetVideo), sourceMaxChars);
      let description = buildFallbackDescription(targetVideo, descriptionMaxChars);
      let modelSummary: string | null = null;

      if (sourceText.trim()) {
        try {
          const result = await runTextTask({
            task: 'session_description_summary',
            abortSignal: ctx.abortSignal,
            prompt: buildSessionDescriptionSummaryPrompt({
              videoTitle: targetVideo.title,
              videoUrl: targetVideo.url,
              location: targetVideo.location,
              hashtags: targetVideo.hashtags ?? [],
              sourceText,
              maxChars: descriptionMaxChars,
            }),
          });
          modelSummary = `${result.model.provider}:${result.model.modelId} (attempts=${result.attempts})`;
          const normalized = normalizeSummaryCandidate(result.text, descriptionMaxChars);
          if (normalized) {
            description = normalized;
          }
        } catch (error) {
          console.warn('[summarize_description] model-fallback', {
            message: toErrorMessage(error),
            videoId: targetVideo.id,
          });
        }
      }

      let persisted = false;
      if (ctx.sessionId && ctx.userId) {
        try {
          const updated = await updateSessionPartial(ctx.sessionId, ctx.userId, {
            description,
          });
          persisted = Boolean(updated);
        } catch (error) {
          console.warn('[summarize_description] persist-failed', {
            sessionId: ctx.sessionId,
            message: toErrorMessage(error),
          });
        }
      }

      const output = {
        status: 'updated' as const,
        videoId: targetVideo.id,
        videoUrl: targetVideo.url,
        description,
        persisted,
        model: modelSummary,
      };
      ctx.runtime.latestToolOutputs.summarize_description = output;
      console.log('[summarize_description] output-json', JSON.stringify(output, null, 2));
      return output;
    },
  });
}
