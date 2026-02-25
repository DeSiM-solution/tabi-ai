import { generateImage } from 'ai';
import { google } from '@ai-sdk/google';
import { nanoid } from 'nanoid';
import { updateSessionPartial } from '@/server/sessions';
import { getDurationMs, toErrorMessage, withTimeoutSignal } from '@/agent/context/utils';
import {
  ApifyVideoResult,
  HandbookImagePlan,
  MAX_HANDBOOK_IMAGES,
  SpotBlock,
  SpotQueryOutput,
  TravelBlock,
  TravelBlocksOutput,
  YOUTUBE_CONFIG,
  YOUTUBE_URL_REGEX,
} from '@/agent/tools/types';

export function extractYoutubeUrls(input: string): string[] {
  const matched = input.match(YOUTUBE_URL_REGEX) ?? [];
  return [...new Set(matched.map(url => url.trim()))];
}

export function normalizeOriginVideoUrl(videoUrl: string | null | undefined): string | null {
  if (typeof videoUrl !== 'string' || !videoUrl.trim()) return null;
  try {
    const parsed = new URL(videoUrl.trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export function normalizeThumbnailUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return normalizeOriginVideoUrl(value);
}

export function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function stripVideoEmbeds(html: string): string {
  return html
    .replace(/<video[\s\S]*?<\/video>/gi, '')
    .replace(
      /<iframe[^>]*src=["'][^"']*(?:youtube\.com|youtu\.be|youtube-nocookie\.com)[^"']*["'][\s\S]*?<\/iframe>/gi,
      '',
    );
}

export function ensureVideoThumbnailHeader(
  html: string,
  options: { thumbnailUrl: string | null | undefined; title: string | null | undefined },
): string {
  const normalizedThumbnailUrl = normalizeThumbnailUrl(options.thumbnailUrl);
  if (!normalizedThumbnailUrl) return html;

  const escapedUrl = escapeHtmlAttribute(normalizedThumbnailUrl);
  const rawTitle = typeof options.title === 'string' ? options.title.trim() : '';
  const altText = rawTitle ? `${rawTitle} thumbnail` : 'Video thumbnail';
  const escapedAltText = escapeHtmlAttribute(altText);
  const headerSection =
    `<section data-video-thumbnail-header style="margin:0 auto 24px;max-width:960px;padding:24px 24px 0;">` +
    `<figure style="margin:0;overflow:hidden;border-radius:18px;box-shadow:0 16px 40px rgba(15,23,42,0.16);background:#0f172a;">` +
    `<img src="${escapedUrl}" alt="${escapedAltText}" loading="eager" referrerpolicy="no-referrer" style="display:block;width:100%;aspect-ratio:16/9;object-fit:cover;" />` +
    `</figure></section>`;

  if (html.includes('data-video-thumbnail-header')) {
    return html.replace(
      /<section[^>]*data-video-thumbnail-header[\s\S]*?<\/section>/i,
      headerSection,
    );
  }

  if (/<body[^>]*>/i.test(html)) {
    return html.replace(/<body[^>]*>/i, match => `${match}\n${headerSection}`);
  }

  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${headerSection}\n</body>`);
  }

  return `${html}\n${headerSection}`;
}

export function appendOriginVideoLink(html: string, videoUrl: string | null | undefined): string {
  const normalizedUrl = normalizeOriginVideoUrl(videoUrl);
  if (!normalizedUrl) return html;

  const escapedUrl = escapeHtmlAttribute(normalizedUrl);
  const linkSection =
    `<section data-origin-video-link style="margin:48px auto 24px;max-width:960px;padding:0 24px;text-align:center;">` +
    `<a href="${escapedUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;padding:12px 18px;border-radius:9999px;background:#0f766e;color:#ffffff;text-decoration:none;font:600 14px/1.2 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">` +
    `Watch Origin Video</a></section>`;

  if (html.includes('data-origin-video-link')) {
    return html.replace(
      /<section[^>]*data-origin-video-link[\s\S]*?<\/section>/i,
      linkSection,
    );
  }

  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${linkSection}\n</body>`);
  }

  return `${html}\n${linkSection}`;
}

export function stripMarkdownCodeFence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith('```')) return trimmed;
  return trimmed
    .replace(/^```[a-zA-Z]*\s*/, '')
    .replace(/```$/, '')
    .trim();
}

export function normalizeHtmlDocument(raw: string): string {
  const stripped = stripMarkdownCodeFence(raw);
  if (!stripped) {
    throw new Error('Model returned empty HTML.');
  }

  const withDoctype = /<!doctype html>/i.test(stripped)
    ? stripped
    : `<!doctype html>\n${stripped}`;
  if (!/<html[\s>]/i.test(withDoctype) || !/<body[\s>]/i.test(withDoctype)) {
    throw new Error('Model did not return a full HTML document.');
  }
  return withDoctype;
}

