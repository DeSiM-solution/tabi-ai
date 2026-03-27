'use client';

import type { ReactNode } from 'react';

export type HandbookWorkspaceTab = 'edit' | 'spots' | 'remix';

type HandbookWorkspacePanelProps = {
  statusText: string;
  activeTab: HandbookWorkspaceTab;
  onTabChange: (tab: HandbookWorkspaceTab) => void;
  editContent: ReactNode;
  spotsContent: ReactNode;
  remixContent: ReactNode;
};

const TAB_LABELS: Array<{ id: HandbookWorkspaceTab; label: string }> = [
  { id: 'edit', label: 'Edit' },
  { id: 'spots', label: 'Spots' },
  { id: 'remix', label: 'Remix' },
];

export function HandbookWorkspacePanel({
  statusText,
  activeTab,
  onTabChange,
  editContent,
  spotsContent,
  remixContent,
}: HandbookWorkspacePanelProps) {
  const body =
    activeTab === 'edit'
      ? editContent
      : activeTab === 'spots'
        ? spotsContent
        : remixContent;

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg-elevated">
      <div className="border-b border-border-light px-5 pb-4 pt-5">
        <p className="text-[15px] font-semibold leading-[1.35] text-text-primary">
          Handbook Workspace
        </p>
        <p className="mt-1 text-[12px] font-medium leading-4 text-text-tertiary">
          {statusText}
        </p>
      </div>

      <div className="border-b border-border-light px-4 py-2">
        <div className="inline-flex items-center gap-1.5 rounded-[10px] px-3 py-2">
          {TAB_LABELS.map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabChange(tab.id)}
              className={`inline-flex h-8 min-w-[72px] items-center justify-center rounded-[8px] px-3 text-[12px] transition-colors ${
                activeTab === tab.id
                  ? 'bg-[#F0FDFA] text-[#0D9488] font-semibold'
                  : 'bg-[#F9FAFB] text-[#6B7280] font-medium'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">{body}</div>
    </div>
  );
}
