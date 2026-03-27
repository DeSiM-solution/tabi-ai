import {
  applyEditorSession,
  isRecord,
  toFileSlug,
  type EditorSession,
  type GoogleMapsCsvRow,
  type UnknownRecord,
} from './chat-utils.ts';
import { parseSessionAnalysis } from '../../../../lib/session-analysis.ts';

export const SPOTS_CSV_FIELDS_LINE = 'name | tags | description | longitude | latitude';

export type SpotsPanelItem = {
  id: string;
  order: number;
  name: string;
  description: string;
  tags: string[];
  imageUrl: string | null;
  latitude: number | null;
  longitude: number | null;
  hasCoordinates: boolean;
};

export type SpotsPanelViewModel = {
  items: SpotsPanelItem[];
  mappableItems: SpotsPanelItem[];
  unresolvedItems: SpotsPanelItem[];
  csvContent: string | null;
  csvRowCount: number;
  csvFileName: string | null;
  openMapsUrl: string;
  fieldsLine: string;
  previewText: string;
};

type BuildSpotsPanelViewModelArgs = {
  output: UnknownRecord | null;
  title: string;
  now?: Date;
};

type ResolveSpotsSourceOutputArgs = {
  editorSession: EditorSession | null;
  resolveSpotCoordinatesOutput?: unknown;
  buildTravelBlocksOutput?: unknown;
};

function toImageUrlByBlockId(output: UnknownRecord | null): Map<string, string> {
  const imageUrlByBlockId = new Map<string, string>();
  if (!output) return imageUrlByBlockId;

  const rawImages = Array.isArray(output.images)
    ? output.images
    : Array.isArray(output.image_refs)
      ? output.image_refs
      : [];

  for (const rawImage of rawImages) {
    if (!isRecord(rawImage)) continue;
    const blockId =
      typeof rawImage.block_id === 'string' ? rawImage.block_id.trim() : '';
    const imageUrl =
      typeof rawImage.image_url === 'string' ? rawImage.image_url.trim() : '';

    if (!blockId || !imageUrl) continue;
    imageUrlByBlockId.set(blockId, imageUrl);
  }

  return imageUrlByBlockId;
}

function toImageUrlBySpotId(output: UnknownRecord | null): Map<string, string> {
  const analysis = parseSessionAnalysis(output?.session_analysis ?? output?.sessionAnalysis);
  const imageUrlByBlockId = toImageUrlByBlockId(output);
  const imageUrlBySpotId = new Map<string, string>();
  if (!analysis) return imageUrlBySpotId;

  for (const spot of analysis.spots) {
    const linkedSectionIds = [
      ...spot.section_ids,
      ...analysis.sections
        .filter(section => section.spot_ids.includes(spot.spot_id))
        .map(section => section.section_id),
    ];

    for (const sectionId of linkedSectionIds) {
      const imageUrl = imageUrlByBlockId.get(sectionId);
      if (!imageUrl) continue;
      imageUrlBySpotId.set(spot.spot_id, imageUrl);
      break;
    }
  }

  return imageUrlBySpotId;
}

