'use client';

import {
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { LuChevronDown } from 'react-icons/lu';

type HandbookSelectControlProps = {
  value: string;
  options: readonly string[];
  onChange: (nextValue: string) => void;
  placeholder?: string;
  optionLabels?: Record<string, string>;
  variant?: 'default' | 'toolbar';
};

function useDismissibleLayer(
  open: boolean,
  onClose: () => void,
  rootRef: RefObject<HTMLElement | null>,
  panelRef?: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (rootRef.current?.contains(target)) return;
      if (panelRef?.current?.contains(target)) return;
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
  }, [onClose, open, panelRef, rootRef]);
}

function useFloatingLayerPosition({
  open,
  triggerRef,
  panelRef,
  width,
  align = 'start',
  offset = 4,
}: {
  open: boolean;
  triggerRef: RefObject<HTMLElement | null>;
  panelRef: RefObject<HTMLElement | null>;
  width: number | 'trigger';
  align?: 'start' | 'end';
  offset?: number;
}) {
  const [style, setStyle] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  useLayoutEffect(() => {
    if (!open) return;
    if (typeof window === 'undefined') return;

    const updatePosition = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;

      const rect = trigger.getBoundingClientRect();
      const nextWidth = width === 'trigger' ? rect.width : width;
      const panelHeight = panelRef.current?.offsetHeight ?? 220;
      const viewportPadding = 8;
      const viewportBottom = window.innerHeight - viewportPadding;
      const spaceBelow = viewportBottom - rect.bottom;
      const spaceAbove = rect.top - viewportPadding;
      const shouldOpenUpward = spaceBelow < Math.min(panelHeight, 220) && spaceAbove > spaceBelow;

      let nextTop = shouldOpenUpward
        ? rect.top - panelHeight - offset
        : rect.bottom + offset;
      if (nextTop < viewportPadding) {
        nextTop = viewportPadding;
      }
      if (nextTop + panelHeight > viewportBottom) {
        nextTop = Math.max(viewportPadding, viewportBottom - panelHeight);
      }

      let nextLeft = align === 'end' ? rect.right - nextWidth : rect.left;
      const viewportRight = window.innerWidth - viewportPadding;
      if (nextLeft < viewportPadding) {
        nextLeft = viewportPadding;
      }
      if (nextLeft + nextWidth > viewportRight) {
        nextLeft = Math.max(viewportPadding, viewportRight - nextWidth);
      }

      setStyle({
        top: Math.round(nextTop),
        left: Math.round(nextLeft),
        width: Math.round(nextWidth),
      });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [align, offset, open, panelRef, triggerRef, width]);

  return style;
}

export function HandbookSelectControl({
  value,
  options,
  onChange,
  placeholder = '-',
  optionLabels,
  variant = 'default',
}: HandbookSelectControlProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const selectedLabel = optionLabels?.[value] ?? (value || placeholder);
  const floatingStyle = useFloatingLayerPosition({
    open,
    triggerRef,
    panelRef,
    width: 'trigger',
    align: 'start',
    offset: 6,
  });

  useDismissibleLayer(open, () => setOpen(false), rootRef, panelRef);

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(previous => !previous)}
        className={
          variant === 'toolbar'
            ? 'inline-flex h-8 w-[74px] items-center justify-between rounded-[7px] border border-[#E5E7EB] bg-white pl-2.5 pr-2 text-[12px] font-medium outline-none transition hover:bg-[#F9FAFB] focus-visible:border-[#93C5FD]'
            : 'flex h-10 w-full items-center justify-between rounded-[8px] border border-[#D1D5DB] bg-white px-2.5 text-[12px] font-medium outline-none transition hover:bg-[#F9FAFB] focus-visible:border-[#86EFAC]'
        }
      >
        <span className={`truncate ${value ? 'text-[#111827]' : 'text-[#9CA3AF]'}`}>{selectedLabel}</span>
        <LuChevronDown
          className={`h-3 w-3 shrink-0 text-[#6B7280] transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && floatingStyle && typeof document !== 'undefined'
        ? createPortal(
          <div
            ref={panelRef}
            style={{
              position: 'fixed',
              top: floatingStyle.top,
              left: floatingStyle.left,
              width: floatingStyle.width,
              zIndex: 210,
            }}
            className="max-h-56 overflow-auto rounded-[8px] border border-[#D1D5DB] bg-white p-1 shadow-[0_10px_24px_rgba(15,23,42,0.14)]"
          >
            {options.map(option => {
              const active = option === value;
              const optionLabel = optionLabels?.[option] ?? (option || placeholder);
              return (
                <button
                  key={option || '__empty'}
                  type="button"
                  onClick={() => {
                    onChange(option);
                    setOpen(false);
                  }}
                  className={`flex h-8 w-full items-center rounded-[6px] px-2 text-left text-[12px] ${
                    active
                      ? 'bg-[#DCFCE7] font-semibold text-[#166534]'
                      : 'text-[#374151] hover:bg-[#F8FAFC]'
                  }`}
                >
                  {optionLabel}
                </button>
              );
            })}
          </div>,
          document.body,
        )
        : null}
    </div>
  );
}
