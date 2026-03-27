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
import {
  buildLegacyBlockDataFromSessionAnalysis,
  parseSessionAnalysis,
  type SessionAnalysis,
} from '@/lib/session-analysis';
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

function parsePersistedHandbookImages(value: unknown): HandbookImageAsset[] {
  if (!Array.isArray(value)) return [];
  const parsed = handbookImageAssetSchema.array().safeParse(value);
  return parsed.success ? parsed.data : [];
}

export function parsePersistedContext(value: unknown): {
  videoContext: VideoContext | null;
  apifyVideos: ApifyVideoResult[];
  sessionAnalysis: SessionAnalysis | null;
  handbookStyle: HandbookStyleId | null;
  handbookImages: HandbookImageAsset[];
  conversationSummary: string | null;
} {
  if (!isRecord(value)) {
    return {
      videoContext: null,
      apifyVideos: [],
      sessionAnalysis: null,
      handbookStyle: null,
      handbookImages: [],
      conversationSummary: null,
    };
  }

  const videoFromNested = normalizeVideoContext(value.video);
  const videoFromRoot = normalizeVideoContext(value);
  const apifyVideos = normalizeApifyVideos(value.apifyVideos ?? value.apify_videos);
  const sessionAnalysis = parseSessionAnalysis(
    value.sessionAnalysis ?? value.session_analysis,
  );
  const handbookStyleFromRoot = normalizeHandbookStyle(value.handbookStyle);
  const handbookStyleFromVideo = isRecord(value.video)
    ? normalizeHandbookStyle(value.video.handbookStyle)
    : null;
  const handbookImages = parsePersistedHandbookImages(
    value.handbookImages ?? value.handbook_images,
  );
  const conversationSummary =
    typeof value.conversationSummary === 'string'
      ? value.conversationSummary
      : typeof value.conversation_summary === 'string'
        ? value.conversation_summary
        : null;
  const normalizedConversationSummary =
    conversationSummary && conversationSummary.trim()
      ? conversationSummary.trim().slice(0, 12_000)
      : null;

  return {
    videoContext: videoFromNested ?? videoFromRoot,
    apifyVideos,
    sessionAnalysis,
    handbookStyle: handbookStyleFromRoot ?? handbookStyleFromVideo,
    handbookImages,
    conversationSummary: normalizedConversationSummary,
  };
}

export function buildPersistedContext(
  videoContext: VideoContext | null,
  apifyVideos: ApifyVideoResult[],
  sessionAnalysis: SessionAnalysis | null,
  handbookStyle: HandbookStyleId | null,
  handbookImages: HandbookImageAsset[],
  conversationSummary: string | null,
): Record<string, unknown> | null {
  const normalizedConversationSummary =
    conversationSummary && conversationSummary.trim()
      ? conversationSummary.trim().slice(0, 12_000)
      : null;
  if (
    !videoContext &&
    apifyVideos.length === 0 &&
    !sessionAnalysis &&
    !handbookStyle &&
    handbookImages.length === 0 &&
    !normalizedConversationSummary
  ) {
    return null;
  }

  return {
    video: videoContext,
    apifyVideos,
    sessionAnalysis,
    handbookStyle,
    handbookImages,
    conversationSummary: normalizedConversationSummary,
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
  const parsedContext = parsePersistedContext(persistedState.context);
  runtime.latestVideoContext = parsedContext.videoContext;
  runtime.latestApifyVideos = parsedContext.apifyVideos;
  runtime.latestSessionAnalysis = parsedContext.sessionAnalysis;
  runtime.latestHandbookStyle = parsedContext.handbookStyle;
  runtime.latestConversationSummary = parsedContext.conversationSummary;

  if (runtime.latestBlocks.length === 0 && runtime.latestSessionAnalysis) {
    runtime.latestBlocks = buildLegacyBlockDataFromSessionAnalysis(
      runtime.latestSessionAnalysis,
    ).blocks;
  }
  if (runtime.latestSpotBlocks.length === 0) {
    if (runtime.latestSessionAnalysis) {
      runtime.latestSpotBlocks = buildLegacyBlockDataFromSessionAnalysis(
        runtime.latestSessionAnalysis,
      ).spot_blocks;
    } else if (runtime.latestBlocks.length > 0) {
      runtime.latestSpotBlocks = getSpotBlocks(runtime.latestBlocks);
    }
  }
  runtime.spotCoordinatesResolved =
    runtime.latestSessionAnalysis
      ? runtime.latestSessionAnalysis.spots.every(spot => spot.location !== null)
      : runtime.latestSpotBlocks.length === 0
        ? true
        : runtime.latestSpotBlocks.every(spot => spot.location !== null);

  Object.assign(runtime.latestToolOutputs, parsePersistedToolOutputs(persistedState.toolOutputs));
  const persistedSearchImages = extractPersistedHandbookImages(
    runtime.latestToolOutputs.search_image,
  );
  const persistedGeneratedImages = extractPersistedHandbookImages(
    runtime.latestToolOutputs.generate_image,
  );
  const persistedContextImages = parsedContext.handbookImages;
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
  } else if (persistedContextImages.length > 0) {
    runtime.latestHandbookImages = persistedContextImages;
    if (preferredImageMode === 'search_image' || preferredImageMode === 'generate_image') {
      runtime.latestImageMode = preferredImageMode;
    } else {
      runtime.latestImageMode = persistedContextImages.some(image => image.source === 'imagen')
        ? 'generate_image'
        : 'search_image';
    }
  }

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
): Promise<void> {
  await upsertSessionState(sessionId, userId, {
    context: buildPersistedContext(
      runtime.latestVideoContext,
      runtime.latestApifyVideos,
      runtime.latestSessionAnalysis,
      runtime.latestHandbookStyle,
      runtime.latestHandbookImages,
      runtime.latestConversationSummary,
    ),
    blocks: runtime.latestBlocks,
    spotBlocks: runtime.latestSpotBlocks,
    toolOutputs: runtime.latestToolOutputs,
  });
}

export { getHandbookStyleLabel };
