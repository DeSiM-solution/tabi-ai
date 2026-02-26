export interface SessionItem {
  id: string;
  title: string;
  meta: string;
  isError?: boolean;
}

const STORAGE_KEY = 'tabi-session-items-v1';

export const DEFAULT_SESSION_ITEMS: SessionItem[] = [
  {
    id: 'rick-astley-guide',
    title: "Rick Astley's Guide to Commit...",
    meta: 'Error',
    isError: true,
  },
  { id: 'untitled-guide-1', title: 'Untitled Guide', meta: '15h ago' },
  { id: 'top-japan-1', title: 'Top 11 Famous Japanese Land...', meta: '1d ago' },
  { id: 'top-japan-2', title: 'Top 11 Famous Japanese Land...', meta: '1d ago' },
  { id: 'untitled-guide-2', title: 'Untitled Guide', meta: '1d ago' },
  { id: 'travel-inspiration', title: 'Travel Inspiration', meta: '1d ago' },
  {
    id: 'best-places-japan',
    title: '10 Best Places to Visit in Japan',
    meta: 'Error',
    isError: true,
  },
  {
    id: 'stone-sea',
    title: 'A Journey Through Stone & Sea...',
    meta: 'Error',
    isError: true,
  },
  { id: 'youtube-cxui', title: 'YouTube Video CxuiFNYnEr4', meta: '1d ago' },
];

function sanitizeSessionItem(input: unknown): SessionItem | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const item = input as Record<string, unknown>;
  if (typeof item.id !== 'string' || !item.id.trim()) return null;
  if (typeof item.title !== 'string' || !item.title.trim()) return null;
  if (typeof item.meta !== 'string' || !item.meta.trim()) return null;

  return {
    id: item.id,
    title: item.title,
    meta: item.meta,
    isError: Boolean(item.isError),
  };
}

export function loadSessionItems(): SessionItem[] {
  if (typeof window === 'undefined') {
    return DEFAULT_SESSION_ITEMS;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SESSION_ITEMS;

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return DEFAULT_SESSION_ITEMS;

    const items = parsed
      .map(sanitizeSessionItem)
      .filter((item): item is SessionItem => item !== null);

    return items.length > 0 ? items : DEFAULT_SESSION_ITEMS;
  } catch {
    return DEFAULT_SESSION_ITEMS;
  }
}

export function saveSessionItems(items: SessionItem[]): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function createSessionId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${ts}-${rand}`;
}

export function toSessionTitle(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return 'Untitled Guide';
  if (trimmed.length <= 32) return trimmed;
  return `${trimmed.slice(0, 29)}...`;
}

export function prependSessionItem(
  items: SessionItem[],
  newItem: SessionItem,
): SessionItem[] {
  const rest = items.filter(item => item.id !== newItem.id);
  return [newItem, ...rest];
}
