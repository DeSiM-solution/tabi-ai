import type { RefObject } from 'react';
import { LuRefreshCw } from 'react-icons/lu';

import type {
  HandbookSelectionSnapshot,
  HandbookStyleProperty,
} from '../_lib/handbook-selection';
import type { HandbookStatus } from '../_stores/session-editor-store';

import { HandbookManualEditor } from './handbook-manual-editor';
import { HandbookVersionMenu, type HandbookVersionMenuItem } from './handbook-version-menu';

type SessionHtmlPanelProps = {
  isSessionHydrating: boolean;
  previewFrameWidth: string;
  previewFrameMaxHeight: string;
  previewFrameOpacityClass: string;
  showNewHandbookLoadingState: boolean;
  showProcessingState: boolean;
  showHtmlPreviewOverlay: boolean;
  htmlPreviewLoadPhase: 'idle' | 'loading' | 'revealing';
  handbookPreviewUrl: string | null;
  handbookHtml: string | null;
  handbookStatus: HandbookStatus;
  handbookError: string | null;
  sessionImageUrls: string[];
  onHtmlPreviewLoad: () => void;
  handbookVersionMenuItems: HandbookVersionMenuItem[];
  activeHandbookId: string | null;
  activeHandbook: HandbookVersionMenuItem | null;
  previewAddress: string;
  isVersionMenuOpen: boolean;
  isRemovingHandbookVersion: boolean;
  versionMenuRef: RefObject<HTMLDivElement | null>;
  isManualEditorAvailable: boolean;
  isManualEditorLoading: boolean;
  manualEditorHtml: string;
  onToggleVersionMenu: () => void;
  onSelectHandbook: (handbook: HandbookVersionMenuItem) => void;
  onRequestDeleteHandbook: (handbookId: string) => void;
  onChangeManualEditorHtml: (nextHtml: string) => void;
  onVisualEditorReadyChange?: (isReady: boolean) => void;
  onVisualSelectionChange?: (selection: HandbookSelectionSnapshot | null) => void;
  onVisualApplyStyleReady?: (
    applyStyle: ((property: HandbookStyleProperty, value: string) => boolean) | null,
  ) => void;
};

