type VisibleSessionToolName =
  | 'parse_youtube_input'
  | 'crawl_youtube_videos'
  | 'analyze_session_data'
  | 'build_travel_blocks'
  | 'resolve_spot_coordinates'
  | 'search_image'
  | 'generate_image'
  | 'generate_handbook_html'
  | null;

type VisibleHandbookStatus = 'idle' | 'generating' | 'ready' | 'error';

type WorkspaceStatusArgs = {
  stopped: boolean;
  error: string | null;
  failedStep: VisibleSessionToolName;
  loading: boolean;
  currentStep: VisibleSessionToolName;
  completedStepsCount: number;
  hasRenderableHandbook: boolean;
};

type AssistantWorkspaceModeArgs = {
  requestLoading: boolean;
  handbookStatus: VisibleHandbookStatus;
  hasRenderableHandbook: boolean;
};

export type AssistantWorkspaceMode = 'processing' | 'edit';

export function formatVisibleToolLabel(step: VisibleSessionToolName): string {
  if (!step) return 'Idle';
  if (step === 'parse_youtube_input') return 'Parse Request';
  if (step === 'crawl_youtube_videos') return 'Crawl Video';
  if (step === 'analyze_session_data' || step === 'build_travel_blocks') {
    return 'Analyze Session Data';
  }
  if (step === 'resolve_spot_coordinates') return 'Resolve Spots';
  if (step === 'search_image' || step === 'generate_image') return 'Prepare Media';
  return 'Generate Handbook';
}

export function getWorkspaceStatusText({
  stopped,
  error,
  failedStep,
  loading,
  currentStep,
  completedStepsCount,
  hasRenderableHandbook,
}: WorkspaceStatusArgs): string {
  if (stopped) {
    return `Stopped while ${formatVisibleToolLabel(currentStep)}`;
  }

  if (error || failedStep) {
    return `Failed while ${formatVisibleToolLabel(failedStep ?? currentStep)}`;
  }

  if (loading) {
    return formatVisibleToolLabel(currentStep);
  }

  if (hasRenderableHandbook) {
    return 'Handbook ready for editing';
  }

  if (completedStepsCount > 0) {
    return 'Session data ready';
  }

  return 'Refine your guide';
}

export function getAssistantWorkspaceMode({
  requestLoading,
  handbookStatus,
  hasRenderableHandbook,
}: AssistantWorkspaceModeArgs): AssistantWorkspaceMode {
  void hasRenderableHandbook;

  if (requestLoading || handbookStatus === 'generating') {
    return 'processing';
  }

  return 'edit';
}
