export type TooltipSide = 'top' | 'right' | 'bottom' | 'left';

const TOOLTIP_BASE_CLASS =
  'after:pointer-events-none after:absolute after:z-[120] after:whitespace-nowrap after:rounded-[6px] after:bg-[rgba(17,24,39,0.92)] after:px-2 after:py-1 after:text-[11px] after:font-medium after:leading-none after:text-white after:opacity-0 after:shadow-[0_6px_16px_rgba(15,23,42,0.35)] after:transition-opacity after:duration-150 after:content-[attr(data-tooltip)] hover:after:opacity-100 focus-visible:after:opacity-100';

const TOOLTIP_SIDE_CLASS: Record<TooltipSide, string> = {
  top: 'after:left-1/2 after:top-0 after:-translate-x-1/2 after:-translate-y-[calc(100%+8px)]',
  right: 'after:left-full after:top-1/2 after:ml-2 after:-translate-y-1/2',
  bottom:
    'after:left-1/2 after:bottom-0 after:-translate-x-1/2 after:translate-y-[calc(100%+8px)]',
  left: 'after:right-full after:top-1/2 after:mr-2 after:-translate-y-1/2',
};

export function withTooltip(className: string, side: TooltipSide = 'top'): string {
  const hasPositionClass = /\b(absolute|relative|fixed|sticky)\b/.test(className);
  const anchorClass = hasPositionClass ? '' : ' relative';
  return `${className}${anchorClass} ${TOOLTIP_BASE_CLASS} ${TOOLTIP_SIDE_CLASS[side]}`;
}
