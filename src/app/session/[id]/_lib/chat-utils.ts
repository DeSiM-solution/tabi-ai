import type { UIMessage } from 'ai';
import { nanoid } from 'nanoid';

export const DEFAULT_VIDEO_URL = '';
export const BLOCK_TYPES = ['food', 'spot', 'transport', 'shopping', 'other'] as const;

export type ToolPart = Extract<UIMessage['parts'][number], { type: `tool-${string}` }>;
export type BlockType = (typeof BLOCK_TYPES)[number];

export type UnknownRecord = Record<string, unknown>;

export interface BlockLocation {
  lat: number;
  lng: number;
}

export interface EditableBlockDraft {
  block_id: string;
  type: BlockType;
  title: string;
  description: string;
  smart_tags: string[];
  latInput: string;
  lngInput: string;
  imageUrl: string;
  imageAlt: string;
  imageQuery: string;
  imageSource: 'unsplash' | 'imagen' | '';
  imageSourcePage: string;
  imageCredit: string;
  imageWidth: number | null;
  imageHeight: number | null;
  newTagInput: string;
}

export interface EditorSession {
  sourceKey: string;
  toolName: string;
  originalOutput: UnknownRecord;
  title: string;
  videoId: string;
  videoUrl: string;
  thumbnailUrl: string;
  blocks: EditableBlockDraft[];
}

type SavedBlockOutput = ReturnType<typeof toBlockOutput>;
type SpotBlockOutput = {
  block_id: string;
  title: string;
  description: string;
  location: BlockLocation | null;
  smart_tags: string[];
};
type BlockImageOutput = {
  block_id: string;
  block_title: string;
  query: string;
  alt: string;
  image_url: string;
  source?: 'unsplash' | 'imagen';
  source_page: string | null;
  credit: string | null;
  width: number | null;
  height: number | null;
};
type BlockImageDraft = {
  imageUrl: string;
  imageAlt: string;
  imageQuery: string;
  imageSource: 'unsplash' | 'imagen' | '';
  imageSourcePage: string;
  imageCredit: string;
  imageWidth: number | null;
  imageHeight: number | null;
};

export type EditedOutputs = Record<string, UnknownRecord>;

const MANUAL_HANDBOOK_PROMPT_PREFIX = 'Generate handbook HTML from edited blocks.';

export function createBlockId(): string {
  return nanoid(8);
}

export function isRecord(value: unknown): value is UnknownRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function readNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function pickOutputString(output: UnknownRecord, keys: string[]): string {
  for (const key of keys) {
    const value = readNonEmptyString(output[key]);
    if (value) return value;
  }
  return '';
}

export function normalizeBlockType(type: unknown): BlockType {
  if (typeof type !== 'string') return 'spot';
  return (BLOCK_TYPES as readonly string[]).includes(type) ? (type as BlockType) : 'spot';
}

