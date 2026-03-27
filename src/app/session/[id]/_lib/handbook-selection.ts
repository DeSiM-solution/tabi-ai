export const HANDBOOK_LAYOUT_PROPERTIES = [
  'display',
  'flex-direction',
  'justify-content',
  'align-items',
  'flex-wrap',
  'align-content',
  'gap',
  'order',
] as const;
export const HANDBOOK_SPACE_PROPERTIES = [
  'padding',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'margin',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
] as const;
export const HANDBOOK_POSITION_PROPERTIES = [
  'position',
  'top',
  'right',
  'bottom',
  'left',
  'z-index',
  'width',
  'height',
  'min-width',
  'min-height',
  'max-width',
  'max-height',
] as const;
export const HANDBOOK_TYPOGRAPHY_PROPERTIES = [
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'color',
  'line-height',
  'letter-spacing',
  'text-align',
  'vertical-align',
] as const;
export const HANDBOOK_DECORATION_PROPERTIES = [
  'background-color',
  'border-radius',
  'border',
  'box-shadow',
] as const;

export const HANDBOOK_STYLE_PROPERTIES = [
  ...HANDBOOK_LAYOUT_PROPERTIES,
  ...HANDBOOK_SPACE_PROPERTIES,
  ...HANDBOOK_POSITION_PROPERTIES,
  ...HANDBOOK_TYPOGRAPHY_PROPERTIES,
  ...HANDBOOK_DECORATION_PROPERTIES,
] as const;

export const HANDBOOK_DISPLAY_OPTIONS = [
  '',
  'block',
  'inline',
  'inline-block',
  'flex',
  'inline-flex',
  'grid',
  'none',
] as const;
export const HANDBOOK_FLEX_DIRECTION_OPTIONS = [
  '',
  'row',
  'column',
  'row-reverse',
  'column-reverse',
] as const;
export const HANDBOOK_JUSTIFY_OPTIONS = [
  '',
  'flex-start',
  'center',
  'flex-end',
  'space-between',
  'space-around',
  'space-evenly',
] as const;
export const HANDBOOK_ALIGN_ITEMS_OPTIONS = [
  '',
  'stretch',
  'flex-start',
  'center',
  'flex-end',
  'baseline',
] as const;
export const HANDBOOK_FLEX_WRAP_OPTIONS = ['', 'nowrap', 'wrap', 'wrap-reverse'] as const;
export const HANDBOOK_ALIGN_CONTENT_OPTIONS = [
  '',
  'flex-start',
  'center',
  'flex-end',
  'space-between',
  'space-around',
  'stretch',
] as const;
export const HANDBOOK_FONT_FAMILY_OPTIONS = [
  '',
  'Arial',
  'Arial Black',
  'Brush Script MT',
  'Comic Sans MS',
  'Courier New',
  'Georgia',
  'Helvetica',
  'Impact',
  'Lucida Sans Unicode',
  'Tahoma',
  'Times New Roman',
  'Trebuchet MS',
  'Verdana',
] as const;
export const HANDBOOK_FONT_WEIGHT_OPTIONS = [
  '',
  '100',
  '200',
  '300',
  '400',
  '500',
  '600',
  '700',
  '800',
  '900',
] as const;
export const HANDBOOK_FONT_SIZE_OPTIONS = [
  '12px',
  '14px',
  '16px',
  '18px',
  '20px',
  '24px',
  '28px',
  '32px',
  '40px',
  '48px',
  '56px',
] as const;
export const HANDBOOK_TEXT_ALIGN_OPTIONS = ['', 'left', 'center', 'right', 'justify'] as const;
export const HANDBOOK_FONT_STYLE_OPTIONS = ['', 'normal', 'italic', 'oblique'] as const;
export const HANDBOOK_POSITION_OPTIONS = [
  '',
  'static',
  'relative',
  'absolute',
  'sticky',
  'fixed',
] as const;
export const HANDBOOK_VERTICAL_ALIGN_OPTIONS = [
  '',
  'baseline',
  'middle',
  'top',
  'bottom',
] as const;
export const HANDBOOK_BORDER_STYLE_OPTIONS = [
  '',
  'none',
  'solid',
  'dashed',
  'dotted',
  'double',
] as const;

export type HandbookStyleProperty = (typeof HANDBOOK_STYLE_PROPERTIES)[number];

export type HandbookSelectionStyles = Record<HandbookStyleProperty, string>;

export type HandbookSelectionAnchorRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

export type HandbookSelectionSnapshot = {
  componentId: string;
  label: string;
  tagName: string;
  componentType: string;
  parentComponentId: string | null;
  parentLabel: string | null;
  anchorRect: HandbookSelectionAnchorRect | null;
  styles: HandbookSelectionStyles;
  href: string;
  textDecoration: string;
  supportsVerticalAlign: boolean;
  isTextEditable: boolean;
  showTextToolbar: boolean;
  showBlockToolbar: boolean;
  canSelectParent: boolean;
  canDuplicate: boolean;
  canDelete: boolean;
};

