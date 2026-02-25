import type { ApifyVideoResult } from '@/agent/tools/types';
import { getBestDescription, getSubtitlePlaintext, getVideoThumbnailUrl } from '@/agent/tools/shared';
import { YOUTUBE_CONFIG } from '@/agent/tools/types';

export function buildTravelBlocksPrompt(targetVideo: ApifyVideoResult): string {
  const subtitlePlaintext = getSubtitlePlaintext(targetVideo).slice(
    0,
    YOUTUBE_CONFIG.CONTENT.MAX_SUBTITLE_CHARS,
  );
  const description = getBestDescription(targetVideo).slice(
    0,
    YOUTUBE_CONFIG.CONTENT.MAX_DESCRIPTION_CHARS,
  );

  return [
    'You are extracting travel itinerary sections from a YouTube travel video.',
    'Output MUST be strict JSON object only, with exactly two keys: "blocks" and "spot_blocks".',
    'Return blocks in chronological order and each block must map to one meaningful section/stop/activity.',
    'Each block object must contain exactly: block_id, type, title, description, location, smart_tags.',
    'Valid type enum: food | spot | transport | shopping | other.',
    'title must be short, specific, and readable (3-12 words).',
    'Set location to null for every block in this stage.',
    'Do not output lat/lng coordinates in this stage. Coordinates are resolved only by geocoding API later.',
    'Keep smart_tags short, useful, and hashtag-style when possible (example: #must-go, #cash-only).',
    '"spot_blocks" must be a filtered array derived from blocks where type === "spot".',
    'Each spot_blocks item must contain: block_id, title, description, location, smart_tags.',
    'Keep the number of blocks between 4 and 16.',
    '',
    'Video JSON:',
    JSON.stringify(
      {
        id: targetVideo.id,
        url: targetVideo.url,
        title: targetVideo.title,
        translatedTitle: targetVideo.translatedTitle,
        date: targetVideo.date,
        channelName: targetVideo.channelName || targetVideo.channel?.name || '',
        location: targetVideo.location,
        thumbnailUrl: getVideoThumbnailUrl(targetVideo),
        duration: targetVideo.duration,
        hashtags: targetVideo.hashtags,
        description,
        subtitlePlaintext,
      },
      null,
      2,
    ),
  ].join('\n');
}