export function normalizeLocation(value: unknown): BlockLocation | null {
  if (!isRecord(value)) return null;
  const lat = typeof value.lat === 'number' ? value.lat : Number(value.lat);
  const lng = typeof value.lng === 'number' ? value.lng : Number(value.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function normalizeImageSource(source: unknown): 'unsplash' | 'imagen' | '' {
  return source === 'unsplash' || source === 'imagen' ? source : '';
}

function normalizeImageDimension(value: unknown): number | null {
  if (typeof value !== 'number') return null;
  return Number.isFinite(value) ? value : null;
}

function createEmptyBlockImageDraft(): BlockImageDraft {
  return {
    imageUrl: '',
    imageAlt: '',
    imageQuery: '',
    imageSource: '',
    imageSourcePage: '',
    imageCredit: '',
    imageWidth: null,
    imageHeight: null,
  };
}

function getOutputImagesByBlockId(output: UnknownRecord): Map<string, BlockImageDraft> {
  const rawImages = Array.isArray(output.images)
    ? output.images
    : Array.isArray(output.image_refs)
      ? output.image_refs
      : [];
  const imageByBlockId = new Map<string, BlockImageDraft>();

  for (const rawImage of rawImages) {
    if (!isRecord(rawImage)) continue;
    const blockId =
      typeof rawImage.block_id === 'string' ? rawImage.block_id.trim() : '';
    if (!blockId) continue;

    imageByBlockId.set(blockId, {
      imageUrl:
        typeof rawImage.image_url === 'string'
          ? rawImage.image_url.trim()
          : '',
      imageAlt: typeof rawImage.alt === 'string' ? rawImage.alt.trim() : '',
      imageQuery:
        typeof rawImage.query === 'string' ? rawImage.query.trim() : '',
      imageSource: normalizeImageSource(rawImage.source),
      imageSourcePage:
        typeof rawImage.source_page === 'string' ? rawImage.source_page.trim() : '',
      imageCredit: typeof rawImage.credit === 'string' ? rawImage.credit.trim() : '',
      imageWidth: normalizeImageDimension(rawImage.width),
      imageHeight: normalizeImageDimension(rawImage.height),
    });
  }

  return imageByBlockId;
}

function toEditableBlockDraft(
  rawBlock: unknown,
  index: number,
  imageByBlockId?: Map<string, BlockImageDraft>,
): EditableBlockDraft {
  const block = isRecord(rawBlock) ? rawBlock : {};
  const location = normalizeLocation(block.location);
  const smartTags = Array.isArray(block.smart_tags)
    ? block.smart_tags.filter(tag => typeof tag === 'string')
    : [];
  const normalizedBlockId =
    typeof block.block_id === 'string' && block.block_id.trim()
      ? block.block_id.trim()
      : createBlockId();
  const imageDraft = imageByBlockId?.get(normalizedBlockId) ?? createEmptyBlockImageDraft();

  return {
    block_id: normalizedBlockId,
    type: normalizeBlockType(block.type),
    title:
      typeof block.title === 'string' && block.title.trim()
        ? block.title.trim()
        : typeof block.block_id === 'string' && block.block_id.trim()
          ? block.block_id.trim()
          : `Block ${index + 1}`,
    description: typeof block.description === 'string' ? block.description : '',
    smart_tags: smartTags,
    latInput: location ? String(location.lat) : '',
    lngInput: location ? String(location.lng) : '',
    imageUrl: imageDraft.imageUrl,
    imageAlt: imageDraft.imageAlt,
    imageQuery: imageDraft.imageQuery,
    imageSource: imageDraft.imageSource,
    imageSourcePage: imageDraft.imageSourcePage,
    imageCredit: imageDraft.imageCredit,
    imageWidth: imageDraft.imageWidth,
    imageHeight: imageDraft.imageHeight,
    newTagInput: '',
  };
}

function toBlockOutput(block: EditableBlockDraft): {
  block_id: string;
  type: BlockType;
  title: string;
  description: string;
  location: BlockLocation | null;
  smart_tags: string[];
} {
  const lat = block.latInput.trim() === '' ? NaN : Number(block.latInput);
  const lng = block.lngInput.trim() === '' ? NaN : Number(block.lngInput);
  const location = Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;

  return {
    block_id: block.block_id.trim() || createBlockId(),
    type: normalizeBlockType(block.type),
    title: block.title.trim() || block.block_id.trim() || 'Untitled Block',
    description: block.description.trim(),
    location,
    smart_tags: block.smart_tags,
  };
}

function toSpotBlocks(blocks: SavedBlockOutput[]): SpotBlockOutput[] {
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

function toBlockImages(blocks: SavedBlockOutput[], drafts: EditableBlockDraft[]): BlockImageOutput[] {
  return blocks.flatMap((block, index) => {
    const draft = drafts[index];
    if (!draft) return [];
    const imageUrl = draft.imageUrl.trim();
    if (!imageUrl) return [];

    const source = normalizeImageSource(draft.imageSource);
    return [
      {
        block_id: block.block_id,
        block_title: block.title,
        query: draft.imageQuery.trim() || block.title,
        alt: draft.imageAlt.trim() || block.title,
        image_url: imageUrl,
        ...(source ? { source } : {}),
        source_page: draft.imageSourcePage.trim() || null,
        credit: draft.imageCredit.trim() || null,
        width: draft.imageWidth,
        height: draft.imageHeight,
      },
    ];
  });
}

function getSpotQueryByBlockId(output: UnknownRecord): Map<string, string> {
  const queryByBlockId = new Map<string, string>();
  const rawQueries = output.spot_queries;
  if (!Array.isArray(rawQueries)) return queryByBlockId;

  for (const item of rawQueries) {
    if (!isRecord(item)) continue;
    if (typeof item.block_id !== 'string' || typeof item.query !== 'string') continue;
    queryByBlockId.set(item.block_id, item.query);
  }

  return queryByBlockId;
}

function deriveSpotCoordinateStats(
  blocks: SavedBlockOutput[],
  sourceOutput: UnknownRecord,
): {
  spotBlocks: SpotBlockOutput[];
  spotsWithCoordinates: Array<{
    block_id: string;
    query: string;
    location: BlockLocation | null;
  }>;
  resolvedCount: number;
  unresolvedCount: number;
} {
  const spotBlocks = toSpotBlocks(blocks);
  const queryByBlockId = getSpotQueryByBlockId(sourceOutput);
  const spotsWithCoordinates = spotBlocks.map(spot => ({
    block_id: spot.block_id,
    query: queryByBlockId.get(spot.block_id) ?? spot.description,
    location: spot.location,
  }));
  const resolvedCount = spotsWithCoordinates.filter(spot => spot.location !== null).length;

  return {
    spotBlocks,
    spotsWithCoordinates,
    resolvedCount,
    unresolvedCount: spotsWithCoordinates.length - resolvedCount,
  };
}

export function createEditorSession(
  sourceKey: string,
  toolName: string,
  output: unknown,
): EditorSession | null {
  if (!isRecord(output)) return null;
  if (!Array.isArray(output.blocks)) return null;

  const imageByBlockId = getOutputImagesByBlockId(output);
  const blocks = output.blocks.map((block, index) =>
    toEditableBlockDraft(block, index, imageByBlockId),
  );

  return {
    sourceKey,
    toolName,
    originalOutput: output,
    title: pickOutputString(output, ['title', 'guideTitle', 'guide_title']),
    videoId: pickOutputString(output, ['videoId', 'video_id']),
    videoUrl: pickOutputString(output, ['videoUrl', 'video_url']),
    thumbnailUrl: pickOutputString(output, [
      'thumbnailUrl',
      'coverImageUrl',
      'cover_image_url',
    ]),
    blocks,
  };
}

export function applyEditorSession(session: EditorSession): UnknownRecord {
  const blocks = session.blocks.map(toBlockOutput);
  const images = toBlockImages(blocks, session.blocks);
  const { spotBlocks, spotsWithCoordinates, resolvedCount, unresolvedCount } =
    deriveSpotCoordinateStats(blocks, session.originalOutput);

  const nextOutput: UnknownRecord = {
    ...session.originalOutput,
    videoId: session.videoId,
    videoUrl: session.videoUrl,
    thumbnailUrl: session.thumbnailUrl,
    coverImageUrl: session.thumbnailUrl,
    title: session.title,
    guideTitle: session.title,
    blockCount: blocks.length,
    blocks,
    spot_blocks: spotBlocks,
    spotCount: spotBlocks.length,
    images,
    image_count: images.length,
    image_refs: images.map(image => ({
      block_id: image.block_id,
      block_title: image.block_title,
      alt: image.alt,
      source: image.source ?? '',
      credit: image.credit,
    })),
  };

  if (session.toolName === 'build_travel_blocks') {
    return nextOutput;
  }

  nextOutput.spots_with_coordinates = spotsWithCoordinates;
  nextOutput.resolved_count = resolvedCount;
  nextOutput.unresolved_count = unresolvedCount;

  return nextOutput;
}

function toCsvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function normalizeTagForCsv(tag: string): string {
  return tag.replace(/^#+/, '').trim();
}

export function toFileSlug(value: string): string {
  const cleaned = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const compact = cleaned.replace(/^-+|-+$/g, '');
  return compact || 'travel-guide';
}

export type GoogleMapsCsvRow = {
  name: string;
  tags: string;
  description: string;
  longitude: string;
  latitude: string;
};

export function buildGoogleMapsCsv(
  output: UnknownRecord,
): { csv: string; rowCount: number; rows: GoogleMapsCsvRow[] } | null {
  const rawBlocks = output.blocks;
  if (!Array.isArray(rawBlocks)) return null;

  const rows: GoogleMapsCsvRow[] = [];

  for (const rawBlock of rawBlocks) {
    if (!isRecord(rawBlock)) continue;
    if (rawBlock.type !== 'spot') continue;

    const location = normalizeLocation(rawBlock.location);
    if (!location) continue;

    const blockId = typeof rawBlock.block_id === 'string' ? rawBlock.block_id.trim() : '';
    const title =
      typeof rawBlock.title === 'string' && rawBlock.title.trim()
        ? rawBlock.title.trim()
        : blockId || 'Untitled Spot';
    const description = typeof rawBlock.description === 'string' ? rawBlock.description : '';
    const tags = Array.isArray(rawBlock.smart_tags)
      ? rawBlock.smart_tags
          .filter((tag): tag is string => typeof tag === 'string')
          .map(normalizeTagForCsv)
          .filter(Boolean)
          .join(', ')
      : '';

    rows.push({
      name: title,
      tags,
      description,
      longitude: String(location.lng),
      latitude: String(location.lat),
    });
  }

  if (rows.length === 0) return null;

  const header = 'name,tags,description,longitude,latitude';
  const csvBody = [header, ...rows.map(row =>
    [
      toCsvCell(row.name),
      toCsvCell(row.tags),
      toCsvCell(row.description),
      row.longitude,
      row.latitude,
    ].join(','),
  )]
    .join('\n');

  return {
    csv: `\uFEFF${csvBody}`,
    rowCount: rows.length,
    rows,
  };
}

function normalizeYoutubeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(withProtocol);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, '').toLowerCase();
  const isYoutubeHost =
    host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtu.be';

  if (!isYoutubeHost) return null;

  if (host === 'youtu.be') {
    const id = url.pathname.replace('/', '').trim();
    if (id.length < 6) return null;
    return `https://www.youtube.com/watch?v=${id}`;
  }

  const id = url.searchParams.get('v')?.trim() ?? '';
  if (id.length < 6) return null;
  return `https://www.youtube.com/watch?v=${id}`;
}

export function toGuidePrompt(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const normalizedYoutubeUrl = normalizeYoutubeUrl(trimmed);
  if (normalizedYoutubeUrl) {
    return `Create a travel guide from this video: ${normalizedYoutubeUrl}`;
  }

  return trimmed;
}

function isManualHandbookPrompt(raw: string): boolean {
  const trimmed = raw.trim();
  return trimmed.startsWith(MANUAL_HANDBOOK_PROMPT_PREFIX);
}

function toFirstSentence(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';

  const sentenceEnd = trimmed.search(/[.!?](\s|\n|$)/);
  if (sentenceEnd >= 0) {
    return trimmed.slice(0, sentenceEnd + 1);
  }

  const firstLine = trimmed.split('\n').map(line => line.trim()).find(Boolean);
  return firstLine ?? trimmed;
}

export function toDisplayUserText(raw: string): string {
  if (!isManualHandbookPrompt(raw)) return raw;
  return toFirstSentence(raw);
}

export function isToolPart(part: UIMessage['parts'][number]): part is ToolPart {
  if (!('type' in part) || typeof part.type !== 'string') return false;
  return part.type.startsWith('tool-');
}

export function getToolStatus(state: ToolPart['state']) {
  if (state === 'output-available') {
    return {
      label: 'Done',
      tone: 'done' as const,
    };
  }
  if (state === 'output-error') {
    return {
      label: 'Failed',
      tone: 'failed' as const,
    };
  }
  return {
    label: 'Running',
    tone: 'running' as const,
  };
}

function toDurationMsValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return Math.round(value);
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return Math.round(parsed);
    }
  }
  return null;
}

