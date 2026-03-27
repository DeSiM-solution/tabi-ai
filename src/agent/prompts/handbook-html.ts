import type {
  HandbookImageAsset,
  SpotBlock,
  TravelBlock,
  VideoContext,
} from '@/agent/tools/types';
import type { SessionAnalysis } from '@/lib/session-analysis';

export type HandbookPromptImageAsset = Pick<
  HandbookImageAsset,
  'block_id' | 'block_title' | 'alt' | 'image_url' | 'width' | 'height'
>;

export function handbookHtmlSystemPrompt(options: {
  handbookStyleInstruction: string | null;
}): string {
  const { handbookStyleInstruction } = options;
  return [
    'You are a senior frontend engineer.',
    'Return only one complete HTML document.',
    'Do not use markdown code fences.',
    'Output must start with <!doctype html> and include <html>, <head>, <body>.',
    'Use semantic sections, responsive layout, and clean typography.',
    'Render the handbook from the provided session analysis and section summaries.',
    'Render all travel spots from the input session_analysis.spots data.',
    'For every rendered spot section, include data-spot-id="<spot_id>" using the exact spot_id from input session_analysis.spots.',
    'Only use spot ids from the provided available_spot_ids list; never invent spot ids.',
    'Use only provided handbook_images[].image_url values for images.',
    'Do not invent new image URLs.',
    'Each block section should render its matched image when available.',
    'Do not render image metadata fields such as query/source/source_page/credit/model/provider.',
    'If thumbnailUrl is provided in input, render it exactly once as the top hero/header image.',
    'If thumbnailUrl is null or empty, do not render any top thumbnail/hero image section.',
    'Use the provided thumbnailUrl as-is, do not replace it with another URL.',
    'Do not duplicate the thumbnail image in any other section.',
    'Do not place any text overlay, caption, badge, or headline on top of the thumbnail image.',
    'Never hallucinate new places; only use provided block data.',
    'Include coordinate text only when lat/lng is available.',
    'Do not reference external JavaScript frameworks.',
    'Do not embed any video player, iframe, or <video> element.',
    'Do not render the source video URL in the main handbook content.',
    'If escapedUrl is provided in input, render exactly one origin-video CTA button linking to that URL.',
    'Use escapedUrl exactly as provided for the button href.',
    'Do not use raw videoUrl for link href values; only use escapedUrl for the origin-video CTA.',
    'If escapedUrl is null or empty, do not render the origin-video CTA button.',
    'The origin-video CTA button must visually match the page style; do not force a fixed global button theme.',
    handbookStyleInstruction
      ? `Visual style direction: ${handbookStyleInstruction}`
      : 'Visual style direction: choose a fitting style based on the travel content.',
  ].join('\n');
}

export function handbookHtmlPrompt(options: {
  title: string;
  videoContext: VideoContext | null;
  thumbnailUrl: string | null;
  sessionAnalysis: SessionAnalysis | null;
  blocks: TravelBlock[];
  blocksWithImages: Array<TravelBlock & { image: HandbookPromptImageAsset | null }>;
  spotBlocks: SpotBlock[];
  images: HandbookPromptImageAsset[];
  imageMode: 'search_image' | 'generate_image' | null;
  handbookStyle: string;
  handbookStyleLabel: string;
  handbookStyleInstruction: string | null;
  escapedUrl: string | null;
}): string {
  const {
    title,
    videoContext,
    thumbnailUrl,
    sessionAnalysis,
    blocks,
    blocksWithImages,
    spotBlocks,
    images,
    imageMode,
    handbookStyle,
    handbookStyleLabel,
    handbookStyleInstruction,
    escapedUrl,
  } = options;
  const availableSpotIds = sessionAnalysis?.spots.length
    ? sessionAnalysis.spots.map(spot => spot.spot_id)
    : spotBlocks.map(spot => spot.block_id);

  return [
    'Generate a polished travel handbook HTML page from this JSON input.',
    'The HTML must be self-contained and directly previewable in an iframe via srcDoc.',
    '',
    'HANDBOOK_INPUT_JSON:',
    JSON.stringify(
      {
        title,
        videoId: videoContext?.videoId ?? '',
        videoUrl: videoContext?.videoUrl ?? '',
        thumbnailUrl,
        blockCount: blocks.length,
        spotCount: spotBlocks.length,
        imageCount: images.length,
        imageMode,
        handbookStyle,
        handbookStyleLabel,
        handbookStyleInstruction,
        escapedUrl,
        available_spot_ids: availableSpotIds,
        session_analysis: sessionAnalysis,
        blocks,
        blocks_with_images: blocksWithImages,
        spot_blocks: spotBlocks,
        handbook_images: images,
      },
      null,
      2,
    ),
  ].join('\n');
}
