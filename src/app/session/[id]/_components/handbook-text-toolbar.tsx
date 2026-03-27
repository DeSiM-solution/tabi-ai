'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import {
  LuChevronDown,
  LuImage,
  LuLink2,
} from 'react-icons/lu';

import type { HandbookTextToolbarActions } from '../_hooks/use-grapesjs-editor';
import {
  HANDBOOK_FONT_SIZE_OPTIONS,
  type HandbookSelectionSnapshot,
} from '../_lib/handbook-selection';
import { resolveHandbookFloatingToolbarPosition } from '../_lib/handbook-toolbar-position';
import { HandbookColorPicker } from './handbook-color-picker';
import { HandbookSelectControl } from './handbook-select-control';

type HandbookTextToolbarProps = {
  selection: HandbookSelectionSnapshot;
  actions: HandbookTextToolbarActions;
};

function isBoldActive(value: string): boolean {
  const normalizedValue = value.trim().toLowerCase();
  if (normalizedValue === 'bold') return true;
  const numericWeight = Number(normalizedValue);
  return Number.isFinite(numericWeight) && numericWeight >= 600;
}

function isItalicActive(value: string): boolean {
  const normalizedValue = value.trim().toLowerCase();
  return normalizedValue === 'italic' || normalizedValue === 'oblique';
}

function hasTextDecoration(value: string, token: 'underline' | 'line-through'): boolean {
  return value
    .trim()
    .split(/\s+/)
    .some(entry => entry === token);
}

function normalizeFontSizeValue(value: string): string {
  return value.trim();
}

function getTextStyleLabel(tagName: string): string {
  const normalizedTagName = tagName.trim().toLowerCase();
  if (normalizedTagName === 'h1' || normalizedTagName === 'h2' || normalizedTagName === 'h3') {
    return normalizedTagName.toUpperCase();
  }
  return 'Normal';
}