function readDurationMsFromRecord(value: unknown): number | null {
  if (!isRecord(value)) return null;
  const directDuration =
    toDurationMsValue(value.durationMs)
    ?? toDurationMsValue(value.duration_ms)
    ?? toDurationMsValue(value.elapsedMs)
    ?? toDurationMsValue(value.elapsed_ms)
    ?? toDurationMsValue(value.latencyMs)
    ?? toDurationMsValue(value.latency_ms);
  if (directDuration !== null) return directDuration;

  const nestedDuration =
    readDurationMsFromRecord(value.metrics)
    ?? readDurationMsFromRecord(value.meta);
  if (nestedDuration !== null) return nestedDuration;

  const startedAt = toTimestampMs(
    value.startedAt ?? value.started_at ?? value.createdAt ?? value.created_at,
  );
  const finishedAt = toTimestampMs(
    value.finishedAt
    ?? value.finished_at
    ?? value.completedAt
    ?? value.completed_at
    ?? value.updatedAt
    ?? value.updated_at,
  );
  if (startedAt === null || finishedAt === null || finishedAt < startedAt) return null;
  return Math.round(finishedAt - startedAt);
}

function toTimestampMs(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value;
  }
  if (typeof value !== 'string') return null;

  const parsedEpoch = Number(value);
  if (Number.isFinite(parsedEpoch) && parsedEpoch > 0) {
    return parsedEpoch;
  }
  const parsedDate = Date.parse(value);
  if (!Number.isNaN(parsedDate) && parsedDate > 0) {
    return parsedDate;
  }
  return null;
}

