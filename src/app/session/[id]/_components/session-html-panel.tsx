import type { RefObject } from 'react';
import { LuRefreshCw } from 'react-icons/lu';

import type { HandbookStatus } from '../_stores/session-editor-store';

import { HandbookVersionMenu, type HandbookVersionMenuItem } from './handbook-version-menu';

type SessionHtmlPanelProps = {
  isSessionHydrating: boolean;
  previewFrameWidth: number;
  previewFrameMaxHeight: string;
  previewFrameOpacityClass: string;
  showNewHandbookLoadingState: boolean;
  showHtmlPreviewOverlay: boolean;
  htmlPreviewLoadPhase: 'idle' | 'loading' | 'revealing';
  handbookPreviewUrl: string | null;
  handbookHtml: string | null;
  handbookStatus: HandbookStatus;
  handbookError: string | null;
  onHtmlPreviewLoad: () => void;
  handbookVersionMenuItems: HandbookVersionMenuItem[];
  activeHandbookId: string | null;
  activeHandbook: HandbookVersionMenuItem | null;
  previewAddress: string;
  isVersionMenuOpen: boolean;
  isRemovingHandbookVersion: boolean;
  versionMenuRef: RefObject<HTMLDivElement | null>;
  onToggleVersionMenu: () => void;
  onSelectHandbook: (handbook: HandbookVersionMenuItem) => void;
  onRequestDeleteHandbook: (handbookId: string) => void;
};

export function SessionHtmlPanel({
  isSessionHydrating,
  previewFrameWidth,
  previewFrameMaxHeight,
  previewFrameOpacityClass,
  showNewHandbookLoadingState,
  showHtmlPreviewOverlay,
  htmlPreviewLoadPhase,
  handbookPreviewUrl,
  handbookHtml,
  handbookStatus,
  handbookError,
  onHtmlPreviewLoad,
  handbookVersionMenuItems,
  activeHandbookId,
  activeHandbook,
  previewAddress,
  isVersionMenuOpen,
  isRemovingHandbookVersion,
  versionMenuRef,
  onToggleVersionMenu,
  onSelectHandbook,
  onRequestDeleteHandbook,
}: SessionHtmlPanelProps) {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center overflow-hidden bg-bg-primary px-6 pt-0">
      <div
        className="relative h-full overflow-hidden rounded-[12px] border border-border-light bg-bg-elevated transition-[width,max-height] duration-200"
        style={{
          width: `min(100%, ${previewFrameWidth}px)`,
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

        <div className="relative h-[calc(100%-40px)] overflow-hidden bg-bg-elevated">
          {!showNewHandbookLoadingState && handbookPreviewUrl && (
            <iframe
              title="Guide Preview"
              src={handbookPreviewUrl}
              className={`absolute inset-0 h-full w-full bg-bg-elevated transition-opacity duration-500 ease-out ${previewFrameOpacityClass}`}
              onLoad={onHtmlPreviewLoad}
              sandbox="allow-scripts allow-same-origin allow-forms"
            />
          )}

          {!showNewHandbookLoadingState && !handbookPreviewUrl && handbookHtml && (
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

          {showHtmlPreviewOverlay && (
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
                {handbookError || 'Failed to generate guide HTML.'}
              </p>
            </div>
          )}

          {!handbookPreviewUrl &&
            !handbookHtml &&
            handbookStatus !== 'generating' &&
            handbookStatus !== 'error' && (
              <div className="absolute inset-0 flex items-center justify-center bg-bg-elevated px-6 text-center">
                <p className="max-w-lg text-sm font-medium text-text-tertiary">
                  No guide HTML yet. Generate once, then switch between HTML and
                  blocks without regenerating.
                </p>
              </div>
            )}
        </div>
      </div>
    </div>
  );
}