type CreateHandbookSelectionSnapshotArgs = {
  componentId: string;
  componentName?: string | null;
  componentType?: string | null;
  tagName?: string | null;
  parentComponentId?: string | null;
  parentComponentName?: string | null;
  anchorRect?: HandbookSelectionAnchorRect | null;
  attributes?: Record<string, unknown> | null;
  styles?: Record<string, unknown> | null;
};

const TEXT_EDITABLE_TAGS = new Set([
  'a',
  'blockquote',
  'em',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'label',
  'li',
  'p',
  'small',
  'span',
  'strong',
]);
const VERTICAL_ALIGN_COMPATIBLE_TAGS = new Set([
  'a',
  'em',
  'img',
  'label',
  'small',
  'span',
  'strong',
  'sub',
  'sup',
  'svg',
  'td',
  'th',
]);

function toTrimmedString(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

export function supportsVerticalAlignTarget(tagName: string): boolean {
  return VERTICAL_ALIGN_COMPATIBLE_TAGS.has(tagName.trim().toLowerCase());
}

export function supportsTextToolbarTarget(tagName: string, componentType: string): boolean {
  const normalizedTagName = tagName.trim().toLowerCase();
  const normalizedComponentType = componentType.trim().toLowerCase();
  return normalizedComponentType.includes('text') || TEXT_EDITABLE_TAGS.has(normalizedTagName);
}

export function isRootSelectionTarget(tagName: string, componentType: string): boolean {
  const normalizedTagName = tagName.trim().toLowerCase();
  const normalizedComponentType = componentType.trim().toLowerCase();
  return (
    normalizedTagName === 'body'
    || normalizedTagName === 'html'
    || normalizedComponentType === 'wrapper'
  );
}

function normalizeAnchorRect(
  anchorRect: HandbookSelectionAnchorRect | null | undefined,
): HandbookSelectionAnchorRect | null {
  if (!anchorRect) return null;
  if (
    !Number.isFinite(anchorRect.top)
    || !Number.isFinite(anchorRect.left)
    || !Number.isFinite(anchorRect.width)
    || !Number.isFinite(anchorRect.height)
  ) {
    return null;
  }
  return {
    top: anchorRect.top,
    left: anchorRect.left,
    width: anchorRect.width,
    height: anchorRect.height,
  };
}

function createEmptySelectionStyles(): HandbookSelectionStyles {
  return Object.fromEntries(
    HANDBOOK_STYLE_PROPERTIES.map(property => [property, '']),
  ) as HandbookSelectionStyles;
}

export function createHandbookSelectionSnapshot({
  componentId,
  componentName,
  componentType,
  tagName,
  parentComponentId,
  parentComponentName,
  anchorRect,
  attributes,
  styles,
}: CreateHandbookSelectionSnapshotArgs): HandbookSelectionSnapshot {
  const normalizedTagName = toTrimmedString(tagName).toLowerCase() || 'div';
  const normalizedComponentType = toTrimmedString(componentType).toLowerCase();
  const normalizedParentComponentId = toTrimmedString(parentComponentId) || null;
  const isRootSelection = isRootSelectionTarget(normalizedTagName, normalizedComponentType);
  const isTextEditable = supportsTextToolbarTarget(normalizedTagName, normalizedComponentType);
  const normalizedLabel =
    toTrimmedString(componentName)
    || normalizedComponentType
    || normalizedTagName
    || 'selected element';
  const normalizedStyles = createEmptySelectionStyles();

  for (const property of HANDBOOK_STYLE_PROPERTIES) {
    normalizedStyles[property] = toTrimmedString(styles?.[property]);
  }

  return {
    componentId: componentId.trim(),
    label: normalizedLabel,
    tagName: normalizedTagName,
    componentType: normalizedComponentType,
    parentComponentId: normalizedParentComponentId,
    parentLabel: toTrimmedString(parentComponentName) || null,
    anchorRect: normalizeAnchorRect(anchorRect),
    styles: normalizedStyles,
    href: toTrimmedString(attributes?.href),
    textDecoration:
      toTrimmedString(styles?.['text-decoration-line'])
      || toTrimmedString(styles?.['text-decoration']),
    supportsVerticalAlign: supportsVerticalAlignTarget(normalizedTagName),
    isTextEditable,
    showTextToolbar: !isRootSelection && isTextEditable,
    showBlockToolbar: !isRootSelection && !isTextEditable,
    canSelectParent: !isRootSelection && Boolean(normalizedParentComponentId),
    canDuplicate: !isRootSelection,
    canDelete: !isRootSelection,
  };
}

export function buildHandbookStylePatch(
  property: HandbookStyleProperty,
  value: string,
): Record<HandbookStyleProperty, string> {
  return {
    [property]: value.trim(),
  } as Record<HandbookStyleProperty, string>;
}