export function resolveToolDurationMs(part: ToolPart, output: unknown): number | null {
  return readDurationMsFromRecord(output) ?? readDurationMsFromRecord(part as unknown);
}

export function buildToolDurationMapFromSteps(
  messages: UIMessage[],
  steps: Array<{
    toolName?: string;
    durationMs?: unknown;
  }> | undefined,
): Record<string, number> {
  if (!Array.isArray(steps) || steps.length === 0) return {};

  const sourceKeysByToolName = new Map<string, string[]>();
  for (const message of messages) {
    message.parts.forEach((part, partIndex) => {
      if (!isToolPart(part)) return;
      const toolName = part.type.replace('tool-', '');
      const sourceKey = `${message.id}:${partIndex}:${part.type}`;
      const queue = sourceKeysByToolName.get(toolName);
      if (queue) {
        queue.push(sourceKey);
        return;
      }
      sourceKeysByToolName.set(toolName, [sourceKey]);
    });
  }

  const consumedCounts = new Map<string, number>();
  const durationBySourceKey: Record<string, number> = {};

  for (const step of steps) {
    const toolName = typeof step.toolName === 'string' ? step.toolName : '';
    if (!toolName) continue;
    const durationMs = toDurationMsValue(step.durationMs);
    if (durationMs === null) continue;

    const sourceKeys = sourceKeysByToolName.get(toolName);
    if (!sourceKeys || sourceKeys.length === 0) continue;
    const consumedCount = consumedCounts.get(toolName) ?? 0;
    const sourceKey = sourceKeys[consumedCount];
    if (!sourceKey) continue;

    durationBySourceKey[sourceKey] = durationMs;
    consumedCounts.set(toolName, consumedCount + 1);
  }

  return durationBySourceKey;
}

