import {
  Fragment,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import type { IconType } from 'react-icons/lib';
import { createPortal } from 'react-dom';
import {
  FiCoffee,
  FiMapPin,
  FiPlus,
  FiShoppingBag,
  FiStar,
  FiTrash2,
  FiTruck,
  FiX,
} from 'react-icons/fi';
import {
  LuArrowDown,
  LuArrowUp,
  LuChevronDown,
  LuChevronUp,
  LuEllipsisVertical,
} from 'react-icons/lu';
import {
  BLOCK_TYPES,
  createBlockId,
  type EditableBlockDraft,
  type EditorSession,
} from '../_lib/chat-utils';

interface BlockEditorWorkspaceProps {
  session: EditorSession | null;
  onChange: (session: EditorSession) => void;
}

interface FloatingToolbarPosition {
  top: number;
  left: number;
}

type TooltipSide = 'top' | 'right' | 'bottom' | 'left';

const BLOCK_TYPE_META: Record<
  (typeof BLOCK_TYPES)[number],
  {
    label: string;
    icon: IconType;
    descriptionPlaceholder: string;
    iconToneClassName: string;
    railClassName: string;
  }
> = {
  food: {
    label: 'Food',
    icon: FiCoffee,
    descriptionPlaceholder: 'What should people order here? Why is it special?',
    iconToneClassName: 'border-amber-200 bg-amber-50 text-amber-600',
    railClassName: 'bg-amber-50/60 text-amber-700',
  },
  spot: {
    label: 'Attraction',
    icon: FiMapPin,
    descriptionPlaceholder: 'What makes this spot worth visiting?',
    iconToneClassName: 'border-sky-200 bg-sky-50 text-sky-600',
    railClassName: 'bg-sky-50/60 text-sky-700',
  },
  transport: {
    label: 'Transport',
    icon: FiTruck,
    descriptionPlaceholder: 'How should people get there? Include useful tips.',
    iconToneClassName: 'border-emerald-200 bg-emerald-50 text-emerald-600',
    railClassName: 'bg-emerald-50/60 text-emerald-700',
  },
  shopping: {
    label: 'Shopping',
    icon: FiShoppingBag,
    descriptionPlaceholder: 'What should people buy and why?',
    iconToneClassName: 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-600',
    railClassName: 'bg-fuchsia-50/60 text-fuchsia-700',
  },
  other: {
    label: 'Extra',
    icon: FiStar,
    descriptionPlaceholder: 'Add any helpful travel note for this block.',
    iconToneClassName: 'border-slate-200 bg-slate-100 text-slate-600',
    railClassName: 'bg-slate-100 text-slate-700',
  },
};

function normalizeTag(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  return trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
}

const TOOLTIP_BASE_CLASS =
  'after:pointer-events-none after:absolute after:z-[120] after:whitespace-nowrap after:rounded-[6px] after:bg-[rgba(17,24,39,0.92)] after:px-2 after:py-1 after:text-[11px] after:font-medium after:leading-none after:text-white after:opacity-0 after:shadow-[0_6px_16px_rgba(15,23,42,0.35)] after:transition-opacity after:duration-150 after:content-[attr(data-tooltip)] hover:after:opacity-100 focus-visible:after:opacity-100';
const TOOLTIP_SIDE_CLASS: Record<TooltipSide, string> = {
  top: 'after:left-1/2 after:top-0 after:-translate-x-1/2 after:-translate-y-[calc(100%+8px)]',
  right:
    'after:left-full after:top-1/2 after:ml-2 after:-translate-y-1/2',
  bottom:
    'after:left-1/2 after:bottom-0 after:-translate-x-1/2 after:translate-y-[calc(100%+8px)]',
  left:
    'after:right-full after:top-1/2 after:mr-2 after:-translate-y-1/2',
};
const TOOLBAR_CLOSE_SCROLL_THRESHOLD = 56;

function withTooltip(className: string, side: TooltipSide = 'top'): string {
  const hasPositionClass = /\b(absolute|relative|fixed|sticky)\b/.test(className);
  const anchorClass = hasPositionClass ? '' : ' relative';
  return `${className}${anchorClass} ${TOOLTIP_BASE_CLASS} ${TOOLTIP_SIDE_CLASS[side]}`;
}

export function BlockEditorWorkspace({
  session,
  onChange,
}: BlockEditorWorkspaceProps) {
  const [advancedOpenByBlockId, setAdvancedOpenByBlockId] = useState<
    Record<string, boolean>
  >({});
  const [tagEditorByBlockId, setTagEditorByBlockId] = useState<
    Record<string, { index: number; value: string } | undefined>
  >({});
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [hoveredBlockId, setHoveredBlockId] = useState<string | null>(null);
  const [toolbarOpenBlockId, setToolbarOpenBlockId] = useState<string | null>(null);
  const [categoryPickerBlockId, setCategoryPickerBlockId] = useState<string | null>(
    null,
  );
  const [toolbarPosition, setToolbarPosition] = useState<FloatingToolbarPosition | null>(
    null,
  );
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const toolbarContainerRef = useRef<HTMLDivElement | null>(null);
  const railRefByBlockId = useRef<Record<string, HTMLDivElement | null>>({});
  const toolbarOpenScrollTopRef = useRef<number | null>(null);

  const setRailRef = useCallback((blockId: string, node: HTMLDivElement | null) => {
    railRefByBlockId.current[blockId] = node;
  }, []);
  const closeToolbar = useCallback(() => {
    setToolbarOpenBlockId(null);
    setToolbarPosition(null);
  }, []);
  const sessionBlockCount = session?.blocks.length ?? 0;

  const updateFloatingToolbarPosition = useCallback(() => {
    if (!toolbarOpenBlockId) {
      setToolbarPosition(null);
      return;
    }

    const anchor = railRefByBlockId.current[toolbarOpenBlockId];
    if (!anchor) {
      setToolbarPosition(null);
      return;
    }

    const rect = anchor.getBoundingClientRect();
    const toolbarWidth = 96;
    const nextLeft = Math.max(8, rect.left - toolbarWidth - 6);
    const nextTop = Math.max(8, rect.top + 4);

    setToolbarPosition(previous => {
      if (!previous) {
        return { left: nextLeft, top: nextTop };
      }
      const leftDiff = Math.abs(previous.left - nextLeft);
      const topDiff = Math.abs(previous.top - nextTop);
      if (leftDiff < 0.5 && topDiff < 0.5) return previous;
      return { left: nextLeft, top: nextTop };
    });
  }, [toolbarOpenBlockId]);

  useEffect(() => {
    const raf = requestAnimationFrame(updateFloatingToolbarPosition);
    const onViewportChange = () => {
      requestAnimationFrame(updateFloatingToolbarPosition);
    };
    const scrollElement = scrollContainerRef.current;

    window.addEventListener('resize', onViewportChange);
    window.addEventListener('scroll', onViewportChange, true);
    scrollElement?.addEventListener('scroll', onViewportChange);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onViewportChange);
      window.removeEventListener('scroll', onViewportChange, true);
      scrollElement?.removeEventListener('scroll', onViewportChange);
    };
  }, [updateFloatingToolbarPosition, toolbarOpenBlockId, sessionBlockCount]);

  useEffect(() => {
    const raf = requestAnimationFrame(updateFloatingToolbarPosition);
    return () => cancelAnimationFrame(raf);
  });

  useEffect(() => {
    if (!toolbarOpenBlockId) {
      toolbarOpenScrollTopRef.current = null;
      return;
    }

    toolbarOpenScrollTopRef.current = scrollContainerRef.current?.scrollTop ?? 0;
  }, [toolbarOpenBlockId]);

  useEffect(() => {
    if (!toolbarOpenBlockId) return;
    const scrollElement = scrollContainerRef.current;
    if (!scrollElement) return;

    const openScrollTop = toolbarOpenScrollTopRef.current ?? scrollElement.scrollTop;
    const closeOnEditorScroll = () => {
      if (
        Math.abs(scrollElement.scrollTop - openScrollTop) <=
        TOOLBAR_CLOSE_SCROLL_THRESHOLD
      ) {
        return;
      }
      closeToolbar();
    };

    scrollElement.addEventListener('scroll', closeOnEditorScroll, {
      passive: true,
    });
    return () => {
      scrollElement.removeEventListener('scroll', closeOnEditorScroll);
    };
  }, [closeToolbar, toolbarOpenBlockId]);

  useEffect(() => {
    if (!toolbarOpenBlockId) return;

    const closeMenu = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (toolbarContainerRef.current?.contains(target)) return;
      if (target instanceof Element && target.closest('[data-block-toolbar-trigger="true"]')) {
        return;
      }
      closeToolbar();
    };

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      closeToolbar();
    };

    window.addEventListener('mousedown', closeMenu);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('mousedown', closeMenu);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [closeToolbar, toolbarOpenBlockId]);

  if (!session) return null;
  const thumbnailUrl = session.thumbnailUrl.trim();
  const toolbarBlockIndex = toolbarOpenBlockId
    ? session.blocks.findIndex(block => block.block_id === toolbarOpenBlockId)
    : -1;

  const createNewBlock = (): EditableBlockDraft => {
    const nextIndex = session.blocks.length + 1;
    return {
      block_id: createBlockId(),
      type: 'spot',
      title: `Block ${nextIndex}`,
      description: '',
      smart_tags: [],
      latInput: '',
      lngInput: '',
      newTagInput: '',
    };
  };

  const insertBlockAt = (index: number) => {
    const safeIndex = Math.min(Math.max(index, 0), session.blocks.length);
    const nextBlock: EditableBlockDraft = createNewBlock();
    setActiveBlockId(nextBlock.block_id);

    onChange({
      ...session,
      blocks: [
        ...session.blocks.slice(0, safeIndex),
        nextBlock,
        ...session.blocks.slice(safeIndex),
      ],
    });
  };

  const deleteBlock = (index: number) => {
    const removedBlockId = session.blocks[index]?.block_id;
    if (removedBlockId && activeBlockId === removedBlockId) {
      setActiveBlockId(null);
    }
    if (removedBlockId && toolbarOpenBlockId === removedBlockId) {
      closeToolbar();
    }
    onChange({
      ...session,
      blocks: session.blocks.filter((_, i) => i !== index),
    });
  };

  const updateBlock = (
    index: number,
    updater: (block: EditableBlockDraft) => EditableBlockDraft,
  ) => {
    onChange({
      ...session,
      blocks: session.blocks.map((block, i) => (i === index ? updater(block) : block)),
    });
  };

  const openTagEditor = (blockId: string, index: number, value: string) => {
    setTagEditorByBlockId(previous => ({
      ...previous,
      [blockId]: { index, value },
    }));
  };

  const closeTagEditor = (blockId: string) => {
    setTagEditorByBlockId(previous => ({
      ...previous,
      [blockId]: undefined,
    }));
  };

  const updateTagEditorValue = (blockId: string, value: string) => {
    setTagEditorByBlockId(previous => {
      const current = previous[blockId];
      if (!current) return previous;
      return {
        ...previous,
        [blockId]: {
          ...current,
          value,
        },
      };
    });
  };

  const commitTagEditor = (blockIndex: number, blockId: string) => {
    const editor = tagEditorByBlockId[blockId];
    if (!editor) return;

    const normalized = normalizeTag(editor.value);
    updateBlock(blockIndex, current => {
      if (editor.index === -1) {
        if (!normalized || current.smart_tags.includes(normalized)) return current;
        return {
          ...current,
          smart_tags: [...current.smart_tags, normalized],
        };
      }

      if (editor.index < 0 || editor.index >= current.smart_tags.length) return current;

      if (!normalized) {
        return {
          ...current,
          smart_tags: current.smart_tags.filter((_, i) => i !== editor.index),
        };
      }

      const duplicated = current.smart_tags.some(
        (tag, i) => i !== editor.index && tag === normalized,
      );
      if (duplicated) {
        return {
          ...current,
          smart_tags: current.smart_tags.filter((_, i) => i !== editor.index),
        };
      }

      return {
        ...current,
        smart_tags: current.smart_tags.map((tag, i) =>
          i === editor.index ? normalized : tag,
        ),
      };
    });

    closeTagEditor(blockId);
  };

  const toggleAdvanced = (blockId: string) => {
    setAdvancedOpenByBlockId(previous => ({
      ...previous,
      [blockId]: !previous[blockId],
    }));
  };

  const setBlockType = (index: number, nextType: (typeof BLOCK_TYPES)[number]) => {
    updateBlock(index, current => ({
      ...current,
      type: nextType,
    }));
    setCategoryPickerBlockId(null);
  };

  const moveBlock = (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= session.blocks.length) return;

    const reordered = [...session.blocks];
    const [moving] = reordered.splice(index, 1);
    if (!moving) return;
    reordered.splice(targetIndex, 0, moving);
    onChange({
      ...session,
      blocks: reordered,
    });
    setActiveBlockId(moving.block_id);
  };

  const commitTitle = (index: number, rawText: string) => {
    const nextTitle = rawText.trim() || `Block ${index + 1}`;
    updateBlock(index, current => ({
      ...current,
      title: nextTitle,
    }));
  };

  const commitDescription = (index: number, rawText: string) => {
    updateBlock(index, current => ({
      ...current,
      description: rawText.trim(),
    }));
  };
  const commitGuideTitle = (rawText: string) => {
    onChange({
      ...session,
      title: rawText.trim(),
    });
  };
  const commitGuideThumbnail = (rawText: string) => {
    onChange({
      ...session,
      thumbnailUrl: rawText.trim(),
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[14px] border border-border-light bg-bg-primary">
      <div className="relative border-b border-border-light px-4 pb-4 pt-4">
        {thumbnailUrl ? (
          <div
            className="absolute inset-0 bg-cover bg-center opacity-20"
            style={{ backgroundImage: `url(${thumbnailUrl})` }}
          />
        ) : null}
        <div className="relative">
          <h2 className="text-[20px] font-semibold tracking-[-0.02em] text-text-primary">
            Plan Blocks Like A Traveler
          </h2>
          <div className="mt-3 flex flex-col gap-2.5 rounded-[12px] border border-border-light bg-bg-elevated p-3">
            <div className="space-y-1">
              <span className="text-[11px] font-medium text-text-tertiary">Guide Title</span>
              <div
                role="textbox"
                contentEditable
                suppressContentEditableWarning
                onFocus={event => {
                  if (!session.title.trim()) {
                    event.currentTarget.textContent = '';
                  }
                }}
                onBlur={event => commitGuideTitle(event.currentTarget.textContent ?? '')}
                onKeyDown={event => {
                  if (event.key !== 'Enter') return;
                  event.preventDefault();
                  event.currentTarget.blur();
                }}
                className={`min-h-[40px] cursor-text rounded-[10px] px-2 py-1.5 text-[18px] font-semibold leading-[1.35] tracking-[-0.01em] outline-none transition hover:bg-bg-secondary/70 focus:bg-bg-secondary ${
                  session.title.trim() ? 'text-text-primary' : 'text-text-tertiary'
                }`}
              >
                {session.title.trim() || 'Example: A Cozy 1-Day Osaka Plan'}
              </div>
            </div>
            <div className="space-y-1">
              <span className="text-[11px] font-medium text-text-tertiary">
                Cover Image URL (Optional)
              </span>
              <div
                role="textbox"
                contentEditable
                suppressContentEditableWarning
                onFocus={event => {
                  if (!session.thumbnailUrl.trim()) {
                    event.currentTarget.textContent = '';
                  }
                }}
                onBlur={event => commitGuideThumbnail(event.currentTarget.textContent ?? '')}
                onKeyDown={event => {
                  if (event.key !== 'Enter') return;
                  event.preventDefault();
                  event.currentTarget.blur();
                }}
                className={`min-h-[40px] cursor-text rounded-[10px] px-2 py-1.5 text-[13px] leading-6 outline-none transition hover:bg-bg-secondary/70 focus:bg-bg-secondary ${
                  session.thumbnailUrl.trim()
                    ? 'break-all text-text-primary'
                    : 'text-text-tertiary'
                }`}
              >
                {session.thumbnailUrl.trim() || 'https://...'}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div
        ref={scrollContainerRef}
        className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-4 py-4"
      >
        <p className="mb-1.5 px-0.5 text-[12px] text-text-secondary">
          {session.blocks.length === 0
            ? 'No blocks yet'
            : `${session.blocks.length} block${session.blocks.length > 1 ? 's' : ''} in this guide`}
        </p>

        {session.blocks.length === 0 ? (
          <div className="rounded-[14px] border border-dashed border-border-default bg-bg-elevated p-8 text-center">
            <p className="text-[14px] font-medium text-text-secondary">
              Start by adding your first block.
            </p>
            <p className="mt-1 text-[12px] text-text-tertiary">
              You can describe a restaurant, attraction, transport tip, or shopping place.
            </p>
            <button
              type="button"
              onClick={() => insertBlockAt(0)}
              data-tooltip="Add first block"
              className={withTooltip(
                'mt-4 inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-accent-primary px-3.5 text-[12px] font-semibold text-text-inverse transition hover:brightness-95',
              )}
            >
              <FiPlus className="h-3.5 w-3.5" />
              Add first block
            </button>
          </div>
        ) : (
          <div className="space-y-0">
            <div className="group relative z-10 -my-0.5 flex h-5 items-center justify-center">
              <span className="h-1 w-full rounded-full bg-[rgba(203,213,225,0.85)] opacity-0 transition-opacity duration-150 group-hover:opacity-100" />
              <button
                type="button"
                onClick={() => insertBlockAt(0)}
                data-tooltip="Add block before first block"
                aria-label="add block before first block"
                className={withTooltip(
                  'absolute left-1/2 -translate-x-1/2 inline-flex h-8 w-8 items-center justify-center rounded-full border border-border-default bg-bg-elevated text-text-tertiary opacity-0 shadow-[0_6px_18px_rgba(45,42,38,0.16)] transition-all duration-150 hover:border-accent-primary hover:text-accent-primary group-hover:opacity-100 focus-visible:opacity-100',
                )}
              >
                <FiPlus className="h-3.5 w-3.5" />
              </button>
            </div>
            {session.blocks.map((block, index) => {
              const typeMeta = BLOCK_TYPE_META[block.type] ?? BLOCK_TYPE_META.spot;
              const TypeIcon = typeMeta.icon;
              const advancedOpen = Boolean(advancedOpenByBlockId[block.block_id]);
              const tagEditor = tagEditorByBlockId[block.block_id];
              const hasNextBlock = index < session.blocks.length - 1;
              const isActive = activeBlockId === block.block_id;
              const isHovered = hoveredBlockId === block.block_id;
              const isToolbarOpen = toolbarOpenBlockId === block.block_id;
              const showToolbarTrigger = isActive || isHovered || isToolbarOpen;

              return (
                <Fragment key={`${block.block_id}-${index}`}>
                  <article
                    onMouseEnter={() => setHoveredBlockId(block.block_id)}
                    onMouseLeave={() =>
                      setHoveredBlockId(previous =>
                        previous === block.block_id ? null : previous,
                      )
                    }
                    onClick={() => {
                      setActiveBlockId(block.block_id);
                      if (categoryPickerBlockId !== block.block_id) {
                        setCategoryPickerBlockId(null);
                      }
                      if (toolbarOpenBlockId !== block.block_id) {
                        setToolbarOpenBlockId(null);
                      }
                    }}
                    className={`relative grid grid-cols-[56px_minmax(0,1fr)] overflow-visible rounded-[14px] border bg-bg-elevated transition ${
                      isActive
                        ? 'border-accent-primary shadow-[0_0_0_2px_rgba(59,130,246,0.14)]'
                        : 'border-border-light'
                    }`}
                  >
                    <div
                      ref={node => setRailRef(block.block_id, node)}
                      className={`relative flex flex-col items-center gap-2 rounded-l-[14px] border-r border-border-light px-2 py-3 ${typeMeta.railClassName}`}
                    >
                      <button
                        type="button"
                        data-block-toolbar-trigger="true"
                        onClick={event => {
                          event.stopPropagation();
                          setActiveBlockId(block.block_id);
                          setToolbarOpenBlockId(previous =>
                            previous === block.block_id ? null : block.block_id,
                          );
                        }}
                        data-tooltip="Open block tools"
                        aria-label={`open block ${index + 1} tools`}
                        className={withTooltip(
                          `absolute -left-3 top-10 inline-flex h-6 w-5 items-center justify-center rounded-[7px] border border-border-light bg-bg-elevated text-text-tertiary shadow-[0_2px_8px_rgba(15,23,42,0.12)] transition ${
                            showToolbarTrigger
                              ? 'opacity-100'
                              : 'pointer-events-none opacity-0'
                          } hover:text-text-primary`,
                          'right',
                        )}
                      >
                        <LuEllipsisVertical className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={event => {
                          event.stopPropagation();
                          setActiveBlockId(block.block_id);
                          setCategoryPickerBlockId(previous =>
                            previous === block.block_id ? null : block.block_id,
                          );
                        }}
                        aria-label={`choose category for block ${index + 1}`}
                        className={`inline-flex h-7 w-7 items-center justify-center rounded-full border ${typeMeta.iconToneClassName}`}
                      >
                        <TypeIcon className="h-3.5 w-3.5" />
                      </button>
                      {categoryPickerBlockId === block.block_id ? (
                        <div className="absolute left-[64px] top-2 z-30 flex items-center gap-1 rounded-[10px] border border-border-light bg-bg-elevated p-1 shadow-[0_10px_24px_rgba(15,23,42,0.16)]">
                          {BLOCK_TYPES.map(type => {
                            const optionMeta = BLOCK_TYPE_META[type];
                            const OptionIcon = optionMeta.icon;
                            const isCurrent = type === block.type;

                            return (
                              <button
                                key={type}
                                type="button"
                                onClick={event => {
                                  event.stopPropagation();
                                  setBlockType(index, type);
                                  setActiveBlockId(block.block_id);
                                }}
                                data-tooltip={optionMeta.label}
                                aria-label={`set category to ${optionMeta.label}`}
                                className={withTooltip(
                                  `inline-flex h-8 w-8 items-center justify-center rounded-[8px] border transition ${
                                    isCurrent
                                      ? optionMeta.iconToneClassName
                                      : 'border-border-default bg-bg-elevated text-text-secondary hover:bg-bg-secondary'
                                  }`,
                                )}
                              >
                                <OptionIcon className="h-4 w-4" />
                              </button>
                            );
                          })}
                        </div>
                      ) : null}
                      <span className="text-[20px] font-semibold leading-none">{index + 1}</span>
                    </div>

                    <div className="min-w-0 px-4 py-3">
                      <h3
                        role="textbox"
                        contentEditable
                        suppressContentEditableWarning
                        onFocus={event => {
                          setActiveBlockId(block.block_id);
                          if (!block.title.trim()) {
                            event.currentTarget.textContent = '';
                          }
                        }}
                        onBlur={event => commitTitle(index, event.currentTarget.textContent ?? '')}
                        onKeyDown={event => {
                          if (event.key !== 'Enter') return;
                          event.preventDefault();
                          event.currentTarget.blur();
                        }}
                        className="cursor-text rounded-[10px] px-2 py-1 text-[24px] font-semibold leading-[1.25] tracking-[-0.02em] text-text-primary outline-none transition hover:bg-bg-secondary/70 focus:bg-bg-secondary md:text-[26px]"
                      >
                        {block.title.trim() || `Block ${index + 1}`}
                      </h3>

                      <div
                        role="textbox"
                        contentEditable
                        suppressContentEditableWarning
                        onFocus={event => {
                          setActiveBlockId(block.block_id);
                          if (
                            !block.description.trim() &&
                            event.currentTarget.textContent?.trim() ===
                              typeMeta.descriptionPlaceholder
                          ) {
                            event.currentTarget.textContent = '';
                          }
                        }}
                        onBlur={event =>
                          commitDescription(index, event.currentTarget.textContent ?? '')
                        }
                        className={`mt-1 min-h-[78px] cursor-text whitespace-pre-wrap rounded-[10px] px-2 py-2 text-[14px] leading-6 outline-none transition hover:bg-bg-secondary/70 focus:bg-bg-secondary ${
                          block.description.trim()
                            ? 'text-text-secondary'
                            : 'text-text-tertiary'
                        }`}
                      >
                        {block.description.trim() || typeMeta.descriptionPlaceholder}
                      </div>

                      {isActive ? (
                        <>
                          <div className="mt-3 space-y-1">
                            <div className="text-[11px] font-medium text-text-tertiary">
                              Quick Tags
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5">
                              {block.smart_tags.map((tag, tagIndex) => (
                                <span
                                  key={`${tag}-${tagIndex}`}
                                  className="inline-flex items-center gap-1 rounded-full border border-border-default bg-bg-secondary px-2 py-1 text-[11px] text-text-secondary"
                                >
                                  {tagEditor?.index === tagIndex ? (
                                    <input
                                      value={tagEditor.value}
                                      onChange={event =>
                                        updateTagEditorValue(
                                          block.block_id,
                                          event.currentTarget.value,
                                        )
                                      }
                                      onBlur={() => commitTagEditor(index, block.block_id)}
                                      onKeyDown={event => {
                                        if (event.key === 'Enter') {
                                          event.preventDefault();
                                          event.currentTarget.blur();
                                          return;
                                        }
                                        if (event.key !== 'Escape') return;
                                        event.preventDefault();
                                        closeTagEditor(block.block_id);
                                      }}
                                      className="h-5 min-w-[64px] bg-transparent text-[11px] text-text-primary outline-none"
                                      autoFocus
                                    />
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        openTagEditor(block.block_id, tagIndex, tag)
                                      }
                                      className="text-left transition hover:text-text-primary"
                                      aria-label={`edit tag ${tag}`}
                                    >
                                      {tag}
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() =>
                                      updateBlock(index, current => ({
                                        ...current,
                                        smart_tags: current.smart_tags.filter(
                                          (_, i) => i !== tagIndex,
                                        ),
                                      }))
                                    }
                                    aria-label={`remove tag ${tag}`}
                                    className="text-text-tertiary transition hover:text-accent-secondary"
                                  >
                                    <FiX className="h-3 w-3" />
                                  </button>
                                </span>
                              ))}
                              {tagEditor?.index === -1 ? (
                                <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-accent-primary bg-accent-primary-bg px-2 py-1 text-[11px] text-accent-primary">
                                  <input
                                    value={tagEditor.value}
                                    onChange={event =>
                                      updateTagEditorValue(
                                        block.block_id,
                                        event.currentTarget.value,
                                      )
                                    }
                                    onBlur={() => commitTagEditor(index, block.block_id)}
                                    onKeyDown={event => {
                                      if (event.key === 'Enter') {
                                        event.preventDefault();
                                        event.currentTarget.blur();
                                        return;
                                      }
                                      if (event.key !== 'Escape') return;
                                      event.preventDefault();
                                      closeTagEditor(block.block_id);
                                    }}
                                    className="h-5 min-w-[80px] bg-transparent text-[11px] text-text-primary outline-none"
                                    placeholder="#tag"
                                    autoFocus
                                  />
                                  <button
                                    type="button"
                                    onClick={() => closeTagEditor(block.block_id)}
                                    data-tooltip="Cancel new tag"
                                    aria-label="cancel new tag"
                                    className={withTooltip(
                                      'text-current/80 transition hover:text-current',
                                    )}
                                  >
                                    <FiX className="h-3 w-3" />
                                  </button>
                                </span>
                              ) : null}
                              <button
                                type="button"
                                onClick={() => openTagEditor(block.block_id, -1, '')}
                                disabled={Boolean(tagEditor)}
                                data-tooltip="Add tag"
                                aria-label="add tag"
                                className={withTooltip(
                                  'inline-flex h-6 w-6 items-center justify-center rounded-full border border-dashed border-border-default bg-bg-elevated text-text-tertiary transition hover:border-accent-primary hover:text-accent-primary disabled:cursor-not-allowed disabled:opacity-50',
                                )}
                              >
                                <FiPlus className="h-3 w-3" />
                              </button>
                            </div>
                          </div>

                          <div className="mt-3">
                            <button
                              type="button"
                              onClick={() => toggleAdvanced(block.block_id)}
                              className="inline-flex items-center gap-1 text-[12px] font-medium text-text-secondary transition hover:text-text-primary"
                            >
                              {advancedOpen ? (
                                <LuChevronUp className="h-4 w-4" />
                              ) : (
                                <LuChevronDown className="h-4 w-4" />
                              )}
                              Advanced details
                            </button>

                            {advancedOpen ? (
                              <div className="mt-2 rounded-[10px] border border-border-light bg-bg-secondary p-3">
                                <div className="mb-2 flex items-center gap-2 text-[11px] text-text-tertiary">
                                  <FiMapPin className="h-3.5 w-3.5 text-sky-600" />
                                  Location (Optional)
                                </div>
                                <div className="grid gap-2 md:grid-cols-2">
                                  <input
                                    value={block.latInput}
                                    onChange={event =>
                                      updateBlock(index, current => ({
                                        ...current,
                                        latInput: event.currentTarget.value,
                                      }))
                                    }
                                    className="h-9 rounded-[9px] border border-border-default bg-bg-elevated px-3 text-[12px] text-text-primary outline-none transition focus:border-accent-primary"
                                    placeholder="Latitude"
                                  />
                                  <input
                                    value={block.lngInput}
                                    onChange={event =>
                                      updateBlock(index, current => ({
                                        ...current,
                                        lngInput: event.currentTarget.value,
                                      }))
                                    }
                                    className="h-9 rounded-[9px] border border-border-default bg-bg-elevated px-3 text-[12px] text-text-primary outline-none transition focus:border-accent-primary"
                                    placeholder="Longitude"
                                  />
                                </div>
                              </div>
                            ) : null}
                          </div>
                        </>
                      ) : null}
                    </div>
                  </article>

                  {hasNextBlock ? (
                    <div className="group relative z-10 -my-0.5 flex h-5 items-center justify-center">
                      <span className="h-1 w-full rounded-full bg-[rgba(203,213,225,0.85)] opacity-0 transition-opacity duration-150 group-hover:opacity-100" />
                      <button
                        type="button"
                        onClick={() => insertBlockAt(index + 1)}
                        data-tooltip={`Add block between ${index + 1} and ${index + 2}`}
                        aria-label={`add block between block ${index + 1} and ${index + 2}`}
                        className={withTooltip(
                          'absolute left-1/2 -translate-x-1/2 inline-flex h-8 w-8 items-center justify-center rounded-full border border-border-default bg-bg-elevated text-text-tertiary opacity-0 shadow-[0_6px_18px_rgba(45,42,38,0.16)] transition-all duration-150 hover:border-accent-primary hover:text-accent-primary group-hover:opacity-100 focus-visible:opacity-100',
                        )}
                      >
                        <FiPlus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : null}
                </Fragment>
              );
            })}
            <div className="group relative z-10 -my-0.5 flex h-5 items-center justify-center">
              <span className="h-1 w-full rounded-full bg-[rgba(203,213,225,0.85)] opacity-0 transition-opacity duration-150 group-hover:opacity-100" />
              <button
                type="button"
                onClick={() => insertBlockAt(session.blocks.length)}
                data-tooltip="Add block after last block"
                aria-label="add block after last block"
                className={withTooltip(
                  'absolute left-1/2 -translate-x-1/2 inline-flex h-8 w-8 items-center justify-center rounded-full border border-border-default bg-bg-elevated text-text-tertiary opacity-0 shadow-[0_6px_18px_rgba(45,42,38,0.16)] transition-all duration-150 hover:border-accent-primary hover:text-accent-primary group-hover:opacity-100 focus-visible:opacity-100',
                )}
              >
                <FiPlus className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {typeof document !== 'undefined' && toolbarPosition && toolbarBlockIndex >= 0
        ? createPortal(
            <div
              ref={toolbarContainerRef}
              className="fixed z-[90] flex items-center gap-0.5 rounded-[10px] border border-border-light bg-bg-elevated p-0.5 shadow-[0_10px_24px_rgba(15,23,42,0.16)]"
              style={{
                top: `${toolbarPosition.top}px`,
                left: `${toolbarPosition.left}px`,
              }}
              role="toolbar"
              aria-label="block actions"
            >
              <button
                type="button"
                onClick={() => {
                  closeToolbar();
                  moveBlock(toolbarBlockIndex, -1);
                }}
                disabled={toolbarBlockIndex === 0}
                data-tooltip="Move block up"
                aria-label="move block up"
                className={withTooltip(
                  'inline-flex h-7 w-7 items-center justify-center rounded-[7px] text-text-secondary transition hover:bg-bg-secondary hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-35',
                )}
              >
                <LuArrowUp className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  closeToolbar();
                  moveBlock(toolbarBlockIndex, 1);
                }}
                disabled={toolbarBlockIndex === session.blocks.length - 1}
                data-tooltip="Move block down"
                aria-label="move block down"
                className={withTooltip(
                  'inline-flex h-7 w-7 items-center justify-center rounded-[7px] text-text-secondary transition hover:bg-bg-secondary hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-35',
                )}
              >
                <LuArrowDown className="h-3.5 w-3.5" />
              </button>
              <span className="mx-0.5 h-4 w-px bg-border-default" aria-hidden />
              <button
                type="button"
                onClick={() => {
                  closeToolbar();
                  deleteBlock(toolbarBlockIndex);
                }}
                data-tooltip="Delete block"
                aria-label="delete block"
                className={withTooltip(
                  'inline-flex h-7 w-7 items-center justify-center rounded-[7px] text-status-error transition hover:bg-status-error/10 hover:text-status-error',
                )}
              >
                <FiTrash2 className="h-3.5 w-3.5" />
              </button>
            </div>,
            document.body,
          )
        : null}

    </div>
  );
}
