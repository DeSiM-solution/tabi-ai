'use client';

import type { RefObject } from 'react';
import { LuArchive, LuCheck, LuFileText, LuGlobe, LuPencil, LuTrash2 } from 'react-icons/lu';
import { getHandbookLifecycleLabel, type HandbookLifecycle } from '@/lib/handbook-lifecycle';

export interface SessionContextMenuState {
  sessionId: string;
  x: number;
  y: number;
}

interface SessionContextMenuProps {
  menu: SessionContextMenuState | null;
  menuRef: RefObject<HTMLDivElement | null>;
  lifecycle: HandbookLifecycle;
  hasContextSession: boolean;
  isUpdatingLifecycle: boolean;
  lifecycleOptions: HandbookLifecycle[];
  onRename: (sessionId: string) => void;
  onLifecycleChange: (sessionId: string, lifecycle: HandbookLifecycle) => void;
  onDelete: (sessionId: string) => void;
}

function renderLifecycleIcon(lifecycle: HandbookLifecycle) {
  if (lifecycle === 'PUBLIC') {
    return <LuGlobe className="h-[14px] w-[14px] shrink-0 text-emerald-600" />;
  }
  if (lifecycle === 'ARCHIVED') {
    return <LuArchive className="h-[14px] w-[14px] shrink-0 text-zinc-500" />;
  }
  return <LuFileText className="h-[14px] w-[14px] shrink-0 text-amber-600" />;
}

export function SessionContextMenu({
  menu,
  menuRef,
  lifecycle,
  hasContextSession,
  isUpdatingLifecycle,
  lifecycleOptions,
  onRename,
  onLifecycleChange,
  onDelete,
}: SessionContextMenuProps) {
  if (!menu) return null;

  return (
    <div
      ref={menuRef}
      style={{ top: menu.y, left: menu.x }}
      className="fixed z-50 w-[208px] overflow-hidden rounded-[8px] bg-bg-elevated p-1 shadow-[0_4px_12px_rgba(0,0,0,0.09)]"
    >
      <button
        type="button"
        onClick={() => onRename(menu.sessionId)}
        className="flex w-full items-center gap-[10px] rounded-[6px] px-3 py-2 text-left text-[13px] font-normal text-text-primary transition hover:bg-bg-secondary/70"
      >
        <LuPencil className="h-[15px] w-[15px] shrink-0 text-text-secondary" />
        Rename
      </button>
      <div className="mx-1 my-1 h-px bg-border-light" />
      <p className="px-3 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-[0.04em] text-text-tertiary">
        Visibility
      </p>
      {lifecycleOptions.map(option => {
        const isSelected = option === lifecycle;
        return (
          <button
            key={option}
            type="button"
            role="menuitemradio"
            aria-checked={isSelected}
            onClick={() => onLifecycleChange(menu.sessionId, option)}
            disabled={isSelected || isUpdatingLifecycle || !hasContextSession}
            className="flex w-full items-center justify-between rounded-[6px] px-3 py-2 text-left text-[13px] font-normal text-text-primary transition hover:bg-bg-secondary/70 disabled:cursor-not-allowed disabled:text-text-tertiary disabled:opacity-60"
          >
            <span className="inline-flex items-center gap-2">
              {renderLifecycleIcon(option)}
              <span>{getHandbookLifecycleLabel(option)}</span>
            </span>
            {isSelected ? <LuCheck className="h-[14px] w-[14px]" /> : null}
          </button>
        );
      })}
      <div className="mx-1 my-1 h-px bg-border-light" />
      <button
        type="button"
        onClick={() => onDelete(menu.sessionId)}
        className="flex w-full items-center gap-[10px] rounded-[6px] px-3 py-2 text-left text-[13px] font-normal text-accent-secondary transition hover:bg-bg-secondary/70"
      >
        <LuTrash2 className="h-[15px] w-[15px] shrink-0 text-accent-secondary" />
        Delete
      </button>
    </div>
  );
}