export function getBestDescription(video: ApifyVideoResult): string {
  return video.text?.trim() || video.description?.trim() || '';
}

export function getVideoThumbnailUrl(video: ApifyVideoResult): string | null {
  const direct = normalizeThumbnailUrl(video.thumbnailUrl);
  if (direct) return direct;

  if (Array.isArray(video.thumbnails)) {
    for (const item of video.thumbnails) {
      const candidate = normalizeThumbnailUrl(item.url);
      if (candidate) return candidate;
    }
  }

  return null;
}

export function getSubtitlePlaintext(video: ApifyVideoResult): string {
  const preferred = video.subtitles?.find(
    subtitle =>
      subtitle.language.toLowerCase().startsWith('en') && subtitle.plaintext,
  );
  if (preferred?.plaintext) return preferred.plaintext;
  const firstWithPlaintext = video.subtitles?.find(subtitle => subtitle.plaintext);
  return firstWithPlaintext?.plaintext ?? '';
}

export async function fetchYoutubeVideoData(
  videoUrls: string[],
  requestSignal?: AbortSignal,
): Promise<ApifyVideoResult[]> {
  const apiKey = process.env.APIFY_API_KEY;
  if (!apiKey) {
    throw new Error('APIFY_API_KEY environment variable is not set');
  }

  const requestBody = {
    startUrls: videoUrls.map(url => ({ url })),
    downloadSubtitles: true,
    saveSubsToKVS: false,
    preferAutoGeneratedSubtitles: false,
    subtitlesLanguage: 'en',
    subtitlesFormat: 'plaintext',
    maxResults: 1,
    maxResultsShorts: 1,
    maxResultStreams: 0,
  };

  const response = await fetch(
    `https://api.apify.com/v2/acts/${YOUTUBE_CONFIG.APIFY.ACTOR_ID}/run-sync-get-dataset-items?token=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      signal: withTimeoutSignal(YOUTUBE_CONFIG.APIFY.TIMEOUT_MS, requestSignal),
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Apify request failed (${response.status}): ${body}`);
  }

  const data = (await response.json()) as unknown;
  if (!Array.isArray(data)) {
    throw new Error('Invalid Apify response: expected an array');
  }

  return data as ApifyVideoResult[];
}

export function getUniqueCachedVideos(videoCache: Map<string, ApifyVideoResult>) {
  const uniqueById = new Map<string, ApifyVideoResult>();
  for (const video of videoCache.values()) {
    uniqueById.set(video.id, video);
  }
  return [...uniqueById.values()];
}

