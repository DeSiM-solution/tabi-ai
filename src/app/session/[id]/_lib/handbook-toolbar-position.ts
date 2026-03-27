import type { HandbookSelectionAnchorRect } from './handbook-selection';

type ResolveHandbookFloatingToolbarPositionArgs = {
  anchorRect: HandbookSelectionAnchorRect;
  toolbarWidth: number;
  toolbarHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  gap?: number;
  padding?: number;
};

type HandbookFloatingToolbarPosition = {
  top: number;
  left: number;
};

export function resolveHandbookFloatingToolbarPosition({
  anchorRect,
  toolbarWidth,
  toolbarHeight,
  viewportWidth,
  viewportHeight,
  gap = 12,
  padding = 8,
}: ResolveHandbookFloatingToolbarPositionArgs): HandbookFloatingToolbarPosition {
  const anchorCenterX = anchorRect.left + anchorRect.width / 2;
  const rawLeft = anchorCenterX - toolbarWidth / 2;
  const maxLeft = Math.max(padding, viewportWidth - padding - toolbarWidth);
  const left = Math.min(Math.max(rawLeft, padding), maxLeft);

  const preferredTop = anchorRect.top - toolbarHeight - gap;
  const fallbackTop = anchorRect.top + anchorRect.height + gap;
  const maxTop = Math.max(padding, viewportHeight - padding - toolbarHeight);
  const top =
    preferredTop >= padding
      ? preferredTop
      : Math.min(Math.max(fallbackTop, padding), maxTop);

  return {
    top,
    left,
  };
}
