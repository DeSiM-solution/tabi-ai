export const HANDBOOK_STYLE_OPTIONS = [
  {
    id: 'minimal-tokyo',
    label: 'Minimal Tokyo',
    instruction:
      'Japanese editorial minimalism, generous whitespace, refined typography, restrained colors, clean layout rhythm.',
  },
  {
    id: 'warm-analog',
    label: 'Warm Analog',
    instruction:
      'Warm paper-like tones, subtle texture, analog travel-magazine mood, soft contrast, cozy readable typography.',
  },
  {
    id: 'brutalist',
    label: 'Brutalist',
    instruction:
      'High contrast, bold type, strong geometric blocks, sharp hierarchy, deliberate rawness while keeping readability.',
  },
  {
    id: 'dreamy-soft',
    label: 'Dreamy Soft',
    instruction:
      'Soft gradients, airy spacing, gentle shadows, elegant and calm visual rhythm, immersive travel storytelling tone.',
  },
  {
    id: 'let-tabi-decide',
    label: 'Let Tabi decide',
    instruction: null,
  },
] as const;

export type HandbookStyleId = (typeof HANDBOOK_STYLE_OPTIONS)[number]['id'];

export const DEFAULT_HANDBOOK_STYLE: HandbookStyleId = 'minimal-tokyo';
export const AUTO_HANDBOOK_STYLE: HandbookStyleId = 'let-tabi-decide';

const HANDBOOK_STYLE_ID_SET = new Set<string>(
  HANDBOOK_STYLE_OPTIONS.map(option => option.id),
);

export function isHandbookStyleId(value: unknown): value is HandbookStyleId {
  return typeof value === 'string' && HANDBOOK_STYLE_ID_SET.has(value);
}

export function normalizeHandbookStyle(value: unknown): HandbookStyleId | null {
  if (!isHandbookStyleId(value)) return null;
  return value;
}

export function getHandbookStyleLabel(style: HandbookStyleId): string {
  const matched = HANDBOOK_STYLE_OPTIONS.find(option => option.id === style);
  return matched?.label ?? 'Let Tabi decide';
}

export function getHandbookStyleInstruction(
  style: HandbookStyleId,
): string | null {
  const matched = HANDBOOK_STYLE_OPTIONS.find(option => option.id === style);
  return matched?.instruction ?? null;
}
