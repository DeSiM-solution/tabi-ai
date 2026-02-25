import type { AgentRuntimeState } from './types';

export function createRuntimeState(): AgentRuntimeState {
  return {
    videoCache: new Map(),
    latestBlocks: [],
    latestSpotBlocks: [],
    spotCoordinatesResolved: false,
    latestVideoContext: null,
    latestApifyVideos: [],
    latestHandbookStyle: null,
    latestHandbookImages: [],
    latestImageMode: null,
    latestHandbookHtml: null,
    requestAborted: false,
    requestToolStatus: {},
    requestToolErrors: {},
    latestToolOutputs: {},
  };
}
