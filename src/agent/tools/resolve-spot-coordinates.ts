import { tool } from 'ai';
import { z } from 'zod';
import { runStructuredTask } from '@/lib/model-management';
import {
  applySpotLocationsToSessionAnalysis,
  buildLegacyBlockDataFromSessionAnalysis,
} from '@/lib/session-analysis';
import type { AgentToolContext } from '@/agent/context/types';
import { getDurationMs, isAbortError, toErrorMessage } from '@/agent/context/utils';
import { resolveSpotCoordinatesPrompt } from '@/agent/prompts/resolve-spot-coordinates';
import { spotQueryOutputSchema } from './types';
import {
  buildGeocodeQueryVariants,
  applySpotLocations,
  geocodeSpotByQuery,
  getSpotBlocks,
  getVideoThumbnailUrl,
  normalizeSessionTitle,
  validateSpotQueryOutput,
} from './shared';

function resolveVideoMeta(ctx: AgentToolContext): {
  videoId: string;
  videoUrl: string;
  title: string;
  thumbnailUrl: string | null;
} {
  const contextVideo = ctx.runtime.latestVideoContext;
  const fallbackVideo = ctx.runtime.latestApifyVideos[0] ?? null;

  const videoId =
    (typeof contextVideo?.videoId === 'string' && contextVideo.videoId.trim()
      ? contextVideo.videoId.trim()
      : null)
    ?? (typeof fallbackVideo?.id === 'string' && fallbackVideo.id.trim()
      ? fallbackVideo.id.trim()
      : null)
    ?? '';

  const videoUrl =
    (typeof contextVideo?.videoUrl === 'string' && contextVideo.videoUrl.trim()
      ? contextVideo.videoUrl.trim()
      : null)
    ?? (typeof fallbackVideo?.url === 'string' && fallbackVideo.url.trim()
      ? fallbackVideo.url.trim()
      : null)
    ?? '';

  const title =
    normalizeSessionTitle(contextVideo?.title)
    ?? normalizeSessionTitle(fallbackVideo?.title)
    ?? normalizeSessionTitle(fallbackVideo?.translatedTitle)
    ?? '';

  const thumbnailUrl =
    contextVideo?.thumbnailUrl
    ?? (fallbackVideo ? getVideoThumbnailUrl(fallbackVideo) : null)
    ?? null;

  return {
    videoId,
    videoUrl,
    title,
    thumbnailUrl,
  };
}

function getSourceSpots(ctx: AgentToolContext): Array<{
  block_id: string;
  title: string;
  description: string;
  location: { lat: number; lng: number } | null;
  smart_tags: string[];
}> {
  if (ctx.runtime.latestSessionAnalysis) {
    return ctx.runtime.latestSessionAnalysis.spots.map(spot => ({
      block_id: spot.spot_id,
      title: spot.name,
      description: spot.description,
      location: spot.location,
      smart_tags: spot.tags,
    }));
  }

  return ctx.runtime.latestSpotBlocks.length > 0
    ? ctx.runtime.latestSpotBlocks
    : getSpotBlocks(ctx.runtime.latestBlocks);
}