function IconButton({
  label,
  active = false,
  disabled = false,
  onClick,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-[7px] border text-[15px] font-semibold transition ${
        active
          ? 'border-[#BFDBFE] bg-[#EFF6FF] text-[#2563EB]'
          : 'border-transparent bg-white text-[#111827]'
      } ${
        disabled
          ? 'cursor-not-allowed opacity-45'
          : 'hover:border-[#E5E7EB] hover:bg-[#F9FAFB]'
      }`}
    >
      {label}
    </button>
  );
}

export function HandbookTextToolbar({
  selection,
  actions,
}: HandbookTextToolbarProps) {
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const [toolbarSize, setToolbarSize] = useState({
    width: 480,
    height: 40,
  });

  useLayoutEffect(() => {
    const element = toolbarRef.current;
    if (!element) return;

    const measure = () => {
      const nextWidth = Math.ceil(element.offsetWidth);
      const nextHeight = Math.ceil(element.offsetHeight);
      if (!nextWidth || !nextHeight) return;
      setToolbarSize(previousSize => {
        if (previousSize.width === nextWidth && previousSize.height === nextHeight) {
          return previousSize;
        }
        return {
          width: nextWidth,
          height: nextHeight,
        };
      });
    };

    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => {
        window.removeEventListener('resize', measure);
      };
    }

    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(element);
    window.addEventListener('resize', measure);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [selection.componentId]);

  if (!selection.anchorRect || typeof window === 'undefined') {
    return null;
  }

  const position = resolveHandbookFloatingToolbarPosition({
    anchorRect: selection.anchorRect,
    toolbarWidth: toolbarSize.width,
    toolbarHeight: toolbarSize.height,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
  });
  const normalizedTagName = selection.tagName.trim().toLowerCase();
  const canEditLink = normalizedTagName === 'a' || Boolean(selection.href);
  const isBoldSelected = isBoldActive(selection.styles['font-weight']);
  const isItalicSelected = isItalicActive(selection.styles['font-style']);
  const isUnderlineSelected = hasTextDecoration(selection.textDecoration, 'underline');
  const isStrikeSelected = hasTextDecoration(selection.textDecoration, 'line-through');
  const normalizedFontSize = normalizeFontSizeValue(selection.styles['font-size']);
  const activeFontSize = normalizedFontSize;
  const fontSizeOptions = HANDBOOK_FONT_SIZE_OPTIONS.includes(
    normalizedFontSize as (typeof HANDBOOK_FONT_SIZE_OPTIONS)[number],
  ) || !normalizedFontSize
    ? [...HANDBOOK_FONT_SIZE_OPTIONS]
    : [normalizedFontSize, ...HANDBOOK_FONT_SIZE_OPTIONS];

  return (
    <div
      className="pointer-events-none fixed z-[80]"
      style={{
        top: position.top,
        left: position.left,
      }}
    >
      <div
        ref={toolbarRef}
        className="pointer-events-auto flex h-10 w-fit max-w-[calc(100vw-16px)] items-center gap-1.5 rounded-[9px] border border-[#D8DDE5] bg-white px-2 shadow-[0_2px_8px_rgba(0,0,0,0.10)]"
      >
        <IconButton
          label="B"
          active={isBoldSelected}
          onClick={() => {
            actions.toggleBold();
          }}
        />
        <IconButton
          label="I"
          active={isItalicSelected}
          onClick={() => {
            actions.toggleItalic();
          }}
        />
        <IconButton
          label="U"
          active={isUnderlineSelected}
          onClick={() => {
            actions.toggleUnderline();
          }}
        />
        <IconButton
          label="S"
          active={isStrikeSelected}
          onClick={() => {
            actions.toggleStrike();
          }}
        />

        <button
          type="button"
          aria-label="Insert image"
          title="Insert image"
          onClick={() => {
            console.info('[image-picker] toolbar-image-button-click');
            try {
              const opened = actions.openImagePicker();
              console.info('[image-picker] toolbar-image-button-result', {
                opened,
              });
            } catch (error) {
              console.error('[image-picker] toolbar-image-button-error', error);
              try {
                window.alert('[image-picker] toolbar-image-button-error');
              } catch {
                // Ignore alert failures in restricted environments.
              }
            }
          }}
          className="inline-flex h-8 w-[34px] items-center justify-center rounded-[7px] border border-[#E5E7EB] bg-white text-[#374151] transition hover:bg-[#F9FAFB]"
        >
          <LuImage className="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          aria-label="Edit link"
          title={canEditLink ? 'Edit link' : 'Select a link element to edit its URL'}
          disabled={!canEditLink}
          onClick={() => {
            const nextLink = window.prompt('Set link URL', selection.href || 'https://');
            if (nextLink === null) return;
            if (nextLink.trim()) {
              actions.setLink(nextLink);
              return;
            }
            actions.clearLink();
          }}
          className={`inline-flex h-8 w-[34px] items-center justify-center rounded-[7px] border border-[#E5E7EB] bg-white transition ${
            canEditLink
              ? 'text-[#374151] hover:bg-[#F9FAFB]'
              : 'cursor-not-allowed text-[#9CA3AF] opacity-50'
          }`}
        >
          <LuLink2 className="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          disabled
          className="inline-flex h-8 w-[66px] items-center justify-center gap-1 rounded-[7px] border border-[#E5E7EB] bg-white px-2 text-[12px] font-medium text-[#111827] opacity-60"
        >
          <span className="truncate">{getTextStyleLabel(selection.tagName)}</span>
          <LuChevronDown className="h-3 w-3 text-[#6B7280]" />
        </button>

        <HandbookColorPicker
          variant="toolbar"
          value={selection.styles.color}
          placeholder="Color"
          onChange={nextValue => {
            actions.setColor(nextValue);
          }}
        />

        <HandbookSelectControl
          value={activeFontSize}
          options={fontSizeOptions}
          placeholder="Size"
          variant="toolbar"
          onChange={nextValue => {
            actions.setFontSize(nextValue || '16px');
          }}
        />
      </div>
    </div>
  );
}
