import { z } from 'zod';
import type { SpotBlock, TravelBlock } from '@/agent/tools/types';

const coordinateSchema = z.object({
  lat: z.number(),
  lng: z.number(),
});

export const sessionAnalysisSectionKindSchema = z.enum([
  'overview',
  'spotlight',
  'food',
  'route',
  'shopping',
  'tips',
  'culture',
  'stay',
]);

export const sessionAnalysisSectionSchema = z.object({
  section_id: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  kind: sessionAnalysisSectionKindSchema,
  image_query: z.string().min(1),
  tags: z.array(z.string()),
  spot_ids: z.array(z.string()),
});

export const sessionAnalysisSpotSchema = z.object({
  spot_id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  query: z.string().min(1),
  tags: z.array(z.string()),
  section_ids: z.array(z.string()),
  location: coordinateSchema.nullable(),
});

export const sessionAnalysisSchema = z.object({
  guide_title: z.string().min(1),
  summary: z.string().min(1),
  sections: z.array(sessionAnalysisSectionSchema).min(1),
  spots: z.array(sessionAnalysisSpotSchema),
  remix_hints: z
    .object({
      narrative_angles: z.array(z.string()),
      structure_variants: z.array(z.string()),
      visual_motifs: z.array(z.string()),
    })
    .optional(),
});

export type SessionAnalysis = z.infer<typeof sessionAnalysisSchema>;
export type SessionAnalysisSection = z.infer<typeof sessionAnalysisSectionSchema>;
export type SessionAnalysisSpot = z.infer<typeof sessionAnalysisSpotSchema>;

function normalizeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const tag of tags) {
    const trimmed = tag.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    normalized.push(trimmed);
  }

  return normalized;
}

function toLegacyBlockType(section: SessionAnalysisSection): TravelBlock['type'] {
  if (section.kind === 'food') return 'food';
  if (section.kind === 'route') return 'transport';
  if (section.kind === 'shopping') return 'shopping';
  if (
    section.kind === 'spotlight'
    || section.spot_ids.length > 0
    || section.kind === 'overview'
  ) {
    return 'spot';
  }
  return 'other';
}

export function parseSessionAnalysis(value: unknown): SessionAnalysis | null {
  const parsed = sessionAnalysisSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function buildLegacyBlockDataFromSessionAnalysis(
  analysis: SessionAnalysis,
): {
  blocks: TravelBlock[];
  spot_blocks: SpotBlock[];
} {
  const spotById = new Map(
    analysis.spots.map(spot => [spot.spot_id, spot] as const),
  );
  const blocks: TravelBlock[] = analysis.sections.map(section => ({
    block_id: section.section_id,
    type: toLegacyBlockType(section),
    title: section.title.trim(),
    description: section.summary.trim(),
    location:
      section.spot_ids
        .map(spotId => spotById.get(spotId)?.location ?? null)
        .find(location => location !== null) ?? null,
    smart_tags: normalizeTags(section.tags),
  }));

  const spot_blocks: SpotBlock[] = analysis.spots.map(spot => ({
    block_id: spot.spot_id,
    title: spot.name.trim(),
    description: spot.description.trim(),
    location: spot.location,
    smart_tags: normalizeTags(spot.tags),
  }));

  return {
    blocks,
    spot_blocks,
  };
}

export function applySpotLocationsToSessionAnalysis(
  analysis: SessionAnalysis,
  updates: Array<{
    spot_id: string;
    location: { lat: number; lng: number } | null;
  }>,
): SessionAnalysis {
  if (updates.length === 0) return analysis;

  const locationBySpotId = new Map(
    updates.map(update => [update.spot_id, update.location] as const),
  );

  return {
    ...analysis,
    spots: analysis.spots.map(spot => {
      if (!locationBySpotId.has(spot.spot_id)) return spot;
      return {
        ...spot,
        location: locationBySpotId.get(spot.spot_id) ?? null,
      };
    }),
  };
}
