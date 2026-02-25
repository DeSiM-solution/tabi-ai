import type { SpotBlock, VideoContext } from '@/agent/tools/types';

export function resolveSpotCoordinatesPrompt(options: {
  videoContext: VideoContext | null;
  sourceSpots: SpotBlock[];
}): string {
  const { videoContext, sourceSpots } = options;
  return [
    'Convert each travel spot into a geocoding-friendly place query string.',
    'Output strict JSON only and never output coordinates.',
    'Keep query concise and searchable; include city/prefecture/country if useful.',
    '',
    'Context JSON:',
    JSON.stringify(
      {
        videoTitle: videoContext?.title ?? '',
        videoLocation: videoContext?.location ?? '',
        hashtags: videoContext?.hashtags ?? [],
        spot_blocks: sourceSpots,
      },
      null,
      2,
    ),
  ].join('\n');
}
