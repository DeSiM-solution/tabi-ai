import type { AgentToolContext } from '@/agent/context/types';
import { createBuildTravelBlocksTool } from './build-travel-blocks';
import { createCrawlYoutubeVideosTool } from './crawl-youtube-videos';
import { createGenerateHandbookHtmlTool } from './generate-handbook-html';
import { createGenerateImageTool } from './generate-image';
import { createParseYoutubeInputTool } from './parse-youtube-input';
import { createResolveSpotCoordinatesTool } from './resolve-spot-coordinates';
import { createSearchImageTool } from './search-image';
import { createSummarizeSessionDescriptionTool } from './summarize-session-description';

export function buildAgentTools(ctx: AgentToolContext) {
  return {
    parse_youtube_input: createParseYoutubeInputTool(ctx),
    crawl_youtube_videos: createCrawlYoutubeVideosTool(ctx),
    summarize_description: createSummarizeSessionDescriptionTool(ctx),
    build_travel_blocks: createBuildTravelBlocksTool(ctx),
    resolve_spot_coordinates: createResolveSpotCoordinatesTool(ctx),
    search_image: createSearchImageTool(ctx),
    generate_image: createGenerateImageTool(ctx),
    generate_handbook_html: createGenerateHandbookHtmlTool(ctx),
  };
}
