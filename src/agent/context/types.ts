import type { HandbookStyleId } from '@/lib/handbook-style';
import type {
  ApifyVideoResult,
  HandbookImageAsset,
  PersistedToolName,
  SpotBlock,
  TravelBlock,
  VideoContext,
} from '@/agent/tools/types';

export interface AgentRuntimeState {
  videoCache: Map<string, ApifyVideoResult>;
  latestBlocks: TravelBlock[];
  latestSpotBlocks: SpotBlock[];
  spotCoordinatesResolved: boolean;
  latestVideoContext: VideoContext | null;
  latestApifyVideos: ApifyVideoResult[];
  latestHandbookStyle: HandbookStyleId | null;
  latestHandbookImages: HandbookImageAsset[];
  latestImageMode: 'search_image' | 'generate_image' | null;
  latestHandbookHtml: string | null;
  requestAborted: boolean;
  latestToolOutputs: Record<string, unknown>;
}

export interface AgentToolContext {
  req: Request;
  sessionId: string | null;
  runtime: AgentRuntimeState;
  runToolStep: <T>(
    toolName: PersistedToolName,
    input: unknown,
    execute: () => Promise<T>,
  ) => Promise<T>;
}
