import type { HandbookSelectionAnchorRect } from './handbook-selection';

type ResolveHandbookAddBlockModalPositionArgs = {
  triggerRect: HandbookSelectionAnchorRect;
  panelWidth: number;
  panelHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  gap?: number;
  padding?: number;
};

type HandbookAddBlockModalPosition = {
  top: number;
  left: number;
};

export function resolveHandbookAddBlockModalPosition({
  triggerRect,
  panelWidth,
  panelHeight,
  viewportWidth,
  viewportHeight,
  gap = 8,
  padding = 8,
}: ResolveHandbookAddBlockModalPositionArgs): HandbookAddBlockModalPosition | null {
  if (panelWidth <= 0 || panelHeight <= 0) return null;
  if (panelWidth > viewportWidth - padding * 2) return null;
  if (panelHeight > viewportHeight - padding * 2) return null;

  const preferredLeft = triggerRect.left + triggerRect.width + gap;
  const fallbackLeft = triggerRect.left - panelWidth - gap;
  const maxLeft = viewportWidth - padding - panelWidth;
  const left =
    preferredLeft <= maxLeft
      ? preferredLeft
      : fallbackLeft >= padding
        ? fallbackLeft
        : Math.min(Math.max(preferredLeft, padding), maxLeft);

  const centeredTop = triggerRect.top + triggerRect.height / 2 - panelHeight / 2;
  const maxTop = viewportHeight - padding - panelHeight;
  const top = Math.min(Math.max(centeredTop, padding), maxTop);

  return {
    top: Math.round(top),
    left: Math.round(left),
  };
}
