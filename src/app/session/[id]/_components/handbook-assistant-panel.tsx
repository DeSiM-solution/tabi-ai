'use client';

import type { ReactNode } from 'react';

import type {
  HandbookSelectionSnapshot,
  HandbookStyleProperty,
} from '../_lib/handbook-selection';
import { HandbookStyleConsole } from './handbook-style-console';

type HandbookAssistantPanelProps = {
  mode: 'edit' | 'processing';
  isManualEditorOpen: boolean;
  isVisualEditorReady: boolean;
  selection: HandbookSelectionSnapshot | null;
  onApplyStyle: (property: HandbookStyleProperty, value: string) => void;
  processingContent?: ReactNode;
};

export function HandbookAssistantPanel({
  mode,
  isManualEditorOpen,
  isVisualEditorReady,
  selection,
  onApplyStyle,
  processingContent,
}: HandbookAssistantPanelProps) {
  if (mode === 'processing') {
    return <div className="flex h-full min-h-0 flex-col bg-bg-elevated">{processingContent}</div>;
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 bg-bg-elevated px-3 py-3">
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <HandbookStyleConsole
          isManualEditorOpen={isManualEditorOpen}
          isVisualEditorReady={isVisualEditorReady}
          selection={selection}
          onApplyStyle={onApplyStyle}
        />
      </div>
    </div>
  );
}
