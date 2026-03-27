import type { EditorSession } from '../_lib/chat-utils';

import { BlockEditorWorkspace } from './block-editor-workspace';

type SessionBlocksPanelProps = {
  editorSession: EditorSession | null;
  isSessionHydrating: boolean;
  isSavingBlocks: boolean;
  onChangeEditorSession: (nextSession: EditorSession) => void;
  showBlocksLoadingState: boolean;
};

export function SessionBlocksPanel({
  editorSession,
  isSessionHydrating,
  isSavingBlocks,
  onChangeEditorSession,
  showBlocksLoadingState,
}: SessionBlocksPanelProps) {
  if (editorSession && !isSessionHydrating) {
    return (
      <div className="absolute inset-0 z-20">
        <BlockEditorWorkspace
          session={editorSession}
          disabled={isSavingBlocks}
          onChange={onChangeEditorSession}
        />
      </div>
    );
  }

  if (!editorSession && !showBlocksLoadingState && !isSessionHydrating) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-bg-elevated px-6 text-center">
        <p className="max-w-lg text-sm font-medium text-text-tertiary">
          No structured session data is ready yet. Once analysis output is available, the
          source data workspace can open here for manual review.
        </p>
      </div>
    );
  }

  return null;
}
