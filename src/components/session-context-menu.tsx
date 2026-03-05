'use client';

import type { RefObject } from 'react';
import { LuPencil, LuTrash2 } from 'react-icons/lu';

export interface SessionContextMenuState {
  sessionId: string;
  x: number;
  y: number;
}

interface SessionContextMenuProps {
  menu: SessionContextMenuState | null;
  menuRef: RefObject<HTMLDivElement | null>;
  onRename: (sessionId: string) => void;
  onDelete: (sessionId: string) => void;
}

export function SessionContextMenu({
  menu,
  menuRef,
  onRename,
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