export function normalizeSessionTitle(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function pickPrimaryVideoFromCrawl(
  videos: ApifyVideoResult[],
  requestedUrls: string[],
): ApifyVideoResult | null {
  if (videos.length === 0) return null;
  for (const url of requestedUrls) {
    const matched = videos.find(video => video.url === url);
    if (matched) return matched;
  }
  return videos[0] ?? null;
}

export async function syncSessionTitleWithVideo(
  sessionId: string | null,
  video: ApifyVideoResult | null,
): Promise<void> {
  if (!sessionId || !video) return;
  const nextTitle = normalizeSessionTitle(video.title);
  if (!nextTitle) return;

  const updated = await updateSessionPartial(sessionId, { title: nextTitle });
  if (!updated) {
    console.warn('[chat_api] session-title-sync-skipped', {
      sessionId,
      nextTitle,
    });
  }
}

export function createBlockId(): string {
  return nanoid(8);
}

export function sanitizeTravelBlocks(rawBlocks: TravelBlock[]): TravelBlock[] {
  return rawBlocks.map((block, index) => {
    const normalizedTags = [...new Set(block.smart_tags.map(tag => tag.trim()))].filter(
      Boolean,
    );

    return {
      block_id: createBlockId(),
      type: block.type,
      title: block.title.trim() || block.description.trim().slice(0, 80) || `Block ${index + 1}`,
      description: block.description.trim(),
      location: null,
      smart_tags: normalizedTags,
    };
  });
}

export function getSpotBlocks(blocks: TravelBlock[]): SpotBlock[] {
  return blocks
    .filter(block => block.type === 'spot')
    .map(block => ({
      block_id: block.block_id,
      title: block.title,
      description: block.description,
      location: block.location,
      smart_tags: block.smart_tags,
    }));
}

export function validateTravelBlocksOutput(object: TravelBlocksOutput): string[] {
  const errors: string[] = [];

  if (object.blocks.length < 4 || object.blocks.length > 16) {
    errors.push('blocks length must be between 4 and 16.');
  }

  const seenBlockIds = new Set<string>();
  const spotIdsFromBlocks = new Set<string>();

  for (const block of object.blocks) {
    const blockId = block.block_id.trim();
    if (!blockId) {
      errors.push('each block.block_id must be non-empty.');
      continue;
    }

    if (seenBlockIds.has(blockId)) {
      errors.push(`duplicated block_id in blocks: "${blockId}".`);
    } else {
      seenBlockIds.add(blockId);
    }

    if (!block.description.trim()) {
      errors.push(`block "${blockId}" has an empty description.`);
    }
    if (!block.title.trim()) {
      errors.push(`block "${blockId}" has an empty title.`);
    }

    if (block.location !== null) {
      errors.push(`block "${blockId}" location must be null in this stage.`);
    }

    if (block.type === 'spot') {
      spotIdsFromBlocks.add(blockId);
    }
  }

  const seenSpotIds = new Set<string>();
  for (const spot of object.spot_blocks) {
    const spotId = spot.block_id.trim();
    if (!spotId) {
      errors.push('each spot_blocks.block_id must be non-empty.');
      continue;
    }

    if (seenSpotIds.has(spotId)) {
      errors.push(`duplicated block_id in spot_blocks: "${spotId}".`);
    } else {
      seenSpotIds.add(spotId);
    }

    if (!spot.description.trim()) {
      errors.push(`spot_blocks "${spotId}" has an empty description.`);
    }
    if (!spot.title.trim()) {
      errors.push(`spot_blocks "${spotId}" has an empty title.`);
    }

    if (!spotIdsFromBlocks.has(spotId)) {
      errors.push(`spot_blocks "${spotId}" is missing in blocks with type "spot".`);
    }

    if (spot.location !== null) {
      errors.push(`spot_blocks "${spotId}" location must be null in this stage.`);
    }
  }

  for (const spotId of spotIdsFromBlocks) {
    if (!seenSpotIds.has(spotId)) {
      errors.push(`missing spot_blocks entry for block_id "${spotId}".`);
    }
  }

  return errors;
}

export function validateSpotQueryOutput(
  sourceSpots: SpotBlock[],
  object: SpotQueryOutput,
): string[] {
  const errors: string[] = [];
  const sourceIds = new Set(sourceSpots.map(spot => spot.block_id));
  const seenQueryIds = new Set<string>();

  for (const item of object.spot_queries) {
    const blockId = item.block_id.trim();
    if (!blockId) {
      errors.push('each spot_queries.block_id must be non-empty.');
      continue;
    }

    if (seenQueryIds.has(blockId)) {
      errors.push(`duplicated spot query block_id: "${blockId}".`);
    } else {
      seenQueryIds.add(blockId);
    }

    if (!sourceIds.has(blockId)) {
      errors.push(`spot query block_id "${blockId}" does not exist in source spot blocks.`);
    }

    if (!item.query.trim()) {
      errors.push(`spot query for block_id "${blockId}" cannot be empty.`);
    }
  }

  for (const sourceId of sourceIds) {
    if (!seenQueryIds.has(sourceId)) {
      errors.push(`missing spot query for block_id "${sourceId}".`);
    }
  }

  return errors;
}

export function getImageTargetBlocks(
  blocks: TravelBlock[],
  limit = MAX_HANDBOOK_IMAGES,
): TravelBlock[] {
  const orderedTypes: TravelBlock['type'][] = [
    'spot',
    'food',
    'shopping',
    'transport',
    'other',
  ];
  const selected: TravelBlock[] = [];
  const seen = new Set<string>();

  for (const type of orderedTypes) {
    for (const block of blocks) {
      if (block.type !== type) continue;
      if (seen.has(block.block_id)) continue;
      seen.add(block.block_id);
      selected.push(block);
      if (selected.length >= limit) return selected;
    }
  }

  return selected;
}

export function validateHandbookImagePlan(
  sourceBlocks: TravelBlock[],
  object: HandbookImagePlan,
): string[] {
  const errors: string[] = [];
  const sourceIds = new Set(sourceBlocks.map(block => block.block_id));
  const seenIds = new Set<string>();

  for (const item of object.images) {
    const blockId = item.block_id.trim();
    if (!blockId) {
      errors.push('each images.block_id must be non-empty.');
      continue;
    }

    if (!sourceIds.has(blockId)) {
      errors.push(`images.block_id "${blockId}" does not exist in source blocks.`);
    }

    if (seenIds.has(blockId)) {
      errors.push(`duplicated images.block_id "${blockId}".`);
    } else {
      seenIds.add(blockId);
    }

    if (!item.query.trim()) {
      errors.push(`images.query for block_id "${blockId}" cannot be empty.`);
    }
    if (!item.prompt.trim()) {
      errors.push(`images.prompt for block_id "${blockId}" cannot be empty.`);
    }
    if (!item.alt.trim()) {
      errors.push(`images.alt for block_id "${blockId}" cannot be empty.`);
    }
  }

  if (object.images.length > sourceBlocks.length) {
    errors.push(
      `images length (${object.images.length}) cannot exceed source block count (${sourceBlocks.length}).`,
    );
  }

  return errors;
}

export async function fetchUnsplashPhoto(
  query: string,
  requestSignal?: AbortSignal,
): Promise<{
  image_url: string;
  source_page: string | null;
  credit: string | null;
  width: number | null;
  height: number | null;
}> {
  const unsplashAccessKey = process.env.UNSPLASH_ACCESS_KEY?.trim();

  if (!unsplashAccessKey) {
    return {
      image_url: `https://source.unsplash.com/featured/1600x900/?${encodeURIComponent(query)}`,
      source_page: `https://unsplash.com/s/photos/${encodeURIComponent(query.replace(/\s+/g, '-'))}`,
      credit: null,
      width: 1600,
      height: 900,
    };
  }

  const response = await fetch(
    `https://api.unsplash.com/search/photos?page=1&per_page=1&orientation=landscape&content_filter=high&query=${encodeURIComponent(query)}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Client-ID ${unsplashAccessKey}`,
        'Accept-Version': 'v1',
      },
      signal: withTimeoutSignal(15_000, requestSignal),
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Unsplash search failed (${response.status}): ${body}`);
  }

  const payload = (await response.json()) as {
    results?: Array<{
      width?: number;
      height?: number;
      urls?: { regular?: string; full?: string };
      links?: { html?: string };
      user?: { name?: string };
    }>;
  };
  const first = payload.results?.[0];

  if (!first?.urls?.regular && !first?.urls?.full) {
    throw new Error(`Unsplash returned no image for query "${query}"`);
  }

  return {
    image_url: first.urls?.regular ?? first.urls?.full ?? '',
    source_page: first.links?.html ?? null,
    credit: first.user?.name ? `Photo by ${first.user.name} on Unsplash` : null,
    width: typeof first.width === 'number' ? first.width : null,
    height: typeof first.height === 'number' ? first.height : null,
  };
}

function getHandbookImageModelCandidates(): string[] {
  const primary = process.env.HANDBOOK_IMAGE_MODEL ?? 'imagen-4.0-fast-generate-001';
  const fallback =
    process.env.HANDBOOK_IMAGE_FALLBACK_MODEL ?? 'gemini-2.5-flash-image';
  return [...new Set([primary, fallback])];
}

export async function generateHandbookImageByPrompt(
  prompt: string,
  requestSignal?: AbortSignal,
): Promise<{ image_url: string; model_id: string }> {
  const modelCandidates = getHandbookImageModelCandidates();
  let lastError: unknown;

  for (const modelId of modelCandidates) {
    try {
      const result = await generateImage({
        model: google.image(modelId),
        prompt,
        aspectRatio: '16:9',
        abortSignal: withTimeoutSignal(90_000, requestSignal),
        maxRetries: 0,
      });

      return {
        image_url: `data:${result.image.mediaType};base64,${result.image.base64}`,
        model_id: modelId,
      };
    } catch (error) {
      lastError = error;
      console.warn('[generate_image] model-failed', {
        modelId,
        message: toErrorMessage(error),
      });
    }
  }

  throw new Error(
    `All Google image models failed: ${toErrorMessage(lastError)}`,
  );
}

export function applySpotLocations(
  blocks: TravelBlock[],
  spotLocations: Array<{ block_id: string; location: { lat: number; lng: number } | null }>,
): TravelBlock[] {
  const locationByBlockId = new Map(
    spotLocations.map(spot => [spot.block_id, spot.location]),
  );

  return blocks.map(block => {
    if (block.type !== 'spot') return block;
    const matchedLocation = locationByBlockId.get(block.block_id);
    if (!matchedLocation) return block;
    return {
      ...block,
      location: matchedLocation,
    };
  });
}

export async function geocodeSpotByQuery(
  query: string,
  requestSignal?: AbortSignal,
): Promise<{ lat: number; lng: number } | null> {
  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`,
    {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'ai-next-travel-guide-agent/1.0',
      },
      signal: withTimeoutSignal(15_000, requestSignal),
    },
  );

  if (!response.ok) return null;

  const data = (await response.json()) as unknown;
  if (!Array.isArray(data) || data.length === 0) return null;

  const first = data[0] as { lat?: string; lon?: string };
  const lat = Number(first.lat);
  const lng = Number(first.lon);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

export { getDurationMs };
