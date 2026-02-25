import {
  getSessionStateSnapshot,
  type SessionStateSnapshot,
  upsertSessionState,
} from '@/server/sessions';
import {
  getHandbookStyleLabel,
  normalizeHandbookStyle,
  type HandbookStyleId,
} from '@/lib/handbook-style';
import { isRecord } from '@/agent/context/utils';
import type { AgentRuntimeState } from '@/agent/context/types';
import {
  handbookImageAssetSchema,
  type ApifyVideoResult,
  type HandbookImageAsset,
  type VideoContext,
  spotBlockSchema,
  travelBlockSchema,
} from '@/agent/tools/types';
import { getSpotBlocks, normalizeThumbnailUrl } from '@/agent/tools/shared';

function normalizeVideoContext(value: unknown): VideoContext | null {
  if (!isRecord(value)) return null;
  if (typeof value.videoId !== 'string') return null;
  if (typeof value.videoUrl !== 'string') return null;
  if (typeof value.title !== 'string') return null;

  return {
    videoId: value.videoId,
    videoUrl: value.videoUrl,
    title: value.title,
    thumbnailUrl: normalizeThumbnailUrl(value.thumbnailUrl),
    location: typeof value.location === 'string' ? value.location : null,
    hashtags: Array.isArray(value.hashtags)
      ? value.hashtags.filter((tag): tag is string => typeof tag === 'string')
      : [],
  };
}

function normalizeApifyVideos(value: unknown): ApifyVideoResult[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (item): item is ApifyVideoResult =>
        isRecord(item) &&
        typeof item.id === 'string' &&
        typeof item.url === 'string' &&
        typeof item.title === 'string',
    );
}

export function parsePersistedTravelBlocks(value: unknown) {
  const parsed = travelBlockSchema.array().safeParse(value);
  return parsed.success ? parsed.data : [];
}

export function parsePersistedSpotBlocks(value: unknown) {
  const parsed = spotBlockSchema.array().safeParse(value);
  return parsed.success ? parsed.data : [];
}

export function parsePersistedToolOutputs(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

export function extractPersistedHandbookImages(value: unknown): HandbookImageAsset[] {
  if (!isRecord(value) || !Array.isArray(value.images)) return [];
  const parsed = handbookImageAssetSchema.array().safeParse(value.images);
  return parsed.success ? parsed.data : [];
}

export function parsePersistedContext(value: unknown): {
  videoContext: VideoContext | null;
  apifyVideos: ApifyVideoResult[];
  handbookStyle: HandbookStyleId | null;
} {
  if (!isRecord(value)) {
    return {
      videoContext: null,
      apifyVideos: [],
      handbookStyle: null,
    };
  }

  const videoFromNested = normalizeVideoContext(value.video);
  const videoFromRoot = normalizeVideoContext(value);
  const apifyVideos = normalizeApifyVideos(value.apifyVideos ?? value.apify_videos);
  const handbookStyleFromRoot = normalizeHandbookStyle(value.handbookStyle);
  const handbookStyleFromVideo = isRecord(value.video)
    ? normalizeHandbookStyle(value.video.handbookStyle)
    : null;

  return {
    videoContext: videoFromNested ?? videoFromRoot,
    apifyVideos,
    handbookStyle: handbookStyleFromRoot ?? handbookStyleFromVideo,
  };
}

export function buildPersistedContext(
  videoContext: VideoContext | null,
  apifyVideos: ApifyVideoResult[],
  handbookStyle: HandbookStyleId | null,
): Record<string, unknown> | null {
  if (!videoContext && apifyVideos.length === 0 && !handbookStyle) return null;

  return {
    video: videoContext,
    apifyVideos,
    handbookStyle,
  };
}

export async function hydrateRuntimeState(
  sessionId: string,
  userId: string,
  runtime: AgentRuntimeState,
): Promise<SessionStateSnapshot | null> {
  const persistedState = await getSessionStateSnapshot(sessionId, userId);
  if (!persistedState) return null;

  runtime.latestBlocks = parsePersistedTravelBlocks(persistedState.blocks);
  runtime.latestSpotBlocks = parsePersistedSpotBlocks(persistedState.spotBlocks);
  if (runtime.latestSpotBlocks.length === 0 && runtime.latestBlocks.length > 0) {
    runtime.latestSpotBlocks = getSpotBlocks(runtime.latestBlocks);
  }
  runtime.spotCoordinatesResolved =
    runtime.latestSpotBlocks.length === 0
      ? true
      : runtime.latestSpotBlocks.every(spot => spot.location !== null);

  Object.assign(runtime.latestToolOutputs, parsePersistedToolOutputs(persistedState.toolOutputs));
  const persistedSearchImages = extractPersistedHandbookImages(
    runtime.latestToolOutputs.search_image,
  );
  const persistedGeneratedImages = extractPersistedHandbookImages(
    runtime.latestToolOutputs.generate_image,
  );
  const handbookOutput = isRecord(runtime.latestToolOutputs.generate_handbook_html)
    ? runtime.latestToolOutputs.generate_handbook_html
    : null;
  const preferredImageMode =
    handbookOutput && typeof handbookOutput.image_mode === 'string'
      ? handbookOutput.image_mode
      : null;

  if (preferredImageMode === 'generate_image' && persistedGeneratedImages.length > 0) {
    runtime.latestImageMode = 'generate_image';
    runtime.latestHandbookImages = persistedGeneratedImages;
  } else if (preferredImageMode === 'search_image' && persistedSearchImages.length > 0) {
    runtime.latestImageMode = 'search_image';
    runtime.latestHandbookImages = persistedSearchImages;
  } else if (persistedGeneratedImages.length > 0) {
    runtime.latestImageMode = 'generate_image';
    runtime.latestHandbookImages = persistedGeneratedImages;
  } else if (persistedSearchImages.length > 0) {
    runtime.latestImageMode = 'search_image';
    runtime.latestHandbookImages = persistedSearchImages;
  }

  if (typeof persistedState.handbookHtml === 'string' && persistedState.handbookHtml) {
    runtime.latestHandbookHtml = persistedState.handbookHtml;
  }

  const parsedContext = parsePersistedContext(persistedState.context);
  runtime.latestVideoContext = parsedContext.videoContext;
  runtime.latestApifyVideos = parsedContext.apifyVideos;
  runtime.latestHandbookStyle = parsedContext.handbookStyle;

  for (const video of runtime.latestApifyVideos) {
    runtime.videoCache.set(video.id, video);
    runtime.videoCache.set(video.url, video);
  }

  return persistedState;
}

export async function persistSessionSnapshot(
  sessionId: string,
  userId: string,
  runtime: AgentRuntimeState,
  options: {
    incrementHandbookVersion?: boolean;
    forceHandbookHtml?: string | null;
  } = {},
): Promise<void> {
  const handbookHtml =
    options.forceHandbookHtml !== undefined
      ? options.forceHandbookHtml
      : runtime.latestHandbookHtml ?? undefined;

  await upsertSessionState(sessionId, userId, {
    context: buildPersistedContext(
      runtime.latestVideoContext,
      runtime.latestApifyVideos,
      runtime.latestHandbookStyle,
    ),
    blocks: runtime.latestBlocks,
    spotBlocks: runtime.latestSpotBlocks,
    toolOutputs: runtime.latestToolOutputs,
    handbookHtml,
    incrementHandbookVersion: options.incrementHandbookVersion ?? false,
    previewPath: runtime.latestHandbookHtml ? `/api/guide/${sessionId}` : undefined,
  });
}

export { getHandbookStyleLabel };
