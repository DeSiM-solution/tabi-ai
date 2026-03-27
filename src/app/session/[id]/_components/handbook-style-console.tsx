'use client';

import {
  type HTMLAttributes,
  type RefObject,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { LuChevronDown } from 'react-icons/lu';

import {
  HANDBOOK_ALIGN_CONTENT_OPTIONS,
  HANDBOOK_ALIGN_ITEMS_OPTIONS,
  HANDBOOK_BORDER_STYLE_OPTIONS,
  HANDBOOK_DISPLAY_OPTIONS,
  HANDBOOK_FLEX_DIRECTION_OPTIONS,
  HANDBOOK_FLEX_WRAP_OPTIONS,
  HANDBOOK_FONT_FAMILY_OPTIONS,
  HANDBOOK_FONT_STYLE_OPTIONS,
  HANDBOOK_FONT_WEIGHT_OPTIONS,
  HANDBOOK_JUSTIFY_OPTIONS,
  HANDBOOK_POSITION_OPTIONS,
  HANDBOOK_STYLE_PROPERTIES,
  HANDBOOK_TEXT_ALIGN_OPTIONS,
  HANDBOOK_VERTICAL_ALIGN_OPTIONS,
  type HandbookSelectionSnapshot,
  type HandbookSelectionStyles,
  type HandbookStyleProperty,
} from '../_lib/handbook-selection';
import { HandbookColorPicker } from './handbook-color-picker';

type HandbookStyleConsoleProps = {
  isManualEditorOpen: boolean;
  isVisualEditorReady: boolean;
  selection: HandbookSelectionSnapshot | null;
  onApplyStyle: (property: HandbookStyleProperty, value: string) => void;
};

type SpacingMode = 'All' | 'Custom';

type InputUnitParts = {
  amount: string;
  unit: string;
};

type BorderParts = {
  width: string;
  style: string;
  color: string;
};

const MODE_OPTIONS = ['All', 'Custom'] as const;
const LENGTH_UNITS = ['px', '%', 'em', 'rem', 'vw', 'vh'] as const;
const LENGTH_UNITS_WITH_AUTO = ['px', '%', 'em', 'rem', 'vw', 'vh', 'auto'] as const;
const LENGTH_UNITS_WITH_AUTO_OR_NONE = ['px', '%', 'em', 'rem', 'vw', 'vh', 'auto', 'none'] as const;
const FONT_SIZE_UNITS = ['px', '%', 'em', 'rem'] as const;
const LINE_HEIGHT_UNITS = ['', 'px', '%', 'em', 'rem'] as const;
const LETTER_SPACING_UNITS = ['px', 'em', 'rem'] as const;
const RADIUS_UNITS = ['px', '%'] as const;
const BORDER_WIDTH_UNITS = ['px', 'em', 'rem', '%'] as const;
const OFFSET_UNITS = ['px', '%', 'em', 'rem', 'vw', 'vh', 'auto'] as const;

const FLEX_DISPLAY_VALUES = new Set(['flex', 'inline-flex']);
const WRAP_VALUES = new Set(['wrap', 'wrap-reverse']);
const BORDER_STYLE_VALUES = new Set<string>(HANDBOOK_BORDER_STYLE_OPTIONS.filter(Boolean));
const UNIT_KEYWORD_VALUES = new Set(['auto', 'none']);

const FLEX_DIRECTION_LABELS: Record<string, string> = {
  row: 'Row',
  'row-reverse': 'Row Reverse',
  column: 'Column',
  'column-reverse': 'Column Reverse',
};

const JUSTIFY_LABELS: Record<string, string> = {
  'flex-start': 'Start',
  center: 'Center',
  'flex-end': 'End',
  'space-between': 'Between',
  'space-around': 'Around',
  'space-evenly': 'Evenly',
};

const ALIGN_ITEMS_LABELS: Record<string, string> = {
  stretch: 'Stretch',
  'flex-start': 'Start',
  center: 'Center',
  'flex-end': 'End',
  baseline: 'Baseline',
};

const TEXT_ALIGN_LABELS: Record<string, string> = {
  left: 'Left',
  center: 'Center',
  right: 'Right',
  justify: 'Justify',
};

const VERTICAL_ALIGN_LABELS: Record<string, string> = {
  baseline: 'Baseline',
  middle: 'Middle',
  top: 'Top',
  bottom: 'Bottom',
};

const EMPTY_SELECTION_STYLES = Object.fromEntries(
  HANDBOOK_STYLE_PROPERTIES.map(property => [property, '']),
) as HandbookSelectionStyles;

function normalizeStyleValue(value: string): string {
  return value.trim().toLowerCase();
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

function hasCustomEdgeValue(
  styles: HandbookSelectionStyles,
  properties: readonly HandbookStyleProperty[],
): boolean {
  return properties.some(property => styles[property].trim().length > 0);
}

function resolveDefaultUnit(units: readonly string[]): string {
  return units.find(unit => unit && !UNIT_KEYWORD_VALUES.has(unit)) ?? units[0] ?? '';
}

function parseInputUnitValue(value: string, units: readonly string[]): InputUnitParts {
  const normalizedValue = value.trim();
  const defaultUnit = resolveDefaultUnit(units);

  if (!normalizedValue) {
    return {
      amount: '',
      unit: defaultUnit,
    };
  }

  if (units.includes(normalizedValue)) {
    return {
      amount: '',
      unit: normalizedValue,
    };
  }

  const regularUnits = units
    .filter(unit => unit && !UNIT_KEYWORD_VALUES.has(unit))
    .sort((left, right) => right.length - left.length);
  const lowerValue = normalizedValue.toLowerCase();
  for (const unit of regularUnits) {
    const lowerUnit = unit.toLowerCase();
    if (!lowerValue.endsWith(lowerUnit)) continue;

    const amount = normalizedValue.slice(0, normalizedValue.length - unit.length).trim();
    if (!amount) break;

    return {
      amount,
      unit,
    };
  }

  if (/^-?\d*\.?\d+$/.test(normalizedValue)) {
    return {
      amount: normalizedValue,
      unit: units.includes('') ? '' : defaultUnit,
    };
  }

  return {
    amount: normalizedValue,
    unit: units.includes('') ? '' : defaultUnit,
  };
}

function composeInputUnitValue(amount: string, unit: string): string {
  const normalizedAmount = amount.trim();
  if (!normalizedAmount) return '';

  if (UNIT_KEYWORD_VALUES.has(unit)) {
    return unit;
  }

  return unit ? `${normalizedAmount}${unit}` : normalizedAmount;
}

function parseBorderValue(value: string): BorderParts {
  const normalizedValue = value.trim();
  if (!normalizedValue) {
    return {
      width: '',
      style: '',
      color: '',
    };
  }

  const tokens = normalizedValue.split(/\s+/).filter(Boolean);
  let width = '';
  let style = '';
  const colorTokens: string[] = [];

  for (const token of tokens) {
    const lowerToken = token.toLowerCase();
    if (!style && BORDER_STYLE_VALUES.has(lowerToken)) {
      style = token;
      continue;
    }
    if (!width && /^-?\d*\.?\d+(px|em|rem|%)?$/i.test(token)) {
      width = token;
      continue;
    }
    colorTokens.push(token);
  }

  return {
    width,
    style,
    color: colorTokens.join(' ').trim(),
  };
}

function composeBorderValue(parts: BorderParts): string {
  return [parts.width.trim(), parts.style.trim(), parts.color.trim()]
    .filter(Boolean)
    .join(' ');
}

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-[10px] border border-[#E5E7EB] bg-white">
      <div className="flex h-11 items-center justify-between bg-[#ECEFF3] px-3.5">
        <p className="text-[12px] font-bold text-[#111827]">{title}</p>
        <LuChevronDown className="h-3.5 w-3.5 text-[#6B7280]" />
      </div>
      <div className="space-y-2.5 bg-white p-3.5">{children}</div>
    </section>
  );
}

function InlineFieldRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-[12px] font-semibold text-[#1F2937]">{label}</p>
      <div className="w-[154px] shrink-0">{children}</div>
    </div>
  );
}

