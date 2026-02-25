import { z } from 'zod';

export const YOUTUBE_CONFIG = {
  APIFY: {
    ACTOR_ID: process.env.APIFY_YOUTUBE_ACTOR_ID ?? 'streamers~youtube-scraper',
    TIMEOUT_MS: 90_000,
  },
  CONTENT: {
    MAX_SUBTITLE_CHARS: 8_000,
    MAX_DESCRIPTION_CHARS: 4_000,
  },
} as const;

export const YOUTUBE_URL_REGEX =
  /https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=[\w-]{6,}|youtu\.be\/[\w-]{6,})[^\s)>"']*/gi;

export interface DescriptionLink {
  url: string;
  text: string;
}

export interface Subtitle {
  srtUrl: string | null;
  type: 'user_generated' | 'auto_generated';
  language: string;
  plaintext?: string;
  srt?: string;
}

export interface ApifyVideoResult {
  title: string;
  translatedTitle: string | null;
  type: 'video' | string;
  id: string;
  url: string;
  thumbnailUrl: string;
  viewCount: number;
  date: string;
  likes: number;
  location: string | null;
  channelName: string;
  channelUrl: string;
  channelUsername: string;
  collaborators: unknown[] | null;
  channelId: string;
  numberOfSubscribers: number;
  duration: string | number;
  commentsCount: number;
  text: string;
  translatedText: string | null;
  descriptionLinks: DescriptionLink[];
  subtitles: Subtitle[];
  commentsTurnedOff: boolean;
  isMonetized: boolean | null;
  hashtags: string[];
  formats: unknown[];
  isMembersOnly: boolean;
  input: string;
  isPaidContent: boolean;

  description?: string;
  channel?: {
    id: string;
    name: string;
    handle: string;
    url: string;
    subscriberCount: string;
    thumbnails: Array<{ url: string; width: number; height: number }>;
  };
  thumbnails?: Array<{ url: string; width: number; height: number }>;
  captions?: {
    captionTracks: Array<{
      baseUrl: string;
      languageCode: string;
      kind?: string;
    }>;
  };
}

export const blockTypeSchema = z.enum([
  'food',
  'spot',
  'transport',
  'shopping',
  'other',
]);

export const travelBlockSchema = z.object({
  block_id: z.string(),
  type: blockTypeSchema,
  title: z.string(),
  description: z.string(),
  location: z
    .object({
      lat: z.number(),
      lng: z.number(),
    })
    .nullable(),
  smart_tags: z.array(z.string()),
});

export type TravelBlock = z.infer<typeof travelBlockSchema>;

export const spotBlockSchema = z.object({
  block_id: z.string(),
  title: z.string(),
  description: z.string(),
  location: z
    .object({
      lat: z.number(),
      lng: z.number(),
    })
    .nullable(),
  smart_tags: z.array(z.string()),
});

export type SpotBlock = z.infer<typeof spotBlockSchema>;

export const travelBlocksOutputSchema = z.object({
  blocks: z.array(travelBlockSchema).min(1),
  spot_blocks: z.array(spotBlockSchema),
});

export type TravelBlocksOutput = z.infer<typeof travelBlocksOutputSchema>;

export const spotQueryOutputSchema = z.object({
  spot_queries: z.array(
    z.object({
      block_id: z.string(),
      query: z.string(),
    }),
  ),
});

export type SpotQueryOutput = z.infer<typeof spotQueryOutputSchema>;

export const handbookInputSchema = z.object({
  title: z.string().optional(),
  videoId: z.string().optional(),
  videoUrl: z.string().optional(),
  thumbnailUrl: z.string().optional(),
  handbookStyle: z.string().optional(),
  blocks: z.array(travelBlockSchema).min(1).optional(),
  spot_blocks: z.array(spotBlockSchema).optional(),
  images: z
    .array(
      z.object({
        block_id: z.string(),
        block_title: z.string().optional(),
        query: z.string().optional(),
        alt: z.string().optional(),
        image_url: z.string().optional(),
        source: z.enum(['unsplash', 'imagen']).optional(),
        source_page: z.string().nullable().optional(),
        credit: z.string().nullable().optional(),
        width: z.number().nullable().optional(),
        height: z.number().nullable().optional(),
      }),
    )
    .optional(),
});

export type HandbookInput = z.infer<typeof handbookInputSchema>;

export const MAX_HANDBOOK_IMAGES = 6;

export const handbookImagePlanSchema = z.object({
  images: z
    .array(
      z.object({
        block_id: z.string(),
        query: z.string().min(3),
        prompt: z.string().min(10),
        alt: z.string().min(3),
      }),
    )
    .min(1)
    .max(MAX_HANDBOOK_IMAGES),
});

export type HandbookImagePlan = z.infer<typeof handbookImagePlanSchema>;

export const handbookImageAssetSchema = z.object({
  block_id: z.string(),
  block_title: z.string(),
  query: z.string(),
  alt: z.string(),
  image_url: z.string(),
  source: z.enum(['unsplash', 'imagen']),
  source_page: z.string().nullable().optional(),
  credit: z.string().nullable().optional(),
  width: z.number().nullable().optional(),
  height: z.number().nullable().optional(),
});

export type HandbookImageAsset = z.infer<typeof handbookImageAssetSchema>;

export type PersistedToolName =
  | 'parse_youtube_input'
  | 'crawl_youtube_videos'
  | 'build_travel_blocks'
  | 'resolve_spot_coordinates'
  | 'search_image'
  | 'generate_image'
  | 'generate_handbook_html';

export interface VideoContext {
  videoId: string;
  videoUrl: string;
  title: string;
  thumbnailUrl: string | null;
  location: string | null;
  hashtags: string[];
}
