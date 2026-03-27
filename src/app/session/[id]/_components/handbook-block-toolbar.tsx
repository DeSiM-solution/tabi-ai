'use client';

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import {
  LuArrowUp,
  LuCopy,
  LuMove,
  LuSparkles,
  LuTrash2,
} from 'react-icons/lu';

import type { HandbookBlockToolbarActions } from '../_hooks/use-grapesjs-editor';
import type { HandbookSelectionSnapshot } from '../_lib/handbook-selection';
import { resolveHandbookBlockToolbarPosition } from '../_lib/handbook-block-toolbar-position';

type HandbookBlockToolbarProps = {
  selection: HandbookSelectionSnapshot;
  actions: HandbookBlockToolbarActions;
  canvasRect?: {
    top: number;
    left: number;
    width: number;
    height: number;
  } | null;
};

function IconButton({
  label,
  icon,
  disabled = false,
  onClick,
}: {
  label?: string;
  icon: ReactNode;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`inline-flex h-6 w-6 items-center justify-center rounded-[4px] text-[#F8FAFC] transition ${
        disabled
          ? 'cursor-not-allowed opacity-55'
          : 'hover:bg-white/15'
      }`}
    >
      {icon}
    </button>
  );
}

export function HandbookBlockToolbar({
  selection,
  actions,
  canvasRect = null,
}: HandbookBlockToolbarProps) {
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const [toolbarWidth, setToolbarWidth] = useState(240);

  useLayoutEffect(() => {
    if (!selection.anchorRect) return;
    const width = Math.ceil(toolbarRef.current?.getBoundingClientRect().width ?? 0);
    if (width > 0 && width !== toolbarWidth) {
      setToolbarWidth(width);
    }
  }, [toolbarWidth, selection.anchorRect, selection.componentId]);

  if (!selection.anchorRect || typeof window === 'undefined') {
    return null;
  }

  const anchorRect = canvasRect
    ? {
        top: selection.anchorRect.top - canvasRect.top,
        left: selection.anchorRect.left - canvasRect.left,
        width: selection.anchorRect.width,
        height: selection.anchorRect.height,
      }
    : selection.anchorRect;

  const position = resolveHandbookBlockToolbarPosition({
    anchorRect,
    toolbarWidth,
    toolbarHeight: 32,
    viewportWidth: canvasRect?.width ?? window.innerWidth,
    viewportHeight: canvasRect?.height ?? window.innerHeight,
  });
  if (!position) return null;

  return (
    <div
      className={`pointer-events-none z-[80] ${canvasRect ? 'absolute' : 'fixed'}`}
      style={{
        top: position.top,
        left: position.left,
      }}
    >
      <div
        ref={toolbarRef}
        className="pointer-events-auto flex h-8 max-w-[calc(100vw-16px)] items-center gap-0.5 rounded-[6px] border border-[#3B97E3] bg-[#3B97E3] px-1 shadow-[0_2px_8px_rgba(0,0,0,0.10)]"
      >
        <IconButton
          label="AI Tool"
          icon={<LuSparkles className="h-3 w-3" />}
          onClick={() => {
            actions.openAiTool();
          }}
        />

        <IconButton
          label="Select Parent"
          icon={<LuArrowUp className="h-3 w-3" />}
          disabled={!selection.canSelectParent}
          onClick={() => {
            actions.selectParent();
          }}
        />
        <IconButton
          label="Drag to move"
          icon={<LuMove className="h-3 w-3" />}
          onClick={() => {
            actions.dragToMove();
          }}
        />
        <IconButton
          label="Duplicate"
          icon={<LuCopy className="h-3 w-3" />}
          disabled={!selection.canDuplicate}
          onClick={() => {
            actions.duplicateSelection();
          }}
        />
        <IconButton
          label="Delete"
          icon={<LuTrash2 className="h-3 w-3" />}
          disabled={!selection.canDelete}
          onClick={() => {
            actions.deleteSelection();
          }}
        />
      </div>
    </div>
  );
}
