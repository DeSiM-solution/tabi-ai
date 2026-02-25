import type { TravelBlock, VideoContext } from '@/agent/tools/types';

export function handbookSearchImagePlanPrompt(options: {
  targetBlocks: TravelBlock[];
  videoContext: VideoContext | null;
}): string {
  const { targetBlocks, videoContext } = options;
  return [
    'Plan Unsplash search queries for travel handbook blocks.',
    'Return strict JSON with exactly one key: "images".',
    'Each images item must contain: block_id, query, prompt, alt.',
    'query must be suitable for real stock photo search.',
    'prompt must still be provided (it can be reused for image generation fallback).',
    'alt must be short, concrete, and user-facing.',
    'Do not invent block IDs outside TARGET_BLOCKS.',
    '',
    'TARGET_BLOCKS:',
    JSON.stringify(targetBlocks, null, 2),
    '',
    'VIDEO_CONTEXT:',
    JSON.stringify(
      {
        title: videoContext?.title ?? '',
        location: videoContext?.location ?? '',
        hashtags: videoContext?.hashtags ?? [],
      },
      null,
      2,
    ),
  ].join('\n');
}

export function handbookGenerateImagePlanPrompt(options: {
  targetBlocks: TravelBlock[];
  videoContext: VideoContext | null;
}): string {
  const { targetBlocks, videoContext } = options;
  return [
    'Plan image-generation prompts for travel handbook blocks.',
    'Return strict JSON with exactly one key: "images".',
    'Each images item must contain: block_id, query, prompt, alt.',
    'prompt must be a high-quality image-generation prompt focused on a realistic travel scene.',
    'query should still be present as a concise summary phrase.',
    'alt must be short, concrete, and user-facing.',
    'Do not invent block IDs outside TARGET_BLOCKS.',
    '',
    'TARGET_BLOCKS:',
    JSON.stringify(targetBlocks, null, 2),
    '',
    'VIDEO_CONTEXT:',
    JSON.stringify(
      {
        title: videoContext?.title ?? '',
        location: videoContext?.location ?? '',
        hashtags: videoContext?.hashtags ?? [],
      },
      null,
      2,
    ),
  ].join('\n');
}