function StackField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-[12px] font-semibold text-[#1F2937]">{label}</p>
      {children}
    </div>
  );
}

function GridField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-[12px] font-semibold text-[#1F2937]">{label}</p>
      {children}
    </div>
  );
}

function SelectControl({
  value,
  options,
  onChange,
  placeholder = '-',
  optionLabels,
  size = 'md',
}: {
  value: string;
  options: readonly string[];
  onChange: (nextValue: string) => void;
  placeholder?: string;
  optionLabels?: Record<string, string>;
  size?: 'sm' | 'md';
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const selectedLabel = optionLabels?.[value] ?? (value || placeholder);
  const controlHeightClass = size === 'md' ? 'h-10' : 'h-9';
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
        className={`${controlHeightClass} flex w-full items-center justify-between rounded-[8px] border border-[#D1D5DB] bg-white px-2.5 text-[12px] font-medium outline-none transition hover:bg-[#F9FAFB] focus-visible:border-[#86EFAC]`}
      >
        <span className={value ? 'text-[#111827]' : 'text-[#9CA3AF]'}>{selectedLabel}</span>
        <LuChevronDown
          className={`h-3 w-3 text-[#6B7280] transition-transform ${open ? 'rotate-180' : ''}`}
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
              zIndex: 200,
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

function ButtonGroupControl({
  value,
  options,
  onChange,
  optionLabels,
}: {
  value: string;
  options: readonly string[];
  onChange: (nextValue: string) => void;
  optionLabels?: Record<string, string>;
}) {
  return (
    <div className="flex h-10 overflow-hidden rounded-[8px] border border-[#D1D5DB] bg-white p-[1px]">
      {options.map((option, index) => {
        const active = value === option;
        const first = index === 0;
        const last = index === options.length - 1;
        return (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            className={`flex h-full min-w-0 flex-1 items-center justify-center px-2 text-center text-[11px] transition ${
              active
                ? 'bg-[#DCFCE7] font-semibold text-[#166534]'
                : 'bg-white font-medium text-[#374151] hover:bg-[#F8FAFC]'
            } ${index > 0 ? 'border-l border-[#D1D5DB]' : ''} ${
              first ? 'rounded-l-[6px]' : ''
            } ${last ? 'rounded-r-[6px]' : ''}`}
          >
            <span className="truncate">{optionLabels?.[option] ?? option}</span>
          </button>
        );
      })}
    </div>
  );
}

function InputControl({
  value,
  onChange,
  placeholder = '',
  inputMode = 'text',
}: {
  value: string;
  onChange: (nextValue: string) => void;
  placeholder?: string;
  inputMode?: HTMLAttributes<HTMLInputElement>['inputMode'];
}) {
  return (
    <input
      type="text"
      inputMode={inputMode}
      value={value}
      placeholder={placeholder}
      onChange={event => onChange(event.currentTarget.value)}
      className="h-9 w-full rounded-[8px] border border-[#D1D5DB] bg-white px-2.5 text-[12px] font-medium text-[#111827] outline-none transition placeholder:text-[#9CA3AF] focus:border-[#86EFAC]"
    />
  );
}

function UnitDropdownControl({
  value,
  options,
  onChange,
  controlWidth = 52,
  menuWidth = 68,
}: {
  value: string;
  options: readonly string[];
  onChange: (nextValue: string) => void;
  controlWidth?: number;
  menuWidth?: number;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const selectedLabel = value || '-';
  const floatingStyle = useFloatingLayerPosition({
    open,
    triggerRef,
    panelRef,
    width: menuWidth,
    align: 'end',
    offset: 6,
  });

  useDismissibleLayer(open, () => setOpen(false), rootRef, panelRef);

  return (
    <div
      ref={rootRef}
      style={{ width: controlWidth }}
      className="relative h-full shrink-0"
    >
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(previous => !previous)}
        className="flex h-full w-full items-center justify-between border-0 bg-transparent pl-2 pr-1 text-[12px] font-medium text-[#6B7280]"
      >
        <span className="truncate">{selectedLabel}</span>
        <LuChevronDown
          className={`h-3 w-3 text-[#9CA3AF] transition-transform ${open ? 'rotate-180' : ''}`}
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
              zIndex: 200,
            }}
            className="overflow-hidden rounded-[8px] border border-[#D1D5DB] bg-white p-1 shadow-[0_10px_24px_rgba(15,23,42,0.14)]"
          >
            {options.map(option => {
              const active = option === value;
              return (
                <button
                  key={option || '__unitless'}
                  type="button"
                  onClick={() => {
                    onChange(option);
                    setOpen(false);
                  }}
                  className={`flex h-8 w-full items-center justify-center rounded-[6px] text-[12px] ${
                    active
                      ? 'bg-[#DCFCE7] font-semibold text-[#166534]'
                      : 'font-medium text-[#374151] hover:bg-[#F8FAFC]'
                  }`}
                >
                  {option || '-'}
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

function InputWithUnitControl({
  value,
  units,
  onChange,
  placeholder = '',
  unitControlWidth = 52,
  unitMenuWidth = 68,
}: {
  value: string;
  units: readonly string[];
  onChange: (nextValue: string) => void;
  placeholder?: string;
  unitControlWidth?: number;
  unitMenuWidth?: number;
}) {
  const parsedValue = useMemo(() => parseInputUnitValue(value, units), [units, value]);
  const defaultUnit = resolveDefaultUnit(units);
  const selectedUnit = units.includes(parsedValue.unit) ? parsedValue.unit : defaultUnit;

  return (
    <div className="flex h-9 items-center overflow-hidden rounded-[8px] border border-[#D1D5DB] bg-white">
      <input
        type="text"
        inputMode="decimal"
        value={parsedValue.amount}
        placeholder={placeholder}
        onChange={event => {
          const nextAmount = event.currentTarget.value;
          if (!nextAmount.trim()) {
            onChange('');
            return;
          }
          const nextUnit = UNIT_KEYWORD_VALUES.has(selectedUnit) ? defaultUnit : selectedUnit;
          onChange(composeInputUnitValue(nextAmount, nextUnit));
        }}
        className="h-full min-w-0 flex-1 border-0 bg-transparent px-2.5 text-[12px] font-medium text-[#111827] outline-none placeholder:text-[#9CA3AF]"
      />
      <div className="h-4 w-px bg-[#E5E7EB]" />
      <UnitDropdownControl
        value={selectedUnit}
        options={units}
        controlWidth={unitControlWidth}
        menuWidth={unitMenuWidth}
        onChange={nextUnit => {
          if (UNIT_KEYWORD_VALUES.has(nextUnit)) {
            onChange(nextUnit);
            return;
          }
          if (!parsedValue.amount.trim()) {
            onChange('');
            return;
          }
          onChange(composeInputUnitValue(parsedValue.amount, nextUnit));
        }}
      />
    </div>
  );
}

function DirectionalPanel({
  styles,
  onApplyStyle,
  topProperty,
  rightProperty,
  bottomProperty,
  leftProperty,
  units,
  placeholder = '',
}: {
  styles: HandbookSelectionStyles;
  onApplyStyle: (property: HandbookStyleProperty, value: string) => void;
  topProperty: HandbookStyleProperty;
  rightProperty: HandbookStyleProperty;
  bottomProperty: HandbookStyleProperty;
  leftProperty: HandbookStyleProperty;
  units: readonly string[];
  placeholder?: string;
}) {
  return (
    <div className="space-y-2.5 rounded-[8px] border border-[#D1D5DB] bg-[#F8FAFC] p-3">
      <GridField label="Top">
        <InputWithUnitControl
          value={styles[topProperty]}
          units={units}
          placeholder={placeholder}
          onChange={nextValue => onApplyStyle(topProperty, nextValue)}
        />
      </GridField>
      <div className="grid grid-cols-2 gap-2">
        <GridField label="Left">
          <InputWithUnitControl
            value={styles[leftProperty]}
            units={units}
            placeholder={placeholder}
            onChange={nextValue => onApplyStyle(leftProperty, nextValue)}
          />
        </GridField>
        <GridField label="Right">
          <InputWithUnitControl
            value={styles[rightProperty]}
            units={units}
            placeholder={placeholder}
            onChange={nextValue => onApplyStyle(rightProperty, nextValue)}
          />
        </GridField>
      </div>
      <GridField label="Bottom">
        <InputWithUnitControl
          value={styles[bottomProperty]}
          units={units}
          placeholder={placeholder}
          onChange={nextValue => onApplyStyle(bottomProperty, nextValue)}
        />
      </GridField>
    </div>
  );
}

function LayoutSection({
  styles,
  onApplyStyle,
}: {
  styles: HandbookSelectionStyles;
  onApplyStyle: (property: HandbookStyleProperty, value: string) => void;
}) {
  const displayValue = normalizeStyleValue(styles.display);
  const isFlexDisplay = FLEX_DISPLAY_VALUES.has(displayValue);
  const wraps = WRAP_VALUES.has(normalizeStyleValue(styles['flex-wrap']));

  return (
    <Section title="Layout">
      <InlineFieldRow label="Display">
        <SelectControl
          value={styles.display}
          options={HANDBOOK_DISPLAY_OPTIONS}
          onChange={nextValue => onApplyStyle('display', nextValue)}
        />
      </InlineFieldRow>

      {isFlexDisplay ? (
        <>
          <StackField label="Flex">
            <ButtonGroupControl
              value={styles['flex-direction']}
              options={HANDBOOK_FLEX_DIRECTION_OPTIONS.filter(Boolean)}
              optionLabels={FLEX_DIRECTION_LABELS}
              onChange={nextValue => onApplyStyle('flex-direction', nextValue)}
            />
          </StackField>

          <StackField label="Justify">
            <ButtonGroupControl
              value={styles['justify-content']}
              options={HANDBOOK_JUSTIFY_OPTIONS.filter(Boolean)}
              optionLabels={JUSTIFY_LABELS}
              onChange={nextValue => onApplyStyle('justify-content', nextValue)}
            />
          </StackField>

          <StackField label="Align">
            <ButtonGroupControl
              value={styles['align-items']}
              options={HANDBOOK_ALIGN_ITEMS_OPTIONS.filter(Boolean)}
              optionLabels={ALIGN_ITEMS_LABELS}
              onChange={nextValue => onApplyStyle('align-items', nextValue)}
            />
          </StackField>

          <InlineFieldRow label="Flex Wrap">
            <SelectControl
              value={styles['flex-wrap']}
              options={HANDBOOK_FLEX_WRAP_OPTIONS}
              optionLabels={{
                '': '-',
                nowrap: 'No wrap',
                wrap: 'Wrap',
                'wrap-reverse': 'Wrap reverse',
              }}
              onChange={nextValue => onApplyStyle('flex-wrap', nextValue)}
            />
          </InlineFieldRow>

          {wraps ? (
            <StackField label="Align Content">
              <ButtonGroupControl
                value={styles['align-content']}
                options={HANDBOOK_ALIGN_CONTENT_OPTIONS.filter(Boolean)}
                optionLabels={ALIGN_ITEMS_LABELS}
                onChange={nextValue => onApplyStyle('align-content', nextValue)}
              />
            </StackField>
          ) : null}

          <InlineFieldRow label="Gap">
            <InputWithUnitControl
              value={styles.gap}
              units={LENGTH_UNITS}
              onChange={nextValue => onApplyStyle('gap', nextValue)}
            />
          </InlineFieldRow>
        </>
      ) : null}
    </Section>
  );
}

function SizeSection({
  styles,
  onApplyStyle,
}: {
  styles: HandbookSelectionStyles;
  onApplyStyle: (property: HandbookStyleProperty, value: string) => void;
}) {
  const sizeFields: Array<{
    label: string;
    property: HandbookStyleProperty;
    units: readonly string[];
    placeholder: string;
  }> = [
    { label: 'Width', property: 'width', units: LENGTH_UNITS_WITH_AUTO, placeholder: 'auto' },
    { label: 'Height', property: 'height', units: LENGTH_UNITS_WITH_AUTO, placeholder: 'auto' },
    {
      label: 'Min Width',
      property: 'min-width',
      units: LENGTH_UNITS_WITH_AUTO,
      placeholder: 'auto',
    },
    {
      label: 'Min Height',
      property: 'min-height',
      units: LENGTH_UNITS_WITH_AUTO,
      placeholder: 'auto',
    },
    {
      label: 'Max Width',
      property: 'max-width',
      units: LENGTH_UNITS_WITH_AUTO_OR_NONE,
      placeholder: 'none',
    },
    {
      label: 'Max Height',
      property: 'max-height',
      units: LENGTH_UNITS_WITH_AUTO_OR_NONE,
      placeholder: 'none',
    },
  ];

  return (
    <Section title="Size">
      <div className="grid grid-cols-2 gap-2.5">
        {sizeFields.map(field => (
          <GridField key={field.property} label={field.label}>
            <InputWithUnitControl
              value={styles[field.property]}
              units={field.units}
              placeholder={field.placeholder}
              onChange={nextValue => onApplyStyle(field.property, nextValue)}
            />
          </GridField>
        ))}
      </div>
    </Section>
  );
}

function SpaceSection({
  styles,
  paddingMode,
  marginMode,
  onPaddingModeChange,
  onMarginModeChange,
  onApplyStyle,
}: {
  styles: HandbookSelectionStyles;
  paddingMode: SpacingMode;
  marginMode: SpacingMode;
  onPaddingModeChange: (nextMode: SpacingMode) => void;
  onMarginModeChange: (nextMode: SpacingMode) => void;
  onApplyStyle: (property: HandbookStyleProperty, value: string) => void;
}) {
  return (
    <Section title="Space">
      <StackField label="Padding">
        <div className="grid grid-cols-2 gap-2">
          <InputWithUnitControl
            value={styles.padding}
            units={LENGTH_UNITS}
            onChange={nextValue => onApplyStyle('padding', nextValue)}
          />
          <ButtonGroupControl
            value={paddingMode}
            options={MODE_OPTIONS}
            onChange={nextValue => onPaddingModeChange(nextValue as SpacingMode)}
          />
        </div>
      </StackField>

      {paddingMode === 'Custom' ? (
        <DirectionalPanel
          styles={styles}
          onApplyStyle={onApplyStyle}
          topProperty="padding-top"
          rightProperty="padding-right"
          bottomProperty="padding-bottom"
          leftProperty="padding-left"
          units={LENGTH_UNITS}
        />
      ) : null}

      <StackField label="Margin">
        <div className="grid grid-cols-2 gap-2">
          <InputWithUnitControl
            value={styles.margin}
            units={LENGTH_UNITS_WITH_AUTO}
            onChange={nextValue => onApplyStyle('margin', nextValue)}
          />
          <ButtonGroupControl
            value={marginMode}
            options={MODE_OPTIONS}
            onChange={nextValue => onMarginModeChange(nextValue as SpacingMode)}
          />
        </div>
      </StackField>

      {marginMode === 'Custom' ? (
        <DirectionalPanel
          styles={styles}
          onApplyStyle={onApplyStyle}
          topProperty="margin-top"
          rightProperty="margin-right"
          bottomProperty="margin-bottom"
          leftProperty="margin-left"
          units={LENGTH_UNITS_WITH_AUTO}
        />
      ) : null}
    </Section>
  );
}

function SpaceSectionWithModes({
  styles,
  initialPaddingMode,
  initialMarginMode,
  onApplyStyle,
}: {
  styles: HandbookSelectionStyles;
  initialPaddingMode: SpacingMode;
  initialMarginMode: SpacingMode;
  onApplyStyle: (property: HandbookStyleProperty, value: string) => void;
}) {
  const [paddingMode, setPaddingMode] = useState<SpacingMode>(initialPaddingMode);
  const [marginMode, setMarginMode] = useState<SpacingMode>(initialMarginMode);

  return (
    <SpaceSection
      styles={styles}
      paddingMode={paddingMode}
      marginMode={marginMode}
      onPaddingModeChange={setPaddingMode}
      onMarginModeChange={setMarginMode}
      onApplyStyle={onApplyStyle}
    />
  );
}

function PositionSection({
  styles,
  onApplyStyle,
}: {
  styles: HandbookSelectionStyles;
  onApplyStyle: (property: HandbookStyleProperty, value: string) => void;
}) {
  const normalizedPosition = normalizeStyleValue(styles.position);
  const showOffsets = Boolean(normalizedPosition) && normalizedPosition !== 'static';

  return (
    <Section title="Position">
      <InlineFieldRow label="Position">
        <SelectControl
          value={styles.position}
          options={HANDBOOK_POSITION_OPTIONS}
          onChange={nextValue => onApplyStyle('position', nextValue)}
        />
      </InlineFieldRow>

      {showOffsets ? (
        <>
          <DirectionalPanel
            styles={styles}
            onApplyStyle={onApplyStyle}
            topProperty="top"
            rightProperty="right"
            bottomProperty="bottom"
            leftProperty="left"
            units={OFFSET_UNITS}
            placeholder="auto"
          />

          <InlineFieldRow label="Z-Index">
            <InputControl
              value={styles['z-index']}
              inputMode="numeric"
              onChange={nextValue => onApplyStyle('z-index', nextValue)}
            />
          </InlineFieldRow>
        </>
      ) : null}
    </Section>
  );
}

function TypographySection({
  styles,
  supportsVerticalAlign,
  onApplyStyle,
}: {
  styles: HandbookSelectionStyles;
  supportsVerticalAlign: boolean;
  onApplyStyle: (property: HandbookStyleProperty, value: string) => void;
}) {
  return (
    <Section title="Typography">
      <StackField label="Font">
        <SelectControl
          value={styles['font-family']}
          options={HANDBOOK_FONT_FAMILY_OPTIONS}
          onChange={nextValue => onApplyStyle('font-family', nextValue)}
        />
      </StackField>

      <InlineFieldRow label="Text Color">
        <HandbookColorPicker
          value={styles.color}
          placeholder="#000000"
          onChange={nextValue => onApplyStyle('color', nextValue)}
        />
      </InlineFieldRow>

      <InlineFieldRow label="Size">
        <InputWithUnitControl
          value={styles['font-size']}
          units={FONT_SIZE_UNITS}
          onChange={nextValue => onApplyStyle('font-size', nextValue)}
        />
      </InlineFieldRow>

      <InlineFieldRow label="Weight">
        <SelectControl
          value={styles['font-weight']}
          options={HANDBOOK_FONT_WEIGHT_OPTIONS}
          onChange={nextValue => onApplyStyle('font-weight', nextValue)}
        />
      </InlineFieldRow>

      <StackField label="Style">
        <ButtonGroupControl
          value={styles['font-style']}
          options={HANDBOOK_FONT_STYLE_OPTIONS.filter(Boolean)}
          onChange={nextValue => onApplyStyle('font-style', nextValue)}
        />
      </StackField>

      <InlineFieldRow label="Line Height">
        <InputWithUnitControl
          value={styles['line-height']}
          units={LINE_HEIGHT_UNITS}
          placeholder="normal"
          onChange={nextValue => onApplyStyle('line-height', nextValue)}
        />
      </InlineFieldRow>

      <InlineFieldRow label="Letter Spacing">
        <InputWithUnitControl
          value={styles['letter-spacing']}
          units={LETTER_SPACING_UNITS}
          onChange={nextValue => onApplyStyle('letter-spacing', nextValue)}
        />
      </InlineFieldRow>

      <StackField label="Text Align">
        <ButtonGroupControl
          value={styles['text-align']}
          options={HANDBOOK_TEXT_ALIGN_OPTIONS.filter(Boolean)}
          optionLabels={TEXT_ALIGN_LABELS}
          onChange={nextValue => onApplyStyle('text-align', nextValue)}
        />
      </StackField>

      {supportsVerticalAlign ? (
        <StackField label="Vertical Align">
          <ButtonGroupControl
            value={styles['vertical-align']}
            options={HANDBOOK_VERTICAL_ALIGN_OPTIONS.filter(Boolean)}
            optionLabels={VERTICAL_ALIGN_LABELS}
            onChange={nextValue => onApplyStyle('vertical-align', nextValue)}
          />
        </StackField>
      ) : null}
    </Section>
  );
}

function DecorationSection({
  styles,
  onApplyStyle,
}: {
  styles: HandbookSelectionStyles;
  onApplyStyle: (property: HandbookStyleProperty, value: string) => void;
}) {
  const borderParts = useMemo(() => parseBorderValue(styles.border), [styles.border]);

  const updateBorder = (nextParts: Partial<BorderParts>) => {
    const composed = composeBorderValue({
      ...borderParts,
      ...nextParts,
    });
    onApplyStyle('border', composed);
  };

  return (
    <Section title="Decoration">
      <InlineFieldRow label="Background">
        <HandbookColorPicker
          value={styles['background-color']}
          placeholder="rgba(0,0,0,0)"
          onChange={nextValue => onApplyStyle('background-color', nextValue)}
        />
      </InlineFieldRow>

      <InlineFieldRow label="Radius">
        <InputWithUnitControl
          value={styles['border-radius']}
          units={RADIUS_UNITS}
          onChange={nextValue => onApplyStyle('border-radius', nextValue)}
        />
      </InlineFieldRow>

      <StackField label="Border">
        <div className="grid grid-cols-[96px_1fr_1.1fr] gap-2">
          <InputWithUnitControl
            value={borderParts.width}
            units={BORDER_WIDTH_UNITS}
            placeholder="0"
            unitControlWidth={36}
            unitMenuWidth={56}
            onChange={nextValue => updateBorder({ width: nextValue })}
          />
          <SelectControl
            value={borderParts.style}
            options={HANDBOOK_BORDER_STYLE_OPTIONS}
            size="sm"
            onChange={nextValue => updateBorder({ style: nextValue })}
          />
          <HandbookColorPicker
            value={borderParts.color}
            placeholder="#D1D5DB"
            onChange={nextValue => updateBorder({ color: nextValue })}
          />
        </div>
      </StackField>

      <StackField label="Shadow">
        <InputControl
          value={styles['box-shadow']}
          placeholder="0 4px 12px rgba(0,0,0,0.2)"
          onChange={nextValue => onApplyStyle('box-shadow', nextValue)}
        />
      </StackField>
    </Section>
  );
}

export function HandbookStyleConsole({
  isManualEditorOpen,
  isVisualEditorReady,
  selection,
  onApplyStyle,
}: HandbookStyleConsoleProps) {
  const styles = selection?.styles ?? EMPTY_SELECTION_STYLES;
  const supportsVerticalAlign = Boolean(selection?.supportsVerticalAlign);
  const selectionDescription = selection
    ? `${selection.label} · <${selection.tagName}>`
    : '';
  const initialPaddingMode = hasCustomEdgeValue(styles, [
    'padding-top',
    'padding-right',
    'padding-bottom',
    'padding-left',
  ])
    ? 'Custom'
    : 'All';
  const initialMarginMode = hasCustomEdgeValue(styles, [
    'margin-top',
    'margin-right',
    'margin-bottom',
    'margin-left',
  ])
    ? 'Custom'
    : 'All';

  return (
    <div className="rounded-[14px] border border-[#D1D5DB] bg-white p-3 shadow-[0_8px_18px_rgba(15,23,42,0.04)]">
      <div className="flex items-center justify-between gap-3 border-b border-border-light pb-3">
        <div>
          <p className="text-[12px] font-semibold text-text-primary">Style Console</p>
          <p className="mt-1 text-[11px] text-text-tertiary">{selectionDescription}</p>
        </div>
        <span className="rounded-full bg-bg-secondary px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-text-tertiary">
          Visual
        </span>
      </div>

      <div className="mt-3 space-y-3">
        {!isManualEditorOpen ? (
          <div className="rounded-[10px] border border-dashed border-border-light bg-bg-secondary p-4">
            <p className="text-[13px] font-semibold text-text-primary">Editor is syncing</p>
            <p className="mt-2 text-[12px] leading-[1.6] text-text-secondary">
              Handbook canvas is in edit-first mode and will attach here automatically once the
              latest HTML is ready.
            </p>
          </div>
        ) : !isVisualEditorReady ? (
          <div className="rounded-[10px] border border-border-light bg-bg-secondary p-4">
            <p className="text-[13px] font-semibold text-text-primary">Loading visual editor...</p>
            <p className="mt-2 text-[12px] leading-[1.6] text-text-secondary">
              The handbook canvas is preparing the editable component tree.
            </p>
          </div>
        ) : (
          <>
            <LayoutSection styles={styles} onApplyStyle={onApplyStyle} />
            <SizeSection styles={styles} onApplyStyle={onApplyStyle} />
            <SpaceSectionWithModes
              key={selection?.componentId ?? '__no-selection'}
              styles={styles}
              initialPaddingMode={initialPaddingMode}
              initialMarginMode={initialMarginMode}
              onApplyStyle={onApplyStyle}
            />
            <PositionSection styles={styles} onApplyStyle={onApplyStyle} />
            <TypographySection
              styles={styles}
              supportsVerticalAlign={supportsVerticalAlign}
              onApplyStyle={onApplyStyle}
            />
            <DecorationSection styles={styles} onApplyStyle={onApplyStyle} />
          </>
        )}
      </div>
    </div>
  );
}