function getNumberField(output: unknown, field: string): number | null {
  if (!isRecord(output)) return null;
  const value = output[field];
  return typeof value === 'number' ? value : null;
}

function getStringField(output: unknown, field: string): string | null {
  if (!isRecord(output)) return null;
  const value = output[field];
  return typeof value === 'string' ? value : null;
}

function getBlocksFromOutput(output: unknown): SavedBlockOutput[] {
  if (!isRecord(output) || !Array.isArray(output.blocks)) return [];
  return output.blocks.map((block, index) => toEditableBlockDraft(block, index)).map(toBlockOutput);
}

function getSpotResolvedCounts(output: unknown): {
  resolved: number;
  unresolved: number;
} | null {
  const blocks = getBlocksFromOutput(output);
  if (blocks.length === 0) return null;
  const spotBlocks = toSpotBlocks(blocks);
  const resolved = spotBlocks.filter(spot => spot.location !== null).length;
  return {
    resolved,
    unresolved: spotBlocks.length - resolved,
  };
}

function getFormattedJson(output: unknown): string | null {
  if (!output || typeof output !== 'object') return null;
  return JSON.stringify(output, null, 2);
}

export function getToolJsonPanel(
  toolName: string,
  part: ToolPart,
  output: unknown,
): { title: string; value: string } | null {
  if (part.state !== 'output-available') return null;

  if (toolName === 'build_travel_blocks') {
    const value = getFormattedJson(output);
    if (!value) return null;
    return {
      title: 'build_travel_blocks JSON',
      value,
    };
  }

  if (toolName === 'resolve_spot_coordinates') {
    const value = getFormattedJson(output);
    if (!value) return null;
    return {
      title: 'resolve_spot_coordinates JSON (includes lat/lng)',
      value,
    };
  }

  if (toolName === 'search_image' || toolName === 'generate_image') {
    if (!isRecord(output)) return null;
    const rawImages = Array.isArray(output.images)
      ? output.images
      : Array.isArray(output.image_refs)
        ? output.image_refs
        : [];
    const images = rawImages
      .filter(isRecord)
      .slice(0, 6)
      .map(image => ({
        block_id: typeof image.block_id === 'string' ? image.block_id : '',
        block_title: typeof image.block_title === 'string' ? image.block_title : '',
        query: typeof image.query === 'string' ? image.query : '',
        alt: typeof image.alt === 'string' ? image.alt : '',
        source: typeof image.source === 'string' ? image.source : '',
        image_url:
          typeof image.image_url === 'string'
            ? image.image_url.startsWith('data:')
              ? `[data-url omitted, length=${image.image_url.length}]`
              : image.image_url
            : '',
      }));
    const summary = {
      mode: typeof output.mode === 'string' ? output.mode : toolName,
      image_count:
        typeof output.image_count === 'number' ? output.image_count : images.length,
      plan_image_count:
        typeof output.plan_image_count === 'number' ? output.plan_image_count : null,
      planner_coverage_ratio:
        typeof output.planner_coverage_ratio === 'number'
          ? output.planner_coverage_ratio
          : null,
      target_block_count:
        typeof output.target_block_count === 'number'
          ? output.target_block_count
          : null,
      required_image_count:
        typeof output.required_image_count === 'number'
          ? output.required_image_count
          : null,
      coverage_ratio:
        typeof output.coverage_ratio === 'number' ? output.coverage_ratio : null,
      full_block_count:
        typeof output.full_block_count === 'number' ? output.full_block_count : null,
      full_required_image_count:
        typeof output.full_required_image_count === 'number'
          ? output.full_required_image_count
          : null,
      full_matched_image_count:
        typeof output.full_matched_image_count === 'number'
          ? output.full_matched_image_count
          : null,
      full_coverage_ratio:
        typeof output.full_coverage_ratio === 'number'
          ? output.full_coverage_ratio
          : null,
      full_pass_75:
        typeof output.full_pass_75 === 'boolean' ? output.full_pass_75 : null,
      unsplash_matched_count:
        typeof output.unsplash_matched_count === 'number'
          ? output.unsplash_matched_count
          : null,
      fallback_generated_count:
        typeof output.fallback_generated_count === 'number'
          ? output.fallback_generated_count
          : null,
      coverage_gate_triggered:
        typeof output.coverage_gate_triggered === 'boolean'
          ? output.coverage_gate_triggered
          : null,
      coverage_backfill_gap:
        typeof output.coverage_backfill_gap === 'number'
          ? output.coverage_backfill_gap
          : null,
      coverage_backfill_added_count:
        typeof output.coverage_backfill_added_count === 'number'
          ? output.coverage_backfill_added_count
          : null,
      planner_model:
        typeof output.planner_model === 'string' ? output.planner_model : null,
      generation_models: Array.isArray(output.generation_models)
        ? output.generation_models
        : [],
      block_attempts: Array.isArray(output.block_attempts)
        ? output.block_attempts.slice(0, 8)
        : [],
      images,
    };
    return {
      title: `${toolName} output`,
      value: JSON.stringify(summary, null, 2),
    };
  }

  if (toolName === 'generate_handbook_html') {
    return null;
  }

  return null;
}

