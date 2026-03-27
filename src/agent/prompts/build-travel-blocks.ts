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
    'You are analyzing a travel video into reusable session data for a handbook workspace.',
    'Output MUST be one strict JSON object only.',
    'The top-level JSON object must contain exactly: guide_title, summary, sections, spots, remix_hints.',
    'guide_title should be concise and handbook-ready.',
    'summary should capture the trip in 1-2 sentences.',
    'sections must be ordered and represent the main handbook narrative flow.',
    'Each section must contain exactly: section_id, title, summary, kind, image_query, tags, spot_ids.',
    'Valid section kind enum: overview | spotlight | food | route | shopping | tips | culture | stay.',
    'section_id must be stable-looking kebab or slug style text, not a sentence.',
    'image_query should be a short real-world search phrase suitable for photo lookup.',
    'tags should be short reusable phrases without paragraphs.',
    'spot_ids should reference items in the top-level spots array.',
    'spots should contain concrete place candidates mentioned or strongly implied by the video.',
    'Each spot must contain exactly: spot_id, name, description, query, tags, section_ids, location.',
    'query should be a geocoding-friendly search string such as "Shibuya Crossing, Tokyo".',
    'Set every spot.location to null in this stage. Coordinates are resolved later only by geocoding.',
    'section_ids should reference sections where this spot belongs.',
    'Do not output legacy blocks or spot_blocks.',
    'Keep sections between 3 and 10 when possible.',
    'Keep spots focused and useful; do not invent places not supported by the source.',
    'remix_hints must contain exactly: narrative_angles, structure_variants, visual_motifs.',
    'Use remix_hints to preserve multiple future remix directions so outputs do not all look the same.',
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
