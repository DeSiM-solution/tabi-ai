import { useEffect } from 'react';
import { LuRefreshCw } from 'react-icons/lu';

import type {
  HandbookSelectionSnapshot,
  HandbookStyleProperty,
} from '../_lib/handbook-selection';

import { HandbookVisualEditor } from './handbook-visual-editor';

type HandbookManualEditorProps = {
  draftHtml: string;
  sessionImageUrls: string[];
  isLoading: boolean;
  onChange: (nextHtml: string) => void;
  onVisualEditorReadyChange?: (isReady: boolean) => void;
  onVisualSelectionChange?: (selection: HandbookSelectionSnapshot | null) => void;
  onVisualApplyStyleReady?: (
    applyStyle: ((property: HandbookStyleProperty, value: string) => boolean) | null,
  ) => void;
};

export function HandbookManualEditor({
  draftHtml,
  sessionImageUrls,
  isLoading,
  onChange,
  onVisualEditorReadyChange,
  onVisualSelectionChange,
  onVisualApplyStyleReady,
}: HandbookManualEditorProps) {
  useEffect(() => {
    if (!isLoading) return;
    onVisualEditorReadyChange?.(false);
    onVisualSelectionChange?.(null);
    onVisualApplyStyleReady?.(null);
  }, [
    isLoading,
    onVisualApplyStyleReady,
    onVisualEditorReadyChange,
    onVisualSelectionChange,
  ]);

  if (isLoading) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-bg-elevated">
        <div className="flex flex-col items-center gap-2">
          <LuRefreshCw className="h-7 w-7 animate-spin text-accent-primary" />
          <p className="text-[13px] font-medium text-text-secondary">
            Loading handbook HTML...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 flex min-h-0 flex-col bg-bg-elevated">
      <div className="min-h-0 flex-1 bg-white">
        <HandbookVisualEditor
          documentHtml={draftHtml}
          sessionImageUrls={sessionImageUrls}
          onChange={onChange}
          onReadyChange={onVisualEditorReadyChange}
          onSelectionChange={onVisualSelectionChange}
          onApplyStyleReady={onVisualApplyStyleReady}
        />
      </div>
    </div>
  );
}
