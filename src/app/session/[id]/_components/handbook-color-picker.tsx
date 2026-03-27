'use client';

import {
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import {
  ColorPicker,
  type Color,
  formatColorString,
  hexToRgb,
  parseColorString,
  useColorState,
} from 'react-beautiful-color';
import {
  LuChevronDown,
  LuPipette,
  LuX,
} from 'react-icons/lu';

type HandbookColorPickerProps = {
  value: string;
  onChange: (nextValue: string) => void;
  placeholder?: string;
  variant?: 'default' | 'toolbar';
};

type PickerColorInput =
  | { type: 'hex'; value: string }
  | { type: 'rgb'; r: number; g: number; b: number }
  | { type: 'rgba'; r: number; g: number; b: number; a: number }
  | { type: 'hsl'; h: number; s: number; l: number }
  | { type: 'hsla'; h: number; s: number; l: number; a: number };

const DEFAULT_PICKER_COLOR_INPUT: PickerColorInput = {
  type: 'hex',
  value: '#111827',
};

function parseHexColorInput(value: string): PickerColorInput | null {
  const normalizedValue = value.trim();
  const match = normalizedValue.match(/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
  if (!match) return null;

  const hex = match[1];
  if (hex.length === 8) {
    const normalizedRgbHex = parseColorString(`#${hex.slice(0, 6)}`);
    const { r, g, b } = hexToRgb(normalizedRgbHex);
    const alphaHex = hex.slice(6);
    const alpha = Number.parseInt(alphaHex, 16) / 255;
    return {
      type: 'rgba',
      r,
      g,
      b,
      a: Math.min(Math.max(alpha, 0), 1),
    };
  }

  const normalizedHex = parseColorString(`#${hex}`);
  return {
    type: 'hex',
    value: normalizedHex,
  };
}

function parseRgbColorInput(value: string): PickerColorInput | null {
  const normalizedValue = value.trim();
  const match = normalizedValue.match(/^rgba?\(\s*([+-]?\d*\.?\d+)\s*,\s*([+-]?\d*\.?\d+)\s*,\s*([+-]?\d*\.?\d+)\s*(?:,\s*([+-]?\d*\.?\d+)\s*)?\)$/i);
  if (!match) return null;

  const [rText, gText, bText, alphaText] = match.slice(1);
  const r = Number.parseFloat(rText);
  const g = Number.parseFloat(gText);
  const b = Number.parseFloat(bText);
  if ([r, g, b].some(number => !Number.isFinite(number))) return null;

  const roundedR = Math.round(Math.min(Math.max(r, 0), 255));
  const roundedG = Math.round(Math.min(Math.max(g, 0), 255));
  const roundedB = Math.round(Math.min(Math.max(b, 0), 255));
  if (alphaText == null) {
    return {
      type: 'rgb',
      r: roundedR,
      g: roundedG,
      b: roundedB,
    };
  }

  const alpha = Number.parseFloat(alphaText);
  if (!Number.isFinite(alpha)) return null;
  return {
    type: 'rgba',
    r: roundedR,
    g: roundedG,
    b: roundedB,
    a: Math.min(Math.max(alpha, 0), 1),
  };
}

function parseHslColorInput(value: string): PickerColorInput | null {
  const normalizedValue = value.trim();
  const match = normalizedValue.match(/^hsla?\(\s*([+-]?\d*\.?\d+)\s*,\s*([+-]?\d*\.?\d+)%\s*,\s*([+-]?\d*\.?\d+)%\s*(?:,\s*([+-]?\d*\.?\d+)\s*)?\)$/i);
  if (!match) return null;

  const [hText, sText, lText, alphaText] = match.slice(1);
  const h = Number.parseFloat(hText);
  const s = Number.parseFloat(sText);
  const l = Number.parseFloat(lText);
  if ([h, s, l].some(number => !Number.isFinite(number))) return null;

  const normalizedHue = ((h % 360) + 360) % 360;
  const normalizedSaturation = Math.min(Math.max(s, 0), 100);
  const normalizedLightness = Math.min(Math.max(l, 0), 100);
  if (alphaText == null) {
    return {
      type: 'hsl',
      h: Math.round(normalizedHue),
      s: Math.round(normalizedSaturation),
      l: Math.round(normalizedLightness),
    };
  }

  const alpha = Number.parseFloat(alphaText);
  if (!Number.isFinite(alpha)) return null;
  return {
    type: 'hsla',
    h: Math.round(normalizedHue),
    s: Math.round(normalizedSaturation),
    l: Math.round(normalizedLightness),
    a: Math.min(Math.max(alpha, 0), 1),
  };
}

function resolvePickerColorInput(value: string): PickerColorInput | null {
  const normalizedValue = value.trim();
  if (!normalizedValue) return null;

  const lowerValue = normalizedValue.toLowerCase();
  if (lowerValue === 'transparent') {
    return {
      type: 'rgba',
      r: 0,
      g: 0,
      b: 0,
      a: 0,
    };
  }

  const parsedColorInput = (
    parseHexColorInput(normalizedValue)
    ?? parseRgbColorInput(normalizedValue)
    ?? parseHslColorInput(normalizedValue)
  );
  if (parsedColorInput) return parsedColorInput;

  if (/^#[0-9a-f]*$/i.test(normalizedValue)) return null;
  if (/^rgba?\(/i.test(normalizedValue)) return null;
  if (/^hsla?\(/i.test(normalizedValue)) return null;

  return {
    type: 'hex',
    value: parseColorString(normalizedValue),
  };
}

function formatColorValue(nextColor: Color): string {
  const hasAlpha = nextColor.getHsva().a < 1;
  return formatColorString(nextColor, hasAlpha ? 'rgba' : 'hex');
}

function resolveColorSwatchValue(value: string): string {
  const normalizedValue = value.trim();
  if (!normalizedValue) return '#F3F4F6';
  if (
    /^#[0-9a-f]{3}$/i.test(normalizedValue)
    || /^#[0-9a-f]{6}$/i.test(normalizedValue)
    || /^rgb/i.test(normalizedValue)
    || /^hsl/i.test(normalizedValue)
    || normalizedValue.toLowerCase() === 'transparent'
  ) {
    return normalizedValue;
  }
  return '#F3F4F6';
}

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
  align = 'end',
  offset = 6,
}: {
  open: boolean;
  triggerRef: RefObject<HTMLElement | null>;
  panelRef: RefObject<HTMLElement | null>;
  width: number;
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
      const panelHeight = panelRef.current?.offsetHeight ?? 355;
      const viewportPadding = 8;
      const viewportBottom = window.innerHeight - viewportPadding;
      const spaceBelow = viewportBottom - rect.bottom;
      const spaceAbove = rect.top - viewportPadding;
      const shouldOpenUpward = spaceBelow < Math.min(panelHeight, 355) && spaceAbove > spaceBelow;

      let nextTop = shouldOpenUpward
        ? rect.top - panelHeight - offset
        : rect.bottom + offset;
      if (nextTop < viewportPadding) {
        nextTop = viewportPadding;
      }
      if (nextTop + panelHeight > viewportBottom) {
        nextTop = Math.max(viewportPadding, viewportBottom - panelHeight);
      }

      let nextLeft = align === 'end' ? rect.right - width : rect.left;
      const viewportRight = window.innerWidth - viewportPadding;
      if (nextLeft < viewportPadding) {
        nextLeft = viewportPadding;
      }
      if (nextLeft + width > viewportRight) {
        nextLeft = Math.max(viewportPadding, viewportRight - width);
      }

      setStyle({
        top: Math.round(nextTop),
        left: Math.round(nextLeft),
        width,
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

export function HandbookColorPicker({
  value,
  onChange,
  placeholder = '',
  variant = 'default',
}: HandbookColorPickerProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const onChangeRef = useRef(onChange);
  const [{ colorInput }, setColor] = useColorState(
    () => resolvePickerColorInput(value) ?? DEFAULT_PICKER_COLOR_INPUT,
  );
  const swatchColor = resolveColorSwatchValue(value);
  const floatingStyle = useFloatingLayerPosition({
    open,
    triggerRef,
    panelRef,
    width: 279,
    align: 'end',
    offset: 6,
  });

  useDismissibleLayer(open, () => {
    setOpen(false);
  }, rootRef, panelRef);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const handlePickerColorChange = useCallback((nextColor: Color) => {
    setColor(nextColor);
    const nextValue = formatColorValue(nextColor);
    onChangeRef.current(nextValue);
  }, [setColor]);

  const handleToggleOpen = () => {
    if (open) {
      setOpen(false);
      return;
    }

    setColor(resolvePickerColorInput(value) ?? DEFAULT_PICKER_COLOR_INPUT);
    setOpen(true);
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={handleToggleOpen}
        className={
          variant === 'toolbar'
            ? 'inline-flex h-8 w-[84px] items-center justify-center gap-1.5 rounded-[7px] border border-[#E5E7EB] bg-white px-2 text-[12px] font-medium text-[#111827] transition hover:bg-[#F9FAFB]'
            : 'flex h-9 w-full items-center gap-2 rounded-[8px] border border-[#D1D5DB] bg-white px-2.5 text-left'
        }
      >
        {variant === 'toolbar' ? (
          <>
            <span
              className="h-3 w-3 shrink-0 rounded-[3px] border border-[#D1D5DB]"
              style={{ backgroundColor: swatchColor }}
            />
            <span className={`truncate ${value ? 'text-[#111827]' : 'text-[#9CA3AF]'}`}>
              {value || placeholder || 'Color'}
            </span>
            <LuChevronDown className="h-3 w-3 shrink-0 text-[#6B7280]" />
          </>
        ) : (
          <>
            <span
              className="h-[18px] w-[18px] shrink-0 rounded-[5px] border border-[#D1D5DB]"
              style={{ backgroundColor: swatchColor }}
            />
            <span className={`truncate text-[12px] font-medium ${value ? 'text-[#111827]' : 'text-[#9CA3AF]'}`}>
              {value || placeholder}
            </span>
          </>
        )}
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
            className="rounded-[8px] border border-[#D1D5DB] bg-white p-[10px] shadow-[0_14px_28px_rgba(15,23,42,0.16)]"
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[12px] font-semibold text-[#111827]">Color</p>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="inline-flex h-5 w-5 items-center justify-center rounded-[5px] text-[#6B7280] hover:bg-[#F3F4F6]"
                >
                  <LuX className="h-3.5 w-3.5" />
                </button>
              </div>

              <ColorPicker
                color={colorInput}
                onChange={handlePickerColorChange}
                className="h-auto w-full rounded-[8px] bg-transparent shadow-none"
              >
                <ColorPicker.Saturation className="mb-3 h-[130px] rounded-[8px] border border-[#D1D5DB]" />
                <div className="space-y-2 px-[1px]">
                  <ColorPicker.Hue className="h-[14px] rounded-[7px] border border-[#D1D5DB]" />
                  <ColorPicker.Alpha className="h-[14px] rounded-[7px] border border-[#D1D5DB]" />
                </div>

                <div className="flex h-10 gap-3">
                  <input
                    type="text"
                    value={value}
                    onChange={event => {
                      const nextValue = event.currentTarget.value;
                      const nextPickerColorInput = resolvePickerColorInput(nextValue);
                      if (nextPickerColorInput) {
                        setColor(nextPickerColorInput);
                      }
                      onChangeRef.current(nextValue);
                    }}
                    className="h-full min-w-0 flex-1 rounded-[8px] border border-[#D1D5DB] px-3 text-[12px] font-medium text-[#374151] outline-none placeholder:text-[#9CA3AF] focus:border-[#86EFAC]"
                    placeholder={placeholder}
                  />
                  <ColorPicker.EyeDropper
                    title="Pick color from screen"
                    className="inline-flex h-full w-16 shrink-0 items-center justify-center rounded-[8px] border border-[#D1D5DB] bg-white text-[#111827] hover:bg-[#F9FAFB]"
                  >
                    <LuPipette className="h-5 w-5" />
                  </ColorPicker.EyeDropper>
                </div>
              </ColorPicker>
            </div>
          </div>,
          document.body,
        )
        : null}
    </div>
  );
}