export function createResolveSpotCoordinatesTool(ctx: AgentToolContext) {
  return tool({
    description:
      'Resolve lat/lng for analyzed spots and return structured resolved_spots output for handbook and CSV workflows.',
    inputSchema: z.object({}),
    execute: async () =>
      ctx.runToolStep('resolve_spot_coordinates', {}, async () => {
        const startedAt = Date.now();
        const videoMeta = resolveVideoMeta(ctx);
        const sourceSpots = getSourceSpots(ctx);
        const initialDerivedBlocks = ctx.runtime.latestSessionAnalysis
          ? buildLegacyBlockDataFromSessionAnalysis(ctx.runtime.latestSessionAnalysis)
          : {
              blocks: ctx.runtime.latestBlocks,
              spot_blocks: sourceSpots,
            };
        if (ctx.runtime.spotCoordinatesResolved) {
          const resolvedSpots = sourceSpots.map(spot => ({
            block_id: spot.block_id,
            query: spot.description,
            location: spot.location,
          }));
          const cachedResult = {
            videoId: videoMeta.videoId,
            videoUrl: videoMeta.videoUrl,
            title: videoMeta.title,
            thumbnailUrl: videoMeta.thumbnailUrl,
            guideTitle: videoMeta.title,
            coverImageUrl: videoMeta.thumbnailUrl,
            session_analysis: ctx.runtime.latestSessionAnalysis,
            blockCount: initialDerivedBlocks.blocks.length,
            spotCount: sourceSpots.length,
            spot_queries: [],
            resolved_count: sourceSpots.filter(spot => spot.location !== null).length,
            unresolved_count: sourceSpots.filter(spot => spot.location === null).length,
            resolved_spots: resolvedSpots,
            spots_with_coordinates: resolvedSpots,
            blocks: initialDerivedBlocks.blocks,
            spot_blocks: initialDerivedBlocks.spot_blocks,
          };
          console.log('[resolve_spot_coordinates] skip-already-resolved', {
            durationMs: getDurationMs(startedAt),
            resolvedCount: cachedResult.resolved_count,
            unresolvedCount: cachedResult.unresolved_count,
          });
          console.log(
            '[resolve_spot_coordinates] output-json',
            JSON.stringify(cachedResult, null, 2),
          );
          return cachedResult;
        }

        if (!sourceSpots || sourceSpots.length === 0) {
          ctx.runtime.spotCoordinatesResolved = true;
          const emptyResult = {
            videoId: videoMeta.videoId,
            videoUrl: videoMeta.videoUrl,
            title: videoMeta.title,
            thumbnailUrl: videoMeta.thumbnailUrl,
            guideTitle: videoMeta.title,
            coverImageUrl: videoMeta.thumbnailUrl,
            session_analysis: ctx.runtime.latestSessionAnalysis,
            blockCount: initialDerivedBlocks.blocks.length,
            spotCount: 0,
            spot_queries: [],
            resolved_count: 0,
            unresolved_count: 0,
            resolved_spots: [],
            spots_with_coordinates: [],
            blocks: initialDerivedBlocks.blocks,
            spot_blocks: [],
          };
          console.log('[resolve_spot_coordinates] skip-no-spot-blocks', {
            durationMs: getDurationMs(startedAt),
          });
          console.log(
            '[resolve_spot_coordinates] output-json',
            JSON.stringify(emptyResult, null, 2),
          );
          return emptyResult;
        }

        console.log('[resolve_spot_coordinates] start', {
          sourceSpotCount: sourceSpots.length,
          sourceBlockIds: sourceSpots.map(spot => spot.block_id),
        });

        let object;
        let modelSummary: string | null = null;
        try {
          const result = await runStructuredTask({
            task: 'spot_query_normalization',
            schema: spotQueryOutputSchema,
            validateBusinessRules: output => validateSpotQueryOutput(sourceSpots, output),
            abortSignal: ctx.abortSignal,
            prompt: resolveSpotCoordinatesPrompt({
              videoContext: ctx.runtime.latestVideoContext,
              sourceSpots,
            }),
          });
          object = result.object;
          modelSummary = `${result.model.provider}:${result.model.modelId} (attempts=${result.attempts})`;
          console.log(
            '[resolve_spot_coordinates] generated-query-json',
            JSON.stringify(object, null, 2),
          );
        } catch (error) {
          console.error('[resolve_spot_coordinates] query-generation-failed', {
            durationMs: getDurationMs(startedAt),
            message: toErrorMessage(error),
          });
          if (isAbortError(error)) {
            throw new Error('resolve_spot_coordinates aborted.');
          }
          throw new Error(`resolve_spot_coordinates failed: ${toErrorMessage(error)}`);
        }

        const spotsWithCoordinates = await Promise.all(
          object.spot_queries.map(async item => {
            const queryVariants = buildGeocodeQueryVariants(item.query);
            const locationSuffix = ctx.runtime.latestVideoContext?.location?.trim() || null;
            let location: { lat: number; lng: number } | null = null;
            let matchedQuery: string | null = null;

            for (const variant of queryVariants) {
              console.log('[resolve_spot_coordinates] geocode-start', {
                block_id: item.block_id,
                query: variant,
                mode: 'primary',
              });

              location = await geocodeSpotByQuery(variant, ctx.abortSignal);
              if (location) {
                matchedQuery = variant;
                break;
              }

              if (!locationSuffix) continue;
              const fallbackQuery = variant.includes(locationSuffix)
                ? variant
                : `${variant}, ${locationSuffix}`;

              console.log('[resolve_spot_coordinates] geocode-start', {
                block_id: item.block_id,
                query: fallbackQuery,
                mode: 'location-fallback',
              });
              location = await geocodeSpotByQuery(fallbackQuery, ctx.abortSignal);
              if (location) {
                matchedQuery = fallbackQuery;
                break;
              }
            }

            console.log('[resolve_spot_coordinates] geocode-finish', {
              block_id: item.block_id,
              query: matchedQuery ?? item.query,
              location,
            });
            return {
              block_id: item.block_id,
              query: matchedQuery ?? item.query,
              location,
            };
          }),
        );
        console.log(
          '[resolve_spot_coordinates] geocode-result-json',
          JSON.stringify(spotsWithCoordinates, null, 2),
        );

        const resolved = spotsWithCoordinates.filter(item => item.location !== null);
        const unresolved = spotsWithCoordinates.length - resolved.length;
        if (ctx.runtime.latestSessionAnalysis) {
          ctx.runtime.latestSessionAnalysis = applySpotLocationsToSessionAnalysis(
            ctx.runtime.latestSessionAnalysis,
            spotsWithCoordinates.map(item => ({
              spot_id: item.block_id,
              location: item.location,
            })),
          );
        }
        const updatedDerivedBlocks = ctx.runtime.latestSessionAnalysis
          ? buildLegacyBlockDataFromSessionAnalysis(ctx.runtime.latestSessionAnalysis)
          : {
              blocks: applySpotLocations(
                ctx.runtime.latestBlocks,
                spotsWithCoordinates.map(item => ({
                  block_id: item.block_id,
                  location: item.location,
                })),
              ),
              spot_blocks: [] as typeof ctx.runtime.latestSpotBlocks,
            };

        ctx.runtime.latestBlocks = updatedDerivedBlocks.blocks;
        ctx.runtime.latestSpotBlocks = ctx.runtime.latestSessionAnalysis
          ? updatedDerivedBlocks.spot_blocks
          : getSpotBlocks(updatedDerivedBlocks.blocks);
        ctx.runtime.spotCoordinatesResolved = true;

        console.log('[resolve_spot_coordinates] success', {
          durationMs: getDurationMs(startedAt),
          resolvedCount: resolved.length,
          unresolvedCount: unresolved,
          model: modelSummary,
        });

        const resolveResult = {
          videoId: videoMeta.videoId,
          videoUrl: videoMeta.videoUrl,
          title: videoMeta.title,
          thumbnailUrl: videoMeta.thumbnailUrl,
          guideTitle: videoMeta.title,
          coverImageUrl: videoMeta.thumbnailUrl,
          session_analysis: ctx.runtime.latestSessionAnalysis,
          blockCount: ctx.runtime.latestBlocks.length,
          spotCount: ctx.runtime.latestSpotBlocks.length,
          spot_queries: object.spot_queries,
          resolved_count: resolved.length,
          unresolved_count: unresolved,
          resolved_spots: spotsWithCoordinates,
          spots_with_coordinates: spotsWithCoordinates,
          blocks: ctx.runtime.latestBlocks,
          spot_blocks: ctx.runtime.latestSpotBlocks,
        };
        console.log(
          '[resolve_spot_coordinates] output-json',
          JSON.stringify(resolveResult, null, 2),
        );

        return resolveResult;
      }),
  });
}
