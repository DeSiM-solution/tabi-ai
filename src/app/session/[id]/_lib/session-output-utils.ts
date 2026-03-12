import { isRecord, type UnknownRecord } from './chat-utils';
import {
  extractContextHandbookImages,
  mergeImagesIntoOutputIfMissing,
} from './handbook-image-utils';

function readNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function pickPreferredString(...values: unknown[]): string {
  for (const value of values) {
    const next = readNonEmptyString(value);
    if (next) return next;
  }
  return '';
}

export function extractSessionTitleFromToolOutput(
  toolName: string,
  output: unknown,
): string | null {
  if (!isRecord(output)) return null;

  const readDirectTitle = (): string | null =>
    readNonEmptyString(output.title)
    ?? readNonEmptyString(output.guideTitle)
    ?? readNonEmptyString(output.guide_title);

  if (
    toolName === 'build_travel_blocks'
    || toolName === 'resolve_spot_coordinates'
    || toolName === 'generate_handbook_html'
  ) {
    return readDirectTitle();
  }

  if (toolName !== 'crawl_youtube_videos') return null;

  const directTitle = readDirectTitle();
  if (directTitle) return directTitle;

  const rawVideos = Array.isArray(output.videos) ? output.videos : [];
  for (const rawVideo of rawVideos) {
    if (!isRecord(rawVideo)) continue;
    const title =
      readNonEmptyString(rawVideo.title)
      ?? readNonEmptyString(rawVideo.translatedTitle)
      ?? null;
    if (title) return title;
  }

  return null;
}

export function toPersistedBlocksOutput(
  state: {
    context?: unknown;
    blocks?: unknown;
    spotBlocks?: unknown;
    toolOutputs?: unknown;
  } | null | undefined,
): { sourceKey: string; toolName: string; output: UnknownRecord } | null {
  if (!state) return null;
  const persistedToolOutputs = isRecord(state.toolOutputs)
    ? (state.toolOutputs as Record<string, unknown>)
    : null;
  const contextRoot = isRecord(state.context) ? state.context : {};
  const contextVideo = isRecord(contextRoot.video) ? contextRoot.video : contextRoot;
  const contextImages = extractContextHandbookImages(state.context);
  const withContextVideoMeta = (output: UnknownRecord): UnknownRecord =>
    mergeImagesIntoOutputIfMissing(
      {
        ...output,
        title: pickPreferredString(
          output.title,
          output.guideTitle,
          output.guide_title,
          contextVideo.title,
        ),
        videoId: pickPreferredString(output.videoId, output.video_id, contextVideo.videoId),
        videoUrl: pickPreferredString(output.videoUrl, output.video_url, contextVideo.videoUrl),
        thumbnailUrl: pickPreferredString(
          output.thumbnailUrl,
          output.coverImageUrl,
          output.cover_image_url,
          contextVideo.thumbnailUrl,
        ),
      },
      contextImages,
    );

  const preferredResolveOutput = persistedToolOutputs?.resolve_spot_coordinates;
  if (
    isRecord(preferredResolveOutput)
    && Array.isArray(preferredResolveOutput.blocks)
    && preferredResolveOutput.blocks.length > 0
  ) {
    return {
      sourceKey: 'persisted:resolve_spot_coordinates',
      toolName: 'resolve_spot_coordinates',
      output: withContextVideoMeta(preferredResolveOutput),
    };
  }

  const preferredBuildOutput = persistedToolOutputs?.build_travel_blocks;
  if (
    isRecord(preferredBuildOutput)
    && Array.isArray(preferredBuildOutput.blocks)
    && preferredBuildOutput.blocks.length > 0
  ) {
    return {
      sourceKey: 'persisted:build_travel_blocks',
      toolName: 'build_travel_blocks',
      output: withContextVideoMeta(preferredBuildOutput),
    };
  }

  if (!Array.isArray(state.blocks)) return null;
  if (state.blocks.length === 0) return null;

  const fallbackSpotBlocks = Array.isArray(state.spotBlocks)
    ? state.spotBlocks
    : state.blocks.filter(
        block => isRecord(block) && typeof block.type === 'string' && block.type === 'spot',
      );

  return {
    sourceKey: 'persisted:resolve_spot_coordinates',
    toolName: 'resolve_spot_coordinates',
    output: mergeImagesIntoOutputIfMissing(
      {
        title: pickPreferredString(contextVideo.title),
        videoId: pickPreferredString(contextVideo.videoId),
        videoUrl: pickPreferredString(contextVideo.videoUrl),
        thumbnailUrl: pickPreferredString(contextVideo.thumbnailUrl),
        blockCount: state.blocks.length,
        spotCount: fallbackSpotBlocks.length,
        blocks: state.blocks,
        spot_blocks: fallbackSpotBlocks,
      },
      contextImages,
    ),
  };
}
