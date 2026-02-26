export const HANDBOOK_LIFECYCLE_OPTIONS = ['DRAFT', 'ARCHIVED', 'PUBLIC'] as const;

export type HandbookLifecycle = (typeof HANDBOOK_LIFECYCLE_OPTIONS)[number];

export const DEFAULT_HANDBOOK_LIFECYCLE: HandbookLifecycle = 'DRAFT';

export function isHandbookLifecycle(value: unknown): value is HandbookLifecycle {
  return (
    typeof value === 'string'
    && HANDBOOK_LIFECYCLE_OPTIONS.includes(value as HandbookLifecycle)
  );
}

export function normalizeHandbookLifecycle(value: unknown): HandbookLifecycle | null {
  if (!isHandbookLifecycle(value)) return null;
  return value;
}

export function getHandbookLifecycleLabel(value: HandbookLifecycle): string {
  if (value === 'PUBLIC') return 'Public';
  if (value === 'ARCHIVED') return 'Archived';
  return 'Draft';
}
