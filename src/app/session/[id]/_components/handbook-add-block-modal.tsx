'use client';

import { useEffect, useRef, useState } from 'react';
import type { IconType } from 'react-icons';
import {
  LuArrowDownToLine,
  LuArrowUpToLine,
  LuHeading,
  LuImage,
  LuLink,
  LuMinus,
  LuMousePointerClick,
  LuText,
} from 'react-icons/lu';

import type {
  HandbookAddBlockElementType,
  HandbookAddBlockInsertPosition,
  HandbookAddBlockSelection,
} from '../_lib/handbook-add-block';
import type { HandbookSelectionAnchorRect } from '../_lib/handbook-selection';
import { resolveHandbookAddBlockModalPosition } from '../_lib/handbook-add-block-modal-position';

type HandbookAddBlockModalProps = {
  open: boolean;
  title?: string;
  triggerRect: HandbookSelectionAnchorRect | null;
  viewportWidth: number;
  viewportHeight: number;
  defaultInsertPosition?: HandbookAddBlockInsertPosition;
  onAddBlock: (selection: HandbookAddBlockSelection) => void | boolean;
  onClose: () => void;
};

type BlockOption = {
  id: HandbookAddBlockElementType;
  label: string;
  icon: IconType;
};

const MODAL_WIDTH = 212;
const MODAL_FALLBACK_HEIGHT = 392;

const BLOCK_OPTIONS: readonly BlockOption[] = [
  { id: 'heading', label: 'Heading', icon: LuHeading },
  { id: 'text', label: 'Text', icon: LuText },
  { id: 'link', label: 'Link', icon: LuLink },
  { id: 'divider', label: 'Divider', icon: LuMinus },
  { id: 'image', label: 'Image', icon: LuImage },
  { id: 'button', label: 'Button', icon: LuMousePointerClick },
] as const;

export function HandbookAddBlockModal({
  open,
  title = 'Add Block',
  triggerRect,
  viewportWidth,
  viewportHeight,
  defaultInsertPosition = 'after',
  onAddBlock,
  onClose,
}: HandbookAddBlockModalProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [insertPosition, setInsertPosition] = useState<HandbookAddBlockInsertPosition>(
    defaultInsertPosition,
  );
  const panelHeight = MODAL_FALLBACK_HEIGHT;

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (panelRef.current?.contains(target)) return;
      onClose();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      onClose();
    };

    document.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, open]);

  if (!open || !triggerRect) return null;

  const position = resolveHandbookAddBlockModalPosition({
    triggerRect,
    panelWidth: MODAL_WIDTH,
    panelHeight,
    viewportWidth,
    viewportHeight,
    gap: 8,
    padding: 8,
  });
  if (!position) return null;

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="false"
      aria-label={title}
      className="pointer-events-auto absolute z-[82] flex w-[212px] flex-col gap-3 rounded-[14px] border border-[#D4D0CB] bg-[#FFFFFF] p-3 shadow-[0_10px_24px_rgba(0,0,0,0.08)]"
      style={{
        top: position.top,
        left: position.left,
      }}
    >
      <h3 className="text-[15px] font-semibold leading-5 text-[#2D2A26]">{title}</h3>

      <div className="flex h-[46px] items-stretch gap-1 rounded-[10px] bg-[#F5F3EF] p-[3px]">
        <button
          type="button"
          aria-label="Insert before"
          aria-pressed={insertPosition === 'before'}
          onClick={() => setInsertPosition('before')}
          className={`flex flex-1 items-center justify-center rounded-[8px] transition ${
            insertPosition === 'before'
              ? 'border border-[#E8E6E3] bg-[#FFFFFF] text-[#2D2A26]'
              : 'bg-transparent text-[#6B6560] hover:bg-[#FFFFFF]/80'
          }`}
        >
          <LuArrowUpToLine className="h-[18px] w-[18px]" />
        </button>

        <button
          type="button"
          aria-label="Insert after"
          aria-pressed={insertPosition === 'after'}
          onClick={() => setInsertPosition('after')}
          className={`flex flex-1 items-center justify-center rounded-[8px] transition ${
            insertPosition === 'after'
              ? 'bg-[#F0FDFA] text-[#0D9488]'
              : 'bg-transparent text-[#6B6560] hover:bg-[#FFFFFF]/80'
          }`}
        >
          <LuArrowDownToLine className="h-[18px] w-[18px]" />
        </button>
      </div>

      <div className="flex flex-col gap-[6px]">
        {BLOCK_OPTIONS.map(option => {
          const Icon = option.icon;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => {
                const shouldClose = onAddBlock({
                  insertPosition,
                  elementType: option.id,
                });
                if (shouldClose !== false) {
                  onClose();
                }
              }}
              className="flex w-full items-center gap-3 rounded-[10px] border border-[#D4D0CB] bg-[#FFFFFF] px-[14px] py-2.5 text-left text-[#2D2A26] transition hover:bg-[#FAFAF8]"
            >
              <Icon className="h-[18px] w-[18px] shrink-0" />
              <span className="text-[15px] font-medium leading-5">{option.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
