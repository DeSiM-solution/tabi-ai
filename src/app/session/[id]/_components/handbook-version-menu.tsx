import { LuChevronDown, LuRefreshCw, LuTrash2 } from 'react-icons/lu';
import type { RefObject } from 'react';

import { withTooltip } from '@/lib/tooltip';
import { type HandbookLifecycle } from '@/lib/handbook-lifecycle';

import {
  getHandbookLifecycleBadgeClass,
  getHandbookLifecycleStatusLabel,
  toHandbookCreatedAtTooltip,
} from '../_lib/handbook-utils';

export type HandbookVersionMenuItem = {
  id: string;
  title: string;
  lifecycle: HandbookLifecycle;
  createdAt: string;
  isPending: boolean;
  isGenerating: boolean;
};

type HandbookVersionMenuProps = {
  previewAddress: string;
  items: HandbookVersionMenuItem[];
  activeHandbookId: string | null;
  activeHandbook: HandbookVersionMenuItem | null;
  isOpen: boolean;
  isSessionHydrating: boolean;
  isRemovingHandbookVersion: boolean;
  versionMenuRef: RefObject<HTMLDivElement | null>;
  onToggleOpen: () => void;
  onSelectHandbook: (handbook: HandbookVersionMenuItem) => void;
  onRequestDelete: (handbookId: string) => void;
};

export function HandbookVersionMenu({
  previewAddress,
  items,
  activeHandbookId,
  activeHandbook,
  isOpen,
  isSessionHydrating,
  isRemovingHandbookVersion,
  versionMenuRef,
  onToggleOpen,
  onSelectHandbook,
  onRequestDelete,
}: HandbookVersionMenuProps) {
  return (
    <div
      className="relative flex h-7 min-w-0 flex-1 items-center"
      ref={versionMenuRef}
    >
      <button
        type="button"
        onClick={onToggleOpen}
        disabled={items.length === 0 || isSessionHydrating || isRemovingHandbookVersion}
        className={`inline-flex h-7 w-full min-w-0 items-center gap-2 overflow-hidden px-2.5 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${
          isOpen
            ? 'rounded-t-[6px] rounded-b-none border border-border-light border-b-0 bg-bg-elevated shadow-[0_10px_24px_rgba(45,42,38,0.14)]'
            : 'rounded-[6px] bg-bg-elevated hover:bg-bg-primary'
        }`}
      >
        {activeHandbook && (
          <span
            className={`inline-flex shrink-0 items-center rounded-[5px] px-1.5 py-[1px] text-[10px] font-semibold ${getHandbookLifecycleBadgeClass(
              activeHandbook.lifecycle,
            )}`}
          >
            {getHandbookLifecycleStatusLabel(activeHandbook.lifecycle)}
          </span>
        )}
        <span className="min-w-0 flex-1 truncate text-[12px] font-normal text-text-primary">
          {previewAddress}
        </span>
        <LuChevronDown
          className={`h-3 w-3 shrink-0 text-[#9C968F] transition-transform ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>
      {isOpen && (
        <div className="absolute left-0 right-0 top-full z-30 w-full overflow-visible rounded-b-[10px] rounded-t-none border border-border-light border-t-0 bg-bg-elevated p-1">
          {items.map(handbook => {
            const selected = handbook.id === activeHandbookId;
            const createdAtTooltip = toHandbookCreatedAtTooltip(handbook.createdAt);
            return (
              <div
                key={handbook.id}
                className={`flex items-center gap-1 rounded-[7px] px-1 py-[4px] transition ${
                  selected ? 'bg-bg-secondary' : 'hover:bg-bg-primary'
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelectHandbook(handbook)}
                  className="flex min-w-0 flex-1 items-center gap-2 rounded-[6px] px-[8px] py-[4px] text-left"
                >
                  <span
                    data-tooltip={createdAtTooltip}
                    className={withTooltip(
                      `inline-flex shrink-0 items-center rounded-[5px] px-1.5 py-[1px] text-[10px] font-semibold ${getHandbookLifecycleBadgeClass(
                        handbook.lifecycle,
                      )}`,
                    )}
                  >
                    {getHandbookLifecycleStatusLabel(handbook.lifecycle)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] font-medium text-text-primary">
                      {handbook.title || 'Untitled guide'}
                    </span>
                    <span className="block truncate text-[11px] text-text-secondary">
                      {handbook.isGenerating
                        ? 'Generating Handbook...'
                        : `/api/guide/${handbook.id}`}
                    </span>
                  </span>
                  {handbook.isGenerating && (
                    <LuRefreshCw className="h-3.5 w-3.5 shrink-0 animate-spin text-accent-primary" />
                  )}
                </button>
                {!handbook.isPending && (
                  <button
                    type="button"
                    onClick={() => onRequestDelete(handbook.id)}
                    disabled={isRemovingHandbookVersion}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-[6px] text-[#9C968F] transition hover:bg-bg-elevated hover:text-accent-secondary disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label={`Delete ${handbook.title || 'Untitled guide'}`}
                  >
                    <LuTrash2 className="h-[14px] w-[14px]" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
