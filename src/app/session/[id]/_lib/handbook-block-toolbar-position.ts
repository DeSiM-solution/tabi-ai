import type { HandbookSelectionAnchorRect } from './handbook-selection';

type ResolveHandbookBlockToolbarPositionArgs = {
  anchorRect: HandbookSelectionAnchorRect;
  toolbarWidth: number;
  toolbarHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  gap?: number;
  padding?: number;
};

type HandbookBlockToolbarPosition = {
  top: number;
  left: number;
};

export function resolveHandbookBlockToolbarPosition({
  anchorRect,
  toolbarWidth,
  toolbarHeight,
  viewportWidth,
  viewportHeight,
  gap = 8,
  padding = 8,
}: ResolveHandbookBlockToolbarPositionArgs): HandbookBlockToolbarPosition | null {
  const rawLeft = anchorRect.left + anchorRect.width - toolbarWidth;
  const maxLeft = Math.max(padding, viewportWidth - padding - toolbarWidth);
  const left = Math.min(Math.max(rawLeft, padding), maxLeft);

  const preferredTop = anchorRect.top - toolbarHeight - gap;
  const fallbackTop = anchorRect.top + anchorRect.height + gap;

  if (preferredTop >= padding) {
    return {
      top: preferredTop,
      left,
    };
  }

  if (fallbackTop + toolbarHeight <= viewportHeight - padding) {
    return {
      top: fallbackTop,
      left,
    };
  }

  return null;
}
