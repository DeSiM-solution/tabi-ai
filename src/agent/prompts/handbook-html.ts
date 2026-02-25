import type {
  HandbookImageAsset,
  SpotBlock,
  TravelBlock,
  VideoContext,
} from '@/agent/tools/types';

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
    'Render all travel spots from the input blocks.',
    'Use only provided handbook_images[].image_url values for images.',
    'Do not invent new image URLs.',
    'Each block section should render its matched image when available.',
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
    handbookStyleInstruction
      ? `Visual style direction: ${handbookStyleInstruction}`
      : 'Visual style direction: choose a fitting style based on the travel content.',
  ].join('\n');
}

export function handbookHtmlPrompt(options: {
  title: string;
  videoContext: VideoContext | null;
  thumbnailUrl: string | null;
  blocks: TravelBlock[];
  blocksWithImages: Array<TravelBlock & { image: HandbookImageAsset | null }>;
  spotBlocks: SpotBlock[];
  images: HandbookImageAsset[];
  imageMode: 'search_image' | 'generate_image' | null;
  handbookStyle: string;
  handbookStyleLabel: string;
  handbookStyleInstruction: string | null;
}): string {
  const {
    title,
    videoContext,
    thumbnailUrl,
    blocks,
    blocksWithImages,
    spotBlocks,
    images,
    imageMode,
    handbookStyle,
    handbookStyleLabel,
    handbookStyleInstruction,
  } = options;

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
