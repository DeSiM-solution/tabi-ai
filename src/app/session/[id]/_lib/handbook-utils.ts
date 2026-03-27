import { getHandbookLifecycleLabel, type HandbookLifecycle } from '@/lib/handbook-lifecycle';
import { normalizeHandbookStyle, type HandbookStyleId } from '@/lib/handbook-style';
import { formatSessionDateTime } from '@/lib/session-time';

import { isRecord } from './chat-utils';
import { GENERATING_HANDBOOK_TITLE } from './session-page-constants';

export type PersistedHandbookGenerationKind = 'initial' | 'remix';

export function getHandbookLifecycleStatusLabel(
  lifecycle: HandbookLifecycle,
): string {
  if (lifecycle === 'ARCHIVED') return 'Archive';
  return getHandbookLifecycleLabel(lifecycle);
}

export function getHandbookLifecycleBadgeClass(
  lifecycle: HandbookLifecycle,
): string {
  if (lifecycle === 'PUBLIC') {
    return 'border border-[#8BD9CF] bg-[#E7F8F4] text-[#0F766E]';
  }
  if (lifecycle === 'ARCHIVED') {
    return 'border border-[#DDD6CF] bg-[#F6F3F0] text-[#6B6560]';
  }
  return 'border border-[#EAD8B6] bg-[#FFF7E8] text-[#9A5B13]';
}

export function toHandbookCreatedAtTooltip(
  createdAt: string | null | undefined,
): string {
  const normalized = typeof createdAt === 'string' ? createdAt.trim() : '';
  if (!normalized) return 'Created at: Unknown';
  const timestamp = Date.parse(normalized);
  if (!Number.isNaN(timestamp)) {
    return `Created at: ${formatSessionDateTime(timestamp)}`;
  }
  return `Created at: ${normalized}`;
}

export function getPersistedHandbookStyle(context: unknown): HandbookStyleId | null {
  if (!isRecord(context)) return null;
  const rootStyle = normalizeHandbookStyle(context.handbookStyle);
  if (rootStyle) return rootStyle;

  const nestedVideo = isRecord(context.video) ? context.video : null;
  const nestedStyle = normalizeHandbookStyle(nestedVideo?.handbookStyle);
  return nestedStyle;
}

export function getPersistedHandbookGenerationKind(
  context: unknown,
): PersistedHandbookGenerationKind | null {
  if (!isRecord(context)) return null;
  return context.generationKind === 'initial' || context.generationKind === 'remix'
    ? context.generationKind
    : null;
}

export function isGeneratingHandbookPlaceholderTitle(
  value: string | null | undefined,
): boolean {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized === GENERATING_HANDBOOK_TITLE;
}