function normalizeTags(rawTags: unknown): string[] {
  if (!Array.isArray(rawTags)) return [];
  return rawTags
    .filter((tag): tag is string => typeof tag === 'string')
    .map(tag => tag.replace(/^#+/, '').trim())
    .filter(Boolean);
}

function toNumericCoordinate(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toSpotLocation(rawBlock: UnknownRecord): { latitude: number | null; longitude: number | null } {
  const rawLocation = isRecord(rawBlock.location) ? rawBlock.location : null;
  if (!rawLocation) {
    return {
      latitude: null,
      longitude: null,
    };
  }

  return {
    latitude: toNumericCoordinate(rawLocation.lat),
    longitude: toNumericCoordinate(rawLocation.lng),
  };
}

function toCsvPreviewText(rows: GoogleMapsCsvRow[]): string {
  return rows
    .slice(0, 4)
    .map((row, index) => {
      const name = row.name.replace(/\s+/g, ' ').trim() || 'Untitled Spot';
      const tags = row.tags.trim() || '-';
      return `${index + 1}) ${name} | tags: ${tags}`;
    })
    .join('\n');
}

function toCsvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function buildCsvFromRows(rows: GoogleMapsCsvRow[]): string {
  const header = 'name,tags,description,longitude,latitude';
  const lines = rows.map(row =>
    [
      toCsvCell(row.name),
      toCsvCell(row.tags),
      toCsvCell(row.description),
      row.longitude,
      row.latitude,
    ].join(','),
  );
  return `\uFEFF${[header, ...lines].join('\n')}`;
}

function toUsedSpotIdSet(output: UnknownRecord | null): Set<string> | null {
  if (!output) return null;
  const candidates: string[] = [];

  const collectIds = (value: unknown) => {
    if (!Array.isArray(value)) return;
    value.forEach(entry => {
      if (typeof entry !== 'string') return;
      const normalized = entry.trim();
      if (!normalized) return;
      candidates.push(normalized);
    });
  };

  collectIds(output.used_spot_ids);
  collectIds(output.usedSpotIds);

  const sourceContext = isRecord(output.sourceContext)
    ? output.sourceContext
    : isRecord(output.source_context)
      ? output.source_context
      : null;
  if (sourceContext) {
    collectIds(sourceContext.used_spot_ids);
    collectIds(sourceContext.usedSpotIds);
  }

  if (candidates.length === 0) return null;
  return new Set(candidates);
}

function toRoutePoint(row: GoogleMapsCsvRow): string | null {
  const latitude = Number(row.latitude);
  const longitude = Number(row.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return `${latitude},${longitude}`;
}

export function buildGoogleMapsDirectionsUrl(rows: GoogleMapsCsvRow[]): string {
  const points = rows.map(toRoutePoint).filter((point): point is string => point !== null);
  if (points.length === 0) {
    return 'https://www.google.com/maps/d/u/0/';
  }

  const params = new URLSearchParams({
    api: '1',
    travelmode: 'driving',
  });

  if (points.length === 1) {
    params.set('destination', points[0]);
    return `https://www.google.com/maps/dir/?${params.toString()}`;
  }

  params.set('origin', points[0]);
  params.set('destination', points[points.length - 1]);

  const waypointPoints = points.slice(1, -1);
  if (waypointPoints.length > 0) {
    params.set('waypoints', waypointPoints.join('|'));
  }

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export function resolveSpotsSourceOutput({
  editorSession,
  resolveSpotCoordinatesOutput,
  buildTravelBlocksOutput,
}: ResolveSpotsSourceOutputArgs): UnknownRecord | null {
  if (editorSession) {
    return applyEditorSession(editorSession);
  }

  if (isRecord(resolveSpotCoordinatesOutput)) {
    return resolveSpotCoordinatesOutput;
  }

  if (isRecord(buildTravelBlocksOutput)) {
    return buildTravelBlocksOutput;
  }

  return null;
}

export function buildSpotsPanelViewModel({
  output,
  title,
  now = new Date(),
}: BuildSpotsPanelViewModelArgs): SpotsPanelViewModel {
  const analysis = parseSessionAnalysis(output?.session_analysis ?? output?.sessionAnalysis);
  const usedSpotIdSet = toUsedSpotIdSet(output);
  const imageUrlBySpotId = toImageUrlBySpotId(output);
  const rawBlocks = output && Array.isArray(output.blocks) ? output.blocks : [];
  const imageUrlByBlockId = toImageUrlByBlockId(output);
  const items: SpotsPanelItem[] = [];

  if (analysis && analysis.spots.length > 0) {
    analysis.spots.forEach((spot, index) => {
      if (usedSpotIdSet && !usedSpotIdSet.has(spot.spot_id)) return;
      const latitude = spot.location?.lat ?? null;
      const longitude = spot.location?.lng ?? null;
      const hasCoordinates = latitude !== null && longitude !== null;

      items.push({
        id: spot.spot_id,
        order: index,
        name: spot.name.trim() || `spot-${index + 1}`,
        description: spot.description.trim(),
        tags: normalizeTags(spot.tags),
        imageUrl: imageUrlBySpotId.get(spot.spot_id) ?? null,
        latitude,
        longitude,
        hasCoordinates,
      });
    });
  } else {
    rawBlocks.forEach((rawBlock, index) => {
      if (!isRecord(rawBlock)) return;
      if (rawBlock.type !== 'spot') return;

      const blockId =
        typeof rawBlock.block_id === 'string' && rawBlock.block_id.trim()
          ? rawBlock.block_id.trim()
          : `spot-${index + 1}`;
      const { latitude, longitude } = toSpotLocation(rawBlock);
      const hasCoordinates = latitude !== null && longitude !== null;

      items.push({
        id: blockId,
        order: items.length,
        name:
          typeof rawBlock.title === 'string' && rawBlock.title.trim()
            ? rawBlock.title.trim()
            : blockId,
        description:
          typeof rawBlock.description === 'string' ? rawBlock.description.trim() : '',
        tags: normalizeTags(rawBlock.smart_tags),
        imageUrl: imageUrlByBlockId.get(blockId) ?? null,
        latitude,
        longitude,
        hasCoordinates,
      });
    });
  }

  const mappableItems = items.filter(item => item.hasCoordinates);
  const unresolvedItems = items.filter(item => !item.hasCoordinates);
  const csvRows: GoogleMapsCsvRow[] = mappableItems.map(item => ({
    name: item.name,
    tags: item.tags.join(', '),
    description: item.description,
    longitude: String(item.longitude),
    latitude: String(item.latitude),
  }));
  const csvResult = csvRows.length > 0
    ? {
        csv: buildCsvFromRows(csvRows),
        rowCount: csvRows.length,
        rows: csvRows,
      }
    : null;
  const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(
    now.getDate(),
  ).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(
    now.getMinutes(),
  ).padStart(2, '0')}`;

  return {
    items,
    mappableItems,
    unresolvedItems,
    csvContent: csvResult?.csv ?? null,
    csvRowCount: csvResult?.rowCount ?? 0,
    csvFileName: csvResult ? `${toFileSlug(title)}-${timestamp}.csv` : null,
    openMapsUrl: buildGoogleMapsDirectionsUrl(csvResult?.rows ?? []),
    fieldsLine: SPOTS_CSV_FIELDS_LINE,
    previewText: csvResult ? toCsvPreviewText(csvResult.rows) : '',
  };
}
