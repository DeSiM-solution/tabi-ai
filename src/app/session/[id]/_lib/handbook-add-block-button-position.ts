import type { HandbookSelectionAnchorRect } from './handbook-selection';

type ResolveHandbookAddBlockButtonPositionArgs = {
  anchorRect: HandbookSelectionAnchorRect;
  buttonSize: number;
  viewportWidth: number;
  viewportHeight: number;
  gap?: number;
  padding?: number;
};

type HandbookAddBlockButtonPosition = {
  top: number;
  left: number;
};

export function resolveHandbookAddBlockButtonPosition({
  anchorRect,
  buttonSize,
  viewportHeight,
  gap = 8,
  padding = 8,
}: ResolveHandbookAddBlockButtonPositionArgs): HandbookAddBlockButtonPosition | null {
  if (buttonSize > viewportHeight - padding * 2) {
    return null;
  }

  const left = anchorRect.left + anchorRect.width + gap;
  const top = anchorRect.top + anchorRect.height - buttonSize / 2;

  if (top < padding || top + buttonSize > viewportHeight - padding) {
    return null;
  }

  return {
    top: Math.round(top),
    left: Math.round(left),
  };
}
