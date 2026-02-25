import { tool } from 'ai';
import { z } from 'zod';
import { runStructuredTask } from '@/lib/model-management';
import type { AgentToolContext } from '@/agent/context/types';
import { getDurationMs, isAbortError, toErrorMessage } from '@/agent/context/utils';
import { resolveSpotCoordinatesPrompt } from '@/agent/prompts/resolve-spot-coordinates';
import { spotQueryOutputSchema } from './types';
import {
  applySpotLocations,
  geocodeSpotByQuery,
  getSpotBlocks,
  validateSpotQueryOutput,
} from './shared';

export function createResolveSpotCoordinatesTool(ctx: AgentToolContext) {
  return tool({
    description:
      'Find lat/lng for spot_blocks and return updated blocks with resolved coordinates.',
    inputSchema: z.object({}),
    execute: async () =>
      ctx.runToolStep('resolve_spot_coordinates', {}, async () => {
        const startedAt = Date.now();
        if (ctx.runtime.spotCoordinatesResolved) {
          const spotBlocks =
            ctx.runtime.latestSpotBlocks.length > 0
              ? ctx.runtime.latestSpotBlocks
              : getSpotBlocks(ctx.runtime.latestBlocks);
          const cachedResult = {
            videoId: ctx.runtime.latestVideoContext?.videoId ?? '',
            videoUrl: ctx.runtime.latestVideoContext?.videoUrl ?? '',
            title: ctx.runtime.latestVideoContext?.title ?? '',
            thumbnailUrl: ctx.runtime.latestVideoContext?.thumbnailUrl ?? null,
            blockCount: ctx.runtime.latestBlocks.length,
            spotCount: spotBlocks.length,
            spot_queries: [],
            resolved_count: spotBlocks.filter(spot => spot.location !== null).length,
            unresolved_count: spotBlocks.filter(spot => spot.location === null).length,
            spots_with_coordinates: spotBlocks.map(spot => ({
              block_id: spot.block_id,
              query: spot.description,
              location: spot.location,
            })),
            blocks: ctx.runtime.latestBlocks,
            spot_blocks: spotBlocks,
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

        const sourceSpots = ctx.runtime.latestSpotBlocks;
        if (!sourceSpots || sourceSpots.length === 0) {
          ctx.runtime.spotCoordinatesResolved = true;
          const emptyResult = {
            videoId: ctx.runtime.latestVideoContext?.videoId ?? '',
            videoUrl: ctx.runtime.latestVideoContext?.videoUrl ?? '',
            title: ctx.runtime.latestVideoContext?.title ?? '',
            thumbnailUrl: ctx.runtime.latestVideoContext?.thumbnailUrl ?? null,
            blockCount: ctx.runtime.latestBlocks.length,
            spotCount: 0,
            spot_queries: [],
            resolved_count: 0,
            unresolved_count: 0,
            spots_with_coordinates: [],
            blocks: ctx.runtime.latestBlocks,
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
            abortSignal: ctx.req.signal,
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
            console.log('[resolve_spot_coordinates] geocode-start', {
              block_id: item.block_id,
              query: item.query,
            });
            let location = await geocodeSpotByQuery(item.query, ctx.req.signal);
            if (!location && ctx.runtime.latestVideoContext?.location) {
              const fallbackQuery = `${item.query}, ${ctx.runtime.latestVideoContext.location}`;
              console.log('[resolve_spot_coordinates] geocode-fallback-start', {
                block_id: item.block_id,
                query: fallbackQuery,
              });
              location = await geocodeSpotByQuery(fallbackQuery, ctx.req.signal);
              console.log('[resolve_spot_coordinates] geocode-fallback-finish', {
                block_id: item.block_id,
                query: fallbackQuery,
                location,
              });
            }
            console.log('[resolve_spot_coordinates] geocode-finish', {
              block_id: item.block_id,
              query: item.query,
              location,
            });
            return {
              block_id: item.block_id,
              query: item.query,
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
        const updatedBlocks = applySpotLocations(
          ctx.runtime.latestBlocks,
          spotsWithCoordinates.map(item => ({
            block_id: item.block_id,
            location: item.location,
          })),
        );

        ctx.runtime.latestBlocks = updatedBlocks;
        ctx.runtime.latestSpotBlocks = getSpotBlocks(updatedBlocks);
        ctx.runtime.spotCoordinatesResolved = true;

        console.log('[resolve_spot_coordinates] success', {
          durationMs: getDurationMs(startedAt),
          resolvedCount: resolved.length,
          unresolvedCount: unresolved,
          model: modelSummary,
        });

        const resolveResult = {
          videoId: ctx.runtime.latestVideoContext?.videoId ?? '',
          videoUrl: ctx.runtime.latestVideoContext?.videoUrl ?? '',
          title: ctx.runtime.latestVideoContext?.title ?? '',
          thumbnailUrl: ctx.runtime.latestVideoContext?.thumbnailUrl ?? null,
          blockCount: updatedBlocks.length,
          spotCount: ctx.runtime.latestSpotBlocks.length,
          spot_queries: object.spot_queries,
          resolved_count: resolved.length,
          unresolved_count: unresolved,
          spots_with_coordinates: spotsWithCoordinates,
          blocks: updatedBlocks,
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