export function SessionHtmlPanel({
  isSessionHydrating,
  previewFrameWidth,
  previewFrameMaxHeight,
  previewFrameOpacityClass,
  showNewHandbookLoadingState,
  showProcessingState,
  showHtmlPreviewOverlay,
  htmlPreviewLoadPhase,
  handbookPreviewUrl,
  handbookHtml,
  handbookStatus,
  handbookError,
  sessionImageUrls,
  onHtmlPreviewLoad,
  handbookVersionMenuItems,
  activeHandbookId,
  activeHandbook,
  previewAddress,
  isVersionMenuOpen,
  isRemovingHandbookVersion,
  versionMenuRef,
  isManualEditorAvailable,
  isManualEditorLoading,
  manualEditorHtml,
  onToggleVersionMenu,
  onSelectHandbook,
  onRequestDeleteHandbook,
  onChangeManualEditorHtml,
  onVisualEditorReadyChange,
  onVisualSelectionChange,
  onVisualApplyStyleReady,
}: SessionHtmlPanelProps) {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center overflow-hidden bg-bg-primary p-4">
      <div
        className="relative h-full overflow-hidden rounded-[14px] border border-border-light bg-bg-elevated transition-[width,max-height] duration-200"
        style={{
          width: previewFrameWidth,
          maxWidth: '100%',
          maxHeight: previewFrameMaxHeight,
        }}
      >
        <div className="flex h-10 items-center gap-3 border-b border-border-light bg-bg-secondary px-3">
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full bg-rose-500" />
            <span className="h-3 w-3 rounded-full bg-amber-400" />
            <span className="h-3 w-3 rounded-full bg-emerald-500" />
          </div>
          <div className="min-w-0 flex-1">
            <HandbookVersionMenu
              previewAddress={previewAddress}
              items={handbookVersionMenuItems}
              activeHandbookId={activeHandbookId}
              activeHandbook={activeHandbook}
              isOpen={isVersionMenuOpen}
              isSessionHydrating={isSessionHydrating}
              isRemovingHandbookVersion={isRemovingHandbookVersion}
              versionMenuRef={versionMenuRef}
              onToggleOpen={onToggleVersionMenu}
              onSelectHandbook={onSelectHandbook}
              onRequestDelete={onRequestDeleteHandbook}
            />
          </div>
        </div>

        <div className="relative h-[calc(100%-40px)] overflow-hidden bg-bg-elevated">
          {isManualEditorAvailable && (
            <HandbookManualEditor
              draftHtml={manualEditorHtml}
              sessionImageUrls={sessionImageUrls}
              isLoading={isManualEditorLoading}
              onChange={onChangeManualEditorHtml}
              onVisualEditorReadyChange={onVisualEditorReadyChange}
              onVisualSelectionChange={onVisualSelectionChange}
              onVisualApplyStyleReady={onVisualApplyStyleReady}
            />
          )}

          {!isManualEditorAvailable && !showNewHandbookLoadingState && handbookPreviewUrl && (
            <iframe
              title="Guide Preview"
              src={handbookPreviewUrl}
              className={`absolute inset-0 h-full w-full bg-bg-elevated transition-opacity duration-500 ease-out ${previewFrameOpacityClass}`}
              onLoad={onHtmlPreviewLoad}
              sandbox="allow-scripts allow-same-origin allow-forms"
            />
          )}

          {!isManualEditorAvailable && !showNewHandbookLoadingState && !handbookPreviewUrl && handbookHtml && (
            <iframe
              title="Guide Preview"
              srcDoc={handbookHtml}
              className={`absolute inset-0 h-full w-full bg-bg-elevated transition-opacity duration-500 ease-out ${previewFrameOpacityClass}`}
              onLoad={onHtmlPreviewLoad}
            />
          )}

          {showNewHandbookLoadingState && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-white">
              <div className="flex flex-col items-center gap-2">
                <LuRefreshCw className="h-7 w-7 animate-spin text-accent-primary" />
                <p className="text-[13px] font-medium text-text-secondary">
                  Generating Handbook...
                </p>
              </div>
            </div>
          )}

          {!showNewHandbookLoadingState && showProcessingState && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-white">
              <div className="flex flex-col items-center gap-2">
                <LuRefreshCw className="h-7 w-7 animate-spin text-accent-primary" />
                <p className="text-[13px] font-medium text-text-secondary">
                  Generating handbook
                </p>
              </div>
            </div>
          )}

          {!isManualEditorAvailable && showHtmlPreviewOverlay && (
            <div
              className={`absolute inset-0 z-10 flex items-center justify-center transition-[background-color] duration-500 ${
                htmlPreviewLoadPhase === 'loading'
                  ? 'bg-bg-elevated'
                  : 'bg-bg-elevated/78'
              }`}
            >
              <div
                className={`flex flex-col items-center gap-2 transition-opacity duration-300 ${
                  htmlPreviewLoadPhase === 'revealing' ? 'opacity-95' : 'opacity-100'
                }`}
              >
                <LuRefreshCw className="h-7 w-7 animate-spin text-accent-primary" />
                <p className="text-[13px] font-medium text-text-secondary">
                  Loading preview...
                </p>
              </div>
            </div>
          )}

          {!showNewHandbookLoadingState &&
            !showProcessingState &&
            !handbookPreviewUrl &&
            !handbookHtml &&
            handbookStatus === 'generating' && (
            <div className="absolute inset-0 flex items-center justify-center bg-white">
              <div className="flex flex-col items-center gap-2">
                <LuRefreshCw className="h-7 w-7 animate-spin text-accent-primary" />
                <p className="text-[13px] font-medium text-text-secondary">
                  Generating Handbook...
                </p>
              </div>
            </div>
          )}

          {!handbookHtml && handbookStatus === 'error' && (
            <div className="absolute inset-0 flex items-center justify-center bg-bg-elevated px-6 text-center">
              <p className="max-w-lg text-sm font-medium text-status-error">
                {handbookError || 'Failed to load handbook HTML.'}
              </p>
            </div>
          )}

          {!handbookPreviewUrl &&
            !handbookHtml &&
            handbookStatus !== 'generating' &&
            !showProcessingState &&
            handbookStatus !== 'error' && (
              <div className="absolute inset-0 flex items-center justify-center bg-bg-elevated px-6 text-center">
                <p className="max-w-lg text-sm font-medium text-text-tertiary">
                  No handbook yet. Start a generation and the visual editor will attach
                  automatically when the handbook is ready.
                </p>
              </div>
            )}
        </div>
      </div>
    </div>
  );
}