export function canEditBlocks(toolName: string, part: ToolPart, output: unknown): boolean {
  if (part.state !== 'output-available') return false;
  if (
    toolName !== 'build_travel_blocks'
    && toolName !== 'resolve_spot_coordinates'
  ) {
    return false;
  }
  return isRecord(output) && Array.isArray(output.blocks);
}

export function getToolSummary(toolName: string, part: ToolPart, output: unknown): string {
  if (part.state === 'output-error') {
    return part.errorText || 'Tool execution failed';
  }

  if (part.state !== 'output-available') {
    return 'Processing...';
  }

  if (toolName === 'parse_youtube_input') {
    const count = getNumberField(output, 'count');
    return `Found ${count ?? 0} YouTube URL(s)`;
  }

  if (toolName === 'crawl_youtube_videos') {
    const count = getNumberField(output, 'count');
    return `Fetched ${count ?? 0} video record(s)`;
  }

  if (toolName === 'summarize_description' || toolName === 'summarize_session_description') {
    const description = getStringField(output, 'description');
    if (description) {
      return `Updated session description: ${description}`;
    }
    return 'Updated session description';
  }

  if (toolName === 'build_travel_blocks') {
    const blockCount = getNumberField(output, 'blockCount') ?? getBlocksFromOutput(output).length;
    return `Generated ${blockCount ?? 0} travel block(s)`;
  }

  if (toolName === 'resolve_spot_coordinates') {
    const fallbackCounts = getSpotResolvedCounts(output);
    const resolvedCount = getNumberField(output, 'resolved_count') ?? fallbackCounts?.resolved;
    const unresolvedCount =
      getNumberField(output, 'unresolved_count') ?? fallbackCounts?.unresolved;
    return `Resolved ${resolvedCount ?? 0} spot coordinate(s), unresolved ${unresolvedCount ?? 0}`;
  }

  if (toolName === 'search_image') {
    const imageCount = getNumberField(output, 'image_count');
    return `Selected ${imageCount ?? 0} stock image(s)`;
  }

  if (toolName === 'generate_image') {
    const imageCount = getNumberField(output, 'image_count');
    return `Generated ${imageCount ?? 0} image(s) with Google AI`;
  }

  if (toolName === 'generate_handbook_html') {
    return 'Generated handbook HTML';
  }

  return 'Completed';
}
