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

export type EditedOutputs = Record<string, UnknownRecord>;

export function createBlockId(): string {
  return nanoid(8);
}

export function isRecord(value: unknown): value is UnknownRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value);
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

function toEditableBlockDraft(rawBlock: unknown, index: number): EditableBlockDraft {
  const block = isRecord(rawBlock) ? rawBlock : {};
  const location = normalizeLocation(block.location);
  const smartTags = Array.isArray(block.smart_tags)
    ? block.smart_tags.filter(tag => typeof tag === 'string')
    : [];

  return {
    block_id:
      typeof block.block_id === 'string' && block.block_id.trim()
        ? block.block_id.trim()
        : createBlockId(),
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

  const blocks = output.blocks.map(toEditableBlockDraft);

  return {
    sourceKey,
    toolName,
    originalOutput: output,
    title: typeof output.title === 'string' ? output.title : '',
    videoId: typeof output.videoId === 'string' ? output.videoId : '',
    videoUrl: typeof output.videoUrl === 'string' ? output.videoUrl : '',
    thumbnailUrl:
      typeof output.thumbnailUrl === 'string' ? output.thumbnailUrl : '',
    blocks,
  };
}

export function applyEditorSession(session: EditorSession): UnknownRecord {
  const blocks = session.blocks.map(toBlockOutput);
  const { spotBlocks, spotsWithCoordinates, resolvedCount, unresolvedCount } =
    deriveSpotCoordinateStats(blocks, session.originalOutput);

  const nextOutput: UnknownRecord = {
    ...session.originalOutput,
    videoId: session.videoId,
    videoUrl: session.videoUrl,
    thumbnailUrl: session.thumbnailUrl,
    title: session.title,
    blockCount: blocks.length,
    blocks,
    spot_blocks: spotBlocks,
    spotCount: spotBlocks.length,
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

export function buildGoogleMapsCsv(output: UnknownRecord): { csv: string; rowCount: number } | null {
  const rawBlocks = output.blocks;
  if (!Array.isArray(rawBlocks)) return null;

  const rows: Array<{
    id: string;
    name: string;
    tags: string;
    description: string;
    longitude: string;
    latitude: string;
  }> = [];

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
      id: blockId || createBlockId(),
      name: title,
      tags,
      description,
      longitude: String(location.lng),
      latitude: String(location.lat),
    });
  }

  if (rows.length === 0) return null;

  const header = 'id,name,tags,description,longitude,latitude';
  const csvBody = [header, ...rows.map(row =>
    [
      toCsvCell(row.id),
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

function getNumberField(output: unknown, field: string): number | null {
  if (!isRecord(output)) return null;
  const value = output[field];
  return typeof value === 'number' ? value : null;
}

function getBlocksFromOutput(output: unknown): SavedBlockOutput[] {
  if (!isRecord(output) || !Array.isArray(output.blocks)) return [];
  return output.blocks.map(toEditableBlockDraft).map(toBlockOutput);
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
    const images = Array.isArray(output.images)
      ? output.images
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
          }))
      : [];
    const summary = {
      mode: typeof output.mode === 'string' ? output.mode : toolName,
      image_count:
        typeof output.image_count === 'number' ? output.image_count : images.length,
      planner_model:
        typeof output.planner_model === 'string' ? output.planner_model : null,
      generation_models: Array.isArray(output.generation_models)
        ? output.generation_models
        : [],
      images,
    };
    return {
      title: `${toolName} output`,
      value: JSON.stringify(summary, null, 2),
    };
  }

  if (toolName === 'generate_handbook_html') {
    if (!isRecord(output)) return null;
    const summary = {
      title: typeof output.title === 'string' ? output.title : '',
      videoId: typeof output.videoId === 'string' ? output.videoId : '',
      videoUrl: typeof output.videoUrl === 'string' ? output.videoUrl : '',
      thumbnailUrl:
        typeof output.thumbnailUrl === 'string' ? output.thumbnailUrl : null,
      block_count:
        typeof output.block_count === 'number' ? output.block_count : null,
      spot_count: typeof output.spot_count === 'number' ? output.spot_count : null,
      image_count:
        typeof output.image_count === 'number' ? output.image_count : null,
      image_mode:
        typeof output.image_mode === 'string' ? output.image_mode : null,
      generated_at:
        typeof output.generated_at === 'string' ? output.generated_at : '',
      html_length:
        typeof output.html_length === 'number' ? output.html_length : null,
    };
    return {
      title: 'generate_handbook_html output',
      value: JSON.stringify(summary, null, 2),
    };
  }

  return null;
}

export function canEditBlocks(toolName: string, part: ToolPart, output: unknown): boolean {
  if (part.state !== 'output-available') return false;
  if (toolName !== 'resolve_spot_coordinates') {
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
    const htmlLength = getNumberField(output, 'html_length');
    return `Generated handbook HTML (${htmlLength ?? 0} chars)`;
  }

  return 'Completed';
}
